# Remote session notes — 2026-08-18

Branch **`claude/benchmarks-project-o5hn4z`**, forked from `master` @ `1bd1020`
(the 2026-08-18 00:41 LF `.gitattributes` commit, right after the nine-rung
difficulty release). Written by the away-from-home Claude session for (a) Owen
and (b) the home dev-session Claude that will audit this work. `master` was
never written. The personal repo is unreachable from the remote container by
design, so nothing was regenerated. The first wave of commits touches only
files this repo owns outright (tests, CI, this doc). A second wave — after Owen
reviewed these findings from his phone and said to act on the recommendations —
applies Finding 1's engine patch to `src/engine.js` and the embedded engine as
one synchronized edit (see the addendum at the end). **That change must be
mirrored into the tracker repo's engine source before the next template
rebuild**: the build copies the tracker's engine over this repo's, so an
unported rebuild reverts it — loudly, because the snapshot test pins the
patched labels.

## Why this session ran

Owen, away from home, asked to: protect the home-machine state exactly as it
is, do isolated work on a "fork", then have the most recent home dev dialogue
analyze the result for gaps or errors in this kind of remote workflow. The
fork is this branch; the work is a fresh-eyes QA of last night's difficulty
release plus the CI guards it suggested; this document is the audit's input.

## Remote-environment facts (worth keeping for next time)

- Linux container, Node 22, **no PowerShell** — every `.ps1` here is
  non-runnable (still editable). The Node test suite is the only executable
  safety net.
- **kovaaks.com is blocked** by the environment's network policy (proxy 403 on
  CONNECT). No live API or leaderboard verification is possible remotely.
- `origin` has only `master` (plus this branch): `dev` lives solely on the home
  machine, as do all build inputs (`src/app.js`, `page.html`, `styles.css`,
  `data/`). Only `src/engine.js` and the built `template.html` are visible
  remotely.
- The CLAUDE.md relay-garbling trap **generalizes beyond Git Bash cp437**: this
  session's search tooling displayed template.html line 1974 (`// Difficulty
  index…`, a line containing `→`) with a single `/` — i.e. as a syntax error
  that would kill the whole page. A byte-level read (`cat -A`) and
  `node --check` on the extracted script block refuted it. The "verify bytes
  before believing relayed non-ASCII" rule held and prevented a bogus hotfix.

## Verified at base `1bd1020` (all pass)

- `node test/golden.js` — 251 entries × 12 vectors, 0 problems (Node 22).
- The engine embedded in `template.html` (lines 409–1583) is **byte-identical**
  to `src/engine.js`.
- `<!DOCTYPE html>` + charset + viewport intact; `esc()` still escapes `"`;
  the `scores-data` seed is `{}`; the `SITE` block is fully generic
  (`storePrefix: 'mini-evxl-template'`, `dev: false`).
- No identity strings survive. One observation: several first-person **design
  comments naming Owen** do ship in the template ("Owen's call (2026-08-17)…",
  around lines 1310/1413/1431/2898/3873). Presumably fine for a repo under
  `owenrichardsonkrow-oss` — flagged so it stays a choice, not an accident.
- Difficulty integration follows the house rules: `_diffIndexCache` is reset in
  `invalidateCaches()`; Shared and Unique classify through the same code path,
  so the card-parity rule holds by construction.

## Difficulty-classifier sweep (the main QA)

Method: mirrored the app's `getDiffIndex()` / `diffLookupBase` / page-level
`classifyDifficulty` calls in Node over the shipped dataset, using an
instrumented engine copy that exposes the internals (placement, tier words,
base split, modifier sum per name). The instrumented copy agreed with the real
engine on every name (drift 0), and the mirror is now permanent as
`test/difficulty.js`.

**3,040 distinct scenario names — 2,672 rated, 368 unrated.**

| Easy− | Easy | Easy+ | Int− | Int | Int+ | Hard− | Hard | Hard+ | unrated |
|------:|-----:|------:|-----:|----:|-----:|------:|-----:|------:|--------:|
|   230 |  511 |    92 |  132 | 484 |   33 |   150 |  759 |   281 |     368 |

Both documented design examples verify exactly: `VT Ground Novice S5 Hard` →
Easy+ (Easy placement pulled one rung toward "hard"), and `Close Fast Strafes
Easy Invincible - Thin` → the base split leaves only `- Thin` as modifier text
→ Easy+. The theoretical "same tier word twice, only the first occurrence
tracked" edge affects **zero** names in the shipped dataset.

### Finding 1 — "N% Size" names invert the lone-percent rule (patch applied here; tracker port required)

