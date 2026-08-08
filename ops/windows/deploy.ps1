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

  $changes = git status --porcelain
  Assert-NativeCommand "Git status"
  if ($changes) {
    throw "The repository has uncommitted changes. Commit them before deployment."
  }

  Write-Host "[2/6] Pushing main to GitHub..."
  git push origin main
  Assert-NativeCommand "Git push"

  Write-Host "[3/6] Building release archive..."
  Remove-Item -LiteralPath $archive, $checksum -Force -ErrorAction SilentlyContinue
  tar `
    --exclude=.git `
    --exclude=node_modules `
    --exclude=.env `
    --exclude=data/db.json `
    --exclude=data/backups `
    --exclude=qa-*.png `
    --exclude=.agents `
    --exclude=.impeccable `
    --exclude=skills-lock.json `
    -czf $archive .
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
cp data/db.json /root/marginlift-db.backup.json 2>/dev/null || true

tar -xzf "$RELEASE" -C "$APP_DIR"
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
  if ($homeResponse.StatusCode -ne 200 -or $fontResponse.StatusCode -ne 200) {
    throw "Production verification failed."
  }

  Write-Host "MarginLift deployment completed successfully." -ForegroundColor Green
}
finally {
  Remove-Item -LiteralPath $archive, $checksum -Force -ErrorAction SilentlyContinue
  Pop-Location
}
