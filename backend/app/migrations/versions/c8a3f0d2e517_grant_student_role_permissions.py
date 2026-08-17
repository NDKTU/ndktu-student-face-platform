"""grant student role permissions

Newly-created roles (via UserRepository.ensure_role, used by the Hemis
login flow) only get auto-granted "user:me" — everything else must be
assigned manually via the Roles/Permissions UI. No one had done that yet
for the "student" role, so every student-facing feature (quiz-taking,
results, psychology tests) 403'd. This backfills the permission set
students need, matching what the frontend now actually calls for them
(see the corresponding frontend fix: QuizTestPage uses the scoped
GET /quiz/active instead of the admin-style GET /quiz/, and ResultsPage
no longer fires the admin-only group/subject/quiz filter queries for
students) — so `read:quiz`, `read:group`, `read:subject` are deliberately
NOT granted here.

Idempotent: only inserts (role, permission) pairs that don't already
exist, and no-ops entirely if a "student" role doesn't exist yet in a
given environment (it's created lazily on first Hemis login).

Revision ID: c8a3f0d2e517
Revises: b2c3d4e5f6a7
Create Date: 2026-07-07 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c8a3f0d2e517"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STUDENT_PERMISSIONS = (
    "user:me",
    "read:active_quiz",
    "quiz_process:start_quiz",
    "quiz_process:submit_answer",
    "quiz_process:end_quiz",
    "read:result",
    "read:psychology",
    "create:psychology",
)


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id, created_at, updated_at)
        SELECT r.id, p.id, now(), now()
        FROM roles r
        JOIN permissions p ON p.name IN (
            'user:me', 'read:active_quiz', 'quiz_process:start_quiz',
            'quiz_process:submit_answer', 'quiz_process:end_quiz',
            'read:result', 'read:psychology', 'create:psychology'
        )
        WHERE lower(r.name) = 'student'
        AND NOT EXISTS (
            SELECT 1 FROM role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_id = p.id
        )
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        DELETE FROM role_permissions rp
        USING roles r, permissions p
        WHERE rp.role_id = r.id
        AND rp.permission_id = p.id
        AND lower(r.name) = 'student'
        AND p.name IN ({", ".join(f"'{name}'" for name in STUDENT_PERMISSIONS)})
        """
    )
