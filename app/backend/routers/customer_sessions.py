import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.customer_sessions import Customer_sessionsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/customer_sessions", tags=["customer_sessions"])


# ---------- Pydantic Schemas ----------
class Customer_sessionsData(BaseModel):
    """Entity data schema (for create/update)"""
    customer_name: str = None
    customer_email: str = None
    customer_phone: str = None
    last_active: Optional[datetime] = None
    first_seen: Optional[datetime] = None


class Customer_sessionsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    last_active: Optional[datetime] = None
    first_seen: Optional[datetime] = None


class Customer_sessionsResponse(BaseModel):
    """Entity response schema"""
    id: int
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    last_active: Optional[datetime] = None
    first_seen: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Customer_sessionsListResponse(BaseModel):
    """List response schema"""
    items: List[Customer_sessionsResponse]
    total: int
    skip: int
    limit: int


class Customer_sessionsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Customer_sessionsData]


class Customer_sessionsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Customer_sessionsUpdateData


class Customer_sessionsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Customer_sessionsBatchUpdateItem]


class Customer_sessionsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Customer_sessionsListResponse)
async def query_customer_sessionss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query customer_sessionss with filtering, sorting, and pagination"""
    logger.debug(f"Querying customer_sessionss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Customer_sessionsService(db)
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
        logger.debug(f"Found {result['total']} customer_sessionss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid customer_sessions query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying customer_sessionss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Customer_sessionsListResponse)
async def query_customer_sessionss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query customer_sessionss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying customer_sessionss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Customer_sessionsService(db)
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
        logger.debug(f"Found {result['total']} customer_sessionss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid customer_sessions query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying customer_sessionss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Customer_sessionsResponse)
async def get_customer_sessions(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single customer_sessions by ID"""
    logger.debug(f"Fetching customer_sessions with id: {id}, fields={fields}")
    
    service = Customer_sessionsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Customer_sessions with id {id} not found")
            raise HTTPException(status_code=404, detail="Customer_sessions not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching customer_sessions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Customer_sessionsResponse, status_code=201)
async def create_customer_sessions(
    data: Customer_sessionsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new customer_sessions"""
    logger.debug(f"Creating new customer_sessions with data: {data}")
    
    service = Customer_sessionsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create customer_sessions")
        
        logger.info(f"Customer_sessions created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating customer_sessions: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating customer_sessions: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Customer_sessionsResponse], status_code=201)
async def create_customer_sessionss_batch(
    request: Customer_sessionsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple customer_sessionss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} customer_sessionss")
    
    service = Customer_sessionsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} customer_sessionss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Customer_sessionsResponse])
async def update_customer_sessionss_batch(
    request: Customer_sessionsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple customer_sessionss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} customer_sessionss")
    
    service = Customer_sessionsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} customer_sessionss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Customer_sessionsResponse)
async def update_customer_sessions(
    id: int,
    data: Customer_sessionsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing customer_sessions"""
    logger.debug(f"Updating customer_sessions {id} with data: {data}")

    service = Customer_sessionsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Customer_sessions with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Customer_sessions not found")
        
        logger.info(f"Customer_sessions {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating customer_sessions {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating customer_sessions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_customer_sessionss_batch(
    request: Customer_sessionsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple customer_sessionss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} customer_sessionss")
    
    service = Customer_sessionsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} customer_sessionss successfully")
        return {"message": f"Successfully deleted {deleted_count} customer_sessionss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_customer_sessions(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single customer_sessions by ID"""
    logger.debug(f"Deleting customer_sessions with id: {id}")
    
    service = Customer_sessionsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Customer_sessions with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Customer_sessions not found")
        
        logger.info(f"Customer_sessions {id} deleted successfully")
        return {"message": "Customer_sessions deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting customer_sessions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")