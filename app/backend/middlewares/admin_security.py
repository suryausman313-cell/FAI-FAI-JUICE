"""Protect database-changing admin routes with the Fai Fai admin session.

Customer-facing reads and customer actions remain public.  Only write routes
that change menu/settings/admin data are handled here so every generated
entity router receives the same protection without duplicating auth code.
"""

from __future__ import annotations

import hmac
import os
from typing import Optional

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from core.database import db_manager


ENTITY_PERMISSIONS = {
    "activity_logs": "logs",
    "app_notifications": "notifications",
    "categories": "menu",
    "customer_sessions": "customers",
    "deals": "deals",
    "delivery_assignments": "riders",
    "delivery_zones": "settings",
    "extras": "menu",
    "feedbacks": "feedback",
    "menu_items": "menu",
    "notifications": "notifications",
    "offers": "deals",
    "restaurant_settings": "settings",
    "riders": "riders",
}

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

SENSITIVE_ENTITY_READ_PERMISSIONS = {
    "activity_logs": "logs",
    "customer_sessions": "customers",
    "delivery_assignments": "riders",
    "notifications": "notifications",
    "riders": "riders",
}


def _entity_permission(path: str, method: str) -> Optional[str]:
    prefix = "/api/v1/entities/"
    if not path.startswith(prefix):
        return None

    entity = path[len(prefix) :].split("/", 1)[0]

    if method not in MUTATING_METHODS:
        return SENSITIVE_ENTITY_READ_PERMISSIONS.get(entity)

    # Customers submit a new feedback record themselves. Editing or deleting
    # feedback is still restricted to Admin.
    if entity == "feedbacks" and method == "POST" and path.rstrip("/") == f"{prefix}feedbacks":
        return None

    return ENTITY_PERMISSIONS.get(entity)


def _required_permission(path: str, method: str) -> Optional[str]:
    entity_permission = _entity_permission(path, method)
    if entity_permission:
        return entity_permission

    if path.rstrip("/") == "/api/v1/receipt-settings" and method in MUTATING_METHODS:
        return "settings"

    if path.startswith("/api/v1/rider/admin/"):
        return "riders"

    if path.startswith("/api/v1/finance/admin/"):
        return "sales"

    if path.startswith("/api/v1/admin-push/") and method in MUTATING_METHODS:
        return "notifications"

    if path.startswith("/api/v1/admin/feedback/"):
        return "feedback"

    if path.startswith("/api/v1/admin/activity-log"):
        return "logs"

    if path.startswith("/api/v1/admin/menu/"):
        return "menu"

    if path.startswith("/api/v1/admin/reset-"):
        return "settings"

    if path.startswith("/api/v1/admin/orders/") and (
        method == "DELETE" or path.endswith("/notes")
    ):
        return "orders"

    return None


def _valid_kitchen_pin(request: Request) -> bool:
    expected = os.getenv("KITCHEN_PIN", "").strip()
    supplied = request.headers.get("X-Kitchen-Pin", "").strip()
    return bool(
        len(expected) >= 4
        and supplied
        and hmac.compare_digest(supplied, expected)
    )


async def _admin_identity(request: Request):
    authorization = request.headers.get("Authorization", "").strip()
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Admin login required")

    if not db_manager.async_session_maker:
        raise HTTPException(status_code=503, detail="Database is not ready")

    # Lazy import avoids router-discovery import cycles during app startup.
    from routers.fai_fai_admin_control import get_current_admin

    async with db_manager.async_session_maker() as db:
        return await get_current_admin(
            authorization=authorization,
            db=db,
        )


async def admin_security_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method.upper()
    permission = _required_permission(path, method)

    if not permission:
        return await call_next(request)

    # Kitchen needs read-only rider assignment/location data. Rider creation,
    # editing and assignment remain Admin-only.
    if (
        path.startswith("/api/v1/rider/admin/")
        and method == "GET"
        and _valid_kitchen_pin(request)
    ):
        return await call_next(request)

    try:
        identity = await _admin_identity(request)
        if (
            identity.role != "super_admin"
            and not bool(identity.permissions.get(permission))
        ):
            raise HTTPException(
                status_code=403,
                detail=f"{permission.title()} permission required",
            )
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    return await call_next(request)
