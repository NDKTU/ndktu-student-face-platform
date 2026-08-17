"""Приём загружаемых изображений.

Файл, принятый по имени, — это файл, тип которого выбрал клиент. Расширение
берётся из присланного имени, поэтому одного белого списка мало: достаточно
переименовать что угодно в ``.jpg``. Здесь дополнительно проверяется сигнатура
в первых байтах — она принадлежит содержимому, а не имени.

SVG намеренно не разрешён: он может содержать исполняемый код, а раздаётся
с того же домена, что и приложение.

Правила совпадают с ``course/resource/repository.py::upload_file``, где такая
проверка уже была; вынесены сюда, чтобы три точки загрузки изображений
(вопрос, тест, профиль сотрудника) не расходились между собой.
"""

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

#: Разрешённые расширения изображений.
ALLOWED_IMAGE_EXTS = {"jpg", "jpeg", "png", "gif", "webp"}

#: Потолок размера одного изображения.
IMAGE_MAX_BYTES = 5 * 1024 * 1024

#: Сигнатуры содержимого: расширение → набор допустимых префиксов файла.
#: WEBP проверяется отдельно — у него сигнатура разрывная (RIFF....WEBP).
_MAGIC = {
    "jpg": (b"\xff\xd8\xff",),
    "jpeg": (b"\xff\xd8\xff",),
    "png": (b"\x89PNG\r\n\x1a\n",),
    "gif": (b"GIF87a", b"GIF89a"),
}


def _looks_like_image(content: bytes, ext: str) -> bool:
    if ext == "webp":
        return content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    return any(content.startswith(prefix) for prefix in _MAGIC[ext])


async def save_image(file: UploadFile, upload_dir: Path) -> str:
    """Проверяет и сохраняет изображение, возвращает имя файла на диске.

    Имя всегда генерируется заново (uuid), присланное используется только
    для извлечения расширения — так в путь не попадает ничего от клиента.
    """
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File name is empty")

    if "." not in file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File has no extension")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image type: .{ext}. Allowed: {', '.join(sorted(ALLOWED_IMAGE_EXTS))}",
        )

    content = await file.read()

    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty")

    if len(content) > IMAGE_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image must not exceed {IMAGE_MAX_BYTES // (1024 * 1024)}MB",
        )

    if not _looks_like_image(content, ext):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content does not match its extension — this is not a valid image",
        )

    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}.{ext}"
    (upload_dir / filename).write_bytes(content)

    return filename
