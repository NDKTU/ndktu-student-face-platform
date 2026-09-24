"""Kurs chati.

Kim o'qiy va yoza oladi — kursni kim ko'ra olsa (admin, kurs o'qituvchilari,
kursga biriktirilgan guruh talabalari). Alohida ruxsat kiritilmadi: chat
kursning bir qismi, va huquqni ikki joyda yuritish ular bir-biridan
ajralib ketishiga olib kelardi.

O'chirish: muallif o'z xabarini, kurs o'qituvchilari va admin — istalganini
(moderatsiya).
"""

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.course_access import can_manage
from app.modules.auth.model import Role, Student, Teacher, User, UserRole
from app.modules.course.course.repository import get_course_repository
from app.modules.course.model import Course, CourseMessage, CourseTeacher

from .schemas import (
    CourseMessageCreateRequest,
    CourseMessageListRequest,
    CourseMessageListResponse,
    CourseMessageResponse,
)

DELETED_AUTHOR = "O'chirilgan foydalanuvchi"


class CourseChatRepository:
    async def _load_course(self, session: AsyncSession, course_id: int, current_user: User) -> Course:
        course = await session.get(Course, course_id)
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
        await get_course_repository._ensure_view_access(session, course, current_user)
        return course

    async def _serialize(
        self,
        session: AsyncSession,
        course: Course,
        messages: list[CourseMessage],
        current_user: User,
    ) -> list[CourseMessageResponse]:
        """Muallif ismi va roli bir so'rovda — har xabarga alohida emas."""
        user_ids = {m.user_id for m in messages if m.user_id is not None}

        names: dict[int, str] = {}
        student_ids: set[int] = set()
        admin_ids: set[int] = set()
        if user_ids:
            users = (
                await session.execute(
                    select(User.id, User.username, Teacher.full_name, Student.full_name.label("student_name"))
                    .outerjoin(Teacher, Teacher.user_id == User.id)
                    .outerjoin(Student, Student.user_id == User.id)
                    .where(User.id.in_(user_ids))
                )
            ).all()
            for row in users:
                if row.student_name:
                    student_ids.add(row.id)
                names[row.id] = row.full_name or row.student_name or row.username

            # `User.roles` async sessiyada yashirin yuklanmaydi — shuning
            # uchun rollar jadvalidan to'g'ridan-to'g'ri.
            admin_ids = set(
                (
                    await session.execute(
                        select(UserRole.user_id)
                        .join(Role, Role.id == UserRole.role_id)
                        .where(UserRole.user_id.in_(user_ids), func.lower(Role.name) == "admin")
                    )
                ).scalars()
            )

        teacher_ids = {course.teacher_id}
        teacher_ids.update(
            (
                await session.execute(
                    select(CourseTeacher.user_id).where(CourseTeacher.course_id == course.id)
                )
            ).scalars()
        )

        moderator = await can_manage(session, course, current_user)

        def role_of(user_id: int | None) -> str:
            if user_id in teacher_ids:
                return "teacher"
            if user_id in admin_ids:
                return "admin"
            if user_id in student_ids:
                return "student"
            return "other"

        return [
            CourseMessageResponse(
                id=m.id,
                course_id=m.course_id,
                user_id=m.user_id,
                author_name=names.get(m.user_id or 0, DELETED_AUTHOR),
                author_role=role_of(m.user_id),
                body=m.body,
                created_at=m.created_at,
                can_delete=moderator or (m.user_id is not None and m.user_id == current_user.id),
            )
            for m in messages
        ]

    async def list_messages(
        self,
        session: AsyncSession,
        course_id: int,
        request: CourseMessageListRequest,
        current_user: User,
    ) -> CourseMessageListResponse:
        course = await self._load_course(session, course_id, current_user)

        # Bittasi ortiqcha olinadi — shunda «yana bormi» uchun alohida
        # COUNT so'rovi kerak bo'lmaydi.
        stmt = select(CourseMessage).where(CourseMessage.course_id == course.id)
        if request.before_id is not None:
            stmt = stmt.where(CourseMessage.id < request.before_id)
        stmt = stmt.order_by(CourseMessage.id.desc()).limit(request.limit + 1)

        rows = list((await session.execute(stmt)).scalars())
        has_more = len(rows) > request.limit
        rows = rows[: request.limit]
        rows.reverse()

        return CourseMessageListResponse(
            messages=await self._serialize(session, course, rows, current_user),
            has_more=has_more,
        )

    async def create_message(
        self,
        session: AsyncSession,
        course_id: int,
        data: CourseMessageCreateRequest,
        current_user: User,
    ) -> CourseMessageResponse:
        course = await self._load_course(session, course_id, current_user)
        # Arxivdagi kurs faqat o'qish uchun — sahifadagi boshqa bo'limlar
        # bilan bir xil qoida.
        if not course.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Arxivdagi kursga xabar yozib bo'lmaydi",
            )

        message = CourseMessage(course_id=course.id, user_id=current_user.id, body=data.body)
        session.add(message)
        await session.commit()
        await session.refresh(message)

        (response,) = await self._serialize(session, course, [message], current_user)
        return response

    async def delete_message(
        self,
        session: AsyncSession,
        course_id: int,
        message_id: int,
        current_user: User,
    ) -> None:
        course = await self._load_course(session, course_id, current_user)
        message = await session.get(CourseMessage, message_id)
        if not message or message.course_id != course.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Xabar topilmadi")

        own = message.user_id is not None and message.user_id == current_user.id
        if not own and not await can_manage(session, course, current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Faqat o'z xabaringizni o'chira olasiz",
            )

        await session.delete(message)
        await session.commit()


get_course_chat_repository = CourseChatRepository()
