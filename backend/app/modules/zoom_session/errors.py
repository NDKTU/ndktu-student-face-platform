"""Zoom seanslari xatolari — `{code, message}`, frontend `errorCodes.ts` bo'yicha tarjima qiladi."""

from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.modules.quiz.quiz_process.errors import quiz_error

from app.core.errors import AppError, error_text


# ── Xatolar (`{code, message}` — frontend `errorCodes.ts` bo'yicha tarjima qiladi) ──


def _not_found() -> AppError:
    return quiz_error(status.HTTP_404_NOT_FOUND, "zoom_session_not_found", "Seans topilmadi")


def _not_yours() -> AppError:
    return quiz_error(status.HTTP_403_FORBIDDEN, "zoom_session_not_yours", "Bu seans sizniki emas")


def _not_your_group() -> AppError:
    return quiz_error(
        status.HTTP_403_FORBIDDEN, "zoom_not_your_group", "Bu seans sizning guruhingiz uchun emas"
    )


def _not_open(opens_at: datetime) -> AppError:
    return quiz_error(
        status.HTTP_403_FORBIDDEN,
        "zoom_session_not_open",
        "Seans hali boshlanmagan",
        opens_at=opens_at.replace(tzinfo=timezone.utc).isoformat(),
    )


def _closed() -> AppError:
    return quiz_error(status.HTTP_403_FORBIDDEN, "zoom_session_closed", "Seans vaqti tugagan — kirib bo'lmaydi")


def _face_check_disabled() -> AppError:
    return quiz_error(status.HTTP_409_CONFLICT, "zoom_face_check_disabled", "Bu seansda yuz nazorati o'chirilgan")


def _not_configured() -> AppError:
    return quiz_error(
        status.HTTP_503_SERVICE_UNAVAILABLE, "zoom_not_configured", "Zoom integratsiyasi sozlanmagan"
    )


def _bad_link(cause: Exception) -> AppError:
    return quiz_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "zoom_bad_link", str(cause))


def _link_required() -> AppError:
    return quiz_error(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "zoom_link_required",
        "Zoom havolasini qo'ying — avtomatik yaratish sozlanmagan",
    )


def _teacher_required() -> AppError:
    return quiz_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "zoom_teacher_required", "O'qituvchini tanlang")


def _teacher_not_found() -> AppError:
    return quiz_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "zoom_teacher_not_found", "O'qituvchi topilmadi")


def _teacher_locked() -> AppError:
    return quiz_error(
        status.HTTP_403_FORBIDDEN, "zoom_teacher_locked", "O'qituvchi faqat o'zi uchun seans yarata oladi"
    )


def _subject_required() -> AppError:
    return quiz_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "zoom_subject_required", "Fanni tanlang")


def _subject_not_teachers() -> AppError:
    return quiz_error(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "zoom_subject_not_teachers",
        "Bu fan tanlangan o'qituvchiga biriktirilmagan",
    )


def _reason(cause: HTTPException | AppError) -> str:
    """Xatoning matni: `quiz_error` — `AppError`, oddiy `HTTPException` — satr."""
    return error_text(cause)


def _account_not_found() -> AppError:
    return quiz_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "zoom_account_not_found", "Zoom akkaunti topilmadi")


def _account_cannot_create() -> AppError:
    return quiz_error(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "zoom_account_cannot_create",
        "Bu akkauntda Zoom API sozlanmagan — havolani qo'ying yoki boshqa akkauntni tanlang",
    )


def _account_busy() -> AppError:
    return quiz_error(
        status.HTTP_409_CONFLICT,
        "zoom_account_busy",
        "Bu akkauntda shu vaqtda boshqa seans bor — bitta litsenziya bir vaqtda bitta uchrashuv",
    )


def _no_free_account() -> AppError:
    return quiz_error(
        status.HTTP_409_CONFLICT,
        "zoom_no_free_account",
        "Bu vaqtda bo'sh Zoom akkaunt yo'q — boshqa vaqtni tanlang",
    )


def _account_required() -> AppError:
    return quiz_error(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "zoom_account_required",
        "Uchrashuv qaysi Zoom akkauntiniki ekanini aniqlab bo'lmadi — akkauntni tanlang",
    )


def _not_managed() -> AppError:
    return quiz_error(
        status.HTTP_409_CONFLICT,
        "zoom_not_managed",
        "Uchrashuv LMS orqali yaratilmagan — uni Zoom ilovasida o'zingiz boshlang",
    )
