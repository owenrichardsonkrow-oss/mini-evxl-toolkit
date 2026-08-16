# Regenerates template.html from the personal tracker copy this toolkit was
# forked from. Run this whenever the personal copy's dataset changes (new
# playlists added, tier thresholds refreshed) to keep the toolkit's
# pre-loaded structure in sync.
#
# What it does, beyond a straight copy:
#   - Genericizes the title/brand/topnav (no personal name or Steam link)
#   - Flips IS_TOOLKIT_TEMPLATE to true (changes wording in a few places —
#     the sync CTA banner, reset button label, etc.)
#   - Clears the default KovaaK's username (visitors get prompted for their
#     own instead of quietly syncing against someone else's)
#   - Keeps the "Load Your Data" button visible (hidden on the personal
#     copy, but still the only way to load an entirely different playlist
#     set here)
#   - Zeroes every score and resets every playlist's rank/volts to
#     Unranked/0 in the embedded dataset — but leaves tier thresholds,
#     scenario names, and category/subcategory labels untouched, since
#     those are properties of the benchmark itself, not the player. A
#     visitor fills the zeroed template back in with real numbers just by
#     entering their KovaaK's username and clicking Sync Scores — no evxl
#     scraping needed for that part at all.

$src = "..\mini-benchmarks-tracker\mini_evxl.html"
$dst = "template.html"

if (-not (Test-Path $src)) {
    Write-Output "Source file not found: $src"
    exit 1
}

$content = Get-Content -Raw $src

$content = $content -replace "<title>mini.s Benchmarks.*?</title>", "<title>KovaaK's Benchmark Tracker</title>"

$content = $content.Replace(
    "<div class=`"brand`" id=`"brand-home`"><span class=`"dot`"></span> mini's benchmarks</div>",
    "<div class=`"brand`" id=`"brand-home`"><span class=`"dot`"></span> Benchmark Tracker</div>"
)

$content = $content.Replace(
    "<span id=`"topnav-source`"><a class=`"steam-link`" href=`"https://steamcommunity.com/id/sinseriously/`" target=`"_blank`" rel=`"noopener`">sinseriously &#8599;</a></span>",
    "<span id=`"topnav-source`"></span>"
)

$content = $content.Replace(
    "const DEFAULT_KOVAAKS_USERNAME = 'Owen';",
    "const DEFAULT_KOVAAKS_USERNAME = '';"
)

$content = $content.Replace(
    "const IS_TOOLKIT_TEMPLATE = false;",
    "const IS_TOOLKIT_TEMPLATE = true;"
)

# Strip the maintainer's Steam identity out of the two branches that only ever
# run on the personal copy. They never render in the template — IS_TOOLKIT_TEMPLATE
# and usingImported both gate them off — but the strings would still ship in a
# public repo, so they are replaced rather than left as dead text.
$content = $content.Replace(
    "el.innerHTML = '<a class=`"steam-link`" href=`"https://steamcommunity.com/id/sinseriously/`" target=`"_blank`" rel=`"noopener`">sinseriously &#8599;</a>';",
    "el.innerHTML = '';"
)
$content = $content.Replace(
    "'STEAM: sinseriously &nbsp;&middot;&nbsp; SOURCE DATA evxl.app/u/76561198251208570'",
    "''"
)

$content = $content.Replace(
    "<button id=`"nav-import`" style=`"display:none;`">Load Your Data</button>",
    "<button id=`"nav-import`">Load Your Data</button>"
)

# Extract the embedded dataset, zero scores/rank/volts, re-embed.
$startTag = '<script id="benchmarks-data" type="application/json">'
$endTag = '</script>'
$startIdx = $content.IndexOf($startTag) + $startTag.Length
$endIdx = $content.IndexOf($endTag, $startIdx)
$data = ($content.Substring($startIdx, $endIdx - $startIdx)) | ConvertFrom-Json

$pctRegex = '^-?\d+(\.\d+)?%$'
foreach ($b in $data) {
    $b.rank = "Unranked"
    $b.volts = 0
    for ($ri = 0; $ri -lt $b.rows.Count; $ri++) {
        $row = $b.rows[$ri]
        if ($row.Count -le 1) { continue }
        $p = -1
        for ($i = 0; $i -lt $row.Count; $i++) {
            if ($row[$i] -match $pctRegex) { $p = $i; break }
        }
        if ($p -lt 2) { continue }
        $row[$p - 1] = "0"
        $b.rows[$ri] = $row
    }
}
$zeroedJson = $data | ConvertTo-Json -Depth 10 -Compress

$content = $content.Substring(0, $startIdx) + $zeroedJson + $content.Substring($endIdx)

Set-Content -Path $dst -Value $content -NoNewline -Encoding UTF8
Write-Output "Wrote $dst ($($data.Count) playlists, all scores zeroed)."
