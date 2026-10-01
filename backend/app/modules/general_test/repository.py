from __future__ import annotations

import io
import logging
import random
from datetime import timedelta

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, or_, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.modules.auth.model import Student, Teacher, User
from app.modules.organization_structure.model import Group
from app.modules.quiz.question.excel_format import resolve_columns

from .model import GeneralTest, GeneralTestAnswer, GeneralTestAttempt, GeneralTestQuestion
from .schemas import (
    AnswerRequest,
    AttemptResult,
    AttemptState,
    AvailableTest,
    AvailableTestListResponse,
    GeneralTestCreateRequest,
    GeneralTestDetail,
    GeneralTestListResponse,
    GeneralTestSummary,
    GeneralTestUpdateRequest,
    MyResultListResponse,
    QuestionCreateRequest,
    QuestionUpdateRequest,
    ResultListRequest,
    ResultListResponse,
    ResultRow,
    TakeOption,
    TakeQuestion,
    UploadResponse,
)

logger = logging.getLogger(__name__)

LETTERS = ("a", "b", "c", "d")

#: Запас поверх длительности: последний ответ мог уйти на границе срока и
#: задержаться в сети. То же значение, что у обычного теста (quiz_process/attempt.py).
GRACE_SECONDS = 60

IN_PROGRESS = "in_progress"
COMPLETED = "completed"


def _not_found(what: str = "Test") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} topilmadi")


def _deadline(attempt: GeneralTestAttempt, test: GeneralTest):
    return attempt.started_at + timedelta(minutes=test.duration)


def _remaining_seconds(attempt: GeneralTestAttempt, test: GeneralTest) -> int:
    return max(0, int((_deadline(attempt, test) - utcnow_naive()).total_seconds()))


def _is_expired(attempt: GeneralTestAttempt, test: GeneralTest) -> bool:
    return utcnow_naive() > _deadline(attempt, test) + timedelta(seconds=GRACE_SECONDS)


