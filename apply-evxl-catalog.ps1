# Stamps evxl's per-benchmark rank metadata onto every entry of a tracker's
# embedded dataset, from dev\evxl-bundle-catalog.json (extracted from evxl's JS
# bundle -- see CLAUDE.md "evxl's JS bundle carries its whole catalog").
#
# Fields written per entry (structure metadata, not player state):
#   rankCalc  - evxl's rankCalculation mode ("basic", "tsk", "generic-energy"...)
#               The rank engine picks its rule from this.
#   evxlId    - kovaaksBenchmarkId (-1 for routine-based benchmarks). The key for
#               kovaaks' player-progress-rank-benchmark?benchmarkId= endpoint.
#   subcats   - [[category, subcategory, scenarioCount], ...] in table order.
#               Used by the "basic" rule (min over subcategory bests) when its
#               counts add up to the parsed scenario count; otherwise the engine
#               falls back to the table's own category/subcategory labels.
#   evxlTiers - evxl's rank names for this difficulty, in order (rankColors keys).
#   evxlDiffIndex - the difficulty's position among the benchmark's difficulties
#               (catalog order, 0-based); mh-tracking's ladder and 33/iris's
#               fallback start depend on it.
#   evxlRankOffset - how many ranks the benchmark's PRECEDING difficulties hold
#               (catalog order). The generic-energy rules put every difficulty on
#               one long energy ladder (Normal starts where Easy ends), and a
#               harmonic mean is not translation-invariant, so this matters.
#
# Idempotent: re-running rewrites the same values. Entries with no catalog match
# are left untouched and listed.
#
# Usage:  .\apply-evxl-catalog.ps1                       # mini_evxl.html
#         .\apply-evxl-catalog.ps1 -Html other.html -Catalog fresh.json
#         .\apply-evxl-catalog.ps1 -WhatIf

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$Html    = (Join-Path $PSScriptRoot 'mini_evxl.html'),
    [string]$Catalog = (Join-Path $PSScriptRoot 'dev\evxl-bundle-catalog.json')
)

$ErrorActionPreference = 'Stop'
function Resolve-Full([string]$p) { $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($p) }
$Html = Resolve-Full $Html
$Catalog = Resolve-Full $Catalog
if (-not (Test-Path -LiteralPath $Html))    { Write-Output "Tracker HTML not found: $Html"; exit 1 }
if (-not (Test-Path -LiteralPath $Catalog)) { Write-Output "Catalog not found: $Catalog"; exit 1 }

$utf8 = New-Object System.Text.UTF8Encoding($false)
$cat = ([System.IO.File]::ReadAllText($Catalog, $utf8) | ConvertFrom-Json).benchmarks
$byKey = @{}
foreach ($b in $cat) {
    $offset = 0; $idx = 0
    foreach ($d in $b.difficulties) {
        $tierNames = @()
        if ($d.rankColors) { $tierNames = @($d.rankColors.PSObject.Properties.Name) }
        $byKey[("{0}|{1}" -f $b.benchmarkName.Trim(), $d.difficultyName.Trim()).ToLower()] = @{ b = $b; d = $d; offset = $offset; tiers = $tierNames; idx = $idx }
        $offset += $tierNames.Count; $idx++
    }
}

$content = [System.IO.File]::ReadAllText($Html, $utf8)
$startTag = '<script id="benchmarks-data" type="application/json">'
$s = $content.IndexOf($startTag)
if ($s -lt 0) { Write-Output "No embedded benchmarks-data block in $Html"; exit 1 }
$s += $startTag.Length
$e = $content.IndexOf('</script>', $s)
$data = $content.Substring($s, $e - $s) | ConvertFrom-Json

$stamped = 0; $changed = 0; $missing = @()
foreach ($x in $data) {
    $m = $byKey[("{0}|{1}" -f ([string]$x.name).Trim(), ([string]$x.difficulty).Trim()).ToLower()]
    if (-not $m) { $missing += "$($x.name) [$($x.difficulty)]"; continue }
    $subcats = @()
    foreach ($cg in $m.d.categories) {
        foreach ($sc in $cg.subcategories) {
            $subcats += , @([string]$cg.categoryName, [string]$sc.subcategoryName, [int]$sc.scenarioCount)
        }
    }
    $before = ($x | ConvertTo-Json -Depth 10 -Compress)
    $x | Add-Member -NotePropertyName rankCalc -NotePropertyValue ([string]$m.b.rankCalculation) -Force
    $x | Add-Member -NotePropertyName evxlId   -NotePropertyValue ([int]$m.d.kovaaksBenchmarkId) -Force
    $x | Add-Member -NotePropertyName subcats  -NotePropertyValue $subcats -Force
    $x | Add-Member -NotePropertyName evxlTiers -NotePropertyValue @($m.tiers) -Force
    $x | Add-Member -NotePropertyName evxlRankOffset -NotePropertyValue ([int]$m.offset) -Force
    $x | Add-Member -NotePropertyName evxlDiffIndex -NotePropertyValue ([int]$m.idx) -Force
    # selectable-top-n benchmarks (REVENGE): the difficulty carries a
    # scenarioSelection block -- the player picks `selectCount` of the pool and
    # the rank is the N-th best of the picks. Stamped as `selection` so the page
    # can compute evxl's default pick and apply the same rule; absent otherwise.
    $sel = $m.d.scenarioSelection
    if ($sel -and $sel.enabled) {
        $x | Add-Member -NotePropertyName selection -NotePropertyValue ([ordered]@{
            select  = [int]$sel.selectCount
            baseN   = [int]($sel.baseRankScoreCount ?? $sel.requiredScoreCount ?? 12)
            fullN   = $(if ($null -ne $sel.fullPoolRankScoreCount) { [int]$sel.fullPoolRankScoreCount } else { $null })
            minCat  = [int]($sel.minPerCategory ?? 0)
            minSub  = [int]($sel.minPerSubcategory ?? 0)
            maxSelect = $(if ($null -ne $sel.maxSelectCount) { [int]$sel.maxSelectCount } else { $null })
        }) -Force
    } elseif ($x.PSObject.Properties['selection']) {
        $x.PSObject.Properties.Remove('selection')
    }
    $stamped++
    if (($x | ConvertTo-Json -Depth 10 -Compress) -ne $before) { $changed++ }
}

Write-Output ("{0} of {1} entries matched the catalog; {2} changed." -f $stamped, $data.Count, $changed)
if ($missing.Count) { Write-Output "Not in catalog:"; $missing | ForEach-Object { "  $_" } }
$modes = @{}; foreach ($x in $data) { if ($x.rankCalc) { $modes[$x.rankCalc]++ } }
Write-Output ("modes: " + (($modes.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ', '))

if ($changed -eq 0) { Write-Output "Nothing to write."; exit 0 }
if ($PSCmdlet.ShouldProcess($Html, "Write $changed stamped entries")) {
    $newJson = $data | ConvertTo-Json -Depth 10 -Compress
    [System.IO.File]::WriteAllText($Html, $content.Substring(0, $s) + $newJson + $content.Substring($e), $utf8)
    Write-Output "Wrote $Html"
}
