# mini-evxl-toolkit

The public, genericized version of a personal KovaaK's benchmark tracker.
`template.html` is a single-file, hash-routed SPA shipping the full 201-playlist
*structure* (scenario lists, category groupings, tier thresholds) with every score
zeroed and every rank reset to Unranked. No build step. MIT licensed.

This is a git repo with **no remote** — publishing to GitHub (+ Pages, free) has
been discussed and wanted, but not done. Don't push anywhere without asking.

The personal copy this is generated from lives in the sibling folder
`../mini-benchmarks-tracker` (`mini_evxl.html`).

## Generated, not hand-edited

`template.html` is produced by `generate-template.ps1` from the personal copy. It
zeroes scores, resets rank/volts, and flips `IS_TOOLKIT_TEMPLATE` to `true`.

**App-behavior changes belong in the personal copy first, then regenerate.**
Hand-editing `template.html` directly means the next regeneration silently discards
the work. `static-server.ps1` and `sync.ps1` *are* intentionally divergent from
their personal-copy counterparts (port 8744/9500, `$PSScriptRoot` instead of a
hardcoded root, config-driven `trackerHtml`, first-run guidance) — those two are
hand-maintained here and must not be overwritten from the personal copy.

## Onboarding design — the point of the whole toolkit

The evxl scrape was only ever needed for benchmark **structure**, which is identical
for every player. Only scores and Rank/Volts are player-specific, and scores come
from kovaaks.com's public API by username. So a new user's entire onboarding is:
open the file, click Sync Scores, enter their KovaaK's username. No scrape, no JSON,
no AI assistant.

`docs/SCRAPING_GUIDE.md` is therefore the **advanced** path (playlists outside the
pre-loaded set), not the primary flow. Keep both docs framed that way.

## Environment traps — read before debugging anything

**Never trust Bash-relayed non-ASCII output.** Git Bash here runs codepage 437, so
`grep`/`cat`/`xxd` garble non-ASCII *in transit* regardless of the file's real bytes.
This already caused one false "file is corrupted" alarm. Verify with PowerShell/.NET
byte or codepoint reads instead. `fix-mojibake.ps1` repairs genuine double-encoding
(UTF-8 bytes reinterpreted as Windows-1252 and re-encoded).

**Port 8743 is permanently unusable on this machine** (Windows administered excluded
range). This repo's server is pinned to 9500 in `.claude/launch.json`, and
`static-server.ps1` falls back on conflict. Nothing is listening — don't hunt for a
stale process.

**`javascript_tool` has a ~30s timeout.** Batch long browser loops across calls,
persisting progress in `localStorage`.

Serve with `preview_start({name: "mini-evxl-toolkit"})` and open a **fresh tab** —
preview tabs cache aggressively. `static-server.ps1`'s MIME map must keep
`; charset=utf-8` on html/css/js/json or non-ASCII renders as mojibake.

## Rules that are easy to break

- **Shared and Unique scenario cards must stay visually identical**; both go through
  `mergedProgress(...)`. Only the "# playlists" chip may differ.
- **Any new cache keyed off `BENCHMARKS` must be reset in `invalidateCaches()`.**
- **`BENCHMARKS` is deep-cloned before patching** so `DEFAULT_BENCHMARKS` survives
  for reset-to-demo.
- **`esc()` must keep escaping `"`**, not just `&`/`<`/`>`.
- **Sync must short-circuit with "Load Your Data first" on an empty dataset**, not
  report "up to date" against nothing.
- The **KovaaK's username is only persisted after a successful fetch** — persisting
  on every attempt locks in typos.

## Sync methods, and which to trust

- **Sync Scores Locally** — `webkitdirectory`, reliable. The File System Access API
  was tried and abandoned: it hard-blocks any folder under `Program Files`, which is
  exactly where Steam installs KovaaK's, checked against the resolved real path so
  junctions don't help.
- **Sync Scores Online** — kovaaks.com public API. Genuinely unreliable: the
  `user/scenario/total-play` endpoint sits stale for hours, confirmed against the
  account's own official kovaaks.com profile page. A backend bug, not fixable here.
  The UI labels say so on purpose.
- Neither updates **Rank/Volts** — evxl-sourced only. Deliberately *not* taken from
  kovaaks.com's `benchmarks/player-progress-rank`, whose 596-benchmark catalog uses a
  non-equivalent rank system and would mix two taxonomies under one UI.

## Directions already evaluated and closed

- **PlayFab backend integration — rejected.** This tool stays personal/single-user;
  no public rankings. Also unnecessary now that kovaaks.com's own public API exists.
- **Google Sheets as the structure-update path — dropped.** Surveyed all 118 unique
  playlists: only 65% (130/201 entries) are backed by a publicly fetchable sheet, 30%
  have none, 5% link an unreadable one. Full map in `docs/sheet-scope.json`. Sheets
  can never cover the dataset, so a scrape path stays necessary.
- **evxl.app has no fetchable data endpoint** — confirmed from several angles. It
  returns an empty SvelteKit shell; reading it means driving the real JS app.

## Scraping technique that works

evxl is a same-origin SPA, so load each playlist page into a hidden `<iframe>` from a
page already on evxl.app and read `iframe.contentDocument` — one script can walk many
playlists without its JS context being destroyed. Poll until `iframeDoc.title`
contains the playlist name **and** `main` exists.

Do **not** drive evxl's client-side router with a synthetic `<a>.click()` loop: it
half-works silently. `location.pathname` updates but content never re-renders,
because playlist→playlist is the same route with different params. That produced
entirely wrong data once, caught only by checking `titleMatched`. A single
profile→playlist hop *does* work, which is why it passes a smoke test.
