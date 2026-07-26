import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.delivery_zones import Delivery_zonesService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/delivery_zones", tags=["delivery_zones"])


# ---------- Pydantic Schemas ----------
class Delivery_zonesData(BaseModel):
    """Entity data schema (for create/update)"""
    zone_name: str
    min_distance_km: float
    max_distance_km: float
    charge: float
    is_active: bool = None


class Delivery_zonesUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    zone_name: Optional[str] = None
    min_distance_km: Optional[float] = None
    max_distance_km: Optional[float] = None
    charge: Optional[float] = None
    is_active: Optional[bool] = None


class Delivery_zonesResponse(BaseModel):
    """Entity response schema"""
    id: int
    zone_name: str
    min_distance_km: float
    max_distance_km: float
    charge: float
    is_active: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Delivery_zonesListResponse(BaseModel):
    """List response schema"""
    items: List[Delivery_zonesResponse]
    total: int
    skip: int
    limit: int


class Delivery_zonesBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Delivery_zonesData]


class Delivery_zonesBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Delivery_zonesUpdateData


class Delivery_zonesBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Delivery_zonesBatchUpdateItem]


class Delivery_zonesBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Delivery_zonesListResponse)
async def query_delivery_zoness(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query delivery_zoness with filtering, sorting, and pagination"""
    logger.debug(f"Querying delivery_zoness: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Delivery_zonesService(db)
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
        logger.debug(f"Found {result['total']} delivery_zoness")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid delivery_zones query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying delivery_zoness: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Delivery_zonesListResponse)
async def query_delivery_zoness_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query delivery_zoness with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying delivery_zoness: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Delivery_zonesService(db)
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
        logger.debug(f"Found {result['total']} delivery_zoness")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid delivery_zones query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying delivery_zoness: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Delivery_zonesResponse)
async def get_delivery_zones(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single delivery_zones by ID"""
    logger.debug(f"Fetching delivery_zones with id: {id}, fields={fields}")
    
    service = Delivery_zonesService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Delivery_zones with id {id} not found")
            raise HTTPException(status_code=404, detail="Delivery_zones not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching delivery_zones {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Delivery_zonesResponse, status_code=201)
async def create_delivery_zones(
    data: Delivery_zonesData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new delivery_zones"""
    logger.debug(f"Creating new delivery_zones with data: {data}")
    
    service = Delivery_zonesService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create delivery_zones")
        
        logger.info(f"Delivery_zones created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating delivery_zones: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating delivery_zones: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Delivery_zonesResponse], status_code=201)
async def create_delivery_zoness_batch(
    request: Delivery_zonesBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple delivery_zoness in a single request"""
    logger.debug(f"Batch creating {len(request.items)} delivery_zoness")
    
    service = Delivery_zonesService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} delivery_zoness successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Delivery_zonesResponse])
async def update_delivery_zoness_batch(
    request: Delivery_zonesBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple delivery_zoness in a single request"""
    logger.debug(f"Batch updating {len(request.items)} delivery_zoness")
    
    service = Delivery_zonesService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} delivery_zoness successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Delivery_zonesResponse)
async def update_delivery_zones(
    id: int,
    data: Delivery_zonesUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing delivery_zones"""
    logger.debug(f"Updating delivery_zones {id} with data: {data}")

    service = Delivery_zonesService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Delivery_zones with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Delivery_zones not found")
        
        logger.info(f"Delivery_zones {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating delivery_zones {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating delivery_zones {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_delivery_zoness_batch(
    request: Delivery_zonesBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple delivery_zoness by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} delivery_zoness")
    
    service = Delivery_zonesService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} delivery_zoness successfully")
        return {"message": f"Successfully deleted {deleted_count} delivery_zoness", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_delivery_zones(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single delivery_zones by ID"""
    logger.debug(f"Deleting delivery_zones with id: {id}")
    
    service = Delivery_zonesService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Delivery_zones with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Delivery_zones not found")
        
        logger.info(f"Delivery_zones {id} deleted successfully")
        return {"message": "Delivery_zones deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting delivery_zones {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# ---------- Custom Zone Calculation Endpoint ----------
import math
from sqlalchemy import select
from models.delivery_zones import Delivery_zones


class CalculateChargeRequest(BaseModel):
    customer_lat: float
    customer_lng: float
    restaurant_lat: float
    restaurant_lng: float


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in km between two points using Haversine formula"""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


@router.post("/calculate")
async def calculate_delivery_charge(
    data: CalculateChargeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Calculate delivery charge based on customer location and configured zones.
    Returns the zone-based charge which equals rider earnings."""
    try:
        distance = haversine_distance(
            data.restaurant_lat, data.restaurant_lng,
            data.customer_lat, data.customer_lng
        )

        # Get active zones ordered by min_distance
        service = Delivery_zonesService(db)
        result = await service.get_list(
            skip=0, limit=100,
            query_dict={"is_active": True},
            sort="min_distance_km"
        )
        zones = result.get("items", [])

        if not zones:
            # No zones configured - use legacy near/far from restaurant_settings
            return {
                "distance_km": round(distance, 2),
                "charge": 0,
                "zone_name": "No zones configured",
                "available": True,
            }

        # Helper to extract zone attributes (works with ORM objects and dicts)
        def get_zone_attr(zone, attr, default=0):
            return getattr(zone, attr, None) if hasattr(zone, attr) else zone.get(attr, default)

        # Sort zones by max_distance_km ascending to find the first zone that covers the customer
        sorted_zones = sorted(zones, key=lambda z: get_zone_attr(z, 'max_distance_km', 0))

        # Find matching zone: customer is within a zone if distance <= zone's max_distance_km
        # AND distance >= zone's min_distance_km. But to handle gaps between zones,
        # we use a more forgiving approach: find the zone where distance falls within [min, max]
        # OR if there's a gap, assign to the nearest zone that covers the distance.
        matched_zone = None
        for zone in sorted_zones:
            min_d = get_zone_attr(zone, 'min_distance_km', 0)
            max_d = get_zone_attr(zone, 'max_distance_km', 0)
            if min_d <= distance <= max_d:
                matched_zone = zone
                break

        # If no exact match, check if customer falls in a gap between zones
        # In that case, assign to the zone whose max_distance covers the customer
        if not matched_zone:
            for zone in sorted_zones:
                max_d = get_zone_attr(zone, 'max_distance_km', 0)
                if distance <= max_d:
                    matched_zone = zone
                    break

        if matched_zone:
            charge = get_zone_attr(matched_zone, 'charge', 0)
            name = get_zone_attr(matched_zone, 'zone_name', '')
            return {
                "distance_km": round(distance, 2),
                "charge": charge,
                "zone_name": name,
                "available": True,
            }

        # Beyond all zones - delivery not available
        max_zone = sorted_zones[-1] if sorted_zones else None
        max_d = get_zone_attr(max_zone, 'max_distance_km', 0) if max_zone else 0

        return {
            "distance_km": round(distance, 2),
            "charge": 0,
            "zone_name": None,
            "available": False,
            "message": f"Delivery not available beyond {max_d} km (you are {round(distance, 1)} km away)",
        }
    except Exception as e:
        logger.error(f"Failed to calculate delivery charge: {e}")
        raise HTTPException(status_code=500, detail=str(e))