"""
app/main.py — FastAPI application factory.

Start with:
    uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.router import router
from app.core.config import settings
from app.core.exceptions import AppError
from app.core.logging import get_logger, setup_logging
from app.services import video_service


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Startup: pre-load the face detector model so first request isn't slow."""
    setup_logging()
    logger = get_logger(__name__)
    logger.info("Loading face detector model…")
    video_service.get_detector()   # warm-up — blocks briefly here, not per-request
    logger.info("Face detector ready. Server is up.")
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title="Two-Face Video Detection API",
    description=(
        "Upload a video file. Receive `has_two_faces: true` if any frame "
        "simultaneously contains exactly two human faces."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if settings.is_prod else "/docs",
    redoc_url=None if settings.is_prod else "/redoc",
    openapi_url=None if settings.is_prod else "/openapi.json",
)

# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------

@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.message},
    )


@app.exception_handler(Exception)
async def generic_error_handler(_: Request, exc: Exception) -> JSONResponse:
    get_logger(__name__).exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health", include_in_schema=False)
async def health_check() -> dict[str, str]:
    """Проба живости для docker-compose.

    Раньше healthcheck смотрел на `/docs`, а его отключает `is_prod`. То есть
    включение продовой настройки роняло проверку, контейнер уходил в unhealthy,
    и `backend` не стартовал вовсе — он ждёт `condition: service_healthy`.
    Этот маршрут флагом не управляется и потому годится в пробы.

    Без авторизации намеренно: docker-compose не может предъявить внутренний
    токен, а наружу отдаётся только слово «ok».
    """
    return {"status": "ok"}


app.include_router(router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)