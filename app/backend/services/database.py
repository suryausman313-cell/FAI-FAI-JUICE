import logging
import os
import time

from core.database import db_manager
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def check_database_health() -> bool:
    """Check if database is healthy."""
    start_time = time.time()
    logger.debug("[DB_OP] Starting database health check")

    try:
        if not db_manager.async_session_maker:
            return False

        async with db_manager.async_session_maker() as session:
            await session.execute(text("SELECT 1"))

            logger.debug(
                "[DB_OP] Database health check completed in "
                f"{time.time() - start_time:.4f}s - healthy: True"
            )
            return True

    except Exception as error:
        logger.error(f"Database health check failed: {error}")
        logger.debug(
            "[DB_OP] Database health check failed in "
            f"{time.time() - start_time:.4f}s - healthy: False"
        )
        return False


async def ensure_offer_discount_columns() -> None:
    """Add discount fields to the existing offers table safely."""

    if not db_manager.async_session_maker:
        raise RuntimeError("Database session is not initialized")

    statements = [
        """
        ALTER TABLE offers
        ADD COLUMN IF NOT EXISTS discount_type VARCHAR
        NOT NULL DEFAULT 'percentage'
        """,
        """
        ALTER TABLE offers
        ADD COLUMN IF NOT EXISTS fixed_discount_amount DOUBLE PRECISION
        NOT NULL DEFAULT 0
        """,
        """
        ALTER TABLE offers
        ADD COLUMN IF NOT EXISTS minimum_order_amount DOUBLE PRECISION
        NOT NULL DEFAULT 0
        """,
        """
        ALTER TABLE offers
        ADD COLUMN IF NOT EXISTS maximum_discount_amount DOUBLE PRECISION
        NOT NULL DEFAULT 0
        """,
        """
        ALTER TABLE offers
        ADD COLUMN IF NOT EXISTS total_usage_limit INTEGER
        NOT NULL DEFAULT 0
        """,
    ]

    try:
        async with db_manager.async_session_maker() as session:
            for statement in statements:
                await session.execute(text(statement))

            await session.execute(
                text(
                    """
                    UPDATE offers
                    SET
                        discount_type = COALESCE(
                            NULLIF(discount_type, ''),
                            'percentage'
                        ),
                        fixed_discount_amount =
                            COALESCE(fixed_discount_amount, 0),
                        minimum_order_amount =
                            COALESCE(minimum_order_amount, 0),
                        maximum_discount_amount =
                            COALESCE(maximum_discount_amount, 0),
                        total_usage_limit =
                            COALESCE(total_usage_limit, 0)
                    """
                )
            )

            await session.commit()

        logger.info("Offer discount database columns checked successfully")

    except Exception:
        logger.exception("Failed to prepare offer discount database columns")
        raise


async def ensure_order_discount_columns() -> None:
    """Add discount fields to the existing orders table safely."""

    if not db_manager.async_session_maker:
        raise RuntimeError("Database session is not initialized")

    statements = [
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS subtotal_amount DOUBLE PRECISION
        NOT NULL DEFAULT 0
        """,
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50)
        DEFAULT ''
        """,
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20)
        DEFAULT ''
        """,
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS discount_percent DOUBLE PRECISION
        NOT NULL DEFAULT 0
        """,
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS discount_amount DOUBLE PRECISION
        NOT NULL DEFAULT 0
        """,
    ]

    try:
        async with db_manager.async_session_maker() as session:
            for statement in statements:
                await session.execute(text(statement))

            # Purane orders ko safe values do. Purane order me subtotal ka best
            # fallback final total hai, kyun ke unme discount save nahi hota tha.
            await session.execute(
                text(
                    """
                    UPDATE orders
                    SET
                        subtotal_amount = CASE
                            WHEN COALESCE(subtotal_amount, 0) = 0
                            THEN COALESCE(total_amount, 0)
                            ELSE subtotal_amount
                        END,
                        promo_code = COALESCE(promo_code, ''),
                        discount_type = COALESCE(discount_type, ''),
                        discount_percent = COALESCE(discount_percent, 0),
                        discount_amount = COALESCE(discount_amount, 0)
                    """
                )
            )

            await session.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS ix_orders_promo_code
                    ON orders (promo_code)
                    """
                )
            )

            await session.commit()

        logger.info("Order discount database columns checked successfully")

    except Exception:
        logger.exception("Failed to prepare order discount database columns")
        raise


