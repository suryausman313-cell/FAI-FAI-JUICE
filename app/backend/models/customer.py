from models.base import Base
from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.sql import func


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String(255), nullable=False)

    phone = Column(
        String(30),
        unique=True,
        index=True,
        nullable=False,
    )

    pin_hash = Column(String(255), nullable=False)

    is_active = Column(
        Boolean,
        default=True,
        nullable=False,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    last_login = Column(
        DateTime(timezone=True),
        nullable=True,
    )
