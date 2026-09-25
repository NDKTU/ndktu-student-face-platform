"""Oʻchirilgan fayllarning baytlarini diskdan tozalash.

Qoidalar va xavfsizlik shartlari — ``app/modules/file/cleanup.py`` da.
Standart rejim — quruq yurish: nima oʻchirilishini koʻrsatadi, bazaga ham,
diskka ham tegmaydi.

Konteynerda ishga tushirish:

    # nima oʻchirilishini koʻrish
    docker exec nusmt_backend sh -c "cd /face && uv run python app/scripts/cleanup_files.py"

    # oʻchirish
    docker exec nusmt_backend sh -c "cd /face && uv run python app/scripts/cleanup_files.py --apply"

Qaytish kodlari:
    0 — bajarildi (oʻchiradigan narsa boʻlmasa ham);
    1 — bajarilmadi: bazaga ulanib boʻlmadi yoki kutilmagan xato.
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(BACKEND_ROOT), str(BACKEND_ROOT / "app")]

# isort: off
import app.core.database.models_registry  # noqa: E402,F401 — bogʻlanishlar resolv boʻlishidan oldin modellarni roʻyxatga oladi
from core.config import settings  # noqa: E402
from core.database.db_helper import db_helper  # noqa: E402

from app.modules.file import cleanup  # noqa: E402
from app.modules.file.quota import format_size  # noqa: E402

# isort: on


async def run(apply: bool, grace_days: int) -> int:
    async with db_helper.session_factory() as session:
        candidates = await cleanup.find_candidates(session, grace_days)
        print(f"Oʻchirilgan va {grace_days} kundan eski blob: {len(candidates)}")

        safe = await cleanup.drop_referenced(session, candidates)
        print(f"Bazada havolasi yoʻq (oʻchirsa boʻladi): {len(safe)}")
        print(f"Boʻshaydigan joy: {format_size(sum(c.size_bytes for c in safe))}")

        if not apply:
            for c in safe[:50]:
                print(f"  {c.stored_path}  {format_size(c.size_bytes)}")
            if len(safe) > 50:
                print(f"  ... va yana {len(safe) - 50} ta")
            print("\nQuruq yurish. Oʻchirish uchun: --apply")
            return 0

        # Tanlov tranzaksiyasi yopiladi — har bir blob oʻz tranzaksiyasida.
        await session.rollback()

        removed = 0
        freed = 0
        for c in safe:
            if await cleanup.purge(session, c):
                removed += 1
                freed += c.size_bytes
        print(f"Oʻchirildi: {removed} ta blob, {format_size(freed)}")
        if removed < len(safe):
            print(f"Qoldirildi (oraliqda qayta ishlatilgan): {len(safe) - removed} ta")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="haqiqatan oʻchirish")
    parser.add_argument(
        "--grace-days",
        type=int,
        default=settings.file_quota.cleanup_grace_days,
        help="oʻchirilganiga shuncha kun toʻlmagan fayllarga tegilmaydi",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")

    if args.grace_days < 1:
        print("--grace-days kamida 1 boʻlishi kerak")
        return 1

    try:
        return asyncio.run(run(args.apply, args.grace_days))
    except Exception:
        logging.exception("Tozalash bajarilmadi")
        return 1


if __name__ == "__main__":
    sys.exit(main())
