"""Juftliklar (para) vaqti — seans formasida vaqtni bir bosishda tanlash uchun.

Manba — HEMIS jadvalining nusxasi (`hemis_schedule_lessons`): har juftlikka
eng ko'p uchragan boshlanish va tugash vaqti. Jadval bo'sh bo'lsa (sinxron
hali ishlamagan yoki lokal baza) — universitetning odatiy setkasi
(`DEFAULT_PAIRS`, 15.10.2026 dagi jadvaldan olingan).
"""

from datetime import time

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.hemis.model import HemisScheduleLesson

from .schemas import PairTime

DEFAULT_PAIRS: list[tuple[int, str, str]] = [
    (1, "08:00", "09:20"),
    (2, "09:30", "10:50"),
    (3, "11:00", "12:20"),
    (4, "12:40", "14:00"),
    (5, "14:10", "15:30"),
    (6, "15:40", "17:00"),
    (7, "17:10", "18:30"),
    (8, "18:40", "20:00"),
    (9, "20:10", "21:30"),
]


def _hhmm(value: time) -> str:
    return value.strftime("%H:%M")


async def pair_times(session: AsyncSession) -> list[PairTime]:
    rows = (
        await session.execute(
            select(
                HemisScheduleLesson.lesson_pair,
                HemisScheduleLesson.start_time,
                HemisScheduleLesson.end_time,
                func.count(),
            )
            .where(
                HemisScheduleLesson.is_active.is_(True),
                HemisScheduleLesson.start_time.is_not(None),
                HemisScheduleLesson.end_time.is_not(None),
            )
            .group_by(HemisScheduleLesson.lesson_pair, HemisScheduleLesson.start_time, HemisScheduleLesson.end_time)
        )
    ).all()
    # Juftlik → (soni, boshlanish, tugash): bir xil raqamga bir necha vaqt kelsa
    # (masalan, bitta guruhning kechki smenasi), ko'pchiliknikini olamiz.
    best: dict[int, tuple[int, time, time]] = {}
    for pair, start, end, count in rows:
        if not str(pair).strip().isdigit():
            continue
        number = int(str(pair).strip())
        if number not in best or count > best[number][0]:
            best[number] = (count, start, end)
    if not best:
        return [PairTime(pair=pair, start=start, end=end) for pair, start, end in DEFAULT_PAIRS]
    return [
        PairTime(pair=number, start=_hhmm(start), end=_hhmm(end))
        for number, (_count, start, end) in sorted(best.items())
    ]
