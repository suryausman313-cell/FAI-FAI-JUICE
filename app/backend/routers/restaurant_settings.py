import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.restaurant_settings import Restaurant_settingsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/restaurant_settings", tags=["restaurant_settings"])


# ---------- Pydantic Schemas ----------
class Restaurant_settingsData(BaseModel):
    """Entity data schema (for create/update)"""
    restaurant_name: str
    phone: str = None
    address: str = None
    opening_hours: str = None
    logo_url: str = None
    restaurant_status: str = None
    busy_message: str = None
    estimated_wait_time: str = None
    delivery_enabled: bool = None
    delivery_charges: str = None
    estimated_delivery_time: str = None
    restaurant_lat: str = None
    restaurant_lng: str = None
    near_radius: str = None
    far_radius: str = None
    near_charge: str = None
    far_charge: str = None
    auto_schedule_enabled: bool = None
    auto_open_time: str = None
    auto_close_time: str = None
    service_fee_enabled: bool = None
    service_fee_amount: float = None
    service_fee_type: str = None
    small_order_fee_enabled: bool = None
    small_order_fee_amount: float = None
    small_order_fee_threshold: float = None
    service_fee_applies_to: str = None
    cash_enabled_pickup: bool = None
    card_enabled_pickup: bool = None
    cash_enabled_delivery: bool = None
    card_enabled_delivery: bool = None
    allowed_country_codes: str = None
    blog_enabled: bool = None
    allow_cancel_preparing: bool = None
    allow_cancel_ready: bool = None
    allow_modify_preparing: bool = None
    order_accept_timeout_minutes: int = None
    order_expire_timeout_minutes: int = None
    checkout_flow: str = None
    tax_percent: float = None
    vat_included: bool = None
    banner_text: str = None
    offer_text: str = None
    show_branding: bool = None
    show_notifications: bool = None
    show_status_banner: bool = None
    show_offers: bool = None
    show_quick_actions: bool = None
    show_menu_action: bool = None
    show_deals_action: bool = None
    show_orders_action: bool = None
    show_contact_action: bool = None
    show_popular_items: bool = None
    show_reviews: bool = None
    show_restaurant_info: bool = None
    show_bottom_nav: bool = None
    popular_auto_enabled: bool = None
    popular_manual_enabled: bool = None
    popular_max_items: int = None


class Restaurant_settingsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    restaurant_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    opening_hours: Optional[str] = None
    logo_url: Optional[str] = None
    restaurant_status: Optional[str] = None
    busy_message: Optional[str] = None
    estimated_wait_time: Optional[str] = None
    delivery_enabled: Optional[bool] = None
    delivery_charges: Optional[str] = None
    estimated_delivery_time: Optional[str] = None
    restaurant_lat: Optional[str] = None
    restaurant_lng: Optional[str] = None
    near_radius: Optional[str] = None
    far_radius: Optional[str] = None
    near_charge: Optional[str] = None
    far_charge: Optional[str] = None
    auto_schedule_enabled: Optional[bool] = None
    auto_open_time: Optional[str] = None
    auto_close_time: Optional[str] = None
    service_fee_enabled: Optional[bool] = None
    service_fee_amount: Optional[float] = None
    service_fee_type: Optional[str] = None
    small_order_fee_enabled: Optional[bool] = None
    small_order_fee_amount: Optional[float] = None
    small_order_fee_threshold: Optional[float] = None
    service_fee_applies_to: Optional[str] = None
    cash_enabled_pickup: Optional[bool] = None
    card_enabled_pickup: Optional[bool] = None
    cash_enabled_delivery: Optional[bool] = None
    card_enabled_delivery: Optional[bool] = None
    allowed_country_codes: Optional[str] = None
    blog_enabled: Optional[bool] = None
    allow_cancel_preparing: Optional[bool] = None
    allow_cancel_ready: Optional[bool] = None
    allow_modify_preparing: Optional[bool] = None
    order_accept_timeout_minutes: Optional[int] = None
    order_expire_timeout_minutes: Optional[int] = None
    checkout_flow: Optional[str] = None
    tax_percent: Optional[float] = None
    vat_included: Optional[bool] = None
    banner_text: Optional[str] = None
    offer_text: Optional[str] = None
    show_branding: Optional[bool] = None
    show_notifications: Optional[bool] = None
    show_status_banner: Optional[bool] = None
    show_offers: Optional[bool] = None
    show_quick_actions: Optional[bool] = None
    show_menu_action: Optional[bool] = None
    show_deals_action: Optional[bool] = None
    show_orders_action: Optional[bool] = None
    show_contact_action: Optional[bool] = None
    show_popular_items: Optional[bool] = None
    show_reviews: Optional[bool] = None
    show_restaurant_info: Optional[bool] = None
    show_bottom_nav: Optional[bool] = None
    popular_auto_enabled: Optional[bool] = None
    popular_manual_enabled: Optional[bool] = None
    popular_max_items: Optional[int] = None


