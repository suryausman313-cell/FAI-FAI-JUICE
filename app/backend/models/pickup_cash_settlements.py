from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, func

from core.database import Base


class Pickup_cash_settlements(Base):
    """Pickup cash handed by Kitchen/shop staff to Admin.

    status:
    - pending: Kitchen submitted, waiting for Admin
    - approved: Admin confirmed receiving the cash
    - rejected: Admin rejected it; linked orders become eligible again
    """

    __tablename__ = "pickup_cash_settlements"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    amount = Column(Float, nullable=False)
    orders_count = Column(Integer, nullable=False, default=0, server_default="0")
    branch_id = Column(Integer, nullable=True, index=True)

    status = Column(String(20), nullable=False, default="pending", server_default="pending", index=True)
    kitchen_note = Column(String, nullable=True, default="", server_default="")
    admin_note = Column(String, nullable=True, default="", server_default="")
    reviewed_by = Column(String(200), nullable=True, default="", server_default="")

    submitted_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=datetime.now,
    )


class Pickup_cash_control(Base):
    """One-row control table that preserves when Pickup Cash tracking started."""

    __tablename__ = "pickup_cash_control"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, nullable=False, default=1)
    tracking_started_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
