FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/face
ENV UV_NO_SYNC=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /face

RUN pip install --no-cache-dir uv

# Dependency layer — cached unless pyproject.toml / uv.lock change
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --no-install-project

# Application code — changes on every commit, rebuilds quickly
COPY . .
RUN uv sync --no-dev

EXPOSE 8000

CMD ["uv", "run", "--no-dev", "--no-sync", "app/main.py"]
