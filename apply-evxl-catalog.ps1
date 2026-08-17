# Stamps evxl's per-benchmark rank metadata onto every entry of a tracker's
# embedded dataset, from dev\evxl-bundle-catalog.json (extracted from evxl's JS
# bundle -- see CLAUDE.md "evxl's JS bundle carries its whole catalog").
#
# Fields written per entry (structure metadata, not player state):
#   rankCalc  - evxl's rankCalculation mode ("basic", "tsk", "generic-energy"...)
#               The rank engine picks its rule from this.
#   evxlId    - kovaaksBenchmarkId (-1 for routine-based benchmarks). The key for
#               kovaaks' player-progress-rank-benchmark?benchmarkId= endpoint.
#   evxlDiffIndex - the difficulty's position among the benchmark's difficulties
#               (catalog order, 0-based); mh-tracking's ladder and 33/iris's
#               fallback start depend on it.
#   evxlRankOffset - how many ranks the benchmark's PRECEDING difficulties hold
#               (catalog order). The generic-energy rules put every difficulty on
#               one long energy ladder (Normal starts where Easy ends), and a
#               harmonic mean is not translation-invariant, so this matters.
#   selection - pool rules for selectable-top-n benchmarks (REVENGE); removed
#               when the catalog no longer has them.
# Groups: the entry's groups ARE the catalog layout ([category, subcategory,
# count] in table order). When the catalog's counts still match the entry's,
# group names are refreshed in place; when they don't (evxl re-chunked a
# benchmark) the entry is listed -- refresh-all-from-kovaaks.ps1 rebuilds it
# from the API using the catalog layout.
#
# Idempotent: re-running rewrites the same values. Entries with no catalog match
# are left untouched and listed. Legacy v1 fields (subcats, evxlTiers, rank,
# volts) are dropped if still present.
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
. (Join-Path $PSScriptRoot 'lib\kovaaks-table.ps1')
$Html = Resolve-FullPath $Html
$Catalog = Resolve-FullPath $Catalog
if (-not (Test-Path -LiteralPath $Html))    { Write-Output "Tracker HTML not found: $Html"; exit 1 }
if (-not (Test-Path -LiteralPath $Catalog)) { Write-Output "Catalog not found: $Catalog"; exit 1 }

$cat = ([System.IO.File]::ReadAllText($Catalog, $Utf8NoBom) | ConvertFrom-Json).benchmarks
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

$ds = Read-TrackerDataset $Html
$data = $ds.data

# Set a property in place (Add-Member -Force would move it to the end and every
# entry would read as "changed" through key order alone).
function Set-Prop($obj, [string]$name, $value) {
    if ($obj.PSObject.Properties[$name]) { $obj.$name = $value } else { $obj | Add-Member -NotePropertyName $name -NotePropertyValue $value }
}

