from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String


class Customer_sessions(Base):
    __tablename__ = "customer_sessions"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False, index=True)
    customer_name = Column(String(200), nullable=True)
    customer_email = Column(String(200), nullable=True)
    customer_phone = Column(String(50), nullable=True)
    last_active = Column(DateTime(timezone=True), nullable=True)
    first_seen = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)