async def ensure_menu_discount_columns() -> None:
    """Ensure menu popularity and scheduled discount fields exist on older databases."""
    if not db_manager.async_session_maker:
        raise RuntimeError("Database session is not initialized")
    statements = [
        "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS extras_json TEXT",
        "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS name_ar VARCHAR(200)",
        "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS description_ar TEXT",
        "ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_ar VARCHAR(100)",
        "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_popular BOOLEAN DEFAULT FALSE",
        "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS discount_enabled BOOLEAN DEFAULT FALSE",
        "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'percentage'",
        "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS discount_value DOUBLE PRECISION DEFAULT 0",
        "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS discount_start_at VARCHAR(40)",
        "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS discount_end_at VARCHAR(40)",
    ]
    async with db_manager.async_session_maker() as session:
        for statement in statements:
            await session.execute(text(statement))
        await session.execute(text("""
            UPDATE menu_items SET
                is_popular = COALESCE(is_popular, FALSE),
                discount_enabled = COALESCE(discount_enabled, FALSE),
                discount_type = COALESCE(NULLIF(discount_type, ''), 'percentage'),
                discount_value = COALESCE(discount_value, 0)
        """))
        await session.commit()
    logger.info("Menu discount/popular database columns checked successfully")


async def ensure_order_delivery_columns() -> None:
    """Ensure structured order type, GPS and address fields exist."""
    if not db_manager.async_session_maker:
        raise RuntimeError("Database session is not initialized")
    statements = [
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) NOT NULL DEFAULT 'pickup'",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lat DOUBLE PRECISION",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lng DOUBLE PRECISION",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_address TEXT DEFAULT ''",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount DOUBLE PRECISION DEFAULT 0",
        "CREATE INDEX IF NOT EXISTS ix_orders_order_type ON orders (order_type)",
    ]
    async with db_manager.async_session_maker() as session:
        for statement in statements:
            await session.execute(text(statement))
        # Backfill old delivery rows from their notes/payment method.
        await session.execute(text("""
            UPDATE orders
            SET order_type = 'delivery'
            WHERE COALESCE(order_type, 'pickup') <> 'delivery'
              AND (
                LOWER(COALESCE(order_notes, '')) LIKE '%order type: delivery%' OR
                LOWER(COALESCE(order_notes, '')) LIKE '%delivery address:%' OR
                LOWER(COALESCE(payment_method, '')) LIKE '%on delivery%'
              )
        """))
        await session.commit()
    logger.info("Order delivery/GPS database columns checked successfully")


