"""Test yig'ish talabaga yopiq.

Talabaning testdagi ishi — uni ishlash: `read:active_quiz` ro'yxatni beradi,
`quiz_process:*` esa boshlash, javob yuborish va yakunlashni. Testni yig'ish
o'qituvchi va ma'muriyat ishi.

Ruxsatni roldan olib tashlash (`a4c7e2b91d05` migratsiyasi) yagona chegara
emas: ruxsatlar Rollar oynasidan qo'lda ham beriladi — `read:quiz` talabada
aynan shunday paydo bo'lib qolgan edi — seed esa ruxsat OLIB TASHLAMAYDI
(`core/lifespan/defaults.py`). Shuning uchun bu yerda eng yomon holat
tekshiriladi: `create:quiz` ruxsati BOR talaba.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient

QUIZ_AUTHORING_PERMISSION = "create:quiz"


async def _make_user(async_db, username: str, role_name: str) -> dict:
    """Roli va `create:quiz` ruxsati bor foydalanuvchi.

    Ruxsat ataylab beriladi: testning ma'nosi «ruxsati bo'lsa ham
    yaratolmaydi» degan va'dada, ruxsatsiz holatda esa 403 oddiy
    `PermissionRequired` dan kelardi va tekshiruv «noto'g'ri sabab bilan»
    o'tib ketardi.
    """
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import Permission, Role, RolePermission, User, UserRole

    role = Role(name=role_name)
    async_db.add(role)
    await async_db.flush()

    permission = Permission(name=QUIZ_AUTHORING_PERMISSION)
    async_db.add(permission)
    await async_db.flush()
    async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    user = User(username=username, password=hash_password("password123"), is_active=True)
    async_db.add(user)
    await async_db.flush()
    async_db.add(UserRole(user_id=user.id, role_id=role.id))
    await async_db.commit()

    return {"username": username, "password": "password123"}


async def _login(async_client: AsyncClient, credentials: dict) -> AsyncClient:
    response = await async_client.post("/user/login", json=credentials)
    assert response.status_code == 200
    async_client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return async_client


@pytest_asyncio.fixture
async def student_client(async_client, async_db):
    return await _login(async_client, await _make_user(async_db, "quiz_student", "student"))


@pytest_asyncio.fixture
async def teacher_client(async_client, async_db):
    return await _login(async_client, await _make_user(async_db, "quiz_teacher", "Teacher"))


@pytest.mark.asyncio
async def test_student_cannot_create_quiz(student_client):
    response = await student_client.post(
        "/quiz/",
        json={"subject_id": 1, "lecturer_id": 1, "question_count": 5, "duration_minutes": 30},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_student_cannot_repeat_quiz(student_client):
    response = await student_client.post("/quiz/1/repeat")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_student_cannot_count_available_questions(student_client):
    """Savollar soni ham test yig'ish oynasining bir qismi."""
    response = await student_client.get("/quiz/available-questions?lecturer_id=1&subject_id=1")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_teacher_still_counts_available_questions(teacher_client):
    """Chegara faqat talabaga: testni o'qituvchi yig'adi."""
    response = await teacher_client.get("/quiz/available-questions?lecturer_id=1&subject_id=1")
    assert response.status_code == 200
