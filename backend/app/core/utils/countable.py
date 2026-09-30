"""Hisob-kitobga kiradigan natijalar.

Xizmat fani (`subjects.is_countable = false`) test oʻtkazish uchun
tuziladi: bir martalik sinov, tashqi ishtirokchilar, kirish nazorati.
Uning natijalari reyting va statistikaga kirmasligi kerak.

Nega bitta joyda. Shart beshta soʻrovda kerak (uchta reyting, ikkita
panel, kurs statistikasi). Har birida qoʻlda yozilsa, biri albatta
unutiladi — va buzilish jimgina qaytadi: raqam notoʻgʻri, lekin xato
chiqmaydi. Shuning uchun shart shu yerda bir marta taʼriflanadi.

Ishlatilishi:

    stmt = stmt.where(countable_results())

`Result.subject_id` boʻsh boʻlsa ham qator hisobga KIRADI: fan
oʻchirilganda `SET NULL` boʻladi va eski natijani yoʻqotish notoʻgʻri
boʻlardi. Chiqariladigan narsa — aynan xizmat faniga tegishli natija.
"""

from sqlalchemy import select

from app.modules.quiz.model import Result, Subject


def countable_results():
    """`Result` boʻyicha soʻrovga qoʻshiladigan shart.

    `NOT EXISTS` emas, `NOT IN` ham emas: `Result.subject_id` boʻsh
    boʻlishi mumkin va ikkalasi ham bunday qatorni jimgina tashlab
    ketardi.
    """
    service_subjects = select(Subject.id).where(Subject.is_countable.is_(False))
    return Result.subject_id.notin_(service_subjects) | Result.subject_id.is_(None)
