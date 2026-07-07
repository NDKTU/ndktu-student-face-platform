import pytest
from sqlalchemy import select

from app.modules.organization_structure.model import GroupTeacher


@pytest.mark.asyncio
async def test_create_quiz_creates_group_teacher(auth_client, async_db, test_user, test_subject, test_group):
    # Ensure no GroupTeacher exists initially
    user_id = test_user["id"]
    group_id = test_group["id"]

    stmt = select(GroupTeacher).where(GroupTeacher.teacher_id == user_id, GroupTeacher.group_id == group_id)
    res = await async_db.execute(stmt)
    assert res.scalar_one_or_none() is None

    # Create Quiz
    payload = {
        "title": "Group Teacher Test Quiz",
        "question_number": 5,
        "duration": 30,
        "pin": "1234",
        "is_active": True,
        "user_id": user_id,
        "group_id": group_id,
        "subject_id": test_subject.id,
    }

    resp = await auth_client.post("/quiz/", json=payload)
    assert resp.status_code == 201

    # Verify GroupTeacher created
    async_db.expire_all()
    stmt = select(GroupTeacher).where(GroupTeacher.teacher_id == user_id, GroupTeacher.group_id == group_id)
    res = await async_db.execute(stmt)
    group_teacher = res.scalar_one_or_none()
    assert group_teacher is not None
    assert group_teacher.teacher_id == user_id
    assert group_teacher.group_id == group_id

    # Verify idempotent (creating another quiz shouldn't fail)
    payload["title"] = "Another Quiz"
    resp = await auth_client.post("/quiz/", json=payload)
    assert resp.status_code == 201

    # Still only one record (or at least no error)
    res = await async_db.execute(stmt)
    relations = res.scalars().all()
    assert len(relations) == 1
