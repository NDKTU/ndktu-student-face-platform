from fastapi import APIRouter

from app.api.v1 import face, stream, video

router = APIRouter()
router.include_router(video.router, prefix="/v1/video", tags=["Video Analysis"])
router.include_router(stream.router, prefix="/v1/video", tags=["Real-Time Stream"])
router.include_router(face.router, prefix="/v1/face", tags=["Face Verification"])
