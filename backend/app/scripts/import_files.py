"""Mavjud fayllarni fayl kutubxonasiga koʻchirish. Bir martalik.

Kutubxona (1-bosqich) faqat yangi yuklamalarni qayd etadi. Diskda esa allaqachon
mingdan ortiq fayl yotibdi va ularga bazadan havolalar bor — koʻchirmasak,
oʻqituvchi «mening fayllarim» boʻlimini boʻsh koʻradi va eski maʼruzasini
baribir qayta yuklashga majbur boʻladi.

Nimalar koʻchiriladi:

* savol va variant matnlaridagi ``<img src>`` rasmlari — egasi savol muallifi;
* ``resources.file_url`` — kurs va dars materiallari;
* ``homeworks.attachments`` — vazifaga ilova qilingan fayllar;
* ``homework_submissions.submitted_files`` — talaba topshirgan javob fayllari.

Profil suratlari (``users.avatar_path``) ataylab tashlab ketilgan: ular oʻquv
materiali emas va kutubxonada koʻrinishi mantiqsiz.

Talaba fayllari reyestrga tushadi, lekin talabada ``read:file`` ruxsati yoʻq —
yaʼni reyestrda boʻlish va koʻrinish bir xil narsa emas.

Skript idempotent: qayta yurgizilsa yangi yozuv yaratmaydi.

DIQQAT — kelajakdagi tozalash vazifasi uchun. Bir xil baytli fayllar bitta
blob'ga yigʻiladi va blob ulardan FAQAT BITTASINING yoʻlini saqlaydi. Qolgan
jismoniy nusxalar diskda qolaveradi va ular hamon kerak: savol HTML'idagi
``<img src>`` har biri oʻz nusxasiga ishora qiladi. Yaʼni «blob'da yoʻq =
keraksiz» degan xulosa NOTOʻGʻRI — shu mezon bilan tozalash mingdan ortiq
savol rasmini oʻldiradi. Nusxalarni oʻchirishdan oldin avval HTML havolalarini
blob'ning yoʻliga koʻchirish kerak.

Konteynerda ishga tushirish:

    # nima topilganini koʻrish (baza oʻzgarmaydi)
    docker exec nusmt_backend sh -c "cd /face && uv run python app/scripts/import_files.py"

    # koʻchirish
    docker exec nusmt_backend sh -c "cd /face && uv run python app/scripts/import_files.py --apply"

Qaytish kodlari:
    0 — bajarildi (koʻchiradigan narsa boʻlmasa ham);
    1 — bajarilmadi: bazaga ulanib boʻlmadi yoki koʻchirishda xato.
"""

import argparse
import asyncio
import hashlib
import re
import sys
from collections import defaultdict
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(BACKEND_ROOT), str(BACKEND_ROOT / "app")]

# isort: off
from sqlalchemy import select, text  # noqa: E402

import app.core.database.models_registry  # noqa: E402,F401 — bogʻlanishlar resolv boʻlishidan oldin modellarni roʻyxatga oladi
from core.config import settings  # noqa: E402
from core.database.db_helper import db_helper  # noqa: E402

from app.modules.file.model import FileBlob, FileUsage, StoredFile  # noqa: E402

# isort: on

# Havoladan uploads ichidagi nisbiy yoʻlni ajratib olish. Havola absolut
# (`https://host/uploads/...`) ham, nisbiy (`/uploads/...`) ham boʻlishi mumkin.
UPLOAD_PATH_RE = re.compile(r"/uploads/([A-Za-z0-9_\-./]+\.[A-Za-z0-9]{1,8})")


class Candidate:
    """Koʻchirilishi kerak bitta havola."""

    __slots__ = ("rel_path", "owner_user_id", "entity_type", "entity_id", "title")

    def __init__(self, rel_path, owner_user_id, entity_type, entity_id, title):
        self.rel_path = rel_path
        self.owner_user_id = owner_user_id
        self.entity_type = entity_type
        self.entity_id = entity_id
        self.title = title


