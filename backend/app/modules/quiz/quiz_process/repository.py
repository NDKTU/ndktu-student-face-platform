import base64
import logging
import random
from datetime import datetime

import httpx
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.core.redis_client import redis_client
from app.core.security import create_face_ws_token
from app.core.utils.face_service import FACE_ENTRY_MESSAGES, FACE_ENTRY_TTL_SECONDS, classify, verify_face
from app.core.utils.lesson_scope import covers_group
from app.modules.auth.model import Student, User
from app.modules.course.model import CourseGroup, Lesson
from app.modules.quiz.model import Question, Quiz, QuizQuestion, Result, UserAnswers

from . import errors, strict
from .attempt import grade_for, is_expired, remaining_seconds
from .question_view import grade_answer, question_options, to_dto
from .schemas import (
    EndQuizRequest,
    EndQuizResponse,
    HeartbeatRequest,
    HeartbeatResponse,
    LeaveQuizRequest,
    QuestionDTO,
    StartQuizRequest,
    StartQuizResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
    SubmittedAnswerDTO,
    UploadCheatingImageRequest,
    UploadCheatingImageResponse,
    VerifyEntryFaceRequest,
    VerifyEntryFaceResponse,
)

logger = logging.getLogger(__name__)

def face_entry_key(user_id: int, quiz_id: int) -> str:
    return f"quiz:face-entry:{user_id}:{quiz_id}"


