"""Массовый импорт студентов из HEMIS.

Проверяется ровно то, из-за чего импорт нельзя было запускать: он затирал
данные, которых в служебном списке просто нет, и падал на первом же студенте,
у которого уже был пользователь.
"""

from datetime import date

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.modules.auth.hemis.schemas import StudentSyncApplyRequest
from app.modules.auth.hemis.student_sync import HemisStudentSync, hemis_student_sync
from app.modules.auth.model import Role, Student, User, UserRole
from app.modules.organization_structure.model import Faculty, Group


class FakeClient:
    """Клиент HEMIS, отвечающий заранее заданным списком."""

    def __init__(self, items: list[dict]):
        self._items = items

    async def fetch_all(self, limit: int = 200, updated_at_from: int | None = None):
        return self._items


@pytest.fixture
def hemis_items(monkeypatch):
    """Подменяет обход HEMIS содержимым, которое задаёт тест."""

    items: list[dict] = []

    async def _client(self, session):
        return FakeClient(items)

    monkeypatch.setattr(HemisStudentSync, "_client", _client)
    return items


def _item(**overrides) -> dict:
    """Запись в том виде, в каком её отдаёт `/rest/v1/data/student-list`.

    Значения по умолчанию не выдуманы: `phone` в списке действительно `null`,
    а `avg_gpa` — ноль у всех, потому и понадобилось правило «пустое не
    затирает».
    """
    item = {
        "student_id_number": "319261100725",
        "full_name": "Aliyev Vali Salimovich",
        "phone": None,
        "avg_gpa": 0,
        "image": "https://hemis.ndki.uz/static/crop/3/5/320__90_356.jpg",
        "image_full": "https://hemis.ndki.uz/static/pi/4/e/4e62e605ba510b1e.jpg",
        "birth_date": 1041379200,
        "gender": {"code": "11", "name": "Erkak"},
        "specialty": {"code": "1", "name": "Metallurgiya"},
        "studentStatus": {"code": "11", "name": "O'qimoqda"},
        "department": {"id": 3, "name": "Kimyo-metallurgiya"},
        "district": {"code": "1712251", "name": "Xatirchi tumani"},
        "province": {"code": "1712", "name": "Navoiy viloyati"},
        "level": {"code": "11", "name": "1-kurs"},
        "group": {"id": 1424, "name": "23G-26 MET", "educationLang": {"name": "O‘zbek"}},
    }
    item.update(overrides)
    return item


@pytest_asyncio.fixture
async def linked_group(async_db):
    """Группа, уже привязанная к HEMIS, вместе со своим факультетом."""
    faculty = Faculty(name="Konchilik")
    async_db.add(faculty)
    await async_db.flush()

    group = Group(name="23G-26 MET", faculty_id=faculty.id, hemis_group_id="1424")
    async_db.add(group)
    await async_db.flush()
    return group


async def _existing_student(session, group_id: int | None = None, **overrides) -> Student:
    user = User(username="319261100725", password="x", auth_source="hemis")
    session.add(user)
    await session.flush()

    fields = {
        "full_name": "Aliyev Vali",
        "first_name": "Vali",
        "last_name": "Aliyev",
        "third_name": "",
        "student_id_number": "319261100725",
        "image_path": "https://hemis.ndki.uz/static/crop/eski.jpg",
        "birth_date": date(2003, 1, 1),
        "phone": "+998901112233",
        "gender": "Erkak",
        "university": "NDKTU",
        "specialty": "Metallurgiya",
        "student_status": "O'qimoqda",
        "education_form": "Kunduzgi",
        "education_type": "Bakalavr",
        "payment_form": "Kontrakt",
        "education_lang": "O‘zbek",
        "faculty": "Kimyo-metallurgiya",
        "level": "1-kurs",
        "semester": "1",
        "address": "Xatirchi tumani",
        "avg_gpa": 4.2,
    }
    fields.update(overrides)
    student = Student(user_id=user.id, group_id=group_id, **fields)
    session.add(student)
    await session.flush()
    return student


