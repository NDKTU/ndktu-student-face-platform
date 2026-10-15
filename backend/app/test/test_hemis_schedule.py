"""Зеркало расписания HEMIS.

Проверяется то, ради чего синк устроен именно так: повторный прогон не
дублирует, пропавшее скрывается только при полном обходе и в пределах своего
года, а «моё расписание» находится по логину — у преподавателя через номер
сотрудника, которого в самом расписании нет.
"""

from datetime import date, time
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.modules.auth.hemis.model import HemisScheduleLesson, HemisStudentGroup
from app.modules.auth.hemis.schedule_repository import hemis_schedule_repository
from app.modules.auth.hemis.schedule_sync import HemisScheduleSync, hemis_schedule_sync, lesson_row
from app.modules.auth.hemis.schemas import (
    MyScheduleRequest,
    ScheduleFiltersRequest,
    ScheduleListRequest,
    ScheduleSyncRequest,
    StudentSyncApplyRequest,
)
from app.modules.auth.hemis.student_sync import HemisStudentSync, hemis_student_sync

#: 2026-10-29 00:00 UTC (четверг) — так HEMIS ставит `lesson_date`.
LESSON_TS = 1793232000


def _lesson(hemis_id: int, **overrides) -> dict:
    """Запись в том виде, в каком её отдаёт `/rest/v1/data/schedule-list`."""
    item = {
        "id": hemis_id,
        "subject": {"id": 4109, "name": "Geotexnologik skvajinalar", "code": "GSBEJ4707"},
        "semester": {"id": 2471, "code": "17", "name": "7-semestr"},
        "educationYear": {"code": "2026", "name": "2026-2027", "current": True},
        "group": {"id": 774, "name": "31a-23 NRM (Iq)", "educationLang": {"code": "11", "name": "O‘zbek"}},
        "faculty": {"id": 2, "name": "Konchilik"},
        "department": {"id": 10, "name": "Noyob metallar"},
        "auditorium": {
            "code": 137,
            "name": "V-315",
            "auditoriumType": {"code": "12", "name": "Laboratoriya"},
            "building": {"id": 2, "name": "\"V\" Konchilik fakulteti"},
        },
        "trainingType": {"code": "13", "name": "Amaliy"},
        "lessonPair": {"code": "15", "name": "5", "start_time": "14:10", "end_time": "15:30"},
        "employee": {"id": 902, "name": "SANATOV SH. O."},
        "weekStartTime": 1792972800,
        "weekEndTime": 1793404800,
        "lesson_date": LESSON_TS,
        "updated_at": 1792034133,
    }
    item.update(overrides)
    return item


class FakeClient:
    """HEMIS, отвечающий заранее заданными страницами.

    `total` — что HEMIS говорит в `totalCount`; по умолчанию столько, сколько
    реально отдано, т. е. обход полный.
    """

    def __init__(self, state: dict):
        self._state = state

    async def iter_pages(self, name, params=None, limit=200, max_pages=200):
        if name == "employee-list":
            yield self._state["employees"], {"totalCount": len(self._state["employees"])}
            return
        pages = self._state["pages"]
        total = self._state.get("total")
        if total is None:
            total = len({i["id"] for page in pages for i in page})
        for page in pages:
            yield page, {"totalCount": total}


@pytest.fixture
def hemis(monkeypatch):
    state = {
        "employees": [{"id": 902, "employee_id_number": "3192611054"}],
        "pages": [],
        "total": None,
    }

    async def _client(self, session):
        return FakeClient(state)

    monkeypatch.setattr(HemisScheduleSync, "_client", _client)
    return state


async def _lessons(session) -> dict[int, HemisScheduleLesson]:
    session.expire_all()
    rows = (await session.execute(select(HemisScheduleLesson))).scalars().all()
    return {r.hemis_id: r for r in rows}


def test_lesson_row_parses_hemis_record():
    row = lesson_row(_lesson(1), {902: "3192611054"}, synced_at=None)

    assert row["lesson_date"] == date(2026, 10, 29)
    assert row["week_start"] == date(2026, 10, 26)
    assert row["start_time"] == time(14, 10)
    assert row["end_time"] == time(15, 30)
    assert row["group_hemis_id"] == 774
    assert row["building_name"] == "\"V\" Konchilik fakulteti"
    # Логин преподавателя — номер сотрудника, а не внутренний `employee.id`.
    assert row["employee_hemis_id"] == 902
    assert row["employee_id_number"] == "3192611054"


