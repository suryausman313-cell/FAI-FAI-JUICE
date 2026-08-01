"""One-time protected conversion of the existing Vita Napoli database to Fai Fai Juice."""

from __future__ import annotations

import hmac
import json
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import inspect, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.categories import Categories
from models.deals import Deals
from models.extras import Extras
from models.menu_items import Menu_items
from models.offers import Offers
from models.restaurant_settings import Restaurant_settings

router = APIRouter(prefix="/api/v1/fai-fai-conversion", tags=["fai-fai-conversion"])

BRAND_NAME = "Fai Fai Juice"
PHONE = "+971521091092"
ADDRESS = "Murbah, Fujairah, UAE"

CATEGORIES = [
    ("Juice", 1),
    ("Party Boxes", 2),
    ("Dessert", 3),
    ("Mojito", 4),
    ("Ice Cream", 5),
    ("Milkshakes", 6),
]

# Items with publicly listed fixed prices are activated immediately.
# "Price on Selection" products are added inactive so Admin can enter exact sizes/prices first.
STARTER_ITEMS: list[dict[str, Any]] = [
    {"category": "Party Boxes", "name": "Hambana Box 20 Pcs", "description": "A box containing 20 pieces of Hambana.", "price": 167.00, "active": True},
    {"category": "Dessert", "name": "Acai", "description": "Creamy acai bowl topped with banana, granola, berries and honey.", "price": 36.99, "active": True},
    {"category": "Dessert", "name": "Smoothie Acai", "description": "Acai berries blended with fruits and yogurt or milk.", "price": 37.00, "active": True},
    {"category": "Dessert", "name": "Watermelon With Cheese", "description": "Fresh watermelon served with cheese.", "price": 27.00, "active": True},
    {"category": "Mojito", "name": "Strawberry Mojito", "description": "Fresh strawberries, mint, lime and soda.", "price": 20.50, "active": True},
    {"category": "Mojito", "name": "Blue Mojito", "description": "Lime, mint and soda water.", "price": 20.50, "active": True},
    {"category": "Mojito", "name": "Mojito Green Apple", "description": "Lime, mint, soda and green apple.", "price": 20.50, "active": True},
    {"category": "Mojito", "name": "Mojito Passion Fruit", "description": "Lime, mint, soda and passion fruit.", "price": 20.50, "active": True},
    {"category": "Milkshakes", "name": "Einstein Milkshake", "description": "Ice cream, milk, chocolate syrup and toppings.", "price": 20.50, "active": True},
    {"category": "Milkshakes", "name": "Nutella Milkshake", "description": "Nutella, ice cream, milk and whipped cream.", "price": 20.50, "active": True},
    {"category": "Milkshakes", "name": "Strawberry Milkshake", "description": "Strawberries, ice cream and milk.", "price": 20.50, "active": True},
    {"category": "Milkshakes", "name": "Chocolate Milkshake", "description": "Cocoa, ice cream and milk.", "price": 20.50, "active": True},
    {"category": "Milkshakes", "name": "Oreo Milkshake", "description": "Oreo cookies, ice cream and milk.", "price": 20.50, "active": True},
    {"category": "Milkshakes", "name": "Kinder Milkshake", "description": "Kinder chocolate, ice cream and milk.", "price": 20.50, "active": True},
    {"category": "Juice", "name": "Watermelon", "description": "Set sizes and prices in Admin, then activate.", "price": 0, "active": False},
    {"category": "Juice", "name": "Orange", "description": "Set sizes and prices in Admin, then activate.", "price": 0, "active": False},
    {"category": "Juice", "name": "Avocado", "description": "Set sizes and prices in Admin, then activate.", "price": 0, "active": False},
    {"category": "Juice", "name": "Lemon Mint", "description": "Set sizes and prices in Admin, then activate.", "price": 0, "active": False},
    {"category": "Juice", "name": "Cocktail Juice", "description": "Set sizes and prices in Admin, then activate.", "price": 0, "active": False},
    {"category": "Juice", "name": "Juice Bottle 1.5 L", "description": "Set price in Admin, then activate.", "price": 0, "active": False},
    {"category": "Dessert", "name": "Hambana", "description": "Set sizes and prices in Admin, then activate.", "price": 0, "active": False},
    {"category": "Dessert", "name": "Mix Fruit", "description": "Set sizes and prices in Admin, then activate.", "price": 0, "active": False},
    {"category": "Ice Cream", "name": "Caramel Ice Cream", "description": "Set sizes and prices in Admin, then activate.", "price": 0, "active": False},
    {"category": "Ice Cream", "name": "Lemon Mint Ice Cream", "description": "Set sizes and prices in Admin, then activate.", "price": 0, "active": False},
    {"category": "Ice Cream", "name": "Mix Berry Ice Cream", "description": "Set sizes and prices in Admin, then activate.", "price": 0, "active": False},
    {"category": "Ice Cream", "name": "Strawberry Cheesecake Ice Cream", "description": "Set sizes and prices in Admin, then activate.", "price": 0, "active": False},
]


