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

# A SCENARIO-NAME MAP. PowerShell's @{} folds key case, so `PureG BounceSphere` and
# `PureG Bouncesphere` are ONE key in it -- and KovaaK's ships both spellings (the transfer
# map documents 18 such variants; data/benchmarks.json carries `ODB MFSI`/`odb MFSI` and
# `143 LIQUID CLICK`/`143 Liquid Click`). Every name-keyed score and attempts map here used
# @{}, so a merge would have SILENTLY combined two different scenarios' scores into one.
# Found 2026-08-31 when ConvertFrom-Json threw on an export carrying both PureG spellings --
# the loud half of the same bug, and the only reason the quiet half was noticed.
#
# A Hashtable with an Ordinal comparer, NOT a Dictionary[string,object]: it keeps hashtable
# semantics, so a missing key still returns $null instead of throwing, and every existing
# caller is unaffected.
function New-NameMap { [hashtable]::new([StringComparer]::Ordinal) }
$PctRegex = '^-?\d+(\.\d+)?%$'
$Inv = [System.Globalization.CultureInfo]::InvariantCulture
$DataTag   = '<script id="benchmarks-data" type="application/json">'
$ScoresTag = '<script id="scores-data" type="application/json">'
$AttemptsTag = '<script id="attempts-data" type="application/json">'   # since 2026-08-18: { name: { n, last: [[t, s], ...] } }, {} in the template

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
# A dataset lives in one of two places:
#   - a tracker HTML file (the two embedded blocks) -- what toolkit users have;
#   - the tracker repo's data/ folder (benchmarks.json, one entry per line;
#     scores.json, one score per line) -- the canonical source there, which
#     build.ps1 assembles into mini_evxl.html / template.html.
# Read-TrackerDataset takes either (a folder path or an .html path) and
# Write-TrackerDataset writes back to wherever it came from ($ds.kind).
# Returns @{ kind; path; data; scores (hashtable name->double); legacy (bool);
#            + content/start/end/scoresStart/scoresEnd for HTML }.
# A v1 file (no scores block, entries with hdrs/rows) is refused unless -AllowLegacy:
# writing v2 data into a page whose script still expects v1 would break it.
#
# Where a script should look when given nothing: the repo's data/ folder if it
# sits next to the script, else mini_evxl.html next to it, else sync-state.json's
# trackerHtml (the toolkit convention). Empty string = nothing found.
function Resolve-TrackerTarget([string]$ScriptRoot, [string]$Given) {
    if ($Given) { return (Resolve-FullPath $Given) }
    $d = Join-Path $ScriptRoot 'data'
    if ((Test-Path -LiteralPath (Join-Path $d 'benchmarks.json')) -and (Test-Path -LiteralPath (Join-Path $d 'scores.json'))) { return $d }
    $h = Join-Path $ScriptRoot 'mini_evxl.html'
    if (Test-Path -LiteralPath $h) { return $h }
    $st = Join-Path $ScriptRoot 'sync-state.json'
    if (Test-Path -LiteralPath $st) { $s = Get-Content -Raw -LiteralPath $st | ConvertFrom-Json; if ($s.trackerHtml) { return (Resolve-FullPath $s.trackerHtml) } }
    ''
}
function Read-TrackerDataset([string]$Path, [switch]$AllowLegacy) {
    if (Test-Path -LiteralPath $Path -PathType Container) {
        $bj = Join-Path $Path 'benchmarks.json'; $sj = Join-Path $Path 'scores.json'
        if (-not (Test-Path -LiteralPath $bj)) { throw "No benchmarks.json in $Path" }
        $data = @([System.IO.File]::ReadAllText($bj, $Utf8NoBom) | ConvertFrom-Json)
        $scores = New-NameMap
        if (Test-Path -LiteralPath $sj) {
            $obj = [System.IO.File]::ReadAllText($sj, $Utf8NoBom) | ConvertFrom-Json
            if ($obj) { foreach ($p in $obj.PSObject.Properties) { $v = ConvertTo-Num $p.Value; if ($v -gt 0) { $scores[$p.Name] = $v } } }
        }
        if (@($data | Where-Object { $_.PSObject.Properties['rows'] -and -not $_.PSObject.Properties['groups'] }).Count) { throw "$bj holds v1 (hdrs/rows) entries" }
        $attempts = Read-AttemptsFile (Join-Path $Path 'attempts.json')   # {} when the file doesn't exist yet
        return [pscustomobject]@{ kind = 'dir'; path = $Path; data = $data; scores = $scores; attempts = $attempts; legacy = $false }
    }
    $Html = $Path
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
    $scores = New-NameMap; $se = -1
    if ($ss -ge 0) {
        $ss += $ScoresTag.Length
        $se = $content.IndexOf('</script>', $ss)
        $obj = $content.Substring($ss, $se - $ss) | ConvertFrom-Json
        if ($obj) { foreach ($p in $obj.PSObject.Properties) { $v = ConvertTo-Num $p.Value; if ($v -gt 0) { $scores[$p.Name] = $v } } }
    }
    # attempts block (optional; pages built before 2026-08-18 have none)
    $attempts = $null; $as = $content.IndexOf($AttemptsTag); $ae = -1
    if ($as -ge 0) {
        $as += $AttemptsTag.Length
        $ae = $content.IndexOf('</script>', $as)
        $attempts = ConvertFrom-AttemptsJson ($content.Substring($as, $ae - $as))
    }
    [pscustomobject]@{ kind = 'html'; path = $Html; content = $content; start = $s; end = $e; data = $data; scoresStart = $ss; scoresEnd = $se; scores = $scores; attemptsStart = $as; attemptsEnd = $ae; attempts = $attempts; legacy = $legacy }
}

