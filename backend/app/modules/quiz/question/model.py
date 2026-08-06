import random
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.user.model import User
    from app.modules.quiz.quiz.model import QuizQuestion
    from app.modules.quiz.subject.model import Subject
    from app.modules.quiz.user_answers.model import UserAnswers


class Question(Base, IdIntPk, TimestampMixin):
    __tablename__ = "questions"

    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    text: Mapped[str] = mapped_column(nullable=False)
    option_a: Mapped[str] = mapped_column(nullable=False)
    option_b: Mapped[str] = mapped_column(nullable=False)
    option_c: Mapped[str] = mapped_column(nullable=False)
    option_d: Mapped[str] = mapped_column(nullable=False)
    correct_option: Mapped[str] = mapped_column(String(1), nullable=False, server_default="a")

    # Versioning: editing a question never mutates it in place — it creates a new
    # row and flips is_latest on the old one, so historical UserAnswers/QuizQuestion
    # references to a specific version keep resolving to the exact text/options
    # that were shown at the time.
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    is_latest: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    original_question_id: Mapped[int | None] = mapped_column(
        ForeignKey("questions.id", ondelete="SET NULL"), nullable=True
    )

    # Soft delete: a question is never physically removed (it may already be
    # referenced by quiz_questions/user_answers) — deleting just flips this flag.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    subject: Mapped["Subject"] = relationship("Subject", back_populates="questions")

    user: Mapped["User"] = relationship("User", back_populates="questions")

    quiz_questions: Mapped[list["QuizQuestion"]] = relationship(
        "QuizQuestion",
        back_populates="question",
    )

    user_answers: Mapped[list["UserAnswers"]] = relationship("UserAnswers", back_populates="question")

    def __str__(self):
        return self.text

    def get_correct_text(self) -> str:
        return getattr(self, f"option_{self.correct_option}")

    def to_dict(self, randomize_options: bool = True):
        """
        Convert question to dict.
        Randomly shuffles options, but does not show which is correct.
        """
        options = [self.option_a, self.option_b, self.option_c, self.option_d]
        if randomize_options:
            random.shuffle(options)

        return {
            "id": self.id,
            "text": self.text,
            "options": options,
        }
