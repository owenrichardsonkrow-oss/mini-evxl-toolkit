# Incremental local-sync for this KovaaK's benchmark tracker template.
#
# Reads only stats CSVs written since the last sync from your local KovaaK's
# stats folder, patches any scenario score in your tracker HTML's embedded
# dataset where the new local score beats what's stored (compared at
# 2-decimal precision to ignore float noise), and advances the sync marker.
#
# Scores only. Playlist structure (scenarios, tiers) is a separate concern — see
# docs/SCRAPING_GUIDE.md — and the rank badge is computed in the page from your
# scores, so nothing else needs patching here. For scores you synced in the
# browser (Sync Scores Online), use apply-scores.ps1 with a Settings-page export.
#
# First run: copy sync-state.example.json to sync-state.json next to this
# script, fill in your statsDir and trackerHtml path, and run once with a
# very old/zero lastSyncTicks so the first sync picks up your full history.

$root = $PSScriptRoot
$statePath = Join-Path $root "sync-state.json"
# Shared helpers (dataset in/out, culture-proof number parsing/formatting).
. (Join-Path $root 'lib\kovaaks-table.ps1')

if (-not (Test-Path $statePath)) {
    Write-Output "No sync-state.json found next to this script."
    Write-Output "Copy sync-state.example.json to sync-state.json, edit statsDir and trackerHtml, then run again."
    exit 1
}

$state = Get-Content -Raw $statePath | ConvertFrom-Json
$htmlPath = $state.trackerHtml
if (-not (Test-Path $htmlPath)) {
    Write-Output "trackerHtml in sync-state.json does not point to a file: $htmlPath"
    exit 1
}

# lastSyncTicks is the authoritative marker (a plain integer, immune to any
# ISO-string reparsing/timezone footguns). lastSyncUtc is kept only as a
# human-readable mirror of the same instant — never parsed back.
if ($state.PSObject.Properties.Name -contains 'lastSyncTicks' -and $state.lastSyncTicks) {
    $lastSync = [datetime]::new([long]$state.lastSyncTicks, [System.DateTimeKind]::Utc)
} else {
    $lastSync = [datetime]::new(0, [System.DateTimeKind]::Utc)
}
$statsDir = $state.statsDir
if (-not (Test-Path $statsDir)) {
    Write-Output "statsDir in sync-state.json does not exist: $statsDir"
    Write-Output "This is usually: <Steam library>\steamapps\common\FPSAimTrainer\FPSAimTrainer\stats"
    exit 1
}

$newFiles = Get-ChildItem -LiteralPath $statsDir -Filter "*.csv" |
    Where-Object { $_.LastWriteTimeUtc -gt $lastSync }

if ($newFiles.Count -eq 0) {
    Write-Output "No new plays since last sync ($($state.lastSyncUtc))."
    exit 0
}

Write-Output "Found $($newFiles.Count) new stats file(s) since $($state.lastSyncUtc)."

$localMap = @{}
foreach ($f in $newFiles) {
    $lines = Get-Content -LiteralPath $f.FullName
    $scoreLine = $lines | Where-Object { $_ -match '^Score:,' } | Select-Object -First 1
    $scenLine  = $lines | Where-Object { $_ -match '^Scenario:,' } | Select-Object -First 1
    if ($scoreLine -and $scenLine) {
        $score = [math]::Round((ConvertTo-Num ($scoreLine -replace '^Score:,','')), 2)
        $scenario = ($scenLine -replace '^Scenario:,','').Trim()
        if (-not $localMap.ContainsKey($scenario) -or $localMap[$scenario] -lt $score) {
            $localMap[$scenario] = $score
        }
    }
}

$ds = Read-TrackerDataset $htmlPath
$data = $ds.data

$changes = @()

foreach ($b in $data) {
    for ($ri = 0; $ri -lt $b.rows.Count; $ri++) {
        $row = $b.rows[$ri]
        if ($row.Count -le 1) { continue }
        $p = -1
        for ($i = 0; $i -lt $row.Count; $i++) {
            if ([string]$row[$i] -match $PctRegex) { $p = $i; break }
        }
        if ($p -lt 2) { continue }
        $scenario = ([string]$row[$p-2]).Trim()
        $scoreStr = $row[$p-1]
        if ($localMap.ContainsKey($scenario)) {
            $localScore = $localMap[$scenario]
            $currentScore = [math]::Round((ConvertTo-Num $scoreStr), 2)
            if ($localScore -gt $currentScore) {
                $newScoreStr = Format-Num $localScore
                $changes += [PSCustomObject]@{
                    benchmark = $b.name; difficulty = $b.difficulty
                    scenario = $scenario; oldScore = $scoreStr; newScore = $newScoreStr
                }
                $row[$p-1] = $newScoreStr
                $b.rows[$ri] = $row
            }
        }
    }
}

if ($changes.Count -gt 0) {
    Write-TrackerDataset $ds $htmlPath
}

$maxMtime = ($newFiles | Measure-Object -Property LastWriteTimeUtc -Maximum).Maximum
$state | Add-Member -NotePropertyName lastSyncTicks -NotePropertyValue $maxMtime.Ticks -Force
$state.lastSyncUtc = $maxMtime.ToString("yyyy-MM-ddTHH:mm:ssZ")
$state | Add-Member -NotePropertyName lastSyncNote -NotePropertyValue "Checked $($newFiles.Count) new file(s), applied $($changes.Count) score update(s)." -Force
$state | ConvertTo-Json | Set-Content -Path $statePath -Encoding UTF8

Write-Output "Applied $($changes.Count) score update(s):"
$changes | Format-Table -AutoSize | Out-String -Width 200
