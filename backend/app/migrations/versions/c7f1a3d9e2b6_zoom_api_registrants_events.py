"""Zoom API: uchrashuv raqami, registrantlar va ishtirokchi hodisalari

Bekend uchrashuvni Zoom API orqali o'zi yaratadi (`zoom_managed`), talabani
registrant qiladi (`zoom_registrants`) va webhook orqali kim kirib-chiqqanini
yozadi (`zoom_participant_events`).

`zoom_meeting_id` eski seanslar uchun havoladan to'ldiriladi — webhook ular
uchun ham ishlaydi, agar uchrashuv shu Zoom akkauntida bo'lsa.

Revision ID: c7f1a3d9e2b6
Revises: d4a8e1c6b3f2
Create Date: 2026-10-10 12:00:00.000000

"""
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7f1a3d9e2b6"
down_revision: Union[str, Sequence[str], None] = "d4a8e1c6b3f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# `core/utils/zoom_link.py` bilan bir xil: migratsiya ilova kodiga bog'lanmaydi.
_DIGITS_RE = re.compile(r"^\d{9,11}$")
_PATH_NUMBER_RE = re.compile(r"/(?:j|w|s|wc(?:/join)?)/(\d{9,11})")


def _meeting_number(link: str) -> int | None:
    value = (link or "").strip()
    digits = value.replace(" ", "").replace("-", "")
    if _DIGITS_RE.match(digits):
        return int(digits)
    match = _PATH_NUMBER_RE.search(value)
    return int(match.group(1)) if match else None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("zoom_sessions", sa.Column("zoom_meeting_id", sa.BigInteger(), nullable=True))
    op.add_column(
        "zoom_sessions",
        sa.Column("zoom_managed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.create_index("ix_zoom_sessions_zoom_meeting_id", "zoom_sessions", ["zoom_meeting_id"])

    bind = op.get_bind()
    for session_id, link_url in bind.execute(sa.text("SELECT id, link_url FROM zoom_sessions")).all():
        number = _meeting_number(link_url)
        if number is not None:
            bind.execute(
                sa.text("UPDATE zoom_sessions SET zoom_meeting_id = :number WHERE id = :id"),
                {"number": number, "id": session_id},
            )

    op.create_table(
        "zoom_registrants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("zoom_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("registrant_id", sa.String(length=64), nullable=False),
        sa.Column("join_token", sa.String(length=512), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("session_id", "user_id", name="uq_zoom_registrant_session_user"),
    )
    op.create_index("ix_zoom_registrants_session_id", "zoom_registrants", ["session_id"])
    op.create_index("ix_zoom_registrants_registrant_id", "zoom_registrants", ["registrant_id"])

    op.create_table(
        "zoom_participant_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("zoom_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event", sa.String(length=10), nullable=False),
        sa.Column("participant_key", sa.String(length=128), nullable=False),
        sa.Column("participant_name", sa.String(length=255), nullable=True),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint(
            "session_id", "participant_key", "event", "occurred_at", name="uq_zoom_participant_event"
        ),
    )
    op.create_index("ix_zoom_participant_events_session_id", "zoom_participant_events", ["session_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("zoom_participant_events")
    op.drop_table("zoom_registrants")
    op.drop_index("ix_zoom_sessions_zoom_meeting_id", table_name="zoom_sessions")
    op.drop_column("zoom_sessions", "zoom_managed")
    op.drop_column("zoom_sessions", "zoom_meeting_id")
