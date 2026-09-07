"""Customer rewards / Surprise Box.

Safe rollout design:
- Existing orders and checkout continue to work without reward_id.
- Rewards are created lazily from completed orders, so no kitchen/rider status code is touched.
- Normal reward: every completed order >= AED 15.
- Golden reward: every group of 3 completed AED 100+ orders within 30 days.
- Normal free item is only a small ice cream (server enforced, max AED 5).
- Promo codes and rewards cannot be combined.
"""
from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.customer_rewards import Customer_rewards
from models.reward_settings import Reward_settings
from models.orders import Orders
from routers.customer_auth import decode_customer_token, get_bearer_token
from routers.fai_fai_admin_control import AdminIdentity, get_current_admin

router = APIRouter(prefix="/api/v1/rewards", tags=["rewards"])

NORMAL_MIN_ORDER = 15.0
GOLD_ORDER_MIN = 100.0
GOLD_REQUIRED_ORDERS = 3
GOLD_WINDOW_DAYS = 30
NORMAL_EXPIRY_DAYS = 7
GOLD_EXPIRY_DAYS = 30



class RewardSettingsUpdate(BaseModel):
    enabled: bool


async def get_rewards_enabled(db: AsyncSession) -> bool:
    row = await db.scalar(select(Reward_settings).order_by(Reward_settings.id.asc()).limit(1))
    if row is None:
        row = Reward_settings(enabled=True)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return bool(row.enabled)


