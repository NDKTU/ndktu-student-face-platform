import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.auth.model import Employee, Student, Teacher, User
from app.modules.course.model import Course, CourseGroup, CourseTopic, Lesson
from app.modules.organization_structure.model import Group, Kafedra
from app.modules.quiz.model import Subject, SubjectTeacher

from .schemas import (
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
    CourseTeacherSummary,
    CourseTeacherSummaryResponse,
    CourseUpdateRequest,
)

logger = logging.getLogger(__name__)


class CourseRepository:
    @staticmethod
    def _role_names(user: User) -> set[str]:
        return {role.name.lower() for role in (user.roles or [])}

    async def _ensure_view_access(self, session: AsyncSession, course: Course, current_user: User) -> None:
        """Allow admins, the owning teacher, and students enrolled in a course group."""
        roles = self._role_names(current_user)
        if "admin" in roles or course.teacher_id == current_user.id:
            return

        if "student" in roles:
            enrollment = await session.execute(
                select(Student.id)
                .join(CourseGroup, CourseGroup.group_id == Student.group_id)
                .where(CourseGroup.course_id == course.id, Student.user_id == current_user.id)
            )
            if enrollment.scalar_one_or_none() is not None:
                return

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this Course")

    async def list_teacher_summaries(
        self,
        session: AsyncSession,
        current_user: User,
        restrict_to_teacher: bool,
        search: str | None = None,
        faculty_id: int | None = None,
        kafedra_id: int | None = None,
    ) -> CourseTeacherSummaryResponse:
        """Aggregate course/lesson totals for the teacher-first catalogue."""
        stmt = (
            select(
                Course.teacher_id,
                User.username,
                Employee.full_name,
                Kafedra.id.label("kafedra_id"),
                Kafedra.name.label("kafedra_name"),
                func.count(func.distinct(Course.id)).label("course_count"),
                func.count(func.distinct(Lesson.id)).label("lesson_count"),
            )
            .join(User, User.id == Course.teacher_id)
            .outerjoin(Employee, Employee.user_id == User.id)
            .outerjoin(Teacher, Teacher.employee_id == Employee.id)
            .outerjoin(Kafedra, Kafedra.id == Teacher.kafedra_id)
            .outerjoin(Lesson, Lesson.course_id == Course.id)
        )
        if restrict_to_teacher:
            stmt = stmt.where(Course.teacher_id == current_user.id)
        if faculty_id is not None:
            stmt = stmt.where(Course.faculty_id == faculty_id)
        if kafedra_id is not None:
            stmt = stmt.where(Course.kafedra_id == kafedra_id)
        if search:
            pattern = f"%{search}%"
            stmt = stmt.where(or_(Employee.full_name.ilike(pattern), User.username.ilike(pattern)))

        stmt = stmt.group_by(
            Course.teacher_id,
            User.username,
            Employee.full_name,
            Kafedra.id,
            Kafedra.name,
        ).order_by(Employee.full_name.asc().nullslast(), User.username.asc())
        rows = (await session.execute(stmt)).all()
        return CourseTeacherSummaryResponse(
            teachers=[
                CourseTeacherSummary(
                    teacher_id=row.teacher_id,
                    username=row.username,
                    full_name=row.full_name,
                    kafedra_id=row.kafedra_id,
                    kafedra_name=row.kafedra_name,
                    course_count=row.course_count,
                    lesson_count=row.lesson_count,
                )
                for row in rows
            ]
        )

    async def _ensure_user_exists(self, session: AsyncSession, user_id: int) -> None:
        if (await session.execute(select(User.id).where(User.id == user_id))).scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Teacher user {user_id} not found")

    async def _ensure_subject_exists(self, session: AsyncSession, subject_id: int) -> None:
        if (await session.execute(select(Subject.id).where(Subject.id == subject_id))).scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Subject {subject_id} not found")

    async def _build_course_name(
        self,
        session: AsyncSession,
        subject_id: int,
        group_ids: list[int],
        semester_number: int | None,
    ) -> str:
        """Собирает название курса: «Фан — 101-19, 102-19 (1-semestr)».

        Руками его больше не печатают: оно однозначно следует из предмета, групп
        и семестра, а расхождения в написании только мешали искать курс.
        """
        subject_name = (
            await session.execute(select(Subject.name).where(Subject.id == subject_id))
        ).scalar_one_or_none() or "Kurs"

        group_names: list[str] = []
        if group_ids:
            group_names = list(
                (
                    await session.execute(select(Group.name).where(Group.id.in_(group_ids)).order_by(Group.name))
                )
                .scalars()
                .all()
            )

        name = subject_name
        if group_names:
            # Курс на весь поток перечислять целиком незачем — колонка всего 255
            # символов, а название должно читаться в строке таблицы.
            shown = ", ".join(group_names[:3])
            if len(group_names) > 3:
                shown = f"{shown} +{len(group_names) - 3}"
            name = f"{name} — {shown}"
        if semester_number:
            name = f"{name} ({semester_number}-semestr)"
        return name[:255]

    async def _derive_org_fields(
        self,
        session: AsyncSession,
        subject_id: int,
        group_ids: list[int],
    ) -> tuple[int | None, int | None, int | None]:
        """Выводит факультет, кафедру и направление из предмета и групп курса.

        Раньше их выбирали тремя отдельными полями формы — три вопроса к тому,
        что и так однозначно следует из предмета и групп. Колонки остались:
        на них смотрят фильтры списка курсов и подпись в таблице.
        """
        kafedra_id = (
            await session.execute(select(Subject.kafedra_id).where(Subject.id == subject_id))
        ).scalar_one_or_none()

        faculty_id: int | None = None
        speciality_id: int | None = None
        if group_ids:
            rows = (
                await session.execute(select(Group.faculty_id, Group.speciality_id).where(Group.id.in_(group_ids)))
            ).all()
            faculties = {row.faculty_id for row in rows if row.faculty_id}
            specialities = {row.speciality_id for row in rows if row.speciality_id}
            # Группы курса бывают с разных факультетов и направлений — тогда
            # единого значения не существует и колонка честно остаётся пустой.
            faculty_id = faculties.pop() if len(faculties) == 1 else None
            speciality_id = specialities.pop() if len(specialities) == 1 else None

        if faculty_id is None and kafedra_id is not None:
            faculty_id = (
                await session.execute(select(Kafedra.faculty_id).where(Kafedra.id == kafedra_id))
            ).scalar_one_or_none()

        return faculty_id, kafedra_id, speciality_id

    async def _serialize(self, session: AsyncSession, course: Course) -> CourseResponse:
        teacher_full_name_stmt = select(Employee.full_name).where(Employee.user_id == course.teacher_id)
        teacher_full_name = (await session.execute(teacher_full_name_stmt)).scalar_one_or_none()
        lesson_count = (
            await session.execute(select(func.count(Lesson.id)).where(Lesson.course_id == course.id))
        ).scalar() or 0
        topic_count = (
            await session.execute(select(func.count(CourseTopic.id)).where(CourseTopic.course_id == course.id))
        ).scalar() or 0

        return CourseResponse(
            id=course.id,
            name=course.name,
            description=course.description,
            subject_id=course.subject_id,
            teacher_id=course.teacher_id,
            semester_number=course.semester_number,
            faculty_id=course.faculty_id,
            kafedra_id=course.kafedra_id,
            speciality_id=course.speciality_id,
            subject=CourseSubjectInfo.model_validate(course.subject) if course.subject else None,
            teacher=CourseTeacherInfo(
                id=course.teacher.id,
                username=course.teacher.username,
                full_name=teacher_full_name,
            )
            if course.teacher
            else None,
            faculty=CourseFacultyInfo.model_validate(course.faculty) if course.faculty else None,
            kafedra=CourseKafedraInfo.model_validate(course.kafedra) if course.kafedra else None,
            speciality=CourseSpecialityInfo.model_validate(course.speciality) if course.speciality else None,
            groups=[CourseGroupInfo.model_validate(g) for g in course.groups],
            topic_count=topic_count,
            lesson_count=lesson_count,
            created_at=course.created_at,
            updated_at=course.updated_at,
        )

    async def _load_with_relations(self, session: AsyncSession, course_id: int) -> Course:
        stmt = (
            select(Course)
            .options(
                selectinload(Course.subject),
                selectinload(Course.teacher),
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

        group_ids = sorted(set(data.group_ids))
        derived_faculty_id, derived_kafedra_id, derived_speciality_id = await self._derive_org_fields(
            session, data.subject_id, group_ids
        )

        course = Course(
            name=data.name
            or await self._build_course_name(session, data.subject_id, group_ids, data.semester_number),
            subject_id=data.subject_id,
            teacher_id=data.teacher_id,
            description=data.description,
            semester_number=data.semester_number,
            faculty_id=data.faculty_id if data.faculty_id is not None else derived_faculty_id,
            kafedra_id=data.kafedra_id if data.kafedra_id is not None else derived_kafedra_id,
            speciality_id=data.speciality_id if data.speciality_id is not None else derived_speciality_id,
        )
        session.add(course)
        await session.flush()

        for group_id in group_ids:
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

    async def get_course(self, session: AsyncSession, course_id: int, current_user: User) -> CourseResponse:
        course = await self._load_with_relations(session, course_id)
        await self._ensure_view_access(session, course, current_user)
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
            selectinload(Course.groups),
            selectinload(Course.faculty),
            selectinload(Course.kafedra),
            selectinload(Course.speciality),
        )
        count_stmt = select(func.count()).select_from(Course)

        filters = []
        if restrict_to_teacher:
            roles = self._role_names(current_user)
            if "teacher" in roles:
                filters.append(Course.teacher_id == current_user.id)
            elif "student" in roles:
                enrolled_course_ids = (
                    select(CourseGroup.course_id)
                    .join(Student, Student.group_id == CourseGroup.group_id)
                    .where(Student.user_id == current_user.id)
                )
                filters.append(Course.id.in_(enrolled_course_ids))
            else:
                filters.append(Course.teacher_id == current_user.id)
        if request.teacher_id:
            filters.append(Course.teacher_id == request.teacher_id)
        if request.subject_id:
            filters.append(Course.subject_id == request.subject_id)
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

        subject_changed = False
        semester_changed = False

        if data.subject_id is not None and data.subject_id != course.subject_id:
            await self._ensure_subject_exists(session, data.subject_id)
            course.subject_id = data.subject_id
            subject_changed = True
        if data.teacher_id is not None and data.teacher_id != course.teacher_id:
            await self._ensure_user_exists(session, data.teacher_id)
            course.teacher_id = data.teacher_id
        if data.name is not None:
            course.name = data.name
        if data.description is not None:
            course.description = data.description
        if data.semester_number is not None and data.semester_number != course.semester_number:
            course.semester_number = data.semester_number
            semester_changed = True
        if data.faculty_id is not None:
            course.faculty_id = data.faculty_id
        if data.kafedra_id is not None:
            course.kafedra_id = data.kafedra_id
        if data.speciality_id is not None:
            course.speciality_id = data.speciality_id

        groups_changed = False
        final_group_ids = sorted({group.id for group in course.groups})

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

            groups_changed = requested != set(existing)
            final_group_ids = sorted(requested)

        # Название, факультет, кафедра и направление выведены из предмета и групп,
        # поэтому при их смене пересчитываются. Значения, присланные явно (старый
        # фронт, импорт), остаются приоритетными и не затираются.
        if subject_changed or groups_changed:
            derived_faculty_id, derived_kafedra_id, derived_speciality_id = await self._derive_org_fields(
                session, course.subject_id, final_group_ids
            )
            if data.faculty_id is None:
                course.faculty_id = derived_faculty_id
            if data.kafedra_id is None:
                course.kafedra_id = derived_kafedra_id
            if data.speciality_id is None:
                course.speciality_id = derived_speciality_id

        if data.name is None and (subject_changed or groups_changed or semester_changed):
            course.name = await self._build_course_name(
                session, course.subject_id, final_group_ids, course.semester_number
            )

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
            select(Teacher)
            .join(Employee, Teacher.employee_id == Employee.id)
            .where(Employee.user_id == course.teacher_id)
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
