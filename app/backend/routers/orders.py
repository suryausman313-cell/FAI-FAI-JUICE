# @File: backend/routers/orders.py
# @Desc: Customer-facing order placement API
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import Optional

from core.database import get_db
from models.orders import Orders
from models.menu_items import Menu_items

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])


def get_guest_user_id(session_id: str) -> str:
    """Build a stable anonymous order owner ID without requiring customer login."""
    value = (session_id or "").strip()
    if len(value) < 8 or len(value) > 120:
        raise HTTPException(status_code=400, detail="Invalid customer session. Please refresh the app and try again.")
    if not all(ch.isalnum() or ch in "_-" for ch in value):
        raise HTTPException(status_code=400, detail="Invalid customer session. Please refresh the app and try again.")
    return f"guest:{value}"


class PlaceOrderRequest(BaseModel):
    session_id: str
    customer_name: str
    customer_phone: str
    order_notes: Optional[str] = ""
    payment_method: str
    total_amount: float
    service_fee: Optional[float] = 0
    small_order_fee: Optional[float] = 0
    delivery_charge: Optional[float] = 0
    tip_amount: Optional[float] = 0
    tip_type: Optional[str] = ""  # 'rider' or 'shop'
    items_json: str


class DeliveryLocationData(BaseModel):
    customer_lat: Optional[float] = None
    customer_lng: Optional[float] = None
    order_type: Optional[str] = "pickup"  # 'pickup' or 'delivery'


class PlaceOrderFullRequest(PlaceOrderRequest):
    customer_lat: Optional[float] = None
    customer_lng: Optional[float] = None
    order_type: Optional[str] = "pickup"


