#!/bin/bash
#
# Simple Deployment Script
# Usage: ./scripts/deploy.sh  /  make deploy
#
#   1. Build new images
#   2. Apply database migrations (one-shot container)
#   3. Recreate all services
#

set -euo pipefail

# Make BuildKit + compose CLI build explicit so cache_from / inline cache work
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE="docker compose -f $PROJECT_DIR/docker-compose.yml"

ROLLBACK_SERVICES=(nusmt-backend nusmt-frontend)
ROLLBACK_PERFORMED=0

# ─── Rollback: restore previous :latest images and recreate services ────────
rollback() {
    if [ "$ROLLBACK_PERFORMED" -eq 1 ]; then
        return
    fi
    ROLLBACK_PERFORMED=1
    echo ""
    echo "🔄 ROLLING BACK to previous images..."
    local reverted=0
    for service in "${ROLLBACK_SERVICES[@]}"; do
        if docker image inspect "${service}:rollback" >/dev/null 2>&1; then
            docker tag "${service}:rollback" "${service}:latest"
            echo "  ✓ ${service} reverted to previous version"
            reverted=$((reverted + 1))
        else
            echo "  ⚠ ${service}:rollback tag not found — skipping (first deploy?)"
        fi
    done
    if [ "$reverted" -eq 0 ]; then
        echo "🔄 Nothing to roll back."
        return
    fi
    $COMPOSE up -d --no-build backend frontend
    echo "🔄 Rollback complete. Verifying health..."
    sleep 10
    if curl -fsS http://localhost:8000/health > /dev/null 2>&1; then
        echo "✅ Rollback successful — service is healthy"
    else
        echo "⚠️  Rollback completed but health check still fails — manual intervention required"
    fi
}

# ─── On failure: dump logs and roll back ────────────────────────────────────
on_error() {
    local exit_code=$?
    echo ""
    echo "❌ DEPLOY FAILED (exit $exit_code) — container logs follow:"
    for c in nusmt_backend nusmt_face_detection nusmt_frontend database; do
        if docker ps -a --format '{{.Names}}' | grep -q "^${c}$"; then
            echo ""
            echo "─── $c (last 40 lines) ───"
            docker logs --tail 40 "$c" 2>&1 || true
        fi
    done
    rollback
    exit $exit_code
}
trap on_error ERR

cd "$PROJECT_DIR"

# ─── Snapshot current :latest images as :rollback before rebuilding ────────
echo "📸 Tagging current images for rollback..."
for service in "${ROLLBACK_SERVICES[@]}"; do
    if docker image inspect "${service}:latest" >/dev/null 2>&1; then
        docker tag "${service}:latest" "${service}:rollback"
        echo "  ✓ ${service}:rollback tagged"
    else
        echo "  ⚠ ${service}:latest not found — first deploy, no rollback target"
    fi
done

echo ""
echo "🔨 [1/3] Building images..."

# face-detection is the expensive image (compiles dlib, downloads model weights).
# Skip rebuild when nothing in face-detection/ changed since the previous deploy.
# Hash all tracked files in face-detection/ via git's blob index and tag the
# resulting image with that hash. If the tag exists locally, reuse it.
FACE_HASH=$(git -C "$PROJECT_DIR" ls-tree -r HEAD -- face-detection/ | sha256sum | cut -c1-12)
FACE_HASH_TAG="nusmt-face-detection:${FACE_HASH}"

if docker image inspect "$FACE_HASH_TAG" >/dev/null 2>&1; then
    echo "  ✓ face-detection unchanged (${FACE_HASH}) — reusing cached image"
    docker tag "$FACE_HASH_TAG" nusmt-face-detection:latest
else
    echo "  🔨 face-detection changed (${FACE_HASH}) — building..."
    $COMPOSE build face-detection
    docker tag nusmt-face-detection:latest "$FACE_HASH_TAG"
fi

# Build backend + frontend serially (parallel thrashes the self-hosted runner's
# disk and triggers the "extracting same layer forever" loop).
echo "  🔨 backend..."
$COMPOSE build backend
echo "  🔨 frontend..."
$COMPOSE build frontend

echo ""
echo "🗄️  [2/3] Applying database migrations..."
$COMPOSE up -d --no-build database redis
for i in $(seq 1 30); do
    if docker exec database pg_isready -U "${POSTGRES_USER:-postgres}" > /dev/null 2>&1; then break; fi
    sleep 2
done

# Бэкап базы ПЕРЕД миграциями: без свежего дампа изменение схемы не запускаем.
# Дампы копятся в ./backups, храним последние 10, чтобы не забить диск.
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/pre_deploy_$(date +%Y%m%d_%H%M%S).sql.gz"
echo "  💾 Backing up database to $BACKUP_FILE ..."
if docker exec database sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$BACKUP_FILE"; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    if [ ! -s "$BACKUP_FILE" ]; then
        echo "  ❌ Backup file is empty — aborting before migrations."
        exit 1
    fi
    echo "  ✅ Backup done ($BACKUP_SIZE)"
    ls -1t "$BACKUP_DIR"/pre_deploy_*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
else
    echo "  ❌ pg_dump failed — aborting before migrations."
    exit 1
fi

$COMPOSE run --rm --no-deps backend sh -c "cd /face/app && uv run alembic upgrade head"

echo ""
echo "🚀 [3/3] Starting all services..."
$COMPOSE up -d --no-build --remove-orphans

echo ""
echo "🧹 Pruning dangling images..."
docker image prune -f > /dev/null

echo ""
echo "🔬 Verifying backend health..."
HEALTH_OK=0
for i in $(seq 1 30); do
    if curl -fsS http://localhost:8000/health > /dev/null 2>&1; then
        echo "✅ Backend healthy after ${i} attempt(s)"
        HEALTH_OK=1
        break
    fi
    sleep 2
done

if [ "$HEALTH_OK" -ne 1 ]; then
    echo "❌ Backend health check failed after 60s"
    exit 1   # → trap → rollback
fi

echo ""
echo "✅ Deployment complete!"
$COMPOSE ps
