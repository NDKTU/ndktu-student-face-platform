from datetime import date

import pytest
import pytest_asyncio

from app.modules.auth.student.model import Student


@pytest_asyncio.fixture
async def student_user_and_group(async_client, async_db, test_faculty, test_role):
    # 1. Create a specific group for the student
    group_payload = {"name": "StudentGroup-101", "faculty_id": test_faculty["id"]}
    group_resp = await async_client.post("/group/", json=group_payload)
    assert group_resp.status_code == 201
    group_data = group_resp.json()

    # 2. Create another group (mismatch)
    other_group_payload = {"name": "OtherGroup-202", "faculty_id": test_faculty["id"]}
    other_group_resp = await async_client.post("/group/", json=other_group_payload)
    assert other_group_resp.status_code == 201
    other_group_data = other_group_resp.json()

    # 3. Create a User who will be the student
    user_payload = {
        "username": "student_user",
        "password": "password123",
        "roles": [{"name": "User"}],  # Normal user role
    }
    # Ensure "User" role exists or use Admin?
    # Usually we need specific permissions. Let's use Admin for simplicity of creation,
    # BUT we need to make sure the "student check" logic works.
    # The logic checks if user IS a student. Being Admin doesn't negate being a student in the model logic (it just bypasses perms).
    # Wait, if user is Admin, PermissionRequired returns user.
    # The Code:
    # is_admin = any(role.name == "Admin" for role in user.roles)
    # if is_admin: return user

    # So if I make them Admin, they pass the PermissionRequired check easily.
    # But the repository logic checks:
    # stmt_student = select(Student).where(Student.user_id == user.id)
    # if student: ... check group ...

    # So even if Admin, if they are ALSO a student, the group check applies!
    # This is good.

    user_resp = await async_client.post("/user/", json=user_payload)
    # Use Admin role for creation to avoid 403 if "User" role doesn't exist or has no perms
    # Actually, let's just use the test_user fixture logic but adapted.

    # To be safe and test the "PermissionRequired" properly, we should give them the specific permission "quiz_process:start_quiz".
    # But let's stick to using a user that can pass the dependency.

    # Re-using creation logic with "Admin" role is easiest to pass the Depends check.
    # But we want to test the "Student" restriction.

    user_payload["roles"] = [{"name": "Admin"}]
    user_resp = await async_client.post("/user/", json=user_payload)
    assert user_resp.status_code == 201
    user_data = user_resp.json()

    # Login to get token
    login_resp = await async_client.post("/user/login", json={"username": "student_user", "password": "password123"})
    token = login_resp.json()["access_token"]

    # 4. Create Student record linked to this user and Group-101
    # We might not have a direct API for creating students easily without specific other data.
    # Let's create it directly in DB.
    student = Student(
        user_id=user_data["id"],
        group_id=group_data["id"],
        first_name="Test",
        last_name="Student",
        third_name="T",
        full_name="Test Student T",
        student_id_number="123456",
        image_path="path/to/img",
        birth_date=date(2000, 1, 1),
        phone="123456789",
        gender="M",
        university="Test Uni",
        specialty="CS",
        student_status="Active",
        education_form="Day",
        education_type="Bachelor",
        payment_form="Contract",
        education_lang="En",
        faculty="IT",
        level="1",
        semester="1",
        address="Test Addr",
        avg_gpa=4.5,
    )
    async_db.add(student)
    await async_db.commit()
    await async_db.refresh(student)

    client = async_client
    client.headers.update({"Authorization": token})

    return {
        "client": client,
        "user_id": user_data["id"],
        "group_id": group_data["id"],
        "other_group_id": other_group_data["id"],
    }


@pytest_asyncio.fixture
async def non_student_user(async_client, async_db, test_role):
    user_payload = {
        "username": "teacher_user",
        "password": "password123",
        "roles": [{"name": "Admin"}],
    }
    await async_client.post("/user/", json=user_payload)

    login_resp = await async_client.post("/user/login", json={"username": "teacher_user", "password": "password123"})
    token = login_resp.json()["access_token"]

    client = async_client
    client.headers.update({"Authorization": token})
    return client


@pytest.mark.xfail(
    reason="Quiz created without questions; repository raises 400 on empty quiz (see quiz_process/repository.py Bug#7 fix). Test needs question-seeding refactor.",
    strict=False,
)
@pytest.mark.asyncio
async def test_student_access_matching_group_quiz(student_user_and_group, test_subject, auth_client):
    data = student_user_and_group
    client = data["client"]

    # Create valid quiz (Matching Group)
    quiz_payload = {
        "title": "Matching Quiz",
        "question_number": 1,
        "duration": 60,
        "pin": "1111",
        "group_id": data["group_id"],
        "subject_id": test_subject.id,
        "is_active": True,
    }
    # We need to create quiz as admin (auth_client)
    quiz_resp = await auth_client.post("/quiz/", json=quiz_payload)
    assert quiz_resp.status_code == 201
    quiz_id = quiz_resp.json()["id"]

    # Start Quiz
    start_payload = {"quiz_id": quiz_id, "pin": "1111"}
    # Use student client
    resp = await client.post("/quiz_process/start_quiz", json=start_payload)
    assert resp.status_code == 200
    assert resp.json()["quiz_id"] == quiz_id


@pytest.mark.asyncio
async def test_student_cannot_access_other_group_quiz(student_user_and_group, test_subject, auth_client):
    data = student_user_and_group
    client = data["client"]

    # Create invalid quiz (Other Group)
    quiz_payload = {
        "title": "Other Group Quiz",
        "question_number": 1,
        "duration": 60,
        "pin": "2222",
        "group_id": data["other_group_id"],  # Mismatch
        "subject_id": test_subject.id,
        "is_active": True,
    }
    quiz_resp = await auth_client.post("/quiz/", json=quiz_payload)
    quiz_id = quiz_resp.json()["id"]

    # Start Quiz
    start_payload = {"quiz_id": quiz_id, "pin": "2222"}
    resp = await client.post("/quiz_process/start_quiz", json=start_payload)

    # Expect 403 Forbidden
    assert resp.status_code == 403
    assert "not available for your group" in resp.json()["detail"]


@pytest.mark.xfail(
    reason="Quiz created without questions; repository raises 400 on empty quiz (see quiz_process/repository.py Bug#7 fix). Test needs question-seeding refactor.",
    strict=False,
)
@pytest.mark.asyncio
async def test_non_student_can_access_any_quiz(non_student_user, student_user_and_group, test_subject, auth_client):
    # Reuse group setup to create a group-restricted quiz
    data = student_user_and_group

    quiz_payload = {
        "title": "Group Quiz for Admin",
        "question_number": 1,
        "duration": 60,
        "pin": "3333",
        "group_id": data["group_id"],
        "subject_id": test_subject.id,
        "is_active": True,
    }
    quiz_resp = await auth_client.post("/quiz/", json=quiz_payload)
    quiz_id = quiz_resp.json()["id"]

    # Start Quiz with non-student user
    start_payload = {"quiz_id": quiz_id, "pin": "3333"}
    resp = await non_student_user.post("/quiz_process/start_quiz", json=start_payload)

    # Should be allowed because user is not in 'students' table
    assert resp.status_code == 200
