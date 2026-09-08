"""Импорт студентов из HEMIS. Точка входа для cron и ручного запуска.

Работает вне веб-процесса: не занимает воркер и отдаёт осмысленный код
возврата, по которому мониторинг видит провал.

Запуск в контейнере:

    docker exec nusmt_backend sh -c "cd /face && uv run python app/scripts/hemis_student_sync.py"

По умолчанию прогон **инкрементальный** — берутся только изменившиеся с
прошлого раза (`updated_at_from`). Полный обход (49 страниц, ~50 секунд на
чтение) запускается с `--full`; его стоит ставить раз в неделю, чтобы
подобрать записи, которые HEMIS не пометил изменёнными.

Массовое создание требует `--allow-bulk-create`: первое наполнение — законный
случай, но оно должно быть осознанным, а не побочным эффектом ночного cron.

Коды возврата:
    0 — прогон выполнен;
    1 — не выполнен: HEMIS недоступен, токен просрочен, сработала защита;
    2 — прогон уже идёт (взята блокировка другим запуском).
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(BACKEND_ROOT), str(BACKEND_ROOT / "app")]

# Блок обязан идти после правки sys.path — сортировка импортов его сломает.
# isort: off
import app.core.database.models_registry  # noqa: E402,F401 — регистрирует модели
from core.database.db_helper import db_helper  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from app.modules.auth.hemis.schemas import StudentSyncApplyRequest  # noqa: E402
from app.modules.auth.hemis.student_sync_runner import (  # noqa: E402
    StudentSyncBusy,
    student_sync_runner,
)

# isort: on

logger = logging.getLogger("hemis_student_sync")

EXIT_OK = 0
EXIT_FAILED = 1
EXIT_BUSY = 2


def _configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        stream=sys.stdout,
    )


async def _run(args: argparse.Namespace) -> int:
    # Блокировка живёт внутри runner'а — там же, где ею пользуется кнопка в
    # интерфейсе. Двух ключей быть не должно: они бы не мешали друг другу.
    try:
        async with db_helper.session_factory() as session:
            result = await student_sync_runner.run(
                session,
                StudentSyncApplyRequest(
                    incremental=not args.full,
                    allow_bulk_create=args.allow_bulk_create,
                ),
                triggered_by="cron",
            )
    except StudentSyncBusy:
        logger.warning("Boshqa prognoz ketmoqda — o'tkazib yuborildi")
        return EXIT_BUSY
    except HTTPException as error:
        logger.error("Prognoz bajarilmadi: HTTP %s — %s", error.status_code, error.detail)
        return EXIT_FAILED
    except Exception:  # noqa: BLE001
        logger.exception("Prognoz kutilmagan xato bilan tugadi")
        return EXIT_FAILED

    logger.info(
        "Tugadi: olindi %s | yaratildi %s | yangilandi %s | guruhsiz %s | rejim %s",
        result.fetched,
        result.created,
        result.updated,
        result.no_group,
        "incremental" if result.incremental else "full",
    )
    return EXIT_OK


def main() -> int:
    parser = argparse.ArgumentParser(description="HEMIS talabalar importi")
    parser.add_argument(
        "--full",
        action="store_true",
        help="To'liq o'tish (49 sahifa). Standart holat — faqat o'zgarganlar.",
    )
    parser.add_argument(
        "--allow-bulk-create",
        action="store_true",
        help="Ko'p yangi talaba yaratishga ruxsat (birinchi to'ldirish uchun).",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    _configure_logging(args.verbose)
    return asyncio.run(_run(args))


if __name__ == "__main__":
    raise SystemExit(main())
