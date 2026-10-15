"""Jonlilik chegarasini oʻlchash — prod jurnalidagi baholar boʻyicha.

Nima uchun. Chegara (``LIVENESS_THRESHOLD``) xavfsizlik bilan qulaylik
oʻrtasida turadi: past chegara telefondagi suratni oʻtkazib yuboradi, baland
chegara esa yomon yorugʻlikdagi haqiqiy talabani imtihon oʻrtasida «rasm»
deb rad etadi. Repo namunalaridagi raqamlar (tirik 0.999, soxta 0.01–0.22)
studiyaviy suratlarniki — bizning arzon veb-kameralar va sinf yorugʻligida
taqsimot boshqacha boʻladi.

Qanday oʻlchanadi. ``/v1/face/verify`` har bir bahoni jurnalga yozadi
(``liveness score=0.9731 live=True``). Bekend ``log`` rejimida hech kimni
rad etmaydi, demak bu kadrlarning deyarli hammasi — haqiqiy talabalar.
Ularning pastki dumi har bir chegarada nechta tirik odam rad etilishini
koʻrsatadi. Chegara shu dum boʻyicha tanlanadi, keyin bekend
``enforce`` ga oʻtkaziladi.

Ishlatish (prod serverda)::

    docker logs nusmt_face_detection 2>&1 | python3 scripts/liveness_scores.py
"""

from __future__ import annotations

import re
import sys

SCORE_RE = re.compile(r"liveness score=([0-9.]+)")
THRESHOLDS = (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8)
PERCENTILES = (1, 5, 10, 25, 50)


def main() -> None:
    scores = sorted(float(m.group(1)) for line in sys.stdin if (m := SCORE_RE.search(line)))
    if not scores:
        print("Jurnalda «liveness score» yozuvi yoʻq.")
        return
    total = len(scores)
    print(f"Baholar: {total}")
    for p in PERCENTILES:
        print(f"  {p:>2}-persentil: {scores[min(total - 1, total * p // 100)]:.4f}")
    print("Chegara → rad etiladigan kadrlar ulushi (deyarli hammasi tirik talabalar):")
    for threshold in THRESHOLDS:
        below = sum(score < threshold for score in scores)
        print(f"  {threshold:.1f}: {below:>6} ({below / total:.2%})")


if __name__ == "__main__":
    main()
