import base64
import hashlib
import hmac
import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from uuid import uuid4

import httpx
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


class SendOtpRequest(BaseModel):
    phone: str
    purpose: Literal["signup", "forgot_pin"]


class LoginRequest(BaseModel):
    phone: Optional[str] = None
    customer_phone: Optional[str] = None
    pin: str = Field(min_length=4, max_length=4)


class SignupVerifyRequest(BaseModel):
    name: Optional[str] = None
    customer_name: Optional[str] = None
    phone: Optional[str] = None
    customer_phone: Optional[str] = None
    pin: str = Field(min_length=4, max_length=4)
    code: str = Field(min_length=4, max_length=10)


class ForgotPinResetRequest(BaseModel):
    phone: Optional[str] = None
    customer_phone: Optional[str] = None
    code: str = Field(min_length=4, max_length=10)
    new_pin: str = Field(min_length=4, max_length=4)


class ChangePinRequest(BaseModel):
    phone: Optional[str] = None
    customer_phone: Optional[str] = None
    current_pin: Optional[str] = None
    old_pin: Optional[str] = None
    new_pin: str = Field(min_length=4, max_length=4)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_phone(raw_value: str) -> str:
    """Convert common UAE formats to E.164 and validate other +country formats."""
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
    value = (
        os.getenv("CUSTOMER_JWT_SECRET")
        or os.getenv("JWT_SECRET_KEY")
        or ""
    ).strip()
    if len(value) < 24:
        raise HTTPException(
            status_code=500,
            detail="Customer JWT secret is not configured on Render",
        )
    return value


