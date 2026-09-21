import logging

from core.database.db_helper import db_helper
from core.dependencies.role_checker import (
    PermissionRequired,
    PermissionRequiredExceptTeacher,
    user_has_permission,
)
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

# Yashirish funksiyasi kommentga olindi (2026-09-11) — quyidagi importlar endi kerak emas.
# from app.core.schemas import VisibilityRequest
# from app.core.utils.visibility import set_hidden
from app.modules.auth.model import User
from app.modules.auth.student.repository import student_repository
from app.modules.auth.student.schemas import StudentListRequest, StudentListResponse
# from app.modules.organization_structure.model import Curriculum, Faculty, Group, Kafedra, Speciality

from .faculty.repository import get_faculty_repository
from .faculty.schemas import (
#    FacultyCreateRequest,
    FacultyCreateResponse,
    FacultyListRequest,
    FacultyListResponse,
    FacultyStatsResponse,
)
from .group.merge import group_merge_service
from .group.repository import get_group_repository
from .group.schemas import (
#    GroupCreateRequest,
    GroupCreateResponse,
    GroupDuplicatePreview,
    GroupListRequest,
    GroupListResponse,
    GroupMergeRequest,
    GroupMergeResponse,
)
from .kafedra.repository import get_kafedra_repository
from .kafedra.schemas import (
#    KafedraCreateRequest,
    KafedraCreateResponse,
    KafedraListRequest,
    KafedraListResponse,
    KafedraStatsResponse,
)
from .curriculum.repository import get_curriculum_repository
from .curriculum.schemas import (
    CurriculumListRequest,
    CurriculumListResponse,
    CurriculumResponse,
)
from .speciality.repository import get_speciality_repository
from .speciality.schemas import (
#    SpecialityCreateRequest,
    SpecialityListRequest,
    SpecialityListResponse,
    SpecialityResponse,
    SpecialityStatsResponse,
#    SpecialityUpdateRequest,
)

logger = logging.getLogger(__name__)


# ============================================================================
#  FACULTY
# ============================================================================
faculty_router = APIRouter(
    tags=["Faculty"],
    prefix="/faculty",
)


# EPOS/HEMIS bilan boshqariladigan maʼlumot: bu endpoint 2026-09-11 da
# kommentga olindi — entity platformada yaratilmaydi, oʻzgartirilmaydi va
# oʻchirilmaydi. Qaytarish kerak boʻlsa — kommentni olib tashlash kifoya.
# @faculty_router.post(
#     "/",
#     response_model=FacultyCreateResponse,
#     status_code=status.HTTP_201_CREATED,
#     dependencies=[Depends(RateLimiter(times=5, seconds=60))],
# )
# async def create_faculty(
#     data: FacultyCreateRequest,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     _: PermissionRequired = Depends(PermissionRequired("create:faculty")),
# ):
#     result = await get_faculty_repository.create_faculty(session=session, data=data)
#     return result


# Объявлен до "/{faculty_id}", иначе "stats" распарсился бы как faculty_id
@faculty_router.get("/stats", response_model=FacultyStatsResponse)
async def get_faculty_stats(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequiredExceptTeacher("read:faculty")),
):
    return await get_faculty_repository.get_faculty_stats(session=session)


@faculty_router.get("/{faculty_id}", response_model=FacultyCreateResponse)
async def get_faculty(
    faculty_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequiredExceptTeacher("read:faculty")),
):
    return await get_faculty_repository.get_faculty(session=session, faculty_id=faculty_id)


@faculty_router.get("/", response_model=FacultyListResponse)
async def list_faculties(
    data: FacultyListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequiredExceptTeacher("read:faculty")),
):
    return await get_faculty_repository.list_faculties(session=session, request=data, current_user=current_user)


# EPOS/HEMIS bilan boshqariladigan maʼlumot: bu endpoint 2026-09-11 da
# kommentga olindi — entity platformada yaratilmaydi, oʻzgartirilmaydi va
# oʻchirilmaydi. Qaytarish kerak boʻlsa — kommentni olib tashlash kifoya.
# @faculty_router.put(
#     "/{faculty_id}",
#     response_model=FacultyCreateResponse,
#     dependencies=[Depends(RateLimiter(times=5, seconds=60))],
# )
# async def update_faculty(
#     faculty_id: int,
#     data: FacultyCreateRequest,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     _: PermissionRequired = Depends(PermissionRequired("update:faculty")),
# ):
#     result = await get_faculty_repository.update_faculty(session=session, faculty_id=faculty_id, data=data)
#     return result


