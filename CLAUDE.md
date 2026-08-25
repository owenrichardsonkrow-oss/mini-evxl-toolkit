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
page only updates when all six test suites pass on the pushed master — a red
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
`src/page.html` + `styles.css` + `engine.js` + `app/*.js` (ordered fragments of one
IIFE, since 2026-08-18) and `data/`. The template
build empties the scores block (the v2 dataset is structure only, so it ships
verbatim), and swaps the page's **`SITE` identity block** (the only personal
strings in the script: `template`, `owner`, `defaultUsername`,
`steamUrl`/`steamLabel`, `evxlProfileUrl`) plus the `<title>` and brand text for
generic values — every replacement asserted, and it refuses to write if a
personal string survives anywhere. It also copies the shared files (`lib/`,
`apply-scores.ps1`, `apply-evxl-catalog.ps1`, `fix-mojibake.ps1`,
**`src/engine.js`**) from the tracker repo when they differ.
`IS_TOOLKIT_TEMPLATE` is `SITE.template`.

**Board calibration (2026-08-25, Review Ledger III A1).** The population block now ships
a fourth product, `offsets` (`data/offsets.json` in the tracker; `{meta, offsets: {name:
[delta, m]}}`). A percentile is a rank inside ONE leaderboard and the leaderboards are
not comparable populations — measured across 3,000 sampled players, board size predicts
percentile at mean r **+0.37** and positively for 96.4% of them — so ranking on raw
percentiles ranked board popularity. `delta` shifts a percentile's LOGIT so that one
percentile means the same thing everywhere (`adjustPercentile`), fitted as
`logit(pct) ~ playerLevel + delta` over 7,703 sampled players and re-centred on the
median board; `m` is the players behind it, 0 when predicted from the board size. The
engine's `calibrateScenarios(rows, {offsets})` applies it once at the boundary and also
quantile-maps a played curve-less scenario's To 2nd onto the same scale (S3), so the
coach's sort is one quantity rather than two. `boardConfidence` still exists and is
still exported, but the session stops shrinking by it wherever offsets are present — it
was an invented `log10(n)/4` standing in for exactly the bias the offsets measure.
Every page reads the calibrated number and shows the raw board rank beside it wherever
the two differ. The template ships the same offsets (population data is the same for
every player); a build stamped before this date has `offsets: {}` and behaves exactly
as before.

**Routes cross playlists, and are scored on a block (2026-08-25, A2).** Measured on the
shipped map, pairs whose two scenarios share a KovaaK's playlist average r +0.254 and
pairs that do not average −0.001; playlist-mates are 7.6% of tested pairs but supply
54.5% of every edge at r >= 0.3, because people train playlists as units. 66.7% of the
shipped positive neighbour edges were playlist-mates, and for 256 of 632 scenarios every
one was. So a route may no longer be a playlist-mate, and its evidence is now the whole
block: `blockRouteCandidates` scores a candidate by its mean r across every member of
the weak item's block (>= `ROUTE_MIN_PAIRS` measured pairs, and the mean must survive
its own standard error). The engine takes the pair index through `opts.pairsIndex`;
without one the behaviour is unchanged. `transfer.labels` no longer feeds the coach at
all — it is a mean over pairs ALREADY filtered to |r| >= 0.3 at n >= 12, biased upward
by construction — and the revisit forecast reads the measured neighbourhood from the
index instead. `bridgeRows` and the Overlap page's bridge table stay, labelled as the
different statistic they are.

**The session rotates, and the KPI can be wrong (2026-08-25, A3 + R2).** A fixed
5/2/1/1/1 template filled from the head of a slow-moving list made every session look the
same, which is the one thing the user of the coach actually complained about. The day now
has a PURPOSE chosen by a trigger -- `chooseSessionType` returns `{type, why}` over
`SESSION_TYPES` (floor / transfer / collect / breadth, each summing to 10), never the
same one three days running, and the weakest slice is SAMPLED by weakness rather than
taken off the top (`exp(-(key-best)/SAMPLE_TEMP)`, damping what the last few sessions
served). `opts.rotate` is opt-in, so every earlier path is untouched.
Built with the scoring, not before it: the return-collect rate needs a null model or it
cannot say whether the coach works. `collectBaseline(n) = 1/(n+1)` is the chance of a
first-try PB if nothing changed at all, `sessionHistoryStats` returns Brier scores
against it plus `skill = 1 - brier/brierBase` and reliability bins, and the verdict is
gated at `SCORE_MIN_REVISITS` (20) because a skill score is unbounded below and reads as
a catastrophe on a handful of samples.

