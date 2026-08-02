"""Public homepage data that must be identical on every customer device."""
import json
import logging
from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.menu_items import Menu_items
from models.orders import Orders
from models.restaurant_settings import Restaurant_settings

router = APIRouter(prefix="/api/v1/public", tags=["public-home"])
logger = logging.getLogger(__name__)


def menu_item_dict(item: Menu_items, sold_count: int = 0) -> dict:
    return {
        "id": item.id,
        "category_id": item.category_id,
        "name": item.name,
        "description": item.description or "",
        "price_medium": item.price_medium or 0,
        "price_large": item.price_large or 0,
        "sizes_json": item.sizes_json or "",
        "image_url": item.image_url or "",
        "is_active": bool(item.is_active),
        "is_popular": bool(item.is_popular),
        "has_extras": bool(item.has_extras),
        "discount_enabled": bool(item.discount_enabled),
        "discount_type": item.discount_type or "percentage",
        "discount_value": item.discount_value or 0,
        "discount_start_at": item.discount_start_at,
        "discount_end_at": item.discount_end_at,
        "sort_order": item.sort_order or 0,
        "sold_count": sold_count,
    }


@router.get("/popular-items")
async def popular_items(db: AsyncSession = Depends(get_db)):
    """Combine Admin manual picks with actual completed-order sales ranking."""
    try:
        settings_result = await db.execute(select(Restaurant_settings).limit(1))
        settings = settings_result.scalar_one_or_none()
        limit = max(2, min(12, int(getattr(settings, "popular_max_items", 6) or 6)))
        manual_enabled = getattr(settings, "popular_manual_enabled", True) is not False
        auto_enabled = getattr(settings, "popular_auto_enabled", True) is not False

        menu_result = await db.execute(
            select(Menu_items)
            .where(Menu_items.is_active == True)
            .order_by(Menu_items.sort_order, Menu_items.id)
        )
        menu_items = list(menu_result.scalars().all())
        by_id = {item.id: item for item in menu_items}
        by_name = {str(item.name or "").strip().casefold(): item for item in menu_items}

        counts: Counter[int] = Counter()
        if auto_enabled and menu_items:
            order_result = await db.execute(
                select(Orders.items_json)
                .where(Orders.status == "completed")
                .order_by(desc(Orders.created_at))
                .limit(5000)
            )
            for (items_json,) in order_result.all():
                try:
                    rows = json.loads(items_json or "[]")
                except Exception:
                    continue
                if not isinstance(rows, list):
                    continue
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    quantity = max(1, int(row.get("quantity") or 1))
                    raw_id = row.get("menu_item_id") or row.get("item_id")
                    item = None
                    try:
                        item = by_id.get(int(raw_id)) if raw_id is not None else None
                    except (TypeError, ValueError):
                        item = None
                    if item is None:
                        name = str(row.get("name") or "").strip().casefold()
                        item = by_name.get(name)
                    if item is not None:
                        counts[item.id] += quantity

        selected = []
        selected_ids = set()
        if manual_enabled:
            for item in menu_items:
                if bool(item.is_popular) and item.id not in selected_ids:
                    selected.append(item)
                    selected_ids.add(item.id)
                    if len(selected) >= limit:
                        break

        if auto_enabled and len(selected) < limit:
            ranked = sorted(
                menu_items,
                key=lambda item: (-counts.get(item.id, 0), item.sort_order or 0, item.id),
            )
            for item in ranked:
                if counts.get(item.id, 0) <= 0 or item.id in selected_ids:
                    continue
                selected.append(item)
                selected_ids.add(item.id)
                if len(selected) >= limit:
                    break

        # A new shop may have no completed sales yet. Keep homepage useful.
        if len(selected) < limit:
            for item in menu_items:
                if item.id in selected_ids:
                    continue
                selected.append(item)
                selected_ids.add(item.id)
                if len(selected) >= limit:
                    break

        return {
            "items": [menu_item_dict(item, counts.get(item.id, 0)) for item in selected],
            "manual_enabled": manual_enabled,
            "auto_enabled": auto_enabled,
            "limit": limit,
        }
    except Exception as exc:
        logger.exception("Failed to build public popular items")
        # Do not blank the customer homepage if ranking fails.
        return {"items": [], "manual_enabled": True, "auto_enabled": True, "limit": 6, "error": str(exc)}
