"""Зеркало расписания HEMIS (`/rest/v1/data/schedule-list`).

Только чтение: в HEMIS ничего не пишется. Таблица `hemis_schedule_lessons`
изолирована от нашей оргструктуры — см. докстринг модели.

Как идёт прогон:

1. `employee-list?type=teacher` → соответствие `employee.id` →
   `employee_id_number`. В расписании у преподавателя только внутренний id
   HEMIS, а логин у нас — номер сотрудника (он приезжает из EPMOS), и без
   этой подстановки преподаватель своё расписание не нашёл бы.
2. Обход `schedule-list` страница за страницей; каждая страница сразу
   пишется `INSERT … ON CONFLICT (hemis_id) DO UPDATE`. Весь год в памяти не
   держим: прошлый учебный год — 146 тысяч строк.
3. Занятия того же учебного года, которых в выдаче не оказалось, получают
   `is_active = False`. Узнаём их по `synced_at`: каждой строке прогона он
   ставится один и тот же, и всё, что старше, в этот раз не пришло.

Две защиты перед шагом 3, обе из-за того, что HEMIS о сбое не сообщает:

* **Обход должен быть полным.** Выдача отсортирована по `id` по убыванию;
  если во время обхода занятие добавили или удалили, страницы сдвигаются, и
  одна строка «выпадает». Сверяем число уникальных строк с `totalCount`
  последней страницы; не сошлось — ничего не скрываем, следующий прогон
  подберёт.
* **Не больше 10% за раз.** Обрыв приходит как HTTP 200 с коротким списком,
  а не ошибкой. Больше — только с `allow_bulk_deactivate`.
"""

import logging
from datetime import date, datetime, time, timezone

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.core.redis_client import redis_client
from app.core.schemas import TASHKENT_TZ

from . import data_credentials
from .data_client import HemisDataClient
from .model import HemisScheduleLesson
from .schemas import ScheduleSyncRequest, ScheduleSyncResponse
from app.core.errors import Conflict

logger = logging.getLogger(__name__)

SCHEDULE_ENDPOINT = "schedule-list"
EMPLOYEE_ENDPOINT = "employee-list"

#: Текущий год — 191 страница по 200 (замер 15.10.2026), прошлый — 735.
#: Предел с запасом на рост, но не бесконечный.
SCHEDULE_MAX_PAGES = 1500
#: 856 строк (759 человек) — 5 страниц.
EMPLOYEE_MAX_PAGES = 50

#: Какую долю активных занятий года прогон может скрыть без подтверждения.
DEACTIVATE_SHARE_THRESHOLD = 0.10

LOCK_KEY = "hemis:schedule-sync:lock"
#: Текущий год — ~4,5 минуты, прошлый — ~17. Ключ протухает сам, чтобы
#: упавший процесс не заблокировал синк навсегда.
LOCK_TTL_SECONDS = 60 * 60


# ── Разбор строки HEMIS ───────────────────────────────────────────────────────


def _obj(value) -> dict:
    return value if isinstance(value, dict) else {}


def _int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _str(value, size: int) -> str:
    """Строка, обрезанная под колонку: длинное название не должно ронять пачку."""
    if value is None:
        return ""
    return str(value).strip()[:size]


def _date(timestamp) -> date | None:
    """Unix-время HEMIS → дата по Ташкенту.

    HEMIS ставит полночь UTC, а это 05:00 того же дня в Ташкенте; если он
    когда-нибудь перейдёт на местную полночь (19:00 UTC накануне), дата
    по-прежнему выйдет правильной — UTC дал бы вчерашнюю.
    """
    ts = _int(timestamp)
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(ts, TASHKENT_TZ).date()
    except (OSError, OverflowError, ValueError):
        return None


def _utc(timestamp) -> datetime | None:
    ts = _int(timestamp)
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(ts, timezone.utc).replace(tzinfo=None)
    except (OSError, OverflowError, ValueError):
        return None


def _time(value) -> time | None:
    """«14:10» или «8:30» — `fromisoformat` второе не принимает."""
    if not isinstance(value, str) or ":" not in value:
        return None
    try:
        hour, minute = value.strip().split(":")[:2]
        return time(int(hour), int(minute))
    except ValueError:
        return None


