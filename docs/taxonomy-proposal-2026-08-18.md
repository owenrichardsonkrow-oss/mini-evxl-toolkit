# Skill-facet taxonomy — PROPOSAL for ratification (2026-08-18)

Status: **ratified 2026-08-18 (all 21 rulings; R10/R11 at low confidence, playlist unverifiable)** — see "Rulings" below; originally a proposal (drafted by the remote session per docs/DESIGN_INTENT.md;
nothing here is consumed by any code until Owen ratifies). To ratify: correct
rows inline or annotate, then the ratified vocabulary gets stamped into the
dataset + an engine classifier following the difficulty-vocabulary pattern.

## Facets

- **mechanic**: clicking | tracking | switching — the canonical triad.
- **modifier**: static, dynamic, reactive, speed, precise, evasive, control,
  micro, smooth, reading, flick, timing, stability, strafe, raw, reflex,
  blending, hybrid, bounce, wide, dodge, blink, anti-movement, movement — a
  scenario can carry several.
- **env** (air/ground), **game** (cs/val, tacfps, ow), **weapon** (shotgun,
  smg, ar), **region** (arm/wrist/fingertip), **axis**
  (horizontal/vertical/diagonal), **targets** (2–6), **special** (no-aim).
- **evict**: difficulty words — the difficulty attribute owns them.
- **nofacet**: curator/pack/section/placeholder labels — carry no skill
  meaning; those scenarios rely on their other labels or (later) name evidence.

## Coverage if this proposal is ratified as-is