# EPOS/HEMIS bilan boshqariladigan maʼlumot: bu endpoint 2026-09-11 da
# kommentga olindi — entity platformada yaratilmaydi, oʻzgartirilmaydi va
# oʻchirilmaydi. Qaytarish kerak boʻlsa — kommentni olib tashlash kifoya.
# @faculty_router.delete(
#     "/{faculty_id}",
#     status_code=status.HTTP_204_NO_CONTENT,
#     dependencies=[Depends(RateLimiter(times=5, seconds=60))],
# )
# async def delete_faculty(
#     faculty_id: int,
#     force: bool = False,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     _: PermissionRequired = Depends(PermissionRequired("delete:faculty")),
# ):
#     await get_faculty_repository.delete_faculty(session=session, faculty_id=faculty_id, force=force)


# ============================================================================
#  KAFEDRA
# ============================================================================
kafedra_router = APIRouter(
    tags=["Kafedra"],
    prefix="/kafedra",
)


# EPOS/HEMIS bilan boshqariladigan maʼlumot: bu endpoint 2026-09-11 da
# kommentga olindi — entity platformada yaratilmaydi, oʻzgartirilmaydi va
# oʻchirilmaydi. Qaytarish kerak boʻlsa — kommentni olib tashlash kifoya.
# @kafedra_router.post(
#     "/",
#     response_model=KafedraCreateResponse,
#     status_code=status.HTTP_201_CREATED,
#     dependencies=[Depends(RateLimiter(times=5, seconds=60))],
# )
# async def create_kafedra(
#     data: KafedraCreateRequest,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     _: PermissionRequired = Depends(PermissionRequired("create:kafedra")),
# ):
#     result = await get_kafedra_repository.create_kafedra(session=session, data=data)
#     return result


@kafedra_router.get("/stats", response_model=KafedraStatsResponse)
async def get_kafedra_stats(
    faculty_id: int | None = None,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequiredExceptTeacher("read:kafedra")),
):
    return await get_kafedra_repository.get_kafedra_stats(session=session, faculty_id=faculty_id)


@kafedra_router.get("/{kafedra_id}", response_model=KafedraCreateResponse)
async def get_kafedra(
    kafedra_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequiredExceptTeacher("read:kafedra")),
):
    return await get_kafedra_repository.get_kafedra(session=session, kafedra_id=kafedra_id)


@kafedra_router.get("/", response_model=KafedraListResponse)
async def list_kafedras(
    data: KafedraListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequiredExceptTeacher("read:kafedra")),
):
    return await get_kafedra_repository.list_kafedras(session=session, request=data, current_user=current_user)


# EPOS/HEMIS bilan boshqariladigan maʼlumot: bu endpoint 2026-09-11 da
# kommentga olindi — entity platformada yaratilmaydi, oʻzgartirilmaydi va
# oʻchirilmaydi. Qaytarish kerak boʻlsa — kommentni olib tashlash kifoya.
# @kafedra_router.put(
#     "/{kafedra_id}",
#     response_model=KafedraCreateResponse,
#     dependencies=[Depends(RateLimiter(times=5, seconds=60))],
# )
# async def update_kafedra(
#     kafedra_id: int,
#     data: KafedraCreateRequest,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     _: PermissionRequired = Depends(PermissionRequired("update:kafedra")),
# ):
#     result = await get_kafedra_repository.update_kafedra(session=session, kafedra_id=kafedra_id, data=data)
#     return result


