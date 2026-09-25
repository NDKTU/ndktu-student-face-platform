"""Fayl yuklash limiti.

Tekshiriladigan vaʼdalar: limit backendda majburiy (aniq chegara, 1 bayt
ortigʻi oʻtmaydi), oʻchirilgan fayl joy boʻshatadi, oʻzida bor faylni qayta
yuklash joy egallamaydi, individual limit umumiydan ustun, admin
cheklanmaydi, rad etilgan yuklash diskda iz qoldirmaydi. Oxirida — diskni
tozalash bazada havolasi bor faylga tegmasligi.
"""

import hashlib
import tempfile
from datetime import timedelta
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import select

PNG = b"\x89PNG\r\n\x1a\n" + b"soxta png mazmuni"


def png(tag: str) -> bytes:
    """Har xil baytli rasm — aks holda deduplikatsiya ularni bitta qiladi."""
    return PNG + tag.encode()


@pytest.fixture
def temp_uploads(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp_dir:
        from core.config import settings

        monkeypatch.setattr(settings.file_url, "upload_dir", tmp_dir)
        yield tmp_dir


async def _make_teacher(async_db, username: str, *, limit: int | None = None):
    """Kutubxona ruxsatlari bor oʻqituvchi. ``limit`` — individual limit (bayt).

    Limit bazaga toʻgʻridan-toʻgʻri yoziladi: API 1 MB dan kichik limitni
    qabul qilmaydi, testga esa bir necha baytli chegara kerak.
    """
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import Permission, Role, RolePermission, Teacher, User, UserRole

    user = User(
        username=username,
        password=hash_password("password123"),
        is_active=True,
        storage_quota_bytes=limit,
    )
    async_db.add(user)
    await async_db.flush()

    role = await async_db.scalar(select(Role).where(Role.name == "teacher"))
    if role is None:
        role = Role(name="teacher")
        async_db.add(role)
        await async_db.flush()
    for name in ("create:file", "read:file", "delete:file", "update:file"):
        permission = await async_db.scalar(select(Permission).where(Permission.name == name))
        if permission is None:
            permission = Permission(name=name)
            async_db.add(permission)
            await async_db.flush()
        linked = await async_db.scalar(
            select(RolePermission).where(
                RolePermission.role_id == role.id, RolePermission.permission_id == permission.id
            )
        )
        if linked is None:
            async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))
    async_db.add(UserRole(user_id=user.id, role_id=role.id))
    async_db.add(
        Teacher(
            user_id=user.id,
            first_name="Ali",
            last_name=username.capitalize(),
            third_name="Valiyevich",
            full_name=f"{username.capitalize()} Ali Valiyevich",
        )
    )
    await async_db.commit()
    return user


