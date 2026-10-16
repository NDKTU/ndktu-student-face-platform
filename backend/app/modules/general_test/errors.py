"""Elementar test xatolari — `{code, message}` (`core/errors.py`)."""

from __future__ import annotations





from app.core.errors import AppError, Conflict, Gone, NotFound


def _not_found(what: str = "Test") -> AppError:
    return NotFound("not_found", f"{what} topilmadi", what=what)


def _closed_left_page(reason: str) -> AppError:
    """Qat'iy testda urinish yopildi — kod `quiz_process/errors.py` dagi bilan bir xil."""
    return Conflict("attempt_closed_left_page", f"Test yopildi: {reason.lower()}", reason=reason)


def _question_in_use(count: int) -> AppError:
    return Conflict(
        "general_test_question_in_use",
        f"Bu savol hozir {count} ta talabaning testida — test tugagach o'chiring",
        attempts=count,
    )


def _question_locked(count: int) -> AppError:
    return Conflict(
        "general_test_question_locked",
        f"Bu savol hozir {count} ta talabaning testida — variantlar va to'g'ri javobni "
        "test tugagach o'zgartiring. Savol matnini tuzatish mumkin",
        attempts=count,
    )


def _question_deleted() -> AppError:
    # 410, 409 emas: frontend 409 da butun urinishni yakunlaydi, bu yerda esa
    # faqat shu savol yo'qolgan — qolganlariga javob berishda davom etadi.
    return Gone("general_test_question_deleted", "Bu savol o'qituvchi tomonidan o'chirilgan — u hisobga olinmaydi")
