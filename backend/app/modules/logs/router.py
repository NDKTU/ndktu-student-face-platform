from fastapi import APIRouter, Depends, Request
from fastapi_limiter.depends import RateLimiter

from .repository import get_client_log_service
from .schemas import ClientLogBatchRequest

router = APIRouter(prefix="/logs", tags=["Logs"])


@router.post(
    "/client",
    status_code=204,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def report_client_logs(payload: ClientLogBatchRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    for entry in payload.entries:
        get_client_log_service.record(entry, client_ip=client_ip)
