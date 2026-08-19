# Design intent — from tracker to training optimizer

Living document. Drafted 2026-08-18 (remote session, from a design conversation
with Owen; his decisions are logged at the bottom with dates). Read this before
feature work: it holds the *why* the code cannot show. CLAUDE.md holds the *how*.

## Why this tool exists

Owen trains aim because it improves his FPS play and because improvement itself
is enjoyable. Grinding one scenario is unfun and felt suboptimal; grinding one
category was slower than it should be; and one observation founded this whole
project: after a static-clicking grind, his speed switching had measurably
improved without being practiced. The working thesis: **skill transfer between
categories is real, and the right practice order can make variety the efficient
path rather than a tax on it.** The original ambition — map the overlap between
categories and prescribe practice through it — was deferred as too hard; the
tracker was built in the meantime. This document is that ambition, resumed.

The site today is a "fancy tracker sheet" (evxl-parity plus features evxl lacks:
Unique page, local rank engine, difficulty attribute, Quick wins). The next
stage is an **interactive coach**: given who you are today, it prescribes what
to play next — designed around **raising your floor across all skill types
simultaneously**.

## The objective

Floor-**biased** expected gain — not strict maximin. Strict "always train the
weakest skill" recreates the brick-wall problem Owen already hit with the
weakest-10 loop, at skill level: a stuck or mismeasured floor gets hammered
forever. Amendments, all ratified:

- Practice weight goes mostly to weak-**and-responsive** skills, never 100% to
  the argmin. Sessions are mixed by construction — the fun requirement falls
  out of the math instead of being bolted on. (Weakness and responsiveness are
  the first two factors; the design leaves room for more.)
- Stuck floors get **indirect routes through the transfer table** (see below):
  the best way to raise reactive tracking may be smoothness volume.
- **Uncertainty-aware**: badly-measured skills get *placement* recommendations
  (go generate evidence), not training ones.
- **Fun is a hard constraint.** The tool exists because optimal-but-boring was
  rejected. No output may reduce to "grind this one scenario."

**The ideal end-state (Owen, 2026-08-18):** the tool works so well that
returning to an old scenario usually means beating your PB on the first try —
because between visits you trained surrounding skills at an adequate variety of
difficulty. Revisit timing is therefore part of the optimizer's job: estimate
"likely to beat PB now" from facet gains since the last visit, and schedule the
return to collect. This gives the system its own report card: the
**return-collect rate** (first-try PBs on recommended revisits). If the coach
works, that rate is high; if it sags, the weights are wrong. Self-scoring.

## Competency model

- **The metric is your percentile on each scenario** — continuous, no
  reference-percentile anchor, comparable across all scenarios. Curator
  thresholds are not the measure (To Max is never used: top tiers are uneven
  and sometimes literally world records).
- Percentile curves are population data: harvested home-side from kovaaks.com
  leaderboards (generalizing `dev/kovaaks-modifier-check.ps1`'s percentile-rank
  sampling), ~5 anchor points per scenario, stamped into the dataset the same
  way `apply-evxl-catalog.ps1` stamps catalog fields, interpolated locally by
  the engine. Played-scenarios-first keeps request volume inside the
  established rate discipline; curves change slowly, refresh accordingly.
- **v0 stand-in** until curves exist: tier-ladder position (evxl curators
  approximately calibrated tiers to population anyway).
- Per-skill competency = robust aggregate (median) of scenario percentiles over
  the skill's facet, with a **confidence** attached: evidence count × freshness.
- **Falsifiability is a UI requirement**: every skill number is one click from
  the scenarios that produced it. Owen's SME smell-test is the QA system.
- Caveats on record: per-scenario leaderboard populations are self-selected
  (elite scenarios carry elite players — 50th percentile there ≠ 50th on a
  novice scenario); small populations mean wide uncertainty. Both are
  confidence-weighted; a population-strength correction is a possible later
  refinement.

## Responsiveness and attempt capture

- **Responsiveness = recent gain per attempt, in percentile space** (ladder
  space pre-curves). Raw score deltas are never compared across scenarios —
  scales differ by orders of magnitude.
- **Nearness is the secondary signal**: best recent attempt 2% under PB means
  knocking on the door; 15% under means stuck or an off day. Different advice.
- This requires **attempt capture — a core data requirement**. Today non-PB
  plays are invisible everywhere (max()-only store, raise-only history,
  HIGH_SCORE-only auto-check): five plays without a PB inform nothing. Fix:
  Sync Scores Locally already reads the per-run stats CSVs and discards all but
  the max — extend it to keep attempt counts and recent attempt scores
  (tracker-repo work). Whether `last-scores/by-name` exposes recent plays for
  the online path is a five-minute check at home.
- With attempts, "plateaued" and "just hasn't played it" finally separate —
  the current tool structurally conflates them.

