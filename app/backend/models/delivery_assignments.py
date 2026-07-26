from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Float, Integer, String


class Delivery_assignments(Base):
    __tablename__ = "delivery_assignments"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    order_id = Column(Integer, nullable=False)
    rider_id = Column(Integer, nullable=False)
    status = Column(String(50), nullable=True, default='assigned', server_default='assigned')
    customer_lat = Column(Float, nullable=True)
    customer_lng = Column(Float, nullable=True)
    customer_address = Column(String, nullable=True)
    customer_name = Column(String(200), nullable=True)
    customer_phone = Column(String(50), nullable=True)
    delivery_charge = Column(Float, nullable=True, default=0, server_default='0')  # Zone-based charge = rider earnings
    distance_km = Column(Float, nullable=True)  # Distance from restaurant
    zone_name = Column(String(100), nullable=True)  # Which zone was applied
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)