"""`POST /teacher/` endi bir vaqtning o'zida `User` va o'qituvchi kartochkasini
yaratadi — `Employee` `Teacher` ichiga birlashtirilgandan keyin alohida xodim
endpoint'i qolmadi. Shu sababli eski `test_employee.py` dagi qamrov
(hisob yaratish, dublikatlar, yetim `User` bo'lmasligi) shu yerga ko'chirildi.
"""

import pytest
import pytest_asyncio


@pytest.mark.asyncio
async def test_create_teacher_creates_user_and_profile(auth_client, test_kafedra):
    payload = {
        "username": "teacher_one",
        "password": "password123",
        "first_name": "Ali",
        "last_name": "Valiyev",
        "third_name": "Aliyevich",
        "kafedra_id": test_kafedra["id"],
        "roles": [{"name": "Admin"}],
    }
    response = await auth_client.post("/teacher/", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["full_name"] == "Valiyev Ali Aliyevich"
    assert body["first_name"] == payload["first_name"]
    assert body["kafedra_id"] == test_kafedra["id"]
    assert body["user_id"] is not None
    assert body["user"]["username"] == payload["username"]

    # Yaratilgan hisob haqiqatan ham ishlashi kerak.
    login_response = await auth_client.post(
        "/user/login",
        json={"username": payload["username"], "password": payload["password"]},
    )
    assert login_response.status_code == 200
    assert "access_token" in login_response.json()


@pytest.mark.asyncio
async def test_create_teacher_duplicate_username(auth_client):
    payload = {
        "username": "teacher_dup_user",
        "password": "password123",
        "first_name": "Bob",
        "last_name": "Brown",
        "third_name": "Lee",
        "roles": [{"name": "Admin"}],
    }
    first = await auth_client.post("/teacher/", json=payload)
    assert first.status_code == 201

    second_payload = {**payload, "first_name": "Different", "last_name": "Person", "third_name": "Name"}
    second = await auth_client.post("/teacher/", json=second_payload)
    assert second.status_code == 400


@pytest.mark.asyncio
async def test_create_teacher_duplicate_full_name_is_rejected(auth_client):
    """Bir xil `full_name` bilan ikkinchi o'qituvchi yaratilmaydi.

    Diqqat: bu tekshiruv `create_user` gacha ishlaydi, ya'ni bu test
    tranzaksiya chegarasi haqida hech nima isbotlamaydi — u faqat nom
    bo'yicha rad etishni tekshiradi.
    """
    payload = {
        "username": "teacher_name_a",
        "password": "password123",
        "first_name": "Carol",
        "last_name": "White",
        "third_name": "Anne",
        "roles": [{"name": "Admin"}],
    }
    first = await auth_client.post("/teacher/", json=payload)
    assert first.status_code == 201

    second_payload = {**payload, "username": "teacher_name_b"}
    second = await auth_client.post("/teacher/", json=second_payload)
    assert second.status_code == 400


@pytest.mark.asyncio
async def test_get_teacher(auth_client, test_teacher):
    response = await auth_client.get(f"/teacher/{test_teacher['id']}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_teacher["id"]
    assert data["full_name"] == "Doe John Smith"


@pytest.mark.asyncio
async def test_list_teachers(auth_client, test_teacher):
    response = await auth_client.get("/teacher/")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert any(t["id"] == test_teacher["id"] for t in data["teachers"])

    # Ism bo'yicha filtr endi to'g'ridan-to'g'ri `teachers.full_name` ustida.
    filtered = await auth_client.get("/teacher/", params={"full_name": "Doe"})
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1

    empty = await auth_client.get("/teacher/", params={"full_name": "Nobody"})
    assert empty.json()["total"] == 0


@pytest.mark.asyncio
async def test_update_teacher_changes_names_and_kafedra(auth_client, test_teacher, test_faculty):
    new_kafedra_response = await auth_client.post(
        "/kafedra/", json={"name": "Another Kafedra", "faculty_id": test_faculty["id"]}
    )
    assert new_kafedra_response.status_code == 201
    new_kafedra = new_kafedra_response.json()

    payload = {
        "first_name": "Johnny",
        "last_name": "Doe",
        "third_name": "Smith",
        "kafedra_id": new_kafedra["id"],
    }
    response = await auth_client.put(f"/teacher/{test_teacher['id']}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["kafedra_id"] == new_kafedra["id"]
    assert data["first_name"] == "Johnny"
    assert data["full_name"] == "Doe Johnny Smith"
    # Hisob o'zgarmaydi: `username`/`user_id` o'sha-o'sha.
    assert data["user_id"] == test_teacher["user_id"]


@pytest.mark.asyncio
async def test_update_teacher_requires_kafedra_id(auth_client, test_teacher):
    """Regress: `kafedra_id` ixtiyoriy bo'lib qolgan edi, va uni yubormagan
    `PUT /teacher/{id}` o'qituvchini kafedrasidan jimgina ajratib qo'yardi.
    Birlashuvdan oldingi shartnomadagidek — majburiy, ya'ni 422."""
    response = await auth_client.put(
        f"/teacher/{test_teacher['id']}",
        json={"first_name": "John", "last_name": "Doe", "third_name": "Smith"},
    )
    assert response.status_code == 422

    # Kafedra tegilmagan holicha qoladi.
    read_back = await auth_client.get(f"/teacher/{test_teacher['id']}")
    assert read_back.json()["kafedra_id"] == test_teacher["kafedra_id"]


@pytest.mark.asyncio
async def test_delete_teacher(auth_client, test_teacher):
    response = await auth_client.delete(f"/teacher/{test_teacher['id']}")
    assert response.status_code == 204

    # Verify deletion
    response = await auth_client.get(f"/teacher/{test_teacher['id']}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_assign_and_read_subjects(auth_client, test_teacher, test_subject):
    """Регресс: без eager-load эндпоинт падал с MissingGreenlet (500) на
    «Mening fanlarim» и в карточке преподавателя у админа."""
    assign = await auth_client.post(
        "/teacher/assign_subjects",
        json={"teacher_id": test_teacher["id"], "subject_ids": [test_subject.id]},
    )
    assert assign.status_code == 200

    user_id = test_teacher["user_id"]
    response = await auth_client.get(f"/teacher/assigned_subjects/by-user/{user_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == user_id
    assert data["full_name"]
    assert [st["subject"]["id"] for st in data["subject_teachers"]] == [test_subject.id]


@pytest.mark.asyncio
async def test_assign_and_read_groups(auth_client, async_db, test_teacher, test_group):
    """Guruh biriktiruvi endi to'g'ridan-to'g'ri o'qituvchi kartochkasiga
    yoziladi: so'rov `teachers.id` kutadi, `users.id` emas."""
    from sqlalchemy import select

    from app.modules.organization_structure.model import TeacherGroup

    user_id = test_teacher["user_id"]
    assign = await auth_client.post(
        "/teacher/assign_groups",
        json={"teacher_id": test_teacher["id"], "group_ids": [test_group["id"]]},
    )
    assert assign.status_code == 200

    # Aynan `teachers.id` yozilganini tekshiramiz: `users.id` yozilib qolsa,
    # id'lar baribir mavjud bo'lgani uchun hech qanday xato ko'rinmaydi.
    async_db.expire_all()
    rows = (await async_db.execute(select(TeacherGroup))).scalars().all()
    assert [(r.teacher_id, r.group_id) for r in rows] == [(test_teacher["id"], test_group["id"])]

    response = await auth_client.get(f"/teacher/assigned_groups/by-user/{user_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == user_id
    assert [gt["group"]["id"] for gt in data["group_teachers"]] == [test_group["id"]]


@pytest.mark.asyncio
async def test_assign_groups_rejects_user_id(auth_client, test_teacher, test_group):
    """Eski shartnoma (`user_id`) endi qabul qilinmaydi — 422."""
    response = await auth_client.post(
        "/teacher/assign_groups",
        json={"user_id": test_teacher["user_id"], "group_ids": [test_group["id"]]},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_user_me_and_list_expose_teacher_profile(async_client, auth_client, test_teacher, test_kafedra):
    """`Employee` birlashgandan keyin `/user/me` va `/user/` javoblarida
    profil `teacher` kaliti ostida keladi. Kafedra zanjiri eager-load
    qilinmasa, ikkala endpoint ham MissingGreenlet bilan 500 beradi."""
    login = await async_client.post(
        "/user/login",
        json={"username": "teacher_fixture_user", "password": "password123"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]

    me = await async_client.get("/user/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    body = me.json()
    assert body["student"] is None
    assert body["teacher"]["id"] == test_teacher["id"]
    assert body["teacher"]["full_name"] == "Doe John Smith"
    assert body["teacher"]["kafedra"]["id"] == test_kafedra["id"]

    listed = await auth_client.get("/user/", params={"username": "teacher_fixture_user"})
    assert listed.status_code == 200
    users = listed.json()["users"]
    assert len(users) == 1
    assert users[0]["teacher"]["kafedra"]["id"] == test_kafedra["id"]


@pytest_asyncio.fixture
async def teacher_token(async_client, test_teacher):
    """`test_teacher` fikstura o'qituvchisining o'z tokeni.

    Admin klientidan farqli o'laroq bu boshqa foydalanuvchi, shuning uchun
    `/teacher/me` da chaqiruvchini aniqlash yo'li haqiqatan tekshiriladi.
    (Fikstura unga `Admin` rolini beradi — test bazasida `teacher` roli yo'q,
    ya'ni bu yerda ruxsat tekshiruvi emas, shaxsni aniqlash sinaladi.)
    """
    login = await async_client.post(
        "/user/login",
        json={"username": "teacher_fixture_user", "password": "password123"},
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.mark.asyncio
async def test_teacher_reads_own_profile(async_client, test_teacher, test_kafedra, teacher_token):
    """`GET /teacher/me` — chaqiruvchining o'z kartochkasi. Eski
    `GET /employee/me` ning o'rnini bosadi."""
    response = await async_client.get("/teacher/me", headers=teacher_token)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_teacher["id"]
    assert data["user_id"] == test_teacher["user_id"]
    assert data["full_name"] == "Doe John Smith"
    assert data["kafedra"]["id"] == test_kafedra["id"]


@pytest.mark.asyncio
async def test_user_without_teacher_profile_gets_404_on_me(auth_client):
    """Admin foydalanuvchida o'qituvchi kartochkasi yo'q — 404."""
    response = await auth_client.get("/teacher/me")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_teacher_updates_own_names_and_full_name_is_recomputed(
    async_client, test_teacher, test_kafedra, teacher_token
):
    """`PUT /teacher/me` ism qismlarini va suratni yangilaydi, `full_name` ni
    qayta hisoblaydi; kafedra esa bu yo'ldan o'zgarmaydi."""
    payload = {
        "first_name": "Jonathan",
        "last_name": "Doe",
        "third_name": "Smithson",
        "image_url": "https://files/profile/jon.png",
    }
    response = await async_client.put("/teacher/me", json=payload, headers=teacher_token)
    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "Doe Jonathan Smithson"
    assert body["image_url"] == payload["image_url"]

    # Qayta o'qiganda ham o'sha — va kafedra tegilmagan.
    read_back = await async_client.get("/teacher/me", headers=teacher_token)
    assert read_back.status_code == 200
    data = read_back.json()
    assert data["first_name"] == "Jonathan"
    assert data["third_name"] == "Smithson"
    assert data["full_name"] == "Doe Jonathan Smithson"
    assert data["image_url"] == payload["image_url"]
    assert data["kafedra_id"] == test_kafedra["id"]


@pytest.mark.asyncio
async def test_teacher_cannot_change_kafedra_or_hemis_id_via_me(async_client, test_kafedra, teacher_token):
    """Kafedra, hemis_id va zerkal maydonlari `PUT /teacher/me` sxemasida yo'q:
    yuborilgani e'tiborsiz qoldiriladi, admin qarori o'z kuchida qoladi."""
    response = await async_client.put(
        "/teacher/me",
        json={
            "first_name": "John",
            "last_name": "Doe",
            "third_name": "Smith",
            "kafedra_id": 9999,
            "hemis_id": "HACKED-1",
            "external_source": "eduplan",
        },
        headers=teacher_token,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["kafedra_id"] == test_kafedra["id"]
    assert data["hemis_id"] is None
    assert data["external_source"] is None


# ── Dars tarixi biriktiruvni himoya qiladi (lessons.teacher_subject_id RESTRICT) ──


async def _teacher_with_lesson(auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra):
    """O'qituvchiga kurs va bitta dars beradi.

    Dars yaratilganda `get_or_create_teacher_subject_for_course` (o'qituvchi,
    fan) biriktiruvini yaratadi va dars aynan shunga bog'lanadi.
    """
    course = await auth_client.post(
        "/course/",
        json={
            "name": "Course with a lesson",
            "subject_id": test_subject.id,
            "teacher_id": test_teacher["user_id"],
            "group_ids": [test_group["id"]],
            "faculty_id": test_faculty["id"],
            "kafedra_id": test_kafedra["id"],
        },
    )
    assert course.status_code == 201

    lesson = await auth_client.post(
        "/lesson/",
        json={"course_id": course.json()["id"], "topic": "Introduction", "date": "2026-08-25"},
    )
    assert lesson.status_code == 201
    return lesson.json()["id"]


@pytest.mark.asyncio
async def test_delete_teacher_with_lessons_returns_409(
    auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """O'tkazilgan dars bor o'qituvchi o'chmaydi — 500 emas, tushunarli 409.

    `lessons.teacher_subject_id` ataylab RESTRICT: biriktiruv bilan birga dars
    tarixi ham jimgina yo'q bo'lib ketmasligi kerak. Ilgari bu FK CASCADE edi
    va darslar sezdirmay o'chib ketardi.
    """
    lesson_id = await _teacher_with_lesson(
        auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra
    )

    response = await auth_client.delete(f"/teacher/{test_teacher['id']}")
    assert response.status_code == 409
    assert "dars" in response.json()["detail"]

    # `force` bu to'siqni ochmaydi: bu tasdiqlanadigan oqibat emas.
    forced = await auth_client.delete(f"/teacher/{test_teacher['id']}?force=true")
    assert forced.status_code == 409

    # O'qituvchi ham, dars ham joyida.
    assert (await auth_client.get(f"/teacher/{test_teacher['id']}")).status_code == 200
    assert (await auth_client.get(f"/lesson/{lesson_id}")).status_code == 200


@pytest.mark.asyncio
async def test_assign_subjects_cannot_detach_subject_with_lessons(
    auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Dars o'tilgan fanni biriktiruvdan chiqarib bo'lmaydi — 409."""
    lesson_id = await _teacher_with_lesson(
        auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra
    )

    response = await auth_client.post(
        "/teacher/assign_subjects",
        json={"teacher_id": test_teacher["id"], "subject_ids": []},
    )
    assert response.status_code == 409
    assert "dars" in response.json()["detail"]

    assert (await auth_client.get(f"/lesson/{lesson_id}")).status_code == 200
    read_back = await auth_client.get(f"/teacher/assigned_subjects/by-user/{test_teacher['user_id']}")
    assert [st["subject"]["id"] for st in read_back.json()["subject_teachers"]] == [test_subject.id]


@pytest.mark.asyncio
async def test_assign_subjects_keeps_untouched_rows(
    auth_client, async_db, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Ro'yxatni o'zgartirmay qayta saqlash ishlaydi va satr `id` si saqlanadi.

    Regress: ilgari `assign_subjects` barcha biriktirmalarni o'chirib qaytadan
    yozardi. RESTRICT ostida bu o'zgarmagan fan uchun ham yiqilardi, muvaffaqiyat
    holida esa satr yangi `id` olib, darslar undan uzilardi.
    """
    from sqlalchemy import select

    from app.modules.auth.model import TeacherSubject

    subject_id = test_subject.id
    await _teacher_with_lesson(auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra)

    # Faqat ustun tanlanadi, ya'ni identity-map ishtirok etmaydi — `expire_all`
    # kerak emas (u fixture'dagi ORM obyektini ham eskirtirib yuborardi).
    before = (await async_db.execute(select(TeacherSubject.id).order_by(TeacherSubject.id))).scalars().all()
    assert before

    response = await auth_client.post(
        "/teacher/assign_subjects",
        json={"teacher_id": test_teacher["id"], "subject_ids": [subject_id]},
    )
    assert response.status_code == 200

    after = (await async_db.execute(select(TeacherSubject.id).order_by(TeacherSubject.id))).scalars().all()
    assert after == before
