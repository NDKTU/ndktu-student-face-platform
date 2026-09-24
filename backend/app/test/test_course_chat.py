from datetime import date

import pytest
from fastapi import HTTPException


async def _create_course(auth_client, test_user, test_subject, test_group) -> int:
    response = await auth_client.post(
        "/course/",
        json={
            "name": "Chat course",
            "subject_id": test_subject.id,
            "course_type": "lecture",
            "teacher_id": test_user["id"],
            "group_ids": [test_group["id"]],
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


async def _make_student(async_db, username: str, group_id: int | None):
    from app.modules.auth.model import Role, Student, User

    role = Role(name="Student")
    user = User(username=username, password="not-used", roles=[role])
    async_db.add_all([role, user])
    await async_db.flush()
    if group_id is not None:
        async_db.add(
            Student(
                user_id=user.id,
                group_id=group_id,
                first_name="Chat",
                last_name="Talaba",
                third_name="Test",
                full_name="Talaba Chat Test",
                student_id_number=f"CHAT-{username}",
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
    await async_db.commit()
    return user


@pytest.mark.asyncio
async def test_teacher_and_enrolled_student_share_course_chat(
    auth_client, async_db, test_user, test_subject, test_group
):
    from app.modules.course.chat.repository import get_course_chat_repository
    from app.modules.course.chat.schemas import CourseMessageCreateRequest, CourseMessageListRequest

    course_id = await _create_course(auth_client, test_user, test_subject, test_group)

    posted = await auth_client.post(f"/course/{course_id}/messages", json={"body": "  Salom, talabalar!  "})
    assert posted.status_code == 201
    teacher_message = posted.json()
    assert teacher_message["body"] == "Salom, talabalar!"
    assert teacher_message["author_role"] == "teacher"
    assert teacher_message["can_delete"] is True

    student = await _make_student(async_db, "chat_student", test_group["id"])
    reply = await get_course_chat_repository.create_message(
        session=async_db,
        course_id=course_id,
        data=CourseMessageCreateRequest(body="Assalomu alaykum, ustoz"),
        current_user=student,
    )
    assert reply.author_role == "student"
    assert reply.author_name == "Talaba Chat Test"

    seen_by_student = await get_course_chat_repository.list_messages(
        session=async_db,
        course_id=course_id,
        request=CourseMessageListRequest(),
        current_user=student,
    )
    assert [m.body for m in seen_by_student.messages] == ["Salom, talabalar!", "Assalomu alaykum, ustoz"]
    # Talaba faqat o'z xabarini o'chira oladi.
    assert [m.can_delete for m in seen_by_student.messages] == [False, True]
    assert seen_by_student.has_more is False

    with pytest.raises(HTTPException) as error:
        await get_course_chat_repository.delete_message(
            session=async_db, course_id=course_id, message_id=teacher_message["id"], current_user=student
        )
    assert error.value.status_code == 403

    # O'qituvchi talabaning xabarini ham o'chira oladi (moderatsiya).
    deleted = await auth_client.delete(f"/course/{course_id}/messages/{reply.id}")
    assert deleted.status_code == 204
    listed = await auth_client.get(f"/course/{course_id}/messages")
    assert [m["id"] for m in listed.json()["messages"]] == [teacher_message["id"]]


@pytest.mark.asyncio
async def test_student_outside_course_groups_cannot_read_chat(
    auth_client, async_db, test_user, test_subject, test_group
):
    from app.modules.course.chat.repository import get_course_chat_repository
    from app.modules.course.chat.schemas import CourseMessageListRequest

    course_id = await _create_course(auth_client, test_user, test_subject, test_group)
    outsider = await _make_student(async_db, "chat_student", None)

    with pytest.raises(HTTPException) as error:
        await get_course_chat_repository.list_messages(
            session=async_db, course_id=course_id, request=CourseMessageListRequest(), current_user=outsider
        )
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_blank_message_is_rejected(auth_client, test_user, test_subject, test_group):
    course_id = await _create_course(auth_client, test_user, test_subject, test_group)

    response = await auth_client.post(f"/course/{course_id}/messages", json={"body": "   \n  "})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_older_messages_are_paged_by_before_id(
    auth_client, async_db, test_user, test_subject, test_group
):
    from app.modules.course.model import CourseMessage

    course_id = await _create_course(auth_client, test_user, test_subject, test_group)
    async_db.add_all(
        [CourseMessage(course_id=course_id, user_id=test_user["id"], body=f"xabar {i}") for i in range(5)]
    )
    await async_db.commit()

    latest = (await auth_client.get(f"/course/{course_id}/messages", params={"limit": 3})).json()
    assert [m["body"] for m in latest["messages"]] == ["xabar 2", "xabar 3", "xabar 4"]
    assert latest["has_more"] is True

    older = (
        await auth_client.get(
            f"/course/{course_id}/messages",
            params={"limit": 3, "before_id": latest["messages"][0]["id"]},
        )
    ).json()
    assert [m["body"] for m in older["messages"]] == ["xabar 0", "xabar 1"]
    assert older["has_more"] is False


@pytest.mark.asyncio
async def test_archived_course_chat_is_read_only(
    auth_client, async_db, test_user, test_subject, test_group
):
    from app.modules.course.model import Course

    course_id = await _create_course(auth_client, test_user, test_subject, test_group)
    course = await async_db.get(Course, course_id)
    course.is_active = False
    await async_db.commit()

    response = await auth_client.post(f"/course/{course_id}/messages", json={"body": "Salom"})
    assert response.status_code == 409
    assert (await auth_client.get(f"/course/{course_id}/messages")).status_code == 200
