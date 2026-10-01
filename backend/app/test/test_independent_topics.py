"""Mustaqil ish mavzulari.

Roʻyxat sillabusning bir qismi: oʻqituvchi mavzularni eʼlon qiladi,
talaba koʻradi. Shuning uchun koʻrish huquqi kursni koʻrish bilan bir
xil, oʻzgartirish esa faqat kursni boshqaradiganlarda.
"""

import pytest
import pytest_asyncio

from app.modules.course.model import Course


@pytest_asyncio.fixture
async def course_for_topics(async_db, make_teacher, make_subject, test_kafedra, test_user):
    """Admin (`test_user`) asosiy oʻqituvchi boʻlgan kurs."""
    await make_teacher("topic_teacher", test_kafedra["id"])
    subject = await make_subject("Mustaqil ish fani")
    course = Course(name="Mustaqil ish kursi", subject_id=subject.id, teacher_id=test_user["id"])
    async_db.add(course)
    await async_db.commit()
    await async_db.refresh(course)
    return {"course_id": course.id, "subject_id": subject.id}


@pytest.mark.asyncio
async def test_topics_are_created_and_listed_in_order(auth_client, course_for_topics):
    """Mavzular kiritilgan tartibda qaytadi.

    Tartib `position` boʻyicha: sillabusda mavzular ketma-ket turadi,
    yaratilgan vaqt boʻyicha emas.
    """
    course_id = course_for_topics["course_id"]

    for title in ("Uchinchi mavzu", "Birinchi mavzu", "Ikkinchi mavzu"):
        response = await auth_client.post(
            f"/course/{course_id}/independent-topics", json={"title": title}
        )
        assert response.status_code == 201, response.text

    listing = await auth_client.get(f"/course/{course_id}/independent-topics")

    assert listing.status_code == 200, listing.text
    body = listing.json()
    assert body["total"] == 3
    # `position` berilmaganda oxiriga qoʻshiladi — kiritish tartibi saqlanadi.
    assert [t["title"] for t in body["topics"]] == ["Uchinchi mavzu", "Birinchi mavzu", "Ikkinchi mavzu"]
    assert [t["position"] for t in body["topics"]] == [1, 2, 3]


@pytest.mark.asyncio
async def test_explicit_position_reorders(auth_client, course_for_topics):
    """Aniq koʻrsatilgan `position` tartibni oʻzgartiradi."""
    course_id = course_for_topics["course_id"]
    first = (
        await auth_client.post(f"/course/{course_id}/independent-topics", json={"title": "A"})
    ).json()
    await auth_client.post(f"/course/{course_id}/independent-topics", json={"title": "B"})

    moved = await auth_client.put(
        f"/course/independent-topics/{first['id']}", json={"title": "A", "position": 10}
    )

    assert moved.status_code == 200, moved.text
    listing = await auth_client.get(f"/course/{course_id}/independent-topics")
    assert [t["title"] for t in listing.json()["topics"]] == ["B", "A"]


@pytest.mark.asyncio
async def test_blank_title_is_rejected(auth_client, course_for_topics):
    """Faqat boʻsh joydan iborat nom roʻyxatda boʻsh qator boʻlib chiqardi."""
    response = await auth_client.post(
        f"/course/{course_for_topics['course_id']}/independent-topics", json={"title": "   "}
    )
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_blank_description_becomes_null(auth_client, course_for_topics):
    """Boʻsh izoh `null` ga aylanadi — roʻyxatda boʻsh qator chizilmasin."""
    response = await auth_client.post(
        f"/course/{course_for_topics['course_id']}/independent-topics",
        json={"title": "Izohsiz mavzu", "description": "   "},
    )
    assert response.status_code == 201, response.text
    assert response.json()["description"] is None


@pytest.mark.asyncio
async def test_topic_can_be_edited_and_deleted(auth_client, course_for_topics):
    course_id = course_for_topics["course_id"]
    created = (
        await auth_client.post(
            f"/course/{course_id}/independent-topics",
            json={"title": "Eski nom", "description": "Eski izoh"},
        )
    ).json()

    updated = await auth_client.put(
        f"/course/independent-topics/{created['id']}",
        json={"title": "Yangi nom", "description": "Yangi izoh"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["title"] == "Yangi nom"

    removed = await auth_client.delete(f"/course/independent-topics/{created['id']}")
    assert removed.status_code == 204, removed.text

    listing = await auth_client.get(f"/course/{course_id}/independent-topics")
    assert listing.json()["total"] == 0


@pytest.mark.asyncio
async def test_topics_vanish_with_the_course(auth_client, async_db, course_for_topics):
    """Kurs oʻchirilsa mavzular ham ketadi (`CASCADE`).

    Ular kursdan tashqarida maʼnosiz: fan, guruh va oʻqituvchi — hammasi
    kursniki.
    """
    from sqlalchemy import func, select

    from app.modules.course.model import IndependentTopic

    course_id = course_for_topics["course_id"]
    await auth_client.post(f"/course/{course_id}/independent-topics", json={"title": "Mavzu"})

    course = await async_db.get(Course, course_id)
    await async_db.delete(course)
    await async_db.commit()

    left = await async_db.scalar(
        select(func.count()).select_from(IndependentTopic).where(IndependentTopic.course_id == course_id)
    )
    assert left == 0
