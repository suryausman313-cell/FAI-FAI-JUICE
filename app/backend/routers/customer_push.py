from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.customer_push import Customer_native_push_tokens, Customer_push_subscriptions
from routers.customer_auth import decode_customer_token, get_bearer_token
from services.admin_push_service import get_or_create_vapid_settings
from services.customer_push_service import customer_phone_key

router = APIRouter(prefix="/api/v1/customer-push", tags=["customer-push"])


class SubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=20, max_length=1000)
    auth: str = Field(min_length=8, max_length=1000)


class SubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=20, max_length=5000)
    keys: SubscriptionKeys


class UnsubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=20, max_length=5000)


class NativeTokenRequest(BaseModel):
    token: str = Field(min_length=20, max_length=2048)
    platform: str = Field(default="android", min_length=2, max_length=32)


def customer_identity(authorization: Optional[str]) -> tuple[int, str]:
    payload = decode_customer_token(get_bearer_token(authorization))
    try:
        account_id = int(payload.get("sub", ""))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid customer token")
    phone_key = customer_phone_key(str(payload.get("phone", "")))
    if not phone_key:
        raise HTTPException(status_code=401, detail="Customer phone is missing from login")
    return account_id, phone_key


@router.get("/public-key")
async def public_key(db: AsyncSession = Depends(get_db)):
    settings = await get_or_create_vapid_settings(db)
    return {"public_key": settings.public_key}


@router.post("/subscribe")
async def subscribe(data: SubscribeRequest, request: Request, authorization: Optional[str] = Header(default=None), db: AsyncSession = Depends(get_db)):
    account_id, phone_key = customer_identity(authorization)
    subscription = (await db.execute(select(Customer_push_subscriptions).where(Customer_push_subscriptions.endpoint == data.endpoint))).scalar_one_or_none()
    user_agent = request.headers.get("user-agent", "")[:2000]
    if subscription:
        subscription.customer_account_id = account_id
        subscription.customer_phone_key = phone_key
        subscription.p256dh = data.keys.p256dh
        subscription.auth = data.keys.auth
        subscription.is_active = True
        subscription.user_agent = user_agent
    else:
        subscription = Customer_push_subscriptions(customer_account_id=account_id, customer_phone_key=phone_key, endpoint=data.endpoint, p256dh=data.keys.p256dh, auth=data.keys.auth, is_active=True, user_agent=user_agent)
        db.add(subscription)
    await db.commit()
    return {"success": True}


@router.post("/unsubscribe")
async def unsubscribe(data: UnsubscribeRequest, authorization: Optional[str] = Header(default=None), db: AsyncSession = Depends(get_db)):
    account_id, _phone_key = customer_identity(authorization)
    subscription = (await db.execute(select(Customer_push_subscriptions).where(Customer_push_subscriptions.endpoint == data.endpoint, Customer_push_subscriptions.customer_account_id == account_id))).scalar_one_or_none()
    if subscription:
        subscription.is_active = False
        await db.commit()
    return {"success": True}


@router.post("/native-subscribe")
async def native_subscribe(data: NativeTokenRequest, request: Request, authorization: Optional[str] = Header(default=None), db: AsyncSession = Depends(get_db)):
    account_id, phone_key = customer_identity(authorization)
    token_value = data.token.strip()
    platform = data.platform.strip().lower() or "android"
    item = (await db.execute(select(Customer_native_push_tokens).where(Customer_native_push_tokens.token == token_value))).scalar_one_or_none()
    user_agent = request.headers.get("user-agent", "")[:2000]
    if item:
        item.customer_account_id = account_id
        item.customer_phone_key = phone_key
        item.platform = platform
        item.is_active = True
        item.user_agent = user_agent
    else:
        item = Customer_native_push_tokens(customer_account_id=account_id, customer_phone_key=phone_key, token=token_value, platform=platform, is_active=True, user_agent=user_agent)
        db.add(item)
    await db.commit()
    return {"success": True, "transport": "fcm"}


@router.post("/native-unsubscribe")
async def native_unsubscribe(data: NativeTokenRequest, authorization: Optional[str] = Header(default=None), db: AsyncSession = Depends(get_db)):
    account_id, _phone_key = customer_identity(authorization)
    item = (await db.execute(select(Customer_native_push_tokens).where(Customer_native_push_tokens.token == data.token.strip(), Customer_native_push_tokens.customer_account_id == account_id))).scalar_one_or_none()
    if item:
        item.is_active = False
        await db.commit()
    return {"success": True}
