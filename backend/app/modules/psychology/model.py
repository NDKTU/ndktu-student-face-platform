from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.user.model import User


class PsychologyMethod(Base, IdIntPk, TimestampMixin):
    __tablename__ = "psychology_methods"

    name: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str] = mapped_column(String(255))
    instruction: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")

    questions: Mapped[list[PsychologyQuestion]] = relationship(
        "PsychologyQuestion",
        back_populates="method",
        cascade="all, delete-orphan",
        order_by="PsychologyQuestion.order",
    )

    def __str__(self) -> str:
        return f"PsychologyMethod(id={self.id}, name={self.name})"


class PsychologyQuestion(Base, IdIntPk, TimestampMixin):
    """
    Elastic question model — `content` and `options` structure depends on `question_type`:

    type            content keys                        options
    ──────────────  ──────────────────────────────────  ────────────────────────
    text            {text}                              [{text, value}, ...]
    true_false      {text}                              null
    scale           {text, min, max, min_label?,        null
                     max_label?}
    image_stimulus  {image_url, text?}                  [{text, value}, ...]
    image_choice    {text?}                             [{image_url, value}, ...]
    """

    __tablename__ = "psychology_questions"

    method_id: Mapped[int] = mapped_column(ForeignKey("psychology_methods.id", ondelete="CASCADE"), nullable=False)
    question_type: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    options: Mapped[list[Any] | None] = mapped_column(JSONB, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)

    method: Mapped[PsychologyMethod] = relationship(
        "PsychologyMethod",
        back_populates="questions",
    )

    def __str__(self) -> str:
        return f"PsychologyQuestion(id={self.id}, type={self.question_type})"


class PsychologyResult(Base, IdIntPk, TimestampMixin):
    """Stores a user's submitted answers for one psychology method test."""

    __tablename__ = "psychology_results"

    method_id: Mapped[int] = mapped_column(ForeignKey("psychology_methods.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    answers: Mapped[list[Any]] = mapped_column(
        JSONB,
        nullable=False,
        # [{question_id, value}] where value depends on question_type
    )
    diagnosis: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    method: Mapped[PsychologyMethod] = relationship("PsychologyMethod")
    user: Mapped[User] = relationship("User")

    def __str__(self) -> str:
        return f"PsychologyResult(id={self.id}, method_id={self.method_id})"