def test_lesson_row_accepts_single_digit_hour_and_skips_broken():
    row = lesson_row(
        _lesson(1, lessonPair={"code": "11", "name": "1", "start_time": "8:30", "end_time": "9:50"}),
        {},
        synced_at=None,
    )
    assert row["start_time"] == time(8, 30)
    # Человека нет в `employee-list` — занятие всё равно сохраняется.
    assert row["employee_id_number"] is None

    assert lesson_row(_lesson(2, lesson_date=None), {}, synced_at=None) is None
    assert lesson_row(_lesson(None), {}, synced_at=None) is None


@pytest.mark.asyncio
async def test_rerun_updates_instead_of_duplicating(async_db, hemis):
    hemis["pages"] = [[_lesson(1), _lesson(2)]]
    await hemis_schedule_sync.apply(async_db, ScheduleSyncRequest())

    hemis["pages"] = [[_lesson(1, auditorium={"code": 140, "name": "V-401"}), _lesson(2)]]
    result = await hemis_schedule_sync.apply(async_db, ScheduleSyncRequest())

    lessons = await _lessons(async_db)
    assert set(lessons) == {1, 2}
    assert lessons[1].auditorium_name == "V-401"
    assert result.saved == 2 and result.complete


@pytest.mark.asyncio
async def test_duplicate_on_page_boundary_does_not_break_batch(async_db, hemis):
    """Сдвиг выдачи даёт одну строку дважды — в одном INSERT это ошибка Postgres."""
    hemis["pages"] = [[_lesson(1), _lesson(1)], [_lesson(1), _lesson(2)]]

    result = await hemis_schedule_sync.apply(async_db, ScheduleSyncRequest())

    assert result.saved == 2
    assert set(await _lessons(async_db)) == {1, 2}


@pytest.mark.asyncio
async def test_vanished_lesson_is_hidden_only_within_its_year(async_db, hemis):
    old_year = {"code": "2025", "name": "2025-2026"}
    hemis["pages"] = [[_lesson(i) for i in range(1, 11)] + [_lesson(99, educationYear=old_year)]]
    await hemis_schedule_sync.apply(async_db, ScheduleSyncRequest())

    # Обычный ночной прогон: текущий год без одного занятия, прошлого года
    # в выдаче нет вовсе — его трогать нельзя.
    hemis["pages"] = [[_lesson(i) for i in range(1, 10)]]
    result = await hemis_schedule_sync.apply(async_db, ScheduleSyncRequest())

    lessons = await _lessons(async_db)
    assert result.deactivated == 1
    assert lessons[10].is_active is False
    assert lessons[99].is_active is True
    assert all(lessons[i].is_active for i in range(1, 10))

    # Вернулось — снова активно.
    hemis["pages"] = [[_lesson(i) for i in range(1, 11)]]
    await hemis_schedule_sync.apply(async_db, ScheduleSyncRequest())
    assert (await _lessons(async_db))[10].is_active is True


@pytest.mark.asyncio
async def test_incomplete_walk_hides_nothing(async_db, hemis):
    """Страницы сдвинулись во время обхода — пропавшее не скрываем."""
    hemis["pages"] = [[_lesson(i) for i in range(1, 11)]]
    await hemis_schedule_sync.apply(async_db, ScheduleSyncRequest())

    hemis["pages"] = [[_lesson(i) for i in range(1, 10)]]
    hemis["total"] = 10
    result = await hemis_schedule_sync.apply(async_db, ScheduleSyncRequest())

    assert result.complete is False
    assert result.deactivated == 0
    assert result.deactivation_skipped
    assert (await _lessons(async_db))[10].is_active is True


@pytest.mark.asyncio
async def test_mass_disappearance_needs_confirmation(async_db, hemis):
    """HEMIS при сбое отвечает 200 с коротким списком — это не повод скрыть всё."""
    hemis["pages"] = [[_lesson(i) for i in range(1, 11)]]
    await hemis_schedule_sync.apply(async_db, ScheduleSyncRequest())

    hemis["pages"] = [[_lesson(1)]]
    result = await hemis_schedule_sync.apply(async_db, ScheduleSyncRequest())
    assert result.deactivated == 0
    assert result.deactivation_skipped
    assert all(r.is_active for r in (await _lessons(async_db)).values())

    result = await hemis_schedule_sync.apply(
        async_db, ScheduleSyncRequest(allow_bulk_deactivate=True)
    )
    assert result.deactivated == 9


def _user(username: str, role: str):
    """`my()` смотрит только на логин и роли — полноценный User не нужен."""
    return SimpleNamespace(username=username, roles=[SimpleNamespace(name=role)])