@router.post("/place")
async def place_order(
    data: PlaceOrderFullRequest,
    db: AsyncSession = Depends(get_db),
):
    """Place a new order with duplicate prevention, menu validation, shop-closed check, and zone validation"""
    try:
        from datetime import datetime, timezone, timedelta

        guest_user_id = get_guest_user_id(data.session_id)

        # ===== SHOP OPEN/CLOSED CHECK =====
        from models.restaurant_settings import Restaurant_settings
        settings_result = await db.execute(select(Restaurant_settings).limit(1))
        settings = settings_result.scalar_one_or_none()

        if settings and settings.restaurant_status:
            status_lower = settings.restaurant_status.lower().strip()
            if status_lower == "closed":
                raise HTTPException(
                    status_code=403,
                    detail="Sorry, the restaurant is currently closed. Please try again during opening hours."
                )
            # Check auto-schedule if enabled
            if settings.auto_schedule_enabled and settings.auto_open_time and settings.auto_close_time:
                import re
                now_utc = datetime.now(timezone.utc)
                # Convert to UAE time (UTC+4)
                uae_offset = timedelta(hours=4)
                now_uae = now_utc + uae_offset
                current_minutes = now_uae.hour * 60 + now_uae.minute

                def parse_time_to_minutes(time_str: str) -> int:
                    """Parse HH:MM to minutes since midnight"""
                    match = re.match(r'(\d{1,2}):(\d{2})', time_str.strip())
                    if match:
                        return int(match.group(1)) * 60 + int(match.group(2))
                    return -1

                open_minutes = parse_time_to_minutes(settings.auto_open_time)
                close_minutes = parse_time_to_minutes(settings.auto_close_time)

                if open_minutes >= 0 and close_minutes >= 0:
                    # Handle overnight schedule (e.g., open 15:00, close 02:00)
                    if close_minutes < open_minutes:
                        # Overnight: open if current >= open OR current < close
                        is_open = current_minutes >= open_minutes or current_minutes < close_minutes
                    else:
                        # Same day: open if current >= open AND current < close
                        is_open = open_minutes <= current_minutes < close_minutes

                    if not is_open and status_lower != "open":
                        raise HTTPException(
                            status_code=403,
                            detail="Sorry, the restaurant is currently closed. Please try again during opening hours."
                        )

        # ===== DELIVERY ZONE VALIDATION =====
        if data.order_type == "delivery":
            # GPS coordinates are MANDATORY for delivery orders
            if data.customer_lat is None or data.customer_lng is None:
                raise HTTPException(
                    status_code=400,
                    detail="Delivery location is required. Please select your location on the map."
                )
            if True:  # Always validate when delivery
                # Validate customer is within a delivery zone
                from models.delivery_zones import Delivery_zones
                zones_result = await db.execute(
                    select(Delivery_zones).where(Delivery_zones.is_active == True)
                )
                zones = zones_result.scalars().all()

                if zones:
                    # Calculate distance from restaurant to customer
                    import math
                    rest_lat = float(settings.restaurant_lat) if settings and settings.restaurant_lat else 25.2747
                    rest_lng = float(settings.restaurant_lng) if settings and settings.restaurant_lng else 56.3450

                    def haversine_km(lat1, lon1, lat2, lon2):
                        R = 6371
                        dLat = math.radians(lat2 - lat1)
                        dLon = math.radians(lon2 - lon1)
                        a = math.sin(dLat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon / 2) ** 2
                        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

                    distance_km = haversine_km(rest_lat, rest_lng, data.customer_lat, data.customer_lng)

                    # Check if customer is within any active zone
                    # Sort zones by max_distance ascending for gap-tolerant matching
                    sorted_zones = sorted(zones, key=lambda z: z.max_distance_km)
                    matched_zone = None

                    # First pass: exact range match
                    for zone in sorted_zones:
                        if zone.min_distance_km <= distance_km <= zone.max_distance_km:
                            matched_zone = zone
                            break

                    # Second pass: gap-tolerant - find first zone whose max covers the distance
                    if not matched_zone:
                        for zone in sorted_zones:
                            if distance_km <= zone.max_distance_km:
                                matched_zone = zone
                                break

                    if not matched_zone:
                        max_zone_km = max(z.max_distance_km for z in zones)
                        raise HTTPException(
                            status_code=400,
                            detail=f"Delivery not available in your area ({distance_km:.1f} km away). We deliver within {max_zone_km:.0f} km."
                        )

                    # Verify that the matched zone has a valid charge > 0
                    matched_zone_charge = matched_zone.charge or 0
                    if matched_zone_charge <= 0:
                        logging.warning(
                            f"Delivery order rejected - zone charge is 0 for user {guest_user_id}, "
                            f"distance={distance_km:.2f}km"
                        )
                        raise HTTPException(
                            status_code=400,
                            detail="Unable to calculate delivery charge for your location. Please contact us or try again."
                        )

        # ===== MENU ITEM VALIDATION - Reject fake orders =====
        try:
            order_items = json.loads(data.items_json)
            if not isinstance(order_items, list) or len(order_items) == 0:
                raise HTTPException(status_code=400, detail="Order must contain at least one item")

            if len(order_items) > 50:
                raise HTTPException(status_code=400, detail="Order cannot contain more than 50 items")

            # Get all active menu items with prices from database
            menu_result = await db.execute(
                select(Menu_items).where(Menu_items.is_active == True)
            )
            menu_items_db = menu_result.scalars().all()

            # Build lookup: name -> menu item (for validation)
            valid_menu_map = {}
            for mi in menu_items_db:
                valid_menu_map[mi.name.lower().strip()] = mi

            if not valid_menu_map:
                # If no menu items exist at all, skip validation (initial setup)
                logging.warning("No active menu items found - skipping validation")
            else:
                # Validate each item in the order exists in the active menu
                invalid_items = []
                calculated_subtotal = 0.0

                for item in order_items:
                    item_name = (item.get("name") or "").lower().strip()
                    item_quantity = item.get("quantity", 1)
                    item_price = item.get("price", 0)

                    if not item_name:
                        invalid_items.append("(empty name)")
                        continue

                    if item_name not in valid_menu_map:
                        invalid_items.append(item.get("name", "unknown"))
                        continue

                    # Validate quantity is reasonable
                    if not isinstance(item_quantity, int) or item_quantity < 1 or item_quantity > 20:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Invalid quantity for {item.get('name')}: must be between 1 and 20"
                        )

                    # Validate price is not negative or absurdly high
                    if item_price < 0:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Invalid price for {item.get('name')}"
                        )

                    # Accumulate calculated subtotal from item prices
                    # Checkout sends each cart line total in item.price, so add it once.
                    calculated_subtotal += item_price

                if invalid_items:
                    logging.warning(
                        f"FAKE ORDER REJECTED for user {guest_user_id}: "
                        f"Invalid items: {invalid_items}. "
                        f"Valid menu has {len(valid_menu_map)} items."
                    )
                    raise HTTPException(
                        status_code=400,
                        detail=f"Order contains items not on our menu: {', '.join(invalid_items[:3])}. Please refresh and try again."
                    )

                # ===== PRICE VALIDATION - Prevent price manipulation =====
                # Allow tolerance for fees (service fee, small order fee, delivery, tips)
                # but reject if total is unreasonably low (someone trying to pay less)
                max_fees = (data.service_fee or 0) + (data.small_order_fee or 0) + (data.tip_amount or 0)
                expected_minimum = calculated_subtotal * 0.5  # Allow 50% tolerance for discounts/promos
                expected_maximum = calculated_subtotal + max_fees + 200  # Allow up to 200 AED extra for delivery + fees

                if data.total_amount < 0:
                    logging.warning(
                        f"FAKE ORDER REJECTED - negative total for user {guest_user_id}: "
                        f"total={data.total_amount}"
                    )
                    raise HTTPException(status_code=400, detail="Invalid order total")

                if calculated_subtotal > 0 and data.total_amount < expected_minimum:
                    logging.warning(
                        f"PRICE MANIPULATION REJECTED for user {guest_user_id}: "
                        f"claimed_total={data.total_amount}, calculated_subtotal={calculated_subtotal}, "
                        f"expected_min={expected_minimum}"
                    )
                    raise HTTPException(
                        status_code=400,
                        detail="Order total doesn't match item prices. Please refresh your cart and try again."
                    )

                if data.total_amount > expected_maximum:
                    logging.warning(
                        f"SUSPICIOUS ORDER for user {guest_user_id}: "
                        f"claimed_total={data.total_amount}, calculated_max={expected_maximum}"
                    )
                    raise HTTPException(
                        status_code=400,
                        detail="Order total seems incorrect. Please refresh your cart and try again."
                    )
                # ===== END PRICE VALIDATION =====

                # ===== TIP VALIDATION =====
                if (data.tip_amount or 0) < 0:
                    raise HTTPException(status_code=400, detail="Tip amount cannot be negative")
                if (data.tip_amount or 0) > 500:
                    raise HTTPException(status_code=400, detail="Tip amount exceeds maximum allowed (AED 500)")
                if data.tip_type and data.tip_type not in ('rider', 'shop', ''):
                    raise HTTPException(status_code=400, detail="Invalid tip type")
                # ===== END TIP VALIDATION =====

        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid order items format")
        except HTTPException:
            raise
        # ===== END MENU VALIDATION =====

        # ===== RATE LIMITING - Prevent order spam =====
        # Check if user has placed more than 5 orders in the last 5 minutes
        five_minutes_ago = datetime.now(timezone.utc) - timedelta(minutes=5)
        rate_check = await db.execute(
            select(Orders).where(
                Orders.user_id == guest_user_id,
                Orders.created_at >= five_minutes_ago,
            )
        )
        recent_orders = rate_check.scalars().all()
        if len(recent_orders) >= 5:
            logging.warning(f"RATE LIMIT: User {guest_user_id} attempted to place more than 5 orders in 5 minutes")
            raise HTTPException(
                status_code=429,
                detail="Too many orders placed recently. Please wait a few minutes before ordering again."
            )
        # ===== END RATE LIMITING =====

        # Duplicate order prevention: check if same user placed same items within 60 seconds
        sixty_seconds_ago = datetime.now(timezone.utc) - timedelta(seconds=60)
        duplicate_check = await db.execute(
            select(Orders).where(
                Orders.user_id == guest_user_id,
                Orders.items_json == data.items_json,
                Orders.total_amount == data.total_amount,
                Orders.created_at >= sixty_seconds_ago,
                Orders.status != "cancelled",
            ).order_by(desc(Orders.created_at)).limit(1)
        )
        existing_order = duplicate_check.scalar_one_or_none()
        if existing_order:
            # Return the existing order instead of creating a duplicate
            logging.warning(f"Duplicate order prevented for user {guest_user_id}, returning existing order {existing_order.id}")
            return {
                "success": True,
                "order_id": existing_order.id,
                "status": existing_order.status,
                "duplicate_prevented": True,
            }

        order = Orders(
            user_id=guest_user_id,
            customer_name=data.customer_name,
            customer_phone=data.customer_phone,
            pickup_time="",
            order_notes=data.order_notes or "",
            payment_method=data.payment_method,
            status="new",
            total_amount=data.total_amount,
            service_fee=data.service_fee or 0,
            small_order_fee=data.small_order_fee or 0,
            delivery_charge=data.delivery_charge or 0,
            tip_amount=data.tip_amount or 0,
            tip_type=data.tip_type or "",
            items_json=data.items_json,
        )
        db.add(order)
        await db.commit()
        await db.refresh(order)

        return {
            "success": True,
            "order_id": order.id,
            "status": order.status,
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to place order: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


class CancelOrderRequest(BaseModel):
    session_id: str
    reason: Optional[str] = ""


@router.post("/{order_id}/cancel")
async def cancel_order(
    order_id: int,
    data: CancelOrderRequest,
    db: AsyncSession = Depends(get_db),
):
    """Customer cancels their own guest order (if allowed by admin settings)."""
    try:
        guest_user_id = get_guest_user_id(data.session_id)
        result = await db.execute(
            select(Orders).where(Orders.id == order_id, Orders.user_id == guest_user_id)
        )
        order = result.scalar_one_or_none()

        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        # Determine if cancellation is allowed based on current status
        # Status flow: new -> accepted -> preparing -> ready -> completed
        # By default: cancel allowed when status is 'new' (pending)
        # Admin can configure: allow_cancel_preparing, allow_cancel_ready
        allowed_statuses = ['new']  # Always allow cancel when pending

        # Check admin settings from restaurant_settings
        from models.restaurant_settings import Restaurant_settings
        settings_result = await db.execute(select(Restaurant_settings).limit(1))
        settings = settings_result.scalar_one_or_none()

        if settings:
            if getattr(settings, 'allow_cancel_preparing', False):
                allowed_statuses.append('preparing')
            if getattr(settings, 'allow_cancel_ready', False):
                allowed_statuses.append('ready')
            # accepted is between new and preparing - allow if preparing is allowed
            if 'preparing' in allowed_statuses:
                allowed_statuses.append('accepted')

        if order.status not in allowed_statuses:
            status_msg = {
                'accepted': 'Your order has been accepted and is being processed.',
                'preparing': 'Your order is being prepared and cannot be cancelled.',
                'ready': 'Your order is ready for pickup and cannot be cancelled.',
                'completed': 'This order has already been completed.',
                'cancelled': 'This order is already cancelled.',
            }
            raise HTTPException(
                status_code=400,
                detail=status_msg.get(order.status, f"Cannot cancel order in '{order.status}' status.")
            )

        order.status = 'cancelled'
        # Append cancel reason to notes
        if data.reason:
            existing_notes = order.order_notes or ''
            order.order_notes = f"{existing_notes} | Cancelled by customer: {data.reason}"

        await db.commit()
        return {"success": True, "message": "Order cancelled successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to cancel order: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/my-orders")
async def get_my_orders(
    session_id: str = Query(..., min_length=8, max_length=120),
    db: AsyncSession = Depends(get_db),
):
    """Get orders for the current guest session, including delivery/rider info."""
    try:
        guest_user_id = get_guest_user_id(session_id)
        from models.delivery_assignments import Delivery_assignments
        from models.riders import Riders

        result = await db.execute(
            select(Orders)
            .where(Orders.user_id == guest_user_id)
            .order_by(desc(Orders.created_at))
            .limit(50)
        )
        orders = result.scalars().all()

        items = []
        for order in orders:
            order_data = {
                "id": order.id,
                "customer_name": order.customer_name,
                "customer_phone": order.customer_phone,
                "estimated_time": order.pickup_time or "",
                "order_notes": order.order_notes or "",
                "payment_method": order.payment_method,
                "status": order.status,
                "total_amount": order.total_amount,
                "service_fee": order.service_fee or 0,
                "small_order_fee": order.small_order_fee or 0,
                "delivery_charge": order.delivery_charge or 0,
                "tip_amount": order.tip_amount or 0,
                "tip_type": order.tip_type or "",
                "items_json": order.items_json,
                "created_at": order.created_at.isoformat() if order.created_at else None,
                "delivery_status": None,
                "rider_name": None,
                "rider_phone": None,
            }

            # Check if this order has a delivery assignment
            assignment_result = await db.execute(
                select(Delivery_assignments)
                .where(Delivery_assignments.order_id == order.id)
                .order_by(desc(Delivery_assignments.created_at))
                .limit(1)
            )
            assignment = assignment_result.scalar_one_or_none()

            if assignment:
                order_data["delivery_status"] = assignment.status
                # Only show rider contact info after pickup
                if assignment.status in ("picked_up", "on_the_way", "delivered"):
                    rider_result = await db.execute(
                        select(Riders).where(Riders.id == assignment.rider_id)
                    )
                    rider = rider_result.scalar_one_or_none()
                    if rider:
                        order_data["rider_name"] = rider.name
                        order_data["rider_phone"] = rider.phone

            items.append(order_data)

        return {"items": items}
    except Exception as e:
        logging.error(f"Failed to get orders: {e}")
        raise HTTPException(status_code=500, detail=str(e))
