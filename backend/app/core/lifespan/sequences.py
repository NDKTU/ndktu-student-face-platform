from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# These three sequences are the ones init_db itself writes into (permissions,
# roles, role_permissions) — reset defensively so a prior explicit-PK insert
# (fixtures/seed scripts) can't leave the sequence behind the max existing id
# and cause a UniqueViolation on the next auto-assigned insert.
_SEQUENCES = ("permissions", "roles", "role_permissions")


async def reset_sequences(session: AsyncSession) -> None:
    """
    Reset PK sequences to avoid UniqueViolation errors.
    Use GREATEST(..., 1) because setval cannot accept 0.
    Third arg 'false' means next nextval() returns this value (safe for empty tables).
    """
    for table in _SEQUENCES:
        await session.execute(
            text(
                f"SELECT setval('{table}_id_seq', "
                f"GREATEST((SELECT COALESCE(MAX(id), 0) FROM {table}), 1), "
                f"(SELECT COUNT(*) > 0 FROM {table}))"
            )
        )
