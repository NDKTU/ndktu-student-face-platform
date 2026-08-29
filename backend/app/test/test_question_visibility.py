"""Oʻqituvchi nimani koʻradi va nimaga tegishi mumkin — savollar va fayllar.

Qoida: **koʻrish** biriktirma boʻyicha (oʻzi dars beradigan fanning barcha
savollari), **oʻzgartirish** esa mualliflik boʻyicha (faqat oʻzi yozgani).

Ilgari koʻrish ham mualliflik boʻyicha edi va bu amalda shunday koʻrinardi:
oʻqituvchi 494 ta savoli bor fanga biriktirilgan, lekin savollar sahifasi
unga boʻsh koʻrinadi.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient


@pytest_asyncio.fixture
async def teacher_setup(async_db, auth_client, test_subject):
    """Fanga biriktirilgan, lekin bitta ham savol yozmagan oʻqituvchi.

    Yonida — boshqa fan, unga biriktirilmagan: shunga savol qoʻshib
    koʻrishga urinish taqiqlanishi kerak.
    """
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import (
        Permission,
        Role,
        RolePermission,
        Teacher,
        TeacherSubject,
        User,
        UserRole,
    )
    from app.modules.quiz.model import Question, Subject

    role = Role(name="Teacher")
    async_db.add(role)
    await async_db.flush()

    # Test bazasi boʻsh koʻtariladi: ruxsatlarsiz har bir soʻrov 403 qaytaradi
    # va testlar "toʻgʻri sabab bilan emas" oʻtib ketardi.
    for name in (
        "read:question",
        "create:question",
        "update:question",
        "delete:question",
        "read:file",
        "create:file",
        "update:file",
        "delete:file",
    ):
        permission = Permission(name=name)
        async_db.add(permission)
        await async_db.flush()
        async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    user = User(
        username="visibility_teacher",
        password=hash_password("password123"),
        is_active=True,
    )
    async_db.add(user)
    await async_db.flush()

    async_db.add(UserRole(user_id=user.id, role_id=role.id))

    teacher = Teacher(
        user_id=user.id,
        last_name="Testov",
        first_name="Test",
        third_name="Testovich",
        full_name="Testov Test Testovich",
    )
    async_db.add(teacher)
    await async_db.flush()

    async_db.add(TeacherSubject(teacher_id=teacher.id, subject_id=test_subject.id))

    other_subject = Subject(name="Biriktirilmagan fan")
    async_db.add(other_subject)
    await async_db.flush()

    # Savolni BOSHQA odam yozgan — aynan shu holat ilgari boʻsh sahifa berardi.
    foreign_question = Question(
        subject_id=test_subject.id,
        user_id=1,
        text="Hamkasb yozgan savol",
        option_a="A",
        option_b="B",
        option_c="C",
        option_d="D",
        correct_option="a",
    )
    async_db.add(foreign_question)
    await async_db.commit()
    await async_db.refresh(foreign_question)

    return {
        "username": "visibility_teacher",
        "password": "password123",
        "user_id": user.id,
        "subject_id": test_subject.id,
        "other_subject_id": other_subject.id,
        "foreign_question_id": foreign_question.id,
    }


@pytest_asyncio.fixture
async def teacher_client(async_client: AsyncClient, teacher_setup):
    response = await async_client.post(
        "/user/login",
        json={"username": teacher_setup["username"], "password": teacher_setup["password"]},
    )
    assert response.status_code == 200
    async_client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return async_client


@pytest.mark.asyncio
async def test_teacher_sees_questions_of_the_subject_they_teach(teacher_client, teacher_setup):
    """Savolni hamkasbi yozgan boʻlsa ham, fan oʻziniki boʻlsa — koʻrinadi."""
    response = await teacher_client.get("/question/")
    assert response.status_code == 200

    data = response.json()
    ids = [item["id"] for item in data["questions"]]
    assert teacher_setup["foreign_question_id"] in ids


@pytest.mark.asyncio
async def test_teacher_cannot_edit_someone_elses_question(teacher_client, teacher_setup):
    """Koʻrish — ha, oʻzgartirish — yoʻq."""
    response = await teacher_client.put(
        f"/question/{teacher_setup['foreign_question_id']}",
        json={
            "subject_id": teacher_setup["subject_id"],
            "user_id": teacher_setup["user_id"],
            "text": "Oʻzgartirishga urinish",
            "option_a": "A",
            "option_b": "B",
            "option_c": "C",
            "option_d": "D",
            "correct_option": "a",
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_teacher_cannot_delete_someone_elses_question(teacher_client, teacher_setup):
    response = await teacher_client.delete(f"/question/{teacher_setup['foreign_question_id']}")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_author_is_always_the_caller(teacher_client, teacher_setup):
    """Savolni birovning nomidan yozib boʻlmaydi.

    Ilgari muallif soʻrov tanasidagi ``user_id`` dan olinardi va tekshirilmasdi.
    """
    response = await teacher_client.post(
        "/question/",
        json={
            "subject_id": teacher_setup["subject_id"],
            # Ataylab begona muallif koʻrsatilyapti.
            "user_id": 1,
            "text": "Muallif almashtirishga urinish",
            "option_a": "A",
            "option_b": "B",
            "option_c": "C",
            "option_d": "D",
            "correct_option": "a",
        },
    )
    assert response.status_code == 201
    assert response.json()["user_id"] == teacher_setup["user_id"]


@pytest.mark.asyncio
async def test_teacher_cannot_add_question_to_a_foreign_subject(teacher_client, teacher_setup):
    response = await teacher_client.post(
        "/question/",
        json={
            "subject_id": teacher_setup["other_subject_id"],
            "user_id": teacher_setup["user_id"],
            "text": "Begona fanga savol",
            "option_a": "A",
            "option_b": "B",
            "option_c": "C",
            "option_d": "D",
            "correct_option": "a",
        },
    )
    assert response.status_code == 403


# ─── Fayl kutubxonasi ham xuddi shu qoida boʻyicha ────────────────────
# Ilgari oʻqituvchi faqat oʻzi yuklagan faylni koʻrardi. Natijada hech nima
# yuklamagan odamga kutubxona boʻsh koʻrinardi va u hamkasbi allaqachon
# yuklagan rasmni qaytadan yuklardi — diskdagi 8087 rasmdan 4715 tasi
# aynan shu sababdan nusxa boʻlib qolgan.


@pytest_asyncio.fixture
async def foreign_file(async_db, teacher_setup):
    """Boshqa odam yuklagan, lekin oʻqituvchining fanidagi savolda ishlatilgan fayl."""
    from app.modules.file.model import FileBlob, FileUsage, StoredFile

    blob = FileBlob(
        sha256="a" * 64,
        stored_path="question/hamkasb-rasmi.png",
        size_bytes=123,
        mime_type="image/png",
    )
    async_db.add(blob)
    await async_db.flush()

    stored = StoredFile(
        blob_id=blob.id,
        owner_user_id=1,
        title="Hamkasb yuklagan rasm",
        original_name="rasm.png",
    )
    async_db.add(stored)
    await async_db.flush()

    async_db.add(
        FileUsage(
            file_id=stored.id,
            entity_type="question",
            entity_id=teacher_setup["foreign_question_id"],
        )
    )
    await async_db.commit()
    return stored.id


@pytest.mark.asyncio
async def test_teacher_sees_files_used_in_their_subject(teacher_client, foreign_file):
    """Faylni hamkasbi yuklagan boʻlsa ham, oʻz fanida ishlatilsa — koʻrinadi."""
    response = await teacher_client.get("/file/")
    assert response.status_code == 200
    assert foreign_file in [item["id"] for item in response.json()["items"]]


@pytest.mark.asyncio
async def test_teacher_can_use_but_not_rename_a_foreign_file(teacher_client, foreign_file):
    """Ishlatish mumkin, oʻzgartirish — yoʻq: almashishning maʼnosi shunda."""
    used = await teacher_client.post(
        f"/file/{foreign_file}/attach", json={"entity_type": "resource", "entity_id": 1}
    )
    assert used.status_code == 200

    renamed = await teacher_client.patch(f"/file/{foreign_file}", json={"title": "Meniki"})
    assert renamed.status_code == 403


@pytest.mark.asyncio
async def test_teacher_cannot_delete_a_foreign_file(teacher_client, foreign_file):
    response = await teacher_client.delete(f"/file/{foreign_file}")
    assert response.status_code == 403