def create_customer_token(account: Customer_pin_accounts_v2) -> str:
    expires_at = utc_now() + timedelta(days=TOKEN_DAYS)
    payload = {
        "sub": str(account.id),
        "phone": account.phone,
        "customer_name": account.customer_name,
        "token_type": "customer",
        "exp": expires_at,
        "iat": utc_now(),
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
    """Find an older customer record so old customers can recover using OTP once."""
    tail = phone[-9:]
    result = await db.execute(
        select(Customer_sessions)
        .where(Customer_sessions.customer_phone.ilike(f"%{tail}"))
        .order_by(desc(Customer_sessions.id))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def ensure_customer_session(
    db: AsyncSession,
    phone: str,
    name: str,
) -> None:
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


def twilio_settings() -> tuple[str, str, str, str]:
    username = (
        os.getenv("TWILIO_API_KEY")
        or os.getenv("TWILIO_ACCOUNT_SID")
        or ""
    ).strip()
    password = (
        os.getenv("TWILIO_API_KEY_SECRET")
        or os.getenv("TWILIO_AUTH_TOKEN")
        or ""
    ).strip()
    service_sid = os.getenv("TWILIO_VERIFY_SERVICE_SID", "").strip()
    channel = os.getenv("TWILIO_OTP_CHANNEL", "sms").strip().lower() or "sms"

    if not username or not password or not service_sid:
        raise HTTPException(
            status_code=503,
            detail="OTP service is not configured yet",
        )

    if channel not in {"sms", "whatsapp", "call"}:
        channel = "sms"

    return username, password, service_sid, channel


async def send_twilio_otp(phone: str) -> None:
    username, password, service_sid, channel = twilio_settings()
    url = f"https://verify.twilio.com/v2/Services/{service_sid}/Verifications"

    try:
        async with httpx.AsyncClient(
            timeout=25.0,
            auth=(username, password),
        ) as client:
            response = await client.post(
                url,
                data={"To": phone, "Channel": channel},
            )
    except httpx.RequestError as exc:
        logger.error("Twilio OTP request failed: %s", exc)
        raise HTTPException(status_code=503, detail="Could not send OTP. Please try again")

    if response.status_code >= 400:
        logger.error("Twilio OTP error %s: %s", response.status_code, response.text)
        detail = "Could not send OTP. Check the mobile number and try again"
        if response.status_code in {401, 403}:
            detail = "OTP service credentials are incorrect"
        raise HTTPException(status_code=503, detail=detail)


async def verify_twilio_otp(phone: str, code: str) -> bool:
    username, password, service_sid, _channel = twilio_settings()
    url = f"https://verify.twilio.com/v2/Services/{service_sid}/VerificationCheck"

    clean_code = re.sub(r"\D", "", code or "")
    if not 4 <= len(clean_code) <= 10:
        raise HTTPException(status_code=400, detail="Enter the OTP sent to your mobile")

    try:
        async with httpx.AsyncClient(
            timeout=25.0,
            auth=(username, password),
        ) as client:
            response = await client.post(
                url,
                data={"To": phone, "Code": clean_code},
            )
    except httpx.RequestError as exc:
        logger.error("Twilio OTP verification failed: %s", exc)
        raise HTTPException(status_code=503, detail="Could not verify OTP. Please try again")

    if response.status_code >= 400:
        logger.warning("Twilio OTP check error %s: %s", response.status_code, response.text)
        return False

    try:
        data = response.json()
    except ValueError:
        return False

    return data.get("status") == "approved" and data.get("valid", True) is not False


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


@router.post("/account-status")
async def account_status(
    data: PhoneRequest,
    db: AsyncSession = Depends(get_db),
):
    phone = normalize_phone(data.phone)
    account = await find_account(db, phone)
    legacy = None if account else await find_legacy_customer(db, phone)
    return {
        "exists": bool(account or legacy),
        "secure_pin_active": bool(account),
        "phone": phone,
    }


@router.post("/send-otp")
async def send_otp(
    data: SendOtpRequest,
    db: AsyncSession = Depends(get_db),
):
    phone = normalize_phone(data.phone)
    account = await find_account(db, phone)
    legacy = None if account else await find_legacy_customer(db, phone)

    if data.purpose == "signup" and (account or legacy):
        raise HTTPException(
            status_code=409,
            detail="An account already exists for this mobile number. Please login or use Forgot PIN",
        )

    if data.purpose == "forgot_pin" and not (account or legacy):
        raise HTTPException(
            status_code=404,
            detail="No account was found for this mobile number",
        )

    await send_twilio_otp(phone)
    return {"message": "OTP sent successfully", "phone": phone}


@router.post("/signup-verify", status_code=status.HTTP_201_CREATED)
async def signup_verify(
    data: SignupVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    name = (data.name or data.customer_name or "").strip()
    phone = normalize_phone(data.phone or data.customer_phone or "")
    pin = validate_pin(data.pin)

    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Please enter your full name")

    if await find_account(db, phone) or await find_legacy_customer(db, phone):
        raise HTTPException(
            status_code=409,
            detail="An account already exists. Please login or use Forgot PIN",
        )

    if not await verify_twilio_otp(phone, data.code):
        raise HTTPException(status_code=400, detail="Incorrect or expired OTP")

    pin_hash, pin_salt = hash_pin(pin)
    account = Customer_pin_accounts_v2(
        phone=phone,
        customer_name=name,
        pin_hash=pin_hash,
        pin_salt=pin_salt,
        phone_verified=True,
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


@router.post("/signup")
async def legacy_signup_disabled():
    raise HTTPException(
        status_code=400,
        detail="Phone OTP verification is required. Please request an OTP first",
    )


@router.post("/login")
async def login(
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    phone = normalize_phone(data.phone or data.customer_phone or "")
    pin = validate_pin(data.pin)
    account = await find_account(db, phone)

    if not account:
        legacy = await find_legacy_customer(db, phone)
        if legacy:
            raise HTTPException(
                status_code=409,
                detail="Use Forgot PIN once to activate secure OTP login for this account",
            )
        raise HTTPException(status_code=401, detail="Invalid mobile number or PIN")

    now = utc_now()
    if account.locked_until and account.locked_until > now:
        raise HTTPException(
            status_code=429,
            detail="Too many wrong attempts. Try again after 15 minutes or use Forgot PIN",
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


@router.post("/forgot-pin-reset")
async def forgot_pin_reset(
    data: ForgotPinResetRequest,
    db: AsyncSession = Depends(get_db),
):
    phone = normalize_phone(data.phone or data.customer_phone or "")
    new_pin = validate_pin(data.new_pin, "New PIN")
    account = await find_account(db, phone)
    legacy = None if account else await find_legacy_customer(db, phone)

    if not account and not legacy:
        raise HTTPException(status_code=404, detail="No account was found for this mobile number")

    if not await verify_twilio_otp(phone, data.code):
        raise HTTPException(status_code=400, detail="Incorrect or expired OTP")

    pin_hash, pin_salt = hash_pin(new_pin)

    if account:
        account.pin_hash = pin_hash
        account.pin_salt = pin_salt
        account.phone_verified = True
        account.failed_login_attempts = 0
        account.locked_until = None
        account.updated_at = utc_now()
    else:
        account = Customer_pin_accounts_v2(
            phone=phone,
            customer_name=(legacy.customer_name or "Customer") if legacy else "Customer",
            pin_hash=pin_hash,
            pin_salt=pin_salt,
            phone_verified=True,
        )
        db.add(account)

    await ensure_customer_session(db, phone, account.customer_name)

    try:
        await db.commit()
        await db.refresh(account)
    except Exception:
        await db.rollback()
        logger.exception("Could not reset customer PIN")
        raise HTTPException(status_code=500, detail="Could not reset PIN")

    return {"message": "PIN reset successfully", **auth_response(account)}


@router.post("/change-pin")
async def change_pin(
    data: ChangePinRequest,
    db: AsyncSession = Depends(get_db),
):
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