# EPOS/HEMIS bilan boshqariladigan maʼlumot: bu endpoint 2026-09-11 da
# kommentga olindi — entity platformada yaratilmaydi, oʻzgartirilmaydi va
# oʻchirilmaydi. Qaytarish kerak boʻlsa — kommentni olib tashlash kifoya.
# @kafedra_router.delete(
#     "/{kafedra_id}",
#     status_code=status.HTTP_204_NO_CONTENT,
#     dependencies=[Depends(RateLimiter(times=5, seconds=60))],
# )
# async def delete_kafedra(
#     kafedra_id: int,
#     force: bool = False,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     _: PermissionRequired = Depends(PermissionRequired("delete:kafedra")),
# ):
#     await get_kafedra_repository.delete_kafedra(session=session, kafedra_id=kafedra_id, force=force)


# ============================================================================
#  GROUP
# ============================================================================
group_router = APIRouter(
    tags=["Group"],
    prefix="/group",
)


# EPOS/HEMIS bilan boshqariladigan maʼlumot: bu endpoint 2026-09-11 da
# kommentga olindi — entity platformada yaratilmaydi, oʻzgartirilmaydi va
# oʻchirilmaydi. Qaytarish kerak boʻlsa — kommentni olib tashlash kifoya.
# @group_router.post(
#     "/",
#     response_model=GroupCreateResponse,
#     status_code=status.HTTP_201_CREATED,
#     dependencies=[Depends(RateLimiter(times=5, seconds=60))],
# )
# async def create_group(
#     data: GroupCreateRequest,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     _: PermissionRequired = Depends(PermissionRequired("create:group")),
# ):
#     result = await get_group_repository.create_group(session=session, data=data)
#     return result


@group_router.get("/duplicates", response_model=GroupDuplicatePreview)
async def preview_group_duplicates(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:group")),
):
    """Nomi bir xil boʻlgan guruhlar — birlashtirishdan oldingi koʻrinish.

    Hech nima yozmaydi. Har toʻdada qaysi nusxa qolishi va qaysi biri arxivga
    tushishi, hamda ularga nechta talaba, kurs va yuklama bogʻlangani
    koʻrsatiladi.
    """
    return await group_merge_service.preview(session)


