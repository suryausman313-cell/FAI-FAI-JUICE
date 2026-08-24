
import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import db_manager, get_db
from models.admin_push import Admin_push_events, Admin_push_subscriptions
from models.delivery_assignments import Delivery_assignments
from models.orders import Orders
from models.rider_cash_settlements import Rider_cash_settlements
from models.riders import Riders
from services.admin_push_service import get_or_create_vapid_settings, send_admin_push

logger = logging.getLogger(__name__)

READY_STATUSES = {
    "ready",
    "ready_delivery",
    "ready-delivery",
    "ready_for_delivery",
}


class SubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=20, max_length=1000)
    auth: str = Field(min_length=8, max_length=1000)


class SubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=20, max_length=5000)
    keys: SubscriptionKeys
    cash_enabled: bool = True
    ready_enabled: bool = True


class UnsubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=20, max_length=5000)


class PreferenceRequest(BaseModel):
    endpoint: str = Field(min_length=20, max_length=5000)
    cash_enabled: bool = True
    ready_enabled: bool = True


def _is_delivery_order(order: Orders) -> bool:
    order_type = str(getattr(order, "order_type", "") or "").lower().strip()
    if order_type == "delivery":
        return True

    try:
        if float(getattr(order, "delivery_charge", 0) or 0) > 0:
            return True
    except (TypeError, ValueError):
        pass

    return bool(
        getattr(order, "customer_lat", None) is not None
        and getattr(order, "customer_lng", None) is not None
    )


async def _event_exists(db: AsyncSession, event_key: str) -> bool:
    return (
        await db.execute(
            select(Admin_push_events.id).where(
                Admin_push_events.event_key == event_key
            )
        )
    ).scalar_one_or_none() is not None


async def _mark_event(db: AsyncSession, event_key: str, event_type: str) -> None:
    db.add(Admin_push_events(event_key=event_key, event_type=event_type))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()


async def _check_cash_requests(db: AsyncSession) -> None:
    rows = (
        await db.execute(
            select(Rider_cash_settlements, Riders)
            .join(Riders, Riders.id == Rider_cash_settlements.rider_id)
            .where(Rider_cash_settlements.status == "pending")
            .order_by(Rider_cash_settlements.submitted_at)
            .limit(100)
        )
    ).all()

    for settlement, rider in rows:
        event_key = f"rider_cash:{settlement.id}"
        if await _event_exists(db, event_key):
            continue

        amount = float(settlement.amount or 0)
        sent = await send_admin_push(
            db,
            kind="cash",
            title="Rider cash waiting",
            body=f"{rider.name} submitted AED {amount:.2f}. Approve or reject.",
            url="/admin/finance",
            tag=event_key,
        )
        if sent > 0:
            await _mark_event(db, event_key, "rider_cash")


async def _check_ready_delivery_orders(db: AsyncSession) -> None:
    orders = (
        await db.execute(
            select(Orders)
            .where(func.lower(Orders.status).in_(READY_STATUSES))
            .order_by(Orders.updated_at)
            .limit(100)
        )
    ).scalars().all()

    delivery_orders = [order for order in orders if _is_delivery_order(order)]
    if not delivery_orders:
        return

    order_ids = [order.id for order in delivery_orders]
    assignments = (
        await db.execute(
            select(Delivery_assignments).where(
                Delivery_assignments.order_id.in_(order_ids)
            )
        )
    ).scalars().all()

    assigned_ids = {
        assignment.order_id
        for assignment in assignments
        if str(assignment.status or "").lower()
        not in {"cancelled", "canceled", "rejected"}
    }

    for order in delivery_orders:
        if order.id in assigned_ids:
            continue

        event_key = f"ready_delivery:{order.id}"
        if await _event_exists(db, event_key):
            continue

        sent = await send_admin_push(
            db,
            kind="ready",
            title=f"Order #{order.id} is ready",
            body="Delivery order is ready. Open Admin and assign a rider.",
            url=f"/admin/orders?order_id={order.id}",
            tag=event_key,
        )
        if sent > 0:
            await _mark_event(db, event_key, "ready_delivery")


