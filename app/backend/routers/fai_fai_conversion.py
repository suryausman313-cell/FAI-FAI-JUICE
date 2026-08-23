"""One-time conversion from the old pizza app to Fai Fai Juice."""

from __future__ import annotations

import hmac
import json
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import MetaData, String, Text, delete, func, inspect, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.categories import Categories
from models.deals import Deals
from models.extras import Extras
from models.menu_items import Menu_items
from models.offers import Offers
from models.restaurant_settings import Restaurant_settings

router = APIRouter(
    prefix="/api/v1/fai-fai-conversion",
    tags=["fai-fai-conversion"],
)

BRAND_NAME = "Fai Fai Juice"
PHONE = "+971569697233"
ADDRESS = "Murbah, Fujairah, UAE"

CATEGORIES = [
    ("Juice", 1),
    ("Party Boxes", 2),
    ("Dessert", 3),
    ("Mojito", 4),
    ("Ice Cream", 5),
    ("Milkshakes", 6),
]

# Talabat shows exact prices only for some products. Products whose price is
# "Price on Selection" are installed in Admin as inactive with price 0.
# Admin can add real sizes/prices and activate them.
FAI_FAI_MENU: list[dict[str, Any]] = [
    # Juice - price on selection
    {"category": "Juice", "name": "Watermelon", "description": "Good source of vitamins A and C, as well as lycopene.", "price": 0, "active": False},
    {"category": "Juice", "name": "Shining", "description": "A sparkling fruit beverage.", "price": 0, "active": False},
    {"category": "Juice", "name": "Orange", "description": "A refreshing source of vitamin C.", "price": 0, "active": False},
    {"category": "Juice", "name": "Fadeetk", "description": "Fresh strawberries, crisp apples and cooling mint.", "price": 0, "active": False},
    {"category": "Juice", "name": "Melon", "description": "Fresh melon juice.", "price": 0, "active": False},
    {"category": "Juice", "name": "Hibiscus", "description": "Refreshing hibiscus drink.", "price": 0, "active": False},
    {"category": "Juice", "name": "Cocktail Juice", "description": "A blend of seasonal fruits.", "price": 0, "active": False},
    {"category": "Juice", "name": "Orange Passion", "description": "Orange and passion fruit beverage.", "price": 0, "active": False},
    {"category": "Juice", "name": "Avocado", "description": "Creamy avocado beverage.", "price": 0, "active": False},
    {"category": "Juice", "name": "Lemon Mint", "description": "Real lemon, fresh mint and a hint of sweetness.", "price": 0, "active": False},
    {"category": "Juice", "name": "Strawberry Smoothie", "description": "Ripe strawberries blended until smooth.", "price": 0, "active": False},
    {"category": "Juice", "name": "Juice Bottle 1.5 L", "description": "Assorted juice bottle. Set flavour and price choices in Admin.", "price": 0, "active": False},

    # Party Boxes
    {"category": "Party Boxes", "name": "Hambana Box 20 Pcs", "description": "A box containing 20 pieces of Hambana.", "price": 167.00, "active": True},
    {"category": "Party Boxes", "name": "Juices Box", "description": "Single juice box. Set selection options and prices in Admin.", "price": 0, "active": False},

    # Dessert
    {"category": "Dessert", "name": "Hambana", "description": "Fai Fai Hambana dessert. Set selection prices in Admin.", "price": 0, "active": False},
    {"category": "Dessert", "name": "Mix Fruit", "description": "A mix of tropical fruits.", "price": 0, "active": False},
    {"category": "Dessert", "name": "Watermelon With Cheese", "description": "Fresh watermelon served with cheese.", "price": 27.00, "active": True},
    {"category": "Dessert", "name": "Acai", "description": "Acai bowl with banana, granola, mixed berries and honey.", "price": 36.99, "active": True},
    {"category": "Dessert", "name": "Smoothie Acai", "description": "Acai berries blended with fruit, yogurt or milk.", "price": 37.00, "active": True},

    # Mojito
    {"category": "Mojito", "name": "Strawberry Mojito", "description": "Fresh strawberries, mint, lime and soda.", "price": 20.50, "active": True},
    {"category": "Mojito", "name": "Blue Mojito", "description": "Lime, mint and soda water.", "price": 20.50, "active": True},
    {"category": "Mojito", "name": "Mojito Green Apple", "description": "Lime, mint, soda and green apple.", "price": 20.50, "active": True},
    {"category": "Mojito", "name": "Mojito Passion Fruit", "description": "Lime, mint, soda and passion fruit.", "price": 20.50, "active": True},

    # Ice Cream - price on selection
    {"category": "Ice Cream", "name": "Caramel Ice Cream", "description": "Sweet and creamy caramel-flavoured ice cream.", "price": 0, "active": False},
    {"category": "Ice Cream", "name": "Lemon Mint Ice Cream", "description": "Ice cream flavoured with lemon and mint.", "price": 0, "active": False},
    {"category": "Ice Cream", "name": "Mix Berry Ice Cream", "description": "Ice cream blended with mixed berries.", "price": 0, "active": False},
    {"category": "Ice Cream", "name": "Strawberry Cheesecake Ice Cream", "description": "Strawberry cheesecake flavoured ice cream.", "price": 0, "active": False},

    # Milkshakes
    {"category": "Milkshakes", "name": "Einstein Milkshake", "description": "Ice cream, milk, chocolate syrup and toppings.", "price": 20.50, "active": True},
    {"category": "Milkshakes", "name": "Nutella Milkshake", "description": "Nutella, ice cream, milk and whipped cream.", "price": 20.50, "active": True},
    {"category": "Milkshakes", "name": "Strawberry Milkshake", "description": "Strawberries, ice cream and milk.", "price": 20.50, "active": True},
    {"category": "Milkshakes", "name": "Chocolate Milkshake", "description": "Cocoa, ice cream and milk.", "price": 20.50, "active": True},
    {"category": "Milkshakes", "name": "Oreo Milkshake", "description": "Oreo cookies, ice cream and milk.", "price": 20.50, "active": True},
    {"category": "Milkshakes", "name": "Kinder Milkshake", "description": "Kinder chocolate, ice cream and milk.", "price": 20.50, "active": True},
]

