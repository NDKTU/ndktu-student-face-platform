from datetime import date as date_type
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.organization_structure.model import Faculty
    from app.modules.organization_structure.model import Group
    from app.modules.organization_structure.model import Kafedra
    from app.modules.organization_structure.model import Speciality
    from app.modules.quiz.model import Subject
    from app.modules.quiz.model import SubjectTeacher
    from app.modules.auth.model import User


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


class Lesson(Base, IdIntPk, TimestampMixin):
    __tablename__ = "lessons"

    subject_teacher_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("subject_teachers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    group_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    course_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    lesson_type: Mapped[str | None] = mapped_column(String(20), nullable=True)

    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    subject_teacher: Mapped["SubjectTeacher"] = relationship("SubjectTeacher")
    group: Mapped["Group"] = relationship("Group")
    course: Mapped["Course"] = relationship("Course", back_populates="lessons")
    results: Mapped[list["LessonResult"]] = relationship(
        "LessonResult", back_populates="lesson", cascade="all, delete-orphan"
    )
    resources: Mapped[list["Resource"]] = relationship(
        "Resource", back_populates="lesson", cascade="all, delete-orphan"
    )

    def __str__(self):
        return f"Lesson {self.id} ({self.topic} @ {self.date})"


class LessonResult(Base, IdIntPk, TimestampMixin):
    __tablename__ = "lesson_results"
    __table_args__ = (UniqueConstraint("lesson_id", "user_id", name="uq_lesson_result_per_user"),)

    lesson_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("lessons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    attendance: Mapped[str] = mapped_column(String(16), nullable=False)
    grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    lesson: Mapped["Lesson"] = relationship("Lesson", back_populates="results")
    user: Mapped["User"] = relationship("User")

    def __str__(self):
        return f"LessonResult lesson={self.lesson_id} user={self.user_id}"


class Assignment(Base, IdIntPk, TimestampMixin):
    __tablename__ = "assignments"

    course_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lesson_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    deadline: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    max_grade: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    allow_file: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    allow_text: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    allowed_file_types: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    course: Mapped["Course"] = relationship("Course")
    lesson: Mapped["Lesson | None"] = relationship("Lesson")
    created_by: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_user_id])
    submissions: Mapped[list["AssignmentSubmission"]] = relationship(
        "AssignmentSubmission", back_populates="assignment", cascade="all, delete-orphan"
    )

    def __str__(self):
        return f"Assignment {self.id} ({self.title})"


class AssignmentSubmission(Base, IdIntPk, TimestampMixin):
    __tablename__ = "assignment_submissions"
    __table_args__ = (UniqueConstraint("assignment_id", "user_id", name="uq_submission_per_user"),)

    assignment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    submitted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_files: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")

    grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    graded_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    graded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    assignment: Mapped["Assignment"] = relationship("Assignment", back_populates="submissions")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    graded_by: Mapped["User | None"] = relationship("User", foreign_keys=[graded_by_user_id])

    def __str__(self):
        return f"Submission {self.id} (assignment={self.assignment_id}, user={self.user_id})"


class Resource(Base, IdIntPk, TimestampMixin):
    __tablename__ = "resources"

    lesson_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=True, index=True
    )
    course_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=True, index=True
    )

    resource_type: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)

    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    link_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    text_content: Mapped[str | None] = mapped_column(Text, nullable=True)

    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    lesson: Mapped["Lesson | None"] = relationship("Lesson", back_populates="resources")
    course: Mapped["Course | None"] = relationship("Course", back_populates="resources")
    created_by: Mapped["User | None"] = relationship("User")

    def __str__(self):
        return f"Resource {self.id} ({self.resource_type}: {self.title})"
