import re
# @File: backend/routers/kitchen_orders.py
# @Desc: Kitchen-PIN protected order list and status updates

import logging
import os
import secrets
from typing import Optional
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.orders import Orders
from models.branches import Branches
from services.branch_kitchen_auth import verify_branch_kitchen_pin
from models.restaurant_settings import Restaurant_settings
from services.customer_push_service import notify_customer_order_update_safely
from services.rider_assignment import cancel_order_assignments
from services.order_notes import public_order_notes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/kitchen", tags=["kitchen-orders"])


class KitchenOrderStatusUpdate(BaseModel):
    status: str
    estimated_minutes: Optional[int] = None
    cancel_reason: Optional[str] = None


class KitchenRestaurantStatusUpdate(BaseModel):
    status: str


async def verify_kitchen_pin(
    x_kitchen_pin: str = Header(default="", alias="X-Kitchen-Pin"),
    x_branch_id: Optional[int] = Header(default=None, alias="X-Branch-Id"),
    branch_id: Optional[int] = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> Optional[int]:
    return await verify_branch_kitchen_pin(db, x_kitchen_pin, x_branch_id or branch_id)



def parse_delivery_target_minutes(value: Optional[str]) -> Optional[int]:
    numbers = [int(item) for item in re.findall(r"\d+", str(value or ""))]
    if not numbers:
        return None
    return max(1, min(max(numbers), 240))


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
    kitchen_branch_id: Optional[int] = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    """Allow Kitchen to change only its own branch open/busy/closed status."""
    new_status = str(data.status or "").lower().strip()
    if new_status not in {"open", "busy", "closed"}:
        raise HTTPException(status_code=400, detail="Invalid shop status")

    settings = None
    branch = None
    if kitchen_branch_id is not None:
        branch = (await db.execute(select(Branches).where(Branches.id == int(kitchen_branch_id)))).scalar_one_or_none()

    if branch is not None and not bool(branch.is_default):
        branch.restaurant_status = new_status
    else:
        result = await db.execute(
            select(Restaurant_settings).order_by(desc(Restaurant_settings.id)).limit(1)
        )
        settings = result.scalar_one_or_none()
        if not settings:
            raise HTTPException(status_code=404, detail="Restaurant settings not found")
        settings.restaurant_status = new_status
        if branch is not None:
            branch.restaurant_status = new_status

    try:
        await db.commit()
        if settings is not None:
            await db.refresh(settings)
        if branch is not None:
            await db.refresh(branch)
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
        "order_notes": public_order_notes(order.order_notes),
        "branch_id": getattr(order, "branch_id", None),
        "branch_name": getattr(order, "branch_name", "") or "",
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
        "accepted_at": iso(getattr(order, "accepted_at", None)),
        "promised_ready_at": iso(getattr(order, "promised_ready_at", None)),
        "preparing_at": iso(getattr(order, "preparing_at", None)),
        "ready_at": iso(getattr(order, "ready_at", None)),
        "rider_picked_up_at": iso(getattr(order, "rider_picked_up_at", None)),
        "promised_delivery_at": iso(getattr(order, "promised_delivery_at", None)),
        "delivered_at": iso(getattr(order, "delivered_at", None)),
    }


@router.get("/orders")
async def get_kitchen_orders(
    status: Optional[str] = Query(default=None),
    branch_id: Optional[int] = Query(default=None, ge=1),
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    authorized_branch_id: Optional[int] = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Orders).order_by(desc(Orders.created_at))
    if authorized_branch_id is not None:
        branch_id = authorized_branch_id
    if branch_id is not None:
        query = query.where(Orders.branch_id == branch_id)
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
    authorized_branch_id: Optional[int] = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Orders).where(Orders.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if authorized_branch_id is not None and int(getattr(order, "branch_id", 0) or 0) != int(authorized_branch_id):
        raise HTTPException(status_code=403, detail="This order belongs to another branch")

    transitions = {
        "new": {"accepted", "preparing", "cancelled"},
        "accepted": {"preparing", "cancelled"},
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

    # Allow Kitchen to adjust only the promised ready time while an order is
    # Accepted/Preparing, without forcing an illegal accepted->accepted or
    # preparing->preparing workflow transition. Customer My Orders reads the same
    # pickup_time value, so its countdown stays exactly in sync with Kitchen.
    is_ready_time_only_update = (
        new_status == current_status
        and current_status in {"accepted", "preparing"}
        and data.estimated_minutes is not None
    )

    allowed = transitions.get(current_status, set())
    if not is_ready_time_only_update and new_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change order from {current_status} to {new_status}",
        )

    now = datetime.now(timezone.utc)
    if not is_ready_time_only_update:
        order.status = new_status

    if data.estimated_minutes is not None and (new_status == "accepted" or is_ready_time_only_update):
        minutes = max(5, min(int(data.estimated_minutes), 60))
        promised_ready_at = now + timedelta(minutes=minutes)
        order.promised_ready_at = promised_ready_at
        # One canonical value powers both Kitchen and Customer countdowns.
        order.pickup_time = f"{minutes} min|{promised_ready_at.isoformat()}"

    if new_status == "accepted" and not is_ready_time_only_update:
        if getattr(order, "accepted_at", None) is None:
            order.accepted_at = now

        if is_delivery_order(order) and getattr(order, "promised_delivery_at", None) is None:
            settings_result = await db.execute(
                select(Restaurant_settings).order_by(desc(Restaurant_settings.id)).limit(1)
            )
            settings = settings_result.scalar_one_or_none()
            target_minutes = parse_delivery_target_minutes(
                getattr(settings, "estimated_delivery_time", None) if settings else None
            )
            if target_minutes:
                order.promised_delivery_at = now + timedelta(minutes=target_minutes)

    elif new_status == "preparing" and not is_ready_time_only_update and getattr(order, "preparing_at", None) is None:
        order.preparing_at = now

    elif new_status == "ready" and getattr(order, "ready_at", None) is None:
        order.ready_at = now

    if new_status == "cancelled" and data.cancel_reason:
        current_notes = order.order_notes or ""
        separator = " | " if current_notes else ""
        order.order_notes = (
            f"{current_notes}{separator}Cancelled by kitchen: {data.cancel_reason.strip()}"
        )

    if new_status == "cancelled":
        await cancel_order_assignments(db, order.id)

    try:
        await db.commit()
        await db.refresh(order)
    except Exception as exc:
        await db.rollback()
        logger.exception("Kitchen could not update order %s status", order_id)
        raise HTTPException(status_code=500, detail="Could not update order status") from exc

    if not is_ready_time_only_update:
        await notify_customer_order_update_safely(db, order, new_status)

    return {
        "success": True,
        "status": new_status,
        "estimated_minutes": data.estimated_minutes,
        "order": serialize_order(order),
    }
