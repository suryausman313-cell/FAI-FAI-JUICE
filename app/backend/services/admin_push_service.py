
import asyncio
import base64
import json
import logging
from typing import Literal, Optional

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models.admin_push import Admin_push_subscriptions, Admin_vapid_settings

logger = logging.getLogger(__name__)

PushKind = Literal["cash", "ready", "test"]


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


async def get_or_create_vapid_settings(db: AsyncSession) -> Admin_vapid_settings:
    settings = (
        await db.execute(
            select(Admin_vapid_settings).where(Admin_vapid_settings.id == 1)
        )
    ).scalar_one_or_none()

    if settings:
        return settings

    private_key = ec.generate_private_key(ec.SECP256R1())
    private_der = private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_raw = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )

    settings = Admin_vapid_settings(
        id=1,
        public_key=_b64url(public_raw),
        private_key_der_b64=base64.b64encode(private_der).decode("ascii"),
        subject="mailto:admin@vitanapoli.app",
    )
    db.add(settings)

    try:
        await db.commit()
        await db.refresh(settings)
        return settings
    except IntegrityError:
        # Another worker may have created the singleton at the same moment.
        await db.rollback()
        existing = (
            await db.execute(
                select(Admin_vapid_settings).where(Admin_vapid_settings.id == 1)
            )
        ).scalar_one()
        return existing


def _send_one_sync(
    subscription: dict,
    payload: str,
    private_key_der_b64: str,
    subject: str,
) -> tuple[bool, Optional[int], str]:
    try:
        from pywebpush import WebPushException, webpush
    except ImportError as exc:
        return False, None, f"pywebpush is not installed: {exc}"

    try:
        webpush(
            subscription_info=subscription,
            data=payload,
            vapid_private_key=private_key_der_b64,
            vapid_claims={"sub": subject},
            ttl=3600,
            timeout=15,
        )
        return True, 201, "sent"
    except WebPushException as exc:
        response = getattr(exc, "response", None)
        status_code = getattr(response, "status_code", None)
        return False, status_code, str(exc)
    except Exception as exc:  # Defensive: a single bad device must not stop others.
        return False, None, str(exc)


async def send_admin_push(
    db: AsyncSession,
    *,
    kind: PushKind,
    title: str,
    body: str,
    url: str,
    tag: str,
) -> int:
    """Send one notification payload to every eligible active Admin device."""

    query = select(Admin_push_subscriptions).where(
        Admin_push_subscriptions.is_active.is_(True)
    )

    if kind == "cash":
        query = query.where(Admin_push_subscriptions.cash_enabled.is_(True))
    elif kind == "ready":
        query = query.where(Admin_push_subscriptions.ready_enabled.is_(True))

    subscriptions = (await db.execute(query)).scalars().all()
    if not subscriptions:
        return 0

    vapid = await get_or_create_vapid_settings(db)
    payload = json.dumps(
        {
            "title": title,
            "body": body,
            "url": url,
            "tag": tag,
            "kind": kind,
        },
        separators=(",", ":"),
    )

    jobs = []
    for item in subscriptions:
        subscription_info = {
            "endpoint": item.endpoint,
            "keys": {
                "p256dh": item.p256dh,
                "auth": item.auth,
            },
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
            logger.warning("Admin push thread failed: %s", result)
            continue

        ok, status_code, message = result
        if ok:
            sent += 1
            continue

        logger.warning(
            "Admin push failed for subscription %s (HTTP %s): %s",
            item.id,
            status_code,
            message,
        )

        # 404/410 means the browser subscription no longer exists.
        if status_code in {404, 410}:
            item.is_active = False
            changed = True

    if changed:
        await db.commit()

    return sent
