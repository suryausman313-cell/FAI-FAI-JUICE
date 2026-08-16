"""Shared rider assignment helpers used by Admin, Kitchen and order placement.

The rules are intentionally simple and predictable:
1. Only active delivery orders can be assigned.
2. An existing active assignment is never duplicated.
3. Prefer riders who are online/recently located.
4. Prefer riders with no active delivery, then the least-busy rider.
5. Within the same workload, choose the rider nearest to the restaurant pickup point.
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
from services.customer_push_service import notify_customer_order_update_safely

logger = logging.getLogger(__name__)

ACTIVE_ASSIGNMENT_STATUSES = ("assigned", "accepted", "picked_up", "on_the_way")
ACTIVE_ORDER_STATUSES = ("new", "pending", "placed", "order_placed", "created", "accepted", "preparing", "ready")


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


def _order_location(order: Orders) -> tuple[Optional[float], Optional[float], str]:
    lat = _as_float(getattr(order, "customer_lat", None))
    lng = _as_float(getattr(order, "customer_lng", None))
    address = str(getattr(order, "customer_address", "") or "").strip()
    notes = str(getattr(order, "order_notes", "") or "")

    if lat is None or lng is None:
        match = re.search(r"GPS:\s*([-\d.]+)\s*,\s*([-\d.]+)", notes, re.IGNORECASE)
        if match:
            lat = _as_float(match.group(1))
            lng = _as_float(match.group(2))

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


def _seconds_old(value: Optional[datetime], now: datetime) -> float:
    if value is None:
        return float("inf")
    normalized = value
    if normalized.tzinfo is None:
        normalized = normalized.replace(tzinfo=timezone.utc)
    return max(0.0, (now - normalized).total_seconds())


def _is_online(rider: Riders, now: datetime) -> bool:
    # Heartbeat is sent every 15 seconds; location every 30 seconds.
    return (
        _seconds_old(getattr(rider, "last_heartbeat", None), now) <= 120
        or _seconds_old(getattr(rider, "location_updated_at", None), now) <= 300
    )


async def get_auto_assign_enabled(db: AsyncSession) -> bool:
    result = await db.execute(select(Restaurant_settings).order_by(desc(Restaurant_settings.id)).limit(1))
    settings = result.scalar_one_or_none()
    return bool(settings and getattr(settings, "auto_assign_rider_enabled", False))


async def set_auto_assign_enabled(db: AsyncSession, enabled: bool) -> bool:
    result = await db.execute(select(Restaurant_settings).order_by(desc(Restaurant_settings.id)).limit(1))
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


async def latest_active_assignment(db: AsyncSession, order_id: int) -> Optional[Delivery_assignments]:
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


async def _restaurant_location(db: AsyncSession) -> tuple[Optional[float], Optional[float]]:
    result = await db.execute(select(Restaurant_settings).order_by(desc(Restaurant_settings.id)).limit(1))
    settings = result.scalar_one_or_none()
    if not settings:
        return None, None
    return _as_float(settings.restaurant_lat), _as_float(settings.restaurant_lng)


async def select_best_rider(
    db: AsyncSession,
    order: Orders,
    exclude_rider_ids: Optional[Iterable[int]] = None,
) -> tuple[Optional[Riders], Optional[float]]:
    excluded = {int(value) for value in (exclude_rider_ids or [])}
    rider_result = await db.execute(select(Riders).where(Riders.is_active == True))  # noqa: E712
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

    customer_lat, customer_lng, _ = _order_location(order)
    restaurant_lat, restaurant_lng = await _restaurant_location(db)
    # Riders collect from the shop, so restaurant coordinates are the preferred target.
    target_lat = restaurant_lat if restaurant_lat is not None else customer_lat
    target_lng = restaurant_lng if restaurant_lng is not None else customer_lng

    now = datetime.now(timezone.utc)
    online_riders = [rider for rider in riders if _is_online(rider, now)]
    pool = online_riders or riders

    scored: list[tuple[tuple[int, int, float, int], Riders, Optional[float]]] = []
    for rider in pool:
        rider_lat = _as_float(rider.current_lat)
        rider_lng = _as_float(rider.current_lng)
        distance: Optional[float] = None
        if (
            rider_lat is not None
            and rider_lng is not None
            and target_lat is not None
            and target_lng is not None
        ):
            distance = haversine_km(rider_lat, rider_lng, target_lat, target_lng)

        active_count = active_counts.get(rider.id, 0)
        # Idle riders first; after that least busy; then nearest.
        score = (
            1 if active_count > 0 else 0,
            active_count,
            distance if distance is not None else float("inf"),
            rider.id,
        )
        scored.append((score, rider, distance))

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
    await notify_customer_order_update_safely(
        db,
        order,
        "rider_assigned",
        rider_name=rider.name,
    )

    logger.info("Auto assigned order %s to rider %s (%s)", order.id, rider.id, rider.name)
    return {
        "id": assignment.id,
        "order_id": assignment.order_id,
        "rider_id": assignment.rider_id,
        "rider_name": rider.name,
        "rider_phone": rider.phone,
        "status": assignment.status or "assigned",
        "already_assigned": False,
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
