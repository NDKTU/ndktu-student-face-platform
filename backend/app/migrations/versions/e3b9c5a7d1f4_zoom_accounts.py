"""Zoom: bir nechta akkaunt

Har akkauntda o'z ilovalari bor (S2S OAuth + Meeting SDK): nashr etilmagan
SDK ilovasi boshqa akkaunt uchrashuviga kirmaydi (Zoom xatosi 4011).
Seans o'z akkauntiga bog'lanadi; bo'sh qiymat — `.env` dagi kalitlar.

Revision ID: e3b9c5a7d1f4
Revises: c7f1a3d9e2b6
Create Date: 2026-10-11 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e3b9c5a7d1f4"
down_revision: Union[str, Sequence[str], None] = "c7f1a3d9e2b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "zoom_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False, unique=True),
        sa.Column("host_email", sa.String(length=255), nullable=True),
        sa.Column("api_account_id", sa.String(length=64), nullable=True),
        sa.Column("api_client_id", sa.String(length=128), nullable=True),
        sa.Column("api_client_secret_encrypted", sa.Text(), nullable=True),
        sa.Column("sdk_key", sa.String(length=128), nullable=False),
        sa.Column("sdk_secret_encrypted", sa.Text(), nullable=False),
        sa.Column("webhook_secret_encrypted", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_zoom_accounts_api_account_id", "zoom_accounts", ["api_account_id"])

    op.add_column(
        "zoom_sessions",
        sa.Column(
            "zoom_account_id",
            sa.Integer(),
            sa.ForeignKey("zoom_accounts.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.create_index("ix_zoom_sessions_zoom_account_id", "zoom_sessions", ["zoom_account_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_zoom_sessions_zoom_account_id", table_name="zoom_sessions")
    op.drop_column("zoom_sessions", "zoom_account_id")
    op.drop_index("ix_zoom_accounts_api_account_id", table_name="zoom_accounts")
    op.drop_table("zoom_accounts")
