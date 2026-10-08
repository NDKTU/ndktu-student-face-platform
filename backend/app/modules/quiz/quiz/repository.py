import logging
from datetime import datetime, timezone

from core.config import settings
from fastapi import HTTPException, status
from sqlalchemy import and_, asc, case, desc, false, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import CONTROL_TYPE_TITLES, ControlType, QuizType, semester_label
from app.core.schemas import TASHKENT_TZ
from app.modules.auth.model import Student, Teacher, TeacherSubject, User
from app.core.utils.course_access import can_manage, manageable_course_ids
from app.core.utils.lesson_scope import lesson_group_ids, visible_to_group
from app.modules.course.model import Course, CourseGroup, Lesson
from app.modules.organization_structure.model import Faculty, Group, TeacherGroup
from app.modules.file.storage import public_url, store_upload
from app.modules.quiz.model import Question, Quiz, QuizLesson, QuizQuestion, Result, Subject, UserAnswers

from .schemas import (
    LessonQuizSummaryItem,
    LessonQuizSummaryResponse,
    QuizAnalyticsResponse,
    QuizCatalogFaculty,
    QuizCatalogResponse,
    QuizCatalogSubject,
    QuizCreateRequest,
    QuizListRequest,
    QuizListResponse,
    QuizQuestionAnalytics,
)

logger = logging.getLogger(__name__)


