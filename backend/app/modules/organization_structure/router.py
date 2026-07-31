import logging

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User
from app.modules.auth.student.repository import student_repository
from app.modules.auth.student.schemas import StudentListRequest, StudentListResponse

from .curriculum.repository import get_curriculum_repository
from .curriculum.schemas import (
    CurriculumCreateRequest,
    CurriculumListRequest,
    CurriculumListResponse,
    CurriculumReorderRequest,
    CurriculumResponse,
    CurriculumUpdateRequest,
)
from .department.repository import get_department_repository
from .department.schemas import (
    DepartmentCreateRequest,
    DepartmentListRequest,
    DepartmentListResponse,
    DepartmentResponse,
    DepartmentUpdateRequest,
)
from .faculty.repository import get_faculty_repository
from .faculty.schemas import (
    FacultyCreateRequest,
    FacultyUpdateRequest,
    FacultyCreateResponse,
    FacultyListRequest,
    FacultyListResponse,
)
from .group.repository import get_group_repository
from .group.schemas import (
    GroupCreateRequest,
    GroupCreateResponse,
    GroupListRequest,
    GroupListResponse,
)
from .kafedra.repository import get_kafedra_repository
from .kafedra.schemas import (
    KafedraCreateRequest,
    KafedraUpdateRequest,
    KafedraCreateResponse,
    KafedraListRequest,
    KafedraListResponse,
)
from .speciality.repository import get_speciality_repository
from .tree.repository import get_tree_repository
from .tree.schemas import OrganizationTreeResponse
from .speciality.schemas import (
    SpecialityCreateRequest,
    SpecialityListRequest,
    SpecialityListResponse,
    SpecialityResponse,
    SpecialityUpdateRequest,
)

logger = logging.getLogger(__name__)


# ============================================================================
#  FACULTY
# ============================================================================
faculty_router = APIRouter(
    tags=["Faculty"],
    prefix="/faculty",
)


