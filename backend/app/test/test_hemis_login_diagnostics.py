"""HEMIS orqali kirish: har bir rad etish sababi logda koʻrinadi.

Serverdagi holat: sutkada `/api/hemis/login` 666 marta 400 qaytargan,
va qaysi sababdan — aniqlab boʻlmasdi. `_fetch_from_hemis` da toʻrtta
butunlay boshqa holat bir xil yalangʻoch 400 berardi va hech narsa
yozmasdi:

* HEMIS login soʻroviga 200 dan boshqa javob berdi;
* HEMIS `success: false` qaytardi (parol notoʻgʻri);
* `/account/me` javob bermadi;
* `/account/me` `success: false` qaytardi.

Uchinchi va toʻrtinchisi eng chalgʻituvchisi: parol TOʻGʻRI (token
berilgan), lekin profil olinmagan — foydalanuvchi uchun bu «parol
notoʻgʻri» bilan bir xil koʻrinadi.

Shu yerda tekshiriladigan narsa — sabablarning AJRALIShI, matnning
aniq soʻzlari emas.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.modules.auth.hemis.service import HemisLoginService

LOGIN = "319261101580"
PASSWORD = "sir-parol"
LOGIN_URL = "https://student.ndki.uz/rest/v1/auth/login"
ME_URL = "https://student.ndki.uz/rest/v1/account/me"


def _resp(status: int, payload=None, text: str = ""):
    r = MagicMock()
    r.status_code = status
    r.text = text or (str(payload) if payload is not None else "")
    if payload is None:
        r.json.side_effect = ValueError("not json")
    else:
        r.json.return_value = payload
    return r


async def _call(post_resp, get_resp=None):
    with (
        patch("httpx.AsyncClient.post", new=AsyncMock(return_value=post_resp)),
        patch("httpx.AsyncClient.get", new=AsyncMock(return_value=get_resp or _resp(200, {"success": True, "data": {}}))),
    ):
        return await HemisLoginService._fetch_from_hemis(LOGIN, PASSWORD, LOGIN_URL, ME_URL)


@pytest.mark.asyncio
async def test_rejected_login_is_logged(caplog):
    """HEMIS 401 bilan rad etdi — logda kod va javob boʻlagi boʻlsin."""
    with caplog.at_level("WARNING"):
        with pytest.raises(HTTPException) as exc:
            await _call(_resp(401, text='{"error":"bad credentials"}'))

    assert exc.value.status_code == 400
    assert LOGIN in caplog.text
    assert "401" in caplog.text


@pytest.mark.asyncio
async def test_unsuccessful_login_is_logged(caplog):
    """`success: false` — eng koʻp uchraydigan holat, logda alohida."""
    with caplog.at_level("WARNING"):
        with pytest.raises(HTTPException) as exc:
            await _call(_resp(200, {"success": False}, text='{"success":false}'))

    assert exc.value.status_code == 400
    assert LOGIN in caplog.text


@pytest.mark.asyncio
async def test_profile_failure_is_separated_from_wrong_password(caplog):
    """Parol toʻgʻri, profil olinmadi — bu BOSHQA sabab.

    Asosiy regressiya: ilgari ikkalasi ham bir xil 400 va bir xil
    sukunat edi.
    """
    ok_login = _resp(200, {"success": True, "data": {"token": "t"}}, text="{}")

    with caplog.at_level("ERROR"):
        with pytest.raises(HTTPException) as exc:
            await _call(ok_login, _resp(502, text="Bad Gateway"))

    assert exc.value.status_code == 400
    assert "502" in caplog.text
    assert "профил" in caplog.text.lower() or "profil" in caplog.text.lower()


@pytest.mark.asyncio
async def test_non_json_answer_is_not_a_client_error(caplog):
    """HTML sahifa kelsa — bu bizning emas, ularning nosozligi: 502."""
    with caplog.at_level("ERROR"):
        with pytest.raises(HTTPException) as exc:
            await _call(_resp(200, None, text="<html>502 Bad Gateway</html>"))

    assert exc.value.status_code == 502
    assert LOGIN in caplog.text


@pytest.mark.asyncio
async def test_success_without_token_does_not_crash(caplog):
    """`success: true`, lekin token yoʻq.

    Ilgari bu `KeyError` boʻlib, 500 ga aylanardi — yaʼni «bizda xato»
    deb koʻrinardi, holbuki javob ularniki.
    """
    with caplog.at_level("ERROR"):
        with pytest.raises(HTTPException) as exc:
            await _call(_resp(200, {"success": True, "data": {}}, text="{}"))

    assert exc.value.status_code == 502
    assert LOGIN in caplog.text


@pytest.mark.asyncio
async def test_password_never_reaches_the_log(caplog):
    """Parol logga hech qachon tushmaydi — na bir tarmoqda."""
    with caplog.at_level("DEBUG"):
        with pytest.raises(HTTPException):
            await _call(_resp(401, text="denied"))
        with pytest.raises(HTTPException):
            await _call(_resp(200, {"success": False}, text="{}"))
        with pytest.raises(HTTPException):
            await _call(
                _resp(200, {"success": True, "data": {"token": "t"}}, text="{}"),
                _resp(500, text="boom"),
            )

    assert PASSWORD not in caplog.text


@pytest.mark.asyncio
async def test_successful_login_returns_profile():
    """Oddiy yoʻl buzilmadi."""
    ok_login = _resp(200, {"success": True, "data": {"token": "t"}}, text="{}")
    ok_me = _resp(200, {"success": True, "data": {"student_id_number": LOGIN}}, text="{}")

    data = await _call(ok_login, ok_me)

    assert data == {"student_id_number": LOGIN}


@pytest.mark.asyncio
async def test_long_body_is_trimmed(caplog):
    """Chet javobi logni bosib ketmasin."""
    with caplog.at_level("WARNING"):
        with pytest.raises(HTTPException):
            await _call(_resp(500, text="x" * 5000))

    assert "x" * 300 not in caplog.text
