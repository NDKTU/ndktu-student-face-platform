"""Parol xeshlash — hisobi ogʻir, shuning uchun alohida oqimlar pulida.

Ikki narsa shu yerda hal qilinadi.

**Bloklash.** bcrypt — sinxron hisob. Uni ``async def`` ichidan toʻgʻridan-toʻgʻri
chaqirganda event loop oʻsha vaqt davomida qimirlamaydi: bitta odam parol
kiritsa, qolgan hamma kutadi. Oʻlchov: bitta tekshiruv 206 ms. Ertalab 500 ta
talaba birga kirsa, sayt ikki daqiqaga qotardi.

Yechim — chaqiruvni oqimga uzatish. bcrypt C kodi va ishlayotganda GIL'ni
boʻshatadi, shuning uchun oqimlar haqiqatan turli yadrolarda parallel ketadi
(oʻlchandi: 1 oqim 4.8, 8 oqim 30.3 tekshiruv/sek).

**Nega alohida pul, Starlette'nikini ishlatmasdan.** Starlette'ning standart
puli 40 ta oqim va u hamma sinxron ish bilan boʻlishiladi — statik fayllar,
sinxron bogʻliqliklar. Kirish toʻlqini 40 tasini ham egallab qoʻysa, boshqa
ish ochlikda qolardi. Bu yerdagi pul yadro soni bilan cheklangan: kirish
navbatda kutsa mayli, butun sayt kutsa yomon.

**Narx.** ``rounds`` 12 dan 10 ga tushirildi — 206 ms oʻrniga 53 ms. Bu ataylab
qilingan kelishuv: bcrypt sekinligi oʻgʻirlangan bazani brute-force qilishni
qimmatlashtiradi, 10 esa hozirgi tavsiyalarning quyi chegarasi.

``max_rounds`` ham 10 qilib qoʻyilgani muhim. Faqat ``default_rounds`` bilan
mavjud xeshlar oʻzgarmasdi: passlib 12-round xeshni «kuchliroq» deb sanaydi va
uni oʻz tashabbusi bilan zaiflashtirmaydi (``needs_update`` → ``False``).
Chegara qoʻyilgach, 12 siyosatdan tashqarida qoladi va ``verify_and_migrate``
muvaffaqiyatli kirishda yangi xeshni qaytaradi — parol tiklashsiz, sezilmasdan.
"""

import asyncio
import os
from concurrent.futures import ThreadPoolExecutor

from core.config import settings
from passlib.context import CryptContext

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__default_rounds=10,
    bcrypt__max_rounds=10,
)

def _available_cores() -> int:
    """Nechta yadroda ishlay olamiz.

    ``os.cpu_count()`` mashinaning jami yadrosini qaytaradi va konteyner
    chegarasini koʻrmaydi: 4 yadroga biriktirilgan konteynerda ham 8 deydi.
    ``sched_getaffinity`` biriktirishni (compose'dagi ``cpuset``) koʻradi,
    shuning uchun chegara oʻzgarsa pul oʻzi moslashadi.

    Nega bu muhim: yadrodan koʻp oqim bu yerda tezlashtirmaydi. Kvota
    (``cpus``) qoʻyilgan holatda esa ochiqdan-ochiq zarar qiladi — oʻlchov
    boʻyicha 4 yadro kvotasida 8 oqim 67.7 oʻrniga 35.9 tekshiruv/sek berdi,
    chunki budjet tugagach barcha oqim oynaning oxirigacha muzlaydi.
    ``sched_getaffinity`` kvotani koʻrmaydi — kvota ishlatilsa, oqim sonini
    qoʻlda cheklash kerak.
    """
    try:
        return len(os.sched_getaffinity(0))
    except AttributeError:
        # Linux'dan tashqarida yoʻq; lokal ishlab chiqishda muhim emas.
        return os.cpu_count() or 4


#: bcrypt protsessorga tayanadi, shuning uchun pul yadro soni bilan
#: cheklangan — va yadrolar worker'lar orasida boʻlinadi. Har bir worker
#: oʻz pulini yasaydi, shuning uchun bu yerda ham boʻlish kerak: aks holda
#: 2 worker × 4 oqim = 8 oqim 4 yadroga tushardi.
_executor = ThreadPoolExecutor(
    max_workers=max(2, _available_cores() // max(1, settings.server.workers)),
    thread_name_prefix="pwd",
)


def hash_password(password: str) -> str:
    """Sinxron xeshlash — soʻrov yoʻlidan tashqarida.

    Ishga tushish paytidagi admin yaratish, skriptlar va testlar uchun: u yerda
    event loop boʻsh va bloklaydigan hech kim yoʻq.
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


async def hash_password_async(password: str) -> str:
    """Soʻrovga xizmat qilayotganda shu ishlatilsin."""
    return await asyncio.get_running_loop().run_in_executor(_executor, pwd_context.hash, password)


async def verify_password_async(plain_password: str, hashed_password: str) -> bool:
    return await asyncio.get_running_loop().run_in_executor(
        _executor, pwd_context.verify, plain_password, hashed_password
    )


async def verify_and_migrate(plain_password: str, hashed_password: str) -> tuple[bool, str | None]:
    """Parolni tekshiradi va kerak boʻlsa yangilangan xeshni qaytaradi.

    Ikkinchi qiymat ``None`` boʻlmasa — chaqiruvchi uni bazaga yozishi kerak.
    Bu eski 12-round xeshlarni 10 ga oʻtkazishning yagona yoʻli: xeshdan
    parolni tiklab boʻlmagani uchun ommaviy qayta hisoblash mumkin emas, har
    kim oʻzining birinchi kirishida koʻchadi.

    Birinchi kirish shu sababli biroz qimmatroq (eski xeshni tekshirish +
    yangisini yasash), keyingilari toʻrt barobar arzon.
    """
    return await asyncio.get_running_loop().run_in_executor(
        _executor, pwd_context.verify_and_update, plain_password, hashed_password
    )
