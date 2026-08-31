[CmdletBinding()]
param(
  [string]$ServerHost = "91.107.190.221",
  [string]$ServerUser = "root",
  [string]$KeyPath = (Join-Path $HOME ".ssh\marginlift_deploy"),
  [string]$StagingDomain = "staging.marginlift.ir"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$archive = Join-Path $env:TEMP "marginlift-staging-release.tar.gz"
$checksum = Join-Path $env:TEMP "marginlift-staging-release.sha256"

function Assert-NativeCommand([string]$step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$step failed with exit code $LASTEXITCODE."
  }
}

if (-not (Test-Path -LiteralPath $KeyPath)) {
  throw "SSH deploy key was not found at $KeyPath."
}

Push-Location $repoRoot
try {
  Write-Host "[1/7] Verifying release candidate..."
  npm test
  Assert-NativeCommand "Backend tests"
  npm run web:typecheck
  Assert-NativeCommand "Frontend typecheck"
  npm run web:test
  Assert-NativeCommand "Frontend tests"
  npm run web:build
  Assert-NativeCommand "Frontend build"

  $changes = git status --porcelain -- . ':(exclude)business/**' ':(exclude)docs/**'
  Assert-NativeCommand "Git status"
  if ($changes) {
    throw "Product files have uncommitted changes. Commit them before staging deployment."
  }

  $releaseSha = (git rev-parse --short=12 HEAD).Trim()
  Assert-NativeCommand "Release SHA"

  Write-Host "[2/7] Building immutable archive for $releaseSha..."
  Remove-Item -LiteralPath $archive, $checksum -Force -ErrorAction SilentlyContinue
  git archive --format=tar.gz --output=$archive HEAD -- . ':(exclude)business/**'
  Assert-NativeCommand "Release archive"
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
  "$hash  /tmp/marginlift-staging-release.tar.gz" | Set-Content -LiteralPath $checksum -Encoding ascii

  Write-Host "[3/7] Uploading release to staging host..."
  scp -i $KeyPath $archive $checksum "${ServerUser}@${ServerHost}:/tmp/"
  Assert-NativeCommand "Release upload"

  Write-Host "[4/7] Building isolated staging containers..."
  $remoteScript = @'
set -Eeuo pipefail

APP_DIR=/opt/marginlift-staging
PROD_DIR=/opt/marginlift
RELEASE=/tmp/marginlift-staging-release.tar.gz
CHECKSUM=/tmp/marginlift-staging-release.sha256
IMAGE_TAG=__RELEASE_SHA__
STAGING_DOMAIN=__STAGING_DOMAIN__
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
STAGE_DIR="$(mktemp -d /opt/marginlift-staging-stage.XXXXXX)"

cleanup() {
  rm -f "$RELEASE" "$CHECKSUM"
  test ! -d "$STAGE_DIR" || rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

cd /tmp
sha256sum --check "$CHECKSUM"
tar -xzf "$RELEASE" -C "$STAGE_DIR"
test -f "$STAGE_DIR/docker-compose.staging.yml"
test -f "$STAGE_DIR/web/package.json"
test -f "$STAGE_DIR/ops/caddy/Caddyfile"

docker build --tag "marginlift-staging-app:$IMAGE_TAG" "$STAGE_DIR"
docker run --rm --entrypoint sh "marginlift-staging-app:$IMAGE_TAG" -lc \
  'test -f /app/web/dist/app.html && test -f /app/src/retention-ux.js'

if test -d "$APP_DIR"; then
  old_tag="$(sed -n 's/^STAGING_IMAGE_TAG=//p' "$APP_DIR/.env" 2>/dev/null | tail -1)"
  test -z "$old_tag" || printf '%s\n' "$old_tag" > /root/marginlift-staging-previous-image-tag
  cp "$APP_DIR/.env" "$STAGE_DIR/.env"
  cp -a "$APP_DIR/data" "$STAGE_DIR/data" 2>/dev/null || true
  cp -a "$APP_DIR/private" "$STAGE_DIR/private" 2>/dev/null || true
  mv "$APP_DIR" "/opt/marginlift-staging-previous-$STAMP"
else
  umask 077
  session_secret="$(openssl rand -hex 32)"
  postgres_password="$(openssl rand -hex 24)"
  artifact_key="$(openssl rand -hex 32)"
  cat > "$STAGE_DIR/.env" <<EOF
SESSION_SECRET=$session_secret
POSTGRES_PASSWORD=$postgres_password
ARTIFACT_ENCRYPTION_KEY=$artifact_key
APP_ORIGIN=https://$STAGING_DOMAIN
STAGING_IMAGE_TAG=$IMAGE_TAG
EOF
fi

if grep -q '^STAGING_IMAGE_TAG=' "$STAGE_DIR/.env"; then
  sed -i "s/^STAGING_IMAGE_TAG=.*/STAGING_IMAGE_TAG=$IMAGE_TAG/" "$STAGE_DIR/.env"
else
  printf 'STAGING_IMAGE_TAG=%s\n' "$IMAGE_TAG" >> "$STAGE_DIR/.env"
fi
if grep -q '^APP_ORIGIN=' "$STAGE_DIR/.env"; then
  sed -i "s|^APP_ORIGIN=.*|APP_ORIGIN=https://$STAGING_DOMAIN|" "$STAGE_DIR/.env"
else
  printf 'APP_ORIGIN=https://%s\n' "$STAGING_DOMAIN" >> "$STAGE_DIR/.env"
fi

mkdir -p "$STAGE_DIR/data" "$STAGE_DIR/private/fonts"
chmod 600 "$STAGE_DIR/.env"
mv "$STAGE_DIR" "$APP_DIR"

cd "$APP_DIR"
docker compose --project-name marginlift-staging --env-file .env -f docker-compose.staging.yml up -d
timeout 150s docker compose --project-name marginlift-staging --env-file .env -f docker-compose.staging.yml run --rm app npm run db:migrate
docker compose --project-name marginlift-staging --env-file .env -f docker-compose.staging.yml up -d --force-recreate app

caddy_backup="/root/Caddyfile.before-staging-$STAMP"
cp "$PROD_DIR/ops/caddy/Caddyfile" "$caddy_backup"
cp "$APP_DIR/ops/caddy/Caddyfile" "$PROD_DIR/ops/caddy/Caddyfile"
if ! docker compose -f "$PROD_DIR/docker-compose.production.yml" exec -T caddy caddy validate --config /etc/caddy/Caddyfile; then
  cp "$caddy_backup" "$PROD_DIR/ops/caddy/Caddyfile"
  exit 1
fi
docker compose -f "$PROD_DIR/docker-compose.production.yml" exec -T caddy caddy reload --config /etc/caddy/Caddyfile

docker compose --project-name marginlift-staging --env-file .env -f docker-compose.staging.yml exec -T app node -e \
  "fetch('http://127.0.0.1:3000/api/health').then(async response => { const body = await response.json(); process.exit(response.ok && body.data?.status === 'ok' ? 0 : 1); }).catch(() => process.exit(1))"
docker compose --project-name marginlift-staging --env-file .env -f docker-compose.staging.yml ps
printf '%s\n' "$IMAGE_TAG" > /root/marginlift-staging-current-image-tag
'@
  $remoteScript = $remoteScript.Replace("__RELEASE_SHA__", $releaseSha).Replace("__STAGING_DOMAIN__", $StagingDomain)
  $remotePayload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))
  ssh -i $KeyPath "${ServerUser}@${ServerHost}" "printf '%s' '$remotePayload' | base64 -d > /tmp/marginlift-staging-deploy.sh && bash /tmp/marginlift-staging-deploy.sh"
  Assert-NativeCommand "Remote staging deployment"

  Write-Host "[5/7] Waiting for DNS and TLS..."
  $deadline = (Get-Date).AddMinutes(3)
  do {
    Start-Sleep -Seconds 5
    try {
      $health = Invoke-RestMethod -UseBasicParsing "https://${StagingDomain}/api/health"
      $ready = $health.data.status -eq "ok" -and $health.data.storage.driver -eq "postgres"
    }
    catch {
      $ready = $false
    }
  } while (-not $ready -and (Get-Date) -lt $deadline)
  if (-not $ready) {
    throw "Staging DNS/TLS health check did not become ready before the timeout."
  }

  Write-Host "[6/7] Running staging smoke tests..."
  $home = Invoke-WebRequest -UseBasicParsing "https://${StagingDomain}/"
  $login = Invoke-WebRequest -UseBasicParsing "https://${StagingDomain}/login"
  $app = Invoke-WebRequest -UseBasicParsing "https://${StagingDomain}/app/today"
  if ($home.StatusCode -ne 200 -or $login.StatusCode -ne 200 -or $app.StatusCode -ne 200) {
    throw "Staging page smoke test failed."
  }
  if ($home.Headers["X-Robots-Tag"] -notmatch "noindex") {
    throw "Staging noindex header is missing."
  }

  Write-Host "[7/7] Staging is healthy: https://${StagingDomain}/" -ForegroundColor Green
}
finally {
  Remove-Item -LiteralPath $archive, $checksum -Force -ErrorAction SilentlyContinue
  Pop-Location
}
