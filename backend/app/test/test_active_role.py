"""Faol ko'rinish (`X-Active-Role`) backend javobini toraytiradi.

Admin va o'qituvchi rollari bor foydalanuvchi o'qituvchi ko'rinishiga
o'tganda sidebar o'qituvchinikiga aylanardi, lekin kurslar va guruhlar
sahifalari baribir hammasini ko'rsatardi: backend faol rolni bilmasdi va
admin roliga qarab javob berardi.
"""

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.modules.auth.model import Permission, Role, UserRole


async def _permission(async_db, name: str) -> Permission:
    row = (await async_db.execute(select(Permission).where(Permission.name == name))).scalar_one_or_none()
    if row is None:
        row = Permission(name=name)
        async_db.add(row)
        await async_db.flush()
    return row


@pytest_asyncio.fixture
async def teacher_role(async_db, test_user):
    """`test_user` (Admin) ga o'qituvchi roli ham qo'shiladi."""
    role = Role(name="teacher")
    role.permissions = [await _permission(async_db, "read:course"), await _permission(async_db, "user:me")]
    async_db.add(role)
    await async_db.flush()
    async_db.add(UserRole(user_id=test_user["id"], role_id=role.id))
    await async_db.commit()
    return role


@pytest_asyncio.fixture
async def two_courses(auth_client, test_user, test_subject, test_group, make_teacher):
    other = await make_teacher("other_teacher")
    ids = {}
    for key, teacher_id in (("own", test_user["id"]), ("foreign", other["user_id"])):
        response = await auth_client.post(
            "/course/",
            json={
                "subject_id": test_subject.id,
                "course_type": "lecture",
                "teacher_id": teacher_id,
                "group_ids": [test_group["id"]],
            },
        )
        assert response.status_code == 201, response.text
        ids[key] = response.json()["id"]
    return ids


def _course_ids(response) -> set[int]:
    assert response.status_code == 200, response.text
    return {course["id"] for course in response.json()["courses"]}


@pytest.mark.asyncio
async def test_teacher_view_lists_only_own_courses(auth_client, teacher_role, two_courses):
    everything = await auth_client.get("/course/")
    assert _course_ids(everything) == set(two_courses.values())

    teacher_view = await auth_client.get("/course/", headers={"X-Active-Role": str(teacher_role.id)})
    assert _course_ids(teacher_view) == {two_courses["own"]}


@pytest.mark.asyncio
async def test_unknown_role_header_does_not_change_anything(auth_client, teacher_role, two_courses):
    """Foydalanuvchida yo'q rol e'tiborga olinmaydi — sarlavha huquq bermaydi ham, olmaydi ham."""
    response = await auth_client.get("/course/", headers={"X-Active-Role": "999999"})
    assert _course_ids(response) == set(two_courses.values())


@pytest.mark.asyncio
async def test_me_returns_all_roles_and_nothing_is_persisted(auth_client, async_db, test_user, teacher_role):
    teacher_role_id = teacher_role.id
    response = await auth_client.get("/user/me", headers={"X-Active-Role": str(teacher_role_id)})
    assert response.status_code == 200, response.text
    assert {role["name"] for role in response.json()["roles"]} == {"Admin", "teacher"}

    # Toraytirish faqat so'rov ichida: `user_role` qatorlari joyida qoladi.
    role_ids = set(
        (await async_db.execute(select(UserRole.role_id).where(UserRole.user_id == test_user["id"]))).scalars().all()
    )
    assert teacher_role_id in role_ids
    assert len(role_ids) == 2
