from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Student, Teacher
from app.modules.organization_structure.model import (
    Curriculum,
    Faculty,
    Group,
    Kafedra,
    Speciality,
)

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

        def to_group(group: Group) -> TreeGroup:
            return TreeGroup(
                id=group.id,
                name=group.name,
                kurs=group.kurs,
                position=group.position,
                sardor_student_id=group.sardor_student_id,
                student_count=students_per_group.get(group.id, 0),
            )

        groups_by_speciality: dict[int, list[TreeGroup]] = defaultdict(list)
        # Группа обязана принадлежать факультету, но specialityю — нет
        # (speciality_id nullable, SET NULL при удалении специальности).
        orphans_by_faculty: dict[int, list[TreeGroup]] = defaultdict(list)
        for group in groups:
            if group.speciality_id is None:
                orphans_by_faculty[group.faculty_id].append(to_group(group))
            else:
                groups_by_speciality[group.speciality_id].append(to_group(group))

        specialities_by_kafedra: dict[int, list[TreeSpeciality]] = defaultdict(list)
        for speciality in specialities:
            rows, credits = curriculum_stats.get(speciality.id, (0, 0))
            specialities_by_kafedra[speciality.kafedra_id].append(
                TreeSpeciality(
                    id=speciality.id,
                    name=speciality.name,
                    code=speciality.code,
                    education_form=speciality.education_form,
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
                    mudir_name=kafedra.mudir_name,
                    mudir_user_id=kafedra.mudir_user_id,
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
                    dekan_name=faculty.dekan_name,
                    dekan_user_id=faculty.dekan_user_id,
                    color_bg=faculty.color_bg,
                    color_fg=faculty.color_fg,
                    position=faculty.position,
                    kafedras=kafedras_by_faculty.get(faculty.id, []),
                    orphan_groups=orphans_by_faculty.get(faculty.id, []),
                )
                for faculty in faculties
            ]
        )


get_tree_repository = OrganizationTreeRepository()
