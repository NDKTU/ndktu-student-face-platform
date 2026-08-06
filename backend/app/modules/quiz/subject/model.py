from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.teacher.model import Teacher
    from app.modules.organization_structure.kafedra.model import Kafedra
    from app.modules.quiz.question.model import Question
    from app.modules.quiz.quiz.model import Quiz
    from app.modules.quiz.result.model import Result


class Subject(Base, IdIntPk, TimestampMixin):
    __tablename__ = "subjects"

    name: Mapped[str] = mapped_column(String(250), unique=True)

    # Каталожная карточка фана. Раньше у предмета было только имя, и справочник
    # на фронте показывать было нечего.
    kafedra_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("kafedras.id", ondelete="SET NULL"), nullable=True, index=True
    )
    code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    credit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    semester: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    kafedra: Mapped["Kafedra | None"] = relationship("Kafedra")

    subject_teachers: Mapped[list["SubjectTeacher"]] = relationship(
        "SubjectTeacher",
        back_populates="subject",
    )

    questions: Mapped[list["Question"]] = relationship("Question", back_populates="subject")

    quizzes: Mapped[list["Quiz"]] = relationship("Quiz", back_populates="subject")

    results: Mapped[list["Result"]] = relationship("Result", back_populates="subject")

    def __str__(self):
        return self.name


class SubjectTeacher(Base, IdIntPk, TimestampMixin):
    __tablename__ = "subject_teachers"

    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id"))

    subject: Mapped["Subject"] = relationship("Subject", back_populates="subject_teachers")
    teacher: Mapped["Teacher"] = relationship("Teacher", back_populates="subject_teachers")

    def __str__(self):
        return f"{self.subject.name} - {self.teacher.name}"
