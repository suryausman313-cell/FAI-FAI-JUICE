import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.riders import RidersService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/riders", tags=["riders"])


# ---------- Pydantic Schemas ----------
class RidersData(BaseModel):
    """Entity data schema (for create/update)"""
    name: str
    phone: str
    pin: str
    is_active: bool = None


class RidersUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    name: Optional[str] = None
    phone: Optional[str] = None
    pin: Optional[str] = None
    is_active: Optional[bool] = None


class RidersResponse(BaseModel):
    """Entity response schema"""
    id: int
    name: str
    phone: str
    pin: str
    is_active: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RidersListResponse(BaseModel):
    """List response schema"""
    items: List[RidersResponse]
    total: int
    skip: int
    limit: int


class RidersBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[RidersData]


class RidersBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: RidersUpdateData


class RidersBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[RidersBatchUpdateItem]


class RidersBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=RidersListResponse)
async def query_riderss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query riderss with filtering, sorting, and pagination"""
    logger.debug(f"Querying riderss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = RidersService(db)
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
        logger.debug(f"Found {result['total']} riderss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid riders query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying riderss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=RidersListResponse)
async def query_riderss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query riderss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying riderss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = RidersService(db)
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
        logger.debug(f"Found {result['total']} riderss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid riders query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying riderss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=RidersResponse)
async def get_riders(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single riders by ID"""
    logger.debug(f"Fetching riders with id: {id}, fields={fields}")
    
    service = RidersService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Riders with id {id} not found")
            raise HTTPException(status_code=404, detail="Riders not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching riders {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=RidersResponse, status_code=201)
async def create_riders(
    data: RidersData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new riders"""
    logger.debug(f"Creating new riders with data: {data}")
    
    service = RidersService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create riders")
        
        logger.info(f"Riders created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating riders: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating riders: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[RidersResponse], status_code=201)
async def create_riderss_batch(
    request: RidersBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple riderss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} riderss")
    
    service = RidersService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} riderss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[RidersResponse])
async def update_riderss_batch(
    request: RidersBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple riderss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} riderss")
    
    service = RidersService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} riderss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=RidersResponse)
async def update_riders(
    id: int,
    data: RidersUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing riders"""
    logger.debug(f"Updating riders {id} with data: {data}")

    service = RidersService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Riders with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Riders not found")
        
        logger.info(f"Riders {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating riders {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating riders {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_riderss_batch(
    request: RidersBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple riderss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} riderss")
    
    service = RidersService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} riderss successfully")
        return {"message": f"Successfully deleted {deleted_count} riderss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_riders(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single riders by ID"""
    logger.debug(f"Deleting riders with id: {id}")
    
    service = RidersService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Riders with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Riders not found")
        
        logger.info(f"Riders {id} deleted successfully")
        return {"message": "Riders deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting riders {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")