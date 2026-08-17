"""Проверки приёма загружаемых изображений (app/core/utils/image_upload.py).

Главное, что здесь проверяется, — файл принимается по содержимому, а не по имени:
переименовать скрипт в .jpg и загрузить его в общедоступную папку не должно получаться.
"""

import io
import tempfile
from pathlib import Path

import pytest
from fastapi import HTTPException, UploadFile

from app.core.utils.image_upload import IMAGE_MAX_BYTES, save_image

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
GIF = b"GIF89a" + b"\x00" * 64
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 64
SVG_WITH_SCRIPT = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"


def _upload(filename: str, content: bytes) -> UploadFile:
    return UploadFile(filename=filename, file=io.BytesIO(content))


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "filename,content",
    [
        ("a.png", PNG),
        ("photo.JPEG", JPEG),
        ("x.gif", GIF),
        ("x.webp", WEBP),
    ],
)
async def test_accepts_real_images(filename, content):
    with tempfile.TemporaryDirectory() as tmp:
        target = Path(tmp) / "images"

        saved_name = await save_image(_upload(filename, content), target)

        assert (target / saved_name).read_bytes() == content


@pytest.mark.asyncio
async def test_rejects_svg():
    """SVG может содержать исполняемый код и раздаётся с домена приложения."""
    with tempfile.TemporaryDirectory() as tmp:
        with pytest.raises(HTTPException) as exc:
            await save_image(_upload("evil.svg", SVG_WITH_SCRIPT), Path(tmp))

        assert exc.value.status_code == 400


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "filename,content",
    [
        ("evil.png", SVG_WITH_SCRIPT),
        ("shell.jpg", b"<?php system($_GET[0]); ?>"),
        ("page.gif", b"<!DOCTYPE html><script>alert(1)</script>"),
    ],
)
async def test_rejects_content_that_is_not_an_image(filename, content):
    """Расширение приходит от клиента — решает содержимое."""
    with tempfile.TemporaryDirectory() as tmp:
        with pytest.raises(HTTPException) as exc:
            await save_image(_upload(filename, content), Path(tmp))

        assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_rejects_empty_and_missing_extension():
    with tempfile.TemporaryDirectory() as tmp:
        with pytest.raises(HTTPException):
            await save_image(_upload("a.png", b""), Path(tmp))

        with pytest.raises(HTTPException):
            await save_image(_upload("noextension", PNG), Path(tmp))


@pytest.mark.asyncio
async def test_rejects_oversized_image():
    oversized = PNG[:8] + b"\x00" * IMAGE_MAX_BYTES

    with tempfile.TemporaryDirectory() as tmp:
        with pytest.raises(HTTPException) as exc:
            await save_image(_upload("big.png", oversized), Path(tmp))

        assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_client_filename_never_reaches_disk():
    """Имя генерируется заново, поэтому путь из имени файла никуда не ведёт."""
    with tempfile.TemporaryDirectory() as tmp:
        target = Path(tmp) / "images"

        saved_name = await save_image(_upload("../../etc/passwd.png", PNG), target)

        assert "/" not in saved_name
        assert saved_name.endswith(".png")
        assert (target / saved_name).exists()
