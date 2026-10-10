from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk

if TYPE_CHECKING:
    from app.modules.auth.model import User


class AuditEvent:
    """Hodisa nomlari.

    Satr, enum emas: yangi hodisa qo'shish migratsiyasiz bo'lishi kerak —
    ular vaqt o'tib ko'payadi. Nom `obyekt.harakat` ko'rinishida, kirish
    hodisalaridan tashqari.
    """

    # ── Kirish va chiqish ──────────────────────────────────────────────
    LOGIN = "login"
    LOGIN_FAILED = "login_failed"
    LOGOUT = "logout"
    #: Boshqa qurilmadan kirilgani uchun avvalgi sessiya tugatildi.
    SESSION_EVICTED = "session_evicted"

    # ── Muhim harakatlar ───────────────────────────────────────────────
    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"
    USER_DELETED = "user.deleted"
    ROLE_CHANGED = "user.role_changed"
    DATA_SCOPE_CHANGED = "user.data_scope_changed"
    PASSWORD_CHANGED = "user.password_changed"
    QUESTION_DELETED = "question.deleted"
    QUESTIONS_BULK_DELETED = "question.bulk_deleted"
    QUIZ_DELETED = "quiz.deleted"
    RESULT_DELETED = "result.deleted"
    SYNC_RUN = "sync.run"


class AuditLog(Base, IdIntPk):
    """Kim, qachon va nima qilgani.

    Nega kerak. Kirishlar shu paytgacha faqat dastur jurnaliga tushardi
    (Loki), ya'ni ularni ko'rish uchun alohida tizim va ko'nikma kerak edi.
    Nizoli holatda «bu ishni kim qildi» degan savolga javob yo'q edi.

    ``TimestampMixin`` ishlatilmaydi: yozuv o'zgarmaydi, shuning uchun
    ``updated_at`` keraksiz ustun bo'lardi. Yozuvlar hech qachon
    tahrirlanmaydi va o'chirilmaydi — faqat muddati o'tganda tozalanadi
    (`scripts/cleanup_audit.sh`).
    """

    __tablename__ = "audit_logs"
    __table_args__ = (
        # Asosiy ko'rinish: «oxirgi hodisalar».
        Index("ix_audit_logs_created_at_id", "created_at", "id"),
        # «Bu odam nima qilgan» va «bu turdagi hodisalar».
        Index("ix_audit_logs_user_id_created_at", "user_id", "created_at"),
        Index("ix_audit_logs_event_created_at", "event", "created_at"),
    )

    #: Alohida indeks yo'q: `ix_audit_logs_created_at_id` uni birinchi
    #: ustun sifatida qamrab oladi. Kuniga o'n minglab yozuvda har bir
    #: ortiqcha indeks — yozishda ortiqcha ish.
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    #: Foydalanuvchi o'chirilsa ham yozuv qoladi — shuning uchun `SET NULL`.
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    #: Login nusxasi. Ikki sabab: muvaffaqiyatsiz kirishda foydalanuvchi
    #: umuman topilmaydi, va hisob o'chirilsa `user_id` bo'shab qoladi —
    #: o'shanda kim bo'lgani noma'lum bo'lib qolardi.
    username: Mapped[str | None] = mapped_column(String(150), nullable=True)
    #: Hodisa paytidagi faol rol (`X-Active-Role`). Bir hisobda bir necha
    #: rol bo'lishi mumkin, shuning uchun qaysi ko'rinishda ishlagani muhim.
    role: Mapped[str | None] = mapped_column(String(64), nullable=True)

    event: Mapped[str] = mapped_column(String(64), nullable=False)
    #: Ta'sir qilingan obyekt: `question`, `quiz`, `user`...
    object_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    object_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    #: Ro'yxatda ko'rinadigan qisqa matn. Tayyor holda saqlanadi: keyinchalik
    #: obyekt o'chirilsa ham hodisani o'qish mumkin bo'lsin.
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: Qo'shimcha tafsilotlar (eski/yangi qiymat, sabab va h.k.).
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)

    user: Mapped["User | None"] = relationship("User")