`difficultyNameModifiers` first reads worded percents (`N% smaller|thinner|
larger|bigger|slower|faster`, the word giving direction), then a **lone** `N%`
as ≤90 → easier / ≥115 → harder. The lone rule was calibrated on speed-style
names (`beanClick 250% Speed`, `Controlsphere OW 150%` — correctly harder).
When the next word is **`Size`**, the percent is target scale and the direction
inverts: `6 Sphere Hipfire 200% Size` (double-size spheres — the classic easier
variant) read, pre-patch, **+1 harder**, and `RawMouseControlClicking3 70% Size`
(smaller targets), pre-patch, **−1 easier**.

The change below is **applied on this branch** (second wave — Owen green-lit
acting on the recommendation mid-session): one synchronized edit to
`src/engine.js` and the embedded engine, between the worded-percent rule and
the lone-percent rule, snapshot regenerated in the same commit.
template-integrity proves the two engine copies stayed byte-identical. What
remains is the home half: **mirror this into the tracker repo's engine source
before the next rebuild**, or the rebuild reverts it and the snapshot test
turns red on exactly these three names. As committed:

```js
    // "N% size" (target scale) inverts the bare-percent rule below -- bigger
    // targets are easier: >=115 -> -1 (like "larger"); <=90 -> +1 (<=50 -> +2,
    // like "smaller"). Speed-style names still read through the bare rule.
    t = t.replace(/(\d+)\s*%\s*size/g, (m, n)=>{ const v=Number(n); if(v>=115) sum -= 1; else if(v<=90) sum += v<=50 ? 2 : 1; return ' '; });
```

Measured effect on the shipped dataset — exactly **3 labels** move, all in the
intuitive direction:

| scenario                          | now           | patched       |
|-----------------------------------|---------------|---------------|
| 6 Sphere Hipfire 150% Size        | Hard+         | Hard−         |
| 6 Sphere Hipfire 200% Size        | Hard          | Intermediate+ |
| RawMouseControlClicking3 70% Size | Intermediate− | Intermediate+ |

Caveat: `PGTI Voltaic Easy 80% Size 150%` is untouched either way — it anchors
on its rated base `PGTI Voltaic Easy 80%` (itself in the dataset), so only
`Size 150%` is read, and size-before-percent order matches neither rule (nor is
it clearly interpretable). Golden standings are unaffected — difficulty feeds
no rank math; verified before and after applying. To veto the rule instead:
revert the engine commit and `node test/difficulty.js --write`.

### Finding 2 (question) — lone-percent far below its measured range

`Pokeball 1w4ts 30%` reads its lone `30%` as −1 easier under a rule whose
evidence was 80%/90% names. If that 30% is a size scale, the direction is
wrong and the true magnitude large. (Correction to this finding's first draft:
the variant `Pokeball 1w4ts 30% Easy` is NOT affected — it anchors on the
rated base name, so its own `30%` is never read.) Unresolvable remotely (API
blocked); one home run of `dev/kovaaks-modifier-check.ps1` over the `N%`-only
names below the measured range would settle it.

The exact worklist, computed post-patch — every rated name whose effective
modifier text still carries a bare percent below 80:

```
20%  voxTargetClick 20% Small
75%  SmoothBot Invincible Goated 75%
55%  Whisphere Small & Slow 55%
70%  Air Angelic 4 Voltaic Easy 70%
30%  tamTS Control Hard (Faster TTK - 30%)
30%  Pokeball 1w4ts 30%
70%  Whisphere Small & Slow 70%
70%  Whisphere Sky&Floorbot 70%
75%  Leaptrack Goated 75% Slightly Larger
75%  Whisphere Small & Slow 75%
50%  Piano Tiles I 50% SLOW
30%  WhisphereRawControl 30% small
10%  1w3ts Pasu Perfected Micro Goated 10% small
75%  Avasphere Hard 75%
```

### Finding 3 (question) — even-count median rounds toward harder

`medianRung` on an even count takes `Math.round` of the middle-two mean, and
JavaScript rounds .5 **up**: labels `[Easy(1), Intermediate(4)]` → 2.5 → rung 3
(Intermediate−); `[Intermediate(4), Hard(7)]` → 5.5 → 6 (Hard−). A consistent
harder-side bias on family-straddling ties. It reads deliberate; confirm it is.

Measured (second wave): flooring the tie — toward easier — would relabel **101
of 3,040** scenarios (`1wall9000targets` Hard− → Intermediate+, `1wall6targets
TE` Intermediate− → Easy+, `10 Sphere Hipfire Extra Small` Hard → Hard−, …).
No data prefers either direction; it is a convention. Recommendation, adopted
unless vetoed: **keep the current round-up.** Nothing was changed.

