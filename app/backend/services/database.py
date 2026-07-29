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
    """
    Add new discount columns to the existing offers table.

    CREATE ALL only creates new tables. It does not add new columns to an
    existing table, so these safe PostgreSQL commands run during startup.
    """

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

            # Existing records ko safe default values do.
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

        # Existing offers table me naye discount columns automatically add karo.
        await ensure_offer_discount_columns()

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
