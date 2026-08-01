"""Приём загружаемых картинок.

Три эндпоинта (`/question/upload_image`, `/quiz/upload`,
`/employee/upload_image`) раньше писали на диск всё, что прислали: без
проверки расширения, типа и размера. Каталог `uploads/` смонтирован как
статика (`main.py:29`) и отдаётся nginx-ом с того же origin, что и SPA, а
`StaticFiles` берёт `Content-Type` из расширения — то есть загруженный
`.html` или `.svg` выполнялся бы как скрипт на домене приложения и читал
токен из `localStorage`.

Белый список ниже — только растровые форматы, поэтому активного контента
среди них нет и отдавать файлы inline (как и нужно для картинок в вопросах
и аватарок) безопасно.
"""

import os
import uuid
from pathlib import Path

from core.config import settings
from fastapi import HTTPException, UploadFile, status
from starlette.concurrency import run_in_threadpool

# Растровые форматы: ни `svg`, ни `html` сюда не попадают — они и были
# вектором XSS. Совпадает с _IMAGE_EXTS в course/resource/repository.py.
IMAGE_EXTS = frozenset({"jpg", "jpeg", "png", "gif", "webp"})
IMAGE_MAX_BYTES = 5 * 1024 * 1024

# Читаем по частям, а не целиком: `await file.read()` без аргумента затянул бы
# в память весь файл ещё до проверки размера, и лимит защищал бы только диск.
_CHUNK = 64 * 1024


async def save_image_upload(file: UploadFile, upload_dir: Path, url_segment: str) -> str:
    """Проверяет и сохраняет картинку, возвращая публичный URL.

    Бросает 400, если расширение не в белом списке или файл больше лимита.
    """
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File name is empty")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in IMAGE_EXTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: .{ext or '?'}. Allowed: {', '.join(sorted(IMAGE_EXTS))}",
        )

    # Читаем по частям и обрываемся на превышении, поэтому в память попадает
    # не больше лимита. Само чтение асинхронное, а вот запись на диск — нет,
    # и её уносим в пул потоков (F09): в однопоточном воркере синхронный write
    # останавливает вообще все запросы, а не только эту загрузку.
    chunks: list[bytes] = []
    size = 0
    while chunk := await file.read(_CHUNK):
        size += len(chunk)
        if size > IMAGE_MAX_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File must not exceed {IMAGE_MAX_BYTES // (1024 * 1024)}MB",
            )
        chunks.append(chunk)

    # Имя задаём сами: расширение из filename подставляется только после
    # проверки по белому списку, поэтому в путь не попадёт ничего чужого.
    filename = f"{uuid.uuid4()}.{ext}"
    file_path = upload_dir / filename

    def _write() -> None:
        os.makedirs(upload_dir, exist_ok=True)
        file_path.write_bytes(b"".join(chunks))

    try:
        await run_in_threadpool(_write)
    except Exception:
        # Не оставляем обрезок на диске: обрыв записи иначе копил бы мусор,
        # ради ограничения которого лимит и вводится.
        file_path.unlink(missing_ok=True)
        raise

    return f"{settings.file_url.http}/{url_segment}/{filename}"
