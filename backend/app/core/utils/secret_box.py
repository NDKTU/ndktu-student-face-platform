"""Симметричное шифрование секретов, которые приходится хранить в базе.

Ключ выводится из ``APP_CONFIG__JWT__ACCESS_TOKEN_SECRET`` — отдельный секрет
не заводим: он и так обязателен для запуска, а смена JWT-секрета и без того
инвалидирует все сессии, так что потеря расшифровываемости сохранённых
учётных данных при его ротации — ожидаемое и видимое событие, а не тихая
поломка.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

__all__ = ["encrypt_secret", "decrypt_secret", "SecretUnreadable"]


class SecretUnreadable(Exception):
    """Сохранённый секрет не расшифровывается текущим ключом (ключ сменился)."""


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.jwt.access_token_secret.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError) as e:
        raise SecretUnreadable("Сохранённый секрет не расшифровывается текущим ключом") from e
