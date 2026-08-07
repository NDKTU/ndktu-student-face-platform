"""Текущий пользователь со всеми связями, которые нужны `/user/me`.

Отдельно от `PermissionRequired`: тот грузит только `roles`, а `UserMeResponse`
отдаёт ещё права ролей, сотрудника с кафедрой и студента с группой. Обе
зависимости идут через `get_current_user_id`, а FastAPI кэширует зависимость в
пределах запроса — поэтому сессия валидируется и idle-TTL продлевается ровно
один раз, а не дважды, как было при отдельном параметре `Header(...)`.
"""

from core.database.db_helper import db_helper
from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies.role_checker import get_current_user_id
from app.modules.auth.employee.model import Employee
from app.modules.auth.role.model import Role
from app.modules.auth.student.model import Student
from app.modules.auth.teacher.model import Teacher
from app.modules.auth.user.model import User


async def get_current_user_full(
    user_id: int = Depends(get_current_user_id),
    session: AsyncSession = Depends(db_helper.session_getter),
) -> User:
    stmt = (
        select(User)
        .where(User.id == user_id)
        .options(
            selectinload(User.roles).selectinload(Role.permissions),
            selectinload(User.employee).selectinload(Employee.teacher).selectinload(Teacher.kafedra),
            selectinload(User.student).selectinload(Student.group),
        )
    )
    user = (await session.execute(stmt)).scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    return user
