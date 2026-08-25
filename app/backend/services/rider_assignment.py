"""Safe nearest-live-rider assignment helpers.

Assignment rules:
1. Only active delivery orders can be assigned.
2. Existing active assignments are never duplicated.
3. Rider must be active, have a fresh heartbeat, valid GPS and fresh GPS.
4. Offline riders and stale/missing GPS riders are never used as fallback.
5. Shop coordinates are required; customer coordinates are never used as pickup fallback.
6. Auto Assign gives a rider only one active delivery at a time.
7. Eligible riders are ranked by distance to shop first, then rider ID.
8. Manual Admin assignment may still give multiple orders to the same rider.
"""

from __future__ import annotations

import logging
import math
import re
from datetime import datetime, timezone
from typing import Iterable, Optional

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.delivery_assignments import Delivery_assignments
from models.orders import Orders
from models.restaurant_settings import Restaurant_settings
from models.riders import Riders
from services.rider_push_service import notify_rider_assignment_safely
from services.customer_push_service import notify_customer_order_update_safely

logger = logging.getLogger(__name__)

ACTIVE_ASSIGNMENT_STATUSES = ("assigned", "accepted", "picked_up", "on_the_way")
ACTIVE_ORDER_STATUSES = (
    "new",
    "pending",
    "placed",
    "order_placed",
    "created",
    "accepted",
    "preparing",
    "ready",
)

# Rider app sends heartbeat every 15 seconds and GPS every 30 seconds.
HEARTBEAT_MAX_AGE_SECONDS = 60
GPS_MAX_AGE_SECONDS = 120


async def cancel_order_assignments(db: AsyncSession, order_id: int) -> int:
    """Close every active rider assignment when an order is cancelled."""
    rows = (
        await db.execute(
            select(Delivery_assignments).where(
                Delivery_assignments.order_id == order_id,
                Delivery_assignments.status.in_(ACTIVE_ASSIGNMENT_STATUSES),
            )
        )
    ).scalars().all()

    for assignment in rows:
        assignment.status = "cancelled"

    return len(rows)


def is_delivery_order(order: Orders) -> bool:
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


def _as_float(value: object) -> Optional[float]:
    try:
        result = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _valid_coordinates(lat: Optional[float], lng: Optional[float]) -> bool:
    return (
        lat is not None
        and lng is not None
        and -90 <= lat <= 90
        and -180 <= lng <= 180
    )


def _order_location(order: Orders) -> tuple[Optional[float], Optional[float], str]:
    lat = _as_float(getattr(order, "customer_lat", None))
    lng = _as_float(getattr(order, "customer_lng", None))
    address = str(getattr(order, "customer_address", "") or "").strip()
    notes = str(getattr(order, "order_notes", "") or "")

    if not _valid_coordinates(lat, lng):
        match = re.search(r"GPS:\s*([-\d.]+)\s*,\s*([-\d.]+)", notes, re.IGNORECASE)
        if match:
            parsed_lat = _as_float(match.group(1))
            parsed_lng = _as_float(match.group(2))
            if _valid_coordinates(parsed_lat, parsed_lng):
                lat, lng = parsed_lat, parsed_lng

    if not address:
        match = re.search(r"Delivery Address:\s*([^|]+)", notes, re.IGNORECASE)
        if match:
            address = match.group(1).strip()

    return lat, lng, address


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1 - a)))


def seconds_old(value: Optional[datetime], now: Optional[datetime] = None) -> float:
    if value is None:
        return float("inf")

    current = now or datetime.now(timezone.utc)
    normalized = value
    if normalized.tzinfo is None:
        normalized = normalized.replace(tzinfo=timezone.utc)

    return max(0.0, (current - normalized).total_seconds())


