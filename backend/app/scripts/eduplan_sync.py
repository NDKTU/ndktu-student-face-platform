"""Синхронизация справочников и нагрузки из EduPlan (EPOS).

Точка входа для системного cron и для ручного запуска. Работает вне
веб-процесса: не занимает воркер, не зависит от того, сколько реплик поднято, и
отдаёт осмысленный код возврата, по которому cron или мониторинг видят провал.

Запуск в контейнере:

    docker exec nusmt_backend sh -c "cd /face && uv run python app/scripts/eduplan_sync.py"

Коды возврата:
    0 — прогон выполнен (в том числе если часть строк пропущена);
    1 — прогон не выполнен: EduPlan недоступен, нет прав, не настроено,
        сработала защита от массового создания дублей;
    2 — прогон уже идёт (взята блокировка другим запуском). Отдельный код,
        чтобы мониторинг не считал это авариями.
"""

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

# Скрипт запускают по пути, а не как модуль пакета, поэтому корень проекта и
# каталог app кладём на sys.path сами — импорты в проекте смешанные
# (`from core...` и `from app.modules...`).
BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(BACKEND_ROOT), str(BACKEND_ROOT / "app")]

# Блок обязан идти после правки sys.path — сортировка импортов его сломает.
# isort: off
import app.core.database.models_registry  # noqa: E402,F401 — регистрирует модели до резолва связей
from core.database.db_helper import db_helper  # noqa: E402
from core.redis_client import redis_client  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from app.modules.integration.eduplan.credentials import effective_config  # noqa: E402
from app.modules.integration.eduplan.sync_runner import eduplan_sync_runner  # noqa: E402
from app.modules.integration.eduplan.workload_service import (  # noqa: E402
    eduplan_workload_service,
)

# isort: on

logger = logging.getLogger("eduplan_sync")

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
            # Креды могли быть введены администратором в интерфейсе — тогда
            # переменные окружения не обязательны.
            cfg = await effective_config(session)
            if not cfg.is_configured:
                logger.error(
                    "Интеграция с EduPlan не настроена: введите логин и пароль на экране "
                    "синхронизации либо заполните APP_CONFIG__EDUPLAN__USERNAME/PASSWORD "
                    "и выставьте APP_CONFIG__EDUPLAN__ENABLED=true."
                )
                return EXIT_FAILED
            if args.workloads_only:
                result = await eduplan_workload_service.sync(session, args.academic_year_id)
            else:
                result = await eduplan_sync_runner.run(
                    session,
                    triggered_by=args.triggered_by,
                    allow_bulk_create=args.allow_bulk_create,
                )
    except HTTPException as e:
        detail = e.detail if isinstance(e.detail, str) else json.dumps(e.detail, ensure_ascii=False)
        if e.status_code == 409 and "уже выполняется" in str(detail):
            logger.warning("Прогон пропущен: %s", detail)
            return EXIT_BUSY
        logger.error("Прогон не выполнен (HTTP %s): %s", e.status_code, detail)
        return EXIT_FAILED
    except Exception:
        logger.exception("Прогон завершился необработанной ошибкой")
        return EXIT_FAILED
    finally:
        # Скрипт короткоживущий: соединения нужно закрыть явно, иначе процесс
        # повиснет на открытом пуле и cron будет копить зависшие задания.
        await db_helper.dispose()
        await redis_client.aclose()

    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    return EXIT_OK


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Синхронизация справочников и нагрузки из EduPlan (EPOS).",
    )
    parser.add_argument(
        "--workloads-only",
        action="store_true",
        help="Только нагрузка, без справочников. Требует уже связанных преподавателей, предметов и групп.",
    )
    parser.add_argument(
        "--academic-year-id",
        type=int,
        default=None,
        help="Учебный год для нагрузки. По умолчанию берётся активный из EduPlan.",
    )
    parser.add_argument(
        "--allow-bulk-create",
        action="store_true",
        help="Разрешить массовое создание записей. Нужен только для первого импорта в "
        "пустую базу: в обычном прогоне это признак того, что сопоставление не сделано "
        "и вот-вот появятся дубли.",
    )
    parser.add_argument(
        "--triggered-by",
        default="cron",
        help="Метка запуска для логов (cron, manual, deploy).",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Подробный вывод.")

    args = parser.parse_args()
    _configure_logging(args.verbose)
    return asyncio.run(_run(args))


if __name__ == "__main__":
    raise SystemExit(main())
