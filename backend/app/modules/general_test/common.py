"""Elementar test: umumiy sozlamalar va yordamchilar (`repository.py` dan ajratilgan)."""

from __future__ import annotations

import secrets
from datetime import timedelta


from sqlalchemy import or_, select

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.modules.auth.model import Student

from .model import (
    GeneralTest,
    GeneralTestAttempt,
    GeneralTestGroup,
    GeneralTestQuestion,
    GeneralTestSubjectUser,
)


LETTERS = ("a", "b", "c", "d")


#: Запас поверх длительности: последний ответ мог уйти на границе срока и
#: задержаться в сети. То же значение, что у обычного теста (quiz_process/attempt.py).
GRACE_SECONDS = 60


IN_PROGRESS = "in_progress"


COMPLETED = "completed"


#: Redis kalitlari prefiksi: `Result` id lari bilan to'qnashmasin.
STRICT_KIND = "gtest"


#: Kamera nazoratida qoidabuzarlik turi → o'qituvchi ko'radigan sabab.
CHEATING_REASONS = {
    "multiple": "Kadrda bir nechta odam",
    "different": "Boshqa odam aniqlandi",
    "no_face": "Kadrda yuz ko'rinmadi",
}


#: `face_entry`: kirishdagi tasdiqdan keyin test sahifasi shuncha vaqt ochiladi.
#: Sahifani shu oraliqda yangilash yangi suratsiz o'tadi; keyin — yana yuz.
FACE_GRANT_TTL_SECONDS = 120


def _face_entry_key(user_id: int, test_id: int) -> str:
    return f"gtest:face-entry:{user_id}:{test_id}"


def _face_grant_key(attempt_id: int) -> str:
    return f"gtest:face-ok:{attempt_id}"


def _new_pin() -> str:
    """4 xonali PIN — talaba doskadan ko'chirib yozadi, shuning uchun qisqa."""
    return f"{secrets.randbelow(10000):04d}"


def _deadline(attempt: GeneralTestAttempt, test: GeneralTest):
    return attempt.started_at + timedelta(minutes=attempt.duration or test.duration)


def _remaining_seconds(attempt: GeneralTestAttempt, test: GeneralTest) -> int:
    return max(0, int((_deadline(attempt, test) - utcnow_naive()).total_seconds()))


def _is_expired(attempt: GeneralTestAttempt, test: GeneralTest) -> bool:
    return utcnow_naive() > _deadline(attempt, test) + timedelta(seconds=GRACE_SECONDS)


#: Test ketayotganda o'zgartirib bo'lmaydigan maydonlar: talaba javobni harf
#: bilan beradi, variant matni yoki to'g'ri javob almashsa, o'sha harf
#: boshqa ma'noni bildiradi. Savol matnidagi xatoni tuzatish mumkin.
_LOCKED_WHILE_TAKEN = ("option_a", "option_b", "option_c", "option_d", "correct_option")


def _question_snapshot(question: GeneralTestQuestion) -> dict:
    return {
        "subject_id": question.subject_id,
        "text": (question.text or "")[:500],
        **{f: (getattr(question, f) or "")[:200] for f in _LOCKED_WHILE_TAKEN},
    }


def _latest_student():
    """Har bir foydalanuvchining bitta talaba yozuvi — oxirgisi.

    `students.user_id` не уникален (бывают повторные записи из HEMIS):
    прямой join размножил бы строку. Берём одну — последнюю.
    """
    return (
        select(Student.id, Student.user_id, Student.full_name, Student.group_id)
        .distinct(Student.user_id)
        .where(Student.user_id.is_not(None))
        .order_by(Student.user_id, Student.id.desc())
        .subquery()
    )


def _visible_to(user_id: int):
    """Test shu foydalanuvchiga ko'rinadimi (faollikdan tashqari).

    Ikki yo'l: foydalanuvchi testning faniga biriktirilgan yoki testga
    biriktirilgan guruhlardan birida o'qiydi. Ikkalasi ham bo'lmasa — hech kim
    ko'rmaydi: «hamma uchun» degan holat endi yo'q.
    """
    own_groups = select(Student.group_id).where(Student.user_id == user_id, Student.group_id.is_not(None))
    by_subject = (
        select(GeneralTestSubjectUser.id)
        .where(
            GeneralTestSubjectUser.subject_id == GeneralTest.subject_id,
            GeneralTestSubjectUser.user_id == user_id,
        )
        .exists()
    )
    # Yashirilgan guruh (`is_active = false`) hisobga olinmaydi: test unga
    # biriktirilgan bo'lib qoladi, lekin talabalari uni ko'rmaydi.
    by_group = (
        select(GeneralTestGroup.id)
        .where(
            GeneralTestGroup.test_id == GeneralTest.id,
            GeneralTestGroup.group_id.in_(own_groups),
            GeneralTestGroup.is_active.is_(True),
        )
        .exists()
    )
    return or_(by_subject, by_group)


#: Nomda shuncha guruh yoziladi, qolgani «va yana N ta guruh» bo'lib qisqaradi.
TITLE_GROUPS = 3


def _compose_title(subject_name: str, group_names: list[str]) -> str:
    """Test nomi: «Fan — 101-21, 102-21». Guruhsiz — fan nomining o'zi."""
    names = sorted(group_names)
    if not names:
        return subject_name[:255]
    shown = ", ".join(names[:TITLE_GROUPS])
    rest = len(names) - TITLE_GROUPS
    tail = f" va yana {rest} ta guruh" if rest > 0 else ""
    return f"{subject_name} — {shown}{tail}"[:255]


def _per_attempt(test: GeneralTest, available: int) -> int:
    """Bitta urinishga beriladigan savollar: sozlangan son, lekin bor savoldan ko'p emas."""
    return min(test.question_number, available) if test.question_number else available


def _user_kind(student_id: int | None, teacher_id: int | None) -> str:
    return "student" if student_id else "teacher" if teacher_id else "boshqa"
