# Bakes a scores export from the tracker's Settings page into a tracker HTML
# file's embedded scores block. Every scenario whose stored score is lower than
# the export's value is raised; nothing is ever lowered.
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
# -Html (alias of -Target) is a tracker .html or, in the tracker repo, the data\
# folder. Default: the data\ folder next to this script, else mini_evxl.html next
# to it, else the trackerHtml path in sync-state.json (the toolkit convention).
#
# Accepts either the Settings-page export ({"format":"mini-evxl-scores", ...,
# "scores":{name:score}}) or a bare {name: score} object. The tracker file must
# be the current (v2) format -- see lib\kovaaks-table.ps1.

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][string]$Scores,
    [Alias('Html')][string]$Target              # data\ folder (tracker repo) or a tracker .html; default: see Resolve-TrackerTarget
)

$ErrorActionPreference = 'Stop'
# Shared helpers (dataset in/out, culture-proof number parsing/formatting).
. (Join-Path $PSScriptRoot 'lib\kovaaks-table.ps1')

$Html = Resolve-TrackerTarget $PSScriptRoot $Target
if (-not $Html) { Write-Output "Give -Html <your tracker .html> (no data\ folder, mini_evxl.html or sync-state.json trackerHtml found next to this script)."; exit 1 }
$Scores = Resolve-FullPath $Scores
if (-not (Test-Path -LiteralPath $Scores)) { Write-Output "Scores file not found: $Scores"; exit 1 }
if (-not (Test-Path -LiteralPath $Html)) { Write-Output "Tracker not found: $Html"; exit 1 }

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
# Every score is baked in, carried by a playlist or not: the block seeds the
# page's per-browser store, and the store keeps everything ever synced (a
# scenario whose playlist is added later shows its score at once). Not-carried
# ones are only counted, for information.
$carried = @{}
foreach ($b in $ds.data) { foreach ($s in (Get-EntryScenarios $b)) { $carried[$s.name] = $true } }
$orphans = @($map.Keys | Where-Object { -not $carried.ContainsKey($_) }).Count
$before = @{}; foreach ($k in $ds.scores.Keys) { $before[$k] = $ds.scores[$k] }
$raised = Merge-Scores $ds $map
# A v2 export (2026-08-18) also carries the runs behind the scores; merge them
# into the file's attempts block / data\attempts.json (union, deduped, capped).
$runsAdded = 0
if ($export.PSObject.Properties.Name -contains 'attempts' -and $export.attempts) {
    $inc = ConvertFrom-AttemptsJson ($export.attempts | ConvertTo-Json -Depth 6 -Compress)
    if ($inc.Count) { $runsAdded = Merge-Attempts $ds $inc }
}

if ($raised.Count -eq 0 -and $runsAdded -eq 0) {
    Write-Output "Nothing to apply: the file already holds every score at least as high (and every run)."
    exit 0
}
Write-Output ("{0} scenario score(s) would be raised{1}{2}." -f $raised.Count, $(if ($orphans) { " ($orphans of the export's scenarios are not in this file's playlists; kept anyway)" } else { '' }), $(if ($runsAdded) { "; $runsAdded run(s) would be logged" } else { '' }))
$raised | Sort-Object | ForEach-Object { [pscustomobject]@{ scenario = $_; oldScore = $(if ($before.ContainsKey($_)) { Format-Num $before[$_] } else { '-' }); newScore = Format-Num $ds.scores[$_] } } | Format-Table -AutoSize | Out-String -Width 200

if ($PSCmdlet.ShouldProcess($Html, "Write $($raised.Count) raised score(s), $runsAdded run(s)")) {
    Write-TrackerDataset $ds $Html
    Write-Output "Wrote $Html"
} else {
    Write-Output "(WhatIf) $Html not modified."
}
