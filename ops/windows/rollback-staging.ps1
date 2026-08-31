[CmdletBinding()]
param(
  [string]$ServerHost = "91.107.190.221",
  [string]$ServerUser = "root",
  [string]$KeyPath = (Join-Path $HOME ".ssh\marginlift_deploy")
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $KeyPath)) {
  throw "SSH deploy key was not found at $KeyPath."
}

$remoteScript = @'
set -Eeuo pipefail
APP_DIR=/opt/marginlift-staging
PREVIOUS_TAG_FILE=/root/marginlift-staging-previous-image-tag
CURRENT_TAG_FILE=/root/marginlift-staging-current-image-tag

test -s "$PREVIOUS_TAG_FILE"
previous_tag="$(cat "$PREVIOUS_TAG_FILE")"
current_tag="$(sed -n 's/^STAGING_IMAGE_TAG=//p' "$APP_DIR/.env" | tail -1)"
docker image inspect "marginlift-staging-app:$previous_tag" >/dev/null

sed -i "s/^STAGING_IMAGE_TAG=.*/STAGING_IMAGE_TAG=$previous_tag/" "$APP_DIR/.env"
cd "$APP_DIR"
docker compose --project-name marginlift-staging --env-file .env -f docker-compose.staging.yml up -d --force-recreate app
docker compose --project-name marginlift-staging --env-file .env -f docker-compose.staging.yml exec -T app node -e \
  "fetch('http://127.0.0.1:3000/api/health').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

printf '%s\n' "$current_tag" > "$PREVIOUS_TAG_FILE"
printf '%s\n' "$previous_tag" > "$CURRENT_TAG_FILE"
docker compose --project-name marginlift-staging --env-file .env -f docker-compose.staging.yml ps
'@

$payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))
ssh -i $KeyPath "${ServerUser}@${ServerHost}" "printf '%s' '$payload' | base64 -d > /tmp/marginlift-staging-rollback.sh && bash /tmp/marginlift-staging-rollback.sh"
if ($LASTEXITCODE -ne 0) {
  throw "Staging rollback failed with exit code $LASTEXITCODE."
}

Write-Host "Staging rollback completed successfully." -ForegroundColor Green