async def set_rewards_enabled(db: AsyncSession, enabled: bool) -> bool:
    row = await db.scalar(select(Reward_settings).order_by(Reward_settings.id.asc()).limit(1))
    if row is None:
        row = Reward_settings(enabled=enabled)
        db.add(row)
    else:
        row.enabled = enabled
    await db.commit()
    return bool(enabled)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def rewards_start_at() -> datetime:
    raw = (os.getenv("REWARDS_START_AT") or "2026-09-07T00:00:00+00:00").strip()
    try:
        value = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        value = datetime(2026, 9, 7, tzinfo=timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def customer_id_from_authorization(authorization: Optional[str]) -> int:
    payload = decode_customer_token(get_bearer_token(authorization))
    try:
        return int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid customer session")


def customer_user_id(customer_id: int) -> str:
    return f"customer:{customer_id}"


def completed_at(order: Orders) -> datetime:
    value = order.delivered_at or order.updated_at or order.created_at or utc_now()
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def choose_normal_reward() -> dict[str, Any]:
    # Weighted 100-point draw. Expensive free reward stays intentionally rare.
    roll = secrets.randbelow(100)
    if roll < 45:
        return {
            "reward_type": "percent",
            "reward_value": 5.0,
            "max_discount": 3.0,
            "minimum_order": 20.0,
            "title": "5% OFF (up to AED 3)",
        }
    if roll < 75:
        return {
            "reward_type": "percent",
            "reward_value": 10.0,
            "max_discount": 5.0,
            "minimum_order": 30.0,
            "title": "10% OFF (up to AED 5)",
        }
    if roll < 90:
        return {
            "reward_type": "fixed",
            "reward_value": 3.0,
            "max_discount": 3.0,
            "minimum_order": 25.0,
            "title": "AED 3 OFF",
        }
    return {
        "reward_type": "free_ice_cream",
        "reward_value": 5.0,
        "max_discount": 5.0,
        "minimum_order": 25.0,
        "title": "FREE Small Ice Cream",
    }


def choose_golden_reward() -> dict[str, Any]:
    roll = secrets.randbelow(100)
    if roll < 50:
        return {
            "reward_type": "percent",
            "reward_value": 15.0,
            "max_discount": 15.0,
            "minimum_order": 40.0,
            "title": "GOLDEN: 15% OFF (up to AED 15)",
        }
    if roll < 80:
        return {
            "reward_type": "fixed",
            "reward_value": 15.0,
            "max_discount": 15.0,
            "minimum_order": 50.0,
            "title": "GOLDEN: AED 15 OFF",
        }
    return {
        "reward_type": "golden_free_item",
        "reward_value": 15.0,
        "max_discount": 15.0,
        "minimum_order": 30.0,
        "title": "GOLDEN: FREE selected item up to AED 15",
    }


async def _insert_reward(
    db: AsyncSession,
    *,
    customer_id: int,
    source_order_id: int,
    reward_tier: str,
    definition: dict[str, Any],
) -> None:
    existing = await db.scalar(
        select(Customer_rewards.id).where(
            Customer_rewards.customer_id == customer_id,
            Customer_rewards.source_order_id == source_order_id,
            Customer_rewards.reward_tier == reward_tier,
        )
    )
    if existing:
        return

    days = GOLD_EXPIRY_DAYS if reward_tier == "golden" else NORMAL_EXPIRY_DAYS
    db.add(
        Customer_rewards(
            customer_id=customer_id,
            source_order_id=source_order_id,
            reward_tier=reward_tier,
            reward_type=str(definition["reward_type"]),
            reward_value=float(definition["reward_value"]),
            max_discount=float(definition["max_discount"]),
            minimum_order=float(definition["minimum_order"]),
            title=str(definition["title"]),
            status="available",
            expires_at=utc_now() + timedelta(days=days),
        )
    )
    try:
        await db.commit()
    except IntegrityError:
        # Two devices may sync the same completed order at once. Unique constraint
        # guarantees only one reward; the second request can safely continue.
        await db.rollback()


async def sync_customer_rewards(db: AsyncSession, customer_id: int) -> None:
    if not await get_rewards_enabled(db):
        return
    now = utc_now()
    uid = customer_user_id(customer_id)

    # Expire old unused rewards.
    rewards = (
        await db.execute(
            select(Customer_rewards).where(Customer_rewards.customer_id == customer_id)
        )
    ).scalars().all()
    changed = False
    for reward in rewards:
        if reward.status == "available" and reward.expires_at and reward.expires_at < now:
            reward.status = "expired"
            changed = True
        if reward.status in {"redeemed", "reserved"} and reward.redeemed_order_id:
            linked_order = await db.get(Orders, int(reward.redeemed_order_id))
            if linked_order is None or str(linked_order.status or "").lower() in {"cancelled", "expired"}:
                reward.status = "available" if (not reward.expires_at or reward.expires_at >= now) else "expired"
                reward.redeemed_order_id = None
                reward.redeemed_at = None
                changed = True
            elif reward.status == "reserved" and str(linked_order.status or "").lower() == "completed":
                reward.status = "redeemed"
                reward.redeemed_at = now
                changed = True
    if changed:
        await db.commit()

    start_at = rewards_start_at()
    completed = (
        await db.execute(
            select(Orders)
            .where(
                Orders.user_id == uid,
                Orders.status == "completed",
                Orders.created_at >= start_at,
            )
            .order_by(Orders.created_at.asc(), Orders.id.asc())
        )
    ).scalars().all()

    # Every completed AED 15+ order gets exactly one normal Surprise Box.
    for order in completed:
        if float(order.subtotal_amount or order.total_amount or 0) + 0.001 < NORMAL_MIN_ORDER:
            continue
        await _insert_reward(
            db,
            customer_id=customer_id,
            source_order_id=int(order.id),
            reward_tier="normal",
            definition=choose_normal_reward(),
        )

    # Every 3 qualifying AED 100+ orders completed inside a rolling 30-day
    # group earn one Golden reward. After a group earns Gold, the streak resets.
    streak: list[Orders] = []
    for order in completed:
        if float(order.subtotal_amount or order.total_amount or 0) + 0.001 < GOLD_ORDER_MIN:
            continue
        order_time = completed_at(order)
        streak = [old for old in streak if order_time - completed_at(old) <= timedelta(days=GOLD_WINDOW_DAYS)]
        streak.append(order)
        if len(streak) >= GOLD_REQUIRED_ORDERS:
            source = streak[-1]
            await _insert_reward(
                db,
                customer_id=customer_id,
                source_order_id=int(source.id),
                reward_tier="golden",
                definition=choose_golden_reward(),
            )
            streak = []


async def get_reward_for_checkout(
    db: AsyncSession,
    *,
    customer_id: int,
    reward_id: int,
) -> Customer_rewards:
    if not await get_rewards_enabled(db):
        raise HTTPException(status_code=400, detail="Rewards are currently turned off")
    await sync_customer_rewards(db, customer_id)
    reward = await db.scalar(
        select(Customer_rewards).where(
            Customer_rewards.id == reward_id,
            Customer_rewards.customer_id == customer_id,
        )
    )
    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")
    if reward.status != "available":
        raise HTTPException(status_code=400, detail="This reward is no longer available")
    if reward.expires_at and reward.expires_at < utc_now():
        reward.status = "expired"
        await db.commit()
        raise HTTPException(status_code=400, detail="This reward has expired")
    return reward


def reward_to_dict(reward: Customer_rewards) -> dict[str, Any]:
    return {
        "id": reward.id,
        "tier": reward.reward_tier,
        "type": reward.reward_type,
        "value": float(reward.reward_value or 0),
        "max_discount": float(reward.max_discount or 0),
        "minimum_order": float(reward.minimum_order or 0),
        "title": reward.title,
        "status": reward.status,
        "expires_at": reward.expires_at.isoformat() if reward.expires_at else None,
        "source_order_id": reward.source_order_id,
    }


@router.get("/status")
async def rewards_status(db: AsyncSession = Depends(get_db)):
    return {"enabled": await get_rewards_enabled(db)}


@router.get("/admin/settings")
async def admin_reward_settings(
    identity: AdminIdentity = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    return {"enabled": await get_rewards_enabled(db)}


@router.put("/admin/settings")
async def update_admin_reward_settings(
    body: RewardSettingsUpdate,
    identity: AdminIdentity = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    enabled = await set_rewards_enabled(db, body.enabled)
    return {"enabled": enabled, "message": "Rewards turned ON" if enabled else "Rewards turned OFF"}


@router.get("/me")
async def my_rewards(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    customer_id = customer_id_from_authorization(authorization)
    if not await get_rewards_enabled(db):
        return {
            "enabled": False,
            "available": [],
            "history": [],
            "gold_progress": 0,
            "gold_required": GOLD_REQUIRED_ORDERS,
            "gold_order_min": GOLD_ORDER_MIN,
            "gold_window_days": GOLD_WINDOW_DAYS,
            "normal_order_min": NORMAL_MIN_ORDER,
        }
    await sync_customer_rewards(db, customer_id)

    rows = (
        await db.execute(
            select(Customer_rewards)
            .where(Customer_rewards.customer_id == customer_id)
            .order_by(desc(Customer_rewards.created_at), desc(Customer_rewards.id))
            .limit(100)
        )
    ).scalars().all()

    available = [reward_to_dict(row) for row in rows if row.status == "available"]
    history = [reward_to_dict(row) for row in rows if row.status != "available"]

    # Progress toward next Gold, based only on completed AED 100+ orders after
    # the latest Golden source order.
    latest_gold_source = max(
        [int(row.source_order_id) for row in rows if row.reward_tier == "golden"] or [0]
    )
    qualifying = (
        await db.execute(
            select(Orders)
            .where(
                Orders.user_id == customer_user_id(customer_id),
                Orders.status == "completed",
                Orders.id > latest_gold_source,
                Orders.subtotal_amount >= GOLD_ORDER_MIN,
                Orders.created_at >= rewards_start_at(),
            )
            .order_by(Orders.created_at.desc())
        )
    ).scalars().all()
    if qualifying:
        newest = completed_at(qualifying[0])
        count = sum(1 for order in qualifying if newest - completed_at(order) <= timedelta(days=GOLD_WINDOW_DAYS))
    else:
        count = 0

    return {
        "enabled": True,
        "available": available,
        "history": history,
        "gold_progress": min(count, GOLD_REQUIRED_ORDERS),
        "gold_required": GOLD_REQUIRED_ORDERS,
        "gold_order_min": GOLD_ORDER_MIN,
        "gold_window_days": GOLD_WINDOW_DAYS,
        "normal_order_min": NORMAL_MIN_ORDER,
    }
