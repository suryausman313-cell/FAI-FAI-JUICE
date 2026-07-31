# @File: backend/routers/finance.py
# @Desc: Rider cash settlement and separated shop/developer/rider financial reports

import json
import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.delivery_assignments import Delivery_assignments
from models.orders import Orders
from models.rider_cash_settlements import Rider_cash_settlements
from models.riders import Riders

router = APIRouter(prefix="/api/v1/finance", tags=["finance"])
logger = logging.getLogger(__name__)

UAE_TZ = timezone(timedelta(hours=4))
PeriodName = Literal["today", "yesterday", "week", "month", "year", "all", "custom"]


class CashSubmissionCreate(BaseModel):
    amount: float = Field(gt=0, le=100000)
    note: Optional[str] = Field(default="", max_length=500)


class CashSubmissionReview(BaseModel):
    status: Literal["approved", "rejected"]
    admin_note: Optional[str] = Field(default="", max_length=500)
    reviewed_by: Optional[str] = Field(default="Admin", max_length=200)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _uae_day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=UAE_TZ).astimezone(timezone.utc)


def _resolve_period(
    period: PeriodName,
    date_from: Optional[str],
    date_to: Optional[str],
) -> tuple[Optional[datetime], Optional[datetime], str]:
    now_uae = datetime.now(UAE_TZ)
    today = now_uae.date()

    if period == "all":
        return None, None, "All Time"

    if period == "today":
        start_day = today
        end_day = today + timedelta(days=1)
        label = "Today"
    elif period == "yesterday":
        start_day = today - timedelta(days=1)
        end_day = today
        label = "Yesterday"
    elif period == "week":
        start_day = today - timedelta(days=today.weekday())
        end_day = today + timedelta(days=1)
        label = "This Week"
    elif period == "month":
        start_day = today.replace(day=1)
        if start_day.month == 12:
            end_day = date(start_day.year + 1, 1, 1)
        else:
            end_day = date(start_day.year, start_day.month + 1, 1)
        label = "This Month"
    elif period == "year":
        start_day = date(today.year, 1, 1)
        end_day = date(today.year + 1, 1, 1)
        label = "This Year"
    else:
        if not date_from or not date_to:
            raise HTTPException(
                status_code=400,
                detail="Custom period requires date_from and date_to in YYYY-MM-DD format.",
            )
        try:
            start_day = date.fromisoformat(date_from)
            selected_end_day = date.fromisoformat(date_to)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail="Invalid custom date. Use YYYY-MM-DD format.",
            ) from exc

        if selected_end_day < start_day:
            raise HTTPException(status_code=400, detail="date_to cannot be before date_from.")

        end_day = selected_end_day + timedelta(days=1)
        label = f"{start_day.isoformat()} to {selected_end_day.isoformat()}"

    return _uae_day_start(start_day), _uae_day_start(end_day), label


def _apply_datetime_filter(query, column, start: Optional[datetime], end: Optional[datetime]):
    if start is not None:
        query = query.where(column >= start)
    if end is not None:
        query = query.where(column < end)
    return query


def _money(value: object) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _items_subtotal(items_json: str) -> float:
    """
    Current customer app stores each cart line's total in item.price.
    For old/malformed orders, safely return zero and derive food net from order total.
    """
    try:
        items = json.loads(items_json or "[]")
    except (TypeError, json.JSONDecodeError):
        return 0.0

    if not isinstance(items, list):
        return 0.0

    subtotal = 0.0
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            price = float(item.get("price") or 0)
        except (TypeError, ValueError):
            price = 0.0
        if price > 0:
            subtotal += price

    return round(subtotal, 2)


