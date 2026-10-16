"""`/api` ostidagi auth bo'limlari — har biri o'z papkasining `router.py` sida.

Ilgari hammasi shu faylda edi (1195 qator, 60 endpoint). Ulash tartibi
o'zgarmagan: marshrutlar tartibi muhim (`/teacher/options` `/{id}` dan oldin).
"""

from fastapi import APIRouter

from .user.router import user_router
from .role.router import role_router
from .permission.router import permission_router
from .student.router import student_router
from .teacher.router import teacher_router
from .teacher_assignment.router import teacher_assignment_router
from .hemis.router import hemis_router

router = APIRouter()

router.include_router(user_router)
router.include_router(role_router)
router.include_router(permission_router)
router.include_router(student_router)
router.include_router(teacher_router)
router.include_router(teacher_assignment_router)
router.include_router(hemis_router)