def rider_live_status(rider: Riders, now: Optional[datetime] = None) -> dict:
    """Return strict online/GPS eligibility used by auto and manual assignment."""
    current = now or datetime.now(timezone.utc)
    rider_lat = _as_float(getattr(rider, "current_lat", None))
    rider_lng = _as_float(getattr(rider, "current_lng", None))

    heartbeat_age = seconds_old(getattr(rider, "last_heartbeat", None), current)
    location_age = seconds_old(getattr(rider, "location_updated_at", None), current)

    is_online = heartbeat_age <= HEARTBEAT_MAX_AGE_SECONDS
    has_gps = _valid_coordinates(rider_lat, rider_lng)
    gps_fresh = has_gps and location_age <= GPS_MAX_AGE_SECONDS
    is_active = bool(getattr(rider, "is_active", False))
    eligible = is_active and is_online and gps_fresh

    reason = "available"
    if not is_active:
        reason = "inactive"
    elif not is_online:
        reason = "offline"
    elif not has_gps:
        reason = "gps_missing"
    elif not gps_fresh:
        reason = "gps_outdated"

    return {
        "is_online": is_online,
        "has_gps": has_gps,
        "gps_fresh": gps_fresh,
        "eligible_for_assignment": eligible,
        "heartbeat_age_seconds": None if math.isinf(heartbeat_age) else int(heartbeat_age),
        "location_age_seconds": None if math.isinf(location_age) else int(location_age),
        "reason": reason,
        "lat": rider_lat,
        "lng": rider_lng,
    }


async def get_auto_assign_enabled(db: AsyncSession) -> bool:
    result = await db.execute(
        select(Restaurant_settings).order_by(desc(Restaurant_settings.id)).limit(1)
    )
    settings = result.scalar_one_or_none()
    return bool(settings and getattr(settings, "auto_assign_rider_enabled", False))


async def set_auto_assign_enabled(db: AsyncSession, enabled: bool) -> bool:
    result = await db.execute(
        select(Restaurant_settings).order_by(desc(Restaurant_settings.id)).limit(1)
    )
    settings = result.scalar_one_or_none()
    if settings is None:
        settings = Restaurant_settings(
            restaurant_name="Fai Fai Juice",
            auto_assign_rider_enabled=bool(enabled),
        )
        db.add(settings)
    else:
        settings.auto_assign_rider_enabled = bool(enabled)
    await db.commit()
    return bool(enabled)


