import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from typing import Optional

from core.auth import (
    AccessTokenError,
    create_access_token,
    decode_access_token,
)
from core.database import get_db
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from models.customer import Customer
from schemas.customer_auth import (
    CustomerAuthResponse,
    CustomerChangePinRequest,
    CustomerLoginRequest,
    CustomerResponse,
    CustomerSignupRequest,
)
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession


router = APIRouter(
    prefix="/api/v1/customer-auth",
    tags=["customer-authentication"],
)

bearer_scheme = HTTPBearer(auto_error=False)

PIN_ITERATIONS = 310_000
CUSTOMER_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30  # 30 days


def hash_pin(pin: str) -> str:
    """Securely hash a customer PIN with a random salt."""
    salt = secrets.token_bytes(16)

    digest = hashlib.pbkdf2_hmac(
        "sha256",
        pin.encode("utf-8"),
        salt,
        PIN_ITERATIONS,
    )

    salt_b64 = base64.urlsafe_b64encode(salt).decode("ascii")
    digest_b64 = base64.urlsafe_b64encode(digest).decode("ascii")

    return (
        f"pbkdf2_sha256$"
        f"{PIN_ITERATIONS}$"
        f"{salt_b64}$"
        f"{digest_b64}"
    )


def verify_pin(pin: str, stored_hash: str) -> bool:
    """Check a PIN against its stored secure hash."""
    try:
        algorithm, iterations_text, salt_b64, expected_b64 = (
            stored_hash.split("$", 3)
        )

        if algorithm != "pbkdf2_sha256":
            return False

        iterations = int(iterations_text)
        salt = base64.urlsafe_b64decode(salt_b64.encode("ascii"))
        expected_digest = base64.urlsafe_b64decode(
            expected_b64.encode("ascii")
        )

        candidate_digest = hashlib.pbkdf2_hmac(
            "sha256",
            pin.encode("utf-8"),
            salt,
            iterations,
        )

        return hmac.compare_digest(
            candidate_digest,
            expected_digest,
        )

    except (ValueError, TypeError):
        return False


def create_customer_token(customer: Customer) -> str:
    """Create a customer JWT valid for 30 days."""
    return create_access_token(
        {
            "sub": str(customer.id),
            "type": "customer",
            "role": "customer",
            "name": customer.name,
            "phone": customer.phone,
        },
        expires_minutes=CUSTOMER_TOKEN_EXPIRE_MINUTES,
    )


async def get_current_customer(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        bearer_scheme
    ),
    db: AsyncSession = Depends(get_db),
) -> Customer:
    """Read and verify the logged-in customer token."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(credentials.credentials)

    except AccessTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if payload.get("type") != "customer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid customer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    customer_id = payload.get("sub")

    try:
        customer_id = int(customer_id)

    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid customer token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    result = await db.execute(
        select(Customer).where(Customer.id == customer_id)
    )

    customer = result.scalar_one_or_none()

    if customer is None or not customer.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Customer account is unavailable",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return customer


@router.post(
    "/signup",
    response_model=CustomerAuthResponse,
    status_code=status.HTTP_201_CREATED,
)
async def signup(
    payload: CustomerSignupRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new customer account."""
    result = await db.execute(
        select(Customer).where(Customer.phone == payload.phone)
    )

    existing_customer = result.scalar_one_or_none()

    if existing_customer is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists with this phone number",
        )

    customer = Customer(
        name=payload.name,
        phone=payload.phone,
        pin_hash=hash_pin(payload.pin),
        is_active=True,
        last_login=datetime.now(timezone.utc),
    )

    db.add(customer)

    try:
        await db.commit()
        await db.refresh(customer)

    except IntegrityError as exc:
        await db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists with this phone number",
        ) from exc

    return CustomerAuthResponse(
        token=create_customer_token(customer),
        customer=customer,
    )


@router.post(
    "/login",
    response_model=CustomerAuthResponse,
)
async def login(
    payload: CustomerLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Login with mobile number and 4-digit PIN."""
    result = await db.execute(
        select(Customer).where(Customer.phone == payload.phone)
    )

    customer = result.scalar_one_or_none()

    if (
        customer is None
        or not customer.is_active
        or not verify_pin(payload.pin, customer.pin_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid phone number or PIN",
        )

    customer.last_login = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(customer)

    return CustomerAuthResponse(
        token=create_customer_token(customer),
        customer=customer,
    )


@router.get(
    "/me",
    response_model=CustomerResponse,
)
async def me(
    customer: Customer = Depends(get_current_customer),
):
    """Return the currently logged-in customer."""
    return customer


@router.post("/change-pin")
async def change_pin(
    payload: CustomerChangePinRequest,
    customer: Customer = Depends(get_current_customer),
    db: AsyncSession = Depends(get_db),
):
    """Allow customer to change their PIN."""
    if not verify_pin(payload.old_pin, customer.pin_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current PIN is incorrect",
        )

    if payload.old_pin == payload.new_pin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New PIN must be different from the current PIN",
        )

    customer.pin_hash = hash_pin(payload.new_pin)

    await db.commit()

    return {
        "message": "PIN changed successfully",
    }


@router.post("/logout")
async def logout():
    """Frontend removes the saved JWT when logging out."""
    return {
        "message": "Logged out successfully",
    }
