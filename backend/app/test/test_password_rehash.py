"""Eski parol xeshlarining yangi narxga koʻchishi.

bcrypt narxi 12 dan 10 ga tushirildi (206 ms → 53 ms). Xeshdan parolni tiklab
boʻlmagani uchun ommaviy qayta hisoblashning iloji yoʻq: har kim oʻzining
birinchi kirishida koʻchadi. Shu yerda tekshiriladigan narsa — bu koʻchish
haqiqatan sodir boʻlishi va kirishni buzmasligi.

Nega alohida test kerak. ``deprecated="auto"`` yolgʻiz oʻzi yetmaydi: passlib
12-round xeshni «kuchliroq» deb sanaydi va uni oʻz tashabbusi bilan
zaiflashtirmaydi. Koʻchish faqat ``max_rounds`` chegarasi qoʻyilgani uchun
ishlaydi, va bu sozlama jimgina yoʻqolib qolsa, hech kim sezmasdi — kirish
ishlayveradi, faqat hech qachon tezlashmasdi.
"""

import pytest
import pytest_asyncio
from passlib.context import CryptContext
from sqlalchemy import select

from app.modules.auth.model import User

#: Oʻzgarishdan oldingi sozlama — bazadagi 4232 ta xesh aynan shunday yasalgan.
LEGACY = CryptContext(schemes=["bcrypt"], bcrypt__default_rounds=12)

PAROL = "eski-parol-123"


@pytest_asyncio.fixture
async def legacy_user(async_db):
    """12-round xesh bilan yozilgan foydalanuvchi."""
    user = User(username="eski_xeshli", password=LEGACY.hash(PAROL), is_active=True)
    async_db.add(user)
    await async_db.commit()
    return user.id


async def _stored_hash(async_db, user_id: int) -> str:
    async_db.expire_all()
    return await async_db.scalar(select(User.password).where(User.id == user_id))


@pytest.mark.asyncio
async def test_legacy_hash_still_lets_the_user_in(async_client, async_db, legacy_user):
    """Avvalo: hech kim tizimdan tashqarida qolmasin."""
    assert (await _stored_hash(async_db, legacy_user)).startswith("$2b$12$")

    response = await async_client.post(
        "/user/login", json={"username": "eski_xeshli", "password": PAROL}
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_hash_is_rewritten_at_the_new_cost(async_client, async_db, legacy_user):
    """Kirishdan keyin xesh 10 ga koʻchadi — parol tiklashsiz."""
    await async_client.post("/user/login", json={"username": "eski_xeshli", "password": PAROL})

    assert (await _stored_hash(async_db, legacy_user)).startswith("$2b$10$")


@pytest.mark.asyncio
async def test_the_new_hash_accepts_the_same_password(async_client, async_db, legacy_user):
    """Koʻchish parolni oʻzgartirmaydi: ikkinchi kirish ham oʻtadi.

    Yangi xesh notoʻgʻri yozilsa, birinchi kirish baribir muvaffaqiyatli
    boʻlardi va nosozlik faqat keyingi safar bilinardi.
    """
    await async_client.post("/user/login", json={"username": "eski_xeshli", "password": PAROL})

    second = await async_client.post(
        "/user/login", json={"username": "eski_xeshli", "password": PAROL}
    )
    assert second.status_code == 200


@pytest.mark.asyncio
async def test_wrong_password_changes_nothing(async_client, async_db, legacy_user):
    """Xato parol na kiritadi, na xeshga tegadi."""
    response = await async_client.post(
        "/user/login", json={"username": "eski_xeshli", "password": "boshqa-parol"}
    )
    assert response.status_code == 401
    assert (await _stored_hash(async_db, legacy_user)).startswith("$2b$12$")