def _order_financials(order: Orders, assignment: Optional[Delivery_assignments] = None) -> dict:
    total = _money(order.total_amount)
    service_fee = _money(order.service_fee)
    small_order_fee = _money(order.small_order_fee)

    delivery_charge = _money(
        assignment.delivery_charge
        if assignment is not None and assignment.delivery_charge is not None
        else order.delivery_charge
    )

    tip_amount = _money(order.tip_amount)
    rider_tip = tip_amount if (order.tip_type or "").lower() == "rider" else 0.0
    shop_tip = tip_amount if (order.tip_type or "").lower() == "shop" else 0.0

    developer_fees = round(service_fee + small_order_fee, 2)
    rider_earning = round(delivery_charge + rider_tip, 2)

    # Customer total = food net + developer fees + delivery charge + all tips.
    food_net = max(
        round(total - developer_fees - delivery_charge - tip_amount, 2),
        0.0,
    )

    stored_items_subtotal = _items_subtotal(order.items_json)
    food_subtotal = max(stored_items_subtotal, food_net)
    discount_amount = max(round(food_subtotal - food_net, 2), 0.0)

    payment_method = (order.payment_method or "").lower()
    is_cash = "cash" in payment_method
    cash_collected = total if is_cash else 0.0
    cash_payable_to_shop = max(round(cash_collected - rider_earning, 2), 0.0)

    return {
        "customer_total": total,
        "food_subtotal": round(food_subtotal, 2),
        "discount_amount": round(discount_amount, 2),
        "shop_food_sale": round(food_net, 2),
        "service_fee": service_fee,
        "small_order_fee": small_order_fee,
        "developer_fees": developer_fees,
        "delivery_charge": delivery_charge,
        "rider_tip": rider_tip,
        "shop_tip": shop_tip,
        "rider_earning": rider_earning,
        "cash_collected": cash_collected,
        "cash_payable_to_shop": cash_payable_to_shop,
        "is_cash": is_cash,
    }


def _empty_totals() -> dict:
    return {
        "delivered_orders": 0,
        "customer_total": 0.0,
        "food_subtotal": 0.0,
        "discount_amount": 0.0,
        "shop_food_sale": 0.0,
        "service_fee": 0.0,
        "small_order_fee": 0.0,
        "developer_fees": 0.0,
        "delivery_charges": 0.0,
        "rider_tips": 0.0,
        "shop_tips": 0.0,
        "rider_earnings": 0.0,
        "cash_collected": 0.0,
        "cash_payable_to_shop": 0.0,
        "cash_orders": 0,
        "card_orders": 0,
    }


def _add_order_to_totals(totals: dict, values: dict) -> None:
    totals["delivered_orders"] += 1
    totals["customer_total"] += values["customer_total"]
    totals["food_subtotal"] += values["food_subtotal"]
    totals["discount_amount"] += values["discount_amount"]
    totals["shop_food_sale"] += values["shop_food_sale"]
    totals["service_fee"] += values["service_fee"]
    totals["small_order_fee"] += values["small_order_fee"]
    totals["developer_fees"] += values["developer_fees"]
    totals["delivery_charges"] += values["delivery_charge"]
    totals["rider_tips"] += values["rider_tip"]
    totals["shop_tips"] += values["shop_tip"]
    totals["rider_earnings"] += values["rider_earning"]
    totals["cash_collected"] += values["cash_collected"]
    totals["cash_payable_to_shop"] += values["cash_payable_to_shop"]
    if values["is_cash"]:
        totals["cash_orders"] += 1
    else:
        totals["card_orders"] += 1


def _round_totals(totals: dict) -> dict:
    integer_fields = {"delivered_orders", "cash_orders", "card_orders"}
    return {
        key: value if key in integer_fields else round(float(value), 2)
        for key, value in totals.items()
    }


async def _get_rider_period_totals(
    db: AsyncSession,
    rider_id: int,
    start: Optional[datetime],
    end: Optional[datetime],
) -> dict:
    delivered_at = func.coalesce(
        Delivery_assignments.updated_at,
        Delivery_assignments.created_at,
    )

    query = (
        select(Delivery_assignments, Orders)
        .join(Orders, Orders.id == Delivery_assignments.order_id)
        .where(
            Delivery_assignments.rider_id == rider_id,
            Delivery_assignments.status == "delivered",
            Orders.status != "cancelled",
        )
    )
    query = _apply_datetime_filter(query, delivered_at, start, end)

    rows = (await db.execute(query)).all()
    totals = _empty_totals()

    for assignment, order in rows:
        _add_order_to_totals(totals, _order_financials(order, assignment))

    return _round_totals(totals)


