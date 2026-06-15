import logging
from contextlib import asynccontextmanager

from core.config import settings
from core.db_helper import db_helper
from fastapi import FastAPI
from fastapi_limiter import FastAPILimiter
from redis import asyncio as aioredis

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from core.redis_client import redis_client

    try:
        # Verify connection
        await redis_client.ping()
        logger.info("Successfully connected to Redis")

        # Initialize Database Data (Roles & Permissions)
        async with db_helper.session_factory() as session:
            from core.init_db import init_db

            await init_db(app, session)

        await FastAPILimiter.init(redis_client)
        logger.info("Initialized FastAPILimiter")

    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        # We might want to re-raise if Redis is critical,
        # or just log it if the app can function without cache.
        # Given the user request, it seems critical.
        raise e

    yield

    # Shutdown
    await redis_client.close()
    logger.info("Closed Redis connection")