class QuizProcessRepository:
    async def start_quiz(self, session: AsyncSession, data: StartQuizRequest, user: User) -> StartQuizResponse:
        # Fetch quiz with questions
        stmt = (
            select(Quiz)
            .options(selectinload(Quiz.quiz_questions).selectinload(QuizQuestion.question))
            .where(Quiz.id == data.quiz_id)
        )
        result = await session.execute(stmt)
        quiz = result.scalar_one_or_none()

        if not quiz:
            raise errors.quiz_not_found()

        # Возвращение в уже начатую попытку проверяется ДО is_active и PIN.
        # Ответственный закрывает вход, как только все зашли; студент, у которого
        # после этого упал браузер, иначе не смог бы вернуться в собственный тест.
        # Он уже внутри — повторно пускать его не нужно.
        existing = (
            (
                await session.execute(
                    select(Result)
                    .where(
                        Result.user_id == user.id,
                        Result.quiz_id == quiz.id,
                        Result.status == "in_progress",
                    )
                    .order_by(Result.created_at.desc())
                )
            )
            .scalars()
            .first()
        )

        if existing:
            if is_expired(existing, quiz):
                # Время вышло, пока студента не было. Закрываем по тем ответам,
                # что успели дойти, — иначе попытка висела бы «в процессе» вечно,
                # а студент остался бы заперт в ней.
                await self._finalize_attempt(session, existing, reason="Vaqt tugadi")
                raise errors.attempt_expired(ask_teacher=True)

            # Qat'iy testda qaytish — sahifa yopilgan yoki yangilangan degani.
            # `leave` yetib bormagan bo'lsa ham (aviarejim, uzilish), urinish
            # shu yerda yopiladi.
            if quiz.strict_mode and not await self._strict_resume_allowed(session, existing):
                await self._close_left(session, existing, "resume")

            # Kirishda yuz tekshiruvi har bir kirishda — urinishga qaytishda
            # ham. Aks holda talaba bir marta tasdiqlanib, sahifani yangilagach
            # o'rniga boshqasi o'tirib davom ettirishi mumkin bo'lardi.
            entry_key = await self._require_entry_face(session, quiz, user)
            response = await self._resume_attempt(session, existing, quiz, user)
            if entry_key is not None:
                await redis_client.delete(entry_key)
            return response

        student = await self._admit(session, quiz, data.pin, user)
        # Bug#1 fix: only set image_url when it actually exists (avoid sending "None" string to WebSocket)
        student_image_url = student.image_path if student and student.image_path else None

        entry_key = await self._require_entry_face(session, quiz, user)

        # Prepare questions with shuffled options — only ever serve active questions;
        # a question can be soft-deleted after being linked to this quiz without a
        # replacement version, in which case it must be excluded here.
        quiz_questions = [qq.question for qq in quiz.quiz_questions if qq.question and qq.question.is_active]

        # Bug#7 fix: raise error if quiz has no questions
        if not quiz_questions:
            raise errors.quiz_has_no_questions()

        num_questions = quiz.question_number
        if len(quiz_questions) > num_questions:
            random.shuffle(quiz_questions)
            quiz_questions = quiz_questions[:num_questions]
        else:
            random.shuffle(quiz_questions)

        face_ws_token = None
        if quiz.proctoring_mode == "face":
            face_ws_token = create_face_ws_token(
                user_id=user.id,
                quiz_id=quiz.id,
                ttl_minutes=quiz.duration + 5,
            )

        # Create the attempt now — this is the server-side "session state" that
        # start_quiz previously never wrote. Reserving one UserAnswers row per
        # served question fixes the exact question set a submit_answer call is
        # allowed to touch, and lets end_quiz grade against the real served count
        # instead of whatever the client claims to have answered.
        #
        # Попытка создаётся до сборки вопросов: расстановка вариантов выводится
        # из result_id, поэтому он нужен раньше, чем формируются DTO.
        new_result = Result(
            user_id=user.id,
            quiz_id=quiz.id,
            subject_id=quiz.subject_id,
            group_id=quiz.group_id,
            status="in_progress",
        )
        session.add(new_result)
        await session.flush()

        for q in quiz_questions:
            session.add(
                UserAnswers(
                    user_id=user.id,
                    quiz_id=quiz.id,
                    question_id=q.id,
                    result_id=new_result.id,
                    answer=None,
                    is_correct=False,
                )
            )

        # Перемешиваются буквы колонок, а не тексты: так порядок остаётся
        # восстановимым в submit_answer, и правильность проверяется по позиции,
        # а не сравнением строк.
        question_dtos = [to_dto(new_result.id, q) for q in quiz_questions]

        await session.commit()
        await session.refresh(new_result)
        # Tasdiq bir martalik: keyingi urinishga yana yuz ko'rsatiladi.
        if entry_key is not None:
            await redis_client.delete(entry_key)
        if quiz.strict_mode:
            await strict.touch(new_result.id)

        return StartQuizResponse(
            result_id=new_result.id,
            quiz_id=quiz.id,
            title=quiz.title,
            duration=quiz.duration,
            proctoring_mode=quiz.proctoring_mode,
            questions=question_dtos,
            image_url=student_image_url,
            face_ws_token=face_ws_token,
            remaining_seconds=remaining_seconds(new_result, quiz),
            resumed=False,
            strict_mode=quiz.strict_mode,
            hold_to_reveal=quiz.hold_to_reveal,
        )

    async def _require_entry_face(self, session: AsyncSession, quiz: Quiz, user: User) -> str | None:
        """`face_entry` testida yuz tasdig'ini talab qiladi; tasdiq kalitini qaytaradi.

        Tasdiq `verify_entry_face` da, serverda qo'yiladi. Brauzerga
        ishonilmaydi — aks holda rejimni manzil yoki JS orqali o'chirib qo'yish
        mumkin bo'lardi. Kalit kirish muvaffaqiyatli bo'lgach o'chiriladi:
        keyingi har bir kirish (yangi urinish ham, qaytish ham) yangi yuz
        talab qiladi. Suratsiz foydalanuvchi (admin testni ko'rib chiqyapti)
        tekshirilmaydi: solishtiradigan etalon yo'q. Suratsiz talaba bu
        yerga yetmaydi — `_admit` uni to'xtatadi.
        """
        if quiz.proctoring_mode != "face_entry":
            return None
        student = await self._student(session, user)
        if student is None or not student.image_path:
            return None
        key = face_entry_key(user.id, quiz.id)
        if not await redis_client.exists(key):
            raise errors.face_verification_required()
        return key

    @staticmethod
    async def _student(session: AsyncSession, user: User) -> Student | None:
        return (await session.execute(select(Student).where(Student.user_id == user.id))).scalar_one_or_none()

    async def _has_open_attempt(self, session: AsyncSession, quiz: Quiz, user: User) -> bool:
        """Talabaning shu testda tugamagan (va muddati o'tmagan) urinishi bormi."""
        existing = (
            (
                await session.execute(
                    select(Result).where(
                        Result.user_id == user.id,
                        Result.quiz_id == quiz.id,
                        Result.status == "in_progress",
                    )
                )
            )
            .scalars()
            .all()
        )
        return any(not is_expired(result, quiz) for result in existing)

    async def verify_entry_face(
        self, session: AsyncSession, data: VerifyEntryFaceRequest, user: User
    ) -> VerifyEntryFaceResponse:
        """`face_entry` testiga kirishdan oldin yuzni profil surati bilan solishtiradi.

        Mos kelsa, Redis'ga qisqa muddatli tasdiq yoziladi va `start_quiz` uni
        talab qiladi. Mos kelmasa, talaba qayta urinadi — urinishlar soni
        cheklanmaydi (faqat so'rov tezligi), chunki yomon yorug'lik yoki
        kamera burchagi talabaning aybi emas.
        """
        quiz = await session.get(Quiz, data.quiz_id)
        if quiz is None:
            raise errors.quiz_not_found()
        if quiz.proctoring_mode != "face_entry":
            raise errors.face_entry_not_required()

        if await self._has_open_attempt(session, quiz, user):
            # Urinishga qaytish: `start_quiz` bu yo'lda faollik va PIN'ni
            # so'ramaydi (test yopilgandan keyin brauzeri yiqilgan talaba
            # qaytishi kerak) — tekshiruv ham so'ramasligi kerak.
            student = await self._student(session, user)
        else:
            student = await self._admit(session, quiz, data.pin, user)
        key = face_entry_key(user.id, quiz.id)
        if student is None or not student.image_path:
            # Talaba emas (admin ko'rib chiqyapti) — solishtiradigan etalon yo'q.
            await redis_client.set(key, "1", ex=FACE_ENTRY_TTL_SECONDS)
            return VerifyEntryFaceResponse(verified=True, status="ok", message=FACE_ENTRY_MESSAGES["ok"])

        try:
            result = await verify_face(data.image_base64, student.image_path)
        except (httpx.HTTPError, ValueError) as cause:
            logger.warning("Face service unavailable for quiz %s entry: %s", quiz.id, cause)
            raise errors.face_service_unavailable() from cause

        check_status = classify(result)
        verified = check_status == "ok"
        if verified:
            await redis_client.set(key, "1", ex=FACE_ENTRY_TTL_SECONDS)
        else:
            logger.info("Face entry rejected: user=%s quiz=%s status=%s", user.id, quiz.id, check_status)
        return VerifyEntryFaceResponse(
            verified=verified, status=check_status, message=FACE_ENTRY_MESSAGES[check_status]
        )

    async def _admit(self, session: AsyncSession, quiz: Quiz, pin: str, user: User) -> Student | None:
        """Yangi urinishga kirish huquqi: test faol, PIN to'g'ri, guruh mos.

        `start_quiz` va kirishdagi yuz tekshiruvi bir xil shartlarni
        tekshiradi — aks holda begona guruh talabasi yuz xizmatini bekorga
        band qilardi. Talaba yozuvini qaytaradi (admin uchun `None`).
        """
        if not quiz.is_active:
            raise errors.quiz_not_active()

        if quiz.pin != pin:
            raise errors.invalid_pin()

        # Check if user is a student and restrict access based on group
        stmt_student = select(Student).where(Student.user_id == user.id)
        result_student = await session.execute(stmt_student)
        student = result_student.scalar_one_or_none()

        is_admin = any(role.name.lower() == "admin" for role in user.roles)

        if student:
            # Mandate student image for quiz (Admins take it anyway)
            if not student.image_path and not is_admin:
                raise errors.student_photo_missing()

            if quiz.group_id is not None:
                if student.group_id != quiz.group_id:
                    raise errors.quiz_not_for_your_group()
            elif quiz.lesson_id is not None:
                # Guruhsiz test darsdan tuzilgan: dars butun kursniki
                # boʻlsa, testda ham guruh boʻlmaydi. Bu «hammaga ochiq»
                # degani emas — u kursning guruhlariga tegishli. Shartsiz
                # qoldirilsa, PIN bilgan istalgan talaba begona kursning
                # testini ishlab, natijasi oʻsha guruh jurnaliga tushardi.
                lesson = await session.get(Lesson, quiz.lesson_id)
                if lesson is not None and not await covers_group(session, lesson, student.group_id):
                    raise errors.quiz_not_for_your_group()
            elif quiz.course_id is not None:
                # Guruhsiz oraliq nazorat — kursning barcha guruhlariniki.
                in_course = await session.scalar(
                    select(CourseGroup.id).where(
                        CourseGroup.course_id == quiz.course_id,
                        CourseGroup.group_id == student.group_id,
                    )
                )
                if in_course is None:
                    raise errors.quiz_not_for_your_group()

        return student

    async def _resume_attempt(
        self, session: AsyncSession, result_obj: Result, quiz: Quiz, user: User
    ) -> StartQuizResponse:
        """Возвращает студента в его же попытку: те вопросы, тот порядок, то время.

        Набор вопросов зафиксирован строками UserAnswers, созданными при старте,
        а расстановка вариантов выводится из (result_id, question_id) — поэтому
        после сбоя студент видит ровно тот бланк, что и до него.
        """
        reserved = (
            (
                await session.execute(
                    select(UserAnswers)
                    .options(selectinload(UserAnswers.question))
                    .where(UserAnswers.result_id == result_obj.id)
                )
            )
            .scalars()
            .all()
        )

        question_dtos: list[QuestionDTO] = []
        submitted: list[SubmittedAnswerDTO] = []

        for row in reserved:
            question = row.question
            if not question:
                continue

            dto = to_dto(result_obj.id, question)
            question_dtos.append(dto)

            if row.answer is not None:
                # Позиции нужны только чтобы подсветить выбранные кнопки. Оценка
                # уже посчитана и лежит в is_correct, так что совпадение текстов
                # у двух вариантов подсветит не ту кнопку, но не изменит результат.
                # Несколько ответов хранятся строкой «a; b» — тем же разделителем,
                # каким их склеил grade_answer.
                if dto.free_text:
                    submitted.append(
                        SubmittedAnswerDTO(question_id=question.id, answer_index=0, text_answer=row.answer)
                    )
                else:
                    separator = " → " if dto.ordered else ";"
                    chosen = (
                        [part.strip() for part in row.answer.split(separator)]
                        if (dto.multiple or dto.ordered)
                        else [row.answer]
                    )
                    positions = [dto.options.index(text) for text in chosen if text in dto.options]
                    if positions:
                        submitted.append(
                            SubmittedAnswerDTO(
                                question_id=question.id,
                                answer_index=positions[0],
                                answer_indexes=positions,
                            )
                        )

        student = (await session.execute(select(Student).where(Student.user_id == user.id))).scalar_one_or_none()

        face_ws_token = None
        if quiz.proctoring_mode == "face":
            face_ws_token = create_face_ws_token(
                user_id=user.id,
                quiz_id=quiz.id,
                # Токена должно хватить ровно на остаток попытки, а не на полный тест.
                ttl_minutes=max(1, remaining_seconds(result_obj, quiz) // 60 + 5),
            )

        return StartQuizResponse(
            result_id=result_obj.id,
            quiz_id=quiz.id,
            title=quiz.title,
            duration=quiz.duration,
            proctoring_mode=quiz.proctoring_mode,
            questions=question_dtos,
            image_url=student.image_path if student else None,
            face_ws_token=face_ws_token,
            remaining_seconds=remaining_seconds(result_obj, quiz),
            resumed=True,
            submitted_answers=submitted,
            strict_mode=quiz.strict_mode,
            hold_to_reveal=quiz.hold_to_reveal,
        )

    async def _strict_resume_allowed(self, session: AsyncSession, result_obj: Result) -> bool:
        """Urinish hozirgina ochilgan va hali javobsiz — `start_quiz` javobi yo'qolgan bo'lishi mumkin."""
        age = (utcnow_naive() - result_obj.created_at).total_seconds()
        if age >= strict.RESUME_WINDOW_SECONDS:
            return False
        answered = await session.scalar(
            select(func.count())
            .select_from(UserAnswers)
            .where(UserAnswers.result_id == result_obj.id, UserAnswers.answer.is_not(None))
        )
        return not answered

    async def _close_left(self, session: AsyncSession, result_obj: Result, reason_key: str | None) -> None:
        """Qat'iy testda urinishni «sahifadan chiqdi» deb yopadi va xato beradi."""
        reason = strict.leave_reason_text(reason_key)
        await self._finalize_attempt(session, result_obj, reason=reason, cheating_detected=True)
        await strict.forget(result_obj.id)
        raise errors.attempt_closed_left_page(reason)

    async def _require_alive(self, session: AsyncSession, result_obj: Result, quiz: Quiz | None) -> None:
        """Qat'iy testda heartbeat to'xtagan bo'lsa — sahifa yopilgan, urinish yopiladi."""
        if quiz is None or not quiz.strict_mode:
            return
        if not await strict.is_alive(result_obj.id):
            await self._close_left(session, result_obj, "heartbeat")

    async def _own_open_attempt(self, session: AsyncSession, result_id: int, user: User) -> tuple[Result, Quiz | None]:
        result_obj = (await session.execute(select(Result).where(Result.id == result_id))).scalar_one_or_none()
        if not result_obj:
            raise errors.attempt_not_found()
        if result_obj.user_id != user.id:
            raise errors.not_your_attempt()
        quiz = (await session.execute(select(Quiz).where(Quiz.id == result_obj.quiz_id))).scalar_one_or_none()
        return result_obj, quiz

    async def leave(self, session: AsyncSession, data: LeaveQuizRequest, user: User) -> EndQuizResponse:
        """Qat'iy testda brauzer sahifadan chiqilganini aytdi — urinish yopiladi.

        Takroriy chaqiruv (`blur` dan keyin `pagehide`) xato bermaydi: urinish
        allaqachon yopiq bo'lsa, saqlangan natija qaytadi.
        """
        result_obj, quiz = await self._own_open_attempt(session, data.result_id, user)

        if result_obj.status != "in_progress":
            correct = result_obj.correct_answers or 0
            wrong = result_obj.wrong_answers or 0
            return EndQuizResponse(
                total_questions=correct + wrong,
                correct_answers=correct,
                wrong_answers=wrong,
                grade=result_obj.grade or 0,
                cheating_detected=result_obj.cheating_detected or False,
                reason=result_obj.reason_for_stop,
            )

        if quiz is None or not quiz.strict_mode:
            raise errors.strict_mode_disabled()

        total, correct, wrong, grade = await self._finalize_attempt(
            session,
            result_obj,
            reason=strict.leave_reason_text(data.reason),
            cheating_detected=True,
        )
        await strict.forget(result_obj.id)
        return EndQuizResponse(
            total_questions=total,
            correct_answers=correct,
            wrong_answers=wrong,
            grade=grade,
            cheating_detected=True,
            reason=result_obj.reason_for_stop,
        )

    async def heartbeat(self, session: AsyncSession, data: HeartbeatRequest, user: User) -> HeartbeatResponse:
        """Sahifa ochiq. Muddati o'tgan heartbeat'ni tiriltirmaydi.

        Telefon fonda JS'ni muzlatadi: talaba boshqa ilovada 30 soniyadan ko'p
        o'tirib qaytsa, birinchi heartbeat kalitni qayta yozib, chiqishni
        yashirib yuborardi. Shuning uchun avval tekshiriladi, keyin yangilanadi.
        """
        result_obj, quiz = await self._own_open_attempt(session, data.result_id, user)
        if result_obj.status != "in_progress":
            raise errors.attempt_already_finished()
        if quiz is None or not quiz.strict_mode:
            return HeartbeatResponse()
        await self._require_alive(session, result_obj, quiz)
        await strict.touch(result_obj.id)
        return HeartbeatResponse()

    async def finalize_attempt(
        self,
        session: AsyncSession,
        result_obj: Result,
        *,
        reason: str | None = None,
        cheating_detected: bool = False,
        cheating_image_url: str | None = None,
    ) -> tuple[int, int, int, int]:
        """Boshqa modullar uchun ochiq nom (ochiq test ham shu bilan yakunlanadi)."""
        return await self._finalize_attempt(
            session,
            result_obj,
            reason=reason,
            cheating_detected=cheating_detected,
            cheating_image_url=cheating_image_url,
        )

    async def _finalize_attempt(
        self,
        session: AsyncSession,
        result_obj: Result,
        *,
        reason: str | None = None,
        cheating_detected: bool = False,
        cheating_image_url: str | None = None,
    ) -> tuple[int, int, int, int]:
        """Закрывает попытку и выставляет оценку. Возвращает (всего, верно, неверно, оценка).

        Одна и та же функция обслуживает и обычное завершение, и автоматическое
        закрытие истёкшей попытки — иначе оценка зависела бы от того, успел ли
        студент нажать «Завершить».
        """
        answers = (
            (await session.execute(select(UserAnswers).where(UserAnswers.result_id == result_obj.id))).scalars().all()
        )

        total_questions = len(answers)
        correct_count = sum(1 for a in answers if a.is_correct)
        wrong_count = total_questions - correct_count
        grade, _ = grade_for(correct_count, total_questions)

        result_obj.status = "completed"
        result_obj.finished_at = utcnow_naive()
        result_obj.correct_answers = correct_count
        result_obj.wrong_answers = wrong_count
        result_obj.grade = grade
        result_obj.cheating_detected = cheating_detected
        result_obj.reason_for_stop = reason
        result_obj.cheating_image_url = cheating_image_url

        try:
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Error finalizing result: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error while finalizing result: {e}",
            )

        return total_questions, correct_count, wrong_count, grade

    async def submit_answer(self, session: AsyncSession, data: SubmitAnswerRequest, user: User) -> SubmitAnswerResponse:
        result_obj = (await session.execute(select(Result).where(Result.id == data.result_id))).scalar_one_or_none()

        if not result_obj:
            raise errors.attempt_not_found()

        if result_obj.user_id != user.id:
            raise errors.not_your_attempt()

        if result_obj.status != "in_progress":
            raise errors.attempt_already_finished()

        # Срок попытки проверяется на сервере: без этого студент мог держать
        # попытку открытой сколько угодно и дописывать ответы после конца теста —
        # статус сам по себе никогда не менялся.
        quiz = (await session.execute(select(Quiz).where(Quiz.id == result_obj.quiz_id))).scalar_one_or_none()

        if quiz and is_expired(result_obj, quiz):
            await self._finalize_attempt(session, result_obj, reason="Vaqt tugadi")
            raise errors.attempt_expired()

        await self._require_alive(session, result_obj, quiz)

        # Only a reserved row (created at start_quiz for a question actually
        # served to this student) may be answered — anything else means the
        # client is submitting for a question that was never shown.
        reserved = (
            await session.execute(
                select(UserAnswers).where(
                    UserAnswers.result_id == data.result_id,
                    UserAnswers.question_id == data.question_id,
                )
            )
        ).scalar_one_or_none()

        if not reserved:
            raise errors.question_not_in_attempt()

        question = (await session.execute(select(Question).where(Question.id == data.question_id))).scalar_one_or_none()

        if not question:
            raise errors.question_not_found()

        # Позиции: у обычного вопроса одна, у вопроса с несколькими
        # правильными — набор. Проверка и тексты — в question_view, чтобы
        # обычный тест и открытый считали одинаково.
        positions = data.answer_indexes if data.answer_indexes else (
            [data.answer_index] if data.answer_index is not None else []
        )

        # Matnli javob: variant yo'q, faqat yozilgan matn.
        if data.text_answer is not None:
            is_correct, chosen_text, correct_text = grade_answer(
                data.result_id, question, [], text_answer=data.text_answer
            )
            reserved.answer = chosen_text
            reserved.correct_answer = correct_text
            reserved.is_correct = is_correct
            await session.commit()
            return SubmitAnswerResponse(question_id=data.question_id)

        if positions:
            option_count = len(question_options(question))
            if any(position < 0 or position >= option_count for position in positions):
                raise errors.invalid_option_index()
            is_correct, chosen_text, correct_text = grade_answer(data.result_id, question, positions)
            reserved.answer = chosen_text
            reserved.correct_answer = correct_text
            reserved.is_correct = is_correct
            await session.commit()
            return SubmitAnswerResponse(question_id=data.question_id)

        # Совместимость на время выкатки: у студента, начавшего тест до неё,
        # в браузере остаётся старый скрипт, который шлёт текст варианта.
        # Обрывать ему ответы посреди экзамена нельзя. Путь удаляется, когда
        # ни одна активная попытка не может быть старше выкатки.
        if data.answer is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either answer_index or answer must be provided",
            )

        is_correct = data.answer == question.get_correct_text()
        reserved.answer = data.answer
        reserved.correct_answer = question.get_correct_text()
        reserved.is_correct = is_correct

        await session.commit()

        return SubmitAnswerResponse(question_id=data.question_id)

    async def end_quiz(self, session: AsyncSession, data: EndQuizRequest, user: User) -> EndQuizResponse:
        result_obj = (await session.execute(select(Result).where(Result.id == data.result_id))).scalar_one_or_none()

        if not result_obj:
            raise errors.attempt_not_found()

        if result_obj.user_id != user.id:
            raise errors.not_your_attempt()

        if result_obj.quiz_id != data.quiz_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quiz_id does not match this attempt")

        if result_obj.status != "in_progress":
            raise errors.attempt_already_finished()

        quiz = (await session.execute(select(Quiz).where(Quiz.id == result_obj.quiz_id))).scalar_one_or_none()
        await self._require_alive(session, result_obj, quiz)

        # Reserved rows at start_quiz time define the real denominator — anything
        # still unanswered here counts as wrong (student ran out of time / never got to it).
        total_questions, correct_count, wrong_count, grade = await self._finalize_attempt(
            session,
            result_obj,
            reason=data.reason if data.cheating_detected else None,
            cheating_detected=data.cheating_detected or False,
            cheating_image_url=data.cheating_image_url,
        )

        return EndQuizResponse(
            total_questions=total_questions,
            correct_answers=correct_count,
            wrong_answers=wrong_count,
            grade=grade,
            cheating_detected=result_obj.cheating_detected or False,
            reason=result_obj.reason_for_stop,
        )

    async def upload_cheating_evidence(
        self, session: AsyncSession, data: UploadCheatingImageRequest, user: User
    ) -> UploadCheatingImageResponse:
        """
        Upload and save cheating evidence image (face detection proof)
        """
        try:
            # Validate quiz exists
            stmt = select(Quiz).where(Quiz.id == data.quiz_id)
            result = await session.execute(stmt)
            quiz = result.scalar_one_or_none()

            if not quiz:
                raise errors.quiz_not_found()

            # Bug#4 fix: use settings.evidence_dir (absolute path mapped to Docker volume)
            # so files survive container restarts. /evidence/ and /uploads/cheating_evidence/
            # are both mounted in main.py.
            from core.config import settings as app_settings

            evidence_dir = app_settings.evidence_dir
            evidence_dir.mkdir(parents=True, exist_ok=True)

            # Generate filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            user_id = user.id if hasattr(user, "id") else data.user_id
            filename = f"quiz_{data.quiz_id}_user_{user_id}_{timestamp}.jpg"
            filepath = evidence_dir / filename

            # Decode and save the base64 image
            # Remove the data URL prefix if present
            image_data = data.image_data
            if "," in image_data:
                image_data = image_data.split(",")[1]

            # Decode base64
            image_bytes = base64.b64decode(image_data)

            # Save to file
            with open(filepath, "wb") as f:
                f.write(image_bytes)

            logger.info(f"Cheating evidence saved: {filepath}")

            # /uploads/cheating_evidence/ is mounted as StaticFiles in main.py — URL is valid
            image_url = f"/uploads/cheating_evidence/{filename}"

            return UploadCheatingImageResponse(
                success=True,
                image_url=image_url,
                message="Cheating evidence saved successfully",
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error saving cheating evidence: {e}", exc_info=True)
            return UploadCheatingImageResponse(success=False, message=f"Failed to save evidence: {str(e)}")


get_quiz_process_repository = QuizProcessRepository()
