#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MARGINLIFT_APP_DIR:-/opt/marginlift}"
BACKUP_DIR="${MARGINLIFT_BACKUP_DIR:-$APP_DIR/backups}"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

docker compose -f docker-compose.production.yml exec -T postgres \
  pg_dump -U marginlift -d marginlift --format=custom \
  > "$BACKUP_DIR/postgres-$STAMP.dump"

docker compose -f docker-compose.production.yml exec -T app \
  tar -C /app/private -czf - artifacts \
  > "$BACKUP_DIR/artifacts-$STAMP.tar.gz"

chmod 600 "$BACKUP_DIR/postgres-$STAMP.dump" "$BACKUP_DIR/artifacts-$STAMP.tar.gz"
find "$BACKUP_DIR" -type f -mtime +14 -delete
printf 'MarginLift backup completed: %s\n' "$STAMP"
