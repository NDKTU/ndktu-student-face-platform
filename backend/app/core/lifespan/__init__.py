import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from core.config import settings
from core.database.db_helper import db_helper
from fastapi import FastAPI
from fastapi_limiter import FastAPILimiter
from sqlalchemy import text

from .admin_user import ensure_admin_user
from .assignment import assign_admin_permissions
from .discovery import discover_permissions
from .permissions import sync_permissions
from .roles import sync_admin_role
from .sequences import reset_sequences

logger = logging.getLogger(__name__)


async def _connect_database() -> None:
    try:
        async with db_helper.engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("Successfully connected to the database")
    except Exception as e:
        logger.error(f"Failed to connect to the database: {e}")
        raise e


async def _connect_redis(redis_client) -> None:
    try:
        await redis_client.ping()
        logger.info("Successfully connected to Redis")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        raise e


async def _seed_admin(app: FastAPI) -> None:
    """
    Seed the Admin role/permissions and the bootstrap admin user using dynamic
    route discovery. Only "Admin" is auto-seeded — see defaults.py.
    """
    async with db_helper.session_factory() as session:
        try:
            logger.info("Initializing Admin role and permissions...")

            discovered_permissions = discover_permissions(app)
            logger.info(f"Discovered {len(discovered_permissions)} permissions: {discovered_permissions}")

            if not discovered_permissions:
                logger.warning("No permissions discovered! Check your routes.")
                return

            await reset_sequences(session)

            existing_perms = await sync_permissions(session, discovered_permissions)
            admin_role, _ = await sync_admin_role(session)

            await assign_admin_permissions(session, discovered_permissions, existing_perms, admin_role)
            await ensure_admin_user(session, admin_role)

            logger.info("Admin role/permissions initialization complete.")

        except Exception as e:
            logger.exception(f"Error initializing database: {e}")
            await session.rollback()
            raise e


async def _init_rate_limiter(redis_client) -> None:
    await FastAPILimiter.init(redis_client)
    logger.info("Initialized FastAPILimiter")


async def _shutdown(redis_client) -> None:
    await db_helper.dispose()
    logger.info("Disposed database engine")
    await redis_client.close()
    logger.info("Closed Redis connection")


def _start_eduplan_schedule() -> "asyncio.Task | None":
    """Ночная синхронизация с EduPlan, если она включена и настроена."""
    cfg = settings.eduplan
    if not (cfg.schedule_enabled and cfg.is_configured):
        return None

    from app.modules.integration.eduplan.sync_runner import eduplan_sync_runner

    return asyncio.create_task(eduplan_sync_runner.nightly_loop())


@asynccontextmanager
async def lifespan(app: FastAPI):
    from core.redis_client import redis_client

    await _connect_database()
    await _connect_redis(redis_client)
    await _seed_admin(app)
    await _init_rate_limiter(redis_client)

    eduplan_task = _start_eduplan_schedule()

    yield

    if eduplan_task is not None:
        eduplan_task.cancel()
        with suppress(asyncio.CancelledError):
            await eduplan_task
        logger.info("Stopped EduPlan schedule")

    await _shutdown(redis_client)
