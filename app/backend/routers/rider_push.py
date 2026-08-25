from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.rider_push import Rider_push_subscriptions
from services.admin_push_service import get_or_create_vapid_settings
from services.rider_auth import require_rider_id
from services.rider_push_service import send_rider_push

router = APIRouter(prefix="/api/v1/rider-push", tags=["rider-push"])


class SubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=20, max_length=1000)
    auth: str = Field(min_length=8, max_length=1000)


class SubscribeRequest(BaseModel):
    rider_id: int = Field(ge=1)
    endpoint: str = Field(min_length=20, max_length=5000)
    keys: SubscriptionKeys


class UnsubscribeRequest(BaseModel):
    rider_id: int = Field(ge=1)
    endpoint: str = Field(min_length=20, max_length=5000)


@router.get("/public-key")
async def public_key(db: AsyncSession = Depends(get_db)):
    settings = await get_or_create_vapid_settings(db)
    return {"public_key": settings.public_key}


@router.post("/subscribe")
async def subscribe(
    data: SubscribeRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    require_rider_id(authorization, data.rider_id)
    item = (
        await db.execute(
            select(Rider_push_subscriptions).where(
                Rider_push_subscriptions.endpoint == data.endpoint
            )
        )
    ).scalar_one_or_none()
    user_agent = request.headers.get("user-agent", "")[:2000]
    if item:
        item.rider_id = data.rider_id
        item.p256dh = data.keys.p256dh
        item.auth = data.keys.auth
        item.is_active = True
        item.user_agent = user_agent
    else:
        item = Rider_push_subscriptions(
            rider_id=data.rider_id,
            endpoint=data.endpoint,
            p256dh=data.keys.p256dh,
            auth=data.keys.auth,
            is_active=True,
            user_agent=user_agent,
        )
        db.add(item)
    await db.commit()
    return {"success": True}


@router.post("/unsubscribe")
async def unsubscribe(
    data: UnsubscribeRequest,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    require_rider_id(authorization, data.rider_id)
    item = (
        await db.execute(
            select(Rider_push_subscriptions).where(
                Rider_push_subscriptions.endpoint == data.endpoint,
                Rider_push_subscriptions.rider_id == data.rider_id,
            )
        )
    ).scalar_one_or_none()
    if item:
        item.is_active = False
        await db.commit()
    return {"success": True}


@router.post("/test/{rider_id}")
async def test_push(
    rider_id: int,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    require_rider_id(authorization, rider_id)
    sent = await send_rider_push(
        db,
        rider_id=rider_id,
        title="Rider notifications active",
        body="Background rider notifications are working.",
        url="/rider",
        tag=f"rider-test:{rider_id}",
        kind="test",
    )
    if sent <= 0:
        raise HTTPException(status_code=400, detail="No active Rider push subscription found")
    return {"success": True, "sent": sent}
