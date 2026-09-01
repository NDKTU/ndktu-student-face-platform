#!/bin/bash
#
# Natijalar sanasini javoblardan tiklash (bir martalik)
# Usage: ./scripts/restore_result_dates.sh [--apply]
#
# --apply'siz faqat holatni koʻrsatadi, bazani oʻzgartirmaydi.
# --apply bilan avval results dampini backups/ ga oladi, keyin bogʻlaydi.
#
# Tafsilotlar — app/scripts/restore_result_dates.py da.
#
# DIQQAT: bu skript link_answers.sh dan KEYIN ishlatiladi va mavjud
# maʼlumot ustiga yozadi (results.created_at / finished_at). Qaytarish faqat
# damp orqali — shuning uchun --apply har safar damp oladi.
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

# Damp faqat haqiqiy bogʻlashdan oldin: quruq yurish bazaga tegmaydi.
if [[ " $* " == *" --apply "* ]]; then
    DB_USER="$(docker exec "$CONTAINER" printenv POSTGRES_USER)"
    DB_NAME="$(docker exec "$CONTAINER" printenv POSTGRES_DB)"
    BACKUP_DIR="$PROJECT_DIR/backups"
    BACKUP_FILE="$BACKUP_DIR/before_restore_result_dates_$(date +%Y-%m-%d_%H-%M-%S).sql.gz"

    mkdir -p "$BACKUP_DIR"
    echo "📦 results dampi → $BACKUP_FILE"
    docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
        -t results --data-only | gzip > "$BACKUP_FILE"
    echo "   $(du -h "$BACKUP_FILE" | cut -f1)"
    echo ""
fi

docker exec "$CONTAINER" sh -c \
    "cd /face && uv run python app/scripts/restore_result_dates.py $*"
