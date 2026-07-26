from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String


class Deals(Base):
    __tablename__ = "deals"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    name = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    image_url = Column(String, nullable=True)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=True, default=True, server_default='true')
    categories_json = Column(String, nullable=False)
    discount_type = Column(String, nullable=True, default='none', server_default='none')
    discount_value = Column(Float, nullable=True, default=0, server_default='0')
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)