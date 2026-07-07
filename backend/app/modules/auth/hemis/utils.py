from datetime import datetime, timedelta, timezone

import jwt
from core.config import settings


def _create_token(data: dict, secret_key: str, expires_delta: timedelta):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, secret_key, algorithm=settings.jwt.algorithm)
    return encoded_jwt


def create_access_token_jwt(data: dict):
    delta = timedelta(minutes=settings.jwt.access_token_expires_minutes)
    return _create_token(data=data, secret_key=settings.jwt.access_token_secret, expires_delta=delta)


def create_refresh_token_jwt(data: dict):
    delta = timedelta(days=settings.jwt.refresh_token_expires_days)
    return _create_token(data=data, secret_key=settings.jwt.refresh_token_secret, expires_delta=delta)