async def latest_active_assignment(
    db: AsyncSession,
    order_id: int,
) -> Optional[Delivery_assignments]:
    result = await db.execute(
        select(Delivery_assignments)
        .where(
            Delivery_assignments.order_id == order_id,
            Delivery_assignments.status.in_(ACTIVE_ASSIGNMENT_STATUSES),
        )
        .order_by(desc(Delivery_assignments.created_at), desc(Delivery_assignments.id))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_restaurant_location(
    db: AsyncSession,
) -> tuple[Optional[float], Optional[float]]:
    result = await db.execute(
        select(Restaurant_settings).order_by(desc(Restaurant_settings.id)).limit(1)
    )
    settings = result.scalar_one_or_none()
    if settings is None:
        return None, None

    lat = _as_float(getattr(settings, "restaurant_lat", None))
    lng = _as_float(getattr(settings, "restaurant_lng", None))
    if not _valid_coordinates(lat, lng):
        return None, None
    return lat, lng


async def select_best_rider(
    db: AsyncSession,
    order: Orders,
    exclude_rider_ids: Optional[Iterable[int]] = None,
) -> tuple[Optional[Riders], Optional[float]]:
    excluded = {int(value) for value in (exclude_rider_ids or [])}

    # Shop GPS is mandatory because riders collect the order from the shop.
    shop_lat, shop_lng = await get_restaurant_location(db)
    if shop_lat is None or shop_lng is None:
        logger.warning("Auto Assign skipped: restaurant GPS is missing")
        return None, None

    rider_result = await db.execute(
        select(Riders).where(Riders.is_active == True)  # noqa: E712
    )
    riders = [rider for rider in rider_result.scalars().all() if rider.id not in excluded]
    if not riders:
        return None, None

    count_result = await db.execute(
        select(
            Delivery_assignments.rider_id,
            func.count(Delivery_assignments.id).label("active_count"),
        )
        .where(Delivery_assignments.status.in_(ACTIVE_ASSIGNMENT_STATUSES))
        .group_by(Delivery_assignments.rider_id)
    )
    active_counts = {int(row[0]): int(row[1]) for row in count_result.all()}

    now = datetime.now(timezone.utc)
    scored: list[tuple[tuple[float, int], Riders, float]] = []

    for rider in riders:
        live = rider_live_status(rider, now)
        if not live["eligible_for_assignment"]:
            continue

        active_count = active_counts.get(rider.id, 0)
        # Auto Assign is intentionally conservative: one active delivery per rider.
        # Admin manual assignment is not restricted by this rule and can group
        # 2/3/4/5 nearby orders onto the same rider when operationally useful.
        if active_count > 0:
            continue

        distance = haversine_km(
            float(live["lat"]),
            float(live["lng"]),
            shop_lat,
            shop_lng,
        )

        # Nearest available rider is first priority.
        score = (distance, rider.id)
        scored.append((score, rider, distance))

    if not scored:
        logger.info("Auto Assign waiting: no online rider with fresh GPS")
        return None, None

    scored.sort(key=lambda item: item[0])
    _, selected, selected_distance = scored[0]
    return selected, selected_distance


async def auto_assign_order(
    db: AsyncSession,
    order: Orders,
    *,
    force: bool = False,
    exclude_rider_ids: Optional[Iterable[int]] = None,
) -> Optional[dict]:
    status = str(order.status or "new").lower().strip()
    if status not in ACTIVE_ORDER_STATUSES or not is_delivery_order(order):
        return None
    if not force and not await get_auto_assign_enabled(db):
        return None

    existing = await latest_active_assignment(db, order.id)
    if existing is not None:
        rider_result = await db.execute(select(Riders).where(Riders.id == existing.rider_id))
        rider = rider_result.scalar_one_or_none()
        return {
            "id": existing.id,
            "order_id": existing.order_id,
            "rider_id": existing.rider_id,
            "rider_name": rider.name if rider else "Rider",
            "rider_phone": rider.phone if rider else "",
            "status": existing.status or "assigned",
            "already_assigned": True,
        }

    rider, pickup_distance = await select_best_rider(db, order, exclude_rider_ids)
    if rider is None:
        # Keep order unassigned / Waiting Rider. Never use an offline fallback.
        return None

    customer_lat, customer_lng, customer_address = _order_location(order)
    assignment = Delivery_assignments(
        order_id=order.id,
        rider_id=rider.id,
        status="assigned",
        customer_lat=customer_lat,
        customer_lng=customer_lng,
        customer_address=customer_address,
        customer_name=order.customer_name or "",
        customer_phone=order.customer_phone or "",
        delivery_charge=float(getattr(order, "delivery_charge", 0) or 0),
        distance_km=round(pickup_distance, 2) if pickup_distance is not None else None,
        zone_name="Auto Assign",
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    await notify_rider_assignment_safely(
        db,
        rider_id=int(assignment.rider_id),
        order_id=int(assignment.order_id),
        customer_name=str(assignment.customer_name or ""),
    )
    await notify_customer_order_update_safely(
        db, order, "rider_assigned", rider_name=str(rider.name or "")
    )

    logger.info(
        "Auto assigned order %s to nearest live rider %s (%s), %.2f km from shop",
        order.id,
        rider.id,
        rider.name,
        pickup_distance or 0,
    )
    return {
        "id": assignment.id,
        "order_id": assignment.order_id,
        "rider_id": assignment.rider_id,
        "rider_name": rider.name,
        "rider_phone": rider.phone,
        "status": assignment.status or "assigned",
        "already_assigned": False,
        "distance_to_shop_km": round(pickup_distance, 2) if pickup_distance is not None else None,
    }


async def auto_assign_unassigned_orders(
    db: AsyncSession,
    *,
    force: bool = False,
    exclude_rider_ids: Optional[Iterable[int]] = None,
    limit: int = 100,
) -> list[dict]:
    if not force and not await get_auto_assign_enabled(db):
        return []

    result = await db.execute(
        select(Orders)
        .where(Orders.status.in_(ACTIVE_ORDER_STATUSES))
        .order_by(Orders.created_at.asc())
        .limit(limit)
    )

    assignments: list[dict] = []
    for order in result.scalars().all():
        if not is_delivery_order(order):
            continue
        try:
            assigned = await auto_assign_order(
                db,
                order,
                force=True,
                exclude_rider_ids=exclude_rider_ids,
            )
            if assigned and not assigned.get("already_assigned"):
                assignments.append(assigned)
        except Exception:
            logger.exception("Failed to auto assign order %s", order.id)
            await db.rollback()

    return assignments
