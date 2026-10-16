"""HEMIS OAuth orqali kirish.

Parol HEMIS sahifasida kiritiladi, bizning server faqat kodni tokenga
almashtiradi va profilni o'qiydi. Bu yerda tekshiriladi:

* `state` bir martalik va portalni eslab qoladi (CSRF va qayta yuborish);
* odam bizda topiladi — talaba `student_id_number`, xodim `teachers.hemis_id`
  bo'yicha; topilmasa hisob YARATILMAYDI;
* HEMIS xatolari bir-biridan ajraladi (kod, profil, tarmoq).
"""

from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import parse_qs, urlparse

import pytest
from core.config import settings
from sqlalchemy import func, select

from app.modules.auth.hemis.oauth import HemisOAuthService, hemis_oauth_service
from app.modules.auth.user.service import auth_service
from app.core.errors import AppError

REDIRECT = "https://lms.nsumt.uz/auth/hemis/callback"


@pytest.fixture(autouse=True)
def oauth_settings(monkeypatch):
    monkeypatch.setattr(settings.hemis, "oauth_client_id", "3")
    monkeypatch.setattr(settings.hemis, "oauth_client_secret", "s3cr3t-oauth")
    monkeypatch.setattr(settings.hemis, "oauth_redirect_uri", REDIRECT)
    monkeypatch.setattr(settings.hemis, "oauth_student_url", "https://student.ndki.uz")
    monkeypatch.setattr(settings.hemis, "oauth_employee_url", "https://hemis.ndki.uz/")


async def _make_student(async_db, username: str, student_id_number: str, is_active: bool = True):
    from app.modules.auth.model import Student, User

    user = User(username=username, password="not-used", is_active=is_active)
    async_db.add(user)
    await async_db.flush()
    async_db.add(
        Student(
            user_id=user.id,
            first_name="OAuth",
            last_name="Talaba",
            third_name="Test",
            full_name="Talaba OAuth Test",
            student_id_number=student_id_number,
            image_path="",
            birth_date=date(2004, 1, 1),
            phone="",
            gender="male",
            university="NDKTU",
            specialty="Test",
            student_status="active",
            education_form="full_time",
            education_type="bachelor",
            payment_form="grant",
            education_lang="uz",
            faculty="Test",
            level="1",
            semester="1",
            address="Test",
            avg_gpa=0,
        )
    )
    await async_db.commit()
    return user


async def _start(async_client, portal: str = "student") -> str:
    response = await async_client.get("/hemis/oauth/authorize", params={"portal": portal})
    assert response.status_code == 200
    return parse_qs(urlparse(response.json()["url"]).query)["state"][0]


def _profile(payload: dict):
    return patch.object(HemisOAuthService, "_fetch_profile", new=AsyncMock(return_value=payload))


@pytest.mark.asyncio
async def test_portals_hidden_until_configured(async_client, monkeypatch):
    response = await async_client.get("/hemis/oauth/portals")
    assert response.json() == {"portals": ["student", "employee"]}

    monkeypatch.setattr(settings.hemis, "oauth_client_secret", "")
    response = await async_client.get("/hemis/oauth/portals")
    assert response.json() == {"portals": []}

    response = await async_client.get("/hemis/oauth/authorize", params={"portal": "student"})
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "hemis_oauth_disabled"


@pytest.mark.asyncio
async def test_authorize_url_points_to_portal(async_client):
    response = await async_client.get("/hemis/oauth/authorize", params={"portal": "employee"})
    url = urlparse(response.json()["url"])
    query = parse_qs(url.query)

    # Oxirgi «/» kesiladi — aks holda `//oauth` bo'lardi.
    assert f"{url.scheme}://{url.netloc}{url.path}" == "https://hemis.ndki.uz/oauth/authorize"
    assert query["client_id"] == ["3"]
    assert query["redirect_uri"] == [REDIRECT]
    assert query["response_type"] == ["code"]
    assert "client_secret" not in query


@pytest.mark.asyncio
async def test_student_logs_in_by_student_id_number(async_client, async_db):
    user = await _make_student(async_db, "319261100001", "319261100001")
    state = await _start(async_client)

    with _profile({"student_id_number": "319261100001", "name": "Talaba"}):
        response = await async_client.post("/hemis/oauth/callback", json={"code": "c", "state": state})

    assert response.status_code == 200
    payload = auth_service.token_decode(response.json()["access_token"])
    assert payload["user_id"] == user.id


@pytest.mark.asyncio
async def test_state_is_single_use(async_client, async_db):
    await _make_student(async_db, "319261100002", "319261100002")
    state = await _start(async_client)

    with _profile({"student_id_number": "319261100002"}):
        first = await async_client.post("/hemis/oauth/callback", json={"code": "c", "state": state})
        again = await async_client.post("/hemis/oauth/callback", json={"code": "c", "state": state})

    assert first.status_code == 200
    assert again.status_code == 400
    assert again.json()["detail"]["code"] == "hemis_oauth_state_invalid"


