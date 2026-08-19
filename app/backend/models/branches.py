from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text

from core.database import Base


class Branches(Base):
    __tablename__ = "branches"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    name = Column(String(120), nullable=False)
    address = Column(String(500), nullable=True, default="", server_default="")
    phone = Column(String(50), nullable=True, default="", server_default="")
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    is_default = Column(Boolean, nullable=False, default=False, server_default="false")
    # Per-branch delivery overrides. The default branch continues to use the
    # existing restaurant_settings values so the live single-branch flow stays unchanged.
    delivery_enabled = Column(Boolean, nullable=True)
    delivery_schedule_enabled = Column(Boolean, nullable=True)
    delivery_start_time = Column(String(10), nullable=True)
    delivery_end_time = Column(String(10), nullable=True)
    estimated_delivery_time = Column(String(80), nullable=True)
    restaurant_status = Column(String(20), nullable=True, default="open", server_default="open")
    # Optional per-branch Kitchen PIN. Default/legacy branch can keep using the
    # existing Render KITCHEN_PIN when these are empty.
    kitchen_pin_hash = Column(Text, nullable=True)
    kitchen_pin_salt = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)
