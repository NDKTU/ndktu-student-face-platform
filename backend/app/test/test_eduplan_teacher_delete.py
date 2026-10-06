"""EPMOS: ketgan oʻqituvchi platformadan butunlay oʻchiriladi.

Qoida admin qarori: EPMOS — yagona manba, unda yoʻq xodim bizda ham
qolmasligi kerak. Oʻchirish qaytarib boʻlmaydi, shuning uchun u aniq
bayroq (`apply_deletions`) bilan va ulush chegarasi ostida ishlaydi.

Shu yerda tekshiriladigan narsalar:

* oʻchirish TARTIBI — baʼzi bogʻlar oʻchirishni taqiqlaydi
  (`quiz_questions` → `NO ACTION`, `courses.teacher_id` → `RESTRICT`);
* ommaviy oʻchirishdan himoya — EPMOS yarim javob qaytarsa, uchdan bir
  universitet kurslari bilan birga oʻchib ketmasin;
* login EPMOS dan yangilanishi.
"""

import pytest
import pytest_asyncio
from sqlalchemy import func, select

from app.modules.auth.model import Teacher, User
from app.modules.course.model import Course
from app.modules.integration.eduplan.repository import eduplan_repository
from app.modules.integration.eduplan.schemas import ApplyRequest, EduPlanEntity, Proposal, ProposalAction
from app.modules.integration.eduplan.service import eduplan_sync_service
from app.modules.quiz.model import Question, Quiz, QuizQuestion, Result


@pytest_asyncio.fixture
async def teacher_with_data(async_db, make_subject):
    """EPMOS koʻzgusidagi oʻqituvchi: kursi, savoli, testi va natijasi bilan."""
    subject = await make_subject("Oʻchirish fani")
    user = User(username="epos_leaver", password="x")
    async_db.add(user)
    await async_db.flush()

    teacher = Teacher(
        user_id=user.id,
        first_name="Ism",
        last_name="Familiya",
        third_name="Sharif",
        full_name="Familiya Ism",
        external_id="9001",
        external_source="eduplan",
    )
    course = Course(name="Uning kursi", subject_id=subject.id, teacher_id=user.id)
    question = Question(
        text="Savol", option_a="a", option_b="b", option_c="c", option_d="d",
        correct_option="a", subject_id=subject.id, user_id=user.id,
    )
    quiz = Quiz(
        title="Uning testi", subject_id=subject.id, question_number=1, duration=10,
        is_active=False, pin="5151", proctoring_mode="standard", lecturer_id=user.id,
    )
    async_db.add_all([teacher, course, question, quiz])
    await async_db.commit()
    await async_db.refresh(teacher)
    await async_db.refresh(question)
    await async_db.refresh(quiz)

    # Savol testga olingan: `quiz_questions` oʻchirishni taqiqlaydi.
    async_db.add(QuizQuestion(quiz_id=quiz.id, question_id=question.id))
    async_db.add(
        Result(user_id=user.id, quiz_id=quiz.id, subject_id=subject.id,
               status="completed", grade=5, correct_answers=1, wrong_answers=0)
    )
    await async_db.commit()
    return {"teacher_id": teacher.id, "user_id": user.id, "subject_id": subject.id}


@pytest.mark.asyncio
async def test_delete_removes_teacher_and_everything_attached(async_db, teacher_with_data):
    """Kartochka, foydalanuvchi va unga tegishli hamma narsa ketadi."""
    teacher = await async_db.get(Teacher, teacher_with_data["teacher_id"])

    removed = await eduplan_repository.delete_teacher(async_db, teacher)
    await async_db.commit()

    assert removed == {"courses": 1, "questions": 1, "quizzes": 1, "results": 1, "assignments": 0}
    assert await async_db.get(Teacher, teacher_with_data["teacher_id"]) is None
    assert await async_db.get(User, teacher_with_data["user_id"]) is None
    for model, column in ((Course, Course.teacher_id), (Question, Question.user_id), (Quiz, Quiz.lecturer_id)):
        left = await async_db.scalar(
            select(func.count()).select_from(model).where(column == teacher_with_data["user_id"])
        )
        assert left == 0, model.__name__


@pytest.mark.asyncio
async def test_footprint_counts_before_deleting(async_db, teacher_with_data):
    """Hisobotdagi sonlar: oʻchirish bilan nima ketgani.

    Sanoq oʻchirishdan oldin olinadi — keyin bu qatorlar yoʻq va
    hisobot boʻsh chiqardi.
    """
    teacher = await async_db.get(Teacher, teacher_with_data["teacher_id"])

    counts = await eduplan_repository.teacher_footprint(async_db, teacher)

    assert counts["courses"] == 1
    assert counts["questions"] == 1
    assert counts["quizzes"] == 1
    assert counts["results"] == 1


def _proposals(total: int, missing: int) -> list[Proposal]:
    rows = [
        Proposal(
            entity=EduPlanEntity.teacher,
            action=ProposalAction.unchanged,
            external_id=str(i),
            external_name=f"Oʻqituvchi {i}",
            local_id=i,
        )
        for i in range(total - missing)
    ]
    rows += [
        Proposal(
            entity=EduPlanEntity.teacher,
            action=ProposalAction.deactivate,
            external_id=f"gone-{i}",
            external_name=f"Ketgan {i}",
            local_id=1000 + i,
        )
        for i in range(missing)
    ]
    return rows


