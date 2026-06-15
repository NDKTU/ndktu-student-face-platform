import logging

from core.config import settings
from redis import asyncio as aioredis

logger = logging.getLogger(__name__)

# Create a global redis client
redis_client = aioredis.from_url(settings.redis.url, encoding="utf8", decode_responses=True)
