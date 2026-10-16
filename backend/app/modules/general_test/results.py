"""Natijalar: talabaning o'zi, o'qituvchi ro'yxati, ko'rib chiqish va eksport."""

from __future__ import annotations

import io


from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.auth.data_scope import DataScope, resolve_data_scope
from app.modules.auth.model import Teacher, User
from app.modules.organization_structure.model import Group

from .model import (
    GeneralTest,
    GeneralTestAnswer,
    GeneralTestAttempt,
    GeneralTestQuestion,
    GeneralTestSubject,
)
from .schemas import (
    AttemptReview,
    MyAttemptReview,
    MyReviewQuestion,
    MyResultListResponse,
    ResultListRequest,
    GeneralTestResultListResponse,
    ResultRow,
    ReviewQuestion,
    TakeOption,
)
from openpyxl import Workbook
from openpyxl.styles import Font
from app.core.schemas import TASHKENT_TZ
from .common import IN_PROGRESS, COMPLETED, _is_expired, _latest_student, _user_kind
from .errors import _not_found


class ResultsMixin:
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

    async def my_result(self, session: AsyncSession, attempt_id: int, user: User) -> MyAttemptReview:
        """Talabaning o'z urinishi tahlili: qayerda adashgani, to'g'ri javobsiz.

        Faqat o'z va yakunlangan urinish — ketayotgan testda «to'g'ri/noto'g'ri»
        belgisi javobni tekshirish vositasiga aylanardi. Begona yoki ketayotgan
        urinish 404: borligini ham bildirmaymiz.
        """
        await self._close_expired(session, user.id)
        attempt = (
            await session.execute(
                select(GeneralTestAttempt)
                .options(selectinload(GeneralTestAttempt.test))
                .where(
                    GeneralTestAttempt.id == attempt_id,
                    GeneralTestAttempt.user_id == user.id,
                    GeneralTestAttempt.status == COMPLETED,
                )
            )
        ).scalar_one_or_none()
        if attempt is None:
            raise _not_found("Natija")

        result = self._result(attempt)
        if await self._test_being_taken(session, attempt.test):
            return MyAttemptReview(result=result, locked=True)

        questions = [
            MyReviewQuestion(
                id=question.id,
                text=question.text,
                options=[TakeOption(key=letter, text=question.option(letter)) for letter in entry["o"]],
                selected=answer.selected_option if answer else None,
                is_correct=bool(answer and answer.is_correct),
            )
            for entry, question, answer in await self._review_rows(session, attempt)
        ]
        return MyAttemptReview(result=result, questions=questions)

    @staticmethod
    async def _test_being_taken(session: AsyncSession, test: GeneralTest) -> bool:
        """Testni hozir kimdir yechyaptimi (vaqti o'tmagan `in_progress` urinish)."""
        attempts = (
            await session.execute(
                select(GeneralTestAttempt).where(
                    GeneralTestAttempt.test_id == test.id, GeneralTestAttempt.status == IN_PROGRESS
                )
            )
        ).scalars().all()
        return any(not _is_expired(attempt, test) for attempt in attempts)

    # ── Результаты (администратор) ───────────────────────────────────────────

    def _results_stmt(self, request: ResultListRequest, scope: DataScope | None = None):
        """Natijalar soʻrovi.

        `scope` berilsa va u cheklangan boʻlsa — oʻz testlarining natijalari
        va koʻrish doirasidagi guruhlar talabalariniki (dekan — oʻz
        fakultetiniki). Aks holda oʻqituvchi begona testni yechgan
        odamlarning roʻyxatini koʻrardi.
        """
        student = _latest_student()
        full_name = func.coalesce(student.c.full_name, Teacher.full_name, User.username, "—")
        stmt = (
            select(
                GeneralTestAttempt,
                GeneralTest.title,
                GeneralTestSubject.name.label("subject_name"),
                User.username,
                full_name.label("full_name"),
                Group.name.label("group_name"),
                student.c.id.label("student_id"),
                Teacher.id.label("teacher_id"),
            )
            .join(GeneralTest, GeneralTest.id == GeneralTestAttempt.test_id)
            .join(GeneralTestSubject, GeneralTestSubject.id == GeneralTest.subject_id)
            .outerjoin(User, User.id == GeneralTestAttempt.user_id)
            .outerjoin(student, student.c.user_id == User.id)
            .outerjoin(Group, Group.id == student.c.group_id)
            .outerjoin(Teacher, Teacher.user_id == User.id)
            .where(GeneralTestAttempt.status == COMPLETED)
        )
        if scope is not None and not scope.unrestricted:
            conditions = [GeneralTest.created_by_user_id == scope.user_id]
            if scope.visible_group_ids:
                conditions.append(student.c.group_id.in_(scope.visible_group_ids))
            stmt = stmt.where(or_(*conditions))
        if request.subject_id:
            stmt = stmt.where(GeneralTest.subject_id == request.subject_id)
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
        return ResultRow(
            attempt_id=attempt.id,
            test_id=attempt.test_id,
            test_title=row.title,
            subject_name=row.subject_name,
            user_id=attempt.user_id,
            full_name=row.full_name,
            username=row.username,
            group_name=row.group_name,
            user_kind=_user_kind(row.student_id, row.teacher_id),
            total_questions=attempt.total_questions,
            correct_answers=attempt.correct_answers or 0,
            score=attempt.score or 0,
            started_at=attempt.started_at,
            finished_at=attempt.finished_at,
            stop_reason=attempt.stop_reason,
            cheating_image_url=attempt.cheating_image_url,
        )

    async def list_results(
        self, session: AsyncSession, request: ResultListRequest, user: User
    ) -> GeneralTestResultListResponse:
        await self._close_expired(session)
        scope = await resolve_data_scope(session, user)
        stmt = self._results_stmt(request, scope)
        total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
        rows = (
            await session.execute(
                stmt.order_by(GeneralTestAttempt.finished_at.desc(), GeneralTestAttempt.id.desc())
                .offset((request.page - 1) * request.limit)
                .limit(request.limit)
            )
        ).all()
        return GeneralTestResultListResponse(
            total=total,
            page=request.page,
            limit=request.limit,
            results=[self._row(r) for r in rows],
        )

    async def get_result(self, session: AsyncSession, attempt_id: int, user: User) -> AttemptReview:
        """Bitta urinishning savol-javoblari.

        Ro'yxatdagi so'rovning o'zi ishlatiladi: ko'rish doirasidan tashqaridagi
        urinish 404 beradi — id ni qo'lda terib begona natijani ochib bo'lmaydi.
        """
        stmt = self._results_stmt(ResultListRequest(), await resolve_data_scope(session, user))
        row = (await session.execute(stmt.where(GeneralTestAttempt.id == attempt_id))).first()
        if row is None:
            raise _not_found("Natija")
        attempt: GeneralTestAttempt = row[0]

        items = [
            ReviewQuestion(
                id=question.id,
                text=question.text,
                options=[TakeOption(key=letter, text=question.option(letter)) for letter in "abcd"],
                selected=answer.selected_option if answer else None,
                correct_option=question.correct_option,
                is_correct=bool(answer and answer.is_correct),
            )
            for _, question, answer in await self._review_rows(session, attempt)
        ]
        return AttemptReview(result=self._row(row), questions=items)

    @staticmethod
    async def _review_rows(
        session: AsyncSession, attempt: GeneralTestAttempt
    ) -> list[tuple[dict, GeneralTestQuestion, GeneralTestAnswer | None]]:
        """Urinish savollari `layout` tartibida: (yozuv, savol, javob)."""
        ids = [item["q"] for item in attempt.layout]
        questions = {
            q.id: q
            for q in (
                await session.execute(select(GeneralTestQuestion).where(GeneralTestQuestion.id.in_(ids)))
            ).scalars()
        }
        answers = {
            a.question_id: a
            for a in (
                await session.execute(select(GeneralTestAnswer).where(GeneralTestAnswer.attempt_id == attempt.id))
            ).scalars()
        }
        # Savol bankdan o'chirilgan — ko'rsatadigan matn qolmagan.
        return [
            (entry, questions[entry["q"]], answers.get(entry["q"]))
            for entry in attempt.layout
            if entry["q"] in questions
        ]

    async def export_results(self, session: AsyncSession, request: ResultListRequest, user: User) -> bytes:


        await self._close_expired(session)
        rows = (
            await session.execute(
                self._results_stmt(request, await resolve_data_scope(session, user)).order_by(
                    GeneralTestSubject.name, GeneralTest.title, GeneralTestAttempt.score.desc()
                )
            )
        ).all()

        def local(dt):
            if dt is None:
                return ""
            return (dt + TASHKENT_TZ.utcoffset(None)).strftime("%d.%m.%Y %H:%M")

        wb = Workbook()
        sheet = wb.active
        sheet.title = "Natijalar"
        headers = ["№", "Fan", "Test", "F.I.SH", "Login", "Guruh", "Savollar", "To'g'ri", "Foiz", "Yakunlangan", "To'xtatilgan"]
        sheet.append(headers)
        for cell in sheet[1]:
            cell.font = Font(bold=True)
        for number, raw in enumerate(rows, 1):
            r = self._row(raw)
            sheet.append(
                [
                    number,
                    r.subject_name,
                    r.test_title,
                    r.full_name,
                    r.username or "",
                    r.group_name or "",
                    r.total_questions,
                    r.correct_answers,
                    r.score,
                    local(raw[0].finished_at),
                    r.stop_reason or "",
                ]
            )
        for column, width in zip("ABCDEFGHIJK", (6, 25, 35, 35, 16, 18, 10, 10, 8, 18, 22)):
            sheet.column_dimensions[column].width = width

        buffer = io.BytesIO()
        wb.save(buffer)
        return buffer.getvalue()

    async def delete_result(self, session: AsyncSession, attempt_id: int, user: User) -> None:
        """Удаление попытки возвращает пользователю одну попытку.

        Oʻz testining natijasigina oʻchiriladi. `delete:general_test_result`
        ruxsati qoʻlda ham berilishi mumkin (serverda oʻqituvchida u
        allaqachon bor edi), shuning uchun cheklov ruxsatga emas, egalikka
        tayanadi: aks holda begona testning urinishini oʻchirib boʻlardi va
        uni qaytarib boʻlmasdi.
        """
        attempt = await session.get(GeneralTestAttempt, attempt_id)
        if attempt is None:
            raise _not_found("Natija")
        await self._get_test(session, attempt.test_id, user)
        await session.delete(attempt)
        await session.commit()
