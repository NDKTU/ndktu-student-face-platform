"""Test topshirish jarayonidagi xatolar — kod va matn bir joyda.

Nima uchun kod kerak. Ilgari javobda faqat matn bo'lgan:

    {"detail": "PIN kod noto'g'ri"}

Frontend uni o'zgartirmasdan ko'rsatadi, ya'ni ruscha interfeysdagi odam ham
o'zbekcha xabarni ko'rardi: tilni server tanlab bo'lgan, server esa
foydalanuvchining tilini bilmaydi. Matnni frontendda tarjima qilishga urinish
mo'rt bo'lardi — serverdagi formulani biroz o'zgartirish tarjimani jimgina
uzib qo'yadi.

Shuning uchun javobda ikkalasi ham bo'ladi:

    {"detail": {"code": "invalid_pin", "message": "PIN kod noto'g'ri"}}

`code` — barqaror identifikator, frontend tarjimani shu bo'yicha topadi;
`message` — zaxira: kod notanish bo'lsa (eski frontend, yangi xato), odam
baribir mazmunli matn ko'radi. Shu shakl loyihada allaqachon ishlatiladi —
`quiz/repository.py::_not_enough_questions` ga qarang.
"""

from fastapi import HTTPException, status


def quiz_error(status_code: int, code: str, message: str, **extra) -> HTTPException:
    """Kod va matnli `HTTPException`.

    `extra` — xabarni tuzish uchun kerakli sonlar (masalan, qolgan urinishlar):
    frontend ularni tarjimaga qo'yadi, matnni qayta yig'ishga hojat qolmaydi.
    """
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message, **extra},
    )


def quiz_not_found() -> HTTPException:
    return quiz_error(status.HTTP_404_NOT_FOUND, "quiz_not_found", "Test topilmadi")


def quiz_not_active() -> HTTPException:
    return quiz_error(status.HTTP_400_BAD_REQUEST, "quiz_not_active", "Test faol emas")


def invalid_pin() -> HTTPException:
    return quiz_error(status.HTTP_403_FORBIDDEN, "invalid_pin", "PIN kod noto'g'ri")


def quiz_not_for_your_group() -> HTTPException:
    return quiz_error(
        status.HTTP_403_FORBIDDEN,
        "quiz_not_for_your_group",
        "Bu test sizning guruhingiz uchun mo'ljallanmagan",
    )


def quiz_has_no_questions() -> HTTPException:
    return quiz_error(
        status.HTTP_400_BAD_REQUEST,
        "quiz_has_no_questions",
        "Bu testda savollar yo'q. Iltimos administratorga murojaat qiling.",
    )


def student_photo_missing() -> HTTPException:
    return quiz_error(
        status.HTTP_400_BAD_REQUEST,
        "student_photo_missing",
        "Sizning suratingiz topilmadi. Profilingizga surat yuklang.",
    )


def attempt_expired(*, ask_teacher: bool = False) -> HTTPException:
    """Vaqt tugadi. `ask_teacher` — urinish shu yerda yopilgan holat uchun."""
    if ask_teacher:
        return quiz_error(
            status.HTTP_400_BAD_REQUEST,
            "attempt_expired_ask_teacher",
            "Urinish vaqti tugagan. Yangi urinish uchun o'qituvchiga murojaat qiling.",
        )
    return quiz_error(status.HTTP_400_BAD_REQUEST, "attempt_expired", "Urinish vaqti tugagan")


def attempt_not_found() -> HTTPException:
    return quiz_error(status.HTTP_404_NOT_FOUND, "attempt_not_found", "Urinish topilmadi")


def not_your_attempt() -> HTTPException:
    return quiz_error(status.HTTP_403_FORBIDDEN, "not_your_attempt", "Bu sizning urinishingiz emas")


def attempt_already_finished() -> HTTPException:
    return quiz_error(
        status.HTTP_400_BAD_REQUEST,
        "attempt_already_finished",
        "Bu urinish allaqachon yakunlangan",
    )


def question_not_in_attempt() -> HTTPException:
    return quiz_error(
        status.HTTP_400_BAD_REQUEST,
        "question_not_in_attempt",
        "Bu savol sizning urinishingizga kirmaydi",
    )


def question_not_found() -> HTTPException:
    return quiz_error(status.HTTP_404_NOT_FOUND, "question_not_found", "Savol topilmadi")


def invalid_option_index() -> HTTPException:
    return quiz_error(status.HTTP_400_BAD_REQUEST, "invalid_option_index", "Variant raqami noto'g'ri")
