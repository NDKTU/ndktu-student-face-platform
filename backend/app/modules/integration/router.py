from fastapi import APIRouter

from .eduplan.router import router as eduplan_router
from .royd.router import router as royd_router
from .zoom.router import router as zoom_router

router = APIRouter(prefix="/integration")

router.include_router(eduplan_router)
router.include_router(royd_router)
router.include_router(zoom_router)
