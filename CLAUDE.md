# mini-evxl-toolkit

The public, genericized version of a personal KovaaK's benchmark tracker.
`template.html` is a single-file, hash-routed SPA shipping the full 251-entry (2026-08-16)
*structure* (scenario lists, category groupings, tier thresholds) and an empty
scores block. No build step. MIT licensed.

Remote: **https://github.com/owenrichardsonkrow-oss/mini-evxl-toolkit** (public,
`origin`, branch `master`; first push 2026-08-16). GitHub Pages serves
`template.html` from `master` / root — enabled in the repo's Settings → Pages by
Owen. Since 2026-08-18 (`.github/workflows/deploy.yml`, written on the remote
branch; active once merged, with the Pages source on "GitHub Actions") the live
page only updates when all three test suites pass on the pushed master — a red
push leaves the previous deploy up. Pushing is routine now; the personal
tracker repo has no remote and stays that way (it embeds Owen's own scores).

The personal copy this is generated from lives in the sibling folder
`../mini-benchmarks-tracker` (`mini_evxl.html`).

## Generated, not hand-edited

**Branches (2026-08-17):** `master` is what the live Pages link serves — a friend
(`mayogobbler`) uses it — and is written only by releases from the personal
repo's master and by its Sunday job. Development happens on **`dev`**, checked
out as a git worktree in the sibling dev workspace (`..\..\mini-evxl-dev\mini-
evxl-toolkit`, next to the tracker's dev worktree); there the personal repo's
`build.ps1` writes **`template.dev.html`** (gitignored, `[DEV]` title, store
prefix `mini-evxl-template-dev`) and never touches `template.html`. Release =
merge `dev` → `master` in the production folders and rebuild there. CI runs on
both branches.

`template.html` is produced by the personal repo's **`build.ps1 -Template`**
(`generate-template.ps1` here is a thin wrapper) from that repo's source tree —
`src/page.html` + `styles.css` + `engine.js` + `app.js` and `data/`. The template
build empties the scores block (the v2 dataset is structure only, so it ships
verbatim), and swaps the page's **`SITE` identity block** (the only personal
strings in the script: `template`, `owner`, `defaultUsername`,
`steamUrl`/`steamLabel`, `evxlProfileUrl`) plus the `<title>` and brand text for
generic values — every replacement asserted, and it refuses to write if a
personal string survives anywhere. It also copies the shared files (`lib/`,
`apply-scores.ps1`, `apply-evxl-catalog.ps1`, `fix-mojibake.ps1`,
**`src/engine.js`**) from the tracker repo when they differ.
`IS_TOOLKIT_TEMPLATE` is `SITE.template`.

**Tests (three since 2026-08-18):** `test/golden.js` (Node; `test/harness.html`
runs it and the difficulty test together in a browser) checks the engine's
standings for seeded score vectors against `test/golden-standings.json` —
answers recorded from an engine the personal repo's differential test had
proven identical to evxl's own rank code. `test/difficulty.js` pins every
scenario's nine-rung difficulty label against `test/difficulty-snapshot.json`
(no seeding — the classifier is pure, so the snapshot pins classifier AND
dataset; regenerate with `--write` only for an intended change, and expect a
weekly structure refresh to move it exactly like the golden — its failure
output says which case you're in). `test/template-integrity.js` guards the
shipped page itself: every script block parses, the embedded engine byte-equals
`src/engine.js`, SITE stays generic, `esc()` keeps escaping `"` — the gaps
golden can't see because it requires `src/engine.js` directly. GitHub Actions
runs all three on every push including `claude/**` remote branches
(`.github/workflows/test.yml`). The golden file is regenerated only from the
personal repo (`dev\run-tests.ps1 -WriteGolden`) after an intended engine change
that the differential test has blessed — never by hand here.

**App-behavior changes belong in the personal copy first, then regenerate.**
Hand-editing `template.html` directly means the next regeneration silently discards
the work.

`generate-template.ps1` is anchored to its own folder (since 2026-08-16 late; it
used to use relative paths and silently wrote `template.html` wherever you
happened to be). `static-server.ps1` and `sync.ps1` *are* intentionally divergent from
their personal-copy counterparts (port 8744/9500, `$PSScriptRoot` instead of a
hardcoded root, config-driven `trackerHtml`, first-run guidance) — those two are
hand-maintained here and must not be overwritten from the personal copy.
`lib/kovaaks-table.ps1`, `apply-scores.ps1`, `apply-evxl-catalog.ps1` and
`fix-mojibake.ps1` are straight copies of the tracker's. Every script here
dot-sources `lib/kovaaks-table.ps1` for dataset I/O and **culture-proof number
handling** (`ConvertTo-Num` / `Format-Num`): `[double]::TryParse` and
`"{0:N0}" -f` follow the machine's locale and on a German PC read "131.02" as
13102 — never use them on file values.

## Onboarding design — the point of the whole toolkit

The evxl scrape was only ever needed for benchmark **structure**, which is identical
for every player. Only scores are player-specific, and scores come from
kovaaks.com's public API by username; the rank badge and volts are then computed
locally from those scores (see "Rank is computed locally"). So a new user's entire onboarding is:
open the file, click Sync Scores, enter their KovaaK's username. No scrape, no JSON,
no AI assistant.

`docs/SCRAPING_GUIDE.md` is therefore the **advanced** path (playlists outside the
pre-loaded set), not the primary flow. Keep both docs framed that way.

The longer-term product direction — tracker → interactive training optimizer —
and every ratified design decision live in **`docs/DESIGN_INTENT.md`** (started
2026-08-18). Read it before feature work: it holds the why, this file the how.

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

## Remote sessions (Claude Code on the web, 2026-08-18)

A cloud session clones only this public repo: the personal tracker and `dev`
(both live only on the home machine) are out of reach, there is no PowerShell
(Linux container — the `.ps1` are editable, not runnable; Node and headless
Chromium are available), and kovaaks.com is blocked by the network policy, so
no live API or leaderboard checks. Work lands on a `claude/*` branch (CI runs
there), never `master`. The regeneration rule holds remotely with one
refinement: an engine change may land on the branch only as a synchronized
edit to BOTH `src/engine.js` and the embedded copy (template-integrity
enforces the byte-identity), with a loud port-to-tracker note — the build
still overwrites both from the tracker, so the tracker port must precede the
next rebuild. Session handoffs go in `docs/remote-session-<date>.md` for the
home session to audit. The relay-garbling trap above generalizes: a Linux
container's search tooling displayed a `→` comment line's `//` as `/` — same
rule, verify bytes before believing a relayed "corruption".

## Data model — three independent stores

1. **Playlist structure** — `BENCHMARKS`, replaced wholesale by an upload.
2. **Scenario scores** — `SCORES` (`localStorage[storeKey('scenario-scores')]`;
   every key is `SITE.storePrefix + '-' + name`, and the template's prefix is
   **`mini-evxl-template`** — set by the personal repo's `build.ps1` — so a
   personal build and the template hosted on one origin never share a store;
   localStorage is per origin, not per path, verified 2026-08-17 on GitHub Pages),
   an **append-only** name→score map. `recordScores()` never lowers a value, so
   the template's empty seed can't wipe a synced score, and an upload that
   drops playlists never destroys their scores. Cleared only by an explicit
   reset.
3. **Exclusions** — `EXCLUDED` (`localStorage['mini-evxl-excluded-playlists']`),
   a set of `JSON.stringify([name, difficulty])` keys that survives uploads.

Everything derives from one rule: **a scenario renders iff at least one present,
non-excluded playlist references it.** `getParsedBenchmarks()` implements it, so
orphaning and exclusion are the same mechanism and neither touches scores. It
assigns `index` before filtering so `#/bench/N` links stay stable.

**Every score display goes through `parsedItemsFor(b)`** (the store overlay). The
detail page once parsed the raw table instead — in this template, where nothing
ships a score, that meant every detail page showed 0 after a sync. Fixed 2026-08-16.

**The store is per browser and per origin** (`file://`, `localhost:9500`, a Pages
URL are separate stores). Settings → *Your scores* has Export / Import (JSON,
max-merge), and `apply-scores.ps1 -Scores <export.json> -Html <copy.html>` bakes
an export into a tracker file's scores block. That's the user's backup and their way to
carry scores between copies.

Score-only by design — tier thresholds belong to the playlist, so an orphaned
scenario has nothing to draw a bar against and doesn't render.

## Rank is computed locally; volts is computed locally too

`benchmarkStanding(items, b)` ports evxl's own engine (read out of its JS bundle;
the tracker repo's CLAUDE.md has the full account). Every benchmark declares a
`rankCalculation` mode and the badge is **max(mode rank, "Complete" rank)**. Each
dataset entry carries `rankCalc`, `evxlId`, `groups` (the catalog layout),
`evxlRankOffset`, stamped by `apply-evxl-catalog.ps1` (identical copy here; the
catalog it reads lives in the tracker repo's `dev/`). Ported and verified exact:
40 of evxl's 41 modes — 249 of 251 playlists (each proven against evxl's own
code by the tracker repo's differential test). The other 2 are unportable by
design (`aimbeast` comes from Aimbeast's service) and show the Complete reading
only, flagged `modeSupported:false`; the detail page's Rank label carries a •
that says so. `rankReq` survives only as a legacy per-entry override.

**Pool benchmarks (`selectable-top-n`, REVENGE Benchmark ×3, 2026-08-17):** the
entry holds the whole 48-scenario pool (what the KovaaK's playlist plays) plus a
`selection` block stamped from the catalog (`select 24, baseN 9, fullN 18, minCat
8, minSub 4`). The page computes evxl's default pick (first 4 per subcategory)
unless the user ticks their own on the detail page (per-browser
`mini-evxl-scenario-selection`, like exclusions); rank = tier of the 9th-best
scored selected scenario (18th when the whole pool is selected), Unranked under
the minimums. `parsedItemsFor()` returns the WHOLE pool with `selected` flags
(every pool scenario is a playlist member for Shared/Unique, completion, sync);
only `benchmarkStanding()`/`benchmarkVolts()` narrow to the selection via
`rankedItems()`.

Volts is back, computed from evxl's own formula (read out of its bundle): each
scenario earns score ÷ top-tier threshold × 100 (uncapped), summed and rounded;
"Viscose Benchmarks" uses (score − first) ÷ (top − first) × 100. Verified exact
against the live page. Cards show completion and volts ("100% · 2,318 V"); the
home grid sorts by completion by default, volts is a sort option. The dataset's
legacy `volts` field is still unread.

Home also has two panels: **Quick wins** (played scenarios ≥70% of the way to
their next tier, most playlists first) and **Recent improvements** (a local
score-history log written by every sync/import raise; not exported).

**Difficulty attribute (nine rungs, 2026-08-17/18):** every scenario on the
Shared/Unique pages carries `classifyDifficulty()`'s label (Easy− … Hard+, ''
= unrated; the "Difficulty attribute" block in `src/engine.js` holds the full
design): family × nudge from the carrying playlists' difficulty labels
(median), pulled one rung by a tier word in the name, pushed by calibrated
size/speed name modifiers, variants anchoring on their base via the app's
`getDiffIndex()` (`_diffIndexCache`, reset in `invalidateCaches()`). Sorting
sinks unrated in both directions; the filter has Unrated and per-family
"(any)" values. 2026-08-18, remote branch: `"N% size"` names invert the
bare-percent direction (bigger targets = easier) — **port that rule into the
tracker's engine before the next rebuild** (an unported rebuild reverts it and
difficulty.js turns red on three names); the open calibration questions and
the whole-name veto list live in `docs/remote-session-2026-08-18.md` and
`docs/difficulty-wholename-movers.txt`.

The scrape's only remaining purpose is **structure**; the tracker repo's
`refresh-all-from-kovaaks.ps1` (KovaaK's API) has replaced it in practice, and
since 2026-08-17 the tracker's `weekly-refresh.ps1` (Task Scheduler, Sunday
04:00) runs the whole chain unattended and **commits `template.html`
here** when the structure moved — so a `template.html` commit titled "Weekly
structure refresh <date> (automated)" is expected, not a stray. Since
2026-08-16 late it does **not push** (a sanity gate blocks bad upstream days,
and the push waits for a human glance; `weekly-refresh.ps1 -Push` opts in) —
so `master` may be ahead of `origin/master` on a Monday; look, then push.

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
- **Auto-check** (2026-08-17) — `autoCheck()` on page open and on
  `visibilitychange` → visible: one request to `user/activity/recent?username=`
  (last 10 events; `HIGH_SCORE` entries carry `scenarioName` + `score`, same scale
  as `last-scores/by-name`), patched through `patchScoresFromMap(map,'auto')`,
  marker `storeKey('auto-check')` `{at,newest}`, 60 s min gap, silent on failure,
  off when embedded, Settings checkbox → `storeKey('auto-check-off')`. Feed is 10
  deep: when all 10 are unseen it points at Sync Scores Online.
- **First-run panel** (2026-08-17) — on the template's home while the store is
  empty (`IS_TOOLKIT_TEMPLATE && !usingImported && SCORES.size===0`): username
  field + "Sync my scores" (Enter or click) → `doSync(false, name)` →
  `runKovaaksSync(…, presetUsername)`; status mirrored into `#first-run-status`
  by `setSyncStatus`; the panel makes way once scores land; a saved username is
  prefilled (reset case), else `?user=<name>` from the page URL
  (`URL_KOVAAKS_USERNAME`, also the last fallback of the Sync prompt; never
  persisted by itself and deliberately not an auto-check fallback — that would
  drip 10 scores into an empty store and hide the panel before a full sync). Unknown usernames come back from `total-play` as
  `200 null`, mapped to the "no player found" message. "Clear synced data" on
  the Load Your Data page now also shows for synced-only template stores.
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
