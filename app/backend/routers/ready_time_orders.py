"""Kitchen/Admin order workflow with an exact ready-time deadline.

The existing database column ``pickup_time`` is reused, so no migration is needed.
Stored format: ``10 min|2026-08-01T14:30:00+00:00``.
"""

from __future__ import annotations

import hmac
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.orders import Orders

router = APIRouter(prefix="/api/v1/order-workflow", tags=["order-workflow"])

ACTIVE_STATUSES = {"new", "accepted", "preparing", "ready"}
TERMINAL_STATUSES = {"completed", "cancelled"}


class OrderStatusUpdate(BaseModel):
    status: str
    estimated_minutes: Optional[int] = Field(default=None, ge=1, le=240)
    cancel_reason: Optional[str] = None


def verify_kitchen_pin(
    x_kitchen_pin: Optional[str] = Header(default=None, alias="X-Kitchen-Pin"),
) -> bool:
    expected = os.getenv("KITCHEN_PIN", "1122").strip()
    supplied = (x_kitchen_pin or "").strip()

    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid kitchen PIN")
    return True


def normalize_status(value: Optional[str]) -> str:
    status = (value or "new").lower().strip()
    if status in {"pending", "placed", "created", "order_placed"}:
        return "new"
    return status


def encode_ready_time(minutes: int) -> str:
    deadline = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    return f"{minutes} min|{deadline.isoformat()}"


def serialize_order(order: Orders) -> dict:
    notes = order.order_notes or ""
    order_type = "delivery" if "delivery" in notes.lower() else "pickup"

    return {
        "id": order.id,
        "user_id": order.user_id,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "estimated_time": order.pickup_time or "",
        "order_notes": notes,
        "payment_method": order.payment_method,
        "status": normalize_status(order.status),
        "total_amount": order.total_amount,
        "service_fee": order.service_fee or 0,
        "small_order_fee": order.small_order_fee or 0,
        "delivery_charge": order.delivery_charge or 0,
        "tip_amount": order.tip_amount or 0,
        "tip_type": order.tip_type or "",
        "items_json": order.items_json,
        "order_type": order_type,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
    }


@router.get("/orders")
async def get_workflow_orders(
    limit: int = Query(default=300, ge=1, le=500),
    status: Optional[str] = None,
    kitchen_access: bool = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    del kitchen_access

    query = select(Orders).order_by(desc(Orders.created_at)).limit(limit)
    if status and status != "all":
        query = query.where(Orders.status == status)

    result = await db.execute(query)
    return {"items": [serialize_order(order) for order in result.scalars().all()]}


@router.put("/orders/{order_id}/status")
async def update_workflow_order_status(
    order_id: int,
    data: OrderStatusUpdate,
    kitchen_access: bool = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    del kitchen_access

    result = await db.execute(select(Orders).where(Orders.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    current_status = normalize_status(order.status)
    new_status = normalize_status(data.status)

    if new_status not in ACTIVE_STATUSES | TERMINAL_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")

    # Keep Admin/Kitchen controls flexible for active orders, while protecting
    # completed/cancelled history from accidental reopening.
    if current_status in TERMINAL_STATUSES and new_status != current_status:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reopen a {current_status} order",
        )

    order.status = new_status

    if new_status == "accepted":
        minutes = data.estimated_minutes or 20
        order.pickup_time = encode_ready_time(minutes)

    if new_status == "cancelled" and data.cancel_reason:
        existing = order.order_notes or ""
        order.order_notes = f"{existing} | Cancelled by shop: {data.cancel_reason}".strip(" |")

    try:
        await db.commit()
        await db.refresh(order)
    except Exception as exc:
        await db.rollback()
        logging.exception("Order workflow update failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "success": True,
        "order": serialize_order(order),
    }