# ---- attempts (2026-08-18, DESIGN_INTENT D10) ------------------------------------
# name -> @{ n = <int>; last = @(@(t, s), ...) } newest-first, t in ms, capped at 20.
# The page's mergeAttempts() rule, mirrored: same score within ten minutes = the
# same run seen twice.
$AttemptKeep = 20
$AttemptDedupeMs = 600000
# Newest-first, capped, WITHOUT piping arrays-of-arrays (a one-element result
# unrolls to the inner pair -- the trap CLAUDE.md warns about). Sorts indices.
function Get-AttemptsTrimmed($pairs) {
    $arr = @($pairs)
    if ($arr.Count -eq 0) { return , @() }
    $order = @(0..($arr.Count - 1) | Sort-Object { -[long](@($arr[$_])[0]) })
    $out = New-Object System.Collections.Generic.List[object]
    foreach ($i in $order) { if ($out.Count -ge $AttemptKeep) { break }; $out.Add(@($arr[$i])) }
    , $out.ToArray()
}
function ConvertFrom-AttemptsJson([string]$json) {
    $out = New-NameMap
    if (-not $json -or -not $json.Trim() -or $json.Trim() -eq '{}') { return $out }
    # -AsHashtable: ConvertFrom-Json without it FOLDS KEY CASE and throws outright when two
    # keys differ only by case, which is what an export carrying both PureG spellings does.
    # The OrderedHashtable it returns is case-sensitive, so both survive as distinct entries.
    $obj = $json | ConvertFrom-Json -AsHashtable
    if ($obj) {
        foreach ($nm in @($obj.Keys)) {
            $r = $obj[$nm]
            if ($null -eq $r -or $null -eq $r.last) { continue }
            $last = New-Object System.Collections.Generic.List[object]
            foreach ($x in @($r.last)) { $x = @($x); if ($x.Count -ge 2) { $t = [double]$x[0]; $sc = [double]$x[1]; if ($t -gt 0 -and $sc -ge 0) { $last.Add(@([long]$t, $sc)) } } }
            $n = if ($null -ne $r.n) { [int]$r.n } else { $last.Count }
            $out[$nm] = @{ n = [Math]::Max($n, $last.Count); last = (Get-AttemptsTrimmed $last.ToArray()) }
        }
    }
    $out
}
function Read-AttemptsFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return @{} }
    ConvertFrom-AttemptsJson ([System.IO.File]::ReadAllText($Path, $Utf8NoBom))
}
# Compact JSON for the page block: {"name":{"n":12,"last":[[t,s],...]},...}, names sorted.
function ConvertTo-AttemptsJson($attempts) {
    if (-not $attempts -or $attempts.Count -eq 0) { return '{}' }
    $parts = @()
    foreach ($k in ($attempts.Keys | Sort-Object)) {
        $r = $attempts[$k]
        $runs = @(); foreach ($x in @($r.last)) { $x = @($x); $runs += ('[' + [long]$x[0] + ',' + (ConvertTo-JsonNum ([double]$x[1]) -Round2).ToString($Inv) + ']') }
        $parts += (($k | ConvertTo-Json -Compress) + ':{"n":' + [int]$r.n + ',"last":[' + ($runs -join ',') + ']}')
    }
    ('{' + ($parts -join ',') + '}') -replace '</', '<\/'
}
# One scenario per line, for data/attempts.json (git diffs read).
function ConvertTo-AttemptsFileText($attempts) {
    if (-not $attempts -or $attempts.Count -eq 0) { return "{}`n" }
    $lines = @()
    foreach ($k in ($attempts.Keys | Sort-Object)) {
        $r = $attempts[$k]
        $runs = @(); foreach ($x in @($r.last)) { $x = @($x); $runs += ('[' + [long]$x[0] + ',' + (ConvertTo-JsonNum ([double]$x[1]) -Round2).ToString($Inv) + ']') }
        $lines += ('  ' + ($k | ConvertTo-Json -Compress) + ': {"n":' + [int]$r.n + ',"last":[' + ($runs -join ',') + ']}')
    }
    "{`n" + ($lines -join ",`n") + "`n}`n"
}
# Merge incoming (name -> @{n; last}) into $ds.attempts (creating it); returns the number of new runs.
function Merge-Attempts($ds, $incoming) {
    if ($null -eq $ds.attempts) { $ds | Add-Member -NotePropertyName attempts -NotePropertyValue (New-NameMap) -Force }
    $added = 0
    foreach ($k in $incoming.Keys) {
        $inc = $incoming[$k]
        $cur = $null; if ($ds.attempts.ContainsKey($k)) { $cur = $ds.attempts[$k] } else { $cur = @{ n = 0; last = @() } }
        $last = New-Object System.Collections.Generic.List[object]
        foreach ($y in @($cur.last)) { $y = @($y); if ($y.Count -ge 2) { $last.Add(@([long]$y[0], [double]$y[1])) } }
        $n = [int]$cur.n
        foreach ($x in @($inc.last)) {
            $x = @($x); if ($x.Count -lt 2) { continue }
            $t = [long]$x[0]; $sc = [double]$x[1]
            $dup = $false
            foreach ($y in $last) { if ([double]$y[1] -eq $sc -and [Math]::Abs([long]$y[0] - $t) -lt $AttemptDedupeMs) { $dup = $true; break } }
            if ($dup) { continue }
            $last.Add(@($t, $sc)); $n++; $added++
        }
        $ds.attempts[$k] = @{ n = [Math]::Max($n, $last.Count); last = (Get-AttemptsTrimmed $last.ToArray()) }
    }
    $added
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
# Writes back to where the dataset came from: the data/ folder (one entry / one
# score per line, so git diffs read), or the HTML's two blocks. If an HTML file
# has no scores block yet (a v2 page being migrated), one is inserted right after
# the benchmarks block. $Path defaults to $ds.path.
function Write-TrackerDataset($ds, [string]$Path) {
    if (-not $Path) { $Path = $ds.path }
    if ($ds.kind -eq 'dir' -or (Test-Path -LiteralPath $Path -PathType Container)) {
        $entryLines = @($ds.data | ForEach-Object { (($_ | ConvertTo-Json -Depth 10 -Compress) -replace '</', '<\/') })
        [System.IO.File]::WriteAllText((Join-Path $Path 'benchmarks.json'), "[`n" + ($entryLines -join ",`n") + "`n]`n", $Utf8NoBom)
        $scoreLines = @($ds.scores.Keys | Sort-Object | ForEach-Object { if ([double]$ds.scores[$_] -gt 0) { '  ' + ($_ | ConvertTo-Json -Compress) + ': ' + (ConvertTo-JsonNum $ds.scores[$_] -Round2) } })
        [System.IO.File]::WriteAllText((Join-Path $Path 'scores.json'), $(if ($scoreLines.Count) { "{`n" + ($scoreLines -join ",`n") + "`n}`n" } else { "{}`n" }), $Utf8NoBom)
        # attempts.json is written only once there is something to hold (so a
        # repo without attempts doesn't grow an empty file from every script run)
        if ($ds.PSObject.Properties['attempts'] -and $ds.attempts -and ($ds.attempts.Count -gt 0 -or (Test-Path -LiteralPath (Join-Path $Path 'attempts.json')))) {
            [System.IO.File]::WriteAllText((Join-Path $Path 'attempts.json'), (ConvertTo-AttemptsFileText $ds.attempts), $Utf8NoBom)
        }
        return
    }
    $Html = $Path
    $json = ConvertTo-DatasetJson $ds.data
    $scoresJson = ConvertTo-ScoresJson $ds.scores
    $c = $ds.content
    # attempts block first (it comes last in the file; replace back-to-front so offsets stay valid)
    $hasAttempts = $ds.PSObject.Properties['attempts'] -and $null -ne $ds.attempts
    if ($ds.PSObject.Properties['attemptsStart'] -and $ds.attemptsStart -ge 0) {
        if ($hasAttempts) { $c = $c.Substring(0, $ds.attemptsStart) + (ConvertTo-AttemptsJson $ds.attempts) + $c.Substring($ds.attemptsEnd) }
    }
    if ($ds.scoresStart -ge 0) {
        $c = $c.Substring(0, $ds.scoresStart) + $scoresJson + $c.Substring($ds.scoresEnd)
        $c = $c.Substring(0, $ds.start) + $json + $c.Substring($ds.end)
    } else {
        $after = $c.IndexOf('</script>', $ds.end) + '</script>'.Length
        $c = $c.Substring(0, $ds.start) + $json + '</script>' + "`n" + $ScoresTag + $scoresJson + '</script>' + $c.Substring($after)
    }
    # a page built before the attempts block existed gets one appended after the scores block when there are attempts to write
    if ($hasAttempts -and $ds.attempts.Count -gt 0 -and -not ($ds.PSObject.Properties['attemptsStart'] -and $ds.attemptsStart -ge 0)) {
        $si = $c.IndexOf($ScoresTag)
        if ($si -ge 0) { $after = $c.IndexOf('</script>', $si) + '</script>'.Length; $c = $c.Substring(0, $after) + "`n" + $AttemptsTag + (ConvertTo-AttemptsJson $ds.attempts) + '</script>' + $c.Substring($after) }
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
    $items = @(); $scores = New-NameMap
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
    $sc = @(); if ($b.PSObject.Properties['subcats']) { $sc = @($b.subcats) }   # not `= if (...) { @(...) }`: that unrolls a one-group layout into its cells
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
# A layout as one comparable string ("cat~sub~n|cat~sub~n"). foreach, not a
# pipeline: piping a function's comma-wrapped array return hands the WHOLE array
# to ForEach-Object as one item and joins "System.Object[]"s -- which made every
# entry read as "layout changed" once.
function Get-LayoutKey($layout) { $parts = @(); foreach ($l in @($layout)) { $parts += (@($l) -join '~') }; $parts -join '|' }
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
    $m = New-NameMap
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