**Soft block membership (2026-08-25, A4).** A scenario that is not a stable member of any
community can still be PLACED by measurement: `scenarioAffinity` scores its mean r against
each community's members, cross-playlist, from the shipped pairs, and
`affinityAssignment` places it only when that affinity survives its own standard error AND
is separated from the runner-up by more than the standard error of the difference. Two
communities within a standard error is a HYBRID and stays unplaced -- naming a winner
there would fabricate structure. `why` is decisive | tie | no-affinity | unmapped. The
label fallbacks are renamed `(other)` -> `· unplaced`. NOTE the freeze's varimax loadings
were NOT used: they are factor loadings, and D13 ships the community lens because the
factor lens reproduced the carrying playlists. On the current map this places 71 of 135
eligible scenarios (32 are measured ties); the limit is coverage -- 82% of the candidates
have no tested pair at n >= 100 at all -- and the fix is a lower shared-player floor on
the map, not a different model.

**The percentile rule changed, and gained a cross-language test (2026-08-25, Review
Ledger IV).** `percentileRank` interpolates the share beaten on its **LOGIT** between
anchors, not linearly, and extrapolates below the last anchor the same way instead of
ramping linearly to zero. Measured by holding each shipped curve's own anchors out: mean
absolute error 0.0291 -> 0.0154 between anchors, and **0.1037 -> 0.0180 below the last
one, where the old ramp was one-signed (+0.1030 mean, too generous on 98.9% of curves)**.
The SCORE axis is unchanged and must stay linear -- logging it is worse for interpolation,
and eight shipped curves have negative lower anchors (pressure scenarios) where a log has
no answer. Extrapolation falls back to the old ramp when the last anchor pair cannot
define a slope, and a curve whose scores are not monotone now returns null rather than a
plausible-looking 0.5.

The rule exists in two languages and **`test/percentile.js` is the check that they agree**
-- run against `test/pctrank-fixture.json`, which `build.ps1 -Template` copies from the
tracker exactly as it copies `src/engine.js`, and which the tracker's
`dev/emergence-selftest.ps1` checks its own `Get-PctRank` against. Seven suites in CI now;
`deploy.yml` gates on all of them. Before this the only parity guard compared two
POWERSHELL copies of the rule with each other, which cannot catch a JS/PS divergence --
and the new check found one immediately (`Get-PctRank 0` answered a percentile where
`percentileRank` answered null). A checkout without the fixture skips rather than fails.

**Ledger IV step 1 (2026-08-25).** `test/percentile.js` gained a sibling: `test/session.js`
now pins **`calibrateScenarios`** under `features.calibrate` -- the boundary every ranking
passes through, which the suite had only ever run on its identity path because the fixture's
OPTS carries no `offsets`. It failed immediately: `adjustPercentile(null)` answered a
plausible 0.2nd percentile instead of null, because `Number(null)` is 0 and 0 is finite. That
is the fifth instance of the trap this project has documented four times; prefer an explicit
`x === null || x === undefined` check whenever null is a legitimate input.

`overlapOf` now sorts on the **exact** correlation interval (`rInterval`: transform, add,
transform back) rather than reading a Fisher-z half-width off as an r. Rows carry `lo`/`hi`
and `band` is the exact half-width. The hand fixture shows why it mattered: ordered by lower
edge C1's neighbours are Click Three 0.5485, Click Two 0.4575, Mixed One 0.4376, where the
approximation put Click Two LAST -- subtracting a z-width straight off r over-penalises
exactly the thin pair it is meant to discount. `groupMatrix` also exposes `overlapSaturated`,
because a disattenuation ratio above 1 is a statement (these are one construct measured
twice), not a large number. 148 checks.

