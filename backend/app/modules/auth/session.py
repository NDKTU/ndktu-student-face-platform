"""Sessiya: JWT, yagona faol sessiya (Redis) va uning sirpanuvchi idle-oynasi.

`UserService` (`auth/user/service.py`) dan ajratilgan. Sabab — import sikli:
EPOS orqali kirish (`integration/eduplan/auth_service.py`) va HEMIS kirishi
sessiya berish uchun `user/service` ni import qilardi, `user/service` esa
`login()` ichida EPOS kirishini — sikl `login()` ichidagi yashirin import
bilan yamalgan edi. Endi uchalasi sessiyani shu moduldan oladi, bu modul
esa ulardan birortasiga ham bog'liq emas.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.errors import Unauthorized, Unavailable
from app.core.redis_client import redis_client
from app.modules.audit import service as audit_service
from app.modules.audit.model import AuditEvent

logger = logging.getLogger(__name__)


class SessionService:
    @staticmethod
    def _session_key(user_id: int) -> str:
        return f"user:session:{user_id}"

    @staticmethod
    def _strip_bearer(header_value: str) -> str:
        """Extract the raw JWT token from an ``Authorization`` header."""
        if not header_value:
            raise Unauthorized("auth_header_missing", "Missing Authorization header")
        parts = header_value.strip().split(" ", 1)
        if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
            raise Unauthorized("auth_header_invalid", "Invalid Authorization header (expected 'Bearer <token>')")
        return parts[1].strip()

    async def create_session_token(self, user_id: int) -> str:
        """Creates access token with a unique jti and registers it in Redis."""
        jti = str(uuid.uuid4())
        access_token = self.create_access_token({"user_id": user_id, "jti": jti})

        # Store jti in Redis to enforce Single Active Session.
        # TTL = скользящее idle-окно; продлевается при каждом запросе в validate_session.
        try:
            # Avvalgi sessiya bor edimi — bu yangi kirish uni tugatayotganini
            # bildiradi. Keyin tekshirib bo'lmaydi: kalit qayta yoziladi.
            # So'rov konteksti bu yerda yo'q, shuning uchun IP yozilmaydi —
            # muhimi kimning sessiyasi va qachon tugatilgani.
            had_session = bool(await redis_client.get(self._session_key(user_id)))
            await redis_client.set(
                self._session_key(user_id),
                jti,
                ex=settings.jwt.session_idle_minutes * 60,
            )
            if had_session:
                await audit_service.record_standalone(
                    event=AuditEvent.SESSION_EVICTED,
                    user_id=user_id,
                    summary="Boshqa qurilmadan kirildi — avvalgi sessiya tugatildi",
                )
        except RedisError:
            logger.exception("Redis unavailable while creating session for user %s", user_id)
            raise Unavailable("auth_unavailable", "Authentication service temporarily unavailable")
        return access_token

    async def validate_session(self, token: str) -> int:
        """Decode the token, enforce Single Active Session and slide the idle TTL.

        Единая точка проверки сессии для всех защищённых роутов. Возвращает user_id
        или бросает 401 (невалидный токен / завершённая сессия) либо 503 (Redis недоступен).
        """
        token = self._strip_bearer(token)
        payload = self.token_decode(token)
        user_id = payload.get("user_id")
        jti = payload.get("jti")

        if user_id is None or not jti:
            raise Unauthorized("token_invalid", "Invalid token")

        try:
            stored_jti = await redis_client.get(self._session_key(user_id))
            if stored_jti != jti:
                # Ключ отсутствует (logout / idle-expire) или захвачен другим устройством.
                logger.warning("User %s session invalid (logout/idle or another device).", user_id)
                raise Unauthorized("session_replaced", "Boshqa qurilmadan profilga kirilgan. Joriy sessiya yakunlandi.")
            # Скользящий idle-таймаут: продлеваем TTL на каждом аутентифицированном запросе.
            await redis_client.expire(self._session_key(user_id), settings.jwt.session_idle_minutes * 60)
        except RedisError:
            logger.exception("Redis unavailable while validating session for user %s", user_id)
            raise Unavailable("auth_unavailable", "Authentication service temporarily unavailable")

        return user_id

    async def logout(self, user_id: int) -> None:
        """Revoke the current session server-side by dropping its Redis key."""
        try:
            await redis_client.delete(self._session_key(user_id))
        except RedisError:
            # Logout не должен падать из-за Redis — клиент всё равно очистит токен.
            logger.warning("Redis unavailable during logout for user %s", user_id)

    def token_decode(self, token: str, secret_key: str | None = None) -> dict:
        try:
            return jwt.decode(
                token,
                secret_key or settings.jwt.access_token_secret,
                algorithms=[settings.jwt.algorithm],
            )
        except jwt.ExpiredSignatureError:
            logger.info("Token decode: expired")
            raise Unauthorized("token_expired", "Token expired")
        except jwt.InvalidTokenError as e:
            logger.warning(f"Token decode: invalid ({e.__class__.__name__})")
            raise Unauthorized("token_invalid", "Invalid token")

    def _create_token(self, data: dict, secret_key: str, expires_delta: timedelta):
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + expires_delta
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, secret_key, algorithm=settings.jwt.algorithm)
        return encoded_jwt

    def create_access_token(self, data: dict):
        payload = {**data, "type": "access"}
        delta = timedelta(minutes=settings.jwt.access_token_expires_minutes)
        return self._create_token(data=payload, secret_key=settings.jwt.access_token_secret, expires_delta=delta)

    def create_refresh_token(self, data: dict):
        payload = {**data, "type": "refresh"}
        delta = timedelta(days=settings.jwt.refresh_token_expires_days)
        return self._create_token(data=payload, secret_key=settings.jwt.refresh_token_secret, expires_delta=delta)


session_service = SessionService()
