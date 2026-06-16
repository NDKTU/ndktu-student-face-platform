from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.course.model import Course


class Module(Base, IdIntPk, TimestampMixin):
    __tablename__ = "course_modules"

    course_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    course: Mapped["Course"] = relationship("Course")
    topics: Mapped[list["Topic"]] = relationship(
        "Topic",
        back_populates="module",
        cascade="all, delete-orphan",
        order_by="Topic.order_index",
    )

    def __str__(self):
        return f"Module {self.id} ({self.name})"


class Topic(Base, IdIntPk, TimestampMixin):
    __tablename__ = "course_topics"

    module_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("course_modules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    learning_outcomes: Mapped[str | None] = mapped_column(Text, nullable=True)

    module: Mapped["Module"] = relationship("Module", back_populates="topics")

    def __str__(self):
        return f"Topic {self.id} ({self.name})"