class QuizRepository:
    async def _apply_visibility(self, stmt, session: AsyncSession, current_user: User):
        is_admin = any(role.name.lower() == "admin" for role in current_user.roles)
        is_student = any(role.name.lower() == "student" for role in current_user.roles)
        is_teacher = any(role.name.lower() == "teacher" for role in current_user.roles)
        if is_admin:
            return stmt
        if is_student:
            group_id = (
                await session.execute(select(Student.group_id).where(Student.user_id == current_user.id))
            ).scalar_one_or_none()
            return stmt.where(Quiz.group_id == group_id) if group_id else stmt.where(Quiz.id == -1)
        if is_teacher:
            group_ids = list(
                (
                    await session.execute(
                        select(TeacherGroup.group_id)
                        .join(Teacher, Teacher.id == TeacherGroup.teacher_id)
                        .where(Teacher.user_id == current_user.id)
                    )
                )
                .scalars()
                .all()
            )
            subject_ids = list(
                (
                    await session.execute(
                        select(TeacherSubject.subject_id)
                        .join(Teacher, Teacher.id == TeacherSubject.teacher_id)
                        .where(Teacher.user_id == current_user.id)
                    )
                )
                .scalars()
                .all()
            )
            conditions = [Quiz.lecturer_id == current_user.id]
            if group_ids:
                conditions.append(Quiz.group_id.in_(group_ids))
            if subject_ids:
                conditions.append(Quiz.subject_id.in_(subject_ids))
            return stmt.where(or_(*conditions))
        return stmt.where(Quiz.id == -1)

    async def get_catalog(self, session: AsyncSession, current_user: User) -> QuizCatalogResponse:
        """Return the faculty -> subject catalogue with active/total counters."""
        stmt = (
            select(
                Faculty.id.label("faculty_id"),
                Faculty.name.label("faculty_name"),
                Subject.id.label("subject_id"),
                Subject.name.label("subject_name"),
                func.count(Quiz.id).label("quiz_count"),
                func.sum(case((Quiz.is_active.is_(True), 1), else_=0)).label("active_count"),
            )
            .join(Group, Group.id == Quiz.group_id)
            .join(Faculty, Faculty.id == Group.faculty_id)
            .join(Subject, Subject.id == Quiz.subject_id)
        )
        stmt = await self._apply_visibility(stmt, session, current_user)
        stmt = stmt.group_by(Faculty.id, Faculty.name, Subject.id, Subject.name).order_by(
            Faculty.name.asc(), Subject.name.asc()
        )

        faculties: dict[int, QuizCatalogFaculty] = {}
        for row in (await session.execute(stmt)).all():
            faculty = faculties.get(row.faculty_id)
            if faculty is None:
                faculty = QuizCatalogFaculty(
                    faculty_id=row.faculty_id,
                    faculty_name=row.faculty_name,
                    quiz_count=0,
                    active_count=0,
                    subjects=[],
                )
                faculties[row.faculty_id] = faculty
            faculty.quiz_count += row.quiz_count
            faculty.active_count += row.active_count or 0
            faculty.subjects.append(
                QuizCatalogSubject(
                    subject_id=row.subject_id,
                    subject_name=row.subject_name,
                    quiz_count=row.quiz_count,
                    active_count=row.active_count or 0,
                )
            )
        return QuizCatalogResponse(faculties=list(faculties.values()))

    async def get_analytics(self, session: AsyncSession, quiz_id: int) -> QuizAnalyticsResponse:
        quiz = await self.get_quiz(session, quiz_id)
        total_students = 0
        if quiz.group_id is not None:
            total_students = (
                await session.execute(select(func.count(Student.id)).where(Student.group_id == quiz.group_id))
            ).scalar() or 0

        latest_result_ids = list(
            (
                await session.execute(
                    select(func.max(Result.id)).where(Result.quiz_id == quiz_id).group_by(Result.user_id)
                )
            )
            .scalars()
            .all()
        )
        completed_results = []
        if latest_result_ids:
            completed_results = list(
                (
                    await session.execute(
                        select(Result).where(
                            Result.id.in_(latest_result_ids),
                            Result.status == "completed",
                        )
                    )
                )
                .scalars()
                .all()
            )

        grades = [result.grade for result in completed_results if result.grade is not None]
        durations = [
            (result.finished_at - result.created_at).total_seconds()
            for result in completed_results
            if result.finished_at is not None and result.created_at is not None
        ]
        completed_ids = [result.id for result in completed_results]
        question_items: list[QuizQuestionAnalytics] = []
        if completed_ids:
            question_stmt = (
                select(
                    Question.id.label("question_id"),
                    Question.text.label("question_text"),
                    func.count(UserAnswers.id).label("answer_count"),
                    func.sum(case((UserAnswers.is_correct.is_(True), 1), else_=0)).label("correct_count"),
                )
                .join(UserAnswers, UserAnswers.question_id == Question.id)
                .where(UserAnswers.quiz_id == quiz_id, UserAnswers.result_id.in_(completed_ids))
                .group_by(Question.id, Question.text)
                .order_by(Question.id.asc())
            )
            for row in (await session.execute(question_stmt)).all():
                correct = row.correct_count or 0
                wrong = row.answer_count - correct
                question_items.append(
                    QuizQuestionAnalytics(
                        question_id=row.question_id,
                        question_text=row.question_text,
                        answer_count=row.answer_count,
                        correct_count=correct,
                        wrong_count=wrong,
                        correct_percent=round((correct / row.answer_count) * 100, 1) if row.answer_count else 0,
                    )
                )

        return QuizAnalyticsResponse(
            quiz_id=quiz_id,
            total_students=total_students,
            submitted_count=len(completed_results),
            average_grade=round(sum(grades) / len(grades), 2) if grades else None,
            minimum_grade=min(grades) if grades else None,
            maximum_grade=max(grades) if grades else None,
            average_duration_seconds=round(sum(durations) / len(durations), 1) if durations else None,
            questions=question_items,
        )

    def _lecturer_questions_stmt(self, lecturer_id: int, subject_id: int, lesson_id: int | None = None):
        """Банк вопросов лектора по предмету — активные, последней версии.

        Банк персональный: тест собирается из вопросов того лектора, который
        читает лекции группе, а не из всех вопросов предмета.

        `lesson_id` berilsa — faqat oʻsha darsning savollari. Dars sahifasida
        oʻqituvchi savolni mavzuga qoʻshadi va oʻsha mavzuning testini kutadi;
        butun fan banki olinsa, bitta mavzu testiga semestrning hamma savoli
        tushib ketardi.

        Dars boʻyicha olinganda muallif va fan boʻyicha filtr QOʻYILMAYDI.
        Savol darsga biriktirilgan boʻlsa, uni kim kiritgani muhim emas:
        amalda savollarni koʻpincha admin yoki yordamchi yuklaydi, maʼruzachi
        esa boshqa hisob boʻladi — bank muallif boʻyicha kesilsa, test boʻsh
        chiqardi.
        """
        if lesson_id is not None:
            return select(Question).where(
                Question.lesson_id == lesson_id,
                Question.is_active.is_(True),
                Question.is_latest.is_(True),
            )
        return select(Question).where(
            Question.user_id == lecturer_id,
            Question.subject_id == subject_id,
            Question.is_active.is_(True),
            Question.is_latest.is_(True),
        )

    async def count_available_questions(
        self, session: AsyncSession, lecturer_id: int, subject_id: int, lesson_id: int | None = None
    ) -> int:
        stmt = select(func.count()).select_from(
            self._lecturer_questions_stmt(lecturer_id, subject_id, lesson_id).subquery()
        )
        return (await session.execute(stmt)).scalar() or 0

    def _not_enough_questions(self, available: int, requested: int) -> HTTPException:
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "not_enough_questions",
                "available": available,
                "requested": requested,
                "message": (
                    f"Testni faollashtirish uchun savollar yetarli emas: "
                    f"{available} ta savol mavjud, {requested} ta talab qilingan."
                ),
            },
        )

    async def build_title(
        self,
        session: AsyncSession,
        subject_id: int | None,
        group_id: int | None,
        semester_number: int | None,
        created_at: datetime | None = None,
    ) -> str:
        """Собирает название теста: «Фан — Гуруҳ — 21.08.2026 (kuzgi semestr)».

        Организатор название больше не печатает: набранные вручную «Test 1» и
        «matem» невозможно было различить в списке из тысяч тестов. Дата берётся
        ташкентская — по ней тест и ищут в журнале.
        """
        subject_name = (
            (await session.execute(select(Subject.name).where(Subject.id == subject_id))).scalar_one_or_none()
            if subject_id
            else None
        )
        group_name = (
            (await session.execute(select(Group.name).where(Group.id == group_id))).scalar_one_or_none()
            if group_id
            else None
        )

        # При правке теста дата остаётся датой создания: иначе тест, к которому
        # вернулись через неделю, «переезжал» бы в названии в другой день.
        moment = created_at or datetime.now(TASHKENT_TZ)
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=timezone.utc)

        parts = [part for part in (subject_name, group_name) if part]
        parts.append(moment.astimezone(TASHKENT_TZ).strftime("%d.%m.%Y"))
        title = " — ".join(parts)
        label = semester_label(semester_number)
        if label:
            title = f"{title} ({label})"
        return title

    async def _fill_from_lesson(self, session: AsyncSession, data: QuizCreateRequest) -> QuizCreateRequest:
        """Darsdan guruh, fan va lektorni to'ldiradi.

        O'qituvchi dars sahifasida test tuzganda bularni qayta tanlashi
        mantiqsiz: dars allaqachon guruhga va o'qituvchi-fan juftligiga
        bog'langan. Foydalanuvchi o'zi ko'rsatgan qiymat ustuvor qoladi.
        """
        if data.lesson_id is None:
            return data
        row = (
            await session.execute(
                select(Lesson.group_id, TeacherSubject.subject_id, Teacher.user_id)
                .join(TeacherSubject, TeacherSubject.id == Lesson.teacher_subject_id)
                .join(Teacher, Teacher.id == TeacherSubject.teacher_id)
                .where(Lesson.id == data.lesson_id)
            )
        ).first()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
        group_id, subject_id, lecturer_user_id = row
        # Dars butun kursniki bo'lsa (`group_id` bo'sh), guruhni bu yerdan
        # olib bo'lmaydi — test qaysi guruhga topshirilishini o'qituvchi o'zi
        # ko'rsatadi.
        if data.group_id is None and group_id is not None:
            data.group_id = group_id
        if data.subject_id is None:
            data.subject_id = subject_id
        if data.lecturer_id is None:
            data.lecturer_id = lecturer_user_id
            data.user_id = lecturer_user_id
        return data

    async def _fill_from_course(
        self, session: AsyncSession, data: QuizCreateRequest, current_user: User | None
    ) -> QuizCreateRequest:
        """Oraliq nazorat uchun fan va lektorni kursdan to'ldiradi.

        Tanlangan darslar va guruh shu kursniki ekani ham shu yerda
        tekshiriladi: aks holda begona kursning dars savollari testga
        tushib qolardi.
        """
        if data.quiz_type != QuizType.MIDTERM:
            return data
        if data.course_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Oraliq nazorat kursga biriktirilishi kerak",
            )
        course = await session.get(Course, data.course_id)
        if course is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
        if current_user is not None and not await can_manage(session, course, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu kurs sizga biriktirilmagan")

        if data.lesson_ids:
            data.lesson_ids = list(dict.fromkeys(data.lesson_ids))
            found = (
                await session.execute(
                    select(func.count()).select_from(Lesson).where(
                        Lesson.id.in_(data.lesson_ids), Lesson.course_id == course.id
                    )
                )
            ).scalar() or 0
            if found != len(data.lesson_ids):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Tanlangan darslar bu kursga tegishli emas",
                )

        if data.group_id is not None:
            in_course = await session.scalar(
                select(CourseGroup.id).where(
                    CourseGroup.course_id == course.id, CourseGroup.group_id == data.group_id
                )
            )
            if in_course is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Guruh bu kursga tegishli emas",
                )

        # Nom turidan yasaladi — o'qituvchi yozgan nom e'tiborga olinmaydi.
        # Tursiz eski testda (tahrirlash) nom o'zgarmaydi.
        if data.control_type is not None:
            data.title = CONTROL_TYPE_TITLES[data.control_type]

        data.lesson_id = None
        data.subject_id = course.subject_id
        if data.lecturer_id is None:
            data.lecturer_id = course.teacher_id
            data.user_id = course.teacher_id
        return data

    @staticmethod
    def _midterm_pool_stmt(course_id: int | None, control_type: str | None, lesson_ids: list[int] | None):
        """Kurs nazoratiga o'zi tushadigan savollar — faol, oxirgi versiya.

        Ikki manba: tanlangan darslarning savollari va kursning «Test
        savollari» dagi nazorat turiga mos savollar. Dars testidagi kabi
        muallif bo'yicha filtr yo'q: savolni kim kiritgani muhim emas.
        """
        sources = []
        if lesson_ids:
            sources.append(Question.lesson_id.in_(lesson_ids))
        if course_id is not None and control_type:
            sources.append(and_(Question.course_id == course_id, Question.control_type == control_type))
        return select(Question.id).where(
            or_(*sources) if sources else false(),
            Question.is_active.is_(True),
            Question.is_latest.is_(True),
        )

    async def _sync_midterm(self, session: AsyncSession, quiz: Quiz, lesson_ids: list[int]) -> None:
        """Kurs nazoratining savollarini darslar tanlovi va turiga moslaydi.

        Darsdan (`lesson_id`) va «Test savollari» dan (`control_type`) kelgan
        savollar qayta yig'iladi; testning o'ziga alohida qo'shilgan eski
        savollar (ikkalasi ham bo'sh) tegilmaydi.
        """
        await session.execute(QuizLesson.__table__.delete().where(QuizLesson.quiz_id == quiz.id))
        for lesson_id in lesson_ids:
            session.add(QuizLesson(quiz_id=quiz.id, lesson_id=lesson_id))

        wanted = set(
            (
                await session.execute(self._midterm_pool_stmt(quiz.course_id, quiz.control_type, lesson_ids))
            ).scalars().all()
        )
        current = dict(
            (
                await session.execute(
                    select(QuizQuestion.question_id, QuizQuestion.id)
                    .join(Question, Question.id == QuizQuestion.question_id)
                    .where(
                        QuizQuestion.quiz_id == quiz.id,
                        or_(Question.lesson_id.isnot(None), Question.control_type.isnot(None)),
                    )
                )
            ).all()
        )
        stale = [link_id for question_id, link_id in current.items() if question_id not in wanted]
        if stale:
            await session.execute(QuizQuestion.__table__.delete().where(QuizQuestion.id.in_(stale)))
        for question_id in wanted - current.keys():
            session.add(QuizQuestion(quiz_id=quiz.id, question_id=question_id))
        await session.flush()

    async def _linked_question_count(self, session: AsyncSession, quiz_id: int) -> int:
        return (
            await session.execute(
                select(func.count())
                .select_from(QuizQuestion)
                .join(Question, Question.id == QuizQuestion.question_id)
                .where(QuizQuestion.quiz_id == quiz_id, Question.is_active.is_(True))
            )
        ).scalar() or 0

    async def link_question_to_midterms(self, session: AsyncSession, question: Question) -> None:
        """Yangi savolni u tushishi kerak bo'lgan kurs nazoratlariga bog'laydi:
        darsning savoli — o'sha darsni tanlaganlariga, «Test savollari» dagi
        savol — kursning shu turdagi nazoratlariga.

        Usiz nazorat yaratilgan paytdagi savollar bilan qotib qolardi:
        o'qituvchi savol qo'shadi va uni testda kutadi. Commit chaqiruvchida.
        """
        quiz_ids: set[int] = set()
        if question.lesson_id is not None:
            quiz_ids.update(
                (
                    await session.execute(
                        select(QuizLesson.quiz_id).where(QuizLesson.lesson_id == question.lesson_id)
                    )
                ).scalars().all()
            )
        if question.course_id is not None and question.control_type:
            quiz_ids.update(
                (
                    await session.execute(
                        select(Quiz.id).where(
                            Quiz.course_id == question.course_id,
                            Quiz.quiz_type == QuizType.MIDTERM.value,
                            Quiz.control_type == question.control_type,
                        )
                    )
                ).scalars().all()
            )
        for quiz_id in quiz_ids:
            session.add(QuizQuestion(quiz_id=quiz_id, question_id=question.id))

    async def _attach_midterm_info(self, session: AsyncSession, quizzes: list[Quiz]) -> None:
        """Oraliq nazoratlarga manba darslar va savollar sonini yozib qo'yadi."""
        midterms = [quiz for quiz in quizzes if quiz.quiz_type == QuizType.MIDTERM.value]
        if not midterms:
            return
        ids = [quiz.id for quiz in midterms]
        lessons: dict[int, list[int]] = {quiz_id: [] for quiz_id in ids}
        for quiz_id, lesson_id in (
            await session.execute(
                select(QuizLesson.quiz_id, QuizLesson.lesson_id)
                .join(Lesson, Lesson.id == QuizLesson.lesson_id)
                .where(QuizLesson.quiz_id.in_(ids))
                .order_by(Lesson.date, Lesson.id)
            )
        ).all():
            lessons[quiz_id].append(lesson_id)
        counts = dict(
            (
                await session.execute(
                    select(QuizQuestion.quiz_id, func.count())
                    .join(Question, Question.id == QuizQuestion.question_id)
                    .where(QuizQuestion.quiz_id.in_(ids), Question.is_active.is_(True))
                    .group_by(QuizQuestion.quiz_id)
                )
            ).all()
        )
        for quiz in midterms:
            quiz.lesson_ids = lessons[quiz.id]
            quiz.linked_question_count = counts.get(quiz.id, 0)

    async def create_quiz(
        self,
        session: AsyncSession,
        data: QuizCreateRequest,
        created_by_user_id: int,
        current_user: User | None = None,
    ) -> Quiz:
        data = await self._fill_from_lesson(session, data)
        data = await self._fill_from_course(session, data, current_user)
        is_midterm = data.quiz_type == QuizType.MIDTERM
        if is_midterm and data.control_type is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Nazorat turini tanlang",
            )

        # Проверяем банк только при активации. Неактивный тест организатор вправе
        # подготовить заранее, пока лектор ещё грузит вопросы; экзаменом он
        # становится в момент включения — там же и проверяем.
        #
        # Почему проверка вообще нужна: start_quiz молча выдаёт столько вопросов,
        # сколько нашлось, поэтому тест на 30 вопросов из банка в 12 превратился бы
        # в экзамен на 12 — с оценкой, несравнимой с другими группами.
        if is_midterm and data.is_active:
            pool = self._midterm_pool_stmt(
                data.course_id, data.control_type.value if data.control_type else None, data.lesson_ids
            )
            available = (await session.execute(select(func.count()).select_from(pool.subquery()))).scalar() or 0
            if available < data.question_number:
                raise self._not_enough_questions(available, data.question_number)
        elif data.is_active and data.lecturer_id and data.subject_id:
            available = await self.count_available_questions(
                session=session,
                lecturer_id=data.lecturer_id,
                subject_id=data.subject_id,
                lesson_id=data.lesson_id,
            )
            if available < data.question_number:
                raise self._not_enough_questions(available, data.question_number)

        title = data.title or await self.build_title(
            session,
            subject_id=data.subject_id,
            group_id=data.group_id,
            semester_number=data.semester_number,
        )

        new_quiz = Quiz(
            title=title,
            question_number=data.question_number,
            duration=data.duration,
            pin=data.pin,
            is_active=data.is_active,
            proctoring_mode=data.proctoring_mode,
            strict_mode=bool(data.strict_mode),
            quiz_type=data.quiz_type.value,
            lecturer_id=data.lecturer_id,
            created_by_user_id=created_by_user_id,
            group_id=data.group_id,
            subject_id=data.subject_id,
            lesson_id=data.lesson_id,
            course_id=data.course_id if is_midterm else None,
            control_type=data.control_type.value if is_midterm and data.control_type else None,
        )
        session.add(new_quiz)

        if is_midterm:
            # Oraliq nazorat lektor bankidan emas, tanlangan darslardan.
            await session.flush()
            await self._sync_midterm(session, new_quiz, data.lesson_ids or [])
        elif data.lecturer_id and data.subject_id:
            # Dars testi faqat oʻsha darsning savollaridan yigʻiladi.
            result_questions = await session.execute(
                self._lecturer_questions_stmt(data.lecturer_id, data.subject_id, data.lesson_id)
            )
            for question in result_questions.scalars().all():
                session.add(QuizQuestion(quiz=new_quiz, question=question))

        # Связка TeacherGroup здесь раньше создавалась автоматически. Убрано: под
        # разделением ролей это значило бы, что организатор, создав тест группе,
        # молча становится её преподавателем. Права не должны появляться как
        # побочный эффект действия.

        try:
            await session.commit()
            await session.refresh(new_quiz)
        except Exception:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )
        await self._attach_midterm_info(session, [new_quiz])
        return new_quiz

    async def get_quiz(self, session: AsyncSession, quiz_id: int) -> Quiz:
        stmt = (
            select(Quiz)
            .options(selectinload(Quiz.subject), selectinload(Quiz.group))
            .where(Quiz.id == quiz_id)
        )
        result = await session.execute(stmt)
        quiz = result.scalar_one_or_none()

        if not quiz:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")

        self._attach_names([quiz])
        await self._attach_midterm_info(session, [quiz])
        return quiz

    @staticmethod
    def _attach_names(quizzes: list[Quiz]) -> None:
        """Fan va guruh nomlarini javob obyektiga yozib qo'yadi.

        Nomlar sxemada bor (`subject_name`, `group_name`), lekin ORM'da alohida
        maydon emas — bog'lanishdan olinadi. Front ilgari ularni o'zi qidirardi:
        1000 ta fan alohida so'rovda yuklanib, 2978 tasidan qolgani jadvalda
        «—» bo'lib chiqardi.
        """
        for quiz in quizzes:
            quiz.subject_name = quiz.subject.name if quiz.subject else None
            quiz.group_name = quiz.group.name if quiz.group else None

    @staticmethod
    def _visible_to_student(group_id: int):
        """Talabaga koʻrinadigan testlar sharti.

        Ikkita yoʻl bor. Oddiysi — testda aynan shu guruh koʻrsatilgan.
        Ikkinchisi darsdan keladi: dars butun kursniki boʻlishi mumkin
        (`lessons.group_id` boʻsh — «kursning barcha guruhlari»), unda
        guruh yoʻq, demak undan tuzilgan testga ham guruh yozilmaydi.
        Faqat ustunga qaralganda bunday test hech kimga koʻrinmasdi:
        oʻqituvchi uni tuzardi, faol qilardi, talaba esa «Test ishlash»
        sahifasida boʻshliq koʻrardi.

        Guruhsiz test «hammaga ochiq» degani emas — u oʻsha darsning
        kursiga kirgan guruhlarniki. Shart darslar bilan bir xil joydan
        olinadi (`lesson_scope.visible_to_group`), aks holda dars va uning
        testi har xil guruhlarga koʻrinib ketardi.
        """
        return or_(
            Quiz.group_id == group_id,
            and_(
                Quiz.group_id.is_(None),
                Quiz.lesson_id.in_(select(Lesson.id).where(visible_to_group(group_id))),
            ),
            # Oraliq nazorat guruhsiz bo'lsa — kursning barcha guruhlariniki.
            and_(
                Quiz.group_id.is_(None),
                Quiz.course_id.in_(select(CourseGroup.course_id).where(CourseGroup.group_id == group_id)),
            ),
        )

    async def lesson_quiz_summary(self, session: AsyncSession, lesson_id: int) -> LessonQuizSummaryResponse:
        """Dars testlarining qisqa yakuni — bitta so'rovda.

        Nega alohida: dars sahifasida har bir test uchun `/analytics` ni
        chaqirish o'nlab so'rov degani edi. Bu yerda esa barcha testlar
        uchun bitta agregatsiya.

        Maxraj — testning GURUHLARIDAGI talabalar soni, topshirganlar emas:
        o'qituvchiga «24 tadan 12 tasi topshirdi» kerak, «12 ta topshirdi»
        esa kim qolganini ko'rsatmaydi. Guruh darsnikidek aniqlanadi
        (`lesson_scope.lesson_group_ids`): guruhsiz dars — kursning barcha
        guruhlari.
        """
        lesson = await session.get(Lesson, lesson_id)
        if lesson is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dars topilmadi")

        quizzes = (
            (await session.execute(select(Quiz.id, Quiz.group_id).where(Quiz.lesson_id == lesson_id)))
            .all()
        )
        if not quizzes:
            return LessonQuizSummaryResponse(lesson_id=lesson_id, items=[])

        quiz_ids = [row.id for row in quizzes]
        stats = {
            row.quiz_id: row
            for row in (
                await session.execute(
                    select(
                        Result.quiz_id,
                        func.count(func.distinct(Result.user_id)).label("submitted"),
                        func.avg(Result.grade).label("average"),
                    )
                    .where(Result.quiz_id.in_(quiz_ids), Result.status == "completed")
                    .group_by(Result.quiz_id)
                )
            ).all()
        }

        # Guruhdagi talabalar soni: test o'z guruhini ko'rsatsa — o'sha,
        # ko'rsatmasa (dars butun kursniki) — darsning guruhlari.
        default_group_ids = await lesson_group_ids(session, lesson)
        counts: dict[tuple[int, ...], int] = {}

        async def students_in(group_ids: list[int]) -> int:
            key = tuple(sorted(group_ids))
            if key not in counts:
                counts[key] = (
                    await session.scalar(
                        select(func.count()).select_from(Student).where(Student.group_id.in_(group_ids or [0]))
                    )
                ) or 0
            return counts[key]

        items: list[LessonQuizSummaryItem] = []
        for row in quizzes:
            group_ids = [row.group_id] if row.group_id is not None else default_group_ids
            stat = stats.get(row.id)
            items.append(
                LessonQuizSummaryItem(
                    quiz_id=row.id,
                    submitted_count=int(stat.submitted) if stat else 0,
                    total_students=await students_in(group_ids),
                    average_grade=round(float(stat.average), 2) if stat and stat.average is not None else None,
                )
            )
        return LessonQuizSummaryResponse(lesson_id=lesson_id, items=items)

    async def list_quizzes(
        self, session: AsyncSession, request: QuizListRequest, current_user: User
    ) -> QuizListResponse:
        # `selectinload` — ikkita qo'shimcha so'rov, lekin sahifadagi 15-20 qator
        # uchun bu arzon; usiz `quiz.subject` ga murojaat async sessiyada
        # MissingGreenlet beradi.
        stmt = select(Quiz).options(selectinload(Quiz.subject), selectinload(Quiz.group))

        # Bootstrap-админ несёт сразу три роли (Admin + Teacher + Student), а строки
        # в `students` у него нет. Без admin-гарда студенческая ветка ниже схлопывала
        # его выдачу в пустой список, хотя тесты в базе есть.
        is_admin = any(role.name.lower() == "admin" for role in current_user.roles)
        is_teacher = not is_admin and any(role.name.lower() == "teacher" for role in current_user.roles)
        is_student = not is_admin and any(role.name.lower() == "student" for role in current_user.roles)
        teacher_filter = None
        student_group_id = None

        # Students always see quizzes for their group — even if they also have a Teacher role
        if is_student:
            student_stmt = select(Student.group_id).where(Student.user_id == current_user.id)
            student_result = await session.execute(student_stmt)
            student_group_id = student_result.scalar_one_or_none()
            if student_group_id:
                stmt = stmt.where(self._visible_to_student(student_group_id))
            else:
                stmt = stmt.where(Quiz.id == -1)  # no group → no quizzes

        elif is_teacher:
            # Check teacher's groups
            gt_stmt = (
                select(TeacherGroup.group_id)
                .join(Teacher, Teacher.id == TeacherGroup.teacher_id)
                .where(Teacher.user_id == current_user.id)
            )
            gt_result = await session.execute(gt_stmt)
            allowed_group_ids = gt_result.scalars().all()

            # Check teacher's subjects
            st_stmt = (
                select(TeacherSubject.subject_id)
                .join(Teacher, Teacher.id == TeacherSubject.teacher_id)
                .where(Teacher.user_id == current_user.id)
            )
            st_result = await session.execute(st_stmt)
            allowed_subject_ids = st_result.scalars().all()

            # Тесты, собранные из банка этого преподавателя, видны ему всегда —
            # даже если предмет или группа за ним формально не закреплены. Раньше
            # видимость держалась на TeacherGroup, который создавался побочным
            # эффектом создания теста; теперь тест создаёт организатор, и такая
            # связка не появляется.
            # Oraliq nazorat — kursniki: assistent ham ko'radi.
            managed_courses = await manageable_course_ids(session, current_user)
            conditions = [
                Quiz.lecturer_id == current_user.id,
                Quiz.course_id.in_(select(managed_courses.c[0])),
            ]
            if allowed_group_ids:
                conditions.append(Quiz.group_id.in_(allowed_group_ids))
            if allowed_subject_ids:
                conditions.append(Quiz.subject_id.in_(allowed_subject_ids))

            teacher_filter = or_(*conditions)
            stmt = stmt.where(teacher_filter)

        if request.title:
            stmt = stmt.where(Quiz.title.ilike(f"%{request.title}%"))

        if request.user_id:
            stmt = stmt.where(Quiz.lecturer_id == request.user_id)

        if request.created_by_user_id:
            stmt = stmt.where(Quiz.created_by_user_id == request.created_by_user_id)

        if request.group_id:
            stmt = stmt.where(Quiz.group_id == request.group_id)

        if request.subject_id:
            stmt = stmt.where(Quiz.subject_id == request.subject_id)

        if request.lesson_id:
            stmt = stmt.where(Quiz.lesson_id == request.lesson_id)

        if request.course_id:
            stmt = stmt.where(Quiz.course_id == request.course_id)

        if request.without_lesson:
            # Faqat dars testi: semestr yakuni va kursdan kursga o'tish
            # testlari darsga umuman biriktirilmaydi, ular «egasiz» emas.
            stmt = stmt.where(Quiz.lesson_id.is_(None), Quiz.quiz_type == QuizType.LESSON_QUIZ.value)

        if request.has_lesson is not None:
            stmt = stmt.where(
                Quiz.lesson_id.isnot(None) if request.has_lesson else Quiz.lesson_id.is_(None)
            )

        if request.faculty_id:
            stmt = stmt.join(Group, Group.id == Quiz.group_id).where(Group.faculty_id == request.faculty_id)

        if request.is_active is not None:
            stmt = stmt.where(Quiz.is_active == request.is_active)

        if request.quiz_type:
            stmt = stmt.where(Quiz.quiz_type == request.quiz_type.value)

        # Always prioritize active quizzes first, then sort by date
        sort_field = (
            asc(Quiz.created_at) if request.sort_dir and request.sort_dir.lower() == "asc" else desc(Quiz.created_at)
        )
        stmt = stmt.order_by(desc(Quiz.is_active), sort_field)

        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        quizzes = result.scalars().all()

        count_stmt = select(func.count()).select_from(Quiz)

        if is_student:
            if student_group_id:
                count_stmt = count_stmt.where(self._visible_to_student(student_group_id))
            else:
                count_stmt = count_stmt.where(Quiz.id == -1)
        elif is_teacher and teacher_filter is not None:
            count_stmt = count_stmt.where(teacher_filter)

        if request.title:
            count_stmt = count_stmt.where(Quiz.title.ilike(f"%{request.title}%"))
        if request.user_id:
            count_stmt = count_stmt.where(Quiz.lecturer_id == request.user_id)
        if request.created_by_user_id:
            count_stmt = count_stmt.where(Quiz.created_by_user_id == request.created_by_user_id)
        if request.group_id:
            count_stmt = count_stmt.where(Quiz.group_id == request.group_id)
        if request.subject_id:
            count_stmt = count_stmt.where(Quiz.subject_id == request.subject_id)
        if request.lesson_id:
            count_stmt = count_stmt.where(Quiz.lesson_id == request.lesson_id)
        if request.course_id:
            count_stmt = count_stmt.where(Quiz.course_id == request.course_id)
        if request.without_lesson:
            count_stmt = count_stmt.where(Quiz.lesson_id.is_(None), Quiz.quiz_type == QuizType.LESSON_QUIZ.value)
        if request.has_lesson is not None:
            count_stmt = count_stmt.where(
                Quiz.lesson_id.isnot(None) if request.has_lesson else Quiz.lesson_id.is_(None)
            )
        if request.faculty_id:
            count_stmt = count_stmt.join(Group, Group.id == Quiz.group_id).where(Group.faculty_id == request.faculty_id)
        if request.is_active is not None:
            count_stmt = count_stmt.where(Quiz.is_active == request.is_active)
        if request.quiz_type:
            count_stmt = count_stmt.where(Quiz.quiz_type == request.quiz_type.value)

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        self._attach_names(list(quizzes))
        await self._attach_midterm_info(session, list(quizzes))

        return QuizListResponse(total=total, page=request.page, limit=request.limit, quizzes=quizzes)

    async def update_quiz(
        self,
        session: AsyncSession,
        quiz_id: int,
        data: QuizCreateRequest,
        current_user: User | None = None,
    ) -> Quiz:
        stmt = select(Quiz).where(Quiz.id == quiz_id)
        result = await session.execute(stmt)
        quiz = result.scalar_one_or_none()

        if not quiz:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")

        # Oraliq nazorat turini umumiy tahrirlash oynasi bilmaydi va boshqa
        # tur yuborishi mumkin — u baribir kurs testi bo'lib qoladi.
        is_midterm = quiz.quiz_type == QuizType.MIDTERM.value or data.quiz_type == QuizType.MIDTERM
        if is_midterm:
            data.quiz_type = QuizType.MIDTERM
            if data.course_id is None:
                data.course_id = quiz.course_id
            if quiz.lecturer_id is not None:
                data.lecturer_id = data.user_id = quiz.lecturer_id
            # Umumiy tahrirlash oynasi va «Faol» tugmasi turni yubormaydi.
            if data.control_type is None and quiz.control_type in ControlType._value2member_map_:
                data.control_type = ControlType(quiz.control_type)
            data = await self._fill_from_course(session, data, current_user)
            quiz.course_id = data.course_id
            quiz.control_type = data.control_type.value if data.control_type else None
            # Tanlov berilmagan bo'lsa ham sinxronlanadi: darsdagi savollar
            # tahrirlash/o'chirish bilan o'zgargan bo'lishi mumkin.
            lesson_ids = data.lesson_ids
            if lesson_ids is None:
                lesson_ids = list(
                    (await session.execute(select(QuizLesson.lesson_id).where(QuizLesson.quiz_id == quiz.id)))
                    .scalars()
                    .all()
                )
            await self._sync_midterm(session, quiz, lesson_ids)

        # Смена лектора после создания запрещена: вопросы подобраны в quiz_questions
        # один раз, при создании, и молча разошлись бы с новым лектором — тест
        # остался бы собран из банка прежнего. Пересборка набора вопросов затёрла бы
        # уже выданные попытки, поэтому правильный путь — создать тест заново.
        if data.lecturer_id is not None and quiz.lecturer_id is not None and data.lecturer_id != quiz.lecturer_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "lecturer_change_forbidden",
                    "message": (
                        "Testni yaratgandan keyin o'qituvchini o'zgartirish mumkin emas: "
                        "savollar uning bankidan yig'ilgan. Yangi test yarating."
                    ),
                },
            )

        # Заполнить пустого лектора у старого теста можно — это не меняет уже
        # подобранный набор вопросов, а только фиксирует, кому он принадлежит.
        if quiz.lecturer_id is None and data.lecturer_id is not None:
            quiz.lecturer_id = data.lecturer_id

        # Активный тест обязан иметь достаточно вопросов. Считаем именно связанные
        # с тестом активные вопросы, а не банк лектора: набор фиксируется при
        # создании, и вопрос могли удалить уже после этого.
        if data.is_active:
            linked = (
                await session.execute(
                    select(func.count())
                    .select_from(QuizQuestion)
                    .join(Question, Question.id == QuizQuestion.question_id)
                    .where(
                        QuizQuestion.quiz_id == quiz_id,
                        Question.is_active.is_(True),
                    )
                )
            ).scalar() or 0
            if linked < data.question_number:
                raise self._not_enough_questions(linked, data.question_number)

        quiz.title = data.title or await self.build_title(
            session,
            subject_id=data.subject_id,
            group_id=data.group_id,
            semester_number=data.semester_number,
            created_at=quiz.created_at,
        )
        quiz.question_number = data.question_number
        quiz.duration = data.duration
        quiz.pin = data.pin
        quiz.is_active = data.is_active
        quiz.proctoring_mode = data.proctoring_mode
        if data.strict_mode is not None:
            quiz.strict_mode = data.strict_mode
        quiz.quiz_type = data.quiz_type.value
        quiz.group_id = data.group_id
        quiz.subject_id = data.subject_id
        # Darsga bog'lanish faqat aniq berilganda o'zgaradi: umumiy tahrirlash
        # oynasida `lesson_id` yuborilmaydi va test darsdan uzilib qolmasligi kerak.
        if data.lesson_id is not None:
            quiz.lesson_id = data.lesson_id

        await session.commit()
        await session.refresh(quiz)
        await self._attach_midterm_info(session, [quiz])
        return quiz

    async def remove_midterm_question(
        self, session: AsyncSession, quiz_id: int, question_id: int, current_user: User
    ) -> None:
        """Oraliq nazoratga alohida qo'shilgan savolni olib tashlaydi.

        Savol faqat shu test uchun yozilgan, shuning uchun boshqa testda
        ishlatilmasa — bankdan ham olinadi (soft delete). Darsdan kelgan
        savol bu yo'l bilan olinmaydi: u darsni tanlovdan chiqarish bilan
        ketadi. «Test savollari» dagi savol ham — u o'sha bo'limda boshqariladi
        va kursning shu turdagi barcha nazoratlariga tegishli.
        """
        quiz = await session.get(Quiz, quiz_id)
        if quiz is None or quiz.quiz_type != QuizType.MIDTERM.value:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Oraliq nazorat topilmadi")
        course = await session.get(Course, quiz.course_id) if quiz.course_id else None
        if course is None or not await can_manage(session, course, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu kurs sizga biriktirilmagan")

        question = await session.get(Question, question_id)
        if question is None or question.lesson_id is not None or question.control_type is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savol topilmadi")

        await session.execute(
            QuizQuestion.__table__.delete().where(
                QuizQuestion.quiz_id == quiz_id, QuizQuestion.question_id == question_id
            )
        )
        elsewhere = await session.scalar(
            select(QuizQuestion.id).where(QuizQuestion.question_id == question_id).limit(1)
        )
        if elsewhere is None:
            question.is_active = False
        await session.commit()

    async def delete_quiz(self, session: AsyncSession, quiz_id: int, force: bool = False) -> None:
        from sqlalchemy import delete as sa_delete

        from app.modules.quiz.model import Result

        stmt = select(Quiz).where(Quiz.id == quiz_id)
        result = await session.execute(stmt)
        quiz = result.scalar_one_or_none()

        if not quiz:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")

        if not force:
            result_count = (
                await session.execute(select(func.count(Result.id)).where(Result.quiz_id == quiz_id))
            ).scalar() or 0
            if result_count > 0:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "requires_confirmation": True,
                        "message": "Ushbu testni o'chirish quyidagi bog'langan ma'lumotlarga ta'sir qiladi:",
                        "warnings": [f"{result_count} ta talaba natijalari (ballari) butunlay o'chib ketadi"],
                    },
                )

        # Cascade-delete all results linked to this quiz before deleting the quiz
        await session.execute(sa_delete(Result).where(Result.quiz_id == quiz_id))

        await session.delete(quiz)
        await session.commit()

    async def repeat_quiz(self, session: AsyncSession, quiz_id: int, created_by_user_id: int) -> Quiz:
        import random

        stmt = (
            select(Quiz)
            .options(selectinload(Quiz.quiz_questions).selectinload(QuizQuestion.question))
            .where(Quiz.id == quiz_id)
        )
        result = await session.execute(stmt)
        quiz = result.scalar_one_or_none()

        if not quiz:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")

        new_quiz = Quiz(
            title=quiz.title,
            question_number=quiz.question_number,
            duration=quiz.duration,
            pin=str(random.randint(1000, 9999)),  # Generate a new 4-digit PIN
            is_active=quiz.is_active,
            proctoring_mode=quiz.proctoring_mode,
            strict_mode=quiz.strict_mode,
            quiz_type=quiz.quiz_type,
            # Банк вопросов остаётся лекторским, а пересдачу выдаёт организатор —
            # поэтому лектор наследуется, а создатель берётся текущий.
            lecturer_id=quiz.lecturer_id,
            created_by_user_id=created_by_user_id,
            group_id=quiz.group_id,
            subject_id=quiz.subject_id,
            # Qayta topshirish o'sha darsniki bo'lib qoladi.
            lesson_id=quiz.lesson_id,
            course_id=quiz.course_id,
            attempt=2,
        )
        session.add(new_quiz)
        await session.flush()

        for lesson_id in (
            await session.execute(select(QuizLesson.lesson_id).where(QuizLesson.quiz_id == quiz.id))
        ).scalars():
            session.add(QuizLesson(quiz_id=new_quiz.id, lesson_id=lesson_id))

        for qq in quiz.quiz_questions:
            if qq.question:
                new_qq = QuizQuestion(quiz_id=new_quiz.id, question_id=qq.question_id)
                session.add(new_qq)

        # Связка TeacherGroup здесь тоже не создаётся — см. комментарий в create_quiz.

        try:
            await session.commit()
            await session.refresh(new_quiz)
        except Exception:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )
        return new_quiz

    async def upload_image(self, session: AsyncSession, file, current_user) -> str:
        """Test rasmini yuklaydi — savol rasmlari bilan bir papkada."""
        stored, _ = await store_upload(
            session,
            file,
            owner_user_id=current_user.id if current_user else None,
            subdir="question",
        )
        await session.commit()
        await session.refresh(stored, ["blob"])
        return public_url(stored.blob.stored_path)


get_quiz_repository = QuizRepository()
