#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MARGINLIFT_APP_DIR:-/opt/marginlift}"
cd "$APP_DIR"

docker compose -f docker-compose.production.yml exec -T app node scripts/generate-monthly-report.js "$@"
printf '\nMarginLift monthly report generated.\n'
