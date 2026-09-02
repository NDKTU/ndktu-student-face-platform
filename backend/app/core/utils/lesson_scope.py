"""Dars qaysi guruhlarga tegishli.

``lessons.group_id`` boʻsh boʻlishi mumkin va bu «kursning barcha guruhlari»
degani. Kurs endi bitta guruhga emas, maʼruza oqimiga tegishli: EPOS
yuklamasidan yigʻilgan kurslarning yarmida bir nechta guruh bor, eng kattasida
toʻqqizta. Har guruhga alohida dars yozish oʻqituvchini bir xil ishni toʻqqiz
marta qilishga majbur qilardi.

Guruh koʻrsatilgan darslar oʻz joyida qoladi: bazadagi barcha eski darslar
aynan shunday va ular faqat oʻz guruhiga koʻrinaveradi.
"""

from sqlalchemy import Select, and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.course.model import CourseGroup, Lesson


def visible_to_group(group_id: int):
    """Guruhga koʻrinadigan darslar sharti — roʻyxat filtrlari uchun.

    Yo darsda aynan shu guruh koʻrsatilgan, yo dars butun kursniki va shu
    guruh oʻsha kursga kiradi.
    """
    return or_(
        Lesson.group_id == group_id,
        and_(
            Lesson.group_id.is_(None),
            Lesson.course_id.in_(select(CourseGroup.course_id).where(CourseGroup.group_id == group_id)),
        ),
    )


def filter_by_group(stmt: Select, group_id: int) -> Select:
    """Roʻyxatni guruh boʻyicha filtrlaydi, umumiy darslarni ham qoldirib."""
    return stmt.where(visible_to_group(group_id))


async def covers_group(session: AsyncSession, lesson: Lesson, group_id: int | None) -> bool:
    """Bitta dars shu guruhga tegishlimi — Zoom va yuz nazorati uchun.

    Bu yerda filtr emas, aniq javob kerak: talaba jonli darsga qoʻshila oladimi
    yoki yoʻqmi.
    """
    if group_id is None:
        return False
    if lesson.group_id is not None:
        return lesson.group_id == group_id
    found = await session.scalar(
        select(CourseGroup.id).where(
            CourseGroup.course_id == lesson.course_id,
            CourseGroup.group_id == group_id,
        )
    )
    return found is not None
