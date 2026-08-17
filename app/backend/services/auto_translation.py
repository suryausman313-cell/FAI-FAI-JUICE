import asyncio
import json
import logging
import re
from typing import Any, Dict, Iterable, List, Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

MYMEMORY_URL = "https://api.mymemory.translated.net/get"
MYMEMORY_TIMEOUT_SECONDS = 8.0

LOCAL_ARABIC = {
    "juice": "عصير",
    "fresh juice": "عصير طازج",
    "mango": "مانجو",
    "orange": "برتقال",
    "watermelon": "بطيخ",
    "avocado": "أفوكادو",
    "strawberry": "فراولة",
    "banana": "موز",
    "pineapple": "أناناس",
    "apple": "تفاح",
    "lemon": "ليمون",
    "lime": "ليمون أخضر",
    "mint": "نعناع",
    "ginger": "زنجبيل",
    "honey": "عسل",
    "sugar": "سكر",
    "milk": "حليب",
    "ice": "ثلج",
    "ice cream": "آيس كريم",
    "cream": "كريمة",
    "cocktail": "كوكتيل",
    "mojito": "موهيتو",
    "dessert": "حلويات",
    "desserts": "حلويات",
    "drinks": "مشروبات",
    "beverages": "مشروبات",
    "small": "صغير",
    "medium": "وسط",
    "large": "كبير",
    "extra": "إضافة",
    "extras": "إضافات",
}

_cache: Dict[str, str] = {}


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _is_arabic(text: str) -> bool:
    return bool(re.search(r"[\u0600-\u06FF]", text))


def _truncate_utf8(text: str, max_bytes: int = 480) -> str:
    raw = text.encode("utf-8")
    if len(raw) <= max_bytes:
        return text
    return raw[:max_bytes].decode("utf-8", errors="ignore").strip()


def _local_translate(text: str) -> Optional[str]:
    key = text.lower().strip()
    if key in LOCAL_ARABIC:
        return LOCAL_ARABIC[key]
    if key.endswith(" juice"):
        fruit = key[:-6].strip()
        if fruit in LOCAL_ARABIC:
            return f"عصير {LOCAL_ARABIC[fruit]}"
    return None


async def _remote_translate(client: httpx.AsyncClient, text: str) -> str:
    source = _truncate_utf8(text)
    if not source:
        return ""

    local = _local_translate(source)
    if local:
        return local

    cached = _cache.get(source)
    if cached:
        return cached

    if _is_arabic(source):
        _cache[source] = source
        return source

    try:
        response = await client.get(
            MYMEMORY_URL,
            params={"q": source, "langpair": "en|ar", "mt": "1"},
        )
        response.raise_for_status()
        payload = response.json()
        translated = _clean((payload.get("responseData") or {}).get("translatedText"))
        lower = translated.lower()
        if (
            translated
            and translated != source
            and "mymemory warning" not in lower
            and "quota" not in lower
            and "limit" not in lower
        ):
            _cache[source] = translated
            return translated
    except Exception as exc:
        logger.warning("Arabic translation unavailable for %r: %s", source, exc)

    return source


async def translate_many_to_ar(texts: Iterable[str]) -> Dict[str, str]:
    unique: List[str] = []
    seen = set()
    for value in texts:
        text = _clean(value)
        if text and text not in seen:
            seen.add(text)
            unique.append(text)

    if not unique:
        return {}

    semaphore = asyncio.Semaphore(4)
    async with httpx.AsyncClient(timeout=MYMEMORY_TIMEOUT_SECONDS) as client:
        async def one(text: str):
            async with semaphore:
                return text, await _remote_translate(client, text)

        pairs = await asyncio.gather(*(one(text) for text in unique))
    return dict(pairs)


