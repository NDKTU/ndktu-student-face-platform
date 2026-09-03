import logging

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired, user_has_permission
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schemas import VisibilityRequest
from app.core.utils.visibility import set_hidden
from app.modules.auth.model import User
from app.modules.auth.student.repository import student_repository
from app.modules.auth.student.schemas import StudentListRequest, StudentListResponse
from app.modules.organization_structure.model import Faculty, Group, Kafedra, Speciality

from .faculty.repository import get_faculty_repository
from .faculty.schemas import (
    FacultyCreateRequest,
    FacultyCreateResponse,
    FacultyListRequest,
    FacultyListResponse,
    FacultyStatsResponse,
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
    KafedraCreateResponse,
    KafedraListRequest,
    KafedraListResponse,
    KafedraStatsResponse,
)
from .speciality.repository import get_speciality_repository
from .speciality.schemas import (
    SpecialityCreateRequest,
    SpecialityListRequest,
    SpecialityListResponse,
    SpecialityResponse,
    SpecialityStatsResponse,
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


# Объявлен до "/{faculty_id}", иначе "stats" распарсился бы как faculty_id
@faculty_router.get("/stats", response_model=FacultyStatsResponse)
async def get_faculty_stats(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:faculty")),
):
    return await get_faculty_repository.get_faculty_stats(session=session)


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
    current_user: User = Depends(PermissionRequired("read:faculty")),
):
    return await get_faculty_repository.list_faculties(session=session, request=data, current_user=current_user)


@faculty_router.put(
    "/{faculty_id}",
    response_model=FacultyCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_faculty(
    faculty_id: int,
    data: FacultyCreateRequest,
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


@kafedra_router.get("/stats", response_model=KafedraStatsResponse)
async def get_kafedra_stats(
    faculty_id: int | None = None,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:kafedra")),
):
    return await get_kafedra_repository.get_kafedra_stats(session=session, faculty_id=faculty_id)


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
    current_user: User = Depends(PermissionRequired("read:kafedra")),
):
    return await get_kafedra_repository.list_kafedras(session=session, request=data, current_user=current_user)


@kafedra_router.put(
    "/{kafedra_id}",
    response_model=KafedraCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_kafedra(
    kafedra_id: int,
    data: KafedraCreateRequest,
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
    current_user: User = Depends(PermissionRequired("read:group")),
):
    """Guruh talabalari.

    Huquq ikki bosqichli. `read:student` bo'lgan foydalanuvchi (admin yoki
    huquq berilgani) istalgan guruhni ochadi. Bo'lmasa — faqat o'ziga
    biriktirilgan guruh: guruhlar ro'yxati o'qituvchi uchun allaqachon shunday
    cheklangan, ochilmaydigan qator ko'rsatish esa mantiqsiz bo'lardi.
    """
    if not await user_has_permission(session, current_user, "read:student"):
        if not await get_group_repository.is_group_assigned_to_user(session, current_user, group_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: group is not assigned to you",
            )

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


@speciality_router.get("/stats", response_model=SpecialityStatsResponse)
async def get_speciality_stats(
    kafedra_id: int | None = None,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:speciality")),
):
    return await get_speciality_repository.get_speciality_stats(session=session, kafedra_id=kafedra_id)


@speciality_router.get("/", response_model=SpecialityListResponse)
async def list_specialities(
    data: SpecialityListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:speciality")),
):
    return await get_speciality_repository.list_specialities(session=session, request=data, current_user=current_user)


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
    return await get_speciality_repository.update_speciality(session=session, speciality_id=speciality_id, data=data)


@speciality_router.delete(
    "/{speciality_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_speciality(
    speciality_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:speciality")),
):
    await get_speciality_repository.delete_speciality(session=session, speciality_id=speciality_id, force=force)


# ============================================================================
#  AGGREGATE ROUTER
# ============================================================================
router = APIRouter()
@faculty_router.patch("/{faculty_id}/visibility", status_code=status.HTTP_200_OK)
async def set_faculty_visibility(
    faculty_id: int,
    data: VisibilityRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("update:faculty")),
):
    """Fakultetni boshqa rollardan yashiradi yoki qaytaradi. Faqat admin.

    Yashirilgan yozuv roʻyxatlarda ham, tanlov oynalarida ham koʻrinmaydi,
    lekin unga bogʻlangan eski maʼlumot ishlayveradi: oʻtgan natijalar
    ochiladi, boshlangan test toʻxtamaydi.
    """
    row = await set_hidden(session, Faculty, faculty_id, data.is_hidden, current_user, "Fakultet")
    return {"id": row.id, "is_hidden": row.is_hidden}


@kafedra_router.patch("/{kafedra_id}/visibility", status_code=status.HTTP_200_OK)
async def set_kafedra_visibility(
    kafedra_id: int,
    data: VisibilityRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("update:kafedra")),
):
    """Kafedrani boshqa rollardan yashiradi yoki qaytaradi. Faqat admin.

    Yashirilgan yozuv roʻyxatlarda ham, tanlov oynalarida ham koʻrinmaydi,
    lekin unga bogʻlangan eski maʼlumot ishlayveradi: oʻtgan natijalar
    ochiladi, boshlangan test toʻxtamaydi.
    """
    row = await set_hidden(session, Kafedra, kafedra_id, data.is_hidden, current_user, "Kafedra")
    return {"id": row.id, "is_hidden": row.is_hidden}


@group_router.patch("/{group_id}/visibility", status_code=status.HTTP_200_OK)
async def set_group_visibility(
    group_id: int,
    data: VisibilityRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("update:group")),
):
    """Guruhni boshqa rollardan yashiradi yoki qaytaradi. Faqat admin.

    Yashirilgan yozuv roʻyxatlarda ham, tanlov oynalarida ham koʻrinmaydi,
    lekin unga bogʻlangan eski maʼlumot ishlayveradi: oʻtgan natijalar
    ochiladi, boshlangan test toʻxtamaydi.
    """
    row = await set_hidden(session, Group, group_id, data.is_hidden, current_user, "Guruh")
    return {"id": row.id, "is_hidden": row.is_hidden}


@speciality_router.patch("/{speciality_id}/visibility", status_code=status.HTTP_200_OK)
async def set_speciality_visibility(
    speciality_id: int,
    data: VisibilityRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("update:speciality")),
):
    """Mutaxassislikni boshqa rollardan yashiradi yoki qaytaradi. Faqat admin.

    Yashirilgan yozuv roʻyxatlarda ham, tanlov oynalarida ham koʻrinmaydi,
    lekin unga bogʻlangan eski maʼlumot ishlayveradi: oʻtgan natijalar
    ochiladi, boshlangan test toʻxtamaydi.
    """
    row = await set_hidden(session, Speciality, speciality_id, data.is_hidden, current_user, "Mutaxassislik")
    return {"id": row.id, "is_hidden": row.is_hidden}


router.include_router(faculty_router)
router.include_router(kafedra_router)
router.include_router(group_router)
router.include_router(speciality_router)
