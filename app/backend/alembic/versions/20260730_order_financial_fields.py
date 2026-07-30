"""Add financial fields to orders

Revision ID: 20260730_order_financial_fields
Revises:
Create Date: 2026-07-30
"""

from alembic import op
import sqlalchemy as sa

revision = "20260730_order_financial_fields"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("orders", sa.Column("food_subtotal", sa.Float(), server_default="0"))
    op.add_column("orders", sa.Column("discount_amount", sa.Float(), server_default="0"))
    op.add_column("orders", sa.Column("food_net_total", sa.Float(), server_default="0"))
    op.add_column("orders", sa.Column("service_fee", sa.Float(), server_default="0"))
    op.add_column("orders", sa.Column("small_order_fee", sa.Float(), server_default="0"))
    op.add_column("orders", sa.Column("delivery_charge", sa.Float(), server_default="0"))
    op.add_column("orders", sa.Column("tax_amount", sa.Float(), server_default="0"))
    op.add_column("orders", sa.Column("tip_amount", sa.Float(), server_default="0"))
    op.add_column("orders", sa.Column("tip_type", sa.String(length=20), server_default=""))
    op.add_column("orders", sa.Column("cancellation_reason", sa.Text(), server_default=""))
    op.add_column("orders", sa.Column("cancelled_by", sa.String(length=30), server_default=""))
    op.add_column("orders", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("orders", "cancelled_at")
    op.drop_column("orders", "cancelled_by")
    op.drop_column("orders", "cancellation_reason")
    op.drop_column("orders", "tip_type")
    op.drop_column("orders", "tip_amount")
    op.drop_column("orders", "tax_amount")
    op.drop_column("orders", "delivery_charge")
    op.drop_column("orders", "small_order_fee")
    op.drop_column("orders", "service_fee")
    op.drop_column("orders", "food_net_total")
    op.drop_column("orders", "discount_amount")
    op.drop_column("orders", "food_subtotal")
