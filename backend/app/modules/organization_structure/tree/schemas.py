from typing import Optional

from pydantic import BaseModel


class TreeGroup(BaseModel):
    id: int
    name: str
    kurs: Optional[int] = None
    position: int
    sardor_student_id: Optional[int] = None
    # Не список студентов, а их число. Состав группы приезжает отдельным
    # запросом при раскрытии карточки: на реальных данных это тысячи строк,
    # и дерево из-за них весило бы сотни килобайт на каждое открытие раздела.
    student_count: int


class TreeSpeciality(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    education_form: Optional[str] = None
    academic_year: Optional[str] = None
    position: int
    curriculum_count: int
    groups: list[TreeGroup]


class TreeKafedra(BaseModel):
    id: int
    name: str
    mudir_name: Optional[str] = None
    mudir_user_id: Optional[int] = None
    position: int
    teacher_count: int
    specialities: list[TreeSpeciality]


class TreeFaculty(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    dekan_name: Optional[str] = None
    dekan_user_id: Optional[int] = None
    color_bg: Optional[str] = None
    color_fg: Optional[str] = None
    position: int
    kafedras: list[TreeKafedra]
    # Группы факультета, не привязанные ни к одной специальности. Скрывать их
    # нельзя: они существуют, и в дереве их иначе было бы не найти.
    orphan_groups: list[TreeGroup]


class OrganizationTreeResponse(BaseModel):
    faculties: list[TreeFaculty]
