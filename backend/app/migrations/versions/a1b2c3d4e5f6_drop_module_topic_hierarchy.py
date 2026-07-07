"""drop_module_topic_hierarchy

Removes the Module/Topic course-structure layer. Course now goes directly
Course -> Lesson -> Resource (one-to-many at each level); Module/Topic
proved to be unnecessary intermediate structure for now.

Revision ID: a1b2c3d4e5f6
Revises: 5ce668fe2e49
Create Date: 2026-07-05 20:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '5ce668fe2e49'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint('assignments_topic_id_fkey', 'assignments', type_='foreignkey')
    op.drop_index('ix_assignments_topic_id', table_name='assignments')
    op.drop_column('assignments', 'topic_id')

    op.drop_constraint('fk_lessons_topic_id', 'lessons', type_='foreignkey')
    op.drop_index('ix_lessons_topic_id', table_name='lessons')
    op.drop_column('lessons', 'topic_id')

    op.drop_table('course_topics')
    op.drop_table('course_modules')


def downgrade() -> None:
    """Downgrade schema."""
    op.create_table(
        'course_modules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_course_modules_course_id', 'course_modules', ['course_id'], unique=False)

    op.create_table(
        'course_topics',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('module_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('hours', sa.Integer(), nullable=True),
        sa.Column('learning_outcomes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['module_id'], ['course_modules.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_course_topics_module_id', 'course_topics', ['module_id'], unique=False)

    op.add_column('lessons', sa.Column('topic_id', sa.Integer(), nullable=True))
    op.create_index('ix_lessons_topic_id', 'lessons', ['topic_id'], unique=False)
    op.create_foreign_key(
        'fk_lessons_topic_id', 'lessons', 'course_topics', ['topic_id'], ['id'], ondelete='SET NULL'
    )

    op.add_column('assignments', sa.Column('topic_id', sa.Integer(), nullable=True))
    op.create_index('ix_assignments_topic_id', 'assignments', ['topic_id'], unique=False)
    op.create_foreign_key(
        'assignments_topic_id_fkey', 'assignments', 'course_topics', ['topic_id'], ['id'], ondelete='SET NULL'
    )