$stamped = 0; $changed = 0; $missing = @(); $layoutDiffers = @(); $repartitioned = @()
foreach ($x in $data) {
    $m = $byKey[("{0}|{1}" -f ([string]$x.name).Trim(), ([string]$x.difficulty).Trim()).ToLower()]
    if (-not $m) { $missing += "$($x.name) [$($x.difficulty)]"; continue }
    $layout = @()
    foreach ($cg in $m.d.categories) {
        foreach ($sc in $cg.subcategories) {
            $layout += , @(([string]$cg.categoryName).Trim(), ([string]$sc.subcategoryName).Trim(), [int]$sc.scenarioCount)
        }
    }
    $before = ($x | ConvertTo-Json -Depth 10 -Compress)
    Set-Prop $x 'rankCalc' ([string]$m.b.rankCalculation)
    Set-Prop $x 'evxlId'   ([int]$m.d.kovaaksBenchmarkId)
    Set-Prop $x 'evxlRankOffset' ([int]$m.offset)
    Set-Prop $x 'evxlDiffIndex' ([int]$m.idx)
    # Groups follow the catalog layout. Same partition -> refresh the names in
    # place. Same total but different boundaries (evxl re-chunked the benchmark)
    # -> re-slice our scenarios, in order, along the catalog's boundaries -- the
    # rank engine grouped by the catalog whenever its counts added up, so this
    # keeps the badge in step with evxl without waiting for a table refresh.
    # Different total -> leave it and list it: refresh-all rebuilds it from the API.
    $groups = @($x.groups)
    $ourCounts = @($groups | ForEach-Object { @($_.scenarios).Count })
    $catCounts = @($layout | ForEach-Object { [int]$_[2] })
    $total = 0; foreach ($n in $ourCounts) { $total += $n }
    $catTotal = 0; foreach ($n in $catCounts) { $catTotal += $n }
    if ($layout.Count -and (($ourCounts -join ',') -eq ($catCounts -join ','))) {
        for ($i = 0; $i -lt $layout.Count; $i++) {
            Set-Prop $groups[$i] 'category' ([string]$layout[$i][0])
            Set-Prop $groups[$i] 'subcategory' ([string]$layout[$i][1])
        }
    } elseif ($layout.Count -and $catTotal -eq $total) {
        $flat = @(); foreach ($g in $groups) { $flat += @($g.scenarios) }
        $newGroups = @(); $i = 0
        foreach ($l in $layout) { $n = [int]$l[2]; $slice = if ($n -gt 0) { @($flat[$i..($i + $n - 1)]) } else { @() }; $i += $n
            $newGroups += [pscustomobject]@{ category = [string]$l[0]; subcategory = [string]$l[1]; scenarios = $slice } }
        Set-Prop $x 'groups' $newGroups
        $repartitioned += "$($x.name) [$($x.difficulty)]: $($ourCounts -join '/') -> $($catCounts -join '/')"
    } elseif ($layout.Count) {
        $layoutDiffers += "$($x.name) [$($x.difficulty)]: catalog $($catCounts -join '/') vs ours $($ourCounts -join '/')"
    }
    # selectable-top-n benchmarks (REVENGE): the difficulty carries a
    # scenarioSelection block -- the player picks `selectCount` of the pool and
    # the rank is the N-th best of the picks. Stamped as `selection` so the page
    # can compute evxl's default pick and apply the same rule; absent otherwise.
    $sel = $m.d.scenarioSelection
    if ($sel -and $sel.enabled) {
        Set-Prop $x 'selection' ([pscustomobject][ordered]@{
            select  = [int]$sel.selectCount
            baseN   = [int]($sel.baseRankScoreCount ?? $sel.requiredScoreCount ?? 12)
            fullN   = $(if ($null -ne $sel.fullPoolRankScoreCount) { [int]$sel.fullPoolRankScoreCount } else { $null })
            minCat  = [int]($sel.minPerCategory ?? 0)
            minSub  = [int]($sel.minPerSubcategory ?? 0)
            maxSelect = $(if ($null -ne $sel.maxSelectCount) { [int]$sel.maxSelectCount } else { $null })
        })
    } elseif ($x.PSObject.Properties['selection']) {
        $x.PSObject.Properties.Remove('selection')
    }
    foreach ($legacy in 'subcats', 'evxlTiers', 'rank', 'volts', 'hdrs', 'rows') { if ($x.PSObject.Properties[$legacy]) { $x.PSObject.Properties.Remove($legacy) } }
    $stamped++
    $after = ($x | ConvertTo-Json -Depth 10 -Compress); if ($after -ne $before) { $changed++; if ($env:STAMP_DEBUG) { Write-Output "CHANGED $($x.name) [$($x.difficulty)]"; Write-Output "  before: $($before.Substring(0,[Math]::Min(300,$before.Length)))"; Write-Output "  after : $($after.Substring(0,[Math]::Min(300,$after.Length)))" } }
}

Write-Output ("{0} of {1} entries matched the catalog; {2} changed." -f $stamped, $data.Count, $changed)
if ($missing.Count) { Write-Output "Not in catalog:"; $missing | ForEach-Object { "  $_" } }
if ($repartitioned.Count) { Write-Output "Re-partitioned along the catalog's new boundaries:"; $repartitioned | ForEach-Object { "  $_" } }
if ($layoutDiffers.Count) { Write-Output "Catalog layout no longer fits (run refresh-all-from-kovaaks.ps1):"; $layoutDiffers | ForEach-Object { "  $_" } }
$modes = @{}; foreach ($x in $data) { if ($x.rankCalc) { $modes[$x.rankCalc]++ } }
Write-Output ("modes: " + (($modes.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ', '))

if ($changed -eq 0) { Write-Output "Nothing to write."; exit 0 }
if ($PSCmdlet.ShouldProcess($Html, "Write $changed stamped entries")) {
    Write-TrackerDataset $ds $Html
    Write-Output "Wrote $Html"
}