@pytest.mark.asyncio
async def test_forged_state_never_reaches_hemis(async_client):
    fetch = AsyncMock()
    with patch.object(HemisOAuthService, "_fetch_profile", new=fetch):
        response = await async_client.post("/hemis/oauth/callback", json={"code": "c", "state": "uydirma"})

    assert response.status_code == 400
    fetch.assert_not_awaited()


@pytest.mark.asyncio
async def test_unknown_student_is_not_created(async_client, async_db):
    from app.modules.auth.model import User

    before = await async_db.scalar(select(func.count()).select_from(User))
    state = await _start(async_client)

    with _profile({"student_id_number": "999999999999"}):
        response = await async_client.post("/hemis/oauth/callback", json={"code": "c", "state": state})

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "hemis_oauth_student_not_found"
    assert await async_db.scalar(select(func.count()).select_from(User)) == before


@pytest.mark.asyncio
async def test_disabled_account_is_rejected(async_client, async_db):
    await _make_student(async_db, "319261100003", "319261100003", is_active=False)
    state = await _start(async_client)

    with _profile({"student_id_number": "319261100003"}):
        response = await async_client.post("/hemis/oauth/callback", json={"code": "c", "state": state})

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_teacher_logs_in_by_hemis_id(async_client, async_db, make_teacher):
    from app.modules.auth.model import Teacher

    created = await make_teacher("oauth_teacher")
    teacher = await async_db.get(Teacher, created["id"])
    teacher.hemis_id = "4512"
    await async_db.commit()

    state = await _start(async_client, portal="employee")
    with _profile({"employee_id_number": "4512"}):
        response = await async_client.post("/hemis/oauth/callback", json={"code": "c", "state": state})

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_student_state_does_not_log_in_teacher(async_client, async_db, make_teacher):
    """Portal `state` da saqlanadi: talaba portali profilini xodim deb o'qimaymiz."""
    from app.modules.auth.model import Teacher

    created = await make_teacher("oauth_teacher2")
    teacher = await async_db.get(Teacher, created["id"])
    teacher.hemis_id = "4513"
    await async_db.commit()

    state = await _start(async_client, portal="student")
    with _profile({"employee_id_number": "4513"}):
        response = await async_client.post("/hemis/oauth/callback", json={"code": "c", "state": state})

    assert response.status_code == 403


# ---------------------------------------------------------------------- #
#  HTTP almashinuvi
# ---------------------------------------------------------------------- #
def _resp(status: int, payload=None, text: str = ""):
    r = MagicMock()
    r.status_code = status
    r.text = text or (str(payload) if payload is not None else "")
    if payload is None:
        r.json.side_effect = ValueError("not json")
    else:
        r.json.return_value = payload
    return r


async def _fetch(post_resp, get_resp=None):
    post = AsyncMock(return_value=post_resp)
    get = AsyncMock(return_value=get_resp)
    with patch("httpx.AsyncClient.post", new=post), patch("httpx.AsyncClient.get", new=get):
        profile = await hemis_oauth_service._fetch_profile("https://student.ndki.uz", "student", "kod")
    return profile, post, get


@pytest.mark.asyncio
async def test_fetch_profile_exchanges_code_and_unwraps_data():
    profile, post, get = await _fetch(
        _resp(200, {"access_token": "tok"}),
        _resp(200, {"success": True, "data": {"student_id_number": "1"}}),
    )

    assert profile == {"student_id_number": "1"}
    assert post.await_args.args[0] == "https://student.ndki.uz/oauth/access-token"
    assert post.await_args.kwargs["data"]["code"] == "kod"
    assert post.await_args.kwargs["data"]["redirect_uri"] == REDIRECT
    assert get.await_args.kwargs["headers"]["Authorization"] == "Bearer tok"


@pytest.mark.asyncio
async def test_rejected_code_is_logged_without_secret(caplog):
    with caplog.at_level("ERROR"), pytest.raises(AppError) as exc:
        await _fetch(_resp(401, {"error": "invalid_client"}, text='{"error":"invalid_client"}'))

    assert exc.value.detail["code"] == "hemis_oauth_token_failed"
    assert "invalid_client" in caplog.text
    assert "s3cr3t-oauth" not in caplog.text


@pytest.mark.asyncio
async def test_missing_profile_is_a_separate_error():
    with pytest.raises(AppError) as exc:
        await _fetch(_resp(200, {"access_token": "tok"}), _resp(500, text="xato"))

    assert exc.value.detail["code"] == "hemis_oauth_profile_failed"


@pytest.mark.asyncio
async def test_network_error_is_503():
    import httpx

    with (
        patch("httpx.AsyncClient.post", new=AsyncMock(side_effect=httpx.ConnectError("yo'q"))),
        pytest.raises(AppError) as exc,
    ):
        await hemis_oauth_service._fetch_profile("https://student.ndki.uz", "student", "kod")

    assert exc.value.status_code == 503
