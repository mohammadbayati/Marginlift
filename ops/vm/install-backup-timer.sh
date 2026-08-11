#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MARGINLIFT_APP_DIR:-/opt/marginlift}"
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi

install -m 0644 "$APP_DIR/ops/systemd/marginlift-backup.service" /etc/systemd/system/marginlift-backup.service
install -m 0644 "$APP_DIR/ops/systemd/marginlift-backup.timer" /etc/systemd/system/marginlift-backup.timer
systemctl daemon-reload
systemctl enable --now marginlift-backup.timer
systemctl is-enabled marginlift-backup.timer
systemctl is-active marginlift-backup.timer
