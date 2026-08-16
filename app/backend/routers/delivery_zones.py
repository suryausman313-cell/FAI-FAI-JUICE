import asyncio
import json
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

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
    zone_type: str = 'distance'
    polygon_json: Optional[str] = ''


class Delivery_zonesUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    zone_name: Optional[str] = None
    min_distance_km: Optional[float] = None
    max_distance_km: Optional[float] = None
    charge: Optional[float] = None
    is_active: Optional[bool] = None
    zone_type: Optional[str] = None
    polygon_json: Optional[str] = None


class Delivery_zonesResponse(BaseModel):
    """Entity response schema"""
    id: int
    zone_name: str
    min_distance_km: float
    max_distance_km: float
    charge: float
    is_active: Optional[bool] = None
    zone_type: str = 'distance'
    polygon_json: Optional[str] = ''
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




# ---------- Admin Area Search (full boundary) ----------
_NOMINATIM_LOCK = asyncio.Lock()
_NOMINATIM_LAST_REQUEST = 0.0
_AREA_SEARCH_CACHE: Dict[str, list] = {}
_REVERSE_AREA_CACHE: Dict[str, dict] = {}

_NOMINATIM_USER_AGENT = (
    "FaiFaiJuiceDeliveryAdmin/2.0 "
    "(+https://fai-fai-juice.pages.dev)"
)
_NOMINATIM_REFERER = "https://fai-fai-juice.pages.dev/"

_OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)


async def _nominatim_get(url: str, params: dict) -> Any:
    """
    Nominatim request:
    - identify the app
    - throttle requests
    - retry once
    """
    global _NOMINATIM_LAST_REQUEST

    request_params = dict(params)
    contact_email = os.getenv("NOMINATIM_CONTACT_EMAIL", "").strip()
    if contact_email:
        request_params["email"] = contact_email

    headers = {
        "User-Agent": _NOMINATIM_USER_AGENT,
        "Referer": _NOMINATIM_REFERER,
        "Accept": "application/json",
        "Accept-Language": "en,ar;q=0.8",
    }

    last_error: Optional[Exception] = None

    for attempt in range(2):
        async with _NOMINATIM_LOCK:
            wait_for = 1.10 - (time.monotonic() - _NOMINATIM_LAST_REQUEST)
            if wait_for > 0:
                await asyncio.sleep(wait_for)

            try:
                async with httpx.AsyncClient(
                    timeout=httpx.Timeout(25.0, connect=10.0),
                    follow_redirects=True,
                ) as client:
                    response = await client.get(
                        url,
                        params=request_params,
                        headers=headers,
                    )
                    _NOMINATIM_LAST_REQUEST = time.monotonic()
                    response.raise_for_status()
                    return response.json()
            except Exception as exc:
                _NOMINATIM_LAST_REQUEST = time.monotonic()
                last_error = exc
                logger.warning(
                    "Nominatim request attempt %s failed: %s",
                    attempt + 1,
                    exc,
                )

        if attempt == 0:
            await asyncio.sleep(1.25)

    if last_error:
        raise last_error

    raise RuntimeError("Nominatim request failed")


def _geometry_has_polygon(geometry: Any) -> bool:
    return (
        isinstance(geometry, dict)
        and geometry.get("type") in {"Polygon", "MultiPolygon"}
    )


def _short_area_name(result: dict) -> str:
    address = result.get("address") or {}
    display_name = str(result.get("display_name") or "")
    return str(
        address.get("municipality")
        or address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("suburb")
        or result.get("name")
        or display_name.split(",")[0]
        or "Area"
    )


def _nominatim_results_to_items(body: Any) -> list:
    items = []

    for result in body if isinstance(body, list) else []:
        geometry = result.get("geojson")
        if not _geometry_has_polygon(geometry):
            continue

        address = result.get("address") or {}

        items.append(
            {
                "name": _short_area_name(result),
                "display_name": str(result.get("display_name") or ""),
                "country": address.get("country") or "",
                "country_code": address.get("country_code") or "",
                "lat": float(result.get("lat") or 0),
                "lng": float(result.get("lon") or 0),
                "boundingbox": result.get("boundingbox") or [],
                "geometry": geometry,
            }
        )

    return items


