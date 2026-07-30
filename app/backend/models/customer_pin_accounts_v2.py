from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Integer, String

from core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Customer_pin_accounts_v2(Base):
    """Secure phone/PIN customer accounts.

    A new table name is used so this feature cannot damage or conflict with any
    older customer-login table already present in the live database.
    """

    __tablename__ = "customer_pin_accounts_v2"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    phone = Column(String(32), unique=True, index=True, nullable=False)
    customer_name = Column(String(200), nullable=False, default="Customer")

    pin_hash = Column(String(256), nullable=False)
    pin_salt = Column(String(128), nullable=False)
    phone_verified = Column(Boolean, nullable=False, default=True)

    failed_login_attempts = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
