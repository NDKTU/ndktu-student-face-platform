"""Oʻqituvchining koʻrish doirasi.

Loyihada «meniki» degan soʻz ikki xil tushunilardi: Natijalar biriktirma
boʻyicha, Savollar esa mualliflik boʻyicha filtrlanardi. Natijada oʻqituvchi
602 ta savoli bor fanga biriktirilgan boʻlsa-da, savollar sahifasini boʻsh
koʻrardi.

Endi qoida bitta: **koʻrish — biriktirma boʻyicha, oʻzgartirish — mualliflik
boʻyicha**. Bu funksiya shu qoidaning birinchi yarmiga asos boʻladi va ikki
modulda (savollar, fayl kutubxonasi) bir xil ishlatiladi — nusxa koʻchirilsa
ular vaqt oʻtib bir-biridan ajralib ketardi.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Teacher, TeacherSubject, User


async def assigned_subject_ids(session: AsyncSession, user: User) -> list[int]:
    """Foydalanuvchi oʻqituvchi sifatida biriktirilgan fanlar.

    Boʻsh roʻyxat — biriktirma yoʻq degani (masalan EduPlan sinxronizatsiyasi
    hali oʻtmagan). Chaqiruvchi buni «hech nima koʻrmasin» deb emas, «faqat
    oʻzinikini koʻrsin» deb talqin qilishi kerak.
    """
    rows = await session.scalars(
        select(TeacherSubject.subject_id)
        .join(Teacher, Teacher.id == TeacherSubject.teacher_id)
        .where(Teacher.user_id == user.id)
    )
    return list(rows)
