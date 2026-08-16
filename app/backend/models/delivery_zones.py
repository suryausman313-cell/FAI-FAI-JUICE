from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text


class Delivery_zones(Base):
    __tablename__ = "delivery_zones"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    zone_name = Column(String(100), nullable=False)
    min_distance_km = Column(Float, nullable=False)
    max_distance_km = Column(Float, nullable=False)
    charge = Column(Float, nullable=False)
    is_active = Column(Boolean, nullable=True, default=True, server_default='true')
    # distance = normal km/charge zone; blocked = no-delivery polygon
    zone_type = Column(String(20), nullable=False, default='distance', server_default='distance')
    polygon_json = Column(Text, nullable=True, default='')
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)