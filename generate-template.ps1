# Regenerates template.html from the personal tracker copy this toolkit was
# forked from, and refreshes the scripts this toolkit shares with it. Run it
# whenever the personal copy's dataset or app behaviour changes.
#
# What it does, beyond a straight copy of the page:
#   - Replaces the page's SITE identity block (the ONLY personal strings in the
#     script: owner name, default KovaaK's username, Steam/evxl profile links,
#     template flag) with the toolkit's generic values, and the <title> and brand
#     text in the markup. Every one of these replacements is asserted -- if the
#     personal copy's markup or block moved, this script stops instead of
#     shipping the owner's identity in a public file. (It used to be six silent
#     string replacements; a drifted string meant a silent leak.)
#   - Zeroes every score and resets every playlist's rank/volts to Unranked/0 in
#     the embedded dataset -- but leaves tier thresholds, scenario names, and
#     category/subcategory labels untouched, since those are properties of the
#     benchmark itself, not the player. A visitor fills the zeroed template back
#     in with real numbers just by entering their KovaaK's username and clicking
#     Sync Scores -- no evxl scraping needed for that part at all.
#   - Copies the shared scripts (lib\kovaaks-table.ps1, apply-scores.ps1,
#     apply-evxl-catalog.ps1, fix-mojibake.ps1) from the personal repo, so the
#     two copies can't drift. static-server.ps1 and sync.ps1 are NOT copied --
#     the toolkit's are intentionally different (see CLAUDE.md).
#
# Anchored to this script's folder, so it can be run from anywhere.

$ErrorActionPreference = 'Stop'
$trackerRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'mini-benchmarks-tracker'
$src = Join-Path $trackerRoot 'mini_evxl.html'
$dst = Join-Path $PSScriptRoot 'template.html'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $src)) { Write-Output "Source file not found: $src"; exit 1 }

# ---- 1. shared scripts, copied first (the lib is dot-sourced below) ----------
$shared = @('lib\kovaaks-table.ps1', 'apply-scores.ps1', 'apply-evxl-catalog.ps1', 'fix-mojibake.ps1')
New-Item -ItemType Directory -Force (Join-Path $PSScriptRoot 'lib') | Out-Null
$copied = @()
foreach ($rel in $shared) {
    $from = Join-Path $trackerRoot $rel; $to = Join-Path $PSScriptRoot $rel
    if (-not (Test-Path $from)) { throw "Shared script missing in the tracker repo: $from" }
    $same = (Test-Path $to) -and ([IO.File]::ReadAllText($from) -eq [IO.File]::ReadAllText($to))
    if (-not $same) { Copy-Item $from $to -Force; $copied += $rel }
}
. (Join-Path $PSScriptRoot 'lib\kovaaks-table.ps1')

# ---- 2. the page ------------------------------------------------------------
$content = [System.IO.File]::ReadAllText($src, $Utf8NoBom)

function Replace-Asserted([string]$what, [string]$pattern, [string]$replacement) {
    $m = [regex]::Matches($script:content, $pattern)
    if ($m.Count -ne 1) { throw "generate-template: expected exactly one match for $what, found $($m.Count). The personal copy's markup or identity block moved -- fix this script rather than shipping the owner's identity." }
    $script:content = [regex]::Replace($script:content, $pattern, $replacement, 1)
}
function Rx([string]$literal) { [regex]::Escape($literal) }

# <title> and the brand text are markup (they render before any script runs and
# the artifact reads <title> from the file), so they are replaced here.
Replace-Asserted '<title>' '<title>[^<]*</title>' "<title>KovaaK's Benchmark Tracker</title>"
Replace-Asserted 'brand text' ((Rx '<span id="brand-text">') + '[^<]*</span>') '<span id="brand-text">Benchmark Tracker</span>'

# The SITE identity block: everything between the two marker comments.
$siteStart = '  // ---- site identity -----------------------------------------------------'
$siteEnd   = '  // ---- end site identity -------------------------------------------------'
$s = $content.IndexOf($siteStart); $e = $content.IndexOf($siteEnd)
if ($s -lt 0 -or $e -lt 0 -or $e -le $s) { throw 'generate-template: SITE identity block markers not found in the personal copy.' }
$templateSite = @'
  // ---- site identity -----------------------------------------------------
  // The toolkit template's identity: no owner, no default username, no
  // profile links. Visitors fill their own in under Settings. This block is
  // written by generate-template.ps1 from the personal copy's SITE block.
  const SITE = {
    template: true,
    owner: '',
    defaultUsername: '',
    steamUrl: '',
    steamLabel: '',
    evxlProfileUrl: ''
  };

'@
$content = $content.Substring(0, $s) + $templateSite + $content.Substring($e)

# Belt and braces: nothing personal may survive outside the (now replaced) block.
foreach ($needle in @("'Owen'", 'sinseriously', '76561198251208570', "mini's")) {
    if ($content.Contains($needle)) { throw "generate-template: personal string $needle still present after replacement -- something outside the SITE block hard-codes identity." }
}

# ---- 3. the dataset: structure as-is, scores block emptied ------------------
# The v2 dataset is structure only, so the template keeps it verbatim; the
# owner's scores live in the separate scores block, which becomes {}.
$s = $content.IndexOf($DataTag); if ($s -lt 0) { throw 'generate-template: no benchmarks-data block' }
$s += $DataTag.Length; $e = $content.IndexOf('</script>', $s)
$data = @($content.Substring($s, $e - $s) | ConvertFrom-Json)
if (@($data | Where-Object { $_.PSObject.Properties['rows'] }).Count) { throw 'generate-template: the personal copy is still in the v1 (hdrs/rows) format -- run dev\migrate-v2.ps1 there first.' }
$ss = $content.IndexOf($ScoresTag); if ($ss -lt 0) { throw 'generate-template: no scores-data block in the personal copy' }
$ss += $ScoresTag.Length; $se = $content.IndexOf('</script>', $ss)
$content = $content.Substring(0, $ss) + '{}' + $content.Substring($se)

[System.IO.File]::WriteAllText($dst, $content, $Utf8NoBom)
Write-Output "Wrote $dst ($($data.Count) playlists, scores block emptied)."
if ($copied.Count) { Write-Output ("Refreshed shared scripts from the tracker repo: " + ($copied -join ', ')) } else { Write-Output "Shared scripts already identical." }
