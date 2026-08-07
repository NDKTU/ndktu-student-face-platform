from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.employee.model import Employee
    from app.modules.auth.role.model import Role
    from app.modules.auth.student.model import Student
    from app.modules.organization_structure.group.model import GroupTeacher
    from app.modules.quiz.question.model import Question
    from app.modules.quiz.quiz.model import Quiz
    from app.modules.quiz.result.model import Result
    from app.modules.quiz.user_answers.model import UserAnswers


class User(Base, IdIntPk, TimestampMixin):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(50), unique=True)
    password: Mapped[str] = mapped_column(String(255))

    roles: Mapped[list["Role"]] = relationship(
        "Role",
        secondary="user_roles",
        back_populates="users",
        overlaps="user_roles",
        # Без явного порядка «первая» роль зависит от плана запроса: у декана их
        # две, и бейдж с цветом аватара менялись бы между загрузками страницы.
        order_by="Role.name",
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

    # Оба столбца индексируются: по ним идёт join на каждом запросе
    # не-администратора — там, где PermissionRequired проверяет право.
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True
    )

    user: Mapped["User"] = relationship("User", lazy="selectin", overlaps="roles,users")
    role: Mapped["Role"] = relationship("Role", lazy="selectin", overlaps="roles,users")
