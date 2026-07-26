import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.extras import ExtrasService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/extras", tags=["extras"])


# ---------- Pydantic Schemas ----------
class ExtrasData(BaseModel):
    """Entity data schema (for create/update)"""
    name: str
    price: float
    is_active: bool = None


class ExtrasUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    name: Optional[str] = None
    price: Optional[float] = None
    is_active: Optional[bool] = None


class ExtrasResponse(BaseModel):
    """Entity response schema"""
    id: int
    name: str
    price: float
    is_active: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ExtrasListResponse(BaseModel):
    """List response schema"""
    items: List[ExtrasResponse]
    total: int
    skip: int
    limit: int


class ExtrasBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[ExtrasData]


class ExtrasBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: ExtrasUpdateData


class ExtrasBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[ExtrasBatchUpdateItem]


class ExtrasBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=ExtrasListResponse)
async def query_extrass(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query extrass with filtering, sorting, and pagination"""
    logger.debug(f"Querying extrass: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = ExtrasService(db)
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
        logger.debug(f"Found {result['total']} extrass")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid extras query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying extrass: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=ExtrasListResponse)
async def query_extrass_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query extrass with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying extrass: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = ExtrasService(db)
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
        logger.debug(f"Found {result['total']} extrass")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid extras query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying extrass: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=ExtrasResponse)
async def get_extras(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single extras by ID"""
    logger.debug(f"Fetching extras with id: {id}, fields={fields}")
    
    service = ExtrasService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Extras with id {id} not found")
            raise HTTPException(status_code=404, detail="Extras not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching extras {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=ExtrasResponse, status_code=201)
async def create_extras(
    data: ExtrasData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new extras"""
    logger.debug(f"Creating new extras with data: {data}")
    
    service = ExtrasService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create extras")
        
        logger.info(f"Extras created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating extras: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating extras: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[ExtrasResponse], status_code=201)
async def create_extrass_batch(
    request: ExtrasBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple extrass in a single request"""
    logger.debug(f"Batch creating {len(request.items)} extrass")
    
    service = ExtrasService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} extrass successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[ExtrasResponse])
async def update_extrass_batch(
    request: ExtrasBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple extrass in a single request"""
    logger.debug(f"Batch updating {len(request.items)} extrass")
    
    service = ExtrasService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} extrass successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=ExtrasResponse)
async def update_extras(
    id: int,
    data: ExtrasUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing extras"""
    logger.debug(f"Updating extras {id} with data: {data}")

    service = ExtrasService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Extras with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Extras not found")
        
        logger.info(f"Extras {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating extras {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating extras {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_extrass_batch(
    request: ExtrasBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple extrass by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} extrass")
    
    service = ExtrasService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} extrass successfully")
        return {"message": f"Successfully deleted {deleted_count} extrass", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_extras(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single extras by ID"""
    logger.debug(f"Deleting extras with id: {id}")
    
    service = ExtrasService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Extras with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Extras not found")
        
        logger.info(f"Extras {id} deleted successfully")
        return {"message": "Extras deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting extras {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")