### Finding 4 (eyeball list) — whole-name modifier scans

85 placement-anchored names have no dataset base and no tier word, so per the
documented fallback their modifiers are read from the whole name — including
words that are the scenario's identity.

Second-wave scan of where the risky words actually fire (in effective modifier
text, post-patch): **`long` fires on 7 rated names — 6 are the calibrated
"Long Strafes" sense; the single true collision is `headshot precision long
distance 3 targets small`** (`long` +1 reads range, not strafe length; with
`small` +2 it jumps Main(4) → Hard). `short` fires twice, both the calibrated
"Short Strafes" sense. `static` fires on ~10 names where it is arguably
identity rather than a variant marker (`360 Static TS`, `Static Wide Reflex`,
`aimerz+ Static Switching`, …) — defensible either way (static-type scenarios
genuinely sit at the easier end of their playlists), but these are the main
veto candidates.

The complete 85-name list with labels, placements and pushes is committed as
`docs/difficulty-wholename-movers.txt` (generated from the patched engine) —
ten minutes of scenario-literate reading. Most entries look defensible — that
is what the calibration data said; the list exists so individual words can be
vetoed, not because the mechanism looks wrong.

### Finding 5 (by design, quantified) — the unrated 368

All are label-starved. Top carrying labels: "All" (200), "Static" (30), "S1"
(14), "2026" (12), "Strafes" (12), "Improvement Bench" (10), plus season/track
labels throughout — exactly the labels the design ignores on purpose. No action
implied; the number is here so a future "why is this unrated?" has a baseline.

A second-wave check closed the vocabulary side: all 80 distinct carrying labels
were scanned — the 27 that map to no rung are all track/season/year/pack names
("All", "Static", "S1", "2026", "Improvement Bench", …). Zero missed difficulty
words.

## Changes made on this branch

1. **`test/difficulty.js` + `test/difficulty-snapshot.json`** — snapshot test
   pinning all 3,040 labels. The classifier shipped with zero CI coverage
   (golden records standings only). Same regeneration policy as the golden
   file: `--write`, deliberately, after an intended change. The `compute()`
   mirror of the app's call sites must be updated in the same commit if those
   change shape (template.html: `getDiffIndex` / `computeSharedScenarios` /
   `computeUniqueScenarios`).
2. **`test/template-integrity.js`** — automates this session's by-hand audit:
   every script block parses (`vm.Script`, parse-only — the gap that let a
   template-only breakage escape golden), embedded engine byte-equals
   `src/engine.js`, DOCTYPE/charset/viewport, `{}` scores seed, generic SITE +
   template store prefix, `esc()` keeps escaping `"`, no identity strings.
   Every guard was negative-tested against a mutated copy (engine drift, an
   unterminated regex in the script block, a personal SITE value — each failed
   as intended). Toolkit-only by nature: it asserts the *generic* SITE values,
   so do **not** copy it into the personal repo as-is.
3. **`.github/workflows/test.yml`** — runs all three tests; now also triggers
   on `claude/**`, so remote working branches like this one get CI runs
   visible from a phone.
4. **`src/engine.js` + the embedded engine + `test/difficulty-snapshot.json`**
   (second wave) — Finding 1's `% size` rule, applied as one synchronized edit
   after Owen's go-ahead; the snapshot diff is exactly the three expected
   relabels. **Mirror into the tracker engine before any rebuild.**
5. **`test/difficulty.js`** (second wave) — on failure, a changed scenario set
   prints the structure-refresh regenerate hint; label drift on an unchanged
   set stays a hard investigate signal (verified in both directions).
6. **`docs/difficulty-wholename-movers.txt`** (second wave) — Finding 4's full
   veto-review list, generated from the patched engine.
7. **`.github/workflows/deploy.yml`** (third wave) — gated Pages deploy: on
   master pushes, a test job (all three suites) gates the artifact deploy, so
   a red push can no longer replace the live page. Inert until merged; the
   cutover and revert steps are in the workflow header and checklist item 7.
8. **`test/harness.html`** (third wave) — now also runs the difficulty
   snapshot in the browser. The RESULT line keeps its original keys (golden
   results) so the home parser keeps working; difficulty is nested — fully
   green = `problemCount 0` AND `difficulty.problemCount 0`. `?write=1` also
   prints a DIFFSNAP line. Verified end-to-end in headless Chromium against a
   local static server.
9. **`CLAUDE.md`** (third wave, draft) — the missing day written in: three-test
   CI, the difficulty attribute with the port-pending warning, a
   remote-sessions section, gated Pages. It is Owen's file — wording pass at
   home, reshape freely.
