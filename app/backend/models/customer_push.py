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
