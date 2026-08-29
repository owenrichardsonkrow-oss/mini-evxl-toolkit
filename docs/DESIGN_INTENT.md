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
  **Corrected 2026-08-27 (D42): this sentence is false of the shipped code in BOTH
  directions and always was.** The rule is a CEILING only — `rung <= level` for the
  weakest and revisit pools, `rung <= level+1` for fill-out and routes — with **no
  floor at any site**, so an Easy- scenario is fully eligible for a level-8 player;
  and difficulty never enters the ranking key, it gates eligibility beside it. See D42.
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
  no player filter — probed); first run 2026-08-18 by hand.
- **2026-08-19 → 22: the population matrix and the overlap map (3b, D12).**
  Players sampled at stratified ranks on 24 anchor boards, their `total-play`
  PB lists → 22,080 sampled / 7,677 usable players × 1,054 curved scenarios.
  Saturated by a convergence rule (batches until the map moved < 0.02 mean
  |Δr| twice; knee at 11,440 players, every later reading 0.009–0.015).
  Map computed label-blind first (percentile per cell → per-player residual →
  pairwise Pearson), then compared: within-label mean r **0.364**, across-label
  **0.057** — the curator structure re-emerges (weak confirmation, as the
  protocol predicts); 35,000 cross-label pairs above 0.3 are the overlap.
  Bridges with ≥20 scenario pairs: smoothness↔xyz 0.64, VAI↔vertical 0.64,
  pasu-track↔smoothness ~0.6, pacing↔static clicking 0.58; negatives: 3×3 vs
  control/reactive tracking ≈ −0.45. [Retracted 2026-08-22: the first reading
  was "sample skews high (median usable player ~85th percentile)"; the skew
  diagnostic below measured the median at 0.646 and found residual r flat
  across strata — see D14.] Stamped as `data/percentiles.json` + `data/transfer.json`, shipped in
  both builds.
- **Session page v0.3 (2026-08-22)** — the metric is the population percentile
  (D8 adopted in code); **routes** for the weakest items: a co-varying
  scenario (n ≥ 100) or, when the weak scenario is too unpopular to have one,
  a label bridge through the comparison table, guarded against same-skill
  spellings via the facet vocabulary. Each route carries its r and player
  count. Still a prior, not proof — the return-collect rate and the attempt
  history are what will test it.