@group_router.post(
    "/duplicates/merge",
    response_model=GroupMergeResponse,
    dependencies=[Depends(RateLimiter(times=3, seconds=60))],
)
async def merge_group_duplicates(
    data: GroupMergeRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:group")),
):
    """Takrorlangan guruhlarni birlashtiradi.

    Eski nusxaning talabalari, kurslari, yuklamalari, darslari va davomati
    tirik nusxaga koʻchadi, oʻzi esa arxivga tushadi — oʻchirilmaydi.
    """
    return await group_merge_service.apply(session, data.group_ids or None)


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

    Huquq ikki bosqichli. Admin istalgan guruhni ochadi, o'qituvchi esa —
    faqat o'ziga biriktirilganini: guruhlar ro'yxati unga allaqachon shunday
    cheklangan, ochilmaydigan qator ko'rsatish esa mantiqsiz bo'lardi.

    `read:student` o'qituvchini bu chegaradan chiqarmaydi. Ilgari chiqarardi
    va bu ruxsat ba'zi o'qituvchilarda bor (qo'lda berilgan yoki eski
    migratsiyadan qolgan) — natijada o'qituvchi begona guruhning talabalarini
    ochib ko'ra olardi. Ruxsati bor boshqa rollar (psixolog, tutor) avvalgidek
    istalgan guruhni ochadi.
    """
    is_teacher = not any(role.name.lower() == "admin" for role in (current_user.roles or [])) and any(
        role.name.lower() == "teacher" for role in (current_user.roles or [])
    )
    if is_teacher or not await user_has_permission(session, current_user, "read:student"):
        if not await get_group_repository.is_group_assigned_to_user(session, current_user, group_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: group is not assigned to you",
            )

    request = StudentListRequest(page=page, limit=limit, search=search, group_id=group_id)
    return await student_repository.list_students(session=session, request=request, current_user=current_user)


# EPOS/HEMIS bilan boshqariladigan maʼlumot: bu endpoint 2026-09-11 da
# kommentga olindi — entity platformada yaratilmaydi, oʻzgartirilmaydi va
# oʻchirilmaydi. Qaytarish kerak boʻlsa — kommentni olib tashlash kifoya.
# @group_router.put(
#     "/{group_id}",
#     response_model=GroupCreateResponse,
#     dependencies=[Depends(RateLimiter(times=5, seconds=60))],
# )
# async def update_group(
#     group_id: int,
#     data: GroupCreateRequest,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     _: PermissionRequired = Depends(PermissionRequired("update:group")),
# ):
#     result = await get_group_repository.update_group(session=session, group_id=group_id, data=data)
#     return result


# EPOS/HEMIS bilan boshqariladigan maʼlumot: bu endpoint 2026-09-11 da
# kommentga olindi — entity platformada yaratilmaydi, oʻzgartirilmaydi va
# oʻchirilmaydi. Qaytarish kerak boʻlsa — kommentni olib tashlash kifoya.
# @group_router.delete(
#     "/{group_id}",
#     status_code=status.HTTP_204_NO_CONTENT,
#     dependencies=[Depends(RateLimiter(times=5, seconds=60))],
# )
# async def delete_group(
#     group_id: int,
#     force: bool = False,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     _: PermissionRequired = Depends(PermissionRequired("delete:group")),
# ):
#     await get_group_repository.delete_group(session=session, group_id=group_id, force=force)


# EPOS/HEMIS bilan boshqariladigan maʼlumot: bu endpoint 2026-09-11 da
# kommentga olindi — entity platformada yaratilmaydi, oʻzgartirilmaydi va
# oʻchirilmaydi. Qaytarish kerak boʻlsa — kommentni olib tashlash kifoya.
# @group_router.get("/{group_id}/delete-info")
# async def get_group_delete_info(
#     group_id: int,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     _: PermissionRequired = Depends(PermissionRequired("read:group")),
# ):
#     """Returns counts of related data affected when this group is deleted."""
#     from sqlalchemy import func, select
#
#     from app.modules.auth.model import Student
#     from app.modules.quiz.model import Result
#
#     student_count = (
#         await session.execute(select(func.count()).select_from(Student).where(Student.group_id == group_id))
#     ).scalar() or 0
#     result_count = (
#         await session.execute(select(func.count()).select_from(Result).where(Result.group_id == group_id))
#     ).scalar() or 0
#     return {"students_count": student_count, "results_count": result_count}


# ============================================================================
#  SPECIALITY
# ============================================================================
speciality_router = APIRouter(
    tags=["Speciality"],
    prefix="/speciality",
)


# EPOS/HEMIS bilan boshqariladigan maʼlumot: bu endpoint 2026-09-11 da
# kommentga olindi — entity platformada yaratilmaydi, oʻzgartirilmaydi va
# oʻchirilmaydi. Qaytarish kerak boʻlsa — kommentni olib tashlash kifoya.
# @speciality_router.post(
#     "/",
#     response_model=SpecialityResponse,
#     status_code=status.HTTP_201_CREATED,
#     dependencies=[Depends(RateLimiter(times=5, seconds=60))],
# )
# async def create_speciality(
#     data: SpecialityCreateRequest,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     _: PermissionRequired = Depends(PermissionRequired("create:speciality")),
# ):
#     return await get_speciality_repository.create_speciality(session=session, data=data)


@speciality_router.get("/stats", response_model=SpecialityStatsResponse)
async def get_speciality_stats(
    kafedra_id: int | None = None,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequiredExceptTeacher("read:speciality")),
):
    return await get_speciality_repository.get_speciality_stats(session=session, kafedra_id=kafedra_id)


@speciality_router.get("/", response_model=SpecialityListResponse)
async def list_specialities(
    data: SpecialityListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequiredExceptTeacher("read:speciality")),
):
    return await get_speciality_repository.list_specialities(session=session, request=data, current_user=current_user)


@speciality_router.get("/{speciality_id}", response_model=SpecialityResponse)
async def get_speciality(
    speciality_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequiredExceptTeacher("read:speciality")),
):
    return await get_speciality_repository.get_speciality(session=session, speciality_id=speciality_id)


# EPOS/HEMIS bilan boshqariladigan maʼlumot: bu endpoint 2026-09-11 da
# kommentga olindi — entity platformada yaratilmaydi, oʻzgartirilmaydi va
# oʻchirilmaydi. Qaytarish kerak boʻlsa — kommentni olib tashlash kifoya.
# @speciality_router.put(
#     "/{speciality_id}",
#     response_model=SpecialityResponse,
#     dependencies=[Depends(RateLimiter(times=5, seconds=60))],
# )
# async def update_speciality(
#     speciality_id: int,
#     data: SpecialityUpdateRequest,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     _: PermissionRequired = Depends(PermissionRequired("update:speciality")),
# ):
#     return await get_speciality_repository.update_speciality(session=session, speciality_id=speciality_id, data=data)


# EPOS/HEMIS bilan boshqariladigan maʼlumot: bu endpoint 2026-09-11 da
# kommentga olindi — entity platformada yaratilmaydi, oʻzgartirilmaydi va
# oʻchirilmaydi. Qaytarish kerak boʻlsa — kommentni olib tashlash kifoya.
# @speciality_router.delete(
#     "/{speciality_id}",
#     status_code=status.HTTP_204_NO_CONTENT,
#     dependencies=[Depends(RateLimiter(times=5, seconds=60))],
# )
# async def delete_speciality(
#     speciality_id: int,
#     force: bool = False,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     _: PermissionRequired = Depends(PermissionRequired("delete:speciality")),
# ):
#     await get_speciality_repository.delete_speciality(session=session, speciality_id=speciality_id, force=force)


# ============================================================================
#  AGGREGATE ROUTER
# ============================================================================
router = APIRouter()
# Yashirish (visibility) funksiyasi 2026-09-11 da kommentga olindi:
# spravochniklar EPOS/HEMIS maʼlumoti, ularni yashirish ham qoldirilmadi.
# Batafsil: `app/core/utils/visibility.py`.
# @faculty_router.patch("/{faculty_id}/visibility", status_code=status.HTTP_200_OK)
# async def set_faculty_visibility(
#     faculty_id: int,
#     data: VisibilityRequest,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     current_user: User = Depends(PermissionRequired("update:faculty")),
# ):
#     """Fakultetni boshqa rollardan yashiradi yoki qaytaradi. Faqat admin.
#
#     Yashirilgan yozuv roʻyxatlarda ham, tanlov oynalarida ham koʻrinmaydi,
#     lekin unga bogʻlangan eski maʼlumot ishlayveradi: oʻtgan natijalar
#     ochiladi, boshlangan test toʻxtamaydi.
#     """
#     row = await set_hidden(session, Faculty, faculty_id, data.is_hidden, current_user, "Fakultet")
#     return {"id": row.id, "is_hidden": row.is_hidden}


