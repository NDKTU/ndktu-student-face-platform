"""Savollar banki va Excel'dan yuklash."""

from __future__ import annotations



from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.audit import service as audit_service
from app.modules.audit.model import AuditEvent
from app.modules.auth.model import User
from app.modules.quiz.question.excel_format import parse_correct_option, read_question_sheet

from .model import (
    GeneralTestAttempt,
    GeneralTestQuestion,
)
from .schemas import (
    GeneralTestQuestionCreateRequest,
    GeneralTestQuestionUpdateRequest,
    SubjectQuestionListResponse,
    UploadResponse,
)
from app.core.errors import Invalid
from .common import IN_PROGRESS, _is_expired, _LOCKED_WHILE_TAKEN, _question_snapshot
from .errors import _not_found, _question_in_use, _question_locked


class QuestionsMixin:
    # ── Вопросы ──────────────────────────────────────────────────────────────

    async def _next_order(self, session: AsyncSession, subject_id: int) -> int:
        current = (
            await session.execute(
                select(func.max(GeneralTestQuestion.order)).where(GeneralTestQuestion.subject_id == subject_id)
            )
        ).scalar_one_or_none()
        return (current or 0) + 1

    async def list_subject_questions(
        self, session: AsyncSession, subject_id: int, user: User
    ) -> SubjectQuestionListResponse:
        await self._get_subject(session, subject_id, user, member=True, view=True)
        questions = (
            (
                await session.execute(
                    select(GeneralTestQuestion)
                    .where(GeneralTestQuestion.subject_id == subject_id)
                    .order_by(GeneralTestQuestion.order, GeneralTestQuestion.id)
                )
            )
            .scalars()
            .all()
        )
        return SubjectQuestionListResponse(questions=questions)

    async def create_question(
        self, session: AsyncSession, subject_id: int, data: GeneralTestQuestionCreateRequest, user: User
    ) -> GeneralTestQuestion:
        await self._get_subject(session, subject_id, user, member=True)
        payload = data.model_dump()
        if payload["order"] is None:
            payload["order"] = await self._next_order(session, subject_id)
        question = GeneralTestQuestion(subject_id=subject_id, **payload)
        session.add(question)
        await session.commit()
        await session.refresh(question)
        return question

    async def _get_question(
        self, session: AsyncSession, question_id: int, user: User | None = None
    ) -> GeneralTestQuestion:
        question = await session.get(GeneralTestQuestion, question_id)
        if question is None:
            raise _not_found("Savol")
        if user is not None:
            # Savolning oʻz egasi yoʻq — u bankka (fanga) tegishli, demak
            # huquq fan boʻyicha tekshiriladi.
            await self._get_subject(session, question.subject_id, user)
        return question

    @staticmethod
    async def _attempts_taking(session: AsyncSession, question_id: int) -> int:
        """Shu savol tushgan va hali ketayotgan urinishlar soni.

        Vaqti o'tgan, lekin yopilmagan urinish (`in_progress` qolgan) hisobga
        olinmaydi: aks holda talaba sahifani yopib ketgani uchun savolni hech
        qachon o'chirib bo'lmasdi.
        """
        attempts = (
            await session.execute(
                select(GeneralTestAttempt)
                .options(selectinload(GeneralTestAttempt.test))
                .where(
                    GeneralTestAttempt.status == IN_PROGRESS,
                    GeneralTestAttempt.layout.contains([{"q": question_id}]),
                )
            )
        ).scalars().all()
        return sum(1 for attempt in attempts if not _is_expired(attempt, attempt.test))

    async def update_question(
        self, session: AsyncSession, question_id: int, data: GeneralTestQuestionUpdateRequest, user: User
    ) -> GeneralTestQuestion:
        question = await self._get_question(session, question_id, user)
        changes = {
            field: value
            for field, value in data.model_dump(exclude_unset=True).items()
            if value is not None and getattr(question, field) != value
        }
        if any(field in _LOCKED_WHILE_TAKEN for field in changes):
            taking = await self._attempts_taking(session, question_id)
            if taking:
                raise _question_locked(taking)
        before = {field: getattr(question, field) for field in changes}
        for field, value in changes.items():
            setattr(question, field, value)
        if changes:
            await audit_service.record(
                session,
                event=AuditEvent.GENERAL_TEST_QUESTION_UPDATED,
                user_id=user.id,
                username=user.username,
                object_type="general_test_question",
                object_id=question.id,
                summary=f"Savol #{question.id}: {', '.join(sorted(changes))}",
                meta={
                    "subject_id": question.subject_id,
                    "changes": {
                        field: [str(before[field])[:200], str(value)[:200]] for field, value in changes.items()
                    },
                },
            )
        await session.commit()
        await session.refresh(question)
        return question

    async def delete_question(self, session: AsyncSession, question_id: int, user: User) -> None:
        question = await self._get_question(session, question_id, user)
        # Imtihon paytida o'chirilgan savol talabaning javoblarini saqlatmay
        # qo'yardi (FK xatosi → 500) va allaqachon berilgan javoblari ham
        # kaskad bilan o'chardi. 2026-10-12 da shunday 40 ta urinish buzilgan.
        taking = await self._attempts_taking(session, question_id)
        if taking:
            raise _question_in_use(taking)
        await audit_service.record(
            session,
            event=AuditEvent.GENERAL_TEST_QUESTION_DELETED,
            user_id=user.id,
            username=user.username,
            object_type="general_test_question",
            object_id=question.id,
            summary=f"Savol #{question.id}: {(question.text or '')[:80]}",
            meta=_question_snapshot(question),
        )
        await session.delete(question)
        await session.commit()

    async def upload_questions_excel(
        self, session: AsyncSession, subject_id: int, file: UploadFile, user: User
    ) -> UploadResponse:
        """Вопросы из Excel — формат тот же, что у банка вопросов.

        Колонки ищутся по заголовкам (`quiz/question/excel_format.py`), так что
        шаблон и уже готовые файлы преподавателей подходят без переделки.
        """
        await self._get_subject(session, subject_id, user, member=True)
        try:
            # Sarlavha qatorini o'zi topadi: birinchi qator har doim sarlavha
            # deb olinmaydi (excel_format.read_question_sheet).
            sheet = read_question_sheet(await file.read())
        except Exception:
            raise Invalid("general_test_excel_unreadable", "Excel faylni o'qib bo'lmadi")

        if sheet.width < 5:
            raise Invalid(
                "general_test_excel_columns",
                "Faylda kamida 5 ustun bo'lishi kerak: savol, A, B, C, D variantlar",
            )

        # Заголовки не узнаны — читаем по позиции, как и банк вопросов.
        mapping = sheet.mapping

        def cell(row: list, field: str, position: int) -> str:
            index = mapping.get(field, -1) if mapping is not None else position
            if index < 0 or index >= len(row) or row[index] is None:
                return ""
            return str(row[index]).strip()

        order = await self._next_order(session, subject_id)
        questions: list[GeneralTestQuestion] = []
        warnings: list[str] = list(sheet.notes)
        # Номер строки — настоящий, из Excel: заголовок может стоять не в первой строке.
        for line, row in sheet.rows:
            values = [cell(row, f, i) for i, f in enumerate(("text", "option_a", "option_b", "option_c", "option_d"))]
            if not any(values):
                continue
            if not all(values):
                warnings.append(f"{line}-qator: savol yoki variantlardan biri bo'sh — o'tkazib yuborildi")
                continue

            # To'g'ri javob — A varianti (shablonda alohida ustun yo'q).
            # Ustun faqat eski fayllarda bo'ladi va o'sha yerda hisobga
            # olinadi: aks holda ilgari tayyorlangan fayl qayta
            # yuklanganda barcha javoblar «a» ga ko'chib ketardi.
            correct = parse_correct_option(cell(row, "correct_option", 5)) or "a"

            text_, a, b, c, d = values
            questions.append(
                GeneralTestQuestion(
                    subject_id=subject_id,
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
            raise Invalid("general_test_excel_empty", "Faylda savol topilmadi")

        session.add_all(questions)
        await audit_service.record(
            session,
            event=AuditEvent.GENERAL_TEST_QUESTIONS_UPLOADED,
            user_id=user.id,
            username=user.username,
            object_type="general_test_subject",
            object_id=subject_id,
            summary=f"Excel: {len(questions)} ta savol qo'shildi",
            meta={"subject_id": subject_id, "created": len(questions), "file": (file.filename or "")[:200]},
        )
        await session.commit()
        return UploadResponse(created=len(questions), warnings=warnings)
