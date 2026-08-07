from typing import TYPE_CHECKING

from sqlalchemy import Date, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.database.enums import gender_enum
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.user.model import User
    from app.modules.organization_structure.group.model import Group


class Student(Base, TimestampMixin, IdIntPk):
    __tablename__ = "students"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    group_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("groups.id", ondelete="SET NULL"), nullable=True, index=True
    )

    first_name: Mapped[str] = mapped_column(String)
    last_name: Mapped[str] = mapped_column(String)
    third_name: Mapped[str] = mapped_column(String)
    full_name: Mapped[str] = mapped_column(String)
    student_id_number: Mapped[str] = mapped_column(String)
    image_path: Mapped[str] = mapped_column(String)
    birth_date: Mapped[Date] = mapped_column(Date)
    phone: Mapped[str] = mapped_column(String, nullable=True)
    # Тот же ENUM, что у сотрудника: один и тот же признак одного и того же
    # человека. NOT NULL, потому что HEMIS присылает пол всегда.
    gender: Mapped[str] = mapped_column(gender_enum)
    university: Mapped[str] = mapped_column(String)
    specialty: Mapped[str] = mapped_column(String)
    student_status: Mapped[str] = mapped_column(String)
    # education_form здесь нет: форма обучения — свойство группы. Хранить её
    # ещё и на студенте значило бы держать два значения, которые могут
    # разойтись; HEMIS присылает её на студенте, но это особенность их API,
    # а не модели предметной области.
    education_type: Mapped[str] = mapped_column(String)
    payment_form: Mapped[str] = mapped_column(String)
    education_lang: Mapped[str] = mapped_column(String)
    faculty: Mapped[str] = mapped_column(String)
    level: Mapped[str] = mapped_column(String)
    semester: Mapped[str] = mapped_column(String)
    address: Mapped[str] = mapped_column(String)
    avg_gpa: Mapped[float] = mapped_column(Float)

    enrollment_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    graduation_date: Mapped[Date | None] = mapped_column(Date, nullable=True)

    # --- Персональные данные --------------------------------------------------
    # Наружу уходят ТОЛЬКО через GET /students/{id}/sensitive под отдельным
    # правом. В StudentResponse их быть не должно: списочный эндпоинт отдаёт
    # сотни строк разом, и одно лишнее поле в схеме — это утечка на весь курс.
    jshshir: Mapped[str | None] = mapped_column(String(14), nullable=True)
    passport: Mapped[str | None] = mapped_column(String(16), nullable=True)
    region: Mapped[str | None] = mapped_column(String(64), nullable=True)
    district: Mapped[str | None] = mapped_column(String(64), nullable=True)
    social_category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    benefit: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # foreign_keys: у groups появилась встречная ссылка sardor_student_id,
    # так что путей между таблицами стало два — нужный указываем явно.
    group: Mapped["Group"] = relationship(
        "Group", back_populates="students", foreign_keys=[group_id]
    )
    user: Mapped["User"] = relationship("User", back_populates="student")