def _same_point(a: list, b: list, tolerance: float = 1e-7) -> bool:
    return (
        isinstance(a, list)
        and isinstance(b, list)
        and len(a) >= 2
        and len(b) >= 2
        and abs(float(a[0]) - float(b[0])) <= tolerance
        and abs(float(a[1]) - float(b[1])) <= tolerance
    )


def _stitch_overpass_segments(segments: list) -> list:
    """
    Join Overpass relation member ways into closed GeoJSON rings.
    Each point is [lng, lat].
    """
    remaining = [
        segment[:]
        for segment in segments
        if isinstance(segment, list) and len(segment) >= 2
    ]
    rings = []

    while remaining:
        ring = remaining.pop(0)
        changed = True

        while (
            changed
            and remaining
            and not _same_point(ring[0], ring[-1])
        ):
            changed = False

            for idx, segment in enumerate(remaining):
                if _same_point(ring[-1], segment[0]):
                    ring.extend(segment[1:])
                elif _same_point(ring[-1], segment[-1]):
                    ring.extend(list(reversed(segment[:-1])))
                elif _same_point(ring[0], segment[-1]):
                    ring = segment[:-1] + ring
                elif _same_point(ring[0], segment[0]):
                    ring = list(reversed(segment[1:])) + ring
                else:
                    continue

                remaining.pop(idx)
                changed = True
                break

        if len(ring) >= 4:
            if not _same_point(ring[0], ring[-1]):
                ring.append(ring[0])

            if _same_point(ring[0], ring[-1]):
                rings.append(ring)

    return rings


def _overpass_relation_to_item(element: dict, query: str) -> Optional[dict]:
    tags = element.get("tags") or {}
    members = element.get("members") or []

    outer_segments = []
    inner_segments = []

    for member in members:
        if member.get("type") != "way":
            continue

        geometry = member.get("geometry") or []

        segment = [
            [float(point["lon"]), float(point["lat"])]
            for point in geometry
            if isinstance(point, dict)
            and "lat" in point
            and "lon" in point
        ]

        if len(segment) < 2:
            continue

        if member.get("role") == "inner":
            inner_segments.append(segment)
        else:
            outer_segments.append(segment)

    outer_rings = _stitch_overpass_segments(outer_segments)
    if not outer_rings:
        return None

    inner_rings = _stitch_overpass_segments(inner_segments)

    if len(outer_rings) == 1:
        geometry = {
            "type": "Polygon",
            "coordinates": [outer_rings[0], *inner_rings],
        }
    else:
        geometry = {
            "type": "MultiPolygon",
            "coordinates": [[ring] for ring in outer_rings],
        }

    bounds = element.get("bounds") or {}
    minlat = bounds.get("minlat")
    maxlat = bounds.get("maxlat")
    minlon = bounds.get("minlon")
    maxlon = bounds.get("maxlon")

    bbox = []
    if None not in (minlat, maxlat, minlon, maxlon):
        bbox = [
            str(minlat),
            str(maxlat),
            str(minlon),
            str(maxlon),
        ]

    center = element.get("center") or {}
    name = str(tags.get("name:en") or tags.get("name") or query)
    country = str(tags.get("addr:country") or "")

    center_lat = 0.0
    center_lng = 0.0

    if center.get("lat") is not None:
        center_lat = float(center["lat"])
    elif minlat is not None and maxlat is not None:
        center_lat = (float(minlat) + float(maxlat)) / 2

    if center.get("lon") is not None:
        center_lng = float(center["lon"])
    elif minlon is not None and maxlon is not None:
        center_lng = (float(minlon) + float(maxlon)) / 2

    return {
        "name": name,
        "display_name": f"{name}{', ' + country if country else ''}",
        "country": country,
        "country_code": country.lower(),
        "lat": center_lat,
        "lng": center_lng,
        "boundingbox": bbox,
        "geometry": geometry,
    }