@pytest.mark.asyncio
async def test_blank_values_do_not_overwrite(async_db, hemis_items, linked_group):
    """`phone: null` и `avg_gpa: 0` из списка не стирают то, что уже известно.

    Эти поля приезжают из личного кабинета студента при входе; служебный
    список их не отдаёт вовсе, и безусловная запись обнулила бы их всем.
    """
    student = await _existing_student(async_db, group_id=linked_group.id)
    hemis_items.append(_item(full_name="Aliyev Vali Salimovich"))

    await hemis_student_sync.apply(async_db, StudentSyncApplyRequest())

    await async_db.refresh(student)
    assert student.phone == "+998901112233"
    assert student.avg_gpa == 4.2
    # Непустое из HEMIS по-прежнему обновляет строку.
    assert student.full_name == "Aliyev Vali Salimovich"
    assert student.third_name == "Salimovich"


@pytest.mark.asyncio
async def test_image_reference_stays_the_crop(async_db, hemis_items, linked_group):
    """Эталон для распознавания лица — обрезанный портрет, а не исходный файл."""
    student = await _existing_student(async_db, group_id=linked_group.id)
    hemis_items.append(_item())

    await hemis_student_sync.apply(async_db, StudentSyncApplyRequest())

    await async_db.refresh(student)
    assert "/static/crop/" in student.image_path


@pytest.mark.asyncio
async def test_faculty_falls_back_to_hemis_department(async_db, hemis_items):
    """Группа не привязана — факультет берётся из `department`, а не стирается."""
    student = await _existing_student(async_db, group_id=None)
    hemis_items.append(_item())

    await hemis_student_sync.apply(async_db, StudentSyncApplyRequest())

    await async_db.refresh(student)
    assert student.faculty == "Kimyo-metallurgiya"
    assert student.group_id is None


@pytest.mark.asyncio
async def test_faculty_prefers_local_group(async_db, hemis_items, linked_group):
    """У привязанной группы факультет наш: он приехал из EPOS и написан как принято."""
    student = await _existing_student(async_db, group_id=None, faculty="")
    hemis_items.append(_item())

    await hemis_student_sync.apply(async_db, StudentSyncApplyRequest())

    await async_db.refresh(student)
    assert student.faculty == "Konchilik"
    assert student.group_id == linked_group.id


@pytest.mark.asyncio
async def test_existing_user_without_student_row(async_db, hemis_items, linked_group):
    """Пользователь есть, студента нет — прогон доводит дело до конца.

    Раньше здесь падал `MissingGreenlet`: роль выдавалась через `user.roles`
    у пользователя, загруженного без `selectinload`, и весь импорт обрывался
    на первом же таком человеке.
    """
    user = User(username="319261100725", password="x", auth_source="hemis")
    async_db.add(user)
    await async_db.flush()

    hemis_items.append(_item())

    result = await hemis_student_sync.apply(async_db, StudentSyncApplyRequest())

    assert result.created == 1
    student = (
        await async_db.execute(
            select(Student).where(Student.student_id_number == "319261100725")
        )
    ).scalar_one()
    assert student.user_id == user.id
    assert student.group_id == linked_group.id

    role_id = (
        await async_db.execute(select(Role.id).where(Role.name == "student"))
    ).scalar_one()
    link = (
        await async_db.execute(
            select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role_id)
        )
    ).scalar_one_or_none()
    assert link is not None


@pytest.mark.asyncio
async def test_new_students_share_one_password_hash(async_db, hemis_items, linked_group):
    """Пароль случайный и один на прогон: bcrypt на каждого из тысяч не нужен.

    Войти по нему нельзя — открытый текст не сохраняется, вход этих людей
    идёт проверкой в HEMIS.
    """
    hemis_items.extend(
        [
            _item(student_id_number="319261100725", full_name="Aliyev Vali"),
            _item(student_id_number="319261100726", full_name="Karimov Aziz"),
        ]
    )

    result = await hemis_student_sync.apply(async_db, StudentSyncApplyRequest())

    assert result.created == 2
    users = (
        (
            await async_db.execute(
                select(User).where(User.username.in_(["319261100725", "319261100726"]))
            )
        )
        .scalars()
        .all()
    )
    assert len(users) == 2
    assert {user.auth_source for user in users} == {"hemis"}
    assert len({user.password for user in users}) == 1
    assert all(user.password not in ("", None) for user in users)


@pytest.mark.asyncio
async def test_unlinked_group_does_not_clear_existing(async_db, hemis_items):
    """Непривязанная группа HEMIS не отбирает у студента уже проставленную."""
    faculty = Faculty(name="Konchilik")
    async_db.add(faculty)
    await async_db.flush()
    group = Group(name="23G-26 MET", faculty_id=faculty.id)
    async_db.add(group)
    await async_db.flush()

    student = await _existing_student(async_db, group_id=group.id)
    hemis_items.append(_item())

    await hemis_student_sync.apply(async_db, StudentSyncApplyRequest())

    await async_db.refresh(student)
    assert student.group_id == group.id


