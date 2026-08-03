# @File: backend/routers/receipt_settings.py
# @Desc: Shared receipt and Kitchen network-printer settings

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.receipt_settings import Receipt_settings

router = APIRouter(prefix="/api/v1/receipt-settings", tags=["receipt-settings"])

MAX_LOGO_VALUE_LENGTH = 1_000_000


class ReceiptSettingsUpdate(BaseModel):
    printer_ip: str = Field(default="192.168.70.125", min_length=3, max_length=64)
    printer_port: int = Field(default=9100, ge=1, le=65535)
    paper_width: str = Field(default="80mm", pattern=r"^(58mm|80mm)$")
    auto_print_on_accept: bool = True

    restaurant_name: str = Field(default="Vita Napoli", max_length=200)
    show_logo: bool = False
    logo_url: str = Field(default="", max_length=MAX_LOGO_VALUE_LENGTH)
    header_text: str = Field(default="Kitchen Order", max_length=1000)
    footer_text: str = Field(default="Thank you", max_length=1000)

    show_customer_phone: bool = True
    show_customer_address: bool = True
    show_payment_method: bool = True
    show_item_prices: bool = False
    show_order_totals: bool = True
    cut_paper: bool = True


def serialize(item: Receipt_settings) -> dict:
    return {
        "id": item.id,
        "printer_ip": item.printer_ip,
        "printer_port": item.printer_port,
        "paper_width": item.paper_width,
        "auto_print_on_accept": bool(item.auto_print_on_accept),
        "restaurant_name": item.restaurant_name,
        "show_logo": bool(item.show_logo),
        "logo_url": item.logo_url or "",
        "header_text": item.header_text or "",
        "footer_text": item.footer_text or "",
        "show_customer_phone": bool(item.show_customer_phone),
        "show_customer_address": bool(item.show_customer_address),
        "show_payment_method": bool(item.show_payment_method),
        "show_item_prices": bool(item.show_item_prices),
        "show_order_totals": bool(item.show_order_totals),
        "cut_paper": bool(item.cut_paper),
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


async def get_or_create(db: AsyncSession) -> Receipt_settings:
    result = await db.execute(select(Receipt_settings).order_by(Receipt_settings.id).limit(1))
    item = result.scalar_one_or_none()

    if item:
        return item

    item = Receipt_settings()
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.get("")
async def get_receipt_settings(db: AsyncSession = Depends(get_db)):
    item = await get_or_create(db)
    return serialize(item)


@router.put("")
async def update_receipt_settings(
    data: ReceiptSettingsUpdate,
    db: AsyncSession = Depends(get_db),
):
    item = await get_or_create(db)

    for field, value in data.model_dump().items():
        setattr(item, field, value)

    try:
        await db.commit()
        await db.refresh(item)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Could not save receipt settings") from exc

    return {
        "success": True,
        "message": "Receipt and printer settings saved",
        "settings": serialize(item),
    }
