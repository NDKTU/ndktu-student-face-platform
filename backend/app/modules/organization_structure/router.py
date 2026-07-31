from fastapi import APIRouter

from .curriculum.router import router as curriculum_router
from .department.router import router as department_router
from .faculty.router import router as faculty_router
from .group.router import router as group_router
from .kafedra.router import router as kafedra_router
from .speciality.router import router as speciality_router
from .tree.router import router as tree_router

router = APIRouter()

router.include_router(faculty_router)
router.include_router(kafedra_router)
router.include_router(group_router)
router.include_router(speciality_router)
router.include_router(curriculum_router)
router.include_router(tree_router)
router.include_router(department_router)
