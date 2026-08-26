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
  denies. On the ratification itself this entry says only what the measurement
  supports — step 26 and `dev/knob-sensitivity.html` both word it **ratifiABLE at
  30**, and ratification is the owner's act by this decision's own opening sentence.
  He has not ruled on it (step 29's four rulings do not include it), so **30 stands
  as the shipped value with the invariance measured behind it, and the ratification
  is OPEN.**

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
  that breach is still open.

- **D26** (Review Ledger IV step 7b, MET-7) — **a borrowed number may be SHOWN but must not STEER.**
  A scenario played once has no observable run scatter, so its interval is imputed from the
  profile's median CV. That interval belongs on the page, because a scenario played once genuinely
  is not pinned down and the page should say so; it does **not** enter the draw, because it is not
  evidence about *that* scenario. The estimator itself does not change: swapping the PB for a
  smoothed statistic was measured out of sample and beaten by the PB wherever the grind is real.
  **Recorded breach — ONE, and it is still OPEN:** step 11's empirical-Bayes weight steers the
  centre of ~55% of the pool with exactly such a number. Step 11 named two exits, an explicit
  retraction of this principle or a weight that does not need a borrowed number; step 21 rejected
  the n-standardisation, which was that second exit, so only explicit retraction remains and
  nothing has retracted it. **Neither step 29 nor D30 closed this** — they settled the estimand
  (PB-rank), a different question. *(Ledger V's own D19, its queue id for unifying the shown and
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
  reached 550 → 525, the 25 given up being 17 run-2 PBs worth a median +3.12% and 8 run-3+ ones
  worth +2.15%, against a first-run PB's +6.23% — about **half** and about a third respectively,
  not "a third" across the board.
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
