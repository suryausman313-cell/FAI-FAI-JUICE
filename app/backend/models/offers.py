from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String

from core.database import Base


class Offers(Base):
    __tablename__ = "offers"
    __table_args__ = {"extend_existing": True}

    id = Column(
        Integer,
        primary_key=True,
        index=True,
        autoincrement=True,
        nullable=False,
    )

    title = Column(String, nullable=False)
    description = Column(String, nullable=True)

    # Discount type:
    # percentage = percent discount, for example 10%
    # fixed = fixed AED discount, for example 10 AED
    discount_type = Column(
        String,
        nullable=False,
        default="percentage",
        server_default="percentage",
    )

    discount_percent = Column(
        Float,
        nullable=False,
        default=0,
        server_default="0",
    )

    fixed_discount_amount = Column(
        Float,
        nullable=False,
        default=0,
        server_default="0",
    )

    minimum_order_amount = Column(
        Float,
        nullable=False,
        default=0,
        server_default="0",
    )

    maximum_discount_amount = Column(
        Float,
        nullable=False,
        default=0,
        server_default="0",
    )

    promo_code = Column(
        String,
        nullable=True,
        default="",
        server_default="",
        index=True,
    )

    banner_image_url = Column(
        String,
        nullable=True,
        default="",
        server_default="",
    )

    is_active = Column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )

    start_date = Column(String, nullable=True)
    end_date = Column(String, nullable=True)

    first_order_only = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    usage_limit_per_customer = Column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )

    total_usage_limit = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    created_at = Column(
        DateTime(timezone=True),
        default=datetime.now,
    )

    updated_at = Column(
        DateTime(timezone=True),
        default=datetime.now,
        onupdate=datetime.now,
    )