## Skill taxonomy (the foundation everything keys on)

Facets, not one flat list — the 2026-08-18 tag survey showed curator labels mix
several axes on one field:

- **mechanic**: clicking / tracking / switching (the triad covers 511/429/411
  scenarios across 40–48 playlists each)
- **modifier**: static, dynamic, reactive, speed, precise, evasive, control,
  micro, smooth, reading, flick, timing, … (the subcategory head is exactly
  this vocabulary, 17–36 playlists each)
- **environment**: air / ground; **game-focus**: cs/val, tac-fps, …
- **evicted**: difficulty words (the difficulty attribute owns them) and
  curator-identity labels (aoiaim, henwood — they carry no skill meaning)

Survey facts: 99 distinct category labels (68 one-playlist-only), 208
subcategory labels (136 one-off); keyword stems alone map ~87% of
category-tagged scenarios; 505 of 3,040 scenarios carry no category tag at all
(name evidence or ruling needed); 362 scenarios carry ≥2 distinct labels.

Process is the proven house loop: **propose → Owen ratifies → stamp as data**
(same as the difficulty vocabulary and the evxl catalog fields). The proposal
lives in `docs/taxonomy-proposal-2026-08-18.md` with a machine-readable vocab
alongside; ratified mappings later get stamped into the dataset and an engine
classifier (personal-copy-first, like everything app-behavioral).

**Two different artifacts share the word "taxonomy" — keep them separate
(D12):** the label-normalization vocabulary above is product *scaffolding* —
it cleans curator strings into displayable facets so v1 sessions and UI
grouping can exist. It makes no truth claim about skill structure. The
*skill-structure taxonomy* — what skills actually exist and how they relate —
is a scientific object and is required to be **emergent**: see the emergence
protocol below.

## Data sources and their honest limits

1. **Structure data** (in hand): taxonomy, playlist co-occurrence. Encodes
   curator opinion, not measured transfer.
2. **Personal best-score snapshot**: the competency profile. Cross-sectional —
   cannot reveal transfer even in principle (one person, one time, no arrows).
