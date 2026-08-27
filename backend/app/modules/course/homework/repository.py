import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.mixins.time_stamp_mixin import to_naive_utc as _to_naive_utc
from app.core.mixins.time_stamp_mixin import utcnow_naive as _utcnow
from app.modules.auth.model import Student, Teacher, User
from app.modules.course.model import Course, CourseGroup, Homework, HomeworkSubmission

from .schemas import (
    HomeworkCreateRequest,
    HomeworkListRequest,
    HomeworkListResponse,
    HomeworkResponse,
    HomeworkStats,
    HomeworkUpdateRequest,
    SubmissionGradeRequest,
    SubmissionListResponse,
    SubmissionResponse,
    SubmissionSubmitRequest,
    SubmissionUserInfo,
)

logger = logging.getLogger(__name__)


class HomeworkRepository:
    async def _is_admin(self, user: User) -> bool:
        return any(r.name.lower() == "admin" for r in (user.roles or []))

    async def _is_student(self, user: User) -> bool:
        return any(r.name.lower() == "student" for r in (user.roles or []))

    async def _check_course_owner(self, session: AsyncSession, course_id: int, user: User) -> Course:
        stmt = select(Course).where(Course.id == course_id)
        course = (await session.execute(stmt)).scalar_one_or_none()
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
        if not await self._is_admin(user) and course.teacher_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Course owner or admin can manage homeworks",
            )
        return course

    async def _student_in_course(self, session: AsyncSession, course_id: int, user_id: int) -> bool:
        stmt = (
            select(Student.id)
            .join(CourseGroup, CourseGroup.group_id == Student.group_id)
            .where(CourseGroup.course_id == course_id, Student.user_id == user_id)
        )
        return (await session.execute(stmt)).scalar_one_or_none() is not None

    async def _serialize_homework(self, session: AsyncSession, a: Homework) -> HomeworkResponse:
        # Stats: count students in course, submitted, graded, late
        total_students_stmt = (
            select(func.count(Student.id))
            .join(CourseGroup, CourseGroup.group_id == Student.group_id)
            .where(CourseGroup.course_id == a.course_id)
        )
        total_students = (await session.execute(total_students_stmt)).scalar() or 0

        sub_counts_stmt = (
            select(HomeworkSubmission.status, func.count(HomeworkSubmission.id))
            .where(HomeworkSubmission.homework_id == a.id)
            .group_by(HomeworkSubmission.status)
        )
        counts = {row[0]: row[1] for row in (await session.execute(sub_counts_stmt)).all()}

        return HomeworkResponse(
            id=a.id,
            course_id=a.course_id,
            lesson_id=a.lesson_id,
            created_by_user_id=a.created_by_user_id,
            title=a.title,
            description=a.description,
            deadline=a.deadline,
            max_grade=a.max_grade,
            allow_file=a.allow_file,
            allow_text=a.allow_text,
            allowed_file_types=list(a.allowed_file_types or []),
            stats=HomeworkStats(
                total_students=total_students,
                submitted=counts.get("submitted", 0) + counts.get("late", 0) + counts.get("graded", 0),
                graded=counts.get("graded", 0),
                late=counts.get("late", 0),
            ),
            created_at=a.created_at,
            updated_at=a.updated_at,
        )

    # ── Homework CRUD ─────────────────────────────────────────────────────

    async def create_homework(
        self, session: AsyncSession, data: HomeworkCreateRequest, current_user: User
    ) -> HomeworkResponse:
        await self._check_course_owner(session, data.course_id, current_user)

        a = Homework(
            course_id=data.course_id,
            lesson_id=data.lesson_id,
            created_by_user_id=current_user.id,
            title=data.title,
            description=data.description,
            deadline=_to_naive_utc(data.deadline),
            max_grade=data.max_grade,
            allow_file=data.allow_file,
            allow_text=data.allow_text,
            allowed_file_types=data.allowed_file_types,
            attachments=[f.model_dump() for f in data.attachments],
        )
        session.add(a)
        await session.commit()
        await session.refresh(a)
        return await self._serialize_homework(session, a)

    async def update_homework(
        self, session: AsyncSession, homework_id: int, data: HomeworkUpdateRequest, current_user: User
    ) -> HomeworkResponse:
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found")
        await self._check_course_owner(session, a.course_id, current_user)

        for field in (
            "lesson_id",
            "title",
            "description",
            "deadline",
            "max_grade",
            "allow_file",
            "allow_text",
            "allowed_file_types",
        ):
            val = getattr(data, field)
            if val is not None:
                if field == "deadline":
                    val = _to_naive_utc(val)
                setattr(a, field, val)
        if data.attachments is not None:
            # Ro'yxat butunlay almashtiriladi: forma yakuniy holatni yuboradi.
            a.attachments = [f.model_dump() for f in data.attachments]
        await session.commit()
        await session.refresh(a)
        return await self._serialize_homework(session, a)

    async def delete_homework(self, session: AsyncSession, homework_id: int, current_user: User) -> None:
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found")
        await self._check_course_owner(session, a.course_id, current_user)
        await session.delete(a)
        await session.commit()

    async def get_homework(self, session: AsyncSession, homework_id: int, current_user: User) -> HomeworkResponse:
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found")

        if await self._is_student(current_user):
            in_course = await self._student_in_course(session, a.course_id, current_user.id)
            if not in_course:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not in this Course")

        return await self._serialize_homework(session, a)

    async def list_homeworks(
        self, session: AsyncSession, request: HomeworkListRequest, current_user: User
    ) -> HomeworkListResponse:
        stmt = select(Homework)
        count_stmt = select(func.count()).select_from(Homework)

        if await self._is_student(current_user):
            # Student sees only homeworks from courses they belong to
            student_courses_stmt = (
                select(CourseGroup.course_id)
                .join(Student, Student.group_id == CourseGroup.group_id)
                .where(Student.user_id == current_user.id)
            )
            course_ids = (await session.execute(student_courses_stmt)).scalars().all()
            if not course_ids:
                return HomeworkListResponse(total=0, page=request.page, limit=request.limit, homeworks=[])
            stmt = stmt.where(Homework.course_id.in_(course_ids))
            count_stmt = count_stmt.where(Homework.course_id.in_(course_ids))

        if request.course_id:
            stmt = stmt.where(Homework.course_id == request.course_id)
            count_stmt = count_stmt.where(Homework.course_id == request.course_id)
        if request.lesson_id:
            stmt = stmt.where(Homework.lesson_id == request.lesson_id)
            count_stmt = count_stmt.where(Homework.lesson_id == request.lesson_id)

        stmt = stmt.order_by(desc(Homework.deadline)).offset(request.offset).limit(request.limit)
        items = (await session.execute(stmt)).scalars().all()
        total = (await session.execute(count_stmt)).scalar() or 0
        return HomeworkListResponse(
            total=total,
            page=request.page,
            limit=request.limit,
            homeworks=[await self._serialize_homework(session, a) for a in items],
        )

    # ── Submissions ─────────────────────────────────────────────────────────

    async def _serialize_submission(self, sub: HomeworkSubmission) -> SubmissionResponse:
        user_info: SubmissionUserInfo | None = None
        if sub.user is not None:
            teacher_full_name = None
            # student doesn't have full_name on User, but Teacher relationship may exist
            user_info = SubmissionUserInfo(
                id=sub.user.id,
                username=sub.user.username,
                full_name=teacher_full_name,
            )
        return SubmissionResponse(
            id=sub.id,
            homework_id=sub.homework_id,
            user_id=sub.user_id,
            submitted_text=sub.submitted_text,
            submitted_files=list(sub.submitted_files or []),
            submitted_at=sub.submitted_at,
            status=sub.status,
            grade=sub.grade,
            feedback=sub.feedback,
            graded_at=sub.graded_at,
            user=user_info,
            created_at=sub.created_at,
            updated_at=sub.updated_at,
        )

    async def submit(
        self, session: AsyncSession, homework_id: int, data: SubmissionSubmitRequest, current_user: User
    ) -> SubmissionResponse:
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found")

        if await self._is_student(current_user):
            in_course = await self._student_in_course(session, a.course_id, current_user.id)
            if not in_course:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not in this Course")

        existing_stmt = select(HomeworkSubmission).where(
            HomeworkSubmission.homework_id == homework_id,
            HomeworkSubmission.user_id == current_user.id,
        )
        sub = (await session.execute(existing_stmt)).scalar_one_or_none()

        now = _utcnow()
        deadline = a.deadline.replace(tzinfo=None) if a.deadline.tzinfo else a.deadline
        is_late = now > deadline
        new_status = "late" if is_late else "submitted"

        if sub is None:
            sub = HomeworkSubmission(
                homework_id=homework_id,
                user_id=current_user.id,
                submitted_text=data.submitted_text,
                submitted_files=[f.model_dump() for f in data.submitted_files],
                submitted_at=now,
                status=new_status,
            )
            session.add(sub)
        else:
            if sub.status == "graded":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Submission already graded, cannot resubmit",
                )
            sub.submitted_text = data.submitted_text
            sub.submitted_files = [f.model_dump() for f in data.submitted_files]
            sub.submitted_at = now
            sub.status = new_status

        await session.commit()
        await session.refresh(sub)
        loaded = (
            await session.execute(
                select(HomeworkSubmission)
                .options(selectinload(HomeworkSubmission.user))
                .where(HomeworkSubmission.id == sub.id)
            )
        ).scalar_one()
        return await self._serialize_submission(loaded)

    async def get_my_submission(
        self, session: AsyncSession, homework_id: int, current_user: User
    ) -> SubmissionResponse | None:
        stmt = (
            select(HomeworkSubmission)
            .options(selectinload(HomeworkSubmission.user))
            .where(
                HomeworkSubmission.homework_id == homework_id,
                HomeworkSubmission.user_id == current_user.id,
            )
        )
        sub = (await session.execute(stmt)).scalar_one_or_none()
        if not sub:
            return None
        return await self._serialize_submission(sub)

    async def list_submissions(
        self, session: AsyncSession, homework_id: int, current_user: User
    ) -> SubmissionListResponse:
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found")
        await self._check_course_owner(session, a.course_id, current_user)

        stmt = (
            select(HomeworkSubmission)
            .options(selectinload(HomeworkSubmission.user))
            .where(HomeworkSubmission.homework_id == homework_id)
            .order_by(desc(HomeworkSubmission.submitted_at))
        )
        items = (await session.execute(stmt)).scalars().all()

        # Fill in teacher full_name where possible
        responses = []
        for sub in items:
            resp = await self._serialize_submission(sub)
            if resp.user and sub.user:
                t_stmt = select(Teacher.full_name).where(Teacher.user_id == sub.user.id)
                full = (await session.execute(t_stmt)).scalar_one_or_none()
                if full:
                    resp = resp.model_copy(
                        update={
                            "user": SubmissionUserInfo(id=resp.user.id, username=resp.user.username, full_name=full)
                        }
                    )
            responses.append(resp)
        return SubmissionListResponse(submissions=responses)

    async def grade_submission(
        self,
        session: AsyncSession,
        homework_id: int,
        user_id: int,
        data: SubmissionGradeRequest,
        current_user: User,
    ) -> SubmissionResponse:
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found")
        await self._check_course_owner(session, a.course_id, current_user)

        stmt = select(HomeworkSubmission).where(
            HomeworkSubmission.homework_id == homework_id,
            HomeworkSubmission.user_id == user_id,
        )
        sub = (await session.execute(stmt)).scalar_one_or_none()
        if not sub:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

        if data.grade > a.max_grade:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Grade exceeds max_grade ({a.max_grade})",
            )

        sub.grade = data.grade
        sub.feedback = data.feedback
        sub.status = "graded"
        sub.graded_by_user_id = current_user.id
        sub.graded_at = _utcnow()
        await session.commit()

        loaded = (
            await session.execute(
                select(HomeworkSubmission)
                .options(selectinload(HomeworkSubmission.user))
                .where(HomeworkSubmission.id == sub.id)
            )
        ).scalar_one()
        return await self._serialize_submission(loaded)


get_homework_repository = HomeworkRepository()
