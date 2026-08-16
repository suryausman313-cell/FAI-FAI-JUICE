from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Customer_saved_locations(Base):
    __tablename__ = "customer_saved_locations"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    customer_account_id = Column(Integer, nullable=False, index=True)

    label = Column(String(60), nullable=False, default="Saved Location")
    address_text = Column(Text, nullable=False, default="")
    area_name = Column(String(160), nullable=False, default="")

    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)

    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
