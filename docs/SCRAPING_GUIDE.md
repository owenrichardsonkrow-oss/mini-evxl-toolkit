# Scraping your evxl.app data (historical)

**Most people don't need this.** `template.html` already ships pre-loaded with every
playlist evxl.app tracks — scenario lists, category groupings, tier thresholds, the
same for every player. Just click **Sync Scores** and enter your KovaaK's username;
it fills your own scores in from KovaaK's own servers, no scraping involved. This
guide is only for building that structural dataset in the first place — relevant if
you want playlists that aren't in the pre-loaded template (a private/community
benchmark, or a fully custom list), or you're maintaining this toolkit itself.

**Status (2026-08-16):** the page-by-page scrape described further down is how the
dataset was *first* built; it is no longer how it is maintained. Structure now
comes from KovaaK's own benchmark endpoint sliced by evxl's catalog layout (the
"easier way" below), which the maintainer's `refresh-all-from-kovaaks.ps1` runs
weekly. The scrape snippet still works and still emits the older `hdrs`/`rows`
table shape — **Load Your Data accepts that shape and converts it**, so nothing
here is broken, but if you're adding a playlist today, fetch the endpoint rather
than scraping the page. The current dataset shape (`tiers` + `groups`) is in the
README's "Data format".

This tracker's dataset is just a JSON array of benchmark playlists, each with its
scenario structure. Getting this structural data means reading what evxl.app shows
to anyone with a profile URL — no login, no private data, no bypassing anything.
There are two ways to do it.

### The easier way (2026-08-16): evxl's catalog + KovaaK's benchmark endpoint

evxl's pages are an empty SvelteKit shell that render each table from data you can
fetch yourself:

1. **evxl's own JS bundle ships its whole benchmark catalog** as a JSON literal —
   every benchmark's name, its `rankCalculation` mode, and for each difficulty the
   `kovaaksBenchmarkId`, tier names (`rankColors`), and category/subcategory layout
   (`categories[].subcategories[].scenarioCount`). Load any playlist page, list the
   loaded `_app/immutable/chunks/*.js` (their names are content hashes and change
   on deploy), and grep for `"benchmarkName"`; the literal starts with
   `[{"benchmarkName"`. The maintainer's extracted copy lives in the tracker repo
   as `dev/evxl-bundle-catalog.json`.
2. **KovaaK's backend serves the table for a benchmark id**:
   `https://kovaaks.com/webapp-backend/benchmarks/player-progress-rank-benchmark?benchmarkId=<id>&steamId=<your steamid64>`
   → `{ranks:[{name}], categories:{<kovaaks category>:{scenarios:{<name>:{score, rank_maxes, scenario_rank, …}}}}}`.
   `rank_maxes` are the tier thresholds; `score` is your score ×100. Public, no
   login; rate-limits bursts (space requests out).
3. **Table order** = the API's scenarios flattened in order, then sliced by the
   catalog's subcategory counts (that's what evxl's own renderer does). The tracker
   repo's `rebuild-entry-from-kovaaks.ps1` is a working reference for turning one
   API response into a dataset entry (`tiers` + `groups`).

Caveats: neither endpoint is documented or contractual; the page scrape below stays
as the fallback and as the way to verify the API when they disagree. When
kovaaks.com is down, both this path and the page scrape are dead (evxl renders tier
headers and zero rows). Routine-based benchmarks (`kovaaksBenchmarkId: -1`) embed
their scenarios and thresholds directly in the bundle catalog instead.

### Why the other shortcut wasn't adopted

- **The creator-maintained Google Sheets some playlists link to.** These are real
  and genuinely fetchable as CSV (`docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<GID>`),
  and they carry the true tier-threshold tables. But it's a per-creator choice, not
  a platform feature: a survey of all 118 unique playlists found only **65%**
  (130 of 201 playlist+difficulty entries) backed by a readable sheet — 30% have no
  sheet at all, and a further 5% link one that's gone, non-exportable, or not
  actually a spreadsheet. The full playlist→sheet map is in
  [`sheet-scope.json`](sheet-scope.json). Since sheets can't cover the whole
  dataset, they were dropped rather than maintained as a partial second path.

## The page scrape (fallback / verification path)

There is no plain-JavaScript/Node scraper script here (see the README for why), so
this guide documents the exact technique in enough detail that either:

- you do it by hand via your browser's DevTools console, or
- you hand this file to an AI coding assistant that has live browser tooling
  (e.g. Claude Code with browser access) and ask it to do the scrape for you.

Everything below was verified against the live site.

## What you're producing

A JSON array like:

```json
[
  {
    "name": "xyz Benchmarks",
    "pack": "XYZ",
    "difficulty": "Hard",
    "rank": "Unranked",
    "volts": 127,
    "hdrs": ["", "", "Scenario", "Score", "", "Prodigy-", "Prodigy", "..."],
    "rows": [["Clicking", "Static", "XYZ EvolveClick", "1,020", "57%", "980", "..."], "..."]
  }
]
```

