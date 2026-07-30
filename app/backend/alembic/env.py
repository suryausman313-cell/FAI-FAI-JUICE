import asyncio
import importlib
import os
import pkgutil
import sys
from logging.config import fileConfig
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

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


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL", "").strip()

    if not database_url:
        raise RuntimeError(
            "DATABASE_URL missing hai. Render Environment me DATABASE_URL check karo."
        )

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

    # asyncpg ke saath incompatible parameter remove karo.
    parts = urlsplit(database_url)
    clean_query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key != "channel_binding"
    ]

    return urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            parts.path,
            urlencode(clean_query),
            parts.fragment,
        )
    )


clear_backend_import_cache()

from core.database import Base
import models


# Saare ORM models load karo.
for _, module_name, _ in pkgutil.iter_modules(models.__path__):
    importlib.import_module(f"{models.__name__}.{module_name}")


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


database_url = get_database_url()

# Alembic configuration me DATABASE_URL set karo.
config.set_main_option(
    "sqlalchemy.url",
    database_url.replace("%", "%%"),
)

target_metadata = Base.metadata


def include_object(
    object_,
    name,
    type_,
    reflected,
    compare_to,
):
    if type_ == "table" and name in {
        "users",
        "sessions",
        "oidc_states",
    }:
        return False

    return True


def run_migrations_offline() -> None:
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = create_async_engine(
        database_url,
        poolclass=pool.NullPool,
    )

    try:
        async with connectable.connect() as connection:
            await connection.run_sync(do_run_migrations)
    finally:
        await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
