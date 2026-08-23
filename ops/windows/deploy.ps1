[CmdletBinding()]
param(
  [string]$ServerHost = "91.107.139.20",
  [string]$ServerUser = "ubuntu",
  [string]$KeyPath = (Join-Path $HOME ".ssh\marginlift_deploy")
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$archive = Join-Path $env:TEMP "marginlift-release.tar.gz"
$checksum = Join-Path $env:TEMP "marginlift-release.sha256"

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
  Write-Host "[1/6] Running tests..."
  npm test
  Assert-NativeCommand "Tests"

  # Sales deliverables are excluded from the production archive and may be open in Word.
  $changes = git status --porcelain -- . ':(exclude)business/**'
  Assert-NativeCommand "Git status"
  if ($changes) {
    throw "The repository has uncommitted changes. Commit them before deployment."
  }

  Write-Host "[2/6] Pushing main to GitHub..."
  git push origin main
  Assert-NativeCommand "Git push"

  Write-Host "[3/6] Building release archive..."
  Remove-Item -LiteralPath $archive, $checksum -Force -ErrorAction SilentlyContinue
  git archive `
    --format=tar.gz `
    --output=$archive `
    HEAD `
    -- . ':(exclude)business/**'
  Assert-NativeCommand "Release archive"

  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
  "$hash  /tmp/marginlift-release.tar.gz" | Set-Content -LiteralPath $checksum -Encoding ascii

  Write-Host "[4/6] Uploading release to VM..."
  scp -i $KeyPath $archive $checksum "${ServerUser}@${ServerHost}:/tmp/"
  Assert-NativeCommand "Release upload"

  Write-Host "[5/6] Deploying containers..."
$remoteScript = @'
set -Eeuo pipefail
trap 'rm -f /tmp/marginlift-remote-deploy.sh' EXIT

APP_DIR=/opt/marginlift
RELEASE=/tmp/marginlift-release.tar.gz
CHECKSUM=/tmp/marginlift-release.sha256
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
STAGE_DIR="$(mktemp -d /opt/marginlift-stage.XXXXXX)"
PREVIOUS_DIR="/opt/marginlift-previous-$STAMP"

cd /tmp
sha256sum --check "$CHECKSUM"

cd "$APP_DIR"
find "$APP_DIR/ops/vm" -maxdepth 1 -type f -name '*.sh' -exec sed -i 's/\r$//' {} +
cp .env /root/marginlift.env.backup
if docker compose -f docker-compose.production.yml ps --status running postgres 2>/dev/null | grep -q postgres; then
  ./ops/vm/backup.sh
else
  cp data/db.json /root/marginlift-db.backup.json 2>/dev/null || true
fi

tar -xzf "$RELEASE" -C "$STAGE_DIR"
find "$STAGE_DIR/ops/vm" -maxdepth 1 -type f -name '*.sh' -exec sed -i 's/\r$//' {} +
test -f "$STAGE_DIR/src/retention-shadow.js"
test -f "$STAGE_DIR/synthetic-subscription-transactions.csv"
cp /root/marginlift.env.backup "$STAGE_DIR/.env"
mkdir -p "$STAGE_DIR/data" "$STAGE_DIR/backups" "$STAGE_DIR/private/fonts"
cp -a "$APP_DIR/data/." "$STAGE_DIR/data/" 2>/dev/null || true
cp -a "$APP_DIR/backups/." "$STAGE_DIR/backups/" 2>/dev/null || true
cp -a "$APP_DIR/private/fonts/." "$STAGE_DIR/private/fonts/" 2>/dev/null || true
test ! -f /root/marginlift-db.backup.json || \
  cp /root/marginlift-db.backup.json "$STAGE_DIR/data/db.json"

chmod +x "$STAGE_DIR/ops/vm/deploy.sh" "$STAGE_DIR/ops/vm/backup.sh" "$STAGE_DIR/ops/vm/verify-backup.sh" "$STAGE_DIR/ops/vm/install-backup-timer.sh"
# Reuse BuildKit layers during routine releases so deploys stay predictable on
# the cost-optimized production VM.
docker build --tag marginlift-app:latest "$STAGE_DIR"
docker run --rm --entrypoint sh marginlift-app:latest -lc \
  'test -f /app/src/retention-shadow.js && test -f /app/synthetic-subscription-transactions.csv'

mv "$APP_DIR" "$PREVIOUS_DIR"
mv "$STAGE_DIR" "$APP_DIR"

cd "$APP_DIR"
chmod +x ops/vm/deploy.sh ops/vm/backup.sh ops/vm/verify-backup.sh ops/vm/install-backup-timer.sh
docker compose -f docker-compose.production.yml up -d postgres
timeout 120s docker compose -f docker-compose.production.yml run --rm app npm run db:migrate
docker compose -f docker-compose.production.yml up -d --force-recreate app
docker compose -f docker-compose.production.yml up -d caddy
docker compose -f docker-compose.production.yml exec -T app \
  sh -lc 'test -f /app/src/retention-shadow.js && test -f /app/synthetic-subscription-transactions.csv'
docker compose -f docker-compose.production.yml exec -T app node -e \
  "fetch('http://127.0.0.1:3000/api/health').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
./ops/vm/backup.sh
./ops/vm/verify-backup.sh
./ops/vm/install-backup-timer.sh
docker compose -f docker-compose.production.yml ps

rm -f "$RELEASE" "$CHECKSUM"
'@
  $remoteScript = $remoteScript -replace "`r`n", "`n"
  $remotePayload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))

  # Execute from a file so Docker commands cannot consume the remaining script via stdin.
  ssh -i $KeyPath "${ServerUser}@${ServerHost}" "printf '%s' '$remotePayload' | base64 -d > /tmp/marginlift-remote-deploy.sh && sudo -n bash /tmp/marginlift-remote-deploy.sh"
  Assert-NativeCommand "Remote deployment"

  Write-Host "[6/6] Verifying production..."
  $homeResponse = Invoke-WebRequest -UseBasicParsing "https://marginlift.ir/"
  $fontResponse = Invoke-WebRequest -UseBasicParsing "https://marginlift.ir/fonts/marginlift-font.css"
  $retentionSampleResponse = Invoke-WebRequest -UseBasicParsing "https://marginlift.ir/synthetic-subscription-transactions.csv"
  $healthResponse = Invoke-RestMethod -UseBasicParsing "https://marginlift.ir/api/health"
  if (
    $homeResponse.StatusCode -ne 200 -or
    $fontResponse.StatusCode -ne 200 -or
    $retentionSampleResponse.StatusCode -ne 200 -or
    $healthResponse.data.status -ne "ok" -or
    $healthResponse.data.service -ne "marginlift"
  ) {
    throw "Production verification failed."
  }

  Write-Host "MarginLift deployment completed successfully." -ForegroundColor Green
}
finally {
  Remove-Item -LiteralPath $archive, $checksum -Force -ErrorAction SilentlyContinue
  Pop-Location
}
