# KovaaK's Benchmark Tracker

A self-hosted, single-file KovaaK's aim-training benchmark tracker in the spirit of
[evxl.app](https://evxl.app) — cross-playlist shared-scenario XP bars, To Max/To
2nd/To Next progress, tag filtering, dynamic playlist-range filters, and a "Unique
Scenarios" page evxl itself doesn't have. It's one HTML file: no build step, no
server, no account.

This started as a personal tool and is shared here so anyone else can run their own
copy, for free, with their own data.

## Quickstart

1. Open `template.html` in a browser (double-click it, or serve it with anything
   static — GitHub Pages works too, see below).
2. Type your KovaaK's username into the **Start here** box on the home page and
   press **⟳ Sync my scores** (Settings → Profile in-game — often *not* your Steam
   name; a typo gets a "no player found" message and nothing is saved). The same
   thing is always available as **⟳ Sync Scores Online** top right. Or, if you'd
   rather not touch the network, **⟳ Sync Scores Locally** and pick your KovaaK's
   stats folder (`...\FPSAimTrainer\FPSAimTrainer\stats\`).

That's it. `template.html` ships pre-loaded with every evxl-tracked playlist's
structure — scenario lists, category groupings, tier thresholds — the same
benchmark metadata for every player, already baked in. Only the scores are yours to
fill in. No scraping, no JSON file, no AI assistant required for this path. Your
data lives only in that browser's local storage, never uploaded anywhere.

There's also a **Settings** tab for your KovaaK's username (used by Sync Scores
Online and the auto-check), your Steam profile link (shown top-right), your evxl
profile link (every playlist page gets an "open on evxl" link to the same
playlist on your profile), and your stats folder path as a note.

## Two ways to use this

**The normal path**: sync your scores into the pre-loaded template as above. Covers
every playlist evxl.app tracks, using nothing but your KovaaK's username.

**Loading a different playlist set entirely**: if you want scenarios/benchmarks
*not* in the pre-loaded template — a private/community benchmark not on evxl, or a
completely custom list — use **Load Your Data** to paste or upload your own dataset
JSON instead. That does need a real scrape; see
[`docs/SCRAPING_GUIDE.md`](docs/SCRAPING_GUIDE.md). This replaces the whole dataset,
not just scores.

## Keeping it fresh

There are three ways to pull scores in. **Sync Scores Online** is the everyday
one (whole history, one username); **Sync Scores Locally** is the network-free
fallback; **Auto-check** keeps things current between syncs.

**"Sync Scores Locally"** — click it, pick your KovaaK's stats folder
(`...\FPSAimTrainer\FPSAimTrainer\stats\`) in the native picker, done. Uses a plain
`<input type="file" webkitdirectory>` rather than the more modern File System
Access API on purpose — that API hard-blocks picking any folder under `Program
Files`/`Program Files (x86)`, which is exactly where Steam installs by default, with
no workaround (confirmed directly, even a symlink to the real folder gets resolved
and blocked the same way). This older mechanism has no such restriction and works
in more browsers, at the cost of no persisted handle — you re-pick the folder every
time rather than it being remembered. This is the **reliable** option: it reads
files directly off your own disk, nothing else in the loop.

**"Sync Scores Online"** — reads your scores from KovaaK's own official backend
(`kovaaks.com/webapp-backend`), a real public API reachable with a plain
cross-origin `fetch()`. First click asks for your KovaaK's username (Settings →
Profile in-game — your in-game display name, often *not* your Steam name);
right-click to change it.

It works in two passes. The first is a quick paginated read of your best scores.
That endpoint alone turned out to be badly incomplete — on a real account it listed
263 scenarios where the player had actually played 1,137, and it can sit days behind
your recent sessions — so a second pass asks KovaaK's which scenarios you've ever
played, then fetches each one individually from an endpoint that *is* current
(verified against a run from minutes earlier that the first endpoint had no record
of). Scenarios you have no score for yet are done first.

That second pass costs one request per played scenario, so a full sync takes a
while and the button turns into **Stop sync**. Stopping is safe at any point:
scores are saved as they arrive and a sync never lowers a score, so a partial run
is just a shorter one — run it again later to pick up the rest. If KovaaK's starts
refusing requests (they rate-limit bursts), the sync stops itself and tells you.

**Auto-check** (on by default, Settings → *Auto-check recent plays*) — once a
username is saved, opening the page or switching back to its tab makes **one**
request to KovaaK's for your last 10 personal bests and pulls them straight in, so
a playlist is current when you click it after a session. It never lowers a score.
It only sees the last 10 events, so after a long session it will tell you to run
Sync Scores Online for the rest.

It can't reach kovaaks.com at all from inside a sandboxed embedded viewer like a
Claude Artifact — those block all external network requests. Sync Scores Locally
doesn't have that problem, since it never makes a network request.

Either way, the per-playlist rank badge recomputes from your scores automatically.

**Where your scores actually live, and how to keep them.** Synced scores are
stored in your browser's local storage *for the address you opened the file at*.
Open the same file from a different folder, a different port, or a hosted URL and
it starts empty; clear browser data and they're gone. (Browser storage is shared
across every page on the same host, so the template's keys carry their own
prefix, `mini-evxl-template-…` — a personal copy of the tracker published on the
same host keeps its own store and never leaks into yours. Stores written by
template builds from before 2026-08-17 used the unprefixed keys; Export from that
build and Import into this one to carry them over.) So:

- **Settings → Your scores → Export** saves them as a small `.json`. Do this
  after a big sync. **Import** merges a backup in (it never lowers a score), which
  is also how you carry scores from one copy of the tracker to another.
- **`apply-scores.ps1`** bakes an export into a tracker HTML file itself, so a
  fresh browser or a hosted copy starts with your scores already in place:
  `.\apply-scores.ps1 -Scores mini-evxl-scores-2026-08-16.json -Html my-benchmarks.html`
  (add `-WhatIf` to see what it would change without writing).

**`sync.ps1`** — a scriptable equivalent to Sync Scores Locally, reading the same
local stats folder and writing the patched score directly into your tracker HTML on
disk instead of browser storage. Useful for a permanent on-disk copy or an
automated/scheduled workflow:
1. Make your own copy of `template.html` (e.g. `my-benchmarks.html`) so `sync.ps1`
   isn't repeatedly rewriting the shared template file.
2. Copy `sync-state.example.json` to `sync-state.json` next to `sync.ps1`.
3. Edit `statsDir` (your local KovaaK's stats folder) and `trackerHtml` (the path to
   your copy from step 1).
4. Run it (PowerShell): `.\sync.ps1`

Note `sync.ps1` only has scores to patch for scenarios you've *recently* played —
your local stats folder has limited retention. For full history in one shot, use
Sync Scores in the browser first (reads all-time data from KovaaK's servers), then
`sync.ps1` going forward for routine updates without opening a browser.

**About the rank badge**: it's computed locally from your scores using evxl's own
rules. Every benchmark on evxl declares how its rank is calculated (a "mode"), and
this tracker ports those modes — 40 of evxl's 41, each verified against evxl's
own calculation, covering 249 of the 251 playlists. For the remaining two (both
scored by an external service), the badge shows the stricter "every scenario at
that tier" reading, which is exactly evxl's "X Complete" rank — accurate, just
conservative — and the playlist page marks it with a • so you know. REVENGE
Benchmark is a *pool*: its playlist carries 48 scenarios (all of them count as
part of the playlist here) and evxl ranks the best of the 24 you select — the
tracker starts from evxl's default pick and lets you tick your own on the
playlist page (kept in your browser). Volts is computed the same
way evxl computes it (100 per scenario at max tier, uncapped) and shown next to
each playlist's completion percentage. Neither sync method needs to touch evxl for
any of this. The rank rules and the volts formula are evxl's own; this tracker
reproduces them so the numbers match what you'd see there — credit to evxl.

## How the pieces fit together

Four separable parts, which is worth knowing before changing anything:

1. **The site itself** — the home grid plus the Shared and Unique Scenarios pages.
   Entirely *derived*: tag associations, shared-scenario grouping, and the To Max/To
   2nd/To Next bars all recompute from the dataset on every render. Nothing is
   cached in a way that can drift out of sync with the data behind it.
2. **The benchmark structure** — the playlist list, scenario names, category labels,
   and tier thresholds. This is **the same for every player**; it's what
   `template.html` ships pre-loaded, and the only thing the scrape in
   [`docs/SCRAPING_GUIDE.md`](docs/SCRAPING_GUIDE.md) actually produces. (Some
   playlists' thresholds also live in a creator-maintained public Google Sheet —
   only about 65% of them, which is why that wasn't adopted as an update path. The
   scraping guide explains the survey.)
3. **Your own info** — KovaaK's username, Steam and evxl profile links, stats folder
   note. All under **Settings**, all in your browser's local storage. The username
   drives the online sync and auto-check; the Steam link shows top-right; the evxl
   link puts an "open on evxl" link on every playlist page.
4. **Getting scores in** — online (kovaaks.com's API, by username) or locally (your
   own stats folder). See "Keeping it fresh" above for which to trust.

Scores (part 4) change constantly, structure (part 2) rarely, and they update through
completely different mechanisms. Most confusion about this tool comes from expecting
one to refresh the other — syncing scores never adds a playlist or moves a tier
threshold, and re-scraping structure never changes a score.

## Hosting it for free

**GitHub Pages** (recommended if you forked/cloned this): in your repo's Settings →
Pages, set the source to your default branch, root folder. You'll get a public URL
at `https://<you>.github.io/<repo>/template.html` (or rename the file to `index.html`
for a bare URL). No cost, no server to maintain.

**Locally**: just open the HTML file in a browser. Everything runs client-side. If
your browser blocks `file://` pages from working correctly, `static-server.ps1` is a
zero-dependency PowerShell static file server (no Python/Node required) — run it and
open `http://localhost:8744`.

## Files

- `template.html` — the tracker itself. Ships pre-loaded with every evxl-tracked
  playlist's structure (scenarios, tier thresholds, category labels) but every
  score absent (an empty scores block) — a blank template waiting for
  **Sync Scores** to fill it in with a real username.
- `generate-template.ps1` — regenerates `template.html` from a personal copy of
  this tracker (genericizes branding, empties the scores block, flips a couple of
  internal flags that change some wording). Only relevant if you're maintaining
  this toolkit itself, not using it.
- `sync.ps1` / `sync-state.example.json` — the local-sync script and its config
  template — an alternative to the in-browser Sync Scores button, see above.
- `apply-scores.ps1` — bakes a Settings-page scores export into a tracker HTML
  file (see "Where your scores actually live").
- `lib/kovaaks-table.ps1` — shared helpers the scripts above dot-source (reading
  and writing the embedded dataset, number parsing that ignores your Windows
  language settings). Keep it next to the scripts.
- `src/engine.js` — the tracker's rank engine on its own (the same code that is
  inlined into `template.html`): dataset parsing, tier reading, all of evxl's
  rank rules, volts, pool selection. Loadable in Node; that's what the tests use.
