import json
import logging
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.offers import Offers
from services.offers import OffersService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/entities/offers",
    tags=["offers"],
)


# =========================================================
# Helpers
# =========================================================

def normalize_promo_code(value: Optional[str]) -> str:
    if not value:
        return ""

    return value.strip().upper()


def parse_offer_date(value: Optional[str], field_name: str) -> Optional[datetime]:
    if not value:
        return None

    normalized = value.strip().replace("Z", "+00:00")

    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        try:
            return datetime.strptime(value.strip(), "%Y-%m-%d")
        except ValueError as error:
            raise ValueError(
                f"{field_name} must be a valid date, for example 2026-07-30"
            ) from error


async def check_duplicate_promo_code(
    db: AsyncSession,
    promo_code: str,
    exclude_offer_id: Optional[int] = None,
) -> None:
    normalized_code = normalize_promo_code(promo_code)

    if not normalized_code:
        return

    query = select(Offers.id).where(
        func.upper(func.trim(Offers.promo_code)) == normalized_code
    )

    if exclude_offer_id is not None:
        query = query.where(Offers.id != exclude_offer_id)

    result = await db.execute(query)
    existing_offer_id = result.scalar_one_or_none()

    if existing_offer_id is not None:
        raise HTTPException(
            status_code=400,
            detail=f"Promo code {normalized_code} already exists",
        )


def prepare_offer_data(data: dict) -> dict:
    prepared = dict(data)

    if "promo_code" in prepared:
        prepared["promo_code"] = normalize_promo_code(
            prepared.get("promo_code")
        )

    if "discount_type" in prepared and prepared["discount_type"]:
        prepared["discount_type"] = prepared["discount_type"].strip().lower()

    for field_name in (
        "discount_percent",
        "fixed_discount_amount",
        "minimum_order_amount",
        "maximum_discount_amount",
    ):
        if field_name in prepared and prepared[field_name] is not None:
            prepared[field_name] = round(float(prepared[field_name]), 2)

    return prepared


# =========================================================
# Pydantic Schemas
# =========================================================

