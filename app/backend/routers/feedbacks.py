import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.feedbacks import FeedbacksService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/feedbacks", tags=["feedbacks"])


# ---------- Pydantic Schemas ----------
class FeedbacksData(BaseModel):
    """Entity data schema (for create/update)"""
    order_id: int = None
    customer_name: str
    rating: int
    comment: str = None
    is_visible: bool = None


class FeedbacksUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    order_id: Optional[int] = None
    customer_name: Optional[str] = None
    rating: Optional[int] = None
    comment: Optional[str] = None
    is_visible: Optional[bool] = None


class FeedbacksResponse(BaseModel):
    """Entity response schema"""
    id: int
    order_id: Optional[int] = None
    customer_name: str
    rating: int
    comment: Optional[str] = None
    is_visible: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FeedbacksListResponse(BaseModel):
    """List response schema"""
    items: List[FeedbacksResponse]
    total: int
    skip: int
    limit: int


class FeedbacksBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[FeedbacksData]


class FeedbacksBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: FeedbacksUpdateData


class FeedbacksBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[FeedbacksBatchUpdateItem]


class FeedbacksBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=FeedbacksListResponse)
async def query_feedbackss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query feedbackss with filtering, sorting, and pagination"""
    logger.debug(f"Querying feedbackss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = FeedbacksService(db)
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
        logger.debug(f"Found {result['total']} feedbackss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid feedbacks query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying feedbackss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=FeedbacksListResponse)
async def query_feedbackss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query feedbackss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying feedbackss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = FeedbacksService(db)
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
        logger.debug(f"Found {result['total']} feedbackss")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid feedbacks query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying feedbackss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=FeedbacksResponse)
async def get_feedbacks(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single feedbacks by ID"""
    logger.debug(f"Fetching feedbacks with id: {id}, fields={fields}")
    
    service = FeedbacksService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Feedbacks with id {id} not found")
            raise HTTPException(status_code=404, detail="Feedbacks not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching feedbacks {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=FeedbacksResponse, status_code=201)
async def create_feedbacks(
    data: FeedbacksData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new feedbacks"""
    logger.debug(f"Creating new feedbacks with data: {data}")
    
    service = FeedbacksService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create feedbacks")
        
        logger.info(f"Feedbacks created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating feedbacks: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating feedbacks: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[FeedbacksResponse], status_code=201)
async def create_feedbackss_batch(
    request: FeedbacksBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple feedbackss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} feedbackss")
    
    service = FeedbacksService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} feedbackss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[FeedbacksResponse])
async def update_feedbackss_batch(
    request: FeedbacksBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple feedbackss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} feedbackss")
    
    service = FeedbacksService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} feedbackss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=FeedbacksResponse)
async def update_feedbacks(
    id: int,
    data: FeedbacksUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing feedbacks"""
    logger.debug(f"Updating feedbacks {id} with data: {data}")

    service = FeedbacksService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Feedbacks with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Feedbacks not found")
        
        logger.info(f"Feedbacks {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating feedbacks {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating feedbacks {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_feedbackss_batch(
    request: FeedbacksBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple feedbackss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} feedbackss")
    
    service = FeedbacksService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} feedbackss successfully")
        return {"message": f"Successfully deleted {deleted_count} feedbackss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_feedbacks(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single feedbacks by ID"""
    logger.debug(f"Deleting feedbacks with id: {id}")
    
    service = FeedbacksService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Feedbacks with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Feedbacks not found")
        
        logger.info(f"Feedbacks {id} deleted successfully")
        return {"message": "Feedbacks deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting feedbacks {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")