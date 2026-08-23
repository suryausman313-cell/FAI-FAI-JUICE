from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, func

from core.database import Base


class Rider_payouts(Base):
    """Money paid by the shop/Admin to a Rider for Rider earnings."""

    __tablename__ = "rider_payouts"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    rider_id = Column(Integer, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    note = Column(String, nullable=True, default="", server_default="")
    paid_by = Column(String(200), nullable=True, default="Admin", server_default="Admin")
    payment_method = Column(String(20), nullable=False, default="cash", server_default="cash")
    paid_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=datetime.now,
    )
