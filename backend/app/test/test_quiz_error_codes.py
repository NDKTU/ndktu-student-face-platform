"""Test topshirish xatolarining shakli: `{code, message}`.

Nima uchun sinaladi. Frontend tarjimani `code` bo'yicha topadi
(`frontend/src/utils/errorCodes.ts`), `message` esa notanish kod uchun
zaxira. Agar server yana oddiy satr qaytara boshlasa, ruscha interfeysdagi
foydalanuvchi o'zbekcha xabarni ko'radi va buni hech kim sezmaydi —
xato emas, shunchaki boshqa til. Shuning uchun shakl testda qayd etilgan.
"""

import pytest

from app.modules.quiz.quiz_process import errors


ALL_ERRORS = [
    ("quiz_not_found", errors.quiz_not_found, 404),
    ("quiz_not_active", errors.quiz_not_active, 400),
    ("invalid_pin", errors.invalid_pin, 403),
    ("quiz_not_for_your_group", errors.quiz_not_for_your_group, 403),
    ("quiz_has_no_questions", errors.quiz_has_no_questions, 400),
    ("student_photo_missing", errors.student_photo_missing, 400),
    ("attempt_expired", errors.attempt_expired, 400),
    ("attempt_not_found", errors.attempt_not_found, 404),
    ("not_your_attempt", errors.not_your_attempt, 403),
    ("attempt_already_finished", errors.attempt_already_finished, 400),
    ("question_not_in_attempt", errors.question_not_in_attempt, 400),
    ("question_not_found", errors.question_not_found, 404),
    ("invalid_option_index", errors.invalid_option_index, 400),
]


@pytest.mark.parametrize("code,factory,expected_status", ALL_ERRORS)
def test_error_has_code_message_and_status(code, factory, expected_status):
    exc = factory()

    assert exc.status_code == expected_status
    assert exc.detail["code"] == code
    # Matn bo'sh bo'lmasligi shart: notanish kodda foydalanuvchi aynan shuni ko'radi.
    assert exc.detail["message"].strip()


def test_expired_variants_have_different_codes():
    """Ikki holat — ikki matn: biri yangi urinish so'rashni aytadi."""
    plain = errors.attempt_expired()
    ask_teacher = errors.attempt_expired(ask_teacher=True)

    assert plain.detail["code"] == "attempt_expired"
    assert ask_teacher.detail["code"] == "attempt_expired_ask_teacher"
    assert "o'qituvchiga" in ask_teacher.detail["message"]


def test_extra_fields_reach_the_client():
    """Qo'shimcha sonlar (masalan, qolgan urinishlar) javobda saqlanadi."""
    exc = errors.quiz_error(400, "some_code", "Xabar", remaining=3)

    assert exc.detail == {"code": "some_code", "message": "Xabar", "remaining": 3}


def test_all_error_factories_are_covered():
    """Modulda `ALL_ERRORS` ga kirmagan xato qolmasin.

    Yangi xato qo'shilganda uni bu yerga ham yozish kerak — shunda uning
    shakli tekshiriladi va `errorCodes.ts` ni yangilash esga tushadi.
    Frontend ro'yxati bilan solishtirish avtomatlashtirilmagan: testlar
    konteynerda ishlaydi, u yerda faqat bekend manbasi bor.
    """
    factories = {
        name
        for name in dir(errors)
        if not name.startswith("_") and callable(getattr(errors, name)) and name != "quiz_error"
    }
    # `HTTPException` va `status` — import qilingan nomlar, xato fabrikasi emas.
    factories -= {"HTTPException", "status"}
    listed = {factory.__name__ for _, factory, _ in ALL_ERRORS}

    assert factories == listed, f"ALL_ERRORS ga qo'shilmagan: {factories - listed}"
