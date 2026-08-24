import base64
import hashlib
import hmac
import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, status
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.customer_pin_accounts_v2 import Customer_pin_accounts_v2
from models.customer_sessions import Customer_sessions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/customer-auth", tags=["customer-auth"])

PIN_ITERATIONS = 310_000
PIN_LOCK_AFTER_ATTEMPTS = 5
PIN_LOCK_MINUTES = 15
TOKEN_DAYS = 90
JWT_ALGORITHM = "HS256"


class PhoneRequest(BaseModel):
    phone: str


class LoginRequest(BaseModel):
    phone: Optional[str] = None
    customer_phone: Optional[str] = None
    pin: str = Field(min_length=4, max_length=4)


class SignupRequest(BaseModel):
    name: Optional[str] = None
    customer_name: Optional[str] = None
    phone: Optional[str] = None
    customer_phone: Optional[str] = None
    pin: str = Field(min_length=4, max_length=4)
    # Kept optional only so an older frontend cannot crash during deployment.
    code: Optional[str] = None


class ChangePinRequest(BaseModel):
    phone: Optional[str] = None
    customer_phone: Optional[str] = None
    current_pin: Optional[str] = None
    old_pin: Optional[str] = None
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


def validate_pin(pin: str, field_name: str = "PIN") -> str:
    value = (pin or "").strip()
    if not re.fullmatch(r"\d{4}", value):
        raise HTTPException(status_code=400, detail=f"{field_name} must be exactly 4 digits")
    return value


def hash_pin(pin: str, salt_bytes: Optional[bytes] = None) -> tuple[str, str]:
    salt = salt_bytes or secrets.token_bytes(16)
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


def verify_pin(pin: str, stored_hash: str, stored_salt: str) -> bool:
    try:
        salt = base64.urlsafe_b64decode(stored_salt.encode("ascii"))
        candidate_hash, _ = hash_pin(pin, salt)
        return hmac.compare_digest(candidate_hash, stored_hash)
    except Exception:
        return False


def get_jwt_secret() -> str:
    value = (os.getenv("CUSTOMER_JWT_SECRET") or os.getenv("JWT_SECRET_KEY") or "").strip()
    if len(value) < 24:
        raise HTTPException(
            status_code=500,
            detail="Customer JWT secret is not configured on Render",
        )
    return value


def create_customer_token(account: Customer_pin_accounts_v2) -> str:
    now = utc_now()
    payload = {
        "sub": str(account.id),
        "phone": account.phone,
        "customer_name": account.customer_name,
        "token_type": "customer",
        "iat": now,
        "exp": now + timedelta(days=TOKEN_DAYS),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def get_bearer_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Customer login required")
    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail="Invalid customer token")
    return parts[1].strip()


def decode_customer_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Customer session expired. Please login again")

    if payload.get("token_type") != "customer":
        raise HTTPException(status_code=401, detail="Invalid customer token")
    return payload


async def find_account(db: AsyncSession, phone: str) -> Optional[Customer_pin_accounts_v2]:
    result = await db.execute(
        select(Customer_pin_accounts_v2).where(Customer_pin_accounts_v2.phone == phone)
    )
    return result.scalar_one_or_none()