class GeneralTestRepository:
    # ── Тест ─────────────────────────────────────────────────────────────────

    async def _get_test(self, session: AsyncSession, test_id: int, with_questions: bool = False) -> GeneralTest:
        stmt = select(GeneralTest).where(GeneralTest.id == test_id)
        if with_questions:
            stmt = stmt.options(selectinload(GeneralTest.questions))
        test = (await session.execute(stmt)).scalar_one_or_none()
        if test is None:
            raise _not_found()
        return test

    async def _counts(self, session: AsyncSession, test_ids: list[int]) -> tuple[dict[int, int], dict[int, int]]:
        """Число вопросов и завершённых попыток по каждому тесту."""
        if not test_ids:
            return {}, {}
        questions = dict(
            (
                await session.execute(
                    select(GeneralTestQuestion.test_id, func.count())
                    .where(GeneralTestQuestion.test_id.in_(test_ids))
                    .group_by(GeneralTestQuestion.test_id)
                )
            ).all()
        )
        attempts = dict(
            (
                await session.execute(
                    select(GeneralTestAttempt.test_id, func.count())
                    .where(GeneralTestAttempt.test_id.in_(test_ids), GeneralTestAttempt.status == COMPLETED)
                    .group_by(GeneralTestAttempt.test_id)
                )
            ).all()
        )
        return questions, attempts

    async def _summary(self, session: AsyncSession, test: GeneralTest) -> GeneralTestSummary:
        questions, attempts = await self._counts(session, [test.id])
        return GeneralTestSummary.model_validate(test).model_copy(
            update={"question_count": questions.get(test.id, 0), "attempt_count": attempts.get(test.id, 0)}
        )

    async def list_tests(
        self, session: AsyncSession, page: int, limit: int, search: str | None
    ) -> GeneralTestListResponse:
        stmt = select(GeneralTest)
        if search and search.strip():
            stmt = stmt.where(GeneralTest.title.ilike(f"%{search.strip()}%"))
        total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
        tests = (
            (
                await session.execute(
                    stmt.order_by(GeneralTest.id.desc()).offset((page - 1) * limit).limit(limit)
                )
            )
            .scalars()
            .all()
        )
        questions, attempts = await self._counts(session, [t.id for t in tests])
        return GeneralTestListResponse(
            total=total,
            page=page,
            limit=limit,
            tests=[
                GeneralTestSummary.model_validate(t).model_copy(
                    update={"question_count": questions.get(t.id, 0), "attempt_count": attempts.get(t.id, 0)}
                )
                for t in tests
            ],
        )

    async def get_test(self, session: AsyncSession, test_id: int) -> GeneralTestDetail:
        test = await self._get_test(session, test_id, with_questions=True)
        summary = await self._summary(session, test)
        return GeneralTestDetail(**summary.model_dump(), questions=test.questions)

    async def create_test(
        self, session: AsyncSession, data: GeneralTestCreateRequest, user: User
    ) -> GeneralTestDetail:
        test = GeneralTest(**data.model_dump(), created_by_user_id=user.id)
        session.add(test)
        await session.commit()
        return await self.get_test(session, test.id)

    async def update_test(
        self, session: AsyncSession, test_id: int, data: GeneralTestUpdateRequest
    ) -> GeneralTestDetail:
        test = await self._get_test(session, test_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            if field == "title" and value is None:
                continue
            setattr(test, field, value)
        await session.commit()
        return await self.get_test(session, test_id)

    async def delete_test(self, session: AsyncSession, test_id: int) -> None:
        test = await self._get_test(session, test_id)
        await session.delete(test)
        await session.commit()

    # ── Вопросы ──────────────────────────────────────────────────────────────

    async def _next_order(self, session: AsyncSession, test_id: int) -> int:
        current = (
            await session.execute(
                select(func.max(GeneralTestQuestion.order)).where(GeneralTestQuestion.test_id == test_id)
            )
        ).scalar_one_or_none()
        return (current or 0) + 1

    async def create_question(
        self, session: AsyncSession, test_id: int, data: QuestionCreateRequest
    ) -> GeneralTestQuestion:
        await self._get_test(session, test_id)
        payload = data.model_dump()
        if payload["order"] is None:
            payload["order"] = await self._next_order(session, test_id)
        question = GeneralTestQuestion(test_id=test_id, **payload)
        session.add(question)
        await session.commit()
        await session.refresh(question)
        return question

    async def _get_question(self, session: AsyncSession, question_id: int) -> GeneralTestQuestion:
        question = await session.get(GeneralTestQuestion, question_id)
        if question is None:
            raise _not_found("Savol")
        return question

    async def update_question(
        self, session: AsyncSession, question_id: int, data: QuestionUpdateRequest
    ) -> GeneralTestQuestion:
        question = await self._get_question(session, question_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            if value is not None:
                setattr(question, field, value)
        await session.commit()
        await session.refresh(question)
        return question

    async def delete_question(self, session: AsyncSession, question_id: int) -> None:
        question = await self._get_question(session, question_id)
        await session.delete(question)
        await session.commit()

    async def upload_questions_excel(self, session: AsyncSession, test_id: int, file: UploadFile) -> UploadResponse:
        """Вопросы из Excel — формат тот же, что у банка вопросов.

        Колонки ищутся по заголовкам (`quiz/question/excel_format.py`), так что
        шаблон и уже готовые файлы преподавателей подходят без переделки.
        """
        import pandas as pd

        await self._get_test(session, test_id)
        try:
            df = pd.read_excel(io.BytesIO(await file.read()))
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Excel faylni o'qib bo'lmadi")

        if len(df.columns) < 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Faylda kamida 5 ustun bo'lishi kerak: savol, A, B, C, D variantlar",
            )

        # Заголовки не узнаны — читаем по позиции, как и банк вопросов.
        mapping = resolve_columns(df.columns)

        def cell(row, field: str, position: int) -> str:
            index = mapping.get(field, -1) if mapping is not None else position
            if index < 0 or index >= len(row):
                return ""
            value = row.iloc[index]
            return "" if pd.isna(value) else str(value).strip()

        order = await self._next_order(session, test_id)
        questions: list[GeneralTestQuestion] = []
        warnings: list[str] = []
        for index, row in df.iterrows():
            line = index + 2  # +1 заголовок, +1 нумерация Excel с единицы
            values = [cell(row, f, i) for i, f in enumerate(("text", "option_a", "option_b", "option_c", "option_d"))]
            if not any(values):
                continue
            if not all(values):
                warnings.append(f"{line}-qator: savol yoki variantlardan biri bo'sh — o'tkazib yuborildi")
                continue

            raw_correct = cell(row, "correct_option", 5).lower()
            if raw_correct in LETTERS:
                correct = raw_correct
            else:
                correct = "a"
                warnings.append(f"{line}-qator: to'g'ri javob ko'rsatilmagan yoki noto'g'ri, 'A' qo'yildi")

            text_, a, b, c, d = values
            questions.append(
                GeneralTestQuestion(
                    test_id=test_id,
                    text=text_,
                    option_a=a,
                    option_b=b,
                    option_c=c,
                    option_d=d,
                    correct_option=correct,
                    order=order,
                )
            )
            order += 1

        if not questions:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Faylda savol topilmadi")

        session.add_all(questions)
        await session.commit()
        return UploadResponse(created=len(questions), warnings=warnings)

    # ── Прохождение ──────────────────────────────────────────────────────────

    async def _finalize(self, session: AsyncSession, attempt: GeneralTestAttempt) -> None:
        """Подсчёт по текущим правильным ответам вопросов.

        Сверка идёт здесь, а не только при сохранении ответа: если админ
        исправил ключ, пока попытка шла, засчитается исправленный.
        """
        layout_ids = [item["q"] for item in attempt.layout]
        questions = {
            q.id: q
            for q in (
                await session.execute(select(GeneralTestQuestion).where(GeneralTestQuestion.id.in_(layout_ids)))
            ).scalars()
        }
        answers = (
            (await session.execute(select(GeneralTestAnswer).where(GeneralTestAnswer.attempt_id == attempt.id)))
            .scalars()
            .all()
        )
        correct = 0
        for answer in answers:
            question = questions.get(answer.question_id)
            answer.is_correct = question is not None and answer.selected_option == question.correct_option
            correct += answer.is_correct

        # Вопрос, удалённый из теста во время попытки, в знаменатель не идёт.
        total = len(questions)
        attempt.total_questions = total
        attempt.correct_answers = correct
        attempt.score = round(correct / total * 100) if total else 0
        attempt.status = COMPLETED
        attempt.finished_at = min(utcnow_naive(), _deadline(attempt, attempt.test))

    async def _close_expired(self, session: AsyncSession, user_id: int) -> None:
        """Закрывает попытки, время которых вышло, а «Yakunlash» никто не нажал."""
        attempts = (
            (
                await session.execute(
                    select(GeneralTestAttempt)
                    .options(selectinload(GeneralTestAttempt.test))
                    .where(GeneralTestAttempt.user_id == user_id, GeneralTestAttempt.status == IN_PROGRESS)
                )
            )
            .scalars()
            .all()
        )
        changed = False
        for attempt in attempts:
            if _is_expired(attempt, attempt.test):
                await self._finalize(session, attempt)
                changed = True
        if changed:
            await session.commit()

    async def list_available(self, session: AsyncSession, user: User) -> AvailableTestListResponse:
        await self._close_expired(session, user.id)

        active = select(GeneralTest).where(GeneralTest.is_active.is_(True)).order_by(GeneralTest.id.desc())
        tests = (await session.execute(active)).scalars().all()
        ids = [t.id for t in tests]
        question_counts, _ = await self._counts(session, ids)

        mine = (
            (
                await session.execute(
                    select(GeneralTestAttempt).where(
                        GeneralTestAttempt.user_id == user.id, GeneralTestAttempt.test_id.in_(ids)
                    )
                )
            )
            .scalars()
            .all()
            if ids
            else []
        )

        result = []
        for test in tests:
            own = [a for a in mine if a.test_id == test.id]
            in_progress = next((a.id for a in own if a.status == IN_PROGRESS), None)
            scores = [a.score for a in own if a.status == COMPLETED and a.score is not None]
            result.append(
                AvailableTest(
                    id=test.id,
                    title=test.title,
                    description=test.description,
                    duration=test.duration,
                    attempt_limit=test.attempt_limit,
                    question_count=question_counts.get(test.id, 0),
                    attempts_used=len(own),
                    in_progress_attempt_id=in_progress,
                    best_score=max(scores) if scores else None,
                )
            )
        return AvailableTestListResponse(tests=result)

    async def _state(self, session: AsyncSession, attempt: GeneralTestAttempt) -> AttemptState:
        ids = [item["q"] for item in attempt.layout]
        questions = {
            q.id: q
            for q in (
                await session.execute(select(GeneralTestQuestion).where(GeneralTestQuestion.id.in_(ids)))
            ).scalars()
        }
        selected = dict(
            (
                await session.execute(
                    select(GeneralTestAnswer.question_id, GeneralTestAnswer.selected_option).where(
                        GeneralTestAnswer.attempt_id == attempt.id
                    )
                )
            ).all()
        )
        items = []
        for entry in attempt.layout:
            question = questions.get(entry["q"])
            if question is None:
                continue
            items.append(
                TakeQuestion(
                    id=question.id,
                    text=question.text,
                    options=[TakeOption(key=letter, text=question.option(letter)) for letter in entry["o"]],
                    selected=selected.get(question.id),
                )
            )
        return AttemptState(
            attempt_id=attempt.id,
            test_id=attempt.test_id,
            title=attempt.test.title,
            remaining_seconds=_remaining_seconds(attempt, attempt.test),
            questions=items,
        )

    async def start(self, session: AsyncSession, test_id: int, user: User) -> AttemptState:
        # Двойной клик по «Boshlash» или две вкладки не должны создать две
        # попытки и съесть лимит: старт одного пользователя на один тест
        # выполняется строго по очереди.
        await session.execute(text("SELECT pg_advisory_xact_lock(:a, :b)"), {"a": 7301 + test_id, "b": user.id})

        test = await self._get_test(session, test_id, with_questions=True)
        if not test.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Test faol emas")

        own = (
            (
                await session.execute(
                    select(GeneralTestAttempt)
                    .options(selectinload(GeneralTestAttempt.test))
                    .where(GeneralTestAttempt.test_id == test_id, GeneralTestAttempt.user_id == user.id)
                )
            )
            .scalars()
            .all()
        )

        for attempt in own:
            if attempt.status != IN_PROGRESS:
                continue
            if not _is_expired(attempt, test):
                return await self._state(session, attempt)
            await self._finalize(session, attempt)

        if len(own) >= test.attempt_limit:
            await session.commit()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Urinishlar soni tugagan")

        if not test.questions:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bu testda savollar yo'q")

        layout = []
        for question in random.sample(test.questions, len(test.questions)):
            layout.append({"q": question.id, "o": "".join(random.sample(LETTERS, len(LETTERS)))})

        attempt = GeneralTestAttempt(
            test_id=test.id,
            user_id=user.id,
            status=IN_PROGRESS,
            started_at=utcnow_naive(),
            layout=layout,
            total_questions=len(layout),
        )
        session.add(attempt)
        await session.commit()
        await session.refresh(attempt, ["test"])
        return await self._state(session, attempt)

    async def _own_attempt(self, session: AsyncSession, attempt_id: int, user: User) -> GeneralTestAttempt:
        attempt = (
            await session.execute(
                select(GeneralTestAttempt)
                .options(selectinload(GeneralTestAttempt.test))
                .where(GeneralTestAttempt.id == attempt_id, GeneralTestAttempt.user_id == user.id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if attempt is None:
            raise _not_found("Urinish")
        return attempt

    async def get_state(self, session: AsyncSession, attempt_id: int, user: User) -> AttemptState:
        attempt = await self._own_attempt(session, attempt_id, user)
        if attempt.status != IN_PROGRESS:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Urinish yakunlangan")
        if _is_expired(attempt, attempt.test):
            await self._finalize(session, attempt)
            await session.commit()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vaqt tugagan")
        return await self._state(session, attempt)

    async def answer(self, session: AsyncSession, attempt_id: int, data: AnswerRequest, user: User) -> None:
        attempt = await self._own_attempt(session, attempt_id, user)
        if attempt.status != IN_PROGRESS:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Urinish yakunlangan")
        if _is_expired(attempt, attempt.test):
            await self._finalize(session, attempt)
            await session.commit()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vaqt tugagan")
        if data.question_id not in {item["q"] for item in attempt.layout}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Savol bu urinishga tegishli emas")

        stmt = pg_insert(GeneralTestAnswer).values(
            attempt_id=attempt.id,
            question_id=data.question_id,
            selected_option=data.option,
            created_at=utcnow_naive(),
            updated_at=utcnow_naive(),
        )
        await session.execute(
            stmt.on_conflict_do_update(
                constraint="uq_general_test_answer",
                set_={"selected_option": stmt.excluded.selected_option, "updated_at": stmt.excluded.updated_at},
            )
        )
        await session.commit()

    @staticmethod
    def _result(attempt: GeneralTestAttempt) -> AttemptResult:
        return AttemptResult(
            attempt_id=attempt.id,
            test_id=attempt.test_id,
            title=attempt.test.title,
            total_questions=attempt.total_questions,
            correct_answers=attempt.correct_answers or 0,
            score=attempt.score or 0,
            started_at=attempt.started_at,
            finished_at=attempt.finished_at,
        )

    async def finish(self, session: AsyncSession, attempt_id: int, user: User) -> AttemptResult:
        attempt = await self._own_attempt(session, attempt_id, user)
        # Повторное «Yakunlash» (двойной клик, ретрай сети) просто отдаёт итог.
        if attempt.status == IN_PROGRESS:
            await self._finalize(session, attempt)
            await session.commit()
        return self._result(attempt)

    async def my_results(self, session: AsyncSession, user: User) -> MyResultListResponse:
        await self._close_expired(session, user.id)
        attempts = (
            (
                await session.execute(
                    select(GeneralTestAttempt)
                    .options(selectinload(GeneralTestAttempt.test))
                    .where(GeneralTestAttempt.user_id == user.id, GeneralTestAttempt.status == COMPLETED)
                    .order_by(GeneralTestAttempt.finished_at.desc())
                )
            )
            .scalars()
            .all()
        )
        return MyResultListResponse(results=[self._result(a) for a in attempts])

    # ── Результаты (администратор) ───────────────────────────────────────────

    def _results_stmt(self, request: ResultListRequest):
        # `students.user_id` не уникален (бывают повторные записи из HEMIS):
        # прямой join размножил бы строку результата. Берём одну — последнюю.
        student = (
            select(Student.id, Student.user_id, Student.full_name, Student.group_id)
            .distinct(Student.user_id)
            .where(Student.user_id.is_not(None))
            .order_by(Student.user_id, Student.id.desc())
            .subquery()
        )
        full_name = func.coalesce(student.c.full_name, Teacher.full_name, User.username, "—")
        stmt = (
            select(
                GeneralTestAttempt,
                GeneralTest.title,
                User.username,
                full_name.label("full_name"),
                Group.name.label("group_name"),
                student.c.id.label("student_id"),
                Teacher.id.label("teacher_id"),
            )
            .join(GeneralTest, GeneralTest.id == GeneralTestAttempt.test_id)
            .outerjoin(User, User.id == GeneralTestAttempt.user_id)
            .outerjoin(student, student.c.user_id == User.id)
            .outerjoin(Group, Group.id == student.c.group_id)
            .outerjoin(Teacher, Teacher.user_id == User.id)
            .where(GeneralTestAttempt.status == COMPLETED)
        )
        if request.test_id:
            stmt = stmt.where(GeneralTestAttempt.test_id == request.test_id)
        if request.search and request.search.strip():
            like = f"%{request.search.strip()}%"
            stmt = stmt.where(
                or_(
                    student.c.full_name.ilike(like),
                    Teacher.full_name.ilike(like),
                    User.username.ilike(like),
                    Group.name.ilike(like),
                )
            )
        return stmt

    @staticmethod
    def _row(row) -> ResultRow:
        attempt: GeneralTestAttempt = row[0]
        kind = "student" if row.student_id else "teacher" if row.teacher_id else "boshqa"
        return ResultRow(
            attempt_id=attempt.id,
            test_id=attempt.test_id,
            test_title=row.title,
            user_id=attempt.user_id,
            full_name=row.full_name,
            username=row.username,
            group_name=row.group_name,
            user_kind=kind,
            total_questions=attempt.total_questions,
            correct_answers=attempt.correct_answers or 0,
            score=attempt.score or 0,
            started_at=attempt.started_at,
            finished_at=attempt.finished_at,
        )

    async def list_results(self, session: AsyncSession, request: ResultListRequest) -> ResultListResponse:
        stmt = self._results_stmt(request)
        total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
        rows = (
            await session.execute(
                stmt.order_by(GeneralTestAttempt.finished_at.desc(), GeneralTestAttempt.id.desc())
                .offset((request.page - 1) * request.limit)
                .limit(request.limit)
            )
        ).all()
        return ResultListResponse(
            total=total,
            page=request.page,
            limit=request.limit,
            results=[self._row(r) for r in rows],
        )

    async def export_results(self, session: AsyncSession, request: ResultListRequest) -> bytes:
        from openpyxl import Workbook
        from openpyxl.styles import Font

        from app.core.schemas import TASHKENT_TZ

        rows = (
            await session.execute(
                self._results_stmt(request).order_by(GeneralTest.title, GeneralTestAttempt.score.desc())
            )
        ).all()

        def local(dt):
            if dt is None:
                return ""
            return (dt + TASHKENT_TZ.utcoffset(None)).strftime("%d.%m.%Y %H:%M")

        wb = Workbook()
        sheet = wb.active
        sheet.title = "Natijalar"
        headers = ["№", "Test", "F.I.SH", "Login", "Guruh", "Savollar", "To'g'ri", "Foiz", "Yakunlangan"]
        sheet.append(headers)
        for cell in sheet[1]:
            cell.font = Font(bold=True)
        for number, raw in enumerate(rows, 1):
            r = self._row(raw)
            sheet.append(
                [
                    number,
                    r.test_title,
                    r.full_name,
                    r.username or "",
                    r.group_name or "",
                    r.total_questions,
                    r.correct_answers,
                    r.score,
                    local(raw[0].finished_at),
                ]
            )
        for column, width in zip("ABCDEFGHI", (6, 35, 35, 16, 18, 10, 10, 8, 18)):
            sheet.column_dimensions[column].width = width

        buffer = io.BytesIO()
        wb.save(buffer)
        return buffer.getvalue()

    async def delete_result(self, session: AsyncSession, attempt_id: int) -> None:
        """Удаление попытки возвращает пользователю одну попытку."""
        attempt = await session.get(GeneralTestAttempt, attempt_id)
        if attempt is None:
            raise _not_found("Natija")
        await session.delete(attempt)
        await session.commit()


get_general_test_repository = GeneralTestRepository()
