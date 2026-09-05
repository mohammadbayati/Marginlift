#!/usr/bin/env bash
# Manual production deploy — use this while GitHub Actions is blocked on this account.
# Run from the repo root: bash ops/push-to-production.sh
set -Eeuo pipefail

VM_HOST="${VM_HOST:-91.107.190.221}"
VM_USER="${VM_USER:-root}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/marginlift_deploy}"
APP_DIR="${APP_DIR:-/opt/marginlift}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TMP_TAR="$(mktemp -t marginlift-release-XXXXXX.tar.gz)"
trap 'rm -f "$TMP_TAR"' EXIT

echo "==> Running tests"
npm test

echo "==> Packaging release"
tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='data/db.json' \
  --exclude='data/backups' \
  --exclude='backups' \
  --exclude='data/artifacts' \
  --exclude='qa-*.png' \
  --exclude='.agents' \
  --exclude='.impeccable' \
  --exclude='skills-lock.json' \
  -czf "$TMP_TAR" .

echo "==> Uploading to $VM_USER@$VM_HOST"
scp -i "$SSH_KEY" "$TMP_TAR" "$VM_USER@$VM_HOST:/tmp/marginlift-release.tar.gz"

echo "==> Deploying on server"
ssh -i "$SSH_KEY" "$VM_USER@$VM_HOST" bash -s <<REMOTE
set -Eeuo pipefail
APP_DIR="$APP_DIR"
cd "\$APP_DIR"

cp .env /root/marginlift.env.backup
cp data/db.json /root/marginlift-db.backup.json 2>/dev/null || true

tar -xzf /tmp/marginlift-release.tar.gz -C "\$APP_DIR"
cp /root/marginlift.env.backup "\$APP_DIR/.env"
test ! -f /root/marginlift-db.backup.json || cp /root/marginlift-db.backup.json "\$APP_DIR/data/db.json"
rm -f /tmp/marginlift-release.tar.gz

chmod +x ops/vm/deploy.sh ops/vm/backup.sh
./ops/vm/deploy.sh
REMOTE

echo "==> Verifying public site"
curl --fail --retry 5 --retry-delay 5 https://marginlift.ir/ > /dev/null
curl --fail --retry 5 --retry-delay 5 https://marginlift.ir/api/health

echo ""
echo "Deploy complete."
