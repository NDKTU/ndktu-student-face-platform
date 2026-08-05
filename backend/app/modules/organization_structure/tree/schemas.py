from typing import Optional

from pydantic import BaseModel

from app.modules.organization_structure.group.schemas import EducationForm


class TreeGroup(BaseModel):
    id: int
    name: str
    kurs: Optional[int] = None
    position: int
    sardor_student_id: Optional[int] = None
    sardor_name: Optional[str] = None
    education_form: Optional[EducationForm] = None
    # Не список студентов, а их число. Состав группы приезжает отдельным
    # запросом при раскрытии карточки: на реальных данных это тысячи строк,
    # и дерево из-за них весило бы сотни килобайт на каждое открытие раздела.
    student_count: int


class TreeSpeciality(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    # Формы обучения здесь нет: у специальности name UNIQUE, и одно
    # направление не может существовать сразу в двух формах. Форма — на группе.
    academic_year: Optional[str] = None
    position: int
    curriculum_count: int
    # Сумма кредитов плана. Карточка специальности показывает её в списке,
    # а сами строки плана туда не едут — считать на клиенте было бы не из чего.
    curriculum_credits: int
    groups: list[TreeGroup]


class TreeKafedra(BaseModel):
    id: int
    name: str
    # Имя приходит join'ом из employees, отдельного столбца под него нет:
    # снимок имени расходился с карточкой сотрудника после переименования.
    mudir_name: Optional[str] = None
    mudir_employee_id: Optional[int] = None
    position: int
    teacher_count: int
    specialities: list[TreeSpeciality]


class TreeFaculty(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    dekan_name: Optional[str] = None
    dekan_employee_id: Optional[int] = None
    color_bg: Optional[str] = None
    color_fg: Optional[str] = None
    position: int
    # orphan_groups больше нет: speciality_id у группы обязателен, так что
    # группы без специальности невыразимы и теряться им негде.
    kafedras: list[TreeKafedra]


class OrganizationTreeResponse(BaseModel):
    faculties: list[TreeFaculty]
