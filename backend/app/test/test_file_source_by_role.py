"""Fayl manbasi rolga bog'liq.

O'qituvchi kurs materiali va uy vazifasiga faylni faqat «Fayllar
kutubxonasi»dan tanlaydi — qurilmadan yuklash yo'li unga yopiq. Talaba esa
aksincha: javobiga faylni faqat o'z qurilmasidan yuklaydi, kutubxona unga
yopiq. Admin ikkala yo'ldan ham foydalanadi.

Ruxsatlar ataylab beriladi (`create:resource`, `read:file` va h.k.):
testning ma'nosi «ruxsati bo'lsa ham qila olmaydi» degan va'dada, ruxsatsiz
holatda esa 403 oddiy `PermissionRequired` dan kelardi.
"""

import tempfile
from datetime import date, datetime, timedelta

import pytest
from httpx import AsyncClient

PNG = b"\x89PNG\r\n\x1a\n" + b"soxta png mazmuni"


@pytest.fixture
def temp_uploads(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp_dir:
        from core.config import settings

        monkeypatch.setattr(settings.file_url, "upload_dir", tmp_dir)
        yield tmp_dir


async def _make_user(async_db, username: str, roles: list[str], permissions: list[str]):
    """Berilgan rollar va ruxsatlarga ega foydalanuvchi (rol va ruxsat qayta ishlatiladi)."""
    from core.utils.password_hash import hash_password
    from sqlalchemy import select

    from app.modules.auth.model import Permission, Role, RolePermission, User, UserRole

    user = User(username=username, password=hash_password("password123"), is_active=True)
    async_db.add(user)
    await async_db.flush()

    for role_name in roles:
        role = await async_db.scalar(select(Role).where(Role.name == role_name))
        if role is None:
            role = Role(name=role_name)
            async_db.add(role)
            await async_db.flush()
        for permission_name in permissions:
            permission = await async_db.scalar(select(Permission).where(Permission.name == permission_name))
            if permission is None:
                permission = Permission(name=permission_name)
                async_db.add(permission)
                await async_db.flush()
            linked = await async_db.scalar(
                select(RolePermission).where(
                    RolePermission.role_id == role.id, RolePermission.permission_id == permission.id
                )
            )
            if linked is None:
                async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))
        async_db.add(UserRole(user_id=user.id, role_id=role.id))

    await async_db.commit()
    return user


