"""Add complete financial and cancellation fields to orders

Revision ID: 20260730_order_financial_fields
Revises: 8868ace2ad6f
Create Date: 2026-07-30
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "20260730_order_financial_fields"
down_revision: Union[str, Sequence[str], None] = "8868ace2ad6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Add missing order columns safely.

    IF NOT EXISTS use kiya gaya hai taake agar koi column database
    me pehle se bana hua ho to migration fail na ho.
    """

    op.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS customer_address VARCHAR DEFAULT '';
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS order_type VARCHAR(30) DEFAULT 'pickup';
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'unpaid';
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS food_subtotal DOUBLE PRECISION DEFAULT 0;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS discount_amount DOUBLE PRECISION DEFAULT 0;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS food_net_total DOUBLE PRECISION DEFAULT 0;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS service_fee DOUBLE PRECISION DEFAULT 0;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS small_order_fee DOUBLE PRECISION DEFAULT 0;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS delivery_charge DOUBLE PRECISION DEFAULT 0;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS tax_amount DOUBLE PRECISION DEFAULT 0;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS tip_amount DOUBLE PRECISION DEFAULT 0;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS tip_type VARCHAR(20) DEFAULT '';
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR DEFAULT '';
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(30) DEFAULT '';
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
        """
    )

    # Purane orders ke financial values fill karo.
    op.execute(
        """
        UPDATE orders
        SET
            food_subtotal = COALESCE(
                food_subtotal,
                total_amount
                - COALESCE(service_fee, 0)
                - COALESCE(small_order_fee, 0)
                - COALESCE(delivery_charge, 0)
                - COALESCE(tax_amount, 0)
                - COALESCE(tip_amount, 0)
            ),
            discount_amount = COALESCE(discount_amount, 0),
            service_fee = COALESCE(service_fee, 0),
            small_order_fee = COALESCE(small_order_fee, 0),
            delivery_charge = COALESCE(delivery_charge, 0),
            tax_amount = COALESCE(tax_amount, 0),
            tip_amount = COALESCE(tip_amount, 0),
            tip_type = COALESCE(tip_type, ''),
            customer_address = COALESCE(customer_address, ''),
            order_type = COALESCE(order_type, 'pickup'),
            payment_status = COALESCE(payment_status, 'unpaid'),
            cancellation_reason = COALESCE(cancellation_reason, ''),
            cancelled_by = COALESCE(cancelled_by, '');
        """
    )

    op.execute(
        """
        UPDATE orders
        SET food_net_total =
            GREATEST(
                COALESCE(food_subtotal, 0)
                - COALESCE(discount_amount, 0),
                0
            )
        WHERE food_net_total IS NULL
           OR food_net_total = 0;
        """
    )


def downgrade() -> None:
    """
    Remove only the fields introduced for the upgraded order system.
    """

    op.execute(
        """
        ALTER TABLE orders
        DROP COLUMN IF EXISTS cancelled_at;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        DROP COLUMN IF EXISTS cancelled_by;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        DROP COLUMN IF EXISTS cancellation_reason;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        DROP COLUMN IF EXISTS tax_amount;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        DROP COLUMN IF EXISTS food_net_total;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        DROP COLUMN IF EXISTS discount_amount;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        DROP COLUMN IF EXISTS food_subtotal;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        DROP COLUMN IF EXISTS payment_status;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        DROP COLUMN IF EXISTS order_type;
        """
    )

    op.execute(
        """
        ALTER TABLE orders
        DROP COLUMN IF EXISTS customer_address;
        """
    )
