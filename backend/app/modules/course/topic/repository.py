from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.course_access import can_manage
from app.modules.auth.model import User
from app.modules.course.course.repository import get_course_repository
from app.modules.course.model import CourseTopic, Lesson

from .schemas import (
    CourseTopicCreateRequest,
    CourseTopicListResponse,
    CourseTopicResponse,
    CourseTopicUpdateRequest,
)


class CourseTopicRepository:
    @staticmethod
    def _is_admin(user: User) -> bool:
        return any(role.name.lower() == "admin" for role in (user.roles or []))

    async def _check_manage(self, session: AsyncSession, course_id: int, user: User) -> None:
        course = await get_course_repository.get_course_orm(session, course_id)
        if not await can_manage(session, course, user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Faqat kurs oʻqituvchilari yoki admin mavzu qoʻsha oladi",
            )

    async def _serialize(self, session: AsyncSession, topic: CourseTopic) -> CourseTopicResponse:
        lesson_count = (
            await session.execute(select(func.count(Lesson.id)).where(Lesson.topic_id == topic.id))
        ).scalar() or 0
        return CourseTopicResponse(
            id=topic.id,
            course_id=topic.course_id,
            title=topic.title,
            order_index=topic.order_index,
            lesson_count=lesson_count,
            created_at=topic.created_at,
            updated_at=topic.updated_at,
        )

    async def list_topics(self, session: AsyncSession, course_id: int, current_user: User) -> CourseTopicListResponse:
        course = await get_course_repository.get_course_orm(session, course_id)
        await get_course_repository._ensure_view_access(session, course, current_user)
        topics = (
            (
                await session.execute(
                    select(CourseTopic)
                    .where(CourseTopic.course_id == course_id)
                    .order_by(CourseTopic.order_index, CourseTopic.id)
                )
            )
            .scalars()
            .all()
        )
        return CourseTopicListResponse(topics=[await self._serialize(session, topic) for topic in topics])

    async def create_topic(
        self, session: AsyncSession, data: CourseTopicCreateRequest, current_user: User
    ) -> CourseTopicResponse:
        await self._check_manage(session, data.course_id, current_user)
        order_index = data.order_index
        if order_index is None:
            maximum = (
                await session.execute(
                    select(func.max(CourseTopic.order_index)).where(CourseTopic.course_id == data.course_id)
                )
            ).scalar()
            order_index = (maximum or 0) + 1
        topic = CourseTopic(course_id=data.course_id, title=data.title.strip(), order_index=order_index)
        session.add(topic)
        await session.commit()
        await session.refresh(topic)
        return await self._serialize(session, topic)

    async def update_topic(
        self, session: AsyncSession, topic_id: int, data: CourseTopicUpdateRequest, current_user: User
    ) -> CourseTopicResponse:
        topic = await session.get(CourseTopic, topic_id)
        if topic is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course topic not found")
        await self._check_manage(session, topic.course_id, current_user)
        if data.title is not None:
            topic.title = data.title.strip()
        if data.order_index is not None:
            topic.order_index = data.order_index
        await session.commit()
        await session.refresh(topic)
        return await self._serialize(session, topic)

    async def delete_topic(self, session: AsyncSession, topic_id: int, current_user: User) -> None:
        topic = await session.get(CourseTopic, topic_id)
        if topic is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course topic not found")
        await self._check_manage(session, topic.course_id, current_user)
        await session.delete(topic)
        await session.commit()


get_course_topic_repository = CourseTopicRepository()
