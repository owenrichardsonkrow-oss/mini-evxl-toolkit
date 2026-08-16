# Repairs double-encoded UTF-8 ("mojibake") anywhere in a text file.
#
# Double-encoding happens when correct UTF-8 bytes get decoded as
# Windows-1252 and then re-encoded as UTF-8. The fix is to reverse exactly
# that: take each mojibake run, encode it back to bytes via Windows-1252,
# and decode those bytes as UTF-8.
#
# An earlier, narrower version of this fix only handled runs starting with
# 'â' (UTF-8 lead byte 0xE2 - em dash, arrows, ellipsis, star). That missed
# every other lead-byte family, notably 0xCE (Greek, e.g. β) and
# 0xE4/0xE9 (CJK, e.g. 道場) - so playlist names in those scripts stayed
# corrupted. This version derives the full lead/continuation character sets
# from the Windows-1252 table itself rather than hardcoding any single family.
#
# Usage:  .\fix-mojibake.ps1 <path> [-Apply]
#         Without -Apply it's a dry run and only reports.

param(
  [Parameter(Mandatory=$true)][string]$Path,
  [switch]$Apply
)

[System.Text.Encoding]::RegisterProvider([System.Text.CodePagesEncodingProvider]::Instance)
$win1252 = [System.Text.Encoding]::GetEncoding(1252)
$utf8 = New-Object System.Text.UTF8Encoding($false, $true)  # throwOnInvalidBytes

# Map each byte 0x80-0xFF to the char Windows-1252 decodes it to, then invert.
$byteForChar = @{}
for ($b = 0x80; $b -le 0xFF; $b++) {
  $ch = $win1252.GetString([byte[]]@($b))
  if ($ch.Length -eq 1) { $byteForChar[$ch[0]] = $b }
}
# ASCII maps to itself.
for ($b = 0x00; $b -lt 0x80; $b++) { $byteForChar[[char]$b] = $b }

function Get-CharClass([char]$c) {
  if (-not $byteForChar.ContainsKey($c)) { return 'none' }
  $b = $byteForChar[$c]
  if ($b -ge 0x80 -and $b -le 0xBF) { return 'cont' }
  if ($b -ge 0xC2 -and $b -le 0xDF) { return 'lead2' }
  if ($b -ge 0xE0 -and $b -le 0xEF) { return 'lead3' }
  if ($b -ge 0xF0 -and $b -le 0xF4) { return 'lead4' }
  return 'none'
}

$text = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
$sb = New-Object System.Text.StringBuilder
$fixes = @{}
$i = 0
while ($i -lt $text.Length) {
  $cls = Get-CharClass $text[$i]
  $need = switch ($cls) { 'lead2' {1} 'lead3' {2} 'lead4' {3} default {0} }
  $matched = $false
  if ($need -gt 0 -and ($i + $need) -lt $text.Length) {
    $ok = $true
    for ($k = 1; $k -le $need; $k++) {
      if ((Get-CharClass $text[$i+$k]) -ne 'cont') { $ok = $false; break }
    }
    if ($ok) {
      $run = $text.Substring($i, $need + 1)
      $bytes = New-Object byte[] ($need + 1)
      for ($k = 0; $k -le $need; $k++) { $bytes[$k] = $byteForChar[$run[$k]] }
      try {
        $decoded = $utf8.GetString($bytes)
        if ($decoded.Length -ge 1 -and $decoded -notmatch "�") {
          [void]$sb.Append($decoded)
          $key = $run + " -> " + $decoded
          if ($fixes.ContainsKey($key)) { $fixes[$key]++ } else { $fixes[$key] = 1 }
          $i += $need + 1
          $matched = $true
        }
      } catch { }
    }
  }
  if (-not $matched) {
    [void]$sb.Append($text[$i])
    $i++
  }
}

$newText = $sb.ToString()
$total = 0
$report = @()
foreach ($k in ($fixes.Keys | Sort-Object)) {
  $parts = $k -split " -> "
  $toCps = ($parts[1].ToCharArray() | ForEach-Object { "U+{0:X4}" -f [int]$_ }) -join " "
  $report += ("  x{0,-4} -> {1}" -f $fixes[$k], $toCps)
  $total += $fixes[$k]
}
$report = @("Distinct mojibake runs: " + $fixes.Count, "Total characters repaired: " + $total, "") + $report
$report += ""
$report += ("Changed: " + ($newText -ne $text))
if ($Apply) {
  [System.IO.File]::WriteAllText($Path, $newText, (New-Object System.Text.UTF8Encoding($false)))
  $report += "APPLIED to $Path"
} else {
  $report += "DRY RUN - nothing written. Re-run with -Apply to write."
}
[System.IO.File]::WriteAllLines((Join-Path (Split-Path $Path -Parent) "mojibake-report.txt"), $report, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "report written to mojibake-report.txt"
