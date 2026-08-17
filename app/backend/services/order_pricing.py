"""Server-side order pricing and cart validation.

The browser is treated as untrusted.  Menu prices, item discounts, extras and
meal/deal prices are rebuilt from the database before an order is accepted.
"""

from __future__ import annotations

import json
import math
from datetime import datetime
from typing import Any, Iterable
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.deals import Deals
from models.extras import Extras
from models.menu_items import Menu_items

DUBAI_TZ = ZoneInfo("Asia/Dubai")


def money(value: Any) -> float:
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        number = 0.0
    if not math.isfinite(number):
        return 0.0
    return round(number + 1e-9, 2)


def _parse_json_list(raw: Any) -> list[Any]:
    if isinstance(raw, list):
        return raw
    if not isinstance(raw, str) or not raw.strip():
        return []
    try:
        value = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []
    return value if isinstance(value, list) else []


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


def _parse_discount_time(value: Any) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=DUBAI_TZ)
    return parsed.astimezone(DUBAI_TZ)


def item_discount_price(menu_item: Menu_items, base_price: float, now: datetime | None = None) -> tuple[float, float, str]:
    """Return final base price, saving, and display label for an item."""
    original = max(0.0, money(base_price))
    if not bool(getattr(menu_item, "discount_enabled", False)):
        return original, 0.0, ""

    now = now or datetime.now(DUBAI_TZ)
    start = _parse_discount_time(getattr(menu_item, "discount_start_at", ""))
    end = _parse_discount_time(getattr(menu_item, "discount_end_at", ""))
    if start and now < start:
        return original, 0.0, ""
    if end and now > end:
        return original, 0.0, ""

    value = max(0.0, money(getattr(menu_item, "discount_value", 0)))
    if value <= 0 or original <= 0:
        return original, 0.0, ""

    discount_type = str(getattr(menu_item, "discount_type", "percentage") or "percentage").lower().strip()
    if discount_type == "fixed":
        saving = min(original, value)
        label = f"AED {saving:.2f} OFF"
    else:
        percentage = min(100.0, value)
        saving = min(original, original * percentage / 100.0)
        label = f"{percentage:g}% OFF"

    saving = money(saving)
    return money(max(0.0, original - saving)), saving, label


def menu_item_sizes(menu_item: Menu_items) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for entry in _parse_json_list(getattr(menu_item, "sizes_json", "")):
        if not isinstance(entry, dict):
            continue
        name = _normalize_text(entry.get("name"))
        price = money(entry.get("price"))
        if name and price >= 0:
            result.append({"name": name, "price": price})

    if result:
        return result

    medium = money(getattr(menu_item, "price_medium", 0))
    large = money(getattr(menu_item, "price_large", 0))
    if medium > 0:
        result.append({"name": "Medium", "price": medium})
    if large > 0 and (not result or large != medium):
        result.append({"name": "Large", "price": large})
    if not result:
        fallback = max(medium, large, 0.0)
        result.append({"name": "Regular", "price": fallback})
    return result


def _match_size(menu_item: Menu_items, requested_size: Any) -> dict[str, Any]:
    sizes = menu_item_sizes(menu_item)
    requested = _normalize_text(requested_size).casefold()
    if requested:
        for size in sizes:
            if str(size["name"]).casefold() == requested:
                return size
    if len(sizes) == 1:
        return sizes[0]
    raise HTTPException(
        status_code=400,
        detail=f"Please reselect a valid size for {menu_item.name}.",
    )


def _item_specific_extras(menu_item: Menu_items) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for index, entry in enumerate(_parse_json_list(getattr(menu_item, "extras_json", ""))):
        if not isinstance(entry, dict):
            continue
        name = _normalize_text(entry.get("name"))
        if not name:
            continue
        result.append(
            {
                "id": -(index + 1),
                "name": name,
                "price": max(0.0, money(entry.get("price"))),
            }
        )
    return result


def _requested_extra_keys(value: Any) -> list[tuple[int | None, str]]:
    if not isinstance(value, list):
        return []
    result: list[tuple[int | None, str]] = []
    for entry in value:
        if isinstance(entry, dict):
            raw_id = entry.get("id")
            try:
                extra_id = int(raw_id) if raw_id is not None else None
            except (TypeError, ValueError):
                extra_id = None
            name = _normalize_text(entry.get("name"))
        else:
            extra_id = None
            name = _normalize_text(entry)
        if name or extra_id is not None:
            result.append((extra_id, name))
    return result


