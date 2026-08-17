import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from jose import JWTError, jwt

JWT_ALGORITHM = "HS256"
RIDER_TOKEN_DAYS = 30


def _secret() -> str:
    value = (
        os.getenv("RIDER_JWT_SECRET")
        or os.getenv("CUSTOMER_JWT_SECRET")
        or os.getenv("JWT_SECRET_KEY")
        or ""
    ).strip()
    if len(value) < 24:
        raise HTTPException(
            status_code=500,
            detail="Rider JWT secret is not configured on Render",
        )
    return value


def create_rider_token(rider_id: int, phone: str, name: str = "") -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(int(rider_id)),
        "phone": str(phone or ""),
        "name": str(name or ""),
        "token_type": "rider",
        "iat": now,
        "exp": now + timedelta(days=RIDER_TOKEN_DAYS),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def get_bearer_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Rider login required")
    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail="Invalid rider token")
    return parts[1].strip()


def decode_rider_token(authorization: Optional[str]) -> dict:
    token = get_bearer_token(authorization)
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Rider session expired. Please login again")
    if payload.get("token_type") != "rider":
        raise HTTPException(status_code=401, detail="Invalid rider token")
    return payload


def require_rider_id(authorization: Optional[str], expected_rider_id: Optional[int] = None) -> int:
    payload = decode_rider_token(authorization)
    try:
        rider_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid rider token")
    if expected_rider_id is not None and rider_id != int(expected_rider_id):
        raise HTTPException(status_code=403, detail="This rider account cannot access another rider's data")
    return rider_id
