"""Fayl kutubxonasining asosiy xatti-harakatlari.

Bu yerda tekshiriladigan uchta narsa — moduldagi eng qimmat xatolar:
dublikatning ikki nusxaga aylanishi, ishlatilayotgan faylning jim oʻchishi
va rasm deb atalgan begona faylning oʻtib ketishi.
"""

import tempfile
from datetime import date

import pytest
from httpx import AsyncClient

PNG = b"\x89PNG\r\n\x1a\n" + b"soxta png mazmuni"


@pytest.fixture
def temp_uploads(monkeypatch):
    """Haqiqiy uploads papkasi root'niki — testlar vaqtinchalik papkaga yozadi."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        from core.config import settings

        monkeypatch.setattr(settings.file_url, "upload_dir", tmp_dir)
        yield tmp_dir


@pytest.mark.asyncio
async def test_same_bytes_do_not_create_a_second_entry(auth_client: AsyncClient, temp_uploads):
    """Bir xil fayl ikki marta yuklansa, bitta yozuv qoladi.

    Aynan shu narsa uchun kutubxona qilingan: oʻqituvchi bitta maʼruzani
    uch guruhga berganda diskda uch nusxa yotmasligi kerak.
    """
    files = {"file": ("maruza.png", PNG, "image/png")}
    first = await auth_client.post("/file/upload", files=files)
    assert first.status_code == 201

    files = {"file": ("maruza.png", PNG, "image/png")}
    second = await auth_client.post("/file/upload", files=files)
    assert second.status_code == 201

    assert first.json()["id"] == second.json()["id"]
    assert first.json()["url"] == second.json()["url"]


@pytest.mark.asyncio
async def test_different_name_same_bytes_is_still_one_entry(auth_client: AsyncClient, temp_uploads):
    """Nom emas, mazmun hal qiladi — fayl boshqacha atalgan boʻlsa ham."""
    first = await auth_client.post(
        "/file/upload", files={"file": ("birinchi.png", PNG, "image/png")}
    )
    second = await auth_client.post(
        "/file/upload", files={"file": ("ikkinchi.png", PNG, "image/png")}
    )

    assert first.json()["id"] == second.json()["id"]


@pytest.mark.asyncio
async def test_file_in_use_cannot_be_deleted(auth_client: AsyncClient, temp_uploads):
    """Ishlatilayotgan faylni oʻchirish 409 qaytaradi, jim oʻchmaydi.

    Jim oʻchsa boshqa oʻqituvchining darsidagi ilova buzilardi va buni hech kim
    darhol sezmasdi.
    """
    uploaded = await auth_client.post(
        "/file/upload", files={"file": ("kerakli.png", PNG, "image/png")}
    )
    file_id = uploaded.json()["id"]

    attached = await auth_client.post(
        f"/file/{file_id}/attach", json={"entity_type": "resource", "entity_id": 1}
    )
    assert attached.status_code == 200
    assert attached.json()["usage_count"] == 1

    refused = await auth_client.delete(f"/file/{file_id}")
    assert refused.status_code == 409

    # Ajratilgach — oʻchsa boʻladi.
    await auth_client.post(
        f"/file/{file_id}/detach", json={"entity_type": "resource", "entity_id": 1}
    )
    deleted = await auth_client.delete(f"/file/{file_id}")
    assert deleted.status_code == 204


@pytest.mark.asyncio
async def test_non_image_with_image_extension_is_rejected(auth_client: AsyncClient, temp_uploads):
    """Kengaytma — mijoz tanlagan nom, unga ishonib boʻlmaydi.

    Bunday fayl oʻz domenimizdan beriladi, shuning uchun imzo tekshiriladi.
    """
    response = await auth_client.post(
        "/file/upload",
        files={"file": ("zararli.png", b"<script>alert(1)</script>", "image/png")},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_deleted_file_disappears_from_the_list(auth_client: AsyncClient, temp_uploads):
    uploaded = await auth_client.post(
        "/file/upload", files={"file": ("vaqtinchalik.png", PNG, "image/png")}
    )
    file_id = uploaded.json()["id"]

    listing = await auth_client.get("/file/")
    assert any(item["id"] == file_id for item in listing.json()["items"])

    await auth_client.delete(f"/file/{file_id}")

    listing = await auth_client.get("/file/")
    assert all(item["id"] != file_id for item in listing.json()["items"])


@pytest.mark.asyncio
async def test_folder_delete_keeps_its_files(auth_client: AsyncClient, temp_uploads):
    """Papka oʻchsa fayllar ildizga chiqadi, yoʻqolmaydi."""
    folder = await auth_client.post("/file/folder/", json={"name": "Maʼruzalar"})
    folder_id = folder.json()["id"]

    uploaded = await auth_client.post(
        "/file/upload",
        files={"file": ("papkadagi.png", PNG, "image/png")},
        params={"folder_id": folder_id},
    )
    file_id = uploaded.json()["id"]
    assert uploaded.json()["folder_id"] == folder_id

    await auth_client.delete(f"/file/folder/{folder_id}")

    still_there = await auth_client.get(f"/file/{file_id}")
    assert still_there.status_code == 200
    assert still_there.json()["folder_id"] is None


# ---------------------------------------------------------------------- #
#  Shaxsiy papka
# ---------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_first_upload_creates_a_personal_folder(auth_client: AsyncClient, temp_uploads):
    """Papka ko'rsatilmasa, fayl shaxsiy papkaga tushadi — ildizga emas.

    Ilgari papkasiz yuklangan fayl ildizda yotardi va kutubxonaning ildizi
    hamma yuklaganidan iborat aralash ro'yxatga aylanardi.
    """
    files = {"file": ("maruza.png", PNG, "image/png")}
    created = await auth_client.post("/file/upload", files=files)
    assert created.status_code == 201

    folder_id = created.json()["folder_id"]
    assert folder_id is not None

    folders = (await auth_client.get("/file/folder/")).json()["items"]
    personal = [f for f in folders if f["is_personal"]]
    assert len(personal) == 1
    assert personal[0]["id"] == folder_id


@pytest.mark.asyncio
async def test_second_upload_reuses_the_same_personal_folder(
    auth_client: AsyncClient, temp_uploads
):
    """Ikkinchi yuklash yangi «shaxsiy» papka yaratmaydi.

    Papkani nom bo'yicha izlash ishonchsiz bo'lardi: foydalanuvchi nomini
    o'zgartirsa, har safar yangi papka paydo bo'lardi. Shuning uchun
    `is_personal` belgisi bor.
    """
    await auth_client.post("/file/upload", files={"file": ("bir.png", PNG, "image/png")})
    await auth_client.post(
        "/file/upload", files={"file": ("ikki.png", PNG + b"boshqa", "image/png")}
    )

    folders = (await auth_client.get("/file/folder/")).json()["items"]
    assert len([f for f in folders if f["is_personal"]]) == 1


@pytest.mark.asyncio
async def test_explicit_folder_wins_over_personal(auth_client: AsyncClient, temp_uploads):
    """Papka aniq ko'rsatilsa, shaxsiy papkaga majburlanmaydi."""
    folder = await auth_client.post("/file/folder/", json={"name": "Ma'ruzalar"})
    assert folder.status_code == 201
    target = folder.json()["id"]
    assert folder.json()["is_personal"] is False

    created = await auth_client.post(
        f"/file/upload?folder_id={target}",
        files={"file": ("maruza.png", PNG, "image/png")},
    )
    assert created.status_code == 201
    assert created.json()["folder_id"] == target


