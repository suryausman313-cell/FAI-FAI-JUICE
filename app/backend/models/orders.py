from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, func

from core.database import Base


class Orders(Base):
    __tablename__ = "orders"
    __table_args__ = {"extend_existing": True}

    id = Column(
        Integer,
        primary_key=True,
        index=True,
        autoincrement=True,
        nullable=False,
    )

    user_id = Column(String, nullable=False)

    customer_name = Column(
        String(200),
        nullable=False,
    )

    customer_phone = Column(
        String(50),
        nullable=False,
    )

    pickup_time = Column(
        String(100),
        nullable=False,
        default="",
        server_default="",
    )

    order_notes = Column(
        String,
        nullable=True,
        default="",
        server_default="",
    )

    payment_method = Column(
        String(50),
        nullable=False,
    )

    # Structured fulfilment data. Older rows may still have these details in notes.
    order_type = Column(
        String(20),
        nullable=False,
        default="pickup",
        server_default="pickup",
        index=True,
    )

    customer_lat = Column(Float, nullable=True)
    customer_lng = Column(Float, nullable=True)
    customer_address = Column(String, nullable=True, default="", server_default="")
    branch_id = Column(Integer, nullable=True, index=True)
    branch_name = Column(String(120), nullable=True, default="", server_default="")
    delivery_area_name = Column(String(160), nullable=True, default="", server_default="")
    delivery_country = Column(String(120), nullable=True, default="", server_default="")
    delivery_distance_km = Column(Float, nullable=True)
    delivery_zone_name = Column(String(100), nullable=True, default="", server_default="")

    status = Column(
        String(50),
        nullable=True,
        default="new",
        server_default="new",
    )

    # Final total customer ko pay karna hai
    total_amount = Column(
        Float,
        nullable=False,
    )

    # Items ka total discount se pehle
    subtotal_amount = Column(
        Float,
        nullable=False,
        default=0,
        server_default="0",
    )

    # Applied promo code
    promo_code = Column(
        String(50),
        nullable=True,
        default="",
        server_default="",
        index=True,
    )

    # Discount type: percentage ya fixed
    discount_type = Column(
        String(20),
        nullable=True,
        default="",
        server_default="",
    )

    # Percentage value, jaise 10%
    discount_percent = Column(
        Float,
        nullable=False,
        default=0,
        server_default="0",
    )

    # Actual discount AED me
    discount_amount = Column(
        Float,
        nullable=False,
        default=0,
        server_default="0",
    )

    service_fee = Column(
        Float,
        nullable=True,
        default=0,
        server_default="0",
    )

    small_order_fee = Column(
        Float,
        nullable=True,
        default=0,
        server_default="0",
    )

    delivery_charge = Column(
        Float,
        nullable=True,
        default=0,
        server_default="0",
    )

    tax_amount = Column(
        Float,
        nullable=True,
        default=0,
        server_default="0",
    )

    tip_amount = Column(
        Float,
        nullable=True,
        default=0,
        server_default="0",
    )

    # rider ya shop
    tip_type = Column(
        String(20),
        nullable=True,
        default="",
        server_default="",
    )

    items_json = Column(
        String,
        nullable=False,
    )


    # Operational timing for Kitchen / Rider performance reports.
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    promised_ready_at = Column(DateTime(timezone=True), nullable=True)
    preparing_at = Column(DateTime(timezone=True), nullable=True)
    ready_at = Column(DateTime(timezone=True), nullable=True)
    rider_picked_up_at = Column(DateTime(timezone=True), nullable=True)
    promised_delivery_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=datetime.now,
    )
