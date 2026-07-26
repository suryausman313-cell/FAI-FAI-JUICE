# @File: backend/routers/deals_public.py
# @Desc: Public deals API - enriches deals with available menu items per category
import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from models.deals import Deals
from models.categories import Categories
from models.menu_items import Menu_items

router = APIRouter(prefix="/api/v1/deals", tags=["deals-public"])
logger = logging.getLogger(__name__)


@router.get("/public")
async def get_public_deals(db: AsyncSession = Depends(get_db)):
    """Get all active deals with their categories and available menu items (no auth required)"""
    try:
        result = await db.execute(
            select(Deals).where(Deals.is_active == True).order_by(Deals.id.desc())
        )
        deals = result.scalars().all()

        # Load all active categories and menu items
        cats_result = await db.execute(select(Categories).where(Categories.is_active == True))
        all_categories = {c.id: c for c in cats_result.scalars().all()}

        items_result = await db.execute(select(Menu_items).where(Menu_items.is_active == True))
        all_items = items_result.scalars().all()

        items_by_category: dict = {}
        for item in all_items:
            cat_id = item.category_id
            if cat_id not in items_by_category:
                items_by_category[cat_id] = []
            items_by_category[cat_id].append({
                "id": item.id,
                "name": item.name,
                "description": item.description or "",
                "price": item.price_medium or item.price_large or 0,
                "image_url": item.image_url or "",
            })

        response_deals = []
        for deal in deals:
            try:
                categories_data = json.loads(deal.categories_json) if deal.categories_json else []
            except (json.JSONDecodeError, TypeError):
                categories_data = []

            enriched_categories = []
            for cat_entry in categories_data:
                cat_id = cat_entry.get("category_id")
                cat_obj = all_categories.get(cat_id)
                enriched_categories.append({
                    "category_id": cat_id,
                    "category_name": cat_entry.get("category_name", cat_obj.name if cat_obj else "Unknown"),
                    "required_quantity": cat_entry.get("required_quantity", 1),
                    "display_order": cat_entry.get("display_order", 0),
                    "available_items": items_by_category.get(cat_id, []),
                })

            # Calculate discounted price
            original_price = deal.price
            discount_type = deal.discount_type or "none"
            discount_value = deal.discount_value or 0
            discounted_price = original_price

            if discount_type == "percentage" and discount_value > 0:
                discounted_price = original_price * (1 - discount_value / 100)
            elif discount_type == "flat" and discount_value > 0:
                discounted_price = max(0, original_price - discount_value)

            response_deals.append({
                "id": deal.id,
                "name": deal.name,
                "price": original_price,
                "discounted_price": round(discounted_price, 2) if discount_type != "none" else None,
                "discount_type": discount_type,
                "discount_value": discount_value,
                "image_url": deal.image_url or "",
                "description": deal.description or "",
                "categories": enriched_categories,
            })

        return {"items": response_deals}
    except Exception as e:
        logger.error(f"Failed to get public deals: {e}")
        raise HTTPException(status_code=500, detail=str(e))