@faculty_router.post(
    "/",
    response_model=FacultyCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_faculty(
    data: FacultyCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:faculty")),
):
    result = await get_faculty_repository.create_faculty(session=session, data=data)
    return result


@faculty_router.get("/{faculty_id}", response_model=FacultyCreateResponse)
async def get_faculty(
    faculty_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:faculty")),
):
    return await get_faculty_repository.get_faculty(session=session, faculty_id=faculty_id)


@faculty_router.get("/", response_model=FacultyListResponse)
async def list_faculties(
    data: FacultyListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:faculty")),
):
    return await get_faculty_repository.list_faculties(session=session, request=data)


@faculty_router.put(
    "/{faculty_id}",
    response_model=FacultyCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_faculty(
    faculty_id: int,
    data: FacultyUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:faculty")),
):
    result = await get_faculty_repository.update_faculty(session=session, faculty_id=faculty_id, data=data)
    return result


@faculty_router.delete(
    "/{faculty_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_faculty(
    faculty_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:faculty")),
):
    await get_faculty_repository.delete_faculty(session=session, faculty_id=faculty_id, force=force)


# ============================================================================
#  KAFEDRA
# ============================================================================
kafedra_router = APIRouter(
    tags=["Kafedra"],
    prefix="/kafedra",
)


@kafedra_router.post(
    "/",
    response_model=KafedraCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_kafedra(
    data: KafedraCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:kafedra")),
):
    result = await get_kafedra_repository.create_kafedra(session=session, data=data)
    return result


@kafedra_router.get("/{kafedra_id}", response_model=KafedraCreateResponse)
async def get_kafedra(
    kafedra_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:kafedra")),
):
    return await get_kafedra_repository.get_kafedra(session=session, kafedra_id=kafedra_id)


@kafedra_router.get("/", response_model=KafedraListResponse)
async def list_kafedras(
    data: KafedraListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:kafedra")),
):
    return await get_kafedra_repository.list_kafedras(session=session, request=data)


@kafedra_router.put(
    "/{kafedra_id}",
    response_model=KafedraCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_kafedra(
    kafedra_id: int,
    data: KafedraUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:kafedra")),
):
    result = await get_kafedra_repository.update_kafedra(session=session, kafedra_id=kafedra_id, data=data)
    return result


@kafedra_router.delete(
    "/{kafedra_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_kafedra(
    kafedra_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:kafedra")),
):
    await get_kafedra_repository.delete_kafedra(session=session, kafedra_id=kafedra_id, force=force)


# ============================================================================
#  GROUP
# ============================================================================
group_router = APIRouter(
    tags=["Group"],
    prefix="/group",
)


@group_router.post(
    "/",
    response_model=GroupCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_group(
    data: GroupCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:group")),
):
    result = await get_group_repository.create_group(session=session, data=data)
    return result


@group_router.get("/{group_id}", response_model=GroupCreateResponse)
async def get_group(
    group_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:group")),
):
    return await get_group_repository.get_group(session=session, group_id=group_id)


@group_router.get("/", response_model=GroupListResponse)
async def list_groups(
    data: GroupListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:group")),
):
    return await get_group_repository.list_groups(session=session, request=data, current_user=current_user)


@group_router.get("/{group_id}/students", response_model=StudentListResponse)
async def get_group_students(
    group_id: int,
    page: int = 1,
    limit: int = 100,
    search: str | None = None,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:student")),
):
    """Return all students belonging to the specified group."""
    request = StudentListRequest(page=page, limit=limit, search=search, group_id=group_id)
    return await student_repository.list_students(session=session, request=request)


@group_router.put(
    "/{group_id}",
    response_model=GroupCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_group(
    group_id: int,
    data: GroupCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:group")),
):
    result = await get_group_repository.update_group(session=session, group_id=group_id, data=data)
    return result


@group_router.delete(
    "/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_group(
    group_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:group")),
):
    await get_group_repository.delete_group(session=session, group_id=group_id, force=force)


@group_router.get("/{group_id}/delete-info")
async def get_group_delete_info(
    group_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:group")),
):
    """Returns counts of related data affected when this group is deleted."""
    from sqlalchemy import func, select

    from app.modules.auth.model import Student
    from app.modules.quiz.model import Result

    student_count = (
        await session.execute(select(func.count()).select_from(Student).where(Student.group_id == group_id))
    ).scalar() or 0
    result_count = (
        await session.execute(select(func.count()).select_from(Result).where(Result.group_id == group_id))
    ).scalar() or 0
    return {"students_count": student_count, "results_count": result_count}


# ============================================================================
#  SPECIALITY
# ============================================================================
speciality_router = APIRouter(
    tags=["Speciality"],
    prefix="/speciality",
)


@speciality_router.post(
    "/",
    response_model=SpecialityResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_speciality(
    data: SpecialityCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:speciality")),
):
    return await get_speciality_repository.create_speciality(session=session, data=data)


@speciality_router.get("/", response_model=SpecialityListResponse)
async def list_specialities(
    data: SpecialityListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:speciality")),
):
    return await get_speciality_repository.list_specialities(session=session, request=data)


@speciality_router.get("/{speciality_id}", response_model=SpecialityResponse)
async def get_speciality(
    speciality_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:speciality")),
):
    return await get_speciality_repository.get_speciality(session=session, speciality_id=speciality_id)


@speciality_router.put(
    "/{speciality_id}",
    response_model=SpecialityResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_speciality(
    speciality_id: int,
    data: SpecialityUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:speciality")),
):
    return await get_speciality_repository.update_speciality(
        session=session, speciality_id=speciality_id, data=data
    )


@speciality_router.delete(
    "/{speciality_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_speciality(
    speciality_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:speciality")),
):
    await get_speciality_repository.delete_speciality(session=session, speciality_id=speciality_id)


# ============================================================================
#  DEPARTMENT
# ============================================================================
department_router = APIRouter(
    tags=["Department"],
    prefix="/department",
)


@department_router.post(
    "/",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_department(
    data: DepartmentCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:department")),
):
    return await get_department_repository.create_department(session=session, data=data)


@department_router.get("/{department_id}", response_model=DepartmentResponse)
async def get_department(
    department_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:department")),
):
    return await get_department_repository.get_department(session=session, department_id=department_id)


@department_router.get("/", response_model=DepartmentListResponse)
async def list_departments(
    data: DepartmentListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:department")),
):
    return await get_department_repository.list_departments(session=session, request=data)


@department_router.put(
    "/{department_id}",
    response_model=DepartmentResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_department(
    department_id: int,
    data: DepartmentUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:department")),
):
    return await get_department_repository.update_department(
        session=session, department_id=department_id, data=data
    )


@department_router.delete(
    "/{department_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_department(
    department_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:department")),
):
    await get_department_repository.delete_department(session=session, department_id=department_id)



# ============================================================================
#  CURRICULUM (o'quv reja)
# ============================================================================
curriculum_router = APIRouter(
    tags=["Curriculum"],
    prefix="/curriculum",
)


@curriculum_router.post(
    "/",
    response_model=CurriculumResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def create_curriculum_row(
    data: CurriculumCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:curriculum")),
):
    return await get_curriculum_repository.create_row(session=session, data=data)


@curriculum_router.get("/", response_model=CurriculumListResponse)
async def list_curriculum(
    data: CurriculumListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:curriculum")),
):
    return await get_curriculum_repository.list_rows(session=session, request=data)


@curriculum_router.put(
    "/reorder",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def reorder_curriculum(
    data: CurriculumReorderRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:curriculum")),
):
    """Порядок строк внутри семестра. Объявлен до /{row_id}, иначе «reorder»
    попал бы в него как идентификатор."""
    await get_curriculum_repository.reorder(session=session, ids=data.ids)
    return {"message": "Reordered"}


@curriculum_router.delete(
    "/",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def clear_curriculum(
    speciality_id: int,
    semester: int | None = None,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:curriculum")),
):
    """Очистка плана специальности целиком или одного её семестра."""
    deleted = await get_curriculum_repository.clear(
        session=session, speciality_id=speciality_id, semester=semester
    )
    return {"deleted": deleted}


@curriculum_router.get("/{row_id}", response_model=CurriculumResponse)
async def get_curriculum_row(
    row_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:curriculum")),
):
    return await get_curriculum_repository.get_row(session=session, row_id=row_id)


@curriculum_router.put(
    "/{row_id}",
    response_model=CurriculumResponse,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def update_curriculum_row(
    row_id: int,
    data: CurriculumUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:curriculum")),
):
    return await get_curriculum_repository.update_row(session=session, row_id=row_id, data=data)


@curriculum_router.delete(
    "/{row_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def delete_curriculum_row(
    row_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:curriculum")),
):
    await get_curriculum_repository.delete_row(session=session, row_id=row_id)



# ============================================================================
#  ORGANIZATION TREE
# ============================================================================
tree_router = APIRouter(
    tags=["Organization"],
    prefix="/organization",
)


@tree_router.get("/tree", response_model=OrganizationTreeResponse)
async def get_organization_tree(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:faculty")),
):
    """Факультеты -> кафедры -> специальности -> группы одним ответом.

    Право переиспользуем: своё имя означало бы, что после выката его придётся
    руками выдавать каждой роли, хотя дерево показывает ровно то, на что уже
    есть read:faculty.
    """
    return await get_tree_repository.build(session=session)


# ============================================================================
#  AGGREGATE ROUTER
# ============================================================================
router = APIRouter()
router.include_router(faculty_router)
router.include_router(kafedra_router)
router.include_router(group_router)
router.include_router(speciality_router)
router.include_router(curriculum_router)
router.include_router(tree_router)
router.include_router(department_router)
