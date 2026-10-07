import logging

from fastapi import HTTPException, status
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.enums import ControlType, QuizType
from app.core.utils.course_access import can_manage
from app.core.utils.teacher_scope import assigned_subject_ids
from app.modules.auth.model import Teacher, User
from app.modules.course.model import Course, Lesson
from app.modules.organization_structure.model import Kafedra
from app.modules.file.storage import public_url, store_upload
from app.modules.quiz.model import Question, Quiz, QuizQuestion, Subject, UserAnswers
from app.modules.quiz.quiz.repository import get_quiz_repository

from .excel_format import parse_correct_option, resolve_columns
from .schemas import (
    ControlQuestionCountsResponse,
    LessonQuestionCountsResponse,
    QuestionBulkDeleteRequest,
    QuestionCatalogResponse,
    QuestionCreateRequest,
    QuestionListRequest,
    QuestionListResponse,
    QuestionSubjectSummary,
    QuestionTeacherSummary,
)

logger = logging.getLogger(__name__)


class QuestionRepository:
    @staticmethod
    def _midterm_extra_filter(quiz_id: int):
        """Nazoratga alohida qoʻshilgan savollar — darsdan ham, «Test
        savollari» dan ham kelmaganlari."""
        return and_(
            Question.lesson_id.is_(None),
            Question.control_type.is_(None),
            Question.id.in_(select(QuizQuestion.question_id).where(QuizQuestion.quiz_id == quiz_id)),
        )

    def _visible_questions_filter(self, user: User, subject_ids: list[int]):
        """Oʻqituvchiga koʻrinadigan savollar sharti.

        Oʻz savollari HAM kiradi: biriktirma oʻzgarsa (fan boshqaga oʻtsa)
        oʻqituvchi oʻzi yozgan savollarni yoʻqotib qoʻymasligi kerak.
        """
        own = Question.user_id == user.id
        if not subject_ids:
            return own
        return or_(own, Question.subject_id.in_(subject_ids))

    async def get_catalog(
        self, session: AsyncSession, current_user: User, search: str | None = None
    ) -> QuestionCatalogResponse:
        """Return teacher -> subject counts for the question-bank catalogue."""
        stmt = (
            select(
                Question.user_id.label("teacher_user_id"),
                User.username,
                Teacher.full_name,
                Kafedra.id.label("kafedra_id"),
                Kafedra.name.label("kafedra_name"),
                Subject.id.label("subject_id"),
                Subject.name.label("subject_name"),
                func.count(Question.id).label("question_count"),
            )
            .join(User, User.id == Question.user_id)
            .outerjoin(Teacher, Teacher.user_id == User.id)
            .outerjoin(Kafedra, Kafedra.id == Teacher.kafedra_id)
            .join(Subject, Subject.id == Question.subject_id)
            .where(Question.is_latest.is_(True), Question.is_active.is_(True))
        )
        is_admin = any(role.name.lower() == "admin" for role in current_user.roles)
        if not is_admin:
            subject_ids = await assigned_subject_ids(session, current_user)
            stmt = stmt.where(self._visible_questions_filter(current_user, subject_ids))
        if search:
            pattern = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Teacher.full_name.ilike(pattern),
                    User.username.ilike(pattern),
                    Subject.name.ilike(pattern),
                )
            )
        stmt = stmt.group_by(
            Question.user_id,
            User.username,
            Teacher.full_name,
            Kafedra.id,
            Kafedra.name,
            Subject.id,
            Subject.name,
        ).order_by(Teacher.full_name.asc().nullslast(), User.username.asc(), Subject.name.asc())

        teachers: dict[int, QuestionTeacherSummary] = {}
        for row in (await session.execute(stmt)).all():
            teacher = teachers.get(row.teacher_user_id)
            if teacher is None:
                teacher = QuestionTeacherSummary(
                    teacher_user_id=row.teacher_user_id,
                    username=row.username,
                    full_name=row.full_name,
                    kafedra_id=row.kafedra_id,
                    kafedra_name=row.kafedra_name,
                    question_count=0,
                    subjects=[],
                )
                teachers[row.teacher_user_id] = teacher
            teacher.question_count += row.question_count
            teacher.subjects.append(
                QuestionSubjectSummary(
                    subject_id=row.subject_id,
                    subject_name=row.subject_name,
                    question_count=row.question_count,
                )
            )
        return QuestionCatalogResponse(teachers=list(teachers.values()))

    async def create_question(
        self, session: AsyncSession, data: QuestionCreateRequest, current_user: User
    ) -> Question:
        """Savol yaratadi. Muallif — har doim soʻrov yuborgan foydalanuvchi.

        Ilgari muallif soʻrov tanasidagi ``user_id`` dan olinardi va hech
        tekshirilmasdi: bir oʻqituvchi savolni boshqasining nomidan yozib
        qoʻyishi mumkin edi. Admin uchun esa bu imkoniyat qoladi — u savolni
        kerakli oʻqituvchiga biriktira oladi.
        """
        is_admin = any(role.name.lower() == "admin" for role in current_user.roles)
        author_id = data.user_id if is_admin and data.user_id else current_user.id

        midterm = await self._midterm_for_new_question(session, data, current_user)
        if data.course_id is not None:
            course = await self._course_for_control_questions(session, data.course_id, current_user)
            if course.subject_id != data.subject_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Savol fani kurs faniga mos emas",
                )

        # Oraliq nazoratga yoki kursga qoʻshilayotgan savolni kurs huquqi
        # hal qiladi: assistentga fan biriktirilmagan boʻlishi mumkin.
        if not is_admin and midterm is None and data.course_id is None:
            # Oʻz fanidan tashqariga savol qoʻshib boʻlmaydi. Biriktirmasi
            # umuman yoʻq oʻqituvchini bloklamaymiz — EduPlan sinxronizatsiyasi
            # kechikkan boʻlishi mumkin, bu esa ishlashni butunlay toʻxtatardi.
            subject_ids = await assigned_subject_ids(session, current_user)
            if subject_ids and data.subject_id not in subject_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bu fan sizga biriktirilmagan — unga savol qoʻsholmaysiz",
                )

        new_question = Question(
            subject_id=data.subject_id,
            user_id=author_id,
            lesson_id=None if midterm else data.lesson_id,
            course_id=data.course_id,
            control_type=data.control_type.value if data.control_type else None,
            text=data.text,
            option_a=data.option_a,
            option_b=data.option_b,
            option_c=data.option_c,
            option_d=data.option_d,
            correct_option=data.correct_option,
            question_type=data.question_type.value,
            payload=data.payload,
        )
        session.add(new_question)

        try:
            await session.flush()
            if midterm is not None:
                session.add(QuizQuestion(quiz_id=midterm.id, question_id=new_question.id))
            else:
                await get_quiz_repository.link_question_to_midterms(session, new_question)
            await session.commit()
            await session.refresh(new_question)
        except Exception:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )
        return new_question

    async def _midterm_for_new_question(
        self, session: AsyncSession, data: QuestionCreateRequest, current_user: User
    ) -> Quiz | None:
        """`quiz_id` berilgan bo'lsa — savol qo'shiladigan oraliq nazorat.

        Savol testning fanida bo'lishi shart: aks holda u boshqa fan
        bankida yotib, shu fanning testiga tushib qolardi.
        """
        if data.quiz_id is None:
            return None
        quiz = await session.get(Quiz, data.quiz_id)
        if quiz is None or quiz.quiz_type != QuizType.MIDTERM.value:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Oraliq nazorat topilmadi")
        if quiz.subject_id != data.subject_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Savol fani oraliq nazorat faniga mos emas",
            )
        course = await session.get(Course, quiz.course_id) if quiz.course_id else None
        if course is None or not await can_manage(session, course, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu kurs sizga biriktirilmagan")
        return quiz

    async def _course_for_control_questions(
        self, session: AsyncSession, course_id: int, current_user: User
    ) -> Course:
        """Kursning «Test savollari» bilan ishlash huquqi — kursni boshqaruvchilar."""
        course = await session.get(Course, course_id)
        if course is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kurs topilmadi")
        if not await can_manage(session, course, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu kurs sizga biriktirilmagan")
        return course

    async def control_counts(
        self, session: AsyncSession, course_id: int, current_user: User
    ) -> ControlQuestionCountsResponse:
        """Kurs savollari soni nazorat turlari boʻyicha — tablar yonidagi raqamlar."""
        await self._course_for_control_questions(session, course_id, current_user)
        rows = (
            await session.execute(
                select(Question.control_type, func.count(Question.id))
                .where(
                    Question.course_id == course_id,
                    Question.control_type.is_not(None),
                    Question.is_latest.is_(True),
                    Question.is_active.is_(True),
                )
                .group_by(Question.control_type)
            )
        ).all()
        counts = {kind: 0 for kind in ControlType}
        for kind, count in rows:
            if kind in ControlType._value2member_map_:
                counts[ControlType(kind)] = count
        return ControlQuestionCountsResponse(counts=counts)

    async def lesson_counts(
        self, session: AsyncSession, course_id: int, current_user: User
    ) -> LessonQuestionCountsResponse:
        """Kurs darslaridagi savollar soni — nazorat oynasi faqat savolli
        darslarni koʻrsatadi. Hisob nazoratga tushadigan savollar bilan bir
        xil: faol, oxirgi versiya."""
        await self._course_for_control_questions(session, course_id, current_user)
        rows = (
            await session.execute(
                select(Question.lesson_id, func.count(Question.id))
                .join(Lesson, Lesson.id == Question.lesson_id)
                .where(
                    Lesson.course_id == course_id,
                    Question.is_latest.is_(True),
                    Question.is_active.is_(True),
                )
                .group_by(Question.lesson_id)
            )
        ).all()
        return LessonQuestionCountsResponse(counts=dict(rows))

    async def get_question(self, session: AsyncSession, question_id: int, current_user: User) -> Question:
        stmt = (
            select(Question)
            .options(
                selectinload(Question.subject),
                selectinload(Question.user),
            )
            .where(Question.id == question_id)
        )
        result = await session.execute(stmt)
        question = result.scalar_one_or_none()

        if not question:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

        # Koʻrish — oʻz savoli yoki oʻzi dars beradigan fanning savoli.
        is_admin = any(role.name.lower() == "admin" for role in current_user.roles)
        if not is_admin and question.user_id != current_user.id:
            subject_ids = await assigned_subject_ids(session, current_user)
            if question.subject_id not in subject_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bu savol sizning fanlaringizga tegishli emas",
                )

        return question

    async def list_questions(
        self, session: AsyncSession, request: QuestionListRequest, current_user: User
    ) -> QuestionListResponse:
        stmt = (
            select(Question)
            .options(
                selectinload(Question.subject),
                selectinload(Question.user),
            )
            .where(Question.is_latest.is_(True), Question.is_active.is_(True))
        )

        # Check if user is teacher (not admin)
        is_teacher = any(role.name.lower() == "teacher" for role in current_user.roles)
        is_admin = any(role.name.lower() == "admin" for role in current_user.roles)

        subject_ids: list[int] = []
        # Kurs savollarini kurs huquqi hal qiladi: assistent asosiy
        # oʻqituvchi yozgan savollarni ham koʻrishi kerak, fan esa unga
        # biriktirilmagan boʻlishi mumkin.
        course_scoped = False
        if request.course_id:
            await self._course_for_control_questions(session, request.course_id, current_user)
            course_scoped = True
        if not is_admin and is_teacher and not course_scoped:
            # Oʻqituvchi biriktirilgan fanlarining savollarini koʻradi —
            # ilgari faqat oʻzi yozganini koʻrardi va oʻz fanining bazasi
            # unga boʻsh koʻrinardi.
            subject_ids = await assigned_subject_ids(session, current_user)
            stmt = stmt.where(self._visible_questions_filter(current_user, subject_ids))

        if request.text:
            stmt = stmt.where(Question.text.ilike(f"%{request.text}%"))

        if request.subject_id:
            stmt = stmt.where(Question.subject_id == request.subject_id)

        if request.user_id:
            stmt = stmt.where(Question.user_id == request.user_id)

        if request.lesson_id:
            stmt = stmt.where(Question.lesson_id == request.lesson_id)

        if request.midterm_quiz_id:
            stmt = stmt.where(self._midterm_extra_filter(request.midterm_quiz_id))

        if request.course_id:
            stmt = stmt.where(Question.course_id == request.course_id)

        if request.control_type:
            stmt = stmt.where(Question.control_type == request.control_type.value)

        stmt = stmt.order_by(desc(Question.created_at))
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        questions = result.scalars().all()

        # Qaysi savollar testga olingan — bitta so'rovda. Front shu
        # bo'yicha «o'chirish» tugmasini yopadi, aks holda o'qituvchi
        # tugmani bosib, 409 xatosini ko'rardi.
        used_ids: set[int] = set()
        if questions:
            used_ids = set(
                (
                    await session.execute(
                        select(QuizQuestion.question_id).where(
                            QuizQuestion.question_id.in_([q.id for q in questions])
                        )
                    )
                )
                .scalars()
                .all()
            )
        for question in questions:
            question.in_quiz = question.id in used_ids

        count_stmt = (
            select(func.count()).select_from(Question).where(Question.is_latest.is_(True), Question.is_active.is_(True))
        )
        if not is_admin and is_teacher and not course_scoped:
            count_stmt = count_stmt.where(self._visible_questions_filter(current_user, subject_ids))
        if request.text:
            count_stmt = count_stmt.where(Question.text.ilike(f"%{request.text}%"))
        if request.subject_id:
            count_stmt = count_stmt.where(Question.subject_id == request.subject_id)
        if request.user_id:
            count_stmt = count_stmt.where(Question.user_id == request.user_id)
        if request.lesson_id:
            count_stmt = count_stmt.where(Question.lesson_id == request.lesson_id)
        if request.midterm_quiz_id:
            count_stmt = count_stmt.where(self._midterm_extra_filter(request.midterm_quiz_id))
        if request.course_id:
            count_stmt = count_stmt.where(Question.course_id == request.course_id)
        if request.control_type:
            count_stmt = count_stmt.where(Question.control_type == request.control_type.value)

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return QuestionListResponse(total=total, page=request.page, limit=request.limit, questions=questions)

    async def update_question(
        self,
        session: AsyncSession,
        question_id: int,
        data: QuestionCreateRequest,
        current_user: User,
    ) -> Question:
        """Editing a question never mutates the row in place — it creates a new
        version, flips is_latest on the old one, and repoints any quiz_questions
        that referenced the old version onto the new one. Already-started attempts
        (UserAnswers reserved at start_quiz) keep pointing at the exact version the
        student was shown, so editing mid-flight never corrupts a live attempt."""
        stmt = (
            select(Question)
            .options(
                selectinload(Question.subject),
                selectinload(Question.user),
            )
            .where(Question.id == question_id)
        )
        result = await session.execute(stmt)
        question = result.scalar_one_or_none()

        if not question:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

        # Check ownership for teachers
        is_admin = any(role.name.lower() == "admin" for role in current_user.roles)
        if not is_admin and question.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: you can only update your own questions",
            )

        new_question = Question(
            subject_id=data.subject_id,
            user_id=data.user_id,
            # Tahrirlash yangi VERSIYA yaratadi. Dars bogʻlanishi
            # koʻchirilmasa, tahrirlangan savol oʻz darsidan tushib
            # qolardi — va dars testi uni boshqa olmasdi. Mijoz aniq
            # qiymat yuborsa, oʻsha ustun boʻladi.
            lesson_id=data.lesson_id if data.lesson_id is not None else question.lesson_id,
            # Kurs savoli ham oʻz boʻlimida qolishi kerak — xuddi shu sabab.
            course_id=data.course_id if data.course_id is not None else question.course_id,
            control_type=data.control_type.value if data.control_type else question.control_type,
            text=data.text,
            option_a=data.option_a,
            option_b=data.option_b,
            option_c=data.option_c,
            option_d=data.option_d,
            correct_option=data.correct_option,
            question_type=data.question_type.value,
            payload=data.payload,
            original_question_id=question.original_question_id or question.id,
            version=question.version + 1,
            is_latest=True,
            is_active=question.is_active,
        )
        session.add(new_question)
        question.is_latest = False

        try:
            await session.flush()

            await session.execute(
                QuizQuestion.__table__.update()
                .where(QuizQuestion.question_id == question.id)
                .values(question_id=new_question.id)
            )

            await session.commit()
            await session.refresh(new_question)
        except Exception:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )

        return new_question

    async def delete_question(self, session: AsyncSession, question_id: int, current_user: User) -> None:
        stmt = select(Question).where(Question.id == question_id)
        result = await session.execute(stmt)
        question = result.scalar_one_or_none()

        if not question:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

        # Check ownership for teachers
        is_admin = any(role.name.lower() == "admin" for role in current_user.roles)
        if not is_admin and question.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: you can only delete your own questions",
            )

        # Testga olingan savol o'chirilmaydi. Soft delete bo'lsa ham, savol
        # testdan tushib qolardi: `start_quiz` faqat `is_active` savollarni
        # beradi, ya'ni tayyor test jimgina qisqarardi — va allaqachon
        # ishlagan talabalar bilan keyingilari boshqa testni yechardi.
        await self._release_unanswered_control_question(session, question)
        used = await session.scalar(
            select(QuizQuestion.id).where(QuizQuestion.question_id == question.id).limit(1)
        )
        if used is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bu savol testga olingan — avval uni testdan chiqaring",
            )

        # Soft delete: the row stays (it may already be referenced by
        # user_answers) — it's just excluded from future selection.
        question.is_active = False
        await session.commit()

    async def _release_unanswered_control_question(self, session: AsyncSession, question: Question) -> None:
        """«Test savollari» dagi savolni kurs nazoratlaridan uzadi — agar uni
        hali hech kim yechmagan boʻlsa.

        Bunday savol nazoratga avtomatik tushadi va u yerdan alohida olib
        tashlanmaydi. Usiz shu turdagi nazorat yaratilgan zahoti savolni
        oʻchirishning hech qanday yoʻli qolmasdi. Yechilgan savol esa
        himoyada qoladi: test natijalar oʻrtasida qisqarmasligi kerak.
        Versiyalar birga tekshiriladi — talaba eski versiyani koʻrgan boʻlishi
        mumkin. Commit chaqiruvchida.
        """
        if question.course_id is None or question.control_type is None:
            return
        foreign = await session.scalar(
            select(QuizQuestion.id)
            .join(Quiz, Quiz.id == QuizQuestion.quiz_id)
            .where(
                QuizQuestion.question_id == question.id,
                or_(
                    Quiz.quiz_type != QuizType.MIDTERM.value,
                    Quiz.course_id.is_distinct_from(question.course_id),
                    Quiz.control_type.is_distinct_from(question.control_type),
                ),
            )
            .limit(1)
        )
        if foreign is not None:
            return
        root_id = question.original_question_id or question.id
        versions = select(Question.id).where(or_(Question.id == root_id, Question.original_question_id == root_id))
        answered = await session.scalar(
            select(UserAnswers.id).where(UserAnswers.question_id.in_(versions)).limit(1)
        )
        if answered is not None:
            return
        await session.execute(QuizQuestion.__table__.delete().where(QuizQuestion.question_id == question.id))

    async def bulk_delete_questions(
        self, session: AsyncSession, data: QuestionBulkDeleteRequest, current_user: User
    ) -> int:
        from sqlalchemy import update

        # Check ownership for teachers
        is_admin = any(role.name.lower() == "admin" for role in current_user.roles)
        if not is_admin:
            if data.user_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: you can only delete your own questions",
                )

        stmt = (
            update(Question)
            .where(Question.subject_id == data.subject_id, Question.user_id == data.user_id)
            .values(is_active=False)
        )

        result = await session.execute(stmt)
        await session.commit()

        return result.rowcount

    async def upload_image(self, session: AsyncSession, file, current_user) -> str:
        """Savol rasmini yuklaydi va fayl kutubxonasiga qayd etadi.

        Papka avvalgidek `question/` — bazadagi mavjud havolalar shu yerga
        ishora qiladi va ularni buzib boʻlmaydi."""
        stored, _ = await store_upload(
            session,
            file,
            owner_user_id=current_user.id if current_user else None,
            subdir="question",
        )
        await session.commit()
        await session.refresh(stored, ["blob"])
        return public_url(stored.blob.stored_path)

    async def upload_questions_excel(
        self,
        session: AsyncSession,
        file,
        subject_id: int,
        user_id: int,
        lesson_id: int | None = None,
        course_id: int | None = None,
        control_type: ControlType | None = None,
        current_user: User | None = None,
    ) -> list[Question]:
        import io

        import pandas as pd

        if (course_id is None) != (control_type is None):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Kurs va nazorat turi birga berilishi kerak",
            )
        if course_id is not None:
            course = await self._course_for_control_questions(session, course_id, current_user)
            # Fan kursdan olinadi: savollar boshqa fan bankiga tushib qolmasin.
            subject_id = course.subject_id
            lesson_id = None

        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))

        # Verify there are at least 5 columns
        if len(df.columns) < 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Excel file must contain at least 5 columns (question, option A, option B, option C, option D)",
            )

        # Ustunlarni avval nomi bo'yicha qidiramiz. Tanilmasa — eski, o'rni
        # bo'yicha o'qish. Nomi bo'yicha o'qish eksport qilingan faylni
        # qaytadan yuklash imkonini beradi: undagi «№», «Fan» va
        # «Foydalanuvchi» ustunlari endi xalaqit bermaydi (excel_format.py).
        mapping = resolve_columns(df.columns)

        def cell(row, field: str, position: int):
            index = mapping[field] if mapping is not None else position
            if index >= len(row):
                return ""
            value = row.iloc[index]
            return "" if pd.isna(value) else str(value)

        questions = []
        warnings = []
        for index, row in df.iterrows():
            text = cell(row, "text", 0)
            opt_a = cell(row, "option_a", 1)
            opt_b = cell(row, "option_b", 2)
            opt_c = cell(row, "option_c", 3)
            opt_d = cell(row, "option_d", 4)

            # Butunlay bo'sh qator — savol emas. Ilgari u bo'sh matnli savol
            # yaratardi: shablon bo'yicha to'ldirilgan faylning oxirida
            # bunday qatorlar qolib ketishi odatiy hol.
            if not any(value.strip() for value in (text, opt_a, opt_b, opt_c, opt_d)):
                continue

            q_subject_id = subject_id
            if course_id is None and "subject_id" in df.columns and not pd.isna(row["subject_id"]):
                try:
                    q_subject_id = int(row["subject_id"])
                except (ValueError, TypeError):
                    pass

            # To'g'ri javob — A varianti. Shablonda bunday ustun yo'q va
            # ogohlantirish ham berilmaydi: bu endi qoida, xato emas.
            #
            # Ustun faqat ESKI fayllar uchun o'qiladi. Ilgari yuklab
            # olingan eksport va shablonlarda haqiqiy «b»/«c»/«d» turadi;
            # ularni e'tiborsiz qoldirsak, o'qituvchi o'z bankini qayta
            # yuklagan zahoti barcha javoblari «a» bo'lib qolardi.
            if mapping is not None:
                raw_correct = cell(row, "correct_option", 5) if "correct_option" in mapping else ""
            elif "correct_option" in df.columns and not pd.isna(row["correct_option"]):
                raw_correct = str(row["correct_option"])
            else:
                raw_correct = ""

            correct_option = parse_correct_option(raw_correct) or "a"

            question = Question(
                subject_id=q_subject_id,
                user_id=user_id,
                # Dars sahifasidan yuklanganda savollar oʻsha darsniki
                # boʻladi: dars testi aynan shu bogʻlanish boʻyicha yigʻiladi.
                lesson_id=lesson_id,
                course_id=course_id,
                control_type=control_type.value if control_type else None,
                text=text,
                option_a=opt_a,
                option_b=opt_b,
                option_c=opt_c,
                option_d=opt_d,
                correct_option=correct_option,
            )
            questions.append(question)

        session.add_all(questions)

        try:
            # Darsga yoki kurs nazoratiga yuklangan savollar shu darsni/turni
            # olgan nazoratlarga darhol tushadi.
            if lesson_id is not None or control_type is not None:
                await session.flush()
                for question in questions:
                    await get_quiz_repository.link_question_to_midterms(session, question)
            await session.commit()
        except Exception:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error during bulk upload",
            )

        return {"questions": questions, "warnings": warnings}

    async def download_questions_excel(
        self,
        session: AsyncSession,
        subject_id: int | None = None,
        user_id: int | None = None,
        text: str | None = None,
    ) -> bytes:
        import io
        import re

        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

        def strip_html(html: str) -> str:
            """Remove HTML tags and return plain text."""
            clean = re.sub(r"<[^>]+>", "", html or "")
            return clean.strip()

        # Query all matching questions (no pagination)
        stmt = (
            select(Question)
            .options(
                selectinload(Question.subject),
                selectinload(Question.user),
            )
            .where(Question.is_latest.is_(True), Question.is_active.is_(True))
        )

        if text:
            stmt = stmt.where(Question.text.ilike(f"%{text}%"))
        if subject_id:
            stmt = stmt.where(Question.subject_id == subject_id)
        if user_id:
            stmt = stmt.where(Question.user_id == user_id)

        stmt = stmt.order_by(desc(Question.created_at))

        result = await session.execute(stmt)
        questions = result.scalars().all()

        # Create Excel workbook
        wb = Workbook()
        ws = wb.active
        ws.title = "Savollar"

        # Header styling
        header_font = Font(bold=True, color="FFFFFF", size=11)
        header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
        header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        thin_border = Border(
            left=Side(style="thin"),
            right=Side(style="thin"),
            top=Side(style="thin"),
            bottom=Side(style="thin"),
        )

        # «To'g'ri javob» ustuni yo'q — uning o'rniga variantlar shunday
        # joylashtiriladiki, TO'G'RI JAVOB HAR DOIM «A variant» da bo'ladi
        # (import ham shunday o'qiydi).
        #
        # Bu shunchaki qulaylik emas, balki ma'lumotni saqlash sharti:
        # o'qituvchilar bankni yuklab olib, tahrirlab, qaytadan yuklaydi.
        # Agar eksport javobni boshqa ustunda qoldirsa, shu aylanishda
        # barcha to'g'ri javoblar «a» ga ko'chib, bank jimgina buzilardi.
        headers = [
            "№",
            "Savol",
            "A variant (to'g'ri javob)",
            "B variant",
            "C variant",
            "D variant",
            "Fan",
            "Foydalanuvchi",
        ]
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col_idx, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
            cell.border = thin_border

        # Data rows
        cell_alignment = Alignment(vertical="top", wrap_text=True)
        for row_idx, q in enumerate(questions, 2):
            subject_name = q.subject.name if q.subject else "-"
            username = q.user.username if q.user else "-"

            options = [
                strip_html(q.option_a),
                strip_html(q.option_b),
                strip_html(q.option_c),
                strip_html(q.option_d),
            ]
            # To'g'ri javobni birinchi o'ringa olib chiqamiz, qolganlarining
            # tartibi saqlanadi.
            correct_index = {"a": 0, "b": 1, "c": 2, "d": 3}.get((q.correct_option or "a").lower(), 0)
            ordered = [options[correct_index]] + [
                option for index, option in enumerate(options) if index != correct_index
            ]

            values = [
                row_idx - 1,
                strip_html(q.text),
                *ordered,
                subject_name,
                username,
            ]
            for col_idx, value in enumerate(values, 1):
                cell = ws.cell(row=row_idx, column=col_idx, value=value)
                cell.alignment = cell_alignment
                cell.border = thin_border

        # Column widths
        ws.column_dimensions["A"].width = 6  # №
        ws.column_dimensions["B"].width = 50  # Savol
        ws.column_dimensions["C"].width = 25  # A
        ws.column_dimensions["D"].width = 25  # B
        ws.column_dimensions["E"].width = 25  # C
        ws.column_dimensions["F"].width = 25  # D
        ws.column_dimensions["G"].width = 20  # Fan
        ws.column_dimensions["H"].width = 18  # Foydalanuvchi

        # Save to buffer
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        return buffer.getvalue()

    @staticmethod
    def build_excel_template() -> bytes:
        """Savollar uchun bo'sh shablon.

        Ikki varaq. Birinchisi — «Savollar», faqat sarlavhalar: o'qituvchi
        savollarini shu yerga yozadi. Ikkinchisi — «Namuna», to'ldirilgan
        misol bilan. Misol nega alohida varaqda: import faqat birinchi
        varaqni o'qiydi (`pd.read_excel` standart holati), shuning uchun
        o'qituvchi namunani o'chirishni unutsa ham u bazaga tushmaydi.
        """
        import io

        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

        from .excel_format import HEADERS, TEMPLATE_HEADERS

        header_font = Font(bold=True, color="FFFFFF", size=11)
        header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
        header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        thin_border = Border(
            left=Side(style="thin"),
            right=Side(style="thin"),
            top=Side(style="thin"),
            bottom=Side(style="thin"),
        )
        widths = (50, 25, 25, 25, 25)

        # A ustuni sarlavhasida qoida yozilgan: o'qituvchi «Namuna»
        # varag'ini ochmasligi ham mumkin, shuning uchun qoida ikkala
        # varaqning sarlavhasida ham turadi.
        headers = list(TEMPLATE_HEADERS)
        headers[1] = f"{HEADERS['option_a']} (to'g'ri javob)"

        def write_headers(sheet) -> None:
            for col_idx, header in enumerate(headers, 1):
                cell = sheet.cell(row=1, column=col_idx, value=header)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = header_alignment
                cell.border = thin_border
            for col_idx, width in enumerate(widths, 1):
                sheet.column_dimensions[sheet.cell(row=1, column=col_idx).column_letter].width = width

        wb = Workbook()
        sheet = wb.active
        sheet.title = "Savollar"
        write_headers(sheet)

        example = wb.create_sheet("Namuna")
        write_headers(example)
        # Namunada to'g'ri javob — har doim A ustunida.
        rows = [
            ("2 + 2 nechaga teng?", "4", "3", "5", "6"),
            ("O'zbekiston poytaxti qaysi shahar?", "Toshkent", "Samarqand", "Buxoro", "Xiva"),
        ]
        cell_alignment = Alignment(vertical="top", wrap_text=True)
        for row_idx, values in enumerate(rows, 2):
            for col_idx, value in enumerate(values, 1):
                cell = example.cell(row=row_idx, column=col_idx, value=value)
                cell.alignment = cell_alignment
                cell.border = thin_border
        note_row = len(rows) + 3
        for offset, line in enumerate((
            "Savollaringizni «Savollar» varag'iga yozing.",
            "TO'G'RI JAVOBNI «A variant» ustuniga yozing — qolgan uchtasi noto'g'ri javoblar.",
            "Alohida «To'g'ri javob» ustuni kerak emas: talabaga variantlar har safar "
            "aralashtirib ko'rsatiladi, shuning uchun to'g'ri javob birinchi turgani bilinmaydi.",
        )):
            example.cell(row=note_row + offset, column=1, value=line).font = Font(
                italic=True, color="808080"
            )

        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        return buffer.getvalue()


get_question_repository = QuestionRepository()
