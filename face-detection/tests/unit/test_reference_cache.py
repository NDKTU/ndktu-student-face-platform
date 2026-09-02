"""Etalon vektorlari keshi.

Nima uchun bu test kerak. Kesh tejaydigan ish — tashqi tarmoq soʻrovi va
model chaqiruvi — ikkalasi ham koʻzga koʻrinmaydi: kesh butunlay ishlamay
qolsa ham servis toʻgʻri javob berishda davom etadi, faqat sekin. Yaʼni
nosozlik testsiz bilinmasdi.
"""

import pytest

from app.services import reference_cache

URL = "https://hemis.example/photo/1.jpg"


@pytest.fixture(autouse=True)
def clean_cache():
    reference_cache.clear()
    yield
    reference_cache.clear()


class _Counter:
    """``_compute`` oʻrnini bosadi va necha marta chaqirilganini sanaydi."""

    def __init__(self, result):
        self.result = result
        self.calls = 0

    async def __call__(self, url):
        self.calls += 1
        return self.result(url) if callable(self.result) else self.result


@pytest.mark.asyncio
async def test_second_lookup_does_not_recompute(monkeypatch):
    """Asosiy vaʼda: takroriy soʻrov na yuklaydi, na hisoblaydi."""
    compute = _Counter("vektor")
    monkeypatch.setattr(reference_cache, "_compute", compute)

    first = await reference_cache.get_encoding(URL)
    second = await reference_cache.get_encoding(URL)

    assert first == second == "vektor"
    assert compute.calls == 1


@pytest.mark.asyncio
async def test_failure_is_not_cached(monkeypatch):
    """Muvaffaqiyatsizlik saqlanmaydi.

    Sabab vaqtinchalik boʻlishi mumkin — tarmoq uzildi, HEMIS javob bermadi.
    Uni keshlash talabani soatlab tekshiruvsiz qoldirardi.
    """
    results = [None, None, "vektor"]
    compute = _Counter(lambda _url: results.pop(0))
    monkeypatch.setattr(reference_cache, "_compute", compute)

    assert await reference_cache.get_encoding(URL) is None
    assert await reference_cache.get_encoding(URL) is None
    assert await reference_cache.get_encoding(URL) == "vektor"
    assert compute.calls == 3


@pytest.mark.asyncio
async def test_entry_expires(monkeypatch):
    """Rasm HEMIS'da almashsa, kesh oʻzi yangilanadi."""
    compute = _Counter("eski")
    monkeypatch.setattr(reference_cache, "_compute", compute)
    monkeypatch.setattr(reference_cache, "TTL_SECONDS", 0)

    await reference_cache.get_encoding(URL)
    await reference_cache.get_encoding(URL)

    assert compute.calls == 2


@pytest.mark.asyncio
async def test_oldest_entry_is_evicted(monkeypatch):
    """Chegara cheksiz oʻsishdan himoya qiladi."""
    compute = _Counter("vektor")
    monkeypatch.setattr(reference_cache, "_compute", compute)
    monkeypatch.setattr(reference_cache, "MAX_ENTRIES", 2)

    for i in range(3):
        await reference_cache.get_encoding(f"{URL}?{i}")

    assert reference_cache.stats()["entries"] == 2
    # Eng eskisi chiqib ketdi, yaʼni uni qayta soʻrash qayta hisoblatadi.
    await reference_cache.get_encoding(f"{URL}?0")
    assert compute.calls == 4


@pytest.mark.asyncio
async def test_recent_use_keeps_an_entry_alive(monkeypatch):
    """Faol talabaning etaloni siqib chiqarilmaydi."""
    compute = _Counter("vektor")
    monkeypatch.setattr(reference_cache, "_compute", compute)
    monkeypatch.setattr(reference_cache, "MAX_ENTRIES", 2)

    await reference_cache.get_encoding("a")
    await reference_cache.get_encoding("b")
    await reference_cache.get_encoding("a")  # a yangilanadi
    await reference_cache.get_encoding("c")  # endi b chiqib ketishi kerak

    calls_before = compute.calls
    await reference_cache.get_encoding("a")
    assert compute.calls == calls_before, "a hali keshda boʻlishi kerak edi"
