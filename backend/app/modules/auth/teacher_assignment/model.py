from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.teacher.model import Teacher
    from app.modules.organization_structure.group.model import Group
    from app.modules.quiz.subject.model import Subject


class TeacherAssignment(Base, IdIntPk, TimestampMixin):
    __tablename__ = "teacher_assignments"
    __table_args__ = (
        UniqueConstraint("teacher_id", "subject_id", "group_id", name="uq_teacher_subject_group"),
    )

    teacher_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("teachers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subject_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("subjects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    group_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    teacher: Mapped["Teacher"] = relationship("Teacher")
    subject: Mapped["Subject"] = relationship("Subject")
    group: Mapped["Group"] = relationship("Group")

    def __str__(self):
        return f"TeacherAssignment teacher={self.teacher_id} subject={self.subject_id} group={self.group_id}"
