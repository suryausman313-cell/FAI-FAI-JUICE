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
from models.restaurant_settings import Restaurant_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/kitchen", tags=["kitchen-orders"])


class KitchenOrderStatusUpdate(BaseModel):
    status: str
    estimated_minutes: Optional[int] = None
    cancel_reason: Optional[str] = None


class KitchenRestaurantStatusUpdate(BaseModel):
    status: str


def verify_kitchen_pin(
    x_kitchen_pin: str = Header(default="", alias="X-Kitchen-Pin"),
) -> str:
    expected_pin = os.getenv("KITCHEN_PIN", "").strip()
    if len(expected_pin) < 4:
        raise HTTPException(status_code=503, detail="Set KITCHEN_PIN in Render Environment first")
    supplied = (x_kitchen_pin or "").strip()
    if not supplied or not secrets.compare_digest(supplied, expected_pin):
        raise HTTPException(
            status_code=401,
            detail="Invalid Kitchen PIN. Login to Kitchen again.",
        )
    return supplied


def normalize_status(value: Optional[str]) -> str:
    status = str(value or "new").lower().strip()
    if status in {"pending", "placed", "created", "order_placed"}:
        return "new"
    return status


def is_delivery_order(order: Orders) -> bool:
    notes = str(getattr(order, "order_notes", "") or "").lower()
    payment = str(getattr(order, "payment_method", "") or "").lower()
    explicit = str(getattr(order, "order_type", "") or "").lower().strip()
    return (
        explicit == "delivery"
        or "order type: delivery" in notes
        or "delivery address:" in notes
        or "cash on delivery" in payment
        or "card on delivery" in payment
    )


@router.put("/restaurant-status")
async def update_restaurant_status(
    data: KitchenRestaurantStatusUpdate,
    _pin: str = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    """Allow Kitchen to change only the public open/busy/closed status."""
    new_status = str(data.status or "").lower().strip()
    if new_status not in {"open", "busy", "closed"}:
        raise HTTPException(status_code=400, detail="Invalid shop status")

    result = await db.execute(
        select(Restaurant_settings).order_by(desc(Restaurant_settings.id)).limit(1)
    )
    settings = result.scalar_one_or_none()
    if not settings:
        raise HTTPException(status_code=404, detail="Restaurant settings not found")

    settings.restaurant_status = new_status
    try:
        await db.commit()
        await db.refresh(settings)
    except Exception as exc:
        await db.rollback()
        logger.exception("Kitchen could not update restaurant status")
        raise HTTPException(status_code=500, detail="Shop status could not be saved") from exc

    return {"success": True, "restaurant_status": new_status}


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
        "order_type": "delivery" if is_delivery_order(order) else "pickup",
        "status": normalize_status(order.status),
        "total_amount": float(order.total_amount or 0),
        "service_fee": float(getattr(order, "service_fee", 0) or 0),
        "small_order_fee": float(getattr(order, "small_order_fee", 0) or 0),
        "delivery_charge": float(getattr(order, "delivery_charge", 0) or 0),
        "tax_amount": float(getattr(order, "tax_amount", 0) or 0),
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
        wanted = normalize_status(status)
        if wanted == "new":
            query = query.where(
                Orders.status.in_(["new", "pending", "placed", "created", "order_placed"])
            )
        else:
            query = query.where(Orders.status == wanted)

    result = await db.execute(query.offset(skip).limit(limit))
    return {"items": [serialize_order(order) for order in result.scalars().all()]}


@router.put("/orders/{order_id}/status")
async def update_kitchen_order_status(
    order_id: int,
    data: KitchenOrderStatusUpdate,
    _pin: str = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Orders).where(Orders.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    transitions = {
        "new": {"accepted", "preparing", "cancelled"},
        "accepted": {"preparing", "ready", "cancelled"},
        "preparing": {"ready", "cancelled"},
        "ready": {"completed", "cancelled"},
        "out_for_delivery": {"cancelled"},
        "completed": set(),
        "cancelled": set(),
    }

    current_status = normalize_status(order.status)
    new_status = normalize_status(data.status)
    if new_status not in transitions:
        raise HTTPException(status_code=400, detail=f"Invalid order status: {new_status}")

    if new_status == "completed" and is_delivery_order(order):
        raise HTTPException(
            status_code=400,
            detail=(
                "A delivery order cannot be completed from the Kitchen. "
                "The rider must deliver it to the customer and mark it Delivered."
            ),
        )

    allowed = transitions.get(current_status, set())
    if new_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change order from {current_status} to {new_status}",
        )

    order.status = new_status
    if data.estimated_minutes is not None:
        minutes = max(1, min(int(data.estimated_minutes), 240))
        order.pickup_time = f"{minutes} min"

    if new_status == "cancelled" and data.cancel_reason:
        current_notes = order.order_notes or ""
        separator = " | " if current_notes else ""
        order.order_notes = (
            f"{current_notes}{separator}Cancelled by kitchen: {data.cancel_reason.strip()}"
        )

    try:
        await db.commit()
        await db.refresh(order)
    except Exception as exc:
        await db.rollback()
        logger.exception("Kitchen could not update order %s status", order_id)
        raise HTTPException(status_code=500, detail="Could not update order status") from exc

    return {
        "success": True,
        "status": new_status,
        "estimated_minutes": data.estimated_minutes,
        "order": serialize_order(order),
    }
