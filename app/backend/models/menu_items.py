from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String


class Menu_items(Base):
    __tablename__ = "menu_items"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    category_id = Column(Integer, nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(String, nullable=True)
    price_medium = Column(Float, nullable=True)
    price_large = Column(Float, nullable=True)
    sizes_json = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=True, default=True, server_default='true')
    has_extras = Column(Boolean, nullable=True, default=True, server_default='true')
    is_popular = Column(Boolean, nullable=True, default=False, server_default='false')
    sort_order = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)