# Shared helpers for every script that touches the tracker file. Dot-source it:
#   . (Join-Path $PSScriptRoot 'lib\kovaaks-table.ps1')
#
# The tracker HTML embeds two JSON blocks:
#   <script id="benchmarks-data" type="application/json">[ entry, ... ]</script>
#   <script id="scores-data"     type="application/json">{ "scenario": score, ... }</script>
#
# An entry (format v2, 2026-08-16 late) is structure only -- the same for every
# player -- and reads:
#   { name, pack, difficulty,
#     tiers:  ["Iron","Bronze",...],                       # tier names in ladder order
#     groups: [ { category, subcategory,                   # table order = evxl's order
#                 scenarios: [ { name, thresholds:[n,...] }, ... ] }, ... ],
#     rankCalc, evxlId, evxlRankOffset, evxlDiffIndex,     # stamped by apply-evxl-catalog.ps1
#     selection: {...} }                                    # pool benchmarks only
# Scores live in the scores block (and in the browser's own store); the page
# overlays them by scenario name. The old v1 shape (hdrs/rows mirroring evxl's
# scraped table, score baked into each row) is read ONLY by ConvertFrom-V1Entry,
# for the one-off migration and for the page's importer.
#
# Numbers: every number that goes into or comes out of the file is written the
# way the page reads it -- '.' decimal, ',' thousands (in v1 strings) -- whatever
# the machine's language settings. [double]::TryParse and "{0:N0}" -f use the
# CURRENT culture (on a de-DE machine "131.02" parses as 13102), so always go
# through ConvertTo-Num / Format-Num.

$KovaaksApiBase = 'https://kovaaks.com/webapp-backend/benchmarks/player-progress-rank-benchmark'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$PctRegex = '^-?\d+(\.\d+)?%$'
$Inv = [System.Globalization.CultureInfo]::InvariantCulture
$DataTag   = '<script id="benchmarks-data" type="application/json">'
$ScoresTag = '<script id="scores-data" type="application/json">'

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
# A threshold/score as a JSON number: integral values as integers (ConvertTo-Json
# would otherwise write 140.0), anything else as-is. -Round2 for scores, which
# are recorded to 2 dp everywhere in this project (thresholds are never rounded).
function ConvertTo-JsonNum($n, [switch]$Round2) {
    $n = [double]$n
    if ($Round2) { $n = [math]::Round($n, 2) }
    if ($n -eq [math]::Floor($n) -and [math]::Abs($n) -lt 9e15) { return [long]$n }
    return $n
}

# ---- dataset in / out --------------------------------------------------------
# Returns @{ content; start; end; data; scoresStart; scoresEnd; scores (hashtable name->double); legacy (bool) }.
# A v1 file (no scores block, entries with hdrs/rows) is refused unless -AllowLegacy:
# writing v2 data into a page whose script still expects v1 would break it.
function Read-TrackerDataset([string]$Html, [switch]$AllowLegacy) {
    $content = [System.IO.File]::ReadAllText($Html, $Utf8NoBom)
    $s = $content.IndexOf($DataTag)
    if ($s -lt 0) { throw "No embedded benchmarks-data block in $Html" }
    $s += $DataTag.Length
    $e = $content.IndexOf('</script>', $s)
    $data = @($content.Substring($s, $e - $s) | ConvertFrom-Json)
    $ss = $content.IndexOf($ScoresTag)
    $legacy = ($ss -lt 0) -or (@($data | Where-Object { $_.PSObject.Properties['rows'] -and -not $_.PSObject.Properties['groups'] }).Count -gt 0)
    if ($legacy -and -not $AllowLegacy) {
        throw "$Html is in the old (v1) tracker format -- its page can't read v2 data. Get the current template.html and carry your scores over with the page's Settings -> Export / Import, or run dev\migrate-v2.ps1 on a personal copy that has the v2 page."
    }
    $scores = @{}; $se = -1
    if ($ss -ge 0) {
        $ss += $ScoresTag.Length
        $se = $content.IndexOf('</script>', $ss)
        $obj = $content.Substring($ss, $se - $ss) | ConvertFrom-Json
        if ($obj) { foreach ($p in $obj.PSObject.Properties) { $v = ConvertTo-Num $p.Value; if ($v -gt 0) { $scores[$p.Name] = $v } } }
    }
    [pscustomobject]@{ content = $content; start = $s; end = $e; data = $data; scoresStart = $ss; scoresEnd = $se; scores = $scores; legacy = $legacy }
}
# Serialise for embedding in a <script> block: escape "</" so a scenario named
# "</script>" (names on KovaaK's are user-created) can't end the tag early.
function ConvertTo-EmbeddedJson($obj, [int]$Depth = 10) {
    ($obj | ConvertTo-Json -Depth $Depth -Compress) -replace '</', '<\/'
}
function ConvertTo-DatasetJson($data) { ConvertTo-EmbeddedJson $data }
function ConvertTo-ScoresJson($scores) {
    # Sorted by name so diffs of the file are readable; values as JSON numbers.
    $o = [ordered]@{}
    foreach ($k in ($scores.Keys | Sort-Object)) { $v = [double]$scores[$k]; if ($v -gt 0) { $o[$k] = ConvertTo-JsonNum $v -Round2 } }
    if ($o.Count -eq 0) { return '{}' }
    ConvertTo-EmbeddedJson $o 3
}
# Writes both blocks. If the file has no scores block yet (a v2 page being
# migrated), one is inserted right after the benchmarks block.
function Write-TrackerDataset($ds, [string]$Html) {
    $json = ConvertTo-DatasetJson $ds.data
    $scoresJson = ConvertTo-ScoresJson $ds.scores
    $c = $ds.content
    if ($ds.scoresStart -ge 0) {
        # scores block comes after the data block; replace back-to-front so offsets stay valid
        $c = $c.Substring(0, $ds.scoresStart) + $scoresJson + $c.Substring($ds.scoresEnd)
        $c = $c.Substring(0, $ds.start) + $json + $c.Substring($ds.end)
    } else {
        $after = $c.IndexOf('</script>', $ds.end) + '</script>'.Length
        $c = $c.Substring(0, $ds.start) + $json + '</script>' + "`n" + $ScoresTag + $scoresJson + '</script>' + $c.Substring($after)
    }
    [System.IO.File]::WriteAllText($Html, $c, $Utf8NoBom)
}