def verify_key(key: str) -> None:
    expected = os.getenv("FAI_FAI_CONVERSION_KEY", "").strip()
    if len(expected) < 8:
        raise HTTPException(
            status_code=503,
            detail="Set FAI_FAI_CONVERSION_KEY in Render Environment first.",
        )
    if not hmac.compare_digest(key, expected):
        raise HTTPException(status_code=403, detail="Invalid conversion key")


async def table_columns(db: AsyncSession, table_name: str) -> set[str]:
    connection = await db.connection()

    def inspect_columns(sync_connection):
        inspector = inspect(sync_connection)
        if table_name not in inspector.get_table_names():
            return set()
        return {column["name"] for column in inspector.get_columns(table_name)}

    return await connection.run_sync(inspect_columns)


async def update_receipt_settings(db: AsyncSession) -> bool:
    columns = await table_columns(db, "receipt_settings")
    if not columns:
        return False

    values: dict[str, Any] = {}
    candidates = {
        "restaurant_name": BRAND_NAME,
        "phone": PHONE,
        "address": ADDRESS,
        "header_text": "Fresh juices, desserts and beverages",
        "footer_text": "Thank you for ordering from Fai Fai Juice!",
        "logo_url": "",
    }
    for column, value in candidates.items():
        if column in columns:
            values[column] = value

    if not values:
        return False

    from sqlalchemy import MetaData, Table

    connection = await db.connection()

    def reflect_table(sync_connection):
        return Table("receipt_settings", MetaData(), autoload_with=sync_connection)

    table = await connection.run_sync(reflect_table)
    await db.execute(table.update().values(**values))
    return True


async def get_or_create_category(
    db: AsyncSession,
    name: str,
    sort_order: int,
) -> Categories:
    result = await db.execute(select(Categories).where(Categories.name == name).limit(1))
    category = result.scalar_one_or_none()

    if category is None:
        category = Categories(name=name, sort_order=sort_order, is_active=True)
        db.add(category)
        await db.flush()
    else:
        category.sort_order = sort_order
        category.is_active = True

    return category


async def seed_item(
    db: AsyncSession,
    category: Categories,
    item: dict[str, Any],
    sort_order: int,
) -> Menu_items:
    result = await db.execute(
        select(Menu_items)
        .where(Menu_items.name == item["name"])
        .limit(1)
    )
    menu_item = result.scalar_one_or_none()
    price = float(item["price"])
    sizes = [{"name": "Regular", "price": price}]

    if menu_item is None:
        menu_item = Menu_items(name=item["name"], category_id=category.id)
        db.add(menu_item)

    menu_item.category_id = category.id
    menu_item.description = item["description"]
    menu_item.price_medium = price
    menu_item.price_large = None
    menu_item.sizes_json = json.dumps(sizes)
    menu_item.image_url = ""
    menu_item.is_active = bool(item["active"])
    menu_item.has_extras = False
    menu_item.is_popular = bool(item["active"] and sort_order <= 12)
    menu_item.sort_order = sort_order
    return menu_item


