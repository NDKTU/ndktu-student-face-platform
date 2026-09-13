import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.jitsi_link import JitsiLinkError, parse_jitsi_link
from app.core.utils.lesson_scope import covers_group
from app.modules.auth.model import Student, Teacher, TeacherSubject, User
from app.modules.course.model import Course, Lesson, Resource

from .schemas import JitsiJoinResponse

logger = logging.getLogger(__name__)


class JitsiService:
    async def _ensure_lesson_access(self, session: AsyncSession, lesson: Lesson, user: User) -> None:
        """Darsga kirish huquqi: admin, shu darsning o'qituvchisi yoki guruh talabasi.

        Tekshiruv Zoom'dagi bilan bir xil: muqobil ulanish yo'li ruxsatni
        yumshatmasligi kerak, aks holda u nazoratni chetlab o'tish yo'li
        bo'lib qolardi.
        """
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

    async def build_join_payload(self, session: AsyncSession, lesson_id: int, user: User) -> JitsiJoinResponse:
        lesson = (await session.execute(select(Lesson).where(Lesson.id == lesson_id))).scalar_one_or_none()
        if lesson is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dars topilmadi")

        await self._ensure_lesson_access(session, lesson, user)

        resource = (
            await session.execute(
                select(Resource)
                .where(Resource.lesson_id == lesson_id, Resource.resource_type == "jitsi")
                .order_by(desc(Resource.id))
                .limit(1)
            )
        ).scalar_one_or_none()
        if resource is None or not resource.link_url:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bu darsga Jitsi havolasi qo'shilmagan",
            )

        try:
            room, domain = parse_jitsi_link(resource.link_url)
        except JitsiLinkError as cause:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(cause)) from cause

        return JitsiJoinResponse(
            room=room,
            domain=domain,
            join_url=resource.link_url,
            topic=resource.title or lesson.topic,
        )


jitsi_service = JitsiService()
