from sqlalchemy import Column, Float, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy import DateTime

from core.database import Base


class Pickup_cash_settlement_orders(Base):
    """Immutable order snapshot inside one Pickup Cash submission."""

    __tablename__ = "pickup_cash_settlement_orders"
    __table_args__ = (
        UniqueConstraint("settlement_id", "order_id", name="uq_pickup_cash_settlement_order"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    settlement_id = Column(
        Integer,
        ForeignKey("pickup_cash_settlements.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_id = Column(
        Integer,
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_amount = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