async def conversion_summary(db: AsyncSession) -> dict[str, Any]:
    settings_result = await db.execute(
        select(Restaurant_settings).order_by(Restaurant_settings.id).limit(1)
    )
    settings = settings_result.scalar_one_or_none()

    active_categories = (
        await db.execute(select(Categories).where(Categories.is_active.is_(True)))
    ).scalars().all()
    active_items = (
        await db.execute(select(Menu_items).where(Menu_items.is_active.is_(True)))
    ).scalars().all()

    return {
        "restaurant_name": settings.restaurant_name if settings else None,
        "phone": settings.phone if settings else None,
        "address": settings.address if settings else None,
        "active_categories": len(active_categories),
        "active_menu_items": len(active_items),
        "converted": bool(settings and settings.restaurant_name == BRAND_NAME),
    }


@router.get("/status")
async def status(
    key: str = Query(..., min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    verify_key(key)
    return await conversion_summary(db)


@router.api_route("/apply", methods=["GET", "POST"])
async def apply_conversion(
    key: str = Query(..., min_length=8, max_length=200),
    confirm: str = Query(..., description="Must be FAI-FAI"),
    force: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    verify_key(key)
    if confirm.upper() != "FAI-FAI":
        raise HTTPException(status_code=400, detail="confirm must be FAI-FAI")

    settings_result = await db.execute(
        select(Restaurant_settings).order_by(Restaurant_settings.id).limit(1)
    )
    settings = settings_result.scalar_one_or_none()

    if settings and settings.restaurant_name == BRAND_NAME and not force:
        return {
            "success": True,
            "already_applied": True,
            "message": "Fai Fai conversion was already applied. Use force=true only if you intentionally want to reset the menu again.",
            **(await conversion_summary(db)),
        }

    if settings is None:
        settings = Restaurant_settings(
            restaurant_name=BRAND_NAME,
            phone=PHONE,
            address=ADDRESS,
            opening_hours="",
            restaurant_status="closed",
            logo_url="",
            blog_enabled=False,
        )
        db.add(settings)
    else:
        settings.restaurant_name = BRAND_NAME
        settings.phone = PHONE
        settings.address = ADDRESS
        settings.logo_url = ""
        settings.blog_enabled = False
        settings.restaurant_status = "closed"
        settings.busy_message = "Fai Fai Juice is currently unavailable. Please try again shortly."

    # Preserve all historical orders, customers, finance and rider records.
    # Only old shop-facing menu/promotions are disabled.
    await db.execute(update(Menu_items).values(is_active=False, is_popular=False))
    await db.execute(update(Categories).values(is_active=False))
    await db.execute(update(Extras).values(is_active=False))
    await db.execute(update(Offers).values(is_active=False))
    await db.execute(update(Deals).values(is_active=False))

    category_map: dict[str, Categories] = {}
    for name, sort_order in CATEGORIES:
        category_map[name] = await get_or_create_category(db, name, sort_order)

    for index, item in enumerate(STARTER_ITEMS, start=1):
        await seed_item(db, category_map[item["category"]], item, index)

    await db.flush()
    receipt_updated = await update_receipt_settings(db)
    await db.commit()

    return {
        "success": True,
        "message": "Existing app converted to Fai Fai Juice. Old orders and finance were preserved. Shop is CLOSED until you verify menu/settings and open it from Admin.",
        "receipt_settings_updated": receipt_updated,
        "admin_username": "faifaiadmin",
        "admin_password": "FaiFai@2026",
        "kitchen_pin": "1122",
        **(await conversion_summary(db)),
    }
