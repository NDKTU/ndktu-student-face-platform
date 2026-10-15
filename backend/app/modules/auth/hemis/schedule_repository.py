"""Чтение зеркала расписания HEMIS.

Всё ищется по идентификаторам HEMIS, наши `groups`/`teachers` не трогаются —
таблица изолирована (см. `HemisScheduleLesson`).

«Моё расписание» находится по логину:

* преподаватель — логин приезжает из EPMOS и равен номеру сотрудника HEMIS,
  т. е. `employee_id_number` в строке занятия;
* студент — логин равен `student_id_number`, а его группа HEMIS лежит в
  `hemis_student_groups` (её пишет ночной импорт студентов).

Чей логин не совпал (заглушки вида `SIM002` в EPMOS), тот получает пустой
список — специально это не обрабатывается, чинится в EPMOS.
"""

from datetime import date, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schemas import TASHKENT_TZ
from app.modules.auth.model import User

from .model import HemisScheduleLesson, HemisStudentGroup
from .schemas import (
    MyScheduleRequest,
    MyScheduleResponse,
    ScheduleFilterOption,
    ScheduleFiltersResponse,
    ScheduleLessonOut,
    ScheduleListRequest,
    ScheduleListResponse,
)

#: Сколько дней можно запросить в «моём расписании» за раз — семестр с
#: запасом. Без предела один запрос вытаскивал бы весь год.
MY_RANGE_MAX_DAYS = 200

_ORDER = (
    HemisScheduleLesson.lesson_date,
    HemisScheduleLesson.start_time,
    HemisScheduleLesson.lesson_pair,
    HemisScheduleLesson.hemis_id,
)


def _range(request: MyScheduleRequest) -> tuple[date, date]:
    """Запрошенный диапазон; по умолчанию — текущая неделя по Ташкенту.

    Контейнер живёт в UTC, и с 00:00 до 05:00 по Ташкенту `date.today()`
    отдал бы вчерашний день — а в понедельник ночью и прошлую неделю.
    """
    if request.date_from and request.date_to:
        return request.date_from, request.date_to
    if request.date_from:
        return request.date_from, request.date_from + timedelta(days=6)
    if request.date_to:
        return request.date_to - timedelta(days=6), request.date_to
    today = datetime.now(TASHKENT_TZ).date()
    monday = today - timedelta(days=today.weekday())
    return monday, monday + timedelta(days=6)


class HemisScheduleRepository:
    async def list(self, session: AsyncSession, request: ScheduleListRequest) -> ScheduleListResponse:
        conditions = []
        if not request.include_inactive:
            conditions.append(HemisScheduleLesson.is_active.is_(True))
        if request.group_hemis_id is not None:
            conditions.append(HemisScheduleLesson.group_hemis_id == request.group_hemis_id)
        if request.employee_id_number:
            conditions.append(
                HemisScheduleLesson.employee_id_number == request.employee_id_number.strip()
            )
        if request.subject_hemis_id is not None:
            conditions.append(HemisScheduleLesson.subject_hemis_id == request.subject_hemis_id)
        if request.education_year:
            conditions.append(HemisScheduleLesson.education_year == request.education_year)
        if request.date_from:
            conditions.append(HemisScheduleLesson.lesson_date >= request.date_from)
        if request.date_to:
            conditions.append(HemisScheduleLesson.lesson_date <= request.date_to)

        total = (
            await session.execute(
                select(func.count()).select_from(HemisScheduleLesson).where(*conditions)
            )
        ).scalar_one()
        rows = (
            (
                await session.execute(
                    select(HemisScheduleLesson)
                    .where(*conditions)
                    .order_by(*_ORDER)
                    .offset(request.offset)
                    .limit(request.limit)
                )
            )
            .scalars()
            .all()
        )
        return ScheduleListResponse(
            items=[ScheduleLessonOut.model_validate(r) for r in rows],
            total=total,
            page=request.page,
            limit=request.limit,
        )

    async def filters(self, session: AsyncSession) -> ScheduleFiltersResponse:
        """Варианты для фильтров — из этой же таблицы, без наших справочников."""
        active = HemisScheduleLesson.is_active.is_(True)

        async def _options(value_col, label_col) -> list[ScheduleFilterOption]:
            result = await session.execute(
                select(value_col, func.max(label_col))
                .where(active, value_col.is_not(None))
                .group_by(value_col)
                .order_by(func.max(label_col))
            )
            return [
                ScheduleFilterOption(value=str(value), label=label or str(value))
                for value, label in result
            ]

        return ScheduleFiltersResponse(
            education_years=await _options(
                HemisScheduleLesson.education_year, HemisScheduleLesson.education_year_name
            ),
            groups=await _options(HemisScheduleLesson.group_hemis_id, HemisScheduleLesson.group_name),
            employees=await _options(
                HemisScheduleLesson.employee_id_number, HemisScheduleLesson.employee_name
            ),
            subjects=await _options(
                HemisScheduleLesson.subject_hemis_id, HemisScheduleLesson.subject_name
            ),
        )

    async def my(
        self, session: AsyncSession, user: User, request: MyScheduleRequest
    ) -> MyScheduleResponse:
        date_from, date_to = _range(request)
        if date_to < date_from:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "date_to date_from dan oldin bo'lmasin")
        if (date_to - date_from).days > MY_RANGE_MAX_DAYS:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Oraliq {MY_RANGE_MAX_DAYS} kundan oshmasin",
            )

        # Логин EPMOS попадался с ведущими пробелами — без strip такой
        # преподаватель не нашёл бы ничего.
        login = (user.username or "").strip()
        # `user.roles` уже сужены до активной роли (`apply_active_role`):
        # переключившийся на «студента» админ увидит студенческое.
        roles = {(role.name or "").lower() for role in user.roles}

        conditions = None
        as_role = None
        if "teacher" in roles and login:
            as_role = "teacher"
            conditions = HemisScheduleLesson.employee_id_number == login
        elif "student" in roles and login:
            as_role = "student"
            group_hemis_id = (
                await session.execute(
                    select(HemisStudentGroup.group_hemis_id).where(
                        HemisStudentGroup.student_id_number == login
                    )
                )
            ).scalar_one_or_none()
            if group_hemis_id is not None:
                conditions = HemisScheduleLesson.group_hemis_id == group_hemis_id

        if conditions is None:
            return MyScheduleResponse(as_role=as_role, date_from=date_from, date_to=date_to)

        rows = (
            (
                await session.execute(
                    select(HemisScheduleLesson)
                    .where(
                        conditions,
                        HemisScheduleLesson.is_active.is_(True),
                        HemisScheduleLesson.lesson_date >= date_from,
                        HemisScheduleLesson.lesson_date <= date_to,
                    )
                    .order_by(*_ORDER)
                )
            )
            .scalars()
            .all()
        )
        return MyScheduleResponse(
            as_role=as_role,
            date_from=date_from,
            date_to=date_to,
            items=[ScheduleLessonOut.model_validate(r) for r in rows],
        )


hemis_schedule_repository = HemisScheduleRepository()