async def _get_settlement_totals(
    db: AsyncSession,
    rider_id: Optional[int] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> dict:
    query = select(Rider_cash_settlements)
    if rider_id is not None:
        query = query.where(Rider_cash_settlements.rider_id == rider_id)
    query = _apply_datetime_filter(
        query,
        Rider_cash_settlements.submitted_at,
        start,
        end,
    )

    settlements = (await db.execute(query)).scalars().all()

    approved = sum(_money(item.amount) for item in settlements if item.status == "approved")
    awaiting = sum(_money(item.amount) for item in settlements if item.status == "pending")
    rejected = sum(_money(item.amount) for item in settlements if item.status == "rejected")

    return {
        "approved_cash": round(approved, 2),
        "awaiting_approval": round(awaiting, 2),
        "rejected_cash": round(rejected, 2),
        "submissions": len(settlements),
    }


async def _get_current_rider_balance(db: AsyncSession, rider_id: int) -> dict:
    all_time = await _get_rider_period_totals(db, rider_id, None, None)
    settlement_totals = await _get_settlement_totals(db, rider_id)

    cash_due = _money(all_time["cash_payable_to_shop"])
    approved = _money(settlement_totals["approved_cash"])
    awaiting = _money(settlement_totals["awaiting_approval"])

    remaining_to_submit = max(round(cash_due - approved - awaiting, 2), 0.0)
    total_pending_cash = max(round(cash_due - approved, 2), 0.0)

    return {
        "cash_due_to_shop": cash_due,
        "approved_cash": approved,
        "awaiting_approval": awaiting,
        "remaining_to_submit": remaining_to_submit,
        "total_pending_cash": total_pending_cash,
    }


@router.get("/rider/{rider_id}/summary")
async def get_rider_finance_summary(
    rider_id: int,
    period: PeriodName = Query(default="today"),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    rider = (
        await db.execute(select(Riders).where(Riders.id == rider_id))
    ).scalar_one_or_none()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found.")

    start, end, label = _resolve_period(period, date_from, date_to)
    period_totals = await _get_rider_period_totals(db, rider_id, start, end)
    period_settlements = await _get_settlement_totals(db, rider_id, start, end)
    current_balance = await _get_current_rider_balance(db, rider_id)

    return {
        "rider": {"id": rider.id, "name": rider.name, "phone": rider.phone},
        "period": {
            "key": period,
            "label": label,
            "date_from": start.isoformat() if start else None,
            "date_to": end.isoformat() if end else None,
        },
        "totals": period_totals,
        "settlements": period_settlements,
        "current_balance": current_balance,
    }


@router.post("/rider/{rider_id}/cash-submissions", status_code=201)
async def submit_rider_cash(
    rider_id: int,
    data: CashSubmissionCreate,
    db: AsyncSession = Depends(get_db),
):
    rider = (
        await db.execute(
            select(Riders).where(Riders.id == rider_id, Riders.is_active == True)
        )
    ).scalar_one_or_none()
    if not rider:
        raise HTTPException(status_code=404, detail="Active rider not found.")

    current_balance = await _get_current_rider_balance(db, rider_id)
    remaining = _money(current_balance["remaining_to_submit"])

    if remaining <= 0:
        raise HTTPException(status_code=400, detail="No cash is currently due to the shop.")

    amount = round(float(data.amount), 2)
    if amount > remaining + 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Submission cannot exceed remaining cash AED {remaining:.2f}.",
        )

    settlement = Rider_cash_settlements(
        rider_id=rider_id,
        amount=amount,
        status="pending",
        rider_note=(data.note or "").strip(),
    )
    db.add(settlement)
    await db.commit()
    await db.refresh(settlement)

    return {
        "success": True,
        "message": "Cash submission sent to admin for approval.",
        "submission": {
            "id": settlement.id,
            "rider_id": settlement.rider_id,
            "amount": _money(settlement.amount),
            "status": settlement.status,
            "submitted_at": settlement.submitted_at.isoformat()
            if settlement.submitted_at
            else None,
        },
    }


@router.get("/rider/{rider_id}/cash-submissions")
async def get_rider_cash_submissions(
    rider_id: int,
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Rider_cash_settlements)
        .where(Rider_cash_settlements.rider_id == rider_id)
        .order_by(desc(Rider_cash_settlements.submitted_at))
        .limit(limit)
    )
    items = result.scalars().all()

    return {
        "items": [
            {
                "id": item.id,
                "rider_id": item.rider_id,
                "amount": _money(item.amount),
                "status": item.status,
                "rider_note": item.rider_note or "",
                "admin_note": item.admin_note or "",
                "reviewed_by": item.reviewed_by or "",
                "submitted_at": item.submitted_at.isoformat() if item.submitted_at else None,
                "reviewed_at": item.reviewed_at.isoformat() if item.reviewed_at else None,
            }
            for item in items
        ]
    }


