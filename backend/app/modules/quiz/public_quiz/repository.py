"""Ochiq test: tizimda hisobi yo'q odam PIN orqali yechadi.

Oddiy testdan farqi ikkitada: ishtirokchi tizimga kirmaydi (urinishda
`user_id` bo'sh, ism `guest_name` da) va proktoring yo'q — begona odamdan
kamera talab qilib bo'lmaydi.

Baholash, savol tanlash va variantlarni aralashtirish oddiy test bilan bir
xil kodni ishlatadi: ikkinchi nusxa yozilsa, ular vaqt o'tib bir-biridan
uzoqlashardi.
"""

import logging
import random

import jwt
from core.security import create_guest_quiz_token, decode_guest_quiz_token
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import QuizType
from app.modules.quiz.model import Question, Quiz, QuizQuestion, Result, UserAnswers
from app.modules.quiz.quiz_process.attempt import is_expired, remaining_seconds
from app.modules.quiz.quiz_process.question_view import grade_answer, question_options, to_dto
from app.modules.quiz.quiz_process.repository import get_quiz_process_repository
from app.modules.quiz.quiz_process.schemas import QuestionDTO

from .schemas import (
    PublicAnswerRequest,
    PublicAnswerResponse,
    PublicFinishResponse,
    PublicStartRequest,
    PublicStartResponse,
)

logger = logging.getLogger(__name__)

# Token urinishdan biroz uzoqroq yashaydi: vaqt tugagach ham yakunlash
# so'rovi o'tishi kerak.
_TOKEN_EXTRA_MINUTES = 10


class PublicQuizRepository:
    async def _quiz_by_pin(self, session: AsyncSession, pin: str) -> Quiz:
        """PIN bo'yicha faol ochiq testni topadi.

        Faqat `PUBLIC_FREE`: aks holda tashqi odam PIN topib, guruh testiga
        kirib qolishi mumkin edi.
        """
        quiz = (
            (
                await session.execute(
                    select(Quiz)
                    .options(selectinload(Quiz.quiz_questions).selectinload(QuizQuestion.question))
                    .where(
                        Quiz.pin == pin,
                        Quiz.quiz_type == QuizType.PUBLIC_FREE.value,
                        Quiz.is_active.is_(True),
                    )
                    .order_by(Quiz.id.desc())
                )
            )
            .scalars()
            .first()
        )
        if quiz is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bunday PIN bilan faol ochiq test topilmadi",
            )
        return quiz

    async def start(self, session: AsyncSession, data: PublicStartRequest) -> PublicStartResponse:
        quiz = await self._quiz_by_pin(session, data.pin)

        questions = [qq.question for qq in quiz.quiz_questions if qq.question and qq.question.is_active]
        if not questions:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bu testda savollar yo'q")

        random.shuffle(questions)
        questions = questions[: quiz.question_number]

        attempt = Result(
            user_id=None,
            guest_name=data.full_name,
            quiz_id=quiz.id,
            subject_id=quiz.subject_id,
            group_id=quiz.group_id,
            status="in_progress",
        )
        session.add(attempt)
        await session.flush()

        for question in questions:
            session.add(
                UserAnswers(
                    user_id=None,
                    quiz_id=quiz.id,
                    question_id=question.id,
                    result_id=attempt.id,
                    answer=None,
                    is_correct=False,
                )
            )

        await session.commit()
        await session.refresh(attempt)

        return PublicStartResponse(
            guest_token=create_guest_quiz_token(
                result_id=attempt.id,
                quiz_id=quiz.id,
                ttl_minutes=quiz.duration + _TOKEN_EXTRA_MINUTES,
            ),
            result_id=attempt.id,
            quiz_id=quiz.id,
            title=quiz.title,
            duration=quiz.duration,
            remaining_seconds=remaining_seconds(attempt, quiz),
            questions=[to_dto(attempt.id, question) for question in questions],
        )

    async def _attempt_from_token(self, session: AsyncSession, token: str) -> tuple[Result, Quiz]:
        try:
            payload = decode_guest_quiz_token(token)
        except jwt.PyJWTError as cause:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Sessiya tugadi yoki yaroqsiz",
            ) from cause

        attempt = (
            await session.execute(select(Result).where(Result.id == payload.get("result_id")))
        ).scalar_one_or_none()
        if attempt is None or attempt.quiz_id != payload.get("quiz_id"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Urinish topilmadi")
        # Token faqat mehmon urinishiga tegishli: hisobli urinishga tegib
        # bo'lmasligi kerak.
        if attempt.user_id is not None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu urinish sizga tegishli emas")

        quiz = (await session.execute(select(Quiz).where(Quiz.id == attempt.quiz_id))).scalar_one_or_none()
        if quiz is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test topilmadi")
        return attempt, quiz

    async def answer(self, session: AsyncSession, token: str, data: PublicAnswerRequest) -> PublicAnswerResponse:
        attempt, quiz = await self._attempt_from_token(session, token)

        if attempt.status != "in_progress":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Urinish yakunlangan")

        if is_expired(attempt, quiz):
            await get_quiz_process_repository.finalize_attempt(session, attempt, reason="Vaqt tugadi")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Urinish vaqti tugadi")

        reserved = (
            await session.execute(
                select(UserAnswers)
                .options(selectinload(UserAnswers.question))
                .where(UserAnswers.result_id == attempt.id, UserAnswers.question_id == data.question_id)
            )
        ).scalar_one_or_none()
        if reserved is None or reserved.question is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bu savol sizga berilmagan")

        question = reserved.question
        if data.text_answer is not None:
            is_correct, chosen_text, correct_text = grade_answer(
                attempt.id, question, [], text_answer=data.text_answer
            )
        else:
            positions = data.answer_indexes if data.answer_indexes else [data.answer_index]
            option_count = len(question_options(question))
            if not positions or any(position < 0 or position >= option_count for position in positions):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Variant noto'g'ri")
            is_correct, chosen_text, correct_text = grade_answer(attempt.id, question, positions)
        reserved.answer = chosen_text
        reserved.correct_answer = correct_text
        reserved.is_correct = is_correct
        await session.commit()

        # Javob to'g'ri-noto'g'riligi qaytarilmaydi: ochiq testda uni bilib,
        # variantlarni birma-bir sinab ko'rish mumkin bo'lardi.
        return PublicAnswerResponse(question_id=data.question_id)

    async def finish(self, session: AsyncSession, token: str) -> PublicFinishResponse:
        attempt, quiz = await self._attempt_from_token(session, token)

        if attempt.status != "in_progress":
            # Vaqt tugagach urinish avtomatik yopilgan bo'lishi mumkin —
            # ishtirokchiga baribir natijani ko'rsatamiz.
            total = (attempt.correct_answers or 0) + (attempt.wrong_answers or 0)
            return PublicFinishResponse(
                total_questions=total,
                correct_answers=attempt.correct_answers or 0,
                wrong_answers=attempt.wrong_answers or 0,
                grade=attempt.grade or 0,
                full_name=attempt.guest_name,
                title=quiz.title,
            )

        total, correct, wrong, grade = await get_quiz_process_repository.finalize_attempt(session, attempt)
        return PublicFinishResponse(
            total_questions=total,
            correct_answers=correct,
            wrong_answers=wrong,
            grade=grade,
            full_name=attempt.guest_name,
            title=quiz.title,
        )


get_public_quiz_repository = PublicQuizRepository()
