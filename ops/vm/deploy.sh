#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MARGINLIFT_APP_DIR:-/opt/marginlift}"
cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "Missing $APP_DIR/.env. Copy .env.example and set production values first." >&2
  exit 1
fi

for key in SESSION_SECRET POSTGRES_PASSWORD ARTIFACT_ENCRYPTION_KEY APP_ORIGIN; do
  if ! grep -q "^${key}=." .env; then
    echo "Missing required production setting: $key" >&2
    exit 1
  fi
done

docker compose -f docker-compose.production.yml build --pull
docker compose -f docker-compose.production.yml up -d postgres
docker compose -f docker-compose.production.yml run --rm app npm run db:migrate
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps

docker compose -f docker-compose.production.yml exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
printf '\nMarginLift VM deployment is healthy.\n'
