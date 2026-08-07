"""assignment_material_id

Revision ID: 16eb5dc870b6
Revises: d1e4a7c93b02
Create Date: 2026-08-04 06:29:10.682071

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '16eb5dc870b6'
down_revision: Union[str, Sequence[str], None] = 'd1e4a7c93b02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Имя проставлено руками: autogenerate оставляет None, и тогда downgrade
# падает на drop_constraint(None). Формат — из naming_convention в config.py.
_FK_NAME = "fk_assignments_material_id_course_materials"


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('assignments', sa.Column('material_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_assignments_material_id'), 'assignments', ['material_id'], unique=False)
    # SET NULL, а не CASCADE: у задания висят сданные работы с оценками, и
    # удаление видеоурока не должно их уносить.
    op.create_foreign_key(
        _FK_NAME, 'assignments', 'course_materials', ['material_id'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(_FK_NAME, 'assignments', type_='foreignkey')
    op.drop_index(op.f('ix_assignments_material_id'), table_name='assignments')
    op.drop_column('assignments', 'material_id')
