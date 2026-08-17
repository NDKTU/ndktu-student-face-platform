import threading

import cv2
import face_recognition
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class FaceDetector:
    """Face detector (MediaPipe) and identity verifier (face_recognition).

    Оба вычисления тяжёлые и синхронные, поэтому вызываются из пула потоков
    (см. video_service). Отсюда требования к потокобезопасности:

    * объект MediaPipe не рассчитан на одновременные вызовы из разных потоков,
      поэтому каждый поток пула держит собственный экземпляр — модель BlazeFace
      маленькая, и несколько копий обходятся дёшево;
    * ``face_recognition`` держит модели dlib в объектах уровня модуля, общих
      для всего процесса, — их вызовы сериализуются замком.

    ``compare_faces`` замка не требует: это расстояние между векторами, без моделей.
    """

    def __init__(self) -> None:
        self._local = threading.local()
        self._encoding_lock = threading.Lock()
        logger.info("FaceDetector initialised with MediaPipe and face_recognition")

    @property
    def _detector(self) -> vision.FaceDetector:
        detector = getattr(self._local, "detector", None)
        if detector is None:
            base_options = mp_python.BaseOptions(
                model_asset_path=settings.model_path,
            )
            options = vision.FaceDetectorOptions(
                base_options=base_options,
                min_detection_confidence=settings.min_detection_confidence,
            )
            detector = vision.FaceDetector.create_from_options(options)
            self._local.detector = detector
            logger.debug("MediaPipe detector created for thread %s", threading.current_thread().name)
        return detector

    def count_faces(self, bgr_frame: np.ndarray) -> int:
        """Count the number of detected faces using MediaPipe (fast)."""
        rgb_frame = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        result = self._detector.detect(mp_image)
        return len(result.detections)

    def get_face_encoding(self, bgr_frame: np.ndarray):
        """
        Get the face encoding for the first face found in the frame.
        Used to 'lock' the user at the start of the quiz.
        """
        rgb_frame = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
        with self._encoding_lock:
            encodings = face_recognition.face_encodings(rgb_frame)
        if encodings:
            return encodings[0]
        return None

    def compare_faces(self, reference_encoding, current_encoding, tolerance=0.5) -> bool:
        """
        Compare current face encoding with the reference encoding.
        Returns True if they match.
        """
        if reference_encoding is None or current_encoding is None:
            return False

        matches = face_recognition.compare_faces([reference_encoding], current_encoding, tolerance=tolerance)
        return matches[0] if matches else False
