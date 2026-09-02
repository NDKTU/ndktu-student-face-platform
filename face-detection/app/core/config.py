from pydantic_settings import BaseSettings, SettingsConfigDict


import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Face detection
    model_path: str = str(BASE_DIR / "blaze_face_short_range.tflite")
    sample_fps: int = 2
    min_detection_confidence: float = 0.5

    # Yuz tanish dvigateli: "dlib" (eski) yoki "onnx" (MobileFaceNet).
    #
    # Sozlama bilan almashtiriladi, kod bilan emas, chunki bu qaror
    # oʻlchovga tayanadi va orqaga qaytish bir soniyada kerak boʻlishi
    # mumkin: notoʻgʻri chegara imtihon oʻrtasida haqiqiy talabalarni
    # «boshqa odam» deb belgilay boshlaydi.
    face_engine: str = "dlib"

    # MobileFaceNet (InsightFace buffalo_s). Obraz yigʻilishida yuklanadi.
    # Vektor 512 oʻlchamli, kirish 112x112 tekislangan kesik.
    arcface_model_path: str = str(BASE_DIR / "models" / "w600k_mbf.onnx")

    # Kosinus oʻxshashlik chegarasi ("onnx" dvigateli uchun). dlib'ning 0.5
    # evklid chegarasi bu yerda hech nimani anglatmaydi — metrikasi boshqa,
    # shuning uchun qiymat scripts/calibrate_threshold.py bilan oʻlchandi.
    #
    # 200 ta haqiqiy talaba rasmi, 39 800 ta juftlik:
    #   turli odamlar  — eng yuqori oʻxshashlik 0.564, 99.99% dan pasti 0.434
    #   bir odam       — eng past oʻxshashlik 0.951
    # Ikki taqsimot orasida keng boʻshliq bor va 0.45 uning tizzasi: bundan
    # pastda notoʻgʻri qabul tez oʻsadi (0.40 da 0.16%), yuqorida esa hech
    # nima yutilmaydi. Past chekka ataylab tanlangan — «bir odam» juftliklari
    # bitta suratdan yasalgani uchun ular haqiqiydan optimistik, va haqiqiy
    # veb-kamera kadri koʻproq farq qiladi.
    arcface_threshold: float = 0.45

    # ONNX seansining ichki oqimlari. Pul allaqachon oqimlar boʻyicha
    # taqsimlaydi, shuning uchun bu yerda 1 — aks holda oqimlar oqim yasab,
    # yadrolardan oshib ketardi.
    onnx_intra_threads: int = 1

    # Upload limits
    max_file_size_mb: int = 200

    # Logging
    log_level: str = "INFO"

    # Set to True in production — disables /docs, /redoc, /openapi.json.
    is_prod: bool = False

    # Shared secret with the main backend. Required on all endpoints.
    # Value comes from env var INTERNAL_SERVICE_TOKEN.
    internal_service_token: str

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    @property
    def allowed_mime_types(self) -> set[str]:
        return {"video/mp4", "video/avi", "video/quicktime", "video/x-matroska", "video/webm"}


settings = Settings()
