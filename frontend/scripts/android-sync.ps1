# Build ParksTAG web app with .env.android and sync Capacitor Android.
# Usage (from frontend/):  powershell -File .\scripts\android-sync.ps1 [-Open]

param(
  [switch]$Open
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$envFile = Join-Path $root ".env.android"
if (Test-Path $envFile) {
  Write-Host "Loading $envFile"
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $i = $line.IndexOf("=")
    if ($i -lt 1) { return }
    $key = $line.Substring(0, $i).Trim()
    $val = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
    Set-Item -Path "Env:$key" -Value $val
  }
} else {
  Write-Host "WARNING: .env.android not found - using current environment / .env"
  Write-Host "Copy .env.android.example to .env.android and set your live URL."
}

if (-not $env:VITE_APP_URL -or $env:VITE_APP_URL -match "localhost") {
  Write-Host "WARNING: VITE_APP_URL should be your live HTTPS URL for a phone build."
}

npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npx cap sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($Open) {
  npx cap open android
}
