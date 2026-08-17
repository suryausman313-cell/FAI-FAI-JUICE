import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.categories import CategoriesService
from services.auto_translation import backfill_categories, prepare_category_payload

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/categories", tags=["categories"])


# ---------- Pydantic Schemas ----------
class CategoriesData(BaseModel):
    """Entity data schema (for create/update)"""
    name: str
    name_ar: str = None
    sort_order: int = None
    is_active: bool = None


class CategoriesUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    name: Optional[str] = None
    name_ar: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class CategoriesResponse(BaseModel):
    """Entity response schema"""
    id: int
    name: str
    name_ar: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CategoriesListResponse(BaseModel):
    """List response schema"""
    items: List[CategoriesResponse]
    total: int
    skip: int
    limit: int


class CategoriesBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[CategoriesData]


class CategoriesBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: CategoriesUpdateData


class CategoriesBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[CategoriesBatchUpdateItem]


class CategoriesBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=CategoriesListResponse)
async def query_categoriess(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query categoriess with filtering, sorting, and pagination"""
    logger.debug(f"Querying categoriess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = CategoriesService(db)
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
        await backfill_categories(result.get("items", []), db)
        logger.debug(f"Found {result['total']} categoriess")
        await backfill_categories([result], db)
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid categories query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying categoriess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=CategoriesListResponse)
async def query_categoriess_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query categoriess with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying categoriess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = CategoriesService(db)
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
        await backfill_categories(result.get("items", []), db)
        logger.debug(f"Found {result['total']} categoriess")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid categories query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying categoriess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=CategoriesResponse)
async def get_categories(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single categories by ID"""
    logger.debug(f"Fetching categories with id: {id}, fields={fields}")
    
    service = CategoriesService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Categories with id {id} not found")
            raise HTTPException(status_code=404, detail="Categories not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching categories {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=CategoriesResponse, status_code=201)
async def create_categories(
    data: CategoriesData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new categories"""
    logger.debug(f"Creating new categories with data: {data}")
    
    service = CategoriesService(db)
    try:
        create_data = await prepare_category_payload(data.model_dump())
        result = await service.create(create_data)
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create categories")
        
        logger.info(f"Categories created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating categories: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating categories: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[CategoriesResponse], status_code=201)
async def create_categoriess_batch(
    request: CategoriesBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple categoriess in a single request"""
    logger.debug(f"Batch creating {len(request.items)} categoriess")
    
    service = CategoriesService(db)
    results = []
    
    try:
        for item_data in request.items:
            create_data = await prepare_category_payload(item_data.model_dump())
            result = await service.create(create_data)
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} categoriess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[CategoriesResponse])
async def update_categoriess_batch(
    request: CategoriesBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple categoriess in a single request"""
    logger.debug(f"Batch updating {len(request.items)} categoriess")
    
    service = CategoriesService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            update_dict = await prepare_category_payload(update_dict)
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} categoriess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=CategoriesResponse)
async def update_categories(
    id: int,
    data: CategoriesUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing categories"""
    logger.debug(f"Updating categories {id} with data: {data}")

    service = CategoriesService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        update_dict = await prepare_category_payload(update_dict)
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Categories with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Categories not found")
        
        logger.info(f"Categories {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating categories {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating categories {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_categoriess_batch(
    request: CategoriesBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple categoriess by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} categoriess")
    
    service = CategoriesService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} categoriess successfully")
        return {"message": f"Successfully deleted {deleted_count} categoriess", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_categories(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single categories by ID"""
    logger.debug(f"Deleting categories with id: {id}")
    
    service = CategoriesService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Categories with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Categories not found")
        
        logger.info(f"Categories {id} deleted successfully")
        return {"message": "Categories deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting categories {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")