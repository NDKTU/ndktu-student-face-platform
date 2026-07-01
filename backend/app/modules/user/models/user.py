from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.group.models.group_teachers import GroupTeacher
    from app.modules.hemis.model import HemisTransaction
    from app.modules.question.model import Question
    from app.modules.quiz.models.quiz import Quiz
    from app.modules.result.model import Result
    from app.modules.role.models.role import Role
    from app.modules.student.model import Student
    from app.modules.teacher.model import Teacher
    from app.modules.user_answers.model import UserAnswers
    from app.modules.yakuniy.model import Yakuniy


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

    teacher: Mapped["Teacher"] = relationship("Teacher", back_populates="user")

    group_teachers: Mapped[list["GroupTeacher"]] = relationship(
        "GroupTeacher", back_populates="teacher", cascade="all, delete-orphan"
    )

    yakuniy_results: Mapped[list["Yakuniy"]] = relationship("Yakuniy", back_populates="user")

    hemis_transactions: Mapped[list["HemisTransaction"]] = relationship("HemisTransaction", back_populates="user")

    def __str__(self):
        return self.username
