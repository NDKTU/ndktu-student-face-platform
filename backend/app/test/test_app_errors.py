"""Ilova xatolari (`core/errors.py`): HTTP'siz ko'tariladi, bitta joyda javobga aylanadi.

Ilgari repozitoriy va sinxronizatsiyalar `HTTPException` ko'tarardi, CLI
skript esa «allaqachon ketyapti» holatini xabar MATNIDAN tanirdi. Endi:
xato — `AppError` (kod + matn), HTTP javobi — `install_error_handlers`,
skript — `code` bo'yicha.
"""

import pathlib
import re

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.errors import AppError, Conflict, NotFound, error_text, install_error_handlers
from app.modules.integration.eduplan.client import EduPlanError
from app.modules.integration.eduplan.sync_runner import eduplan_sync_runner
from app.modules.quiz.quiz_process.errors import quiz_error

APP_DIR = pathlib.Path(__file__).resolve().parents[1]


def _app() -> FastAPI:
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/missing")
    async def missing():
        raise NotFound("thing_not_found", "Topilmadi", thing_id=7)

    @app.get("/quiz")
    async def quiz():
        raise quiz_error(422, "zoom_bad_link", "Havola noto'g'ri")

    @app.get("/eduplan")
    async def eduplan():
        raise EduPlanError("EPMOS javob bermadi", status_code=503)

    return app


@pytest.mark.asyncio
async def test_handler_turns_app_error_into_response():
    async with AsyncClient(transport=ASGITransport(app=_app()), base_url="http://test") as client:
        missing = await client.get("/missing")
        assert missing.status_code == 404
        # Shakl — `quiz_process/errors.py` dagi bilan bir xil: frontend
        # (`utils/apiError.ts`) uni allaqachon o'qiydi.
        assert missing.json() == {"detail": {"code": "thing_not_found", "message": "Topilmadi", "thing_id": 7}}

        quiz = await client.get("/quiz")
        assert quiz.status_code == 422
        assert quiz.json()["detail"]["code"] == "zoom_bad_link"

        eduplan = await client.get("/eduplan")
        assert eduplan.status_code == 503
        assert eduplan.json()["detail"] == {"code": "eduplan_error", "message": "EPMOS javob bermadi"}


def test_integration_errors_are_not_http_exceptions():
    """EPMOS va HEMIS xatolari skriptda HTTP'siz ushlanadi."""
    from fastapi import HTTPException

    from app.modules.auth.hemis.data_client import HemisDataError

    for error in (EduPlanError("x"), HemisDataError("x")):
        assert isinstance(error, AppError)
        assert not isinstance(error, HTTPException)


def test_error_text_reads_both_kinds():
    from fastapi import HTTPException

    assert error_text(Conflict("c", "Band")) == "Band"
    assert error_text(HTTPException(409, "Eski uslub")) == "Eski uslub"
    assert error_text(HTTPException(409, {"code": "c", "message": "Lug'at"})) == "Lug'at"


@pytest.mark.asyncio
async def test_busy_sync_is_recognised_by_code(async_db, monkeypatch):
    """Parallel progon — `sync_in_progress` kodi, matn emas.

    Cron skripti (`scripts/eduplan_sync.py`) aynan shu kod bo'yicha «band»
    (exit 2) ni «xato» (exit 1) dan ajratadi.
    """

    async def lock_taken(*args, **kwargs):
        return False

    monkeypatch.setattr("app.modules.integration.eduplan.sync_runner.redis_client.set", lock_taken)
    with pytest.raises(Conflict) as busy:
        await eduplan_sync_runner.run(async_db)
    assert busy.value.code == "sync_in_progress"


#: Repozitoriy/servis qatlamidagi `HTTPException(` soni. 2026-10-16 da 362
#: tadan modulma-modul 0 ga tushirildi — endi bu taqiq: HTTP qatlamidan
#: (router, dependency, middleware) pastda faqat `app.core.errors`.
HTTP_EXCEPTION_BASELINE = 0

#: Chaqiruv ham, voris klass ham (`class Busy(HTTPException)` — `super().__init__`
#: orqali yaratiladi va `HTTPException(` ko'rinishida uchramaydi).
_HTTP_EXCEPTION = re.compile(r"\bHTTPException\(|\(HTTPException\)")


def _http_exception_count() -> tuple[int, dict[str, int]]:
    per_file: dict[str, int] = {}
    for path in [*APP_DIR.glob("modules/**/*.py"), *APP_DIR.glob("core/**/*.py")]:
        rel = path.relative_to(APP_DIR)
        if path.name == "router.py" or {"routers", "dependencies", "middleware"} & set(rel.parts):
            continue
        count = sum(
            1 for line in path.read_text(encoding="utf-8").splitlines() if _HTTP_EXCEPTION.search(line.split("#", 1)[0])
        )
        if count:
            per_file[str(rel)] = count
    return sum(per_file.values()), per_file


def test_http_exception_ratchet():
    """Храповик: yangi kod repozitoriy/servisda `HTTPException` yozmasin.

    Bitta katta qayta yozish o'rniga — modulma-modul ko'chirish. Son oshsa,
    test yiqiladi; kamaysa — `HTTP_EXCEPTION_BASELINE` ni yangilash kerak,
    aks holda keyingi kishi bo'shagan joyni yana to'ldirib qo'yadi.
    """
    total, per_file = _http_exception_count()
    worst = ", ".join(f"{name}: {n}" for name, n in sorted(per_file.items(), key=lambda kv: -kv[1])[:5])
    assert total <= HTTP_EXCEPTION_BASELINE, (
        f"Repozitoriy/servislarda HTTPException {total} ta (chegara {HTTP_EXCEPTION_BASELINE}). "
        f"Yangi xatolar uchun `app.core.errors` dan foydalaning. Eng ko'p: {worst}"
    )
    assert total == HTTP_EXCEPTION_BASELINE, (
        f"HTTPException {total} taga kamaydi — `HTTP_EXCEPTION_BASELINE` ni {total} ga tushiring."
    )
