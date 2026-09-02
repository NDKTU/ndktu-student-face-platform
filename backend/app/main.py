import logging
import mimetypes
import os

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import app.core.database.models_registry  # noqa: F401 — ensures every model is imported before SQLAlchemy resolves relationships
import app.core.logging  # Trigger logging configuration
from app.core.config import settings
from app.core.lifespan import lifespan
from app.core.middleware.logging_middleware import LoggingMiddleware
from app.modules.router import router

logger = logging.getLogger(__name__)

app = FastAPI(
    title="NDKTU Platform API",
    version="1.0.0",
    description=(
        "Talabalar va o'qituvchilar uchun yagona ta'lim platformasi: testlar, "
        "natijalar, psixologik metodikalar, tashkiliy tuzilma va EduPlan integratsiyasi. "
        "Barcha endpointlar `/api` prefiksi ostida; avtorizatsiya — Bearer JWT."
    ),
    lifespan=lifespan,
)

# Ensure upload directory (and its purpose-based subfolders) exist
os.makedirs(settings.absolute_upload_dir, exist_ok=True)
os.makedirs(settings.question_upload_dir, exist_ok=True)
os.makedirs(settings.profile_upload_dir, exist_ok=True)
os.makedirs(settings.evidence_dir, exist_ok=True)
os.makedirs(settings.course_resource_upload_dir, exist_ok=True)

# Slim-obrazda /etc/mime.types yo'q, shuning uchun `mimetypes` ofis fayllarini
# tanimaydi. Starlette esa noma'lum kengaytma uchun `text/plain` qo'yadi —
# natijada .docx brauzerda ochilib, ekranga ikkilik matn to'kilardi.
# Turlarni o'zimiz ro'yxatdan o'tkazamiz, shunda brauzer faylni yuklab oladi.
for _extension, _mime in {
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".zip": "application/zip",
    ".rar": "application/vnd.rar",
    ".7z": "application/x-7z-compressed",
    ".pdf": "application/pdf",
}.items():
    mimetypes.add_type(_mime, _extension)


# Legacy alias: savol rasmlari `/uploads/questions/...` (ko'plik) havolasi bilan
# saqlangan edi; b7d41e0c92aa migratsiyasi ularni `/uploads/question/...` ga
# o'tkazdi. Bazada endi bunday havola qolmagan, lekin brauzer keshida va tashqi
# havolalarda uchraydi, shuning uchun alias hali turadi — u asosiy mount'dan
# oldin ro'yxatdan o'tadi, chunki Starlette prefikslarni tartib bo'yicha tekshiradi.
# Bir-ikki relizdan keyin olib tashlash mumkin.
app.mount("/uploads/questions", StaticFiles(directory=settings.question_upload_dir), name="uploads_legacy")
app.mount("/uploads", StaticFiles(directory=settings.absolute_upload_dir), name="uploads")

# Legacy alias: cheating evidence used to live outside uploads/ at a separate
# /evidence path. It's now uploads/cheating_evidence/ (served under /uploads too),
# but this second mount keeps already-stored `/evidence/...` URLs resolving.
app.mount("/evidence", StaticFiles(directory=settings.evidence_dir), name="evidence")


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors.origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# --- Register Logging Middleware ---
app.add_middleware(LoggingMiddleware)

app.include_router(router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


def main():
    # reload va workers uvicorn'da birga ishlamaydi: reload yoqilganda worker
    # soni jimgina bittaga tushadi. Buni oshkor qilamiz — aks holda prod'da
    # "workers=2 qo'ydim, nega hech nima o'zgarmadi" degan savol tug'ilardi.
    workers = settings.server.workers
    if settings.server.reload and workers > 1:
        logger.warning(
            "reload yoqilgan — workers=%d e'tiborsiz qoladi, bitta jarayon ishlaydi. "
            "Prod'da APP_CONFIG__SERVER__RELOAD=False bo'lsin.",
            workers,
        )
        workers = 1

    uvicorn.run(
        app=settings.server.app_path,
        host=settings.server.host,
        port=settings.server.port,
        reload=settings.server.reload,
        workers=workers,
        proxy_headers=True,
        forwarded_allow_ips="*",
        access_log=False,
    )


if __name__ == "__main__":
    main()
