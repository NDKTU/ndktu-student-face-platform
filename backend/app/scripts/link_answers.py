"""Javoblarni urinishlarga bogʻlash. Bir martalik.

``user_answers.result_id`` ustuni javoblardan keyinroq qoʻshilgan va eski
dumpdan kelgan yozuvlarda u boʻsh — 1 099 323 satrdan 1 099 323 tasi, yaʼni
hammasi. Shu sababli «Javoblar tafsiloti» ekrani deyarli har bir natijada
«Javoblar topilmadi» deb yozadi, garchi javoblar joyida boʻlsa ham.

Koddagi zaxira mantiq bor edi (``user_answers/repository.py``): ``result_id``
boʻsh boʻlsa javoblar ``(user_id, quiz_id)`` va natijaning vaqt oynasi boʻyicha
qidiriladi. Lekin import paytida ``results.created_at`` va ``finished_at``
ikkalasi bir xil qiymat bilan yozilgan — 44 123 natijadan 44 123 tasida oyna
uzunligi NOL. Bunday oynaga hech qanday javob tushmaydi.

Bu skript bogʻlanishni bir marta hisoblab bazaga yozadi.

Qanday bogʻlanadi. Bitta urinishning barcha javoblari bitta tranzaksiyada
yoziladi, shuning uchun ularning ``created_at`` i aynan bir xil boʻladi —
demak har bir turli ``created_at`` = bitta urinish. Javob guruhlari vaqt
boʻyicha, natijalar ``id`` boʻyicha tartiblanadi va birma-bir juftlanadi.

Tartib toʻgʻriligi tekshirilgan. Ballari ishonchli juftliklarda (natijadagi
``correct_answers`` javoblardan qayta hisoblangan ball bilan toʻliq mos
tushgan) pozitsiyama-pozitsiya solishtirilganda prod maʼlumotida 7 439 ta
holatdan 7 439 tasi toʻgʻri, birorta xato yoʻq. Yaʼni import satrlar tartibini
saqlagan va ``results.id`` xronologik tartibga teng.

Nima QILINMAYDI. Javoblarning mazmuni (``answer``, ``is_correct``,
``correct_answer``) va natijalar butunlay tegilmaydi. Ballar qayta
hisoblanmaydi. ``results.created_at`` ham tuzatilmaydi — u alohida ish, chunki
u mavjud maʼlumot ustiga yozadi va hisobotlarga taʼsir qiladi.

Urinishlar soni javob guruhlari soniga teng boʻlmagan juftliklar chetlab
oʻtiladi: yolgʻon bogʻlanishdan koʻra boʻsh qolgani yaxshi.

Qaytarish: ``UPDATE user_answers SET result_id = NULL``. Boshqa hech narsa
oʻzgarmagani uchun bu toʻliq tiklash.

Konteynerda ishga tushirish:

    docker exec nusmt_backend sh -c "cd /face && uv run python app/scripts/link_answers.py"
    docker exec nusmt_backend sh -c "cd /face && uv run python app/scripts/link_answers.py --apply"

Qaytish kodlari:
    0 — bajarildi (bogʻlaydigan narsa boʻlmasa ham);
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

# Javob satrini oʻz urinishiga bogʻlaydigan umumiy ifoda. Hisobot ham,
# yangilash ham shundan foydalanadi — ikki joyda takrorlansa, ular vaqt oʻtib
# bir-biridan ajralib ketardi va hisobot haqiqatni koʻrsatmay qoʻyardi.
#
# Nega dense_rank, guruhlash emas: bitta urinishning javoblari bir xil
# created_at ga ega, shuning uchun dense_rank har bir satrga toʻgʻridan-toʻgʻri
# urinish raqamini beradi. Guruhlab, keyin (user_id, quiz_id, created_at)
# boʻyicha qayta biriktirish 1,1 million satr boʻyicha self-join'ga aylanadi —
# bu ustunlarda indeks yoʻq va soʻrov 10 daqiqada ham tugamaydi.
#
# Yangilanish esa birlamchi kalit (ua.id) boʻyicha ketadi.
MAPPING_CTE = """
WITH ans AS (
    SELECT id, user_id, quiz_id,
           dense_rank() OVER (PARTITION BY user_id, quiz_id ORDER BY created_at) AS rn
    FROM user_answers
    WHERE user_id IS NOT NULL AND quiz_id IS NOT NULL
),
res AS (
    SELECT id, user_id, quiz_id,
           row_number() OVER (PARTITION BY user_id, quiz_id ORDER BY id) AS rn
    FROM results
    WHERE user_id IS NOT NULL AND quiz_id IS NOT NULL
),
grp_count AS (SELECT user_id, quiz_id, max(rn) AS n FROM ans GROUP BY 1, 2),
res_count AS (SELECT user_id, quiz_id, max(rn) AS n FROM res GROUP BY 1, 2),
matched AS (
    SELECT g.user_id, g.quiz_id
    FROM grp_count g JOIN res_count r USING (user_id, quiz_id)
    WHERE g.n = r.n
),
mapping AS (
    SELECT ans.id AS answer_id, res.id AS result_id
    FROM ans
    JOIN res USING (user_id, quiz_id, rn)
    JOIN matched USING (user_id, quiz_id)
)
"""


async def _report(session) -> dict:
    rows = await session.execute(
        text(
            """
            WITH grp_count AS (
                SELECT user_id, quiz_id, count(DISTINCT created_at) AS n
                FROM user_answers
                WHERE user_id IS NOT NULL AND quiz_id IS NOT NULL
                GROUP BY 1, 2
            ),
            res_count AS (
                SELECT user_id, quiz_id, count(*) AS n
                FROM results
                WHERE user_id IS NOT NULL AND quiz_id IS NOT NULL
                GROUP BY 1, 2
            )
            SELECT
                (SELECT count(*) FROM res_count) AS pairs,
                (SELECT count(*) FROM res_count r JOIN grp_count g USING (user_id, quiz_id)
                 WHERE r.n = g.n) AS matched,
                (SELECT count(*) FROM res_count r JOIN grp_count g USING (user_id, quiz_id)
                 WHERE r.n <> g.n) AS mismatched,
                (SELECT count(*) FROM res_count r LEFT JOIN grp_count g USING (user_id, quiz_id)
                 WHERE g.n IS NULL) AS no_answers,
                (SELECT count(*) FROM user_answers WHERE result_id IS NULL) AS unlinked,
                (SELECT count(*) FROM user_answers) AS total
            """
        )
    )
    pairs, matched, mismatched, no_answers, unlinked, total = rows.one()
    return {
        "pairs": pairs,
        "matched": matched,
        "mismatched": mismatched,
        "no_answers": no_answers,
        "unlinked": unlinked,
        "total": total,
    }


async def _linkable_count(session) -> int:
    """Nechta javob satri bogʻlanishi mumkin."""
    result = await session.execute(
        text(
            MAPPING_CTE
            + """
            SELECT count(*)
            FROM user_answers ua
            JOIN mapping m ON m.answer_id = ua.id
            WHERE ua.result_id IS NULL
            """
        )
    )
    return result.scalar_one()


async def run(apply: bool) -> int:
    async with db_helper.session_factory() as session:
        stats = await _report(session)

        print("Holat:\n")
        print(f"  javoblar jami:              {stats['total']}")
        print(f"  ulardan bogʻlanmagan:       {stats['unlinked']}")
        print(f"\n  (foydalanuvchi, test) juftligi: {stats['pairs']}")
        print(f"    urinishlar soni mos:      {stats['matched']}")
        print(f"    soni mos emas (chetlab):  {stats['mismatched']}")
        print(f"    javobi yoʻq (chetlab):    {stats['no_answers']}")

        linkable = await _linkable_count(session)
        print(f"\n  bogʻlanadigan javob satri:  {linkable}")

        if not apply:
            print("\nQuruq yurish — baza oʻzgarmadi. Bogʻlash uchun: --apply")
            return 0

        if not linkable:
            print("\nBogʻlaydigan narsa yoʻq.")
            return 0

        print("\nBogʻlanyapti...")
        result = await session.execute(
            text(
                MAPPING_CTE
                + """
                UPDATE user_answers ua
                SET result_id = m.result_id
                FROM mapping m
                WHERE m.answer_id = ua.id
                  AND ua.result_id IS NULL
                """
            )
        )
        await session.commit()

        after = await _report(session)
        print(f"  bogʻlandi:                  {result.rowcount}")
        print(f"  bogʻlanmagan qoldi:         {after['unlinked']}")
        print("\nTayyor.")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--apply",
        action="store_true",
        help="bogʻlashni bajarish (flagsiz — faqat holatni koʻrsatadi)",
    )
    args = parser.parse_args()

    try:
        return asyncio.run(run(args.apply))
    except Exception as exc:  # noqa: BLE001 — skript, tushunarli xabar kerak
        print(f"Xato: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