async def ensure_multibranch_schema() -> None:
    """Add multi-branch support without changing existing single-branch behaviour."""
    if not db_manager.async_session_maker:
        raise RuntimeError("Database session is not initialized")

    statements = [
        """
        CREATE TABLE IF NOT EXISTS branches (
            id SERIAL PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            address VARCHAR(500) DEFAULT '',
            phone VARCHAR(50) DEFAULT '',
            latitude DOUBLE PRECISION NOT NULL,
            longitude DOUBLE PRECISION NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_id INTEGER",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_name VARCHAR(120) DEFAULT ''",
        "CREATE INDEX IF NOT EXISTS ix_orders_branch_id ON orders (branch_id)",
        "ALTER TABLE branches ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN",
        "ALTER TABLE branches ADD COLUMN IF NOT EXISTS delivery_schedule_enabled BOOLEAN",
        "ALTER TABLE branches ADD COLUMN IF NOT EXISTS delivery_start_time VARCHAR(10)",
        "ALTER TABLE branches ADD COLUMN IF NOT EXISTS delivery_end_time VARCHAR(10)",
        "ALTER TABLE branches ADD COLUMN IF NOT EXISTS estimated_delivery_time VARCHAR(80)",
        "ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS branch_id INTEGER",
        "CREATE INDEX IF NOT EXISTS ix_delivery_zones_branch_id ON delivery_zones (branch_id)",
    ]

    async with db_manager.async_session_maker() as session:
        for statement in statements:
            await session.execute(text(statement))

        branch_count = await session.scalar(text("SELECT COUNT(*) FROM branches"))
        if int(branch_count or 0) == 0:
            settings = (await session.execute(text("""
                SELECT restaurant_name, address, phone, restaurant_lat, restaurant_lng
                FROM restaurant_settings
                ORDER BY id DESC
                LIMIT 1
            """))).mappings().first()

            def as_float(value, fallback):
                try:
                    return float(value)
                except (TypeError, ValueError):
                    return fallback

            name = str((settings or {}).get("restaurant_name") or "Fai Fai Juice - Fujairah")[:120]
            address = str((settings or {}).get("address") or "")[:500]
            phone = str((settings or {}).get("phone") or "")[:50]
            lat = as_float((settings or {}).get("restaurant_lat"), 25.1288)
            lng = as_float((settings or {}).get("restaurant_lng"), 56.3265)
            await session.execute(
                text("""
                    INSERT INTO branches (name, address, phone, latitude, longitude, is_active, is_default)
                    VALUES (:name, :address, :phone, :lat, :lng, TRUE, TRUE)
                """),
                {"name": name, "address": address, "phone": phone, "lat": lat, "lng": lng},
            )

        default_id = await session.scalar(text("""
            SELECT id FROM branches
            WHERE is_default = TRUE AND is_active = TRUE
            ORDER BY id LIMIT 1
        """))
        if default_id is None:
            default_id = await session.scalar(text("SELECT id FROM branches WHERE is_active = TRUE ORDER BY id LIMIT 1"))
            if default_id is not None:
                await session.execute(text("UPDATE branches SET is_default = (id = :id)"), {"id": default_id})

        if default_id is not None:
            await session.execute(text("""
                UPDATE orders
                SET branch_id = COALESCE(branch_id, :branch_id),
                    branch_name = CASE
                        WHEN COALESCE(branch_name, '') = '' THEN COALESCE((SELECT name FROM branches WHERE id = :branch_id), '')
                        ELSE branch_name
                    END
                WHERE branch_id IS NULL OR COALESCE(branch_name, '') = ''
            """), {"branch_id": default_id})

            # Old delivery zones belonged to the original live shop. Assign them
            # to that default branch once, so future branches never share/mix zones.
            await session.execute(text("""
                UPDATE delivery_zones
                SET branch_id = :branch_id
                WHERE branch_id IS NULL
            """), {"branch_id": default_id})

        await session.commit()
    logger.info("Multi-branch database schema checked successfully")


async def ensure_homepage_settings_columns() -> None:
    """Ensure customer homepage controls are stored in restaurant_settings."""
    if not db_manager.async_session_maker:
        raise RuntimeError("Database session is not initialized")
    statements = [
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS checkout_flow VARCHAR(20) DEFAULT 'two_step'",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS tax_percent DOUBLE PRECISION DEFAULT 0",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS banner_text TEXT DEFAULT ''",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS offer_text TEXT DEFAULT ''",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS show_branding BOOLEAN DEFAULT TRUE",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS show_notifications BOOLEAN DEFAULT TRUE",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS show_status_banner BOOLEAN DEFAULT TRUE",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS show_offers BOOLEAN DEFAULT TRUE",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS show_quick_actions BOOLEAN DEFAULT TRUE",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS show_menu_action BOOLEAN DEFAULT TRUE",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS show_deals_action BOOLEAN DEFAULT TRUE",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS show_orders_action BOOLEAN DEFAULT TRUE",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS show_contact_action BOOLEAN DEFAULT TRUE",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS show_popular_items BOOLEAN DEFAULT TRUE",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS show_reviews BOOLEAN DEFAULT TRUE",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS show_restaurant_info BOOLEAN DEFAULT TRUE",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS show_bottom_nav BOOLEAN DEFAULT TRUE",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS popular_auto_enabled BOOLEAN DEFAULT TRUE",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS popular_manual_enabled BOOLEAN DEFAULT TRUE",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS popular_max_items INTEGER DEFAULT 6",
        "ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS auto_assign_rider_enabled BOOLEAN DEFAULT FALSE",
    ]
    async with db_manager.async_session_maker() as session:
        for statement in statements:
            await session.execute(text(statement))
        await session.commit()
    logger.info("Restaurant/homepage settings database columns checked successfully")


async def ensure_admin_alarm_columns() -> None:
    """Add Admin-controlled Kitchen and Rider alarm fields safely."""
    if not db_manager.async_session_maker:
        raise RuntimeError("Database session is not initialized")
    statements = [
        "ALTER TABLE receipt_settings ADD COLUMN IF NOT EXISTS kitchen_alarm_enabled BOOLEAN DEFAULT TRUE",
        "ALTER TABLE receipt_settings ADD COLUMN IF NOT EXISTS kitchen_alarm_audio TEXT DEFAULT ''",
        "ALTER TABLE receipt_settings ADD COLUMN IF NOT EXISTS rider_alarm_enabled BOOLEAN DEFAULT TRUE",
        "ALTER TABLE receipt_settings ADD COLUMN IF NOT EXISTS rider_alarm_audio TEXT DEFAULT ''",
    ]
    async with db_manager.async_session_maker() as session:
        for statement in statements:
            await session.execute(text(statement))
        await session.commit()
    logger.info("Admin-controlled alarm columns checked successfully")


async def initialize_database():
    """Initialize database, create tables and prepare required columns."""

    if "MGX_IGNORE_INIT_DB" in os.environ:
        logger.info("Ignore creating tables")
        return

    start_time = time.time()
    logger.debug("[DB_OP] Starting database initialization")

    try:
        logger.info("🔧 Starting database initialization...")

        await db_manager.init_db()

        logger.info(
            "🔧 Database connection initialized, "
            "now creating tables if tables do not exist..."
        )

        await db_manager.create_tables()

        logger.info("🔧 Table creation completed")

        await ensure_offer_discount_columns()
        await ensure_order_discount_columns()
        logger.info("V6 schema migration 1/3: checking menu columns...")
        await ensure_menu_discount_columns()
        logger.info("V6 schema migration 1/3 completed")

        logger.info("V6 schema migration 2/3: checking order delivery columns...")
        await ensure_order_delivery_columns()
        logger.info("V6 schema migration 2/3 completed")

        logger.info("V6 schema migration 3/3: checking restaurant/homepage columns...")
        await ensure_homepage_settings_columns()
        await ensure_multibranch_schema()
        logger.info("V9 multi-branch schema migration completed")
        logger.info("V7 rider auto-assign schema migration completed")

        await ensure_admin_alarm_columns()
        logger.info("V8 Admin alarm schema migration completed")

        logger.info("V7 database schema migration completed successfully")
        logger.info("Database initialized successfully")
        logger.debug(
            "[DB_OP] Database initialization completed in "
            f"{time.time() - start_time:.4f}s"
        )

    except Exception as error:
        logger.error(f"Failed to initialize database: {error}")
        raise


async def close_database():
    """Close database connections."""

    start_time = time.time()
    logger.debug("[DB_OP] Starting database close")

    try:
        await db_manager.close_db()

        logger.info("Database connections closed")
        logger.debug(
            "[DB_OP] Database close completed in "
            f"{time.time() - start_time:.4f}s"
        )

    except Exception as error:
        logger.error(f"Error closing database: {error}")
        logger.debug(
            "[DB_OP] Database close failed in "
            f"{time.time() - start_time:.4f}s"
        )