10. **`docs/DESIGN_INTENT.md`** (fourth wave) — the product's *why*, born from
    a live design conversation with Owen: tracker → interactive training
    optimizer, the floor-biased objective, percentile-as-metric, attempt
    capture, the transfer program, and a dated decision log (D1–D11).
    CLAUDE.md now points to it.
11. **`docs/taxonomy-proposal-2026-08-18.md` + `docs/taxonomy-vocab-proposal.json`**
    (fourth wave) — the skill-facet mapping proposal: all 99 category labels,
    all 72 multi-playlist subcategories, one-off veto list, rulings section.
    Status: proposal — consumed by nothing until Owen ratifies.

Maintenance note: a weekly structure refresh moves the difficulty snapshot the
same way it moves the golden file (entries appear/vanish). Whatever step of the
home chain regenerates or re-blesses the golden should regenerate the snapshot
in the same breath (`node test/difficulty.js --write`), or the Monday commit
will fail CI on the snapshot instead of the golden.

## Suggested audit checklist (home dev session)

1. **First, before any rebuild: mirror the `% size` rule into the tracker
   repo's engine source** (Finding 1, applied here in the second wave). A
   rebuild then proves itself — all three tests stay green only if the port
   happened. To veto instead: revert the engine commit, `node
   test/difficulty.js --write`.
2. On this branch at home: `node test/golden.js && node test/difficulty.js &&
   node test/template-integrity.js` — all three should pass.
3. Diff-review the two new tests; `difficulty.js compute()` versus the real
   call sites in `app.js` is the soundness of the whole snapshot — check the
   mirror, not just the output.
4. Finding 2: run `dev\kovaaks-modifier-check.ps1` over the 14-name worklist
   above. Finding 3 is closed as "keep round-up" unless vetoed. Finding 4:
   read `docs/difficulty-wholename-movers.txt` with scenario knowledge.
5. Decide where snapshot regeneration lands in the home tooling (a sibling of
   `dev\run-tests.ps1 -WriteGolden`?), and wire it into the weekly chain
   wherever the golden gets re-blessed.
6. Judge the workflow itself. The CLAUDE.md "remote sessions" section this
   list originally proposed now exists as a third-wave draft — review the
   wording (it is your file); and decide whether session docs like this one
   live on in `docs/` or get dropped at merge.
7. After merging: check Settings → Pages shows source "GitHub Actions" and the
   "deploy pages" run went green (the workflow attempts the switch itself; if
   the deploy job errors on Pages configuration, flip the source once by hand
   and re-run). From then on a red master push leaves the previous live page
   up instead of going live.
8. Taxonomy ratification pass (Owen deferred this from the phone on purpose):
   open each flagged scenario type in KovaaK's and answer the "Rulings
   requested" section of `docs/taxonomy-proposal-2026-08-18.md` — rule from
   the scenarios themselves, not memory. High-confidence rows stand unless
   vetoed; one-off subcategories default to no-facet. Per D12, the community
   taxonomy document stays in the drawer until the emergence protocol's
   comparison step.

Merge note: after the second wave this branch carries **one behavior change in
regeneration-owned files** — the `% size` rule in `src/engine.js` and the
embedded engine. The hard ordering constraint is checklist item 1: port it into
the tracker engine before the next rebuild. An unported rebuild reverts the
rule and the snapshot test turns red on the three relabeled scenarios — loud,
not silent, but still a red master. Everything else (tests, snapshot, workflow,
docs) is additive.

## Addendum — second wave, same day

