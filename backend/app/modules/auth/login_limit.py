"""Kirish so'rovlari chastotasi: IP + kiritilgan login bo'yicha.

`auth/user/router.py` (`/user/login`) va `auth/hemis/router.py`
(`/hemis/login`) ikkalasi ishlatadi.
"""

import json

from fastapi import Request


def _login_identifier(field: str):
    """Key the login rate limit by IP + attempted login, so unrelated
    users behind the same NAT/reverse proxy don't share one bucket.

    A classroom sits behind one IP: keyed by IP alone, 5 logins/min were
    shared by the whole group and the rest got 429 before even reaching us.
    Per login the limit still stops password guessing on one account."""

    async def identifier(request: Request) -> str:
        body = await request.body()
        try:
            login = str(json.loads(body).get(field, "")).strip().lower()
        except (json.JSONDecodeError, AttributeError):
            login = ""
        forwarded = request.headers.get("X-Forwarded-For")
        ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
        return f"{ip}:{login}:{request.scope['path']}"

    return identifier


login_rate_limit_identifier = _login_identifier("username")
hemis_login_rate_limit_identifier = _login_identifier("login")