3. **Population data** (home network only):
   a. Percentile curves per scenario (the competency metric's backbone).
   b. **Player-profile sampling** (Owen, 2026-08-18): sample usernames at
      stratified ranks from several anchor scenarios *in different families*
      (single-scenario sampling biases toward that scenario's enjoyers), pull
      each player's scores through the tool's own profile pipeline → a
      players × scenarios matrix. Correlate **residuals** (per-scenario
      percentile minus the player's overall level) to get the empirical
      scenario/skill similarity map — "how strength on one predicts another"
      with the good-at-everything factor controlled away. Batch job at the
      established rate discipline; tens to low hundreds of players,
      incremental/overnight. Caveat on record: co-varying strengths = shared
      skill — a strong *prior* for transfer, not proof that practicing A moves
      B.
4. **Personal run history** (per-run stats CSVs, home): the only causal-ish
   source — practice bursts in A vs lagged gains in unpracticed B. n=1 and
   confounded, but n=1 is the person being optimized.

**Transfer weight table**: skill→skill weights with provenance per entry —
`prior` (Owen's SME judgment) → `population` (3b audits) → `personal` (4
audits). The optimizer consumes whatever the table holds; evidence upgrades it.

## The emergence protocol (D12)

Owen's requirement, adopted 2026-08-18: community aim-training knowledge is
largely anecdotal and rarely tested; if its taxonomy and downstream relational
theories are real, they should **emerge** from taxonomy-blind analysis rather
than be built in as fact.

1. The discovery pipeline is procedurally blind: similarity / cluster / factor
   analyses over the players × scenarios matrix take **no labels or facets as
   input**. (Scenario-level primacy guarantees this structurally: no statistic
   is ever computed on categories that could not be recomputed from
   scenarios.)
2. **Structure is frozen before it is named**: cluster memberships and factor
   loadings are committed *before* interpretation begins.
3. Only then is the community taxonomy document ingested and formally
   compared — cluster↔facet agreement measured, divergences itemized as
   findings. **Owen holds the document until step 3.**
4. Interpretation asymmetry, on record: the scenario pool and playlists were
   *created by* taxonomy-thinking minds, and practice co-occurrence follows
   playlist structure — so the clicking/tracking/switching triad re-emerging
   is partly baked in and only weak confirmation, while its failure to emerge
   (or a subcategory layer that restructures — e.g. "speed" as a
   cross-mechanic axis rather than a sub-box) is the loud, informative
   outcome. Playlist co-membership is a named confound when reading
   similarity: check whether correlations survive across players who trained
   different playlists.
5. True analyst blindness is impossible (model training, Owen's own
   expertise, and the curator labels all carry community knowledge); the
   honest achievable standard is procedural blindness plus freeze-before-
   naming.

The label-normalization vocabulary (the taxonomy proposal) is exempt: it is
scaffolding for display and v1 sessions, never feeds the blind pipeline, and
makes no truth claim. The curator-label survey's own headline — the triad
dominating label usage — is a fact about community *belief*, not evidence
about skill structure.

## Session engine (product shape)

- Output: a **session** — default 10 items (a default, not a law), each item
  carrying its **why**: floor / placement / quick win / wildcard / revisit-
  collect. Reasons are load-bearing: they build trust and make bad
  recommendations debuggable.
- Composition is a tunable data template, and the explore share **adapts to
  profile confidence**. The regime extremes are firm (Owen): dataset too thin →
  the tool plainly says "just play — here's a placement session"; dataset
  well-filled → the tool gets out of the way and what to work on is simply
  obvious. The middle band is free design space.
- Within a skill, scenarios are chosen at **difficulty rung ≈ user level ±1**
  (the difficulty attribute enters the math instead of sitting beside it).
- Quick wins folds in as the session's reward slice.
- **Live companion for free**: auto-check already fires on tab-back
  (visibilitychange) and patches new scores — the session view subscribes and
  checks items off as you play. Manual refresh remains the fallback.
- Optional one-tap **session-feel rating** — a feedback input (user → tool),
  never a report; included because it is cheap n=1 data, skippable because it
  is friction.
- **Revisit scheduler**: P(first-try PB) from facet gains since last visit;
  recommends collection visits; the return-collect rate is tracked as the
  tool's own KPI.

## Built so far (home session, 2026-08-18 evening — review ledger II)

- **Attempt capture (D10)** — the `last-scores/by-name` check answered yes
  (last 10 runs per scenario, each with an epoch); the tracker now keeps an
  attempts store fed by the deep sync, total-play epochs, local CSVs and
  auto-check PBs, exports it (format v2), bakes it into the personal page,
  and shows plays / last played / best-of-last-5 vs PB on every scenario card.
- **Session page v0** — `#/session`: ten items with a why each (floor /
  placement / quick win / revisit / wildcard), v0 metric = ladder position,
  skills = facets, uncertainty-aware (thin facets get placement), thin regime
  = "just play", deterministic per day, live tick-off from auto-check, one-tap
  feel rating, return-collect count over the session log.
- **Percentile harvest (D8)** — `dev/harvest-percentiles.ps1` samples the
  score at 7 anchor ranks per played scenario (the leaderboard endpoint takes
  no player filter — probed); first run 2026-08-18 by hand. The engine's
  interpolation and the metric swap follow once the numbers have been looked at.

## Staging

Remote-session-doable now: this document; the taxonomy proposal and
ratification loop; profile-math prototyping against seeded data; session-engine
pure functions with snapshot tests (engine/app landings follow the
regeneration constitution — personal copy first, or synchronized edit + port).

Home-required: percentile-curve harvest; player-profile sampling; attempt
capture in the tracker's local sync; the `last-scores/by-name` shape check;
run-history import; both transfer analyses.

## Decision log

2026-08-18, all Owen unless noted:

- **D1** Objective is floor-biased expected gain, not strict maximin;
  weakness and responsiveness are factors, room left for more.
- **D2** (superseded same day by D8) Profile baseline via self-residuals
  against difficulty rung — retained only as a fallback concept.
- **D3** All skills weighted equally in v1; game-relevance weighting is a
  later data knob.
- **D4** (refined by D9) Explore/placement share is adaptive, not a constant.
- **D5** Session-feel rating is a feedback mechanism (user → tool), so it is
  included; optional, one tap.
- **D6** Session default is 10 items — "we have to choose something."
- **D7** Interaction is a live, evxl-like page; auto-updating via the existing
  auto-check is the preferred form, manual refresh acceptable.
- **D8** Competency metric is the percentile itself, not distance to a chosen
  percentile; curves harvested home-side and stamped as dataset fields.
- **D9** Regime extremes are firm (too-thin → "just play"; well-filled → the
  answer is obvious); the middle band is free design space.
- **D10** Attempt capture is a core requirement (local sync keeps counts and
  recent attempt scores; non-PB plays must inform the model).
- **D11** Responsiveness = normalized gain per attempt with nearness as a
  secondary signal; the ideal end-state is return-and-collect (revisit
  scheduling), scored by the return-collect rate.
- **D12** The skill-structure taxonomy must be **emergent**: discovery
  analyses run taxonomy-blind, structure is frozen before naming, and the
  community taxonomy document is withheld until formal comparison time (see
  the emergence protocol). The label-normalization vocabulary is scaffolding,
  exempt, and makes no truth claim. Emergence is read asymmetrically:
  reappearance of the community structure is weak confirmation (the data was
  generated under it); its failure to reappear is the informative result.
