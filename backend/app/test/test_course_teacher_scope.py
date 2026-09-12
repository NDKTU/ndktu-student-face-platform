"""Kurs ochilganda oʻqituvchiga fan va guruhlar ham biriktiriladi.

Kursda uchala maʼlumot bor, lekin oʻqituvchining kirish huquqi
``teacher_subject`` va ``teacher_group`` dan oʻqiladi. Ular toʻldirilmasa,
oʻqituvchi oʻziga ochilgan kursning guruhini ham koʻrmasdi va admin oʻsha
biriktirishni qoʻlda ikkinchi marta qilishi kerak boʻlardi.
"""

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.modules.auth.model import TeacherSubject
from app.modules.organization_structure.model import Group, TeacherGroup
from app.modules.quiz.model import Subject


@pytest_asyncio.fixture
async def subject(async_db, test_kafedra):
    row = Subject(name="Matematik analiz", kafedra_id=test_kafedra["id"])
    async_db.add(row)
    await async_db.flush()
    await async_db.commit()
    return row


@pytest_asyncio.fixture
async def second_group(async_db, test_faculty):
    row = Group(name="SE-2024", faculty_id=test_faculty["id"])
    async_db.add(row)
    await async_db.flush()
    await async_db.commit()
    return row


async def _linked(async_db, teacher_id: int) -> tuple[set[int], set[int]]:
    subjects = set(
        (
            await async_db.execute(
                select(TeacherSubject.subject_id).where(TeacherSubject.teacher_id == teacher_id)
            )
        )
        .scalars()
        .all()
    )
    groups = set(
        (
            await async_db.execute(
                select(TeacherGroup.group_id).where(TeacherGroup.teacher_id == teacher_id)
            )
        )
        .scalars()
        .all()
    )
    return subjects, groups


@pytest.mark.asyncio
async def test_create_course_links_subject_and_groups(
    auth_client, async_db, test_teacher, test_group, second_group, subject
):
    response = await auth_client.post(
        "/course/",
        json={
            "subject_id": subject.id,
            "course_type": "lecture",
            "teacher_id": test_teacher["user_id"],
            "semester_number": 1,
            "group_ids": [test_group["id"], second_group.id],
        },
    )
    assert response.status_code == 201

    subjects, groups = await _linked(async_db, test_teacher["id"])
    assert subjects == {subject.id}
    assert groups == {test_group["id"], second_group.id}


@pytest.mark.asyncio
async def test_update_course_links_added_group_and_keeps_removed_one(
    auth_client, async_db, test_teacher, test_group, second_group, subject
):
    """Qoʻshilgan guruh biriktiriladi, kursdan chiqarilgani esa uzilmaydi.

    ``teacher_group`` faqat shu kursga tegishli emas: oʻsha satr boshqa
    kursdan, EPOS yuklamasidan yoki adminning qoʻlidan kelgan boʻlishi
    mumkin, shuning uchun kursni tahrirlash uni oʻchirmaydi.
    """
    created = await auth_client.post(
        "/course/",
        json={
            "subject_id": subject.id,
            "course_type": "lecture",
            "teacher_id": test_teacher["user_id"],
            "semester_number": 1,
            "group_ids": [test_group["id"]],
        },
    )
    assert created.status_code == 201

    updated = await auth_client.put(
        f"/course/{created.json()['id']}",
        json={"group_ids": [second_group.id]},
    )
    assert updated.status_code == 200

    _, groups = await _linked(async_db, test_teacher["id"])
    assert groups == {test_group["id"], second_group.id}


@pytest.mark.asyncio
async def test_course_for_non_teacher_user_is_still_created(
    auth_client, async_db, test_user, test_group, subject
):
    """Oʻqituvchi satri yoʻq foydalanuvchi (admin) uchun kurs baribir ochiladi.

    Biriktirish — qulaylik, kurs yaratishning sharti emas; aks holda admin
    oʻziga kurs ocholmay qolardi.
    """
    response = await auth_client.post(
        "/course/",
        json={
            "subject_id": subject.id,
            "course_type": "lecture",
            "teacher_id": test_user["id"],
            "semester_number": 1,
            "group_ids": [test_group["id"]],
        },
    )
    assert response.status_code == 201
    assert (await async_db.execute(select(TeacherSubject.id))).scalars().all() == []