- **Sample-skew diagnostic (2026-08-22).** The earlier "median usable player
  ~85th percentile" reading was wrong: under the map's own skill definition
  (median percentile over a player's curved scenarios) the sampled players'
  median is 0.646, mean 0.619, SD 0.245 vs 0.289 for a uniform population
  (21.8 % at ≥ 0.85). Residual correlations are flat across skill terciles
  (top-200 bridges 0.717 / 0.717 / 0.731 vs 0.742 pooled; pair ordering
  r 0.85–0.95 between strata; the within/across-label gap 0.16–0.18 in every
  stratum). Thorndike case II over-corrects 3–5× on its own falsification
  test; the model-consistent case III moves r by +0.002. **No correction is
  stamped; the page prints the measured median.**
- **Session engine v0.4 (2026-08-22 late).** Responsiveness per attempt in
  percentile space with a "plateaued" state beside "stuck"; revisit forecasts
  from neighbour/bridge movement since the last visit against the player's
  own recent gap, logged per item for return-collect calibration (the logistic
  slope 0.04 and the 0.05 prior margin are stated priors awaiting that
  calibration — the honest number is the odds, also shown); the session log
  written at compose time and a history view as the self-scoring surface
  (predicted vs collected); the template by profile confidence (thin → fill
  the picture, full → get out of the way; the middle band is v0.3); D3's game
  knob as a Settings weight, default off, capped at 8 percentile points so
  weakness (D1) still comes first; board size as a confidence that shrinks
  small-board percentiles toward the player's level. Every layer reduces to
  v0.3 exactly without its evidence; the toolkit's `test/session.js` snapshot
  is the executable form of that claim.
- **Percentile freshness is a job (2026-08-22).** Sunday's weekly chain fetches
  curves for played scenarios that have none; a Saturday task re-fetches
  curves older than 30 days, 300 per week. A harvester bug that recorded 503s
  as "not found" (and would have let a monthly pass replace a good curve with
  nothing) was fixed first.
- **D12 steps 2–3 executed (2026-08-22).** Label-blind structure of the
  residual correlations frozen in the tracker's `dev/emergence-freeze.json`
  (hash `ed89927b…`, committed alone before the comparison script existed; the
  comparison refuses to run on anything else — blob identity, embedded hash,
  grep guard over the blind code, git ancestry). Two lenses on one shrunk
  matrix: 21 varimax factors (parallel analysis capped at 40, substance rule
  to 21; 10 unstable at 100 bootstraps; 273 stable members of 991, a large
  unassigned/provisional set shipped as hints) and Louvain communities
  (γ 0.5: 2, γ 1.0: 7, both freeze-worthy). Against the ratified facets: the
  factor lens gives ARI vs mechanic 0.079 (p 0.001) but vs pack 0.280 and vs
  the **carrying playlist 0.824 — the factors are the playlists**; the step-4
  asymmetry reads this as training-community / co-measurement structure
  (44 % of pairs had no evidence and entered as 0). The community lens, which
  has no edge where there is no evidence, is the only lens where mechanic
  beats pack (ARI vs mechanic 0.327 at γ 0.5 / 0.221 at γ 1.0 against pack
  0.034 / 0.141) — so **the page ships the community lens**. 300 divergences
  under six rules fixed in advance; the ones that speak to the vocabulary:
  control, reactive, precise, dynamic and timing each split across two
  tracking communities (rule 5); strafe (9/9) and evasive (0.625) concentrate
  in a γ-1.0 community no mechanic owns (rule 2 — the R6/R7 promotion
  question lands exactly here) *[SUPERSEDED 2026-08-26: that reading is the
  retired `ed89927b` freeze. On the shipped `c9026a95`, strafe is 58 scenarios
  with 42 in no cluster at all and 12 of the 16 placed sitting in `c:1`, a
  mechanic-owned community; evasive concentrates nowhere. See D13's closure]*; two Voltaic S5 playlists and Anima Micro v2
  surface as factors with no facet above a third (rules 1/6). No name has
  been given to any cluster; the page carries ids + loading + stability +
  status only. The PSD-repair distance of the zero-filled matrix (0.305)
  matches the permutation null through the same pipeline (0.315) — sparsity,
  not inconsistency; a soft-impute/ALS second freeze stays open as a separate
  run, never a tweak of this one.
- **The map steers the session (v0.5, 2026-08-22 late).** Owen: why find the
  overlap if it is not used to serve the scenarios that make the most
  efficient improvement path? So the coach's skill unit is now the map's
  practise-separately set (the blocks measured to move independently): the
  weakest slice is spread across blocks in proportion to how far each stands
  under the others (floor-biased, never all from one block — D1's mixed
  session falls out of the structure), one coverage slot goes to the block
  nothing touched in 14 days (an independent skill does not improve by proxy),
  and within a block a hub — a scenario whose strength co-varies with many
  others — ranks a little earlier as the shared-skill prior's best bet. Every
  item names its block and links to the map; the session shows the block
  standings. Without a pairs block the session is v0.4 exactly.
- **Overlap page (2026-08-22 late)** — `#/overlap`: the map itself, scenario-first
  (pick a scenario: what moves with it, against it, and not at all, with the
  player's own percentile on every row), a label × label matrix and a greedy
  "practise separately" set computed on the page from every tested pair at
  n ≥ 100 (the pairs ship in the page — falsifiability over page weight;
  every cell opens the scenario pairs behind it), the community lens as
  structure-with-confidence. ~68 % of tested pairs at n ≥ 100 sit under
  |r| 0.15: unrelated is the norm.

- **The metric became comparable (2026-08-25, Review Ledger III A1 + S3).** D8 said the
  competency metric is the percentile itself. It was — but a percentile is a rank inside
  *one* leaderboard, and the leaderboards are not comparable populations. Measured:
  across the owner's 1,267 curved scenarios `r(log10 board size, percentile) = +0.60`,
  and inside each of 3,000 sampled players it averages **+0.37**, positive for 96.4% of
  them. So "raise your floor across all skill types" was being computed on a number that
  partly encoded how popular each scenario is, and the v0.5.1 block standings — cluster
  membership needs measured pairs needs a big board — inherited it wholesale. Each
  scenario now carries a fitted shift of its percentile's logit
  (`logit(pct) ≈ level + offset`, alternating medians over 7,703 sampled players,
  re-centred on the median board, empirical-Bayes shrunk by its own reliability), so an
  adjusted percentile reads as "where you would rank on a typical board". The fitter
  measures its own claim on every write and refuses to ship a fit that leaves a bias:
  within-player r **+0.370 → −0.008**. Split-half reliability of the offsets is 0.972.
  This retires `boardConfidence`'s invented `log10(n)/4` shrinkage — a guessed curve
  standing in for exactly this bias. Separately, the To-2nd fallback for curve-less
  scenarios is quantile-mapped onto the same scale (it correlated with the percentile at
  only r 0.33, and every newly played scenario, having no curve until the next harvest,
  reliably topped the weakest list). **Falsifiability held to:** the raw board rank is
  shown beside the calibrated one wherever they differ, because it is the number a
  player can check on the leaderboard themselves.

- **Routes became transfer rather than more of the same (2026-08-25, A2).** The founding
  observation of this project is cross-category: a static-clicking grind that moved speed
  switching. The map exists to find that, and the coach's "routes" were supposed to be it.
  Measured, they were not: pairs sharing a KovaaK's playlist average r **+0.254**, pairs
  that do not average **−0.001**, and playlist-mates supply 54.5% of every strong edge
  while being 7.6% of tested pairs. Two thirds of the shipped route material was a
  playlist-mate — "practise the other scenario in this benchmark", which is not an
  indirect path at all. A route must now cross playlists, and because that alone would
  have starved a slot the weakest scenarios can rarely fill (4 of the owner's 8 weakest
  have no positive neighbour whatsoever), the evidence moved up a level: a candidate is
  scored by its **mean r across every member of the weak item's block**, over 10+ measured
  pairs, and must survive its own standard error. His weakest block has 181 such
  candidates where scenario-level had 0–2. **The confound check the protocol asked for
  and nobody had run** also says what survives it: the within/across-label gap holds at
  +0.106 among cross-playlist pairs, so D12's weak confirmation stands — but `dynamic
  clicking` stops cohering (0.120 → 0.063) and was a co-training artefact.
  Separately, the label-bridge table is out of every decision path: it is the mean of
  pairs that already passed |r| >= 0.3, so it was a truncated tail tested against the
  threshold that produced it. The Overlap page still shows it, labelled as such.

- **The session got a purpose, and the KPI got a null model (2026-08-25, A3 + R2).**
  The first real feedback from using the coach was that every session had the same shape:
  weakest group, one never-played, one not-played-in-a-year. That is what a fixed slice
  template does when the list it draws from moves slowly. The composition now follows the
  mechanism Owen described instead — work the weak block, work what feeds it, come back
  and collect — as four session types with stated triggers, never the same one three days
  running, with the weakest slice sampled by weakness rather than taken off the top (D1
  says floor-*biased*, explicitly not maximin, so sampling is what the objective actually
  asked for; taking the argmin every day was the stricter reading it warned against).
  **Built in the same step as the scoring, deliberately:** a rotation makes the coach
  harder to evaluate, because a floor day and a transfer day are different treatments and
  the return-collect rate mixes them. So the rate finally got something to be measured
  against. P(first-try PB) with nothing changed is **1/(n+1)** on n prior attempts —
  parameter-free — and the history view now reports Brier scores against that null model,
  a skill score (negative = the forecast weights are actively wrong, which is the reading
  D11 always wanted to be able to reach) and a predicted-vs-observed reliability plot.
  Gated at 20 resolved revisits, because a skill score is unbounded below and reads as a
  catastrophe on a handful. The baseline is deliberately generous to itself — attempts are
  not exchangeable and the attempt count under-counts, both of which raise it — so beating
  it means something.

- **"Other" stopped being a bucket (2026-08-25, A4).** Owen hoped a scenario could find its
  way out of an "(other)" bucket into a clarified one given enough information, and his
  worked example — a pokeball scenario as a hybrid leaning static clicking — describes a
  MIXTURE, which a hard partition cannot express. The first plan was to ship the freeze's
  varimax loadings; that was wrong, because they are factor loadings and D13 rejected that
  lens for reproducing the carrying playlists. The affinity is measured instead: mean r
  against each community's members, cross-playlist, with a placement only where it survives
  its own standard error and separates from the runner-up. **The rule's refusals are the
  interesting part** — 32 of 135 eligible scenarios sit within a standard error of two
  communities, and those are exactly the hybrids the design wanted to be able to name.
  The ceiling is not the model: 82% of the candidates have no tested pair at all, and the
  operation that lifts it is a lower shared-player floor on the map (median best-pair n is
  41 against a shipped floor of 100), which is local compute and leaves the D12 freeze
  untouched.

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

2026-08-22 (late):

- **D13** (Claude's call on the evidence, open to Owen's reversal) — the D12
  freeze `ed89927b…` and its comparison are on record. Proceeded with the
  PSD-repaired zero-filled matrix because its repair distance (0.305) matches
  the permutation null through the same pipeline (0.315): the distance is
  sparsity, not inconsistency. The page ships the **community lens** (γ 1.0),
  because the factor lens reproduced the carrying playlists (ARI 0.824 on the
  then-current `ed89927b` freeze; **0.619** on the shipped `c9026a95` — the
  number a reader auditing this against `dev/emergence-comparison.json` will
  find, see amendment (1)) and
  shipping playlist co-membership as "skill clusters" would mislead. **Naming
  clusters remains Owen's decision**, pending his reading of
  `dev/emergence-comparison.json` — reading order: agreement tables with their
  pack baseline and p-values, then the divergence list, then (separately, as a
  proposal) candidate names.
  **AND THE NAMES ARE CLOSED TOO (2026-08-26, step 34): they will NOT be ratified, ever, and that
  is the decision rather than a deferral.** A community id is freeze-local — `c:1` was
  *tracking · switching* under `ed89927b` and is *tracking · reactive* under `c9026a95` — so a
  ratified name could not survive the next re-freeze, and the record would then carry a name that
  means two things. What IS ratified is the RULE step 23 derived: the term count comes from whether
  the first term already identifies the block, and any second term is chosen by LIFT over a mass
  floor rather than by frequency. Names are output of that rule, recomputed per freeze, and the
  freeze-local id is the part that carries identity. **This item leaves the open list.**
  **PROMOTING STRAFE (R6/R7) IS CLOSED** (2026-08-26, Review Ledger VI step 29) —
  on evidence rather than by a ruling, and on the owner's own pre-stated condition
  *"promote if the emergence analysis separates it"*. The basis quoted above does
  not exist in the shipped freeze, so the question was re-derived before being put
  to him: `strafe` is 58 scenarios, 42 with no cluster at all and 16 placed (12 in
  `c:1` *tracking · reactive*, 2 in `c:5`, 2 provisional); `evasive` is 172 with 123
  unclustered and the rest scattered over five communities. **The condition is not
  met**, so it closes without a preference being needed. Naming is the only open
  half of D13.
- **D13 amended** (2026-08-26, Review Ledger V step 18) — **the naming rule stays
  data-derived and UNRATIFIED, and that is now a decision rather than a backlog
  item.** A block's displayed name is its members' two most frequent curator
  labels plus its id (`tracking · control (c5)`), computed from the data every
  time the freeze changes. It is deliberately not a name: a name asserts what a
  cluster *is*, and the only thing that has been measured is what its members
  are *called* by curators who never saw the map. Three things follow.
  **(1)** The freeze D13 was written against is superseded — `ed89927b…` was
  re-run on 2026-08-25 as `c9026a95…` (7,703 players × 1,158 scenarios, γ 1.0
  → 8 communities), and putting the residual on the logit moved the shipped
  lens's ARI against the mechanic taxonomy **0.221 → 0.393** while its ARI
  against pack fell 0.141 → 0.067. **The factor lens was re-measured on the same
  freeze and it moved the other way — recorded here because it is the figure that
  moved AGAINST this decision, and the first version of this amendment refreshed
  only the two above:** ARI vs playlist **0.824 → 0.619**, vs mechanic 0.079 →
  0.117. So the factor lens is less playlist-bound than it was, and D13's
  quantitative ground for rejecting it is weaker than the body's 0.824 implies —
  but 0.619 still reproduces the carrying playlists more than anything else, and
  0.619 against the community lens's 0.050 is not close. The community lens is
  more defensible than it was when the decision was taken, not less; the margin
  is what narrowed.
  **(2)** Ids are freeze-local and every served item now carries `blockEpoch`,
  so a ratified name could not survive a re-freeze anyway without the record
  saying which epoch it belonged to.
  **(3) Where a name would go, the evidence goes instead.** Step 5d's
  mis-assignment diagnostic is the closest thing to a naming argument the data
  has produced, and it is recorded here rather than resolved: of 380 judgeable
  stable members, **18 (4.7%) would move** under the project's own placement
  rule, and the residual is not scatter — **ten of the eighteen leave `c:1`
  (*tracking · reactive*) and every one of them prefers `c:4`
  (*switching · speed*)**. Named, they are all target-switching scenarios:
  `psalmTS Voltaic` (+0.096), `VT evaTS Novice` (+0.086), `VT psalmTS Novice`
  (+0.073), `VT psalmTS Intermediate` (+0.062), `VT psalmTS Advanced` (+0.054),
  `VT bounceTS Novice` (+0.040). The largest single mover, `VT DotTS Novice
  S5`, has a home affinity of **−0.006 over 14 pairs** — essentially no
  measured relationship to its own community at all. **That is a checkable
  statement about a boundary, and it is what a name would have to survive.**
  4.7% is too few to re-run the protocol over and the misplacement is
  concentrated in one interpretable place, so the freeze stands and the naming
  question stays open with its evidence attached.
  **(4) On `-Rerun` and `frozenBeforeComparisonExisted: false`.** The shipped
  comparison records that its freeze did NOT predate the comparison script, which
  reads like a weakened protocol and is not one. The blind/compare separation
  exists so labels cannot reach the blind stage; `-Rerun` is a path
  **pre-registered in `emergence-compare.ps1` before any re-run existed**, and
  guard 2b independently verifies the blind script, the core and the lib against
  the hashes the freeze itself recorded — proved by tampering, one appended
  comment line is refused. So the property actually held is STRONGER than
  "frozen first": the code that produced the freeze is byte-identical to the code
  the guard checked. No re-blind is warranted; what the record needed was this
  paragraph.
- **D13 amended again** (2026-08-26, Review Ledger V step 23) — **names stay
  data-derived and unratified; the RULE that derives them is now derived too.**
  The old rule took the two most frequent curator labels, always. Measured, that
  was not a description: bootstrapping each block's own members 2,000 times, the
  FIRST term is stable (c:1 P = 1.00, c:4 P = 1.00) and the SECOND usually is not
  — c:5's `tracking · control` survived at **P = 0.28**, its second word an
  **exact 12%/12% tie** with `switching` decided by alphabetical order, while
  c:0's *first* word rested on 1.6 percentage points across 24 effective labels.
  Two things are derived now.
  **TERM COUNT** — a second term is added only when the first fails to IDENTIFY
  the block, i.e. another surviving community shares it. c:4 is 58% `switching`
  and a second word carried nothing, so it has one.
  **TERM CHOICE** — when a second term is needed it comes from **lift** (share
  here over share pooled across blocks), not frequency, because frequency picks
  what is common everywhere: `tracking` leads both c:1 and c:5 and separates
  neither, while `control` is **7.4x over-represented** in c:5. It must also
  cover 15% of the block's MEMBERS — lift alone selects whatever is exclusive
  however thin, and c:1's highest-lift label rides 12 of 140 members. Where
  nothing clears the bar the name says the block is **broad** rather than
  inventing a term.
  Effect: `static · clicking` → **static (c0)**, `switching · speed` →
  **switching (c4)**, while c:1 and c:5 keep their text and acquire a measured
  reason for it. **Two names lose a noise term; none gains an assertion.** The
  names remain unratified and freeze-local, so points (1) and (2) above stand
  unchanged, and a served item still shows the name it was served under.
- **D14** — no range-restriction correction on the transfer map (the W6
  diagnostic above); the sample caveat is the measured median, printed from
  the data, never a literal.
- **D15** — the overlap page's thresholds are knobs, not findings, until Owen
  ratifies them. **Amended twice since, and both halves of the original sentence
  had gone stale.**
  **(a) The values drifted.** The cohesion floor is **0.075**, not 0.10: step 5c
  measured cross-playlist cohesion at a median 0.748 of the all-pairs figure and
  moved the floor by that ratio — the same stringency read on the smaller scale.
  The matrix floor moved 0.05 → 0.0375 with it. `cut` (0.25) and the unrelated
  ceiling (0.15) did NOT move, and deliberately: step 15 settled that a threshold
  on a statistic OF THE FILTERED SET is rescaled and a threshold on a SINGLE PAIR
  is not. Step 26 made the floors mode-aware, so `xp=0` gets the all-pairs 0.10
  it was calibrated for rather than the cross-playlist 0.075.
  **(b) "Shown as controls" was false of one of them.** The tested floor of 30 has
  no selector and no URL parameter, and it gates the COACH's blocks as well as the
  page's walk. Step 26 measured it: the block set the coach routes into is
  **invariant for T in [18, 265]** — a factor of 14.7 — and the page's kept set is
  invariant across the whole sweep, 10 to 400, in both modes. All it moves is which
  groups are called "too thin to place". **So it does NOT become a control**: a
  selector for a knob that changes nothing implies a contestability the measurement
  denies. **RATIFIED AT 30** (2026-08-26, the owner's ruling, on step 26's invariance
  measurement) — recorded as the owner's act, which is what this decision's opening
  sentence requires and what an earlier draft of this amendment asserted without it.

2026-08-25 (Review Ledger III):

- **D16** (Owen delegated the call: "whichever you think will lead to me improving
  most efficiently — your call as the statistics expert") — the competency metric is
  the **board-calibrated** percentile, and its reference population is the **sampled
  training population** (players reached at stratified ranks on 24 anchor boards),
  not everyone who ever loaded the scenario. The coach never needs an absolute rank;
  it needs "is this scenario weak *for me* relative to my others", which is a
  residual — and that residual is already the transfer map's own definition of skill,
  so one quantity now serves both. The caveat is written into the data file, and the
  raw board rank stays on the page beside the calibrated one, because it is what a
  player can check for themselves.
- **D17** — a coach that ranks on a calibrated number must not *also* shrink by
  `boardConfidence`. That shrinkage was an invented `log10(n)/4` proxying the very
  bias the offsets measure; applying both puts a board-size term back into the
  ranking the calibration just removed. Board size is displayed, never silently mixed
  into the number. Where no offsets are stamped the old shrinkage still applies, so
  an older build is unchanged — the same "identity without its evidence" rule the
  v0.4 layers follow.
- **D18** *(NOT Review Ledger V's D18, which is a queue id for step 11's precision-aware pooling — see the note above D25)* — the session composes by TYPE, not by one template. Four purposes with stated
  triggers (collect / breadth / transfer / floor), priority in that order, and never the
  same alternating type three days running. Within the weakest slice the choice is a
  weighted draw rather than the argmin: D1 ratified floor-*biased* and explicitly not
  strict maximin, so sampling is the objective read correctly, and it is what stops every
  session looking identical. Opt-in (`opts.rotate`), so every earlier path is unchanged.
  **AMENDED 2026-08-29 (step 45): the anti-repeat had been INERT since step 8, and is now
  wired.** `recentSessionTypes` read the session log, and step 8 removed that log's writer, so
  `chooseSessionType` received an empty list and the "never the same type three days running"
  clause could never fire. On the owner's record the type therefore froze on `transfer` — the
  one type carrying route weight 4 of 10 — which compounded with the route defect below into a
  single behaviour: the coach sat permanently in the type whose defining slice could not be
  served. The serving's type is now stamped on the append-only served ledger and read back
  DAY-BASED (the first serving of each day). **The unit is the whole fix**: the old log held one
  row per DAY and the ledger holds one per SERVING, so a naive port would compare consecutive
  servings of the same day, satisfy `recent[0]===recent[1]` on nearly every read, and degenerate
  this rule into "flip every time" — perfect alternation that reads as success on any day-share
  bar. Measured over 40 simulated days (`dev/queue-readers.json`): the modal type holds **37/40
  before and 26/40 after**, against a bar of 30 committed before the estimator existed.
- **D19** *(NOT Review Ledger V's D19, which is a queue id for step 11's proposal to unify the shown and drawn intervals, which was REJECTED — see the note above D25)* — the return-collect rate is always reported against the **1/(n+1)** null model
  (the chance of a first-try PB if nothing had changed), scored with Brier and a skill
  score, and is NOT scored at all under 20 resolved revisits. A KPI that cannot come out
  negative is not a report card; a KPI reported on five samples is noise. Both caveats on
  the baseline — attempts are not exchangeable, and the attempt count under-counts — push
  it upward, against the coach, and are printed rather than buried.
- **D20** *(NOT Review Ledger V's D20, which is a queue id for step 12's feel rating — see the note above D25)* — a scenario is placed in an emergent block only by a decisive MEASURED affinity
  (mean r against that block's members, cross-playlist, surviving its own standard error
  and separated from the runner-up). A tie between two blocks is recorded as a hybrid and
  left unplaced; "unplaced" and "unmapped" are distinguished, because one is a statement
  about the scenario and the other is a statement about our coverage. The freeze's factor
  loadings are NOT used for this: D13's reason for rejecting that lens applies with equal
  force to using it as a mixture.

2026-08-26 (Review Ledger V and VI):

**D21 THROUGH D24 ARE DELIBERATELY SKIPPED.** Review Ledger V used those four numbers as its own
queue ids, in the same `D<n>` namespace as these ratified decisions. They are identified here by
the STEP HEADING THAT CITES THEM, which is the only sourced definition of them that exists — the
ledger never spells out what each id meant:
  D18, D19 → Ledger V step 11 (precision-aware pooling; D19 was the proposal to unify the shown
              and drawn intervals, which that step REJECTED on a pre-registered bar)
  D20, D21 → Ledger V step 12 (the feel rating and the difficulty window, shipped as one controller)
  D22, D24 → Ledger V step 10 (the transfer trigger BUG-2, and release #3)
  D23      → Ledger V step 16 (the CSR pair index, deferred at 16 MB against a 30 MB bar)
Three of them collide with real entries here, so a reader following a ledger heading lands on an
unrelated decision. Renaming thirty references across the ledger would risk conflating the two namespaces further, so the numbering
jumps instead: **no number in this file will ever mean two things.** Ledger queue ids are not
decisions and do not belong in this sequence.

- **D25** (Review Ledger IV step 6, MET-6 + INTENT-3) — **the pooling weight IS the measured ICC,
  and the number on the page stays unpooled.** Under the one-factor reading a block already
  assumes, the correlation between two members is the share of one member's variance that is the
  common skill — so a block's cross-playlist cohesion *is* its intraclass correlation, and nothing
  new had to be estimated. `poolToward(value, group, icc)` pulls a standing that far toward its
  block and is the identity below `POOL_MIN_ICC`. Measured 0.077 to 0.232 across the shipped
  blocks, median 0.135 — the D12 communities running about twice the label blocks, which is an
  independent argument for the community lens. **The percentile shown on the card is the one you
  can check against the KovaaK's leaderboard; the pooled value is what the order used, carried on
  the item rather than hidden.** Per-skill confidence is the same number through Spearman–Brown.
  **AMENDED by Ledger V step 11 — the ICC alone is no longer the shipped weight.** It is now
  composed with an empirical-Bayes term `τ²/(τ² + s²)` carrying how well *this* scenario is
  measured (`pooling: 'eb'`, the default in `src/engine.js`); pooling by the ICC alone survives as
  the selectable `icc` mode. **This is composition, not double-shrinking:** the two weights
  commute, so either order puts weight `(1−icc)·w` on the scenario's own reading and the rest on
  the block, and at `w = 1` it is exactly this decision. The ICC remains the estimand half of the
  weight, and what step 11 added is a precision half. That step also breached D26 in doing so, and
  that breach is still open — a step-32 closure was written and retracted the same day, and D26
  records why, which is more useful than the closure would have been.

- **D26** (Review Ledger IV step 7b, MET-7) — **a borrowed number may be SHOWN but must not STEER.**
  A scenario played once has no observable run scatter, so its interval is imputed from the
  profile's median CV. That interval belongs on the page, because a scenario played once genuinely
  is not pinned down and the page should say so; it does **not** enter the draw, because it is not
  evidence about *that* scenario. The estimator itself does not change: swapping the PB for a
  smoothed statistic was measured out of sample and beaten by the PB wherever the grind is real.
  **NARROWED AND CLOSED (2026-08-26, step 34), on the measurement rather than on an argument.**
  The history is kept because the way this went wrong twice is the useful part: step 11 recorded a
  breach, step 32 wrote a closure whose mechanical claim was FALSE and retracted it the same day,
  and step 33 measured the thing that actually decides it on a bar committed first.

  **What the measurement says.** Sweeping the borrowed CV across the full per-scenario plausible
  range [0.0383, 0.2031] moves the served weakest set by a worst Jaccard of **0.279** against
  **0.393** for the seed alone — so on the harshest reading the borrowed constant decides more than
  the sampler's deliberate randomness does. But the effect is monotone in distance from the measured
  value, and across **±50% of it (0.05–0.10) the CV channel reads 0.379–0.400 — level with seed
  noise.** The profile median is a median over ~404 scenarios, so its own estimation error is far
  inside that band. **The borrowed number's ESTIMATION ERROR is immaterial; what is material is the
  conceptual stretch of one constant standing for a quantity that varies 5.3× across scenarios.**

  **The rule, narrowed to what the evidence supports.** The two uses of a borrowed number came apart
  when measured, and the split is not a matter of taste:
  * setting the **value shown**, or the **width the order is DRAWN from** — measured and HARMFUL
    (D19 pushed the single-run share of served slots to 80.9%, worse than the 74.2% it started at).
    **Still forbidden.**
  * entering a **precision weight** — measured and HELPFUL (the ordering's split-half reproducibility
    rose 0.7311 → 0.7726). **Permitted, and it carries an obligation: its sensitivity must be
    measured against the seed channel and RECORDED on this entry.** That obligation is not
    decorative — it is what turns "a borrowed number may steer if it is only about precision" from
    the open category it would otherwise be into a claim with a number attached.

  **The recorded sensitivity, which is the obligation discharged:** immaterial over the estimation
  range, material at 2–3× the measured value. A reader now knows exactly how much of the served set
  is attributable to that constant instead of having to trust anyone's reading of the code.

  **The τ² channel is INSIDE that measurement, and step 33 said otherwise.** `cvOverride → runCv →
  runSampleSpread → ownErrorFull` feeds **both** `ebWeightOf`'s `s` **and** the set Paule–Mandel
  solves τ² over, so the sweep already priced the borrowed constant's effect through both paths.
  Step 33's caveat that "τ² is not tested here" was too conservative and is corrected.
  **Whether borrowed errors belong in τ² at all is a separate question, and it is settled on step
  11's own reasoning:** they are in because Paule–Mandel WEIGHTS by `1/(τ²+s²)` rather than
  averaging, so a borrowed error is downweighted (roughly 0.18 of a measured one's weight at the
  median imputed sd) rather than excluded; the alternative — estimating τ² over the multi-run subset
  — buys range restriction, because the scenarios you repeat are the ones you have converged on.
  Step 11 chose PM precisely to avoid needing that subset. **Kept.**

  **`mSe` is the same class and is covered by the same rule.** The 217 board-size-estimated offsets
  carry one shared constant and 46 played scenarios have neither an offset row nor a curve. That is
  a data-COVERAGE fact, not a design choice, and its effect is self-limiting: those rows carry a
  large error either way, so they shrink hard toward their block — which is the correct answer for a
  scenario with no curve behind it. **No change.**
  Step 11's other exit is still closed — step 21 rejected the n-standardisation — and **neither
  step 29 nor D30 bears on this**: they settled the estimand (PB-rank), a different question.
  drawn intervals, was rejected in step 11 on a pre-registered EMPIRICAL bar, not on this
  principle; it upheld this rule rather than breaching it, and it is not the same D19 as anything
  in this file — see the note above D25.)*

- **D27** (Review Ledger V step 12, INTENT-1 + INTENT-2) — **the feel rating and the difficulty
  window are ONE controller**, because the rating had no consumer and the window had no input.
  One tap on the open item, written into the served ledger rather than into a preference; three of
  a kind in a row move the rung target; an unrated exposure does not break a streak (a question
  never asked is not an answer) but "about right" does; a fired streak is spent; "too hard" is a
  third exit tested LAST, so a PB or an earned stagnation stop always wins. **`FEEL_ADJ_MAX = 2` is
  a POLICY bound, not a measured one** — an earlier draft justified it by a difficulty effect that
  did not survive selection correction, and that justification is retracted. The controller ships
  as the only instrument that can ever measure the difficulty term on-policy, since the record
  contains no coach-served item above level+1 at all.

- **D28** (Review Ledger V step 19) — **a ranking change is judged by a four-leg criterion, and rank
  statistics are diagnostics rather than bars.** Step 11 shipped on three bars, two of which are
  *maximised by information destruction* — demonstrated, not argued: the degenerate "every member
  reads as its block standing" transform beats the shipped rule on split-half rho. The legs are
  SCALE (the key's spread against `EXPLORE_SD` — the only leg that looks at the quantity the
  sampler actually prices against, because the coach subtracts fixed-magnitude bonuses; it and THE
  SERVED SET are the two legs a rank statistic cannot see, which is why BOTH were added after
  `squash` — eb's exact ordering, linearly compressed — defeated the first version by scoring a
  perfect 1.000 on a rank leg while serving 111 scenarios to eb's 35), RESOLUTION, THE SERVED SET, and INJECTION across a
  grid containing worlds the rule is wrong in. **Failing any one is a rejection, not a discussion.**
  Its stated limit: it compares rules sharing an estimand and cannot adjudicate between estimands.

- **D29** (Review Ledger V step 22) — **the exhaustion rule's null is calibrated by its THRESHOLD,
  not by a second parameter.** `n/(n+k)` is exactly the λ = 1 member of a family with per-run hazard
  `λ/(n+j)`, and λ measured 1.333 [1.218, 1.433] on the owner's record. It still does not ship as a
  dial: over the n the record contains the threshold family expresses 3,130 distinct stopping
  schedules and the λ family 50, so **the knob that already exists is strictly more expressive**.
  λ lives in the engine as a measured option defaulting to 1, the way `squash` lives in the pooling
  modes — a criterion needs candidates to be checkable against.

- **D30** (Review Ledger VI step 29, the owner's ruling) — **"weakest" means WHERE THE PERSONAL BEST
  RANKS**, not where skill ranks at a run count everyone shares. This is the estimand steps 19 and
  21 both terminated on. It closes the n-standardisation on *definition* rather than only on
  measurement: it answers a question the coach does not ask. **It does NOT settle the other estimand
  axis** — a scenario's own standing versus its block's common skill — which D25 assumes and D28's
  criterion cannot adjudicate. That one is open.

- **D31** (Review Ledger VI step 29, the owner's ruling: *"let's go with aggressive, we could adjust
  this later if I don't like how it feels"*) — **`STAGNATE_AT` is 0.685.** At 0.6 the rule
  advertised "stop when the chance you have not beaten it yet falls to 0.6" and stopped at about
  0.51, because the null it computes that from is mis-calibrated by D29's λ. 0.685 and not 0.684:
  the plain thresholds reproducing λ̂'s integer schedule — with the λ rule run at the 0.6 the rule
  was then advertising — form the half-open interval **[0.684211, 0.6875)**, width 0.0033, and a
  round 0.684 falls *below* it while 0.6875 is the first value above it. *(Published as
  [0.684211, 0.685855] until 2026-08-26: that upper figure is the band's MIDPOINT, so the width
  read half its true size. `dev/figures.json` checks both edges against
  `dev/hazard-lambda.json`'s `rename.decisionBand` now. 0.685 is inside either way.)* **Cost, measured:** items closed before a PB the play went on to get, 6.1% → 8.1%; PBs
  reached 550 → 525. **The 25 given up are 0 run-1, 17 run-2 and 8 run-3+, worth a median
  +5.05% and +1.57% against a first-run PB's +6.23%** — so the run-2 ones are worth about
  **four fifths** of a first-run PB and the run-3+ ones about a quarter.
  *(Measured at step 31 by replaying 0.6 and 0.685 over the same bouts and diffing them
  (`dev/hazard-lambda.json` `/givenUp`). Every earlier statement of this cost — this entry's
  first version, the engine comment, and step 8's original "the PBs an aggressive rule gives up
  are the small ones" — quoted +3.12%/+2.15%, which are the medians of the 51 and 6 PBs the rule
  still REACHES. That is a different and systematically lower population, because the ones it
  stops reaching are the later ones. The move costs more than the record has ever said: the
  run-2 half is worth four fifths of a first-run PB, not the third originally claimed nor the
  half its first correction claimed.)* The decision stands and is reversible by design.
  **Consequence:** the form test now fires zero times on this record, because exhaustion always
  reaches the bar first. Reversible by design.

- **D32** (Review Ledger VI step 25, extended at step 29) — **a check nobody runs and a figure nobody re-derives are both
  claims that have stopped being claims.** Every test and instrument must be reachable *from a
  runner*, and `test/*.js` from both CI workflows separately — a grep for a filename is not
  reachability, since `emergence-selftest.ps1` was named in four comments while nothing invoked it.
  Every figure quoted in code that steers behaviour is checked against the artifact that produced
  it (step 25). **Step 29 added the second half after the first half passed on a stale artifact:**
  the artifact must itself have been generated under the shipped configuration, because a comment
  and a superseded artifact agree with each other perfectly while both describe code that has
  moved. Anything deliberately not run is declared with its reason, and that list is meant to feel
  expensive.

- **D33** (Review Ledger IV step 3, NEXT-4; ratified at Review Ledger VI step 29) — **a quarter of
  revisit picks are RANDOMISED, and nothing rendered says so.** It exists because every other
  measurement here is *the coach said X, you played X, here is what happened* — which can never
  separate a good recommendation from improvement you would have made anyway. D26's calibration
  says whether the forecast's probabilities are honest; it cannot say whether the ORDERING beats
  serving something else. That needs a counterfactual, and this is the only one in the record.
  `ARM_B_SHARE = 0.25` of revisit slots **withhold** the coach's top pick and serve the runner-up
  (`ARM_MIN_PER_ARM = 10` resolved items per arm before a verdict). **It DISPLACES rather than
  reorders** — swapping ranks 1 and 2 serves both and measures nothing, so the top pick has to be
  held back; it stays in the pool for tomorrow. **Revisits only**, because a revisit resolves in
  days against an exact `1/(n+1)` null while a route's claim is about a different scenario weeks
  later. **Blinded** until an item resolves, because knowing would make the comparison measure
  belief as much as ranking. Judged on excess over baseline, never raw rate: the arms draw
  different `n` by construction.
  It is **ON by default** (`armEnabled()` in `src/app/10-stores.js` is true unless an opt-out key
  is set) **and step 29 ratified that it stays ON in the public template**, which it reaches at the
  next release. So D11's return-collect KPI and D27's rung record must both be read against a coach
  that does not always serve its best pick — which is exactly why this belongs in the log rather
  than only in ledger prose: read without it, the behaviour looks like a bug.
  **In the same ruling the owner downgraded the constraint behind the question**, in his words:
  *"I no longer care about users having their data overwritten. I only gave the tool to one person
  and they have not used it at all yet."* Other template users stop being a weight on FUTURE
  decisions. **It retracts nothing already built for it** — the reset clearing the served ledger,
  the store prefixes, the personal-string guards are all correct on their own terms.

- **D34** (Review Ledger VI step 32, the owner's ruling: *"the coach should operate mostly based on
  floor, which if there is only one run then unfortunately that is the only data point you have to
  draw conclusions from"*) — **the floor is the objective, so the composition of the served set is
  a DIAGNOSTIC and never a target.** Step 11 set out to move the single-run share of served weakest
  slots toward the pool's base rate, on the reasoning that the base rate is the neutral thing to
  aim at. That was assumed and never decided, and it is now decided the other way: the coach serves
  the floor, and whatever share of one-run scenarios follows from that is a consequence to be
  reported, not a number to be steered toward.
  **Step 11's criterion (b) is therefore RETIRED as a bar** and survives only as a printed
  diagnostic. **It is retired because its TARGET was never decided, and now has been decided to be
  the wrong thing to aim at — not because it fails on measurement.** That distinction was got wrong
  in this entry's first draft, which said step 19 had shown (b) maximised by information destruction
  on the real pool. It did not: step 19's collapse-wins result is criterion (c) (split-half rho:
  the degenerate 0.7983 against eb's 0.7726), and step 19's own artifact measures (b) the OTHER way
  — served single-run share eb **0.531** against the degenerate's 0.322 and `squash`'s 0.351, on a
  base rate of 0.550, so on (b) the degenerate is rejected. What is true is that step 11's own
  adversarial read argued (b) is gameable by collapse, and that step 21 found most of what it
  measures is a mean-channel effect rather than the winner's curse it was named for. A bar nobody
  can state the target of is not a bar.
  **What this does NOT do is discard a thin reading.** The one data point is used: D25 keeps the
  page showing the scenario's own unpooled percentile, so the floor is always visible. What is
  pooled is the ORDER, and only by how well-conditioned the percentile readout is at that score —
  see D26, where that quantity turns out to be a property of the population curve rather than of
  the single run. If the ordering should follow the raw floor instead, that is `pooling: 'none'`,
  one selectable mode away, and it is measured: **85% of weakest slots go to one-run scenarios**
  under it, against 53% shipped and a 55% base rate.

- **D35** (Review Ledger VI step 32, the owner's ruling: *"Percentile drives interpretation and
  score can give extra context. Though score is mostly only relevant to a player trying to rank up
  a benchmark"*) — **the calibrated percentile is the interpretive unit; a raw score is context.**
  This settles which number a decision gets priced in, which had never been stated even though the
  two units disagree. It sits directly under D30: the estimand is where the PB ranks, and *ranks*
  is a percentile.
  **Applied immediately, and it did not change a decision but it did change a figure.** D31's cost
  had only ever been priced in score percent. Re-measured in percentile points
  (`dev/hazard-lambda.json` `/givenUp/pctGainMed`, `/replay/base/pctGainMed`): a PB the rule reaches
  is worth **+9.33 / +5.20 / +3.00** points by arrival run, and a PB the 0.6 → 0.685 move gives up
  is worth **+6.99** (run 2) and **+2.22** (run 3+), **+4.05 overall**. So the 25 given up are worth
  **0.43** of a first-run PB in standing against **0.36** in score — the units disagree, percentile
  makes the trade look slightly DEARER, and the ratified setting survives the re-pricing. Recording
  that it survived matters as much as the number: the decision was taken on the other unit.
  **Where score legitimately leads is the benchmark ladder** — a tier threshold is a score, so
  "what do I need for the next rank" is a score question and the detail pages answer it in scores.
  Everything the coach ranks, orders or reports a gain in is percentile.

- **D36** (Review Ledger VI step 34) — **the estimand is THE SCENARIO'S OWN STANDING. Pooling toward
  the block is variance reduction on a noisy estimate of it, NOT a claim that the block is what is
  being measured.** This is the second estimand axis, open since step 19 and left open by step 29,
  which settled only PB-rank versus skill-at-a-shared-run-count.
  **It follows from two rulings already made rather than from a new argument.** D34 says the coach
  operates on the FLOOR, and a floor is a property of a scenario, not of a block. D30 says "weakest"
  means where the PB ranks, and a PB is a scenario's. D25 already shows the scenario's own unpooled
  percentile on the card. Every visible commitment this project has made is per-scenario; only the
  *justification* for the pooling was ever phrased as "the coach wants the block's common skill".
  **What changes is that phrasing, not the code.** `poolToward` and the empirical-Bayes weight both
  stay exactly as they are. What they are FOR is now stated correctly: an ICC of 0.135 says a single
  standing is a noisy read of a quantity its block-mates also carry, so pulling it 13.5% toward the
  block reduces the variance of the estimate. That is a shrinkage coefficient, not an estimand.
  **The payoff is that D28's criterion stops being structurally blind.** Step 19 recorded, as a
  limitation, that its criterion scores per-scenario recovery while step 6's argument wanted block
  skill — so it "can compare rules sharing an estimand and cannot adjudicate between estimands", and
  any future candidate touching the ICC factor had no instrument that could judge it. With the
  estimand settled as per-scenario, **the criterion is measuring the right thing** and that
  limitation is discharged rather than inherited.
  **What was NOT done, and why.** The alternative ruling — the block's common skill — would have
  implied deleting the ICC factor is wrong, and step 19 expected a per-scenario criterion to prefer
  that deletion. That expectation was never measured: `pooling: 'eb'` composes the ICC pull with the
  EB weight, and no mode isolates "EB without the ICC factor". Building one would be a ranking
  change needing the four-leg gate. It is not built, because this ruling makes the ICC factor a
  variance-reduction term whose magnitude is already measured (0.077–0.232 across the shipped
  blocks) rather than a contested claim about what the coach is estimating.

- **D37** (Review Ledger VI step 36, on the owner's first feel report from real use) — **an item
  gets at least TWO runs this visit before exhaustion may close it.** `STAGNATE_MIN_K = 2`.
  The report: one non-PB run on a one-prior-run scenario and the queue moved on. That is the rule
  as ratified — `n/(n+k) = 1/2 ≤ 0.685` fires at k = 1 for every n ≤ 2, and it fired at the old 0.6
  for n = 1 too — so this is not a bug in D31 and not the threshold move's fault. It is the feel
  adjustment D31 explicitly reserved (*"we could adjust this later if I don't like how it feels"*),
  taken under delegation, measured first on the committed replay (`dev/hazard-lambda.json`
  `/minKFloor`): the floor recovers **48 PBs** (525 → 573) and **halves the early-close rate**
  (8.1% → 4.2%) at the cost of one extra run on items that stop; k ≥ 3 recovers 76 but guts the
  rule (321 → 114 stops), so 2.
  **It recovers exactly the 48 run-2 PBs the threshold move had given up** — rule-reached arrival
  468/51/6 back to 468/99/6 — so the shipped operating point now costs *less* than the old 0.6 did
  without it. A **policy** bound like `FEEL_ADJ_MAX`, not a measured constant: the aggressive
  threshold stays, and what changes is the minimum evidence per visit before it may act. Anytime
  validity untouched (the events `{no PB by k}` stay nested; a floor only lowers P(ever stopping)).
  The form test and the "too hard" exit are deliberately NOT floored — form needs `minHistory`
  anyway, and a rating is the player speaking. A first-run PB still closes at k = 1: the floor
  delays only exhaustion.
  **D31's and D35's recorded figures are unchanged in meaning**: they priced the threshold decision
  pre-floor, and the artifact keeps that variant under `/noFloor` so their guarded figures
  reproduce instead of silently changing under the same pointers.

- **D38** (Review Ledger VI step 37) — **nothing unattributed is ingested.** Between 2026-08-07 and
  08-20 an online sync channel absorbed ANOTHER PLAYER'S daily sessions into the owner's record —
  195 runs across 41 scenarios, 23 of them becoming the stored PB, each a phantom target the queue
  then served. The rule this closes on: every ingested event that carries an owner field is checked
  against the account (the activity feed carried `username` all along and the client never read
  it); a channel whose rows carry NO identity — `last-scores/by-name` — gets its proven damage
  quarantined, embedded in the personal build, and enforced as a STANDING input filter, because an
  append-only store never heals and an old export would otherwise resurrect the foreign rows.
  Repairs go LOW deliberately: a lowered legit score self-heals through the steamId-keyed weekly
  channel and the owner's own play (measured: 11 re-raised immediately, three quarantine entries
  cleared as verified-real by that channel), while a foreign high never heals. The template ships
  an empty repair table, asserted in CI — the quarantine names run history that is not the user's.

- **D39** (2026-08-27, the owner's call) — **the QUICK-WIN purpose is retired from the coach.**
  The owner: *"I don't think quick wins or any purpose card matters anymore. This is probably
  carryover from the 10 playlist format we moved away from... I'm not sure how it being close to
  a benchmark rank tier relates to our approach of working at skill floors."* He is right on the
  design's own terms: tier-proximity ("76% of the way to the next tier") is benchmark-ladder
  logic — D35 says score is the unit for a player chasing a RANK — while the coach's objective is
  the FLOOR (D34). The two aims conflicted in the same slot. The purpose's weight moves to
  WEAKEST in every template and session type (floor 7/1/0/2, transfer 4/4/0/2, collect 4/1/0/5,
  breadth 4/1/4/1; bands low 5/2/2/1, mid 6/2/1/1, high 7/1/0/2 — all still summing to 10), per
  D34: the marginal slot goes to the floor. The Home "Quick wins" panel STAYS — that surface IS
  the benchmark ladder, where tier-proximity is exactly the right statistic. Historical served-
  ledger rows with `why: 'quickwin'` keep rendering; the fixture asserts the purpose is never
  served again. The session snapshot was re-blessed deliberately: one line changed — the
  quickwin item left and a sixth weakest entered.

- **D40** (2026-08-27) — **difficulty STAYS on the labeled nine-rung system; the emergent
  candidate was measured and failed its pre-registered bars.** The owner asked for difficulty
  derived from population data the way the blocks were, with the name/label derivation kept as
  the basis and reference. Run as a full research step: pre-registration committed before the
  estimator (`dev/STEP40-PREREG.md`), adversarially reviewed by 33 agents BEFORE running (28
  findings, 11 survived — among them: the original level(p) was the board-confounded raw
  percentile A1 retired, fixed to the calibrated one; an R3-style untrained-crowd control was
  added as a bar; the estimand was pinned — crowd level identifies WHO CHOOSES to play a
  scenario, not what it demands). The candidate: crowdLevel(s) = median board-calibrated level
  of the sampled players who play s, blind to every label and name.
  **Result over 964 dually covered scenarios (`dev/difficulty-emergence.json`): SIGNAL passes
  (Spearman 0.533, p 0.0005) and STABILITY passes (split-half 0.918), but the UNTRAINED-CROWD
  CONTROL fails — 47.3% of the correlation survives among players who never trained a carrying
  playlist, against the pre-registered 50% floor — and SHAPE fails with two adjacent inversions
  (Int+ dips below Int at n 18; Hard+ sits BELOW Hard at n 70).** So about half of the ladder
  ordering in crowd composition is the labels ROUTING players, not difficulty revealing itself,
  and the fine-grain structure inverts at the top. The divergence list (434 of 964 at >= 2
  rungs) concentrates exactly where the estimand distinction bites: "Jumbo"/"Larger" variants —
  labeled easy by the modifier table — carry ELITE crowds (0.81–0.90: strong players use them
  as warmups), while "50% Smaller" Hard+ variants carry casual crowds (0.43). The crowd
  statistic measures adoption, not demand. Per the pre-registered outcome 2: nothing ships, the
  artifact and disagreement structure are committed, the labeled rungs stand. Worth keeping
  from the reported columns: threshold attainability (the share of a board clearing the
  curators' lowest tier — an (a)-flavoured signal, rejected as primary for leaking curator
  intent) correlates BETTER with the rungs (0.557) than the crowd does; the within-playlist
  variance share is 0.301, so the crowd scale does carry per-scenario structure beyond
  placement; the variant sign test reads 31 of 46. Re-run trigger: a materially larger player
  sample (the control rested on 739 scenarios), or a demand-side statistic rather than an
  adoption-side one.

- **D41** (2026-08-27) — **within-family emergent difficulty PASSES its bars; the calibration
  and divergence list ship as committed artifacts; whether emergent rungs replace the modifier
  component inside `difficultyRung` is the recorded NEXT decision, taken on a distribution
  comparison.** The owner's design, after D40: keep the nine-rung system as the control, neglect
  the hand-calibrated modifier weights, pair bases with variants by NAME, and compare score
  distributions across the pair alongside the player-spread findings — his direction checked and
  CORRECT with one qualification his own example shows (at matched raw board rank the harder
  `RawControlSphere` out-scores its `Easier` variant because its board is a stronger crowd; at
  matched CALIBRATED level through the committed offsets the family is strictly monotone).
  The statistic: score_s(L) = the committed percentile curve inverted at the board-calibrated
  share for level L; step(v) = mean log2 of variant/base score over L in {0.35, 0.55, 0.75,
  0.92}, negative = harder — a DEMAND-side quantity where D40's crowdLevel was adoption-side.
  Pre-registered and amended before the estimator existed (`dev/STEP41-PREREG.md`, 32-agent
  adversarial review, 4 blocking findings including a sign-inverted ship rule); the bars ran on
  the mechanically-classified NON-CIRCULAR subset only (tier-word suffixes — the modifier
  weights were themselves calibrated from a one-anchor version of this statistic in 2026-08-18,
  so modifier pairs cannot certify it).
  **Result (`dev/difficulty-demand.json`, 426 pairs, 126 bar-carrying over 102 bases): SIGN
  96.1% of bases agree (bar 75%), LADDERS pooled tau-b 0.619 over 41 ladders (bar 0.6 — a
  narrow pass, stated as such), LEVEL-STABILITY 98.4% (bar 80%). All three pass; outcome 1.**
  Calibration: rungUnit = 0.0963 log2 per labeled rung (one rung of difficulty is about a 6.9%
  score ratio at matched level); emergent rungs assigned to 253 variants with rated anchor
  bases; **118 diverge from their labels by >= 2 rungs, and the direction is 85 harder-than-
  labeled against 33 easier** — over all 253, labels UNDER-rate difficulty 124 times and
  over-rate 74, median |shift| one rung. Diagnostics behaved: the grind confound measures small
  (board-ratio coefficient −0.016 log2 per doubling against a rung unit of 0.096), the interior
  sub-grid reproduces the bars (98/102), the estimated-offset co-report agrees (147/153), and
  the circular-ish pairs agree at 80/86 — the hand modifier table was directionally right, and
  is now REDUNDANT where a measured step exists rather than refuted. What does NOT ship yet:
  any change to `difficultyRung` — replacing the modifier component with emergent rungs changes
  what the coach's window serves and is walked through everything that reads it (step 35's
  lesson), on the distribution comparison above, as its own step with the four-leg criterion if
  it moves the ranking.

- **D42** (2026-08-27) — **the difficulty CEILING stays, but its justification on record was
  WRONG and is corrected: the coach does not filter by rung because a percentile above your
  level reads badly (measured and REFUTED), it filters because co-variation between two
  scenarios fades as their rungs separate.** The owner objected to the window on two grounds:
  that the calibrated percentile already prices difficulty so a rung filter double-counts it,
  and that playing hard scenarios helps easier ones so a wide range is good. Run as a full
  research step — pre-registration committed before the estimator (`dev/STEP42-PREREG.md`),
  then adversarially reviewed by 36 agents BEFORE running (30 findings, 25 survived independent
  refutation, **6 blocking**, all six amended into the design). Estimator
  `dev/fit-board-offsets.ps1 -RungBias` (a switch on the fitter, not a second copy: BAR 1's
  half-fit leg needs `Invoke-OffsetFit`, PERF-5), artifact `dev/difficulty-window.json`.
  **THE FIRST BAR WAS UNFALSIFIABLE AND THE REVIEW CAUGHT IT.** It asked whether the calibrated
  percentile correlates with rung within a player. It cannot: `offset[scenario]` is a FREE
  per-scenario intercept fitted as the median over its players, so it absorbs any per-scenario
  mean shift, difficulty included — and holding out PLAYERS does not withhold a SCENARIO-level
  property. Bounded at |r| ≈ 0.02 against a 0.10 tolerance, and the scoping run read the
  calibrated per-rung medians as `+0.0000` at all nine rungs. Replaced by the one channel a
  per-scenario constant cannot express: **the ABOVE-LEVEL CONTRAST**, a player-level × rung
  interaction — each player's median residual on scenarios above their own rung level minus
  their median at or below it.
  **RESULT, over 7,135 sampled players (`bar1.e_aboveLevelContrast`): the reading above a
  player's own level sits +0.69 calibrated percentile points ABOVE their at-or-below reading
  (95% CI upper 0.92, bar 1.0) — PASS, and the SIGN is the opposite of the ceiling's premise.**
  A percentile above your level is not depressed; if anything it is very slightly generous. **J1
  — the measurement justification — is REFUTED**, and it was the justification the product
  printed on every weakest item ("at or under your level, so a high score is reachable"). That
  string is corrected in this entry's commit and pinned negatively in `test/session.js`; nothing
  had pinned it before, because the session snapshot's item serializer carries `{name, why, via}`
  and no reason text at all.
  **BAR 2 FAILS, and that is what the ceiling now rests on.** Over cross-playlist tested pairs
  at n ≥ 100, Fisher-z pooled r by rung distance declines monotonically and crosses zero:
  **+0.0160 (Δ0) · +0.0151 · +0.0134 · +0.0108 · +0.0002 (Δ4) · −0.0067 · −0.0076 · −0.0279 ·
  −0.0478 (Δ8)**, and the pooled |Δrung| ≥ 4 bin is **−0.0097, 95% CI [−0.0138, −0.0057]**
  clustered on scenario — entirely below zero, over 36,026 pairs and 656 scenarios. Not an
  ipsative artefact: MET-5 measured the leave-one-out correction at −0.0009, an order of
  magnitude smaller. So per the pre-registered outcome 3 **the ceiling STAYS, on J2 — co-variation
  — AND ON THE POPULATION RUNG ONLY.** That is a shared-skill prior about how strengths co-vary
  across players, NOT a measurement that practising a hard scenario fails to move an easy one;
  COACH-1 already records that distinction, and the design cannot separate a declining profile
  from the two bins being measured on differently composed crowds. **Whether a wider window is
  more PRODUCTIVE remains unmeasured** — it needs on-policy served-and-resolved records, and
  step 12's difficulty-term estimate had to be taken off-policy precisely because the eligible
  pool contains 0 hard scenarios. The cost the ceiling carries is recorded rather than
  dismissed: on the owner's profile it excludes **36.4% of his curved+rated played pool (427 of
  1,174)**, and the excluded half is on average WEAKER (median calibrated percentile 0.758
  against 0.796 in-window). **Unmeasured, not passed:** the `m = 0` slice bar (1f) had 17 usable
  players against a pre-registered floor of 200, so the 217 board-size-predicted offsets — whose
  share is itself rung-correlated, 23–25% at rungs 5–8 against 5–11% at rungs 2–4 — carry an
  uncorrected shift that this step could not size. Per the pre-registration that routes to a
  precision flag and **never to a ceiling**: a difference in how well a rung is measured is an
  argument about the empirical-Bayes weight (D25), because a filter discards the reading instead
  of discounting it. Re-run trigger: the on-policy record reaching the gate calendar's threshold,
  or a crowd-composition-stratified BAR 2.

- **D43** (2026-08-27) — **the difficulty CEILING is OFF for floor work.** The owner: *"I really
  want for it to be possible for me to be suggested a hard scenario, high score, and then for it
  to be possible for me to be served an easy scenario, and hitting a score in both would be
  considered equally impressive in our case."* That is now the shipped behaviour, and D42 is why
  it is defensible rather than a preference: **J1 — the claim that a percentile above your level
  overstates weakness — was MEASURED and REFUTED** (over 7,135 sampled players the above-level
  reading is **+0.69 percentile points**, 95% CI upper 0.92, i.e. slightly generous). And the
  "equally impressive" half was already true and is now stated: a personal best is scored against
  that scenario's own `1/(n+1)` exchangeability null, which never reads the rung.
  **The split is by what a slice CLAIMS, not by pool name.** WEAKEST, REVISIT, `revPool` (which
  feeds `collectReady`, so the day's TYPE) and the ripening horizon claim only *"this is your
  floor"* — the ceiling is removed there. ROUTES keep it (`routeCheck`, level+1) because a route
  claims that practising Y moves X, and **D42's BAR 2 is the evidence against that across rung
  distance** (cross-playlist pooled r +0.016 at the same rung down to −0.048 eight rungs apart) —
  so that gate is now MEASURED rather than assumed. FILL-OUT and the unplayed top-up keep it on
  J3-coverage: an unplayed scenario has no percentile, the rung is the only difficulty signal
  there, and nothing has tested it. The thin regime's fixed `rung <= 4` is out of scope.
  **The cost is named, not hidden.** BAR 2 says work far from your level has less measured
  SPILLOVER to the rest of your profile. D34 rules the objective is the FLOOR, not spillover, so
  the trade is taken deliberately. Measured over 40 seeded days on the owner's record
  (`dev/window-effect.json`, `dev/run-tests.ps1 -Window`): **41.1% of weakest slots now go above
  level where the legacy gate served 0**; the day's type did not move (transfer 40/40 both ways,
  collectReady 0 both ways); and the served set barely moved but got slightly MORE concentrated —
  55 distinct against 58, top-ten share 0.607 against 0.558. Live on his profile the change
  surfaces `Popcorn MV Hard` (rung 7, 11th percentile) — his single weakest scenario, which the
  ceiling had been excluding — beside two more above-level rows.
  **`SELECT_VERSION` 2 → 3**, because rows either side differ in which scenarios were ELIGIBLE at
  all, and step 12's difficulty re-take (independent variable `rung − level`) is the first
  analysis that would read across the boundary. **`coach4Readiness` gained the `svOk` filter it
  had been missing**: it accepted an `sv` option and read nothing, so the stamp would not have
  split the gate it exists to split; unpoolable rows are reported as `staleSv`, not dropped.
  **AND THE FEEL CONTROLLER IS NOW INERT AS A SERVING CONTROL — measured, and INTENT-2 REOPENS.**
  The step-42 pre-registration committed to settling by measurement a question two referees
  disagreed on: at size 1, what share of servings still comes from a pool the window gates? **Over
  200 draws: `weakest` 167, `revisit` 33, fill-out 0, route 0 — a share of ZERO.** So
  `levelAdjust` no longer changes what is served on this profile.
  **AMENDED 2026-08-29 (step 45) — the conclusion stands and the REASON was wrong.** The window
  is inert, but not because the pools it gates are rarely drawn: `route` was never SERVABLE at
  all. At size 1 a route draw composed no weakest item, so the route anchors were empty and the
  top-up relabelled the serving `weakest`. Measured directly, which this harness could not do
  because it recorded only the SERVED label and discarded the DRAWN one:
  **84 of 84 route draws collapsed to `weakest`**, and served-weakest equalled drawn-weakest plus
  drawn-route exactly, in every arm (`dev/queue-readers.json`). Fill-out's zero is separate and
  benign — its weight is 0 under `transfer`. **Coverage does NOT collapse** and the first draft
  of step 45 wrongly said it did: `coldBlocks` is character-identical to `isCold`, so a coverage
  draw implies a non-empty cold list; measured 73 drawn, 73 served. The coverage WEIGHT on the
  D43 profile was 0, which that harness computed and threw away — recorded now rather than
  inferred. INTENT-2's reopening is unaffected: `levelAdjust` still steers nothing, and after
  step 45 the reason is that the window gates fill-out and routes while the ratings move a rung
  target that neither pool now consults. What survives is the "too hard"
  THIRD EXIT, which closes the open item and is untouched. The rating copy now says exactly that
  rather than asserting a control that does nothing. Giving the rating a live consumer again is
  INTENT-2, reopened here and deliberately not invented. Note the payoff: serving above level
  directly is what finally makes step 12's difficulty re-take possible ON-POLICY — the eligible
  pool used to contain 0 hard scenarios, which is why that estimate had to be taken off-policy.

- **D44** (2026-08-29) — **the foreign-run contamination was a full deep sync under the friend's
  username, and the residual is closed by DIRECT ATTRIBUTION; a switched username over a
  non-empty store now requires explicit confirmation.** The owner reported a second foreign PB
  (D38's repair had already caught 23): his displayed 3,301 on a scenario whose runs he could
  place was the friend's leaderboard score, and he NAMED the player. That name closed the case
  in one leaderboard row — the score belongs to the friend the template was built for — and
  opened the attribution channel the D38 forensics never had: the friend's own per-scenario API
  record. **Mechanism, revised from D38's "transient foreign rows" hypothesis:** the friend has
  ever played 134 scenarios and 127 of them sit in the owner's store — the fingerprint of the
  DEEP SYNC having run once under the friend's username (the by-name rows carry no identity, so
  the QUERY is the attribution), not of an endpoint fault. That is also why D38's window
  classifier structurally missed two thirds of it: by-name returns each scenario's last-10
  WHENEVER PLAYED, so the ingested foreign runs carry epochs spanning July 2025 to August 2026,
  far outside any ingest-window test. **The sweep:** probe the friend's record for all 127
  intersecting scenarios; a stored run is foreign iff it exact-matches one of theirs — within
  the store's own 600s dedupe window at truncation-exact score (a first 0.5-point tolerance
  called 110.4 and 110.002 the same score and was caught by its own report). Result, applied
  delta-exact: **+388 runs across 108 scenarios quarantined (the table now 128 scenarios / 563
  runs), 53 stored PBs were the friend's — 25 lowered to the best provable clean value, 28
  deleted for want of any clean evidence** (the weekly steamId-keyed channel re-raises anything
  cut too deep, the asymmetry D38 chose). Fifty attempts records were the friend's history in
  their entirety. The clean-baseline guard also caught that the 2026-08-16 repo snapshot was
  itself already contaminated on at least one scenario, and refused it as a repair target.
  **The standing fix:** switching the sync to a different username while the store holds scores
  now takes a confirm dialog naming both users and the merge consequence — switching stays one
  click (the template is passed between people by design), it is just no longer silent.
  **Honest residual:** attribution reaches only what the friend's CURRENT last-10 per scenario
  shows; runs they have since evicted by playing more are invisible to this method, and absence
  from their last-10 is not proof a stored run is the owner's. The input filters and this
  dialog cap the class going forward.

2026-08-29:

- **D45** (Review Ledger VIII step 45) — **the transfer mechanism had never run in the shipped
  product, and three readers left behind by step 8 are why.** Pre-registered before any code
  change (`dev/STEP45-PREREG.md`), adversarially reviewed BEFORE the estimator existed (45
  agents, five lenses, an independent refuter per finding: **40 raised, 0 refuted, 23
  blocking**), amended against all 23, then implemented and measured against bars that were
  fixed first.
  **The defect.** `queueNext` composes at size 1, where `drawPurposes` assigns the slot exactly
  one purpose. Route targets were derived from items ALREADY COMPOSED in the same pass, so a
  `route` draw composed no weakest item, both route loops iterated nothing, and the top-up
  relabelled the serving `weakest` — silently, since nothing recorded that a route had been
  requested and refused. **So the map that D12's whole protocol exists to produce fed a code
  path that could not execute.** Sibling readers: D18's anti-repeat read a log with no writer
  (amended above), and `sealServed` was called only from the history-view render, so an outcome
  was durable only if a particular page happened to be opened.
  **The fix.** Route anchors are the ranked weak POOL — `spread`, which is built from the TYPE's
  weights rather than the drawn template and so is populated exactly when the served items are
  not — at a DECLARED scan depth (`ROUTE_ANCHOR_SCAN = 8`), because the realised route share is
  monotone in it. Per the owner's ruling (2026-08-29) the anchor is deliberately internal: the
  coach picks the weak scenario behind the scenes and serves only the route, naming the weakness
  it feeds. The serving's type is stamped on the served ledger and read back day-based; the seal
  runs on the queue path.
  **The result, on bars committed before the estimator** (`dev/queue-readers.json`, 40 days × 25
  servings, one prebuilt row set, 2×2 over {A off, A on} × {B off, B simulated}):
  BAR 1 route serve rate **1.000 over 204 route draws** (bar ≥ 0.5 over ≥ 150); BAR 2 modal type
  **26/40** against 37/40 before (bar ≤ 30); BAR 3 **0 of 204** route servings duplicate what the
  A-off run served as `weakest` at the same day and index (bar ≤ 0.25). A converts draws into
  servings and B raises the draws — 122 → 204 — so neither substitutes for the other, which is
  what the cell split was for.
  **`SELECT_VERSION` 3 → 4**, because rows either side differ in which PURPOSES were servable at
  all — the same class as D43's bump on which SCENARIOS were eligible.
  **D28 stays out of scope, and that is CHECKED rather than asserted:** the ranked pool
  `opts.rank` returns is identical with the fix on and off (970 rows). Had it differed, A would
  be a ranking change and would walk the four legs before shipping.
  **Three things recorded because they went wrong.** The pre-registration predicted the session
  snapshot would move and it did not — on that fixture `spread`'s prefix and the served weakest
  coincide, so A is a no-op there while being total at size 1; the prediction was wrong in the
  conservative direction, and the route serve rate plus the ranking check are what establish A is
  reached at all. The parity control initially inherited the fix's own setting and stopped
  reproducing D43's known zero the moment A landed — a control measuring the treatment instead of
  the instrument; it is pinned to A-off now. And the first draft's coverage-collapse claim was
  refuted by the review and then by measurement (73 drawn, 73 served).
  **Still open and NOT decided here: the continuous queue itself has no decision-log entry.** It
  has been the shipped product shape since step 8 — through eight releases and fifteen D entries
  — while this document's product-shape section and D6 still describe a ten-item session and D7
  describes a tick-off that no longer exists. Ratifying a product shape is the owner's act, not
  an assistant's, so it is named here rather than written.
