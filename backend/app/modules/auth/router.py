import json
import logging

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User

from .employee.repository import get_employee_repository
from .employee.schemas import (
    EmployeeCreateRequest,
    EmployeeListRequest,
    EmployeeListResponse,
    EmployeeResponse,
    EmployeeUpdateRequest,
)
from .hemis.schemas import (
    HemisLoginRequest,
    HemisLoginResponse,
    HemisPreviewResponse,
    HemisSyncResponse,
)
from .hemis.service import hemis_service
from .permission.repository import get_permission_repository
from .permission.schemas import (
    PermissionCreateRequest,
    PermissionCreateResponse,
    PermissionListRequest,
    PermissionListResponse,
)
from .role.repository import get_role_repository
from .role.schemas import (
    RoleCreateRequest,
    RoleCreateResponse,
    RoleListRequest,
    RoleListResponse,
    RolePermissionAssignRequest,
)
from .student.repository import student_repository
from .student.schemas import (
    StudentListRequest,
    StudentListResponse,
    StudentResponse,
    StudentUpdateRequest,
    StudentWithUserListResponse,
)
from .teacher.repository import get_teacher_repository
from .teacher.schemas import (
    FacultyRankingResponse,
    KafedraRankingResponse,
    TeacherAssignedGroupsResponse,
    TeacherAssignedSubjectsResponse,
    TeacherCreateRequest,
    TeacherCreateResponse,
    TeacherGroupAssignRequest,
    TeacherListRequest,
    TeacherListResponse,
    TeacherRankingResponse,
    TeacherSubjectAssignRequest,
    TeacherUpdateRequest,
)
from .teacher_assignment.repository import get_teacher_assignment_repository
from .teacher_assignment.schemas import (
    TeacherAssignmentCreateRequest,
    TeacherAssignmentListRequest,
    TeacherAssignmentListResponse,
    TeacherAssignmentResponse,
)
from .user.repository import get_user_repository
from .user.schemas import (
    UserChangeCredentialsRequest,
    UserCreateRequest,
    UserCreateResponse,
    UserListRequest,
    UserListResponse,
    UserLoginRequest,
    UserLoginResponse,
    UserMeResponse,
    UserRoleAssignRequest,
    UserUpdateRequest,
)
from .user.service import auth_service

logger = logging.getLogger(__name__)


async def login_rate_limit_identifier(request: Request) -> str:
    """Key the login rate limit by IP + attempted username, so unrelated
    users behind the same NAT/reverse proxy don't share one bucket."""
    body = await request.body()
    try:
        username = str(json.loads(body).get("username", "")).strip().lower()
    except (json.JSONDecodeError, AttributeError):
        username = ""
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    return f"{ip}:{username}:{request.scope['path']}"


# ============================================================================
#  USER
# ============================================================================
user_router = APIRouter(
    tags=["User"],
    prefix="/user",
)


@user_router.post(
    "/login",
    response_model=UserLoginResponse,
    dependencies=[Depends(RateLimiter(times=10, seconds=60, identifier=login_rate_limit_identifier))],
)
async def login(data: UserLoginRequest, session: AsyncSession = Depends(db_helper.session_getter)):
    return await auth_service.login(session=session, data=data)


@user_router.get("/me", response_model=UserMeResponse)
async def get_me(
    authorization: str = Header(...),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("user:me")),
):
    return await auth_service.get_current_user(session=session, token=authorization)


@user_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user=Depends(PermissionRequired("user:me")),
):
    # Отзываем сессию на сервере: удаляем jti из Redis → все токены пользователя
    # становятся невалидными (validate_session вернёт 401).
    await auth_service.logout(current_user.id)


@user_router.put("/me/credentials", response_model=UserCreateResponse)
async def update_my_credentials(
    data: UserChangeCredentialsRequest,
    authorization: str = Header(...),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("user:me")),
):
    current_user = await auth_service.get_current_user(session=session, token=authorization)
    result = await get_user_repository.change_my_credentials(session=session, current_user=current_user, data=data)
    return result


