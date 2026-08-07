"""drop_academic_year_student_movement_yakuniy

Removes the AcademicYear/Semester, StudentMovement and Yakuniy modules and
their tables. Course.academic_year_id is dropped (Course.semester_number is
a plain int field, unrelated to the Semester model, and is kept). Quizzes.
semester_id was dropped from the ORM model without ever being backed by a
migration, so it is dropped here too before the semesters table.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-05 21:20:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint('courses_academic_year_id_fkey', 'courses', type_='foreignkey')
    op.drop_index('ix_courses_academic_year_id', table_name='courses')
    op.drop_column('courses', 'academic_year_id')

    op.drop_table('yakuniy')
    op.drop_table('student_movements')

    op.drop_constraint('quizzes_semester_id_fkey', 'quizzes', type_='foreignkey')
    op.drop_column('quizzes', 'semester_id')

    op.drop_table('semesters')
    op.drop_table('academic_years')


def downgrade() -> None:
    """Downgrade schema."""
    op.create_table(
        'academic_years',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=32), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', name='uq_academic_years_name'),
    )

    op.create_table(
        'semesters',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('academic_year_id', sa.Integer(), nullable=False),
        sa.Column('number', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['academic_year_id'], ['academic_years.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('academic_year_id', 'number', name='uq_semester_year_number'),
    )
    op.create_index('ix_semesters_academic_year_id', 'semesters', ['academic_year_id'], unique=False)

    op.add_column('quizzes', sa.Column('semester_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'quizzes_semester_id_fkey', 'quizzes', 'semesters', ['semester_id'], ['id'], ondelete='SET NULL'
    )

    op.create_table(
        'student_movements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('movement_type', sa.String(length=20), nullable=False),
        sa.Column('from_group_id', sa.Integer(), nullable=True),
        sa.Column('to_group_id', sa.Integer(), nullable=True),
        sa.Column('from_status', sa.String(length=50), nullable=True),
        sa.Column('to_status', sa.String(length=50), nullable=True),
        sa.Column('order_number', sa.String(length=100), nullable=True),
        sa.Column('order_date', sa.Date(), nullable=True),
        sa.Column('effective_date', sa.Date(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['from_group_id'], ['groups.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['to_group_id'], ['groups.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_student_movements_student_id', 'student_movements', ['student_id'], unique=False)

    op.create_table(
        'yakuniy',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('subject_id', sa.Integer(), nullable=False),
        sa.Column('grade', sa.Integer(), nullable=False),
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['subject_id'], ['subjects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.add_column('courses', sa.Column('academic_year_id', sa.Integer(), nullable=True))
    op.create_index('ix_courses_academic_year_id', 'courses', ['academic_year_id'], unique=False)
    op.create_foreign_key(
        'courses_academic_year_id_fkey', 'courses', 'academic_years', ['academic_year_id'], ['id'], ondelete='SET NULL'
    )
