"""Admin-controlled Fai Fai branding and menu replacement."""

from __future__ import annotations

import hmac
import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import MetaData, inspect, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.restaurant_settings import Restaurant_settings
from routers.fai_fai_conversion import (
    ADDRESS,
    BRAND_NAME,
    PHONE,
    replace_menu_with_fai_fai,
    update_receipt_settings,
)

router = APIRouter(
    prefix="/api/v1/fai-fai-admin",
    tags=["fai-fai-admin"],
)


class BrandSettingsUpdate(BaseModel):
    shop_name: str = Field(min_length=1, max_length=200)
    short_name: str = Field(default="Fai Fai", max_length=80)
    slogan: str = Field(default="Fresh Juices, Desserts & Beverages", max_length=300)
    phone: str = Field(default="+971 52 109 1092", max_length=80)
    whatsapp: str = Field(default="971521091092", max_length=80)
    address: str = Field(default=ADDRESS, max_length=500)

    logo_url: str = Field(default="", max_length=2000)
    customer_logo_url: str = Field(default="", max_length=2000)
    admin_logo_url: str = Field(default="", max_length=2000)
    kitchen_logo_url: str = Field(default="", max_length=2000)
    rider_logo_url: str = Field(default="", max_length=2000)

    customer_app_name: str = Field(default="Fai Fai Juice", max_length=100)
    admin_app_name: str = Field(default="Fai Fai Admin", max_length=100)
    kitchen_app_name: str = Field(default="Fai Fai Kitchen", max_length=100)
    rider_app_name: str = Field(default="Fai Fai Rider", max_length=100)

    primary_color: str = Field(default="#16a34a", pattern=r"^#[0-9a-fA-F]{6}$")
    admin_color: str = Field(default="#166534", pattern=r"^#[0-9a-fA-F]{6}$")
    kitchen_color: str = Field(default="#ea580c", pattern=r"^#[0-9a-fA-F]{6}$")
    rider_color: str = Field(default="#0891b2", pattern=r"^#[0-9a-fA-F]{6}$")

    currency: str = Field(default="AED", max_length=10)
    home_welcome_text: str = Field(default="Fresh drinks made for you", max_length=300)
    receipt_footer: str = Field(default="Thank you for ordering from Fai Fai Juice!", max_length=500)


class ReplaceMenuRequest(BaseModel):
    confirm: str


def verify_settings_key(
    x_fai_fai_settings_key: Optional[str] = Header(
        default=None,
        alias="X-Fai-Fai-Settings-Key",
    ),
) -> str:
    expected = os.getenv("FAI_FAI_SETTINGS_KEY", "").strip()

    if len(expected) < 8:
        raise HTTPException(
            status_code=503,
            detail="Set FAI_FAI_SETTINGS_KEY in Render Environment first.",
        )

    supplied = (x_fai_fai_settings_key or "").strip()
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=403, detail="Invalid settings security key")

    return supplied


async def ensure_brand_settings_table(db: AsyncSession) -> None:
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS brand_settings (
                id INTEGER PRIMARY KEY,
                shop_name VARCHAR(200) NOT NULL DEFAULT 'Fai Fai Juice',
                short_name VARCHAR(80) NOT NULL DEFAULT 'Fai Fai',
                slogan VARCHAR(300) NOT NULL DEFAULT 'Fresh Juices, Desserts & Beverages',
                phone VARCHAR(80) NOT NULL DEFAULT '+971 52 109 1092',
                whatsapp VARCHAR(80) NOT NULL DEFAULT '971521091092',
                address VARCHAR(500) NOT NULL DEFAULT 'Murbah, Fujairah, UAE',

                logo_url TEXT NOT NULL DEFAULT '',
                customer_logo_url TEXT NOT NULL DEFAULT '',
                admin_logo_url TEXT NOT NULL DEFAULT '',
                kitchen_logo_url TEXT NOT NULL DEFAULT '',
                rider_logo_url TEXT NOT NULL DEFAULT '',

                customer_app_name VARCHAR(100) NOT NULL DEFAULT 'Fai Fai Juice',
                admin_app_name VARCHAR(100) NOT NULL DEFAULT 'Fai Fai Admin',
                kitchen_app_name VARCHAR(100) NOT NULL DEFAULT 'Fai Fai Kitchen',
                rider_app_name VARCHAR(100) NOT NULL DEFAULT 'Fai Fai Rider',

                primary_color VARCHAR(20) NOT NULL DEFAULT '#16a34a',
                admin_color VARCHAR(20) NOT NULL DEFAULT '#166534',
                kitchen_color VARCHAR(20) NOT NULL DEFAULT '#ea580c',
                rider_color VARCHAR(20) NOT NULL DEFAULT '#0891b2',

                currency VARCHAR(10) NOT NULL DEFAULT 'AED',
                home_welcome_text VARCHAR(300) NOT NULL DEFAULT 'Fresh drinks made for you',
                receipt_footer VARCHAR(500) NOT NULL DEFAULT 'Thank you for ordering from Fai Fai Juice!',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )

    await db.execute(
        text(
            """
            INSERT INTO brand_settings (id)
            VALUES (1)
            ON CONFLICT (id) DO NOTHING
            """
        )
    )
    await db.commit()