@user_router.post(
    "/",
    response_model=UserCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_user(
    data: UserCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
):
    result = await get_user_repository.create_user(session=session, data=data)
    return result


@user_router.get("/{user_id}", response_model=UserCreateResponse)
async def get_user(
    user_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:user")),
):
    return await get_user_repository.get_user(session=session, user_id=user_id)


@user_router.get("/", response_model=UserListResponse)
async def list_users(
    data: UserListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:user")),
):
    return await get_user_repository.list_users(session=session, request=data)


@user_router.put(
    "/{user_id}",
    response_model=UserCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_user(
    user_id: int,
    data: UserUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:user")),
):
    result = await get_user_repository.update_user(session=session, user_id=user_id, data=data)
    return result


@user_router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_user(
    user_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:user")),
):
    await get_user_repository.delete_user(session=session, user_id=user_id, force=force)


@user_router.post(
    "/assign_role",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def assign_role(
    data: UserRoleAssignRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:user")),  # Assuming admin permission needed
):
    await get_user_repository.assign_roles(session=session, data=data)
    return {"message": "Roles assigned successfully"}


# ============================================================================
#  ROLE
# ============================================================================
role_router = APIRouter(
    tags=["Role"],
    prefix="/role",
)


@role_router.post(
    "/",
    response_model=RoleCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_role(
    data: RoleCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:role")),
):
    result = await get_role_repository.create_role(session=session, data=data)
    return result


@role_router.get("/{role_id}", response_model=RoleCreateResponse)
async def get_role(
    role_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:role")),
):
    return await get_role_repository.get_role(session=session, role_id=role_id)


@role_router.get("/", response_model=RoleListResponse)
async def list_roles(
    data: RoleListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:role")),
):
    return await get_role_repository.list_roles(session=session, request=data)


@role_router.put(
    "/{role_id}",
    response_model=RoleCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_role(
    role_id: int,
    data: RoleCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:role")),
):
    result = await get_role_repository.update_role(session=session, role_id=role_id, data=data)
    return result


@role_router.delete(
    "/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_role(
    role_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:role")),
):
    await get_role_repository.delete_role(session=session, role_id=role_id)


@role_router.post(
    "/assign_permission",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def assign_permission(
    data: RolePermissionAssignRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:role")),  # Assuming update:role is appropriate
):
    await get_role_repository.assign_permissions(session=session, data=data)
    return {"message": "Permissions assigned successfully"}


# ============================================================================
#  PERMISSION
# ============================================================================
permission_router = APIRouter(
    tags=["Permission"],
    prefix="/permission",
)


@permission_router.post(
    "/",
    response_model=PermissionCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(5, 60))],
)
async def create_permission(
    data: PermissionCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:permission")),
):
    result = await get_permission_repository.create_permission(session=session, data=data)
    return result


@permission_router.get("/{permission_id}", response_model=PermissionCreateResponse)
async def get_permission(
    permission_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:permission")),
):
    return await get_permission_repository.get_permission(session=session, permission_id=permission_id)


@permission_router.get("/", response_model=PermissionListResponse)
async def list_permissions(
    data: PermissionListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:permission")),
):
    return await get_permission_repository.list_permissions(session=session, request=data)


@permission_router.put(
    "/{permission_id}",
    response_model=PermissionCreateResponse,
    dependencies=[Depends(RateLimiter(5, 60))],
)
async def update_permission(
    permission_id: int,
    data: PermissionCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:permission")),
):
    result = await get_permission_repository.update_permission(session=session, permission_id=permission_id, data=data)
    return result


@permission_router.delete(
    "/{permission_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(5, 60))],
)
async def delete_permission(
    permission_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:permission")),
):
    await get_permission_repository.delete_permission(session=session, permission_id=permission_id)


# ============================================================================
#  STUDENT
# ============================================================================
student_router = APIRouter(prefix="/students", tags=["Students"])


@student_router.get("/with-users", response_model=StudentWithUserListResponse)
async def list_students_with_users(
    data: StudentListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:student")),
):
    return await student_repository.list_students_with_users(session=session, request=data)


@student_router.get("/", response_model=StudentListResponse)
async def list_students(
    data: StudentListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:student")),
):
    return await student_repository.list_students(session=session, request=data)


@student_router.get("/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:student")),
):
    return await student_repository.get_student(session, student_id)


@student_router.put(
    "/{student_id}",
    response_model=StudentResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_student(
    student_id: int,
    data: StudentUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:student")),
):
    result = await student_repository.update_student(session, student_id, data)
    return result


@student_router.delete(
    "/{student_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_student(
    student_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:student")),
):
    await student_repository.delete_student(session, student_id, force)


# ============================================================================
#  TEACHER
# ============================================================================
teacher_router = APIRouter(
    tags=["Teacher"],
    prefix="/teacher",
)


@teacher_router.post(
    "/",
    response_model=TeacherCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_teacher(
    data: TeacherCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:teacher")),
):
    result = await get_teacher_repository.create_teacher(session=session, data=data)
    return result


@teacher_router.get("/{teacher_id}", response_model=TeacherCreateResponse)
async def get_teacher(
    teacher_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:teacher")),
):
    return await get_teacher_repository.get_teacher(session=session, teacher_id=teacher_id)


@teacher_router.get("/", response_model=TeacherListResponse)
async def list_teachers(
    data: TeacherListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:teacher")),
):
    return await get_teacher_repository.list_teachers(session=session, request=data)


@teacher_router.put(
    "/{teacher_id}",
    response_model=TeacherCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_teacher(
    teacher_id: int,
    data: TeacherUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:teacher")),
):
    result = await get_teacher_repository.update_teacher(session=session, teacher_id=teacher_id, data=data)
    return result


@teacher_router.delete(
    "/{teacher_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_teacher(
    teacher_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:teacher")),
):
    await get_teacher_repository.delete_teacher(session=session, teacher_id=teacher_id, force=force)


@teacher_router.post(
    "/assign_groups",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def assign_groups(
    data: TeacherGroupAssignRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:teacher")),
):
    await get_teacher_repository.assign_groups(session=session, data=data)
    return {"message": "Groups assigned successfully"}


@teacher_router.post(
    "/assign_subjects",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def assign_subjects(
    data: TeacherSubjectAssignRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:teacher")),
):
    await get_teacher_repository.assign_subjects(session=session, data=data)
    return {"message": "Subjects assigned successfully"}


@teacher_router.get(
    "/assigned_subjects/by-user/{user_id}",
    response_model=TeacherAssignedSubjectsResponse,
)
async def get_teacher_assigned_subjects(
    user_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("user:me")),
):
    is_admin = any(r.name.lower() == "admin" for r in current_user.roles)
    if not is_admin and user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await get_teacher_repository.get_assigned_subjects_by_user(session=session, user_id=user_id)


@teacher_router.get("/assigned_groups/by-user/{user_id}", response_model=TeacherAssignedGroupsResponse)
async def get_teacher_assigned_groups(
    user_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("user:me")),
):
    is_admin = any(r.name.lower() == "admin" for r in current_user.roles)
    if not is_admin and user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await get_teacher_repository.get_assigned_groups_by_user(session=session, user_id=user_id)


@teacher_router.get(
    "/ranking/overall",
    response_model=TeacherRankingResponse,
    summary="Teacher ranking — with optional filters",
)
async def teacher_ranking_overall(
    faculty_id: int | None = None,
    kafedra_id: int | None = None,
    group_id: int | None = None,
    search: str | None = None,
    page: int = 1,
    limit: int = 10,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:teacher")),
):
    """
    Return teachers ranked by Bayesian weighted avg student grade.
    All query params are optional — omit all to get full university ranking.
        ?faculty_id=1  → teachers of that faculty only
        ?kafedra_id=3  → teachers of that kafedra only
        ?group_id=7    → teachers assigned to that group only
        ?search=John   → teachers whose name contains "John"
        ?page=1&limit=10 → pagination
    Any combination of filters can be used together.
    """
    return await get_teacher_repository.get_ranking(
        session=session,
        faculty_id=faculty_id,
        kafedra_id=kafedra_id,
        group_id=group_id,
        search=search,
        page=page,
        limit=limit,
    )


@teacher_router.get(
    "/ranking/faculty",
    response_model=FacultyRankingResponse,
    summary="Faculty ranking — faculties ranked by avg student grade",
)
async def faculty_ranking(
    page: int = 1,
    limit: int = 10,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:teacher")),
):
    """Return all faculties ranked by avg student grade (Bayesian weighted)."""
    return await get_teacher_repository.get_faculty_ranking(session=session, page=page, limit=limit)


@teacher_router.get(
    "/ranking/kafedra",
    response_model=KafedraRankingResponse,
    summary="Kafedra ranking — chairs ranked by avg student grade",
)
async def kafedra_ranking(
    page: int = 1,
    limit: int = 10,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:teacher")),
):
    """Return all kafedras (chairs) ranked by avg student grade (Bayesian weighted)."""
    return await get_teacher_repository.get_kafedra_ranking(session=session, page=page, limit=limit)


# ============================================================================
#  TEACHER ASSIGNMENT
# ============================================================================
teacher_assignment_router = APIRouter(
    tags=["TeacherAssignment"],
    prefix="/teacher-assignment",
)


@teacher_assignment_router.post(
    "/",
    response_model=TeacherAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def create_assignment(
    data: TeacherAssignmentCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:teacher_assignment")),
):
    return await get_teacher_assignment_repository.create_assignment(session=session, data=data)


@teacher_assignment_router.get("/", response_model=TeacherAssignmentListResponse)
async def list_assignments(
    data: TeacherAssignmentListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:teacher_assignment")),
):
    return await get_teacher_assignment_repository.list_assignments(session=session, request=data)


@teacher_assignment_router.delete(
    "/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def delete_assignment(
    assignment_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:teacher_assignment")),
):
    await get_teacher_assignment_repository.delete_assignment(session=session, assignment_id=assignment_id)


# ============================================================================
#  EMPLOYEE
# ============================================================================
employee_router = APIRouter(
    tags=["Employee"],
    prefix="/employee",
)


@employee_router.post(
    "/",
    response_model=EmployeeResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_employee(
    data: EmployeeCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:employee")),
):
    return await get_employee_repository.create_employee(session=session, data=data)


@employee_router.get("/me", response_model=EmployeeResponse)
async def get_my_employee_profile(
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("employee:me")),
):
    return await get_employee_repository.get_employee_by_user_id(session=session, user_id=current_user.id)


@employee_router.put("/me", response_model=EmployeeResponse)
async def update_my_employee_profile(
    data: EmployeeUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("employee:me")),
):
    employee = await get_employee_repository.get_employee_by_user_id(session=session, user_id=current_user.id)
    return await get_employee_repository.update_employee(session=session, employee_id=employee.id, data=data)


@employee_router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:employee")),
):
    return await get_employee_repository.get_employee(session=session, employee_id=employee_id)


@employee_router.get("/", response_model=EmployeeListResponse)
async def list_employees(
    data: EmployeeListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:employee")),
):
    return await get_employee_repository.list_employees(session=session, request=data)


@employee_router.put(
    "/{employee_id}",
    response_model=EmployeeResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_employee(
    employee_id: int,
    data: EmployeeUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:employee")),
):
    return await get_employee_repository.update_employee(session=session, employee_id=employee_id, data=data)


@employee_router.delete(
    "/{employee_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_employee(
    employee_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:employee")),
):
    await get_employee_repository.delete_employee(session=session, employee_id=employee_id, force=force)


# ============================================================================
#  HEMIS
# ============================================================================
hemis_router = APIRouter(prefix="/hemis", tags=["Hemis"])


@hemis_router.post(
    "/login",
    response_model=HemisLoginResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def hemis_login(
    data: HemisLoginRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
):
    return await hemis_service.hemis_login(session=session, data=data)


@hemis_router.post(
    "/preview",
    response_model=HemisPreviewResponse,
    dependencies=[Depends(PermissionRequired("hemis_admin_preview"))],
)
async def preview_hemis_data(
    data: HemisLoginRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
):
    return await hemis_service.preview_hemis_data(session=session, data=data)


@hemis_router.post(
    "/sync",
    response_model=HemisSyncResponse,
    dependencies=[Depends(PermissionRequired("hemis_admin_sync"))],
)
async def sync_hemis_data(
    data: HemisLoginRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
):
    return await hemis_service.sync_hemis_data(session=session, data=data)


# ============================================================================
#  AGGREGATE ROUTER
# ============================================================================
router = APIRouter()
router.include_router(user_router)
router.include_router(role_router)
router.include_router(permission_router)
router.include_router(student_router)
router.include_router(teacher_router)
router.include_router(teacher_assignment_router)
router.include_router(employee_router)
router.include_router(hemis_router)
