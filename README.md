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
2. Click **⟳ Sync Scores Locally** (top right) and pick your KovaaK's stats folder
   in the native dialog (`...\FPSAimTrainer\FPSAimTrainer\stats\`).

That's it. `template.html` ships pre-loaded with every evxl-tracked playlist's
structure — scenario lists, category groupings, tier thresholds — the same
benchmark metadata for every player, already baked in. Only the scores are yours to
fill in, and syncing reads them straight off your own machine. No scraping, no JSON
file, no AI assistant required for this path. Your data lives only in that browser's
local storage, never uploaded anywhere.

There's also a **Settings** tab for saving your KovaaK's username, Steam/evxl
profile links, and your stats folder path as a note — see "Keeping it fresh" below
for what each is actually used for (only the username does anything functional,
and only for the online sync method).

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

There are three ways to pull scores in, in the order you should actually reach for
them:

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

**"Sync Scores Online"** — reads your best score per scenario from KovaaK's own
official backend (`kovaaks.com/webapp-backend`), a real public API confirmed
reachable with a plain cross-origin `fetch()`. First click asks for your KovaaK's
username (Settings → Profile in-game — your in-game display name, often *not* your
Steam name); right-click to change it. **Currently unreliable** — verified directly
against a real account (cross-checked against local files and against the account's
own official kovaaks.com profile page, not just this tool) that the specific
endpoint this depends on can sit stale for hours despite the player actively
playing, while KovaaK's *does* correctly record those same plays in real time
elsewhere on their own site. This is a bug on KovaaK's end, not something fixable
here — treat this button as a bonus that works when it works, not something to
depend on. It also can't reach kovaaks.com at all from inside a sandboxed embedded
viewer like a Claude Artifact (those block all external network requests) — Sync
Scores Locally doesn't have that problem, since it never makes a network request.

Neither patches per-playlist Rank/Volts — see "What none of these does" below.

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

**What none of these does**: update the per-playlist Rank/Volts badges. Those are
evxl's own server-computed composite across a whole playlist, sourced from evxl.app
specifically (not the kovaaks.com API above — its benchmark catalog and rank tiers
don't map 1:1 onto evxl's), and only change by re-running the scrape in
`docs/SCRAPING_GUIDE.md`. Everything else — individual scenario scores and their
derived tier/progress bars — stays fresh through either sync method alone.

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
   note. All under **Settings**, all in your browser's local storage. Only the
   username does anything functional.
4. **Getting scores in** — online (kovaaks.com's API, by username) or locally (your
   own stats folder). See "Keeping it fresh" above for which to trust.

Scores (part 4) change constantly, structure (part 2) rarely, and they update through
completely different mechanisms. Most confusion about this tool comes from expecting
one to refresh the other — notably, neither sync method touches Rank/Volts, which is
part of the structure side and only moves when the scrape is re-run.

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
  score zeroed and every rank reset to Unranked — a blank template waiting for
  **Sync Scores** to fill it in with a real username.
- `generate-template.ps1` — regenerates `template.html` from a personal copy of
  this tracker (genericizes branding, zeroes every score/rank, flips a couple of
  internal flags that change some wording). Only relevant if you're maintaining
  this toolkit itself, not using it.
- `sync.ps1` / `sync-state.example.json` — the local-sync script and its config
  template — an alternative to the in-browser Sync Scores button, see above.
- `docs/SCRAPING_GUIDE.md` — how to pull a dataset off evxl.app from scratch, only
  needed if you want playlists outside what's already pre-loaded in the template.

## Data format

A JSON array, one entry per playlist+difficulty:

```json
{
  "name": "playlist name",
  "pack": "cosmetic group label (optional, falls back to name)",
  "difficulty": "difficulty label",
  "rank": "evxl's rank badge for this playlist (optional, falls back to \"Unranked\")",
  "volts": 0,
  "hdrs": ["evxl's scenario table header cells"],
  "rows": [["one array per scenario row, matching hdrs"]]
}
```

`hdrs`/`rows` mirror evxl's own table exactly — see the scraping guide for how
they're read off the page. This is the same shape `sync.ps1` reads and writes.

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
