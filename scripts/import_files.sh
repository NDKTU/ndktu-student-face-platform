#!/bin/bash
#
# Mavjud fayllarni fayl kutubxonasiga koʻchirish (bir martalik)
# Usage: ./scripts/import_files.sh [--apply]
#
# --apply'siz faqat nima topilganini koʻrsatadi, bazani oʻzgartirmaydi.
# --apply bilan avval kutubxona jadvallarining dampini backups/ ga oladi,
# keyin koʻchiradi.
#
# Tafsilotlar — app/scripts/import_files.py da.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

CONTAINER="${BACKEND_CONTAINER:-nusmt_backend}"
DB_CONTAINER="${DB_CONTAINER:-database}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "❌ $CONTAINER konteyneri ishlamayapti"
    exit 1
fi

# Damp faqat haqiqiy koʻchirishdan oldin: quruq yurish bazaga tegmaydi.
# Faqat kutubxona jadvallari olinadi — skript boshqa jadvallarga yozmaydi,
# shuning uchun toʻliq damp ortiqcha.
if [[ " $* " == *" --apply "* ]]; then
    DB_USER="$(docker exec "$CONTAINER" printenv POSTGRES_USER)"
    DB_NAME="$(docker exec "$CONTAINER" printenv POSTGRES_DB)"
    BACKUP_DIR="$PROJECT_DIR/backups"
    BACKUP_FILE="$BACKUP_DIR/before_file_import_$(date +%Y-%m-%d_%H-%M-%S).sql.gz"

    mkdir -p "$BACKUP_DIR"
    echo "📦 Kutubxona jadvallari dampi → $BACKUP_FILE"
    docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
        -t file_blobs -t files -t file_folders -t file_usages --data-only | gzip > "$BACKUP_FILE"
    echo "   $(du -h "$BACKUP_FILE" | cut -f1)"
    echo ""
fi

docker exec "$CONTAINER" sh -c \
    "cd /face && uv run python app/scripts/import_files.py $*"
