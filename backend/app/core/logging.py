import logging
import os
from datetime import datetime
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

# --- Base setup ---
# Anchored to an absolute path (mirroring core/config.py's BASE_DIR) rather than
# a bare relative "logs" string — a relative path resolves against whatever the
# process's CWD happens to be at startup, so invoking the app from a different
# directory than the documented one would silently write logs somewhere else
# entirely instead of the directory the backend_logs Docker volume expects.
_BASE_DIR = Path(__file__).resolve().parent.parent.parent
LOG_DIR = str(_BASE_DIR / "logs")
LEVELS = ["debug", "info", "warning", "error", "critical"]
RETENTION_DAYS = {"debug": 5, "info": 7, "warning": 30, "error": 30, "critical": 30}

# Ensure log folders exist
for level in LEVELS:
    os.makedirs(os.path.join(LOG_DIR, level), exist_ok=True)


# --- Formatters ---
detailed_formatter = logging.Formatter(
    ("%(asctime)s | %(levelname)-8s | %(name)s | %(filename)s:%(lineno)d | %(funcName)s() | %(message)s"),
    datefmt="%Y-%m-%d %H:%M:%S",
)


# --- Filters ---
class LevelFilter(logging.Filter):
    """Filter logs by level name."""

    def __init__(self, level_name):
        super().__init__()
        self.level_name = level_name.upper()

    def filter(self, record):
        return record.levelname == self.level_name


class NoiseFilter(logging.Filter):
    """Filter out noisy endpoint logs (/health, /metrics) to keep logs readable."""

    NOISY_PATHS = ("/health", "/metrics")

    def filter(self, record):
        message = record.getMessage()
        return not any(path in message for path in self.NOISY_PATHS)


# --- Root logger ---
logger = logging.getLogger()
logger.setLevel(logging.DEBUG)

# --- Suppress Noisy Libraries ---
# Keep third-party libraries at WARNING+ to avoid flooding debug logs
for lib in [
    "watchfiles",
    "uvicorn.error",
    "uvicorn.access",
    "httpcore",
    "httpx",
    "hpack",
    "multipart",
    "sqlalchemy.engine",
    "aioredis",
    "asyncio",
]:
    logging.getLogger(lib).setLevel(logging.WARNING)


# --- File handlers per level ---
today = datetime.now().strftime("%Y-%m-%d")  # prefix date in filename

for level in LEVELS:
    filename = os.path.join(LOG_DIR, level, f"{today}_{level}_log.log")
    handler = TimedRotatingFileHandler(
        filename,
        when="midnight",
        interval=1,
        backupCount=RETENTION_DAYS[level],
        encoding="utf-8",
    )
    handler.setLevel(getattr(logging, level.upper()))
    handler.addFilter(LevelFilter(level))  # only this level

    handler.setFormatter(detailed_formatter)
    handler.addFilter(NoiseFilter())

    logger.addHandler(handler)
