import asyncio
import base64
import json
import logging
import os
import re
from datetime import timedelta
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.customer_push import Customer_native_push_tokens, Customer_push_subscriptions
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
    return explicit == "delivery" or "order type: delivery" in notes or "delivery address:" in notes or "cash on delivery" in payment or "card on delivery" in payment


def _notification_text(order: Orders, event: str, rider_name: str = "") -> tuple[str, str]:
    order_id = order.id
    event = str(event or "").lower().strip()
    delivery = _is_delivery_order(order)
    if event == "accepted": return "Your order is confirmed", f"Order #{order_id} has been confirmed."
    if event == "preparing": return "Your order is being prepared", f"Kitchen started preparing order #{order_id}."
    if event == "ready":
        return (("Your order is ready", f"Order #{order_id} is ready. We are preparing it for the rider.") if delivery else ("Your order is ready", f"Order #{order_id} is ready for pickup."))
    if event == "rider_assigned":
        rider = rider_name.strip() or "Your rider"; return "Rider assigned", f"{rider} has been assigned to order #{order_id}."
    if event == "rider_accepted":
        rider = rider_name.strip() or "Your rider"; return "Rider accepted your order", f"{rider} accepted delivery of order #{order_id}."
    if event == "picked_up": return "Your rider picked up the order", f"Order #{order_id} has been picked up from Fai Fai Juice."
    if event == "on_the_way": return "Your order is on the way", f"Order #{order_id} is on the way to your selected delivery location."
    if event == "delivered": return "Order delivered", f"Order #{order_id} has been delivered. Enjoy!"
    if event == "cancelled": return "Order cancelled", f"Order #{order_id} has been cancelled."
    if event == "completed": return "Order completed", f"Order #{order_id} is complete."
    return "Fai Fai Juice", f"Order #{order_id} status was updated."


def _service_account_info() -> dict | None:
    raw = str(os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "") or "").strip()
    if not raw:
        encoded = str(os.getenv("FIREBASE_SERVICE_ACCOUNT_B64", "") or "").strip()
        if encoded:
            try: raw = base64.b64decode(encoded).decode("utf-8")
            except Exception:
                logger.exception("FIREBASE_SERVICE_ACCOUNT_B64 could not be decoded"); return None
    if not raw: return None
    try: value = json.loads(raw)
    except Exception:
        logger.exception("Firebase service-account JSON is invalid"); return None
    return value if isinstance(value, dict) else None


@lru_cache(maxsize=1)
def _firebase_app():
    info = _service_account_info()
    if not info: return None
    try:
        import firebase_admin
        from firebase_admin import credentials
        name = "fai-fai-customer-push"
        try: return firebase_admin.get_app(name)
        except ValueError: return firebase_admin.initialize_app(credentials.Certificate(info), name=name)
    except Exception:
        logger.exception("Firebase Admin could not be initialized"); return None


def _send_native_sync(token: str, data: dict[str, str]) -> tuple[bool, int | None, str]:
    app = _firebase_app()
    if app is None: return False, None, "Firebase server credentials are not configured"
    try:
        from firebase_admin import messaging
        message = messaging.Message(token=token, data={k: str(v) for k, v in data.items() if v is not None}, android=messaging.AndroidConfig(priority="high", ttl=timedelta(hours=24)))
        return True, 200, str(messaging.send(message, app=app))
    except Exception as exc:
        name = type(exc).__name__
        if name in {"UnregisteredError", "InvalidArgumentError"}: return False, 410, str(exc)
        return False, None, f"{name}: {exc}"


async def send_customer_order_update_push(db: AsyncSession, order: Orders, event: str, *, rider_name: str = "") -> int:
    phone_key = customer_phone_key(order.customer_phone)
    if not phone_key: return 0
    web_subscriptions = (await db.execute(select(Customer_push_subscriptions).where(Customer_push_subscriptions.customer_phone_key == phone_key, Customer_push_subscriptions.is_active.is_(True)))).scalars().all()
    native_tokens = (await db.execute(select(Customer_native_push_tokens).where(Customer_native_push_tokens.customer_phone_key == phone_key, Customer_native_push_tokens.is_active.is_(True)))).scalars().all()
    if not web_subscriptions and not native_tokens: return 0
    title, body = _notification_text(order, event, rider_name)
    data_payload = {"title": title, "body": body, "url": f"/my-orders?order_id={order.id}", "tag": f"customer-order:{order.id}:{event}", "kind": f"customer_{event}", "order_id": str(order.id)}
    jobs=[]; meta=[]
    if web_subscriptions:
        payload=json.dumps(data_payload,separators=(",",":")); vapid=await get_or_create_vapid_settings(db)
        for item in web_subscriptions:
            jobs.append(asyncio.to_thread(_send_one_sync,{"endpoint":item.endpoint,"keys":{"p256dh":item.p256dh,"auth":item.auth}},payload,vapid.private_key_der_b64,vapid.subject)); meta.append(("web",item))
    for item in native_tokens:
        jobs.append(asyncio.to_thread(_send_native_sync,item.token,data_payload)); meta.append(("native",item))
    results=await asyncio.gather(*jobs,return_exceptions=True); sent=0; changed=False
    for (transport,item),result in zip(meta,results):
        if isinstance(result,Exception): logger.warning("Customer %s push thread failed: %s",transport,result); continue
        ok,status_code,message=result
        if ok: sent+=1; continue
        logger.warning("Customer %s push failed for %s (HTTP %s): %s",transport,getattr(item,"id","?"),status_code,message)
        if status_code in {404,410}: item.is_active=False; changed=True
    if changed: await db.commit()
    return sent


async def notify_customer_order_update_safely(db: AsyncSession, order: Orders, event: str, *, rider_name: str = "") -> int:
    try: return await send_customer_order_update_push(db, order, event, rider_name=rider_name)
    except Exception:
        logger.exception("Could not send customer %s notification for order %s",event,order.id); return 0


async def send_customer_order_ready_push(db: AsyncSession, order: Orders) -> int:
    return await send_customer_order_update_push(db, order, "ready")


async def notify_customer_order_ready_safely(db: AsyncSession, order: Orders) -> int:
    return await notify_customer_order_update_safely(db, order, "ready")
