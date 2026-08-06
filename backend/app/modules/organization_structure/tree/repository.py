from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.employee.model import Employee
from app.modules.auth.student.model import Student
from app.modules.auth.teacher.model import Teacher
from app.modules.organization_structure.curriculum.model import Curriculum
from app.modules.organization_structure.faculty.model import Faculty
from app.modules.organization_structure.group.model import Group
from app.modules.organization_structure.kafedra.model import Kafedra
from app.modules.organization_structure.speciality.model import Speciality

from .schemas import (
    OrganizationTreeResponse,
    TreeFaculty,
    TreeGroup,
    TreeKafedra,
    TreeSpeciality,
)


class OrganizationTreeRepository:
    """Полное дерево структуры одним ответом.

    Собирается пятью запросами — по одному на уровень плюс агрегаты, — а не
    обходом связей: на четырёх уровнях вложенности ленивая загрузка дала бы
    сотни запросов на одно открытие раздела.
    """

    async def build(self, session: AsyncSession) -> OrganizationTreeResponse:
        faculties = (
            (await session.execute(select(Faculty).order_by(Faculty.position, Faculty.id)))
            .scalars()
            .all()
        )
        kafedras = (
            (await session.execute(select(Kafedra).order_by(Kafedra.position, Kafedra.id)))
            .scalars()
            .all()
        )
        specialities = (
            (await session.execute(select(Speciality).order_by(Speciality.position, Speciality.id)))
            .scalars()
            .all()
        )
        groups = (
            (await session.execute(select(Group).order_by(Group.position, Group.id)))
            .scalars()
            .all()
        )

        students_per_group = dict(
            (
                await session.execute(
                    select(Student.group_id, func.count())
                    .where(Student.group_id.is_not(None))
                    .group_by(Student.group_id)
                )
            ).all()
        )
        teachers_per_kafedra = dict(
            (
                await session.execute(
                    select(Teacher.kafedra_id, func.count())
                    .where(Teacher.kafedra_id.is_not(None))
                    .group_by(Teacher.kafedra_id)
                )
            ).all()
        )
        curriculum_stats = {
            speciality_id: (count, credits or 0)
            for speciality_id, count, credits in (
                await session.execute(
                    select(
                        Curriculum.speciality_id,
                        func.count(),
                        func.sum(Curriculum.credit),
                    ).group_by(Curriculum.speciality_id)
                )
            ).all()
        }

        # ФИО деканов и заведующих — одной пачкой. Столбца-снимка под них
        # больше нет: он расходился с карточкой сотрудника после
        # переименования. Приём тот же, что для старост ниже, — не по одному
        # запросу на карточку.
        post_employee_ids = {
            *(f.dekan_employee_id for f in faculties if f.dekan_employee_id is not None),
            *(k.mudir_employee_id for k in kafedras if k.mudir_employee_id is not None),
        }
        post_names: dict[int, str] = {}
        if post_employee_ids:
            post_names = dict(
                (
                    await session.execute(
                        select(Employee.id, Employee.full_name).where(Employee.id.in_(post_employee_ids))
                    )
                ).all()
            )

        sardor_ids = [g.sardor_student_id for g in groups if g.sardor_student_id is not None]
        sardor_names = {}
        if sardor_ids:
            sardor_rows = (
                await session.execute(
                    select(Student.id, Student.full_name).where(Student.id.in_(sardor_ids))
                )
            ).all()
            sardor_names = dict(sardor_rows)

        def to_group(group: Group) -> TreeGroup:
            return TreeGroup(
                id=group.id,
                name=group.name,
                kurs=group.kurs,
                position=group.position,
                sardor_student_id=group.sardor_student_id,
                sardor_name=sardor_names.get(group.sardor_student_id),
                education_form=group.education_form,
                student_count=students_per_group.get(group.id, 0),
            )

        # speciality_id у группы обязателен, так что ветки «группа без
        # специальности» больше не существует — раскладываем всё разом.
        groups_by_speciality: dict[int, list[TreeGroup]] = defaultdict(list)
        for group in groups:
            groups_by_speciality[group.speciality_id].append(to_group(group))

        specialities_by_kafedra: dict[int, list[TreeSpeciality]] = defaultdict(list)
        for speciality in specialities:
            rows, credits = curriculum_stats.get(speciality.id, (0, 0))
            specialities_by_kafedra[speciality.kafedra_id].append(
                TreeSpeciality(
                    id=speciality.id,
                    name=speciality.name,
                    code=speciality.code,
                    academic_year=speciality.academic_year,
                    position=speciality.position,
                    curriculum_count=rows,
                    curriculum_credits=credits,
                    groups=groups_by_speciality.get(speciality.id, []),
                )
            )

        kafedras_by_faculty: dict[int, list[TreeKafedra]] = defaultdict(list)
        for kafedra in kafedras:
            kafedras_by_faculty[kafedra.faculty_id].append(
                TreeKafedra(
                    id=kafedra.id,
                    name=kafedra.name,
                    mudir_name=post_names.get(kafedra.mudir_employee_id),
                    mudir_employee_id=kafedra.mudir_employee_id,
                    position=kafedra.position,
                    teacher_count=teachers_per_kafedra.get(kafedra.id, 0),
                    specialities=specialities_by_kafedra.get(kafedra.id, []),
                )
            )

        return OrganizationTreeResponse(
            faculties=[
                TreeFaculty(
                    id=faculty.id,
                    name=faculty.name,
                    code=faculty.code,
                    dekan_name=post_names.get(faculty.dekan_employee_id),
                    dekan_employee_id=faculty.dekan_employee_id,
                    color_bg=faculty.color_bg,
                    color_fg=faculty.color_fg,
                    position=faculty.position,
                    kafedras=kafedras_by_faculty.get(faculty.id, []),
                )
                for faculty in faculties
            ]
        )


get_tree_repository = OrganizationTreeRepository()
