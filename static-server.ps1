$root = $PSScriptRoot
$port = 8744

try {
  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Add("http://localhost:$port/")
  $listener.Start()
  Write-Host "Serving $root on http://localhost:$port/"
  Write-Host "Leave this window open. Press Ctrl+C to stop."

  $mime = @{
    ".html" = "text/html"; ".htm" = "text/html"; ".js" = "application/javascript";
    ".css" = "text/css"; ".json" = "application/json"; ".png" = "image/png";
    ".jpg" = "image/jpeg"; ".svg" = "image/svg+xml"; ".ico" = "image/x-icon";
    ".md" = "text/plain";
  }

  while ($listener.IsListening) {
    $context = $listener.GetContext()
    # Per-request try/catch: one bad request (missing favicon, a locked
    # file, whatever) must never take the whole server down. This used to
    # be missing entirely - the 404 branch below didn't set ContentLength64
    # (defaults to 0) and then wrote real bytes anyway, which throws and
    # previously killed the *entire* listener loop on the very first
    # request for anything that doesn't exist (e.g. the browser's automatic
    # favicon.ico request).
    try {
      $req = $context.Request
      $res = $context.Response
      $path = $req.Url.LocalPath
      if ($path -eq "/") { $path = "/template.html" }
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
        $msg = [System.Text.Encoding]::UTF8.GetBytes("Not found")
        $res.StatusCode = 404
        $res.ContentLength64 = $msg.Length
        $res.OutputStream.Write($msg, 0, $msg.Length)
      }
      $res.OutputStream.Close()
    } catch {
      Write-Host "Request error ($($req.Url)): $($_.Exception.Message)" -ForegroundColor Yellow
      try { $context.Response.OutputStream.Close() } catch {}
    }
  }
} catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  if ($_.Exception.Message -like "*Access is denied*") {
    Write-Host "This usually means port $port needs a URL ACL reservation, or another program already owns it." -ForegroundColor Yellow
  }
  Write-Host ""
  Write-Host "Press Enter to close this window..."
  Read-Host | Out-Null
}