async def _headers(async_client: AsyncClient, username: str) -> dict:
    response = await async_client.post("/user/login", json={"username": username, "password": "password123"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


TEACHER_PERMISSIONS = [
    "create:file",
    "read:file",
    "create:resource",
    "update:resource",
    "create:homework",
    "update:homework",
]


async def _teacher_course(async_db, test_kafedra, test_subject, username: str = "fs_teacher"):
    from app.modules.course.model import Course

    teacher = await _make_user(async_db, username, ["teacher"], TEACHER_PERMISSIONS)
    course = Course(
        name="Manba kursi",
        kafedra_id=test_kafedra["id"],
        subject_id=test_subject.id,
        teacher_id=teacher.id,
    )
    async_db.add(course)
    await async_db.commit()
    return teacher, course


# ---------------------------------------------------------------------- #
#  O'qituvchi: faqat kutubxonadan
# ---------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_teacher_cannot_upload_course_material_from_device(async_client, async_db, temp_uploads):
    await _make_user(async_db, "fs_teacher_upload", ["teacher"], TEACHER_PERMISSIONS)
    headers = await _headers(async_client, "fs_teacher_upload")

    response = await async_client.post(
        "/resource/upload", files={"file": ("maruza.png", PNG, "image/png")}, headers=headers
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_still_uploads_course_material_from_device(auth_client: AsyncClient, temp_uploads):
    """Chegara faqat o'qituvchiga: admin yuklash imkoniyati o'zgarmaydi."""
    response = await auth_client.post("/resource/upload", files={"file": ("maruza.png", PNG, "image/png")})
    assert response.status_code == 200, response.text
    assert "/course_resources/" in response.json()["url"]


@pytest.mark.asyncio
async def test_teacher_still_uploads_into_file_library(async_client, async_db, temp_uploads):
    """Kutubxonaning o'ziga yuklash ochiq — aks holda tanlashga hech narsa bo'lmasdi."""
    await _make_user(async_db, "fs_teacher_library", ["teacher"], TEACHER_PERMISSIONS)
    headers = await _headers(async_client, "fs_teacher_library")

    response = await async_client.post(
        "/file/upload", files={"file": ("maruza.png", PNG, "image/png")}, headers=headers
    )
    assert response.status_code == 201, response.text


@pytest.mark.asyncio
async def test_teacher_attaches_library_file_to_course(
    async_client, async_db, auth_client, temp_uploads, test_kafedra, test_subject
):
    _, course = await _teacher_course(async_db, test_kafedra, test_subject)
    headers = await _headers(async_client, "fs_teacher")

    uploaded = await async_client.post(
        "/file/upload", files={"file": ("kitob.png", PNG + b"kitob", "image/png")}, headers=headers
    )
    assert uploaded.status_code == 201

    created = await async_client.post(
        "/resource/",
        json={"course_id": course.id, "resource_type": "file", "title": "Darslik", "file_url": uploaded.json()["url"]},
        headers=headers,
    )
    assert created.status_code == 201, created.text


@pytest.mark.asyncio
async def test_teacher_cannot_attach_file_outside_library(
    async_client, async_db, auth_client, temp_uploads, test_kafedra, test_subject
):
    """Havolani so'rovga qo'lda yozib, kutubxonani chetlab o'tib bo'lmaydi."""
    _, course = await _teacher_course(async_db, test_kafedra, test_subject)
    headers = await _headers(async_client, "fs_teacher")

    # Admin yuklagan fayl — serverda bor, lekin o'qituvchining kutubxonasida emas.
    foreign = await auth_client.post("/resource/upload", files={"file": ("begona.png", PNG + b"b", "image/png")})
    assert foreign.status_code == 200

    for url in (foreign.json()["url"], "https://example.com/kitob.pdf"):
        response = await async_client.post(
            "/resource/",
            json={"course_id": course.id, "resource_type": "file", "title": "Kitob", "file_url": url},
            headers=headers,
        )
        assert response.status_code == 403, url


@pytest.mark.asyncio
async def test_teacher_homework_attachments_come_from_library(
    async_client, async_db, auth_client, temp_uploads, test_kafedra, test_subject
):
    _, course = await _teacher_course(async_db, test_kafedra, test_subject)
    headers = await _headers(async_client, "fs_teacher")
    deadline = (datetime.now() + timedelta(days=7)).isoformat()

    foreign = await auth_client.post("/resource/upload", files={"file": ("shart.png", PNG + b"s", "image/png")})
    refused = await async_client.post(
        "/homework/",
        json={
            "course_id": course.id,
            "deadline": deadline,
            "attachments": [{"name": "shart.png", "url": foreign.json()["url"]}],
        },
        headers=headers,
    )
    assert refused.status_code == 403

    own = await async_client.post(
        "/file/upload", files={"file": ("namuna.png", PNG + b"n", "image/png")}, headers=headers
    )
    created = await async_client.post(
        "/homework/",
        json={
            "course_id": course.id,
            "deadline": deadline,
            "attachments": [{"name": "namuna.png", "url": own.json()["url"]}],
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text


@pytest.mark.asyncio
async def test_teacher_keeps_existing_attachment_when_editing_homework(
    async_client, async_db, temp_uploads, test_kafedra, test_subject
):
    """Avvaldan turgan ilova (masalan hamkasbi qo'shgani) tahrirlashni to'smaydi."""
    from app.modules.course.model import Homework

    _, course = await _teacher_course(async_db, test_kafedra, test_subject)
    legacy = {"name": "eski.pdf", "url": "https://example.com/eski.pdf"}
    homework = Homework(
        course_id=course.id,
        title="Eski vazifa",
        deadline=datetime.now() + timedelta(days=7),
        max_grade=5,
        attachments=[legacy],
    )
    async_db.add(homework)
    await async_db.commit()
    headers = await _headers(async_client, "fs_teacher")

    updated = await async_client.put(
        f"/homework/{homework.id}",
        json={"title": "Yangi nom", "attachments": [legacy]},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text

    added = await async_client.put(
        f"/homework/{homework.id}",
        json={"attachments": [legacy, {"name": "yangi.pdf", "url": "https://example.com/yangi.pdf"}]},
        headers=headers,
    )
    assert added.status_code == 403


# ---------------------------------------------------------------------- #
#  Talaba: faqat qurilmadan
# ---------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_student_cannot_use_file_library(async_client, async_db, temp_uploads):
    """`read:file` qo'lda berilgan bo'lsa ham kutubxona talabaga yopiq."""
    await _make_user(async_db, "fs_student_library", ["student"], ["read:file", "create:file"])
    headers = await _headers(async_client, "fs_student_library")

    assert (await async_client.get("/file/", headers=headers)).status_code == 403
    assert (await async_client.get("/file/folder/", headers=headers)).status_code == 403
    uploaded = await async_client.post(
        "/file/upload", files={"file": ("x.png", PNG, "image/png")}, headers=headers
    )
    assert uploaded.status_code == 403


@pytest.mark.asyncio
async def test_teacher_who_is_also_student_keeps_library(async_client, async_db, temp_uploads):
    """Ikkala roli bor foydalanuvchi uchun kutubxona o'qituvchining ish quroli bo'lib qoladi."""
    await _make_user(async_db, "fs_teacher_student", ["teacher", "student"], ["read:file"])
    headers = await _headers(async_client, "fs_teacher_student")

    assert (await async_client.get("/file/", headers=headers)).status_code == 200


async def _enrolled_student_homework(async_db, test_kafedra, test_subject, test_group, test_teacher):
    from app.modules.auth.model import Student
    from app.modules.course.model import Course, CourseGroup, Homework

    student = await _make_user(async_db, "fs_student", ["student"], ["create:submission"])
    course = Course(
        name="Topshiriq kursi",
        kafedra_id=test_kafedra["id"],
        subject_id=test_subject.id,
        teacher_id=test_teacher["id"],
    )
    async_db.add(course)
    await async_db.flush()
    async_db.add(CourseGroup(course_id=course.id, group_id=test_group["id"]))
    async_db.add(
        Student(
            user_id=student.id,
            group_id=test_group["id"],
            first_name="Ali",
            last_name="Test",
            third_name="Test",
            full_name="Ali Test",
            student_id_number="FS-1",
            image_path="",
            birth_date=date(2004, 1, 1),
            phone="",
            gender="male",
            university="NDKTU",
            specialty="Test",
            student_status="active",
            education_form="full_time",
            education_type="bachelor",
            payment_form="grant",
            education_lang="uz",
            faculty="Test",
            level="1",
            semester="1",
            address="Test",
            avg_gpa=0,
        )
    )
    homework = Homework(
        course_id=course.id,
        title="Vazifa",
        deadline=datetime.now() + timedelta(days=7),
        max_grade=5,
        allow_file=True,
        allow_text=True,
    )
    async_db.add(homework)
    await async_db.commit()
    return student, homework


@pytest.mark.asyncio
async def test_student_submits_device_uploaded_file(
    async_client, async_db, auth_client, temp_uploads, test_kafedra, test_subject, test_group, test_teacher
):
    _, homework = await _enrolled_student_homework(async_db, test_kafedra, test_subject, test_group, test_teacher)
    headers = await _headers(async_client, "fs_student")

    uploaded = await async_client.post(
        f"/homework/{homework.id}/upload", files={"file": ("javob.png", PNG, "image/png")}, headers=headers
    )
    assert uploaded.status_code == 200, uploaded.text

    submitted = await async_client.post(
        f"/homework/{homework.id}/submit", json={"submitted_files": [uploaded.json()]}, headers=headers
    )
    assert submitted.status_code == 201, submitted.text


@pytest.mark.asyncio
async def test_student_cannot_submit_library_file(
    async_client, async_db, auth_client, temp_uploads, test_kafedra, test_subject, test_group, test_teacher
):
    """Kutubxonadagi yoki begona havola talabaning javobiga kirmaydi."""
    _, homework = await _enrolled_student_homework(async_db, test_kafedra, test_subject, test_group, test_teacher)
    headers = await _headers(async_client, "fs_student")

    library = await auth_client.post("/file/upload", files={"file": ("tayyor.png", PNG + b"t", "image/png")})
    assert library.status_code == 201

    for url in (
        library.json()["url"],
        "https://example.com/tayyor.pdf",
        # Nomi to'g'ri ko'rinadi, lekin bunday fayl yuklanmagan.
        f"{library.json()['url'].split('/files/')[0]}/homework_submissions/00000000-0000-4000-8000-000000000000.pdf",
    ):
        response = await async_client.post(
            f"/homework/{homework.id}/submit",
            json={"submitted_files": [{"name": "tayyor.pdf", "url": url}]},
            headers=headers,
        )
        assert response.status_code == 400, url


@pytest.mark.asyncio
async def test_student_resubmits_with_previously_attached_file(
    async_client, async_db, auth_client, temp_uploads, test_kafedra, test_subject, test_group, test_teacher
):
    """Avvalgi javobdagi fayl qayta yuborilganda tekshirilmaydi — eski javoblar buzilmaydi."""
    from app.modules.course.model import HomeworkSubmission

    student, homework = await _enrolled_student_homework(
        async_db, test_kafedra, test_subject, test_group, test_teacher
    )
    legacy = {"name": "eski.pdf", "url": "https://example.com/eski.pdf"}
    async_db.add(
        HomeworkSubmission(
            homework_id=homework.id,
            user_id=student.id,
            submitted_files=[legacy],
            submitted_at=datetime.now(),
            status="submitted",
        )
    )
    await async_db.commit()
    headers = await _headers(async_client, "fs_student")

    response = await async_client.post(
        f"/homework/{homework.id}/submit",
        json={"submitted_text": "Tuzatildi", "submitted_files": [legacy]},
        headers=headers,
    )
    assert response.status_code == 201, response.text