WEEK = MyScheduleRequest(date_from=date(2026, 10, 26), date_to=date(2026, 11, 1))


@pytest.mark.asyncio
async def test_teacher_finds_schedule_by_login_with_spaces(async_db, hemis):
    """Логин из EPMOS попадался с ведущими пробелами — поиск их обрезает."""
    hemis["pages"] = [[_lesson(1), _lesson(2, employee={"id": 543, "name": "AVAZOV A. N."})]]
    await hemis_schedule_sync.apply(async_db, ScheduleSyncRequest())

    result = await hemis_schedule_repository.my(async_db, _user("   3192611054", "teacher"), WEEK)

    assert result.as_role == "teacher"
    assert [i.hemis_id for i in result.items] == [1]


@pytest.mark.asyncio
async def test_placeholder_login_gets_empty_schedule(async_db, hemis):
    hemis["pages"] = [[_lesson(1)]]
    await hemis_schedule_sync.apply(async_db, ScheduleSyncRequest())

    result = await hemis_schedule_repository.my(async_db, _user("SIM002", "teacher"), WEEK)

    assert result.as_role == "teacher"
    assert result.items == []


@pytest.mark.asyncio
async def test_student_finds_schedule_through_group_map(async_db, hemis, monkeypatch):
    """Группа студента не привязана к нашим `groups` — расписание всё равно есть.

    Импорт такого студента пропускает (`no_group`), но соответствие номер →
    группа HEMIS записывает.
    """
    student = {
        "student_id_number": "319261100725",
        "full_name": "Aliyev Vali",
        "group": {"id": 774, "name": "31a-23 NRM (Iq)"},
    }

    class StudentClient:
        async def fetch_all(self, limit=200, updated_at_from=None):
            return [student]

    async def _client(self, session):
        return StudentClient()

    monkeypatch.setattr(HemisStudentSync, "_client", _client)
    result = await hemis_student_sync.apply(async_db, StudentSyncApplyRequest())
    assert result.no_group == 1

    mapped = (await async_db.execute(select(HemisStudentGroup))).scalar_one()
    assert (mapped.student_id_number, mapped.group_hemis_id) == ("319261100725", 774)

    hemis["pages"] = [[_lesson(1), _lesson(2, group={"id": 775, "name": "Boshqa"})]]
    await hemis_schedule_sync.apply(async_db, ScheduleSyncRequest())

    my = await hemis_schedule_repository.my(async_db, _user("319261100725", "student"), WEEK)
    assert my.as_role == "student"
    assert [i.hemis_id for i in my.items] == [1]


@pytest.mark.asyncio
async def test_faculty_filter_narrows_list_and_cascades_options(async_db, hemis):
    """Факультет — это факультет группы; кафедра предмета бывает с другого.

    Выбранный факультет сужает группы, преподавателей, предметы и кафедры,
    но список факультетов остаётся полным — иначе выбор нельзя было бы сменить.
    """
    energo = {"id": 3, "name": "Energo-mexanika"}
    hemis["pages"] = [[
        _lesson(1),
        _lesson(2, group={"id": 900, "name": "13A-26 ENM"}, faculty=energo,
                department={"id": 30, "name": "Elektr energetikasi"}),
        # Группа энергетиков, но предмет ведёт кафедра с горного факультета.
        _lesson(3, group={"id": 900, "name": "13A-26 ENM"}, faculty=energo),
    ]]
    await hemis_schedule_sync.apply(async_db, ScheduleSyncRequest())

    listed = await hemis_schedule_repository.list(async_db, ScheduleListRequest(faculty_hemis_id=3))
    assert {i.hemis_id for i in listed.items} == {2, 3}

    listed = await hemis_schedule_repository.list(
        async_db, ScheduleListRequest(faculty_hemis_id=3, department_hemis_id=10)
    )
    assert [i.hemis_id for i in listed.items] == [3]

    options = await hemis_schedule_repository.filters(async_db, ScheduleFiltersRequest(faculty_hemis_id=3))
    assert {o.value for o in options.faculties} == {"2", "3"}
    assert {o.value for o in options.groups} == {"900"}
    assert {o.value for o in options.departments} == {"10", "30"}

    options = await hemis_schedule_repository.filters(
        async_db, ScheduleFiltersRequest(faculty_hemis_id=3, department_hemis_id=30)
    )
    assert [o.value for o in options.subjects] == ["4109"]
    assert {o.value for o in options.departments} == {"10", "30"}