async def prepare_menu_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(payload)
    texts: List[str] = []

    name = _clean(data.get("name"))
    description = _clean(data.get("description"))

    if name and not _clean(data.get("name_ar")):
        texts.append(name)
    if description and not _clean(data.get("description_ar")):
        texts.append(description)

    extras = None
    raw_extras = data.get("extras_json")
    if raw_extras is not None:
        try:
            parsed = json.loads(raw_extras) if isinstance(raw_extras, str) else raw_extras
            if isinstance(parsed, list):
                extras = parsed
                for extra in extras:
                    if isinstance(extra, dict):
                        extra_name = _clean(extra.get("name"))
                        if extra_name and not _clean(extra.get("name_ar")):
                            texts.append(extra_name)
        except Exception:
            extras = None

    translated = await translate_many_to_ar(texts)

    if name and not _clean(data.get("name_ar")):
        data["name_ar"] = translated.get(name, name)
    if description and not _clean(data.get("description_ar")):
        data["description_ar"] = translated.get(description, description)

    if extras is not None:
        for extra in extras:
            if not isinstance(extra, dict):
                continue
            extra_name = _clean(extra.get("name"))
            if extra_name and not _clean(extra.get("name_ar")):
                extra["name_ar"] = translated.get(extra_name, extra_name)
        data["extras_json"] = json.dumps(extras, ensure_ascii=False)

    return data


async def prepare_category_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(payload)
    name = _clean(data.get("name"))
    if name and not _clean(data.get("name_ar")):
        translated = await translate_many_to_ar([name])
        data["name_ar"] = translated.get(name, name)
    return data


async def backfill_menu_items(items: Iterable[Any], db: AsyncSession) -> None:
    records = list(items or [])
    texts: List[str] = []
    extras_by_object: Dict[int, list] = {}

    for item in records:
        name = _clean(getattr(item, "name", ""))
        description = _clean(getattr(item, "description", ""))
        if name and not _clean(getattr(item, "name_ar", "")):
            texts.append(name)
        if description and not _clean(getattr(item, "description_ar", "")):
            texts.append(description)

        raw = getattr(item, "extras_json", None)
        if raw:
            try:
                extras = json.loads(raw) if isinstance(raw, str) else raw
                if isinstance(extras, list):
                    extras_by_object[id(item)] = extras
                    for extra in extras:
                        if isinstance(extra, dict):
                            extra_name = _clean(extra.get("name"))
                            if extra_name and not _clean(extra.get("name_ar")):
                                texts.append(extra_name)
            except Exception:
                pass

    translated = await translate_many_to_ar(texts)
    changed = False

    for item in records:
        name = _clean(getattr(item, "name", ""))
        description = _clean(getattr(item, "description", ""))

        if name and not _clean(getattr(item, "name_ar", "")):
            item.name_ar = translated.get(name, name)
            changed = True
        if description and not _clean(getattr(item, "description_ar", "")):
            item.description_ar = translated.get(description, description)
            changed = True

        extras = extras_by_object.get(id(item))
        if extras is not None:
            extras_changed = False
            for extra in extras:
                if not isinstance(extra, dict):
                    continue
                extra_name = _clean(extra.get("name"))
                if extra_name and not _clean(extra.get("name_ar")):
                    extra["name_ar"] = translated.get(extra_name, extra_name)
                    extras_changed = True
            if extras_changed:
                item.extras_json = json.dumps(extras, ensure_ascii=False)
                changed = True

    if changed:
        try:
            await db.commit()
        except Exception as exc:
            await db.rollback()
            logger.warning("Could not persist Arabic menu translations: %s", exc)


async def backfill_categories(items: Iterable[Any], db: AsyncSession) -> None:
    records = list(items or [])
    texts = []
    for item in records:
        name = _clean(getattr(item, "name", ""))
        if name and not _clean(getattr(item, "name_ar", "")):
            texts.append(name)

    translated = await translate_many_to_ar(texts)
    changed = False

    for item in records:
        name = _clean(getattr(item, "name", ""))
        if name and not _clean(getattr(item, "name_ar", "")):
            item.name_ar = translated.get(name, name)
            changed = True

    if changed:
        try:
            await db.commit()
        except Exception as exc:
            await db.rollback()
            logger.warning("Could not persist Arabic category translations: %s", exc)
