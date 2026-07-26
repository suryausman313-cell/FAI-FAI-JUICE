from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Float, Integer, String, func


class Orders(Base):
    __tablename__ = "orders"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    customer_name = Column(String(200), nullable=False)
    customer_phone = Column(String(50), nullable=False)
    pickup_time = Column(String(100), nullable=False)
    order_notes = Column(String, nullable=True, default='', server_default='')
    payment_method = Column(String(50), nullable=False)
    status = Column(String(50), nullable=True, default='new', server_default='new')
    total_amount = Column(Float, nullable=False)
    service_fee = Column(Float, nullable=True, default=0, server_default='0')
    small_order_fee = Column(Float, nullable=True, default=0, server_default='0')
    delivery_charge = Column(Float, nullable=True, default=0, server_default='0')
    tip_amount = Column(Float, nullable=True, default=0, server_default='0')
    tip_type = Column(String(20), nullable=True, default='', server_default='')  # 'rider' or 'shop'
    items_json = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=datetime.now)