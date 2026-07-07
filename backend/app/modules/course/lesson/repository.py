import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.organization_structure.model import GroupTeacher
from app.modules.course.model import Course, CourseGroup, Lesson, LessonResult
from app.modules.course.course.repository import get_course_repository
from app.modules.auth.model import Employee, Student, Teacher, User
from app.modules.quiz.model import SubjectTeacher

from .schemas import (
    LessonCreateRequest,
    LessonListRequest,
    LessonListResponse,
    LessonResultListResponse,
    LessonResultResponse,
    LessonResultsBulkUpsertRequest,
    LessonUpdateRequest,
)

logger = logging.getLogger(__name__)


class LessonRepository:
    async def _is_role(self, user: User, role_name: str) -> bool:
        return any(r.name.lower() == role_name for r in user.roles)

    async def _teacher_owns_subject_teacher(self, session: AsyncSession, user_id: int, subject_teacher_id: int) -> bool:
        stmt = (
            select(SubjectTeacher.id)
            .join(Teacher, Teacher.id == SubjectTeacher.teacher_id)
            .join(Employee, Teacher.employee_id == Employee.id)
            .where(
                SubjectTeacher.id == subject_teacher_id,
                Employee.user_id == user_id,
            )
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def _teacher_assigned_to_group(self, session: AsyncSession, user_id: int, group_id: int) -> bool:
        stmt = select(GroupTeacher.id).where(
            GroupTeacher.teacher_id == user_id,
            GroupTeacher.group_id == group_id,
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def _check_teacher_access(
        self,
        session: AsyncSession,
        current_user: User,
        subject_teacher_id: int,
        group_id: int,
    ) -> None:
        if not await self._teacher_owns_subject_teacher(session, current_user.id, subject_teacher_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Teacher does not own this subject_teacher",
            )
        if not await self._teacher_assigned_to_group(session, current_user.id, group_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Teacher is not assigned to this group",
            )

    async def _resolve_course_context(
        self,
        session: AsyncSession,
        course_id: int,
        current_user: User,
        group_id: int | None,
        is_admin: bool,
    ) -> tuple[Course, SubjectTeacher, int]:
        course = await get_course_repository.get_course_orm(session, course_id)
        if not is_admin and course.teacher_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Teacher is not the owner of this Course",
            )

        course_group_stmt = select(CourseGroup.group_id).where(CourseGroup.course_id == course.id)
        course_group_ids = set((await session.execute(course_group_stmt)).scalars().all())
        if group_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="group_id is required when creating a lesson in a Course",
            )
        if group_id not in course_group_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="group_id does not belong to this Course",
            )

        subject_teacher = await get_course_repository.get_or_create_subject_teacher_for_course(session, course)
        return course, subject_teacher, group_id

    # ── Lessons ──────────────────────────────────────────────────────────────

    async def create_lesson(
        self,
        session: AsyncSession,
        data: LessonCreateRequest,
        current_user: User,
    ) -> Lesson:
        is_admin = await self._is_role(current_user, "admin")

        _, subject_teacher, _ = await self._resolve_course_context(
            session, data.course_id, current_user, data.group_id, is_admin
        )

        new_lesson = Lesson(
            subject_teacher_id=subject_teacher.id,
            group_id=data.group_id,
            course_id=data.course_id,
            lesson_type=data.lesson_type,
            topic=data.topic,
            date=data.date,
            description=data.description,
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
                selectinload(Lesson.subject_teacher).selectinload(SubjectTeacher.subject),
                selectinload(Lesson.group),
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
            selectinload(Lesson.subject_teacher).selectinload(SubjectTeacher.subject),
            selectinload(Lesson.group),
        )

        is_admin = await self._is_role(current_user, "admin")
        is_teacher = await self._is_role(current_user, "teacher")
        is_student = await self._is_role(current_user, "student")
        role_filter = None

        if is_admin:
            pass
        elif is_teacher:
            gt_stmt = select(GroupTeacher.group_id).where(GroupTeacher.teacher_id == current_user.id)
            allowed_group_ids = (await session.execute(gt_stmt)).scalars().all()

            st_stmt = (
                select(SubjectTeacher.id)
                .join(Teacher, Teacher.id == SubjectTeacher.teacher_id)
                .join(Employee, Teacher.employee_id == Employee.id)
                .where(Employee.user_id == current_user.id)
            )
            allowed_subject_teacher_ids = (await session.execute(st_stmt)).scalars().all()

            conditions = []
            if allowed_group_ids:
                conditions.append(Lesson.group_id.in_(allowed_group_ids))
            if allowed_subject_teacher_ids:
                conditions.append(Lesson.subject_teacher_id.in_(allowed_subject_teacher_ids))
            role_filter = or_(*conditions) if conditions else (Lesson.id == -1)
        elif is_student:
            student_stmt = select(Student.group_id).where(Student.user_id == current_user.id)
            student_group_id = (await session.execute(student_stmt)).scalar_one_or_none()
            if student_group_id:
                role_filter = Lesson.group_id == student_group_id
            else:
                role_filter = Lesson.id == -1

        if role_filter is not None:
            stmt = stmt.where(role_filter)

        if request.subject_teacher_id:
            stmt = stmt.where(Lesson.subject_teacher_id == request.subject_teacher_id)
        if request.group_id:
            stmt = stmt.where(Lesson.group_id == request.group_id)
        if request.course_id is not None:
            stmt = stmt.where(Lesson.course_id == request.course_id)
        if request.date_from:
            stmt = stmt.where(Lesson.date >= request.date_from)
        if request.date_to:
            stmt = stmt.where(Lesson.date <= request.date_to)

        stmt = stmt.order_by(desc(Lesson.date), desc(Lesson.id))
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        lessons = result.scalars().all()

        count_stmt = select(func.count()).select_from(Lesson)
        if role_filter is not None:
            count_stmt = count_stmt.where(role_filter)
        if request.subject_teacher_id:
            count_stmt = count_stmt.where(Lesson.subject_teacher_id == request.subject_teacher_id)
        if request.group_id:
            count_stmt = count_stmt.where(Lesson.group_id == request.group_id)
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

        if not is_admin and not await get_course_repository.user_owns_course(session, lesson.course_id, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Teacher is not the owner of this Course",
            )

        if data.subject_teacher_id is not None:
            lesson.subject_teacher_id = data.subject_teacher_id
        if data.group_id is not None:
            lesson.group_id = data.group_id
        if data.lesson_type is not None:
            lesson.lesson_type = data.lesson_type
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
    ) -> None:
        lesson = await self.get_lesson(session=session, lesson_id=lesson_id)

        is_admin = await self._is_role(current_user, "admin")

        if not is_admin and not await get_course_repository.user_owns_course(session, lesson.course_id, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Teacher is not the owner of this Course",
            )

        await session.delete(lesson)
        await session.commit()

    # ── Lesson results ───────────────────────────────────────────────────────

    async def list_lesson_results(
        self,
        session: AsyncSession,
        lesson_id: int,
        current_user: User,
    ) -> LessonResultListResponse:
        lesson = await self.get_lesson(session=session, lesson_id=lesson_id)

        is_admin = await self._is_role(current_user, "admin")
        is_teacher = await self._is_role(current_user, "teacher")
        is_student = await self._is_role(current_user, "student")

        stmt = select(LessonResult).options(selectinload(LessonResult.user)).where(LessonResult.lesson_id == lesson_id)

        if not is_admin and is_teacher:
            await self._check_teacher_access(session, current_user, lesson.subject_teacher_id, lesson.group_id)
        elif is_student:
            stmt = stmt.where(LessonResult.user_id == current_user.id)

        results = (await session.execute(stmt)).scalars().all()

        return LessonResultListResponse(
            total=len(results),
            results=[LessonResultResponse.model_validate(r) for r in results],
        )

    async def upsert_lesson_results(
        self,
        session: AsyncSession,
        lesson_id: int,
        data: LessonResultsBulkUpsertRequest,
        current_user: User,
    ) -> LessonResultListResponse:
        lesson = await self.get_lesson(session=session, lesson_id=lesson_id)

        is_admin = await self._is_role(current_user, "admin")
        is_teacher = await self._is_role(current_user, "teacher")

        if not is_admin and is_teacher:
            await self._check_teacher_access(session, current_user, lesson.subject_teacher_id, lesson.group_id)
        elif not is_admin and not is_teacher:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins and teachers can record lesson results",
            )

        existing_stmt = select(LessonResult).where(LessonResult.lesson_id == lesson_id)
        existing = {r.user_id: r for r in (await session.execute(existing_stmt)).scalars().all()}

        for item in data.items:
            current = existing.get(item.user_id)
            if current is None:
                session.add(
                    LessonResult(
                        lesson_id=lesson_id,
                        user_id=item.user_id,
                        attendance=item.attendance,
                        grade=item.grade,
                        notes=item.notes,
                    )
                )
            else:
                current.attendance = item.attendance
                current.grade = item.grade
                current.notes = item.notes

        try:
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Error upserting lesson results: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(e)}",
            )

        return await self.list_lesson_results(session=session, lesson_id=lesson_id, current_user=current_user)


get_lesson_repository = LessonRepository()
