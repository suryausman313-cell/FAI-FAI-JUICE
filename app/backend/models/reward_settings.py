from sqlalchemy import Boolean, Column, DateTime, Integer, func

from core.database import Base


class Reward_settings(Base):
    __tablename__ = "reward_settings"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
