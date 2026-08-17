from fastapi import APIRouter

from .eduplan.router import router as eduplan_router

router = APIRouter(prefix="/integration")

router.include_router(eduplan_router)
