# Shared table-building logic for the KovaaK's-API structure scripts:
#   rebuild-entry-from-kovaaks.ps1  (one entry)
#   add-entries-from-catalog.ps1    (new entries from the catalog)
#   refresh-all-from-kovaaks.ps1    (every entry, only rewrite what changed)
# Dot-source it:  . (Join-Path $PSScriptRoot 'lib\kovaaks-table.ps1')
#
# The model, once: KovaaK's player-progress-rank-benchmark returns scenarios
# grouped by KovaaK's own categories in a fixed order; evxl re-chunks that flat
# order by its catalog's subcategory counts (`subcats` on our entries). Our
# table rows mirror the scraped layout: the first row of each subcategory group
# carries its labels ([category, subcategory] at depth 2, one label at depth 1),
# later rows start straight at the scenario name; then Score, "0%", tiers.

$KovaaksApiBase = 'https://kovaaks.com/webapp-backend/benchmarks/player-progress-rank-benchmark'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$PctRegex = '^-?\d+(\.\d+)?%$'
# Every number that goes into or comes out of the tracker file is written the
# way the page reads it: '.' decimal point, ',' thousands separator, regardless
# of the machine's language settings. [double]::TryParse and "{0:N0}" -f use the
# CURRENT culture -- on a de-DE machine "131.02" parses as 13102 and 1234 formats
# as "1.234", which the page then misreads. Always go through these two.
$Inv = [System.Globalization.CultureInfo]::InvariantCulture

function Resolve-FullPath([string]$p) { $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($p) }

# "1,234.5" / "1234.5" / 1234.5 -> [double]; anything unparseable -> 0.
function ConvertTo-Num($s) {
    if ($null -eq $s) { return 0.0 }
    if ($s -is [double] -or $s -is [int] -or $s -is [long] -or $s -is [decimal]) { return [double]$s }
    $v = 0.0
    $ok = [double]::TryParse((([string]$s) -replace ',', ''), [System.Globalization.NumberStyles]::Float, $Inv, [ref]$v)
    if ($ok) { return $v } else { return 0.0 }
}
# 1234 -> "1,234"; 131.5 -> "131.5"; 131.02 -> "131.02" (max 2 dp, no trailing zeros)
function Format-Num($n) {
    $n = [double]$n
    if ($n -eq [math]::Floor($n)) { return $n.ToString('N0', $Inv) }
    return $n.ToString('N2', $Inv).TrimEnd('0').TrimEnd('.')
}

# Dataset in / out
function Read-TrackerDataset([string]$Html) {
    $content = [System.IO.File]::ReadAllText($Html, $Utf8NoBom)
    $startTag = '<script id="benchmarks-data" type="application/json">'
    $s = $content.IndexOf($startTag)
    if ($s -lt 0) { throw "No embedded benchmarks-data block in $Html" }
    $s += $startTag.Length
    $e = $content.IndexOf('</script>', $s)
    [pscustomobject]@{ content = $content; start = $s; end = $e; data = @($content.Substring($s, $e - $s) | ConvertFrom-Json) }
}
# Serialise a dataset for embedding in the page's <script> block. Two things the
# plain ConvertTo-Json doesn't do: drop the empty [""] rows the original scrape
# left in every table (219 of them; every parser had a "skip 1-cell rows" line
# just to step over them), and escape "</" so a scenario named "</script>"
# (names on KovaaK's are user-created) can't end the tag early.
function ConvertTo-DatasetJson($data) {
    foreach ($b in $data) {
        if (-not $b.PSObject.Properties['rows']) { continue }
        # Collected by hand: @(... | Where-Object ...) would un-nest a lone surviving row.
        $kept = New-Object System.Collections.ArrayList
        foreach ($row in $b.rows) { if (@($row).Count -gt 1) { [void]$kept.Add($row) } }
        $b.rows = $kept.ToArray()
    }
    ($data | ConvertTo-Json -Depth 10 -Compress) -replace '</', '<\/'
}
function Write-TrackerDataset($ds, [string]$Html) {
    $json = ConvertTo-DatasetJson $ds.data
    [System.IO.File]::WriteAllText($Html, $ds.content.Substring(0, $ds.start) + $json + $ds.content.Substring($ds.end), $Utf8NoBom)
}

