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

app = FastAPI(lifespan=lifespan)

# Ensure upload directory (and its purpose-based subfolders) exist
os.makedirs(settings.absolute_upload_dir, exist_ok=True)
os.makedirs(settings.question_upload_dir, exist_ok=True)
os.makedirs(settings.profile_upload_dir, exist_ok=True)
os.makedirs(settings.evidence_dir, exist_ok=True)
os.makedirs(settings.course_resource_upload_dir, exist_ok=True)

# Legacy alias: uploads/ used to be nested one level deeper under uploads/questions/.
# Already-stored URLs still reference /uploads/questions/..., so this mount (registered
# before the main one, since Starlette matches mounts by prefix in order) keeps them
# resolving from the same, now-flattened, directory.
app.mount("/uploads/questions", StaticFiles(directory=settings.absolute_upload_dir), name="uploads_legacy")
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
    uvicorn.run(
        app=settings.server.app_path,
        host=settings.server.host,
        port=settings.server.port,
        reload=settings.server.reload,
        proxy_headers=True,
        forwarded_allow_ips="*",
        access_log=False,
    )


if __name__ == "__main__":
    main()
