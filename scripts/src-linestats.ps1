<#
.SYNOPSIS
  Reports total source lines and top-N largest files under `src` and `backend/src`.

.DESCRIPTION
  Counts lines in common source extensions (.ts, .tsx, .js, .jsx, .mjs, .cjs, .css, .scss, .sass, .less, .rs).
  Skips node_modules, dist, build, coverage, target, .git, and paths starting with "." (e.g. .vite).

.PARAMETER TopN
  Number of files to list per directory (default: 20).

.PARAMETER RepoRoot
  Repository root. Defaults to the parent of the directory containing this script.
#>
param(
  [int]$TopN = 20,
  [string]$RepoRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
  $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$extensions = @(
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".css", ".scss", ".sass", ".less",
  ".rs"
)
$excludeDirNames = [System.Collections.Generic.HashSet[string]]::new(
  [string[]]@("node_modules", "dist", "build", "coverage", "target", ".git", "__pycache__"),
  [StringComparer]::OrdinalIgnoreCase
)

function Get-LineCount {
  param([string]$Path)
  $n = 0
  $reader = [System.IO.StreamReader]::new($Path)
  try {
    while ($null -ne $reader.ReadLine()) {
      $n++
    }
  }
  finally {
    $reader.Dispose()
  }
  return $n
}

function Test-ExcludedPathSegment {
  param([string]$FullPath, [string]$RootFullPath)
  $rel = $FullPath.Substring($RootFullPath.Length).TrimStart([char[]]@('\', '/'))
  $parts = $rel -split '[\\/]'
  foreach ($p in $parts) {
    if ($p.Length -gt 0 -and $p[0] -eq '.') {
      return $true
    }
    if ($excludeDirNames.Contains($p)) {
      return $true
    }
  }
  return $false
}

function Write-SectionStats {
  param(
    [string]$Label,
    [string]$RelativeDir
  )

  $dir = Join-Path $RepoRoot $RelativeDir
  Write-Host ""
  Write-Host "=== $Label ($RelativeDir) ===" -ForegroundColor Cyan

  if (-not (Test-Path -LiteralPath $dir)) {
    Write-Host "Directory not found: $dir" -ForegroundColor Yellow
    return
  }

  $rootFull = (Resolve-Path -LiteralPath $dir).Path
  $files = Get-ChildItem -LiteralPath $dir -Recurse -File -Force -ErrorAction SilentlyContinue |
    Where-Object {
      $ext = $_.Extension
      if (-not $ext) { return $false }
      if ($extensions -notcontains $ext.ToLowerInvariant()) { return $false }
      -not (Test-ExcludedPathSegment -FullPath $_.FullName -RootFullPath $rootFull)
    }

  $rows = foreach ($f in $files) {
    $lines = Get-LineCount -Path $f.FullName
    [pscustomobject]@{ Lines = $lines; Path = $f.FullName }
  }

  $total = ($rows | Measure-Object -Property Lines -Sum).Sum
  if ($null -eq $total) { $total = 0 }

  Write-Host "Total lines: $total"
  Write-Host "File count:  $(@($rows).Count)"
  Write-Host ""
  Write-Host "Top $TopN by line count:"

  $rootNorm = $RepoRoot.TrimEnd([char[]]@('\', '/'))
  $rows |
    Sort-Object -Property Lines -Descending |
    Select-Object -First $TopN |
    ForEach-Object {
      $full = $_.Path
      if ($full.StartsWith($rootNorm, [StringComparison]::OrdinalIgnoreCase)) {
        $rel = $full.Substring($rootNorm.Length).TrimStart([char[]]@('\', '/'))
      }
      else {
        $rel = $full
      }
      "{0,8}  {1}" -f $_.Lines, $rel
    } |
    ForEach-Object { Write-Host $_ }
}

Write-Host "Repository: $RepoRoot"
Write-SectionStats -Label "Frontend / app sources" -RelativeDir "src"
Write-SectionStats -Label "Backend sources" -RelativeDir "backend\src"
Write-Host ""
