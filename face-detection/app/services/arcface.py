"""MobileFaceNet (ArcFace oilasi) orqali yuz vektori.

Nega dlib oʻrniga. dlib'ning ResNet'i bitta vektorni ~113 ms da hisoblaydi
(yuzsiz kadrda oʻlchangan pastki chegara; haqiqiy yuzda 150-250 ms) va
``face_recognition`` modellari jarayon darajasida umumiy boʻlgani uchun
chaqiruvlar qulf ostida ketma-ket bajariladi. Natijada bir vaqtda 25-44
talabadan koʻpi sigʻmasdi. MobileFaceNet oʻsha ishni **16 ms** da bajaradi
va ONNX seansi parallel chaqiruvga chidaydi.

Diqqat: «ONNX» oʻzi tezlik kafolatlamaydi. Oʻsha oiladagi ArcFace R50 ayni
mashinada **239 ms** koʻrsatdi, yaʼni dlib'dan ikki barobar sekin. Yutuq
model tanlashda — shuning uchun bu yerda aynan MobileFaceNet (13.6 MB).

Tekislash haqida. ArcFace modellari yuz kesigi maʼlum tartibda burilgan va
masshtablangan boʻlishini kutadi. Odatda buning uchun alohida detektor
(SCRFD) ishlatiladi, lekin bizda MediaPipe allaqachon har kadrda ishlaydi va
kalit nuqtalarni bepul beradi — qoʻshimcha model yuklash 5 ms qoʻshardi.
MediaPipe koʻzlar, burun va ogʻiz **markazini** beradi, ArcFace shabloni esa
ogʻiz **burchaklarini** kutadi; shuning uchun toʻrtinchi nuqta sifatida
shablondagi ikki burchakning oʻrtasi olinadi. Bu kanonik tekislashning aniq
nusxasi emas — shu sababli chegara ``scripts/calibrate_threshold.py`` bilan
oʻlchanadi, koʻchirib qoʻyilmaydi.
"""

from __future__ import annotations

import threading

import cv2
import numpy as np
import onnxruntime as ort

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

#: ArcFace kesigining standart oʻlchami.
INPUT_SIZE = 112

#: 112x112 kesikdagi kanonik nuqtalar: chap koʻz, oʻng koʻz, burun,
#: chap ogʻiz burchagi, oʻng ogʻiz burchagi. InsightFace shabloni.
_TEMPLATE = np.array(
    [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ],
    dtype=np.float32,
)

#: MediaPipe ogʻiz markazini beradi — shablonda unga ikki burchakning
#: oʻrtasi mos keladi.
_TEMPLATE_MOUTH_CENTER = _TEMPLATE[3:5].mean(axis=0)

#: MediaPipe BlazeFace nuqtalari tartibi. Nomlar **tasvir** boʻyicha, anatomik
#: emas: nuqta 0 tasvirning chap yarmida turadi (odamning oʻng koʻzi). Shablon
#: ham tasvir koordinatalarida — chalkashtirilsa yuz koʻzguga tushadi va
#: vektorlar odamlarni ajratmay qoʻyadi.
_KP_EYE_LEFT_IN_IMAGE, _KP_EYE_RIGHT_IN_IMAGE, _KP_NOSE, _KP_MOUTH = 0, 1, 2, 3


def _similarity_transform(source: np.ndarray, target: np.ndarray) -> np.ndarray | None:
    """Umeyama usuli: eng kichik kvadratlar boʻyicha oʻxshashlik almashtirishi.

    Nega OpenCV'ning ``estimateAffinePartial2D`` emas: u RANSAC yoki LMEDS
    bilan ishlaydi, ular esa chetdagi nuqtalarni tashlab yuboradigan usullar
    va toʻrtta nuqtada ishonchsiz — natijada yuz kesikda juda kichik boʻlib
    qolgan edi. Bu yerda chetdagi nuqta yoʻq: toʻrttasi ham kerak, va aniq
    yechim kerak.
    """
    count = source.shape[0]
    source_mean = source.mean(axis=0)
    target_mean = target.mean(axis=0)
    source_centered = source - source_mean
    target_centered = target - target_mean

    covariance = target_centered.T @ source_centered / count
    u, singular, vt = np.linalg.svd(covariance)

    signs = np.ones(2)
    if np.linalg.det(covariance) < 0:
        signs[1] = -1

    rotation = u @ np.diag(signs) @ vt
    variance = source_centered.var(axis=0).sum()
    if variance == 0:
        return None
    scale = float((singular * signs).sum() / variance)

    matrix = np.zeros((2, 3), dtype=np.float32)
    matrix[:, :2] = scale * rotation
    matrix[:, 2] = target_mean - scale * rotation @ source_mean
    return matrix