class Restaurant_settingsResponse(BaseModel):
    """Entity response schema"""
    id: int
    restaurant_name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    opening_hours: Optional[str] = None
    logo_url: Optional[str] = None
    restaurant_status: Optional[str] = None
    busy_message: Optional[str] = None
    estimated_wait_time: Optional[str] = None
    delivery_enabled: Optional[bool] = None
    delivery_charges: Optional[str] = None
    estimated_delivery_time: Optional[str] = None
    restaurant_lat: Optional[str] = None
    restaurant_lng: Optional[str] = None
    near_radius: Optional[str] = None
    far_radius: Optional[str] = None
    near_charge: Optional[str] = None
    far_charge: Optional[str] = None
    auto_schedule_enabled: Optional[bool] = None
    auto_open_time: Optional[str] = None
    auto_close_time: Optional[str] = None
    service_fee_enabled: Optional[bool] = None
    service_fee_amount: Optional[float] = None
    service_fee_type: Optional[str] = None
    small_order_fee_enabled: Optional[bool] = None
    small_order_fee_amount: Optional[float] = None
    small_order_fee_threshold: Optional[float] = None
    service_fee_applies_to: Optional[str] = None
    cash_enabled_pickup: Optional[bool] = None
    card_enabled_pickup: Optional[bool] = None
    cash_enabled_delivery: Optional[bool] = None
    card_enabled_delivery: Optional[bool] = None
    allowed_country_codes: Optional[str] = None
    blog_enabled: Optional[bool] = None
    allow_cancel_preparing: Optional[bool] = None
    allow_cancel_ready: Optional[bool] = None
    allow_modify_preparing: Optional[bool] = None
    order_accept_timeout_minutes: Optional[int] = None
    order_expire_timeout_minutes: Optional[int] = None
    checkout_flow: Optional[str] = None
    tax_percent: Optional[float] = None
    vat_included: Optional[bool] = None
    banner_text: Optional[str] = None
    offer_text: Optional[str] = None
    show_branding: Optional[bool] = None
    show_notifications: Optional[bool] = None
    show_status_banner: Optional[bool] = None
    show_offers: Optional[bool] = None
    show_quick_actions: Optional[bool] = None
    show_menu_action: Optional[bool] = None
    show_deals_action: Optional[bool] = None
    show_orders_action: Optional[bool] = None
    show_contact_action: Optional[bool] = None
    show_popular_items: Optional[bool] = None
    show_reviews: Optional[bool] = None
    show_restaurant_info: Optional[bool] = None
    show_bottom_nav: Optional[bool] = None
    popular_auto_enabled: Optional[bool] = None
    popular_manual_enabled: Optional[bool] = None
    popular_max_items: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Restaurant_settingsListResponse(BaseModel):
    """List response schema"""
    items: List[Restaurant_settingsResponse]
    total: int
    skip: int
    limit: int


class Restaurant_settingsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Restaurant_settingsData]


class Restaurant_settingsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Restaurant_settingsUpdateData


class Restaurant_settingsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Restaurant_settingsBatchUpdateItem]


class Restaurant_settingsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Restaurant_settingsListResponse)
async def query_restaurant_settingss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query restaurant_settingss with filtering, sorting, and pagination"""
    logger.debug(f"Querying restaurant_settingss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Restaurant_settingsService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")
        
        result = await service.get_list(
            skip=skip, 
            limit=limit,
            query_dict=query_dict,
            sort=sort,
        )
        logger.debug(f"Found {result['total']} restaurant_settingss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid restaurant_settings query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying restaurant_settingss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Restaurant_settingsListResponse)
async def query_restaurant_settingss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query restaurant_settingss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying restaurant_settingss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Restaurant_settingsService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")

        result = await service.get_list(
            skip=skip,
            limit=limit,
            query_dict=query_dict,
            sort=sort
        )
        logger.debug(f"Found {result['total']} restaurant_settingss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid restaurant_settings query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying restaurant_settingss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Restaurant_settingsResponse)
async def get_restaurant_settings(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single restaurant_settings by ID"""
    logger.debug(f"Fetching restaurant_settings with id: {id}, fields={fields}")
    
    service = Restaurant_settingsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Restaurant_settings with id {id} not found")
            raise HTTPException(status_code=404, detail="Restaurant_settings not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching restaurant_settings {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Restaurant_settingsResponse, status_code=201)
async def create_restaurant_settings(
    data: Restaurant_settingsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new restaurant_settings"""
    logger.debug(f"Creating new restaurant_settings with data: {data}")
    
    service = Restaurant_settingsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create restaurant_settings")
        
        logger.info(f"Restaurant_settings created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating restaurant_settings: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating restaurant_settings: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Restaurant_settingsResponse], status_code=201)
async def create_restaurant_settingss_batch(
    request: Restaurant_settingsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple restaurant_settingss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} restaurant_settingss")
    
    service = Restaurant_settingsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} restaurant_settingss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Restaurant_settingsResponse])
async def update_restaurant_settingss_batch(
    request: Restaurant_settingsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple restaurant_settingss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} restaurant_settingss")
    
    service = Restaurant_settingsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} restaurant_settingss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Restaurant_settingsResponse)
async def update_restaurant_settings(
    id: int,
    data: Restaurant_settingsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing restaurant_settings"""
    logger.debug(f"Updating restaurant_settings {id} with data: {data}")

    service = Restaurant_settingsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Restaurant_settings with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Restaurant_settings not found")
        
        logger.info(f"Restaurant_settings {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating restaurant_settings {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating restaurant_settings {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_restaurant_settingss_batch(
    request: Restaurant_settingsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple restaurant_settingss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} restaurant_settingss")
    
    service = Restaurant_settingsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} restaurant_settingss successfully")
        return {"message": f"Successfully deleted {deleted_count} restaurant_settingss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_restaurant_settings(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single restaurant_settings by ID"""
    logger.debug(f"Deleting restaurant_settings with id: {id}")
    
    service = Restaurant_settingsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Restaurant_settings with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Restaurant_settings not found")
        
        logger.info(f"Restaurant_settings {id} deleted successfully")
        return {"message": "Restaurant_settings deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting restaurant_settings {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
