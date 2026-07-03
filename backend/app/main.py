import os

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import app.core.logging  # Trigger logging configuration
import app.core.models_registry  # noqa: F401 — ensures every model is imported before SQLAlchemy resolves relationships
from app.core.config import settings
from app.lifespan.lifespan import lifespan
from app.middleware.logging_middleware import LoggingMiddleware
from app.modules.router import router

app = FastAPI(lifespan=lifespan)

# Ensure upload directory exists
os.makedirs(settings.absolute_upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.absolute_upload_dir), name="uploads")

# Ensure cheating evidence directory exists
os.makedirs(settings.evidence_dir, exist_ok=True)
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
