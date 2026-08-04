from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.customer_push import Customer_push_subscriptions
from routers.customer_auth import decode_customer_token, get_bearer_token, normalize_phone
from services.admin_push_service import get_or_create_vapid_settings

router = APIRouter(prefix="/api/v1/customer-push", tags=["customer-push"])


class SubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=20, max_length=1000)
    auth: str = Field(min_length=8, max_length=1000)


class SubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=20, max_length=5000)
    keys: SubscriptionKeys


@router.get("/public-key")
async def public_key(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    decode_customer_token(get_bearer_token(authorization))
    settings = await get_or_create_vapid_settings(db)
    return {"public_key": settings.public_key}


@router.post("/subscribe")
async def subscribe(
    data: SubscribeRequest,
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    payload = decode_customer_token(get_bearer_token(authorization))
    phone = normalize_phone(str(payload.get("phone") or ""))
    subscription = (
        await db.execute(
            select(Customer_push_subscriptions).where(
                Customer_push_subscriptions.endpoint == data.endpoint
            )
        )
    ).scalar_one_or_none()
    if subscription:
        subscription.customer_phone = phone
        subscription.p256dh = data.keys.p256dh
        subscription.auth = data.keys.auth
        subscription.is_active = True
        subscription.user_agent = request.headers.get("user-agent", "")[:2000]
    else:
        subscription = Customer_push_subscriptions(
            customer_phone=phone,
            endpoint=data.endpoint,
            p256dh=data.keys.p256dh,
            auth=data.keys.auth,
            is_active=True,
            user_agent=request.headers.get("user-agent", "")[:2000],
        )
        db.add(subscription)
    await db.commit()
    return {"success": True}
