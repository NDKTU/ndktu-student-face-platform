from fastapi import APIRouter

from .employee.router import router as employee_router
from .hemis.router import router as hemis_router
from .permission.router import router as permission_router
from .role.router import router as role_router
from .student.router import router as student_router
from .teacher.router import router as teacher_router
from .teacher_assignment.router import router as teacher_assignment_router
from .user.router import router as user_router

router = APIRouter()

router.include_router(user_router)
router.include_router(role_router)
router.include_router(permission_router)
router.include_router(student_router)
router.include_router(teacher_router)
router.include_router(teacher_assignment_router)
router.include_router(employee_router)
router.include_router(hemis_router)
