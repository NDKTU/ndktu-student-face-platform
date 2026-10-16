"""Ilova xatolari — HTTP haqida hech narsa bilmaydi.

Repozitoriy, servis, sinxronizatsiya va skriptlar shu istisnolarni ko'taradi.
HTTP javobiga ularni faqat bitta joy aylantiradi — `install_error_handlers`
(`main.py`). Ilgari repozitoriylar to'g'ridan-to'g'ri `HTTPException`
ko'tarardi (318 joyda), va CLI skript «sinxronizatsiya allaqachon ketyapti»ni
HTTP xabar MATNIDAN tanirdi: `"уже выполняется" in str(detail)`. Matn
o'zgarsa, cron oddiy holatni xato deb hisoblardi.

Javob shakli — loyihada allaqachon ishlatilgani
(`quiz/quiz_process/errors.py`), frontend uni `utils/apiError.ts` da
o'qiydi:

    {"detail": {"code": "sync_in_progress", "message": "...", ...extra}}

`code` — barqaror kalit: skript shu bo'yicha tarmoqlanadi, frontend esa
tarjimani `utils/errorCodes.ts` dan topadi. `message` — zaxira matn.

Yangi kod `HTTPException` o'rniga shularni ishlatsin. Routerlar va
dependency'lar (HTTP qatlami) `HTTPException` da qoladi.
"""

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Biznes-xato: `code` + `message` + ixtiyoriy qo'shimcha maydonlar."""

    #: Xato turi — HTTP holati shundan `_STATUS` orqali tanlanadi.
    kind = "bad_request"

    def __init__(self, code: str, message: str, *, headers: dict[str, str] | None = None, **extra):
        super().__init__(message)
        self.code = code
        self.message = message
        self.extra = extra
        #: Javob sarlavhalari (masalan, `Retry-After` 429 da) — `detail` ga kirmaydi.
        self.headers = headers

    def as_detail(self) -> dict:
        return {"code": self.code, "message": self.message, **self.extra}

    # O'tish davri uchun: `HTTPException` bilan ishlagan kod (`e.status_code`,
    # `e.detail`) ko'chirilmagan joylarda ham ishlashda davom etsin. Faqat
    # o'qish uchun — holatni tur (`kind`) belgilaydi.
    @property
    def status_code(self) -> int:
        return http_status(self)

    @property
    def detail(self) -> dict:
        return self.as_detail()


class Invalid(AppError):
    """So'rov mazmuni noto'g'ri (400)."""

    kind = "bad_request"


class Unauthorized(AppError):
    kind = "unauthorized"


class Forbidden(AppError):
    kind = "forbidden"


class NotFound(AppError):
    kind = "not_found"


class Unprocessable(AppError):
    """Ma'lumot shakli to'g'ri, lekin ishlatib bo'lmaydi (422)."""

    kind = "unprocessable"


class PayloadTooLarge(AppError):
    """Hajm chegarasi — fayl kvotadan oshadi (413)."""

    kind = "payload_too_large"


class TooManyRequests(AppError):
    kind = "too_many_requests"


class Conflict(AppError):
    """Holat bilan zid: allaqachon ketyapti, tasdiq kerak, ... (409)."""

    kind = "conflict"


class Gone(AppError):
    """Vaqtinchalik ma'lumot muddati o'tgan — preview qayta kerak (410)."""

    kind = "gone"


class UpstreamError(AppError):
    """Tashqi tizim (EPMOS, HEMIS) xato javob berdi (502)."""

    kind = "upstream"


class Unavailable(AppError):
    """Tashqi tizim javob bermadi yoki sozlanmagan (503)."""

    kind = "unavailable"


_STATUS = {
    "bad_request": 400,
    "unauthorized": 401,
    "forbidden": 403,
    "not_found": 404,
    "conflict": 409,
    "gone": 410,
    "payload_too_large": 413,
    "unprocessable": 422,
    "too_many_requests": 429,
    "upstream": 502,
    "unavailable": 503,
}

#: HTTP holati → tur. Tashqi mijozlar (EPMOS, HEMIS) xatoni holat bilan
#: tasniflaydi; ular shu orqali kerakli turni tanlaydi.
KIND_BY_STATUS = {status: kind for kind, status in _STATUS.items()}


def http_status(error: AppError) -> int:
    return _STATUS.get(error.kind, 400)


def error_text(error: BaseException) -> str:
    """Odam o'qiydigan matn — log va «oxirgi progon» holati uchun.

    O'tish davrida `HTTPException` ham keladi (hali ko'chirilmagan modullar),
    shuning uchun ikkalasi ham tushuniladi.
    """
    if isinstance(error, AppError):
        return error.message
    detail = getattr(error, "detail", None)
    if isinstance(detail, dict):
        return str(detail.get("message") or detail)
    return str(detail) if detail is not None else str(error)


async def _app_error_handler(_: Request, error: AppError) -> JSONResponse:
    # `jsonable_encoder`: qo'shimcha maydonlarda `set`, sana yoki UUID kelsa
    # ham javob 500 ga aylanmasin.
    return JSONResponse(
        status_code=http_status(error),
        content=jsonable_encoder({"detail": error.as_detail()}),
        headers=error.headers,
    )


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error_handler)
