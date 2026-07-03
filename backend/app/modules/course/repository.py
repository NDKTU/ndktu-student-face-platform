import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.course.model import Course, CourseGroup
from app.modules.employee.model import Employee
from app.modules.subject.models.subject import Subject
from app.modules.subject.models.subject_teacher import SubjectTeacher
from app.modules.teacher.model import Teacher
from app.modules.user.models.user import User

from .schemas import (
    CourseAcademicYearInfo,
    CourseCreateRequest,
    CourseFacultyInfo,
    CourseGroupInfo,
    CourseKafedraInfo,
    CourseListRequest,
    CourseListResponse,
    CourseResponse,
    CourseSpecialityInfo,
    CourseSubjectInfo,
    CourseTeacherInfo,
    CourseUpdateRequest,
)

logger = logging.getLogger(__name__)


class CourseRepository:
    async def _ensure_user_exists(self, session: AsyncSession, user_id: int) -> None:
        if (await session.execute(select(User.id).where(User.id == user_id))).scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Teacher user {user_id} not found")

    async def _ensure_subject_exists(self, session: AsyncSession, subject_id: int) -> None:
        if (await session.execute(select(Subject.id).where(Subject.id == subject_id))).scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Subject {subject_id} not found")

    async def _serialize(self, session: AsyncSession, course: Course) -> CourseResponse:
        teacher_full_name_stmt = select(Employee.full_name).where(Employee.user_id == course.teacher_id)
        teacher_full_name = (await session.execute(teacher_full_name_stmt)).scalar_one_or_none()

        return CourseResponse(
            id=course.id,
            name=course.name,
            description=course.description,
            subject_id=course.subject_id,
            teacher_id=course.teacher_id,
            academic_year_id=course.academic_year_id,
            semester_number=course.semester_number,
            faculty_id=course.faculty_id,
            kafedra_id=course.kafedra_id,
            speciality_id=course.speciality_id,
            subject=CourseSubjectInfo.model_validate(course.subject) if course.subject else None,
            teacher=CourseTeacherInfo(
                id=course.teacher.id,
                username=course.teacher.username,
                full_name=teacher_full_name,
            ) if course.teacher else None,
            academic_year=CourseAcademicYearInfo.model_validate(course.academic_year) if course.academic_year else None,
            faculty=CourseFacultyInfo.model_validate(course.faculty) if course.faculty else None,
            kafedra=CourseKafedraInfo.model_validate(course.kafedra) if course.kafedra else None,
            speciality=CourseSpecialityInfo.model_validate(course.speciality) if course.speciality else None,
            groups=[CourseGroupInfo.model_validate(g) for g in course.groups],
            created_at=course.created_at,
            updated_at=course.updated_at,
        )

    async def _load_with_relations(self, session: AsyncSession, course_id: int) -> Course:
        stmt = (
            select(Course)
            .options(
                selectinload(Course.subject),
                selectinload(Course.teacher),
                selectinload(Course.academic_year),
                selectinload(Course.groups),
                selectinload(Course.faculty),
                selectinload(Course.kafedra),
                selectinload(Course.speciality),
            )
            .where(Course.id == course_id)
        )
        course = (await session.execute(stmt)).scalar_one_or_none()
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
        return course

    async def create_course(self, session: AsyncSession, data: CourseCreateRequest) -> CourseResponse:
        await self._ensure_subject_exists(session, data.subject_id)
        await self._ensure_user_exists(session, data.teacher_id)

        course = Course(
            name=data.name,
            subject_id=data.subject_id,
            teacher_id=data.teacher_id,
            description=data.description,
            academic_year_id=data.academic_year_id,
            semester_number=data.semester_number,
            faculty_id=data.faculty_id,
            kafedra_id=data.kafedra_id,
            speciality_id=data.speciality_id,
        )
        session.add(course)
        await session.flush()

        for group_id in set(data.group_ids):
            session.add(CourseGroup(course_id=course.id, group_id=group_id))

        try:
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error("Error creating Course: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(e)}",
            )

        loaded = await self._load_with_relations(session, course.id)
        return await self._serialize(session, loaded)

    async def get_course(self, session: AsyncSession, course_id: int) -> CourseResponse:
        course = await self._load_with_relations(session, course_id)
        return await self._serialize(session, course)

    async def list_courses(
        self,
        session: AsyncSession,
        request: CourseListRequest,
        current_user: User,
        restrict_to_teacher: bool,
    ) -> CourseListResponse:
        stmt = select(Course).options(
            selectinload(Course.subject),
            selectinload(Course.teacher),
            selectinload(Course.academic_year),
            selectinload(Course.groups),
            selectinload(Course.faculty),
            selectinload(Course.kafedra),
            selectinload(Course.speciality),
        )
        count_stmt = select(func.count()).select_from(Course)

        filters = []
        if restrict_to_teacher:
            filters.append(Course.teacher_id == current_user.id)
        if request.teacher_id:
            filters.append(Course.teacher_id == request.teacher_id)
        if request.subject_id:
            filters.append(Course.subject_id == request.subject_id)
        if request.academic_year_id:
            filters.append(Course.academic_year_id == request.academic_year_id)
        if request.semester_number:
            filters.append(Course.semester_number == request.semester_number)
        if request.faculty_id:
            filters.append(Course.faculty_id == request.faculty_id)
        if request.kafedra_id:
            filters.append(Course.kafedra_id == request.kafedra_id)
        if request.speciality_id:
            filters.append(Course.speciality_id == request.speciality_id)
        if request.group_id:
            sub = select(CourseGroup.course_id).where(CourseGroup.group_id == request.group_id)
            filters.append(Course.id.in_(sub))

        for f in filters:
            stmt = stmt.where(f)
            count_stmt = count_stmt.where(f)

        stmt = stmt.order_by(desc(Course.id)).offset(request.offset).limit(request.limit)
        courses = (await session.execute(stmt)).scalars().all()
        total = (await session.execute(count_stmt)).scalar() or 0

        items = [await self._serialize(session, c) for c in courses]
        return CourseListResponse(total=total, page=request.page, limit=request.limit, courses=items)

    async def update_course(self, session: AsyncSession, course_id: int, data: CourseUpdateRequest) -> CourseResponse:
        course = await self._load_with_relations(session, course_id)

        if data.subject_id is not None and data.subject_id != course.subject_id:
            await self._ensure_subject_exists(session, data.subject_id)
            course.subject_id = data.subject_id
        if data.teacher_id is not None and data.teacher_id != course.teacher_id:
            await self._ensure_user_exists(session, data.teacher_id)
            course.teacher_id = data.teacher_id
        if data.name is not None:
            course.name = data.name
        if data.description is not None:
            course.description = data.description
        if data.academic_year_id is not None:
            course.academic_year_id = data.academic_year_id
        if data.semester_number is not None:
            course.semester_number = data.semester_number
        if data.faculty_id is not None:
            course.faculty_id = data.faculty_id
        if data.kafedra_id is not None:
            course.kafedra_id = data.kafedra_id
        if data.speciality_id is not None:
            course.speciality_id = data.speciality_id

        if data.group_ids is not None:
            existing_stmt = select(CourseGroup).where(CourseGroup.course_id == course.id)
            existing = {cg.group_id: cg for cg in (await session.execute(existing_stmt)).scalars().all()}
            requested = set(data.group_ids)

            for group_id, cg in existing.items():
                if group_id not in requested:
                    await session.delete(cg)

            for group_id in requested:
                if group_id not in existing:
                    session.add(CourseGroup(course_id=course.id, group_id=group_id))

        try:
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error("Error updating Course: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(e)}",
            )

        loaded = await self._load_with_relations(session, course.id)
        return await self._serialize(session, loaded)

    async def delete_course(self, session: AsyncSession, course_id: int) -> None:
        course = await self._load_with_relations(session, course_id)
        await session.delete(course)
        await session.commit()

    async def user_owns_course(self, session: AsyncSession, course_id: int, user_id: int) -> bool:
        stmt = select(Course.id).where(Course.id == course_id, Course.teacher_id == user_id)
        return (await session.execute(stmt)).scalar_one_or_none() is not None

    async def get_course_orm(self, session: AsyncSession, course_id: int) -> Course:
        return await self._load_with_relations(session, course_id)

    async def get_or_create_subject_teacher_for_course(self, session: AsyncSession, course: Course) -> SubjectTeacher:
        teacher_stmt = (
            select(Teacher).join(Employee, Teacher.employee_id == Employee.id).where(Employee.user_id == course.teacher_id)
        )
        teacher = (await session.execute(teacher_stmt)).scalar_one_or_none()
        if not teacher:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User {course.teacher_id} is not registered as a teacher",
            )

        st_stmt = select(SubjectTeacher).where(
            SubjectTeacher.subject_id == course.subject_id,
            SubjectTeacher.teacher_id == teacher.id,
        )
        subject_teacher = (await session.execute(st_stmt)).scalar_one_or_none()
        if subject_teacher:
            return subject_teacher

        subject_teacher = SubjectTeacher(subject_id=course.subject_id, teacher_id=teacher.id)
        session.add(subject_teacher)
        await session.flush()
        return subject_teacher


get_course_repository = CourseRepository()
