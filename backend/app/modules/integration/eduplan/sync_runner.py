"""Полный прогон синхронизации без участия человека и его расписание.

Автоматический прогон намеренно консервативен: он применяет только те
предложения, которые однозначны (создание новой строки, обновление уже
связанной, связывание с единственным совпавшим кандидатом). Конфликты и
деактивации остаются администратору — вслепую связать группу означает
оторвать студентов и историю результатов от нужной строки.

Запускать прогон можно двумя способами, и оба ведут сюда: скриптом
``app/scripts/eduplan_sync.py`` (его и ставят в cron) либо фоновой задачей
внутри приложения. Блокировка в Redis не даёт им пересечься.
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta

from core.config import settings
from core.database.db_helper import db_helper
from core.redis_client import redis_client
from core.schemas import TASHKENT_TZ
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import ApplyRequest
from .service import eduplan_sync_service
from .workload_service import eduplan_workload_service

logger = logging.getLogger(__name__)

LOCK_KEY = "eduplan:sync:lock"
#: Потолок на один прогон. Если процесс умрёт, не сняв блокировку, она
#: протухнет сама и следующий запуск не окажется заблокирован навсегда.
LOCK_TTL_SECONDS = 30 * 60

#: Oxirgi prognning holati. Interfeys shu kalitni soʻrab turadi: prognning
#: oʻzi bir necha daqiqa davom etadi va HTTP soʻrovda kutib boʻlmaydi —
#: brauzerdagi 10 soniyalik chegara ham, nginx dagi 60 soniya ham undan qisqa.
STATE_KEY = "eduplan:sync:state"

#: Tugagan prognning natijasi shuncha vaqt koʻrinib turadi: admin sahifani
#: yopib, keyin qaytib kelsa ham nima boʻlganini koʻradi.
STATE_TTL_SECONDS = 24 * 60 * 60

#: Сколько новых строк в одном справочнике автоматический прогон считает
#: подозрительным. Порог защищает от главного сценария порчи данных: если
#: включить расписание до первого разбора совпадений вручную, ночной прогон
#: не найдёт локальные аналоги по имени и заведёт вторые экземпляры всех 206
#: групп и 754 предметов — молча и с виду успешно.
BULK_CREATE_THRESHOLD = 20


class EduPlanSyncRunner:
    async def run(
        self,
        session: AsyncSession,
        triggered_by: str = "schedule",
        allow_bulk_create: bool = False,
    ) -> dict:
        acquired = await redis_client.set(LOCK_KEY, triggered_by, nx=True, ex=LOCK_TTL_SECONDS)
        if not acquired:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Синхронизация с EduPlan уже выполняется",
            )

        try:
            preview = await eduplan_sync_service.build_preview(session)

            risky = self._bulk_create_risk(preview)
            if risky and not allow_bulk_create:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "Прогон остановлен: он создал бы много новых записей вместо связывания "
                        f"с существующими ({'; '.join(risky)}). Похоже, первичное сопоставление "
                        "ещё не сделано — выполните его на экране синхронизации. Если это "
                        "ожидаемо, запустите скрипт с --allow-bulk-create."
                    ),
                )

            applied = await eduplan_sync_service.apply(
                session,
                ApplyRequest(
                    run_id=preview.run_id,
                    decisions=[],
                    # Гасить пропавшие строки автоматически не будем: это
                    # решение администратора, а не расписания.
                    apply_deactivations=False,
                ),
            )

            workloads = None
            workload_error = None
            try:
                workloads = await eduplan_workload_service.sync(session)
            except HTTPException as e:
                # Нагрузка может быть недоступна сервисному аккаунту или в
                # EduPlan может не быть активного учебного года — справочники
                # при этом уже синхронизированы, и терять их незачем.
                workload_error = str(e.detail)
                logger.warning("EduPlan: импорт нагрузки пропущен: %s", workload_error)

            summary = {
                "triggered_by": triggered_by,
                "run_id": preview.run_id,
                "requires_decision": preview.requires_decision,
                "directories": [r.model_dump() for r in applied.results],
                "workloads": workloads,
                "workloads_error": workload_error,
            }
            logger.info(
                "EduPlan: прогон %s завершён, требуют решения администратора: %d",
                preview.run_id,
                preview.requires_decision,
            )
            return summary
        finally:
            await redis_client.delete(LOCK_KEY)

    # ------------------------------------------------------------------ #
    #  Fon rejimi
    # ------------------------------------------------------------------ #
    async def _write_state(self, payload: dict) -> None:
        await redis_client.set(STATE_KEY, json.dumps(payload), ex=STATE_TTL_SECONDS)

    async def read_state(self) -> dict | None:
        """Oxirgi prognning holati, interfeys uchun.

        Agar holat «ketyapti» deb tursa-yu, qulf yoʻqolgan boʻlsa — jarayon
        oʻlgan (konteyner qayta ishga tushgan). Buni «abadiy ketyapti» deb
        koʻrsatish eng yomon variant: admin kutib oʻtiraveradi.
        """
        raw = await redis_client.get(STATE_KEY)
        if raw is None:
            return None

        state = json.loads(raw)
        if state.get("status") == "running" and not await redis_client.get(LOCK_KEY):
            state = {
                **state,
                "status": "failed",
                "error": "Prognni bajaruvchi jarayon toʻxtab qolgan. Qaytadan urinib koʻring.",
            }
            await self._write_state(state)
        return state

    async def _run_and_record(self, triggered_by: str) -> None:
        """Fon vazifasi. Oʻz sessiyasini ochadi — soʻrovniki javob bilan yopiladi."""
        started_at = datetime.now(TASHKENT_TZ).isoformat()
        try:
            async with db_helper.session_factory() as session:
                summary = await self.run(session, triggered_by=triggered_by)
            await self._write_state(
                {
                    "status": "done",
                    "triggered_by": triggered_by,
                    "started_at": started_at,
                    "finished_at": datetime.now(TASHKENT_TZ).isoformat(),
                    "summary": summary,
                    "error": None,
                }
            )
        except HTTPException as e:
            await self._write_state(
                {
                    "status": "failed",
                    "triggered_by": triggered_by,
                    "started_at": started_at,
                    "finished_at": datetime.now(TASHKENT_TZ).isoformat(),
                    "summary": None,
                    "error": str(e.detail),
                }
            )
        except Exception as e:  # noqa: BLE001 — xato yoʻqolib ketmasligi kerak
            logger.exception("EduPlan: fon progni xato bilan tugadi")
            await self._write_state(
                {
                    "status": "failed",
                    "triggered_by": triggered_by,
                    "started_at": started_at,
                    "finished_at": datetime.now(TASHKENT_TZ).isoformat(),
                    "summary": None,
                    "error": str(e) or e.__class__.__name__,
                }
            )

    async def launch(self, triggered_by: str = "manual") -> dict:
        """Prognni fonda boshlaydi va darhol qaytadi.

        Qulf ``run()`` ichida atomar olinadi; bu yerdagi tekshiruv faqat
        foydalanuvchiga darhol 409 aytish uchun — aks holda u 202 olib,
        keyin holatda «allaqachon ketyapti» degan xatoni koʻrardi.
        """
        if await redis_client.get(LOCK_KEY):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Sinxronizatsiya allaqachon ketyapti",
            )

        state = {
            "status": "running",
            "triggered_by": triggered_by,
            "started_at": datetime.now(TASHKENT_TZ).isoformat(),
            "finished_at": None,
            "summary": None,
            "error": None,
        }
        await self._write_state(state)

        # Havola saqlanadi: aks holda GC vazifani oʻrtasida yigʻishtirib
        # yuborishi mumkin.
        self._task = asyncio.create_task(self._run_and_record(triggered_by))
        return state

    @staticmethod
    def _bulk_create_risk(preview) -> list[str]:
        """Справочники, где прогон завёл бы подозрительно много новых строк.

        Пустой справочник (например, специальности) наполнять с нуля нормально,
        поэтому смотрим только на те, где локальные записи уже есть.
        """
        risky = []
        for item in preview.summary:
            already_matched = item.link + item.update + item.unchanged
            if item.create > BULK_CREATE_THRESHOLD and already_matched == 0:
                risky.append(f"{item.entity.value}: {item.create}")
        return risky

    # ------------------------------------------------------------------ #
    #  Расписание
    # ------------------------------------------------------------------ #
    @staticmethod
    def _seconds_until_next_run(hour: int) -> float:
        """Секунды до ближайшего наступления указанного часа по Ташкенту.

        Час трактуется как местное время, а не UTC: администратор назначает
        синхронизацию на «полночь», имея в виду свою полночь, и расхождение в
        пять часов обнаружилось бы далеко не сразу.
        """
        now = datetime.now(TASHKENT_TZ)
        target = now.replace(hour=hour % 24, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        return (target - now).total_seconds()

    async def nightly_loop(self) -> None:
        """Фоновая задача: раз в сутки в заданный час запускает полный прогон."""
        cfg = settings.eduplan
        logger.info(
            "EduPlan: ночная синхронизация включена, запуск в %02d:00 по Ташкенту",
            cfg.schedule_hour,
        )

        while True:
            await asyncio.sleep(self._seconds_until_next_run(cfg.schedule_hour))
            try:
                async with db_helper.session_factory() as session:
                    await self.run(session, triggered_by="schedule")
            except HTTPException as e:
                # 409 — параллельный прогон, это штатная ситуация при нескольких репликах.
                logger.info("EduPlan: ночной прогон пропущен: %s", e.detail)
            except asyncio.CancelledError:
                raise
            except Exception:
                # Упасть здесь означало бы молча остановить расписание навсегда.
                logger.exception("EduPlan: ночной прогон завершился ошибкой")


eduplan_sync_runner = EduPlanSyncRunner()
