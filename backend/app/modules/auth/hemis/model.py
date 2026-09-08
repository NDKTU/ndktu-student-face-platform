from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin


class HemisDataCredential(Base, IdIntPk, TimestampMixin):
    """Токен административного API HEMIS (`/rest/v1/data/...`).

    Таблица одноэлементная: действует самая свежая строка. Токен хранится
    зашифрованным (``core/utils/secret_box``) и наружу не отдаётся — API
    показывает только факт наличия и хвост из четырёх символов, чтобы админ
    отличил один ключ от другого.

    Зачем отдельная таблица, а не переменная окружения: токен протухает, и
    менять его правкой ``.env`` с перезапуском backend — плохой процесс. Если
    строки нет, берётся ``APP_CONFIG__HEMIS__DATA_TOKEN``.
    """

    __tablename__ = "hemis_data_credentials"

    data_url: Mapped[str] = mapped_column(String(255))
    token_encrypted: Mapped[str] = mapped_column(Text)

    #: Когда токен в последний раз успешно отработал. По нему видно, живой ли
    #: он, без лишнего запроса к HEMIS.
    last_ok_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    #: Начало окна для инкрементального прогона (`updated_at_from`). Хранится
    #: в базе, а не в Redis: пропажа этой метки означает полный прогон вместо
    #: ночного, и переживать перезапуск кэша она обязана.
    last_student_sync_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    def __str__(self):
        return f"HemisDataCredential {self.id} ({self.data_url})"