# Yashirish (visibility) funksiyasi 2026-09-11 da kommentga olindi:
# spravochniklar EPOS/HEMIS maʼlumoti, ularni yashirish ham qoldirilmadi.
# Batafsil: `app/core/utils/visibility.py`.
# @kafedra_router.patch("/{kafedra_id}/visibility", status_code=status.HTTP_200_OK)
# async def set_kafedra_visibility(
#     kafedra_id: int,
#     data: VisibilityRequest,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     current_user: User = Depends(PermissionRequired("update:kafedra")),
# ):
#     """Kafedrani boshqa rollardan yashiradi yoki qaytaradi. Faqat admin.
#
#     Yashirilgan yozuv roʻyxatlarda ham, tanlov oynalarida ham koʻrinmaydi,
#     lekin unga bogʻlangan eski maʼlumot ishlayveradi: oʻtgan natijalar
#     ochiladi, boshlangan test toʻxtamaydi.
#     """
#     row = await set_hidden(session, Kafedra, kafedra_id, data.is_hidden, current_user, "Kafedra")
#     return {"id": row.id, "is_hidden": row.is_hidden}


# Yashirish (visibility) funksiyasi 2026-09-11 da kommentga olindi:
# spravochniklar EPOS/HEMIS maʼlumoti, ularni yashirish ham qoldirilmadi.
# Batafsil: `app/core/utils/visibility.py`.
# @group_router.patch("/{group_id}/visibility", status_code=status.HTTP_200_OK)
# async def set_group_visibility(
#     group_id: int,
#     data: VisibilityRequest,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     current_user: User = Depends(PermissionRequired("update:group")),
# ):
#     """Guruhni boshqa rollardan yashiradi yoki qaytaradi. Faqat admin.
#
#     Yashirilgan yozuv roʻyxatlarda ham, tanlov oynalarida ham koʻrinmaydi,
#     lekin unga bogʻlangan eski maʼlumot ishlayveradi: oʻtgan natijalar
#     ochiladi, boshlangan test toʻxtamaydi.
#     """
#     row = await set_hidden(session, Group, group_id, data.is_hidden, current_user, "Guruh")
#     return {"id": row.id, "is_hidden": row.is_hidden}


