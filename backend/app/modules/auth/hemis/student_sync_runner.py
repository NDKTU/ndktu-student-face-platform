"""Единственная дверь к массовому импорту студентов.

Прогонов ровно два вида — ночной cron (`app/scripts/hemis_student_sync.py`) и
кнопка администратора в интерфейсе, — и оба обязаны ходить сюда. Блокировка
раньше стояла только в скрипте, поэтому cron и нажатие в интерфейсе спокойно
шли одновременно: оба видели одного и того же студента отсутствующим и
заводили его дважды. Уникальный индекс на `student_id_number` теперь такую
запись отвергнет, но падать посреди прогона — плохой способ узнать о гонке.

TTL блокировки — час: полный обход это 49 страниц HEMIS плюс запись тысяч
строк. Ключ протухает сам, чтобы упавший процесс не заблокировал импорт
навсегда.
"""

import logging

from core.redis_client import redis_client
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import StudentSyncApplyRequest, StudentSyncApplyResponse
from .student_sync import hemis_student_sync

logger = logging.getLogger(__name__)

LOCK_KEY = "hemis:student-sync:lock"
LOCK_TTL_SECONDS = 60 * 60


class StudentSyncBusy(HTTPException):
    """Другой прогон уже идёт. Отдельный класс — чтобы cron отличил это от
    настоящей ошибки и вышел с кодом «занято», а не «провалилось»."""

    def __init__(self):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail="Import allaqachon ketmoqda — tugashini kuting",
        )


class StudentSyncRunner:
    async def run(
        self,
        session: AsyncSession,
        data: StudentSyncApplyRequest,
        triggered_by: str = "api",
    ) -> StudentSyncApplyResponse:
        acquired = await redis_client.set(
            LOCK_KEY, triggered_by, nx=True, ex=LOCK_TTL_SECONDS
        )
        if not acquired:
            raise StudentSyncBusy()

        logger.info("HEMIS student sync boshlandi (%s)", triggered_by)
        try:
            return await hemis_student_sync.apply(session, data)
        finally:
            await redis_client.delete(LOCK_KEY)


student_sync_runner = StudentSyncRunner()
