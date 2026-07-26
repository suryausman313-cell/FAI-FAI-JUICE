from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String


class Offers(Base):
    __tablename__ = "offers"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    discount_percent = Column(Float, nullable=True, default=0, server_default='0')
    promo_code = Column(String, nullable=True, default='', server_default='')
    banner_image_url = Column(String, nullable=True, default='', server_default='')
    is_active = Column(Boolean, nullable=True, default=True, server_default='true')
    start_date = Column(String, nullable=True)
    end_date = Column(String, nullable=True)
    first_order_only = Column(Boolean, nullable=True, default=False, server_default='false')
    usage_limit_per_customer = Column(Integer, nullable=True, default=1, server_default='1')
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)