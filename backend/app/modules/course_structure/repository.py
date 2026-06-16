import logging
from typing import List

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.course_structure.models import Module, Topic
from app.modules.course.model import Course
from app.modules.user.models.user import User

from .schemas import (
    ModuleCreateRequest,
    ModuleListResponse,
    ModuleResponse,
    ModuleUpdateRequest,
    ReorderRequest,
    TopicCreateRequest,
    TopicResponse,
    TopicUpdateRequest,
)

logger = logging.getLogger(__name__)


class CourseStructureRepository:
    async def _is_admin(self, user: User) -> bool:
        return any(r.name.lower() == "admin" for r in (user.roles or []))

    async def _check_course_access(self, session: AsyncSession, course_id: int, user: User) -> None:
        stmt = select(Course).where(Course.id == course_id)
        course = (await session.execute(stmt)).scalar_one_or_none()
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
        if not await self._is_admin(user) and course.teacher_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Course owner or admin can manage course structure",
            )

    async def _check_module_access(self, session: AsyncSession, module_id: int, user: User) -> Module:
        stmt = select(Module).where(Module.id == module_id)
        module = (await session.execute(stmt)).scalar_one_or_none()
        if not module:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")
        await self._check_course_access(session, module.course_id, user)
        return module

    async def _check_topic_access(self, session: AsyncSession, topic_id: int, user: User) -> Topic:
        stmt = select(Topic).where(Topic.id == topic_id)
        topic = (await session.execute(stmt)).scalar_one_or_none()
        if not topic:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found")
        await self._check_module_access(session, topic.module_id, user)
        return topic

    # ── Modules ─────────────────────────────────────────────────────────────

    async def list_modules(self, session: AsyncSession, course_id: int) -> ModuleListResponse:
        stmt = (
            select(Module)
            .options(selectinload(Module.topics))
            .where(Module.course_id == course_id)
            .order_by(Module.order_index)
        )
        modules = (await session.execute(stmt)).scalars().all()
        return ModuleListResponse(modules=[ModuleResponse.model_validate(m) for m in modules])

    async def create_module(
        self, session: AsyncSession, data: ModuleCreateRequest, current_user: User
    ) -> ModuleResponse:
        await self._check_course_access(session, data.course_id, current_user)
        module = Module(
            course_id=data.course_id,
            name=data.name,
            description=data.description,
            order_index=data.order_index,
        )
        session.add(module)
        await session.commit()
        await session.refresh(module)
        loaded = (
            await session.execute(select(Module).options(selectinload(Module.topics)).where(Module.id == module.id))
        ).scalar_one()
        return ModuleResponse.model_validate(loaded)

    async def update_module(
        self, session: AsyncSession, module_id: int, data: ModuleUpdateRequest, current_user: User
    ) -> ModuleResponse:
        module = await self._check_module_access(session, module_id, current_user)
        if data.name is not None:
            module.name = data.name
        if data.description is not None:
            module.description = data.description
        if data.order_index is not None:
            module.order_index = data.order_index
        await session.commit()
        loaded = (
            await session.execute(select(Module).options(selectinload(Module.topics)).where(Module.id == module_id))
        ).scalar_one()
        return ModuleResponse.model_validate(loaded)

    async def delete_module(self, session: AsyncSession, module_id: int, current_user: User) -> None:
        module = await self._check_module_access(session, module_id, current_user)
        await session.delete(module)
        await session.commit()

    async def reorder_modules(
        self, session: AsyncSession, course_id: int, data: ReorderRequest, current_user: User
    ) -> ModuleListResponse:
        await self._check_course_access(session, course_id, current_user)
        ids = [item.id for item in data.items]
        stmt = select(Module).where(Module.id.in_(ids), Module.course_id == course_id)
        modules = {m.id: m for m in (await session.execute(stmt)).scalars().all()}
        for item in data.items:
            m = modules.get(item.id)
            if m:
                m.order_index = item.order_index
        await session.commit()
        return await self.list_modules(session, course_id)

    # ── Topics ──────────────────────────────────────────────────────────────

    async def create_topic(self, session: AsyncSession, data: TopicCreateRequest, current_user: User) -> TopicResponse:
        await self._check_module_access(session, data.module_id, current_user)
        topic = Topic(
            module_id=data.module_id,
            name=data.name,
            description=data.description,
            order_index=data.order_index,
            hours=data.hours,
            learning_outcomes=data.learning_outcomes,
        )
        session.add(topic)
        await session.commit()
        await session.refresh(topic)
        return TopicResponse.model_validate(topic)

    async def update_topic(
        self, session: AsyncSession, topic_id: int, data: TopicUpdateRequest, current_user: User
    ) -> TopicResponse:
        topic = await self._check_topic_access(session, topic_id, current_user)
        for field in ("name", "description", "order_index", "hours", "learning_outcomes"):
            val = getattr(data, field)
            if val is not None:
                setattr(topic, field, val)
        await session.commit()
        await session.refresh(topic)
        return TopicResponse.model_validate(topic)

    async def delete_topic(self, session: AsyncSession, topic_id: int, current_user: User) -> None:
        topic = await self._check_topic_access(session, topic_id, current_user)
        await session.delete(topic)
        await session.commit()

    async def reorder_topics(
        self, session: AsyncSession, module_id: int, data: ReorderRequest, current_user: User
    ) -> List[TopicResponse]:
        await self._check_module_access(session, module_id, current_user)
        ids = [item.id for item in data.items]
        stmt = select(Topic).where(Topic.id.in_(ids), Topic.module_id == module_id)
        topics = {t.id: t for t in (await session.execute(stmt)).scalars().all()}
        for item in data.items:
            t = topics.get(item.id)
            if t:
                t.order_index = item.order_index
        await session.commit()

        result = (
            (await session.execute(select(Topic).where(Topic.module_id == module_id).order_by(Topic.order_index)))
            .scalars()
            .all()
        )
        return [TopicResponse.model_validate(t) for t in result]


get_course_structure_repository = CourseStructureRepository()
