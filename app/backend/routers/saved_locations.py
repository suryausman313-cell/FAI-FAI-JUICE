from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.customer_pin_accounts_v2 import Customer_pin_accounts_v2
from models.saved_locations import Customer_saved_locations
from routers.customer_auth import decode_customer_token, get_bearer_token

router = APIRouter(prefix="/api/v1/customer-saved-locations", tags=["customer-saved-locations"])

MAX_SAVED_LOCATIONS = 10


class SavedLocationCreate(BaseModel):
    label: str = Field(default="Saved Location", min_length=1, max_length=60)
    address_text: str = Field(default="", max_length=500)
    area_name: str = Field(default="", max_length=160)
    latitude: float
    longitude: float


class SavedLocationUpdate(BaseModel):
    label: Optional[str] = Field(default=None, min_length=1, max_length=60)
    address_text: Optional[str] = Field(default=None, max_length=500)
    area_name: Optional[str] = Field(default=None, max_length=160)
    latitude: Optional[float] = None
    longitude: Optional[float] = None


def _validate_coords(latitude: float, longitude: float) -> None:
    if not (-90 <= latitude <= 90):
        raise HTTPException(status_code=400, detail="Invalid latitude")
    if not (-180 <= longitude <= 180):
        raise HTTPException(status_code=400, detail="Invalid longitude")


async def _current_account_id(
    authorization: Optional[str],
    db: AsyncSession,
) -> int:
    token = get_bearer_token(authorization)
    payload = decode_customer_token(token)

    try:
        account_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid customer token")

    account = await db.get(Customer_pin_accounts_v2, account_id)
    if not account:
        raise HTTPException(status_code=401, detail="Customer account not found")
    return account_id


def _serialize(row: Customer_saved_locations) -> dict:
    return {
        "id": row.id,
        "label": row.label,
        "address_text": row.address_text or "",
        "area_name": row.area_name or "",
        "latitude": float(row.latitude),
        "longitude": float(row.longitude),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("")
async def list_saved_locations(
    authorization: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    account_id = await _current_account_id(authorization, db)
    rows = (
        await db.execute(
            select(Customer_saved_locations)
            .where(Customer_saved_locations.customer_account_id == account_id)
            .order_by(Customer_saved_locations.updated_at.desc(), Customer_saved_locations.id.desc())
        )
    ).scalars().all()

    return {
        "items": [_serialize(row) for row in rows],
        "count": len(rows),
        "max": MAX_SAVED_LOCATIONS,
    }


@router.post("", status_code=201)
async def create_saved_location(
    data: SavedLocationCreate,
    authorization: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    account_id = await _current_account_id(authorization, db)
    _validate_coords(data.latitude, data.longitude)

    count = (
        await db.execute(
            select(func.count(Customer_saved_locations.id)).where(
                Customer_saved_locations.customer_account_id == account_id
            )
        )
    ).scalar_one()

    if int(count or 0) >= MAX_SAVED_LOCATIONS:
        raise HTTPException(
            status_code=400,
            detail=f"You can save up to {MAX_SAVED_LOCATIONS} locations. Delete one first.",
        )

    row = Customer_saved_locations(
        customer_account_id=account_id,
        label=data.label.strip() or "Saved Location",
        address_text=data.address_text.strip(),
        area_name=data.area_name.strip(),
        latitude=float(data.latitude),
        longitude=float(data.longitude),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _serialize(row)


@router.patch("/{location_id}")
async def update_saved_location(
    location_id: int,
    data: SavedLocationUpdate,
    authorization: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    account_id = await _current_account_id(authorization, db)
    row = (
        await db.execute(
            select(Customer_saved_locations).where(
                Customer_saved_locations.id == location_id,
                Customer_saved_locations.customer_account_id == account_id,
            )
        )
    ).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Saved location not found")

    if data.latitude is not None or data.longitude is not None:
        new_lat = float(data.latitude if data.latitude is not None else row.latitude)
        new_lng = float(data.longitude if data.longitude is not None else row.longitude)
        _validate_coords(new_lat, new_lng)
        row.latitude = new_lat
        row.longitude = new_lng

    if data.label is not None:
        row.label = data.label.strip() or "Saved Location"
    if data.address_text is not None:
        row.address_text = data.address_text.strip()
    if data.area_name is not None:
        row.area_name = data.area_name.strip()

    await db.commit()
    await db.refresh(row)
    return _serialize(row)


@router.delete("/{location_id}")
async def delete_saved_location(
    location_id: int,
    authorization: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    account_id = await _current_account_id(authorization, db)
    row = (
        await db.execute(
            select(Customer_saved_locations).where(
                Customer_saved_locations.id == location_id,
                Customer_saved_locations.customer_account_id == account_id,
            )
        )
    ).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Saved location not found")

    await db.delete(row)
    await db.commit()
    return {"ok": True, "deleted_id": location_id}
