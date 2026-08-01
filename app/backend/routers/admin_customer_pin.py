# @File: backend/routers/admin_customer_pin.py
# @Desc: Secure admin tools for customer PIN account lookup and reset

import base64
import hashlib
import logging
import re
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from models.customer_pin_accounts_v2 import Customer_pin_accounts_v2
from models.customer_sessions import Customer_sessions

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/admin/customer-pin",
    tags=["admin-customer-pin"],
)

PIN_ITERATIONS = 310_000


class AdminResetPinRequest(BaseModel):
    phone: str = Field(min_length=8, max_length=32)
    new_pin: str = Field(min_length=4, max_length=4)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_phone(raw_value: str) -> str:
    raw = (raw_value or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Mobile number is required")

    digits = re.sub(r"\D", "", raw)

    if raw.startswith("+"):
        normalized = f"+{digits}"
    elif digits.startswith("00"):
        normalized = f"+{digits[2:]}"
    elif digits.startswith("971"):
        normalized = f"+{digits}"
    elif digits.startswith("0") and 9 <= len(digits) <= 10:
        normalized = f"+971{digits[1:]}"
    else:
        raise HTTPException(
            status_code=400,
            detail="Use mobile number with country code, for example +971501234567",
        )

    if not re.fullmatch(r"\+[1-9]\d{7,14}", normalized):
        raise HTTPException(status_code=400, detail="Invalid mobile number")

    return normalized


def validate_pin(pin: str) -> str:
    value = (pin or "").strip()
    if not re.fullmatch(r"\d{4}", value):
        raise HTTPException(
            status_code=400,
            detail="New PIN must be exactly 4 digits",
        )
    return value


def hash_pin(pin: str) -> tuple[str, str]:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        pin.encode("utf-8"),
        salt,
        PIN_ITERATIONS,
    )
    return (
        base64.urlsafe_b64encode(digest).decode("ascii"),
        base64.urlsafe_b64encode(salt).decode("ascii"),
    )


async def find_pin_account(
    db: AsyncSession,
    phone: str,
) -> Optional[Customer_pin_accounts_v2]:
    result = await db.execute(
        select(Customer_pin_accounts_v2).where(
            Customer_pin_accounts_v2.phone == phone
        )
    )
    return result.scalar_one_or_none()


async def find_legacy_customer(
    db: AsyncSession,
    phone: str,
) -> Optional[Customer_sessions]:
    # Match last 9 digits so old UAE local numbers also work.
    tail = phone[-9:]
    result = await db.execute(
        select(Customer_sessions)
        .where(Customer_sessions.customer_phone.ilike(f"%{tail}"))
        .order_by(desc(Customer_sessions.id))
        .limit(1)
    )
    return result.scalar_one_or_none()


@router.get("/accounts")
async def list_customer_pin_accounts(
    search: Optional[str] = Query(default=None, max_length=100),
    limit: int = Query(default=500, ge=1, le=1000),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    del current_user

    query = select(Customer_pin_accounts_v2).order_by(
        desc(Customer_pin_accounts_v2.updated_at)
    )

    clean_search = (search or "").strip()
    if clean_search:
        query = query.where(
            or_(
                Customer_pin_accounts_v2.customer_name.ilike(
                    f"%{clean_search}%"
                ),
                Customer_pin_accounts_v2.phone.ilike(
                    f"%{clean_search}%"
                ),
            )
        )

    result = await db.execute(query.limit(limit))
    accounts = result.scalars().all()
    now = utc_now()

    return {
        "items": [
            {
                "id": account.id,
                "customer_name": account.customer_name,
                "phone": account.phone,
                "phone_verified": bool(account.phone_verified),
                "failed_login_attempts": int(
                    account.failed_login_attempts or 0
                ),
                "is_locked": bool(
                    account.locked_until
                    and (
                        account.locked_until.replace(tzinfo=timezone.utc)
                        if account.locked_until.tzinfo is None
                        else account.locked_until
                    ) > now
                ),
                "locked_until": (
                    account.locked_until.isoformat()
                    if account.locked_until
                    else None
                ),
                "last_login_at": (
                    account.last_login_at.isoformat()
                    if account.last_login_at
                    else None
                ),
                "created_at": (
                    account.created_at.isoformat()
                    if account.created_at
                    else None
                ),
                "updated_at": (
                    account.updated_at.isoformat()
                    if account.updated_at
                    else None
                ),
            }
            for account in accounts
        ],
        "total": len(accounts),
    }


@router.post("/reset")
async def admin_reset_customer_pin(
    data: AdminResetPinRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    phone = normalize_phone(data.phone)
    new_pin = validate_pin(data.new_pin)

    account = await find_pin_account(db, phone)
    legacy_customer = None
    account_created = False

    if not account:
        legacy_customer = await find_legacy_customer(db, phone)
        if not legacy_customer:
            raise HTTPException(
                status_code=404,
                detail="No customer was found with this registered mobile number",
            )

    pin_hash, pin_salt = hash_pin(new_pin)
    now = utc_now()

    if account:
        account.pin_hash = pin_hash
        account.pin_salt = pin_salt
        account.phone_verified = True
        account.failed_login_attempts = 0
        account.locked_until = None
        account.updated_at = now
    else:
        account = Customer_pin_accounts_v2(
            phone=phone,
            customer_name=(
                (legacy_customer.customer_name or "Customer").strip()
                if legacy_customer
                else "Customer"
            ),
            pin_hash=pin_hash,
            pin_salt=pin_salt,
            phone_verified=True,
            failed_login_attempts=0,
            locked_until=None,
            created_at=now,
            updated_at=now,
        )
        db.add(account)
        account_created = True

    if legacy_customer:
        legacy_customer.customer_phone = phone
        if account.customer_name:
            legacy_customer.customer_name = account.customer_name
        legacy_customer.last_active = now

    try:
        await db.commit()
        await db.refresh(account)
    except Exception:
        await db.rollback()
        logger.exception("Admin could not reset customer PIN")
        raise HTTPException(
            status_code=500,
            detail="Could not reset customer PIN",
        )

    admin_identity = (
        getattr(current_user, "email", None)
        or getattr(current_user, "name", None)
        or getattr(current_user, "id", None)
        or "admin"
    )
    logger.info(
        "Customer PIN reset by admin=%s account_id=%s phone=%s created=%s",
        admin_identity,
        account.id,
        account.phone,
        account_created,
    )

    return {
        "success": True,
        "message": (
            "Customer PIN account created successfully"
            if account_created
            else "Customer PIN reset successfully"
        ),
        "account_created": account_created,
        "customer": {
            "id": account.id,
            "customer_name": account.customer_name,
            "phone": account.phone,
            "phone_verified": bool(account.phone_verified),
            "updated_at": (
                account.updated_at.isoformat()
                if account.updated_at
                else None
            ),
        },
    }