Of 3040 scenarios: **2107** get a mechanic (69.3%),
**2200** get ≥1 modifier (72.4%),
**2489** get at least something (81.9%).
The remainder await the name-evidence stage (scenario names carry family
information the labels don't) — a later, separate proposal.

## Category labels (all 99, by scenario count)

| label | scen/pls | proposed facets | action | conf | note |
|---|---|---|---|---|---|
| tracking | 511/48 | mechanic: tracking | map | high |  |
| switching | 429/40 | mechanic: switching | map | high |  |
| clicking | 411/42 | mechanic: clicking | map | high |  |
| smoothness | 162/3 | mechanic: tracking; mod: smooth | map | high |  |
| control tracking | 138/6 | mechanic: tracking; mod: control | map | high |  |
| flick tech | 79/5 | mechanic: clicking; mod: flick | map | MED | RULING: fold flicks under clicking (community convention) or standalone mechanic? |
| static | 73/3 | mod: static | map | MED | mechanic unstated by label; usually static clicking in context |
| static clicking | 72/4 | mechanic: clicking; mod: static | map | high |  |
| reactive tracking | 63/6 | mechanic: tracking; mod: reactive | map | high |  |
| dynamic clicking | 43/2 | mechanic: clicking; mod: dynamic | map | high |  |
| aoiaim | 40/1 | — | nofacet | high | curator/pack label |
| flicking | 39/7 | mechanic: clicking; mod: flick | map | MED | same ruling as flick tech |
| micros | 38/2 | mod: micro | map | high |  |
| micro | 37/5 | mod: micro | map | high |  |
| click timing | 36/1 | mechanic: clicking; mod: timing | map | high |  |
| linear radial smoothness | 36/1 | mechanic: tracking; mod: smooth | map | high | linear/radial = pattern detail |
| precise tracking | 33/2 | mechanic: tracking; mod: precise | map | high |  |
| target switching | 31/2 | mechanic: switching | map | high |  |
| angelic tac fps | 28/1 | game: tacfps | map | high | curator: angelic |
| normal | 27/2 | — | evict | high | difficulty word |
| cs/val | 25/1 | game: cs/val | map | high |  |
| ground | 24/2 | env: ground | map | high |  |
| reactive | 24/4 | mod: reactive | map | high |  |
| flick-tech | 24/1 | mechanic: clicking; mod: flick | map | MED | same ruling as flick tech |
| evasive switching | 21/1 | mechanic: switching; mod: evasive | map | high |  |
| 动态点击 | 20/1 | mechanic: clicking; mod: dynamic | map | high | zh: dynamic clicking |
| (: | 18/1 | — | nofacet | high | joke/section label |
| air | 17/1 | env: air | map | high |  |
| easy | 17/1 | — | evict | high | difficulty word |
| stability | 17/2 | mod: stability | map | high |  |
| advanced | 17/1 | — | evict | high | difficulty word |
| blend | 16/1 | mod: blending | map | MED | RULING: blending = smooth+reactive hybrid style? |
| strafes | 16/1 | mod: strafe | map | MED | target-movement pattern; mechanic unstated (usually tracking) |
| control | 15/3 | mod: control | map | high |  |
| speedts | 14/1 | mechanic: switching; mod: speed | map | high |  |
| precise | 14/2 | mod: precise | map | high |  |
| click | 14/3 | mechanic: clicking | map | high |  |
| category | 13/2 | — | nofacet | high | placeholder label |
| dynamic | 13/2 | mod: dynamic | map | high |  |
| 跟枪 | 13/1 | mechanic: tracking | map | high | zh: tracking ("follow gun") |
| 转火 | 13/1 | mechanic: switching | map | high | zh: switching ("transfer fire") |
| matty ow benchmark | 12/1 | game: ow | map | high | curator: matty |
| shotgun | 12/1 | weapon: shotgun | map | high |  |
| henwood benchmarks | 12/1 | — | nofacet | high | curator/pack label |
| 定位 | 12/1 | mechanic: clicking; mod: static | map | LOW | RULING: zh "positioning" — static clicking family? |
| hard | 12/1 | — | evict | high | difficulty word |
| control and smooth tracking | 11/1 | mechanic: tracking; mod: control+smooth | map | high |  |
| reactive and anti movement | 11/1 | mod: reactive+anti-movement | map | MED | RULING: anti-movement as its own modifier? |
| <: | 11/1 | — | nofacet | high | joke/section label |
| specific | 10/1 | — | nofacet | LOW | placeholder-ish; scenarios keep name/sub evidence |
| track | 10/3 | mechanic: tracking | map | high |  |
| switch | 10/3 | mechanic: switching | map | high |  |
| smg | 9/1 | weapon: smg | map | high |  |
| arm | 9/1 | region: arm | map | high |  |
| revamp | 9/1 | — | nofacet | high | pack season/track label |
| raw smoothness | 9/1 | mechanic: tracking; mod: smooth+raw | map | high |  |
| movement | 8/3 | mod: movement | map | MED | RULING: player-movement (WASD) scenarios as a modifier? |
| beginner | 8/1 | — | evict | high | difficulty word |
| beginner+ | 8/1 | — | evict | high | difficulty word |
| intermediate | 8/1 | — | evict | high | difficulty word |
| 跟踪 | 8/1 | mechanic: tracking | map | high | zh: tracking |
| reflex | 7/2 | mod: reflex | map | high |  |
| wrist | 7/1 | region: wrist | map | high |  |
| raw | 6/1 | mod: raw | map | high |  |
| controlled | 6/1 | mod: control | map | high |  |
| triad | 6/1 | — | nofacet | LOW | pack section label? |
| large angles | 6/1 | mod: wide | map | MED | angle size; proposing "wide" modifier |
| strafe and anti movement | 6/1 | mod: strafe+anti-movement | map | MED |  |
| ar | 6/1 | weapon: ar | map | high |  |
| bouncesphere | 6/1 | mechanic: tracking; mod: bounce | map | MED | scenario family |
| flicks and click-timing | 6/1 | mechanic: clicking; mod: flick+timing | map | high |  |
| reactivity | 5/1 | mod: reactive | map | high |  |
| ts | 5/2 | mechanic: switching | map | high | TS = target switching |
| ground tracking | 5/1 | mechanic: tracking; env: ground | map | high |  |
| horizontal | 5/1 | axis: horizontal | map | high |  |
| strafe | 4/1 | mod: strafe | map | high |  |
| smooth | 4/2 | mod: smooth | map | high |  |
| hold | 4/1 | — | nofacet | LOW | RULING: crosshair-hold scenarios? unclear |
| 1 | 3/1 | — | nofacet | high | numeric section |
| 2 | 3/1 | — | nofacet | high | numeric section |
| 3 | 3/1 | — | nofacet | high | numeric section |
| 4 | 3/1 | — | nofacet | high | numeric section |
| speed | 3/1 | mod: speed | map | high |  |
| transfer | 3/1 | mechanic: switching | map | MED | transfers = wide switches |
| dodge | 3/1 | mod: dodge | map | MED | RULING: dodge (player evasion) as modifier? |
| other | 3/1 | — | nofacet | high | placeholder |
| no aim | 3/1 | special: no-aim | map | MED | RULING: exclude from aim profile entirely? |
| strafing | 3/1 | mod: strafe | map | high |  |
| flick | 3/1 | mechanic: clicking; mod: flick | map | MED |  |
| tempo | 3/1 | mod: timing | map | MED |  |
| correction | 3/1 | mod: micro | map | MED | micro-correction |
| bonus | 3/1 | — | nofacet | high | section label |
| static click | 3/1 | mechanic: clicking; mod: static | map | high |  |
| dynamic click | 3/1 | mechanic: clicking; mod: dynamic | map | high |  |
| tap | 2/1 | mechanic: clicking | map | LOW | RULING: tap = click family? |
| rush | 2/1 | — | nofacet | LOW | RULING: unknown label |
| blink | 2/1 | mod: blink | map | MED | blinking/teleporting targets |
| diagonal | 2/2 | axis: diagonal | map | high |  |
| scenarios | 1/1 | — | nofacet | high | placeholder |

## Subcategory labels in ≥2 playlists (72)

| label | scen/pls | proposed facets | action | conf | note |
|---|---|---|---|---|---|
| dynamic | 190/36 | mod: dynamic | map | high |  |
| reactive | 190/35 | mod: reactive | map | high |  |
| speed | 188/35 | mod: speed | map | high |  |
| static | 160/36 | mod: static | map | high |  |
| precise | 156/27 | mod: precise | map | high |  |
| evasive | 148/26 | mod: evasive | map | high |  |
| control | 120/23 | mod: control | map | high |  |
| micro | 91/19 | mod: micro | map | high |  |
| reading | 85/11 | mod: reading | map | high |  |
| smooth | 83/17 | mod: smooth | map | high |  |
| 3 target | 68/4 | targets: 3 | map | high |  |
| 4 target | 68/4 | targets: 4 | map | high |  |
| 5 target | 68/4 | targets: 5 | map | high |  |
| 6 target | 68/4 | targets: 6 | map | high |  |
| stability | 63/11 | mod: stability | map | high |  |
| 2 target | 56/3 | targets: 2 | map | high |  |
| precision | 52/9 | mod: precise | map | high |  |
| vertical | 50/4 | axis: vertical | map | high |  |
| horizontal | 50/4 | axis: horizontal | map | high |  |
| hybrid | 34/4 | mod: hybrid | map | MED |  |
| reflex | 34/6 | mod: reflex | map | high |  |
| linear | 33/9 | — | nofacet | MED | movement-pattern detail |
| xyz | 33/2 | — | nofacet | high | pack label (XYZ comps) |
| arm | 30/4 | region: arm | map | high |  |
| blending | 30/5 | mod: blending | map | MED |  |
| track | 30/6 | mechanic: tracking | map | high |  |
| wrist | 29/4 | region: wrist | map | high |  |
| flick | 28/7 | mechanic: clicking; mod: flick | map | MED | same flick ruling as categories |
| smoothness | 28/6 | mod: smooth | map | high |  |
| strafe | 27/6 | mod: strafe | map | high |  |
| tracking | 26/6 | mechanic: tracking | map | high |  |
| 1 | 25/4 | — | nofacet | high | numeric section |
| fingertip | 25/4 | region: fingertip | map | high |  |
| technique | 24/2 | — | nofacet | MED | section label |
| 3 | 23/4 | — | nofacet | high | numeric section |
| 2 | 22/4 | — | nofacet | high | numeric section |
| ground | 20/4 | env: ground | map | high |  |
| click | 20/3 | mechanic: clicking | map | high |  |
| bounce | 17/3 | mod: bounce | map | MED |  |
| raw | 16/3 | mod: raw | map | high |  |
| switch | 16/3 | mechanic: switching | map | high |  |
| fluidity | 14/5 | mod: smooth | map | MED | smoothness family |
| elusive | 14/4 | mod: evasive | map | MED | elusive strafes family |
| clicking | 13/4 | mechanic: clicking | map | high |  |
| switching | 13/4 | mechanic: switching | map | high |  |
| reactivity | 13/4 | mod: reactive | map | high |  |
| voxts | 12/2 | — | nofacet | high | scenario family |
| patts | 11/2 | — | nofacet | high | scenario family |
| pokeball | 10/4 | — | nofacet | high | scenario family |
| micros | 9/3 | mod: micro | map | high |  |
| wide wall | 9/2 | — | nofacet | high | scenario family |
| centering | 9/2 | mod: stability | map | MED | centering drills |
| micro-static | 8/2 | mod: micro+static | map | high |  |
| air | 8/3 | env: air | map | high |  |
| sphere | 8/2 | — | nofacet | high | target-shape detail |
| entry | 8/3 | — | evict | MED | difficulty word (rung 0 in DIFF vocab) |
| xents | 7/2 | — | nofacet | high | scenario family |
| micro-dynamic | 7/2 | mod: micro+dynamic | map | high |  |
| micro-tracking | 7/2 | mechanic: tracking; mod: micro | map | high |  |
| dodge | 7/2 | mod: dodge | map | MED |  |
| wide | 7/3 | mod: wide | map | MED |  |
| reaction | 6/2 | mod: reflex | map | MED |  |
| mix | 6/3 | mod: hybrid | map | MED |  |
| devts | 6/2 | — | nofacet | high | scenario family |
| ctrl | 6/2 | mod: control | map | high |  |
| thin | 6/2 | — | nofacet | MED | target-shape detail |
| predict | 6/2 | mod: reading | map | MED |  |
| mass | 4/3 | — | nofacet | MED | many-targets structural |
| sta | 4/2 | mod: static | map | MED | abbrev. |
| regen | 4/2 | — | nofacet | MED | regen-HP mechanic detail |
| react | 4/2 | mod: reactive | map | high |  |
| 3x3 | 3/2 | — | nofacet | high | grid-size detail |

## One-playlist-only subcategories (136)

Proposed default: **nofacet** (pack-structural) unless promoted above. Veto
list — promote any that deserve a facet:

+ · 1 wall · 1wall · 1wxt · 4 · 5 · 6 · 7 · 8 · accuracy · acq · acquire · alpha · angles · anti m · anti move · app smth · arc · ascended · assorted · avg · basic · beginner · bonus · c rct · chaining · classic · click timing · cluster · clusters · control track dojo 控制場 · core · core. · cps · diagonal · diverse · elu · evasivets · fast · fast strafes · fing · flicking · flicks · floatts · flow · flu · fluid · focus · frenzy · fun · fundamentals · gauntlet · gridshot · ground track dojo 道場 · have · hyb · isolated · kinetic · kints · lin · long · long strafe · m ctrl · main · micro control · micro dynamic · micro static · micro-switching · mixed · multiform · mvmnt · narrow · normal · omni · one  step · other · pacing · parabola · pasu track · pasu track dojo 道場 · path · playing! · plaza · post-flick · pre · prec · precision + reactive · pressure · pure · r rct · r smth · raw control · raw smooth · rct · rea · read · ref · reflex. · run · rxn · short · small · smo · smoothbot · speedts · steady · stra · strafing · ta · taping · ten · tension · tgod · timing · tiny · traditional · traking · two  steps · underaim · vai · variable · varied · vss · widewall · ww small · 变向 · 平滑 · 微调 · 确认 · 确认感 · 精准 · 精准度 · 终极 · 终极目标 · 跟踪 · 速度

## Rulings — Owen, 2026-08-18 evening (home, scenarios open) — all 21 closed

Answered against one representative scenario per ruling (the list is in the
session transcript; e.g. R1 `1w3ts reload Larger`, R3 `6 Sphere Hipfire Small
Easy`, R17 `Ballsheet BB`, R18 `Smoothness Training Rush`). Status per ruling:

- **R1 flick → clicking modifier** (not a fourth mechanic).
- **R2 no-aim → exclude.** `Super Hoover Cart Racers` is a racing game built into
  a scenario. Detection: the curator's *No Aim* label, plus KovaaK's `aimType`
  as a flag list — it is author-set (Hoover is tagged *Clicking*; `Tennis` and
  `Worm The Eater` are *Other*), so *Other* is a candidate list for Owen to
  eyeball whenever scenario metadata is harvested, not an automatic exclusion.
- **R3 bare "static" → modifier only, mechanic left empty.** Yes.
- **R4 blend/blending → own modifier.** Yes.
- **R5 anti-movement → own modifier.** Yes.
- **R6 movement → modifier for player-WASD scenarios ("strafe").**
- **R7 dodge → the same strafe modifier** (player-WASD), not a separate one.
  Owen's note: older Voltaic benchmarks had *strafe* as a category beside
  flicking / clicking / switching. Decision for now: **strafe stays a modifier**
  (the mechanic axis is what the crosshair does; strafing is what the player
  does — a separate axis, and a modifier facet still gets its own competency
  number). Revisit → promote to a mechanic if the emergence analysis (D12)
  clusters strafing scenarios apart. Recorded as open question Q-strafe.
- **R8 large angles → wide.** Yes.
- **R9 transfer → NO fixed mechanic** — a transfer scenario can be clicking or
  switching; mechanic per scenario, "transfer" itself contributes nothing.
- **R10 tempo → timing / R11 correction → micro: proposals stand at LOW
  confidence, unverifiable** — every scenario of the *143 Skand Static
  Benchmark* playlist (`143 TEMPO CLICK`, `143 STATIC VIBRATION`, `143
  SKANDSHOT`) returns zero results on KovaaK's scenario search (2026-08-18):
  renamed or removed upstream. Flag for the next structure refresh; if the
  playlist is dead the rulings are moot.
- **R12 blink → modifier.** Yes. **R13 centering → stability.** Yes.
- **R14 entry → difficulty word, evicted** (entry = low difficulty).
- **R15 fluidity → smooth; elusive → evasive.** Yes.
- **R16 定位 → static modifier; mechanic per scenario.** `RawMouseControlClicking3`
  is static clicking (Owen); the label also carries mouse-control scenarios, so
  clicking is not assumed for the rest.
- **R17 hold → modifier "hold-fire" on switching:** the mouse button is held and
  a target dies the instant the crosshair crosses it (no health bar to tick
  down, unlike regular switching) — `Ballsheet BB`.
- **R18 rush → tracking, staged-progression format** (get through each stage by
  tracking each bot as well as possible); a format, not an extra skill facet.
- **R19 tap → clicking.** Yes.
- **R20 triad → pack/format label ("stage"-like scenarios); no facet from the
  label** — the facet comes from the scenario-name word (Dynamic / Evasive /
  Precise / Reactive / Speed Triad).
- **R21 specific / MULTIFORM → clicking, staged format** (Owen: all the
  Multiforms are clicking; the stage changes three times per run). All ten are
  RXZU – Valorant (`Rxzu - Multiform I…V` × Ez/Adv); *SPECIFIC* is that pack's
  section name and carries no facet of its own — like R18/R20, "stage" is a
  format, not a skill.
- **Q-strafe closed:** Owen accepted "strafe stays a modifier; promote to a
  mechanic only if the emergence analysis separates strafing scenarios."

Status after these rulings: **ratified — all 21 answered; R10/R11 stand at low
confidence because the 143 Skand playlist is unverifiable upstream.** Next: stamp the ratified vocabulary
into the dataset + engine classifier following the difficulty-vocabulary
pattern (personal copy first, then regenerate).
## Rulings requested (R1–R21 — Owen answers at home, scenarios open)

Numbering matches the list Owen was given in the 2026-08-18 session, so
"R3–R15 fine, R17 is actually …" is a complete answer. High-confidence rows in
the tables above stand unless vetoed; one-playlist-only subcategories default
to nofacet.

Structural:

- **R1** "flick" (flick tech / flicking / flick): clicking modifier (proposed,
  community convention) or a standalone fourth mechanic?
- **R2** "no aim" scenarios: exclude from the aim profile entirely?
  (proposed: yes)

Quick-fire proposals (confirm or veto):

- **R3** bare "static" (73 scenarios): modifier only, mechanic left empty
- **R4** "blend"/"blending": own modifier (smooth+reactive hybrid style)
- **R5** "anti-movement" (from "reactive and anti movement" / "strafe and
  anti movement"): own modifier
- **R6** "movement": modifier for player-WASD scenarios
- **R7** "dodge": modifier (player evasion)
- **R8** "large angles" → wide
- **R9** "transfer" → switching
- **R10** "tempo" → timing
- **R11** "correction" → micro
- **R12** "blink": modifier (blinking targets)
- **R13** "centering" (subcategory) → stability
- **R14** "entry" (subcategory) → evicted as a difficulty word
- **R15** "fluidity" → smooth; "elusive" → evasive

Pack-knowledge unknowns (open them in KovaaK's):

- **R16** 定位 (zh "positioning", 12 scenarios): proposed clicking+static,
  low confidence
- **R17** "hold" (4 scenarios): unknown
- **R18** "rush" (2): unknown
- **R19** "tap" (2): proposed clicking
- **R20** "triad" (6): pack section label?
- **R21** "specific" (10): placeholder?
