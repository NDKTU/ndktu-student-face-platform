from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.config import EduPlanConfig
from app.modules.integration.eduplan.auth_service import EduPlanAuthService


@pytest.mark.asyncio
async def test_eduplan_login_invalid_credentials():
    service = EduPlanAuthService()
    dummy_cfg = EduPlanConfig(enabled=True, base_url="https://edu.plan.nsumt.uz/rest", username="test", password="123")

    with patch("app.modules.integration.eduplan.auth_service.effective_config", return_value=dummy_cfg), \
         patch("httpx.AsyncClient.post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_post.return_value = mock_response

        session = AsyncMock()
        with pytest.raises(HTTPException) as exc_info:
            await service.login(session, "wrong_user", "wrong_pass")

        assert exc_info.value.status_code == 401
        assert "EduPlan: Login yoki parol noto'g'ri" in exc_info.value.detail


@pytest.mark.asyncio
async def test_eduplan_login_success_mocked():
    service = EduPlanAuthService()
    dummy_cfg = EduPlanConfig(enabled=True, base_url="https://edu.plan.nsumt.uz/rest", username="test", password="123")

    mock_token_resp = MagicMock()
    mock_token_resp.status_code = 200
    mock_token_resp.json.return_value = {"access_token": "mocked_eduplan_jwt_token"}

    mock_me_resp = MagicMock()
    mock_me_resp.status_code = 200
    mock_me_resp.json.return_value = {
        "id": 42,
        "username": "teacher_bobur",
        "first_name": "Bobur",
        "last_name": "Valiyev",
        "roles": ["Teacher"],
        "department_id": 5,
        "is_active": True,
    }

    with patch("app.modules.integration.eduplan.auth_service.effective_config", return_value=dummy_cfg), \
         patch("httpx.AsyncClient.post", return_value=mock_token_resp), \
         patch("httpx.AsyncClient.get", return_value=mock_me_resp), \
         patch.object(service, "_save_eduplan_user") as mock_save, \
         patch("app.modules.integration.eduplan.auth_service.ensure_user_active") as mock_active, \
         patch("app.modules.integration.eduplan.auth_service.auth_service.create_session_token", return_value="platform_jwt_token") as mock_token:

        mock_user = AsyncMock()
        mock_user.id = 10
        mock_save.return_value = mock_user

        session = AsyncMock()
        token = await service.login(session, "teacher_bobur", "correct_pass")

        assert token == "platform_jwt_token"
        mock_save.assert_called_once()
        mock_active.assert_called_once_with(mock_user)
        mock_token.assert_called_once_with(10)
