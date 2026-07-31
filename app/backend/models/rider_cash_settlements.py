from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, func

from core.database import Base


class Rider_cash_settlements(Base):
    """
    Cash submitted by a rider to the shop.

    status:
    - pending: rider submitted, waiting for admin
    - approved: admin confirmed receiving the cash
    - rejected: admin rejected the submission
    """

    __tablename__ = "rider_cash_settlements"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    rider_id = Column(Integer, nullable=False, index=True)
    amount = Column(Float, nullable=False)

    status = Column(String(20), nullable=False, default="pending", server_default="pending")
    rider_note = Column(String, nullable=True, default="", server_default="")
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
