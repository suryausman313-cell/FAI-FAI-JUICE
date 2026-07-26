from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String


class Riders(Base):
    __tablename__ = "riders"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    name = Column(String(200), nullable=False)
    phone = Column(String(50), nullable=False)
    pin = Column(String(10), nullable=False)
    is_active = Column(Boolean, nullable=True, default=True, server_default='true')
    current_lat = Column(Float, nullable=True)
    current_lng = Column(Float, nullable=True)
    location_updated_at = Column(DateTime(timezone=True), nullable=True)
    last_heartbeat = Column(DateTime(timezone=True), nullable=True)
    delivery_charge = Column(Float, nullable=True, default=0, server_default='0')
    shift_start = Column(String(10), nullable=True)  # e.g. "15:00"
    shift_end = Column(String(10), nullable=True)  # e.g. "02:00"
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)