def _validate_quantity(value: Any, label: str) -> int:
    if isinstance(value, bool):
        raise HTTPException(status_code=400, detail=f"Invalid quantity for {label}")
    try:
        quantity = int(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"Invalid quantity for {label}")
    if quantity < 1 or quantity > 20:
        raise HTTPException(status_code=400, detail=f"Quantity for {label} must be between 1 and 20")
    return quantity


def _deal_price(deal: Deals) -> float:
    price = max(0.0, money(deal.price))
    kind = str(deal.discount_type or "none").lower().strip()
    value = max(0.0, money(deal.discount_value))
    if kind == "percentage" and value > 0:
        return money(price * (1 - min(value, 100.0) / 100.0))
    if kind in {"flat", "fixed"} and value > 0:
        return money(max(0.0, price - value))
    return price


def _selection_groups(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    return [entry for entry in raw if isinstance(entry, dict)]


async def validate_and_price_order_items(
    db: AsyncSession,
    raw_items_json: str,
) -> tuple[float, list[dict[str, Any]]]:
    """Validate a customer cart and return (subtotal, canonical items)."""
    try:
        raw_items = json.loads(raw_items_json)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid order items format")

    if not isinstance(raw_items, list) or not raw_items:
        raise HTTPException(status_code=400, detail="Order must contain at least one item")
    if len(raw_items) > 50:
        raise HTTPException(status_code=400, detail="Order cannot contain more than 50 cart lines")

    menu_rows = (
        await db.execute(select(Menu_items).where(Menu_items.is_active.is_(True)))
    ).scalars().all()
    if not menu_rows:
        raise HTTPException(status_code=503, detail="Menu is not available yet. Please try again shortly.")

    menu_by_id = {int(item.id): item for item in menu_rows}
    menu_by_name = {str(item.name or "").strip().casefold(): item for item in menu_rows if item.name}

    extras_rows = (
        await db.execute(select(Extras).where(Extras.is_active.is_(True)))
    ).scalars().all()
    global_extras = [
        {"id": int(extra.id), "name": str(extra.name or ""), "price": max(0.0, money(extra.price))}
        for extra in extras_rows
        if str(extra.name or "").strip()
    ]

    deal_rows = (
        await db.execute(select(Deals).where(Deals.is_active.is_(True)))
    ).scalars().all()
    deals_by_id = {int(deal.id): deal for deal in deal_rows}

    canonical: list[dict[str, Any]] = []
    subtotal = 0.0
    now = datetime.now(DUBAI_TZ)

    for raw in raw_items:
        if not isinstance(raw, dict):
            raise HTTPException(status_code=400, detail="Invalid cart item")

        is_deal = bool(raw.get("is_deal") or raw.get("isDeal"))
        if is_deal:
            try:
                deal_id = int(raw.get("deal_id") or raw.get("dealId") or raw.get("menu_item_id"))
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="Invalid deal")
            deal = deals_by_id.get(deal_id)
            if not deal:
                raise HTTPException(status_code=400, detail="A deal in your cart is no longer available. Please refresh your cart.")

            quantity = _validate_quantity(raw.get("quantity", 1), deal.name)
            config = _parse_json_list(deal.categories_json)
            selections = _selection_groups(raw.get("deal_selected_items") or raw.get("dealSelectedItems"))
            if not config or len(selections) != len(config):
                raise HTTPException(status_code=400, detail=f"Please reselect the items for {deal.name}.")

            canonical_groups: list[dict[str, Any]] = []
            flat_selected_names: list[str] = []
            for index, category_rule in enumerate(config):
                if not isinstance(category_rule, dict):
                    raise HTTPException(status_code=400, detail=f"{deal.name} has an invalid setup. Please contact the shop.")
                try:
                    category_id = int(category_rule.get("category_id"))
                    required = int(category_rule.get("required_quantity", 1))
                except (TypeError, ValueError):
                    raise HTTPException(status_code=400, detail=f"{deal.name} has an invalid setup. Please contact the shop.")
                if required < 1 or required > 20:
                    raise HTTPException(status_code=400, detail=f"{deal.name} has an invalid quantity setup.")

                selected_group = selections[index]
                selected_items = selected_group.get("items")
                if not isinstance(selected_items, list) or len(selected_items) != required:
                    raise HTTPException(status_code=400, detail=f"Please choose exactly {required} item(s) for {deal.name}.")

                canonical_selected: list[dict[str, Any]] = []
                seen_ids: set[int] = set()
                for selected in selected_items:
                    if not isinstance(selected, dict):
                        raise HTTPException(status_code=400, detail=f"Invalid selection in {deal.name}.")
                    try:
                        item_id = int(selected.get("id"))
                    except (TypeError, ValueError):
                        raise HTTPException(status_code=400, detail=f"Invalid selection in {deal.name}.")
                    if item_id in seen_ids:
                        raise HTTPException(status_code=400, detail=f"Duplicate item selected in {deal.name}.")
                    seen_ids.add(item_id)
                    selected_menu_item = menu_by_id.get(item_id)
                    if not selected_menu_item or int(selected_menu_item.category_id) != category_id:
                        raise HTTPException(status_code=400, detail=f"A selected item in {deal.name} is no longer available.")
                    selected_name = str(selected_menu_item.name or "")
                    canonical_selected.append({"id": item_id, "name": selected_name})
                    flat_selected_names.append(selected_name)

                canonical_groups.append(
                    {
                        "category_id": category_id,
                        "category_name": _normalize_text(category_rule.get("category_name")) or _normalize_text(selected_group.get("categoryName")),
                        "items": canonical_selected,
                    }
                )

            unit_price = _deal_price(deal)
            line_total = money(unit_price * quantity)
            subtotal = money(subtotal + line_total)
            canonical.append(
                {
                    "is_deal": True,
                    "deal_id": deal_id,
                    "menu_item_id": None,
                    "name": str(deal.name or "Deal"),
                    "size": "Deal",
                    "quantity": quantity,
                    "extras": flat_selected_names,
                    "deal_selected_items": canonical_groups,
                    "unit_price": unit_price,
                    "price": line_total,
                    "totalPrice": line_total,
                    "original_price": money(float(deal.price or 0) * quantity),
                    "item_discount_amount": money(max(0.0, float(deal.price or 0) * quantity - line_total)),
                    "item_discount_label": "Deal price",
                }
            )
            continue

        raw_id = raw.get("menu_item_id")
        menu_item = None
        try:
            if raw_id is not None:
                menu_item = menu_by_id.get(int(raw_id))
        except (TypeError, ValueError):
            menu_item = None
        if menu_item is None:
            menu_item = menu_by_name.get(_normalize_text(raw.get("name")).casefold())
        if menu_item is None:
            raise HTTPException(status_code=400, detail="An item in your cart is no longer available. Please refresh your cart.")

        quantity = _validate_quantity(raw.get("quantity", 1), menu_item.name)
        size = _match_size(menu_item, raw.get("size"))
        base_original = max(0.0, money(size["price"]))
        base_final, saving_each, discount_label = item_discount_price(menu_item, base_original, now)

        requested_extras = _requested_extra_keys(raw.get("extras"))
        if requested_extras and not bool(menu_item.has_extras):
            raise HTTPException(status_code=400, detail=f"Extras are not available for {menu_item.name}.")

        allowed_extras = _item_specific_extras(menu_item) or global_extras
        by_id = {int(extra["id"]): extra for extra in allowed_extras}
        by_name = {str(extra["name"]).strip().casefold(): extra for extra in allowed_extras}
        chosen_extras: list[dict[str, Any]] = []
        seen_extra_keys: set[str] = set()
        for requested_id, requested_name in requested_extras:
            extra = by_id.get(requested_id) if requested_id is not None else None
            if extra is None and requested_name:
                extra = by_name.get(requested_name.casefold())
            if extra is None:
                raise HTTPException(status_code=400, detail=f"An extra selected for {menu_item.name} is no longer available.")
            key = str(extra["name"]).strip().casefold()
            if key in seen_extra_keys:
                raise HTTPException(status_code=400, detail=f"Duplicate extra selected for {menu_item.name}.")
            seen_extra_keys.add(key)
            chosen_extras.append(extra)

        extras_each = money(sum(float(extra["price"]) for extra in chosen_extras))
        unit_final = money(base_final + extras_each)
        unit_original = money(base_original + extras_each)
        line_total = money(unit_final * quantity)
        original_line_total = money(unit_original * quantity)
        discount_amount = money(saving_each * quantity)
        subtotal = money(subtotal + line_total)

        canonical.append(
            {
                "is_deal": False,
                "menu_item_id": int(menu_item.id),
                "name": str(menu_item.name or ""),
                "size": str(size["name"]),
                "quantity": quantity,
                "extras": [str(extra["name"]) for extra in chosen_extras],
                "extra_details": [
                    {"id": int(extra["id"]), "name": str(extra["name"]), "price": money(extra["price"])}
                    for extra in chosen_extras
                ],
                "unit_price": unit_final,
                "price": line_total,
                "totalPrice": line_total,
                "original_price": original_line_total,
                "item_discount_amount": discount_amount,
                "item_discount_label": discount_label,
            }
        )

    if subtotal <= 0:
        raise HTTPException(status_code=400, detail="Order total must be greater than AED 0.00")
    return money(subtotal), canonical