async def get_brand_row(db: AsyncSession) -> dict:
    await ensure_brand_settings_table(db)
    result = await db.execute(
        text("SELECT * FROM brand_settings WHERE id = 1")
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=500, detail="Brand settings row missing")
    return dict(row)


async def sync_main_settings(
    db: AsyncSession,
    data: BrandSettingsUpdate,
) -> None:
    settings_result = await db.execute(
        select(Restaurant_settings)
        .order_by(Restaurant_settings.id)
        .limit(1)
    )
    settings = settings_result.scalar_one_or_none()

    logo = data.logo_url or data.customer_logo_url

    if settings is None:
        settings = Restaurant_settings(
            restaurant_name=data.shop_name,
            phone=data.phone,
            address=data.address,
            opening_hours="",
            restaurant_status="closed",
            logo_url=logo,
            blog_enabled=False,
        )
        db.add(settings)
    else:
        settings.restaurant_name = data.shop_name
        settings.phone = data.phone
        settings.address = data.address
        settings.logo_url = logo

    # Keep receipt branding synchronized when the receipt table exists.
    connection = await db.connection()

    def receipt_table_exists(sync_connection):
        inspector = inspect(sync_connection)
        return "receipt_settings" in inspector.get_table_names()

    if await connection.run_sync(receipt_table_exists):
        metadata = MetaData()

        def reflect_receipt(sync_connection):
            metadata.reflect(bind=sync_connection, only=["receipt_settings"])
            return metadata.tables["receipt_settings"]

        table = await connection.run_sync(reflect_receipt)
        columns = set(table.columns.keys())
        values = {}

        possible = {
            "restaurant_name": data.shop_name,
            "phone": data.phone,
            "address": data.address,
            "logo_url": logo,
            "footer_text": data.receipt_footer,
        }
        for key, value in possible.items():
            if key in columns:
                values[key] = value

        if values:
            await db.execute(table.update().values(**values))


@router.get("/brand-settings")
async def public_brand_settings(
    db: AsyncSession = Depends(get_db),
):
    """Public read endpoint used by customer/admin/kitchen/rider screens."""
    return await get_brand_row(db)


@router.put("/brand-settings")
async def save_brand_settings(
    data: BrandSettingsUpdate,
    _: str = Depends(verify_settings_key),
    db: AsyncSession = Depends(get_db),
):
    await ensure_brand_settings_table(db)

    values = data.model_dump()
    assignments = ", ".join(f"{key} = :{key}" for key in values)
    values["id"] = 1

    await db.execute(
        text(
            f"""
            UPDATE brand_settings
            SET {assignments}, updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
            """
        ),
        values,
    )

    await sync_main_settings(db, data)
    await db.commit()

    return {
        "success": True,
        "message": "Brand and app settings saved.",
        "settings": await get_brand_row(db),
    }


@router.post("/menu/replace")
async def replace_menu(
    data: ReplaceMenuRequest,
    _: str = Depends(verify_settings_key),
    db: AsyncSession = Depends(get_db),
):
    if data.confirm.strip().upper() != "DELETE OLD MENU":
        raise HTTPException(
            status_code=400,
            detail='Type exactly: DELETE OLD MENU',
        )

    try:
        result = await replace_menu_with_fai_fai(db)
        await db.commit()
        return {
            "success": True,
            "message": (
                "Old pizza menu, categories, extras, offers and deals "
                "were permanently deleted. Fai Fai menu was installed. "
                "Historical orders and sales were preserved."
            ),
            **result,
        }
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Menu replacement failed: {exc}",
        ) from exc
