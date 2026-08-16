#!/usr/bin/env bash
# Run the retraining loop inside the scorer container. If the production model
# pointer changed (exit 10), restart the scorer so it loads the new champion.
set -Eeuo pipefail

APP_DIR="${MARGINLIFT_APP_DIR:-/opt/marginlift}"
cd "$APP_DIR"

set +e
docker compose -f docker-compose.production.yml exec -T shadow-scorer python -m mlops.retrain
code=$?
set -e

if [[ "$code" -eq 10 ]]; then
  echo "production model changed — restarting shadow-scorer"
  docker compose -f docker-compose.production.yml restart shadow-scorer
  printf '\nMarginLift retraining promoted a new model.\n'
elif [[ "$code" -eq 0 ]]; then
  printf '\nMarginLift retraining kept the current champion.\n'
else
  echo "retraining failed (exit $code)" >&2
  exit "$code"
fi
