import pytest


@pytest.mark.asyncio
async def test_create_group(auth_client, test_faculty):
    payload = {"name": "Math-101", "faculty_id": test_faculty["id"]}
    response = await auth_client.post("/group/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == payload["name"]
    assert data["faculty_id"] == payload["faculty_id"]
    assert "id" in data


@pytest.mark.asyncio
async def test_get_group(auth_client, test_group):
    response = await auth_client.get(f"/group/{test_group['id']}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == test_group["id"]
    assert data["name"] == test_group["name"]


@pytest.mark.asyncio
async def test_list_groups(auth_client, test_group):
    response = await auth_client.get("/group/")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert len(data["groups"]) >= 1


@pytest.mark.asyncio
async def test_list_groups_filters_by_speciality_and_exposes_catalog_fields(
    auth_client, async_db, test_group, test_kafedra
):
    from app.modules.organization_structure.model import Group

    speciality_response = await auth_client.post(
        "/speciality/",
        json={"name": "Information systems", "kafedra_id": test_kafedra["id"]},
    )
    assert speciality_response.status_code == 201
    speciality_id = speciality_response.json()["id"]

    group = await async_db.get(Group, test_group["id"])
    group.speciality_id = speciality_id
    group.course = 2
    group.education_shape = "Kunduzgi"
    group.student_count = 24
    await async_db.commit()

    response = await auth_client.get("/group/", params={"speciality_id": speciality_id})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["groups"][0]["speciality_id"] == speciality_id
    assert data["groups"][0]["course"] == 2
    assert data["groups"][0]["education_shape"] == "Kunduzgi"
    assert data["groups"][0]["student_count"] == 24

    empty_response = await auth_client.get("/group/", params={"speciality_id": speciality_id + 999})
    assert empty_response.status_code == 200
    assert empty_response.json()["total"] == 0


@pytest.mark.asyncio
async def test_update_group(auth_client, test_group):
    payload = {"name": "Updated Group", "faculty_id": test_group["faculty_id"]}
    response = await auth_client.put(f"/group/{test_group['id']}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == payload["name"]


@pytest.mark.asyncio
async def test_delete_group(auth_client, test_group):
    response = await auth_client.delete(f"/group/{test_group['id']}")
    assert response.status_code == 204

    # Verify deletion
    response = await auth_client.get(f"/group/{test_group['id']}")
    assert response.status_code == 404


async def _lesson_in_group(auth_client, test_teacher, test_subject, test_faculty, test_kafedra, group_id):
    """Проводит одно занятие в группе, как это делает преподаватель через UI."""
    course = await auth_client.post(
        "/course/",
        json={
            "name": "Discrete math",
            "subject_id": test_subject.id,
            "teacher_id": test_teacher["user_id"],
            "group_ids": [group_id],
            "faculty_id": test_faculty["id"],
            "kafedra_id": test_kafedra["id"],
        },
    )
    assert course.status_code == 201, course.text
    # Guruh ataylab ko'rsatiladi: dars aynan shu guruhniki bo'lsagina u
    # guruh bilan birga o'chadi — tekshiruv shu haqda.
    lesson = await auth_client.post(
        "/lesson/",
        json={
            "course_id": course.json()["id"],
            "group_id": group_id,
            "topic": "Grafalar",
            "date": "2026-08-21",
        },
    )
    assert lesson.status_code == 201, lesson.text
    return lesson.json()["id"]


@pytest.mark.asyncio
async def test_delete_group_warns_about_lessons_it_would_destroy(
    auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """`lessons.group_id` — CASCADE, поэтому удаление группы уносит историю
    занятий молча: RESTRICT на `teacher_subject_id` тут не срабатывает. Жёсткого
    запрета нет — но оператор обязан увидеть счётчик до подтверждения."""
    await _lesson_in_group(auth_client, test_teacher, test_subject, test_faculty, test_kafedra, test_group["id"])

    response = await auth_client.delete(f"/group/{test_group['id']}")
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["requires_confirmation"] is True
    lesson_warnings = [w for w in detail["warnings"] if "dars tarixi" in w]
    assert lesson_warnings == ["1 ta o'tilgan dars tarixi butunlay o'chadi (tiklab bo'lmaydi)"]


@pytest.mark.asyncio
async def test_delete_group_warns_about_stranded_course_lessons(
    auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Guruhsiz dars guruh bilan o'chmaydi, lekin ko'rinmay qoladi.

    Dars kursning barcha guruhlariga tegishli bo'lsa, u `groups` ga bog'lanmagan
    va CASCADE unga tegmaydi. Kursning oxirgi guruhi o'chirilsa esa darsni
    hech kim ko'rmaydi — operator buni oldindan bilishi kerak.
    """
    course = await auth_client.post(
        "/course/",
        json={
            "name": "Oqim kursi",
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
        json={"course_id": course.json()["id"], "topic": "Grafalar", "date": "2026-08-21"},
    )
    assert lesson.status_code == 201
    assert lesson.json()["group_id"] is None

    response = await auth_client.delete(f"/group/{test_group['id']}")
    assert response.status_code == 409
    warnings = response.json()["detail"]["warnings"]
    assert "1 ta kurs darsi guruhsiz qoladi va talabalarga ko'rinmaydi" in warnings


@pytest.mark.asyncio
async def test_delete_group_without_lessons_says_nothing_about_them(auth_client, test_group, async_db):
    """Счётчик не выдумывается: без занятий в списке предупреждений его нет."""
    from datetime import date

    from app.modules.auth.model import Student

    async_db.add(
        Student(
            user_id=None,
            group_id=test_group["id"],
            first_name="A",
            last_name="B",
            third_name="C",
            full_name="A B C",
            student_id_number="1",
            image_path="",
            birth_date=date(2000, 1, 1),
            gender="male",
            university="NDKTU",
            specialty="SE",
            student_status="active",
            education_form="kunduzgi",
            education_type="bakalavr",
            payment_form="kontrakt",
            education_lang="uz",
            faculty="IT",
            level="1",
            semester="1",
            address="Namangan",
            avg_gpa=0.0,
        )
    )
    await async_db.commit()

    response = await auth_client.delete(f"/group/{test_group['id']}")
    assert response.status_code == 409
    warnings = response.json()["detail"]["warnings"]
    assert any("talaba guruhsiz qoladi" in w for w in warnings)
    assert not any("dars tarixi" in w for w in warnings)
