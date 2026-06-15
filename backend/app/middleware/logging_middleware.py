import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.modules.user.service import auth_service

logger = logging.getLogger(__name__)

SKIP_LOG_PATHS = {"/health", "/metrics"}


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in SKIP_LOG_PATHS:
            return await call_next(request)

        start_time = time.time()

        # Extract User Info (только для логирования: без enforce сессии и без продления TTL).
        user_info = "Anonymous"
        auth_header = request.headers.get("Authorization")
        if auth_header:
            token = auth_header
            if token.startswith("Bearer "):
                token = token.replace("Bearer ", "")

            try:
                # Переиспользуем единый декодер; он бросает HTTPException на невалидном/истёкшем.
                payload = auth_service.token_decode(token)
                user_id = payload.get("user_id")
                user_info = f"User({user_id})" if user_id else "Anonymous"
            except Exception:
                user_info = "InvalidToken"
        else:
            logger.debug("No Authorization header found")

        # Log Request Start (Optional, usually we log on finish to capture duration/status)
        # logger.info(f"Started {request.method} {request.url.path} by {user_info}")

        try:
            response = await call_next(request)

            process_time = (time.time() - start_time) * 1000
            status_code = response.status_code

            log_msg = (
                f"Endpoint: {request.method} {request.url.path} | "
                f"User: {user_info} | "
                f"Status: {status_code} | "
                f"Duration: {process_time:.2f}ms"
            )

            logger.info(log_msg)

            return response

        except Exception as e:
            process_time = (time.time() - start_time) * 1000
            logger.error(
                f"Endpoint: {request.method} {request.url.path} | "
                f"User: {user_info} | "
                f"Duration: {process_time:.2f}ms | "
                f"Error: {str(e)}"
            )
            raise e
