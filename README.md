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
2. Click **Load Your Data** and paste or upload your dataset JSON. If you don't have
   one yet, see [`docs/SCRAPING_GUIDE.md`](docs/SCRAPING_GUIDE.md) — it walks through
   pulling your own data off evxl.app.

That's it for a quick look — your data lives only in that browser's local storage,
never uploaded anywhere. For a permanent copy you can keep syncing over time, see
below.

## Two ways to use this

**Casual / try it out**: the *Load Your Data* page on `template.html` is enough on
its own. Good for "let me see what this looks like with my own scores" without
touching any files.

**Permanent, self-hosted copy**: paste your dataset JSON directly into
`template.html`'s `<script id="benchmarks-data" type="application/json">[]</script>`
tag (replacing the `[]`), rename the file if you like, and host it yourself (a
folder you open locally, or a GitHub Pages site — both free). This is the version
`sync.ps1` can keep updated.

## Keeping it fresh

KovaaK's writes one CSV per attempt to your local stats folder
(`...\FPSAimTrainer\FPSAimTrainer\stats\`) with clean `Scenario:`/`Score:` fields —
no evxl scraping needed for routine "I just played" updates. Two ways to pull that
in, both patch any scenario score where your local file beats what's stored:

**In the browser — click "Sync Scores"** (Chrome/Edge/Brave/Opera only, uses the
File System Access API). The first click asks you to pick your KovaaK's stats
folder once; the browser remembers it, so every visit after that is just a click
and a quick permission reconfirm — no file explorer, no script, no external tool.
Results are kept in that browser's local storage, same as *Load Your Data*. Not
supported in Firefox or Safari — the button disables itself automatically there.

**`sync.ps1`** — the scriptable equivalent, for anyone who wants it in an
automated/scheduled workflow, or is on a browser without File System Access API
support:
1. Copy `sync-state.example.json` to `sync-state.json` next to `sync.ps1`.
2. Edit `statsDir` (your local KovaaK's stats folder) and `trackerHtml` (the path to
   your tracker HTML with a real dataset embedded — not the empty template).
3. Run it (PowerShell): `.\sync.ps1`

This one writes the patched score directly into the HTML file on disk, so it's the
right choice if you want a permanent copy that updates without relying on that
browser's local storage.

**What it doesn't do**: update the per-playlist Rank/Volts badges. Those are evxl's
own server-computed composite across a whole playlist and only change by re-running
the scrape in `docs/SCRAPING_GUIDE.md`. Everything else — individual scenario
scores and their derived tier/progress bars — stays fresh through `sync.ps1` alone.

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

- `template.html` — the tracker itself. Ships with an empty dataset (`[]`) and a
  "no data loaded yet" home screen pointing at *Load Your Data*.
- `sync.ps1` / `sync-state.example.json` — the local-sync script and its config
  template.
- `docs/SCRAPING_GUIDE.md` — how to pull your own dataset off evxl.app, with the
  exact verified DOM selectors and extraction script.

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
