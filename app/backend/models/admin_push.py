
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, func

from core.database import Base


class Admin_push_subscriptions(Base):
    """Browser push subscriptions belonging to Admin devices."""

    __tablename__ = "admin_push_subscriptions"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    endpoint = Column(Text, nullable=False, unique=True, index=True)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)

    cash_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    ready_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")

    user_agent = Column(Text, nullable=True, default="", server_default="")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class Admin_push_events(Base):
    """Prevents the same business event from being pushed repeatedly."""

    __tablename__ = "admin_push_events"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    event_key = Column(String(255), nullable=False, unique=True, index=True)
    event_type = Column(String(50), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Admin_vapid_settings(Base):
    """One persistent VAPID key pair shared by all Admin subscriptions."""

    __tablename__ = "admin_vapid_settings"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, nullable=False, default=1)
    public_key = Column(Text, nullable=False)
    private_key_der_b64 = Column(Text, nullable=False)
    subject = Column(
        String(255),
        nullable=False,
        default="mailto:admin@vitanapoli.app",
        server_default="mailto:admin@vitanapoli.app",
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
