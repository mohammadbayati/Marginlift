#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MARGINLIFT_APP_DIR:-/opt/marginlift}"
BACKUP_DIR="${MARGINLIFT_BACKUP_DIR:-$APP_DIR/backups}"
STATUS_PATH="${MARGINLIFT_BACKUP_STATUS_PATH:-$BACKUP_DIR/status.json}"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"

read_status_field() {
  local field="$1"
  if [[ -f "$STATUS_PATH" ]]; then
    sed -nE "s/.*\"${field}\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\\1/p" "$STATUS_PATH" | head -1
  fi
}

json_string_or_null() {
  local value="${1:-}"
  if [[ -n "$value" && "$value" != "null" ]]; then
    printf '"%s"' "$value"
  else
    printf 'null'
  fi
}

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

docker compose -f docker-compose.production.yml exec -T postgres \
  pg_dump -U marginlift -d marginlift --format=custom \
  > "$BACKUP_DIR/postgres-$STAMP.dump"

docker compose -f docker-compose.production.yml exec -T app \
  tar -C /app/private -czf - artifacts \
  > "$BACKUP_DIR/artifacts-$STAMP.tar.gz"

LAST_RESTORE_VERIFIED_AT="$(read_status_field lastRestoreVerifiedAt)"

chmod 600 "$BACKUP_DIR/postgres-$STAMP.dump" "$BACKUP_DIR/artifacts-$STAMP.tar.gz"
cat > "$STATUS_PATH" <<JSON
{
  "status": "ok",
  "backupStatus": "ok",
  "verificationStatus": "pending",
  "lastBackupCreatedAt": "$STAMP",
  "lastRestoreVerifiedAt": $(json_string_or_null "$LAST_RESTORE_VERIFIED_AT"),
  "latestDatabaseBackup": "postgres-$STAMP.dump",
  "latestArtifactBackup": "artifacts-$STAMP.tar.gz",
  "updatedAt": "$STAMP"
}
JSON
chmod 600 "$STATUS_PATH"
find "$BACKUP_DIR" -type f -mtime +14 -delete
printf 'MarginLift backup completed: %s\n' "$STAMP"
