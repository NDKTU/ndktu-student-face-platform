from datetime import datetime, timezone

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

# asyncpg refuses to bind timezone-aware datetimes to columns declared as
# TIMESTAMP WITHOUT TIME ZONE. Most of our columns are naive, so we normalize
# incoming tz-aware values to naive UTC before persisting. Storage-side UTC is
# also pinned at the connection level (see core/database/db_helper.py).


def utcnow_naive() -> datetime:
    """Return current UTC time as a naive ``datetime``."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_naive_utc(dt: datetime | None) -> datetime | None:
    """Convert a tz-aware datetime to naive UTC. Passes through ``None`` and
    already-naive datetimes unchanged.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