# API
function Get-KovaaksBenchmark([int]$Id, [string]$SteamId, [int]$TimeoutSec = 30) {
    (Invoke-WebRequest -Uri "$KovaaksApiBase`?benchmarkId=$Id&steamId=$SteamId" -TimeoutSec $TimeoutSec -UseBasicParsing).Content
}
# Flatten a response: [{name, thresholds, score}] in API order (evxl's I()), plus tier names.
function ConvertFrom-KovaaksBenchmark([string]$RawJson) {
    $api = $RawJson | ConvertFrom-Json
    $flat = @()
    if ($api.categories) {
        foreach ($cp in $api.categories.PSObject.Properties) {
            foreach ($sp in $cp.Value.scenarios.PSObject.Properties) {
                $flat += [pscustomobject]@{ name = $sp.Name.Trim(); thresholds = @($sp.Value.rank_maxes); score = [double]$sp.Value.score / 100 }
            }
        }
    }
    $tiers = @()
    if ($api.ranks) { $tiers = @($api.ranks | ForEach-Object { [string]$_.name } | Where-Object { $_ -and $_ -ne 'No Rank' }) }
    [pscustomobject]@{ flat = $flat; tiers = $tiers; hasCategories = [bool]$api.categories }
}

# Everything we hold a score for, by scenario name (dataset rows + optional export)
function Get-KnownScores($data, [string]$ScoresJson) {
    $known = @{}
    foreach ($x in $data) {
        foreach ($row in $x.rows) {
            if ($row.Count -le 1) { continue }
            $p = -1; for ($i = 0; $i -lt $row.Count; $i++) { if ([string]$row[$i] -match $PctRegex) { $p = $i; break } }
            if ($p -lt 2) { continue }
            $n = ([string]$row[$p - 2]).Trim(); $v = ConvertTo-Num $row[$p - 1]
            if ($v -gt 0) { if (-not $known.ContainsKey($n) -or $known[$n] -lt $v) { $known[$n] = $v } }
        }
    }
    if ($ScoresJson) {
        $exp = [System.IO.File]::ReadAllText((Resolve-FullPath $ScoresJson), $Utf8NoBom) | ConvertFrom-Json
        $obj = if ($exp.PSObject.Properties.Name -contains 'scores') { $exp.scores } else { $exp }
        foreach ($p in $obj.PSObject.Properties) { $v = ConvertTo-Num $p.Value; if ($v -gt 0) { $n = $p.Name.Trim(); if (-not $known.ContainsKey($n) -or $known[$n] -lt $v) { $known[$n] = $v } } }
    }
    $known
}

# What an entry's rows currently say: scenario names in order and their thresholds
function Get-EntryScenarios($entry) {
    $sIdx = [array]::IndexOf([string[]]$entry.hdrs, 'Scenario')
    $hasE = $entry.hdrs[-1] -eq 'Energy'
    $nT = $entry.hdrs.Count - ($sIdx + 3) - $(if ($hasE) { 1 } else { 0 })
    $out = @()
    foreach ($row in $entry.rows) {
        if ($row.Count -le 1) { continue }
        $p = -1; for ($i = 0; $i -lt $row.Count; $i++) { if ([string]$row[$i] -match $PctRegex) { $p = $i; break } }
        if ($p -lt 2) { continue }
        $th = @(); for ($i = 0; $i -lt $nT; $i++) { $cell = if (($p + 1 + $i) -lt $row.Count) { $row[$p + 1 + $i] } else { '' }; $th += (ConvertTo-Num $cell) }
        $out += [pscustomobject]@{ name = ([string]$row[$p - 2]).Trim(); thresholds = $th }
    }
    , $out
}
function Get-EntryTierNames($entry) {
    $sIdx = [array]::IndexOf([string[]]$entry.hdrs, 'Scenario')
    $t = @(); for ($i = $sIdx + 3; $i -lt $entry.hdrs.Count; $i++) { if ($entry.hdrs[$i] -and $entry.hdrs[$i] -ne 'Energy') { $t += [string]$entry.hdrs[$i] } }
    , $t
}
# evxl displays catalog tier keys with underscores as spaces ("One_Above_All" -> "One Above All").
function Get-DisplayTierNames($entry, $apiTiers) {
    if ($entry.evxlTiers -and @($entry.evxlTiers).Count) { return , @($entry.evxlTiers | ForEach-Object { ([string]$_) -replace '_', ' ' }) }
    if ($apiTiers -and @($apiTiers).Count) { return , @($apiTiers) }
    , (Get-EntryTierNames $entry)
}
function Get-EntryDepth($entry) { [Math]::Max([array]::IndexOf([string[]]$entry.hdrs, 'Scenario'), 1) }
# For a brand-new entry: 2 if any subcategory has both a category and a subcategory name.
function Get-CatalogDepth($subcats) { if (@($subcats | Where-Object { $_[0] -and $_[1] }).Count -gt 0) { 2 } else { 1 } }

