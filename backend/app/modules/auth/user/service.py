import logging
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from core.config import settings
from core.redis_client import redis_client
from core.utils.password_hash import verify_password
from fastapi import HTTPException, status
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.auth.employee.model import Employee
from app.modules.auth.role.model import Role
from app.modules.auth.student.model import Student
from app.modules.auth.teacher.model import Teacher
from app.modules.auth.user.model import User

from .schemas import UserLoginRequest, UserLoginResponse

logger = logging.getLogger(__name__)


class UserService:
    @staticmethod
    def _session_key(user_id: int) -> str:
        return f"user:session:{user_id}"

    async def create_session_token(self, user_id: int) -> str:
        """Creates access token with a unique jti and registers it in Redis."""
        jti = str(uuid.uuid4())
        access_token = self.create_access_token({"user_id": user_id, "jti": jti})

        # Store jti in Redis to enforce Single Active Session.
        # TTL = скользящее idle-окно; продлевается при каждом запросе в validate_session.
        try:
            await redis_client.set(
                self._session_key(user_id),
                jti,
                ex=settings.jwt.session_idle_minutes * 60,
            )
        except RedisError:
            logger.exception("Redis unavailable while creating session for user %s", user_id)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication service temporarily unavailable",
            )
        return access_token

    async def validate_session(self, token: str) -> int:
        """Decode the token, enforce Single Active Session and slide the idle TTL.

        Единая точка проверки сессии для всех защищённых роутов. Принимает голый
        JWT: схему `Bearer` разбирает `HTTPBearer` в `core/dependencies/role_checker.py`.
        Возвращает user_id или бросает 401 (невалидный токен / завершённая сессия)
        либо 503 (Redis недоступен).
        """
        payload = self.token_decode(token)
        user_id = payload.get("user_id")
        jti = payload.get("jti")

        if user_id is None or not jti:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )

        try:
            stored_jti = await redis_client.get(self._session_key(user_id))
            if stored_jti != jti:
                # Ключ отсутствует (logout / idle-expire) или захвачен другим устройством.
                logger.warning("User %s session invalid (logout/idle or another device).", user_id)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Boshqa qurilmadan profilga kirilgan. Joriy sessiya yakunlandi.",
                )
            # Скользящий idle-таймаут: продлеваем TTL на каждом аутентифицированном запросе.
            await redis_client.expire(self._session_key(user_id), settings.jwt.session_idle_minutes * 60)
        except RedisError:
            logger.exception("Redis unavailable while validating session for user %s", user_id)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication service temporarily unavailable",
            )

        return user_id

    async def logout(self, user_id: int) -> None:
        """Revoke the current session server-side by dropping its Redis key."""
        try:
            await redis_client.delete(self._session_key(user_id))
        except RedisError:
            # Logout не должен падать из-за Redis — клиент всё равно очистит токен.
            logger.warning("Redis unavailable during logout for user %s", user_id)

    async def login(self, session: AsyncSession, data: UserLoginRequest) -> UserLoginResponse:
        user = await self.get_user_by_username(session, data.username)

        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username")

        if not verify_password(data.password, user.password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")

        access_token = await self.create_session_token(user.id)

        return UserLoginResponse(type="Bearer", access_token=access_token)

    def token_decode(self, token: str, secret_key: str | None = None) -> dict:
        try:
            return jwt.decode(
                token,
                secret_key or settings.jwt.access_token_secret,
                algorithms=[settings.jwt.algorithm],
            )
        except jwt.ExpiredSignatureError:
            logger.info("Token decode: expired")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token expired",
            )
        except jwt.InvalidTokenError as e:
            logger.warning(f"Token decode: invalid ({e.__class__.__name__})")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )

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

    async def get_user_by_id(self, session: AsyncSession, user_id: int):
        stmt = select(User).where(User.id == user_id).options(selectinload(User.roles))
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_by_username(self, session: AsyncSession, username: str):
        stmt = select(User).where(User.username == username).options(selectinload(User.roles))
        result = await session.execute(stmt)
        return result.scalar_one_or_none()


auth_service = UserService()