- `test/golden.js` + `test/golden-standings.json` — the regression test: seeded
  score vectors for every playlist and the standings the engine is expected to
  produce (recorded from an engine proven identical to evxl's own rank code).
  `node test/golden.js` — also run by GitHub Actions on every push
  (`.github/workflows/test.yml`). `test/harness.html` runs the same test in a
  browser for machines without Node.
- `docs/SCRAPING_GUIDE.md` — how to pull a dataset off evxl.app from scratch, only
  needed if you want playlists outside what's already pre-loaded in the template.

## Data format

The page embeds two JSON blocks: `benchmarks-data` (structure — a JSON array,
one entry per playlist+difficulty, the same for every player) and `scores-data`
(`{"scenario name": score}` — yours; `{}` in the template). An entry:

```json
{
  "name": "playlist name",
  "pack": "cosmetic group label (optional, falls back to name)",
  "difficulty": "difficulty label",
  "tiers": ["Iron", "Bronze", "Silver", "Gold"],
  "groups": [
    { "category": "Clicking", "subcategory": "Static",
      "scenarios": [ { "name": "Gridshot", "thresholds": [140, 152, 162, 171] } ] }
  ],

  "rankCalc": "evxl's rank-calculation mode, e.g. \"basic\" (optional)",
  "evxlId": 829,
  "evxlRankOffset": 0,
  "evxlDiffIndex": 0,
  "selection": { "select": 24, "baseN": 9, "fullN": 18, "minCat": 8, "minSub": 4 },
  "rankReq": 6
}
```

`groups` are evxl's own category/subcategory layout in table order (the rank
rules that work per subcategory or per category read them; an unnamed group is
still a group). No score lives inside an entry — the scores block and the page's
per-browser store hold them, keyed by scenario name. This is the shape
`sync.ps1` and `apply-scores.ps1` read and write. The second block is optional
rank metadata, stamped by `apply-evxl-catalog.ps1` from evxl's catalog:
`rankCalc` picks the rank rule, `evxlId` is KovaaK's benchmark id,
`evxlRankOffset` the ladder offset the energy rules need, `evxlDiffIndex` the
difficulty's position among its benchmark's difficulties (two modes read it),
`selection` the pool rules for pool benchmarks like REVENGE (absent otherwise),
and `rankReq` a legacy per-entry "N scenarios at a tier" override. Without them
the badge falls back to the "Complete" reading.

