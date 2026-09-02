"""Etalon yuz vektorini olish va keshlash.

Muammo. Etalonni yuklash mantigʻi ikki joyda takrorlanardi — WebSocket'da va
``/v1/face/verify`` da — va ikkovi ham uni **har safar** qaytadan bajarardi:
rasmni HEMIS'dan yuklab olish, dekodlash, vektorini hisoblash. Holbuki
talabaning rasmi dars yoki imtihon davomida oʻzgarmaydi. Dars tekshiruvi har
5-12 daqiqada takrorlanadi, yaʼni oʻsha ish oʻnlab marta bajarilardi.

Bu modul ikkovini birlashtiradi: manzil boʻyicha vektor beradi, yoʻlda uni
keshlaydi. Kesh vektorni saqlaydi, rasm baytlarini emas — shunda ham yuklab
olish, ham modelni ishga tushirish oʻtkazib yuboriladi.

Nima uchun jarayon xotirasida, Redis'da emas. Vektor modelga bogʻliq: model
almashsa, eski qiymatlar boshqa fazoga tegishli boʻlib qoladi va jimgina
notoʻgʻri javob berardi. Xotiradagi kesh qayta ishga tushganda oʻzi tozalanadi,
model almashtirish esa baribir obrazni qayta yigʻishni talab qiladi.

Hajmi kichik: bitta vektor ~0.5-2 KB, 4096 ta talaba ~8 MB.
"""

import time
from collections import OrderedDict
from pathlib import Path
from typing import Any

import httpx

from app.core.logging import get_logger
from app.services import video_service

logger = get_logger(__name__)

#: Universitetdagi talabalar sonidan kattaroq — amalda siqib chiqarish
#: boʻlmaydi, chegara faqat cheksiz oʻsishdan himoya.
MAX_ENTRIES = 4096

#: Rasm HEMIS'da almashsa, kesh bir necha soatdan keyin oʻzi yangilanadi.
TTL_SECONDS = 6 * 3600

#: Etalon ikki joydan keladi: umumiy tomdagi fayl yoki tashqi havola
#: (HEMIS talabalar rasmini aynan shunday beradi).
LOCAL_PREFIX = "/uploads/"
LOCAL_ROOT = "/face"

DOWNLOAD_TIMEOUT_SECONDS = 10.0

_cache: "OrderedDict[str, tuple[float, Any]]" = OrderedDict()


def clear() -> None:
    """Testlar uchun: keshni boʻshatadi."""
    _cache.clear()


def stats() -> dict[str, int]:
    return {"entries": len(_cache), "max_entries": MAX_ENTRIES}


async def _read_bytes(url: str) -> bytes | None:
    if url.startswith(LOCAL_PREFIX):
        path = Path(f"{LOCAL_ROOT}{url}")
        if not path.exists():
            logger.error("Reference file not found: %s", path)
            return None
        return path.read_bytes()

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=DOWNLOAD_TIMEOUT_SECONDS)
            response.raise_for_status()
            return response.content
    except Exception as cause:  # noqa: BLE001 — tarmoq yoki buzuq fayl
        logger.warning("Reference image download failed (%s): %s", url, cause)
        return None


async def _compute(url: str) -> Any:
    payload = await _read_bytes(url)
    if payload is None:
        return None

    frame = await video_service.decode_frame(payload)
    if frame is None:
        logger.error("Reference image could not be decoded: %s", url)
        return None

    encoding = await video_service.get_face_encoding(frame)
    if encoding is None:
        logger.warning("No face found on the reference photo: %s", url)
    return encoding


async def get_encoding(url: str) -> Any:
    """Etalon vektorni beradi — keshdan yoki hisoblab.

    ``None`` qaytishi ikki maʼnoni bildiradi: rasm kelmadi yoki unda yuz
    topilmadi. Bunday javob **keshlanmaydi** — sabab vaqtinchalik boʻlishi
    mumkin (tarmoq uzildi, HEMIS javob bermadi), va uni saqlab qoʻyish
    talabani soatlab tekshiruvsiz qoldirardi.
    """
    now = time.monotonic()

    cached = _cache.get(url)
    if cached is not None:
        stored_at, encoding = cached
        if now - stored_at < TTL_SECONDS:
            _cache.move_to_end(url)
            return encoding
        del _cache[url]

    encoding = await _compute(url)
    if encoding is None:
        return None

    _cache[url] = (now, encoding)
    _cache.move_to_end(url)
    while len(_cache) > MAX_ENTRIES:
        evicted, _ = _cache.popitem(last=False)
        logger.debug("Reference cache evicted: %s", evicted)

    return encoding
