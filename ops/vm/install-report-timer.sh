#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MARGINLIFT_APP_DIR:-/opt/marginlift}"
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi

install -m 0644 "$APP_DIR/ops/systemd/marginlift-report.service" /etc/systemd/system/marginlift-report.service
install -m 0644 "$APP_DIR/ops/systemd/marginlift-report.timer" /etc/systemd/system/marginlift-report.timer
systemctl daemon-reload
systemctl enable --now marginlift-report.timer
systemctl is-enabled marginlift-report.timer
systemctl is-active marginlift-report.timer
