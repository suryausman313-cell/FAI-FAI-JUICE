import asyncio
import base64
import json
import logging
import os
import re
import threading
from typing import Any

import firebase_admin
from firebase_admin import credentials, messaging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.customer_push import Customer_native_push_tokens, Customer_push_subscriptions
from models.orders import Orders
from services.admin_push_service import _send_one_sync, get_or_create_vapid_settings

logger = logging.getLogger(__name__)
_firebase_lock = threading.Lock()


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


def _firebase_service_account() -> dict[str, Any]:
    """Read Firebase Admin credentials from Render without committing secrets."""

    raw_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if raw_json:
        try:
            parsed = json.loads(raw_json)
        except json.JSONDecodeError as exc:
            raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON") from exc
        if not isinstance(parsed, dict):
            raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON must contain a JSON object")
        return parsed

    raw_b64 = os.getenv("FIREBASE_SERVICE_ACCOUNT_B64", "").strip()
    if raw_b64:
        try:
            decoded = base64.b64decode(raw_b64).decode("utf-8")
            parsed = json.loads(decoded)
        except Exception as exc:
            raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_B64 is not valid base64 JSON") from exc
        if not isinstance(parsed, dict):
            raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_B64 must decode to a JSON object")
        return parsed

    raise RuntimeError(
        "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON "
        "or FIREBASE_SERVICE_ACCOUNT_B64 on Render."
    )


def _get_firebase_app():
    try:
        return firebase_admin.get_app()
    except ValueError:
        pass

    with _firebase_lock:
        try:
            return firebase_admin.get_app()
        except ValueError:
            account = _firebase_service_account()
            return firebase_admin.initialize_app(credentials.Certificate(account))


def _send_native_one_sync(token: str, data: dict[str, str]) -> tuple[bool, bool, str]:
    """Send one high-priority data FCM.

    Returns: (sent, should_deactivate_token, message)
    Data-only delivery lets the Android service create the notification itself so a
    notification tap can deep-link to the exact My Orders screen.
    """

    try:
        app = _get_firebase_app()
        message_id = messaging.send(
            messaging.Message(
                token=token,
                data=data,
                android=messaging.AndroidConfig(priority="high"),
            ),
            app=app,
        )
        return True, False, str(message_id or "sent")
    except Exception as exc:  # Firebase exposes several provider-specific subclasses.
        class_name = exc.__class__.__name__.lower()
        code = str(getattr(exc, "code", "") or "").lower()
        text = str(exc)
        lower_text = text.lower()
        should_deactivate = (
            "unregistered" in class_name
            or "registration-token-not-registered" in code
            or "registration token is not a valid fcm registration token" in lower_text
            or "requested entity was not found" in lower_text
        )
        return False, should_deactivate, text[:1000]


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

    web_subscriptions = (
        await db.execute(
            select(Customer_push_subscriptions).where(
                Customer_push_subscriptions.customer_phone_key == phone_key,
                Customer_push_subscriptions.is_active.is_(True),
            )
        )
    ).scalars().all()

    native_tokens = (
        await db.execute(
            select(Customer_native_push_tokens).where(
                Customer_native_push_tokens.customer_phone_key == phone_key,
                Customer_native_push_tokens.is_active.is_(True),
            )
        )
    ).scalars().all()

    if not web_subscriptions and not native_tokens:
        return 0

    title, body = _notification_text(order, event, rider_name)
    common_data = {
        "title": title,
        "body": body,
        "url": f"/my-orders?order_id={order.id}",
        "tag": f"customer-order:{order.id}:{event}",
        "kind": f"customer_{event}",
        "order_id": str(order.id),
    }

    sent = 0
    changed = False

    # Existing browser/PWA notifications remain supported.
    if web_subscriptions:
        payload = json.dumps(common_data, separators=(",", ":"))
        try:
            vapid = await get_or_create_vapid_settings(db)
            web_jobs = [
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
                for item in web_subscriptions
            ]
            web_results = await asyncio.gather(*web_jobs, return_exceptions=True)
            for item, result in zip(web_subscriptions, web_results):
                if isinstance(result, Exception):
                    logger.warning("Customer web-push thread failed: %s", result)
                    continue

                ok, status_code, message = result
                if ok:
                    sent += 1
                else:
                    logger.warning(
                        "Customer web push failed for subscription %s (HTTP %s): %s",
                        item.id,
                        status_code,
                        message,
                    )
                    if status_code in {404, 410}:
                        item.is_active = False
                        changed = True
        except Exception:
            # Native FCM should still be attempted if VAPID/web-push has a problem.
            logger.exception("Customer web-push setup/send failed")

    # Native Android notifications work in foreground, background and normal
    # app-closed state (except when Android/user force-stops the app).
    if native_tokens:
        native_jobs = [
            asyncio.to_thread(_send_native_one_sync, item.token, common_data)
            for item in native_tokens
        ]
        native_results = await asyncio.gather(*native_jobs, return_exceptions=True)
        for item, result in zip(native_tokens, native_results):
            if isinstance(result, Exception):
                logger.warning("Customer native-push thread failed: %s", result)
                continue

            ok, deactivate, message = result
            if ok:
                sent += 1
            else:
                logger.warning(
                    "Customer native push failed for token row %s: %s",
                    item.id,
                    message,
                )
                if deactivate:
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
