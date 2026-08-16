#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MARGINLIFT_APP_DIR:-/opt/marginlift}"
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi

install -m 0644 "$APP_DIR/ops/systemd/marginlift-retrain.service" /etc/systemd/system/marginlift-retrain.service
install -m 0644 "$APP_DIR/ops/systemd/marginlift-retrain.timer" /etc/systemd/system/marginlift-retrain.timer
systemctl daemon-reload
systemctl enable --now marginlift-retrain.timer
systemctl is-enabled marginlift-retrain.timer
systemctl is-active marginlift-retrain.timer
