# Dedicated Admin Order Management API.
# Uses POST JSON with the shared Render KITCHEN_PIN so the browser does not
# depend on a custom request header or an Atoms/MetaGPT session.

import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.delivery_assignments import Delivery_assignments
from models.orders import Orders
from models.riders import Riders

router = APIRouter(prefix="/api/v1/admin-order-control", tags=["admin-order-control"])

ADMIN_ORDER_PIN = os.getenv("KITCHEN_PIN", "1122").strip()


def check_pin(pin: str) -> None:
    if str(pin or "").strip() != ADMIN_ORDER_PIN:
        raise HTTPException(status_code=401, detail="Invalid Admin/Kitchen PIN")


def is_delivery_order(order: Orders) -> bool:
    explicit = str(getattr(order, "order_type", "") or "").lower().strip()
    if explicit == "delivery":
        return True
    notes = str(getattr(order, "order_notes", "") or "").lower()
    payment = str(getattr(order, "payment_method", "") or "").lower()
    return (
        "order type: delivery" in notes
        or "delivery address:" in notes
        or "cash on delivery" in payment
        or "card on delivery" in payment
    )


def normalize_status(value: Optional[str]) -> str:
    status = str(value or "new").lower().strip()
    if status in {"pending", "placed", "order_placed", "created"}:
        return "new"
    return status


def serialize_order(order: Orders, assignment: Optional[dict] = None) -> dict:
    return {
        "id": order.id,
        "user_id": order.user_id,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "estimated_time": order.pickup_time or "",
        "order_notes": order.order_notes or "",
        "branch_id": getattr(order, "branch_id", None),
        "branch_name": getattr(order, "branch_name", "") or "",
        "payment_method": order.payment_method,
        "order_type": (
            str(getattr(order, "order_type", "") or "").lower().strip()
            or ("delivery" if is_delivery_order(order) else "pickup")
        ),
        "status": normalize_status(order.status),
        "total_amount": float(order.total_amount or 0),
        "service_fee": float(order.service_fee or 0),
        "small_order_fee": float(order.small_order_fee or 0),
        "delivery_charge": float(order.delivery_charge or 0),
        "tip_amount": float(order.tip_amount or 0),
        "tip_type": order.tip_type or "",
        "items_json": order.items_json or "[]",
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        "rider_assignment": assignment,
    }


class PinRequest(BaseModel):
    pin: str


class ListOrdersRequest(PinRequest):
    status: Optional[str] = "all"
    search: Optional[str] = ""
    limit: int = 100
    skip: int = 0


class StatusRequest(PinRequest):
    order_id: int
    status: str
    estimated_minutes: Optional[int] = None
    cancel_reason: Optional[str] = ""


class AssignRequest(PinRequest):
    order_id: int
    rider_id: int
    customer_lat: Optional[float] = None
    customer_lng: Optional[float] = None
    customer_address: Optional[str] = ""
    customer_name: Optional[str] = ""
    customer_phone: Optional[str] = ""
    delivery_charge: Optional[float] = 0
    distance_km: Optional[float] = None
    zone_name: Optional[str] = None


@router.post("/list")
async def list_orders(data: ListOrdersRequest, db: AsyncSession = Depends(get_db)):
    check_pin(data.pin)

    query = select(Orders).order_by(desc(Orders.created_at))
    status = normalize_status(data.status)
    if data.status and data.status != "all":
        if status == "new":
            query = query.where(
                Orders.status.in_(["new", "pending", "placed", "order_placed", "created"])
            )
        else:
            query = query.where(Orders.status == status)

    search = str(data.search or "").strip()
    if search:
        query = query.where(
            or_(
                Orders.customer_name.ilike(f"%{search}%"),
                Orders.customer_phone.ilike(f"%{search}%"),
            )
        )

    result = await db.execute(query.offset(max(0, data.skip)).limit(min(max(data.limit, 1), 500)))
    orders = result.scalars().all()

    assignment_rows = await db.execute(
        select(Delivery_assignments, Riders)
        .join(Riders, Riders.id == Delivery_assignments.rider_id)
        .order_by(desc(Delivery_assignments.created_at), desc(Delivery_assignments.id))
        .limit(2000)
    )
    latest_by_order: dict[int, dict] = {}
    for assignment, rider in assignment_rows.all():
        if assignment.order_id in latest_by_order:
            continue
        latest_by_order[assignment.order_id] = {
            "id": assignment.id,
            "order_id": assignment.order_id,
            "rider_id": assignment.rider_id,
            "rider_name": rider.name,
            "rider_phone": rider.phone,
            "status": assignment.status or "assigned",
            "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
            "updated_at": assignment.updated_at.isoformat() if assignment.updated_at else None,
        }

    return {
        "items": [serialize_order(order, latest_by_order.get(order.id)) for order in orders],
        "total": len(orders),
    }