# ---------------------------------------------------------------------- #
#  Kurs kutubxonasi
# ---------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_course_library_collects_files_used_in_the_course(
    auth_client: AsyncClient, async_db, temp_uploads, test_kafedra, test_subject, test_teacher
):
    """Kursda ishlatilayotgan fayl kurs kutubxonasida ko'rinadi.

    Bog'lanish `file_usages` orqali: darsga material biriktirilishi bilan u
    shu ro'yxatda paydo bo'ladi va alohida jadval kerak emas.
    """
    from app.modules.course.model import Course, Resource

    course = Course(
        name="Test kursi",
        kafedra_id=test_kafedra["id"],
        subject_id=test_subject.id,
        teacher_id=test_teacher["id"],
    )
    async_db.add(course)
    await async_db.flush()

    uploaded = await auth_client.post(
        "/file/upload", files={"file": ("material.png", PNG, "image/png")}
    )
    file_id = uploaded.json()["id"]

    # Kurs darajasidagi material: `lesson_id` bo'sh, `course_id` bor.
    resource = Resource(course_id=course.id, title="Material", resource_type="file")
    async_db.add(resource)
    await async_db.flush()

    attached = await auth_client.post(
        f"/file/{file_id}/attach",
        json={"entity_type": "resource", "entity_id": resource.id},
    )
    assert attached.status_code == 200

    listed = await auth_client.get(f"/file/course/{course.id}")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()["items"]] == [file_id]