def test_mass_deletion_is_blocked_above_threshold():
    """EPMOS yarim javob qaytarsa, progon toʻxtaydi.

    582 dan 263 tasi yoʻqolishi — bu kadrlar emas, nosozlik koʻrinishi.
    """
    from fastapi import HTTPException

    request = ApplyRequest(run_id="x", apply_deletions=True)

    with pytest.raises(HTTPException) as exc:
        eduplan_sync_service._guard_mass_deletion(_proposals(total=582, missing=263), request)

    assert exc.value.status_code == 409
    assert "263" in str(exc.value.detail)


def test_small_share_is_allowed():
    """Odatiy kadrlar oqimi (bir-ikki foiz) toʻsilmaydi."""
    request = ApplyRequest(run_id="x", apply_deletions=True)
    eduplan_sync_service._guard_mass_deletion(_proposals(total=582, missing=20), request)


def test_threshold_can_be_overridden_explicitly():
    """Admin ataylab tasdiqlasa — oʻchiriladi."""
    request = ApplyRequest(run_id="x", apply_deletions=True, allow_bulk_delete=True)
    eduplan_sync_service._guard_mass_deletion(_proposals(total=582, missing=263), request)


@pytest.mark.asyncio
async def test_username_is_updated_from_epmos(async_db, teacher_with_data):
    """EPMOS da login almashsa, bizda ham almashadi."""
    teacher = await async_db.get(Teacher, teacher_with_data["teacher_id"])

    await eduplan_repository.upsert_teacher(
        async_db,
        external_id="9001",
        username="yangi_login",
        hemis_id=None,
        first_name="Ism",
        last_name="Familiya",
        third_name="Sharif",
        full_name="Familiya Ism",
        kafedra_id=None,
        existing=teacher,
    )
    await async_db.commit()

    user = await async_db.get(User, teacher_with_data["user_id"])
    await async_db.refresh(user)
    assert user.username == "yangi_login"


@pytest.mark.asyncio
async def test_taken_username_is_not_stolen(async_db, teacher_with_data):
    """Band login tortib olinmaydi — begona hisob buzilmasin."""
    other = User(username="band_login", password="x")
    async_db.add(other)
    await async_db.commit()

    teacher = await async_db.get(Teacher, teacher_with_data["teacher_id"])
    await eduplan_repository.upsert_teacher(
        async_db,
        external_id="9001",
        username="band_login",
        hemis_id=None,
        first_name="Ism",
        last_name="Familiya",
        third_name="Sharif",
        full_name="Familiya Ism",
        kafedra_id=None,
        existing=teacher,
    )
    await async_db.commit()

    user = await async_db.get(User, teacher_with_data["user_id"])
    await async_db.refresh(user)
    assert user.username == "epos_leaver", "begona login tortib olinmasligi kerak"


class _EmptyEpmos:
    """EPMOS hech kimni qaytarmadi — eng xavfli holat.

    Aynan shunday koʻrinadi uzilish: javob 200, roʻyxat boʻsh. Bu holda
    MAHALLIY hamma oʻqituvchi «ishdan ketgan» deb tushuniladi.
    """

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return None

    def __getattr__(self, name: str):
        if name.startswith("_"):
            raise AttributeError(name)

        async def reader():
            return []

        return reader


@pytest_asyncio.fixture
async def empty_epmos(monkeypatch):
    monkeypatch.setattr(
        "app.modules.integration.eduplan.service.EduPlanClient", lambda _cfg: _EmptyEpmos()
    )

    async def fake_config(_session):
        class Cfg:
            is_configured = True

        return Cfg()

    monkeypatch.setattr(
        "app.modules.integration.eduplan.service.effective_config", fake_config
    )


@pytest.mark.asyncio
async def test_empty_epmos_response_deletes_nobody(async_db, empty_epmos, teacher_with_data):
    """Boʻsh javob butun oʻqituvchilar bazasini olib ketmaydi.

    Chegara shu yerda ishlaydi: 100% yoʻqolgan — progon 409 bilan
    toʻxtaydi va hech narsa yozilmaydi.
    """
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        await eduplan_sync_service.sync_entity(
            async_db, EduPlanEntity.teacher, apply_deletions=True
        )

    assert exc.value.status_code == 409
    assert await async_db.get(Teacher, teacher_with_data["teacher_id"]) is not None


@pytest.mark.asyncio
async def test_explicit_confirmation_deletes_and_reports_cost(
    async_db, empty_epmos, teacher_with_data
):
    """Admin tasdiqlagandan keyin — oʻchiriladi va narxi hisobotda koʻrinadi."""
    _, applied = await eduplan_sync_service.sync_entity(
        async_db,
        EduPlanEntity.teacher,
        apply_deletions=True,
        allow_bulk_delete=True,
    )

    result = next(r for r in applied.results if r.entity == EduPlanEntity.teacher)
    assert result.deleted == 1
    assert result.deleted_related["courses"] == 1
    assert result.deleted_related["quizzes"] == 1
    assert await async_db.get(Teacher, teacher_with_data["teacher_id"]) is None
    assert await async_db.get(User, teacher_with_data["user_id"]) is None


@pytest.mark.asyncio
async def test_without_the_flag_nothing_is_deleted(async_db, empty_epmos, teacher_with_data):
    """Standart holat oʻzgarmadi: bayrogʻsiz oʻchirish yoʻq.

    Bu kafolat muhim — tungi avtomatik progon ham shu yoʻldan oʻtadi.
    """
    _, applied = await eduplan_sync_service.sync_entity(async_db, EduPlanEntity.teacher)

    result = next(r for r in applied.results if r.entity == EduPlanEntity.teacher)
    assert result.deleted == 0
    assert await async_db.get(Teacher, teacher_with_data["teacher_id"]) is not None
