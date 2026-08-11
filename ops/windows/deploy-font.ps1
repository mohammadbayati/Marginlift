[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$FontPath,
  [Parameter(Mandatory = $true)][string]$LicensePath,
  [Parameter(Mandatory = $true)][string]$LicenseHolder,
  [Parameter(Mandatory = $true)][string]$LicenseReference,
  [Parameter(Mandatory = $true)][switch]$ConfirmWebEmbedding,
  [string]$ServerHost = "188.213.196.248",
  [string]$ServerUser = "ubuntu",
  [string]$KeyPath = (Join-Path $HOME ".ssh\marginlift_deploy")
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$privateFontDir = Join-Path $repoRoot "private\fonts"

if (-not (Test-Path -LiteralPath $FontPath)) { throw "Font file was not found: $FontPath" }
if (-not (Test-Path -LiteralPath $LicensePath)) { throw "License file was not found: $LicensePath" }
if (-not (Test-Path -LiteralPath $KeyPath)) { throw "SSH deploy key was not found: $KeyPath" }
if (-not $ConfirmWebEmbedding) { throw "Web embedding permission must be explicitly confirmed." }

Push-Location $repoRoot
try {
  Write-Host "[1/4] Validating licensed font and evidence..."
  node scripts/install-iransansx.js $FontPath `
    "--license=$LicensePath" `
    "--license-holder=$LicenseHolder" `
    "--license-reference=$LicenseReference" `
    --confirm-web-embedding
  if ($LASTEXITCODE -ne 0) { throw "Font validation failed." }

  Write-Host "[2/4] Uploading private font assets..."
  scp -i $KeyPath `
    (Join-Path $privateFontDir "IRANSansX-Variable.woff2") `
    (Join-Path $privateFontDir "IRANSansX-LICENSE.txt") `
    (Join-Path $privateFontDir "IRANSansX-license.json") `
    "${ServerUser}@${ServerHost}:/tmp/"
  if ($LASTEXITCODE -ne 0) { throw "Font upload failed." }

  Write-Host "[3/4] Activating font on MarginLift..."
  $remoteScript = @'
set -Eeuo pipefail
install -d -m 0755 /opt/marginlift/private/fonts
install -m 0644 /tmp/IRANSansX-Variable.woff2 /opt/marginlift/private/fonts/IRANSansX-Variable.woff2
install -m 0644 /tmp/IRANSansX-LICENSE.txt /opt/marginlift/private/fonts/IRANSansX-LICENSE.txt
install -m 0644 /tmp/IRANSansX-license.json /opt/marginlift/private/fonts/IRANSansX-license.json
rm -f /tmp/IRANSansX-Variable.woff2 /tmp/IRANSansX-LICENSE.txt /tmp/IRANSansX-license.json
cd /opt/marginlift
docker compose -f docker-compose.production.yml up -d --force-recreate app
docker compose -f docker-compose.production.yml exec -T app node -e "fetch('http://127.0.0.1:3000/api/font-status').then(r => r.json()).then(x => process.exit(x.data.ready && x.data.activeFamily === 'IRANSansX' ? 0 : 1)).catch(() => process.exit(1))"
'@
  $remotePayload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))
  ssh -i $KeyPath "${ServerUser}@${ServerHost}" "printf '%s' '$remotePayload' | base64 -d > /tmp/marginlift-font-install.sh && sudo -n bash /tmp/marginlift-font-install.sh && rm -f /tmp/marginlift-font-install.sh"
  if ($LASTEXITCODE -ne 0) { throw "Remote font activation failed." }

  Write-Host "[4/4] Verifying browser-facing font status..."
  $status = Invoke-RestMethod -UseBasicParsing "https://marginlift.ir/api/font-status"
  $fontResponse = Invoke-WebRequest -UseBasicParsing "https://marginlift.ir/fonts/IRANSansX-Variable.woff2"
  if (-not $status.data.ready -or $status.data.activeFamily -ne "IRANSansX" -or $fontResponse.StatusCode -ne 200) {
    throw "IRANSansX production verification failed."
  }
  Write-Host "IRANSansX is active on marginlift.ir without being committed to Git." -ForegroundColor Green
}
finally {
  Pop-Location
}
