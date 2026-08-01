# @File: app/backend/routers/fai_fai_photo_menu_v1.py
# @Desc: One-time editable Fai Fai photo menu import.
#
# This router creates/updates menu categories and items in the existing database.
# After import, Admin > Menu can edit names, pictures, sizes, prices, availability,
# popularity and discounts normally. Nothing runs automatically on startup.

import hmac
import json
import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.categories import Categories
from models.menu_items import Menu_items


router = APIRouter(
    prefix="/api/v1/fai-fai-photo-menu-v1",
    tags=["fai-fai-photo-menu-v1"],
)


CATEGORY_ORDER = ['Fresh Juices', 'Milkshakes', 'Mojitos', 'Acai & Boxes', 'Winter Vibes', 'Ice Cream']

MENU_CATALOG = [{'category': 'Fresh Juices',
  'name': 'Watermelon',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/watermelon.webp',
  'is_popular': True},
 {'category': 'Fresh Juices',
  'name': 'Fai Fai Special',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/fai-fai-special.webp',
  'is_popular': True},
 {'category': 'Fresh Juices',
  'name': 'Shining',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/shining.webp',
  'is_popular': False},
 {'category': 'Fresh Juices',
  'name': 'Cocktail',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/cocktail.webp',
  'is_popular': False},
 {'category': 'Fresh Juices',
  'name': 'Orange',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/orange.webp',
  'is_popular': True},
 {'category': 'Fresh Juices',
  'name': 'Orange Passion Fruit',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/orange-passion-fruit.webp',
  'is_popular': False},
 {'category': 'Fresh Juices',
  'name': 'Strawberry Smoothie',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/strawberry-smoothie.webp',
  'is_popular': False},
 {'category': 'Fresh Juices',
  'name': 'Fadeetk',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/fadeetk.webp',
  'is_popular': False},
 {'category': 'Fresh Juices',
  'name': 'Tamer Hindi',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/tamer-hindi.webp',
  'is_popular': False},
 {'category': 'Fresh Juices',
  'name': 'Grapefruit',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/grapefruit.webp',
  'is_popular': False},
 {'category': 'Fresh Juices',
  'name': 'Qamar Al Deen',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/qamar-al-deen.webp',
  'is_popular': False},
 {'category': 'Fresh Juices',
  'name': 'Avocado',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/avocado.webp',
  'is_popular': True},
 {'category': 'Fresh Juices',
  'name': 'Melon',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/melon.webp',
  'is_popular': False},
 {'category': 'Fresh Juices',
  'name': 'Hibiscus',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/hibiscus.webp',
  'is_popular': False},
 {'category': 'Fresh Juices',
  'name': 'Pomegranate',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/pomegranate.webp',
  'is_popular': False},
 {'category': 'Fresh Juices',
  'name': 'Beetroot',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/beetroot.webp',
  'is_popular': False},
 {'category': 'Fresh Juices',
  'name': 'Lemon Mint',
  'description': 'Freshly prepared. Available in Small, Medium and Large.',
  'sizes': [{'name': 'Small', 'price': 10.0}, {'name': 'Medium', 'price': 12.0}, {'name': 'Large', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/lemon-mint.webp',
  'is_popular': True},
 {'category': 'Milkshakes',
  'name': 'Einstein',
  'description': 'Creamy milkshake. Regular size.',
  'sizes': [{'name': 'Regular', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/einstein.webp',
  'is_popular': False},
 {'category': 'Milkshakes',
  'name': 'Lotus',
  'description': 'Creamy milkshake. Regular size.',
  'sizes': [{'name': 'Regular', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/lotus.webp',
  'is_popular': True},
 {'category': 'Milkshakes',
  'name': 'Nutella',
  'description': 'Creamy milkshake. Regular size.',
  'sizes': [{'name': 'Regular', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/nutella.webp',
  'is_popular': True},
 {'category': 'Milkshakes',
  'name': 'Cerelac',
  'description': 'Creamy milkshake. Regular size.',
  'sizes': [{'name': 'Regular', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/cerelac.webp',
  'is_popular': False},
 {'category': 'Milkshakes',
  'name': 'Strawberry Milkshake',
  'description': 'Creamy milkshake. Regular size.',
  'sizes': [{'name': 'Regular', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/strawberry-milkshake.webp',
  'is_popular': False},
 {'category': 'Milkshakes',
  'name': 'Chocolate Milkshake',
  'description': 'Creamy milkshake. Regular size.',
  'sizes': [{'name': 'Regular', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/chocolate-milkshake.webp',
  'is_popular': False},
 {'category': 'Milkshakes',
  'name': 'Oreo Milkshake',
  'description': 'Creamy milkshake. Regular size.',
  'sizes': [{'name': 'Regular', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/oreo-milkshake.webp',
  'is_popular': True},
 {'category': 'Mojitos',
  'name': 'Passion Fruit Mojito',
  'description': 'Refreshing mojito. Regular size.',
  'sizes': [{'name': 'Regular', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/passion-fruit-mojito.webp',
  'is_popular': True},
 {'category': 'Mojitos',
  'name': 'Lemon Mojito',
  'description': 'Refreshing mojito. Regular size.',
  'sizes': [{'name': 'Regular', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/lemon-mojito.webp',
  'is_popular': True},
 {'category': 'Mojitos',
  'name': 'Green Apple Mojito',
  'description': 'Refreshing mojito. Regular size.',
  'sizes': [{'name': 'Regular', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/green-apple-mojito.webp',
  'is_popular': False},
 {'category': 'Mojitos',
  'name': 'Blue Mojito',
  'description': 'Refreshing mojito. Regular size.',
  'sizes': [{'name': 'Regular', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/blue-mojito.webp',
  'is_popular': False},
 {'category': 'Mojitos',
  'name': 'Strawberry Mojito',
  'description': 'Refreshing mojito. Regular size.',
  'sizes': [{'name': 'Regular', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/strawberry-mojito.webp',
  'is_popular': False},
 {'category': 'Acai & Boxes',
  'name': 'Acai',
  'description': 'Acai bowl with fruit toppings.',
  'sizes': [{'name': 'Regular', 'price': 27.0}],
  'image_url': '/menu/fai-fai-v1/acai.webp',
  'is_popular': True},
 {'category': 'Acai & Boxes',
  'name': 'Smoothie Acai',
  'description': 'Acai smoothie. Regular size.',
  'sizes': [{'name': 'Regular', 'price': 22.0}],
  'image_url': '/menu/fai-fai-v1/smoothie-acai.webp',
  'is_popular': True},
 {'category': 'Acai & Boxes',
  'name': 'Juice Box',
  'description': 'Fai Fai party juice box.',
  'sizes': [{'name': 'Regular', 'price': 135.0}],
  'image_url': '/menu/fai-fai-v1/juice-box.webp',
  'is_popular': False},
 {'category': 'Acai & Boxes',
  'name': 'Mini Juice Box',
  'description': 'Fai Fai mini juice box package.',
  'sizes': [{'name': 'Regular', 'price': 170.0}],
  'image_url': '/menu/fai-fai-v1/mini-juice-box.webp',
  'is_popular': False},
 {'category': 'Winter Vibes',
  'name': 'Hot Chocolate',
  'description': 'Hot chocolate topped for winter.',
  'sizes': [{'name': 'Regular', 'price': 15.0}],
  'image_url': '/menu/fai-fai-v1/hot-chocolate.webp',
  'is_popular': True},
 {'category': 'Winter Vibes',
  'name': 'Shorkhama',
  'description': 'Warm winter drink.',
  'sizes': [{'name': 'Regular', 'price': 10.0}],
  'image_url': '/menu/fai-fai-v1/shorkhama.webp',
  'is_popular': False},
 {'category': 'Winter Vibes',
  'name': 'Sahlab',
  'description': 'Warm sahlab drink.',
  'sizes': [{'name': 'Regular', 'price': 10.0}],
  'image_url': '/menu/fai-fai-v1/sahlab.webp',
  'is_popular': False},
 {'category': 'Winter Vibes',
  'name': 'Mahallabiyah',
  'description': 'Warm winter dessert drink.',
  'sizes': [{'name': 'Regular', 'price': 10.0}],
  'image_url': '/menu/fai-fai-v1/mahallabiyah.webp',
  'is_popular': False},
 {'category': 'Ice Cream',
  'name': 'Passion Fruit Ice Cream',
  'description': 'Passion fruit soft ice cream.',
  'sizes': [{'name': 'Regular', 'price': 10.0}],
  'image_url': '/menu/fai-fai-v1/passion-fruit-ice-cream.webp',
  'is_popular': False},
 {'category': 'Ice Cream',
  'name': 'Vanilla Ice Cream',
  'description': 'Vanilla soft ice cream.',
  'sizes': [{'name': 'Small', 'price': 5.0}, {'name': 'Large', 'price': 10.0}],
  'image_url': '/menu/fai-fai-v1/vanilla-ice-cream.webp',
  'is_popular': True},
 {'category': 'Ice Cream',
  'name': 'Coconut Ice Cream',
  'description': 'Coconut ice cream.',
  'sizes': [{'name': 'Regular', 'price': 10.0}],
  'image_url': '/menu/fai-fai-v1/coconut-ice-cream.webp',
  'is_popular': False},
 {'category': 'Ice Cream',
  'name': 'Mango Ice Cream',
  'description': 'Mango soft ice cream.',
  'sizes': [{'name': 'Small', 'price': 5.0}, {'name': 'Large', 'price': 10.0}],
  'image_url': '/menu/fai-fai-v1/mango-ice-cream.webp',
  'is_popular': True},
 {'category': 'Ice Cream',
  'name': 'Oreo Ice Cream',
  'description': 'Oreo ice cream.',
  'sizes': [{'name': 'Regular', 'price': 10.0}],
  'image_url': '/menu/fai-fai-v1/oreo-ice-cream.webp',
  'is_popular': False},
 {'category': 'Ice Cream',
  'name': 'Caramel Ice Cream',
  'description': 'Caramel ice cream. Source menu shows both scoop options at AED 10.',
  'sizes': [{'name': '1 Scoop', 'price': 10.0}, {'name': '2 Scoops', 'price': 10.0}],
  'image_url': '/menu/fai-fai-v1/caramel-ice-cream.webp',
  'is_popular': False},
 {'category': 'Ice Cream',
  'name': 'Lemon Mint Ice Cream',
  'description': 'Lemon mint ice cream.',
  'sizes': [{'name': '1 Scoop', 'price': 10.0}, {'name': '2 Scoops', 'price': 17.0}],
  'image_url': '/menu/fai-fai-v1/lemon-mint-ice-cream.webp',
  'is_popular': False},
 {'category': 'Ice Cream',
  'name': 'Mix Berry Ice Cream',
  'description': 'Mixed berry ice cream.',
  'sizes': [{'name': '1 Scoop', 'price': 10.0}, {'name': '2 Scoops', 'price': 17.0}],
  'image_url': '/menu/fai-fai-v1/mix-berry-ice-cream.webp',
  'is_popular': False},
 {'category': 'Ice Cream',
  'name': 'Strawberry Cheesecake Ice Cream',
  'description': 'Strawberry cheesecake ice cream.',
  'sizes': [{'name': '1 Scoop', 'price': 10.0}, {'name': '2 Scoops', 'price': 17.0}],
  'image_url': '/menu/fai-fai-v1/strawberry-cheesecake-ice-cream.webp',
  'is_popular': True}]

IMAGE_PREFIX = "/menu/fai-fai-v1/"


def _clean(value: Optional[str]) -> str:
    return (value or "").strip()


def _normal(value: Optional[str]) -> str:
    return _clean(value).casefold()


def _verify_admin_key(
    query_key: Optional[str],
    header_key: Optional[str],
) -> None:
    expected = _clean(os.getenv("FAI_FAI_SETTINGS_KEY"))
    supplied = _clean(query_key) or _clean(header_key)

    if len(expected) < 8:
        raise HTTPException(
            status_code=500,
            detail="FAI_FAI_SETTINGS_KEY is missing in Render Environment",
        )

    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=401,
            detail="FAI_FAI_SETTINGS_KEY is incorrect",
        )


@router.get("/health")
async def health():
    return {
        "success": True,
        "version": "photo-menu-v1",
        "categories": len(CATEGORY_ORDER),
        "items": len(MENU_CATALOG),
        "automatic_startup_import": False,
        "admin_editable_after_import": True,
    }


@router.get("/preview")
async def preview():
    return {
        "success": True,
        "categories": CATEGORY_ORDER,
        "items": [
            {
                "category": item["category"],
                "name": item["name"],
                "sizes": item["sizes"],
                "image_url": item["image_url"],
            }
            for item in MENU_CATALOG
        ],
    }


@router.get("/apply")
async def apply_photo_menu(
    key: Optional[str] = Query(default=None),
    confirm: str = Query(default=""),
    force: bool = Query(default=False),
    hide_old: bool = Query(default=True),
    x_fai_fai_admin_key: Optional[str] = Header(
        default=None,
        alias="X-Fai-Fai-Admin-Key",
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Import the supplied Fai Fai menu into the live database.

    Normal first use:
      /apply?key=YOUR_KEY&confirm=FAI-FAI-MENU

    Safety:
    - Requires FAI_FAI_SETTINGS_KEY.
    - Requires confirm=FAI-FAI-MENU.
    - Does not run automatically.
    - Refuses to overwrite an already imported photo menu unless force=true.
    """

    _verify_admin_key(key, x_fai_fai_admin_key)

    if confirm != "FAI-FAI-MENU":
        raise HTTPException(
            status_code=400,
            detail="Use confirm=FAI-FAI-MENU",
        )

    category_result = await db.execute(select(Categories))
    existing_categories = list(category_result.scalars().all())

    item_result = await db.execute(select(Menu_items))
    existing_items = list(item_result.scalars().all())

    photo_ready_count = sum(
        1
        for item in existing_items
        if _clean(getattr(item, "image_url", "")).startswith(IMAGE_PREFIX)
    )

    if photo_ready_count >= len(MENU_CATALOG) and not force:
        return {
            "success": True,
            "already_applied": True,
            "message": (
                "Photo menu is already installed. No database values were changed, "
                "so later Admin edits are preserved. Use force=true only to restore "
                "the original imported menu."
            ),
            "photo_items_found": photo_ready_count,
            "expected_items": len(MENU_CATALOG),
        }

    categories_by_name = {
        _normal(category.name): category
        for category in existing_categories
    }

    category_ids = {}
    created_categories = 0
    updated_categories = 0

    for index, category_name in enumerate(CATEGORY_ORDER, start=1):
        category = categories_by_name.get(_normal(category_name))

        if category is None:
            category = Categories(
                name=category_name,
                sort_order=index,
                is_active=True,
            )
            db.add(category)
            await db.flush()
            existing_categories.append(category)
            categories_by_name[_normal(category_name)] = category
            created_categories += 1
        else:
            category.name = category_name
            category.sort_order = index
            category.is_active = True
            updated_categories += 1

        category_ids[category_name] = category.id

    if hide_old:
        target_category_names = {_normal(name) for name in CATEGORY_ORDER}
        for category in existing_categories:
            if _normal(category.name) not in target_category_names:
                category.is_active = False

    # Rebuild lookup maps after category IDs are available.
    items_by_category_and_name = {
        (int(item.category_id), _normal(item.name)): item
        for item in existing_items
    }

    items_by_name = {}
    for item in existing_items:
        items_by_name.setdefault(_normal(item.name), []).append(item)

    target_item_ids = set()
    created_items = 0
    updated_items = 0

    for sort_order, source in enumerate(MENU_CATALOG, start=1):
        category_id = category_ids[source["category"]]
        item_key = (category_id, _normal(source["name"]))
        item = items_by_category_and_name.get(item_key)

        # Reuse a unique old item with the same name even if it was in another
        # category. This avoids unnecessary duplicates after the earlier menu conversion.
        if item is None:
            same_name = items_by_name.get(_normal(source["name"]), [])
            if len(same_name) == 1:
                item = same_name[0]

        sizes = [
            {
                "name": str(size["name"]).strip(),
                "price": float(size["price"]),
            }
            for size in source["sizes"]
        ]

        first_price = float(sizes[0]["price"])
        last_price = float(sizes[-1]["price"])

        if item is None:
            item = Menu_items(
                category_id=category_id,
                name=source["name"],
                description=source["description"],
                price_medium=first_price,
                price_large=last_price,
                sizes_json=json.dumps(sizes, ensure_ascii=False),
                image_url=source["image_url"],
                is_active=True,
                has_extras=False,
                is_popular=bool(source.get("is_popular", False)),
                sort_order=sort_order,
            )
            db.add(item)
            await db.flush()
            existing_items.append(item)
            created_items += 1
        else:
            item.category_id = category_id
            item.name = source["name"]
            item.description = source["description"]
            item.price_medium = first_price
            item.price_large = last_price
            item.sizes_json = json.dumps(sizes, ensure_ascii=False)
            item.image_url = source["image_url"]
            item.is_active = True
            item.has_extras = False
            item.is_popular = bool(source.get("is_popular", False))
            item.sort_order = sort_order
            # Discount fields are intentionally untouched, so any discount
            # already configured by Admin is not erased.
            updated_items += 1

        target_item_ids.add(int(item.id))

    hidden_old_items = 0
    if hide_old:
        for item in existing_items:
            if int(item.id) not in target_item_ids and bool(item.is_active):
                item.is_active = False
                hidden_old_items += 1

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return {
        "success": True,
        "already_applied": False,
        "message": "Fai Fai photo menu installed. Admin can now edit every item.",
        "categories": {
            "total": len(CATEGORY_ORDER),
            "created": created_categories,
            "updated": updated_categories,
        },
        "items": {
            "total": len(MENU_CATALOG),
            "created": created_items,
            "updated": updated_items,
            "old_items_hidden": hidden_old_items,
        },
        "prices_source_note": (
            "Caramel Ice Cream is kept exactly as supplied: 1 Scoop AED 10 "
            "and 2 Scoops AED 10. Admin can edit it later."
        ),
        "next": [
            "Open Admin > Menu",
            "Check categories, pictures and size prices",
            "Edit any name, price, picture or availability normally",
            "Do not call apply again after making Admin edits",
        ],
    }
