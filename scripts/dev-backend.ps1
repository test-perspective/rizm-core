param(
  [string]$Bind = "127.0.0.1:48888",
  [string]$CollabHost = "127.0.0.1",
  [int]$CollabPort = 48889,
  [string]$CollabPath = "/api/wiki/collab/ws",
  [switch]$NoCollab,
  [string]$DbPath = "",
  [string]$BootstrapAdminEmail = "admin@example.local",
  [string]$BootstrapAdminPassword = "change-this-password",
  [switch]$DevAdminLogin,
  [bool]$CookieSecure = $false,
  [string]$OllamaUrl = "http://localhost:11434",
  [string]$OllamaModel = "deepseek-r1:8b-llama-distill-q8_0",
  [string]$CorsOrigin = "http://localhost:5173",
  [string]$CsrfAllowedOrigin = "http://localhost:5173",
  [int]$OllamaTimeoutSecs = 600,
  [switch]$Release,
  [switch]$PrintOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $DbPath) {
  $DbPath = Join-Path $repoRoot "data\\keel.demo.sqlite3"
}

$envFile = Join-Path $repoRoot ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line) { return }
    if ($line.StartsWith("#")) { return }
    if ($line -match "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$") {
      $key = $Matches[1]
      $value = $Matches[2].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      Set-Item -Path "env:$key" -Value $value
    }
  }
}

$manifestPath = Join-Path $repoRoot "backend\\Cargo.toml"
if (-not (Test-Path $manifestPath)) {
  throw "backend/Cargo.toml not found: $manifestPath"
}

Write-Host "[keel] dev backend starting..." -ForegroundColor Cyan
Write-Host "  repoRoot: $repoRoot"
Write-Host "  manifest: $manifestPath"
Write-Host "  bind:     $Bind"
Write-Host "  db:       $DbPath"
if (-not $NoCollab) {
  Write-Host "  collab:   ws://${CollabHost}:${CollabPort}${CollabPath}"
}

# Backend env
$env:KEEL_BIND = $Bind
$env:KEEL_DB_PATH = $DbPath
$env:KEEL_BOOTSTRAP_ADMIN_EMAIL = $BootstrapAdminEmail
$env:KEEL_BOOTSTRAP_ADMIN_PASSWORD = $BootstrapAdminPassword
$env:KEEL_DEV_ADMIN_LOGIN = ($DevAdminLogin.IsPresent.ToString().ToLowerInvariant())
$env:KEEL_COOKIE_SECURE = ($CookieSecure.ToString().ToLowerInvariant())
$env:KEEL_OLLAMA_URL = $OllamaUrl
$env:KEEL_OLLAMA_MODEL = $OllamaModel
$env:KEEL_CORS_ORIGIN = $CorsOrigin
$env:KEEL_CSRF_ALLOWED_ORIGIN = $CsrfAllowedOrigin
$env:KEEL_OLLAMA_TIMEOUT_SECS = $OllamaTimeoutSecs.ToString()

# Logging (opt-in override): show AIT progress logs by default in dev.
if (-not $env:RUST_LOG -or -not $env:RUST_LOG.Trim()) {
  $env:RUST_LOG = "info"
}
Write-Host "  RUST_LOG: $($env:RUST_LOG)" -ForegroundColor DarkGray

$argsList = @("run", "--bin", "keel_backend", "--manifest-path", $manifestPath)
if ($Release) { $argsList += "--release" }

Write-Host ""
Write-Host ("  cargo " + ($argsList -join " ")) -ForegroundColor DarkGray
Write-Host ""

if ($PrintOnly) {
  Write-Host "[keel] PrintOnly: skipping execution." -ForegroundColor Yellow
  exit 0
}

$collabProc = $null
try {
  if (-not $NoCollab) {
    $collabScript = Join-Path $repoRoot "scripts\\dev-collab.mjs"
    if (-not (Test-Path $collabScript)) {
      throw "collab script not found: $collabScript"
    }
    $collabArgs = @(
      "`"$collabScript`"",
      "--host", $CollabHost,
      "--port", $CollabPort.ToString(),
      "--path", $CollabPath
    )
    $collabProc = Start-Process -FilePath "node" -ArgumentList $collabArgs -WorkingDirectory $repoRoot -WindowStyle Minimized -PassThru
    Start-Sleep -Milliseconds 400
    Write-Host "  collab pid: $($collabProc.Id)" -ForegroundColor DarkGray
  }

  & cargo @argsList
  exit $LASTEXITCODE
}
finally {
  if ($null -ne $collabProc -and -not $collabProc.HasExited) {
    try {
      Stop-Process -Id $collabProc.Id -Force -ErrorAction SilentlyContinue
    } catch {
      # Ignore cleanup failures
    }
  }
}