Owen reviewed the findings from his phone and authorized acting on the
recommendations ("whatever you think we can take care of in this session…
I trust your recommendations"). Done in this wave, all on this branch:

- **Finding 1 applied** — the `% size` rule, one synchronized edit to
  `src/engine.js` + the embedded engine (byte-identity enforced by
  template-integrity), snapshot regenerated; its diff is exactly the three
  expected relabels. Golden green before and after.
- **Finding 3 measured and closed (pending veto)** — floor-median would move
  101 of 3,040 labels; no data prefers either tie direction; keeping round-up.
- **Finding 4 sharpened** — word-sense scan: one true `long` collision, `short`
  clean, ~10 identity-`static` names to eyeball; full list committed as
  `docs/difficulty-wholename-movers.txt`.
- **Finding 2 scoped and corrected** — the 14-name sub-range percent worklist
  is in the finding; `Pokeball 1w4ts 30% Easy` was wrongly cited in the first
  draft (it anchors on its rated base and never reads its own percent).
- **`test/difficulty.js` failure output** now separates structure-refresh
  failures (regenerate hint) from label drift on an unchanged scenario set
  (investigate), verified in both directions.

Still home-only after this wave: the Finding 2 leaderboard measurements, the
Finding 4 veto read, the tracker-side port (checklist item 1), and wiring
snapshot regeneration into the weekly chain.

### Third wave — same day, continued authorization

- **Gated Pages deploy** (`.github/workflows/deploy.yml`): the live page — a
  real user's page — previously updated on every master push regardless of CI
  results. Now a test job gates the deploy. Inert until merged; cutover and
  revert in the workflow header and checklist item 7.
- **Browser harness runs difficulty too** (`test/harness.html`): original
  RESULT keys untouched for the home parser, difficulty nested; verified in
  headless Chromium against a local static server (golden 251×12 and
  difficulty 3,040 both green in-browser).
- **CLAUDE.md caught up** (draft): three-test CI, difficulty attribute with
  the port-pending warning, remote-sessions section, gated Pages.
- **Also verified this wave, no changes needed:** the shipped template boots
  clean in headless Chromium (home / shared / detail routes, zero console
  errors, all 251 cards render, difficulty chips render including Unrated);
  the `?user=` parameter is XSS-safe (64-char cap + `esc()` at both reflection
  points, and `esc()` escapes quotes); unrated scenarios sort to the bottom
  under both difficulty sort directions; README already matches the
  onboarding-first framing rule, `?user=` documented.

### Fourth wave — the design session

Owen laid out the product's next stage in a live conversation: from "fancy
tracker sheet" (evxl-parity+) to an **interactive training optimizer** built
around raising the floor across all skill types simultaneously. Eleven design
decisions were ratified turn by turn and are logged with dates in
**`docs/DESIGN_INTENT.md`** — now the canonical *why* document (CLAUDE.md
points to it; read it before any feature work). Highlights: floor-biased
expected gain (not strict maximin), percentile-as-the-competency-metric,
attempt capture as a core data requirement, the return-and-collect ideal with
the return-collect rate as the tool's self-KPI, and Owen's player-profile
sampling design for the population similarity map.

The first artifact of the propose→ratify→stamp loop is also on the branch:
**`docs/taxonomy-proposal-2026-08-18.md`** maps every category label (99) and
multi-playlist subcategory (72) to skill facets, with a rulings section for
the ambiguous ones. Coverage if ratified as-is: 82% of scenarios get at least
one facet; the rest await a later name-evidence proposal. Nothing
engine/app-behavioral changed in this wave — both artifacts are docs, consumed
by no code until ratified.

## Session end state — handoff

Base `1bd1020` (master's tip — master never moved this session); every commit
after it on this branch is this session's work. Tree clean, fully pushed, all
three test suites green locally on the final tree and on Actions for every
push. Nothing merged; no PR opened — deliberate, the home audit comes first.

**Read order for a fresh agent, any machine:** `CLAUDE.md` (the how;
auto-loads) → `docs/DESIGN_INTENT.md` (the why; decisions D1–D12) → this file
(what happened, what's owed, checklist items 1–8) →
`docs/taxonomy-proposal-2026-08-18.md` (awaiting Owen's R1–R21 rulings, listed
in its "Rulings requested" section).

**Open at session close:**

- Owen: read DESIGN_INTENT (his intent transcribed — amendments welcome, the
  decision log is his); answer R1–R21 at home with the scenarios open
  (checklist item 8); work checklist items 1–7, item 1 (the tracker-side
  `% size` port) before any rebuild.
- Standing offer, any browser, any time: on a synced copy of the tracker,
  Settings → *Your scores* → Export hands a session Owen's real snapshot for
  competency-profile prototyping. Handling rule: session scratchpad only,
  **never committed** — the public repo ships a clean template.
- The community taxonomy document stays with Owen until the emergence
  protocol's comparison step (D12).
- Remote-doable next, per DESIGN_INTENT staging: profile-math prototyping
  against seeded data; session-engine pure functions with snapshot tests.
  Home-only: the checklist, percentile-curve harvest, player-profile
  sampling, attempt capture, run-history import.

**Deliberately ephemeral:** the session's analysis tooling (the
difficulty-sweep instrumentation, tag-survey and taxonomy-proposal
generators, browser smoke-test artifacts) lived in the container scratchpad
and dies with it. Everything they produced that matters is committed (the
snapshot, the movers list, the proposal + vocab JSON, the findings and
measurements in this file), and each is regenerable from committed data plus
the methods described here — nothing unique is lost with the container.
