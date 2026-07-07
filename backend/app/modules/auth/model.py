from typing import TYPE_CHECKING

from sqlalchemy import Date, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.organization_structure.model import Department
    from app.modules.organization_structure.model import Group
    from app.modules.organization_structure.model import GroupTeacher
    from app.modules.organization_structure.model import Kafedra
    from app.modules.quiz.model import Question
    from app.modules.quiz.model import Quiz
    from app.modules.quiz.model import Result
    from app.modules.quiz.model import Subject
    from app.modules.quiz.model import SubjectTeacher
    from app.modules.quiz.model import UserAnswers


class User(Base, IdIntPk, TimestampMixin):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(50), unique=True)
    password: Mapped[str] = mapped_column(String(255))

    roles: Mapped[list["Role"]] = relationship(
        "Role", secondary="user_roles", back_populates="users", overlaps="user_roles"
    )

    student: Mapped["Student"] = relationship("Student", back_populates="user")

    questions: Mapped[list["Question"]] = relationship("Question", back_populates="user")

    quizzes: Mapped[list["Quiz"]] = relationship("Quiz", back_populates="user")

    results: Mapped[list["Result"]] = relationship("Result", back_populates="user")

    user_answers: Mapped[list["UserAnswers"]] = relationship("UserAnswers", back_populates="user")

    employee: Mapped["Employee"] = relationship("Employee", back_populates="user")

    group_teachers: Mapped[list["GroupTeacher"]] = relationship(
        "GroupTeacher", back_populates="teacher", cascade="all, delete-orphan"
    )

    def __str__(self):
        return self.username


class UserRole(Base, IdIntPk, TimestampMixin):
    __tablename__ = "user_roles"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)

    user: Mapped["User"] = relationship("User", lazy="selectin", overlaps="roles,users")
    role: Mapped["Role"] = relationship("Role", lazy="selectin", overlaps="roles,users")


class Role(Base, IdIntPk, TimestampMixin):
    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(50), unique=True)

    users: Mapped[list["User"]] = relationship(
        "User", secondary="user_roles", back_populates="roles", overlaps="user_roles"
    )

    permissions: Mapped[list["Permission"]] = relationship(
        "Permission",
        secondary="role_permissions",
        back_populates="roles",
        overlaps="role_permissions",
    )

    def __str__(self):
        return self.name


class RolePermission(Base, IdIntPk, TimestampMixin):
    __tablename__ = "role_permissions"

    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
    permission_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False
    )

    role: Mapped["Role"] = relationship("Role", lazy="selectin", overlaps="permissions")
    permission: Mapped["Permission"] = relationship("Permission", lazy="selectin", overlaps="permissions")

    def __str__(self) -> str:
        return f"{self.role} → {self.permission}"


class Permission(Base, IdIntPk, TimestampMixin):
    __tablename__ = "permissions"

    name: Mapped[str] = mapped_column(String(50), unique=True)

    roles: Mapped[list["Role"]] = relationship(
        "Role",
        secondary="role_permissions",
        back_populates="permissions",
        overlaps="role_permissions,role,permission",
    )

    def __str__(self):
        return self.name


class Student(Base, TimestampMixin, IdIntPk):
    __tablename__ = "students"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    group_id: Mapped[int] = mapped_column(Integer, ForeignKey("groups.id", ondelete="SET NULL"), nullable=True)

    first_name: Mapped[str] = mapped_column(String)
    last_name: Mapped[str] = mapped_column(String)
    third_name: Mapped[str] = mapped_column(String)
    full_name: Mapped[str] = mapped_column(String)
    student_id_number: Mapped[str] = mapped_column(String)
    image_path: Mapped[str] = mapped_column(String)
    birth_date: Mapped[Date] = mapped_column(Date)
    phone: Mapped[str] = mapped_column(String, nullable=True)
    gender: Mapped[str] = mapped_column(String)
    university: Mapped[str] = mapped_column(String)
    specialty: Mapped[str] = mapped_column(String)
    student_status: Mapped[str] = mapped_column(String)
    education_form: Mapped[str] = mapped_column(String)
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

    group: Mapped["Group"] = relationship("Group", back_populates="students")
    user: Mapped["User"] = relationship("User", back_populates="student")


class Employee(Base, IdIntPk, TimestampMixin):
    __tablename__ = "employees"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    last_name: Mapped[str] = mapped_column(String(255))
    first_name: Mapped[str] = mapped_column(String(255))
    third_name: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(500), unique=True)

    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="employee")
    teacher: Mapped["Teacher"] = relationship("Teacher", back_populates="employee", uselist=False)
    department: Mapped["Department | None"] = relationship("Department", back_populates="employees")

    def __str__(self):
        return self.full_name


class Teacher(Base, IdIntPk, TimestampMixin):
    __tablename__ = "teachers"
    kafedra_id: Mapped[int] = mapped_column(ForeignKey("kafedras.id"))
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), unique=True)

    kafedra: Mapped["Kafedra"] = relationship("Kafedra", back_populates="teachers")

    subject_teachers: Mapped[list["SubjectTeacher"]] = relationship(
        "SubjectTeacher",
        back_populates="teacher",
    )

    employee: Mapped["Employee"] = relationship("Employee", back_populates="teacher")

    def __str__(self):
        return self.employee.full_name if self.employee else f"Teacher {self.id}"


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