# Yashirish (visibility) funksiyasi 2026-09-11 da kommentga olindi:
# spravochniklar EPOS/HEMIS maʼlumoti, ularni yashirish ham qoldirilmadi.
# Batafsil: `app/core/utils/visibility.py`.
# @speciality_router.patch("/{speciality_id}/visibility", status_code=status.HTTP_200_OK)
# async def set_speciality_visibility(
#     speciality_id: int,
#     data: VisibilityRequest,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     current_user: User = Depends(PermissionRequired("update:speciality")),
# ):
#     """Mutaxassislikni boshqa rollardan yashiradi yoki qaytaradi. Faqat admin.
#
#     Yashirilgan yozuv roʻyxatlarda ham, tanlov oynalarida ham koʻrinmaydi,
#     lekin unga bogʻlangan eski maʼlumot ishlayveradi: oʻtgan natijalar
#     ochiladi, boshlangan test toʻxtamaydi.
#     """
#     row = await set_hidden(session, Speciality, speciality_id, data.is_hidden, current_user, "Mutaxassislik")
#     return {"id": row.id, "is_hidden": row.is_hidden}


curriculum_router = APIRouter(
    tags=["Curriculum"],
    prefix="/curriculum",
)


@curriculum_router.get("/", response_model=CurriculumListResponse)
async def list_curriculums(
    data: CurriculumListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequiredExceptTeacher("read:curriculum")),
):
    """Oʻquv rejalar roʻyxati.

    Faqat oʻqish: rejalar EPMOS'dan koʻchiriladi va qoʻlda tahrirlanmaydi —
    keyingi sinxronizatsiya oʻzgarishni jimgina qaytarib qoʻyardi.

    Ruxsat oʻziniki (`read:curriculum`), mutaxassislikniki emas: menyu bandi
    aynan shu nom boʻyicha chiziladi, va rejalarni koʻrsatmasdan
    mutaxassisliklarni koʻrsatish kerak boʻlgan rol boʻlishi mumkin.
    Ruxsatning oʻzi ilova koʻtarilganda route'lardan avtomatik topiladi va
    Adminga beriladi (core/lifespan/discovery.py).
    """
    return await get_curriculum_repository.list_curriculums(
        session=session, request=data, current_user=current_user
    )


@curriculum_router.get("/{curriculum_id}", response_model=CurriculumResponse)
async def get_curriculum(
    curriculum_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequiredExceptTeacher("read:curriculum")),
):
    """Bitta oʻquv reja."""
    return await get_curriculum_repository.get_curriculum(session, curriculum_id)


# Yashirish (visibility) funksiyasi 2026-09-11 da kommentga olindi:
# spravochniklar EPOS/HEMIS maʼlumoti, ularni yashirish ham qoldirilmadi.
# Batafsil: `app/core/utils/visibility.py`.
# @curriculum_router.patch("/{curriculum_id}/visibility", status_code=status.HTTP_200_OK)
# async def set_curriculum_visibility(
#     curriculum_id: int,
#     data: VisibilityRequest,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     current_user: User = Depends(PermissionRequired("update:curriculum")),
# ):
#     """Oʻquv rejani boshqa rollardan yashiradi yoki qaytaradi. Faqat admin."""
#     row = await set_hidden(session, Curriculum, curriculum_id, data.is_hidden, current_user, "O'quv reja")
#     return {"id": row.id, "is_hidden": row.is_hidden}


router.include_router(faculty_router)
router.include_router(kafedra_router)
router.include_router(group_router)
router.include_router(speciality_router)
router.include_router(curriculum_router)
