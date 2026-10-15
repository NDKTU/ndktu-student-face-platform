from datetime import date, datetime, time

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    text,
)
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


class HemisScheduleLesson(Base, IdIntPk, TimestampMixin):
    """Одно занятие из расписания HEMIS (`/rest/v1/data/schedule-list`).

    Зеркало только для чтения, и **намеренно изолированное**: ни одного
    внешнего ключа на `groups`, `teachers`, `subjects`. Хранится всё, что
    пришло, с идентификаторами HEMIS — и ищется по ним же. Причины:

    * связки с нашей оргструктурой неполные (группы без `hemis_group_id`,
      преподаватели с логинами-заглушками), а расписание нужно целиком;
    * удаление преподавателя из EPMOS каскадно чистит его данные — расписание
      HEMIS к этому отношения не имеет и пострадать не должно.

    Преподаватель ищется по логину: он приезжает из EPMOS и равен номеру
    сотрудника HEMIS, т. е. `employee_id_number`. В самом расписании его нет —
    там внутренний `employee.id`, — поэтому синк подставляет номер из
    `employee-list`.

    Пропавшее из HEMIS занятие не удаляется, а получает `is_active = False`:
    обход двухсот страниц не атомарен, и строка, «выпавшая» из-за сдвига
    страниц, вернётся следующим прогоном.
    """

    __tablename__ = "hemis_schedule_lessons"
    __table_args__ = (
        Index("ix_hemis_schedule_lessons_employee_date", "employee_id_number", "lesson_date"),
        Index("ix_hemis_schedule_lessons_group_date", "group_hemis_id", "lesson_date"),
    )

    hemis_id: Mapped[int] = mapped_column(BigInteger, unique=True)

    education_year: Mapped[str] = mapped_column(String(16), index=True)
    education_year_name: Mapped[str] = mapped_column(String(32), default="")
    semester_hemis_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    semester_code: Mapped[str] = mapped_column(String(16), default="")
    semester_name: Mapped[str] = mapped_column(String(64), default="")

    group_hemis_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    group_name: Mapped[str] = mapped_column(String(255), default="")
    education_lang: Mapped[str] = mapped_column(String(64), default="")

    subject_hemis_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    subject_code: Mapped[str] = mapped_column(String(64), default="")
    subject_name: Mapped[str] = mapped_column(String(500), default="")

    faculty_hemis_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    faculty_name: Mapped[str] = mapped_column(String(255), default="")
    #: Кафедра: в HEMIS это `department` со `structureType` «Kafedra».
    department_hemis_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    department_name: Mapped[str] = mapped_column(String(255), default="")

    auditorium_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    auditorium_name: Mapped[str] = mapped_column(String(128), default="")
    auditorium_type: Mapped[str] = mapped_column(String(64), default="")
    building_hemis_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    building_name: Mapped[str] = mapped_column(String(255), default="")

    training_type_code: Mapped[str] = mapped_column(String(16), default="")
    #: «Ma'ruza», «Amaliy», «Laboratoriya» и т. п.
    training_type: Mapped[str] = mapped_column(String(64), default="")

    #: Код пары в справочнике HEMIS и её номер («5»).
    lesson_pair_code: Mapped[str] = mapped_column(String(16), default="")
    lesson_pair: Mapped[str] = mapped_column(String(16), default="")
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)

    employee_hemis_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    #: Номер сотрудника HEMIS = логин преподавателя у нас. Пуст, если
    #: человека нет в `employee-list`.
    employee_id_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    employee_name: Mapped[str] = mapped_column(String(255), default="")

    lesson_date: Mapped[date] = mapped_column(Date, index=True)
    week_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    week_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    #: `updated_at` самой записи в HEMIS (naive UTC).
    hemis_updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))

    def __str__(self):
        return f"HemisScheduleLesson {self.hemis_id} ({self.group_name}, {self.lesson_date})"


class HemisStudentGroup(Base, IdIntPk, TimestampMixin):
    """Номер студента → его группа в HEMIS.

    Нужна, чтобы студент нашёл своё расписание по логину (`username` =
    `student_id_number`), не заходя в `groups`: у части групп
    `hemis_group_id` не проставлен, а расписание им всё равно положено.

    Заполняется ночным импортом студентов (`student_sync.py`) из того же
    обхода `student-list` — **для всех**, включая тех, кого импорт пропускает
    из-за непривязанной группы.
    """

    __tablename__ = "hemis_student_groups"

    student_id_number: Mapped[str] = mapped_column(String(64), unique=True)
    group_hemis_id: Mapped[int] = mapped_column(Integer, index=True)
    group_name: Mapped[str] = mapped_column(String(255), default="")
    synced_at: Mapped[datetime] = mapped_column(DateTime)

    def __str__(self):
        return f"HemisStudentGroup {self.student_id_number} → {self.group_hemis_id}"