@router.get("/admin/summary")
async def get_admin_finance_summary(
    period: PeriodName = Query(default="today"),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    start, end, label = _resolve_period(period, date_from, date_to)

    riders = (
        await db.execute(select(Riders).order_by(Riders.name))
    ).scalars().all()

    overall = _empty_totals()
    rider_items = []

    for rider in riders:
        totals = await _get_rider_period_totals(db, rider.id, start, end)
        period_settlements = await _get_settlement_totals(
            db,
            rider.id,
            start,
            end,
        )
        current_balance = await _get_current_rider_balance(db, rider.id)

        for key, value in totals.items():
            overall[key] += value

        rider_items.append(
            {
                "rider_id": rider.id,
                "rider_name": rider.name,
                "rider_phone": rider.phone,
                "is_active": bool(rider.is_active),
                "totals": totals,
                "settlements": period_settlements,
                "current_balance": current_balance,
            }
        )

    all_settlements = await _get_settlement_totals(db, None, start, end)

    return {
        "period": {
            "key": period,
            "label": label,
            "date_from": start.isoformat() if start else None,
            "date_to": end.isoformat() if end else None,
        },
        "totals": _round_totals(overall),
        "settlements": all_settlements,
        "riders": rider_items,
        "rules": {
            "discount_applies_to": "menu_items_only",
            "shop_sale": "food_subtotal_minus_discount",
            "developer_fees": "service_fee_plus_small_order_fee",
            "rider_earning": "delivery_charge_plus_rider_tip",
        },
    }


@router.get("/admin/cash-submissions")
async def get_admin_cash_submissions(
    status: Literal["all", "pending", "approved", "rejected"] = Query(default="pending"),
    rider_id: Optional[int] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Rider_cash_settlements, Riders)
        .join(Riders, Riders.id == Rider_cash_settlements.rider_id)
        .order_by(desc(Rider_cash_settlements.submitted_at))
    )

    if status != "all":
        query = query.where(Rider_cash_settlements.status == status)
    if rider_id is not None:
        query = query.where(Rider_cash_settlements.rider_id == rider_id)

    rows = (await db.execute(query.limit(limit))).all()

    return {
        "items": [
            {
                "id": settlement.id,
                "rider_id": rider.id,
                "rider_name": rider.name,
                "rider_phone": rider.phone,
                "amount": _money(settlement.amount),
                "status": settlement.status,
                "rider_note": settlement.rider_note or "",
                "admin_note": settlement.admin_note or "",
                "reviewed_by": settlement.reviewed_by or "",
                "submitted_at": settlement.submitted_at.isoformat()
                if settlement.submitted_at
                else None,
                "reviewed_at": settlement.reviewed_at.isoformat()
                if settlement.reviewed_at
                else None,
            }
            for settlement, rider in rows
        ]
    }


@router.put("/admin/cash-submissions/{settlement_id}")
async def review_cash_submission(
    settlement_id: int,
    data: CashSubmissionReview,
    db: AsyncSession = Depends(get_db),
):
    settlement = (
        await db.execute(
            select(Rider_cash_settlements).where(
                Rider_cash_settlements.id == settlement_id
            )
        )
    ).scalar_one_or_none()

    if not settlement:
        raise HTTPException(status_code=404, detail="Cash submission not found.")

    if settlement.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"This submission is already {settlement.status}.",
        )

    settlement.status = data.status
    settlement.admin_note = (data.admin_note or "").strip()
    settlement.reviewed_by = (data.reviewed_by or "Admin").strip()
    settlement.reviewed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(settlement)

    return {
        "success": True,
        "message": f"Cash submission {data.status}.",
        "submission": {
            "id": settlement.id,
            "rider_id": settlement.rider_id,
            "amount": _money(settlement.amount),
            "status": settlement.status,
            "admin_note": settlement.admin_note or "",
            "reviewed_by": settlement.reviewed_by or "",
            "reviewed_at": settlement.reviewed_at.isoformat()
            if settlement.reviewed_at
            else None,
        },
    }
