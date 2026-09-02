import logging
import time

import jwt
from core.config import settings
from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.lesson_scope import covers_group
from app.core.utils.zoom_link import ZoomLinkError, parse_zoom_link
from app.modules.auth.model import Student, Teacher, TeacherSubject, User
from app.modules.course.model import Course, Lesson, Resource

from .schemas import ZoomJoinResponse

logger = logging.getLogger(__name__)

# Talaba doim ishtirokchi sifatida qo'shiladi. Uchrashuvni o'qituvchi Zoom
# ilovasida boshlaydi — shuning uchun host roli (1) va ZAK token kerak emas.
PARTICIPANT_ROLE = 0


class ZoomService:
    async def _ensure_lesson_access(self, session: AsyncSession, lesson: Lesson, user: User) -> None:
        """Darsga kirish huquqi: admin, shu darsning o'qituvchisi yoki guruh talabasi."""
        if any(role.name.lower() == "admin" for role in user.roles):
            return

        teacher_user_id = (
            await session.execute(
                select(Teacher.user_id)
                .join(TeacherSubject, TeacherSubject.teacher_id == Teacher.id)
                .where(TeacherSubject.id == lesson.teacher_subject_id)
            )
        ).scalar_one_or_none()
        if teacher_user_id == user.id:
            return

        course_owner_id = (
            await session.execute(select(Course.teacher_id).where(Course.id == lesson.course_id))
        ).scalar_one_or_none()
        if course_owner_id == user.id:
            return

        student_group_id = (
            await session.execute(select(Student.group_id).where(Student.user_id == user.id))
        ).scalar_one_or_none()
        if await covers_group(session, lesson, student_group_id):
            return

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu darsga qo'shilish huquqingiz yo'q",
        )

    def _signature(self, meeting_number: str) -> str:
        now = int(time.time())
        # `iat` biroz orqaga suriladi: server va Zoom soatlari bir necha soniyaga
        # farq qilsa, imzo «kelajakdan» deb rad etilardi.
        issued_at = now - 30
        expires_at = now + settings.zoom.signature_ttl_seconds
        payload = {
            "appKey": settings.zoom.client_id,
            "sdkKey": settings.zoom.client_id,
            "mn": meeting_number,
            "role": PARTICIPANT_ROLE,
            "iat": issued_at,
            "exp": expires_at,
            "tokenExp": expires_at,
        }
        return jwt.encode(payload, settings.zoom.client_secret, algorithm="HS256")

    async def build_join_payload(self, session: AsyncSession, lesson_id: int, user: User) -> ZoomJoinResponse:
        if not settings.zoom.enabled:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Zoom integratsiyasi sozlanmagan",
            )

        lesson = (await session.execute(select(Lesson).where(Lesson.id == lesson_id))).scalar_one_or_none()
        if lesson is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dars topilmadi")

        await self._ensure_lesson_access(session, lesson, user)

        resource = (
            await session.execute(
                select(Resource)
                .where(Resource.lesson_id == lesson_id, Resource.resource_type == "zoom")
                .order_by(desc(Resource.id))
                .limit(1)
            )
        ).scalar_one_or_none()
        if resource is None or not resource.link_url:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bu darsga Zoom havolasi qo'shilmagan",
            )

        try:
            meeting_number, passcode = parse_zoom_link(resource.link_url)
        except ZoomLinkError as cause:
            # Havola bazada allaqachon yotibdi (eski yozuv yoki qo'lda o'zgartirilgan) —
            # foydalanuvchiga nima qilish kerakligini aytamiz.
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(cause)) from cause

        return ZoomJoinResponse(
            signature=self._signature(meeting_number),
            sdk_key=settings.zoom.client_id,
            meeting_number=meeting_number,
            passcode=passcode,
            join_url=resource.link_url,
            topic=resource.title or lesson.topic,
        )


zoom_service = ZoomService()
