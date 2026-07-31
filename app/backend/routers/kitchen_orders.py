# @File: backend/routers/kitchen_orders.py
# @Desc: Kitchen-PIN protected order list and status updates

import logging
import os
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.orders import Orders

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/kitchen",
    tags=["kitchen-orders"],
)


class KitchenOrderStatusUpdate(BaseModel):
    status: str
    estimated_minutes: Optional[int] = None
    cancel_reason: Optional[str] = None


def verify_kitchen_pin(
    x_kitchen_pin: str = Header(default="", alias="X-Kitchen-Pin"),
) -> str:
    expected_pin = os.getenv("KITCHEN_PIN", "1234").strip()

    if not x_kitchen_pin or not secrets.compare_digest(
        x_kitchen_pin.strip(),
        expected_pin,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid Kitchen PIN. Login to Kitchen again.",
        )

    return x_kitchen_pin


def serialize_order(order: Orders) -> dict:
    def iso(value):
        return value.isoformat() if value else None

    return {
        "id": order.id,
        "user_id": order.user_id,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "estimated_time": order.pickup_time or "",
        "order_notes": order.order_notes or "",
        "payment_method": order.payment_method,
        "status": order.status or "new",
        "total_amount": float(order.total_amount or 0),
        "service_fee": float(getattr(order, "service_fee", 0) or 0),
        "small_order_fee": float(
            getattr(order, "small_order_fee", 0) or 0
        ),
        "delivery_charge": float(
            getattr(order, "delivery_charge", 0) or 0
        ),
        "tip_amount": float(getattr(order, "tip_amount", 0) or 0),
        "tip_type": getattr(order, "tip_type", "") or "",
        "items_json": order.items_json or "[]",
        "created_at": iso(getattr(order, "created_at", None)),
        "updated_at": iso(getattr(order, "updated_at", None)),
    }


@router.get("/orders")
async def get_kitchen_orders(
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    _pin: str = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Orders).order_by(desc(Orders.created_at))

    if status and status != "all":
        query = query.where(Orders.status == status)

    result = await db.execute(query.offset(skip).limit(limit))
    orders = result.scalars().all()

    return {"items": [serialize_order(order) for order in orders]}


@router.put("/orders/{order_id}/status")
async def update_kitchen_order_status(
    order_id: int,
    data: KitchenOrderStatusUpdate,
    _pin: str = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Orders).where(Orders.id == order_id)
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    valid_transitions = {
        "new": {"accepted", "preparing", "cancelled"},
        "accepted": {"preparing", "ready", "cancelled"},
        "preparing": {"ready", "cancelled"},
        "ready": {"completed", "cancelled"},
        "completed": set(),
        "cancelled": set(),
    }

    current_status = str(order.status or "new").lower().strip()
    new_status = str(data.status or "").lower().strip()

    if new_status not in valid_transitions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid order status: {new_status}",
        )

    allowed = valid_transitions.get(current_status, set())
    if new_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot change order from {current_status} "
                f"to {new_status}"
            ),
        )

    order.status = new_status

    if data.estimated_minutes is not None:
        minutes = max(1, min(int(data.estimated_minutes), 240))
        order.pickup_time = f"{minutes} min"

    if new_status == "cancelled" and data.cancel_reason:
        current_notes = order.order_notes or ""
        separator = " | " if current_notes else ""
        order.order_notes = (
            f"{current_notes}{separator}"
            f"Cancelled by kitchen: {data.cancel_reason.strip()}"
        )

    try:
        await db.commit()
        await db.refresh(order)
    except Exception:
        await db.rollback()
        logger.exception(
            "Kitchen could not update order %s status",
            order_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Could not update order status",
        )

    return {
        "success": True,
        "status": new_status,
        "estimated_minutes": data.estimated_minutes,
        "order": serialize_order(order),
    }