@router.post("/riders")
async def list_riders(data: PinRequest, db: AsyncSession = Depends(get_db)):
    check_pin(data.pin)

    riders_result = await db.execute(
        select(Riders).where(Riders.is_active == True).order_by(Riders.name)  # noqa: E712
    )
    riders = riders_result.scalars().all()

    count_result = await db.execute(
        select(Delivery_assignments.rider_id, func.count(Delivery_assignments.id))
        .where(Delivery_assignments.status.in_(["assigned", "accepted", "picked_up", "on_the_way"]))
        .group_by(Delivery_assignments.rider_id)
    )
    active_counts = {row[0]: row[1] for row in count_result.all()}

    return {
        "items": [
            {
                "id": rider.id,
                "name": rider.name,
                "phone": rider.phone,
                "is_active": bool(rider.is_active),
                "current_lat": rider.current_lat,
                "current_lng": rider.current_lng,
                "location_updated_at": rider.location_updated_at.isoformat()
                if rider.location_updated_at
                else None,
                "active_deliveries": active_counts.get(rider.id, 0),
            }
            for rider in riders
        ]
    }


@router.post("/assign")
async def assign_rider(data: AssignRequest, db: AsyncSession = Depends(get_db)):
    check_pin(data.pin)

    order_result = await db.execute(select(Orders).where(Orders.id == data.order_id))
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if normalize_status(order.status) in {"completed", "cancelled"}:
        raise HTTPException(status_code=400, detail="Completed/cancelled order cannot be assigned")
    if not is_delivery_order(order):
        raise HTTPException(status_code=400, detail="Only delivery orders can be assigned")

    rider_result = await db.execute(
        select(Riders).where(Riders.id == data.rider_id, Riders.is_active == True)  # noqa: E712
    )
    rider = rider_result.scalar_one_or_none()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found or inactive")

    existing_result = await db.execute(
        select(Delivery_assignments, Riders)
        .join(Riders, Riders.id == Delivery_assignments.rider_id)
        .where(
            Delivery_assignments.order_id == data.order_id,
            Delivery_assignments.status.notin_(["delivered", "rejected"]),
        )
        .order_by(desc(Delivery_assignments.created_at), desc(Delivery_assignments.id))
        .limit(1)
    )
    existing_row = existing_result.first()
    if existing_row:
        assignment, existing_rider = existing_row
        return {
            "success": True,
            "already_assigned": True,
            "assignment": {
                "id": assignment.id,
                "order_id": assignment.order_id,
                "rider_id": assignment.rider_id,
                "rider_name": existing_rider.name,
                "rider_phone": existing_rider.phone,
                "status": assignment.status or "assigned",
            },
        }

    assignment = Delivery_assignments(
        order_id=data.order_id,
        rider_id=data.rider_id,
        status="assigned",
        customer_lat=data.customer_lat,
        customer_lng=data.customer_lng,
        customer_address=data.customer_address or "",
        customer_name=data.customer_name or order.customer_name or "",
        customer_phone=data.customer_phone or order.customer_phone or "",
        delivery_charge=float(data.delivery_charge or order.delivery_charge or 0),
        distance_km=data.distance_km,
        zone_name=data.zone_name,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)

    return {
        "success": True,
        "already_assigned": False,
        "assignment": {
            "id": assignment.id,
            "order_id": assignment.order_id,
            "rider_id": assignment.rider_id,
            "rider_name": rider.name,
            "rider_phone": rider.phone,
            "status": assignment.status or "assigned",
        },
    }


@router.post("/status")
async def update_status(data: StatusRequest, db: AsyncSession = Depends(get_db)):
    check_pin(data.pin)

    result = await db.execute(select(Orders).where(Orders.id == data.order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    current = normalize_status(order.status)
    new_status = normalize_status(data.status)
    transitions = {
        "new": {"accepted", "preparing", "cancelled"},
        "accepted": {"preparing", "ready", "cancelled"},
        "preparing": {"ready", "cancelled"},
        "ready": {"completed", "cancelled"},
        "out_for_delivery": {"cancelled"},
        "completed": set(),
        "cancelled": set(),
    }

    if new_status == "completed" and is_delivery_order(order):
        raise HTTPException(status_code=400, detail="Delivery order sirf Rider Delivered se complete hoga")
    if new_status not in transitions.get(current, set()):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change order from {current} to {new_status}",
        )

    order.status = new_status
    if data.estimated_minutes is not None:
        order.pickup_time = f"{data.estimated_minutes} min"
    if new_status == "cancelled" and data.cancel_reason:
        existing = order.order_notes or ""
        order.order_notes = f"{existing}{' | ' if existing else ''}Cancelled by admin: {data.cancel_reason}"

    await db.commit()
    await db.refresh(order)
    return {"success": True, "order": serialize_order(order)}
