from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, func

from core.database import Base


class Receipt_settings(Base):
    """Singleton receipt and network-printer configuration."""

    __tablename__ = "receipt_settings"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    printer_ip = Column(String(64), nullable=False, default="192.168.70.125", server_default="192.168.70.125")
    printer_port = Column(Integer, nullable=False, default=9100, server_default="9100")
    paper_width = Column(String(10), nullable=False, default="80mm", server_default="80mm")
    auto_print_on_accept = Column(Boolean, nullable=False, default=True, server_default="true")

    restaurant_name = Column(String(200), nullable=False, default="Vita Napoli", server_default="Vita Napoli")
    show_logo = Column(Boolean, nullable=False, default=False, server_default="false")
    logo_url = Column(Text, nullable=False, default="", server_default="")
    header_text = Column(Text, nullable=False, default="Kitchen Order", server_default="Kitchen Order")
    footer_text = Column(Text, nullable=False, default="Thank you", server_default="Thank you")

    show_customer_phone = Column(Boolean, nullable=False, default=True, server_default="true")
    show_customer_address = Column(Boolean, nullable=False, default=True, server_default="true")
    show_payment_method = Column(Boolean, nullable=False, default=True, server_default="true")
    show_item_prices = Column(Boolean, nullable=False, default=False, server_default="false")
    show_order_totals = Column(Boolean, nullable=False, default=True, server_default="true")
    cut_paper = Column(Boolean, nullable=False, default=True, server_default="true")

    # Alarm sounds are controlled only by Admin. Android Kitchen/Rider apps
    # read these values; staff devices do not expose a ringtone picker.
    kitchen_alarm_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    kitchen_alarm_audio = Column(Text, nullable=False, default="", server_default="")
    rider_alarm_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    rider_alarm_audio = Column(Text, nullable=False, default="", server_default="")

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=datetime.now,
    )