**`template-integrity.js` now looks for the owner's name.** It scanned only
`richardsonkrow|mayogobbler`, and the tracker's build guard derived its needle from
`SITE.owner` (`'mini'`), so neither caught the bare first name -- which eleven source
comments had been embedding into every built template, because comments ship verbatim. The
comments say "the owner" now and both guards name the string literally. A name in a denylist
is not a leak; it is what lets the check fail.

**Ledger IV step 2 -- the instruments (2026-08-25).** Four engine changes as one step,
because the forecast's `p` and the outcome's definition feed the same calibration record.

`revisitForecast` **attenuates by r**. Its gain was `sum(r*delta)/sum(r)` -- an r-weighted
mean of the NEIGHBOURS' movements, which said "they gained 12 points, so you gained 12".
Both sides are percentiles, so the regression prediction is `r * delta`: r is the weight AND
the attenuation, and the weight is the SHRUNK r. On the fixture, gain 0.0667 -> 0.0301 and
the bucket flips good -> fair. `collectReady` counts off `odds > 0`, so the rotation's first
trigger was firing on an inflated number.

`sessionHistoryStats(log, pbNow, now, liveKey, **runsOf**)` **resolves from the run record**.
An item is scored only once a run is logged AFTER it was served, and the outcome is that
FIRST run against the PB it was served against -- the event `1/(n+1)` actually describes. The
old rule scored "the PB rose at some point" against that baseline, and counted a revisit you
never attempted as a miss. The any-time reading is kept beside it with its own null,
`k/(n+k)`, and the owner's Q4 extends both past revisits to EVERY served item. Without
`runsOf` the older PB reading applies, keeps its `done > 0` gate, and the result says so
(`resolvedFrom`).

`stuckness` uses the **exact null**. The m older runs are compared against the same recent
maximum, so they are positively dependent and the binomial SE understates the spread; the
exact negative-hypergeometric SD equals it at m = 1 and is 1.7x larger at m = 15. Simulated,
the false-stuck rate ran 16.6% -> 28.1% across that range -- the same drift with play count
S6 exists to remove. The bar stays expectation - 1 SD; the exact one-sided p is reported
alongside.

Tests: `features.resolve` (a first-try collect, a miss-then-collect, a never-attempted item,
an attempted-never-beaten one, both baselines, the legacy contrast, and Q4's served stats
over a mixed session) and `features.stuckNull`. The forecast assertions now pin the
RELATIONSHIP as well as the value, and derive the bucket from `forecastBucket(p)`.

**Ledger IV step 3 -- the randomised arm, NEXT-4 (2026-08-25).** Everything else the coach
measures is "it said play X, you played X, here is what happened", which can never separate a
good recommendation from improvement you would have made anyway -- there is no counterfactual
in the record. The calibration curve says whether the forecast's PROBABILITIES are honest; it
cannot say whether the ORDERING beats serving something else.

`ARM_B_SHARE = 0.25` of revisit slots serve the **runner-up**, from the same seeded RNG so a
day's session is stable across re-renders; `ARM_MIN_PER_ARM = 10` resolved per arm before a
verdict. **B DISPLACES, IT DOES NOT REORDER** -- swapping ranks 1 and 2 serves both and
measures nothing, so the top pick is WITHHELD (and is a candidate again tomorrow). With one
candidate left the slot stays A, so the experiment never costs a revisit it could have served;
that makes the realised share at MOST `ARM_B_SHARE` -- 0.218 at a pool of 3, 0.249-0.251 at 4
or more, about 0.15 on this fixture whose pool barely exceeds its slot count. `test/session.js`
asserts that invariant (never above, never collapsed) rather than a band that holds at one pool
depth. It costs power, not validity: under "the ordering carries no information" the expected
excess over baseline is 0 for either arm whatever the assignment probability was.

**Revisits only** -- a revisit resolves in days and already has a null (`1/(n+1)`); a route's
claim is that it moves a different scenario weeks later, a different experiment. **Blinded** --
nothing rendered names the arm, because knowing changes how hard you try and the comparison
would then measure belief; the history view reveals it only for RESOLVED items.

The comparison is on **excess over baseline**, not raw rate: A and B items differ in `n` by
construction, so raw rates are confounded. `armStat` compares `hit - 1/(n+1)`, expectation 0
under the null whatever `n` each arm drew. The interval is a normal approximation on a
difference of means, labelled as such on the page so the number cannot be read without its
width; COACH-4's model replaces it with the arm as a covariate.