async def find_legacy_customer(db: AsyncSession, phone: str) -> Optional[Customer_sessions]:
    tail = phone[-9:]
    result = await db.execute(
        select(Customer_sessions)
        .where(Customer_sessions.customer_phone.ilike(f"%{tail}"))
        .order_by(desc(Customer_sessions.id))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def ensure_customer_session(db: AsyncSession, phone: str, name: str) -> None:
    existing = await find_legacy_customer(db, phone)
    if existing:
        existing.customer_phone = phone
        if name:
            existing.customer_name = name
        existing.last_active = utc_now()
        return

    db.add(
        Customer_sessions(
            user_id=f"customer:{uuid4().hex}",
            customer_name=name or "Customer",
            customer_phone=phone,
            first_seen=utc_now(),
            last_active=utc_now(),
        )
    )


def auth_response(account: Customer_pin_accounts_v2) -> dict:
    token = create_customer_token(account)
    customer = {
        "id": account.id,
        "name": account.customer_name,
        "customer_name": account.customer_name,
        "phone": account.phone,
        "customer_phone": account.phone,
        "phone_verified": bool(account.phone_verified),
    }
    return {
        "access_token": token,
        "token": token,
        "token_type": "bearer",
        "customer": customer,
        "user": customer,
    }


def normalize_locked_until(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


async def create_account(data: SignupRequest, db: AsyncSession) -> dict:
    name = (data.name or data.customer_name or "").strip()
    phone = normalize_phone(data.phone or data.customer_phone or "")
    pin = validate_pin(data.pin)

    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Please enter your full name")

    existing_account = await find_account(db, phone)
    if existing_account:
        raise HTTPException(
            status_code=409,
            detail="An account already exists for this mobile number. Please login",
        )

    # Old customer/order records are linked instead of being deleted or duplicated.
    legacy = await find_legacy_customer(db, phone)
    if legacy and (legacy.customer_name or "").strip():
        saved_name = (legacy.customer_name or "").strip()
        if not name:
            name = saved_name

    pin_hash, pin_salt = hash_pin(pin)
    account = Customer_pin_accounts_v2(
        phone=phone,
        customer_name=name,
        pin_hash=pin_hash,
        pin_salt=pin_salt,
        # OTP is removed, so do not claim the number was SMS-verified.
        phone_verified=False,
    )
    db.add(account)
    await ensure_customer_session(db, phone, name)

    try:
        await db.commit()
        await db.refresh(account)
    except Exception:
        await db.rollback()
        logger.exception("Could not create customer account")
        raise HTTPException(status_code=500, detail="Could not create account")

    return auth_response(account)


@router.post("/account-status")
async def account_status(data: PhoneRequest, db: AsyncSession = Depends(get_db)):
    phone = normalize_phone(data.phone)
    account = await find_account(db, phone)
    legacy = None if account else await find_legacy_customer(db, phone)
    return {
        # Only a secure PIN account counts as an existing login account.
        "exists": bool(account),
        "secure_pin_active": bool(account),
        "legacy_customer_found": bool(legacy),
        "can_signup": not bool(account),
        "phone": phone,
    }


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(data: SignupRequest, db: AsyncSession = Depends(get_db)):
    return await create_account(data, db)


@router.post("/signup-verify", status_code=status.HTTP_201_CREATED)
async def signup_verify_compatibility(data: SignupRequest, db: AsyncSession = Depends(get_db)):
    """Temporary compatibility endpoint while the frontend deployment updates."""
    return await create_account(data, db)


@router.post("/send-otp")
async def otp_removed():
    raise HTTPException(
        status_code=410,
        detail="OTP has been removed. Create an account directly with mobile number and PIN",
    )


@router.post("/login")
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    phone = normalize_phone(data.phone or data.customer_phone or "")
    pin = validate_pin(data.pin)
    account = await find_account(db, phone)

    if not account:
        legacy = await find_legacy_customer(db, phone)
        if legacy:
            raise HTTPException(
                status_code=404,
                detail="No PIN account exists yet. Please use Sign Up once with this mobile number",
            )
        raise HTTPException(status_code=401, detail="Invalid mobile number or PIN")

    now = utc_now()
    locked_until = normalize_locked_until(account.locked_until)
    if locked_until and locked_until > now:
        raise HTTPException(
            status_code=429,
            detail="Too many wrong attempts. Try again after 15 minutes",
        )

    if not verify_pin(pin, account.pin_hash, account.pin_salt):
        account.failed_login_attempts = int(account.failed_login_attempts or 0) + 1
        if account.failed_login_attempts >= PIN_LOCK_AFTER_ATTEMPTS:
            account.locked_until = now + timedelta(minutes=PIN_LOCK_MINUTES)
            account.failed_login_attempts = 0
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid mobile number or PIN")

    account.failed_login_attempts = 0
    account.locked_until = None
    account.last_login_at = now
    account.updated_at = now
    await ensure_customer_session(db, phone, account.customer_name)
    await db.commit()
    await db.refresh(account)

    return auth_response(account)


@router.post("/change-pin")
async def change_pin(data: ChangePinRequest, db: AsyncSession = Depends(get_db)):
    phone = normalize_phone(data.phone or data.customer_phone or "")
    current_pin = validate_pin(data.current_pin or data.old_pin or "", "Current PIN")
    new_pin = validate_pin(data.new_pin, "New PIN")

    if current_pin == new_pin:
        raise HTTPException(status_code=400, detail="New PIN must be different from current PIN")

    account = await find_account(db, phone)
    if not account or not verify_pin(current_pin, account.pin_hash, account.pin_salt):
        raise HTTPException(status_code=401, detail="Current PIN is incorrect")

    pin_hash, pin_salt = hash_pin(new_pin)
    account.pin_hash = pin_hash
    account.pin_salt = pin_salt
    account.failed_login_attempts = 0
    account.locked_until = None
    account.updated_at = utc_now()
    await db.commit()

    return {"message": "PIN changed successfully"}


@router.post("/forgot-pin-reset")
async def forgot_pin_reset_removed():
    raise HTTPException(
        status_code=410,
        detail="For security, contact Fai Fai Juice to reset a forgotten PIN",
    )


@router.get("/me")
async def me(
    authorization: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    token = get_bearer_token(authorization)
    payload = decode_customer_token(token)

    try:
        account_id = int(payload.get("sub", ""))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid customer token")

    result = await db.execute(
        select(Customer_pin_accounts_v2).where(Customer_pin_accounts_v2.id == account_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=401, detail="Customer account not found")

    return auth_response(account)
