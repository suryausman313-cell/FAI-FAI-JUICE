# @File: backend/routers/admin.py
# @Desc: Admin API routes for order management, customers, and sales reports
import logging
import os
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_
from typing import Optional
from datetime import datetime, timezone, timedelta

from core.database import get_db
from routers.customer_auth import decode_customer_token, get_bearer_token
from routers.fai_fai_admin_control import AdminIdentity, get_current_admin
from models.orders import Orders
from models.customer_sessions import Customer_sessions
from services.customer_push_service import notify_customer_order_update_safely

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# Kitchen panel uses its own PIN header instead of an admin JWT.
# On Render, KITCHEN_PIN is required as an environment variable.


async def verify_kitchen_pin(
    x_kitchen_pin: Optional[str] = Header(default=None, alias="X-Kitchen-Pin"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
) -> bool:
    """Allow a valid Fai Fai Admin token or the Kitchen PIN."""
    expected_pin = os.getenv("KITCHEN_PIN", "").strip()
    supplied_pin = (x_kitchen_pin or "").strip()
    if len(expected_pin) >= 4 and supplied_pin and supplied_pin == expected_pin:
        return True

    if authorization and authorization.lower().startswith("bearer "):
        identity = await get_current_admin(authorization=authorization, db=db)
        if (
            identity.role == "super_admin"
            or identity.permissions.get("orders")
            or identity.permissions.get("kitchen")
        ):
            return True
        raise HTTPException(status_code=403, detail="Orders permission required")

    if len(expected_pin) < 4 and not authorization:
        raise HTTPException(
            status_code=503,
            detail="Set KITCHEN_PIN in Render Environment first",
        )

    raise HTTPException(status_code=401, detail="Admin login or valid kitchen PIN required")


def is_delivery_order(order: Orders) -> bool:
    """Detect delivery orders safely, including older records."""
    explicit_type = str(getattr(order, "order_type", "") or "").lower().strip()
    if explicit_type == "delivery":
        return True

    notes = str(getattr(order, "order_notes", "") or "").lower()
    payment = str(getattr(order, "payment_method", "") or "").lower()

    return (
        "order type: delivery" in notes
        or "delivery address:" in notes
        or "cash on delivery" in payment
        or "card on delivery" in payment
    )


def serialize_order(order: Orders) -> dict:
    """Return the order shape expected by the Admin and Kitchen frontends."""
    status = (order.status or "new").lower().strip()
    if status in {"pending", "placed", "order_placed", "created"}:
        status = "new"

    return {
        "id": order.id,
        "user_id": order.user_id,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "estimated_time": order.pickup_time or "",
        "order_notes": order.order_notes or "",
        "payment_method": order.payment_method,
        "order_type": (
            str(getattr(order, "order_type", "") or "").lower().strip()
            or ("delivery" if is_delivery_order(order) else "pickup")
        ),
        "status": status,
        "total_amount": order.total_amount,
        "service_fee": order.service_fee or 0,
        "small_order_fee": order.small_order_fee or 0,
        "delivery_charge": order.delivery_charge or 0,
        "customer_lat": getattr(order, "customer_lat", None),
        "customer_lng": getattr(order, "customer_lng", None),
        "customer_address": getattr(order, "customer_address", "") or "",
        "delivery_area_name": getattr(order, "delivery_area_name", "") or "",
        "delivery_country": getattr(order, "delivery_country", "") or "",
        "delivery_distance_km": getattr(order, "delivery_distance_km", None),
        "delivery_zone_name": getattr(order, "delivery_zone_name", "") or "",
        "tip_amount": order.tip_amount or 0,
        "tip_type": order.tip_type or "",
        "items_json": order.items_json,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        "accepted_at": order.accepted_at.isoformat() if getattr(order, "accepted_at", None) else None,
        "promised_ready_at": order.promised_ready_at.isoformat() if getattr(order, "promised_ready_at", None) else None,
        "preparing_at": order.preparing_at.isoformat() if getattr(order, "preparing_at", None) else None,
        "ready_at": order.ready_at.isoformat() if getattr(order, "ready_at", None) else None,
        "rider_picked_up_at": order.rider_picked_up_at.isoformat() if getattr(order, "rider_picked_up_at", None) else None,
        "promised_delivery_at": order.promised_delivery_at.isoformat() if getattr(order, "promised_delivery_at", None) else None,
        "delivered_at": order.delivered_at.isoformat() if getattr(order, "delivered_at", None) else None,
    }


class OrderStatusUpdate(BaseModel):
    status: str
    estimated_minutes: Optional[int] = None
    cancel_reason: Optional[str] = None


@router.get("/kitchen/orders")
async def get_kitchen_orders(
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    skip: int = 0,
    kitchen_access: bool = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    """Get orders for the Kitchen panel using the X-Kitchen-Pin header."""
    del kitchen_access

    try:
        query = select(Orders).order_by(desc(Orders.created_at))

        if status and status != "all":
            query = query.where(Orders.status == status)

        if search:
            query = query.where(
                or_(
                    Orders.customer_name.ilike(f"%{search}%"),
                    Orders.customer_phone.ilike(f"%{search}%"),
                )
            )

        query = query.offset(skip).limit(limit)
        result = await db.execute(query)
        orders = result.scalars().all()

        return {"items": [serialize_order(order) for order in orders]}
    except HTTPException:
        raise
    except Exception as exc:
        logging.exception("Failed to get kitchen orders")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.put("/kitchen/orders/{order_id}/status")
async def update_kitchen_order_status(
    order_id: int,
    data: OrderStatusUpdate,
    kitchen_access: bool = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    """Update order status from the Kitchen panel using the kitchen PIN."""
    del kitchen_access

    try:
        result = await db.execute(select(Orders).where(Orders.id == order_id))
        order = result.scalar_one_or_none()

        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        valid_transitions = {
            "new": ["accepted", "preparing", "cancelled"],
            "pending": ["accepted", "preparing", "cancelled"],
            "placed": ["accepted", "preparing", "cancelled"],
            "accepted": ["preparing", "ready", "cancelled"],
            "preparing": ["ready", "cancelled"],
            "ready": ["completed", "cancelled"],
            "out_for_delivery": ["cancelled"],
            "completed": [],
            "cancelled": [],
        }

        current_status = (order.status or "new").lower().strip()
        new_status = data.status.lower().strip()
        valid_statuses = [
            "new",
            "accepted",
            "preparing",
            "ready",
            "out_for_delivery",
            "completed",
            "cancelled",
        ]

        if new_status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid status '{new_status}'. "
                    f"Valid statuses: {', '.join(valid_statuses)}"
                ),
            )

        if new_status == "completed" and is_delivery_order(order):
            raise HTTPException(
                status_code=400,
                detail=(
                    "A delivery order cannot be completed from the Kitchen. "
                    "The rider must deliver it to the customer and mark it Delivered."
                ),
            )

        allowed_next = valid_transitions.get(current_status, [])
        if new_status not in allowed_next:
            if current_status in ("completed", "cancelled"):
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot change status of a {current_status} order.",
                )

            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot transition from '{current_status}' to '{new_status}'. "
                    f"Allowed: {', '.join(allowed_next) if allowed_next else 'none'}"
                ),
            )

        if new_status == "cancelled":
            reason = ' '.join(str(data.cancel_reason or '').split()).strip()
            if len(reason) < 2:
                raise HTTPException(status_code=400, detail="Cancellation reason is required.")
            if len(reason) > 300:
                raise HTTPException(status_code=400, detail="Cancellation reason is too long.")
            data.cancel_reason = reason

        order.status = new_status

        if data.estimated_minutes is not None:
            safe_minutes = max(1, min(240, int(data.estimated_minutes)))
            deadline = datetime.now(timezone.utc) + timedelta(minutes=safe_minutes)
            order.pickup_time = f"{safe_minutes} min|{deadline.isoformat()}"

        if new_status == "cancelled" and data.cancel_reason:
            existing_notes = order.order_notes or ""
            separator = " | " if existing_notes else ""
            order.order_notes = (
                f"{existing_notes}{separator}Cancelled by kitchen: {data.cancel_reason}"
            )

        await db.commit()
        await db.refresh(order)

        await notify_customer_order_update_safely(db, order, new_status)

        return {
            "success": True,
            "status": new_status,
            "estimated_minutes": data.estimated_minutes,
            "order": serialize_order(order),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logging.exception("Failed to update kitchen order status")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/orders")
async def get_orders(
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    skip: int = 0,
    panel_access: bool = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    """Get all orders for the Admin panel using the X-Kitchen-Pin header."""
    del panel_access

    try:
        query = select(Orders).order_by(desc(Orders.created_at))

        if status and status != "all":
            if status == "new":
                query = query.where(
                    Orders.status.in_(["new", "pending", "placed", "order_placed", "created"])
                )
            else:
                query = query.where(Orders.status == status)

        if search:
            query = query.where(
                or_(
                    Orders.customer_name.ilike(f"%{search}%"),
                    Orders.customer_phone.ilike(f"%{search}%"),
                )
            )

        query = query.offset(skip).limit(limit)
        result = await db.execute(query)
        orders = result.scalars().all()

        return {"items": [serialize_order(order) for order in orders]}
    except Exception as e:
        logging.error(f"Failed to get orders: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/orders/{order_id}/status")
async def update_order_status(
    order_id: int,
    data: OrderStatusUpdate,
    panel_access: bool = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    """Update order status from the Admin panel using the X-Kitchen-Pin header."""
    del panel_access

    try:
        result = await db.execute(select(Orders).where(Orders.id == order_id))
        order = result.scalar_one_or_none()

        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        # ===== VALID STATUS TRANSITIONS =====
        # Orders always start as "new". Valid flow:
        # new -> accepted -> preparing -> ready -> completed
        # Any status can go to "cancelled" (admin override)
        VALID_TRANSITIONS = {
            "new": ["accepted", "preparing", "cancelled"],
            "pending": ["accepted", "preparing", "cancelled"],
            "placed": ["accepted", "preparing", "cancelled"],
            "order_placed": ["accepted", "preparing", "cancelled"],
            "created": ["accepted", "preparing", "cancelled"],
            "accepted": ["preparing", "ready", "cancelled"],
            "preparing": ["ready", "cancelled"],
            "ready": ["completed", "cancelled"],
            "out_for_delivery": ["cancelled"],
            "completed": [],  # Terminal state - no further transitions
            "cancelled": [],  # Terminal state - no further transitions
        }

        current_status = (order.status or "new").lower().strip()
        new_status = data.status.lower().strip()

        # Validate the new status is a recognized value
        all_valid_statuses = [
            "new",
            "accepted",
            "preparing",
            "ready",
            "out_for_delivery",
            "completed",
            "cancelled",
        ]
        if new_status not in all_valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status '{new_status}'. Valid statuses: {', '.join(all_valid_statuses)}"
            )

        # Delivery is completed only by the Rider.
        if new_status == "completed" and is_delivery_order(order):
            raise HTTPException(
                status_code=400,
                detail=(
                    "A delivery order cannot be completed from Admin or Kitchen. "
                    "The rider must press Delivered."
                ),
            )

        # Check if transition is allowed
        allowed_next = VALID_TRANSITIONS.get(current_status, [])
        if new_status not in allowed_next:
            if current_status in ("completed", "cancelled"):
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot change status of a {current_status} order."
                )
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition from '{current_status}' to '{new_status}'. Allowed: {', '.join(allowed_next) if allowed_next else 'none'}"
            )

        if new_status == "cancelled":
            reason = ' '.join(str(data.cancel_reason or '').split()).strip()
            if len(reason) < 2:
                raise HTTPException(status_code=400, detail="Cancellation reason is required.")
            if len(reason) > 300:
                raise HTTPException(status_code=400, detail="Cancellation reason is too long.")
            data.cancel_reason = reason

        order.status = new_status
        if data.estimated_minutes is not None:
            safe_minutes = max(1, min(240, int(data.estimated_minutes)))
            deadline = datetime.now(timezone.utc) + timedelta(minutes=safe_minutes)
            order.pickup_time = f"{safe_minutes} min|{deadline.isoformat()}"
        # Append cancel reason to notes if cancelling
        if new_status == 'cancelled' and data.cancel_reason:
            existing_notes = order.order_notes or ''
            order.order_notes = f"{existing_notes} | Cancelled by admin: {data.cancel_reason}"
        await db.commit()
        await db.refresh(order)

        if new_status == "ready":
            await notify_customer_order_ready_safely(db, order)
        elif new_status == "cancelled":
            await notify_customer_order_update_safely(db, order, "cancelled")

        return {"success": True, "status": new_status, "estimated_minutes": data.estimated_minutes}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to update order status: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/customers")
