"""Unit tests for FaceDetector wrapper."""

import threading
from unittest.mock import MagicMock, patch

import numpy as np
import pytest


def _make_detections(count: int):
    """Build a mock MediaPipe result with `count` detections."""
    result = MagicMock()
    result.detections = [MagicMock() for _ in range(count)]
    return result


@pytest.mark.parametrize("face_count", [0, 1, 2, 3])
def test_count_faces_returns_correct_count(face_count):
    """FaceDetector.count_faces() must return the exact number of detections."""
    with (
        patch("app.services.face_detector.vision.FaceDetector.create_from_options") as mock_create,
        patch("app.services.face_detector.mp_python.BaseOptions"),
        patch("app.services.face_detector.vision.FaceDetectorOptions"),
    ):
        mock_detector = MagicMock()
        mock_detector.detect.return_value = _make_detections(face_count)
        mock_create.return_value = mock_detector

        from app.services.face_detector import FaceDetector
        detector = FaceDetector()

        frame = np.zeros((240, 320, 3), dtype=np.uint8)
        count = detector.count_faces(frame)

        assert count == face_count


def test_each_thread_builds_its_own_mediapipe_detector():
    """Объект MediaPipe не рассчитан на одновременные вызовы из разных потоков.

    Детектор вызывается из пула, поэтому каждый поток обязан получить свой
    экземпляр — иначе редкие сбои и мусорные результаты под нагрузкой.
    """
    with (
        patch("app.services.face_detector.vision.FaceDetector.create_from_options") as mock_create,
        patch("app.services.face_detector.mp_python.BaseOptions"),
        patch("app.services.face_detector.vision.FaceDetectorOptions"),
    ):
        mock_create.side_effect = lambda *args, **kwargs: MagicMock(
            detect=MagicMock(return_value=_make_detections(1))
        )

        from app.services.face_detector import FaceDetector

        detector = FaceDetector()
        frame = np.zeros((240, 320, 3), dtype=np.uint8)

        def work():
            detector.count_faces(frame)

        threads = [threading.Thread(target=work) for _ in range(3)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert mock_create.call_count == 3


def test_detector_is_reused_within_one_thread():
    """Модель не должна пересоздаваться на каждый кадр — это дорого."""
    with (
        patch("app.services.face_detector.vision.FaceDetector.create_from_options") as mock_create,
        patch("app.services.face_detector.mp_python.BaseOptions"),
        patch("app.services.face_detector.vision.FaceDetectorOptions"),
    ):
        mock_detector = MagicMock()
        mock_detector.detect.return_value = _make_detections(1)
        mock_create.return_value = mock_detector

        from app.services.face_detector import FaceDetector

        detector = FaceDetector()
        frame = np.zeros((240, 320, 3), dtype=np.uint8)

        for _ in range(5):
            detector.count_faces(frame)

        assert mock_create.call_count == 1


def test_face_encoding_is_serialised_by_a_lock():
    """face_recognition держит модели dlib в объектах уровня модуля."""
    with (
        patch("app.services.face_detector.vision.FaceDetector.create_from_options"),
        patch("app.services.face_detector.mp_python.BaseOptions"),
        patch("app.services.face_detector.vision.FaceDetectorOptions"),
        patch("app.services.face_detector.face_recognition.face_encodings") as mock_encodings,
    ):
        from app.services.face_detector import FaceDetector

        detector = FaceDetector()
        overlaps = []

        def encodings_spy(_frame):
            # Замок захвачен на всё время вызова, значит попытка захватить его
            # отсюда же должна провалиться.
            overlaps.append(detector._encoding_lock.acquire(blocking=False))
            if overlaps[-1]:
                detector._encoding_lock.release()
            return []

        mock_encodings.side_effect = encodings_spy

        detector.get_face_encoding(np.zeros((240, 320, 3), dtype=np.uint8))

        assert overlaps == [False]
