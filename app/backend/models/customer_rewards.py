from sqlalchemy import Column, DateTime, Float, Integer, String, UniqueConstraint, func

from core.database import Base


class Customer_rewards(Base):
    __tablename__ = "customer_rewards"
    __table_args__ = (
        UniqueConstraint("customer_id", "source_order_id", "reward_tier", name="uq_customer_reward_source_tier"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    customer_id = Column(Integer, nullable=False, index=True)
    source_order_id = Column(Integer, nullable=False, index=True)
    reward_tier = Column(String(20), nullable=False, default="normal", server_default="normal")
    reward_type = Column(String(40), nullable=False)
    reward_value = Column(Float, nullable=False, default=0, server_default="0")
    max_discount = Column(Float, nullable=False, default=0, server_default="0")
    minimum_order = Column(Float, nullable=False, default=0, server_default="0")
    title = Column(String(160), nullable=False)
    status = Column(String(20), nullable=False, default="available", server_default="available", index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    redeemed_order_id = Column(Integer, nullable=True, index=True)
    redeemed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
