from fastapi import APIRouter

from .auth.router import router as auth_router
from .course.router import router as course_router
from .logs.router import router as logs_router
from .organization_structure.router import router as organization_structure_router
from .psychology.router import router as psychology_router
from .quiz.router import router as quiz_router

router = APIRouter()

router.include_router(auth_router)
router.include_router(organization_structure_router)
router.include_router(quiz_router)
router.include_router(psychology_router)
router.include_router(course_router)
router.include_router(logs_router)
