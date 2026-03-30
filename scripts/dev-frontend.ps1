param(
  [int]$Port = 5173,
  [string]$HostName = "localhost",
  [string]$BackendUrl = "http://localhost:48888",
  [string]$CollabUrl = "ws://localhost:48889/api/wiki/collab/ws",
  [switch]$PresetsOnly,
  [switch]$PrintOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$pkg = Join-Path $repoRoot "package.json"
if (-not (Test-Path $pkg)) {
  throw "package.json not found: $pkg"
}

Write-Host "[keel] dev frontend starting..." -ForegroundColor Cyan
Write-Host "  repoRoot: $repoRoot"
Write-Host "  host:     $HostName"
Write-Host "  port:     $Port"
$env:VITE_KEEL_BACKEND_URL = $BackendUrl
Write-Host "  backend:  $BackendUrl" -ForegroundColor DarkGray
$env:VITE_KEEL_COLLAB_URL = $CollabUrl
Write-Host "  collab:   $CollabUrl" -ForegroundColor DarkGray

if ($PresetsOnly) {
  $env:VITE_KEEL_AI_FORCE_FALLBACK = "true"
  Write-Host "  ai: presets-only (VITE_KEEL_AI_FORCE_FALLBACK=true)" -ForegroundColor DarkGray
} else {
  if (Test-Path Env:VITE_KEEL_AI_FORCE_FALLBACK) {
    Remove-Item Env:VITE_KEEL_AI_FORCE_FALLBACK
  }
}

$argsList = @("run", "dev", "--", "--host", $HostName, "--port", $Port.ToString())

Write-Host ""
Write-Host ("  npm " + ($argsList -join " ")) -ForegroundColor DarkGray
Write-Host ""

if ($PrintOnly) {
  Write-Host "[keel] PrintOnly: skipping execution." -ForegroundColor Yellow
  exit 0
}

Push-Location $repoRoot
try {
  & npm @argsList
  exit $LASTEXITCODE
} finally {
  Pop-Location
}