# ---- v1 -> v2 -----------------------------------------------------------------
# Reads a v1 entry (hdrs/rows) into groups + tiers, and lifts its row scores.
# Grouping: the catalog layout (`subcats` = [[cat, sub, count], ...]) when its
# counts add up to the parsed scenario count -- exactly what the page's rank
# engine preferred -- else the table's own label path (category, subcategory)
# read off the first row of each block; a table with no labels at all becomes
# one group per scenario (how evxl's catalog encodes uncategorised benchmarks).
# Returns @{ entry; scores (hashtable); labelMismatch (string or $null) }.
function ConvertFrom-V1Entry($b) {
    $hdrs = @($b.hdrs)
    $sIdx = [array]::IndexOf([string[]]$hdrs, 'Scenario')
    $maxDepth = [Math]::Max($sIdx, 0)
    $hasEnergy = $hdrs.Count -gt 0 -and $hdrs[-1] -eq 'Energy'
    $tierEnd = if ($hasEnergy) { $hdrs.Count - 1 } else { $hdrs.Count }
    $tierNames = @(); for ($i = $sIdx + 3; $i -lt $tierEnd; $i++) { $tierNames += [string]$hdrs[$i] }
    $cur = New-Object string[] ([Math]::Max($maxDepth, 1)); for ($i = 0; $i -lt $cur.Length; $i++) { $cur[$i] = '' }
    $items = @(); $scores = @{}
    foreach ($row in $b.rows) {
        if (@($row).Count -le 1) { continue }
        $p = -1; for ($i = 0; $i -lt $row.Count; $i++) { if ([string]$row[$i] -match $PctRegex) { $p = $i; break } }
        if ($p -lt 2) { continue }
        $name = ([string]$row[$p - 2]).Trim()
        $score = ConvertTo-Num $row[$p - 1]
        $labels = @(); if ($p - 2 -gt 0) { $labels = @($row[0..($p - 3)] | ForEach-Object { ([string]$_) -replace '\s*-\s*[\d,]+$', '' } | ForEach-Object { $_.Trim() }) }
        if ($maxDepth -gt 0 -and $labels.Count -gt 0) {
            $start = $maxDepth - $labels.Count
            for ($i = 0; $i -lt $labels.Count; $i++) { $cur[[Math]::Max($start + $i, 0)] = $labels[$i] }
        }
        $th = @(); for ($i = 0; $i -lt $tierNames.Count; $i++) { $cell = if (($p + 1 + $i) -lt $row.Count) { $row[$p + 1 + $i] } else { '' }; $th += (ConvertTo-JsonNum (ConvertTo-Num $cell)) }
        $tags = @($cur | Where-Object { $_ })
        $items += [pscustomobject]@{ name = $name; thresholds = $th; tags = $tags }
        if ($score -gt 0 -and (-not $scores.ContainsKey($name) -or $scores[$name] -lt $score)) { $scores[$name] = [math]::Round($score, 2) }
    }
    # groups
    $groups = @(); $mismatch = $null
    $sc = if ($b.PSObject.Properties['subcats']) { @($b.subcats) } else { @() }
    $sum = 0; foreach ($x in $sc) { $sum += [int]$x[2] }
    if ($sc.Count -gt 0 -and $sum -eq $items.Count) {
        $i = 0
        foreach ($x in $sc) {
            $n = [int]$x[2]; if ($n -le 0) { continue }
            $slice = @($items[$i..($i + $n - 1)]); $i += $n
            # Catalog names carry stray spaces (" Precision"); the table labels the page
            # showed were trimmed, so trim -- the filter chips must not change.
            $cat = ([string]$x[0]).Trim(); $sub = ([string]$x[1]).Trim()
            # Do the table's own labels agree with the catalog's names? Report if not.
            $t0 = $slice[0].tags
            $lbl = if ($t0.Count -gt 1) { "$($t0[0])/$($t0[1])" } elseif ($t0.Count -eq 1) { $t0[0] } else { '' }
            $catLbl = if ($cat -and $sub) { "$cat/$sub" } else { "$cat$sub" }
            if ($lbl -and $catLbl -and ($lbl -ne $catLbl)) { $mismatch = "table '$lbl' vs catalog '$catLbl'" }
            $groups += [pscustomobject]@{ category = $cat; subcategory = $sub; scenarios = @($slice | ForEach-Object { [pscustomobject]@{ name = $_.name; thresholds = $_.thresholds } }) }
        }
    } else {
        $last = $null
        foreach ($it in $items) {
            $tags = @($it.tags)
            $cat = if ($tags.Count -gt 1) { $tags[0] } else { '' }
            $sub = if ($tags.Count -ge 1) { $tags[-1] } else { '' }
            $key = if ($tags.Count) { $tags -join '::' } else { "#$($groups.Count)" }
            if ($null -eq $last -or $last.key -ne $key) { $last = [pscustomobject]@{ key = $key; category = $cat; subcategory = $sub; scenarios = @() }; $groups += $last }
            $last.scenarios += [pscustomobject]@{ name = $it.name; thresholds = $it.thresholds }
        }
        $groups = @($groups | ForEach-Object { [pscustomobject]@{ category = $_.category; subcategory = $_.subcategory; scenarios = @($_.scenarios) } })
    }
    $entry = [ordered]@{ name = $b.name; pack = $(if ($b.pack) { $b.pack } else { $b.name }); difficulty = $b.difficulty; tiers = $tierNames; groups = $groups }
    foreach ($f in 'rankCalc', 'evxlId', 'evxlRankOffset', 'evxlDiffIndex', 'selection', 'rankReq') {
        if ($b.PSObject.Properties[$f] -and $null -ne $b.$f) { $entry[$f] = $b.$f }
    }
    [pscustomobject]@{ entry = [pscustomobject]$entry; scores = $scores; labelMismatch = $mismatch }
}

