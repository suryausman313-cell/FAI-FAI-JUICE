# @File: backend/routers/rider.py
# @Desc: Rider panel API routes for delivery management
import logging
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, and_, or_
from typing import Optional
from datetime import datetime, timezone, timedelta

from core.database import get_db
from models.riders import Riders
from models.delivery_assignments import Delivery_assignments
from models.orders import Orders
from models.rider_cash_settlements import Rider_cash_settlements
from services.rider_auth import create_rider_token, require_rider_id
from routers.customer_auth import decode_customer_token, get_bearer_token as get_customer_bearer_token, normalize_phone
from services.rider_assignment import (
    auto_assign_order,
    auto_assign_unassigned_orders,
    get_auto_assign_enabled,
    set_auto_assign_enabled,
    get_restaurant_location,
    haversine_km,
    rider_live_status,
)

router = APIRouter(prefix="/api/v1/rider", tags=["rider"])


def is_delivery_order(order: Orders) -> bool:
    """Detect delivery orders including older rows where type is stored in notes."""
    explicit = str(getattr(order, "order_type", "") or "").lower().strip()
    notes = str(getattr(order, "order_notes", "") or "").lower()
    payment = str(getattr(order, "payment_method", "") or "").lower()
    return (
        explicit == "delivery"
        or "order type: delivery" in notes
        or "delivery address:" in notes
        or "cash on delivery" in payment
        or "card on delivery" in payment
    )


def require_live_rider(rider: Riders) -> dict:
    """Manual assignment is allowed only for an active rider with live heartbeat + fresh GPS."""
    live = rider_live_status(rider)
    if live["eligible_for_assignment"]:
        return live

    reason = live.get("reason")
    if reason == "offline":
        detail = "Rider is offline. Keep Rider app open and signed in."
    elif reason == "gps_missing":
        detail = "Rider GPS is unavailable. Enable precise location permission in Rider app."
    elif reason == "gps_outdated":
        detail = "Rider GPS is outdated. Keep Rider app open for a fresh location update."
    else:
        detail = "Rider is inactive or unavailable."
    raise HTTPException(status_code=400, detail=detail)


class RiderLoginRequest(BaseModel):
    phone: str
    pin: str


class DeliveryStatusUpdate(BaseModel):
    status: str  # accepted, rejected, picked_up, on_the_way, delivered
    reason: Optional[str] = None


class AssignDeliveryRequest(BaseModel):
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


class CreateRiderRequest(BaseModel):
    name: str
    phone: str
    pin: str
    delivery_charge: Optional[float] = 0
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None


class AutoAssignSettingsUpdate(BaseModel):
    enabled: bool


