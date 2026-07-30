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

    customer_name = Column(String(200), nullable=False)
    customer_phone = Column(String(50), nullable=False)

    customer_address = Column(
        String,
        nullable=True,
        default="",
        server_default="",
    )

    order_type = Column(
        String(30),
        nullable=True,
        default="pickup",
        server_default="pickup",
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

    payment_method = Column(String(50), nullable=False)

    payment_status = Column(
        String(30),
        nullable=True,
        default="unpaid",
        server_default="unpaid",
    )

    status = Column(
        String(50),
        nullable=True,
        default="new",
        server_default="new",
    )

    # Food amount before discount.
    food_subtotal = Column(
        Float,
        nullable=True,
        default=0,
        server_default="0",
    )

    # Discount only applies to food/menu sale.
    discount_amount = Column(
        Float,
        nullable=True,
        default=0,
        server_default="0",
    )

    # Food amount after discount.
    food_net_total = Column(
        Float,
        nullable=True,
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

    tip_type = Column(
        String(20),
        nullable=True,
        default="",
        server_default="",
    )

    # Final amount paid by customer.
    total_amount = Column(Float, nullable=False)

    cancellation_reason = Column(
        String,
        nullable=True,
        default="",
        server_default="",
    )

    cancelled_by = Column(
        String(30),
        nullable=True,
        default="",
        server_default="",
    )

    cancelled_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    items_json = Column(String, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=datetime.now,
    )
