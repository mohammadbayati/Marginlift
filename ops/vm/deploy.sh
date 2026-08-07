#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MARGINLIFT_APP_DIR:-/opt/marginlift}"
cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "Missing $APP_DIR/.env. Copy .env.example and set production values first." >&2
  exit 1
fi

docker compose -f docker-compose.production.yml build --pull
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps

curl --fail --silent --show-error http://127.0.0.1:3000/api/health
printf '\nMarginLift VM deployment is healthy.\n'
