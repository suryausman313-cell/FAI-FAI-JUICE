import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.delivery_assignments import Delivery_assignmentsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/delivery_assignments", tags=["delivery_assignments"])


# ---------- Pydantic Schemas ----------
class Delivery_assignmentsData(BaseModel):
    """Entity data schema (for create/update)"""
    order_id: int
    rider_id: int
    status: str = None
    customer_lat: float = None
    customer_lng: float = None
    customer_address: str = None
    customer_name: str = None
    customer_phone: str = None


class Delivery_assignmentsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    order_id: Optional[int] = None
    rider_id: Optional[int] = None
    status: Optional[str] = None
    customer_lat: Optional[float] = None
    customer_lng: Optional[float] = None
    customer_address: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None


class Delivery_assignmentsResponse(BaseModel):
    """Entity response schema"""
    id: int
    order_id: int
    rider_id: int
    status: Optional[str] = None
    customer_lat: Optional[float] = None
    customer_lng: Optional[float] = None
    customer_address: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Delivery_assignmentsListResponse(BaseModel):
    """List response schema"""
    items: List[Delivery_assignmentsResponse]
    total: int
    skip: int
    limit: int


class Delivery_assignmentsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Delivery_assignmentsData]


class Delivery_assignmentsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Delivery_assignmentsUpdateData


class Delivery_assignmentsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Delivery_assignmentsBatchUpdateItem]


class Delivery_assignmentsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Delivery_assignmentsListResponse)
async def query_delivery_assignmentss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query delivery_assignmentss with filtering, sorting, and pagination"""
    logger.debug(f"Querying delivery_assignmentss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Delivery_assignmentsService(db)
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
        logger.debug(f"Found {result['total']} delivery_assignmentss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid delivery_assignments query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying delivery_assignmentss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Delivery_assignmentsListResponse)
async def query_delivery_assignmentss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query delivery_assignmentss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying delivery_assignmentss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Delivery_assignmentsService(db)
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
        logger.debug(f"Found {result['total']} delivery_assignmentss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid delivery_assignments query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying delivery_assignmentss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Delivery_assignmentsResponse)
async def get_delivery_assignments(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single delivery_assignments by ID"""
    logger.debug(f"Fetching delivery_assignments with id: {id}, fields={fields}")
    
    service = Delivery_assignmentsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Delivery_assignments with id {id} not found")
            raise HTTPException(status_code=404, detail="Delivery_assignments not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching delivery_assignments {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Delivery_assignmentsResponse, status_code=201)
async def create_delivery_assignments(
    data: Delivery_assignmentsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new delivery_assignments"""
    logger.debug(f"Creating new delivery_assignments with data: {data}")
    
    service = Delivery_assignmentsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create delivery_assignments")
        
        logger.info(f"Delivery_assignments created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating delivery_assignments: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating delivery_assignments: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Delivery_assignmentsResponse], status_code=201)
async def create_delivery_assignmentss_batch(
    request: Delivery_assignmentsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple delivery_assignmentss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} delivery_assignmentss")
    
    service = Delivery_assignmentsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} delivery_assignmentss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Delivery_assignmentsResponse])
async def update_delivery_assignmentss_batch(
    request: Delivery_assignmentsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple delivery_assignmentss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} delivery_assignmentss")
    
    service = Delivery_assignmentsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} delivery_assignmentss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Delivery_assignmentsResponse)
async def update_delivery_assignments(
    id: int,
    data: Delivery_assignmentsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing delivery_assignments"""
    logger.debug(f"Updating delivery_assignments {id} with data: {data}")

    service = Delivery_assignmentsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Delivery_assignments with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Delivery_assignments not found")
        
        logger.info(f"Delivery_assignments {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating delivery_assignments {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating delivery_assignments {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_delivery_assignmentss_batch(
    request: Delivery_assignmentsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple delivery_assignmentss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} delivery_assignmentss")
    
    service = Delivery_assignmentsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} delivery_assignmentss successfully")
        return {"message": f"Successfully deleted {deleted_count} delivery_assignmentss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_delivery_assignments(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single delivery_assignments by ID"""
    logger.debug(f"Deleting delivery_assignments with id: {id}")
    
    service = Delivery_assignmentsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Delivery_assignments with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Delivery_assignments not found")
        
        logger.info(f"Delivery_assignments {id} deleted successfully")
        return {"message": "Delivery_assignments deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting delivery_assignments {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")