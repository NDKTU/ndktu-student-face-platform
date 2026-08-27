"""Студенту — право читать разбор своих ответов

Кнопка «Javoblarni ko'rish» ведёт на страницу, закрытую правом
``user_answers:read``, а роли ``student`` его не выдавали — студент нажимал и
не получал ничего.

Право безопасно ровно потому, что эндпоинт ``GET /user_answers/`` сужает
выборку до собственных ответов запрашивающего: без этого сужения любой студент
открыл бы чужую работу, поменяв ``user_id`` в адресе.

Идемпотентна и ничего не делает, если роли ``student`` в окружении ещё нет —
она создаётся при первом входе через Hemis.

Revision ID: c7e1a9d4b283
Revises: a3f8b1c9d2e5
"""

from typing import Sequence, Union

from alembic import op

revision: str = "c7e1a9d4b283"
down_revision: Union[str, Sequence[str], None] = "a3f8b1c9d2e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at)
        SELECT r.id, p.id, now(), now()
        FROM roles r
        JOIN permissions p ON p.name = 'user_answers:read'
        WHERE lower(r.name) = 'student'
        AND NOT EXISTS (
            SELECT 1 FROM role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_id = p.id
        )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permissions rp
        USING roles r, permissions p
        WHERE rp.role_id = r.id
          AND rp.permission_id = p.id
          AND lower(r.name) = 'student'
          AND p.name = 'user_answers:read'
        """
    )
