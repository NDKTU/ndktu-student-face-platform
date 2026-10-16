"""Единая проверка того, что учётной записи разрешён вход.

Вынесена отдельно, чтобы все входы — локальный, студенческий Hemis и
сотруднический Hemis — отвечали на деактивацию одинаково.
"""

from app.core.errors import Forbidden


def ensure_user_active(user) -> None:
    if getattr(user, "is_active", True):
        return
    raise Forbidden("account_disabled", "Учётная запись отключена. Обратитесь к администратору.")
