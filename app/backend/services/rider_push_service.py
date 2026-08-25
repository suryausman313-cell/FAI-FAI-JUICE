import asyncio
import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.delivery_assignments import Delivery_assignments
from models.rider_push import Rider_push_subscriptions
from services.admin_push_service import _send_one_sync, get_or_create_vapid_settings

logger = logging.getLogger(__name__)
ACTIVE_ASSIGNMENT_STATUSES = ("assigned", "accepted", "picked_up", "on_the_way")


async def send_rider_push(
    db: AsyncSession,
    *,
    rider_id: int,
    title: str,
    body: str,
    url: str = "/rider",
    tag: str = "rider-update",
    kind: str = "rider_update",
) -> int:
    subscriptions = (
        await db.execute(
            select(Rider_push_subscriptions).where(
                Rider_push_subscriptions.rider_id == rider_id,
                Rider_push_subscriptions.is_active.is_(True),
            )
        )
    ).scalars().all()
    if not subscriptions:
        return 0

    vapid = await get_or_create_vapid_settings(db)
    payload = json.dumps(
        {"title": title, "body": body, "url": url, "tag": tag, "kind": kind},
        separators=(",", ":"),
    )

    jobs = [
        asyncio.to_thread(
            _send_one_sync,
            {
                "endpoint": item.endpoint,
                "keys": {"p256dh": item.p256dh, "auth": item.auth},
            },
            payload,
            vapid.private_key_der_b64,
            vapid.subject,
        )
        for item in subscriptions
    ]
    results = await asyncio.gather(*jobs, return_exceptions=True)
    sent = 0
    changed = False
    for item, result in zip(subscriptions, results):
        if isinstance(result, Exception):
            logger.warning("Rider push thread failed: %s", result)
            continue
        ok, status_code, message = result
        if ok:
            sent += 1
            continue
        logger.warning(
            "Rider push failed for subscription %s (HTTP %s): %s",
            item.id,
            status_code,
            message,
        )
        if status_code in {404, 410}:
            item.is_active = False
            changed = True
    if changed:
        await db.commit()
    return sent


async def notify_rider_assignment_safely(
    db: AsyncSession,
    *,
    rider_id: int,
    order_id: int,
    customer_name: str = "",
) -> int:
    try:
        suffix = f" - {customer_name.strip()}" if customer_name.strip() else ""
        return await send_rider_push(
            db,
            rider_id=rider_id,
            title=f"New delivery #{order_id}",
            body=f"Order #{order_id}{suffix}. Open Rider app to accept or reject.",
            url="/rider",
            tag=f"rider-assignment:{order_id}:{rider_id}",
            kind="assignment",
        )
    except Exception:
        logger.exception("Could not notify rider %s about order %s assignment", rider_id, order_id)
        return 0


async def notify_assigned_rider_ready_safely(
    db: AsyncSession,
    *,
    order_id: int,
) -> int:
    try:
        assignment = (
            await db.execute(
                select(Delivery_assignments)
                .where(
                    Delivery_assignments.order_id == order_id,
                    Delivery_assignments.status.in_(ACTIVE_ASSIGNMENT_STATUSES),
                )
                .order_by(Delivery_assignments.created_at.desc(), Delivery_assignments.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if not assignment:
            return 0
        return await send_rider_push(
            db,
            rider_id=int(assignment.rider_id),
            title=f"Order #{order_id} is ready",
            body=f"Kitchen marked order #{order_id} Ready. Please pick it up from the shop.",
            url="/rider",
            tag=f"rider-ready:{order_id}:{assignment.rider_id}",
            kind="ready_for_pickup",
        )
    except Exception:
        logger.exception("Could not notify assigned rider that order %s is ready", order_id)
        return 0