@router.post("/login")
async def rider_login(
    data: RiderLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Rider login with phone + PIN - no auth required"""
    try:
        result = await db.execute(
            select(Riders).where(
                Riders.phone == data.phone,
                Riders.pin == data.pin,
                Riders.is_active == True,
            )
        )
        rider = result.scalar_one_or_none()

        if not rider:
            raise HTTPException(status_code=401, detail="Invalid phone or PIN")

        # Mark rider as online immediately on login
        rider.last_heartbeat = datetime.now(timezone.utc)
        await db.commit()

        return {
            "success": True,
            "rider": {
                "id": rider.id,
                "name": rider.name,
                "phone": rider.phone,
            },
            "access_token": create_rider_token(rider.id, rider.phone, rider.name),
            "token_type": "bearer",
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Rider login failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/heartbeat/{rider_id}")
async def rider_heartbeat(
    rider_id: int,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    """Rider sends heartbeat every 15s to indicate they are online"""
    require_rider_id(authorization, rider_id)
    try:
        result = await db.execute(select(Riders).where(Riders.id == rider_id))
        rider = result.scalar_one_or_none()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        rider.last_heartbeat = datetime.now(timezone.utc)
        await db.commit()
        # When Auto Assign is ON, a rider coming online can immediately receive
        # the oldest waiting delivery order. Heartbeat must still succeed even
        # if assignment is temporarily unavailable.
        try:
            await auto_assign_unassigned_orders(db, limit=25)
        except Exception:
            logging.exception("Auto assignment after rider heartbeat failed")
            await db.rollback()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to update rider heartbeat: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/deliveries/{rider_id}")
async def get_rider_deliveries(
    rider_id: int,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    """Get only this logged-in rider's assigned deliveries."""
    require_rider_id(authorization, rider_id)
    try:
        result = await db.execute(
            select(Delivery_assignments)
            .where(Delivery_assignments.rider_id == rider_id)
            .order_by(desc(Delivery_assignments.created_at))
            .limit(50)
        )
        assignments = result.scalars().all()

        items = []
        for a in assignments:
            # Get order details
            order_result = await db.execute(
                select(Orders).where(Orders.id == a.order_id)
            )
            order = order_result.scalar_one_or_none()

            # If Customer/Admin/Kitchen cancelled the order, it must disappear
            # from the rider account even if an older assignment row is still active.
            if order and str(order.status or '').lower().strip() in {"cancelled", "deleted", "expired"}:
                continue

            items.append({
                "id": a.id,
                "order_id": a.order_id,
                "status": a.status,
                "customer_lat": a.customer_lat,
                "customer_lng": a.customer_lng,
                "customer_address": a.customer_address,
                "customer_name": a.customer_name,
                "customer_phone": a.customer_phone,
                "order_total": order.total_amount if order else 0,
                "order_items": order.items_json if order else "[]",
                "order_status": order.status if order else "unknown",
                "delivery_charge": a.delivery_charge or 0,
                "distance_km": a.distance_km,
                "zone_name": a.zone_name,
                "tip_amount": (order.tip_amount or 0) if order and hasattr(order, 'tip_amount') and order.tip_type == 'rider' else 0,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "updated_at": a.updated_at.isoformat() if a.updated_at else None,
                "delivered_at": order.delivered_at.isoformat() if order and getattr(order, 'delivered_at', None) else None,
            })

        return {"items": items}
    except Exception as e:
        logging.error(f"Failed to get rider deliveries: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/deliveries/{assignment_id}/status")
async def update_delivery_status(
    assignment_id: int,
    data: DeliveryStatusUpdate,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    """
    Update rider delivery progress.

    Order flow:
    - assigned: rider must Accept or Reject
    - accepted: order remains Ready in Kitchen
    - rejected: order stays Ready and can be assigned again
    - picked_up / on_the_way: order becomes out_for_delivery and appears in Kitchen Today as Delivery Pending
    - delivered: order becomes completed automatically
    """
    logged_rider_id = require_rider_id(authorization)
    new_status = str(data.status or "").lower().strip()
    valid_statuses = [
        "assigned",
        "accepted",
        "rejected",
        "picked_up",
        "on_the_way",
        "delivered",
    ]

    if new_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {valid_statuses}",
        )

    try:
        result = await db.execute(
            select(Delivery_assignments).where(
                Delivery_assignments.id == assignment_id
            )
        )
        assignment = result.scalar_one_or_none()

        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        if int(assignment.rider_id) != int(logged_rider_id):
            raise HTTPException(status_code=403, detail="This delivery belongs to another rider")

        current_assignment_status = str(
            assignment.status or "assigned"
        ).lower().strip()

        transitions = {
            "assigned": {"accepted", "rejected"},
            "accepted": {"picked_up"},
            "picked_up": {"on_the_way", "delivered"},
            "on_the_way": {"delivered"},
            "rejected": set(),
            "delivered": set(),
        }

        if new_status == current_assignment_status:
            return {
                "success": True,
                "status": current_assignment_status,
                "order_status": None,
                "order_id": assignment.order_id,
            }

        if new_status not in transitions.get(current_assignment_status, set()):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot change delivery from {current_assignment_status} "
                    f"to {new_status}."
                ),
            )

        order_result = await db.execute(
            select(Orders).where(Orders.id == assignment.order_id)
        )
        order = order_result.scalar_one_or_none()

        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        current_order_status = str(order.status or "new").lower().strip()
        if current_order_status == "cancelled":
            raise HTTPException(
                status_code=400,
                detail="Cancelled order deliver nahi ho sakta.",
            )

        if not is_delivery_order(order):
            raise HTTPException(
                status_code=400,
                detail="Pickup order Rider delivery flow me nahi ja sakta.",
            )

        if new_status == "picked_up" and current_order_status != "ready":
            raise HTTPException(
                status_code=400,
                detail="Kitchen ne order abhi Ready nahi kiya.",
            )

        if new_status in {"on_the_way", "delivered"} and current_order_status != "out_for_delivery":
            raise HTTPException(
                status_code=400,
                detail="Order pehle Picked Up hona chahiye.",
            )

        if new_status == "rejected":
            reason = ' '.join(str(data.reason or '').split()).strip()
            if len(reason) < 2:
                raise HTTPException(status_code=400, detail="Please select or enter a rejection reason.")
            if len(reason) > 300:
                raise HTTPException(status_code=400, detail="Rejection reason is too long.")
            rider_row = (await db.execute(select(Riders).where(Riders.id == logged_rider_id))).scalar_one_or_none()
            rider_name = rider_row.name if rider_row else f"Rider {logged_rider_id}"
            existing_notes = order.order_notes or ""
            separator = " | " if existing_notes else ""
            order.order_notes = f"{existing_notes}{separator}Rider {rider_name} rejected: {reason}"

        assignment.status = new_status

        if new_status in ("assigned", "accepted", "rejected"):
            # Accept/Reject only changes the assignment. The kitchen order keeps
            # its current status; a rejected Ready order can be assigned again.
            pass
        elif new_status in ("picked_up", "on_the_way"):
            # Kitchen work is finished, but the sale is not final yet.
            order.status = "out_for_delivery"
        elif new_status == "delivered":
            # Only Rider Delivered finalizes a delivery sale.
            order.status = "completed"
            order.delivered_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(assignment)
        await db.refresh(order)

        auto_reassigned = None
        if new_status == "rejected":
            try:
                auto_reassigned = await auto_assign_order(
                    db,
                    order,
                    exclude_rider_ids={assignment.rider_id},
                )
            except Exception:
                logging.exception("Automatic reassign after rejection failed")
                await db.rollback()

        return {
            "success": True,
            "status": assignment.status,
            "order_status": order.status,
            "order_id": order.id,
            "auto_reassigned": auto_reassigned,
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to update delivery status: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# Admin endpoints for rider management; protected by Fai Fai admin middleware.
# (admin uses localStorage PIN-based auth in frontend)
@router.post("/admin/create")
async def create_rider(
    data: CreateRiderRequest,
    db: AsyncSession = Depends(get_db),
):
    """Admin creates a new rider"""
    try:
        rider = Riders(
            name=data.name,
            phone=data.phone,
            pin=data.pin,
            is_active=True,
            delivery_charge=data.delivery_charge or 0,
            shift_start=data.shift_start,
            shift_end=data.shift_end,
        )
        db.add(rider)
        await db.commit()
        await db.refresh(rider)
        return {"success": True, "rider": {"id": rider.id, "name": rider.name, "phone": rider.phone, "delivery_charge": rider.delivery_charge}}
    except Exception as e:
        logging.error(f"Failed to create rider: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/list")
async def list_riders(
    db: AsyncSession = Depends(get_db),
):
    """Admin gets all riders; Kitchen can use its configured PIN for reads."""
    try:
        result = await db.execute(select(Riders).order_by(desc(Riders.created_at)))
        riders = result.scalars().all()
        items = [
            {
                "id": r.id, "name": r.name, "phone": r.phone, "is_active": r.is_active,
                "delivery_charge": r.delivery_charge or 0,
                "shift_start": r.shift_start,
                "shift_end": r.shift_end,
            }
            for r in riders
        ]
        return {"items": items}
    except Exception as e:
        logging.error(f"Failed to list riders: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/assign")
async def assign_delivery(
    data: AssignDeliveryRequest,
    db: AsyncSession = Depends(get_db),
):
    """Admin assigns a delivery order to a rider"""
    try:
        # Idempotent assignment: if an active assignment already exists,
        # return it instead of creating a duplicate or showing a confusing error.
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
            existing_assignment, existing_rider = existing_row
            return {
                "success": True,
                "already_assigned": True,
                "assignment_id": existing_assignment.id,
                "assignment": {
                    "id": existing_assignment.id,
                    "order_id": existing_assignment.order_id,
                    "rider_id": existing_assignment.rider_id,
                    "rider_name": existing_rider.name,
                    "rider_phone": existing_rider.phone,
                    "status": existing_assignment.status or "assigned",
                    "created_at": existing_assignment.created_at.isoformat() if existing_assignment.created_at else None,
                    "updated_at": existing_assignment.updated_at.isoformat() if existing_assignment.updated_at else None,
                },
            }

        order_result = await db.execute(
            select(Orders).where(Orders.id == data.order_id)
        )
        order = order_result.scalar_one_or_none()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if str(order.status or "").lower().strip() in {"completed", "cancelled"}:
            raise HTTPException(status_code=400, detail="Completed/cancelled order cannot be assigned")
        if not is_delivery_order(order):
            raise HTTPException(status_code=400, detail="Only delivery orders can be assigned to a rider")

        rider_result = await db.execute(
            select(Riders).where(
                Riders.id == data.rider_id,
                Riders.is_active == True,
            )
        )
        rider = rider_result.scalar_one_or_none()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found or inactive")

        # Manual Admin assignment may use any ACTIVE rider.
        # Auto Assign remains strict/live-only in services/rider_assignment.py.
        live = rider_live_status(rider)
        shop_lat, shop_lng = await get_restaurant_location(db)
        pickup_distance = None
        if (
            shop_lat is not None
            and shop_lng is not None
            and live.get("lat") is not None
            and live.get("lng") is not None
        ):
            pickup_distance = haversine_km(
                float(live["lat"]),
                float(live["lng"]),
                shop_lat,
                shop_lng,
            )

        customer_lat = data.customer_lat if data.customer_lat is not None else getattr(order, "customer_lat", None)
        customer_lng = data.customer_lng if data.customer_lng is not None else getattr(order, "customer_lng", None)
        customer_address = (data.customer_address or getattr(order, "customer_address", "") or "").strip()

        assignment = Delivery_assignments(
            order_id=data.order_id,
            rider_id=data.rider_id,
            status="assigned",
            customer_lat=customer_lat,
            customer_lng=customer_lng,
            customer_address=customer_address,
            customer_name=data.customer_name or order.customer_name or "",
            customer_phone=data.customer_phone or order.customer_phone or "",
            delivery_charge=data.delivery_charge if data.delivery_charge is not None else float(getattr(order, "delivery_charge", 0) or 0),
            distance_km=(round(pickup_distance, 2) if pickup_distance is not None else data.distance_km),
            zone_name=data.zone_name or getattr(order, "delivery_zone_name", None),
        )
        db.add(assignment)
        await db.commit()
        await db.refresh(assignment)
        return {
            "success": True,
            "already_assigned": False,
            "assignment_id": assignment.id,
            "assignment": {
                "id": assignment.id,
                "order_id": assignment.order_id,
                "rider_id": assignment.rider_id,
                "rider_name": rider.name,
                "rider_phone": rider.phone,
                "status": assignment.status or "assigned",
                "distance_to_shop_km": assignment.distance_km,
                "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
                "updated_at": assignment.updated_at.isoformat() if assignment.updated_at else None,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to assign delivery: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/auto-assign")
async def get_auto_assign_setting(
    db: AsyncSession = Depends(get_db),
):
    """Return the persistent Admin auto-assignment switch."""
    try:
        return {"enabled": await get_auto_assign_enabled(db)}
    except Exception as e:
        logging.error(f"Failed to read auto assign setting: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/admin/auto-assign")
async def update_auto_assign_setting(
    data: AutoAssignSettingsUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Turn automatic nearest-rider assignment ON/OFF from Admin Orders."""
    try:
        enabled = await set_auto_assign_enabled(db, data.enabled)
        assigned = []
        if enabled:
            assigned = await auto_assign_unassigned_orders(db, force=True, limit=100)
        return {
            "success": True,
            "enabled": enabled,
            "assigned_count": len(assigned),
            "assignments": assigned,
        }
    except Exception as e:
        logging.error(f"Failed to update auto assign setting: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


class UpdateLocationRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


@router.post("/location/{rider_id}")
async def update_rider_location(
    rider_id: int,
    data: UpdateLocationRequest,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    """Rider sends their GPS location periodically"""
    require_rider_id(authorization, rider_id)
    try:
        from datetime import datetime, timezone
        result = await db.execute(select(Riders).where(Riders.id == rider_id))
        rider = result.scalar_one_or_none()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        now = datetime.now(timezone.utc)
        rider.current_lat = data.lat
        rider.current_lng = data.lng
        rider.location_updated_at = now
        # A successful authenticated GPS update also proves the Rider app is alive.
        # This prevents Admin from showing an actively tracking rider as offline when
        # a heartbeat request is briefly delayed by the browser/network.
        rider.last_heartbeat = now
        await db.commit()
        try:
            await auto_assign_unassigned_orders(db, limit=25)
        except Exception:
            logging.exception("Auto assignment after rider location update failed")
            await db.rollback()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to update rider location: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/locations")
async def get_rider_locations(
    db: AsyncSession = Depends(get_db),
):
    """Admin gets active riders with live/GPS eligibility and distance to the shop."""
    try:
        result = await db.execute(select(Riders).where(Riders.is_active == True))
        riders = result.scalars().all()

        delivery_counts = {}
        count_result = await db.execute(
            select(
                Delivery_assignments.rider_id,
                func.count(Delivery_assignments.id).label("count"),
            )
            .where(
                Delivery_assignments.status.in_(
                    ["assigned", "accepted", "picked_up", "on_the_way"]
                )
            )
            .group_by(Delivery_assignments.rider_id)
        )
        for row in count_result:
            delivery_counts[int(row[0])] = int(row[1])

        shop_lat, shop_lng = await get_restaurant_location(db)
        now = datetime.now(timezone.utc)
        items = []

        for rider in riders:
            live = rider_live_status(rider, now)
            distance_to_shop = None
            if (
                live["has_gps"]
                and shop_lat is not None
                and shop_lng is not None
            ):
                distance_to_shop = haversine_km(
                    float(live["lat"]),
                    float(live["lng"]),
                    shop_lat,
                    shop_lng,
                )

            items.append({
                "id": rider.id,
                "name": rider.name,
                "phone": rider.phone,
                "is_active": rider.is_active,
                "is_online": live["is_online"],
                "has_gps": live["has_gps"],
                "gps_fresh": live["gps_fresh"],
                "eligible_for_assignment": live["eligible_for_assignment"],
                "availability_reason": live["reason"],
                "current_lat": live["lat"],
                "current_lng": live["lng"],
                "last_heartbeat": (
                    rider.last_heartbeat.isoformat()
                    if getattr(rider, "last_heartbeat", None)
                    else None
                ),
                "location_updated_at": (
                    rider.location_updated_at.isoformat()
                    if rider.location_updated_at
                    else None
                ),
                "heartbeat_age_seconds": live["heartbeat_age_seconds"],
                "location_age_seconds": live["location_age_seconds"],
                "active_deliveries": delivery_counts.get(rider.id, 0),
                "distance_to_shop_km": (
                    round(distance_to_shop, 2)
                    if distance_to_shop is not None
                    else None
                ),
                "shop_lat": shop_lat,
                "shop_lng": shop_lng,
            })

        items.sort(key=lambda item: (
            not item["eligible_for_assignment"],
            item["distance_to_shop_km"] if item["distance_to_shop_km"] is not None else float("inf"),
            item["active_deliveries"],
            item["id"],
        ))
        return {
            "items": items,
            "shop_lat": shop_lat,
            "shop_lng": shop_lng,
            "eligible_count": sum(1 for item in items if item["eligible_for_assignment"]),
        }
    except Exception as e:
        logging.error(f"Failed to get rider locations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/assignments")
async def list_order_assignments(
    db: AsyncSession = Depends(get_db),
):
    """Return the latest rider assignment for each order for Admin/Kitchen UI."""
    try:
        result = await db.execute(
            select(Delivery_assignments, Riders)
            .join(Riders, Riders.id == Delivery_assignments.rider_id)
            .order_by(desc(Delivery_assignments.created_at), desc(Delivery_assignments.id))
            .limit(1000)
        )
        shop_lat, shop_lng = await get_restaurant_location(db)
        now = datetime.now(timezone.utc)
        latest_by_order = {}
        for assignment, rider in result.all():
            if assignment.order_id in latest_by_order:
                continue

            live = rider_live_status(rider, now)
            distance_to_shop = None
            if (
                live.get("gps_fresh")
                and live.get("is_online")
                and live.get("lat") is not None
                and live.get("lng") is not None
                and shop_lat is not None
                and shop_lng is not None
            ):
                distance_to_shop = haversine_km(
                    float(live["lat"]),
                    float(live["lng"]),
                    float(shop_lat),
                    float(shop_lng),
                )

            latest_by_order[assignment.order_id] = {
                "id": assignment.id,
                "order_id": assignment.order_id,
                "rider_id": assignment.rider_id,
                "rider_name": rider.name,
                "rider_phone": rider.phone,
                "status": assignment.status or "assigned",
                "rider_is_online": bool(live.get("is_online")),
                "rider_location_is_fresh": bool(live.get("gps_fresh") and live.get("is_online")),
                "rider_location_age_seconds": live.get("location_age_seconds"),
                "rider_lat": live.get("lat"),
                "rider_lng": live.get("lng"),
                "distance_to_shop_km": (
                    round(distance_to_shop, 2)
                    if distance_to_shop is not None
                    else None
                ),
                "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
                "updated_at": assignment.updated_at.isoformat() if assignment.updated_at else None,
            }
        return {"items": list(latest_by_order.values())}
    except Exception as e:
        logging.error(f"Failed to list assignments: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class UpdateRiderRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    pin: Optional[str] = None
    is_active: Optional[bool] = None
    delivery_charge: Optional[float] = None
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None


@router.put("/admin/{rider_id}")
async def update_rider(
    rider_id: int,
    data: UpdateRiderRequest,
    db: AsyncSession = Depends(get_db),
):
    """Admin updates a rider's info"""
    try:
        result = await db.execute(select(Riders).where(Riders.id == rider_id))
        rider = result.scalar_one_or_none()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        if data.name is not None:
            rider.name = data.name
        if data.phone is not None:
            rider.phone = data.phone
        if data.pin is not None:
            rider.pin = data.pin
        if data.is_active is not None:
            rider.is_active = data.is_active
        if data.delivery_charge is not None:
            rider.delivery_charge = data.delivery_charge
        if data.shift_start is not None:
            rider.shift_start = data.shift_start
        if data.shift_end is not None:
            rider.shift_end = data.shift_end
        await db.commit()
        await db.refresh(rider)
        return {"success": True, "rider": {"id": rider.id, "name": rider.name, "phone": rider.phone, "is_active": rider.is_active, "delivery_charge": rider.delivery_charge, "shift_start": rider.shift_start, "shift_end": rider.shift_end}}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to update rider: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/admin/{rider_id}")
async def delete_rider(
    rider_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Admin deletes a rider permanently"""
    try:
        result = await db.execute(select(Riders).where(Riders.id == rider_id))
        rider = result.scalar_one_or_none()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        await db.delete(rider)
        await db.commit()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to delete rider: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ===================== RIDER DASHBOARD STATS =====================

@router.get("/stats/{rider_id}")
async def get_rider_stats(
    rider_id: int,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    """Get rider's delivery stats: today, week, month, earnings, cash/card breakdown"""
    require_rider_id(authorization, rider_id)
    try:
        now = datetime.now(timezone.utc)
        # "Today" in Admin must follow UAE shop time, not UTC midnight.
        uae_now = now.astimezone(timezone(timedelta(hours=4)))
        today_start = uae_now.replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        ).astimezone(timezone.utc)
        week_start = today_start - timedelta(days=now.weekday())
        month_start = today_start.replace(day=1)

        # Get all delivered assignments for this rider
        all_deliveries = await db.execute(
            select(Delivery_assignments).where(
                Delivery_assignments.rider_id == rider_id,
                Delivery_assignments.status == "delivered",
            )
        )
        all_delivered = all_deliveries.scalars().all()

        # Get pending (non-delivered) assignments
        pending_result = await db.execute(
            select(Delivery_assignments).where(
                Delivery_assignments.rider_id == rider_id,
                Delivery_assignments.status.in_(["assigned", "accepted", "picked_up", "on_the_way"]),
            )
        )
        pending_assignments = pending_result.scalars().all()

        # Collect order IDs for delivered
        delivered_order_ids = [a.order_id for a in all_delivered]

        # Get order details for earnings calculation
        total_earnings = 0.0
        delivery_charges_earned = 0.0
        today_delivery_earnings = 0.0
        week_delivery_earnings = 0.0
        month_delivery_earnings = 0.0
        tips_earned = 0.0
        today_tips = 0.0
        week_tips = 0.0
        month_tips = 0.0
        cash_collected = 0.0
        card_orders = 0
        today_count = 0
        week_count = 0
        month_count = 0

        if delivered_order_ids:
            orders_result = await db.execute(
                select(Orders).where(Orders.id.in_(delivered_order_ids))
            )
            orders_map = {o.id: o for o in orders_result.scalars().all()}

            for assignment in all_delivered:
                order = orders_map.get(assignment.order_id)
                if not order:
                    continue

                order_amount = order.total_amount or 0
                total_earnings += order_amount
                # Delivery charge earned = zone-based charge stored on assignment
                assignment_delivery_charge = assignment.delivery_charge or 0
                delivery_charges_earned += assignment_delivery_charge

                # Tips earned by rider
                order_tip = 0.0
                if hasattr(order, 'tip_amount') and order.tip_amount and order.tip_type == 'rider':
                    order_tip = order.tip_amount or 0
                    tips_earned += order_tip

                if order.payment_method and "cash" in order.payment_method.lower():
                    cash_collected += order_amount
                else:
                    card_orders += 1

                # Time-based counts
                assignment_time = assignment.updated_at or assignment.created_at
                if assignment_time:
                    if hasattr(assignment_time, 'tzinfo') and assignment_time.tzinfo is None:
                        assignment_time = assignment_time.replace(tzinfo=timezone.utc)
                    if assignment_time >= today_start:
                        today_count += 1
                        today_delivery_earnings += assignment_delivery_charge
                        today_tips += order_tip
                    if assignment_time >= week_start:
                        week_count += 1
                        week_delivery_earnings += assignment_delivery_charge
                        week_tips += order_tip
                    if assignment_time >= month_start:
                        month_count += 1
                        month_delivery_earnings += assignment_delivery_charge
                        month_tips += order_tip

        return {
            "today_deliveries": today_count,
            "week_deliveries": week_count,
            "month_deliveries": month_count,
            "total_deliveries": len(all_delivered),
            "total_earnings": round(total_earnings, 2),
            "delivery_charges_earned": round(delivery_charges_earned, 2),
            "today_delivery_earnings": round(today_delivery_earnings, 2),
            "week_delivery_earnings": round(week_delivery_earnings, 2),
            "month_delivery_earnings": round(month_delivery_earnings, 2),
            "tips_earned": round(tips_earned, 2),
            "today_tips": round(today_tips, 2),
            "week_tips": round(week_tips, 2),
            "month_tips": round(month_tips, 2),
            "cash_collected": round(cash_collected, 2),
            "card_orders": card_orders,
            "pending_orders": len(pending_assignments),
            "completed_orders": len(all_delivered),
        }
    except Exception as e:
        logging.error(f"Failed to get rider stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===================== ADMIN RIDER REPORTS =====================

@router.get("/admin/reports")
async def get_admin_rider_reports(
    db: AsyncSession = Depends(get_db),
):
    """Admin gets complete report of all riders with stats"""
    try:
        # Get all riders
        riders_result = await db.execute(select(Riders).order_by(desc(Riders.created_at)))
        riders = riders_result.scalars().all()

        # Get all delivery assignments
        all_assignments_result = await db.execute(
            select(Delivery_assignments)
        )
        all_assignments = all_assignments_result.scalars().all()

        # Get all orders for earnings
        order_ids = list(set(a.order_id for a in all_assignments))
        orders_map = {}
        if order_ids:
            orders_result = await db.execute(
                select(Orders).where(Orders.id.in_(order_ids))
            )
            orders_map = {o.id: o for o in orders_result.scalars().all()}

        settlements_result = await db.execute(select(Rider_cash_settlements))
        all_settlements = settlements_result.scalars().all()

        now = datetime.now(timezone.utc)
        # Rider card's "Today" follows UAE shop day.
        uae_now = now.astimezone(timezone(timedelta(hours=4)))
        today_start = uae_now.replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        ).astimezone(timezone.utc)

        reports = []
        for rider in riders:
            rider_assignments = [a for a in all_assignments if a.rider_id == rider.id]
            delivered = [a for a in rider_assignments if a.status == "delivered"]
            pending = [a for a in rider_assignments if a.status in ("assigned", "accepted", "picked_up", "on_the_way")]

            total_earnings = 0.0
            delivery_charges_earned = 0.0
            cash_collected = 0.0
            card_orders = 0
            today_count = 0
            today_order_value = 0.0

            for a in delivered:
                order = orders_map.get(a.order_id)
                if not order:
                    continue
                amount = order.total_amount or 0
                total_earnings += amount
                delivery_charges_earned += (a.delivery_charge or 0)
                if order.payment_method and "cash" in order.payment_method.lower():
                    cash_collected += amount
                else:
                    card_orders += 1
                # Today count
                a_time = a.updated_at or a.created_at
                if a_time:
                    if hasattr(a_time, 'tzinfo') and a_time.tzinfo is None:
                        a_time = a_time.replace(tzinfo=timezone.utc)
                    if a_time >= today_start:
                        today_count += 1
                        today_order_value += amount

            rider_settlements = [
                item for item in all_settlements if item.rider_id == rider.id
            ]
            approved_cash = sum(
                float(item.amount or 0)
                for item in rider_settlements
                if item.status == "approved"
            )
            awaiting_approval = sum(
                float(item.amount or 0)
                for item in rider_settlements
                if item.status == "pending"
            )
            cash_pending = max(cash_collected - approved_cash, 0.0)

            # Determine online status based on heartbeat (60s threshold) or location update (2 min threshold)
            is_online = False
            if hasattr(rider, 'last_heartbeat') and rider.last_heartbeat:
                hb_time = rider.last_heartbeat
                if hasattr(hb_time, 'tzinfo') and hb_time.tzinfo is None:
                    hb_time = hb_time.replace(tzinfo=timezone.utc)
                is_online = (now - hb_time).total_seconds() < 60  # 60s heartbeat threshold
            if not is_online and rider.location_updated_at:
                loc_time = rider.location_updated_at
                if hasattr(loc_time, 'tzinfo') and loc_time.tzinfo is None:
                    loc_time = loc_time.replace(tzinfo=timezone.utc)
                is_online = (now - loc_time).total_seconds() < 120  # 2 min location threshold

            reports.append({
                "id": rider.id,
                "name": rider.name,
                "phone": rider.phone,
                "is_active": rider.is_active,
                "is_online": is_online,
                "total_orders": len(delivered),
                "today_orders": today_count,
                "today_order_value": round(today_order_value, 2),
                "pending_orders": len(pending),
                "total_earnings": round(total_earnings, 2),
                "delivery_charges_earned": round(delivery_charges_earned, 2),
                "delivery_charge_per_order": round(float(rider.delivery_charge or 0), 2),
                "cash_collected": round(cash_collected, 2),
                "approved_cash": round(approved_cash, 2),
                "awaiting_approval": round(awaiting_approval, 2),
                "cash_pending": round(cash_pending, 2),
                "card_orders": card_orders,
                "current_lat": rider.current_lat,
                "current_lng": rider.current_lng,
                "location_updated_at": rider.location_updated_at.isoformat() if rider.location_updated_at else None,
                "shift_start": rider.shift_start,
                "shift_end": rider.shift_end,
            })

        return {"items": reports}
    except Exception as e:
        logging.error(f"Failed to get admin rider reports: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===================== ADMIN REASSIGN ORDER =====================

class ReassignDeliveryRequest(BaseModel):
    assignment_id: int
    new_rider_id: int


@router.post("/admin/reassign")
async def reassign_delivery(
    data: ReassignDeliveryRequest,
    db: AsyncSession = Depends(get_db),
):
    """Admin reassigns a delivery to a different rider"""
    try:
        result = await db.execute(
            select(Delivery_assignments).where(Delivery_assignments.id == data.assignment_id)
        )
        assignment = result.scalar_one_or_none()
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        if assignment.status == "delivered":
            raise HTTPException(status_code=400, detail="Cannot reassign delivered order")

        # Verify new rider exists and is active
        rider_result = await db.execute(
            select(Riders).where(Riders.id == data.new_rider_id, Riders.is_active == True)
        )
        new_rider = rider_result.scalar_one_or_none()
        if not new_rider:
            raise HTTPException(status_code=404, detail="Rider not found or inactive")

        # Manual re-assignment may use any ACTIVE rider. Auto Assign stays live-only.
        live = rider_live_status(new_rider)
        shop_lat, shop_lng = await get_restaurant_location(db)
        pickup_distance = None
        if (
            shop_lat is not None
            and shop_lng is not None
            and live.get("lat") is not None
            and live.get("lng") is not None
        ):
            pickup_distance = haversine_km(
                float(live["lat"]),
                float(live["lng"]),
                shop_lat,
                shop_lng,
            )

        assignment.rider_id = data.new_rider_id
        assignment.status = "assigned"
        if pickup_distance is not None:
            assignment.distance_km = round(pickup_distance, 2)
        await db.commit()
        return {
            "success": True,
            "new_rider_name": new_rider.name,
            "new_rider_phone": new_rider.phone,
            "distance_to_shop_km": assignment.distance_km,
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to reassign delivery: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ===================== DELIVERY ETA FOR CUSTOMER =====================

@router.get("/delivery-eta/{order_id}")
async def get_delivery_eta(
    order_id: int,
    session_id: Optional[str] = Query(default=None, min_length=8, max_length=120),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    """Customer gets ETA only for an order owned by their logged-in account."""
    try:
        customer_payload = decode_customer_token(get_customer_bearer_token(authorization))
        customer_user_id = f"customer:{customer_payload.get('sub', '')}"
        ownership_filters = [Orders.user_id == customer_user_id]

        # Strict privacy: a device/session id is never enough to expose rider
        # tracking.  Legacy ownership can only be recovered from the exact phone
        # contained in the signed customer JWT.
        account_phone = normalize_phone(str(customer_payload.get("phone") or ""))
        if account_phone:
            phone_digits = ''.join(ch for ch in account_phone if ch.isdigit())
            safe_variants = [phone_digits]
            if phone_digits.startswith('971') and len(phone_digits) >= 11:
                safe_variants.append('0' + phone_digits[3:])
            db_phone_digits = func.replace(
                func.replace(
                    func.replace(
                        func.replace(
                            func.replace(Orders.customer_phone, '+', ''),
                            ' ', '',
                        ),
                        '-', '',
                    ),
                    '(', '',
                ),
                ')', '',
            )
            ownership_filters.append(db_phone_digits.in_(safe_variants))

        order_result = await db.execute(
            select(Orders).where(
                Orders.id == order_id,
                or_(*ownership_filters),
            )
        )
        order = order_result.scalar_one_or_none()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if str(getattr(order, "status", "") or "").lower().strip() == "cancelled":
            import re
            notes = str(getattr(order, "order_notes", "") or "")
            match = re.search(
                r"Cancelled by\s+(customer|admin|kitchen|rider(?:\s+[^:|]+)?)\s*:\s*([^|]+)",
                notes,
                flags=re.IGNORECASE,
            )
            actor = match.group(1).strip() if match else ""
            if actor.lower().startswith("rider "):
                actor = f"Rider {actor[6:].strip()}"
            elif actor:
                actor = actor.title()
            return {
                "status": "cancelled",
                "eta_minutes": None,
                "eta_seconds": None,
                "rider_name": None,
                "rider_phone": None,
                "rider_lat": None,
                "rider_lng": None,
                "cancelled_by": actor,
                "cancellation_reason": match.group(2).strip() if match else "",
            }

        # Find assignment for this owned order
        result = await db.execute(
            select(Delivery_assignments)
            .where(
                Delivery_assignments.order_id == order_id,
                Delivery_assignments.status.notin_(["delivered", "rejected"]),
            )
            .order_by(desc(Delivery_assignments.updated_at), desc(Delivery_assignments.id))
            .limit(1)
        )
        assignment = result.scalar_one_or_none()

        if not assignment:
            # Check if delivered
            delivered_result = await db.execute(
                select(Delivery_assignments).where(
                    Delivery_assignments.order_id == order_id,
                    Delivery_assignments.status == "delivered",
                )
            )
            if delivered_result.scalar_one_or_none():
                return {"status": "delivered", "eta_minutes": 0, "rider_name": None}
            return {"status": "no_rider", "eta_minutes": None, "rider_name": None}

        # Get rider info
        rider_result = await db.execute(
            select(Riders).where(Riders.id == assignment.rider_id)
        )
        rider = rider_result.scalar_one_or_none()

        # Customer live ETA starts only after Rider Picked Up. Before pickup,
        # Kitchen preparation/Ready remains the source of truth for the customer.
        import math

        normalized_status = str(assignment.status or "assigned").lower()
        live = rider_live_status(rider) if rider else {
            "is_online": False,
            "gps_fresh": False,
            "location_age_seconds": None,
            "lat": None,
            "lng": None,
        }

        rider_lat = live.get("lat")
        rider_lng = live.get("lng")
        customer_lat = assignment.customer_lat
        customer_lng = assignment.customer_lng
        customer_distance_km = None
        route_distance_km = None
        eta_seconds = None

        def travel_seconds(distance: Optional[float], *, stop_buffer: int = 45) -> Optional[int]:
            if distance is None:
                return None
            # Straight-line distance is multiplied slightly to approximate local roads.
            road_km = max(0.0, float(distance)) * 1.18
            moving = int((road_km / 32.0) * 3600)
            return max(60, moving + stop_buffer)

        tracking_active = normalized_status in {"picked_up", "on_the_way"}

        # Customer privacy + clearer UX: live rider coordinates and ETA are exposed
        # only after the rider has actually picked up the order from the Kitchen.
        # Before pickup the customer continues to see Kitchen preparation / Ready.
        if (
            tracking_active
            and live.get("gps_fresh")
            and live.get("is_online")
            and rider_lat is not None
            and rider_lng is not None
            and customer_lat is not None
            and customer_lng is not None
        ):
            customer_distance_km = haversine_km(
                float(rider_lat),
                float(rider_lng),
                float(customer_lat),
                float(customer_lng),
            )
            route_distance_km = customer_distance_km
            eta_seconds = travel_seconds(route_distance_km, stop_buffer=30)

        if normalized_status == "delivered":
            eta_seconds = 0

        if not tracking_active and normalized_status != "delivered":
            eta_seconds = None

        eta_minutes = (
            None
            if eta_seconds is None
            else (0 if eta_seconds == 0 else max(1, math.ceil(eta_seconds / 60)))
        )
        calculated_at = datetime.now(timezone.utc).isoformat()

        return {
            "status": assignment.status,
            "eta_minutes": eta_minutes,
            "eta_seconds": eta_seconds,
            "calculated_at": calculated_at,
            "distance_km": round(route_distance_km, 2) if route_distance_km is not None else None,
            "customer_distance_km": round(customer_distance_km, 2) if customer_distance_km is not None else None,
            "distance_to_shop_km": None,
            "gps_available": bool(tracking_active and live.get("gps_fresh") and live.get("is_online")),
            "rider_is_online": bool(live.get("is_online")),
            "rider_location_is_fresh": bool(tracking_active and live.get("gps_fresh") and live.get("is_online")),
            "rider_location_age_seconds": live.get("location_age_seconds"),
            "rider_name": rider.name if rider else None,
            "rider_phone": rider.phone if rider else None,
            "rider_lat": rider_lat if tracking_active and live.get("gps_fresh") and live.get("is_online") else None,
            "rider_lng": rider_lng if tracking_active and live.get("gps_fresh") and live.get("is_online") else None,
            "rider_location_updated_at": (
                rider.location_updated_at.isoformat()
                if rider and rider.location_updated_at
                else None
            ),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logging.exception("Failed to get delivery ETA")
        raise HTTPException(status_code=500, detail="Could not load delivery tracking. Please try again.") from exc
