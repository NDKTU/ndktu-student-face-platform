"""Kursni kim boshqara oladi.

Ilgari javob bitta edi: ``course.teacher_id == user.id``. Kurs bitta
oʻqituvchiga tegishli deb hisoblanardi va bu tekshiruv oltita joyda
takrorlanardi — dars, material, mavzu, uy vazifasi va kursning oʻzida.

Endi kursda asosiy oʻqituvchi va assistentlar bor. Assistent amaliyot
oʻtkazadi va baholaydi, demak unga dars, material va uy vazifasi kerak.
Lekin kursni oʻchirish yoki oʻqituvchilar roʻyxatini oʻzgartirish faqat
asosiy oʻqituvchida qoladi — aks holda «asosiy» soʻzining maʼnosi qolmasdi.

Shuning uchun ikki daraja: ``can_manage`` (kundalik ish) va ``can_own``
(kursning oʻzi ustidan qaror).
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User
from app.modules.course.model import Course, CourseTeacher

ROLE_MAIN = "main"
ROLE_ASSISTANT = "assistant"


def is_admin(user: User | None) -> bool:
    if user is None:
        return False
    return any(role.name.lower() == "admin" for role in (user.roles or []))


async def can_manage(session: AsyncSession, course: Course, user: User) -> bool:
    """Kundalik ish: dars, material, mavzu, uy vazifasi, baholash.

    Admin, asosiy oʻqituvchi va assistentlar.
    """
    if is_admin(user) or course.teacher_id == user.id:
        return True

    found = await session.scalar(
        select(CourseTeacher.id).where(
            CourseTeacher.course_id == course.id,
            CourseTeacher.user_id == user.id,
        )
    )
    return found is not None


def can_own(course: Course, user: User) -> bool:
    """Kursning oʻzi ustidan qaror: oʻchirish, oʻqituvchilarni boshqarish.

    Faqat admin va asosiy oʻqituvchi. Bu yerda bazaga borish shart emas —
    asosiy oʻqituvchi ``courses.teacher_id`` da turadi.
    """
    return is_admin(user) or course.teacher_id == user.id


async def manageable_course_ids(session: AsyncSession, user: User):
    """Foydalanuvchi boshqara oladigan kurslar — roʻyxat filtrlari uchun.

    Oʻzi asosiy boʻlgan kurslar va assistent sifatida biriktirilganlari.
    """
    own = select(Course.id).where(Course.teacher_id == user.id)
    assisting = select(CourseTeacher.course_id).where(CourseTeacher.user_id == user.id)
    return own.union(assisting).subquery()
