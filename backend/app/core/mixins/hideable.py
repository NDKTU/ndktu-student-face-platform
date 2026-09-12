"""Adminning «yashirish» bayrogʻi — 2026-09-11 dan boshlab ISHLATILMAYDI.

Yashirish funksiyasi (API, UI, filtrlar) kommentga olindi: qarang
``app/core/utils/visibility.py``. Mixin ataylab joyida qoldirildi —
jadvallardagi ``is_hidden`` ustuni bazada turibdi va model undan voz kechsa,
keyingi ``alembic autogenerate`` uni tashlashni taklif qilib yuborardi.
Ustunning qiymati hamma joyda ``false``.

Quyidagi izoh funksiya ishlagan davrdagi sababni saqlaydi.


Nega ``is_active`` dan alohida. ``is_active`` ning egasi bor — EduPlan
sinxronizatsiyasi: EPOS'dan yoʻqolgan satr oʻchirilmaydi, `is_active = False`
boʻladi, chunki unga natijalar va savollar bogʻlangan. Yaʼni uning maʼnosi
«manbada hali bormi».

Shu ustunni «admin yashirdi» uchun ham ishlatsak, ikki maʼno toʻqnashadi:
admin guruhni yashiradi, keyingi sinxronizatsiya uni EPOS'da koʻrib qaytadan
yoqib yuboradi. Sinxronizatsiya hozir oʻchiq, shuning uchun bugun bilinmaydi
— yoqilgan kuni bilinadi va sababini topish qiyin boʻladi.

Ikkovi mustaqil: yozuv koʻrinishi uchun HAM aktiv, HAM yashirilmagan boʻlishi
kerak.
"""

from sqlalchemy import Boolean
from sqlalchemy.orm import Mapped, mapped_column


class HideableMixin:
    """Admin yashira oladigan spravochniklar uchun."""

    is_hidden: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
