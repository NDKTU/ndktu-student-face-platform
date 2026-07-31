from fastapi import APIRouter

from .assignment.router import router as assignment_router
from .content.router import router as content_router
from .course.router import router as course_router
from .lesson.router import router as lesson_router
from .resource.router import router as resource_router

router = APIRouter()

router.include_router(course_router)
router.include_router(lesson_router)
router.include_router(assignment_router)
router.include_router(resource_router)
router.include_router(content_router)
