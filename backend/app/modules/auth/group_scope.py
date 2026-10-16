"""Foydalanuvchi qaysi guruhlarga aloqador.

O'qituvchining guruhlari ikki manbadan yig'iladi: `teacher_group` (admin
biriktirgan) va uning kurslariga biriktirilgan guruhlar. Faqat birinchisiga
tayanib bo'lmaydi — kursga guruh qo'shilganda `teacher_group` ga satr
yozilmaydi.

Qoida davomat va «guruh talabalari» sahifasida bir xil bo'lishi shart,
shuning uchun u shu yerda bir marta yozilgan.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Student, Teacher
from app.modules.course.model import Course, CourseGroup, CourseTeacher
from app.modules.organization_structure.model import TeacherGroup


async def teacher_group_ids(session: AsyncSession, user_id: int) -> set[int]:
    teacher_ids = select(Teacher.id).where(Teacher.user_id == user_id)

    assigned = await session.execute(
        select(TeacherGroup.group_id).where(TeacherGroup.teacher_id.in_(teacher_ids))
    )
    group_ids = {row[0] for row in assigned}

    course_ids = (
        select(Course.id.label("course_id"))
        .where(Course.teacher_id == user_id)
        .union(select(CourseTeacher.course_id.label("course_id")).where(CourseTeacher.user_id == user_id))
        .subquery()
    )
    via_courses = await session.execute(
        select(CourseGroup.group_id).where(CourseGroup.course_id.in_(select(course_ids.c.course_id)))
    )
    group_ids.update(row[0] for row in via_courses)

    return group_ids


async def student_group_id(session: AsyncSession, user_id: int) -> int | None:
    return (
        await session.execute(select(Student.group_id).where(Student.user_id == user_id))
    ).scalar_one_or_none()
