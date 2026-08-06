from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.user.model import User
    from app.modules.course.content.model import CourseTopic
    from app.modules.course.lesson.model import Lesson
    from app.modules.course.resource.model import Resource
    from app.modules.organization_structure.faculty.model import Faculty
    from app.modules.organization_structure.group.model import Group
    from app.modules.organization_structure.kafedra.model import Kafedra
    from app.modules.organization_structure.speciality.model import Speciality
    from app.modules.quiz.subject.model import Subject


class Course(Base, IdIntPk, TimestampMixin):
    __tablename__ = "courses"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    subject_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("subjects.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    teacher_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    semester_number: Mapped[int | None] = mapped_column(Integer, nullable=True)

    faculty_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("faculties.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    kafedra_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("kafedras.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    speciality_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("specialities.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    subject: Mapped["Subject"] = relationship("Subject")
    teacher: Mapped["User"] = relationship("User")
    faculty: Mapped["Faculty | None"] = relationship("Faculty")
    kafedra: Mapped["Kafedra | None"] = relationship("Kafedra")
    speciality: Mapped["Speciality | None"] = relationship("Speciality")

    course_groups: Mapped[list["CourseGroup"]] = relationship(
        "CourseGroup",
        back_populates="course",
        cascade="all, delete-orphan",
    )
    groups: Mapped[list["Group"]] = relationship(
        "Group",
        secondary="course_groups",
        viewonly=True,
    )

    lessons: Mapped[list["Lesson"]] = relationship(
        "Lesson",
        back_populates="course",
    )

    topics: Mapped[list["CourseTopic"]] = relationship(
        "CourseTopic",
        back_populates="course",
        cascade="all, delete-orphan",
        order_by="CourseTopic.position, CourseTopic.id",
    )

    resources: Mapped[list["Resource"]] = relationship(
        "Resource",
        back_populates="course",
        cascade="all, delete-orphan",
    )

    def __str__(self):
        return f"Course {self.id} ({self.name})"


class CourseGroup(Base, IdIntPk, TimestampMixin):
    __tablename__ = "course_groups"
    __table_args__ = (UniqueConstraint("course_id", "group_id", name="uq_course_group"),)

    course_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    group_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    course: Mapped["Course"] = relationship("Course", back_populates="course_groups")
    group: Mapped["Group"] = relationship("Group")

    def __str__(self):
        return f"CourseGroup course={self.course_id} group={self.group_id}"
