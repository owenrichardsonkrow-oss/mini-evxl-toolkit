# mini-evxl-toolkit

The public, genericized version of a personal KovaaK's benchmark tracker.
`template.html` is a single-file, hash-routed SPA shipping the full 251-entry (2026-08-16)
*structure* (scenario lists, category groupings, tier thresholds) with every score
zeroed and every rank reset to Unranked. No build step. MIT licensed.

Remote: **https://github.com/owenrichardsonkrow-oss/mini-evxl-toolkit** (public,
`origin`, branch `master`; first push 2026-08-16). GitHub Pages is meant to serve
`template.html` from `master` / root — enabled in the repo's Settings → Pages by
Owen. Pushing is routine now; the personal tracker repo has no remote and stays
that way (it embeds Owen's own scores).

The personal copy this is generated from lives in the sibling folder
`../mini-benchmarks-tracker` (`mini_evxl.html`).

## Generated, not hand-edited

`template.html` is produced by `generate-template.ps1` from the personal copy. It
zeroes scores, resets rank/volts, and flips `IS_TOOLKIT_TEMPLATE` to `true`.

**App-behavior changes belong in the personal copy first, then regenerate.**
Hand-editing `template.html` directly means the next regeneration silently discards
the work.

**Run `generate-template.ps1` from this directory.** Both `$src` and `$dst` are
relative paths, so running it from anywhere else silently writes `template.html`
into the wrong folder and reports success. Verify afterwards that the toolkit's
own `template.html` actually changed. `static-server.ps1` and `sync.ps1` *are* intentionally divergent from
their personal-copy counterparts (port 8744/9500, `$PSScriptRoot` instead of a
hardcoded root, config-driven `trackerHtml`, first-run guidance) — those two are
hand-maintained here and must not be overwritten from the personal copy.

## Onboarding design — the point of the whole toolkit

The evxl scrape was only ever needed for benchmark **structure**, which is identical
for every player. Only scores are player-specific, and scores come from
kovaaks.com's public API by username; the rank badge is then computed locally from
those scores (see "Rank is computed locally"), and volts is no longer shown. So a new user's entire onboarding is:
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

**"Port won't bind" has almost always been our own leftover server.**
`static-server.ps1` is an `HttpListener` (HTTP.SYS); its registration appears in
`netsh interface ipv4 show excludedportrange protocol=tcp` and refuses raw binds
with "access forbidden by its permissions" — indistinguishable from a Windows
reservation until you look for the process. Verified 2026-08-16: stopping the stray
server freed the port instantly. **First** check
`Get-CimInstance Win32_Process -Filter "Name='pwsh.exe'" | ? CommandLine -match static-server`
and stop it (or `preview_stop`); stop old servers before starting new ones. Only
a port excluded with no such process is a genuine external reservation. The
preview config is **outside the repo, unversioned**, at `C:\.claude\launch.json`;
this repo is **9500** there (tracker: 8850). Its `-Port` arg and `"port"` field must
match — the script falls back on conflict but the harness opens the declared port,
so a mismatch is a dead tab. No `autoPort`.

**`javascript_tool` has a ~30s timeout, but the page keeps running** — results land
in `localStorage` later; poll rather than re-run or you double-execute. Batch long
browser loops across calls, persisting progress in `localStorage`.

**PowerShell traps that give wrong answers, not errors**: unassigned output inside a
function becomes part of its return value; `.Count` on a single object counts its
properties (wrap in `@()`); variables are case-insensitive so `$out` clobbers `$Out`.

Serve with `preview_start({name: "mini-evxl-toolkit"})` and open a **fresh tab** —
preview tabs cache aggressively. `static-server.ps1`'s MIME map must keep
`; charset=utf-8` on html/css/js/json or non-ASCII renders as mojibake.

## Data model — three independent stores

1. **Playlist structure** — `BENCHMARKS`, replaced wholesale by an upload.
2. **Scenario scores** — `SCORES` (`localStorage['mini-evxl-scenario-scores']`),
   an **append-only** name→score map. `recordScores()` never lowers a value, so
   the template's zeroed rows can't wipe a synced score, and an upload that
   drops playlists never destroys their scores. Cleared only by an explicit
   reset.
3. **Exclusions** — `EXCLUDED` (`localStorage['mini-evxl-excluded-playlists']`),
   a set of `JSON.stringify([name, difficulty])` keys that survives uploads.

Everything derives from one rule: **a scenario renders iff at least one present,
non-excluded playlist references it.** `getParsedBenchmarks()` implements it, so
orphaning and exclusion are the same mechanism and neither touches scores. It
assigns `index` before filtering so `#/bench/N` links stay stable.

**Every score display goes through `parsedItemsFor(b)`** (the store overlay). The
detail page once parsed raw rows instead — in this template, where every row is
zeroed, that meant every detail page showed 0 after a sync. Fixed 2026-08-16.

**The store is per browser and per origin** (`file://`, `localhost:9500`, a Pages
URL are separate stores). Settings → *Your scores* has Export / Import (JSON,
max-merge), and `apply-scores.ps1 -Scores <export.json> -Html <copy.html>` bakes
an export into a tracker file's rows. That's the user's backup and their way to
carry scores between copies.

Score-only by design — tier thresholds belong to the playlist, so an orphaned
scenario has nothing to draw a bar against and doesn't render.

## Rank is computed locally; volts is gone

`benchmarkStanding(items, b)` ports evxl's own engine (read out of its JS bundle;
the tracker repo's CLAUDE.md has the full account). Every benchmark declares a
`rankCalculation` mode and the badge is **max(mode rank, "Complete" rank)**. Each
dataset entry carries `rankCalc`, `evxlId`, `subcats`, `evxlTiers`,
`evxlRankOffset`, stamped by `apply-evxl-catalog.ps1` (identical copy here; the
catalog it reads lives in the tracker repo's `dev/`). Ported and verified exact:
`basic`, `complete`, `tsk`, `generic-energy`, `-alt`, `-uncapped`, `dm`, `dm-s3`, `vt-energy`, `aplus-alt`, `jade-palace` — 185 of 251
playlists (each proven against evxl's own code by the tracker repo's differential test). The other 66 (30 small bespoke modes) show the Complete reading only,
flagged `modeSupported:false`; the detail page's Rank label carries a • that says
so. `rankReq` survives only as a legacy per-entry override.

Volts was dropped from the UI (not derivable from the tables; no formula anywhere
client-side). Cards and the detail page show **mean scenario completion**
(`scenarioCompletion()`) instead, and the home grid sorts by it. The `volts` field
stays in the JSON format for compatibility; nothing reads it.

Consequence for the docs: neither `README.md`'s "Rank/Volts only refresh via a
scrape" framing nor `docs/SCRAPING_GUIDE.md`'s Rank+Volts extraction step is
load-bearing anymore. The scrape's only remaining purpose is **structure**
(scenario names, tier names, thresholds — and, once wired up, `rankReq`).

**Dropped from the template (2026-08-16)**: `Black Dawn [Celestial Forge]` — it is
empty at the source (KovaaK's returns no scenarios for that benchmark id, evxl
shows placeholders), so the entry was removed rather than shipped as a 0-scenario
card. The template now holds 251 entries / 127 playlists.

## Rules that are easy to break

- **Shared and Unique scenario cards must stay visually identical** — both pages
  are one function, `renderScenarioList(kind, params)` (config in `SCEN_LIST`;
  unique entries carry `playlists: [entry]`). Only the "# playlists" chip and the
  min/max range are shared-only. Don't fork it again.
- **`achievedIndex()` is the one tier rule** (threshold ≤ 0 never reads as
  cleared) for bars, labels and the rank engine alike.
- **Filter state lives in the hash query** (`#/shared?q=..`, `#/?sort=..`),
  written with `replaceState`; new filters go into `st` + `syncUrl()`. Long lists
  use `drawChunked()`; search inputs are debounced.
- **Keep the leading `<!DOCTYPE html>` + charset + viewport** — without them a
  double-clicked or Pages-hosted copy renders in quirks mode.
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
- **Sync Scores Online** — kovaaks.com public API, two passes: `total-play` for a
  quick baseline, then `all-played` + `last-scores/by-name` per scenario for what it
  missed. **`total-play` is incomplete, not just stale** — 263 scenarios against
  1,137 actually played — so never build on it alone. `last-scores/by-name` is
  current and auth-free; `last-scores/by-id` 401s and `user/scenario/top` ignores
  `page`/`max`, returning the same 10 rows forever. kovaaks.com rate-limits bursts
  (timeouts = throttle; connection *refused* = genuine outage), hence
  `SYNC_CONCURRENCY = 2`, `SYNC_GAP_MS = 300`, 2500ms backoff, self-abort after 5
  consecutive failures. 4-wide with no gap got a whole IP refused; total request
  volume matters more than concurrency.
- Both feed the locally computed rank badge automatically (see "Rank is computed
  locally"). Rank is deliberately *not* taken from kovaaks.com's
  `benchmarks/player-progress-rank`, whose 596-benchmark catalog uses a
  non-equivalent rank system and would mix two taxonomies under one UI.
- The home tile "Scenarios played on KovaaK's" is `all-played`'s size (whole
  account, from the last online sync). It replaced "Lifetime runs", which summed
  `total-play`'s play counts — an endpoint missing most of the history.
- `apply-scores.ps1` (identical to the tracker's copy) bakes a Settings-page
  export into a tracker file; `-Html` defaults to `sync-state.json`'s
  `trackerHtml` here. Sync Scores Locally skips CSVs older than the newest it has
  already read (`mini-evxl-local-sync-newest-ms`).

## Directions already evaluated and closed

- **PlayFab backend integration — rejected.** This tool stays personal/single-user;
  no public rankings. Also unnecessary now that kovaaks.com's own public API exists.
- **Google Sheets as the structure-update path — dropped.** Surveyed all 118 unique
  playlists: only 65% (130/201 entries) are backed by a publicly fetchable sheet, 30%
  have none, 5% link an unreadable one. Full map in `docs/sheet-scope.json`. Sheets
  can never cover the dataset, so a scrape path stays necessary.
- **evxl.app serves an empty SvelteKit shell** — but the earlier "no fetchable data
  endpoint" conclusion was **overturned**: its tables come from
  `kovaaks.com/webapp-backend/benchmarks/player-progress-rank-benchmark?benchmarkId=&steamId=`,
  and evxl runs its own `api.evxl.app` (`/rank-counts`, `/scenario-rank-counts`).
  See the tracker repo's CLAUDE.md ("Scraping may be unnecessary" and "API vs
  scraper") for the endpoints, the open `benchmarkId` mapping blocker, and the four
  cases where a scraper still beats an API.

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
