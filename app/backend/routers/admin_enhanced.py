# @File: backend/routers/admin_enhanced.py
# @Desc: Enhanced admin API routes - order deletion, activity logs, feedback replies, staff notes, data reset
import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, delete
from typing import Optional

from core.database import get_db
from routers.fai_fai_admin_control import AdminIdentity, get_current_admin
from models.orders import Orders
from models.feedbacks import Feedbacks
from models.activity_logs import Activity_logs
from models.customer_sessions import Customer_sessions
from models.delivery_assignments import Delivery_assignments
from models.notifications import Notifications
from models.app_notifications import App_notifications
from models.menu_items import Menu_items
from models.categories import Categories
from models.extras import Extras

router = APIRouter(prefix="/api/v1/admin", tags=["admin-enhanced"])
logger = logging.getLogger(__name__)


class ActivityLogCreate(BaseModel):
    action_type: str
    entity_type: str
    entity_id: Optional[str] = None
    details: Optional[str] = None
    admin_name: str


class FeedbackReply(BaseModel):
    reply_text: str
    admin_name: str


class StaffNote(BaseModel):
    note: str
    admin_name: str


class SelectiveResetRequest(BaseModel):
    reset_type: str  # 'orders', 'sales', 'menu', 'customers', 'rider_history', 'feedback', 'activity_logs', 'notifications', 'all'


async def log_activity(
    db: AsyncSession,
    user_id: str,
    action_type: str,
    entity_type: str,
    entity_id: str = "",
    details: str = "",
    admin_name: str = "Admin",
):
    """Helper to create activity log entry"""
    try:
        log_entry = Activity_logs(
            user_id=user_id,
            action_type=action_type,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
            admin_name=admin_name,
        )
        db.add(log_entry)
        await db.commit()
    except Exception as e:
        logger.error(f"Failed to log activity: {e}")
        await db.rollback()


