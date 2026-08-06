from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.user.model import User
    from app.modules.organization_structure.group.model import Group
    from app.modules.quiz.quiz.model import Quiz
    from app.modules.quiz.subject.model import Subject
    from app.modules.quiz.user_answers.model import UserAnswers


class Result(Base, IdIntPk, TimestampMixin):
    __tablename__ = "results"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    quiz_id: Mapped[int] = mapped_column(Integer, ForeignKey("quizzes.id", ondelete="SET NULL"), nullable=True)
    subject_id: Mapped[int] = mapped_column(Integer, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True)
    group_id: Mapped[int] = mapped_column(Integer, ForeignKey("groups.id", ondelete="SET NULL"), nullable=True)

    # Lifecycle: created as "in_progress" at start_quiz time, finalized to
    # "completed" by end_quiz — created_at is therefore the attempt's start time.
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="in_progress")
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    correct_answers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    wrong_answers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grade: Mapped[int | None] = mapped_column(Integer, nullable=True)

    cheating_detected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    reason_for_stop: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cheating_image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="results")
    quiz: Mapped["Quiz"] = relationship("Quiz", back_populates="results")
    subject: Mapped["Subject"] = relationship("Subject", back_populates="results")
    group: Mapped["Group"] = relationship("Group", back_populates="results")
    user_answers: Mapped[list["UserAnswers"]] = relationship(
        "UserAnswers", back_populates="result", cascade="all, delete-orphan"
    )

    def __str__(self):
        return f"Result {self.id} - Grade: {self.grade}"
