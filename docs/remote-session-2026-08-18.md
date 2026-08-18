# Remote session notes — 2026-08-18

Branch **`claude/benchmarks-project-o5hn4z`**, forked from `master` @ `1bd1020`
(the 2026-08-18 00:41 LF `.gitattributes` commit, right after the nine-rung
difficulty release). Written by the away-from-home Claude session for (a) Owen
and (b) the home dev-session Claude that will audit this work. `master` was
never written. The personal repo is unreachable from the remote container by
design, so nothing was regenerated — every commit on this branch touches only
files this repo owns outright (tests, CI, this doc). `template.html` and
`src/engine.js` are untouched.

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

### Finding 1 — "N% Size" names invert the lone-percent rule (proposed patch)

`difficultyNameModifiers` first reads worded percents (`N% smaller|thinner|
larger|bigger|slower|faster`, the word giving direction), then a **lone** `N%`
as ≤90 → easier / ≥115 → harder. The lone rule was calibrated on speed-style
names (`beanClick 250% Speed`, `Controlsphere OW 150%` — correctly harder).
When the next word is **`Size`**, the percent is target scale and the direction
inverts: `6 Sphere Hipfire 200% Size` (double-size spheres — the classic easier
variant) currently reads **+1 harder**, and `RawMouseControlClicking3 70% Size`
(smaller targets) reads **−1 easier**.

Proposed change to the personal repo's `src/engine.js` (**not applied here** —
app-behavior changes belong in the personal copy first), inserted between the
worded-percent rule and the lone-percent rule:

```js
// "N% size" (target scale): direction inverts the lone-percent rule --
// bigger targets are easier. >=115 -> -1 (like "larger"); <=90 -> +1
// (<=50 -> +2, like "smaller").
t = t.replace(/(\d+)\s*%\s*size/g, (m, n)=>{
  const v = Number(n);
  if(v>=115) sum -= 1; else if(v<=90) sum += v<=50 ? 2 : 1;
  return ' ';
});
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
it clearly interpretable). If the patch is adopted: change the personal
`src/engine.js`, rebuild the template, and regenerate
`test/difficulty-snapshot.json` (`node test/difficulty.js --write`) in the same
commit. Golden standings are unaffected — difficulty feeds no rank math.

### Finding 2 (question) — lone-percent far below its measured range

`Pokeball 1w4ts 30%` / `Pokeball 1w4ts 30% Easy` read the lone `30%` as −1
easier under a rule whose evidence was 80%/90% names. If that 30% is a size
scale, the direction is wrong and the true magnitude large. Unresolvable
remotely (API blocked); one home run of `dev/kovaaks-modifier-check.ps1` over
the `N%`-only names below the measured range would settle it.

### Finding 3 (question) — even-count median rounds toward harder

`medianRung` on an even count takes `Math.round` of the middle-two mean, and
JavaScript rounds .5 **up**: labels `[Easy(1), Intermediate(4)]` → 2.5 → rung 3
(Intermediate−); `[Intermediate(4), Hard(7)]` → 5.5 → 6 (Hard−). A consistent
harder-side bias on family-straddling ties. It reads deliberate; confirm it is.

### Finding 4 (eyeball list) — whole-name modifier scans

85 placement-anchored names have no dataset base and no tier word, so per the
documented fallback their modifiers are read from the whole name — including
words that are the scenario's identity. The strongest movers, for a human eye:

```
-3  voxTS-Huge Jumbo static                            Easy   -> Easy-  (clamped)
+3  headshot precision long distance 3 targets small   Main   -> Hard
+2  1wall 6targets small                               Hard   -> Hard+
+2  PTXS Small Fast                                    Easy   -> Intermediate-
-2  WPV Mixed Short Strafes                            Hard   -> Intermediate+
-2  Piano Tiles I 50% SLOW                             Normal -> Easy+
+2  VSTP Small TE                                      Main   -> Hard-
-2  Midrange Short Strafes Invincible Raspberry        Hard   -> Intermediate+
```

Most look defensible — that is what the calibration data said. The list exists
so someone who knows the scenarios can veto individual words, not because the
mechanism looks wrong.

### Finding 5 (by design, quantified) — the unrated 368

All are label-starved. Top carrying labels: "All" (200), "Static" (30), "S1"
(14), "2026" (12), "Strafes" (12), "Improvement Bench" (10), plus season/track
labels throughout — exactly the labels the design ignores on purpose. No action
implied; the number is here so a future "why is this unrated?" has a baseline.

## Changes made on this branch (all repo-owned; no app behavior touched)

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

Maintenance note: a weekly structure refresh moves the difficulty snapshot the
same way it moves the golden file (entries appear/vanish). Whatever step of the
home chain regenerates or re-blesses the golden should regenerate the snapshot
in the same breath (`node test/difficulty.js --write`), or the Monday commit
will fail CI on the snapshot instead of the golden.

## Suggested audit checklist (home dev session)

1. On this branch at home: `node test/golden.js && node test/difficulty.js &&
   node test/template-integrity.js` — all three should pass.
2. Diff-review the two new tests; `difficulty.js compute()` versus the real
   call sites in `app.js` is the soundness of the whole snapshot — check the
   mirror, not just the output.
3. Rule on Finding 1. If adopted: personal `src/engine.js` → rebuild → snapshot
   `--write`, one commit, and the tests prove the rest.
4. Answer Findings 2–3; skim Finding 4's list with scenario knowledge.
5. Decide where snapshot regeneration lands in the home tooling (a sibling of
   `dev\run-tests.ps1 -WriteGolden`?), and whether the weekly chain needs it.
6. Judge the workflow itself. Candidates observed from inside: CLAUDE.md could
   gain a short "remote sessions" paragraph (what is editable remotely vs
   personal-repo-first; kovaaks.com and pwsh unavailable there); and decide
   whether session docs like this one live on in `docs/` or get dropped at
   merge.

Merge note: this branch is purely additive (two test files, one snapshot, the
workflow, this doc). Nothing regeneration-owned changed, so the next template
rebuild cannot silently discard anything here.
