import asyncio
import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.customer_push import Customer_push_subscriptions
from services.admin_push_service import _send_one_sync, get_or_create_vapid_settings

logger = logging.getLogger(__name__)


async def send_customer_push(
    db: AsyncSession, *, customer_phone: str, title: str, body: str, url: str, tag: str
) -> int:
    subscriptions = (
        await db.execute(
            select(Customer_push_subscriptions).where(
                Customer_push_subscriptions.customer_phone == customer_phone,
                Customer_push_subscriptions.is_active.is_(True),
            )
        )
    ).scalars().all()
    if not subscriptions:
        return 0

    vapid = await get_or_create_vapid_settings(db)
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag})
    jobs = [
        asyncio.to_thread(
            _send_one_sync,
            {"endpoint": item.endpoint, "keys": {"p256dh": item.p256dh, "auth": item.auth}},
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
            logger.warning("Customer push thread failed: %s", result)
            continue
        ok, status_code, message = result
        if ok:
            sent += 1
        elif status_code in {404, 410}:
            item.is_active = False
            changed = True
        else:
            logger.warning("Customer push failed for %s: %s", item.id, message)
    if changed:
        await db.commit()
    return sent
