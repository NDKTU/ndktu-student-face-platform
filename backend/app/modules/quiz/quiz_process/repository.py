import base64
import logging
import random
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.core.security import create_face_ws_token
from app.modules.auth.model import Student, User
from app.modules.quiz.model import Question, Quiz, QuizQuestion, Result, UserAnswers

from .schemas import (
    EndQuizRequest,
    EndQuizResponse,
    QuestionDTO,
    StartQuizRequest,
    StartQuizResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
    UploadCheatingImageRequest,
    UploadCheatingImageResponse,
)

logger = logging.getLogger(__name__)


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
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")

        if not quiz.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quiz is not active")

        if quiz.pin != data.pin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid PIN")

        # Check if user is a student and restrict access based on group
        stmt_student = select(Student).where(Student.user_id == user.id)
        result_student = await session.execute(stmt_student)
        student = result_student.scalar_one_or_none()

        is_admin = any(role.name.lower() == "admin" for role in user.roles)
        student_image_url = None

        if student:
            # Mandate student image for quiz (Admins take it anyway)
            if not student.image_path and not is_admin:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Sizning suratingiz topilmadi. Profilingizga surat yuklang.",
                )

            # Bug#1 fix: only set image_url when it actually exists (avoid sending "None" string to WebSocket)
            if student.image_path:
                student_image_url = student.image_path

            if quiz.group_id is not None:
                if student.group_id != quiz.group_id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="This quiz is not available for your group",
                    )

        # Prepare questions with shuffled options — only ever serve active questions;
        # a question can be soft-deleted after being linked to this quiz without a
        # replacement version, in which case it must be excluded here.
        quiz_questions = [qq.question for qq in quiz.quiz_questions if qq.question and qq.question.is_active]

        # Bug#7 fix: raise error if quiz has no questions
        if not quiz_questions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bu testda savollar yo'q. Iltimos administratorga murojaat qiling.",
            )

        num_questions = quiz.question_number
        if len(quiz_questions) > num_questions:
            random.shuffle(quiz_questions)
            quiz_questions = quiz_questions[:num_questions]
        else:
            random.shuffle(quiz_questions)

        question_dtos = []
        for q in quiz_questions:
            q_dict = q.to_dict(randomize_options=True)
            opts = q_dict["options"]

            question_dtos.append(
                QuestionDTO(
                    id=q_dict["id"],
                    text=q_dict["text"],
                    option_a=opts[0],
                    option_b=opts[1],
                    option_c=opts[2],
                    option_d=opts[3],
                )
            )

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

        await session.commit()
        await session.refresh(new_result)

        return StartQuizResponse(
            result_id=new_result.id,
            quiz_id=quiz.id,
            title=quiz.title,
            duration=quiz.duration,
            proctoring_mode=quiz.proctoring_mode,
            questions=question_dtos,
            image_url=student_image_url,
            face_ws_token=face_ws_token,
        )

    async def submit_answer(
        self, session: AsyncSession, data: SubmitAnswerRequest, user: User
    ) -> SubmitAnswerResponse:
        result_obj = (
            await session.execute(select(Result).where(Result.id == data.result_id))
        ).scalar_one_or_none()

        if not result_obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

        if result_obj.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This is not your attempt")

        if result_obj.status != "in_progress":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This attempt is already completed")

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
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This question is not part of your attempt",
            )

        question = (
            await session.execute(select(Question).where(Question.id == data.question_id))
        ).scalar_one_or_none()

        is_correct = bool(question) and data.answer == question.get_correct_text()

        reserved.answer = data.answer
        reserved.correct_answer = question.get_correct_text() if question else None
        reserved.is_correct = is_correct

        await session.commit()

        return SubmitAnswerResponse(question_id=data.question_id, is_correct=is_correct)

    async def end_quiz(self, session: AsyncSession, data: EndQuizRequest, user: User) -> EndQuizResponse:
        result_obj = (
            await session.execute(select(Result).where(Result.id == data.result_id))
        ).scalar_one_or_none()

        if not result_obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

        if result_obj.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This is not your attempt")

        if result_obj.quiz_id != data.quiz_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quiz_id does not match this attempt")

        if result_obj.status != "in_progress":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This attempt is already completed")

        # Reserved rows at start_quiz time define the real denominator — anything
        # still unanswered here counts as wrong (student ran out of time / never got to it).
        answers = (
            await session.execute(select(UserAnswers).where(UserAnswers.result_id == data.result_id))
        ).scalars().all()

        total_questions = len(answers)
        correct_count = sum(1 for a in answers if a.is_correct)
        wrong_count = total_questions - correct_count

        percentage = (correct_count / total_questions * 100) if total_questions > 0 else 0

        if percentage >= 86:
            grade = 5
        elif percentage >= 72:
            grade = 4
        elif percentage >= 56:
            grade = 3
        else:
            grade = 2

        result_obj.status = "completed"
        result_obj.finished_at = utcnow_naive()
        result_obj.correct_answers = correct_count
        result_obj.wrong_answers = wrong_count
        result_obj.grade = grade
        result_obj.cheating_detected = data.cheating_detected or False
        result_obj.reason_for_stop = data.reason if data.cheating_detected else None
        result_obj.cheating_image_url = data.cheating_image_url

        try:
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Error finalizing result: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error while finalizing result: {e}",
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
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")

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
