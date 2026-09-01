"""Natijalarning sanasini javoblardan tiklash. Bir martalik.

Import paytida ``results.created_at`` va ``finished_at`` ustiga yozilgan:
44 144 natijadan 44 121 tasida ikkalasi bir xil qiymat — import momenti
(13/02/2026). Shuning uchun «Natijalar» sahifasidagi SANA ustuni hamma
qatorda bir xil sanani koʻrsatadi va u haqiqiy topshirish sanasi emas.

Javoblarda esa haqiqiy vaqt saqlanib qolgan. ``link_answers.py`` javoblarni
urinishlarga bogʻlagandan keyin har bir natijaning haqiqiy vaqtini oʻqib
olish mumkin boʻladi.

CHEKLOV — buni bilib turish kerak. Bitta urinishning barcha javoblari bitta
tranzaksiyada, aynan bir xil ``created_at`` bilan yoziladi. Yaʼni bizda faqat
TOPSHIRISH momenti bor, testni boshlash vaqti emas. Shuning uchun
``created_at`` va ``finished_at`` ikkalasiga oʻsha bitta qiymat yoziladi:
sana toʻgʻri boʻladi, davomiylik esa nol boʻlib qolaveradi. Davomiylikni
tiklab boʻlmaydi — u maʼlumotda yoʻq.

Bu ``link_answers.py`` dan KEYIN ishlatiladi: bogʻlanmagan natijaga tegilmaydi.

Farqi bir daqiqadan kam boʻlgan natijalar chetlab oʻtiladi — ular importdan
keyin yaratilgan haqiqiy urinishlar, sanasi allaqachon toʻgʻri.

IKKINCHI CHEKLOV. Baʼzi javoblar ham import bilan kelgan va ularning vaqti
ham sunʼiy: lokal bazada 1 289 ta natija aynan bir xil mikrosoniyaga ega
(turli talabalar, turli guruhlar — yaʼni bu haqiqiy topshirish emas). Bunday
natijalar uchun tiklangan sana hozirgisidan yaqinroq, lekin baribir taxminiy.
``--only-unique`` bayrogʻi ularni chetlab oʻtadi va faqat vaqti noyob
boʻlganlarini tiklaydi.

Konteynerda:

    docker exec nusmt_backend sh -c "cd /face && uv run python app/scripts/restore_result_dates.py"
    docker exec nusmt_backend sh -c "cd /face && uv run python app/scripts/restore_result_dates.py --apply"

Qaytish kodlari:
    0 — bajarildi;
    1 — bajarilmadi.
"""

import argparse
import asyncio
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(BACKEND_ROOT), str(BACKEND_ROOT / "app")]

# isort: off
from sqlalchemy import text  # noqa: E402

import app.core.database.models_registry  # noqa: E402,F401 — modellarni roʻyxatga oladi
from core.database.db_helper import db_helper  # noqa: E402

# isort: on

# Har bir natija uchun javoblardan olingan haqiqiy vaqt.
# Bir daqiqalik chegara: importdan keyin yaratilgan haqiqiy urinishlarda
# natija va javob vaqti deyarli bir xil boʻladi, ularga tegish shart emas.
CANDIDATES = """
WITH real_time AS (
    SELECT result_id, min(created_at) AS ts
    FROM user_answers
    WHERE result_id IS NOT NULL
    GROUP BY result_id
),
shared AS (
    SELECT ts FROM real_time GROUP BY ts HAVING count(*) > 1
),
candidates AS (
    SELECT r.id, r.created_at AS current_ts, rt.ts AS restored_ts,
           (rt.ts IN (SELECT ts FROM shared)) AS is_shared
    FROM results r
    JOIN real_time rt ON rt.result_id = r.id
    WHERE abs(extract(epoch FROM (r.created_at - rt.ts))) > 60
)
"""


async def run(apply: bool, only_unique: bool) -> int:
    async with db_helper.session_factory() as session:
        totals = (
            await session.execute(
                text(
                    """
                    SELECT
                        (SELECT count(*) FROM results) AS results_total,
                        (SELECT count(DISTINCT result_id) FROM user_answers
                         WHERE result_id IS NOT NULL) AS linked,
                        (SELECT count(*) FROM results WHERE finished_at = created_at) AS zero_window
                    """
                )
            )
        ).one()

        counts = (
            await session.execute(
                text(
                    CANDIDATES
                    + """
                    SELECT count(*) FILTER (WHERE NOT is_shared) AS unique_ts,
                           count(*) FILTER (WHERE is_shared) AS shared_ts
                    FROM candidates
                    """
                )
            )
        ).one()
        changed = counts.unique_ts + (0 if only_unique else counts.shared_ts)

        print("Holat:\n")
        print(f"  natijalar jami:             {totals.results_total}")
        print(f"  javoblari bogʻlangan:       {totals.linked}")
        print(f"  sanasi import vaqti:        {totals.zero_window}")
        print(f"\n  vaqti noyob — ishonchli:    {counts.unique_ts}")
        print(f"  vaqti boshqalar bilan bir xil (taxminiy): {counts.shared_ts}")
        print(f"\n  tiklanadi:                  {changed}")

        if changed:
            sample = (
                await session.execute(
                    text(
                        CANDIDATES
                        + "SELECT id, current_ts, restored_ts FROM candidates"
                        + (" WHERE NOT is_shared" if only_unique else "")
                        + " ORDER BY id LIMIT 3"
                    )
                )
            ).all()
            print("\n  Namuna:")
            for row in sample:
                print(f"    #{row.id}: {row.current_ts}  →  {row.restored_ts}")

        if not apply:
            print("\nQuruq yurish — baza oʻzgarmadi. Tiklash uchun: --apply")
            return 0

        if not changed:
            print("\nTiklaydigan narsa yoʻq.")
            return 0

        print("\nTiklanyapti...")
        result = await session.execute(
            text(
                CANDIDATES
                + """
                UPDATE results r
                SET created_at = c.restored_ts,
                    finished_at = c.restored_ts
                FROM candidates c
                WHERE c.id = r.id
                """
                + ("  AND NOT c.is_shared" if only_unique else "")
                + """"""
            )
        )
        await session.commit()
        print(f"  tiklandi: {result.rowcount}")
        print("\nTayyor.")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--apply",
        action="store_true",
        help="tiklashni bajarish (flagsiz — faqat holatni koʻrsatadi)",
    )
    parser.add_argument(
        "--only-unique",
        action="store_true",
        help="faqat vaqti noyob boʻlgan natijalarni tiklash (taxminiylarini chetlab oʻtish)",
    )
    args = parser.parse_args()

    try:
        return asyncio.run(run(args.apply, args.only_unique))
    except Exception as exc:  # noqa: BLE001 — skript, tushunarli xabar kerak
        print(f"Xato: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
