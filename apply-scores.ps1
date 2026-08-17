# Bakes a scores export from the tracker's Settings page into a tracker HTML
# file's embedded dataset. Every scenario row whose stored score is lower than
# the export's value is patched; nothing is ever lowered.
#
# Why this exists: scores synced in the browser live in that browser's
# localStorage for that one address. This is the bridge from there to the
# file on disk -- for a fresh browser, a hosted copy, or (in the personal
# tracker) the published artifact, which is built from mini_evxl.html.
#
# Usage:
#   .\apply-scores.ps1 -Scores mini-evxl-scores-2026-08-16.json
#   .\apply-scores.ps1 -Scores export.json -Html my-benchmarks.html
#   .\apply-scores.ps1 -Scores export.json -WhatIf        # report only, write nothing
#
# -Html defaults to mini_evxl.html next to this script (the personal tracker),
# else the trackerHtml path in sync-state.json next to this script (the toolkit
# convention); otherwise it must be given.
#
# Accepts either the Settings-page export ({"format":"mini-evxl-scores", ...,
# "scores":{name:score}}) or a bare {name: score} object.

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][string]$Scores,
    [string]$Html
)

$ErrorActionPreference = 'Stop'
# Shared helpers (dataset in/out, culture-proof number parsing/formatting).
. (Join-Path $PSScriptRoot 'lib\kovaaks-table.ps1')
function Resolve-Full([string]$p) { Resolve-FullPath $p }

if (-not $Html) {
    $personal = Join-Path $PSScriptRoot 'mini_evxl.html'
    $statePath = Join-Path $PSScriptRoot 'sync-state.json'
    if (Test-Path $personal) { $Html = $personal }
    elseif (Test-Path $statePath) {
        $st = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
        if ($st.trackerHtml) { $Html = $st.trackerHtml }
    }
    if (-not $Html) { Write-Output "Give -Html <your tracker .html> (no mini_evxl.html or sync-state.json trackerHtml found next to this script)."; exit 1 }
}
$Scores = Resolve-Full $Scores
$Html = Resolve-Full $Html
if (-not (Test-Path -LiteralPath $Scores)) { Write-Output "Scores file not found: $Scores"; exit 1 }
if (-not (Test-Path -LiteralPath $Html)) { Write-Output "Tracker HTML not found: $Html"; exit 1 }

$export = [System.IO.File]::ReadAllText($Scores, $Utf8NoBom) | ConvertFrom-Json
$scoreObj = if ($export.PSObject.Properties.Name -contains 'scores') { $export.scores } else { $export }
$map = @{}
foreach ($p in $scoreObj.PSObject.Properties) {
    $v = ConvertTo-Num $p.Value
    if ($v -gt 0) { $map[$p.Name.Trim()] = [math]::Round($v, 2) }
}
if ($map.Count -eq 0) { Write-Output "No usable scores in $Scores"; exit 1 }
Write-Output "Read $($map.Count) score(s) from $Scores"

$ds = Read-TrackerDataset $Html
$data = $ds.data

$changes = @()
$scenariosTouched = @{}
foreach ($b in $data) {
    for ($ri = 0; $ri -lt $b.rows.Count; $ri++) {
        $row = $b.rows[$ri]
        if ($row.Count -le 1) { continue }
        $p = -1
        for ($i = 0; $i -lt $row.Count; $i++) { if ([string]$row[$i] -match $PctRegex) { $p = $i; break } }
        if ($p -lt 2) { continue }
        $scenario = ([string]$row[$p - 2]).Trim()
        if (-not $map.ContainsKey($scenario)) { continue }
        $cur = [math]::Round((ConvertTo-Num $row[$p - 1]), 2)
        $new = $map[$scenario]
        if ($new -gt $cur) {
            $changes += [PSCustomObject]@{ benchmark = $b.name; difficulty = $b.difficulty; scenario = $scenario; oldScore = [string]$row[$p - 1]; newScore = (Format-Num $new) }
            $scenariosTouched[$scenario] = $true
            $row[$p - 1] = Format-Num $new
            $b.rows[$ri] = $row
        }
    }
}

if ($changes.Count -eq 0) {
    Write-Output "Nothing to apply: every matching row already holds a score at least as high."
    exit 0
}

Write-Output ("{0} row(s) across {1} scenario(s) would be raised." -f $changes.Count, $scenariosTouched.Count)
$changes | Format-Table -AutoSize | Out-String -Width 200

if ($PSCmdlet.ShouldProcess($Html, "Write $($changes.Count) patched score row(s)")) {
    Write-TrackerDataset $ds $Html
    Write-Output "Wrote $Html"
} else {
    Write-Output "(WhatIf) $Html not modified."
}
