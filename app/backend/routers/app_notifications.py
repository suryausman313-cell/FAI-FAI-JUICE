import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.app_notifications import App_notificationsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/app_notifications", tags=["app_notifications"])


# ---------- Pydantic Schemas ----------
class App_notificationsData(BaseModel):
    """Entity data schema (for create/update)"""
    title: str
    message: str
    is_active: bool = None


class App_notificationsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    title: Optional[str] = None
    message: Optional[str] = None
    is_active: Optional[bool] = None


class App_notificationsResponse(BaseModel):
    """Entity response schema"""
    id: int
    title: str
    message: str
    is_active: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class App_notificationsListResponse(BaseModel):
    """List response schema"""
    items: List[App_notificationsResponse]
    total: int
    skip: int
    limit: int


class App_notificationsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[App_notificationsData]


class App_notificationsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: App_notificationsUpdateData


class App_notificationsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[App_notificationsBatchUpdateItem]


class App_notificationsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=App_notificationsListResponse)
async def query_app_notificationss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query app_notificationss with filtering, sorting, and pagination"""
    logger.debug(f"Querying app_notificationss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = App_notificationsService(db)
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
        logger.debug(f"Found {result['total']} app_notificationss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid app_notifications query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying app_notificationss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=App_notificationsListResponse)
async def query_app_notificationss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query app_notificationss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying app_notificationss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = App_notificationsService(db)
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
        logger.debug(f"Found {result['total']} app_notificationss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid app_notifications query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying app_notificationss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=App_notificationsResponse)
async def get_app_notifications(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single app_notifications by ID"""
    logger.debug(f"Fetching app_notifications with id: {id}, fields={fields}")
    
    service = App_notificationsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"App_notifications with id {id} not found")
            raise HTTPException(status_code=404, detail="App_notifications not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching app_notifications {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=App_notificationsResponse, status_code=201)
async def create_app_notifications(
    data: App_notificationsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new app_notifications"""
    logger.debug(f"Creating new app_notifications with data: {data}")
    
    service = App_notificationsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create app_notifications")
        
        logger.info(f"App_notifications created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating app_notifications: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating app_notifications: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[App_notificationsResponse], status_code=201)
async def create_app_notificationss_batch(
    request: App_notificationsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple app_notificationss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} app_notificationss")
    
    service = App_notificationsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} app_notificationss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[App_notificationsResponse])
async def update_app_notificationss_batch(
    request: App_notificationsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple app_notificationss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} app_notificationss")
    
    service = App_notificationsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} app_notificationss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=App_notificationsResponse)
async def update_app_notifications(
    id: int,
    data: App_notificationsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing app_notifications"""
    logger.debug(f"Updating app_notifications {id} with data: {data}")

    service = App_notificationsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"App_notifications with id {id} not found for update")
            raise HTTPException(status_code=404, detail="App_notifications not found")
        
        logger.info(f"App_notifications {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating app_notifications {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating app_notifications {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_app_notificationss_batch(
    request: App_notificationsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple app_notificationss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} app_notificationss")
    
    service = App_notificationsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} app_notificationss successfully")
        return {"message": f"Successfully deleted {deleted_count} app_notificationss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_app_notifications(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single app_notifications by ID"""
    logger.debug(f"Deleting app_notifications with id: {id}")
    
    service = App_notificationsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"App_notifications with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="App_notifications not found")
        
        logger.info(f"App_notifications {id} deleted successfully")
        return {"message": "App_notifications deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting app_notifications {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")