@pytest.mark.asyncio
async def test_course_library_includes_lesson_attached_files(
    auth_client: AsyncClient, async_db, temp_uploads, test_kafedra, test_subject, test_teacher
):
    """Darsga biriktirilgan material ham kurs kutubxonasida ko'rinadi.

    Aynan shu holat eng ko'p uchraydi va eng oson o'tkazib yuboriladi:
    darsga qo'shilgan material `course_id` ni to'ldirmaydi (u `NULL` bo'lib
    qoladi), faqat `lesson_id` ni. Shuning uchun so'rov darslar orqali ham
    izlashi shart — aks holda kutubxona bo'sh ko'rinadi.
    """
    from app.modules.auth.model import TeacherSubject
    from app.modules.course.model import Course, Lesson, Resource

    course = Course(
        name="Darsli kurs",
        kafedra_id=test_kafedra["id"],
        subject_id=test_subject.id,
        teacher_id=test_teacher["id"],
    )
    # Dars «o'qituvchi-fan» juftligiga tayanadi, shuning uchun u ham kerak.
    link = TeacherSubject(teacher_id=test_teacher["id"], subject_id=test_subject.id)
    async_db.add_all([course, link])
    await async_db.flush()

    lesson = Lesson(
        course_id=course.id,
        teacher_subject_id=link.id,
        topic="1-dars",
        date=date(2026, 9, 12),
    )
    async_db.add(lesson)
    await async_db.flush()

    uploaded = await auth_client.post(
        "/file/upload", files={"file": ("dars-materiali.png", PNG + b"dars", "image/png")}
    )
    file_id = uploaded.json()["id"]

    # `course_id` ATAYLAB berilmaydi — darsga qo'shilgan material shunday
    # saqlanadi.
    resource = Resource(lesson_id=lesson.id, title="Dars materiali", resource_type="file")
    async_db.add(resource)
    await async_db.flush()

    await auth_client.post(
        f"/file/{file_id}/attach",
        json={"entity_type": "resource", "entity_id": resource.id},
    )

    listed = await auth_client.get(f"/file/course/{course.id}")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()["items"]] == [file_id]
    # Darsdagi material kurs kutubxonasidan olib tashlanmaydi — darsda turadi.
    assert listed.json()["items"][0]["course_resource_ids"] == []
    assert listed.json()["items"][0]["used_in_lessons"] is True


@pytest.mark.asyncio
async def test_course_library_is_empty_for_unrelated_course(
    auth_client: AsyncClient, async_db, temp_uploads, test_kafedra, test_subject, test_teacher
):
    """Boshqa kursning fayllari bu kursga tushmaydi."""
    from app.modules.course.model import Course

    course = Course(
        name="Bo'sh kurs",
        kafedra_id=test_kafedra["id"],
        subject_id=test_subject.id,
        teacher_id=test_teacher["id"],
    )
    async_db.add(course)
    await async_db.flush()

    await auth_client.post("/file/upload", files={"file": ("x.png", PNG, "image/png")})

    listed = await auth_client.get(f"/file/course/{course.id}")
    assert listed.status_code == 200
    assert listed.json()["items"] == []


@pytest.mark.asyncio
async def test_course_material_created_via_api_appears_in_library(
    auth_client: AsyncClient, async_db, temp_uploads, test_kafedra, test_subject, test_teacher
):
    """API orqali qo'shilgan material kutubxonaga o'zi tushadi.

    Ilgari `file_usages` ni faqat bir martalik import skripti to'ldirardi:
    keyin qo'shilgan kitob kurs kutubxonasida umuman ko'rinmasdi. Material
    o'chirilganda esa fayl kutubxonadan chiqadi.
    """
    from app.modules.course.model import Course

    course = Course(
        name="Kitobli kurs",
        kafedra_id=test_kafedra["id"],
        subject_id=test_subject.id,
        teacher_id=test_teacher["id"],
    )
    async_db.add(course)
    await async_db.flush()

    uploaded = await auth_client.post(
        "/file/upload", files={"file": ("kitob.png", PNG + b"kitob", "image/png")}
    )
    assert uploaded.status_code == 201

    created = await auth_client.post(
        "/resource/",
        json={
            "course_id": course.id,
            "resource_type": "file",
            "title": "Darslik",
            "file_url": uploaded.json()["url"],
        },
    )
    assert created.status_code in (200, 201), created.text

    listed = await auth_client.get(f"/file/course/{course.id}")
    assert [item["id"] for item in listed.json()["items"]] == [uploaded.json()["id"]]
    # Kurs darajasidagi kitob — kutubxonadan olib tashlash shu resursni oʻchiradi.
    item = listed.json()["items"][0]
    assert item["course_resource_ids"] == [created.json()["id"]]
    # Oʻqituvchi yozgan kitob nomi, fayl nomi emas.
    assert item["title"] == "Darslik"
    assert item["used_in_lessons"] is False

    deleted = await auth_client.delete(f"/resource/{created.json()['id']}")
    assert deleted.status_code in (200, 204)

    listed = await auth_client.get(f"/file/course/{course.id}")
    assert listed.json()["items"] == []


@pytest.mark.asyncio
async def test_shared_only_never_lists_own_files(auth_client: AsyncClient, temp_uploads):
    """`shared_only` — boshqa odamning papkasidagi fayllar uchun.

    Oʻz papkasidagi fayl u yerda ham chiqsa, papka boʻyicha tanlash oynasida
    ayni fayl ikki joyda koʻrinib, papkalar yana aralashib ketardi.
    """
    uploaded = await auth_client.post(
        "/file/upload", files={"file": ("oziniki.png", PNG + b"oziniki", "image/png")}
    )
    assert uploaded.status_code == 201
    assert uploaded.json()["folder_id"] is not None

    in_folder = await auth_client.get(
        "/file/", params={"folder_id": uploaded.json()["folder_id"]}
    )
    assert [item["id"] for item in in_folder.json()["items"]] == [uploaded.json()["id"]]

    shared = await auth_client.get("/file/", params={"shared_only": True})
    assert shared.status_code == 200
    assert shared.json()["items"] == []
