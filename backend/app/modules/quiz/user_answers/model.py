from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.user.model import User
    from app.modules.quiz.question.model import Question
    from app.modules.quiz.quiz.model import Quiz
    from app.modules.quiz.result.model import Result


class UserAnswers(Base, IdIntPk, TimestampMixin):
    __tablename__ = "user_answers"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    quiz_id: Mapped[int] = mapped_column(Integer, ForeignKey("quizzes.id", ondelete="SET NULL"), nullable=True)
    question_id: Mapped[int] = mapped_column(Integer, ForeignKey("questions.id", ondelete="SET NULL"), nullable=True)
    result_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("results.id", ondelete="CASCADE"), nullable=True, index=True
    )
    answer: Mapped[str] = mapped_column(String, nullable=True)
    correct_answer: Mapped[str | None] = mapped_column(String, nullable=True)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship("User", back_populates="user_answers")
    quiz: Mapped["Quiz"] = relationship("Quiz", back_populates="user_answers")
    question: Mapped["Question"] = relationship("Question", back_populates="user_answers")
    result: Mapped["Result"] = relationship("Result", back_populates="user_answers")

    def __str__(self):
        return f"UserAnswer {self.id} - {self.answer}"
