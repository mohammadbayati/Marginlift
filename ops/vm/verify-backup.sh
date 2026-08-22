#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MARGINLIFT_APP_DIR:-/opt/marginlift}"
BACKUP_DIR="${MARGINLIFT_BACKUP_DIR:-$APP_DIR/backups}"
STATUS_PATH="${MARGINLIFT_BACKUP_STATUS_PATH:-$BACKUP_DIR/status.json}"
STAMP="$(date -u +%Y%m%d%H%M%S)"
ISO_STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
RESTORE_DB="marginlift_restore_test_$STAMP"

cd "$APP_DIR"
LATEST_DB="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'postgres-*.dump' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)"
LATEST_ARTIFACTS="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'artifacts-*.tar.gz' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)"

test -n "$LATEST_DB" && test -s "$LATEST_DB"
test -n "$LATEST_ARTIFACTS" && test -s "$LATEST_ARTIFACTS"

cleanup() {
  docker compose -f docker-compose.production.yml exec -T postgres \
    dropdb -U marginlift --if-exists "$RESTORE_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -f docker-compose.production.yml exec -T postgres \
  createdb -U marginlift "$RESTORE_DB"
docker compose -f docker-compose.production.yml exec -T postgres \
  pg_restore -U marginlift -d "$RESTORE_DB" --exit-on-error --no-owner --no-privileges \
  < "$LATEST_DB"

STATE_ROWS="$(docker compose -f docker-compose.production.yml exec -T postgres \
  psql -U marginlift -d "$RESTORE_DB" -Atc 'SELECT COUNT(*) FROM marginlift_state;')"
test "$STATE_ROWS" = "1"
tar -tzf "$LATEST_ARTIFACTS" >/dev/null
cat > "$STATUS_PATH" <<JSON
{
  "status": "ok",
  "lastBackupAt": null,
  "lastRestoreVerifiedAt": "$ISO_STAMP",
  "latestDatabaseBackup": "$(basename "$LATEST_DB")",
  "latestArtifactBackup": "$(basename "$LATEST_ARTIFACTS")",
  "updatedAt": "$ISO_STAMP"
}
JSON
chmod 600 "$STATUS_PATH"

printf 'MarginLift backup restore verification passed: %s\n' "$(basename "$LATEST_DB")"