class OfferBaseData(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None

    discount_type: Literal["percentage", "fixed"] = "percentage"

    discount_percent: float = Field(default=0, ge=0, le=100)
    fixed_discount_amount: float = Field(default=0, ge=0)

    minimum_order_amount: float = Field(default=0, ge=0)
    maximum_discount_amount: float = Field(default=0, ge=0)

    promo_code: Optional[str] = ""
    banner_image_url: Optional[str] = ""

    is_active: bool = True

    start_date: Optional[str] = None
    end_date: Optional[str] = None

    first_order_only: bool = False

    usage_limit_per_customer: int = Field(default=1, ge=0)
    total_usage_limit: int = Field(default=0, ge=0)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        cleaned = value.strip()

        if not cleaned:
            raise ValueError("Offer title is required")

        return cleaned

    @field_validator("promo_code")
    @classmethod
    def clean_promo_code(cls, value: Optional[str]) -> str:
        code = normalize_promo_code(value)

        if code and " " in code:
            raise ValueError("Promo code cannot contain spaces")

        if len(code) > 50:
            raise ValueError("Promo code cannot be longer than 50 characters")

        return code

    @model_validator(mode="after")
    def validate_discount(self):
        if self.discount_type == "percentage":
            if self.discount_percent <= 0:
                raise ValueError(
                    "Percentage discount must be greater than 0"
                )

            self.fixed_discount_amount = 0

        elif self.discount_type == "fixed":
            if self.fixed_discount_amount <= 0:
                raise ValueError(
                    "Fixed discount amount must be greater than 0"
                )

            self.discount_percent = 0

        start = parse_offer_date(self.start_date, "start_date")
        end = parse_offer_date(self.end_date, "end_date")

        if start and end and end < start:
            raise ValueError(
                "End date cannot be earlier than start date"
            )

        return self


class OffersData(OfferBaseData):
    pass


class OffersUpdateData(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None

    discount_type: Optional[Literal["percentage", "fixed"]] = None

    discount_percent: Optional[float] = Field(default=None, ge=0, le=100)
    fixed_discount_amount: Optional[float] = Field(default=None, ge=0)

    minimum_order_amount: Optional[float] = Field(default=None, ge=0)
    maximum_discount_amount: Optional[float] = Field(default=None, ge=0)

    promo_code: Optional[str] = None
    banner_image_url: Optional[str] = None

    is_active: Optional[bool] = None

    start_date: Optional[str] = None
    end_date: Optional[str] = None

    first_order_only: Optional[bool] = None

    usage_limit_per_customer: Optional[int] = Field(default=None, ge=0)
    total_usage_limit: Optional[int] = Field(default=None, ge=0)

    @field_validator("title")
    @classmethod
    def clean_optional_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None

        cleaned = value.strip()

        if not cleaned:
            raise ValueError("Offer title cannot be empty")

        return cleaned

    @field_validator("promo_code")
    @classmethod
    def clean_optional_promo_code(
        cls,
        value: Optional[str],
    ) -> Optional[str]:
        if value is None:
            return None

        code = normalize_promo_code(value)

        if code and " " in code:
            raise ValueError("Promo code cannot contain spaces")

        if len(code) > 50:
            raise ValueError("Promo code cannot be longer than 50 characters")

        return code

    @model_validator(mode="after")
    def validate_partial_dates(self):
        if self.start_date:
            parse_offer_date(self.start_date, "start_date")

        if self.end_date:
            parse_offer_date(self.end_date, "end_date")

        if self.start_date and self.end_date:
            start = parse_offer_date(self.start_date, "start_date")
            end = parse_offer_date(self.end_date, "end_date")

            if start and end and end < start:
                raise ValueError(
                    "End date cannot be earlier than start date"
                )

        return self


class OffersResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None

    discount_type: str = "percentage"

    discount_percent: float = 0
    fixed_discount_amount: float = 0

    minimum_order_amount: float = 0
    maximum_discount_amount: float = 0

    promo_code: Optional[str] = ""
    banner_image_url: Optional[str] = ""

    is_active: bool = True

    start_date: Optional[str] = None
    end_date: Optional[str] = None

    first_order_only: bool = False

    usage_limit_per_customer: int = 1
    total_usage_limit: int = 0

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OffersListResponse(BaseModel):
    items: List[OffersResponse]
    total: int
    skip: int
    limit: int


class OffersBatchCreateRequest(BaseModel):
    items: List[OffersData]


class OffersBatchUpdateItem(BaseModel):
    id: int
    updates: OffersUpdateData


class OffersBatchUpdateRequest(BaseModel):
    items: List[OffersBatchUpdateItem]


class OffersBatchDeleteRequest(BaseModel):
    ids: List[int]


# =========================================================
# Routes
# =========================================================

@router.get("", response_model=OffersListResponse)
async def query_offers(
    query: Optional[str] = Query(
        default=None,
        description="Query conditions as a JSON string",
    ),
    sort: Optional[str] = Query(
        default=None,
        description="Sort field; use - before field for descending",
    ),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=2000),
    fields: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    del fields

    service = OffersService(db)

    try:
        query_dict = None

        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError as error:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid query JSON format",
                ) from error

        return await service.get_list(
            skip=skip,
            limit=limit,
            query_dict=query_dict,
            sort=sort,
        )

    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error
    except Exception as error:
        logger.exception("Error querying offers")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load offers: {error}",
        ) from error


@router.get("/all", response_model=OffersListResponse)
async def query_all_offers(
    query: Optional[str] = Query(default=None),
    sort: Optional[str] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=2000),
    fields: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    del fields

    service = OffersService(db)

    try:
        query_dict = None

        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError as error:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid query JSON format",
                ) from error

        return await service.get_list(
            skip=skip,
            limit=limit,
            query_dict=query_dict,
            sort=sort,
        )

    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error
    except Exception as error:
        logger.exception("Error querying all offers")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load offers: {error}",
        ) from error


@router.get("/{id}", response_model=OffersResponse)
async def get_offer(
    id: int,
    fields: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    del fields

    service = OffersService(db)

    try:
        result = await service.get_by_id(id)

        if not result:
            raise HTTPException(
                status_code=404,
                detail="Offer not found",
            )

        return result

    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Error fetching offer %s", id)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load offer: {error}",
        ) from error


@router.post("", response_model=OffersResponse, status_code=201)
async def create_offer(
    data: OffersData,
    db: AsyncSession = Depends(get_db),
):
    service = OffersService(db)

    try:
        create_data = prepare_offer_data(
            data.model_dump()
        )

        await check_duplicate_promo_code(
            db,
            create_data.get("promo_code", ""),
        )

        result = await service.create(create_data)

        if not result:
            raise HTTPException(
                status_code=400,
                detail="Failed to create offer",
            )

        return result

    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error
    except Exception as error:
        logger.exception("Error creating offer")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create offer: {error}",
        ) from error


