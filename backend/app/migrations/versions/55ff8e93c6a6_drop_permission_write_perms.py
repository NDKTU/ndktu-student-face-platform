"""Bridge legacy deployments and remove obsolete permission write grants.

Some deployments were migrated on the former LMS feature branch and were
left stamped at this revision when that branch was not merged into ``main``.
Keeping the revision in the main migration graph lets those databases move
forward without discarding their data.

Revision ID: 55ff8e93c6a6
Revises: c8a3f0d2e517
Create Date: 2026-08-07 08:14:15.893791

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "55ff8e93c6a6"
down_revision: Union[str, Sequence[str], None] = "c8a3f0d2e517"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Remove permissions for API routes that no longer exist."""
    op.execute("DELETE FROM permissions WHERE name IN ('create:permission', 'update:permission', 'delete:permission')")


def downgrade() -> None:
    """Permission discovery recreates grants if the routes are restored."""