# ---- entry helpers (v2) ------------------------------------------------------
# Every scenario in table order: [{ name, thresholds (double[]), category, subcategory }]
function Get-EntryScenarios($entry) {
    $out = @()
    foreach ($g in @($entry.groups)) {
        foreach ($s in @($g.scenarios)) {
            $out += [pscustomobject]@{ name = ([string]$s.name).Trim(); thresholds = @(@($s.thresholds) | ForEach-Object { [double]$_ }); category = [string]$g.category; subcategory = [string]$g.subcategory }
        }
    }
    , $out
}
function Get-EntryTierNames($entry) { , @(@($entry.tiers) | ForEach-Object { [string]$_ }) }
# The layout, catalog-shaped: [[category, subcategory, count], ...]
function Get-EntryLayout($entry) { , @(@($entry.groups) | ForEach-Object { , @([string]$_.category, [string]$_.subcategory, @($_.scenarios).Count) }) }
function Get-EntryScenarioCount($entry) { $n = 0; foreach ($g in @($entry.groups)) { $n += @($g.scenarios).Count }; $n }
# evxl displays catalog tier keys with underscores as spaces ("One_Above_All" -> "One Above All").
function Get-DisplayTierNames($catalogTiers, $apiTiers, $entry) {
    if ($catalogTiers -and @($catalogTiers).Count) { return , @($catalogTiers | ForEach-Object { ([string]$_) -replace '_', ' ' }) }
    if ($apiTiers -and @($apiTiers).Count) { return , @($apiTiers) }
    , (Get-EntryTierNames $entry)
}

