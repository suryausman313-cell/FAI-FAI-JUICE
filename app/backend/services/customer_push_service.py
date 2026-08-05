import asyncio
import json
import logging
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.customer_push import Customer_push_subscriptions
from models.orders import Orders
from services.admin_push_service import _send_one_sync, get_or_create_vapid_settings

logger = logging.getLogger(__name__)


def customer_phone_key(value: str) -> str:
    """Return one stable UAE/international digit key for matching orders."""
    digits = re.sub(r"\D", "", str(value or ""))
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("0") and 9 <= len(digits) <= 10:
        digits = f"971{digits[1:]}"
    elif len(digits) == 9 and not digits.startswith("971"):
        digits = f"971{digits}"
    return digits


def _is_delivery_order(order: Orders) -> bool:
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


async def send_customer_order_ready_push(db: AsyncSession, order: Orders) -> int:
    """Notify every active device registered by the order's customer."""
    phone_key = customer_phone_key(order.customer_phone)
    if not phone_key:
        return 0

    subscriptions = (
        await db.execute(
            select(Customer_push_subscriptions).where(
                Customer_push_subscriptions.customer_phone_key == phone_key,
                Customer_push_subscriptions.is_active.is_(True),
            )
        )
    ).scalars().all()
    if not subscriptions:
        return 0

    delivery = _is_delivery_order(order)
    body = (
        f"Your order #{order.id} is ready. A rider will bring it to you."
        if delivery
        else f"Your order #{order.id} is ready for pickup."
    )
    payload = json.dumps(
        {
            "title": "Your order is ready",
            "body": body,
            "url": f"/my-orders?order_id={order.id}",
            "tag": f"customer-ready:{order.id}",
            "kind": "customer_ready",
            "order_id": order.id,
        },
        separators=(",", ":"),
    )
    vapid = await get_or_create_vapid_settings(db)

    jobs = []
    for item in subscriptions:
        subscription_info = {
            "endpoint": item.endpoint,
            "keys": {"p256dh": item.p256dh, "auth": item.auth},
        }
        jobs.append(
            asyncio.to_thread(
                _send_one_sync,
                subscription_info,
                payload,
                vapid.private_key_der_b64,
                vapid.subject,
            )
        )

    results = await asyncio.gather(*jobs, return_exceptions=True)
    sent = 0
    changed = False
    for item, result in zip(subscriptions, results):
        if isinstance(result, Exception):
            logger.warning("Customer push thread failed: %s", result)
            continue

        ok, status_code, message = result
        if ok:
            sent += 1
            continue

        logger.warning(
            "Customer push failed for subscription %s (HTTP %s): %s",
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


async def notify_customer_order_ready_safely(db: AsyncSession, order: Orders) -> int:
    """Do not let a push-provider problem block the Kitchen status update."""
    try:
        return await send_customer_order_ready_push(db, order)
    except Exception:
        logger.exception("Could not send ready notification for order %s", order.id)
        return 0
