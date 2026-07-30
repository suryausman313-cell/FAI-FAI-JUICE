import asyncio
import importlib
import os
import pkgutil
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine


def clear_backend_import_cache() -> None:
    roots = ("core.database", "models")
    prefixes = tuple(f"{root}." for root in roots)

    for module_name in list(sys.modules):
        if module_name in roots or module_name.startswith(prefixes):
            sys.modules.pop(module_name, None)

    importlib.invalidate_caches()


def get_async_database_url() -> str:
    """
    Render ke DATABASE_URL ko SQLAlchemy async URL me convert karta hai.
    """

    database_url = os.getenv("DATABASE_URL", "").strip()

    if not database_url:
        raise RuntimeError(
            "DATABASE_URL environment variable missing hai. "
            "Render Environment me DATABASE_URL check karo."
        )

    # Render/Neon aksar postgresql:// URL deta hai.
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace(
            "postgresql://",
            "postgresql+asyncpg://",
            1,
        )

    elif database_url.startswith("postgres://"):
        database_url = database_url.replace(
            "postgres://",
            "postgresql+asyncpg://",
            1,
        )

    # Agar sync psycopg URL ho to asyncpg me convert karo.
    elif database_url.startswith("postgresql+psycopg2://"):
        database_url = database_url.replace(
            "postgresql+psycopg2://",
            "postgresql+asyncpg://",
            1,
        )

    elif database_url.startswith("postgresql+psycopg://"):
        database_url = database_url.replace(
            "postgresql+psycopg://",
            "postgresql+asyncpg://",
            1,
        )

    # asyncpg channel_binding support nahi karta.
    if "channel_binding=" in database_url:
        from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

        parts = urlsplit(database_url)
        clean_query = [
            (key, value)
            for key, value in parse_qsl(parts.query, keep_blank_values=True)
            if key != "channel_binding"
        ]

        database_url = urlunsplit(
            (
                parts.scheme,
                parts.netloc,
                parts.path,
                urlencode(clean_query),
                parts.fragment,
            )
        )

    return database_url


clear_backend_import_cache()

from core.database import Base
import models


# Saare SQLAlchemy models load karo.
for _, module_name, _ in pkgutil.iter_modules(models.__path__):
    importlib.import_module(f"{models.__name__}.{module_name}")


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


# Render DATABASE_URL Alembic ko do.
config.set_main_option(
    "sqlalchemy.url",
    get_async_database_url().replace("%", "%%"),
)

target_metadata = Base.metadata


def include_object(
    object_,
    name,
    type_,
    reflected,
    compare_to,
):
    """
    Atoms/system authentication tables ko Alembic se ignore rakho.
    """

    if type_ == "table" and name in {
        "users",
        "sessions",
        "oidc_states",
    }:
        return False

    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = create_async_engine(
        config.get_main_option("sqlalchemy.url"),
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(
            lambda sync_connection: context.configure(
                connection=sync_connection,
                target_metadata=target_metadata,
                compare_type=True,
                compare_server_default=True,
                include_object=include_object,
            )
        )

        await connection.run_sync(
            lambda sync_connection: context.run_migrations()
        )

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
