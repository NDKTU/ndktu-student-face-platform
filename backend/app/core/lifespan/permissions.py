import logging

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Permission

logger = logging.getLogger(__name__)


async def sync_permissions(session: AsyncSession, discovered_permissions: set[str]) -> dict[str, Permission]:
    """
    Ensure every discovered permission name exists as a Permission row, then
    return the full name -> Permission map (existing + newly created).

    Uses INSERT ... ON CONFLICT DO NOTHING instead of "select existing, diff in
    Python, insert missing": Permission.name is unique, so this closes the
    race where two workers/replicas booting at the same moment could both
    decide a permission is missing and both try to insert it, hitting an
    unhandled UniqueViolation.
    """
    if discovered_permissions:
        stmt = (
            pg_insert(Permission)
            .values([{"name": name} for name in discovered_permissions])
            .on_conflict_do_nothing(index_elements=["name"])
        )
        result = await session.execute(stmt)
        await session.commit()
        if result.rowcount:
            logger.info(f"Created {result.rowcount} new permissions.")
        else:
            logger.info("All discovered permissions already exist.")

    existing_perms_result = await session.execute(select(Permission))
    return {p.name: p for p in existing_perms_result.scalars().all()}
