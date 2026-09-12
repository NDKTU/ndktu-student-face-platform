"""Ro'yxatlarni serverda saralash uchun umumiy yordamchi.

Nima uchun kerak. Ilgari saralash frontda, serverdan kelgan sahifaning ichida
bajarilardi: 15 qator o'zaro tartiblanar, lekin butun tanlov tartibsiz qolardi
— ikkinchi sahifa birinchisidan kichik qiymat bilan boshlanishi mumkin edi.
Filtrlar bilan bundan ham yomoni bo'lgan: mos qator sahifaga tushmasa,
«topilmadi» chiqar, sahifalash esa baribir o'nlab sahifani ko'rsatib turardi.

Ustunlar ro'yxati yopiq: `sort_by` mijozdan satr bo'lib keladi, va u
to'g'ridan-to'g'ri SQL'ga tushmasligi kerak.
"""

from sqlalchemy import asc, desc


def order_by_clause(sortable: dict, sort_by: str | None, order: str | None, default, tie_breaker=None):
    """`ORDER BY` uchun ustunlar ketma-ketligi.

    `tie_breaker` — sahifalar orasida barqarorlik uchun: teng qiymatlar ko'p
    bo'lgan ustunda (kurs, semestr, sana) usiz bitta qator ikkinchi sahifada
    qayta chiqishi mumkin.
    """
    column = sortable.get(sort_by or "")
    if column is None:
        return (default,) if not isinstance(default, tuple) else default

    direction = desc if (order or "asc").lower() == "desc" else asc
    clause = [direction(column)]
    if tie_breaker is not None:
        clause.append(tie_breaker)
    return tuple(clause)