def _rel_paths(blob_of_text: str) -> list[str]:
    """Matndagi barcha uploads havolalarini nisbiy yoʻlga aylantiradi."""
    return UPLOAD_PATH_RE.findall(blob_of_text or "")


async def _collect(session) -> list[Candidate]:
    found: list[Candidate] = []

    # ── Savol rasmlari ────────────────────────────────────────────────
    rows = (
        await session.execute(
            text(
                "SELECT id, user_id, "
                "coalesce(text,'')||coalesce(option_a,'')||coalesce(option_b,'')"
                "||coalesce(option_c,'')||coalesce(option_d,'') AS body "
                "FROM questions WHERE coalesce(text,'')||coalesce(option_a,'')"
                "||coalesce(option_b,'')||coalesce(option_c,'')||coalesce(option_d,'') "
                "LIKE '%/uploads/%'"
            )
        )
    ).all()
    for question_id, user_id, body in rows:
        for rel in _rel_paths(body):
            found.append(Candidate(rel, user_id, "question", question_id, Path(rel).name))

    # ── Kurs materiallari ─────────────────────────────────────────────
    rows = (
        await session.execute(
            text(
                "SELECT id, created_by_user_id, title, file_url FROM resources "
                "WHERE file_url IS NOT NULL AND file_url <> ''"
            )
        )
    ).all()
    for resource_id, owner, title, file_url in rows:
        for rel in _rel_paths(file_url):
            found.append(Candidate(rel, owner, "resource", resource_id, title or Path(rel).name))

    # ── Vazifa ilovalari ──────────────────────────────────────────────
    rows = (
        await session.execute(
            text(
                "SELECT id, created_by_user_id, attachments FROM homeworks "
                "WHERE jsonb_array_length(attachments) > 0"
            )
        )
    ).all()
    for homework_id, owner, attachments in rows:
        for item in attachments or []:
            for rel in _rel_paths(item.get("url", "")):
                found.append(
                    Candidate(rel, owner, "homework", homework_id, item.get("name") or Path(rel).name)
                )

    # ── Talaba javoblari ──────────────────────────────────────────────
    rows = (
        await session.execute(
            text(
                "SELECT id, user_id, submitted_files FROM homework_submissions "
                "WHERE jsonb_array_length(submitted_files) > 0"
            )
        )
    ).all()
    for submission_id, owner, files in rows:
        for item in files or []:
            for rel in _rel_paths(item.get("url", "")):
                found.append(
                    Candidate(rel, owner, "submission", submission_id, item.get("name") or Path(rel).name)
                )

    return found


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


