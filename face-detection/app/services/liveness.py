"""Jonli yuzmi — passiv anti-spoofing (MiniFASNet, Silent-Face-Anti-Spoofing).

Nega kerak. Yuz tanish faqat «kimning yuzi» degan savolga javob beradi:
kamera oldiga telefonda yoki qogʻozda HEMIS surati tutilsa, ArcFace uni
bemalol «oʻsha odam» deydi. Bu model bitta kadrdan tirik yuzni ekran va
bosma suratdan ajratadi — talabadan hech qanday harakat talab qilmaydi.

Modellar. minivision-ai'ning ikki modeli (Apache-2.0), ONNX nusxasi
``yakhyo/face-anti-spoofing`` relizidan, har biri ~1.7 MB, obraz
yigʻilishida yuklanadi (Dockerfile, SHA-256 bilan). Ikkalasi yuzni turli
kenglikda koʻradi: V2 — yuz ramkasidan 2.7 barobar, V1SE — 4.0 barobar
(fon, telefon chetlari, qogʻoz qirrasi koʻproq tushadi). Asl loyihadagi
kabi ikki modelning ehtimoli oʻrtachalanadi.

Kirish: BGR kadr (OpenCV), 80x80, 0-255 oraligʻida — normallashtirilmaydi.
Chiqish: uch sinf, **1-indeks — tirik yuz**, 0 va 2 — har xil soxta turlari.

Chegara (``settings.liveness_threshold``) oʻlchov bilan aniqlanadi, koʻchirib
qoʻyilmaydi — shuning uchun bekend dastlab faqat jurnalga yozadi
(``APP_CONFIG__FACE_SERVICE__LIVENESS_MODE=log``), bloklamaydi.
"""

from __future__ import annotations

import os
import threading

import cv2
import numpy as np
import onnxruntime as ort

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

#: Modellarning kirish oʻlchami.
INPUT_SIZE = 80

#: Chiqishdagi «tirik yuz» sinfi.
REAL_CLASS = 1


def crop_face(frame: np.ndarray, x: float, y: float, w: float, h: float, scale: float) -> np.ndarray | None:
    """Yuz ramkasini ``scale`` barobar kengaytirib qirqadi va 80x80 ga keltiradi.

    Asl loyihadagi (``crop_face``) hisobning aynan nusxasi: model shunday
    kesikda oʻrgatilgan, boshqacha kesik ehtimollarni siljitadi. Kadr chetida
    kengaytma kadr ichida qolguncha qisqaradi.
    """
    if w <= 0 or h <= 0:
        return None
    src_h, src_w = frame.shape[:2]
    scale = min((src_h - 1) / h, (src_w - 1) / w, scale)
    new_w, new_h = w * scale, h * scale
    center_x, center_y = x + w / 2, y + h / 2
    x1 = max(0, int(center_x - new_w / 2))
    y1 = max(0, int(center_y - new_h / 2))
    x2 = min(src_w - 1, int(center_x + new_w / 2))
    y2 = min(src_h - 1, int(center_y + new_h / 2))
    cropped = frame[y1 : y2 + 1, x1 : x2 + 1]
    if cropped.size == 0:
        return None
    return cv2.resize(cropped, (INPUT_SIZE, INPUT_SIZE))


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = np.exp(logits - np.max(logits, axis=1, keepdims=True))
    return shifted / shifted.sum(axis=1, keepdims=True)


class LivenessModel:
    """Ikki MiniFASNet seansi.

    ArcFace'dagi kabi: ONNX ``run`` oqimlarga xavfsiz, seans birinchi
    murojaatda yuklanadi. Model fayllari boʻlmasa (lokal ishlab chiqish,
    obraz yigʻilmagan) — tekshiruv oʻchadi va ``score`` ``None`` qaytaradi:
    jonlilik yoʻqligi uchun yuz tekshiruvini butunlay toʻxtatib boʻlmaydi.
    """

    def __init__(self, models: list[tuple[str, float]] | None = None) -> None:
        self._models = models or [
            (settings.liveness_v2_model_path, 2.7),
            (settings.liveness_v1se_model_path, 4.0),
        ]
        self._sessions: list[tuple[ort.InferenceSession, str, float]] | None = None
        self._unavailable = False
        self._init_lock = threading.Lock()

    def _load(self) -> list[tuple[ort.InferenceSession, str, float]] | None:
        if self._sessions is not None or self._unavailable:
            return self._sessions
        with self._init_lock:
            if self._sessions is not None or self._unavailable:
                return self._sessions
            missing = [path for path, _ in self._models if not os.path.exists(path)]
            if missing:
                logger.warning("Liveness disabled — model files not found: %s", ", ".join(missing))
                self._unavailable = True
                return None
            options = ort.SessionOptions()
            options.intra_op_num_threads = settings.onnx_intra_threads
            options.inter_op_num_threads = 1
            sessions = []
            for path, scale in self._models:
                session = ort.InferenceSession(path, options, providers=["CPUExecutionProvider"])
                sessions.append((session, session.get_inputs()[0].name, scale))
            self._sessions = sessions
            logger.info("Liveness models loaded: %s", ", ".join(path for path, _ in self._models))
            return self._sessions

    def score(self, bgr_frame: np.ndarray, x: float, y: float, w: float, h: float) -> float | None:
        """Tirik yuz ehtimoli (0..1), ikki model oʻrtachasi. ``None`` — baholab boʻlmadi."""
        sessions = self._load()
        if not sessions:
            return None
        probabilities = []
        for session, input_name, scale in sessions:
            face = crop_face(bgr_frame, x, y, w, h, scale)
            if face is None:
                return None
            tensor = face.astype(np.float32).transpose(2, 0, 1)[np.newaxis]
            logits = session.run(None, {input_name: tensor})[0]
            probabilities.append(_softmax(logits)[0, REAL_CLASS])
        return float(np.mean(probabilities))
