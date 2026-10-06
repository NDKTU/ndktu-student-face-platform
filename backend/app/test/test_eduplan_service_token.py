"""EPMOS: xizmat kaliti va odam hisobi — ikki MANZIL, bitta emas.

Shu farq eʼtibordan chetda qolgandi: kalitlar qoʻyilgach, barcha
soʻrovlar eski manzilga `client_credentials` bilan ketdi va EPMOS ularni
422 bilan qaytardi (`grant_type` u yerda `^password$` naqshi bilan
tekshiriladi). Natijada integratsiya butunlay toʻxtadi — admin ekranida
«sinxronlash» tugmalari soʻnib qoldi.

Ikkinchi tomoni: berilgan kalitning doirasi hozircha tor
(`main_data:read` — faqat `/api/v1/data/{id}`), yaʼni maʼlumotnomalarni
u bilan oʻqib boʻlmaydi. Shuning uchun kalit 401 olsa, mijoz parol
oqimiga qaytadi va progon davom etadi.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.config import EduPlanConfig
from app.modules.integration.eduplan.client import EduPlanClient

BASE = "https://epmos.nsumt.uz/rest"


def _token_response(token: str = "t"):
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {"access_token": token}
    return resp


def _ok(payload):
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = payload
    return resp


def _unauthorized():
    resp = MagicMock()
    resp.status_code = 401
    return resp


@pytest.mark.asyncio
async def test_service_key_goes_to_the_oauth_endpoint():
    """Kalit bilan — `/oauth/token`, `client_credentials` tanasi bilan."""
    cfg = EduPlanConfig(
        enabled=True, base_url=BASE, client_id="side_x", client_secret="secret"
    )

    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=_token_response())) as post:
        async with EduPlanClient(cfg) as client:
            await client._login()

    url = post.await_args.args[0]
    body = post.await_args.kwargs["data"]
    assert url == f"{BASE}/oauth/token"
    assert body["grant_type"] == "client_credentials"
    assert body["client_id"] == "side_x"


@pytest.mark.asyncio
async def test_account_goes_to_the_access_token_endpoint():
    """Kalitsiz — eski manzil va `password` oqimi.

    Kalit berilmagan oʻrnatma avvalgidek ishlashi kerak.
    """
    cfg = EduPlanConfig(enabled=True, base_url=BASE, username="user", password="pass")

    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=_token_response())) as post:
        async with EduPlanClient(cfg) as client:
            await client._login()

    url = post.await_args.args[0]
    body = post.await_args.kwargs["data"]
    assert url == f"{BASE}/api/v1/auth/access-token"
    assert body["grant_type"] == "password"
    assert body["username"] == "user"


@pytest.mark.asyncio
async def test_narrow_key_falls_back_to_the_account():
    """Kalit doirasi yetmasa (401) — progon toʻxtamaydi.

    Hozirgi kalit maʼlumotnomalarni ochmaydi, lekin sinxronizatsiya
    ishlayverishi kerak: parol hisobi bor boʻlsa, unga qaytiladi.
    """
    cfg = EduPlanConfig(
        enabled=True,
        base_url=BASE,
        client_id="side_x",
        client_secret="secret",
        username="user",
        password="pass",
    )

    get = AsyncMock(side_effect=[_unauthorized(), _ok([{"id": 1}])])
    with (
        patch("httpx.AsyncClient.post", new=AsyncMock(return_value=_token_response())) as post,
        patch("httpx.AsyncClient.get", new=get),
    ):
        async with EduPlanClient(cfg) as client:
            rows = await client._get("/api/v1/staff/")

    assert rows == [{"id": 1}]
    # Ikki marta kirildi: avval kalit bilan, soʻng parol bilan.
    urls = [call.args[0] for call in post.await_args_list]
    assert urls == [f"{BASE}/oauth/token", f"{BASE}/api/v1/auth/access-token"]


@pytest.mark.asyncio
async def test_key_only_setup_is_considered_configured():
    """Faqat kalit berilgan oʻrnatma «sozlanmagan» deb hisoblanmaydi.

    Ilgari shart login va parolni talab qilardi, yaʼni kalitlar bilan
    ishlaydigan oʻrnatma koʻtarilmasdi.
    """
    cfg = EduPlanConfig(
        enabled=True, base_url=BASE, client_id="side_x", client_secret="secret"
    )

    assert cfg.is_configured
