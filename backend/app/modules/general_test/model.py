"""Elementar test (ilgari «Umumiy test») — fanga biriktirilgan oddiy test.

Отдельный модуль, а не ещё один `QuizType`: обычный тест держится на
предмете из учебного плана, лекторе и группе (банк вопросов собирается по
`subject_id`, результаты попадают в ведомости и статистику преподавателя).
Здесь свои «fanlar» — их заводит админ, к ним не привязан преподаватель.
Вопросы — банк fan'а (`general_test_questions.subject_id`): каждый тест
этого fan'а берёт из банка случайные `question_number` вопросов. Результаты
живут в своих таблицах и не смешиваются с академическими.

Кто видит тест: он должен быть активен, и пользователь либо назначен на его
fan (`general_test_subject_users` — любой пользователь, не только
преподаватель), либо учится в одной из групп, назначенных самому тесту
(`general_test_groups`).
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
    from app.modules.organization_structure.model import Group


class GeneralTestSubject(Base, IdIntPk, TimestampMixin):
    """Fan elementar testlar uchun — o'quv rejadagi `subjects` dan alohida.

    `subjects` EPOS/HEMIS'dan keladi va o'qituvchiga bog'lanadi; bu yerda esa
    fanni admin o'zi ochadi va unga istalgan foydalanuvchini biriktiradi.
    """

    __tablename__ = "general_test_subjects"

    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    questions: Mapped[list[GeneralTestQuestion]] = relationship(
        "GeneralTestQuestion",
        back_populates="subject",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="(GeneralTestQuestion.order, GeneralTestQuestion.id)",
    )

    def __str__(self) -> str:
        return self.name


class GeneralTestSubjectUser(Base, IdIntPk, TimestampMixin):
    """Fanga biriktirilgan foydalanuvchi: fanning faol testlarini ko'radi."""

    __tablename__ = "general_test_subject_users"
    __table_args__ = (UniqueConstraint("subject_id", "user_id", name="uq_general_test_subject_user"),)

    subject_id: Mapped[int] = mapped_column(
        ForeignKey("general_test_subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)


class GeneralTestGroup(Base, IdIntPk, TimestampMixin):
    """Testga biriktirilgan guruh: guruh talabalari shu testni ko'radi."""

    __tablename__ = "general_test_groups"
    __table_args__ = (UniqueConstraint("test_id", "group_id", name="uq_general_test_group"),)

    test_id: Mapped[int] = mapped_column(
        ForeignKey("general_tests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    #: Guruh uchun yoqilganmi. O'chirilgan guruh testga biriktirilgan bo'lib
    #: qoladi (ro'yxatda turadi, qayta yoqish bir bosish), lekin uning
    #: talabalari testni ko'rmaydi va boshlay olmaydi.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true", default=True)

    group: Mapped[Group] = relationship("Group")


class GeneralTest(Base, IdIntPk, TimestampMixin):
    __tablename__ = "general_tests"

    #: Fanda testlar bor ekan, uni o'chirib bo'lmaydi (RESTRICT) — aks holda
    #: testlar natijalari bilan birga jimgina yo'qolardi.
    subject_id: Mapped[int] = mapped_column(
        ForeignKey("general_test_subjects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    #: Fan va guruh nomlaridan avtomatik tuziladi (`repository._compose_title`):
    #: qo'lda kiritilmaydi, fan yoki guruhlar o'zgarganda qayta yoziladi.
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    #: Endi ishlatilmaydi — formadan olib tashlangan. Ustun eski testlardagi
    #: matn yo'qolmasligi uchun qoldirildi.
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: Минуты на одну попытку.
    duration: Mapped[int] = mapped_column(Integer, nullable=False, server_default="30")
    #: Сколько попыток даётся одному пользователю.
    attempt_limit: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    #: Сколько вопросов достаётся одной попытке — случайные из банка fan'а.
    #: NULL — все. Вопросов меньше, чем задано, — выдаются все, что есть:
    #: удалённый вопрос не должен ломать старт уже активного теста.
    question_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    #: Неактивный тест не виден в списке «пройти» и не стартует. Активный
    #: виден только назначенным: см. docstring модуля.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    #: PIN для старта — по желанию составителя. NULL — тест начинается без
    #: PIN. Код генерирует сервер (`repository._new_pin`), вручную его не
    #: вводят. Нужен только для новой попытки: вернуться в начатую можно и
    #: без него — так же, как после выключения теста.
    pin: Mapped[str | None] = mapped_column(String(16), nullable=True)
    #: Qat'iy rejim: talaba sahifadan chiqsa, urinish serverda yopiladi
    #: (`quiz/quiz_process/strict.py`).
    strict_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    #: Yuz nazorati: `standard` — kamerasiz, `face` — butun test davomida
    #: kamera, `face_entry` — kirishda bir marta (oddiy testdagi kabi).
    proctoring_mode: Mapped[str] = mapped_column(String(16), nullable=False, server_default="standard")
    #: Matnni yashirish: savol va variantlar xira, faqat barmoq «ko'rish»
    #: tugmasida turganda ko'rinadi — oddiy skrinshot xira chiqadi.
    hold_to_reveal: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    subject: Mapped[GeneralTestSubject] = relationship("GeneralTestSubject")
    group_links: Mapped[list[GeneralTestGroup]] = relationship(
        "GeneralTestGroup", cascade="all, delete-orphan", passive_deletes=True
    )

    def __str__(self) -> str:
        return self.title


class GeneralTestQuestion(Base, IdIntPk, TimestampMixin):
    """Savol fanning bankida turadi; fan testlari undan tasodifiy oladi."""

    __tablename__ = "general_test_questions"

    subject_id: Mapped[int] = mapped_column(
        ForeignKey("general_test_subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    option_a: Mapped[str] = mapped_column(Text, nullable=False)
    option_b: Mapped[str] = mapped_column(Text, nullable=False)
    option_c: Mapped[str] = mapped_column(Text, nullable=False)
    option_d: Mapped[str] = mapped_column(Text, nullable=False)
    #: Буква правильного варианта: a / b / c / d.
    correct_option: Mapped[str] = mapped_column(String(1), nullable=False, server_default="a")
    order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    subject: Mapped[GeneralTestSubject] = relationship("GeneralTestSubject", back_populates="questions")

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
    #: Длительность в минутах, зафиксированная при старте. Срок считается от
    #: неё, а не от `GeneralTest.duration`: иначе правка теста во время
    #: экзамена мгновенно обрывала (или продлевала) уже идущие попытки, а
    #: таймер у студента продолжал считать по-старому. Пусто — у попыток,
    #: начатых до появления колонки; для них берётся длительность теста.
    duration: Mapped[int | None] = mapped_column(Integer, nullable=True)
    layout: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, server_default="[]")
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    correct_answers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    #: Процент правильных ответов, 0–100.
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    #: Qat'iy testda urinish nima uchun yopildi («Sahifadan chiqdi» va h.k.).
    #: Bo'sh — oddiy yakunlangan yoki vaqti tugagan.
    stop_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    #: Kamera nazoratida qoidabuzarlik kadri (`/uploads/cheating_evidence/...`).
    cheating_image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)

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
