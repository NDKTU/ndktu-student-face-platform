"""Fayl kutubxonasining asosiy xatti-harakatlari.

Bu yerda tekshiriladigan uchta narsa — moduldagi eng qimmat xatolar:
dublikatning ikki nusxaga aylanishi, ishlatilayotgan faylning jim oʻchishi
va rasm deb atalgan begona faylning oʻtib ketishi.
"""

import tempfile

import pytest
from httpx import AsyncClient

PNG = b"\x89PNG\r\n\x1a\n" + b"soxta png mazmuni"


@pytest.fixture
def temp_uploads(monkeypatch):
    """Haqiqiy uploads papkasi root'niki — testlar vaqtinchalik papkaga yozadi."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        from core.config import settings

        monkeypatch.setattr(settings.file_url, "upload_dir", tmp_dir)
        yield tmp_dir


@pytest.mark.asyncio
async def test_same_bytes_do_not_create_a_second_entry(auth_client: AsyncClient, temp_uploads):
    """Bir xil fayl ikki marta yuklansa, bitta yozuv qoladi.

    Aynan shu narsa uchun kutubxona qilingan: oʻqituvchi bitta maʼruzani
    uch guruhga berganda diskda uch nusxa yotmasligi kerak.
    """
    files = {"file": ("maruza.png", PNG, "image/png")}
    first = await auth_client.post("/file/upload", files=files)
    assert first.status_code == 201

    files = {"file": ("maruza.png", PNG, "image/png")}
    second = await auth_client.post("/file/upload", files=files)
    assert second.status_code == 201

    assert first.json()["id"] == second.json()["id"]
    assert first.json()["url"] == second.json()["url"]


@pytest.mark.asyncio
async def test_different_name_same_bytes_is_still_one_entry(auth_client: AsyncClient, temp_uploads):
    """Nom emas, mazmun hal qiladi — fayl boshqacha atalgan boʻlsa ham."""
    first = await auth_client.post(
        "/file/upload", files={"file": ("birinchi.png", PNG, "image/png")}
    )
    second = await auth_client.post(
        "/file/upload", files={"file": ("ikkinchi.png", PNG, "image/png")}
    )

    assert first.json()["id"] == second.json()["id"]


@pytest.mark.asyncio
async def test_file_in_use_cannot_be_deleted(auth_client: AsyncClient, temp_uploads):
    """Ishlatilayotgan faylni oʻchirish 409 qaytaradi, jim oʻchmaydi.

    Jim oʻchsa boshqa oʻqituvchining darsidagi ilova buzilardi va buni hech kim
    darhol sezmasdi.
    """
    uploaded = await auth_client.post(
        "/file/upload", files={"file": ("kerakli.png", PNG, "image/png")}
    )
    file_id = uploaded.json()["id"]

    attached = await auth_client.post(
        f"/file/{file_id}/attach", json={"entity_type": "resource", "entity_id": 1}
    )
    assert attached.status_code == 200
    assert attached.json()["usage_count"] == 1

    refused = await auth_client.delete(f"/file/{file_id}")
    assert refused.status_code == 409

    # Ajratilgach — oʻchsa boʻladi.
    await auth_client.post(
        f"/file/{file_id}/detach", json={"entity_type": "resource", "entity_id": 1}
    )
    deleted = await auth_client.delete(f"/file/{file_id}")
    assert deleted.status_code == 204


@pytest.mark.asyncio
async def test_non_image_with_image_extension_is_rejected(auth_client: AsyncClient, temp_uploads):
    """Kengaytma — mijoz tanlagan nom, unga ishonib boʻlmaydi.

    Bunday fayl oʻz domenimizdan beriladi, shuning uchun imzo tekshiriladi.
    """
    response = await auth_client.post(
        "/file/upload",
        files={"file": ("zararli.png", b"<script>alert(1)</script>", "image/png")},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_deleted_file_disappears_from_the_list(auth_client: AsyncClient, temp_uploads):
    uploaded = await auth_client.post(
        "/file/upload", files={"file": ("vaqtinchalik.png", PNG, "image/png")}
    )
    file_id = uploaded.json()["id"]

    listing = await auth_client.get("/file/")
    assert any(item["id"] == file_id for item in listing.json()["items"])

    await auth_client.delete(f"/file/{file_id}")

    listing = await auth_client.get("/file/")
    assert all(item["id"] != file_id for item in listing.json()["items"])


@pytest.mark.asyncio
async def test_folder_delete_keeps_its_files(auth_client: AsyncClient, temp_uploads):
    """Papka oʻchsa fayllar ildizga chiqadi, yoʻqolmaydi."""
    folder = await auth_client.post("/file/folder/", json={"name": "Maʼruzalar"})
    folder_id = folder.json()["id"]

    uploaded = await auth_client.post(
        "/file/upload",
        files={"file": ("papkadagi.png", PNG, "image/png")},
        params={"folder_id": folder_id},
    )
    file_id = uploaded.json()["id"]
    assert uploaded.json()["folder_id"] == folder_id

    await auth_client.delete(f"/file/folder/{folder_id}")

    still_there = await auth_client.get(f"/file/{file_id}")
    assert still_there.status_code == 200
    assert still_there.json()["folder_id"] is None
