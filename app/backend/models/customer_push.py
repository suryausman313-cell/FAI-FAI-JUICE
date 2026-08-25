from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, func

from core.database import Base


class Customer_push_subscriptions(Base):
    """Web-push subscriptions belonging to logged-in customer devices."""

    __tablename__ = "customer_push_subscriptions"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    customer_account_id = Column(Integer, nullable=False, index=True)
    customer_phone_key = Column(String(30), nullable=False, index=True)

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


class Customer_native_push_tokens(Base):
    """Native mobile push tokens (currently Android / Firebase Cloud Messaging)."""

    __tablename__ = "customer_native_push_tokens"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    customer_account_id = Column(Integer, nullable=False, index=True)
    customer_phone_key = Column(String(30), nullable=False, index=True)

    # FCM registration tokens are opaque and may be long. A token uniquely identifies
    # one app installation; when Firebase rotates it, the app sends the new token here.
    token = Column(Text, nullable=False, unique=True, index=True)
    platform = Column(String(20), nullable=False, default="android", server_default="android")
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")

    user_agent = Column(Text, nullable=True, default="", server_default="")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
