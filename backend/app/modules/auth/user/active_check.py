"""Единая проверка того, что учётной записи разрешён вход.

Вынесена отдельно, чтобы все входы — локальный, студенческий Hemis и
сотруднический Hemis — отвечали на деактивацию одинаково.
"""

from fastapi import HTTPException, status


def ensure_user_active(user) -> None:
    if getattr(user, "is_active", True):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Учётная запись отключена. Обратитесь к администратору.",
    )
