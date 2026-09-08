[CmdletBinding()]
param(
  [string]$ServerHost = "91.107.139.20",
  [string]$ServerUser = "ubuntu",
  [string]$KeyPath = (Join-Path $HOME ".ssh\marginlift_clean_2026"),
  [string]$Release = "v1.0-rc3",
  [string]$CommitSha = "3a9be8d3e366aae27e1a26fe47a5033f0a61b3b8"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $KeyPath)) {
  throw "SSH key was not found at $KeyPath."
}

$remoteScript = @'
set -Eeuo pipefail

APP_DIR=/opt/marginlift
STAGING_TAG_FILE=/root/marginlift-staging-current-image-tag
RELEASE="__RELEASE__"
COMMIT_SHA="__COMMIT_SHA__"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
OVERRIDE="$APP_DIR/docker-compose.release.yml"

cd "$APP_DIR"
test -s "$STAGING_TAG_FILE"
staging_tag="$(cat "$STAGING_TAG_FILE")"
staging_image="marginlift-staging-app:$staging_tag"
docker image inspect "$staging_image" >/dev/null

old_image_id="$(docker image inspect marginlift-app:latest --format '{{.Id}}')"
staging_image_id="$(docker image inspect "$staging_image" --format '{{.Id}}')"
if test "$old_image_id" != "$staging_image_id"; then
  rollback_tag="marginlift-app:rollback-$STAMP"
  docker tag "$old_image_id" "$rollback_tag"
  printf '%s\n' "$rollback_tag" > /root/marginlift-production-rollback-image
else
  rollback_tag="$(cat /root/marginlift-production-rollback-image)"
  docker image inspect "$rollback_tag" >/dev/null
fi

rollback() {
  trap - ERR
  printf 'Promotion failed; restoring %s\n' "$rollback_tag" >&2
  docker tag "$rollback_tag" marginlift-app:latest
  rm -f "$OVERRIDE"
  docker compose -f docker-compose.production.yml up -d --no-build --force-recreate app
  docker compose -f docker-compose.production.yml up -d --no-deps --force-recreate caddy
}
trap rollback ERR

./ops/vm/backup.sh
./ops/vm/verify-backup.sh

docker tag "$staging_image" "marginlift-app:$RELEASE"
docker tag "$staging_image" marginlift-app:latest

cat > "$OVERRIDE" <<YAML
services:
  app:
    image: marginlift-app:$RELEASE
    environment:
      MARGINLIFT_COMMIT_SHA: "$COMMIT_SHA"
      MARGINLIFT_RELEASE: "$RELEASE"
      MARGINLIFT_BUILD_TIMESTAMP: "$STAMP"
YAML

docker compose -f docker-compose.production.yml -f "$OVERRIDE" config >/dev/null
docker compose -f docker-compose.production.yml -f "$OVERRIDE" run --rm --no-deps app npm run db:migrate
docker compose -f docker-compose.production.yml -f "$OVERRIDE" up -d --no-build --force-recreate app
docker compose -f docker-compose.production.yml -f "$OVERRIDE" exec -T app node -e \
  "fetch('http://127.0.0.1:3000/api/health').then(async response => { const body = await response.json(); process.exit(response.ok && body.data?.status === 'ok' && body.data?.release?.release === '$RELEASE' ? 0 : 1); }).catch(() => process.exit(1))"
docker compose -f docker-compose.production.yml up -d --no-deps --force-recreate caddy
curl --fail --silent --show-error --retry 10 --retry-delay 2 https://marginlift.ir/api/health >/dev/null

trap - ERR
printf '%s\n' "$RELEASE" > /root/marginlift-production-current-release
docker compose -f docker-compose.production.yml -f "$OVERRIDE" ps
printf 'Promoted %s (%s) from %s; rollback image: %s\n' "$RELEASE" "$COMMIT_SHA" "$staging_image" "$rollback_tag"
'@

$remoteScript = $remoteScript.Replace("__RELEASE__", $Release).Replace("__COMMIT_SHA__", $CommitSha)
$remoteScript = $remoteScript -replace "`r`n", "`n"
$payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))

ssh -i $KeyPath "${ServerUser}@${ServerHost}" "printf '%s' '$payload' | base64 -d > /tmp/marginlift-promote-staging.sh && sudo -n bash /tmp/marginlift-promote-staging.sh"
if ($LASTEXITCODE -ne 0) {
  throw "Production promotion failed with exit code $LASTEXITCODE."
}

$health = Invoke-RestMethod -UseBasicParsing "https://marginlift.ir/api/health"
if (
  $health.data.status -ne "ok" -or
  $health.data.release.release -ne $Release -or
  $health.data.release.commitSha -ne $CommitSha
) {
  throw "Production release identity verification failed."
}

Write-Host "Production promotion completed: $Release" -ForegroundColor Green
