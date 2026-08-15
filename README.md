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
2. Click **⟳ Sync Scores** (top right) and enter your KovaaK's username — this is
   your in-game display name (Settings → Profile in-game), which is often *not*
   your Steam name.

That's it. `template.html` ships pre-loaded with every evxl-tracked playlist's
structure — scenario lists, category groupings, tier thresholds — the same
benchmark metadata for every player, already baked in. Only the scores are yours to
fill in, and syncing does that directly from KovaaK's own servers. No scraping, no
JSON file, no AI assistant required for this path. Your data lives only in that
browser's local storage, never uploaded anywhere.

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

**In the browser — click "Sync Scores"**. This reads your best score per scenario
directly from KovaaK's own official backend (`kovaaks.com/webapp-backend`) — a real,
public, no-login-required API confirmed by testing a plain cross-origin `fetch()`
against it. The first click asks for your KovaaK's username (Settings → Profile
in-game — this is your in-game display name, often *not* your Steam name);
right-click the button any time to change it. Because this reads KovaaK's own
server-side record rather than local files, it survives reinstalling the game
entirely, works in any modern browser (no Chromium requirement), and even works
through an embedded viewer like a Claude Artifact — none of which was true of an
earlier local-folder-based version of this feature. Results are kept in that
browser's local storage, same as *Load Your Data*.

Note this only patches individual scenario scores — see "What it doesn't do" below
for per-playlist Rank/Volts.

**`sync.ps1`** — an alternative that reads your local KovaaK's stats folder instead
(`...\FPSAimTrainer\FPSAimTrainer\stats\`, one CSV per attempt) and writes the
patched score directly into your tracker HTML on disk. Useful if you want a
permanent copy that updates without relying on browser local storage, or want it in
an automated/scheduled workflow:
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

**What neither of these does**: update the per-playlist Rank/Volts badges. Those are
evxl's own server-computed composite across a whole playlist, sourced from evxl.app
specifically (not the kovaaks.com API above — its benchmark catalog and rank tiers
don't map 1:1 onto evxl's), and only change by re-running the scrape in
`docs/SCRAPING_GUIDE.md`. Everything else — individual scenario scores and their
derived tier/progress bars — stays fresh through either sync method alone.

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
