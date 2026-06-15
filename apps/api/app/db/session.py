from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from app.settings import get_settings


@lru_cache(maxsize=1)
def get_engine() -> AsyncEngine:
    settings = get_settings()
    url = settings.database_url
    connect_args: dict = {}
    # Supabase's transaction pooler (port 6543) is pgbouncer in
    # transaction mode, which doesn't support asyncpg's prepared
    # statement cache. Disable it for pooled connections — every API
    # call would otherwise fail with "prepared statement does not
    # exist." Detect by port to keep local dev (direct Postgres on
    # 5432/5433) using the faster default behaviour.
    if ":6543/" in url or url.endswith(":6543"):
        connect_args["statement_cache_size"] = 0
        # Server-side prepared statements break under pgbouncer too;
        # asyncpg also offers a fully-stateless option.
        connect_args["prepared_statement_cache_size"] = 0
    return create_async_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        connect_args=connect_args,
    )


@lru_cache(maxsize=1)
def get_sessionmaker() -> async_sessionmaker:
    return async_sessionmaker(get_engine(), expire_on_commit=False)
