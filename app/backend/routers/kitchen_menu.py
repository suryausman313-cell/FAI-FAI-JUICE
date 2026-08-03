# @File: backend/routers/kitchen_menu.py
# @Desc: Kitchen staff menu availability control protected by Kitchen PIN.

import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.categories import Categories
from models.menu_items import Menu_items


router = APIRouter(
    prefix="/api/v1/kitchen/menu",
    tags=["kitchen-menu"],
)

def verify_kitchen_pin(
    x_kitchen_pin: Optional[str] = Header(
        default=None,
        alias="X-Kitchen-Pin",
    ),
) -> bool:
    """Only a logged-in Kitchen screen may change menu availability."""
    expected_pin = os.getenv("KITCHEN_PIN", "").strip()
    if len(expected_pin) < 4:
        raise HTTPException(status_code=503, detail="Set KITCHEN_PIN in Render Environment first")
    if not x_kitchen_pin or x_kitchen_pin != expected_pin:
        raise HTTPException(
            status_code=401,
            detail="Invalid kitchen PIN",
        )
    return True


class AvailabilityUpdate(BaseModel):
    is_active: bool


def _safe_float(value: object) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _serialize_item(item: Menu_items) -> dict:
    return {
        "id": item.id,
        "category_id": item.category_id,
        "name": item.name or "Unnamed item",
        "description": getattr(item, "description", "") or "",
        "image_url": getattr(item, "image_url", "") or "",
        "is_active": bool(getattr(item, "is_active", False)),
        "is_popular": bool(getattr(item, "is_popular", False)),
        "price_medium": _safe_float(
            getattr(item, "price_medium", 0)
        ),
        "price_large": _safe_float(
            getattr(item, "price_large", 0)
        ),
        "sizes_json": getattr(item, "sizes_json", None),
        "sort_order": getattr(item, "sort_order", None),
    }


def _serialize_category(category: Categories) -> dict:
    return {
        "id": category.id,
        "name": category.name or f"Category {category.id}",
        "sort_order": getattr(category, "sort_order", None),
        "is_active": bool(getattr(category, "is_active", True)),
    }


@router.get("/health")
async def kitchen_menu_health():
    return {
        "success": True,
        "version": "kitchen-menu-availability-v1",
        "kitchen_pin_protected": True,
    }


@router.get("")
async def get_kitchen_menu(
    kitchen_access: bool = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    del kitchen_access

    category_result = await db.execute(select(Categories))
    categories = list(category_result.scalars().all())

    item_result = await db.execute(select(Menu_items))
    items = list(item_result.scalars().all())

    categories.sort(
        key=lambda category: (
            getattr(category, "sort_order", None) is None,
            getattr(category, "sort_order", 0) or 0,
            (category.name or "").lower(),
        )
    )
    items.sort(
        key=lambda item: (
            item.category_id or 0,
            getattr(item, "sort_order", None) is None,
            getattr(item, "sort_order", 0) or 0,
            (item.name or "").lower(),
        )
    )

    serialized_items = [_serialize_item(item) for item in items]

    return {
        "success": True,
        "categories": [
            _serialize_category(category)
            for category in categories
        ],
        "items": serialized_items,
        "total": len(serialized_items),
        "available": sum(
            1 for item in serialized_items if item["is_active"]
        ),
        "sold_out": sum(
            1 for item in serialized_items if not item["is_active"]
        ),
    }


@router.post("/{item_id}/availability")
async def update_kitchen_item_availability(
    item_id: int,
    data: AvailabilityUpdate,
    kitchen_access: bool = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    del kitchen_access

    result = await db.execute(
        select(Menu_items).where(Menu_items.id == item_id)
    )
    item = result.scalar_one_or_none()

    if item is None:
        raise HTTPException(
            status_code=404,
            detail="Menu item not found",
        )

    item.is_active = bool(data.is_active)

    try:
        await db.commit()
        await db.refresh(item)
    except Exception:
        await db.rollback()
        raise

    return {
        "success": True,
        "message": (
            f"{item.name} is now "
            f"{'Available' if item.is_active else 'Sold Out'}"
        ),
        "item": _serialize_item(item),
    }