async def get_customers(
    search: Optional[str] = None,
    limit: int = 100,
    current_user: AdminIdentity = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get customer list with order stats"""
    try:
        query = select(
            Orders.customer_name,
            Orders.customer_phone,
            func.count(Orders.id).label("total_orders"),
            func.sum(Orders.total_amount).label("total_spent"),
            func.max(Orders.created_at).label("last_order_date"),
        ).group_by(
            Orders.customer_name,
            Orders.customer_phone,
        ).order_by(desc(func.max(Orders.created_at)))

        if search:
            query = query.where(
                or_(
                    Orders.customer_phone.ilike(f"%{search}%"),
                    Orders.customer_name.ilike(f"%{search}%"),
                )
            )

        query = query.limit(limit)
        result = await db.execute(query)
        rows = result.all()

        items = []
        for row in rows:
            items.append({
                "customer_name": row.customer_name,
                "customer_phone": row.customer_phone,
                "total_orders": row.total_orders,
                "total_spent": float(row.total_spent) if row.total_spent else 0,
                "last_order_date": row.last_order_date.isoformat() if row.last_order_date else None,
            })

        return {"items": items}
    except Exception as e:
        logging.error(f"Failed to get customers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class CustomerHeartbeatRequest(BaseModel):
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    session_id: Optional[str] = None  # For guest tracking


@router.post("/customer-heartbeat")
async def customer_heartbeat(
    data: CustomerHeartbeatRequest,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    """Track customer online activity - called every 30s from the app (authenticated users)"""
    try:
        payload = decode_customer_token(get_bearer_token(authorization))
        user_id = f"customer:{payload.get('sub', '')}"
        customer_phone = str(payload.get("phone") or data.customer_phone or "")
        result = await db.execute(
            select(Customer_sessions)
            .where(Customer_sessions.customer_phone == customer_phone)
            .order_by(desc(Customer_sessions.id))
            .limit(1)
        )
        session = result.scalar_one_or_none()

        now = datetime.now(timezone.utc)
        if session:
            session.last_active = now
            if data.customer_name:
                session.customer_name = data.customer_name
            if data.customer_email:
                session.customer_email = data.customer_email
            if data.customer_phone:
                session.customer_phone = data.customer_phone
        else:
            session = Customer_sessions(
                user_id=user_id,
                customer_name=data.customer_name or "Unknown",
                customer_email=data.customer_email,
                customer_phone=customer_phone,
                last_active=now,
                first_seen=now,
            )
            db.add(session)

        await db.commit()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to update customer heartbeat: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


class GuestHeartbeatRequest(BaseModel):
    session_id: str  # Unique browser session ID
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None


@router.post("/guest-heartbeat")
async def guest_heartbeat(
    data: GuestHeartbeatRequest,
    db: AsyncSession = Depends(get_db),
):
    """Track ANY visitor (guest or logged in) - no auth required.
    Uses a unique session_id generated in the browser."""
    try:
        if not data.session_id:
            return {"success": False, "error": "session_id required"}

        # Use session_id as the user_id for guests (prefixed to distinguish)
        guest_id = f"guest_{data.session_id}"

        result = await db.execute(
            select(Customer_sessions).where(Customer_sessions.user_id == guest_id)
        )
        session = result.scalar_one_or_none()

        now = datetime.now(timezone.utc)
        if session:
            session.last_active = now
            # Update name/phone if provided (e.g., from localStorage saved info)
            if data.customer_name and data.customer_name != "Guest":
                session.customer_name = data.customer_name
            if data.customer_phone:
                session.customer_phone = data.customer_phone
        else:
            session = Customer_sessions(
                user_id=guest_id,
                customer_name=data.customer_name or "Guest",
                customer_email="",
                customer_phone=data.customer_phone or "",
                last_active=now,
                first_seen=now,
            )
            db.add(session)

        await db.commit()
        return {"success": True}
    except Exception as e:
        logging.error(f"Failed to update guest heartbeat: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/customers-enhanced")
async def get_customers_enhanced(
    search: Optional[str] = None,
    filter_status: Optional[str] = None,
    limit: int = 100,
    current_user: AdminIdentity = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get enhanced customer list with online status and activity tracking.
    Shows ALL visitors - both authenticated users and guests."""
    try:
        now = datetime.now(timezone.utc)

        # Get all customer sessions (includes both guests and authenticated users)
        sessions_result = await db.execute(select(Customer_sessions))
        sessions = sessions_result.scalars().all()
        session_map = {}
        for s in sessions:
            session_map[s.user_id] = s

        # Get order stats grouped by user_id (only for users who placed orders)
        order_stats_query = select(
            Orders.user_id,
            Orders.customer_name,
            Orders.customer_phone,
            func.count(Orders.id).label("total_orders"),
            func.sum(Orders.total_amount).label("total_spent"),
            func.max(Orders.created_at).label("last_order_date"),
        ).group_by(
            Orders.user_id,
            Orders.customer_name,
            Orders.customer_phone,
        ).order_by(desc(func.max(Orders.created_at)))

        if search:
            order_stats_query = order_stats_query.where(
                or_(
                    Orders.customer_phone.ilike(f"%{search}%"),
                    Orders.customer_name.ilike(f"%{search}%"),
                )
            )

        order_stats_query = order_stats_query.limit(limit)
        result = await db.execute(order_stats_query)
        rows = result.all()

        items = []
        processed_session_ids = set()

        for row in rows:
            user_id = row.user_id
            session = session_map.get(user_id)

            is_online = False
            last_active = None
            first_seen = None
            if session:
                processed_session_ids.add(user_id)
                if session.last_active:
                    la_time = session.last_active
                    if hasattr(la_time, 'tzinfo') and la_time.tzinfo is None:
                        la_time = la_time.replace(tzinfo=timezone.utc)
                    is_online = (now - la_time).total_seconds() < 60
                    last_active = session.last_active.isoformat()
                if session.first_seen:
                    first_seen = session.first_seen.isoformat()

            if filter_status == "online" and not is_online:
                continue
            if filter_status == "offline" and is_online:
                continue

            is_guest = user_id.startswith("guest_") if user_id else False
            items.append({
                "user_id": user_id,
                "customer_name": row.customer_name,
                "customer_phone": row.customer_phone,
                "total_orders": row.total_orders,
                "total_spent": float(row.total_spent) if row.total_spent else 0,
                "last_order_date": row.last_order_date.isoformat() if row.last_order_date else None,
                "is_online": is_online,
                "last_active": last_active,
                "first_seen": first_seen,
                "is_guest": is_guest,
            })

        # Include ALL sessions (guests and users without orders)
        for s in sessions:
            if s.user_id in processed_session_ids:
                continue
            # Check if this session's user_id matches any order user_id already processed
            order_user_ids = {row.user_id for row in rows}
            if s.user_id in order_user_ids:
                continue

            is_online = False
            if s.last_active:
                la_time = s.last_active
                if hasattr(la_time, 'tzinfo') and la_time.tzinfo is None:
                    la_time = la_time.replace(tzinfo=timezone.utc)
                is_online = (now - la_time).total_seconds() < 60

            if filter_status == "online" and not is_online:
                continue
            if filter_status == "offline" and is_online:
                continue

            if search:
                search_lower = search.lower()
                name_match = s.customer_name and search_lower in s.customer_name.lower()
                phone_match = s.customer_phone and search_lower in s.customer_phone
                if not name_match and not phone_match:
                    continue

            is_guest = s.user_id.startswith("guest_") if s.user_id else True
            display_name = s.customer_name or ("Guest" if is_guest else "Unknown")

            items.append({
                "user_id": s.user_id,
                "customer_name": display_name,
                "customer_phone": s.customer_phone or "",
                "total_orders": 0,
                "total_spent": 0,
                "last_order_date": None,
                "is_online": is_online,
                "last_active": s.last_active.isoformat() if s.last_active else None,
                "first_seen": s.first_seen.isoformat() if s.first_seen else None,
                "is_guest": is_guest,
            })

        # Sort: online first, then by last_active descending
        items.sort(key=lambda x: (not x["is_online"], x.get("last_active") or ""), reverse=False)
        online_count = sum(1 for i in items if i["is_online"])

        return {
            "items": items,
            "total_customers": len(items),
            "online_count": online_count,
        }
    except Exception as e:
        logging.error(f"Failed to get enhanced customers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tips-report")
async def get_tips_report(
    panel_access: bool = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    """Get the Admin tips report using the X-Kitchen-Pin header."""
    del panel_access

    try:
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=now.weekday())
        month_start = today_start.replace(day=1)

        # Rider tips (delivery orders)
        rider_tips_today = await db.execute(
            select(func.sum(Orders.tip_amount))
            .where(Orders.tip_type == 'rider', Orders.created_at >= today_start, Orders.status == 'completed')
        )
        rider_tips_week = await db.execute(
            select(func.sum(Orders.tip_amount))
            .where(Orders.tip_type == 'rider', Orders.created_at >= week_start, Orders.status == 'completed')
        )
        rider_tips_month = await db.execute(
            select(func.sum(Orders.tip_amount))
            .where(Orders.tip_type == 'rider', Orders.created_at >= month_start, Orders.status == 'completed')
        )
        rider_tips_all = await db.execute(
            select(func.sum(Orders.tip_amount))
            .where(Orders.tip_type == 'rider', Orders.status == 'completed')
        )

        # Shop tips (pickup orders)
        shop_tips_today = await db.execute(
            select(func.sum(Orders.tip_amount))
            .where(Orders.tip_type == 'shop', Orders.created_at >= today_start, Orders.status == 'completed')
        )
        shop_tips_week = await db.execute(
            select(func.sum(Orders.tip_amount))
            .where(Orders.tip_type == 'shop', Orders.created_at >= week_start, Orders.status == 'completed')
        )
        shop_tips_month = await db.execute(
            select(func.sum(Orders.tip_amount))
            .where(Orders.tip_type == 'shop', Orders.created_at >= month_start, Orders.status == 'completed')
        )
        shop_tips_all = await db.execute(
            select(func.sum(Orders.tip_amount))
            .where(Orders.tip_type == 'shop', Orders.status == 'completed')
        )

        # Total tips
        total_tips_today = await db.execute(
            select(func.sum(Orders.tip_amount))
            .where(Orders.tip_amount > 0, Orders.created_at >= today_start, Orders.status == 'completed')
        )
        total_tips_all = await db.execute(
            select(func.sum(Orders.tip_amount))
            .where(Orders.tip_amount > 0, Orders.status == 'completed')
        )

        # Per-rider tip breakdown (from delivered orders with rider tip)
        from models.delivery_assignments import Delivery_assignments
        from models.riders import Riders

        rider_breakdown = []
        riders_result = await db.execute(select(Riders).where(Riders.is_active == True))
        riders = riders_result.scalars().all()

        for rider in riders:
            # Get all delivered assignments for this rider
            assignments_result = await db.execute(
                select(Delivery_assignments.order_id).where(
                    Delivery_assignments.rider_id == rider.id,
                    Delivery_assignments.status == 'delivered',
                )
            )
            order_ids = [a for a in assignments_result.scalars().all()]

            rider_tip_total = 0.0
            if order_ids:
                tip_result = await db.execute(
                    select(func.sum(Orders.tip_amount)).where(
                        Orders.id.in_(order_ids),
                        Orders.tip_type == 'rider',
                        Orders.tip_amount > 0,
                    )
                )
                rider_tip_total = float(tip_result.scalar() or 0)

            if rider_tip_total > 0:
                rider_breakdown.append({
                    "rider_id": rider.id,
                    "rider_name": rider.name,
                    "total_tips": round(rider_tip_total, 2),
                })

        return {
            "rider_tips": {
                "today": float(rider_tips_today.scalar() or 0),
                "week": float(rider_tips_week.scalar() or 0),
                "month": float(rider_tips_month.scalar() or 0),
                "all": float(rider_tips_all.scalar() or 0),
            },
            "shop_tips": {
                "today": float(shop_tips_today.scalar() or 0),
                "week": float(shop_tips_week.scalar() or 0),
                "month": float(shop_tips_month.scalar() or 0),
                "all": float(shop_tips_all.scalar() or 0),
            },
            "total_tips": {
                "today": float(total_tips_today.scalar() or 0),
                "all": float(total_tips_all.scalar() or 0),
            },
            "rider_breakdown": rider_breakdown,
        }
    except Exception as e:
        logging.error(f"Failed to get tips report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sales-report")
async def get_sales_report(
    panel_access: bool = Depends(verify_kitchen_pin),
    db: AsyncSession = Depends(get_db),
):
    """Get the Admin sales report using the X-Kitchen-Pin header."""
    del panel_access
    from datetime import datetime, timedelta

    try:
        now = datetime.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=today_start.weekday())
        month_start = today_start.replace(day=1)
        year_start = today_start.replace(month=1, day=1)

        # Total orders count (exclude cancelled orders from metrics)
        total_orders_result = await db.execute(
            select(func.count(Orders.id)).where(Orders.status == 'completed')
        )
        total_orders = total_orders_result.scalar() or 0

        # Daily sales
        daily_result = await db.execute(
            select(func.sum(Orders.total_amount), func.count(Orders.id))
            .where(Orders.created_at >= today_start)
            .where(Orders.status == 'completed')
        )
        daily_row = daily_result.one()
        daily_sales = float(daily_row[0] or 0)
        daily_orders = daily_row[1] or 0

        # Weekly sales
        weekly_result = await db.execute(
            select(func.sum(Orders.total_amount), func.count(Orders.id))
            .where(Orders.created_at >= week_start)
            .where(Orders.status == 'completed')
        )
        weekly_row = weekly_result.one()
        weekly_sales = float(weekly_row[0] or 0)
        weekly_orders = weekly_row[1] or 0

        # Monthly sales
        monthly_result = await db.execute(
            select(func.sum(Orders.total_amount), func.count(Orders.id))
            .where(Orders.created_at >= month_start)
            .where(Orders.status == 'completed')
        )
        monthly_row = monthly_result.one()
        monthly_sales = float(monthly_row[0] or 0)
        monthly_orders = monthly_row[1] or 0

        # Payment method breakdown
        payment_breakdown_result = await db.execute(
            select(Orders.payment_method, func.sum(Orders.total_amount), func.count(Orders.id))
            .where(Orders.status == 'completed')
            .group_by(Orders.payment_method)
        )
        payment_breakdown = {}
        for row in payment_breakdown_result.all():
            method = row[0] or 'Cash on Pickup'
            payment_breakdown[method] = {
                "revenue": float(row[1] or 0),
                "orders": row[2] or 0,
            }

        # Today's payment breakdown
        today_payment_result = await db.execute(
            select(Orders.payment_method, func.sum(Orders.total_amount), func.count(Orders.id))
            .where(Orders.created_at >= today_start)
            .where(Orders.status == 'completed')
            .group_by(Orders.payment_method)
        )
        today_payment_breakdown = {}
        for row in today_payment_result.all():
            method = row[0] or 'Cash on Pickup'
            today_payment_breakdown[method] = {
                "revenue": float(row[1] or 0),
                "orders": row[2] or 0,
            }

        # --- Fee Reports ---
        # Service Fee collected (by period)
        service_fee_today_result = await db.execute(
            select(func.sum(Orders.service_fee))
            .where(Orders.created_at >= today_start)
            .where(Orders.status == 'completed')
        )
        service_fee_today = float(service_fee_today_result.scalar() or 0)

        service_fee_week_result = await db.execute(
            select(func.sum(Orders.service_fee))
            .where(Orders.created_at >= week_start)
            .where(Orders.status == 'completed')
        )
        service_fee_week = float(service_fee_week_result.scalar() or 0)

        service_fee_month_result = await db.execute(
            select(func.sum(Orders.service_fee))
            .where(Orders.created_at >= month_start)
            .where(Orders.status == 'completed')
        )
        service_fee_month = float(service_fee_month_result.scalar() or 0)

        service_fee_year_result = await db.execute(
            select(func.sum(Orders.service_fee))
            .where(Orders.created_at >= year_start)
            .where(Orders.status == 'completed')
        )
        service_fee_year = float(service_fee_year_result.scalar() or 0)

        service_fee_all_result = await db.execute(
            select(func.sum(Orders.service_fee))
            .where(Orders.status == 'completed')
        )
        service_fee_all = float(service_fee_all_result.scalar() or 0)

        # Small Order Fee collected (by period)
        small_order_fee_today_result = await db.execute(
            select(func.sum(Orders.small_order_fee))
            .where(Orders.created_at >= today_start)
            .where(Orders.status == 'completed')
        )
        small_order_fee_today = float(small_order_fee_today_result.scalar() or 0)

        small_order_fee_week_result = await db.execute(
            select(func.sum(Orders.small_order_fee))
            .where(Orders.created_at >= week_start)
            .where(Orders.status == 'completed')
        )
        small_order_fee_week = float(small_order_fee_week_result.scalar() or 0)

        small_order_fee_month_result = await db.execute(
            select(func.sum(Orders.small_order_fee))
            .where(Orders.created_at >= month_start)
            .where(Orders.status == 'completed')
        )
        small_order_fee_month = float(small_order_fee_month_result.scalar() or 0)

        small_order_fee_year_result = await db.execute(
            select(func.sum(Orders.small_order_fee))
            .where(Orders.created_at >= year_start)
            .where(Orders.status == 'completed')
        )
        small_order_fee_year = float(small_order_fee_year_result.scalar() or 0)

        small_order_fee_all_result = await db.execute(
            select(func.sum(Orders.small_order_fee))
            .where(Orders.status == 'completed')
        )
        small_order_fee_all = float(small_order_fee_all_result.scalar() or 0)

        # Best selling items - parse items_json from recent orders
        recent_orders_result = await db.execute(
            select(Orders.items_json)
            .where(Orders.status == 'completed')
            .order_by(desc(Orders.created_at))
            .limit(200)
        )
        item_counts: dict = {}
        for row in recent_orders_result.scalars().all():
            try:
                import json
                items = json.loads(row)
                for item in items:
                    name = item.get("name", "Unknown")
                    qty = item.get("quantity", 1)
                    item_counts[name] = item_counts.get(name, 0) + qty
            except (json.JSONDecodeError, TypeError):
                pass

        best_selling = sorted(item_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        best_selling_items = [{"name": name, "quantity": qty} for name, qty in best_selling]

        return {
            "total_orders": total_orders,
            "daily_sales": daily_sales,
            "weekly_sales": weekly_sales,
            "monthly_sales": monthly_sales,
            "daily_orders": daily_orders,
            "weekly_orders": weekly_orders,
            "monthly_orders": monthly_orders,
            "best_selling_items": best_selling_items,
            "payment_breakdown": payment_breakdown,
            "today_payment_breakdown": today_payment_breakdown,
            "fee_report": {
                "service_fee": {
                    "today": service_fee_today,
                    "week": service_fee_week,
                    "month": service_fee_month,
                    "year": service_fee_year,
                    "all": service_fee_all,
                },
                "small_order_fee": {
                    "today": small_order_fee_today,
                    "week": small_order_fee_week,
                    "month": small_order_fee_month,
                    "year": small_order_fee_year,
                    "all": small_order_fee_all,
                },
            },
        }
    except Exception as e:
        logging.error(f"Failed to get sales report: {e}")
        raise HTTPException(status_code=500, detail=str(e))
