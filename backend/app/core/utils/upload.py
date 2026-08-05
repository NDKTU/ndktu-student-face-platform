"""Приём загружаемых файлов.

Три эндпоинта (`/question/upload_image`, `/quiz/upload`,
`/employee/upload_image`) раньше писали на диск всё, что прислали: без
проверки расширения, типа и размера. Каталог `uploads/` смонтирован как
статика (`main.py:29`) и отдаётся nginx-ом с того же origin, что и SPA, а
`StaticFiles` берёт `Content-Type` из расширения — то есть загруженный
`.html` или `.svg` выполнялся бы как скрипт на домене приложения и читал
токен из `localStorage`.

Белые списки ниже — растровые картинки, офисные документы и видео. Активного
контента среди них нет, поэтому отдавать файлы inline (как и нужно для
картинок в вопросах, аватарок и видеоуроков) безопасно.

Размер проверяется по ходу записи, а сам файл на диск льётся потоком: видео
на 150 МБ нельзя ни собрать в память, ни склеить одним `write_bytes`.
"""

import os
import uuid
from collections.abc import Mapping
from pathlib import Path

from core.config import settings
from fastapi import HTTPException, UploadFile, status
from starlette.concurrency import run_in_threadpool

# Растровые форматы: ни `svg`, ни `html` сюда не попадают — они и были
# вектором XSS.
IMAGE_EXTS = frozenset({"jpg", "jpeg", "png", "gif", "webp"})
IMAGE_MAX_BYTES = 5 * 1024 * 1024

DOC_EXTS = frozenset({"pdf", "docx", "xlsx", "pptx"})
DOC_MAX_BYTES = 20 * 1024 * 1024

# Только то, что играет во всех браузерах. `mkv` и `avi` сознательно не
# берём: `StaticFiles` отдаст их с video/x-matroska, а проиграть их некому.
VIDEO_EXTS = frozenset({"mp4", "webm", "mov", "m4v"})
VIDEO_MAX_BYTES = 150 * 1024 * 1024

IMAGE_LIMITS: Mapping[str, int] = {ext: IMAGE_MAX_BYTES for ext in IMAGE_EXTS}
DOC_LIMITS: Mapping[str, int] = {ext: DOC_MAX_BYTES for ext in DOC_EXTS}
VIDEO_LIMITS: Mapping[str, int] = {ext: VIDEO_MAX_BYTES for ext in VIDEO_EXTS}

# Кусок в мегабайт, а не в 64 КБ: на 150 МБ разница между 150 и 2400
# переходами в пул потоков. Для картинки в 5 МБ это по-прежнему 5 итераций.
_STREAM_CHUNK = 1024 * 1024


async def save_upload(
    file: UploadFile,
    upload_dir: Path,
    url_segment: str,
    limits: Mapping[str, int],
) -> str:
    """Проверяет и сохраняет файл потоком на диск, возвращая публичный URL.

    `limits` — это одновременно и белый список (`limits.keys()`), и предел
    размера для каждого расширения. Один источник правды: разрешить формат и
    забыть про его лимит невозможно.

    Бросает 400, если расширение не разрешено или файл больше лимита.
    """
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File name is empty")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in limits:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: .{ext or '?'}. Allowed: {', '.join(sorted(limits))}",
        )

    max_bytes = limits[ext]

    def _too_big() -> HTTPException:
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File must not exceed {max_bytes // (1024 * 1024)}MB",
        )

    # Starlette заполняет `size` при разборе multipart, поэтому заведомо
    # большой файл отсекается до первого чтения. Проверку по ходу записи это
    # не отменяет: `size` может быть None.
    if file.size is not None and file.size > max_bytes:
        raise _too_big()

    # Имя задаём сами: расширение из filename подставляется только после
    # проверки по белому списку, поэтому в путь не попадёт ничего чужого.
    filename = f"{uuid.uuid4()}.{ext}"
    file_path = upload_dir / filename

    await run_in_threadpool(os.makedirs, upload_dir, exist_ok=True)

    # Пишем по мере чтения, а не собираем файл целиком: иначе лимит защищал бы
    # только диск, а память съедалась бы до его проверки. Сама запись
    # синхронная и уходит в пул потоков (F09): в однопоточном воркере она
    # останавливает вообще все запросы, а не только эту загрузку.
    handle = await run_in_threadpool(file_path.open, "wb")
    try:
        size = 0
        while chunk := await file.read(_STREAM_CHUNK):
            size += len(chunk)
            if size > max_bytes:
                raise _too_big()
            await run_in_threadpool(handle.write, chunk)
    except BaseException:
        # Не оставляем обрезок на диске: обрыв записи иначе копил бы мусор,
        # ради ограничения которого лимит и вводится.
        await run_in_threadpool(handle.close)
        file_path.unlink(missing_ok=True)
        raise
    else:
        await run_in_threadpool(handle.close)

    return f"{settings.file_url.http}/{url_segment}/{filename}"


async def save_image_upload(file: UploadFile, upload_dir: Path, url_segment: str) -> str:
    """Сохраняет картинку: тот же поток, но белый список только растровый."""
    return await save_upload(file, upload_dir, url_segment, IMAGE_LIMITS)