async def _watch_once() -> None:
    if not db_manager.async_session_maker:
        return

    async with db_manager.async_session_maker() as db:
        try:
            await _check_cash_requests(db)
            await _check_ready_delivery_orders(db)
        except Exception:
            await db.rollback()
            logger.exception("Admin push watcher iteration failed")


async def _watch_loop() -> None:
    # Main database lifespan normally initializes first. This delay also keeps
    # deploy startup light on Render.
    await asyncio.sleep(15)

    while True:
        await _watch_once()
        await asyncio.sleep(10)


@asynccontextmanager
async def push_lifespan(_app):
    task = asyncio.create_task(_watch_loop(), name="admin-push-watcher")
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


router = APIRouter(
    prefix="/api/v1/admin-push",
    tags=["admin-push"],
    lifespan=push_lifespan,
)


@router.get("/public-key")
async def public_key(db: AsyncSession = Depends(get_db)):
    settings = await get_or_create_vapid_settings(db)
    return {"public_key": settings.public_key}


@router.post("/subscribe")
async def subscribe(
    data: SubscribeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    subscription = (
        await db.execute(
            select(Admin_push_subscriptions).where(
                Admin_push_subscriptions.endpoint == data.endpoint
            )
        )
    ).scalar_one_or_none()

    user_agent = request.headers.get("user-agent", "")[:2000]

    if subscription:
        subscription.p256dh = data.keys.p256dh
        subscription.auth = data.keys.auth
        subscription.cash_enabled = data.cash_enabled
        subscription.ready_enabled = data.ready_enabled
        subscription.is_active = True
        subscription.user_agent = user_agent
    else:
        subscription = Admin_push_subscriptions(
            endpoint=data.endpoint,
            p256dh=data.keys.p256dh,
            auth=data.keys.auth,
            cash_enabled=data.cash_enabled,
            ready_enabled=data.ready_enabled,
            is_active=True,
            user_agent=user_agent,
        )
        db.add(subscription)

    await db.commit()
    await db.refresh(subscription)

    return {
        "success": True,
        "subscription_id": subscription.id,
        "cash_enabled": bool(subscription.cash_enabled),
        "ready_enabled": bool(subscription.ready_enabled),
    }


@router.post("/preferences")
async def preferences(
    data: PreferenceRequest,
    db: AsyncSession = Depends(get_db),
):
    subscription = (
        await db.execute(
            select(Admin_push_subscriptions).where(
                Admin_push_subscriptions.endpoint == data.endpoint
            )
        )
    ).scalar_one_or_none()

    if not subscription:
        raise HTTPException(status_code=404, detail="Admin push subscription not found")

    subscription.cash_enabled = data.cash_enabled
    subscription.ready_enabled = data.ready_enabled
    subscription.is_active = True
    await db.commit()

    return {"success": True}


@router.post("/unsubscribe")
async def unsubscribe(
    data: UnsubscribeRequest,
    db: AsyncSession = Depends(get_db),
):
    subscription = (
        await db.execute(
            select(Admin_push_subscriptions).where(
                Admin_push_subscriptions.endpoint == data.endpoint
            )
        )
    ).scalar_one_or_none()

    if subscription:
        subscription.is_active = False
        await db.commit()

    return {"success": True}


@router.post("/test")
async def test_notification(db: AsyncSession = Depends(get_db)):
    sent = await send_admin_push(
        db,
        kind="test",
        title="Fai Fai Admin",
        body="Admin background notifications are working.",
        url="/admin/finance",
        tag="admin-push-test",
    )

    if sent <= 0:
        raise HTTPException(
            status_code=400,
            detail="No active Admin device received the test notification.",
        )

    return {"success": True, "sent": sent}


@router.post("/scan-now")
async def scan_now():
    """Manual fallback/test: immediately scan cash and ready-delivery events."""
    await _watch_once()
    return {"success": True}
