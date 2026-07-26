# @File: backend/routers/rider.py
# @Desc: Rider panel API routes for delivery management
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, and_
from typing import Optional
from datetime import datetime, timezone, timedelta

from core.database import get_db
from models.riders import Riders
from models.delivery_assignments import Delivery_assignments
from models.orders import Orders

router = APIRouter(prefix="/api/v1/rider", tags=["rider"])


class RiderLoginRequest(BaseModel):
    phone: str
    pin: str


class DeliveryStatusUpdate(BaseModel):
    status: str  # picked_up, on_the_way, delivered


class AssignDeliveryRequest(BaseModel):
    order_id: int
    rider_id: int
    customer_lat: Optional[float] = None
    customer_lng: Optional[float] = None
    customer_address: Optional[str] = ""
    customer_name: Optional[str] = ""
    customer_phone: Optional[str] = ""
    delivery_charge: Optional[float] = 0
    distance_km: Optional[float] = None
    zone_name: Optional[str] = None


class CreateRiderRequest(BaseModel):
    name: str
    phone: str
    pin: str
    delivery_charge: Optional[float] = 0
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None


@router.post("/login")
async def rider_login(
    data: RiderLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Rider login with phone + PIN - no auth required"""
    try:
        result = await db.execute(
            select(Riders).where(
                Riders.phone == data.phone,
                Riders.pin == data.pin,
                Riders.is_active == True,
            )
        )
        rider = result.scalar_one_or_none()

        if not rider:
            raise HTTPException(status_code=401, detail="Invalid phone or PIN")

        # Mark rider as online immediately on login
        rider.last_heartbeat = datetime.now(timezone.utc)
        await db.commit()

        return {
            "success": True,
            "rider": {
                "id": rider.id,
                "name": rider.name,
                "phone": rider.phone,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Rider login failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/heartbeat/{rider_id}")
async def rider_heartbeat(
    rider_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Rider sends heartbeat every 15s to indicate they are online"""
    try:
        result = await db.execute(select(Riders).where(Riders.id == rider_id))
        rider = result.scalar_one_or_none()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        rider.last_heartbeat = datetime.now(timezone.utc)
        await db.commit()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to update rider heartbeat: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/deliveries/{rider_id}")
async def get_rider_deliveries(
    rider_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get assigned deliveries for a rider"""
    try:
        result = await db.execute(
            select(Delivery_assignments)
            .where(Delivery_assignments.rider_id == rider_id)
            .order_by(desc(Delivery_assignments.created_at))
            .limit(50)
        )
        assignments = result.scalars().all()

        items = []
        for a in assignments:
            # Get order details
            order_result = await db.execute(
                select(Orders).where(Orders.id == a.order_id)
            )
            order = order_result.scalar_one_or_none()

            items.append({
                "id": a.id,
                "order_id": a.order_id,
                "status": a.status,
                "customer_lat": a.customer_lat,
                "customer_lng": a.customer_lng,
                "customer_address": a.customer_address,
                "customer_name": a.customer_name,
                "customer_phone": a.customer_phone,
                "order_total": order.total_amount if order else 0,
                "order_items": order.items_json if order else "[]",
                "order_status": order.status if order else "unknown",
                "delivery_charge": a.delivery_charge or 0,
                "distance_km": a.distance_km,
                "zone_name": a.zone_name,
                "tip_amount": (order.tip_amount or 0) if order and hasattr(order, 'tip_amount') and order.tip_type == 'rider' else 0,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            })

        return {"items": items}
    except Exception as e:
        logging.error(f"Failed to get rider deliveries: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/deliveries/{assignment_id}/status")
async def update_delivery_status(
    assignment_id: int,
    data: DeliveryStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update delivery status"""
    valid_statuses = ["assigned", "picked_up", "on_the_way", "delivered"]
    if data.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    try:
        result = await db.execute(
            select(Delivery_assignments).where(Delivery_assignments.id == assignment_id)
        )
        assignment = result.scalar_one_or_none()

        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")

        assignment.status = data.status

        # Also update the order status
        if data.status == "delivered":
            order_result = await db.execute(
                select(Orders).where(Orders.id == assignment.order_id)
            )
            order = order_result.scalar_one_or_none()
            if order:
                order.status = "completed"

        await db.commit()
        return {"success": True, "status": data.status}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to update delivery status: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# Admin endpoints for rider management - no Atoms auth required
# (admin uses localStorage PIN-based auth in frontend)
@router.post("/admin/create")
async def create_rider(
    data: CreateRiderRequest,
    db: AsyncSession = Depends(get_db),
):
    """Admin creates a new rider"""
    try:
        rider = Riders(
            name=data.name,
            phone=data.phone,
            pin=data.pin,
            is_active=True,
            delivery_charge=data.delivery_charge or 0,
            shift_start=data.shift_start,
            shift_end=data.shift_end,
        )
        db.add(rider)
        await db.commit()
        await db.refresh(rider)
        return {"success": True, "rider": {"id": rider.id, "name": rider.name, "phone": rider.phone, "delivery_charge": rider.delivery_charge}}
    except Exception as e:
        logging.error(f"Failed to create rider: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/list")
async def list_riders(
    db: AsyncSession = Depends(get_db),
):
    """Admin gets all riders - no Atoms auth required (admin uses PIN auth)"""
    try:
        result = await db.execute(select(Riders).order_by(desc(Riders.created_at)))
        riders = result.scalars().all()
        items = [
            {
                "id": r.id, "name": r.name, "phone": r.phone, "is_active": r.is_active,
                "delivery_charge": r.delivery_charge or 0,
                "shift_start": r.shift_start,
                "shift_end": r.shift_end,
            }
            for r in riders
        ]
        return {"items": items}
    except Exception as e:
        logging.error(f"Failed to list riders: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/assign")
async def assign_delivery(
    data: AssignDeliveryRequest,
    db: AsyncSession = Depends(get_db),
):
    """Admin assigns a delivery order to a rider"""
    try:
        # Check if already assigned
        existing = await db.execute(
            select(Delivery_assignments).where(
                Delivery_assignments.order_id == data.order_id,
                Delivery_assignments.status != "delivered",
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Order already assigned to a rider")

        assignment = Delivery_assignments(
            order_id=data.order_id,
            rider_id=data.rider_id,
            status="assigned",
            customer_lat=data.customer_lat,
            customer_lng=data.customer_lng,
            customer_address=data.customer_address or "",
            customer_name=data.customer_name or "",
            customer_phone=data.customer_phone or "",
            delivery_charge=data.delivery_charge or 0,
            distance_km=data.distance_km,
            zone_name=data.zone_name,
        )
        db.add(assignment)
        await db.commit()
        await db.refresh(assignment)
        return {"success": True, "assignment_id": assignment.id}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to assign delivery: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


class UpdateLocationRequest(BaseModel):
    lat: float
    lng: float


@router.post("/location/{rider_id}")
async def update_rider_location(
    rider_id: int,
    data: UpdateLocationRequest,
    db: AsyncSession = Depends(get_db),
):
    """Rider sends their GPS location periodically"""
    try:
        from datetime import datetime, timezone
        result = await db.execute(select(Riders).where(Riders.id == rider_id))
        rider = result.scalar_one_or_none()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        rider.current_lat = data.lat
        rider.current_lng = data.lng
        rider.location_updated_at = datetime.now(timezone.utc)
        await db.commit()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to update rider location: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/locations")
async def get_rider_locations(
    db: AsyncSession = Depends(get_db),
):
    """Admin gets all active riders with their current locations"""
    try:
        result = await db.execute(
            select(Riders).where(Riders.is_active == True)
        )
        riders = result.scalars().all()

        # Also get active delivery counts per rider
        from sqlalchemy import func
        delivery_counts = {}
        count_result = await db.execute(
            select(
                Delivery_assignments.rider_id,
                func.count(Delivery_assignments.id).label("count")
            ).where(
                Delivery_assignments.status.in_(["assigned", "picked_up", "on_the_way"])
            ).group_by(Delivery_assignments.rider_id)
        )
        for row in count_result:
            delivery_counts[row[0]] = row[1]

        items = []
        for r in riders:
            items.append({
                "id": r.id,
                "name": r.name,
                "phone": r.phone,
                "is_active": r.is_active,
                "current_lat": r.current_lat,
                "current_lng": r.current_lng,
                "location_updated_at": r.location_updated_at.isoformat() if r.location_updated_at else None,
                "active_deliveries": delivery_counts.get(r.id, 0),
            })
        return {"items": items}
    except Exception as e:
        logging.error(f"Failed to get rider locations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class UpdateRiderRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    pin: Optional[str] = None
    is_active: Optional[bool] = None
    delivery_charge: Optional[float] = None
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None


@router.put("/admin/{rider_id}")
async def update_rider(
    rider_id: int,
    data: UpdateRiderRequest,
    db: AsyncSession = Depends(get_db),
):
    """Admin updates a rider's info"""
    try:
        result = await db.execute(select(Riders).where(Riders.id == rider_id))
        rider = result.scalar_one_or_none()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        if data.name is not None:
            rider.name = data.name
        if data.phone is not None:
            rider.phone = data.phone
        if data.pin is not None:
            rider.pin = data.pin
        if data.is_active is not None:
            rider.is_active = data.is_active
        if data.delivery_charge is not None:
            rider.delivery_charge = data.delivery_charge
        if data.shift_start is not None:
            rider.shift_start = data.shift_start
        if data.shift_end is not None:
            rider.shift_end = data.shift_end
        await db.commit()
        await db.refresh(rider)
        return {"success": True, "rider": {"id": rider.id, "name": rider.name, "phone": rider.phone, "is_active": rider.is_active, "delivery_charge": rider.delivery_charge, "shift_start": rider.shift_start, "shift_end": rider.shift_end}}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to update rider: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/admin/{rider_id}")
async def delete_rider(
    rider_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Admin deletes a rider permanently"""
    try:
        result = await db.execute(select(Riders).where(Riders.id == rider_id))
        rider = result.scalar_one_or_none()
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        await db.delete(rider)
        await db.commit()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to delete rider: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ===================== RIDER DASHBOARD STATS =====================

@router.get("/stats/{rider_id}")
async def get_rider_stats(
    rider_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get rider's delivery stats: today, week, month, earnings, cash/card breakdown"""
    try:
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=now.weekday())
        month_start = today_start.replace(day=1)

        # Get all delivered assignments for this rider
        all_deliveries = await db.execute(
            select(Delivery_assignments).where(
                Delivery_assignments.rider_id == rider_id,
                Delivery_assignments.status == "delivered",
            )
        )
        all_delivered = all_deliveries.scalars().all()

        # Get pending (non-delivered) assignments
        pending_result = await db.execute(
            select(Delivery_assignments).where(
                Delivery_assignments.rider_id == rider_id,
                Delivery_assignments.status.in_(["assigned", "picked_up", "on_the_way"]),
            )
        )
        pending_assignments = pending_result.scalars().all()

        # Collect order IDs for delivered
        delivered_order_ids = [a.order_id for a in all_delivered]

        # Get order details for earnings calculation
        total_earnings = 0.0
        delivery_charges_earned = 0.0
        today_delivery_earnings = 0.0
        week_delivery_earnings = 0.0
        month_delivery_earnings = 0.0
        tips_earned = 0.0
        today_tips = 0.0
        week_tips = 0.0
        month_tips = 0.0
        cash_collected = 0.0
        card_orders = 0
        today_count = 0
        week_count = 0
        month_count = 0

        if delivered_order_ids:
            orders_result = await db.execute(
                select(Orders).where(Orders.id.in_(delivered_order_ids))
            )
            orders_map = {o.id: o for o in orders_result.scalars().all()}

            for assignment in all_delivered:
                order = orders_map.get(assignment.order_id)
                if not order:
                    continue

                order_amount = order.total_amount or 0
                total_earnings += order_amount
                # Delivery charge earned = zone-based charge stored on assignment
                assignment_delivery_charge = assignment.delivery_charge or 0
                delivery_charges_earned += assignment_delivery_charge

                # Tips earned by rider
                order_tip = 0.0
                if hasattr(order, 'tip_amount') and order.tip_amount and order.tip_type == 'rider':
                    order_tip = order.tip_amount or 0
                    tips_earned += order_tip

                if order.payment_method and "cash" in order.payment_method.lower():
                    cash_collected += order_amount
                else:
                    card_orders += 1

                # Time-based counts
                assignment_time = assignment.updated_at or assignment.created_at
                if assignment_time:
                    if hasattr(assignment_time, 'tzinfo') and assignment_time.tzinfo is None:
                        assignment_time = assignment_time.replace(tzinfo=timezone.utc)
                    if assignment_time >= today_start:
                        today_count += 1
                        today_delivery_earnings += assignment_delivery_charge
                        today_tips += order_tip
                    if assignment_time >= week_start:
                        week_count += 1
                        week_delivery_earnings += assignment_delivery_charge
                        week_tips += order_tip
                    if assignment_time >= month_start:
                        month_count += 1
                        month_delivery_earnings += assignment_delivery_charge
                        month_tips += order_tip

        return {
            "today_deliveries": today_count,
            "week_deliveries": week_count,
            "month_deliveries": month_count,
            "total_deliveries": len(all_delivered),
            "total_earnings": round(total_earnings, 2),
            "delivery_charges_earned": round(delivery_charges_earned, 2),
            "today_delivery_earnings": round(today_delivery_earnings, 2),
            "week_delivery_earnings": round(week_delivery_earnings, 2),
            "month_delivery_earnings": round(month_delivery_earnings, 2),
            "tips_earned": round(tips_earned, 2),
            "today_tips": round(today_tips, 2),
            "week_tips": round(week_tips, 2),
            "month_tips": round(month_tips, 2),
            "cash_collected": round(cash_collected, 2),
            "card_orders": card_orders,
            "pending_orders": len(pending_assignments),
            "completed_orders": len(all_delivered),
        }
    except Exception as e:
        logging.error(f"Failed to get rider stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===================== ADMIN RIDER REPORTS =====================

@router.get("/admin/reports")
async def get_admin_rider_reports(
    db: AsyncSession = Depends(get_db),
):
    """Admin gets complete report of all riders with stats"""
    try:
        # Get all riders
        riders_result = await db.execute(select(Riders).order_by(desc(Riders.created_at)))
        riders = riders_result.scalars().all()

        # Get all delivery assignments
        all_assignments_result = await db.execute(
            select(Delivery_assignments)
        )
        all_assignments = all_assignments_result.scalars().all()

        # Get all orders for earnings
        order_ids = list(set(a.order_id for a in all_assignments))
        orders_map = {}
        if order_ids:
            orders_result = await db.execute(
                select(Orders).where(Orders.id.in_(order_ids))
            )
            orders_map = {o.id: o for o in orders_result.scalars().all()}

        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        reports = []
        for rider in riders:
            rider_assignments = [a for a in all_assignments if a.rider_id == rider.id]
            delivered = [a for a in rider_assignments if a.status == "delivered"]
            pending = [a for a in rider_assignments if a.status in ("assigned", "picked_up", "on_the_way")]

            total_earnings = 0.0
            delivery_charges_earned = 0.0
            cash_collected = 0.0
            card_orders = 0
            today_count = 0

            for a in delivered:
                order = orders_map.get(a.order_id)
                if not order:
                    continue
                amount = order.total_amount or 0
                total_earnings += amount
                delivery_charges_earned += (a.delivery_charge or 0)
                if order.payment_method and "cash" in order.payment_method.lower():
                    cash_collected += amount
                else:
                    card_orders += 1
                # Today count
                a_time = a.updated_at or a.created_at
                if a_time:
                    if hasattr(a_time, 'tzinfo') and a_time.tzinfo is None:
                        a_time = a_time.replace(tzinfo=timezone.utc)
                    if a_time >= today_start:
                        today_count += 1

            # Determine online status based on heartbeat (60s threshold) or location update (2 min threshold)
            is_online = False
            if hasattr(rider, 'last_heartbeat') and rider.last_heartbeat:
                hb_time = rider.last_heartbeat
                if hasattr(hb_time, 'tzinfo') and hb_time.tzinfo is None:
                    hb_time = hb_time.replace(tzinfo=timezone.utc)
                is_online = (now - hb_time).total_seconds() < 60  # 60s heartbeat threshold
            if not is_online and rider.location_updated_at:
                loc_time = rider.location_updated_at
                if hasattr(loc_time, 'tzinfo') and loc_time.tzinfo is None:
                    loc_time = loc_time.replace(tzinfo=timezone.utc)
                is_online = (now - loc_time).total_seconds() < 120  # 2 min location threshold

            reports.append({
                "id": rider.id,
                "name": rider.name,
                "phone": rider.phone,
                "is_active": rider.is_active,
                "is_online": is_online,
                "total_orders": len(delivered),
                "today_orders": today_count,
                "pending_orders": len(pending),
                "total_earnings": round(total_earnings, 2),
                "delivery_charges_earned": round(delivery_charges_earned, 2),
                "cash_collected": round(cash_collected, 2),
                "card_orders": card_orders,
                "current_lat": rider.current_lat,
                "current_lng": rider.current_lng,
                "location_updated_at": rider.location_updated_at.isoformat() if rider.location_updated_at else None,
                "shift_start": rider.shift_start,
                "shift_end": rider.shift_end,
            })

        return {"items": reports}
    except Exception as e:
        logging.error(f"Failed to get admin rider reports: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===================== ADMIN REASSIGN ORDER =====================

class ReassignDeliveryRequest(BaseModel):
    assignment_id: int
    new_rider_id: int


@router.post("/admin/reassign")
async def reassign_delivery(
    data: ReassignDeliveryRequest,
    db: AsyncSession = Depends(get_db),
):
    """Admin reassigns a delivery to a different rider"""
    try:
        result = await db.execute(
            select(Delivery_assignments).where(Delivery_assignments.id == data.assignment_id)
        )
        assignment = result.scalar_one_or_none()
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        if assignment.status == "delivered":
            raise HTTPException(status_code=400, detail="Cannot reassign delivered order")

        # Verify new rider exists and is active
        rider_result = await db.execute(
            select(Riders).where(Riders.id == data.new_rider_id, Riders.is_active == True)
        )
        new_rider = rider_result.scalar_one_or_none()
        if not new_rider:
            raise HTTPException(status_code=404, detail="Rider not found or inactive")

        assignment.rider_id = data.new_rider_id
        assignment.status = "assigned"
        await db.commit()
        return {"success": True, "new_rider_name": new_rider.name}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to reassign delivery: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ===================== DELIVERY ETA FOR CUSTOMER =====================

@router.get("/delivery-eta/{order_id}")
async def get_delivery_eta(
    order_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Customer gets ETA for their delivery order"""
    try:
        # Find assignment for this order
        result = await db.execute(
            select(Delivery_assignments).where(
                Delivery_assignments.order_id == order_id,
                Delivery_assignments.status != "delivered",
            )
        )
        assignment = result.scalar_one_or_none()

        if not assignment:
            # Check if delivered
            delivered_result = await db.execute(
                select(Delivery_assignments).where(
                    Delivery_assignments.order_id == order_id,
                    Delivery_assignments.status == "delivered",
                )
            )
            if delivered_result.scalar_one_or_none():
                return {"status": "delivered", "eta_minutes": 0, "rider_name": None}
            return {"status": "no_rider", "eta_minutes": None, "rider_name": None}

        # Get rider info
        rider_result = await db.execute(
            select(Riders).where(Riders.id == assignment.rider_id)
        )
        rider = rider_result.scalar_one_or_none()

        # Calculate ETA based on status
        eta_minutes = None
        if assignment.status == "assigned":
            eta_minutes = 30  # Default: 30 min from assignment
        elif assignment.status == "picked_up":
            eta_minutes = 20  # Picked up, ~20 min
        elif assignment.status == "on_the_way":
            eta_minutes = 10  # On the way, ~10 min

        # If rider has GPS and customer has GPS, calculate distance-based ETA
        if rider and rider.current_lat and rider.current_lng and assignment.customer_lat and assignment.customer_lng:
            import math
            lat1, lng1 = math.radians(rider.current_lat), math.radians(rider.current_lng)
            lat2, lng2 = math.radians(assignment.customer_lat), math.radians(assignment.customer_lng)
            dlat = lat2 - lat1
            dlng = lng2 - lng1
            a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng/2)**2
            c = 2 * math.asin(math.sqrt(a))
            distance_km = 6371 * c
            # Assume 30 km/h average speed in city
            time_minutes = int((distance_km / 30) * 60)
            if assignment.status == "on_the_way":
                eta_minutes = max(time_minutes, 3)  # At least 3 min
            elif assignment.status == "picked_up":
                eta_minutes = time_minutes + 5  # +5 min for prep

        return {
            "status": assignment.status,
            "eta_minutes": eta_minutes,
            "rider_name": rider.name if rider else None,
            "rider_phone": rider.phone if rider else None,
            "rider_lat": rider.current_lat if rider else None,
            "rider_lng": rider.current_lng if rider else None,
        }
    except Exception as e:
        logging.error(f"Failed to get delivery ETA: {e}")
        raise HTTPException(status_code=500, detail=str(e))