One entry per **playlist + difficulty** pair (a playlist with 3 difficulties = 3 entries).
`hdrs`/`rows` are the raw scenario table exactly as evxl renders it — `pack` is
cosmetic only (shown next to the difficulty chip on the home grid) and can just be
the playlist name again if you don't care to shorten it.

## Step 1 — find your Steam ID and your playlist list

Your evxl profile URL is `https://evxl.app/u/<your-steamid64>` (a 17-digit number,
not your vanity name — look it up via a Steam ID converter if you only know your
vanity URL).

Open that page and run:

```js
[...new Set([...document.querySelectorAll('a[href*="/u/"]')].map(a=>a.getAttribute('href'))
  .map(h=>decodeURIComponent(h))
  .map(h=>h.split('/').slice(0,4).join('/'))
)]
```

This gives you one `/u/<id>/<playlist>/<difficulty>` path per playlist — but only its
*default* difficulty. The next step finds every difficulty variant.

## Step 2 — find every difficulty for each playlist

Visit each playlist URL from Step 1, then run:

```js
[...document.querySelectorAll('nav.tab-group button')]
  .map(b=>b.textContent.trim())
  .filter(t=>t!=='Introduction')
```

This reads the difficulty tab bar (confirmed selector: evxl renders difficulty tabs
as `<button>` elements inside a `<nav class="tab-group">`, alongside a non-difficulty
"Introduction" tab you should filter out). Combine every difficulty you get here with
the playlist name to build your full URL list — a playlist with tabs `Easy`/`Hard`
becomes two URLs to visit in Step 3.

**URL encoding gotchas**, found the hard way:
- Space → `%20`. `+` in a name (e.g. `Aimerz+`) → `%2B`. A literal `/` inside a
  playlist's own name (e.g. `NRS 360 / Macro Benchmarks`) → `%2F` (don't let it split
  into an extra path segment).
- CJK and other non-ASCII names need standard percent-encoding
  (`encodeURIComponent(name)` handles all of the above correctly).
- A few playlists route with a **lowercase** difficulty in the URL even though the
  tab button's label is capitalized (e.g. `Point Zero [Aim Academy] - Valorant S1`'s
  "Intermediate" tab routes to `.../intermediate`). If a constructed URL 404s, check
  the actual `href` evxl uses for that tab/link before assuming the name is wrong.

## Step 3 — scrape each playlist page

Visit `https://evxl.app/u/<id>/<encoded playlist>/<encoded difficulty>` for every
pair from Step 2, and on each page run:

```js
(function(){
  const name = document.title.replace(/^.*? - /, '').trim();

  // --- full scenario table: hdrs + rows ---
  const table = document.querySelector('table');
  const hdrs = [...table.querySelectorAll('thead tr')][0]
    ? [...table.querySelectorAll('thead tr')[0].children].map(c=>c.textContent.trim())
    : [];
  const rows = [...table.querySelectorAll('tbody tr')]
    .map(tr=>[...tr.children].map(c=>c.textContent.trim()));

  // rank/volts are kept in the format for compatibility but nothing reads them
  // any more (the rank badge is computed locally). Leave them as below.
  return JSON.stringify({ name, pack: name, difficulty: 'FILL_IN', rank: 'Unranked', volts: 0, hdrs, rows });
})();
```

Fill in the actual `difficulty` for that page (it isn't reliably recoverable from
the DOM alone — track it from the URL you navigated to), collect one JSON object per
page, and concatenate them into the final array. If a table shows
"Loading scenario 1..." rows, KovaaK's had no data for that benchmark at that moment
(or ever — one evxl entry is empty at the source); don't keep those rows.

Optional but recommended afterwards: run the tracker repo's `apply-evxl-catalog.ps1`
against your file so each entry also carries evxl's rank-calculation mode and
subcategory layout — that's what lets the rank badge use the benchmark's real rule
instead of the conservative "Complete" reading.

If you're batching many pages (a full profile is often 150–250 playlist/difficulty
pages), doing this by hand gets old fast — this is exactly the kind of repetitive,
verifiable-per-step task an AI coding assistant with browser tooling is good at:
paste it this file and your Steam ID and ask it to work through the list.

## Step 4 — load it

Two ways to use the result, see the main [README](../README.md):

- **Quick look**: open `template.html`, go to *Load Your Data*, paste or upload the
  JSON. Lives in your browser's local storage only — nothing is uploaded anywhere.
- **Permanent, syncable copy**: paste the JSON array into `template.html`'s
  `<script id="benchmarks-data" type="application/json">...</script>` tag (replacing
  the empty `[]`), then use `sync.ps1` going forward to keep individual scenario
  scores fresh from your local KovaaK's stats folder without re-scraping evxl.app —
  see the README's "Keeping it fresh" section. Note `sync.ps1` only patches scores;
  new playlists and moved tier thresholds only arrive by re-running this scrape.
