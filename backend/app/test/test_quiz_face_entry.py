"""Kirishda yuz tekshiruvi (`face_entry`).

Yuz faqat testga kirishda bir marta solishtiriladi. Qarorni server qiladi:
`start_quiz` tasdiqsiz urinish ochmaydi, shuning uchun rejimni brauzerda
(manzildagi `mode=` yoki JS) o'chirib qo'yish hech narsa bermaydi.
"""

import pytest
import pytest_asyncio

from app.modules.quiz.model import Question, Quiz, QuizQuestion
from app.modules.quiz.quiz_process import repository as process_repository
from app.test.test_lesson_quiz_visibility import student_client  # noqa: F401 — fixture


@pytest_asyncio.fixture
async def face_entry_quiz(async_db, student_client, make_subject):  # noqa: F811
    subject = await make_subject("Yuz kirish fani")
    quiz = Quiz(
        title="Kirishda yuz",
        subject_id=subject.id,
        group_id=student_client["group_id"],
        question_number=1,
        duration=10,
        is_active=True,
        pin="5555",
        proctoring_mode="face_entry",
    )
    question = Question(
        text="Savol", option_a="a", option_b="b", option_c="c", option_d="d",
        correct_option="a", subject_id=subject.id,
    )
    async_db.add_all([quiz, question])
    await async_db.commit()
    async_db.add(QuizQuestion(quiz_id=quiz.id, question_id=question.id))
    await async_db.commit()
    return quiz.id


def _fake_service(monkeypatch, result: dict):
    calls = []

    async def fake_verify(image_base64: str, reference_url: str) -> dict:
        calls.append(reference_url)
        return result

    monkeypatch.setattr(process_repository, "verify_face", fake_verify)
    return calls


@pytest.mark.asyncio
async def test_start_requires_face_verification(student_client, face_entry_quiz):  # noqa: F811
    client = student_client["client"]

    response = await client.post("/quiz_process/start_quiz", json={"quiz_id": face_entry_quiz, "pin": "5555"})

    assert response.status_code == 403, response.text
    assert response.json()["detail"]["code"] == "face_verification_required"


@pytest.mark.asyncio
async def test_matching_face_lets_student_in_once(student_client, face_entry_quiz, monkeypatch):  # noqa: F811
    client = student_client["client"]
    calls = _fake_service(monkeypatch, {"face_count": 1, "is_match": True, "reference_ready": True})

    verified = await client.post(
        "/quiz_process/verify_entry_face",
        json={"quiz_id": face_entry_quiz, "pin": "5555", "image_base64": "data:image/jpeg;base64,AAAA"},
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["verified"] is True
    # Etalon — HEMIS surati, talaba o'zi yuklagan avatar emas.
    assert calls == ["students/lv.jpg"]

    started = await client.post("/quiz_process/start_quiz", json={"quiz_id": face_entry_quiz, "pin": "5555"})
    assert started.status_code == 200, started.text
    body = started.json()
    assert body["proctoring_mode"] == "face_entry"
    # Test davomida kamera kerak emas.
    assert body["face_ws_token"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("service_result", "expected"),
    [
        ({"face_count": 1, "is_match": False, "reference_ready": True}, "different_person"),
        ({"face_count": 0, "is_match": False, "reference_ready": False}, "no_face"),
        ({"face_count": 2, "is_match": False, "reference_ready": False}, "multiple_faces"),
    ],
)
async def test_rejected_face_does_not_open_quiz(
    student_client, face_entry_quiz, monkeypatch, service_result, expected  # noqa: F811
):
    client = student_client["client"]
    _fake_service(monkeypatch, service_result)

    verified = await client.post(
        "/quiz_process/verify_entry_face",
        json={"quiz_id": face_entry_quiz, "pin": "5555", "image_base64": "AAAA"},
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["verified"] is False
    assert verified.json()["status"] == expected

    started = await client.post("/quiz_process/start_quiz", json={"quiz_id": face_entry_quiz, "pin": "5555"})
    assert started.status_code == 403, started.text


@pytest.mark.asyncio
async def test_verification_checks_pin_first(student_client, face_entry_quiz, monkeypatch):  # noqa: F811
    client = student_client["client"]
    calls = _fake_service(monkeypatch, {"face_count": 1, "is_match": True, "reference_ready": True})

    response = await client.post(
        "/quiz_process/verify_entry_face",
        json={"quiz_id": face_entry_quiz, "pin": "0000", "image_base64": "AAAA"},
    )

    assert response.status_code == 403, response.text
    assert response.json()["detail"]["code"] == "invalid_pin"
    assert calls == []


@pytest.mark.asyncio
async def test_every_entry_needs_face_including_resume(
    student_client, face_entry_quiz, monkeypatch, async_db  # noqa: F811
):
    """Tasdiq bir martalik: urinishga qaytishda ham yuz qayta so'raladi."""
    client = student_client["client"]
    _fake_service(monkeypatch, {"face_count": 1, "is_match": True, "reference_ready": True})
    verify = {"quiz_id": face_entry_quiz, "pin": "5555", "image_base64": "AAAA"}
    start = {"quiz_id": face_entry_quiz, "pin": "5555"}

    assert (await client.post("/quiz_process/verify_entry_face", json=verify)).status_code == 200
    first = await client.post("/quiz_process/start_quiz", json=start)
    assert first.status_code == 200, first.text
    assert first.json()["resumed"] is False

    # Sahifa yangilandi — yuzsiz qaytib bo'lmaydi.
    again = await client.post("/quiz_process/start_quiz", json=start)
    assert again.status_code == 403, again.text
    assert again.json()["detail"]["code"] == "face_verification_required"

    # Test yopilgan bo'lsa ham, boshlagan talaba yuzini ko'rsatib qaytadi.
    quiz = await async_db.get(Quiz, face_entry_quiz)
    quiz.is_active = False
    await async_db.commit()
    reverified = await client.post("/quiz_process/verify_entry_face", json=verify)
    assert reverified.status_code == 200, reverified.text
    assert reverified.json()["verified"] is True
    resumed = await client.post("/quiz_process/start_quiz", json=start)
    assert resumed.status_code == 200, resumed.text
    assert resumed.json()["resumed"] is True
    assert resumed.json()["result_id"] == first.json()["result_id"]
