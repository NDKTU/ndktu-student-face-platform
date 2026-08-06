from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.database.enums import gender_enum
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.job_title.model import JobTitle
    from app.modules.auth.teacher.model import Teacher
    from app.modules.auth.user.model import User
    from app.modules.organization_structure.department.model import Department


class Employee(Base, IdIntPk, TimestampMixin):
    __tablename__ = "employees"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Должность — справочник, а не строка: свободный текст плодил «Katta
    # o'qituvchi» и «Katta oqituvchi» как разные значения. Поведение FK то же,
    # что у department_id: должность можно удалить, сотрудник останется.
    job_title_id: Mapped[int | None] = mapped_column(
        ForeignKey("job_titles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    last_name: Mapped[str] = mapped_column(String(255))
    first_name: Mapped[str] = mapped_column(String(255))
    third_name: Mapped[str] = mapped_column(String(255))
    # Без UNIQUE: полные тёзки в Узбекистане — обычное дело, а ограничение
    # не давало завести второго и отвечало невнятным «conflicts with an
    # existing record».
    full_name: Mapped[str] = mapped_column(String(500))

    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # --- Служебная карточка ---------------------------------------------------
    work_email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    work_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # nullable, в отличие от Student.gender: у студента пол приходит из HEMIS и
    # есть всегда, у сотрудника его вводят руками.
    gender: Mapped[str | None] = mapped_column(gender_enum, nullable=True)
    birth_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    hire_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    # status здесь больше нет: в комментарии было написано, что он влияет на
    # вход, но вход его никогда не читал — заблокированный сотрудник заходил
    # свободно. last_login_at убран по той же причине: его никто не записывал.

    # --- Персональные данные --------------------------------------------------
    # Как и у студента: только через GET /employee/{id}/sensitive и только под
    # своим правом. Со студенческим оно не связано — это два независимо
    # выдаваемых права, а не одна «привилегия администратора».
    jshshir: Mapped[str | None] = mapped_column(String(14), nullable=True)
    passport: Mapped[str | None] = mapped_column(String(16), nullable=True)
    personal_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="employee")
    job_title: Mapped["JobTitle | None"] = relationship("JobTitle", back_populates="employees")
    teacher: Mapped["Teacher"] = relationship("Teacher", back_populates="employee", uselist=False)
    department: Mapped["Department | None"] = relationship("Department", back_populates="employees")

    def __str__(self):
        return self.full_name
