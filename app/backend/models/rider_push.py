from sqlalchemy import Boolean, Column, DateTime, Integer, Text, func

from core.database import Base


class Rider_push_subscriptions(Base):
    """Web Push subscriptions belonging to authenticated rider devices."""

    __tablename__ = "rider_push_subscriptions"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    rider_id = Column(Integer, nullable=False, index=True)
    endpoint = Column(Text, nullable=False, unique=True, index=True)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    user_agent = Column(Text, nullable=True, default="", server_default="")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
