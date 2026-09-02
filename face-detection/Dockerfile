FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/face

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libgl1 \
    libglib2.0-0 \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /face

RUN pip install --no-cache-dir uv

# Dependency layer — cached unless pyproject.toml / uv.lock change
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --no-install-project
RUN uv pip install git+https://github.com/ageitgey/face_recognition_models

# MobileFaceNet (InsightFace buffalo_s). Модель кладём в образ, а не тянем
# при старте: сервис должен подниматься без доступа в интернет, а тихая
# загрузка на старте означала бы, что первый экзамен упадёт из-за чужого CDN.
# Из архива нужен ровно один файл — остальные модели набора не используются.
RUN mkdir -p /face/models \
    && curl -fsSL -o /tmp/buffalo_s.zip \
       https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_s.zip \
    && python -c "import zipfile; zipfile.ZipFile('/tmp/buffalo_s.zip').extract('w600k_mbf.onnx', '/face/models')" \
    && rm /tmp/buffalo_s.zip

# Application code — changes on every commit, rebuilds quickly
COPY . .
RUN uv sync --no-dev

# Fix face_recognition_models __init__.py as requested by user
RUN printf 'import os\n\ndef _model_path(filename):\n    return os.path.join(os.path.dirname(__file__), "models", filename)\n\ndef pose_predictor_model_location():\n    return _model_path("shape_predictor_68_face_landmarks.dat")\n\ndef pose_predictor_five_point_model_location():\n    return _model_path("shape_predictor_5_face_landmarks.dat")\n\ndef face_recognition_model_location():\n    return _model_path("dlib_face_recognition_resnet_model_v1.dat")\n\ndef cnn_face_detector_model_location():\n    return _model_path("mmod_human_face_detector.dat")\n' > .venv/lib/python3.12/site-packages/face_recognition_models/__init__.py

# Add .venv binaries to PATH so uvicorn is found directly
ENV PATH="/face/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
