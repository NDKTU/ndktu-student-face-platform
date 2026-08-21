from datetime import date

import pytest
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_student_sees_only_courses_for_their_group(
    auth_client,
    async_db,
    test_user,
    test_subject,
    test_group,
):
    from app.modules.auth.model import Role, Student, User
    from app.modules.course.course.repository import get_course_repository
    from app.modules.course.course.schemas import CourseListRequest

    course_response = await auth_client.post(
        "/course/",
        json={
            "name": "Student course",
            "subject_id": test_subject.id,
            "teacher_id": test_user["id"],
            "group_ids": [test_group["id"]],
        },
    )
    assert course_response.status_code == 201
    course_id = course_response.json()["id"]

    student_role = Role(name="Student")
    student_user = User(username="course_student", password="not-used", roles=[student_role])
    async_db.add_all([student_role, student_user])
    await async_db.flush()
    student = Student(
        user_id=student_user.id,
        group_id=test_group["id"],
        first_name="Course",
        last_name="Student",
        third_name="Test",
        full_name="Course Student Test",
        student_id_number="COURSE-001",
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
    async_db.add(student)
    await async_db.commit()

    result = await get_course_repository.list_courses(
        session=async_db,
        request=CourseListRequest(page=1, limit=20),
        current_user=student_user,
        restrict_to_teacher=True,
    )
    assert result.total == 1
    assert result.courses[0].id == course_id

    detail = await get_course_repository.get_course(
        session=async_db,
        course_id=course_id,
        current_user=student_user,
    )
    assert detail.id == course_id


@pytest.mark.asyncio
async def test_student_cannot_open_course_from_another_group(
    auth_client,
    async_db,
    test_user,
    test_subject,
    test_group,
):
    from app.modules.auth.model import Role, User
    from app.modules.course.course.repository import get_course_repository

    course_response = await auth_client.post(
        "/course/",
        json={
            "name": "Private group course",
            "subject_id": test_subject.id,
            "teacher_id": test_user["id"],
            "group_ids": [test_group["id"]],
        },
    )
    course_id = course_response.json()["id"]

    student_role = Role(name="Student")
    outsider = User(username="course_outsider", password="not-used", roles=[student_role])
    async_db.add_all([student_role, outsider])
    await async_db.commit()

    with pytest.raises(HTTPException) as error:
        await get_course_repository.get_course(
            session=async_db,
            course_id=course_id,
            current_user=outsider,
        )
    assert error.value.status_code == 403