async def _headers(async_client: AsyncClient, username: str) -> dict:
    response = await async_client.post("/user/login", json={"username": username, "password": "password123"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _upload(client: AsyncClient, headers: dict, name: str, content: bytes):
    return await client.post("/file/upload", files={"file": (name, content, "image/png")}, headers=headers)


# ─── Yuklashda majburiy tekshiruv ─────────────────────────────────────


@pytest.mark.asyncio
async def test_exact_limit_passes_one_byte_more_does_not(async_client, async_db, temp_uploads):
    a = png("a")
    await _make_teacher(async_db, "q_exact", limit=len(a))
    headers = await _headers(async_client, "q_exact")

    assert (await _upload(async_client, headers, "a.png", a)).status_code == 201

    refused = await _upload(async_client, headers, "b.png", png("b"))
    assert refused.status_code == 413
    assert refused.json()["detail"] == "Fayl yuklash limitingiz tugagan. Qolgan hajm: 0 MB."


@pytest.mark.asyncio
async def test_file_larger_than_remaining_names_both_sizes(async_client, async_db, temp_uploads):
    a = png("a")
    await _make_teacher(async_db, "q_rest", limit=len(a) + 3)
    headers = await _headers(async_client, "q_rest")

    assert (await _upload(async_client, headers, "a.png", a)).status_code == 201

    refused = await _upload(async_client, headers, "b.png", png("bbbbbbbbbb"))
    assert refused.status_code == 413
    assert "qolgan hajmdan" in refused.json()["detail"]


@pytest.mark.asyncio
async def test_own_duplicate_passes_when_limit_is_full(async_client, async_db, temp_uploads):
    """Oʻzida bor fayl joy egallamaydi — limit toʻla boʻlsa ham rad etilmaydi."""
    a = png("a")
    await _make_teacher(async_db, "q_dup", limit=len(a))
    headers = await _headers(async_client, "q_dup")

    first = await _upload(async_client, headers, "a.png", a)
    again = await _upload(async_client, headers, "boshqa-nom.png", a)

    assert again.status_code == 201
    assert again.json()["deduplicated"] is True
    assert again.json()["id"] == first.json()["id"]


@pytest.mark.asyncio
async def test_deleted_file_frees_its_space(async_client, async_db, temp_uploads):
    a, b = png("a"), png("b")
    await _make_teacher(async_db, "q_free", limit=len(a))
    headers = await _headers(async_client, "q_free")

    first = await _upload(async_client, headers, "a.png", a)
    assert (await _upload(async_client, headers, "b.png", b)).status_code == 413

    deleted = await async_client.delete(f"/file/{first.json()['id']}", headers=headers)
    assert deleted.status_code == 204

    assert (await _upload(async_client, headers, "b.png", b)).status_code == 201


@pytest.mark.asyncio
async def test_shared_blob_counts_for_each_owner(async_client, async_db, temp_uploads):
    """Diskda bitta nusxa, lekin har bir oʻqituvchining hisobiga toʻliq tushadi."""
    a = png("umumiy")
    await _make_teacher(async_db, "q_first")
    await _make_teacher(async_db, "q_second", limit=len(a) - 1)

    first = await _headers(async_client, "q_first")
    assert (await _upload(async_client, first, "a.png", a)).status_code == 201

    second = await _headers(async_client, "q_second")
    assert (await _upload(async_client, second, "a.png", a)).status_code == 413


@pytest.mark.asyncio
async def test_custom_limit_wins_over_default(async_client, async_db, temp_uploads, monkeypatch):
    from core.config import settings

    monkeypatch.setattr(settings.file_quota, "default_bytes", 5)
    await _make_teacher(async_db, "q_default")
    await _make_teacher(async_db, "q_custom", limit=10_000)

    default_headers = await _headers(async_client, "q_default")
    assert (await _upload(async_client, default_headers, "a.png", png("a"))).status_code == 413

    custom_headers = await _headers(async_client, "q_custom")
    assert (await _upload(async_client, custom_headers, "a.png", png("a"))).status_code == 201


@pytest.mark.asyncio
async def test_admin_is_not_limited(auth_client, temp_uploads, monkeypatch):
    from core.config import settings

    monkeypatch.setattr(settings.file_quota, "default_bytes", 1)

    assert (await _upload(auth_client, {}, "a.png", png("admin"))).status_code == 201

    quota = (await auth_client.get("/file/quota")).json()
    assert quota["is_unlimited"] is True
    assert quota["limit_bytes"] is None


@pytest.mark.asyncio
async def test_rejected_upload_leaves_nothing_on_disk(async_client, async_db, temp_uploads):
    from app.modules.file.model import FileBlob

    a = png("a")
    await _make_teacher(async_db, "q_disk", limit=len(a))
    headers = await _headers(async_client, "q_disk")
    await _upload(async_client, headers, "a.png", a)

    before = {p for p in Path(temp_uploads).rglob("*") if p.is_file()}
    assert (await _upload(async_client, headers, "b.png", png("b"))).status_code == 413
    after = {p for p in Path(temp_uploads).rglob("*") if p.is_file()}

    assert after == before
    rejected_sha = hashlib.sha256(png("b")).hexdigest()
    assert await async_db.scalar(select(FileBlob).where(FileBlob.sha256 == rejected_sha)) is None


@pytest.mark.asyncio
async def test_quota_endpoint_reports_used_and_remaining(async_client, async_db, temp_uploads):
    a, b = png("a"), png("bb")
    await _make_teacher(async_db, "q_report", limit=1000)
    headers = await _headers(async_client, "q_report")
    await _upload(async_client, headers, "a.png", a)
    await _upload(async_client, headers, "b.png", b)

    quota = (await async_client.get("/file/quota", headers=headers)).json()
    assert quota["limit_bytes"] == 1000
    assert quota["used_bytes"] == len(a) + len(b)
    assert quota["remaining_bytes"] == 1000 - len(a) - len(b)
    assert quota["file_count"] == 2
    assert quota["is_custom"] is True
    assert quota["is_unlimited"] is False


@pytest.mark.asyncio
async def test_unused_only_lists_files_that_can_be_deleted(async_client, async_db, temp_uploads):
    await _make_teacher(async_db, "q_unused")
    headers = await _headers(async_client, "q_unused")
    used = await _upload(async_client, headers, "used.png", png("used"))
    free = await _upload(async_client, headers, "free.png", png("free"))

    from app.modules.file.model import FileUsage

    async_db.add(FileUsage(file_id=used.json()["id"], entity_type="resource", entity_id=1))
    await async_db.commit()

    listed = await async_client.get("/file/", params={"unused_only": True}, headers=headers)
    assert [item["id"] for item in listed.json()["items"]] == [free.json()["id"]]


# ─── Admin boshqaruvi ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_admin_changes_default_limit_and_it_is_audited(auth_client, async_db):
    from app.modules.file.model import FileQuotaChange

    gb = 1024 * 1024 * 1024
    updated = await auth_client.put("/file/quota/default", json={"limit_bytes": gb})
    assert updated.status_code == 200
    assert updated.json()["limit_bytes"] == gb
    assert (await auth_client.get("/file/quota/default")).json()["limit_bytes"] == gb

    change = await async_db.scalar(select(FileQuotaChange).where(FileQuotaChange.user_id.is_(None)))
    assert change is not None and change.new_bytes == gb


@pytest.mark.asyncio
async def test_limit_bounds_are_enforced(auth_client):
    too_small = await auth_client.put("/file/quota/default", json={"limit_bytes": 1024})
    assert too_small.status_code == 422

    too_big = await auth_client.put("/file/quota/default", json={"limit_bytes": 10**15})
    assert too_big.status_code == 422

    zero = await auth_client.put("/file/quota/default", json={"limit_bytes": 0})
    assert zero.status_code == 422


@pytest.mark.asyncio
async def test_admin_sets_and_resets_individual_limit(auth_client, async_db):
    teacher = await _make_teacher(async_db, "q_admin_target")
    mb = 1024 * 1024

    set_response = await auth_client.put(f"/file/quota/teachers/{teacher.id}", json={"limit_bytes": 2048 * mb})
    assert set_response.status_code == 200
    assert set_response.json()["limit_bytes"] == 2048 * mb
    assert set_response.json()["is_custom"] is True

    reset = await auth_client.put(f"/file/quota/teachers/{teacher.id}", json={"limit_bytes": None})
    assert reset.status_code == 200
    assert reset.json()["is_custom"] is False


@pytest.mark.asyncio
async def test_teacher_list_shows_usage_and_over_limit(auth_client, async_client, async_db, temp_uploads):
    a = png("a")
    teacher = await _make_teacher(async_db, "q_listed", limit=1000)
    headers = await _headers(async_client, "q_listed")
    await _upload(async_client, headers, "a.png", a)

    # Admin limitni ishlatilgan hajmdan past qildi — fayl joyida qoladi.
    from app.modules.auth.model import User

    user = await async_db.get(User, teacher.id)
    user.storage_quota_bytes = len(a) - 4
    await async_db.commit()

    listed = await auth_client.get("/file/quota/teachers", params={"search": "q_listed"})
    assert listed.status_code == 200
    body = listed.json()
    assert body["total"] == 1
    row = body["items"][0]
    assert row["used_bytes"] == len(a)
    assert row["file_count"] == 1
    assert row["remaining_bytes"] == 0
    assert row["over_limit_bytes"] == 4


@pytest.mark.asyncio
async def test_teacher_cannot_manage_limits(async_client, async_db):
    await _make_teacher(async_db, "q_nosy")
    headers = await _headers(async_client, "q_nosy")

    assert (await async_client.get("/file/quota/teachers", headers=headers)).status_code == 403
    assert (
        await async_client.put("/file/quota/default", json={"limit_bytes": 10**9}, headers=headers)
    ).status_code == 403


# ─── Diskni tozalash ──────────────────────────────────────────────────


async def _deleted_blob(async_db, root: str, name: str, *, days_ago: int):
    """Diskda turgan, kutubxonadan ``days_ago`` kun oldin oʻchirilgan fayl."""
    from app.core.mixins.time_stamp_mixin import utcnow_naive
    from app.modules.file.model import FileBlob, StoredFile

    path = Path(root) / "files" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x" * 10)

    old = utcnow_naive() - timedelta(days=days_ago)
    blob = FileBlob(
        sha256=name.ljust(64, "0")[:64],
        stored_path=f"files/{name}",
        size_bytes=10,
        created_at=old,
        updated_at=old,
    )
    async_db.add(blob)
    await async_db.flush()
    async_db.add(
        StoredFile(
            blob_id=blob.id,
            title=name,
            original_name=name,
            is_active=False,
            created_at=old,
            updated_at=old,
        )
    )
    await async_db.commit()
    return blob, path


@pytest.mark.asyncio
async def test_cleanup_removes_only_old_unreferenced_blobs(async_db, temp_uploads):
    from app.modules.app_setting.model import AppSetting
    from app.modules.file import cleanup
    from app.modules.file.model import FileBlob

    orphan, orphan_path = await _deleted_blob(async_db, temp_uploads, "aaaa-orphan.pdf", days_ago=40)
    recent, recent_path = await _deleted_blob(async_db, temp_uploads, "bbbb-recent.pdf", days_ago=2)
    linked, linked_path = await _deleted_blob(async_db, temp_uploads, "cccc-linked.pdf", days_ago=40)

    # Havola file_usages da emas, oddiy matn ustunida — savol HTML'idagi
    # <img src> kabi. Tozalash uni baribir topishi kerak.
    async_db.add(AppSetting(key="test_ref", value="<img src='/uploads/files/cccc-linked.pdf'>"))
    await async_db.commit()

    orphan_id, recent_id, linked_id = orphan.id, recent.id, linked.id

    candidates = await cleanup.find_candidates(async_db, grace_days=30)
    assert {c.blob_id for c in candidates} == {orphan_id, linked_id}

    safe = await cleanup.drop_referenced(async_db, candidates)
    assert [c.blob_id for c in safe] == [orphan_id]

    await async_db.rollback()
    assert await cleanup.purge(async_db, safe[0]) is True

    assert not orphan_path.exists()
    assert recent_path.exists() and linked_path.exists()
    assert await async_db.get(FileBlob, orphan_id) is None
    assert await async_db.get(FileBlob, recent_id) is not None


@pytest.mark.asyncio
async def test_cleanup_skips_blob_reused_after_selection(async_db, temp_uploads):
    """Tanlov va oʻchirish orasida fayl qayta yuklangan boʻlsa — tegilmaydi."""
    from app.modules.file import cleanup
    from app.modules.file.model import StoredFile

    blob, path = await _deleted_blob(async_db, temp_uploads, "dddd-reused.pdf", days_ago=40)
    candidates = await cleanup.find_candidates(async_db, grace_days=30)
    assert [c.blob_id for c in candidates] == [blob.id]

    async_db.add(StoredFile(blob_id=blob.id, title="qayta", original_name="qayta.pdf"))
    await async_db.commit()

    assert await cleanup.purge(async_db, candidates[0]) is False
    assert path.exists()