async def _overpass_area_search(query: str) -> list:
    """
    Fallback when Nominatim cannot return a full polygon.
    Uses OSM Overpass administrative boundaries.
    """
    safe = re.escape(query.strip())

    overpass_query = (
        "[out:json][timeout:25];\n"
        "(\n"
        f'  relation["boundary"="administrative"]["name"~"^{safe}$",i];\n'
        f'  relation["boundary"="administrative"]["name:en"~"^{safe}$",i];\n'
        ");\n"
        "out center bb geom 6;"
    )

    headers = {
        "User-Agent": _NOMINATIM_USER_AGENT,
        "Referer": _NOMINATIM_REFERER,
        "Accept": "application/json",
    }

    last_error: Optional[Exception] = None

    for endpoint in _OVERPASS_ENDPOINTS:
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(35.0, connect=10.0),
                follow_redirects=True,
            ) as client:
                response = await client.post(
                    endpoint,
                    data={"data": overpass_query},
                    headers=headers,
                )
                response.raise_for_status()
                body = response.json()

            items = []
            seen_ids = set()

            for element in body.get("elements") or []:
                relation_id = element.get("id")
                if relation_id in seen_ids:
                    continue

                seen_ids.add(relation_id)
                item = _overpass_relation_to_item(element, query)
                if item:
                    items.append(item)

            if items:
                return items[:6]

        except Exception as exc:
            last_error = exc
            logger.warning(
                "Overpass area-search endpoint failed (%s): %s",
                endpoint,
                exc,
            )

    if last_error:
        logger.warning(
            "All Overpass area-search endpoints failed: %s",
            last_error,
        )

    return []


async def _search_nominatim_variants(query: str) -> list:
    variants = [query]
    lowered = query.lower()

    # Madha is an Omani enclave near Fujairah.
    # Adding Oman helps Nominatim pick the correct administrative area.
    if "madha" in lowered and "oman" not in lowered:
        variants.append(f"{query}, Oman")

    for candidate in variants:
        try:
            body = await _nominatim_get(
                "https://nominatim.openstreetmap.org/search",
                {
                    "q": candidate,
                    "format": "jsonv2",
                    "addressdetails": 1,
                    "polygon_geojson": 1,
                    "polygon_threshold": 0.00015,
                    "limit": 8,
                },
            )

            items = _nominatim_results_to_items(body)
            if items:
                return items

        except Exception as exc:
            logger.warning(
                "Nominatim area search failed for '%s': %s",
                candidate,
                exc,
            )

    return []


@router.get("/area-search")
async def search_delivery_block_area(
    q: str = Query(..., min_length=2, max_length=120),
):
    """
    Search an area by name and return its full boundary for Admin blocking.
    Nominatim is primary; Overpass is fallback.
    """
    query = q.strip()
    cache_key = query.lower()

    if cache_key in _AREA_SEARCH_CACHE:
        return {
            "items": _AREA_SEARCH_CACHE[cache_key],
            "source": "cache",
        }

    items = await _search_nominatim_variants(query)
    if items:
        _AREA_SEARCH_CACHE[cache_key] = items
        return {
            "items": items,
            "source": "nominatim",
        }

    items = await _overpass_area_search(query)
    if items:
        _AREA_SEARCH_CACHE[cache_key] = items
        return {
            "items": items,
            "source": "overpass",
        }

    _AREA_SEARCH_CACHE[cache_key] = []
    return {
        "items": [],
        "source": "none",
        "message": (
            "No full boundary was found. "
            "Try 'Madha, Oman' or use manual map drawing."
        ),
    }


async def reverse_delivery_area_name(lat: float, lng: float) -> dict:
    """Resolve order coordinates to a locality name for Sales by Location."""
    cache_key = f"{round(lat, 4)}:{round(lng, 4)}"

    if cache_key in _REVERSE_AREA_CACHE:
        return _REVERSE_AREA_CACHE[cache_key]

    try:
        body = await _nominatim_get(
            "https://nominatim.openstreetmap.org/reverse",
            {
                "lat": lat,
                "lon": lng,
                "format": "jsonv2",
                "addressdetails": 1,
                "zoom": 13,
                "layer": "address",
            },
        )

        address = (
            body.get("address") or {}
            if isinstance(body, dict)
            else {}
        )

        area = (
            address.get("suburb")
            or address.get("neighbourhood")
            or address.get("village")
            or address.get("town")
            or address.get("municipality")
            or address.get("city_district")
            or address.get("city")
            or address.get("county")
            or "Unknown Area"
        )

        result = {
            "area_name": str(area),
            "country": str(address.get("country") or ""),
            "country_code": str(address.get("country_code") or ""),
        }

        _REVERSE_AREA_CACHE[cache_key] = result
        return result

    except Exception as exc:
        logger.warning("Reverse area lookup failed: %s", exc)
        return {
            "area_name": "Unknown Area",
            "country": "",
            "country_code": "",
        }


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


