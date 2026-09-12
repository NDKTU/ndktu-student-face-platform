"""Login registri: EPMOS uni farqlaydi, foydalanuvchi esa yo'q.

EPMOS xodim loginlarini harflar bilan yozadi ("MM001", "SIM002" — bazada
shunday 312 ta hisob) va `/auth/access-token` registrga qat'iy qaraydi.
Kirish so'rovi loginni kichik harfga keltirib yuborardi, natijada bunday
xodimlarning birortasi ham kira olmasdi: mahalliy qidiruv ham topmasdi,
EPMOS ham 400 qaytarardi.
"""

import pytest
from sqlalchemy import func, select

from app.modules.auth.model import User
from app.modules.auth.user.service import auth_service


@pytest.mark.asyncio
async def test_login_finds_user_regardless_of_case(async_client, async_db):
    from core.utils.password_hash import hash_password

    async_db.add(
        User(username="MM001", password=hash_password("Parol12345"), is_active=True)
    )
    await async_db.commit()

    for typed in ("MM001", "mm001", "Mm001"):
        response = await async_client.post(
            "/user/login", json={"username": typed, "password": "Parol12345"}
        )
        assert response.status_code == 200, typed
        assert response.json()["access_token"]


@pytest.mark.asyncio
async def test_login_keeps_username_case_for_external_call(async_db):
    """Tashqi tizimga bazadagi yozilish uboriladi, foydalanuvchi yozgani emas.

    EPMOS uchun "mm001" va "MM001" — boshqa-boshqa login, shuning uchun
    kichik harf bilan kirgan xodim ham o'tishi kerak.
    """
    from core.utils.password_hash import hash_password

    async_db.add(
        User(username="SIM002", password=hash_password("x"), auth_source="eduplan", is_active=True)
    )
    await async_db.commit()

    found = await auth_service.get_user_by_username(async_db, "sim002")
    assert found is not None
    # Aynan shu qiymat EPMOS'ga uzatiladi (`login()` dagi `external_username`).
    assert found.username == "SIM002"

    stored = (
        await async_db.execute(select(func.count()).select_from(User).where(User.username == "SIM002"))
    ).scalar()
    assert stored == 1
