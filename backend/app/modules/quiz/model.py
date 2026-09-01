import random
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.enums import QuestionType, QuizType
from app.core.mixins.external_ref import ExternalRefMixin, external_ref_index
from app.core.mixins.hideable import HideableMixin
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.model import TeacherSubject, User
    from app.modules.organization_structure.model import Group


class Subject(Base, IdIntPk, TimestampMixin, ExternalRefMixin, HideableMixin):
    __tablename__ = "subjects"
    # Уникальность в пределах кафедры: одноимённые предметы на разных кафедрах
    # в EPOS встречаются и являются разными предметами.
    __table_args__ = (
        # Nom boʻyicha unikallik faqat qoʻlda kiritilgan satrlarga (c5f30ab71d92):
        # EduPlan'da bir xil nomli ikki yozuv boʻlishi mumkin va cheklov butun
        # sinxronizatsiyani toʻxtatardi. Koʻzgu satrining oʻziga xosligini
        # external_ref indeksi taʼminlaydi.
        Index(
            "uq_subjects_kafedra_id_name",
            "kafedra_id", "name",
            unique=True,
            postgresql_where=text("external_source IS NULL"),
        ),
        external_ref_index("subjects"),
    )

    name: Mapped[str] = mapped_column(String(250))

    kafedra_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("kafedras.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    teacher_subjects: Mapped[list["TeacherSubject"]] = relationship(
        "TeacherSubject",
        back_populates="subject",
    )

    questions: Mapped[list["Question"]] = relationship("Question", back_populates="subject")

    quizzes: Mapped[list["Quiz"]] = relationship("Quiz", back_populates="subject")

    results: Mapped[list["Result"]] = relationship("Result", back_populates="subject")

    def __str__(self):
        return self.name


class Question(Base, IdIntPk, TimestampMixin):
    __tablename__ = "questions"

    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Savol turi (QuestionType). Ustun satr sifatida saqlanadi — Postgres enum
    # tipi emas. Diqqat: hozircha faqat "QUIZ" haqiqatan ishlaydi, qolgan
    # turlar uchun option_a..option_d / correct_option shakli mos kelmaydi.
    question_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        server_default=text(f"'{QuestionType.QUIZ.value}'"),
    )

    # Yangi turlar uchun ma'lumot (variantlar, to'g'ri javob(lar)). Eski
    # `QUIZ` turi o'z ustunlarida qoladi: bazada 64 mingdan ortiq savol bor
    # va ularni ko'chirish versiyalash zanjirini buzardi.
    #
    #   TRUE_FALSE   -> {"correct": true}
    #   MULTI_SELECT -> {"options": ["...", "..."], "correct": [0, 2]}
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

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


class Quiz(Base, IdIntPk, TimestampMixin):
    __tablename__ = "quizzes"

    # Лектор, чей банк вопросов собирается в тест. Физически колонка называется
    # user_id: исторически тест создавал сам преподаватель, поэтому «владелец» и
    # «автор вопросов» были одним человеком. Теперь тест создаёт организатор, и эти
    # роли разошлись — атрибут переименован на уровне ORM, чтобы «чей банк» и «кто
    # создал» больше нельзя было спутать. Физическое переименование колонки
    # отложено: на неё смотрят фронт и статистика преподавателя.
    lecturer_id: Mapped[int | None] = mapped_column(
        "user_id",
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Организатор тестирования, фактически создавший тест. Заполняется из токена,
    # а не из тела запроса, поэтому подделать авторство нельзя.
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    group_id: Mapped[int | None] = mapped_column(
        ForeignKey("groups.id", ondelete="SET NULL"),
        nullable=True,
    )
    subject_id: Mapped[int | None] = mapped_column(
        ForeignKey("subjects.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Dars bilan bog'liq test. Bo'sh bo'lishi mumkin: semestr yakuni yoki
    # kurs darajasidagi testlar hech qaysi darsga biriktirilmaydi. Dars
    # o'chirilsa, test qolaveradi — natijalar unga tayanadi.
    lesson_id: Mapped[int | None] = mapped_column(
        ForeignKey("lessons.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Nazorat turi (QuizType). Ilgari bu ma'lumot hech qayerda saqlanmagan —
    # testlar faqat nomi bilan farqlangan, shuning uchun ro'yxatni turi
    # bo'yicha filtrlash ham imkonsiz edi.
    quiz_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        server_default=text(f"'{QuizType.LESSON_QUIZ.value}'"),
    )

    title: Mapped[str] = mapped_column(nullable=False)
    question_number: Mapped[int] = mapped_column(nullable=False)
    duration: Mapped[int] = mapped_column(nullable=False)
    pin: Mapped[str] = mapped_column(nullable=False)
    is_active: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    proctoring_mode: Mapped[str] = mapped_column(nullable=False, server_default="standard")
    attempt: Mapped[int | None] = mapped_column(nullable=True, default=1)

    lecturer: Mapped["User"] = relationship(
        "User",
        back_populates="quizzes",
        foreign_keys=[lecturer_id],
    )

    created_by: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[created_by_user_id],
    )

    group: Mapped["Group"] = relationship("Group", back_populates="quizzes")

    subject: Mapped["Subject"] = relationship("Subject", back_populates="quizzes")

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


class QuizQuestion(Base, IdIntPk, TimestampMixin):
    __tablename__ = "quiz_questions"

    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"))
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"))

    quiz: Mapped["Quiz"] = relationship("Quiz", back_populates="quiz_questions")
    question: Mapped["Question"] = relationship("Question", back_populates="quiz_questions")

    def __str__(self):
        return f"{self.quiz.title} - {self.question.text}"


class Result(Base, IdIntPk, TimestampMixin):
    __tablename__ = "results"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    quiz_id: Mapped[int] = mapped_column(Integer, ForeignKey("quizzes.id", ondelete="SET NULL"), nullable=True)
    subject_id: Mapped[int] = mapped_column(Integer, ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True)
    group_id: Mapped[int] = mapped_column(Integer, ForeignKey("groups.id", ondelete="SET NULL"), nullable=True)

    # Ochiq testda ishtirokchi tizimda yo'q: `user_id` bo'sh qoladi, kim
    # yechgani faqat shu ismdan ma'lum. Ismni tekshirib bo'lmaydi — ochiq
    # testda bu muqarrar.
    guest_name: Mapped[str | None] = mapped_column(String(150), nullable=True)

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
