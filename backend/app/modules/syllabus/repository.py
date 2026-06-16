import logging

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.course.model import Course
from app.modules.syllabus.model import Syllabus
from app.modules.user.models.user import User

from .schemas import SyllabusResponse, SyllabusUpsertRequest

logger = logging.getLogger(__name__)


class SyllabusRepository:
    async def _is_admin(self, user: User) -> bool:
        return any(r.name.lower() == "admin" for r in (user.roles or []))

    async def _check_course_access(self, session: AsyncSession, course_id: int, user: User) -> Course:
        stmt = select(Course).where(Course.id == course_id)
        course = (await session.execute(stmt)).scalar_one_or_none()
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
        if not await self._is_admin(user) and course.teacher_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Course owner or admin can modify syllabus",
            )
        return course

    async def get(self, session: AsyncSession, course_id: int) -> SyllabusResponse | None:
        stmt = select(Syllabus).where(Syllabus.course_id == course_id)
        s = (await session.execute(stmt)).scalar_one_or_none()
        if not s:
            return None
        return SyllabusResponse.model_validate(s)

    async def upsert(
        self, session: AsyncSession, course_id: int, data: SyllabusUpsertRequest, current_user: User
    ) -> SyllabusResponse:
        await self._check_course_access(session, course_id, current_user)

        stmt = select(Syllabus).where(Syllabus.course_id == course_id)
        existing = (await session.execute(stmt)).scalar_one_or_none()

        payload = {
            "goals": data.goals,
            "learning_outcomes": data.learning_outcomes,
            "prerequisites": data.prerequisites,
            "methodical_recommendations": data.methodical_recommendations,
            "literature": [item.model_dump() for item in data.literature],
            "grading_scheme": data.grading_scheme,
            "competencies": data.competencies,
            "file_url": data.file_url,
            "file_name": data.file_name,
        }

        if existing:
            for k, v in payload.items():
                setattr(existing, k, v)
        else:
            existing = Syllabus(course_id=course_id, **payload)
            session.add(existing)

        try:
            await session.commit()
            await session.refresh(existing)
        except Exception as e:
            await session.rollback()
            logger.error(f"Error upserting syllabus: {e}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {e}")

        return SyllabusResponse.model_validate(existing)

    async def delete(self, session: AsyncSession, course_id: int, current_user: User) -> None:
        await self._check_course_access(session, course_id, current_user)
        stmt = select(Syllabus).where(Syllabus.course_id == course_id)
        existing = (await session.execute(stmt)).scalar_one_or_none()
        if existing:
            await session.delete(existing)
            await session.commit()


get_syllabus_repository = SyllabusRepository()
