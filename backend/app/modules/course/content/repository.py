import logging

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.mixins.time_stamp_mixin import utcnow_naive as _utcnow
from app.modules.auth.model import User
from app.modules.course.model import (
    Course,
    CourseMaterial,
    CourseMaterialProgress,
    CourseTopic,
)

from .schemas import (
    CourseContentResponse,
    MaterialCreateRequest,
    MaterialResponse,
    MaterialUpdateRequest,
    TopicCreateRequest,
    TopicResponse,
    TopicUpdateRequest,
)

logger = logging.getLogger(__name__)


class CourseContentRepository:
    """Содержимое курса: разделы и материалы.

    Отдельно от Lesson: то — занятие по расписанию с журналом посещаемости, а
    здесь описывается сам курс, один для всех его групп.
    """

    async def _course(self, session: AsyncSession, course_id: int) -> Course:
        course = await session.get(Course, course_id)
        if course is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
        return course

    @staticmethod
    def _is_admin(user: User) -> bool:
        return any(role.name.lower() == "admin" for role in user.roles)

    async def _require_owner(self, session: AsyncSession, course_id: int, user: User) -> Course:
        """Править содержимое может автор курса или администратор.

        То же правило, что и в списке курсов: преподаватель не должен
        переписывать чужой курс.
        """
        course = await self._course(session, course_id)
        if not self._is_admin(user) and course.teacher_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your course")
        return course

    async def _topic(self, session: AsyncSession, topic_id: int) -> CourseTopic:
        topic = await session.get(CourseTopic, topic_id)
        if topic is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found")
        return topic

    async def _material(self, session: AsyncSession, material_id: int) -> CourseMaterial:
        material = await session.get(CourseMaterial, material_id)
        if material is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")
        return material

    async def _next_position(self, session: AsyncSession, model, **filters) -> int:
        """Новая запись встаёт в конец: её место потом меняют перетаскиванием."""
        stmt = select(func.coalesce(func.max(model.position), 0) + 1)
        for column, value in filters.items():
            stmt = stmt.where(getattr(model, column) == value)
        return (await session.execute(stmt)).scalar_one()

    # ── Чтение ──────────────────────────────────────────────────────────────

    async def get_content(
        self, session: AsyncSession, course_id: int, user: User
    ) -> CourseContentResponse:
        await self._course(session, course_id)

        topics = (
            (
                await session.execute(
                    select(CourseTopic)
                    .options(selectinload(CourseTopic.materials))
                    .where(CourseTopic.course_id == course_id)
                    .order_by(CourseTopic.position, CourseTopic.id)
                )
            )
            .scalars()
            .all()
        )

        material_ids = [m.id for topic in topics for m in topic.materials]

        # Отметки только спрашивающего: чужой прогресс на этом экране не нужен,
        # а выбирать его по всему курсу — это лишние строки на каждый запрос.
        completed: set[int] = set()
        if material_ids:
            completed = set(
                (
                    await session.execute(
                        select(CourseMaterialProgress.material_id).where(
                            CourseMaterialProgress.material_id.in_(material_ids),
                            CourseMaterialProgress.user_id == user.id,
                            CourseMaterialProgress.completed_at.is_not(None),
                        )
                    )
                )
                .scalars()
                .all()
            )

        return CourseContentResponse(
            course_id=course_id,
            topics=[
                TopicResponse(
                    id=topic.id,
                    course_id=topic.course_id,
                    title=topic.title,
                    position=topic.position,
                    materials=[
                        MaterialResponse.model_validate(material).model_copy(
                            update={"completed": material.id in completed}
                        )
                        for material in topic.materials
                    ],
                )
                for topic in topics
            ],
            total_materials=len(material_ids),
            completed_materials=len(completed),
        )

    # ── Разделы ─────────────────────────────────────────────────────────────

    async def create_topic(
        self, session: AsyncSession, course_id: int, data: TopicCreateRequest, user: User
    ) -> TopicResponse:
        await self._require_owner(session, course_id, user)

        topic = CourseTopic(
            course_id=course_id,
            title=data.title,
            position=await self._next_position(session, CourseTopic, course_id=course_id),
        )
        session.add(topic)
        await session.commit()

        return TopicResponse(
            id=topic.id,
            course_id=topic.course_id,
            title=topic.title,
            position=topic.position,
            materials=[],
        )

    async def update_topic(
        self, session: AsyncSession, topic_id: int, data: TopicUpdateRequest, user: User
    ) -> TopicResponse:
        topic = await self._topic(session, topic_id)
        await self._require_owner(session, topic.course_id, user)

        if data.title is not None:
            topic.title = data.title
        if data.position is not None:
            topic.position = data.position

        await session.commit()
        return TopicResponse(
            id=topic.id,
            course_id=topic.course_id,
            title=topic.title,
            position=topic.position,
            materials=[],
        )

    async def delete_topic(self, session: AsyncSession, topic_id: int, user: User) -> None:
        topic = await self._topic(session, topic_id)
        await self._require_owner(session, topic.course_id, user)
        await session.delete(topic)
        await session.commit()

    # ── Материалы ───────────────────────────────────────────────────────────

    async def create_material(
        self, session: AsyncSession, topic_id: int, data: MaterialCreateRequest, user: User
    ) -> MaterialResponse:
        topic = await self._topic(session, topic_id)
        await self._require_owner(session, topic.course_id, user)

        material = CourseMaterial(
            topic_id=topic_id,
            title=data.title,
            description=data.description,
            video_type=data.video_type,
            video_url=data.video_url,
            poster_url=data.poster_url,
            duration_label=data.duration_label,
            attachments=[a.model_dump() for a in data.attachments],
            position=await self._next_position(session, CourseMaterial, topic_id=topic_id),
        )
        session.add(material)
        await session.commit()
        return MaterialResponse.model_validate(material).model_copy(update={"completed": False})

    async def update_material(
        self, session: AsyncSession, material_id: int, data: MaterialUpdateRequest, user: User
    ) -> MaterialResponse:
        material = await self._material(session, material_id)
        topic = await self._topic(session, material.topic_id)
        await self._require_owner(session, topic.course_id, user)

        for field in (
            "title",
            "description",
            "video_type",
            "video_url",
            "poster_url",
            "duration_label",
            "position",
        ):
            value = getattr(data, field)
            if value is not None:
                setattr(material, field, value)

        if data.attachments is not None:
            material.attachments = [a.model_dump() for a in data.attachments]

        await session.commit()
        return MaterialResponse.model_validate(material).model_copy(update={"completed": False})

    async def delete_material(self, session: AsyncSession, material_id: int, user: User) -> None:
        material = await self._material(session, material_id)
        topic = await self._topic(session, material.topic_id)
        await self._require_owner(session, topic.course_id, user)
        await session.delete(material)
        await session.commit()

    # ── Порядок ─────────────────────────────────────────────────────────────

    async def reorder_topics(self, session: AsyncSession, ids: list[int], user: User) -> None:
        topics = (
            (await session.execute(select(CourseTopic).where(CourseTopic.id.in_(ids))))
            .scalars()
            .all()
        )
        by_id = {topic.id: topic for topic in topics}

        missing = [topic_id for topic_id in ids if topic_id not in by_id]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"Topics not found: {missing}"
            )

        # Все разделы должны принадлежать одному курсу: иначе одним запросом
        # можно было бы переставить чужие.
        course_ids = {topic.course_id for topic in topics}
        if len(course_ids) > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Topics belong to different courses",
            )
        if course_ids:
            await self._require_owner(session, course_ids.pop(), user)

        for index, topic_id in enumerate(ids, start=1):
            by_id[topic_id].position = index
        await session.commit()

    async def reorder_materials(self, session: AsyncSession, ids: list[int], user: User) -> None:
        materials = (
            (await session.execute(select(CourseMaterial).where(CourseMaterial.id.in_(ids))))
            .scalars()
            .all()
        )
        by_id = {material.id: material for material in materials}

        missing = [material_id for material_id in ids if material_id not in by_id]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"Materials not found: {missing}"
            )

        topic_ids = {material.topic_id for material in materials}
        if len(topic_ids) > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Materials belong to different topics",
            )
        if topic_ids:
            topic = await self._topic(session, topic_ids.pop())
            await self._require_owner(session, topic.course_id, user)

        for index, material_id in enumerate(ids, start=1):
            by_id[material_id].position = index
        await session.commit()

    # ── Прогресс студента ───────────────────────────────────────────────────

    async def set_completed(
        self, session: AsyncSession, material_id: int, user: User, completed: bool
    ) -> MaterialResponse:
        """Отметка «прошёл материал». Пишется только своя — чужую не тронуть."""
        material = await self._material(session, material_id)

        row = (
            await session.execute(
                select(CourseMaterialProgress).where(
                    CourseMaterialProgress.material_id == material_id,
                    CourseMaterialProgress.user_id == user.id,
                )
            )
        ).scalar_one_or_none()

        if row is None:
            row = CourseMaterialProgress(material_id=material_id, user_id=user.id)
            session.add(row)

        row.completed_at = _utcnow() if completed else None
        await session.commit()

        return MaterialResponse.model_validate(material).model_copy(update={"completed": completed})


get_course_content_repository = CourseContentRepository()
