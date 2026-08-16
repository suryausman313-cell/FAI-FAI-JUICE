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


def _notification_text(order: Orders, event: str, rider_name: str = "") -> tuple[str, str]:
    order_id = order.id
    event = str(event or "").lower().strip()
    delivery = _is_delivery_order(order)

    if event == "accepted":
        return "Your order is confirmed", f"Order #{order_id} has been confirmed."
    if event == "preparing":
        return "Your order is being prepared", f"Kitchen started preparing order #{order_id}."
    if event == "ready":
        return (
            ("Your order is ready", f"Order #{order_id} is ready. We are preparing it for the rider.")
            if delivery
            else ("Your order is ready", f"Order #{order_id} is ready for pickup.")
        )
    if event == "rider_assigned":
        rider = rider_name.strip() or "Your rider"
        return "Rider assigned", f"{rider} has been assigned to order #{order_id}."
    if event == "rider_accepted":
        rider = rider_name.strip() or "Your rider"
        return "Rider accepted your order", f"{rider} accepted delivery of order #{order_id}."
    if event == "picked_up":
        return "Your rider picked up the order", f"Order #{order_id} has been picked up from Fai Fai Juice."
    if event == "on_the_way":
        return "Your order is on the way", f"Order #{order_id} is on the way to your selected delivery location."
    if event == "delivered":
        return "Order delivered", f"Order #{order_id} has been delivered. Enjoy!"
    if event == "cancelled":
        return "Order cancelled", f"Order #{order_id} has been cancelled."
    if event == "completed":
        return "Order completed", f"Order #{order_id} is complete."
    return "Fai Fai Juice", f"Order #{order_id} status was updated."


async def send_customer_order_update_push(
    db: AsyncSession,
    order: Orders,
    event: str,
    *,
    rider_name: str = "",
) -> int:
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

    title, body = _notification_text(order, event, rider_name)
    payload = json.dumps(
        {
            "title": title,
            "body": body,
            "url": f"/my-orders?order_id={order.id}",
            "tag": f"customer-order:{order.id}:{event}",
            "kind": f"customer_{event}",
            "order_id": order.id,
        },
        separators=(",", ":"),
    )
    vapid = await get_or_create_vapid_settings(db)

    jobs = []
    for item in subscriptions:
        jobs.append(
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
        else:
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


async def notify_customer_order_update_safely(
    db: AsyncSession,
    order: Orders,
    event: str,
    *,
    rider_name: str = "",
) -> int:
    try:
        return await send_customer_order_update_push(
            db,
            order,
            event,
            rider_name=rider_name,
        )
    except Exception:
        logger.exception(
            "Could not send customer %s notification for order %s",
            event,
            order.id,
        )
        return 0


async def send_customer_order_ready_push(db: AsyncSession, order: Orders) -> int:
    return await send_customer_order_update_push(db, order, "ready")


async def notify_customer_order_ready_safely(db: AsyncSession, order: Orders) -> int:
    return await notify_customer_order_update_safely(db, order, "ready")