@router.put("/{id}", response_model=OffersResponse)
async def update_offer(
    id: int,
    data: OffersUpdateData,
    db: AsyncSession = Depends(get_db),
):
    service = OffersService(db)

    try:
        existing_offer = await service.get_by_id(id)

        if not existing_offer:
            raise HTTPException(
                status_code=404,
                detail="Offer not found",
            )

        update_data = data.model_dump(
            exclude_unset=True,
            exclude_none=True,
        )
        update_data = prepare_offer_data(update_data)

        final_discount_type = update_data.get(
            "discount_type",
            existing_offer.discount_type or "percentage",
        )

        final_percentage = update_data.get(
            "discount_percent",
            existing_offer.discount_percent or 0,
        )

        final_fixed_amount = update_data.get(
            "fixed_discount_amount",
            existing_offer.fixed_discount_amount or 0,
        )

        if final_discount_type == "percentage":
            if final_percentage <= 0 or final_percentage > 100:
                raise HTTPException(
                    status_code=400,
                    detail="Percentage discount must be between 1 and 100",
                )

            update_data["fixed_discount_amount"] = 0

        elif final_discount_type == "fixed":
            if final_fixed_amount <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="Fixed discount amount must be greater than 0",
                )

            update_data["discount_percent"] = 0

        final_start_date = update_data.get(
            "start_date",
            existing_offer.start_date,
        )
        final_end_date = update_data.get(
            "end_date",
            existing_offer.end_date,
        )

        start = parse_offer_date(final_start_date, "start_date")
        end = parse_offer_date(final_end_date, "end_date")

        if start and end and end < start:
            raise HTTPException(
                status_code=400,
                detail="End date cannot be earlier than start date",
            )

        if "promo_code" in update_data:
            await check_duplicate_promo_code(
                db,
                update_data["promo_code"],
                exclude_offer_id=id,
            )

        result = await service.update(id, update_data)

        if not result:
            raise HTTPException(
                status_code=404,
                detail="Offer not found",
            )

        return result

    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error
    except Exception as error:
        logger.exception("Error updating offer %s", id)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update offer: {error}",
        ) from error


@router.delete("/{id}")
async def delete_offer(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    service = OffersService(db)

    try:
        success = await service.delete(id)

        if not success:
            raise HTTPException(
                status_code=404,
                detail="Offer not found",
            )

        return {
            "message": "Offer deleted successfully",
            "id": id,
        }

    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Error deleting offer %s", id)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete offer: {error}",
        ) from error


@router.post(
    "/batch",
    response_model=List[OffersResponse],
    status_code=201,
)
async def create_offers_batch(
    request: OffersBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    service = OffersService(db)
    results = []

    try:
        for item in request.items:
            create_data = prepare_offer_data(
                item.model_dump()
            )

            await check_duplicate_promo_code(
                db,
                create_data.get("promo_code", ""),
            )

            result = await service.create(create_data)

            if result:
                results.append(result)

        return results

    except HTTPException:
        raise
    except Exception as error:
        await db.rollback()
        logger.exception("Error creating offers batch")
        raise HTTPException(
            status_code=500,
            detail=f"Batch create failed: {error}",
        ) from error


@router.put("/batch", response_model=List[OffersResponse])
async def update_offers_batch(
    request: OffersBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    service = OffersService(db)
    results = []

    try:
        for item in request.items:
            update_data = item.updates.model_dump(
                exclude_unset=True,
                exclude_none=True,
            )
            update_data = prepare_offer_data(update_data)

            if "promo_code" in update_data:
                await check_duplicate_promo_code(
                    db,
                    update_data["promo_code"],
                    exclude_offer_id=item.id,
                )

            result = await service.update(
                item.id,
                update_data,
            )

            if result:
                results.append(result)

        return results

    except HTTPException:
        raise
    except Exception as error:
        await db.rollback()
        logger.exception("Error updating offers batch")
        raise HTTPException(
            status_code=500,
            detail=f"Batch update failed: {error}",
        ) from error


@router.delete("/batch/delete")
async def delete_offers_batch(
    request: OffersBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    service = OffersService(db)
    deleted_count = 0

    try:
        for offer_id in request.ids:
            success = await service.delete(offer_id)

            if success:
                deleted_count += 1

        return {
            "message": f"Successfully deleted {deleted_count} offers",
            "deleted_count": deleted_count,
        }

    except Exception as error:
        await db.rollback()
        logger.exception("Error deleting offers batch")
        raise HTTPException(
            status_code=500,
            detail=f"Batch delete failed: {error}",
        ) from error
