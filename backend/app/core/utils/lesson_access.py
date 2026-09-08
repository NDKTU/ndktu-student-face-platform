"""Darsni kim boshqara oladi — ruxsat tekshiruvining yagona joyi.

Bu mantiq avval yuz nazorati repozitoriysida yashiringan edi va davomat
qo'shilganda uchinchi marta ko'chirilishi kerak bo'lardi. Bir xil savolga ikki
xil javob beradigan ikki nusxa — jurnal kabi mas'uliyatli joyda eng yomon
xato turi.

Dars o'qituvchisi ikki yo'l bilan aniqlanadi: `teacher_subject` orqali (darsni
kim o'tadi) va kursning asosiy o'qituvchisi orqali (`courses.teacher_id`).
Ikkalasi ham kerak: kursni ochgan odam o'zi o'tmagan darsning jurnalini ham
ko'ra olishi lozim.
"""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Teacher, TeacherSubject, User
from app.modules.course.model import Course, CourseTeacher, Lesson


def is_admin(user: User) -> bool:
    return any(role.name.lower() == "admin" for role in user.roles)


async def is_lesson_teacher(session: AsyncSession, lesson: Lesson, user: User) -> bool:
    teacher_user_id = (
        await session.execute(
            select(Teacher.user_id)
            .join(TeacherSubject, TeacherSubject.teacher_id == Teacher.id)
            .where(TeacherSubject.id == lesson.teacher_subject_id)
        )
    ).scalar_one_or_none()
    if teacher_user_id == user.id:
        return True

    course_owner_id = (
        await session.execute(select(Course.teacher_id).where(Course.id == lesson.course_id))
    ).scalar_one_or_none()
    if course_owner_id == user.id:
        return True

    # Kursning yordamchi o'qituvchisi ham dars olib boradi va baholaydi.
    assistant = (
        await session.execute(
            select(CourseTeacher.id)
            .where(CourseTeacher.course_id == lesson.course_id, CourseTeacher.user_id == user.id)
            .limit(1)
        )
    ).scalars().first()
    return assistant is not None


async def can_manage_lesson(session: AsyncSession, lesson: Lesson, user: User) -> bool:
    return is_admin(user) or await is_lesson_teacher(session, lesson, user)


async def ensure_can_manage_lesson(
    session: AsyncSession,
    lesson: Lesson,
    user: User,
    detail: str = "Bu dars sizga tegishli emas",
) -> None:
    if not await can_manage_lesson(session, lesson, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