# ---------- Road Distance + Blocked Area Calculation ----------
import math
from sqlalchemy import select
from models.delivery_zones import Delivery_zones


class CalculateChargeRequest(BaseModel):
    customer_lat: float
    customer_lng: float
    restaurant_lat: float
    restaurant_lng: float


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Straight-line fallback for diagnostics only."""
    radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return radius_km * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def point_in_polygon(lat: float, lng: float, polygon: List[List[float]]) -> bool:
    """Ray-casting point-in-polygon. Points are [lat, lng]."""
    if len(polygon) < 3:
        return False
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        yi, xi = float(polygon[i][0]), float(polygon[i][1])
        yj, xj = float(polygon[j][0]), float(polygon[j][1])
        crosses = ((yi > lat) != (yj > lat)) and (
            lng < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi
        )
        if crosses:
            inside = not inside
        j = i
    return inside


def _geojson_ring_to_latlng(ring: list) -> List[List[float]]:
    # GeoJSON is [lng, lat]; internal point checker is [lat, lng].
    return [[float(point[1]), float(point[0])] for point in ring if isinstance(point, list) and len(point) >= 2]


def point_in_saved_geometry(lat: float, lng: float, raw_value: str) -> bool:
    """Support both old manual [[lat,lng], ...] and GeoJSON Polygon/MultiPolygon."""
    try:
        value = json.loads(raw_value or "[]")
    except (TypeError, json.JSONDecodeError):
        return False

    if isinstance(value, list):
        return point_in_polygon(lat, lng, value)
    if not isinstance(value, dict):
        return False

    geometry_type = value.get("type")
    coordinates = value.get("coordinates") or []
    if geometry_type == "Polygon":
        return any(point_in_polygon(lat, lng, _geojson_ring_to_latlng(ring)) for ring in coordinates[:1])
    if geometry_type == "MultiPolygon":
        for polygon in coordinates:
            if polygon and point_in_polygon(lat, lng, _geojson_ring_to_latlng(polygon[0])):
                return True
    return False


async def google_routes_distance_km(
    restaurant_lat: float,
    restaurant_lng: float,
    customer_lat: float,
    customer_lng: float,
) -> Optional[float]:
    api_key = os.getenv("GOOGLE_MAPS_ROUTES_API_KEY", "").strip()
    if not api_key:
        return None

    payload = {
        "origin": {
            "location": {
                "latLng": {
                    "latitude": restaurant_lat,
                    "longitude": restaurant_lng,
                }
            }
        },
        "destination": {
            "location": {
                "latLng": {
                    "latitude": customer_lat,
                    "longitude": customer_lng,
                }
            }
        },
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_UNAWARE",
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    }
    async with httpx.AsyncClient(timeout=12.0) as client:
        response = await client.post(
            "https://routes.googleapis.com/directions/v2:computeRoutes",
            json=payload,
            headers=headers,
        )
        response.raise_for_status()
        body = response.json()
    routes = body.get("routes") or []
    if not routes:
        return None
    meters = routes[0].get("distanceMeters")
    return (float(meters) / 1000.0) if meters is not None else None


async def osrm_distance_km(
    restaurant_lat: float,
    restaurant_lng: float,
    customer_lat: float,
    customer_lng: float,
) -> Optional[float]:
    """Free fallback for testing. Production should set GOOGLE_MAPS_ROUTES_API_KEY."""
    url = (
        "https://router.project-osrm.org/route/v1/driving/"
        f"{restaurant_lng},{restaurant_lat};{customer_lng},{customer_lat}"
        "?overview=false&alternatives=false&steps=false"
    )
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        body = response.json()
    routes = body.get("routes") or []
    if not routes:
        return None
    meters = routes[0].get("distance")
    return (float(meters) / 1000.0) if meters is not None else None


async def get_road_distance_km(data: CalculateChargeRequest) -> Tuple[float, str]:
    # Preferred: Google Routes (production).
    try:
        distance = await google_routes_distance_km(
            data.restaurant_lat,
            data.restaurant_lng,
            data.customer_lat,
            data.customer_lng,
        )
        if distance is not None:
            return distance, "google_routes"
    except Exception as exc:
        logger.warning("Google Routes distance failed: %s", exc)

    # Free fallback keeps development/testing usable without a key.
    try:
        distance = await osrm_distance_km(
            data.restaurant_lat,
            data.restaurant_lng,
            data.customer_lat,
            data.customer_lng,
        )
        if distance is not None:
            return distance, "osrm"
    except Exception as exc:
        logger.warning("OSRM road distance failed: %s", exc)

    raise HTTPException(
        status_code=503,
        detail="Road distance service is temporarily unavailable. Please try again.",
    )


async def evaluate_delivery_location(data: CalculateChargeRequest, db: AsyncSession) -> dict:
    """Server source of truth: blocked area -> road distance -> matching charge slab."""
    service = Delivery_zonesService(db)

    blocked_result = await service.get_list(
        skip=0, limit=200, query_dict={"is_active": True, "zone_type": "blocked"}, sort="zone_name"
    )
    for area in blocked_result.get("items", []):
        raw_polygon = getattr(area, "polygon_json", "") or ""
        if point_in_saved_geometry(data.customer_lat, data.customer_lng, raw_polygon):
            return {
                "distance_km": None, "charge": 0, "zone_name": None, "available": False,
                "blocked": True, "blocked_area": getattr(area, "zone_name", "Blocked Area"),
                "distance_source": None,
                "message": f"Delivery is not available in {getattr(area, 'zone_name', 'this area')}. Please choose another location or Pickup.",
            }

    distance, distance_source = await get_road_distance_km(data)
    result = await service.get_list(
        skip=0, limit=100, query_dict={"is_active": True, "zone_type": "distance"}, sort="min_distance_km"
    )
    zones = result.get("items", [])
    if not zones:
        return {
            "distance_km": round(distance, 2), "charge": 0, "zone_name": None, "available": False,
            "blocked": False, "blocked_area": None, "distance_source": distance_source,
            "message": "No delivery distance charges are configured.",
        }

    sorted_zones = sorted(zones, key=lambda zone: float(getattr(zone, "max_distance_km", 0) or 0))
    matched_zone = None
    for zone in sorted_zones:
        min_km = float(getattr(zone, "min_distance_km", 0) or 0)
        max_km = float(getattr(zone, "max_distance_km", 0) or 0)
        if min_km <= distance <= max_km:
            matched_zone = zone
            break
    if matched_zone is None:
        # tolerate a tiny admin gap by selecting the next slab that covers the road distance
        for zone in sorted_zones:
            if distance <= float(getattr(zone, "max_distance_km", 0) or 0):
                matched_zone = zone
                break

    if matched_zone is not None:
        charge = float(getattr(matched_zone, "charge", 0) or 0)
        if charge <= 0:
            return {
                "distance_km": round(distance, 2), "charge": 0, "zone_name": getattr(matched_zone, "zone_name", ""),
                "available": False, "blocked": False, "blocked_area": None, "distance_source": distance_source,
                "message": "Delivery charge for this road-distance slab is not configured.",
            }
        return {
            "distance_km": round(distance, 2), "charge": charge,
            "zone_name": getattr(matched_zone, "zone_name", ""), "available": True,
            "blocked": False, "blocked_area": None, "distance_source": distance_source, "message": None,
        }

    max_distance = max(float(getattr(zone, "max_distance_km", 0) or 0) for zone in sorted_zones)
    return {
        "distance_km": round(distance, 2), "charge": 0, "zone_name": None, "available": False,
        "blocked": False, "blocked_area": None, "distance_source": distance_source,
        "message": f"Delivery is not available this far. Maximum road distance is {max_distance:g} km.",
    }


@router.post("/calculate")
async def calculate_delivery_charge(
    data: CalculateChargeRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        return await evaluate_delivery_location(data, db)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to calculate delivery charge: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Could not calculate delivery charge")
