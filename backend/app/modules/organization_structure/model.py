from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.model import Employee, Student, Teacher, User
    from app.modules.quiz.model import Quiz, Subject
    from app.modules.quiz.model import Result


class Faculty(Base, IdIntPk, TimestampMixin):
    __tablename__ = "faculties"
    name: Mapped[str] = mapped_column(String(50), unique=True)

    # Короткий код факультета. Приходит из HEMIS (`faculty.code`, например
    # «319-111») и служит стабильным идентификатором в отчётах: название
    # длинное и меняется, код — нет.
    code: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # Декан — ссылка на employees, а не на users. На users ссылаться нельзя:
    # учётка есть и у студента, и у админа, так что деканом можно было
    # назначить кого угодно, а имя оттуда всё равно не достать — оно живёт
    # в employees. Отдельной подписи рядом больше нет: имя берётся join'ом,
    # и переименование сотрудника сразу видно в карточке.
    #
    # unique: один человек не может быть деканом двух факультетов. Пересечение
    # «декан и заодно заведующий кафедрой» одним UNIQUE не выражается —
    # его по-прежнему ловит available_post в employee/repository.py.
    dekan_employee_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )

    # Цвет карточки факультета в дереве структуры. Задаётся вручную:
    # вычислять его из названия значило бы менять оформление при переименовании.
    color_bg: Mapped[str | None] = mapped_column(String(9), nullable=True)
    color_fg: Mapped[str | None] = mapped_column(String(9), nullable=True)

    # Порядок в интерфейсе. Сортировка по created_at ставила бы новые записи
    # в конец без возможности их переставить.
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    def __str__(self):
        return self.name

    # Группы к факультету напрямую больше не привязаны — путь к ним лежит
    # через kafedras → specialities → groups, и он единственный.
    kafedras: Mapped[list["Kafedra"]] = relationship("Kafedra", back_populates="faculty")


class Kafedra(Base, IdIntPk, TimestampMixin):
    __tablename__ = "kafedras"

    faculty_id: Mapped[int] = mapped_column(ForeignKey("faculties.id"))
    name: Mapped[str] = mapped_column(String(255), unique=True)

    # Заведующий кафедрой — по той же схеме, что декан у факультета.
    mudir_employee_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    faculty: Mapped["Faculty"] = relationship("Faculty", back_populates="kafedras")

    teachers: Mapped[list["Teacher"]] = relationship("Teacher", back_populates="kafedra")
    specialities: Mapped[list["Speciality"]] = relationship("Speciality", back_populates="kafedra")

    def __str__(self):
        return self.name


# Формы обучения. Sirtqi остаётся в словаре: заочное обучение в вузах
# Узбекистана прекращено, но записи прошлых лет должны читаться. Из выпадающих
# списков его убирает фронтенд, а не база.
#
# Дублируется как Literal в organization_structure/group/schemas.py — менять
# нужно оба места разом. Значение ENUM'а из типа не удалить (PostgreSQL этого
# не умеет), так что новое добавлять можно, а старое — только перестать
# предлагать.
EDUCATION_FORMS = ("Kunduzgi", "Kechki", "Masofaviy", "Sirtqi")

education_form_enum = Enum(*EDUCATION_FORMS, name="education_form")