async def run(apply: bool) -> int:
    upload_root = settings.absolute_upload_dir

    async with db_helper.session_factory() as session:
        candidates = await _collect(session)

        by_source: dict[str, int] = defaultdict(int)
        for c in candidates:
            by_source[c.entity_type] += 1

        # Diskda bor-yoʻqligini tekshiramiz. Yoʻqi — koʻchirilmaydi: bazada
        # havola bor, fayl esa yoʻqolgan (bunday holat allaqachon maʼlum,
        # 26 ta savol rasmi shu ahvolda).
        present: dict[str, Path] = {}
        missing: set[str] = set()
        for c in candidates:
            if c.rel_path in present or c.rel_path in missing:
                continue
            path = upload_root / c.rel_path
            if path.is_file():
                present[c.rel_path] = path
            else:
                missing.add(c.rel_path)

        print("Bazadagi havolalar:\n")
        for source, count in sorted(by_source.items()):
            print(f"  {source}: {count}")
        print(f"\n  jami havola:      {len(candidates)}")
        print(f"  noyob fayl:       {len(present) + len(missing)}")
        print(f"  diskda bor:       {len(present)}")
        print(f"  diskda yoʻq:      {len(missing)}")

        # Diskda bor, lekin bazada havolasi yoʻq fayllar. Oʻchirilmaydi —
        # faqat sanaladi: ular kimningdir hali ulanmagan materiali boʻlishi mumkin.
        on_disk = {
            str(p.relative_to(upload_root))
            for p in upload_root.rglob("*")
            if p.is_file() and p.parent.name != "tmp"
        }
        orphans = on_disk - set(present)
        print(f"  bazada ishlatilmaydigan fayl: {len(orphans)}")

        if not apply:
            print("\nQuruq yurish — baza oʻzgarmadi. Koʻchirish uchun: --apply")
            return 0

        if not present:
            print("\nKoʻchiradigan fayl yoʻq.")
            return 0

        print("\nKoʻchirilyapti...")

        # ── Blob'lar ──────────────────────────────────────────────────
        blob_by_path: dict[str, FileBlob] = {}
        created_blobs = 0
        for rel, path in present.items():
            sha = _sha256(path)
            blob = await session.scalar(select(FileBlob).where(FileBlob.sha256 == sha))
            if blob is None:
                blob = FileBlob(
                    sha256=sha,
                    stored_path=rel,
                    size_bytes=path.stat().st_size,
                    mime_type=None,
                )
                session.add(blob)
                await session.flush()
                created_blobs += 1
            blob_by_path[rel] = blob

        # ── Kutubxona yozuvlari ───────────────────────────────────────
        # Kalit (ega, blob): bitta oʻqituvchining bitta fayli — bitta yozuv,
        # u nechta savolda ishlatilishidan qatʼi nazar.
        file_by_key: dict[tuple[int | None, int], StoredFile] = {}
        created_files = 0
        for c in candidates:
            if c.rel_path not in blob_by_path:
                continue
            blob = blob_by_path[c.rel_path]
            key = (c.owner_user_id, blob.id)
            if key in file_by_key:
                continue

            existing = await session.scalar(
                select(StoredFile).where(
                    StoredFile.blob_id == blob.id,
                    StoredFile.owner_user_id == c.owner_user_id,
                )
            )
            if existing is None:
                existing = StoredFile(
                    blob_id=blob.id,
                    owner_user_id=c.owner_user_id,
                    title=c.title[:255],
                    original_name=Path(c.rel_path).name[:255],
                )
                session.add(existing)
                await session.flush()
                created_files += 1
            file_by_key[key] = existing

        # ── Ishlatilish yozuvlari ─────────────────────────────────────
        created_usages = 0
        seen: set[tuple[int, str, int]] = set()
        for c in candidates:
            if c.rel_path not in blob_by_path:
                continue
            stored = file_by_key[(c.owner_user_id, blob_by_path[c.rel_path].id)]
            key = (stored.id, c.entity_type, c.entity_id)
            if key in seen:
                continue
            seen.add(key)

            exists = await session.scalar(
                select(FileUsage).where(
                    FileUsage.file_id == stored.id,
                    FileUsage.entity_type == c.entity_type,
                    FileUsage.entity_id == c.entity_id,
                )
            )
            if exists is None:
                session.add(
                    FileUsage(
                        file_id=stored.id,
                        entity_type=c.entity_type,
                        entity_id=c.entity_id,
                    )
                )
                created_usages += 1

        await session.commit()

        print(f"  yangi blob:            {created_blobs}")
        print(f"  yangi kutubxona yozuvi:{created_files}")
        print(f"  yangi ishlatilish:     {created_usages}")
        print("\nTayyor.")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--apply",
        action="store_true",
        help="koʻchirishni bajarish (flagsiz — faqat nima topilganini koʻrsatadi)",
    )
    args = parser.parse_args()

    try:
        return asyncio.run(run(args.apply))
    except Exception as exc:  # noqa: BLE001 — skript, tushunarli xabar kerak
        print(f"Xato: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