@router.delete("/orders/{order_id}")
async def delete_order(
    order_id: int,
    current_user: AdminIdentity = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete an order"""
    try:
        result = await db.execute(select(Orders).where(Orders.id == order_id))
        order = result.scalar_one_or_none()

        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        # Store order info for activity log
        order_info = {
            "customer_name": order.customer_name,
            "customer_phone": order.customer_phone,
            "total_amount": order.total_amount,
            "status": order.status,
            "items_json": order.items_json[:200] if order.items_json else "",
        }

        await db.delete(order)
        await db.commit()

        # Log the deletion
        await log_activity(
            db=db,
            user_id=current_user.subject,
            action_type="order_delete",
            entity_type="order",
            entity_id=str(order_id),
            details=json.dumps(order_info),
            admin_name="Admin",
        )

        return {"success": True, "message": f"Order #{order_id} deleted permanently"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete order: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/activity-log")
async def create_activity_log(
    data: ActivityLogCreate,
    current_user: AdminIdentity = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create an activity log entry"""
    try:
        log_entry = Activity_logs(
            user_id=current_user.subject,
            action_type=data.action_type,
            entity_type=data.entity_type,
            entity_id=data.entity_id or "",
            details=data.details or "",
            admin_name=data.admin_name,
        )
        db.add(log_entry)
        await db.commit()
        await db.refresh(log_entry)

        return {"success": True, "id": log_entry.id}
    except Exception as e:
        logger.error(f"Failed to create activity log: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/activity-logs")
async def get_activity_logs(
    action_type: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
    current_user: AdminIdentity = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get paginated activity logs"""
    try:
        query = select(Activity_logs).order_by(desc(Activity_logs.created_at))

        if action_type and action_type != "all":
            query = query.where(Activity_logs.action_type == action_type)

        query = query.offset(skip).limit(limit)
        result = await db.execute(query)
        logs = result.scalars().all()

        items = []
        for log in logs:
            items.append({
                "id": log.id,
                "action_type": log.action_type,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "details": log.details,
                "admin_name": log.admin_name,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            })

        return {"items": items}
    except Exception as e:
        logger.error(f"Failed to get activity logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/feedback/{feedback_id}/reply")
async def reply_to_feedback(
    feedback_id: int,
    data: FeedbackReply,
    current_user: AdminIdentity = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin reply to a customer feedback"""
    try:
        result = await db.execute(select(Feedbacks).where(Feedbacks.id == feedback_id))
        feedback = result.scalar_one_or_none()

        if not feedback:
            raise HTTPException(status_code=404, detail="Feedback not found")

        # Store reply as JSON in comment field (append to existing comment)
        existing_comment = feedback.comment or ""
        reply_data = {
            "admin_reply": data.reply_text,
            "reply_by": data.admin_name,
            "reply_date": datetime.now().isoformat(),
        }

        # Append reply marker to comment
        if existing_comment:
            new_comment = f"{existing_comment}\n---ADMIN_REPLY---\n{json.dumps(reply_data)}"
        else:
            new_comment = f"---ADMIN_REPLY---\n{json.dumps(reply_data)}"

        feedback.comment = new_comment
        await db.commit()

        # Log the reply
        await log_activity(
            db=db,
            user_id=current_user.subject,
            action_type="feedback_reply",
            entity_type="feedback",
            entity_id=str(feedback_id),
            details=json.dumps({"reply_text": data.reply_text[:200], "customer_name": feedback.customer_name}),
            admin_name=data.admin_name,
        )

        return {"success": True, "message": "Reply added successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reply to feedback: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/orders/{order_id}/notes")
async def add_staff_note(
    order_id: int,
    data: StaffNote,
    current_user: AdminIdentity = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Add internal staff note to an order"""
    try:
        result = await db.execute(select(Orders).where(Orders.id == order_id))
        order = result.scalar_one_or_none()

        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        # Append staff note with timestamp
        timestamp = datetime.now().strftime("%d/%m %H:%M")
        staff_note = f" | [STAFF {data.admin_name} {timestamp}]: {data.note}"

        existing_notes = order.order_notes or ""
        order.order_notes = existing_notes + staff_note
        await db.commit()

        # Log the action
        await log_activity(
            db=db,
            user_id=current_user.subject,
            action_type="staff_note",
            entity_type="order",
            entity_id=str(order_id),
            details=json.dumps({"note": data.note[:200]}),
            admin_name=data.admin_name,
        )

        return {"success": True, "message": "Staff note added", "order_notes": order.order_notes}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to add staff note: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/menu/{item_id}/toggle-popular")
async def toggle_popular(
    item_id: int,
    current_user: AdminIdentity = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Toggle is_popular flag on a menu item"""
    try:
        result = await db.execute(select(Menu_items).where(Menu_items.id == item_id))
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Menu item not found")
        item.is_popular = not (item.is_popular or False)
        await db.commit()
        return {"success": True, "is_popular": item.is_popular, "item_name": item.name}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to toggle popular: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/popular-items")
async def get_popular_items(
    db: AsyncSession = Depends(get_db),
):
    """Get all items marked as popular (public - no auth needed)"""
    try:
        result = await db.execute(
            select(Menu_items).where(Menu_items.is_popular == True, Menu_items.is_active == True)
        )
        items = result.scalars().all()
        return {"items": [
            {
                "id": i.id, "name": i.name, "description": i.description,
                "price_medium": i.price_medium, "price_large": i.price_large,
                "sizes_json": i.sizes_json, "image_url": i.image_url,
                "category_id": i.category_id, "has_extras": i.has_extras,
            }
            for i in items
        ]}
    except Exception as e:
        logger.error(f"Failed to get popular items: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset-data")
async def reset_all_data(
    current_user: AdminIdentity = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reset all test data - deletes orders, delivery assignments, customer sessions,
    activity logs, notifications. Keeps menu items, categories, extras, settings, riders, deals, offers."""
    try:
        # Delete in correct order (foreign key dependencies)
        await db.execute(delete(Delivery_assignments))
        await db.execute(delete(Orders))
        await db.execute(delete(Customer_sessions))
        await db.execute(delete(Activity_logs))
        await db.execute(delete(Feedbacks))
        await db.execute(delete(Notifications))
        await db.execute(delete(App_notifications))
        await db.commit()

        return {
            "success": True,
            "message": "All test data cleared successfully. Orders, deliveries, customer sessions, activity logs, feedback, and notifications have been reset.",
        }
    except Exception as e:
        logger.error(f"Failed to reset data: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset-selective")
async def reset_selective_data(
    data: SelectiveResetRequest,
    current_user: AdminIdentity = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Selectively reset specific data categories"""
    try:
        reset_type = data.reset_type
        message = ""

        if reset_type == "orders":
            await db.execute(delete(Delivery_assignments))
            await db.execute(delete(Orders))
            message = "All orders and delivery assignments have been deleted."

        elif reset_type == "sales":
            # Sales data is derived from orders - reset orders to reset sales
            await db.execute(delete(Delivery_assignments))
            await db.execute(delete(Orders))
            message = "All sales/revenue data (orders) have been deleted."

        elif reset_type == "menu":
            await db.execute(delete(Extras))
            await db.execute(delete(Menu_items))
            await db.execute(delete(Categories))
            message = "All menu items, categories, and extras have been deleted."

        elif reset_type == "customers":
            await db.execute(delete(Customer_sessions))
            message = "All customer session data has been deleted."

        elif reset_type == "rider_history":
            await db.execute(delete(Delivery_assignments))
            message = "All rider delivery history has been deleted."

        elif reset_type == "feedback":
            await db.execute(delete(Feedbacks))
            message = "All customer feedback has been deleted."

        elif reset_type == "activity_logs":
            await db.execute(delete(Activity_logs))
            message = "All activity logs have been deleted."

        elif reset_type == "notifications":
            await db.execute(delete(Notifications))
            await db.execute(delete(App_notifications))
            message = "All notifications have been deleted."

        elif reset_type == "all":
            await db.execute(delete(Delivery_assignments))
            await db.execute(delete(Orders))
            await db.execute(delete(Customer_sessions))
            await db.execute(delete(Activity_logs))
            await db.execute(delete(Feedbacks))
            await db.execute(delete(Notifications))
            await db.execute(delete(App_notifications))
            message = "All data has been reset (orders, customers, deliveries, logs, feedback, notifications). Menu, settings, riders, deals, and offers are preserved."

        else:
            raise HTTPException(status_code=400, detail=f"Unknown reset type: {reset_type}")

        await db.commit()

        return {"success": True, "message": message, "reset_type": reset_type}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to selective reset data: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