def align(frame: np.ndarray, keypoints) -> np.ndarray | None:
    """Kadrni kalit nuqtalar boʻyicha 112x112 kesikka keltiradi.

    Oʻxshashlik almashtirishi (burilish, masshtab, siljish) qoʻllanadi —
    yuzning shaklini buzmaydi, faqat uni shablon holatiga keltiradi.
    """
    if keypoints is None or len(keypoints) < 4:
        return None

    height, width = frame.shape[:2]
    try:
        source = np.array(
            [
                [keypoints[_KP_EYE_LEFT_IN_IMAGE].x * width, keypoints[_KP_EYE_LEFT_IN_IMAGE].y * height],
                [keypoints[_KP_EYE_RIGHT_IN_IMAGE].x * width, keypoints[_KP_EYE_RIGHT_IN_IMAGE].y * height],
                [keypoints[_KP_NOSE].x * width, keypoints[_KP_NOSE].y * height],
                [keypoints[_KP_MOUTH].x * width, keypoints[_KP_MOUTH].y * height],
            ],
            dtype=np.float64,
        )
    except (AttributeError, IndexError):
        return None

    target = np.array(
        [_TEMPLATE[0], _TEMPLATE[1], _TEMPLATE[2], _TEMPLATE_MOUTH_CENTER],
        dtype=np.float64,
    )

    matrix = _similarity_transform(source, target)
    if matrix is None:
        return None

    return cv2.warpAffine(frame, matrix, (INPUT_SIZE, INPUT_SIZE), borderValue=0.0)


class ArcFaceEmbedder:
    """MobileFaceNet seansi.

    ONNX seansining ``run`` metodi oqimlarga xavfsiz, shuning uchun dlib'dagi
    kabi qulf kerak emas — aynan shu narsa bir vaqtdagi talabalar sonini
    chegaradan chiqaradi. Seans birinchi murojaatda yuklanadi: model 13.6 MB
    va uni ishga tushishda oʻqish keraksiz kechikish berardi.
    """

    def __init__(self, model_path: str | None = None) -> None:
        self._model_path = model_path or settings.arcface_model_path
        self._session: ort.InferenceSession | None = None
        self._input_name: str | None = None
        self._init_lock = threading.Lock()

    @property
    def session(self) -> ort.InferenceSession:
        if self._session is None:
            with self._init_lock:
                if self._session is None:
                    options = ort.SessionOptions()
                    options.intra_op_num_threads = settings.onnx_intra_threads
                    options.inter_op_num_threads = 1
                    session = ort.InferenceSession(
                        self._model_path, options, providers=["CPUExecutionProvider"]
                    )
                    self._input_name = session.get_inputs()[0].name
                    self._session = session
                    logger.info("ArcFace model loaded: %s", self._model_path)
        return self._session

    def embed(self, aligned_bgr: np.ndarray) -> np.ndarray:
        """Tekislangan 112x112 kesikdan normallashtirilgan vektor.

        Vektor birlik uzunlikka keltiriladi: shundan keyin kosinus
        oʻxshashlik oddiy skalyar koʻpaytmaga aylanadi va chegara
        taqqoslash arzon boʻladi.
        """
        rgb = cv2.cvtColor(aligned_bgr, cv2.COLOR_BGR2RGB)
        blob = ((rgb.astype(np.float32) - 127.5) / 127.5).transpose(2, 0, 1)[None]

        session = self.session
        output = session.run(None, {self._input_name: blob})[0][0]

        norm = np.linalg.norm(output)
        return output / norm if norm else output


def cosine_similarity(a, b) -> float:
    """Ikki vektor orasidagi oʻxshashlik: 1 = bir xil, 0 = aloqasiz.

    Vektorlar allaqachon normallashtirilgan, lekin bu yerda qayta hisoblanadi:
    funksiya normallashtirilmagan vektor bilan ham chaqirilsa, jimgina
    notoʻgʻri son qaytarish oʻrniga toʻgʻri javob bersin.
    """
    a = np.asarray(a, dtype=np.float32)
    b = np.asarray(b, dtype=np.float32)
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(a @ b / denominator) if denominator else 0.0