class Group(Base, IdIntPk, TimestampMixin):
    __tablename__ = "groups"

    # RESTRICT, а не SET NULL: у группы есть студенты, и удаление специальности
    # не должно оставлять их в записи, которая ни к какому факультету больше не
    # относится. Раньше рядом лежал ещё faculty_id — второй, независимый путь к
    # факультету, который ничто не держало в согласии с этим: группу можно было
    # перевести на чужой факультет одним UPDATE, и дерево со списком групп
    # начинали отвечать по-разному.
    speciality_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("specialities.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), unique=True)

    # Форма обучения — свойство группы, а не студента и не специальности.
    # «8-24 ENI» — это кундузги-группа целиком; у специальности же форм может
    # быть несколько, а её name UNIQUE и двух строк под одно направление не даёт.
    education_form: Mapped[str | None] = mapped_column(education_form_enum, nullable=True)

    # Курс обучения (1..N). У выпущенных групп остаётся последним.
    kurs: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Староста. SET NULL, а не каскад: отчисление старосты не должно уносить
    # с собой группу. Ссылка на students, а не на users, — старостой бывает
    # только студент, и учётки у него может не быть.
    sardor_student_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("students.id", ondelete="SET NULL"), nullable=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    speciality: Mapped["Speciality"] = relationship("Speciality", back_populates="groups")
    # foreign_keys обязателен: между groups и students теперь две связи
    # (students.group_id и groups.sardor_student_id), и без указания
    # SQLAlchemy не знает, по какой из них строить состав группы.
    students: Mapped[list["Student"]] = relationship(
        "Student", back_populates="group", foreign_keys="Student.group_id"
    )

    quizzes: Mapped[list["Quiz"]] = relationship("Quiz", back_populates="group")

    results: Mapped[list["Result"]] = relationship("Result", back_populates="group")

    group_teachers: Mapped[list["GroupTeacher"]] = relationship(
        "GroupTeacher", back_populates="group", cascade="all, delete-orphan"
    )

    def __str__(self):
        return self.name


class GroupTeacher(Base, IdIntPk, TimestampMixin):
    __tablename__ = "group_teachers"
    __table_args__ = (UniqueConstraint("group_id", "teacher_id", name="idx_unique_group_teacher"),)

    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    group: Mapped["Group"] = relationship("Group", back_populates="group_teachers")
    teacher: Mapped["User"] = relationship("User", back_populates="group_teachers")

    def __str__(self):
        return f"{self.group_id} - {self.teacher_id}"


class Speciality(Base, IdIntPk, TimestampMixin):
    __tablename__ = "specialities"

    kafedra_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("kafedras.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    # Код направления по классификатору («60610100»).
    code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Формы обучения здесь нет: name UNIQUE, и одно направление не может
    # существовать сразу как кундузги и как сиртки. Форма живёт на группе.
    # Учебный год плана («2025/2026»), к которому относится curriculum.
    academic_year: Mapped[str | None] = mapped_column(String(16), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    kafedra: Mapped["Kafedra"] = relationship("Kafedra", back_populates="specialities")
    groups: Mapped[list["Group"]] = relationship("Group", back_populates="speciality")
    curriculum: Mapped[list["Curriculum"]] = relationship(
        "Curriculum",
        back_populates="speciality",
        cascade="all, delete-orphan",
        order_by="Curriculum.semester, Curriculum.position, Curriculum.id",
    )

    def __str__(self):
        return self.name


class Curriculum(Base, IdIntPk, TimestampMixin):
    """Строка учебного плана: один предмет в одном семестре специальности.

    Это отдельная сущность, а не связка Speciality↔Subject: у одного предмета
    в разных семестрах разное число кредитов и, как правило, разный ведущий.
    """

    __tablename__ = "curriculum"
    __table_args__ = (
        # Один и тот же предмет не может стоять в одном семестре дважды.
        UniqueConstraint(
            "speciality_id", "subject_id", "semester", name="idx_unique_curriculum_row"
        ),
    )

    speciality_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("specialities.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # RESTRICT: удаление фана, стоящего в чьём-то плане, должно быть осознанным.
    subject_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # Денормализованное название: план — это документ, и строка в нём должна
    # читаться даже после того, как справочник фанов переименовали.
    subject_name: Mapped[str] = mapped_column(String(255), nullable=False)

    semester: Mapped[int] = mapped_column(Integer, nullable=False)
    credit: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    teacher_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    teacher_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    speciality: Mapped["Speciality"] = relationship("Speciality", back_populates="curriculum")
    subject: Mapped["Subject | None"] = relationship("Subject")

    def __str__(self):
        return f"{self.subject_name} ({self.semester}-semestr)"


class Department(Base, IdIntPk, TimestampMixin):
    __tablename__ = "departments"

    name: Mapped[str] = mapped_column(String(255), unique=True)

    employees: Mapped[list["Employee"]] = relationship("Employee", back_populates="department")

    def __str__(self):
        return self.name