# ---------------------------------------------------------------------- #
#  Toifalar bo'yicha tanlash
# ---------------------------------------------------------------------- #
#
# Ekranda uchta belgi bor: yangilar, yangilanadiganlar, guruhsizlar.
# Toifalar kesishadi — guruhsiz talaba ayni paytda yangi yoki yangilanadigan
# ham bo'ladi, va aynan shu kesishuv eng oson buziladigan joy.


@pytest.mark.asyncio
async def test_create_can_be_skipped(async_db, hemis_items, linked_group):
    """`include_create=False` — yangi talabalar yaratilmaydi."""
    hemis_items.append(_item())

    result = await hemis_student_sync.apply(
        async_db, StudentSyncApplyRequest(include_create=False)
    )

    assert result.created == 0
    assert result.excluded == 1
    assert (
        await async_db.execute(select(Student).where(Student.student_id_number == "319261100725"))
    ).scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_update_can_be_skipped(async_db, hemis_items, linked_group):
    """`include_update=False` — mavjud talaba tegilmaydi."""
    student = await _existing_student(async_db, group_id=linked_group.id)
    hemis_items.append(_item(full_name="Yangi Ism Sharif"))

    result = await hemis_student_sync.apply(
        async_db, StudentSyncApplyRequest(include_update=False)
    )

    assert result.updated == 0
    assert result.excluded == 1
    await async_db.refresh(student)
    assert student.full_name == "Aliyev Vali"


@pytest.mark.asyncio
async def test_no_group_students_are_never_imported(async_db, hemis_items, linked_group):
    """Guruhi bizda yo'q talaba import qilinmaydi — buni o'chirib bo'lmaydi.

    Guruhsiz yozuv hech bir ro'yxatda ko'rinmaydi va hech bir testga
    tushmaydi, shuning uchun uni yaratishdan ko'ra o'tkazib yuborgan ma'qul.
    Toifalar kesishadi: guruhsiz talaba ayni paytda yangi ham, shuning uchun
    u ikkala ro'yxatdan ham chiqarib tashlanishi kerak.
    """
    hemis_items.append(_item())  # guruhi bog'langan
    hemis_items.append(
        _item(
            student_id_number="319261100999",
            full_name="Guruhsiz Talaba",
            group={"id": 9999, "name": "Bog'lanmagan"},
        )
    )

    result = await hemis_student_sync.apply(async_db, StudentSyncApplyRequest())

    assert result.created == 1
    assert result.no_group == 1

    created = (
        (await async_db.execute(select(Student.student_id_number))).scalars().all()
    )
    assert created == ["319261100725"]


@pytest.mark.asyncio
async def test_no_group_student_is_not_updated_either(async_db, hemis_items, linked_group):
    """Bazada bor talaba ham, guruhi uzilgan bo'lsa, yangilanmaydi.

    Aks holda guruhsizlarni chetlab o'tish faqat yaratishga tegib, tungi
    prognoz ularning ma'lumotini baribir yangilab turardi.
    """
    student = await _existing_student(
        async_db, student_id_number="319261100999", full_name="Eski Ism"
    )

    hemis_items.append(
        _item(
            student_id_number="319261100999",
            full_name="Yangi Ism",
            group={"id": 9999, "name": "Bog'lanmagan"},
        )
    )

    result = await hemis_student_sync.apply(async_db, StudentSyncApplyRequest())

    assert result.updated == 0
    assert result.no_group == 1
    await async_db.refresh(student)
    assert student.full_name == "Eski Ism"


@pytest.mark.asyncio
async def test_nothing_selected_is_rejected(async_db, hemis_items, linked_group):
    """Ikkala asosiy toifa ham o'chirilsa, HEMIS'ga umuman bormaymiz.

    49 sahifani aylanib chiqib, keyin hammasini tashlash bir necha daqiqani
    behuda sarflardi.
    """
    from fastapi import HTTPException

    hemis_items.append(_item())

    with pytest.raises(HTTPException) as exc:
        await hemis_student_sync.apply(
            async_db,
            StudentSyncApplyRequest(include_create=False, include_update=False),
        )
    assert exc.value.status_code == 400
