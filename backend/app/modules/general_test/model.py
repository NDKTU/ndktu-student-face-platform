"""Общий тест («Umumiy test») — простой тест для всех пользователей.

Отдельный модуль, а не ещё один `QuizType`: обычный тест держится на
предмете, лекторе и группе (банк вопросов собирается по `subject_id`,
результаты попадают в ведомости и статистику преподавателя). Здесь ничего
этого нет — вопросы принадлежат самому тесту, проходит его любой
пользователь, а результаты живут в своих таблицах и не смешиваются с
академическими.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin, utcnow_naive

if TYPE_CHECKING:
    from app.modules.auth.model import User


class GeneralTest(Base, IdIntPk, TimestampMixin):
    __tablename__ = "general_tests"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: Минуты на одну попытку.
    duration: Mapped[int] = mapped_column(Integer, nullable=False, server_default="30")
    #: Сколько попыток даётся одному пользователю.
    attempt_limit: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    #: Неактивный тест не виден в списке «пройти» и не стартует.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    questions: Mapped[list[GeneralTestQuestion]] = relationship(
        "GeneralTestQuestion",
        back_populates="test",
        cascade="all, delete-orphan",
        order_by="(GeneralTestQuestion.order, GeneralTestQuestion.id)",
    )

    def __str__(self) -> str:
        return self.title


class GeneralTestQuestion(Base, IdIntPk, TimestampMixin):
    __tablename__ = "general_test_questions"

    test_id: Mapped[int] = mapped_column(
        ForeignKey("general_tests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    option_a: Mapped[str] = mapped_column(Text, nullable=False)
    option_b: Mapped[str] = mapped_column(Text, nullable=False)
    option_c: Mapped[str] = mapped_column(Text, nullable=False)
    option_d: Mapped[str] = mapped_column(Text, nullable=False)
    #: Буква правильного варианта: a / b / c / d.
    correct_option: Mapped[str] = mapped_column(String(1), nullable=False, server_default="a")
    order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    test: Mapped[GeneralTest] = relationship("GeneralTest", back_populates="questions")

    def option(self, letter: str) -> str:
        return getattr(self, f"option_{letter}")


class GeneralTestAttempt(Base, IdIntPk, TimestampMixin):
    """Одна попытка пользователя. Она же — результат.

    `layout` замораживает перемешивание на старте: `[{"q": id, "o": "cabd"}]`.
    Без этого перезагрузка страницы показывала бы вопросы и варианты в новом
    порядке, а вопрос, добавленный в тест посреди попытки, внезапно появлялся
    бы у того, кто уже отвечает.
    """

    __tablename__ = "general_test_attempts"

    test_id: Mapped[int] = mapped_column(
        ForeignKey("general_tests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    #: in_progress → completed.
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="in_progress")
    #: Наивный UTC, как и `created_at` (core/mixins/time_stamp_mixin): с ним
    #: сравнивается `utcnow_naive()` при расчёте оставшегося времени.
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow_naive)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    layout: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, server_default="[]")
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    correct_answers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    #: Процент правильных ответов, 0–100.
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    test: Mapped[GeneralTest] = relationship("GeneralTest")
    user: Mapped[User | None] = relationship("User")
    answers: Mapped[list[GeneralTestAnswer]] = relationship(
        "GeneralTestAnswer", back_populates="attempt", cascade="all, delete-orphan"
    )


class GeneralTestAnswer(Base, IdIntPk, TimestampMixin):
    __tablename__ = "general_test_answers"
    # Повторный ответ на тот же вопрос перезаписывает прежний.
    __table_args__ = (UniqueConstraint("attempt_id", "question_id", name="uq_general_test_answer"),)

    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("general_test_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("general_test_questions.id", ondelete="CASCADE"), nullable=False
    )
    #: Исходная буква выбранного варианта (не позиция на экране).
    selected_option: Mapped[str] = mapped_column(String(1), nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    attempt: Mapped[GeneralTestAttempt] = relationship("GeneralTestAttempt", back_populates="answers")