# evxl's bundle catalog (dev\evxl-bundle-catalog.json), keyed "name|difficulty"
# (lower-cased, trimmed) -> @{ layout = [[cat, sub, count], ...]; tiers = catalog
# rank names; rankCalc; id }. The layout is how the API's flat scenario list is
# sliced into groups; the entry's own groups are the fallback when a benchmark
# isn't in the catalog.
function Get-CatalogLayouts([string]$CatalogPath) {
    $byKey = @{}
    if (-not (Test-Path -LiteralPath $CatalogPath)) { return $byKey }
    $cat = ([System.IO.File]::ReadAllText($CatalogPath, $Utf8NoBom) | ConvertFrom-Json).benchmarks
    foreach ($b in $cat) {
        foreach ($d in $b.difficulties) {
            $layout = @()
            foreach ($cg in $d.categories) { foreach ($sc in $cg.subcategories) { $layout += , @(([string]$cg.categoryName).Trim(), ([string]$sc.subcategoryName).Trim(), [int]$sc.scenarioCount) } }
            $tiers = @(); if ($d.rankColors) { $tiers = @($d.rankColors.PSObject.Properties.Name) }
            $byKey[("{0}|{1}" -f $b.benchmarkName.Trim(), $d.difficultyName.Trim()).ToLower()] = @{ layout = $layout; tiers = $tiers; rankCalc = [string]$b.rankCalculation; id = [int]$d.kovaaksBenchmarkId }
        }
    }
    $byKey
}
function Get-EntryCatalogKey($entry) { ("{0}|{1}" -f ([string]$entry.name).Trim(), ([string]$entry.difficulty).Trim()).ToLower() }

# ---- API -----------------------------------------------------------------------
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

# Everything we hold a score for, by scenario name: the file's scores block plus
# an optional Settings-page export (max of the two).
function Get-KnownScores($ds, [string]$ScoresJson) {
    $known = @{}
    foreach ($k in $ds.scores.Keys) { $known[$k] = [double]$ds.scores[$k] }
    if ($ScoresJson) {
        $exp = [System.IO.File]::ReadAllText((Resolve-FullPath $ScoresJson), $Utf8NoBom) | ConvertFrom-Json
        $obj = if ($exp.PSObject.Properties.Name -contains 'scores') { $exp.scores } else { $exp }
        foreach ($p in $obj.PSObject.Properties) { $v = ConvertTo-Num $p.Value; if ($v -gt 0) { $n = $p.Name.Trim(); if (-not $known.ContainsKey($n) -or $known[$n] -lt $v) { $known[$n] = $v } } }
    }
    $known
}
# Merge scores into the dataset's scores block, higher-only. Returns the names raised.
function Merge-Scores($ds, $incoming) {
    $raised = @()
    foreach ($k in $incoming.Keys) {
        $v = [math]::Round([double]$incoming[$k], 2)
        if ($v -le 0) { continue }
        if (-not $ds.scores.ContainsKey($k) -or $ds.scores[$k] -lt $v) { $ds.scores[$k] = $v; $raised += $k }
    }
    , $raised
}

# Build groups from an API flat list sliced by a catalog layout ([[cat, sub, count], ...]
# whose counts add up to $flat.Count -- caller checks). Structure only: scores go
# to the scores block (see Merge-Scores).
function New-EntryGroups($layout, $flat) {
    $groups = @(); $i = 0
    foreach ($sc in $layout) {
        $c = ([string]$sc[0]).Trim(); $u = ([string]$sc[1]).Trim(); $n = [int]$sc[2]
        $scen = @()
        for ($k = 0; $k -lt $n; $k++) {
            $s = $flat[$i]; $i++
            $scen += [pscustomobject]@{ name = $s.name; thresholds = @(@($s.thresholds) | ForEach-Object { ConvertTo-JsonNum ([double]$_) }) }
        }
        $groups += [pscustomobject]@{ category = $c; subcategory = $u; scenarios = $scen }
    }
    , $groups
}
# The API's own scores for the player, as a name->score map (÷100 already applied).
function Get-ApiScores($flat) {
    $m = @{}
    foreach ($s in $flat) { if ($s.PSObject.Properties.Name -contains 'score' -and [double]$s.score -gt 0) { $m[$s.name] = [math]::Round([double]$s.score, 2) } }
    $m
}

# Compare an entry's current structure with an API flat list: names added/removed,
# threshold moves on shared names, tier-name change, order change.
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
