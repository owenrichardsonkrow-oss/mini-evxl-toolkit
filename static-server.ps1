# Minimal static file server for the tracker - no Python/Node needed.
#
# Usage:  right-click -> "Run with PowerShell", or from a PowerShell prompt:
#           .\static-server.ps1
#           .\static-server.ps1 -Port 9000
#
# If the preferred port is unavailable it automatically tries the next few.
# Windows can silently reserve whole port ranges for Hyper-V/WSL/Docker
# (see: netsh int ipv4 show excludedportrange protocol=tcp), which makes a
# previously-working port start failing with "Access is denied" or "conflicts
# with an existing registration" - hence the fallback rather than one fixed port.

param(
  [int]$Port = 8744,
  [int]$TryPorts = 12
)

$root = $PSScriptRoot
$defaultFile = "/template.html"

$mime = @{
  ".html" = "text/html"; ".htm" = "text/html"; ".js" = "application/javascript";
  ".css" = "text/css"; ".json" = "application/json"; ".png" = "image/png";
  ".jpg" = "image/jpeg"; ".svg" = "image/svg+xml"; ".ico" = "image/x-icon";
  ".md" = "text/plain";
}

$listener = $null
$boundPort = $null
for ($p = $Port; $p -lt ($Port + $TryPorts); $p++) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$p/")
    $l.Start()
    $listener = $l
    $boundPort = $p
    break
  } catch {
    if ($p -eq $Port) {
      Write-Host "Port $p unavailable ($($_.Exception.Message.Split([char]10)[0]))" -ForegroundColor DarkYellow
      Write-Host "Trying next ports..." -ForegroundColor DarkYellow
    }
  }
}

if (-not $listener) {
  Write-Host ""
  Write-Host "ERROR: couldn't bind any port from $Port to $($Port + $TryPorts - 1)." -ForegroundColor Red
  Write-Host "Try a different range, e.g.:  .\static-server.ps1 -Port 9500" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Press Enter to close this window..."
  Read-Host | Out-Null
  exit 1
}

Write-Host ""
Write-Host "  Serving $root" -ForegroundColor Green
Write-Host "  ->  http://localhost:$boundPort/" -ForegroundColor Green -BackgroundColor Black
Write-Host ""
Write-Host "  Leave this window open. Press Ctrl+C to stop."
Write-Host ""

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    # Per-request try/catch: one bad request (missing favicon, a locked file,
    # whatever) must never take the whole server down.
    try {
      $req = $context.Request
      $res = $context.Response
      $path = $req.Url.LocalPath
      if ($path -eq "/") { $path = $defaultFile }
      $filePath = Join-Path $root ($path.TrimStart("/"))
      if (Test-Path $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath)
        $contentType = $mime[$ext]
        if (-not $contentType) { $contentType = "application/octet-stream" }
        if ($contentType -like "text/*" -or $contentType -eq "application/javascript" -or $contentType -eq "application/json") {
          $contentType = "$contentType; charset=utf-8"
        }
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $res.ContentType = $contentType
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        # Must set ContentLength64 before writing, or the write throws.
        $msg = [System.Text.Encoding]::UTF8.GetBytes("Not found")
        $res.StatusCode = 404
        $res.ContentLength64 = $msg.Length
        $res.OutputStream.Write($msg, 0, $msg.Length)
      }
      $res.OutputStream.Close()
    } catch {
      Write-Host "Request error: $($_.Exception.Message)" -ForegroundColor Yellow
      try { $context.Response.OutputStream.Close() } catch {}
    }
  }
} catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ""
  Write-Host "Press Enter to close this window..."
  Read-Host | Out-Null
}
