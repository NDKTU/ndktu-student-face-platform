from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.group.models.group import Group
    from app.modules.quiz.models.quiz_questions import QuizQuestion
    from app.modules.result.model import Result
    from app.modules.subject.models.subject import Subject
    from app.modules.user.models.user import User
    from app.modules.user_answers.model import UserAnswers
    from app.modules.academic_year.model import Semester


class Quiz(Base, IdIntPk, TimestampMixin):
    __tablename__ = "quizzes"

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    group_id: Mapped[int | None] = mapped_column(
        ForeignKey("groups.id", ondelete="SET NULL"),
        nullable=True,
    )
    subject_id: Mapped[int | None] = mapped_column(
        ForeignKey("subjects.id", ondelete="SET NULL"),
        nullable=True,
    )
    semester_id: Mapped[int | None] = mapped_column(
        ForeignKey("semesters.id", ondelete="SET NULL"),
        nullable=True,
    )

    title: Mapped[str] = mapped_column(nullable=False)
    question_number: Mapped[int] = mapped_column(nullable=False)
    duration: Mapped[int] = mapped_column(nullable=False)
    pin: Mapped[str] = mapped_column(nullable=False)
    is_active: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    proctoring_mode: Mapped[str] = mapped_column(nullable=False, server_default="standard")
    attempt: Mapped[int | None] = mapped_column(nullable=True, default=1)

    user: Mapped["User"] = relationship("User", back_populates="quizzes")

    group: Mapped["Group"] = relationship("Group", back_populates="quizzes")

    subject: Mapped["Subject"] = relationship("Subject", back_populates="quizzes")
    
    semester: Mapped["Semester"] = relationship("Semester", back_populates="quizzes")

    quiz_questions: Mapped[list["QuizQuestion"]] = relationship(
        "QuizQuestion",
        back_populates="quiz",
        cascade="all, delete-orphan",
    )

    results: Mapped[list["Result"]] = relationship(
        "Result",
        back_populates="quiz",
        cascade="all, delete-orphan",
    )

    user_answers: Mapped[list["UserAnswers"]] = relationship(
        "UserAnswers",
        back_populates="quiz",
        cascade="all, delete-orphan",
    )

    def __str__(self):
        return self.title

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "questions": [qq.question.to_dict() for qq in self.quiz_questions],
        }

