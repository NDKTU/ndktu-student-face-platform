from datetime import date, datetime, time
from typing import Optional

from fastapi import Query
from pydantic import BaseModel
from sqlalchemy import Select
from sqlalchemy.sql import ColumnElement

from app.modules.employee.model import Employee
from app.modules.group.models.group import Group
from app.modules.quiz.models.quiz import Quiz
from app.modules.result.model import Result
from app.modules.teacher.model import Teacher


class StatsFilters(BaseModel):
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    faculty_id: Optional[int] = None
    group_id: Optional[int] = None
    subject_id: Optional[int] = None
    kafedra_id: Optional[int] = None


def stats_filters(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    faculty_id: Optional[int] = Query(None),
    group_id: Optional[int] = Query(None),
    subject_id: Optional[int] = Query(None),
    kafedra_id: Optional[int] = Query(None),
) -> StatsFilters:
    return StatsFilters(
        date_from=date_from,
        date_to=date_to,
        faculty_id=faculty_id,
        group_id=group_id,
        subject_id=subject_id,
        kafedra_id=kafedra_id,
    )


def apply_result_filters(
    stmt: Select,
    filters: StatsFilters,
    *,
    created_at_col: Optional[ColumnElement] = None,
) -> Select:
    """
    Append WHERE / JOIN clauses to a Result-anchored SELECT.

    The caller is expected to have Result in the FROM list. Joins to Group / Quiz
    are added on demand only when the matching filter is set, so filterless calls
    stay cheap.
    """
    ts_col = created_at_col if created_at_col is not None else Result.created_at

    if filters.date_from is not None:
        stmt = stmt.where(ts_col >= datetime.combine(filters.date_from, time.min))
    if filters.date_to is not None:
        stmt = stmt.where(ts_col <= datetime.combine(filters.date_to, time.max))

    if filters.group_id is not None:
        stmt = stmt.where(Result.group_id == filters.group_id)

    if filters.subject_id is not None:
        stmt = stmt.where(Result.subject_id == filters.subject_id)

    if filters.faculty_id is not None:
        stmt = stmt.join(Group, Group.id == Result.group_id).where(Group.faculty_id == filters.faculty_id)

    if filters.kafedra_id is not None:
        # Result -> Quiz -> User (creator) -> Employee -> Teacher.kafedra_id
        stmt = (
            stmt.join(Quiz, Quiz.id == Result.quiz_id)
            .join(Employee, Employee.user_id == Quiz.user_id)
            .join(Teacher, Teacher.employee_id == Employee.id)
            .where(Teacher.kafedra_id == filters.kafedra_id)
        )

    return stmt


def apply_date_filters(
    stmt: Select,
    filters: StatsFilters,
    created_at_col: ColumnElement,
) -> Select:
    """Apply only the date-range portion of filters against an arbitrary timestamp column."""
    if filters.date_from is not None:
        stmt = stmt.where(created_at_col >= datetime.combine(filters.date_from, time.min))
    if filters.date_to is not None:
        stmt = stmt.where(created_at_col <= datetime.combine(filters.date_to, time.max))
    return stmt
