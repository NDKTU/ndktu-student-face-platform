"""
tests/conftest.py — shared fixtures for unit and integration tests.
"""

import io
import struct
import tempfile
import zlib
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client():
    """Synchronous test client (no live server needed)."""
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Video fixture helpers
# ---------------------------------------------------------------------------

def _write_solid_mp4(path: str, duration_s: int = 2, width: int = 320, height: int = 240) -> None:
    """Write a plain black valid MP4 using OpenCV (no faces — baseline)."""
    out = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), 10, (width, height))
    blank = np.zeros((height, width, 3), dtype=np.uint8)
    for _ in range(duration_s * 10):
        out.write(blank)
    out.release()


@pytest.fixture(scope="session")
def blank_video_path(tmp_path_factory) -> str:
    p = str(tmp_path_factory.mktemp("videos") / "blank.mp4")
    _write_solid_mp4(p)
    return p


@pytest.fixture(scope="session")
def blank_video_bytes(blank_video_path) -> bytes:
    return Path(blank_video_path).read_bytes()
