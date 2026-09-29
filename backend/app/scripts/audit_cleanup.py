"""Muddati o'tgan audit yozuvlarini o'chirish.

Saqlash muddati — 90 kun (3 oy). 9600 talabada kuniga o'n mingga yaqin
yozuv to'planadi, ya'ni yilda millionlab qator: tozalanmasa jadval
cheksiz o'sadi va ro'yxat sekinlashadi.

Ishlatish:
    uv run python -m app.scripts.audit_cleanup            # faqat ko'rsatadi
    uv run python -m app.scripts.audit_cleanup --apply    # o'chiradi
    uv run python -m app.scripts.audit_cleanup --days 180 --apply

Chiqish kodlari: 0 — bajarildi, 1 — xato.
"""

import argparse
import asyncio
import logging
import sys
from datetime import datetime, timedelta

import app.core.database.models_registry  # noqa: F401  — mapperlar uchun
from sqlalchemy import func, select

from app.core.database.db_helper import db_helper
from app.modules.audit.model import AuditLog
from app.modules.audit.repository import purge_older_than

DEFAULT_DAYS = 90

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("audit_cleanup")


async def main(days: int, apply: bool) -> int:
    cutoff = datetime.now() - timedelta(days=days)
    async with db_helper.session_factory() as session:
        total = (await session.execute(select(func.count()).select_from(AuditLog))).scalar() or 0
        stale = (
            await session.execute(
                select(func.count()).select_from(AuditLog).where(AuditLog.created_at < cutoff)
            )
        ).scalar() or 0

        logger.info("Jami yozuv: %s", total)
        logger.info("%s kundan eski (%s gacha): %s", days, cutoff.date(), stale)

        if not apply:
            logger.info("Ko'rsatish rejimi — hech narsa o'chirilmadi. O'chirish uchun --apply.")
            return 0
        if stale == 0:
            logger.info("O'chiradigan narsa yo'q.")
            return 0

        removed = await purge_older_than(session, days=days)
        logger.info("O'chirildi: %s", removed)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Audit jurnalini tozalash")
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS, help=f"Saqlash muddati (standart {DEFAULT_DAYS})")
    parser.add_argument("--apply", action="store_true", help="Haqiqatan o'chirish")
    args = parser.parse_args()
    try:
        sys.exit(asyncio.run(main(args.days, args.apply)))
    except Exception:
        logger.exception("Tozalash bajarilmadi")
        sys.exit(1)