# Build hdrs/rows. $flat in API order; $subcats [[cat, sub, count], ...] whose
# counts add up to $flat.Count (caller checks); scores from $known, else the
# API's, else 0.
function New-TableRows($subcats, $flat, [int]$depth, $known) {
    $rows = @(); $i = 0; $lastCat = $null
    foreach ($sc in $subcats) {
        $c = [string]$sc[0]; $u = [string]$sc[1]; $n = [int]$sc[2]
        for ($k = 0; $k -lt $n; $k++) {
            $scen = $flat[$i]; $i++
            $labels = @()
            if ($k -eq 0) {
                if ($depth -ge 2) { if ($c -ne $lastCat) { $labels = @($c, $u) } else { $labels = @($u) } }
                else { $labels = @($(if ($u) { $u } else { $c })) }
            }
            $score = if ($scen.PSObject.Properties.Name -contains 'score') { [double]$scen.score } else { 0.0 }
            if ($known.ContainsKey($scen.name) -and $known[$scen.name] -gt $score) { $score = $known[$scen.name] }
            $rows += , (@($labels) + @($scen.name, (Format-Num $score), '0%') + @($scen.thresholds | ForEach-Object { Format-Num ([double]$_) }))
        }
        $lastCat = $c
    }
    , $rows
}
function New-TableHdrs([int]$depth, $tierNames, [bool]$energy) {
    $h = @(); for ($k = 0; $k -lt $depth; $k++) { $h += '' }
    $h += @('Scenario', 'Score', '') + @($tierNames)
    if ($energy) { $h += 'Energy' }
    , $h
}

# Compare an entry's current table with an API flat list: names added/removed,
# threshold moves on shared names, tier-name change.
function Compare-EntryToApi($entry, $apiFlat, $apiTiers) {
    $cur = Get-EntryScenarios $entry
    $curNames = @($cur | ForEach-Object { $_.name }); $apiNames = @($apiFlat | ForEach-Object { $_.name })
    $added = @($apiNames | Where-Object { $curNames -notcontains $_ })
    $removed = @($curNames | Where-Object { $apiNames -notcontains $_ })
    $moved = @()
    foreach ($a in $apiFlat) {
        $c = $cur | Where-Object { $_.name -eq $a.name } | Select-Object -First 1
        if ($c -and (($c.thresholds -join ',') -ne (($a.thresholds | ForEach-Object { [double]$_ }) -join ','))) { $moved += $a.name }
    }
    $ourTiers = Get-EntryTierNames $entry
    $tiersChanged = ($apiTiers.Count -gt 0) -and (($ourTiers -join '|') -ne ($apiTiers -join '|'))
    $orderChanged = (-not $added.Count) -and (-not $removed.Count) -and (($curNames -join '|') -ne ($apiNames -join '|'))
    [pscustomobject]@{ added = $added; removed = $removed; moved = $moved; tiersChanged = $tiersChanged; orderChanged = $orderChanged
                       changed = [bool]($added.Count -or $removed.Count -or $moved.Count -or $tiersChanged -or $orderChanged) }
}