DB_REPLACEMENTS = [
    ("VITA NAPOLI PIZZA", "FAI FAI JUICE"),
    ("Vita Napoli Pizza", "Fai Fai Juice"),
    ("vita napoli pizza", "fai fai juice"),
    ("VITA NAPOLI", "FAI FAI JUICE"),
    ("Vita Napoli", "Fai Fai Juice"),
    ("vita napoli", "fai fai juice"),
    ("VitaNapoli", "FaiFai"),
    ("vitanapoli", "faifai"),
    ("vita-napoli", "fai-fai-juice"),
    ("+971 54 294 0112", "+971 56 969 7233"),
    ("+971542940112", "+971569697233"),
    ("971542940112", "971569697233"),
    ("+971 52 109 1092", "+971 56 969 7233"),
    ("+971521091092", "+971569697233"),
    ("971521091092", "971569697233"),
]


def verify_conversion_key(key: str) -> None:
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


async def update_receipt_settings(db: AsyncSession, logo_url: str = "") -> bool:
    columns = await table_columns(db, "receipt_settings")
    if not columns:
        return False

    candidates = {
        "restaurant_name": BRAND_NAME,
        "phone": PHONE,
        "address": ADDRESS,
        "header_text": "Fresh juices, desserts and beverages",
        "footer_text": "Thank you for ordering from Fai Fai Juice!",
        "logo_url": logo_url,
    }
    values = {column: value for column, value in candidates.items() if column in columns}
    if not values:
        return False

    connection = await db.connection()

    def reflect_table(sync_connection):
        metadata = MetaData()
        metadata.reflect(bind=sync_connection, only=["receipt_settings"])
        return metadata.tables["receipt_settings"]

    table = await connection.run_sync(reflect_table)
    await db.execute(table.update().values(**values))
    return True


async def scrub_old_brand_from_database(db: AsyncSession) -> dict[str, int]:
    connection = await db.connection()

    def reflect_all(sync_connection):
        metadata = MetaData()
        metadata.reflect(bind=sync_connection)
        return metadata

    metadata = await connection.run_sync(reflect_all)
    touched_tables = 0
    touched_columns = 0

    for table in metadata.sorted_tables:
        table_changed = False
        for column in table.columns:
            if not isinstance(column.type, (String, Text)):
                continue

            expression = column
            for old, new in DB_REPLACEMENTS:
                expression = func.replace(expression, old, new)

            conditions = [column.contains(old) for old, _ in DB_REPLACEMENTS]
            result = await db.execute(
                table.update()
                .where(or_(*conditions))
                .values({column.name: expression})
            )
            if getattr(result, "rowcount", 0):
                table_changed = True
                touched_columns += 1

        if table_changed:
            touched_tables += 1

    return {
        "tables_scrubbed": touched_tables,
        "text_columns_scrubbed": touched_columns,
    }


