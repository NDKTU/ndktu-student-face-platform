from dataclasses import dataclass
from datetime import date as date_type


@dataclass(frozen=True)
class SemesterPeriod:
    number: int
    start_date: date_type
    end_date: date_type


@dataclass(frozen=True)
class AcademicPeriod:
    name: str
    start_date: date_type
    end_date: date_type
    semesters: list[SemesterPeriod]
    active_number: int


def academic_period_for(today: date_type) -> AcademicPeriod:
    """Map a calendar date to the academic year (1 Sep -> 30 Jun) it belongs to.

    - Months 9-12 belong to the year that starts that September.
    - Months 1-6 belong to the year that started the previous September.
    - July-August (summer break) is mapped to the upcoming academic year.

    Semesters use fixed boundaries: 1 (1 Sep -> 31 Jan) and 2 (1 Feb -> 30 Jun).
    ``active_number`` is the semester whose range contains ``today``; during the
    summer gap it defaults to 1.
    """
    if today.month >= 9:
        start_year = today.year
    elif today.month <= 6:
        start_year = today.year - 1
    else:  # July / August — summer break, point at the upcoming year
        start_year = today.year

    end_year = start_year + 1

    semester_1 = SemesterPeriod(
        number=1,
        start_date=date_type(start_year, 9, 1),
        end_date=date_type(end_year, 1, 31),
    )
    semester_2 = SemesterPeriod(
        number=2,
        start_date=date_type(end_year, 2, 1),
        end_date=date_type(end_year, 6, 30),
    )

    if semester_1.start_date <= today <= semester_1.end_date:
        active_number = 1
    elif semester_2.start_date <= today <= semester_2.end_date:
        active_number = 2
    else:
        active_number = 1

    return AcademicPeriod(
        name=f"{start_year}-{end_year}",
        start_date=semester_1.start_date,
        end_date=semester_2.end_date,
        semesters=[semester_1, semester_2],
        active_number=active_number,
    )