**Older files.** Before 2026-08-16 entries carried evxl's scraped table verbatim
(`hdrs`/`rows`, a score in every row). *Load Your Data* still accepts that shape
and converts it on the way in, and an object `{"benchmarks": […], "scores": {…}}`
also works. The scripts here read only the current shape; if you have an old
copy of `template.html` with scores in it, open it, **Settings → Export**, take
the new template, **Settings → Import**.

Other things worth knowing about the page itself: filters, sort, tags and the
search box are all kept in the URL, so a filtered view can be bookmarked or
shared; Home has a sort menu, a **Quick wins** panel (played scenarios closest
to their next tier, most playlists first) and a **Recent improvements** panel
(every score a sync or import raised, newest first — kept locally, not exported);
the theme button (top right) cycles system → light → dark.

## Privacy

Nothing in this tool sends your data anywhere. The scrape only reads pages evxl.app
already serves publicly to anyone with your profile link. The *Load Your Data*
import keeps everything in your own browser's local storage. Hosting on GitHub
Pages makes your tracker HTML (and whatever dataset you baked into it) publicly
readable at that URL, same as any static site. If you'd rather keep your scores
private, don't embed a dataset in a publicly-hosted copy — use the local-only
*Load Your Data* import instead, or just keep the file on your own machine and
open it directly rather than hosting it anywhere. Check GitHub's current Pages
documentation if you want to serve from a private repo — their policy on this has
changed over time.

## License

MIT — see `LICENSE`. Do whatever you want with it.