async def delete_old_menu_completely(db: AsyncSession) -> None:
    """Permanently remove old menu/deal/offer data but preserve orders and sales."""

    bind = db.get_bind()
    dialect = bind.dialect.name if bind is not None else ""

    if dialect == "postgresql":
        # CASCADE also clears dependent menu/deal link tables. Orders are not
        # linked by menu_item_id; their sold items stay preserved in items_json.
        await db.execute(
            text(
                """
                TRUNCATE TABLE
                    deals,
                    offers,
                    extras,
                    menu_items,
                    categories
                RESTART IDENTITY CASCADE
                """
            )
        )
    else:
        await db.execute(delete(Deals))
        await db.execute(delete(Offers))
        await db.execute(delete(Extras))
        await db.execute(delete(Menu_items))
        await db.execute(delete(Categories))

    await db.flush()


async def seed_fai_fai_menu(db: AsyncSession) -> dict[str, int]:
    category_map: dict[str, Categories] = {}

    for name, sort_order in CATEGORIES:
        category = Categories(
            name=name,
            sort_order=sort_order,
            is_active=True,
        )
        db.add(category)
        await db.flush()
        category_map[name] = category

    active_count = 0
    inactive_count = 0

    for index, item in enumerate(FAI_FAI_MENU, start=1):
        price = float(item["price"])
        active = bool(item["active"])
        sizes = [{"name": "Regular", "price": price}]

        menu_item = Menu_items(
            name=item["name"],
            category_id=category_map[item["category"]].id,
        )
        menu_item.description = item["description"]
        menu_item.price_medium = price
        menu_item.price_large = price if price > 0 else None
        menu_item.sizes_json = json.dumps(sizes)
        menu_item.image_url = ""
        menu_item.is_active = active
        menu_item.has_extras = False
        menu_item.is_popular = active and index <= 16
        menu_item.sort_order = index
        db.add(menu_item)

        if active:
            active_count += 1
        else:
            inactive_count += 1

    await db.flush()
    return {
        "categories_created": len(CATEGORIES),
        "menu_items_created": len(FAI_FAI_MENU),
        "active_items": active_count,
        "price_required_items": inactive_count,
    }


async def replace_menu_with_fai_fai(db: AsyncSession) -> dict[str, int]:
    await delete_old_menu_completely(db)
    return await seed_fai_fai_menu(db)


async def conversion_summary(db: AsyncSession) -> dict[str, Any]:
    settings_result = await db.execute(
        select(Restaurant_settings)
        .order_by(Restaurant_settings.id)
        .limit(1)
    )
    settings = settings_result.scalar_one_or_none()

    category_count = len(
        (await db.execute(select(Categories))).scalars().all()
    )
    item_count = len(
        (await db.execute(select(Menu_items))).scalars().all()
    )

    return {
        "restaurant_name": settings.restaurant_name if settings else None,
        "phone": settings.phone if settings else None,
        "address": settings.address if settings else None,
        "categories": category_count,
        "menu_items": item_count,
        "converted": bool(settings and settings.restaurant_name == BRAND_NAME),
    }


@router.get("/status")
async def status(
    key: str = Query(..., min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    verify_conversion_key(key)
    return await conversion_summary(db)


@router.api_route("/apply", methods=["GET", "POST"])
async def apply_conversion(
    key: str = Query(..., min_length=8, max_length=200),
    confirm: str = Query(..., description="Must be FAI-FAI"),
    db: AsyncSession = Depends(get_db),
):
    verify_conversion_key(key)

    if confirm.upper() != "FAI-FAI":
        raise HTTPException(status_code=400, detail="confirm must be FAI-FAI")

    try:
        settings_result = await db.execute(
            select(Restaurant_settings)
            .order_by(Restaurant_settings.id)
            .limit(1)
        )
        settings = settings_result.scalar_one_or_none()

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
            settings.busy_message = (
                "Fai Fai Juice is currently unavailable. "
                "Please try again shortly."
            )

        menu_result = await replace_menu_with_fai_fai(db)
        receipt_updated = await update_receipt_settings(db)
        scrub_result = await scrub_old_brand_from_database(db)

        await db.commit()

        return {
            "success": True,
            "message": (
                "Vita Napoli branding and old menu were removed. "
                "Fai Fai Juice menu was installed. Historical orders "
                "and sales were preserved."
            ),
            "receipt_settings_updated": receipt_updated,
            **menu_result,
            **scrub_result,
            "credentials_note": (
                "Configure INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_PASSWORD "
                "and KITCHEN_PIN in Render Environment"
            ),
            **(await conversion_summary(db)),
        }
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Fai Fai conversion failed: {exc}",
        ) from exc
