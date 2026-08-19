import hashlib
import os
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.branches import Branches
from routers.fai_fai_admin_control import AdminIdentity, get_current_admin, require_super_admin

router = APIRouter(prefix="/api/v1/entities/branches", tags=["branches"])

PIN_ITERATIONS = 180_000


class BranchData(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    address: Optional[str] = Field(default="", max_length=500)
    phone: Optional[str] = Field(default="", max_length=50)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    is_active: bool = True
    is_default: bool = False
    delivery_enabled: Optional[bool] = None
    delivery_schedule_enabled: Optional[bool] = None
    delivery_start_time: Optional[str] = Field(default=None, max_length=10)
    delivery_end_time: Optional[str] = Field(default=None, max_length=10)
    estimated_delivery_time: Optional[str] = Field(default=None, max_length=80)
    restaurant_status: Optional[str] = Field(default="open", max_length=20)
    kitchen_pin: Optional[str] = Field(default=None, max_length=8)


class BranchUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    address: Optional[str] = Field(default=None, max_length=500)
    phone: Optional[str] = Field(default=None, max_length=50)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    delivery_enabled: Optional[bool] = None
    delivery_schedule_enabled: Optional[bool] = None
    delivery_start_time: Optional[str] = Field(default=None, max_length=10)
    delivery_end_time: Optional[str] = Field(default=None, max_length=10)
    estimated_delivery_time: Optional[str] = Field(default=None, max_length=80)
    restaurant_status: Optional[str] = Field(default=None, max_length=20)
    kitchen_pin: Optional[str] = Field(default=None, max_length=8)


def _pin_record(pin: str) -> tuple[str, str]:
    value = str(pin or "").strip()
    if not value.isdigit() or not 4 <= len(value) <= 8:
        raise HTTPException(status_code=400, detail="Kitchen PIN must be 4 to 8 digits.")
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", value.encode("utf-8"), bytes.fromhex(salt), PIN_ITERATIONS
    ).hex()
    return salt, digest


def serialize_branch(branch: Branches) -> dict:
    legacy_default_pin = bool(branch.is_default and len(os.getenv("KITCHEN_PIN", "").strip()) >= 4)
    return {
        "id": branch.id,
        "name": branch.name,
        "address": branch.address or "",
        "phone": branch.phone or "",
        "latitude": float(branch.latitude),
        "longitude": float(branch.longitude),
        "is_active": bool(branch.is_active),
        "is_default": bool(branch.is_default),
        "delivery_enabled": branch.delivery_enabled,
        "delivery_schedule_enabled": branch.delivery_schedule_enabled,
        "delivery_start_time": branch.delivery_start_time,
        "delivery_end_time": branch.delivery_end_time,
        "estimated_delivery_time": branch.estimated_delivery_time,
        "restaurant_status": (branch.restaurant_status or "open"),
        "has_kitchen_pin": bool(branch.kitchen_pin_hash and branch.kitchen_pin_salt) or legacy_default_pin,
        "created_at": branch.created_at.isoformat() if branch.created_at else None,
        "updated_at": branch.updated_at.isoformat() if branch.updated_at else None,
    }


async def _make_only_default(db: AsyncSession, branch_id: int) -> None:
    rows = (await db.execute(select(Branches))).scalars().all()
    for row in rows:
        row.is_default = row.id == branch_id


@router.get("")
async def list_branches(
    active_only: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
):
    # Public read: customer and Kitchen use this list to choose/resolve a branch.
    query = select(Branches).order_by(desc(Branches.is_default), Branches.id)
    if active_only:
        query = query.where(Branches.is_active.is_(True))
    rows = (await db.execute(query)).scalars().all()
    return {"items": [serialize_branch(row) for row in rows], "total": len(rows)}


@router.post("")
async def create_branch(
    data: BranchData,
    identity: AdminIdentity = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    require_super_admin(identity)
    payload = data.model_dump(exclude={"kitchen_pin"})
    branch = Branches(**payload)

    if data.kitchen_pin:
        branch.kitchen_pin_salt, branch.kitchen_pin_hash = _pin_record(data.kitchen_pin)
    elif not data.is_default:
        raise HTTPException(status_code=400, detail="Set a separate Kitchen PIN for the new branch.")

    db.add(branch)
    await db.flush()
    if data.is_default:
        await _make_only_default(db, branch.id)
    await db.commit()
    await db.refresh(branch)
    return serialize_branch(branch)


@router.put("/{branch_id}")
async def update_branch(
    branch_id: int,
    data: BranchUpdate,
    identity: AdminIdentity = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    require_super_admin(identity)
    branch = (await db.execute(select(Branches).where(Branches.id == branch_id))).scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    updates = data.model_dump(exclude_unset=True)
    kitchen_pin = updates.pop("kitchen_pin", None)
    if branch.is_default and updates.get("is_active") is False:
        raise HTTPException(status_code=400, detail="Default branch cannot be disabled. Make another branch default first.")
    if branch.is_default and updates.get("is_default") is False:
        raise HTTPException(status_code=400, detail="Default branch cannot be unset directly. Make another branch default instead.")

    for key, value in updates.items():
        setattr(branch, key, value)

    if kitchen_pin is not None:
        branch.kitchen_pin_salt, branch.kitchen_pin_hash = _pin_record(kitchen_pin)

    if updates.get("is_default") is True:
        await _make_only_default(db, branch.id)
        branch.is_active = True

    await db.commit()
    await db.refresh(branch)
    return serialize_branch(branch)


@router.delete("/{branch_id}")
async def delete_branch(
    branch_id: int,
    identity: AdminIdentity = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    require_super_admin(identity)
    branch = (await db.execute(select(Branches).where(Branches.id == branch_id))).scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    count = len((await db.execute(select(Branches))).scalars().all())
    if count <= 1:
        raise HTTPException(status_code=400, detail="At least one branch must remain")
    if branch.is_default:
        raise HTTPException(status_code=400, detail="Default branch cannot be deleted. Make another branch default first.")
    await db.delete(branch)
    await db.commit()
    return {"success": True}
