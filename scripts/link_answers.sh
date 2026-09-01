#!/bin/bash
#
# Javoblarni urinishlarga bogʻlash (bir martalik)
# Usage: ./scripts/link_answers.sh [--apply]
#
# --apply'siz faqat holatni koʻrsatadi, bazani oʻzgartirmaydi.
# --apply bilan avval user_answers dampini backups/ ga oladi, keyin bogʻlaydi.
#
# Tafsilotlar — app/scripts/link_answers.py da.
#
# Qaytarish: docker exec database psql -U <user> -d <db> \
#     -c "UPDATE user_answers SET result_id = NULL"
# Skript boshqa hech narsani oʻzgartirmaydi, shuning uchun bu toʻliq tiklash.
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
    BACKUP_FILE="$BACKUP_DIR/before_link_answers_$(date +%Y-%m-%d_%H-%M-%S).sql.gz"

    mkdir -p "$BACKUP_DIR"
    echo "📦 user_answers dampi → $BACKUP_FILE"
    docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
        -t user_answers --data-only | gzip > "$BACKUP_FILE"
    echo "   $(du -h "$BACKUP_FILE" | cut -f1)"
    echo ""
fi

docker exec "$CONTAINER" sh -c \
    "cd /face && uv run python app/scripts/link_answers.py $*"
