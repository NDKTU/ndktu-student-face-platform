"""Mustaqil ish mavzulari.

Kim koʻradi — kursni koʻra oladigan hamma (talaba ham: roʻyxat aynan
unga moʻljallangan). Kim oʻzgartiradi — kursni boshqaradiganlar: admin,
asosiy oʻqituvchi va assistentlar.

Alohida ruxsat kiritilmadi. Yangi ruxsat avtomatik faqat adminga
tegadi (`core/lifespan/discovery.py`), oʻqituvchiga esa qoʻlda berish
kerak boʻlardi — yaʼni funksiya chiqqan kuni oʻqituvchida ishlamasdi.
Shuning uchun dars ruxsatlari ishlatiladi: mavzu roʻyxati ham kursning
oʻquv rejasi qismi.
"""

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.course_access import can_manage
from app.modules.auth.model import User
from app.modules.course.course.repository import get_course_repository
from app.modules.course.model import Course, IndependentTopic
from app.modules.file.storage import sync_usages

from .schemas import (
    IndependentTopicCreateRequest,
    IndependentTopicListResponse,
    IndependentTopicResponse,
    IndependentTopicUpdateRequest,
)


class IndependentTopicRepository:
    async def _sync_file_usage(self, session: AsyncSession, topic: IndependentTopic, user: User | None) -> None:
        # Kutubxona faylning qayerda ishlatilganini `file_usages` dan biladi:
        # yozilmasa, mavzuga biriktirilgan fayl «ishlatilmagan» koʻrinib,
        # bemalol oʻchirib yuborilardi.
        await sync_usages(
            session,
            entity_type="independent_topic",
            entity_id=topic.id,
            urls=[item.get("url") for item in topic.attachments or []],
            owner_user_id=user.id if user else None,
        )

    async def _load_course(self, session: AsyncSession, course_id: int, current_user: User) -> Course:
        course = await session.get(Course, course_id)
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
        await get_course_repository._ensure_view_access(session, course, current_user)
        return course

    async def _ensure_can_manage(self, session: AsyncSession, course: Course, current_user: User) -> None:
        if not await can_manage(session, course, current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bu kurs sizga biriktirilmagan",
            )

    async def _load_topic(self, session: AsyncSession, topic_id: int, current_user: User) -> IndependentTopic:
        topic = await session.get(IndependentTopic, topic_id)
        if not topic:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mavzu topilmadi")
        course = await self._load_course(session, topic.course_id, current_user)
        await self._ensure_can_manage(session, course, current_user)
        return topic

    async def list_topics(
        self, session: AsyncSession, course_id: int, current_user: User
    ) -> IndependentTopicListResponse:
        await self._load_course(session, course_id, current_user)
        rows = (
            (
                await session.execute(
                    select(IndependentTopic)
                    .where(IndependentTopic.course_id == course_id)
                    # Tartib sillabusdagidek: `position`, teng boʻlsa — eski
                    # avval. `id` ikkinchi mezon boʻlmasa, bir xil `position`
                    # li mavzular har soʻrovda joy almashardi.
                    .order_by(IndependentTopic.position, IndependentTopic.id)
                )
            )
            .scalars()
            .all()
        )
        return IndependentTopicListResponse(
            total=len(rows),
            topics=[IndependentTopicResponse.model_validate(row) for row in rows],
        )

    async def create_topic(
        self,
        session: AsyncSession,
        course_id: int,
        data: IndependentTopicCreateRequest,
        current_user: User,
    ) -> IndependentTopicResponse:
        course = await self._load_course(session, course_id, current_user)
        await self._ensure_can_manage(session, course, current_user)

        position = data.position
        if position is None:
            # Oxiriga qoʻshamiz: oʻqituvchi mavzularni ketma-ket kiritadi va
            # har safar tartib raqamini oʻylab oʻtirmasligi kerak.
            last = await session.scalar(
                select(func.max(IndependentTopic.position)).where(IndependentTopic.course_id == course_id)
            )
            position = (last or 0) + 1

        topic = IndependentTopic(
            course_id=course_id,
            created_by_user_id=current_user.id,
            title=data.title,
            description=data.description,
            position=position,
            attachments=[item.model_dump() for item in data.attachments],
        )
        session.add(topic)
        await session.flush()
        await self._sync_file_usage(session, topic, current_user)
        await session.commit()
        await session.refresh(topic)
        return IndependentTopicResponse.model_validate(topic)

    async def update_topic(
        self,
        session: AsyncSession,
        topic_id: int,
        data: IndependentTopicUpdateRequest,
        current_user: User,
    ) -> IndependentTopicResponse:
        topic = await self._load_topic(session, topic_id, current_user)

        topic.title = data.title
        topic.description = data.description
        if data.position is not None:
            topic.position = data.position
        topic.attachments = [item.model_dump() for item in data.attachments]
        await self._sync_file_usage(session, topic, current_user)

        await session.commit()
        await session.refresh(topic)
        return IndependentTopicResponse.model_validate(topic)

    async def delete_topic(self, session: AsyncSession, topic_id: int, current_user: User) -> None:
        topic = await self._load_topic(session, topic_id, current_user)
        await sync_usages(session, entity_type="independent_topic", entity_id=topic.id, urls=[])
        await session.delete(topic)
        await session.commit()


get_independent_topic_repository = IndependentTopicRepository()