def lesson_row(item: dict, employees: dict[int, str], synced_at: datetime) -> dict | None:
    """Строка `schedule-list` → колонки `hemis_schedule_lessons`.

    `None` — строку сохранить нельзя: без id не по чему обновлять, без даты
    занятие бессмысленно.
    """
    hemis_id = _int(item.get("id"))
    lesson_date = _date(item.get("lesson_date"))
    if hemis_id is None or lesson_date is None:
        return None

    subject = _obj(item.get("subject"))
    semester = _obj(item.get("semester"))
    year = _obj(item.get("educationYear"))
    group = _obj(item.get("group"))
    faculty = _obj(item.get("faculty"))
    department = _obj(item.get("department"))
    auditorium = _obj(item.get("auditorium"))
    building = _obj(auditorium.get("building"))
    training = _obj(item.get("trainingType"))
    pair = _obj(item.get("lessonPair"))
    employee = _obj(item.get("employee"))
    employee_hemis_id = _int(employee.get("id"))

    return {
        "hemis_id": hemis_id,
        "education_year": _str(year.get("code"), 16),
        "education_year_name": _str(year.get("name"), 32),
        "semester_hemis_id": _int(semester.get("id")),
        "semester_code": _str(semester.get("code"), 16),
        "semester_name": _str(semester.get("name"), 64),
        "group_hemis_id": _int(group.get("id")),
        "group_name": _str(group.get("name"), 255),
        "education_lang": _str(_obj(group.get("educationLang")).get("name"), 64),
        "subject_hemis_id": _int(subject.get("id")),
        "subject_code": _str(subject.get("code"), 64),
        "subject_name": _str(subject.get("name"), 500),
        "faculty_hemis_id": _int(faculty.get("id")),
        "faculty_name": _str(faculty.get("name"), 255),
        "department_hemis_id": _int(department.get("id")),
        "department_name": _str(department.get("name"), 255),
        "auditorium_code": _int(auditorium.get("code")),
        "auditorium_name": _str(auditorium.get("name"), 128),
        "auditorium_type": _str(_obj(auditorium.get("auditoriumType")).get("name"), 64),
        "building_hemis_id": _int(building.get("id")),
        "building_name": _str(building.get("name"), 255),
        "training_type_code": _str(training.get("code"), 16),
        "training_type": _str(training.get("name"), 64),
        "lesson_pair_code": _str(pair.get("code"), 16),
        "lesson_pair": _str(pair.get("name"), 16),
        "start_time": _time(pair.get("start_time")),
        "end_time": _time(pair.get("end_time")),
        "employee_hemis_id": employee_hemis_id,
        "employee_id_number": employees.get(employee_hemis_id) if employee_hemis_id else None,
        "employee_name": _str(employee.get("name"), 255),
        "lesson_date": lesson_date,
        "week_start": _date(item.get("weekStartTime")),
        "week_end": _date(item.get("weekEndTime")),
        "hemis_updated_at": _utc(item.get("updated_at")),
        "synced_at": synced_at,
        "is_active": True,
    }


#: Колонки, которые upsert переписывает. `hemis_id` — ключ, `created_at` —
#: момент первого появления, их не трогаем.
_UPDATABLE = [
    c.name
    for c in HemisScheduleLesson.__table__.columns
    if c.name not in {"id", "hemis_id", "created_at", "updated_at"}
]


# ── Синк ──────────────────────────────────────────────────────────────────────


class ScheduleSyncBusy(Conflict):
    """Другой прогон уже идёт. Отдельный класс — чтобы cron отличил это от
    настоящей ошибки и вышел с кодом «занято», а не «провалилось»."""

    def __init__(self):
        super().__init__("sync_in_progress", "Jadval sinxronizatsiyasi allaqachon ketmoqda — tugashini kuting")


