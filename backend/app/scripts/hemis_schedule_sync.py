"""Синк расписания из HEMIS. Точка входа для cron и ручного запуска.

Работает вне веб-процесса: не занимает воркер и отдаёт осмысленный код
возврата, по которому мониторинг видит провал.

Запуск в контейнере:

    docker exec nusmt_backend sh -c "cd /face && uv run python app/scripts/hemis_schedule_sync.py"

По умолчанию — текущий учебный год (~191 страница, ~4,5 минуты). Прошлые
годы — `--year 2025` (~735 страниц, ~17 минут): через API их не загрузить,
nginx обрывает запрос на 900 секундах.

Коды возврата:
    0 — прогон выполнен;
    1 — не выполнен: HEMIS недоступен, токен просрочен;
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

from app.core.errors import AppError, error_text  # noqa: E402

from app.modules.auth.hemis.schedule_sync import (  # noqa: E402
    ScheduleSyncBusy,
    hemis_schedule_sync,
)
from app.modules.auth.hemis.schemas import ScheduleSyncRequest  # noqa: E402

# isort: on

logger = logging.getLogger("hemis_schedule_sync")

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
    try:
        async with db_helper.session_factory() as session:
            result = await hemis_schedule_sync.run(
                session,
                ScheduleSyncRequest(
                    education_year=args.year,
                    allow_bulk_deactivate=args.allow_bulk_deactivate,
                ),
                triggered_by="cron",
            )
    except ScheduleSyncBusy:
        logger.warning("Boshqa prognoz ketmoqda — o'tkazib yuborildi")
        return EXIT_BUSY
    except AppError as error:
        logger.error("Prognoz bajarilmadi: %s — %s", error.code, error.message)
        return EXIT_FAILED
    except HTTPException as error:
        logger.error("Prognoz bajarilmadi: HTTP %s — %s", error.status_code, error_text(error))
        return EXIT_FAILED
    except Exception:  # noqa: BLE001
        logger.exception("Prognoz kutilmagan xato bilan tugadi")
        return EXIT_FAILED

    logger.info(
        "Tugadi: yil %s | olindi %s | saqlandi %s / HEMIS %s | nofaol %s | raqamsiz %s | to'liq %s",
        ",".join(result.education_years) or "-",
        result.fetched,
        result.saved,
        result.hemis_total,
        result.deactivated,
        result.without_employee_number,
        "ha" if result.complete else "yo'q",
    )
    if result.deactivation_skipped:
        logger.warning("Nofaol qilish o'tkazildi: %s", result.deactivation_skipped)
    return EXIT_OK


def main() -> int:
    parser = argparse.ArgumentParser(description="HEMIS dars jadvali sinxronizatsiyasi")
    parser.add_argument(
        "--year",
        help="O'quv yili kodi (masalan 2025). Standart — joriy yil.",
    )
    parser.add_argument(
        "--allow-bulk-deactivate",
        action="store_true",
        help="10%% dan ko'p darsni nofaol qilishga ruxsat.",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    if args.year and not (args.year.isdigit() and len(args.year) == 4):
        parser.error("--year to'rt raqam bo'lishi kerak, masalan 2025")

    _configure_logging(args.verbose)
    return asyncio.run(_run(args))


if __name__ == "__main__":
    raise SystemExit(main())
