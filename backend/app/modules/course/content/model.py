from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.course.course.model import Course


class CourseTopic(Base, IdIntPk, TimestampMixin):
    """Раздел курса — то, что в интерфейсе называется «mavzu».

    Отдельная сущность, а не строка `Lesson.topic`: Lesson — это занятие по
    расписанию (группа, дата, журнал посещаемости), а здесь описывается
    содержимое курса, одинаковое для всех его групп.
    """

    __tablename__ = "course_topics"

    course_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    course: Mapped["Course"] = relationship("Course", back_populates="topics")
    materials: Mapped[list["CourseMaterial"]] = relationship(
        "CourseMaterial",
        back_populates="topic",
        cascade="all, delete-orphan",
        order_by="CourseMaterial.position, CourseMaterial.id",
    )

    def __str__(self):
        return self.title


class CourseMaterial(Base, IdIntPk, TimestampMixin):
    """Материал раздела: видеоурок, ссылка или текст.

    Файлы здесь не хранятся. Видео — ссылка (загруженная через /resource/upload
    или внешняя), вложения — список описаний {name, url, size}: сам файл лежит
    в uploads, а не в базе.
    """

    __tablename__ = "course_materials"

    topic_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("course_topics.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # upload — файл в uploads, youtube — внешняя ссылка. Различать нужно самому
    # плееру: встроенное видео и загруженный файл проигрываются по-разному.
    video_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    video_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    poster_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Подпись длительности («15 daq»), а не число: её показывают, а не считают.
    duration_label: Mapped[str | None] = mapped_column(String(20), nullable=True)

    attachments: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    topic: Mapped["CourseTopic"] = relationship("CourseTopic", back_populates="materials")
    progress: Mapped[list["CourseMaterialProgress"]] = relationship(
        "CourseMaterialProgress", back_populates="material", cascade="all, delete-orphan"
    )

    def __str__(self):
        return self.title


class CourseMaterialProgress(Base, IdIntPk, TimestampMixin):
    """Отметка «студент прошёл материал».

    Своя таблица, а не флаг на материале: материал один для всего курса, а
    отметка — у каждого студента своя.
    """

    __tablename__ = "course_material_progress"
    __table_args__ = (
        UniqueConstraint("material_id", "user_id", name="uq_material_progress_per_user"),
    )

    material_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("course_materials.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    material: Mapped["CourseMaterial"] = relationship("CourseMaterial", back_populates="progress")
