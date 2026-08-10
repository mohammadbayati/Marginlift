[CmdletBinding()]
param(
  [string]$ServerHost = "188.213.196.248",
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

APP_DIR=/opt/marginlift
RELEASE=/tmp/marginlift-release.tar.gz
CHECKSUM=/tmp/marginlift-release.sha256

cd /tmp
sha256sum --check "$CHECKSUM"

cd "$APP_DIR"
cp .env /root/marginlift.env.backup
if docker compose -f docker-compose.production.yml ps --status running postgres 2>/dev/null | grep -q postgres; then
  ./ops/vm/backup.sh
else
  cp data/db.json /root/marginlift-db.backup.json 2>/dev/null || true
fi

tar -xzf "$RELEASE" -C "$APP_DIR"
test -f "$APP_DIR/src/retention-shadow.js"
test -f "$APP_DIR/synthetic-subscription-transactions.csv"
cp /root/marginlift.env.backup "$APP_DIR/.env"
test ! -f /root/marginlift-db.backup.json || \
  cp /root/marginlift-db.backup.json "$APP_DIR/data/db.json"

chmod +x ops/vm/deploy.sh ops/vm/backup.sh
./ops/vm/deploy.sh

rm -f "$RELEASE" "$CHECKSUM"
'@
  $remotePayload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))

  ssh -i $KeyPath "${ServerUser}@${ServerHost}" "printf '%s' '$remotePayload' | base64 -d | sudo -n bash"
  Assert-NativeCommand "Remote deployment"

  Write-Host "[6/6] Verifying production..."
  $homeResponse = Invoke-WebRequest -UseBasicParsing "https://marginlift.ir/"
  $fontResponse = Invoke-WebRequest -UseBasicParsing "https://marginlift.ir/fonts/Estedad-Variable.woff2"
  $retentionSampleResponse = Invoke-WebRequest -UseBasicParsing "https://marginlift.ir/synthetic-subscription-transactions.csv"
  $healthResponse = Invoke-RestMethod -UseBasicParsing "https://marginlift.ir/api/health"
  if (
    $homeResponse.StatusCode -ne 200 -or
    $fontResponse.StatusCode -ne 200 -or
    $retentionSampleResponse.StatusCode -ne 200 -or
    $healthResponse.data.status -ne "ok" -or
    $healthResponse.data.storage.driver -ne "postgres"
  ) {
    throw "Production verification failed."
  }

  Write-Host "MarginLift deployment completed successfully." -ForegroundColor Green
}
finally {
  Remove-Item -LiteralPath $archive, $checksum -Force -ErrorAction SilentlyContinue
  Pop-Location
}