Tests: `features.arm` (OFF is the identity, every served revisit carries an arm, no duplicates,
the realised-share invariant, no leak into any item reason, and -- the point -- that turning it
ON REMOVES a revisit the OFF run served and does not re-serve it) and `features.armStats` (six
per arm, excess over baseline not raw rate, the difference, and no verdict under the minimum).

**Review Ledger III (2026-08-25)** — a read-only code + statistics + intent pass on
both repos (<https://claude.ai/code/artifact/04459fc6-3da8-4090-8fab-83ab2f014b36>).
Its four wrong-number bugs (C1–C4, all in the coach) are applied on the tracker's
`dev`; the engine copy here follows at the next build. C1 one `forecastBucket` rule
so the item reason and the session chip cannot disagree; C2 the session header's
return-collect goes through `sessionHistoryStats` like the history view; C3 reset
clears the coach's record (data model 5 above); C4 the coverage slot needs a
MEASURED absence, not a missing one. The session snapshot passed unchanged through
all four — the fixture's cold block is cold on real 40-day-old runs. The larger
statistical findings (the percentile metric is confounded with leaderboard size;
two-thirds of transfer routes are playlist-mates) are staged behind them and not
started.

**Tests (seven since 2026-08-25):** `test/session.js` pins the session coach's
output (`composeSession`, `skillProfile`) on a synthetic fixture — no dataset;
the snapshot lives in the test source as `EXPECTED`, regenerated with
`node test/session.js --print` (or `/test/harness.html?session=1`) only for an
intended behaviour change; it is the gate for any refactor of the session
engine. `test/overlap.js` checks the Overlap page's pure functions
(`buildOverlapIndex`, `overlapOf`, `groupMatrix`, `independentGroups`, …) on a
hand fixture. CI runs both after facets. `test/golden.js` (Node; `test/harness.html`
runs it and the difficulty test together in a browser) checks the engine's
standings for seeded score vectors against `test/golden-standings.json` —
answers recorded from an engine the personal repo's differential test had
proven identical to evxl's own rank code. `test/difficulty.js` pins every
scenario's nine-rung difficulty label against `test/difficulty-snapshot.json`
(no seeding — the classifier is pure, so the snapshot pins classifier AND
dataset; regenerate with `--write` only for an intended change, and expect a
weekly structure refresh to move it exactly like the golden — its failure
output says which case you're in). `test/facets.js` pins every scenario's skill-facet
list (`test/facets-snapshot.json`; the ratified vocabulary in `src/engine.js`
`FACET_VOCAB`, generated from `docs/taxonomy-vocab-ratified.json` — Owen's
rulings R1–R21 are in `docs/taxonomy-proposal-2026-08-18.md`; probes make five
rulings executable). `test/template-integrity.js` guards the
shipped page itself: every script block parses, the embedded engine byte-equals
`src/engine.js`, SITE stays generic, `esc()` keeps escaping `"` — the gaps
golden can't see because it requires `src/engine.js` directly. GitHub Actions
runs all six on every push including `claude/**` remote branches (template-
integrity is skipped on `dev`, whose tracked template is the last release by design)
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

## Working style (Owen's calibration, 2026-08-18)

Owen caught agreement-inflation in a session and asked for this standing
correction: deliver disagreement plainly, uncushioned — no compliment
wrapping, no performed concessions, no praise that carries no information.
His hedges ("I might be wrong", "could be my failing") are probability
statements, not requests for reassurance — weigh the claim, not the feeling.
Before agreeing with a substantive claim of his, produce the strongest
counter-case; if none is serious, say "no serious counter-case" — never
invent filler. An invitation to push back is not an order to manufacture
pushback.

Further calibration (same session): the clean channel is Claude's job in both
directions. No social bids — never close on approval-seeking ("does that
sound good?"), performed enthusiasm, or anything whose natural reply is
reassurance; end on content, and closing questions must have informational
answers. Read Owen's terse or unsoftened replies as neutral, never as
displeasure to repair. When the mode of his message is ambiguous (prior vs.
directive vs. musing), state the reading in one line rather than guessing
silently, and label your own register where it could be misread ("factual
disagreement, not annoyance"). Substantive judgment questions get evidence
before verdict. In blind evaluations (his position withheld), do not attempt
to infer his position — evaluate cold. Personal context shared in
conversation stays out of this repo unless Owen explicitly says to commit it,
and then only as behavior rules, never as descriptions of him.

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
4. **Attempts** (since 2026-08-18) — `ATTEMPTS` (`storeKey('attempts')`,
   scenario → `{ n, last: [[t, s], …] }`, the last 20 runs newest-first): the
   runs behind the max-only scores. Fed by the deep sync (KovaaK's
   `last-scores/by-name` returns the last 10 runs per scenario, each with an
   epoch), total-play's record-run epoch, local stats CSVs (one file = one
   run), and auto-check PB events; same score within ten minutes = one run.
   Export is format version 2 (`attempts` beside `scores`; v1 still imports),
   `apply-scores.ps1` bakes them into a page's `#attempts-data` block (`{}` in
   this template; `template-integrity.js` asserts it). Cards show "N plays ·
   last 3d ago · best of last 5: 92% of PB". Cleared by reset.
5. **The coach's record** (2026-08-25) — `storeKey('session')` (today's composition)
   and `storeKey('session-log')` (every session composed, each revisit item carrying
   the `p` it was predicted at; the return-collect rate is computed over it). Carried
   by Export/Import since format v3, merged as unions. **Cleared by reset** (review
   C3): every `pbAt` in the log is a score the reset removes, so a surviving log
   reports return-collect against numbers that no longer exist — and here the same
   button reads "Clear synced data", where keeping a previous user's session history
   would be plainly wrong. Nothing cleared these two keys before that date.

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
bare-percent direction (bigger targets = easier) — **ported into the tracker's
`src/engine.js` the same day** (home audit; the rebuild reproduced the branch's
engine and the difficulty snapshot passed unchanged), so the regeneration rule
is whole again. The open calibration questions and the whole-name veto list
live in `docs/remote-session-2026-08-18.md` and
`docs/difficulty-wholename-movers.txt`. Fixture maintenance: the tracker's
`dev\run-tests.ps1 -WriteGolden` now regenerates BOTH `test/golden-standings.json`
and `test/difficulty-snapshot.json` (harness `?write=1`), and its weekly job
re-blesses both automatically when a refresh moved the dataset — the
differential test against evxl's functions is the gate that stays.

The scrape's only remaining purpose is **structure**; the tracker repo's
`refresh-all-from-kovaaks.ps1` (KovaaK's API) has replaced it in practice, and
since 2026-08-17 the tracker's `weekly-refresh.ps1` (Task Scheduler, Sunday
04:00) runs the whole chain unattended and **commits `template.html`
here** when the structure moved — so a `template.html` commit titled "Weekly
structure refresh <date> (automated)" is expected, not a stray. Since
2026-08-17 the scheduled task passes `-Push` (the commit is gated by the sanity
gate and the headless tests, so an unattended push publishes only a tested
commit; `register-weekly-refresh.ps1 -NoPush` restores commit-only) — so
`origin/master` moves on Sunday mornings; a revert commit undoes a bad one.

**Dropped from the template (2026-08-16)**: `Black Dawn [Celestial Forge]` — it is
empty at the source (KovaaK's returns no scenarios for that benchmark id, evxl
shows placeholders), so the entry was removed rather than shipped as a 0-scenario
card. The template now holds 251 entries / 127 playlists.

## Rules that are easy to break

- **One scenario list page (`#/scenarios`, since 2026-08-18) and one card
  renderer** — the old Shared (2+ playlists) and Unique (exactly 1) pages are
  the same page with the "playlists" range preset; `#/shared` and `#/unique`
  still route there as aliases so old links work. Every card is drawn by one
  `makeCard`; legend playlist names link to their playlist. Don't fork it again.
- **`achievedIndex()` is the one tier rule** (threshold ≤ 0 never reads as
  cleared) for bars, labels and the rank engine alike.
- **Filter state lives in the hash query** (`#/scenarios?q=..&min=..&max=..`, `#/?sort=..`),
  written with `replaceState`; new filters go into `st` + `syncUrl()`. Long lists
  use `drawChunked()`; search inputs are debounced. Nav items are `<a href>` links.
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