class HemisScheduleSync:
    async def _client(self, session: AsyncSession) -> HemisDataClient:
        url, token = await data_credentials.effective(session)
        return HemisDataClient(url, token)

    async def _employees(self, client: HemisDataClient) -> dict[int, str]:
        """`employee.id` → `employee_id_number`.

        Один человек встречается в выдаче несколько раз (по строке на
        должность), но `id` у него один и тот же — дубли безвредны.
        """
        result: dict[int, str] = {}
        async for items, _ in client.iter_pages(
            EMPLOYEE_ENDPOINT, params={"type": "teacher"}, max_pages=EMPLOYEE_MAX_PAGES
        ):
            for item in items:
                emp_id = _int(item.get("id"))
                number = _str(item.get("employee_id_number"), 64)
                if emp_id is not None and number:
                    result[emp_id] = number
        logger.info("HEMIS jadval: %s ta xodim raqami olindi", len(result))
        return result

    async def _upsert(self, session: AsyncSession, rows: list[dict]) -> None:
        stmt = pg_insert(HemisScheduleLesson).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["hemis_id"],
            set_={**{name: stmt.excluded[name] for name in _UPDATABLE}, "updated_at": func.now()},
        )
        await session.execute(stmt)

    async def _deactivate(
        self,
        session: AsyncSession,
        years: set[str],
        synced_at: datetime,
        allow_bulk: bool,
    ) -> tuple[int, str | None]:
        """Скрывает занятия этих учебных лет, которых не было в прогоне."""
        scope = (
            HemisScheduleLesson.education_year.in_(years),
            HemisScheduleLesson.is_active.is_(True),
        )
        active = (
            await session.execute(select(func.count()).select_from(HemisScheduleLesson).where(*scope))
        ).scalar_one()
        vanished = (
            await session.execute(
                select(func.count())
                .select_from(HemisScheduleLesson)
                .where(*scope, HemisScheduleLesson.synced_at < synced_at)
            )
        ).scalar_one()

        if not vanished:
            return 0, None
        if not allow_bulk and vanished > active * DEACTIVATE_SHARE_THRESHOLD:
            reason = (
                f"{vanished} ta dars ({vanished * 100 // max(active, 1)}%) HEMIS'dan yo'qolgan — "
                "bu uzilishga o'xshaydi. Tasdiqlash uchun 'allow_bulk_deactivate' bilan yuboring."
            )
            logger.warning("HEMIS jadval: %s", reason)
            return 0, reason

        await session.execute(
            update(HemisScheduleLesson)
            .where(*scope, HemisScheduleLesson.synced_at < synced_at)
            .values(is_active=False, updated_at=func.now())
        )
        await session.commit()
        return vanished, None

    async def apply(self, session: AsyncSession, data: ScheduleSyncRequest) -> ScheduleSyncResponse:
        client = await self._client(session)
        employees = await self._employees(client)

        params = {"_education_year": data.education_year} if data.education_year else None
        # Одна метка на весь прогон: по ней шаг 3 отличает пришедшее от пропавшего.
        synced_at = utcnow_naive()

        seen: set[int] = set()
        #: Все пришедшие id, включая строки, которые сохранить нельзя: по ним
        #: судим о полноте обхода. Иначе одна битая строка в HEMIS навсегда
        #: отключила бы скрытие пропавших.
        received: set[int] = set()
        years: set[str] = set()
        fetched = without_number = 0
        hemis_total = 0
        page_no = 0

        async for items, pagination in client.iter_pages(
            SCHEDULE_ENDPOINT, params=params, max_pages=SCHEDULE_MAX_PAGES
        ):
            page_no += 1
            fetched += len(items)
            hemis_total = int(pagination.get("totalCount") or 0)

            # Внутри одного INSERT строка не может встретиться дважды —
            # Postgres отвергнет всю пачку. Повтор на стыке страниц (сдвиг
            # выдачи) — обычное дело, оставляем последнюю.
            rows: dict[int, dict] = {}
            for item in items:
                raw_id = _int(item.get("id"))
                if raw_id is not None:
                    received.add(raw_id)
                row = lesson_row(item, employees, synced_at)
                if row is not None:
                    rows[row["hemis_id"]] = row

            for hemis_id, row in rows.items():
                if hemis_id not in seen:
                    seen.add(hemis_id)
                    years.add(row["education_year"])
                    if row["employee_hemis_id"] and not row["employee_id_number"]:
                        without_number += 1

            if rows:
                await self._upsert(session, list(rows.values()))
                await session.commit()
            if page_no % 20 == 0:
                logger.info("HEMIS jadval: %s sahifa, %s ta dars", page_no, len(seen))

        await data_credentials.mark_ok(session)

        complete = bool(received) and len(received) >= hemis_total
        deactivated, skipped = 0, None
        if not seen:
            skipped = "HEMIS bo'sh ro'yxat qaytardi — hech narsa nofaol qilinmadi"
        elif not complete:
            skipped = (
                f"To'liq o'tilmadi: {len(received)} ta noyob dars, HEMIS esa {hemis_total} deydi "
                "(o'tish vaqtida jadval o'zgargan). Nofaol qilish keyingi prognozga qoldirildi."
            )
            logger.warning("HEMIS jadval: %s", skipped)
        else:
            deactivated, skipped = await self._deactivate(
                session, years, synced_at, data.allow_bulk_deactivate
            )

        logger.info(
            "HEMIS jadval tugadi: olindi %s, saqlandi %s, nofaol %s, raqamsiz o'qituvchi %s",
            fetched,
            len(seen),
            deactivated,
            without_number,
        )
        return ScheduleSyncResponse(
            education_years=sorted(years),
            fetched=fetched,
            saved=len(seen),
            hemis_total=hemis_total,
            deactivated=deactivated,
            without_employee_number=without_number,
            complete=complete,
            deactivation_skipped=skipped,
        )

    async def run(
        self,
        session: AsyncSession,
        data: ScheduleSyncRequest,
        triggered_by: str = "api",
    ) -> ScheduleSyncResponse:
        """Единственная дверь к синку: cron и кнопка админа делят одну блокировку."""
        acquired = await redis_client.set(LOCK_KEY, triggered_by, nx=True, ex=LOCK_TTL_SECONDS)
        if not acquired:
            raise ScheduleSyncBusy()

        logger.info("HEMIS jadval sinxronizatsiyasi boshlandi (%s)", triggered_by)
        try:
            return await self.apply(session, data)
        finally:
            await redis_client.delete(LOCK_KEY)


hemis_schedule_sync = HemisScheduleSync()
