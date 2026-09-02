import threading

import cv2
import face_recognition
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

from app.core.config import settings
from app.core.logging import get_logger
from app.services import arcface

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
        self._embedder = arcface.ArcFaceEmbedder()
        logger.info("FaceDetector initialised (engine=%s)", settings.face_engine)

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

    def _detect(self, bgr_frame: np.ndarray):
        rgb_frame = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        return self._detector.detect(mp_image).detections

    def count_faces(self, bgr_frame: np.ndarray) -> int:
        """Count the number of detected faces using MediaPipe (fast)."""
        return len(self._detect(bgr_frame))

    # ------------------------------------------------------------------ #
    #  Вектор лица
    # ------------------------------------------------------------------ #
    def get_face_encoding(self, bgr_frame: np.ndarray):
        """Вектор лица для сверки личности.

        Какой движок работает, решает ``settings.face_engine``. Переключатель
        нужен потому, что решение опирается на измерение, а откат может
        понадобиться мгновенно: неверный порог начинает помечать настоящих
        студентов как «другого человека» посреди экзамена.
        """
        if settings.face_engine == "onnx":
            return self._encode_onnx(bgr_frame)
        return self._encode_dlib(bgr_frame)

    def _encode_onnx(self, bgr_frame: np.ndarray):
        """MediaPipe находит лицо и точки, MobileFaceNet считает вектор.

        Детектор здесь тот же, что и для подсчёта лиц, — отдельная модель
        добавила бы к каждому вызову лишние миллисекунды, а ключевые точки
        MediaPipe отдаёт даром.
        """
        detections = self._detect(bgr_frame)
        if not detections:
            return None

        # Кадр может захватить лицо соседа с краю; берём самое уверенное.
        best = max(detections, key=lambda d: d.categories[0].score if d.categories else 0.0)

        aligned = arcface.align(bgr_frame, best.keypoints)
        if aligned is None:
            logger.debug("Face alignment failed — not enough keypoints")
            return None

        return self._embedder.embed(aligned)

    def _encode_dlib(self, bgr_frame: np.ndarray):
        rgb_frame = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
        with self._encoding_lock:
            encodings = face_recognition.face_encodings(rgb_frame)
        return encodings[0] if encodings else None

    def compare_faces(self, reference_encoding, current_encoding, tolerance: float | None = None) -> bool:
        """Совпадают ли два лица.

        Смысл ``tolerance`` зависит от движка и переносить его между ними
        нельзя: у dlib это евклидово расстояние по 128 числам (меньше —
        совпало), у ArcFace — косинусная близость по 512 (больше — совпало).
        Поэтому ``None`` означает «взять порог своего движка», а не 0.5.
        """
        if reference_encoding is None or current_encoding is None:
            return False

        if settings.face_engine == "onnx":
            threshold = settings.arcface_threshold if tolerance is None else tolerance
            return arcface.cosine_similarity(reference_encoding, current_encoding) >= threshold

        matches = face_recognition.compare_faces(
            [reference_encoding], current_encoding, tolerance=0.5 if tolerance is None else tolerance
        )
        return bool(matches[0]) if matches else False
