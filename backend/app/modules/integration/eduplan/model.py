from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin


class EduPlanCredential(Base, IdIntPk, TimestampMixin):
    """Учётные данные сервисного аккаунта EduPlan, введённые администратором.

    Таблица одноэлементная: действует самая свежая строка. Пароль хранится
    зашифрованным (``core/utils/secret_box``) и наружу никогда не отдаётся —
    API показывает только факт его наличия. Если строки нет, клиент берёт
    значения из ``APP_CONFIG__EDUPLAN__*`` — так установка без интерфейса
    продолжает работать по-старому.
    """

    __tablename__ = "eduplan_credentials"

    base_url: Mapped[str] = mapped_column(String(255))
    username: Mapped[str] = mapped_column(String(150))
    password_encrypted: Mapped[str] = mapped_column(Text)
    active_role: Mapped[str] = mapped_column(String(50), default="", server_default="")
    updated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
