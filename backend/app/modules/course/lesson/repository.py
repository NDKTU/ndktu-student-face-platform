import logging
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.schemas import TASHKENT_TZ
from app.core.utils.course_access import can_manage, manageable_course_ids
from app.core.utils.lesson_scope import visible_to_group
from app.modules.auth.model import Student, Teacher, TeacherSubject, User
from app.modules.course.course.repository import get_course_repository
from app.modules.course.model import Course, CourseGroup, CourseTopic, Homework, HomeworkSubmission, Lesson
from app.modules.organization_structure.model import TeacherGroup

from .schemas import (
    LessonCreateRequest,
    LessonListRequest,
    LessonListResponse,
    LessonUpdateRequest,
)

logger = logging.getLogger(__name__)


class LessonRepository:
    async def _is_role(self, user: User, role_name: str) -> bool:
        return any(r.name.lower() == role_name for r in user.roles)

    async def _resolve_course_context(
        self,
        session: AsyncSession,
        course_id: int,
        current_user: User,
        group_id: int | None,
        is_admin: bool,
    ) -> tuple[Course, TeacherSubject, int | None]:
        course = await get_course_repository.get_course_orm(session, course_id)
        if not is_admin and not await can_manage(session, course, current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Faqat kurs oʻqituvchilari yoki admin dars qoʻsha oladi",
            )

        course_group_stmt = select(CourseGroup.group_id).where(CourseGroup.course_id == course.id)
        course_group_ids = set((await session.execute(course_group_stmt)).scalars().all())
        if not course_group_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Course has no groups: add a group to the Course first",
            )
        # Guruh so'ralmaydi: dars butun kursniki, ya'ni uning barcha
        # guruhlariniki. Ilgari bir nechta guruhli kursda 400 qaytarilardi va
        # o'qituvchi bir xil darsni har guruhga qayta yozishga majbur edi.
        # Guruh ataylab ko'rsatilsa — faqat o'sha guruhga tegishli bo'ladi.
        if group_id is not None and group_id not in course_group_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="group_id does not belong to this Course",
            )

        teacher_subject = await get_course_repository.get_or_create_teacher_subject_for_course(session, course)
        return course, teacher_subject, group_id

    async def _validate_topic(self, session: AsyncSession, course_id: int, topic_id: int | None) -> None:
        if topic_id is None:
            return
        topic = (
            await session.execute(
                select(CourseTopic.id).where(CourseTopic.id == topic_id, CourseTopic.course_id == course_id)
            )
        ).scalar_one_or_none()
        if topic is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Topic does not belong to this Course")

    # ── Lessons ──────────────────────────────────────────────────────────────

    async def create_lesson(
        self,
        session: AsyncSession,
        data: LessonCreateRequest,
        current_user: User,
    ) -> Lesson:
        is_admin = await self._is_role(current_user, "admin")

        _, teacher_subject, group_id = await self._resolve_course_context(
            session, data.course_id, current_user, data.group_id, is_admin
        )
        await self._validate_topic(session, data.course_id, data.topic_id)

        new_lesson = Lesson(
            teacher_subject_id=teacher_subject.id,
            group_id=group_id,
            course_id=data.course_id,
            topic_id=data.topic_id,
            lesson_type=data.lesson_type,
            topic=data.topic,
            # Форма дарса даты не спрашивает: занятие заводят в день проведения.
            date=data.date or datetime.now(TASHKENT_TZ).date(),
            description=data.description,
            face_check_enabled=data.face_check_enabled,
        )
        session.add(new_lesson)

        try:
            await session.commit()
            await session.refresh(new_lesson)
        except Exception as e:
            await session.rollback()
            logger.error(f"Error creating lesson: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(e)}",
            )

        return await self.get_lesson(session=session, lesson_id=new_lesson.id)

    async def get_lesson(self, session: AsyncSession, lesson_id: int) -> Lesson:
        stmt = (
            select(Lesson)
            .options(
                selectinload(Lesson.teacher_subject).selectinload(TeacherSubject.subject),
                selectinload(Lesson.group),
                selectinload(Lesson.course_topic),
                selectinload(Lesson.resources),
            )
            .where(Lesson.id == lesson_id)
        )
        result = await session.execute(stmt)
        lesson = result.scalar_one_or_none()

        if not lesson:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")

        return lesson

    async def list_lessons(
        self,
        session: AsyncSession,
        request: LessonListRequest,
        current_user: User,
    ) -> LessonListResponse:
        stmt = select(Lesson).options(
            selectinload(Lesson.teacher_subject).selectinload(TeacherSubject.subject),
            selectinload(Lesson.group),
            selectinload(Lesson.course_topic),
            selectinload(Lesson.resources),
        )

        is_admin = await self._is_role(current_user, "admin")
        is_teacher = await self._is_role(current_user, "teacher")
        is_student = await self._is_role(current_user, "student")
        role_filter = None

        if is_admin:
            pass
        elif is_teacher:
            gt_stmt = (
                select(TeacherGroup.group_id)
                .join(Teacher, Teacher.id == TeacherGroup.teacher_id)
                .where(Teacher.user_id == current_user.id)
            )
            allowed_group_ids = (await session.execute(gt_stmt)).scalars().all()

            ts_stmt = (
                select(TeacherSubject.id)
                .join(Teacher, Teacher.id == TeacherSubject.teacher_id)
                .where(Teacher.user_id == current_user.id)
            )
            allowed_teacher_subject_ids = (await session.execute(ts_stmt)).scalars().all()

            # Butun kursga yozilgan (guruhsiz) darslar guruh ro'yxatiga
            # tushmaydi — ularni kursning o'zi bo'yicha qo'shamiz, aks holda
            # assistent o'zi dars beradigan kursning darsini ko'rmasdi.
            manageable = await manageable_course_ids(session, current_user)

            conditions = [Lesson.course_id.in_(select(manageable.c.id))]
            if allowed_group_ids:
                conditions.append(Lesson.group_id.in_(allowed_group_ids))
            if allowed_teacher_subject_ids:
                conditions.append(Lesson.teacher_subject_id.in_(allowed_teacher_subject_ids))
            role_filter = or_(*conditions)
        elif is_student:
            student_stmt = select(Student.group_id).where(Student.user_id == current_user.id)
            student_group_id = (await session.execute(student_stmt)).scalar_one_or_none()
            if student_group_id:
                role_filter = visible_to_group(student_group_id)
            else:
                role_filter = Lesson.id == -1

        if role_filter is not None:
            stmt = stmt.where(role_filter)

        if request.teacher_subject_id:
            stmt = stmt.where(Lesson.teacher_subject_id == request.teacher_subject_id)
        if request.group_id:
            stmt = stmt.where(visible_to_group(request.group_id))
        if request.course_id is not None:
            stmt = stmt.where(Lesson.course_id == request.course_id)
        if request.date_from:
            stmt = stmt.where(Lesson.date >= request.date_from)
        if request.date_to:
            stmt = stmt.where(Lesson.date <= request.date_to)

        if request.course_id is not None:
            stmt = stmt.outerjoin(CourseTopic, CourseTopic.id == Lesson.topic_id).order_by(
                CourseTopic.order_index.asc().nullslast(), Lesson.id.asc()
            )
        else:
            stmt = stmt.order_by(desc(Lesson.date), desc(Lesson.id))
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        lessons = result.scalars().all()

        count_stmt = select(func.count()).select_from(Lesson)
        if role_filter is not None:
            count_stmt = count_stmt.where(role_filter)
        if request.teacher_subject_id:
            count_stmt = count_stmt.where(Lesson.teacher_subject_id == request.teacher_subject_id)
        if request.group_id:
            count_stmt = count_stmt.where(visible_to_group(request.group_id))
        if request.course_id is not None:
            count_stmt = count_stmt.where(Lesson.course_id == request.course_id)
        if request.date_from:
            count_stmt = count_stmt.where(Lesson.date >= request.date_from)
        if request.date_to:
            count_stmt = count_stmt.where(Lesson.date <= request.date_to)

        total = (await session.execute(count_stmt)).scalar() or 0

        return LessonListResponse(total=total, page=request.page, limit=request.limit, lessons=lessons)

    async def update_lesson(
        self,
        session: AsyncSession,
        lesson_id: int,
        data: LessonUpdateRequest,
        current_user: User,
    ) -> Lesson:
        lesson = await self.get_lesson(session=session, lesson_id=lesson_id)

        is_admin = await self._is_role(current_user, "admin")

        if not is_admin and not await get_course_repository.user_owns_course(
            session, lesson.course_id, current_user.id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Teacher is not the owner of this Course",
            )

        if data.teacher_subject_id is not None:
            lesson.teacher_subject_id = data.teacher_subject_id
        if data.group_id is not None:
            lesson.group_id = data.group_id
        if data.topic_id is not None:
            await self._validate_topic(session, data.course_id or lesson.course_id, data.topic_id)
            lesson.topic_id = data.topic_id
        if data.lesson_type is not None:
            lesson.lesson_type = data.lesson_type
        if data.face_check_enabled is not None:
            lesson.face_check_enabled = data.face_check_enabled
        if data.topic is not None:
            lesson.topic = data.topic
        if data.date is not None:
            lesson.date = data.date
        if data.description is not None:
            lesson.description = data.description

        try:
            await session.commit()
            await session.refresh(lesson)
        except Exception as e:
            await session.rollback()
            logger.error(f"Error updating lesson: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(e)}",
            )

        return await self.get_lesson(session=session, lesson_id=lesson.id)

    async def delete_lesson(
        self,
        session: AsyncSession,
        lesson_id: int,
        current_user: User,
        force: bool = False,
    ) -> None:
        lesson = await self.get_lesson(session=session, lesson_id=lesson_id)

        is_admin = await self._is_role(current_user, "admin")

        if not is_admin and not await get_course_repository.user_owns_course(
            session, lesson.course_id, current_user.id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Teacher is not the owner of this Course",
            )

        # Vazifalar dars bilan birga o'chadi (FK CASCADE). Talabalar ish
        # topshirgan bo'lsa, baholar ham yo'qoladi — bu haqda oldindan
        # ogohlantiramiz va tasdiqni so'raymiz.
        if not force:
            homework_count = (
                await session.execute(select(func.count(Homework.id)).where(Homework.lesson_id == lesson_id))
            ).scalar() or 0
            if homework_count:
                submission_count = (
                    await session.execute(
                        select(func.count(HomeworkSubmission.id))
                        .join(Homework, Homework.id == HomeworkSubmission.homework_id)
                        .where(Homework.lesson_id == lesson_id)
                    )
                ).scalar() or 0
                warnings = [f"{homework_count} ta uy vazifasi o'chib ketadi"]
                if submission_count:
                    warnings.append(f"{submission_count} ta topshirilgan ish va ularning baholari o'chadi")
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "requires_confirmation": True,
                        "message": "Ushbu darsni o'chirish quyidagi bog'langan ma'lumotlarga ta'sir qiladi:",
                        "warnings": warnings,
                    },
                )

        await session.delete(lesson)
        await session.commit()


get_lesson_repository = LessonRepository()
