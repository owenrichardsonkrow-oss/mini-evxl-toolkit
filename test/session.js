// Snapshot test for the session coach (composeSession / skillProfile, src/engine.js)
// on a SYNTHETIC fixture -- no dataset, no scores, no population file.
//
// The fixture is ~40 scenario rows in exactly the shape the app's
// sessionScenarios() (src/app/65-ui-session.js) hands the engine: name, played,
// pct, to2nd, toMax, toNext, maxed, rung, labels, facets, playlists, plKeys, att
// (attemptSummary over a run record), raises14d, neighbours -- plus a
// playlistFill table and a six-entry labelBridges table. Every number is fixed
// by hand so every slice of the composition is exercised on purpose:
//   weakest   five by population percentile at or under the level, with the
//             spread rules (2 per primary label, 1 per playlist) and the stuck
//             sink (lowest percentile of all, several recent tries well under
//             the PB -> not in the five);
//   route     two CROSS-PLAYLIST scenario-level routes (since 2026-08-25 a route may
//             not be a playlist-mate of the weak item: measured on the shipped map,
//             playlist-mates are 7.6% of tested pairs but supply 54.5% of every edge
//             at r >= 0.3, so "practise the other scenario in this benchmark" was
//             two thirds of what the coach called transfer). The others are refused
//             for rung over level+1, being already chosen, being a sink -- and now
//             for sharing a playlist, which is what takes the strongest neighbour of
//             all (Fx Static Small, r 0.62) out of the running;
//   fill out  a gap in a mostly-played playlist; quick win (most playlists
//             first); revisit (longest away, after the quick win took the
//             15-day one); a size-12 run for the top-up order;
//   thin      the same rows with only 12 played -> regime "thin", placement only
//             (pinned quirk: when no unplayed scenario of the wanted mechanic is
//             left, the fallback pick still carries that mechanic as its label --
//             "Cl Ground Static" labelled switching -- a display wrinkle, kept so
//             a fix is a deliberate re-bless and not a silent drift);
//   guards    the playlist-mate refusal, reached rather than vacuous: the strongest
//             neighbour in the fixture shares a playlist with its weak item, so a
//             passing run proves the rule fired rather than never being tested;
//   blockRoutes  the BLOCK-level route (features.blockRoutes): a candidate scored by
//             its mean r across every member of the weak item's block, over a
//             synthetic pairs index, with the block playlist-isolated so the
//             cross-playlist rule can be satisfied at all.
// EXPECTED is the engine's own output, pasted, so the test is a snapshot: the
// closure lift that follows (normalizeLabel / labelFacetSet / sameSkillLabels /
// noSkillLabel / sessionLevel / isStuck / routeCheck out of composeSession)
// must leave every line identical. A deliberate behaviour change regenerates
// it: `node test/session.js --print` (or the harness with ?session=1 on a
// machine without Node) prints the block to paste over EXPECTED.
//
//   node test/session.js            # compare (CI)
//   node test/session.js --print    # print the actual snapshot (to paste)
(function(root){
  const DAY = 86400000;
  const FIXED_MS = Date.UTC(2026, 7, 22, 12, 0, 0);   // 2026-08-22T12:00:00Z, the fixture's "now"
  // Playlist keys, the app's JSON.stringify([playlist, difficulty]).
  const PA = '["Pack A","Easy"]', PB = '["Pack B","Intermediate"]', PC = '["Pack C","Intermediate"]', PD = '["Pack D","Hard"]',
        PE = '["Pack E","Easy"]', PF = '["Pack F","Intermediate"]', PG = '["Pack G","Easy"]', PH = '["Pack H","Hard"]';
  // How filled in each playlist is (the app's playlistFill()): >= 60% played
  // and not full = a fill-out target (PG 83%, PA 80%, PD 75%).
  const FILL = {
    [PA]: { name: 'Pack A · Easy', played: 4, total: 5 },
    [PB]: { name: 'Pack B · Intermediate', played: 4, total: 4 },
    [PC]: { name: 'Pack C · Intermediate', played: 3, total: 6 },
    [PD]: { name: 'Pack D · Hard', played: 3, total: 4 },
    [PE]: { name: 'Pack E · Easy', played: 2, total: 2 },
    [PF]: { name: 'Pack F · Intermediate', played: 2, total: 5 },
    [PG]: { name: 'Pack G · Easy', played: 5, total: 6 },
    [PH]: { name: 'Pack H · Hard', played: 1, total: 3 }
  };
  // Label bridges, the shape of data/transfer.json's `labels` block:
  // "a|b" -> [mean r, scenario pairs], raw curator labels lower-cased.
  const LABEL_BRIDGES = {
    'static|static clicking': [0.71, 40],            // same skill spelled twice ({static} is a subset of {clicking, static}) -- never a route
    'dynamic clicking|reactive tracking': [0.55, 30], // real bridge; loses to the next one on r*log(pairs+1)
    'smoothness|reactive tracking': [0.62, 25],       // real bridge; the one the main run takes
    'bonus|target switching': [0.80, 50],             // "bonus" carries no skill (vocabulary: nofacet) -- never a route
    'speedts|static clicking': [0.20, 120],           // a weak bridge (r 0.2)
    'target switching|dynamic clicking': [0.45, 18]   // real bridge; no weak item reaches it in the main run
  };
  // LABEL_BRIDGES is kept only as a shape reference: since 2026-08-25 nothing in the
  // coach reads it (Review Ledger III A2/S5 -- it is a mean over pairs already filtered
  // to |r| >= 0.3 at n >= 12, biased upward by construction). The Overlap page still
  // renders it through bridgeRows, labelled as the different statistic it is.
  // Run records per scenario (the ATTEMPTS store shape, `{n, last:[[t, s], ...]}`
  // newest first) and the PB they sit against; the row's `att` is
  // attemptSummary(rec, pb, FIXED_MS, 5) exactly as sessionScenarios() builds it.
  // Kept raw here so the later responsiveness work has runs to change on purpose.
  const T = days => FIXED_MS - days*DAY;
  const RUNS = {
    'Cl Stuck Flicks':  { pb: 100, n: 7, last: [[T(1), 78], [T(2), 80], [T(3), 75], [T(5), 82], [T(6), 79], [T(9), 70], [T(12), 100]] },  // nearness 0.82 -> stuck
    'Fx Static Small':  { pb: 80,  n: 6, last: [[T(2), 79], [T(3), 76], [T(4), 80], [T(7), 72], [T(8), 70], [T(10), 65]] },             // nearness 1.0 -> not stuck
    'Tr Reactive Slow': { pb: 40,  n: 2, last: [[T(1), 38], [T(4), 40]] },                                                            // n < 4 -> never stuck
    'Sw Old Switch':    { pb: 50,  n: 3, last: [[T(40), 48], [T(41), 50], [T(45), 44]] },                                             // 40 days away -> revisit
    'Tr Old Smooth':    { pb: 60,  n: 2, last: [[T(20), 60], [T(21), 57]] },                                                          // 20 days away -> second revisit
    'Tr Recent Sphere': { pb: 70,  n: 5, last: [[T(3), 70], [T(3)-3600000, 66], [T(4), 68], [T(6), 60], [T(8), 59]] },               // recent -> not a revisit
    'Cl Easy Flick':    { pb: 120, n: 4, last: [[T(15), 118], [T(16), 120], [T(17), 110], [T(18), 100]] }                             // 15 days away, but the quick win takes it first
  };
  // name, played, pct, to2nd, toMax, toNext, maxed, rung, labels, facets, plKeys, raises14d, neighbours
  // Level = median rung of the played rows = 4 (Intermediate).
  const ROWS = [
    // the five weakest (percentile ascending), each with a different primary label / playlist story
    ['Fx Static Wide',      true,  0.12, 0.30, 0.10, 0.35, false, 3, ['static clicking'],                  ['clicking','static'],            [PA],         1, [['Fx Static Small', 0.62, 300], ['Cl Stuck Flicks', 0.55, 220], ['Cl Dynamic Large', 0.51, 260]]],   // Fx Static Small is the STRONGEST neighbour and shares PA -- a playlist-mate, refused since 2026-08-25; Cl Stuck Flicks is a sink; Cl Dynamic Large [PF] is the cross-playlist route that survives
    ['Tr Reactive Slow',    true,  0.15, 0.32, 0.12, 0.20, false, 4, ['reactive tracking'],                ['tracking','reactive'],          [PB],         0, [['Tr Smooth Cube', 0.48, 180]]],   // [PD]: cross-playlist, the second route
    ['Sw Speed Small',      true,  0.18, 0.35, 0.15, 0.40, false, 2, ['speedts'],                          ['switching','speed'],            [PC],         0, [['Sw Speed Large', 0.50, 150]]],
    ['Cl Dynamic Mid',      true,  0.22, 0.40, 0.18, 0.25, false, 4, ['dynamic clicking','static'],        ['clicking','dynamic','static'],  [PD],         2, [['Cl Dynamic Mid Hard', 0.70, 400], ['Tr Reactive Slow', 0.40, 200]]],
    ['Tr Smooth Thin',      true,  0.25, 0.42, 0.20, 0.30, false, 3, ['smoothness','bonus'],               ['tracking','smooth'],            [PE],         0, [['Tr Smooth Thin Hard', 0.30, 120]]],
    // the spread rules: 6th in, then a third clicking / third tracking / repeated playlist out
    ['Sw Switch Basic',     true,  0.28, 0.45, 0.22, 0.30, false, 4, ['target switching'],                 ['switching'],                    [PF],         0, []],
    ['Cl Static Micro',     true,  0.30, 0.46, 0.25, 0.35, false, 2, ['static clicking'],                  ['clicking','static'],            [PG],         0, []],
    ['Tr Bounce Ball',      true,  0.31, 0.47, 0.26, 0.30, false, 3, ['bouncesphere'],                     ['tracking','bounce'],            [PH],         0, []],
    ['Sw Evasive Dash',     true,  0.33, 0.48, 0.28, 0.40, false, 3, ['evasive switching'],                ['switching','evasive'],          [PC],         0, []],
    ['Cl NoCurve Tap',      true,  null, 0.35, 0.30, 0.50, false, 3, ['tap'],                              ['clicking'],                     [PA, PB],     0, []],   // no population curve: since 2026-08-25 its To 2nd is QUANTILE-MAPPED onto the curved rows' percentile distribution (S3) -- 0.35 sits near the 10th percentile of the fixture's To-2nd values, so it ranks around 0.20 and lands just inside the size-12 top-up, where reading 0.35 as if it were a percentile put it outside
    // the stuck sink: lowest percentile of all, five recent tries at ~80% of the PB
    ['Cl Stuck Flicks',     true,  0.08, 0.25, 0.05, 0.10, false, 3, ['flick'],                            ['clicking','flick'],             [PB],         0, []],
    // route material
    ['Fx Static Small',     true,  0.45, 0.60, 0.35, 0.30, false, 4, ['static clicking'],                  ['clicking','static'],            [PA, PG],     1, [['Fx Static Wide', 0.62, 300]]],   // the neighbour route
    ['Fx Static Tall',      true,  0.43, 0.55, 0.30, 0.20, false, 4, ['static clicking','static'],         ['clicking','static'],            [PG],         0, []],                               // the weak bridge's pick
    ['Tr Smooth Sphere',    true,  0.55, 0.65, 0.40, 0.45, false, 4, ['Smoothness'],                       ['tracking','smooth'],            [PB],         0, []],                               // the label-bridge route (label capitalised on purpose: the engine lower-cases)
    ['Tr Smooth Cube',      true,  0.50, 0.62, 0.38, 0.40, false, 5, ['smoothness'],                       ['tracking','smooth'],            [PD],         0, []],                               // same bridge, lower standing -> loses the tiebreak
    ['Cl Dynamic Large',    true,  0.50, 0.60, 0.36, 0.30, false, 4, ['dynamic clicking'],                 ['clicking','dynamic'],           [PF],         0, []],                               // the weaker bridge's candidate
    ['Sw Speed Large',      false, null, 0,    0,    0,    false, 6, ['speedts'],                          ['switching','speed'],            [PH],         0, []],                               // neighbour of Sw Speed Small, rung 6 > level+1 -> refused
    ['Cl Dynamic Mid Hard', true,  0.60, 0.70, 0.50, 0.20, false, 7, ['dynamic clicking'],                 ['clicking','dynamic'],           [PH],         0, []],                               // neighbour, rung 7 -> refused
    ['Tr Smooth Thin Hard', true,  0.58, 0.68, 0.48, 0.15, false, 7, ['smoothness'],                       ['tracking','smooth'],            [PH],         0, []],                               // neighbour, rung 7 -> refused
    ['Cl Maxed Easy',       true,  0.95, 1.0,  1.0,  1.0,  true,  1, ['static clicking'],                  ['clicking','static'],            [PE],         0, []],                               // maxed -> nowhere
    // quick wins (toNext >= 0.7): most playlists first
    ['Cl Easy Flick',       true,  0.70, 0.80, 0.60, 0.75, false, 1, ['flick'],                            ['clicking','flick'],             [PA, PE, PG], 1, []],
    ['Tr Hard Control',     true,  0.65, 0.75, 0.55, 0.85, false, 6, ['control tracking'],                 ['tracking','control'],           [PD, PH],     0, []],
    ['Sw Quick Flick TS',   true,  0.62, 0.72, 0.50, 0.72, false, 5, ['target switching'],                 ['switching'],                    [PF],         0, []],
    // revisits (runs older than 14 days, see RUNS)
    ['Sw Old Switch',       true,  0.48, 0.58, 0.35, 0.30, false, 4, ['target switching'],                 ['switching'],                    [PG],         0, []],
    ['Tr Old Smooth',       true,  0.52, 0.60, 0.40, 0.35, false, 4, ['smoothness'],                       ['tracking','smooth'],            [PH],         0, []],
    ['Tr Recent Sphere',    true,  0.56, 0.66, 0.42, 0.40, false, 5, ['reactive tracking'],                ['tracking','reactive'],          [PC],         3, []],
    // the rest of the played set (level = 4 needs this many at rung 4)
    ['Cl Wide Pasu',        true,  0.44, 0.55, 0.30, 0.40, false, 4, ['dynamic clicking'],                 ['clicking','dynamic'],           [PC],         0, []],
    ['Tr Air Strafe',       true,  0.47, 0.57, 0.33, 0.45, false, 5, ['air','reactive tracking'],          ['tracking','reactive','env:air'], [PD],        0, []],
    ['Sw Six Target',       true,  0.53, 0.63, 0.40, 0.50, false, 5, ['target switching','6 target'],      ['switching','targets:6'],        [PF],         0, []],
    ['Cl Ground Static',    true,  0.41, 0.52, 0.28, 0.30, false, 3, ['static clicking','ground'],         ['clicking','static','env:ground'], [PE],       0, []],
    ['Tr Control Pill',     true,  0.49, 0.59, 0.36, 0.35, false, 4, ['control tracking'],                 ['tracking','control'],           [PB],         0, []],
    ['Sw Pokeball TS',      true,  0.57, 0.67, 0.44, 0.55, false, 6, ['ts'],                               ['switching'],                    [PH],         0, []],
    ['Cl Nofacet Bonus',    true,  0.38, 0.50, 0.26, 0.20, false, 4, ['bonus'],                            [],                               [PC],         0, []],   // no facets: the raw label is its skill label
    // unplayed: fill-out gaps (in PA / PG / PD), placement material, and two out of reach
    ['Cl Gap Pasu',         false, null, 0,    0,    0,    false, 3, ['dynamic clicking'],                 ['clicking','dynamic'],           [PA],         0, []],
    ['Tr Gap Cube',         false, null, 0,    0,    0,    false, 4, ['smoothness'],                       ['tracking','smooth'],            [PG],         0, []],
    ['Sw Gap Switch',       false, null, 0,    0,    0,    false, 5, ['target switching'],                 ['switching'],                    [PD],         0, []],
    ['Cl Newcomer Tile',    false, null, 0,    0,    0,    false, 0, ['static clicking'],                  ['clicking','static'],            [PE],         0, []],
    ['Tr Newcomer Smooth',  false, null, 0,    0,    0,    false, 1, ['smoothness'],                       ['tracking','smooth'],            [PC],         0, []],
    ['Sw Newcomer TS',      false, null, 0,    0,    0,    false, 2, ['ts'],                               ['switching'],                    [PF],         0, []],
    ['Cl Hard Unplayed',    false, null, 0,    0,    0,    false, 8, ['dynamic clicking'],                 ['clicking','dynamic'],           [PH],         0, []],   // rung 8: over every cap
    ['Cl Unrated Thing',    false, null, 0,    0,    0,    false, -1, ['static clicking'],                 ['clicking','static'],            [PH],         0, []]    // unrated: not in the rated set at all
  ];
  function fixture(E){
    return ROWS.map(r=>{
      const [name, played, pct, to2nd, toMax, toNext, maxed, rung, labels, facets, plKeys, raises14d, neighbours] = r;
      const rec = RUNS[name];
      const att = rec ? E.attemptSummary({ n: rec.n, last: rec.last }, rec.pb, FIXED_MS, 5) : null;
      return { name, played, pct, to2nd, toMax, toNext, maxed, rung, labels: labels.slice(), facets: facets.slice(),
        playlists: plKeys.length, plKeys: plKeys.slice(), att: att && att.n ? att : null, raises14d,
        neighbours: neighbours.map(x=>x.slice()) };
    });
  }
  // Thin regime: the same rows with only the first 12 played (< SESSION_THIN_PLAYED = 30).
  function thinFixture(E){
    return fixture(E).map((sc, i)=> i < 12 ? sc : Object.assign({}, sc, { played: false, pct: null, to2nd: 0, toMax: 0, toNext: 0, maxed: false, att: null }));
  }
  // historySince: the score history covers the last 90 days, so a touched scenario with no raise after T is UNMOVED (counts 0); without it such a scenario is not evidence at all (its runs are only a lower bound on the PB)
  // No labelBridges: since 2026-08-25 (Review Ledger III A2/S5) nothing in the coach reads
  // that table. It is the mean r of the pairs that ALREADY passed |r| >= 0.3 at n >= 12 with
  // no minimum n per pair -- a mean of a truncated tail, biased upward by construction, and
  // the bridge loop then tested it against the same 0.3 the construction guarantees. The
  // Overlap page still displays it, labelled as the different statistic it is.
  const OPTS = { size: 10, seed: 1, now: FIXED_MS, historySince: FIXED_MS - 90*86400000 };
  const item = it => ({ name: it.name, why: it.why, via: it.via ? { target: it.via.target, viaLabel: it.via.viaLabel, r: it.via.r, n: it.via.n } : null });
  const routeOf = it => ({ name: it.name, target: it.via ? it.via.target : null, viaLabel: it.via ? it.via.viaLabel : null });
  function compute(E){
    const fx = fixture(E);
    const main = E.composeSession(fx, OPTS, FILL);
    const topup = E.composeSession(fixture(E), Object.assign({}, OPTS, { size: 12 }), FILL);
    const thin = E.composeSession(thinFixture(E), OPTS, FILL);
    // A route must CROSS PLAYLISTS (A2/S4): measured on the shipped map, playlist-mates are
    // 7.6% of tested pairs but supply 54.5% of every edge at r >= 0.3, because people train
    // playlists as units. Fx Static Small is Fx Static Wide's STRONGEST neighbour (r 0.62 over
    // 300 players) and shares Pack A with it, so it must never be the route; the weaker
    // cross-playlist Cl Dynamic Large (r 0.51) is what the weak item gets instead.
    const guardRoutes = E.composeSession(fixture(E), OPTS, FILL).items.filter(it=>it.why==='route');
    return {
      main: { regime: main.regime, level: main.level, popLevel: main.popLevel,
        weakLabels: main.weakLabels.map(p=>[p.label, p.kind, p.median, p.n]),
        items: main.items.map(item) },
      topup: { items: topup.items.map(item) },
      thin: { regime: thin.regime, level: thin.level, items: thin.items.map(it=>[it.name, it.why, it.label]) },
      guards: { routes: guardRoutes.map(routeOf), playlistMateUsed: guardRoutes.some(it=>it.name==='Fx Static Small'), crossPlaylistUsed: guardRoutes.some(it=>it.name==='Cl Dynamic Large') },
      playedRated: { main: fx.filter(sc=>sc.played && sc.rung>=0).length, thin: thinFixture(E).filter(sc=>sc.played && sc.rung>=0).length },
      features: features(E)
    };
  }
  // ---- v0.4 feature cases (2026-08-22 late) -------------------------------------
  // Each feature is switched on by evidence the fixture above does NOT carry
  // (no resp / raises / runPcts / boardN / gameHit, gameWeight 0, confidence
  // null), which is why the snapshot cases stay byte-identical. Here each is
  // fed on purpose and asserted by property, not by snapshot.
  // A synthetic percentile curve: [[fractionFromTop, score], ...].
  const CURVE = [[0.01, 100], [0.05, 90], [0.10, 80], [0.25, 65], [0.50, 50], [0.75, 35], [0.90, 20]];
  function features(E){
    const R = {};
    const runs = (scores, stepDays) => ({ n: scores.length, last: scores.map((s, i)=>[FIXED_MS - (scores.length-1-i)*stepDays*DAY, s]).reverse() });
    // responsiveness: 3 runs -> unknown; 8 climbing -> responsive ~ +0.02/run; 10 flat at 90% of PB -> plateaued; no curve -> unknown; raises-only -> history
    R.resp3 = E.responsiveness(runs([50, 52, 51], 2), [], CURVE, FIXED_MS, { pb: 52 });
    R.resp8 = E.responsiveness(runs([45, 46.5, 48, 49.5, 51, 52.5, 54, 55], 2), [], CURVE, FIXED_MS, { pb: 55 });
    R.respFlat = E.responsiveness(runs([54, 54, 54, 54, 54, 54, 54, 54, 54, 54], 2), [], CURVE, FIXED_MS, { pb: 60 });
    R.respNoCurve = E.responsiveness(runs([45, 48, 51, 54, 57, 60], 2), [], null, FIXED_MS, { pb: 60 });
    R.respHistory = E.responsiveness(runs([50, 58], 2), [[T(30), 40, 46], [T(20), 46, 52], [T(10), 52, 58]], CURVE, FIXED_MS, { pb: 58 });
    // ordering property, on the fixture: a plateaued row at the same percentile as an
    // unknown one never precedes it; a responsive row at 0.30 with gain 0.03/run (expected
    // gain 0.15 = the cap) precedes an unknown one at 0.28
    const fxA = fixture(E).map(sc=>{
      if(sc.name==='Tr Reactive Slow') return Object.assign({}, sc, { resp: { n: 8, gain: -0.01, src: 'attempts', nearness: 0.8, nearPct: 0.12, state: 'plateaued' } });   // pct 0.15, now plateaued
      if(sc.name==='Cl Static Micro') return Object.assign({}, sc, { pct: 0.30, resp: { n: 6, gain: 0.03, src: 'attempts', nearness: 0.98, nearPct: 0.01, state: 'responsive' } });
      if(sc.name==='Sw Switch Basic') return Object.assign({}, sc, { pct: 0.28 });
      return sc;
    });
    const sA = E.composeSession(fxA, OPTS, FILL);
    R.order = { items: sA.items.map(it=>[it.name, it.why, it.resp ? it.resp.state : null]), plateauedInWeakest: sA.items.filter(it=>it.why==='weakest').some(it=>it.name==='Tr Reactive Slow'),
      responsiveIdx: sA.items.findIndex(it=>it.name==='Cl Static Micro'), unknownIdx: sA.items.findIndex(it=>it.name==='Sw Switch Basic'),
      reasons: sA.items.filter(it=>['Cl Static Micro','Tr Reactive Slow'].includes(it.name)).map(it=>it.reason) };
    // board confidence + shrinkage: popLevel (fixture) 0.47; Fx Static Wide at 0.12 on a 300-player board
    // (conf 0.62 -> ranked ~0.25: from first to fifth of the weakest; a 24-player board would push it out of the five entirely)
    R.boardConf = { none: E.boardConfidence(null), b24: E.boardConfidence(24), b100: E.boardConfidence(100), b1000: E.boardConfidence(1000), b10k: E.boardConfidence(10000), b1m: E.boardConfidence(1107547) };
    const fxB = fixture(E).map(sc=> sc.name==='Fx Static Wide' ? Object.assign({}, sc, { boardN: 300 }) : (sc.name==='Tr Reactive Slow' ? Object.assign({}, sc, { boardN: 20000 }) : sc));
    const sB = E.composeSession(fxB, OPTS, FILL);
    const wide = sB.items.find(it=>it.name==='Fx Static Wide'), slow = sB.items.find(it=>it.name==='Tr Reactive Slow');
    R.shrink = { popLevel: sB.popLevel, wide: wide ? { conf: wide.conf, pct: wide.pct, pctShrunk: wide.pctShrunk, boardN: wide.boardN, reason: wide.reason } : null, slow: slow ? { conf: slow.conf, pctShrunk: slow.pctShrunk } : null,
      weakestOrder: sB.items.filter(it=>it.why==='weakest').map(it=>it.name) };
    // revisit forecast: Sw Old Switch (last visit 40 d ago) gets a neighbour A that rose 0.40 -> 0.52 after T and B that was played but did not move
    const fxC = fixture(E).map(sc=>{
      if(sc.name==='Sw Old Switch') return Object.assign({}, sc, { neighbours: [['Cl Wide Pasu', 0.5, 400], ['Tr Control Pill', 0.4, 300]], resp: { n: 5, gain: 0, src: 'attempts', nearness: 0.97, nearPct: 0.02, state: 'responsive' } });
      if(sc.name==='Cl Wide Pasu') return Object.assign({}, sc, { pct: 0.52, raises: [[T(10), 0.40, 0.52]], att: { n: 3, lastT: T(10), nearness: 1, recentBest: 1, daysSince: 10 } });
      if(sc.name==='Tr Control Pill') return Object.assign({}, sc, { att: { n: 3, lastT: T(5), nearness: 1, recentBest: 1, daysSince: 5 } });
      return sc;
    });
    const sC = E.composeSession(fxC, OPTS, FILL);
    const revC = sC.items.find(it=>it.why==='revisit');
    R.forecast = revC ? { name: revC.name, forecast: revC.forecast ? { gain: revC.forecast.gain, margin: revC.forecast.margin, odds: revC.forecast.odds, p: revC.forecast.p, evidence: revC.forecast.evidence.map(e=>[e.name, e.r, e.delta, e.via, e.synced]) } : null, reason: revC.reason } : null;
    // ...and with the forecast on the SECOND revisit candidate only (Tr Old Smooth, 20 d): it must jump ahead of the 40-day one
    const fxD = fixture(E).map(sc=>{
      if(sc.name==='Tr Old Smooth') return Object.assign({}, sc, { neighbours: [['Tr Recent Sphere', 0.6, 500]] });
      if(sc.name==='Tr Recent Sphere') return Object.assign({}, sc, { pct: 0.66, raises: [[T(2), 0.56, 0.66]] });
      return sc;
    });
    const sD = E.composeSession(fxD, OPTS, FILL);
    R.forecastOrder = sD.items.filter(it=>it.why==='revisit').map(it=>[it.name, it.forecast ? Math.round(it.forecast.p*100)/100 : null]);
    // template + profile confidence
    R.templates = {};
    [null, 0, 0.1, 0.29, 0.3, 0.35, 0.5, 0.65, 0.66, 0.9, 1].forEach(c=>{ [8, 10, 12].forEach(size=>{ const t = E.sessionTemplate(c, size); R.templates[String(c)+'@'+size] = [t.band, t.weakest, t.route, t.fillout, t.quickwin, t.revisit]; }); });
    R.confNoAtt = E.profileConfidence(fixture(E).map(sc=>Object.assign({}, sc, { att: null })), FIXED_MS, 45);
    // v0.5 blocks: the overlap map's independent set as the skill unit. Three
    // blocks by mechanic facet (clicking / tracking / switching); with them the
    // weakest slice must be SPREAD across blocks by standing, one COVERAGE item
    // goes to a block nothing touched in 14 days, every item carries its block,
    // and the result lists the block standings. Without opts.blocks the output is
    // the pinned v0.4 snapshot (asserted by `main` above).
    const fxBlocks = fixture(E);
    const blockOfRow = sc => { const f = sc.facets||[]; return f.includes('tracking') ? 'tracking' : f.includes('clicking') ? 'clicking' : f.includes('switching') ? 'switching' : null; };
    const BLOCKS = { of: name => { const sc = fxBlocks.find(x=>x.name===name); return sc ? blockOfRow(sc) : null; }, list: [{ id: 'tracking', name: 'tracking' }, { id: 'clicking', name: 'clicking' }, { id: 'switching', name: 'switching' }] };
    const sBl = E.composeSession(fxBlocks, Object.assign({}, OPTS, { blocks: BLOCKS }), FILL);
    const weakB = sBl.items.filter(it=>it.why==='weakest');
    R.blocks = { standings: (sBl.blocks||[]).map(b=>[b.id, b.rated, b.median===null ? null : Math.round(b.median*100)/100]),
      weakestBlocks: [...new Set(weakB.map(it=>it.block))].sort(), weakestCount: weakB.length,
      coverage: sBl.items.filter(it=>it.why==='coverage').map(it=>[it.name, it.block]),
      itemsWithBlock: sBl.items.filter(it=>it.block).length, size: sBl.items.length,
      sameAsV04: JSON.stringify(sBl.items.map(it=>it.name))===JSON.stringify(E.composeSession(fixture(E), OPTS, FILL).items.map(it=>it.name)) };
    // ---- BLOCK ROUTES (A2/S4, 2026-08-25): the evidence for a route is the whole block.
    // A candidate outside the weak item's block is scored by its MEAN r across every member
    // of that block it was tested against, and must survive its own standard error. It also
    // has to share no playlist with ANY member -- so here the switching block is moved into
    // a playlist of its own (PI), which is what makes a cross-playlist candidate possible at
    // all in a fixture this densely shared. Cl Dynamic Large [PF] is given ten measured
    // pairs into the ten switching scenarios; its single strongest pair is weaker than the
    // playlist-mate it beats, which is the point -- aggregated evidence over the block wins.
    const PI = '["Pack I","Intermediate"]';
    const SWITCHERS = fixture(E).filter(sc=>(sc.facets||[]).includes('switching')).map(sc=>sc.name);
    const fxBR = fixture(E).map(sc=>(sc.facets||[]).includes('switching') ? Object.assign({}, sc, { plKeys: [PI], playlists: 1 }) : sc);
    const CAND = 'Cl Dynamic Large';
    const brNames = SWITCHERS.concat([CAND]);
    const brE = [];
    SWITCHERS.forEach((nm, i)=>{ const ai = brNames.indexOf(nm), bi = brNames.indexOf(CAND);
      brE.push(Math.min(ai, bi), Math.max(ai, bi), 38 + (i % 5), 200 + i*10); });   // r 0.38-0.42 over 200+ shared players
    const brIndex = E.buildOverlapIndex({ pairs: { minShared: 100, names: brNames, e: brE } });
    const sBR = E.composeSession(fxBR, Object.assign({}, OPTS, { blocks: BLOCKS, pairsIndex: brIndex }), FILL);
    const brRoutes = sBR.items.filter(it=>it.why==='route');
    R.blockRoutes = { routes: brRoutes.map(it=>({ name: it.name, target: it.via && it.via.target, block: it.via && it.via.block })),
      members: SWITCHERS.length, minPairs: E.ROUTE_MIN_PAIRS,
      cand: E.blockRouteCandidates(brIndex, new Set(SWITCHERS), {}).map(c=>[c.name, Math.round(c.meanR*1000)/1000, c.pairs, c.lower>0]),
      thin: E.blockRouteCandidates(brIndex, new Set(SWITCHERS.slice(0, 4)), {}).length };
    R.confWithAtt = E.profileConfidence(fixture(E), FIXED_MS, 45);
    const sLow = E.composeSession(fixture(E), Object.assign({}, OPTS, { confidence: { c: 0.2 } }), FILL);
    const sHigh = E.composeSession(fixture(E), Object.assign({}, OPTS, { confidence: { c: 0.9 } }), FILL);
    const sMid = E.composeSession(fixture(E), Object.assign({}, OPTS, { confidence: { c: 0.5 } }), FILL);
    const whyCounts = s => s.items.reduce((m, it)=>{ m[it.why] = (m[it.why]||0)+1; return m; }, {});
    R.bands = { low: { template: sLow.template, whys: whyCounts(sLow), n: sLow.items.length }, high: { template: sHigh.template, whys: whyCounts(sHigh), n: sHigh.items.length }, mid: { template: sMid.template, items: sMid.items.map(item) } };
    // game knob: Tr Smooth Thin (0.25) carries a game facet; Fx Static Small (a neighbour of Fx Static Wide, r 0.62) carries one too
    const fxG = fixture(E).map(sc=> (sc.name==='Tr Smooth Thin' || sc.name==='Fx Static Small') ? Object.assign({}, sc, { gameHit: true, facets: sc.facets.concat(['game:cs/val']) }) : sc);
    const sG1 = E.composeSession(fxG, Object.assign({}, OPTS, { gameWeight: 1 }), FILL);
    const sG0 = E.composeSession(fxG, Object.assign({}, OPTS, { gameWeight: 0 }), FILL);
    R.game = { on: sG1.items.map(it=>[it.name, it.why, it.game]), offSameAsMain: JSON.stringify(sG0.items.map(item))===JSON.stringify(E.composeSession(fixture(E), OPTS, FILL).items.map(item)),
      reasons: sG1.items.filter(it=>it.game).map(it=>it.reason) };
    // session history stats: three logged sessions across two weeks (Mon 2026-08-10 .. Sun 2026-08-23), the live one excluded from the totals
    const dayOf = ms => Math.floor((ms - new Date(ms).getTimezoneOffset()*60000)/DAY);
    const log = [
      { day: dayOf(T(12)), seedBump: 0, startedAt: T(12), rating: 'good', regime: 'normal', done: 6, size: 10, conf: 0.5, template: { weakest: 5 }, items: [{ name: 'A', why: 'revisit', pbAt: 100, p: 0.8 }, { name: 'B', why: 'weakest', pbAt: 50 }] },
      { day: dayOf(T(5)), seedBump: 0, startedAt: T(5), rating: 'hard', regime: 'normal', done: 3, size: 10, conf: 0.5, template: { weakest: 5 }, items: [{ name: 'C', why: 'revisit', pbAt: 200, p: 0.4 }, { name: 'D', why: 'revisit', pbAt: 300, p: 0.6 }] },
      { day: dayOf(FIXED_MS), seedBump: 1, startedAt: FIXED_MS, rating: null, regime: 'normal', done: 0, size: 10, conf: 0.5, template: { weakest: 5 }, items: [{ name: 'E', why: 'revisit', pbAt: 10, p: 0.9 }] }
    ];
    const H = E.sessionHistoryStats(log, { A: 110, B: 50, C: 200, D: 310, E: 20 }, FIXED_MS, { day: dayOf(FIXED_MS), seedBump: 1 });
    R.history = { sessions: H.sessions.map(s=>[s.day - dayOf(FIXED_MS), s.rating, s.done, s.revisits, s.collected, s.predicted, s.live, s.resolved]), weeks: H.weeks.map(w=>[w.weekStart - dayOf(FIXED_MS), w.sessions, w.revisits, w.collected, w.rate, w.predicted, w.ratings]), overall: H.overall };

    // ---- R6: WHEN it stopped improving (2026-08-25) ---------------------------------
    // A changepoint search without a penalty always finds a changepoint -- it returns the
    // least-bad split of pure noise. The penalty is what makes a null answer possible, so
    // the straight and the flat series are the load-bearing cases here.
    const rising  = [0.10, 0.14, 0.18, 0.22, 0.26, 0.30, 0.34, 0.38, 0.42, 0.46];
    const flat    = [0.30, 0.31, 0.29, 0.30, 0.31, 0.29, 0.30, 0.31, 0.29, 0.30];
    const plateau = [0.10, 0.16, 0.22, 0.28, 0.34, 0.40, 0.40, 0.41, 0.40, 0.39];   // climbs, then stops
    const times   = plateau.map((u, i)=>FIXED_MS - (plateau.length-1-i)*DAY);
    R.changepoint = {
      rising:  E.changePoint(rising).index,
      flat:    E.changePoint(flat).index,
      plateau: E.changePoint(plateau).index,
      short:   E.changePoint([0.1, 0.5, 0.1, 0.5]).index,
      minRuns: E.CHANGEPOINT_MIN_RUNS,
      since:   (()=>{ const ps = E.plateauSince(plateau, times); return ps ? { index: ps.index, days: Math.round((FIXED_MS - ps.at)/DAY), drop: Math.round(ps.drop*1000)/1000, after: Math.round(ps.after*1000)/1000 } : null; })(),
      // an UPWARD change is a breakthrough, not a plateau, and must not be reported as one
      breakthrough: E.plateauSince([0.10, 0.11, 0.09, 0.10, 0.11, 0.40, 0.41, 0.39, 0.42, 0.40], times)
    };
    // ---- S6: "stuck" without the play-count drift (2026-08-25) ----------------------
    // The old test compared the best of the last five against the ALL-TIME PB, which is
    // the maximum of every run ever -- so the ratio falls as the run count grows, purely
    // by arithmetic. The replacement asks what share of the OLDER runs the recent best
    // beats; under "nothing has changed" that expectation is k/(k+1) whatever n is.
    const mkRec = scores => ({ n: scores.length, last: scores.map((v, i)=>[FIXED_MS - i*DAY, v]) });
    // the same recent form (best of five = 82) against a long history and a short one:
    // the old rule's reading drifts between them, the new one does not
    const longHist  = mkRec([78, 80, 75, 82, 79].concat(Array.from({ length: 15 }, (u, i)=>70 + (i % 7))));
    const shortHist = mkRec([78, 80, 75, 82, 79, 71, 73]);
    R.stuck = {
      // recent best 82 beats every older run in the 70-76 band -> not stuck, on both
      longNotStuck:  E.stuckness(longHist, 100, 5),
      shortNotStuck: E.stuckness(shortHist, 100, 5),
      // recent window well under an older run history -> stuck, and by the SAME reading
      // whether the history is long or short
      longStuck:  E.stuckness(mkRec([60, 62, 58, 61, 59].concat(Array.from({ length: 15 }, (u, i)=>90 + (i % 5)))), 100, 5),
      shortStuck: E.stuckness(mkRec([60, 62, 58, 61, 59, 90, 92, 91]), 100, 5),
      // no older window at all: the PB reading is the only signal, and it says so
      noOlder: E.stuckness(mkRec([60, 62, 58, 61]), 100, 5),
      empty:   E.stuckness(null, 100, 5),
      // the drift the fix removes: the OLD rule on the two histories above
      oldRuleLong:  Math.max(82) / 100,
      oldRuleShort: Math.max(82) / 100
    };
    // ---- A4 SOFT MEMBERSHIP (2026-08-25) --------------------------------------------
    // A scenario that is not a stable member of any community can still be PLACED by
    // measurement: its mean r against each community's members, cross-playlist. But only
    // when the measurement is decisive. On the shipped map 32 of 135 eligible scenarios
    // have two communities within a standard error of each other -- those are hybrids
    // (Owen's pokeball case), and naming a winner would be fabricating structure.
    const AF_A = ['ma1','ma2','ma3','ma4','ma5','ma6','ma7','ma8','ma9','ma10','ma11','ma12'];
    const AF_B = ['mb1','mb2','mb3','mb4','mb5','mb6','mb7','mb8','mb9','mb10','mb11','mb12'];
    const afNames = AF_A.concat(AF_B, ['clear', 'tied', 'thin', 'negative', 'mate']);
    const afE = [];
    const push = (x, y, r100, n)=>{ const ai = afNames.indexOf(x), bi = afNames.indexOf(y); afE.push(Math.min(ai,bi), Math.max(ai,bi), r100, n); };
    // `clear` leans A hard and B barely -- decisive
    AF_A.forEach((m, i)=>push('clear', m, 30 + (i % 3), 200));
    AF_B.forEach((m, i)=>push('clear', m, 2 + (i % 3), 200));
    // `tied` sits the same distance from both -- a measured hybrid, and it must stay unplaced
    AF_A.forEach((m, i)=>push('tied', m, 15 + (i % 3), 200));
    AF_B.forEach((m, i)=>push('tied', m, 15 + ((i+1) % 3), 200));
    // `thin` has only a handful of measured pairs into A -- no claim to make
    AF_A.slice(0, 4).forEach((m, i)=>push('thin', m, 40, 200));
    // `negative` moves AGAINST both
    AF_A.forEach((m, i)=>push('negative', m, -20, 200));
    AF_B.forEach((m, i)=>push('negative', m, -18, 200));
    // `mate` leans A hard, but shares a playlist with every A member: co-training, not affinity
    AF_A.forEach((m, i)=>push('mate', m, 45, 200));
    const afIndex = E.buildOverlapIndex({ pairs: { minShared: 100, names: afNames, e: afE } });
    const afSets = new Map([['A', new Set(AF_A)], ['B', new Set(AF_B)]]);
    const afPl = name => (name==='mate' || AF_A.includes(name)) ? ['["Shared","Easy"]'] : ['["Own","Easy"]'];
    const affOf = (name, opts)=>E.scenarioAffinity(afIndex, name, afSets, opts||{});
    const assignOf = (name, opts)=>E.affinityAssignment(affOf(name, opts));
    R.affinity = {
      clear:    (()=>{ const a = assignOf('clear');    return { id: a.id, decisive: a.decisive, why: a.why, top: a.top ? [a.top.id, Math.round(a.top.meanR*100)/100, a.top.pairs] : null }; })(),
      tied:     (()=>{ const a = assignOf('tied');     return { id: a.id, decisive: a.decisive, why: a.why }; })(),
      thin:     (()=>{ const a = assignOf('thin');     return { id: a.id, decisive: a.decisive, why: a.why }; })(),
      negative: (()=>{ const a = assignOf('negative'); return { id: a.id, decisive: a.decisive, why: a.why }; })(),
      // with the playlist filter on, `mate` has nothing left to measure; without it, it
      // would be placed in A on pure co-training -- the whole point of A2 restated here
      mateFiltered:   assignOf('mate', { plOf: afPl }).why,
      mateUnfiltered: assignOf('mate').id,
      unknown:  E.affinityAssignment(affOf('nobody-here')).why,
      minPairs: E.AFFINITY_MIN_PAIRS
    };
    // ---- A3 ROTATION (2026-08-25) --------------------------------------------------
    // Owen: "I don't like that every session has the same structure." The day now has a
    // PURPOSE, chosen by a trigger, and the trigger is asserted here rather than trusted.
    const T0 = { confidence: { c: 0.5 }, collectReady: 0, weakBlockTouchedDays: 30, weakBlockSinks: false, blocksWithoutStanding: 0, recentTypes: [] };
    const pick = over => E.chooseSessionType(Object.assign({}, T0, over)).type;
    R.types = {
      dflt:        pick({}),
      collect:     pick({ collectReady: E.COLLECT_MIN }),
      belowCollect:pick({ collectReady: E.COLLECT_MIN - 1 }),
      thinConf:    pick({ confidence: { c: 0.2 } }),
      noStanding:  pick({ blocksWithoutStanding: 1 }),
      sinks:       pick({ weakBlockSinks: true }),
      justWorked:  pick({ weakBlockTouchedDays: 3 }),
      // never the same thing three days running -- but a ripe revisit does not get less ripe
      flipFloor:   pick({ recentTypes: ['floor', 'floor'] }),
      flipTransfer:pick({ weakBlockSinks: true, recentTypes: ['transfer', 'transfer'] }),
      collectSticks: pick({ collectReady: 3, recentTypes: ['collect', 'collect'] }),
      // Number(null) is 0 and 0 is finite, so the careless spelling reads "this block has
      // never been touched" as "worked today" (always transfer) and "no confidence reading"
      // as confidence 0 (always breadth). Both bit here on the day this was written.
      neverTouched: pick({ weakBlockTouchedDays: null }),
      noConfReading: pick({ confidence: { c: null } }),
      noConfAtAll: pick({ confidence: null })
    };
    // ...and the composition follows the type: the template is that type's, the size holds,
    // and turning the rotation OFF is the pre-A3 behaviour exactly (which the main snapshot pins).
    const rotOpts = extra => Object.assign({}, OPTS, { blocks: BLOCKS, rotate: true }, extra||{});
    const sRot = E.composeSession(fixture(E), rotOpts(), FILL);
    const slotsOf = res => { const c = {}; res.items.forEach(it=>{ c[it.why] = (c[it.why]||0)+1; }); return c; };
    R.rotation = { type: sRot.type, hasWhy: !!(sRot.typeWhy && sRot.typeWhy.length > 20), size: sRot.items.length,
      template: sRot.template ? [sRot.template.weakest, sRot.template.route, sRot.template.fillout, sRot.template.quickwin, sRot.template.revisit] : null,
      wanted: (()=>{ const t = E.SESSION_TYPES[sRot.type]; return t ? [t.weakest, t.route, t.fillout, t.quickwin, t.revisit] : null; })(),
      offType: E.composeSession(fixture(E), Object.assign({}, OPTS, { blocks: BLOCKS }), FILL).type,
      slots: slotsOf(sRot) };
    // Sampling: the same rules, different scenarios day to day. Across twenty day-seeds the
    // weakest slice must not be the same list every time (that was the complaint) while the
    // scenarios it draws from stay the weak end of the pool.
    const weakestNamesFor = (seed, extra) => E.composeSession(fixture(E), rotOpts(Object.assign({ seed }, extra||{})), FILL)
      .items.filter(it=>it.why==='weakest' || it.why==='coverage').map(it=>it.name);
    const seeds = Array.from({ length: 20 }, (unused, i)=>i+1);
    const lists = seeds.map(sd=>weakestNamesFor(sd));
    R.sampling = {
      distinctLists: new Set(lists.map(l=>JSON.stringify(l))).size,
      // determinism: the same seed twice is the same list
      stable: JSON.stringify(weakestNamesFor(7))===JSON.stringify(weakestNamesFor(7)),
      // the pool it draws from: every drawn name must be a played, non-maxed row at/under level
      allEligible: (()=>{ const ok = new Set(fixture(E).filter(sc=>sc.played && !sc.maxed && sc.rung<=4).map(sc=>sc.name)); return lists.every(l=>l.every(n=>ok.has(n))); })(),
      // recency damping: naming the three most-drawn scenarios as recently served must
      // reduce how often they come back
      damped: (()=>{
        const count = (ls, names) => ls.reduce((a, l)=>a + l.filter(n=>names.has(n)).length, 0);
        const freq = new Map(); lists.forEach(l=>l.forEach(n=>freq.set(n, (freq.get(n)||0)+1)));
        const top3 = new Set([...freq.entries()].sort((a,b)=> b[1]-a[1] || (a[0]<b[0]?-1:1)).slice(0, 3).map(e=>e[0]));
        const before = count(lists, top3);
        const after = count(seeds.map(sd=>weakestNamesFor(sd, { recentItems: top3 })), top3);
        return { before, after };
      })()
    };
    // ---- R2 SCORING (2026-08-25) ----------------------------------------------------
    // The return-collect rate needs a null model or it cannot say anything. P(first-try PB)
    // with nothing changed is 1/(n+1) on n prior attempts -- parameter-free.
    R.baseline = { n0: E.collectBaseline(0), n1: E.collectBaseline(1), n9: E.collectBaseline(9), missing: E.collectBaseline(null) };
    const logOf = rows => rows.map((r, i)=>({ day: 100+i, seedBump: 0, startedAt: i, rating: null, regime: 'normal', done: 5, size: 10,
      items: [{ name: 'S'+i, why: 'revisit', pbAt: 100, p: r.p, n: r.n }] }));
    // four revisits: the coach says 0.9/0.9/0.1/0.1 and two of them land, on scenarios with
    // 9 attempts each (baseline 0.1 throughout)
    const mixed = E.sessionHistoryStats(logOf([{ p: 0.9, n: 9 }, { p: 0.9, n: 9 }, { p: 0.1, n: 9 }, { p: 0.1, n: 9 }]),
      name => (name==='S0' || name==='S1') ? 200 : 50, FIXED_MS, null);
    // a forecast that is exactly the null model can have no skill over it
    const same = E.sessionHistoryStats(logOf([{ p: 0.1, n: 9 }, { p: 0.1, n: 9 }]), name => name==='S0' ? 200 : 50, FIXED_MS, null);
    // a perfect forecast removes all of the null model's error
    const perfect = E.sessionHistoryStats(logOf([{ p: 1, n: 9 }, { p: 0, n: 9 }]), name => name==='S0' ? 200 : 50, FIXED_MS, null);
    R.scoring = {
      mixed: { rate: mixed.overall.rate, baseline: mixed.overall.baseline, scoredOn: mixed.overall.scoredOn,
        brier: mixed.overall.brier, brierBase: mixed.overall.brierBase, skill: mixed.overall.skill,
        bins: mixed.overall.reliability.filter(b=>b.n>0).map(b=>[b.n, b.predicted, b.observed]) },
      sameAsBase: same.overall.skill,
      perfect: { brier: perfect.overall.brier, skill: perfect.overall.skill },
      noN: E.sessionHistoryStats(logOf([{ p: 0.5 }]), () => 200, FIXED_MS, null).overall.scoredOn
    };

    // ---- calibrateScenarios: the boundary every ranking now passes through --------------
    // Review Ledger IV BUG-4. This function applies the board offsets AND quantile-maps a
    // curve-less scenario's To 2nd onto the same scale, and the suite that gates the deploy
    // never executed either branch: OPTS carries no `offsets`, so only the identity path ran.
    // Steps 5, 6 and 7b all touch the metric again, so it gets pinned first.
    const calRow = (name, pct, to2nd, played) => ({ name, played: played !== false, pct, to2nd,
      toMax: 0.5, toNext: 0.5, maxed: false, rung: 3, labels: [], facets: [], playlists: 1,
      plKeys: [], att: null, raises14d: 0, neighbours: [] });
    // 25 curved played rows, percentile and To 2nd both rising -- enough to clear
    // METRIC_MIN_CURVED (20) so the quantile map is allowed to run.
    const curved = Array.from({ length: 25 }, (u, i) => calRow('C' + i, (i + 1) / 26, (i + 1) / 26));
    const noCurveLow  = Object.assign(calRow('NoCurveLow',  null, 0.10));
    const noCurveHigh = Object.assign(calRow('NoCurveHigh', null, 0.90));
    const unplayed    = calRow('Unplayed', null, 0, false);
    const base = curved.concat([noCurveLow, noCurveHigh, unplayed]);
    const find = (rows, n) => rows.find(r => r.name === n);

    // (a) no offsets: curved rows keep their percentile, and `calibrated` must be FALSE.
    const calNone = E.calibrateScenarios(base.map(r => Object.assign({}, r)), { offsets: null });
    // (b) offsets that name NONE of these rows -- the Number(null) trap: deltaOf must answer
    //     null, not 0, or every uncalibrated build reports itself calibrated.
    const calMiss = E.calibrateScenarios(base.map(r => Object.assign({}, r)), { offsets: { 'Nobody': [1.5, 40] } });
    // (c) real offsets on two rows: a POSITIVE delta lowers a percentile, a negative one raises it.
    const calSome = E.calibrateScenarios(base.map(r => Object.assign({}, r)), { offsets: { 'C4': [1.2, 90], 'C20': [-1.2, 90] } });
    // (d) idempotent: a row set that already carries `m` comes back untouched.
    const calTwice = E.calibrateScenarios(calSome, { offsets: { 'C4': [1.2, 90], 'C20': [-1.2, 90] } });
    // (e) under METRIC_MIN_CURVED there is nothing to map onto, so To 2nd stays raw.
    const thin = curved.slice(0, 5).concat([Object.assign({}, noCurveLow)]);
    const calThin = E.calibrateScenarios(thin.map(r => Object.assign({}, r)), { offsets: null });

    R.calibrate = {
      none: { calibrated: !!calNone.calibrated, offsetsUsed: calNone.offsetsUsed || 0,
        c4m: find(calNone, 'C4').m, c4pct: find(calNone, 'C4').pct, c4scale: find(calNone, 'C4').mScale,
        curved: calNone.curved, mapped: calNone.mapped },
      missOffsets: { calibrated: !!calMiss.calibrated, offsetsUsed: calMiss.offsetsUsed || 0, c4m: find(calMiss, 'C4').m },
      some: { calibrated: !!calSome.calibrated, offsetsUsed: calSome.offsetsUsed || 0,
        c4m: find(calSome, 'C4').m, c4raw: find(calSome, 'C4').pctRaw, c4pctBefore: (4 + 1) / 26,
        c20m: find(calSome, 'C20').m, c20raw: find(calSome, 'C20').pctRaw, c20pctBefore: (20 + 1) / 26,
        c9m: find(calSome, 'C9').m, c9raw: find(calSome, 'C9').pctRaw === undefined ? null : find(calSome, 'C9').pctRaw },
      mapped: { lowM: find(calNone, 'NoCurveLow').m, lowMapped: !!find(calNone, 'NoCurveLow').mMapped,
        lowScale: find(calNone, 'NoCurveLow').mScale,
        highM: find(calNone, 'NoCurveHigh').m, highMapped: !!find(calNone, 'NoCurveHigh').mMapped },
      unplayed: { m: find(calNone, 'Unplayed').m, scale: find(calNone, 'Unplayed').mScale, mapped: !!find(calNone, 'Unplayed').mMapped },
      thin: { m: find(calThin, 'NoCurveLow').m, scale: find(calThin, 'NoCurveLow').mScale, mapped: !!find(calThin, 'NoCurveLow').mMapped },
      idempotent: calTwice === calSome,
      adjust: { zero: E.adjustPercentile(0.5, 0), up: E.adjustPercentile(0.5, -1), down: E.adjustPercentile(0.5, 1),
        atZero: E.adjustPercentile(0, 2), atOne: E.adjustPercentile(1, -2), nullIn: E.adjustPercentile(null, 1) }
    };

    // ---- COACH-2 + Q4: resolution from the RUN RECORD ------------------------------------
    // An item is scored only once a run is logged AFTER it was served, and the outcome is
    // that FIRST run -- the event 1/(n+1) actually describes. The old rule scored "the PB
    // rose at some point" against that baseline, and counted a revisit you never attempted
    // as a miss. Both are pinned here, in both directions.
    const servedAt = 1000;
    const logRuns = rows => rows.map((r, i) => ({ day: 200 + i, seedBump: 0, startedAt: servedAt, rating: null,
      regime: 'normal', done: 5, size: 10,
      items: [{ name: 'R' + i, why: 'revisit', pbAt: 100, p: r.p, n: r.n }] }));
    // R0 first run back beats it (a true first-try collect)
    // R1 first run misses, a LATER run beats it -- the old rule called this collected
    // R2 never attempted after being served -- the old rule called this a miss
    // R3 attempted, never beaten
    const RUNS = {
      R0: [[servedAt + 10, 150]],
      R1: [[servedAt + 10,  90], [servedAt + 20, 150]],
      R2: [[servedAt - 50, 150]],                       // only a run from BEFORE it was served
      R3: [[servedAt + 10,  80], [servedAt + 20,  90]]
    };
    const runsOf = name => RUNS[name] || null;
    const fourLog = logRuns([{ p: 0.5, n: 9 }, { p: 0.5, n: 9 }, { p: 0.5, n: 9 }, { p: 0.5, n: 9 }]);
    const strict = E.sessionHistoryStats(fourLog, () => 150, FIXED_MS, null, runsOf);
    const legacy = E.sessionHistoryStats(fourLog, () => 150, FIXED_MS, null);
    R.resolve = {
      strict: { revisits: strict.overall.revisits, scheduled: strict.overall.scheduled,
        collected: strict.overall.collected, collectedAny: strict.overall.collectedAny,
        rate: strict.overall.rate, rateAny: strict.overall.rateAny, from: strict.overall.resolvedFrom,
        rows: strict.sessions.slice().sort((a, b) => a.day - b.day).map(x => {
          const r = x.rows[0];
          return [r.name, r.resolved, r.hit, r.hitAny, r.k, r.base, r.baseAny];
        }) },
      legacy: { revisits: legacy.overall.revisits, collected: legacy.overall.collected, from: legacy.overall.resolvedFrom },
      // Q4: every served item, not only revisits
      served: { items: strict.overall.served.items, resolved: strict.overall.served.resolved,
        firstTry: strict.overall.served.firstTry, anyTime: strict.overall.served.anyTime,
        runs: strict.overall.served.runs },
      // an unresolved item must not be scored, so the Brier pool shrinks to the resolved ones
      scoredOn: strict.overall.scoredOn
    };
    // A mixed non-revisit session: the served stats must count weakest/route items too.
    const mixedLog = [{ day: 300, seedBump: 0, startedAt: servedAt, rating: null, regime: 'normal', done: 2, size: 3,
      items: [{ name: 'R0', why: 'weakest', pbAt: 100, n: 9 }, { name: 'R3', why: 'route', pbAt: 100, n: 9 },
              { name: 'R2', why: 'revisit', pbAt: 100, p: 0.5, n: 9 }] }];
    const mixed2 = E.sessionHistoryStats(mixedLog, () => 150, FIXED_MS, null, runsOf);
    R.resolve.mixed = { servedItems: mixed2.overall.served.items, servedResolved: mixed2.overall.served.resolved,
      servedFirstTry: mixed2.overall.served.firstTry, revisitsResolved: mixed2.overall.revisits };

    // ---- COACH-3: the exact null for "stuck" ---------------------------------------------
    // The bar is expectation - 1 SD, and the SD is now the exact one. It equals the binomial
    // SD at m = 1 and is materially larger for a long record, which is where the old form
    // let the flag drift with play count.
    const mkRunsC3 = scores => ({ n: scores.length, last: scores.map((v, i) => [FIXED_MS - i * DAY, v]) });
    const longFlat = mkRunsC3([90, 91, 89, 92, 90].concat(Array.from({ length: 15 }, (u, i) => 88 + (i % 5))));
    R.stuckNull = {
      long: (() => { const st = E.stuckness(longFlat, 100, 5); return { older: st.older, share: st.share, se: st.se, seBinomial: st.seBinomial, p: st.p, state: st.state }; })(),
      m1: (() => { const st = E.stuckness(mkRunsC3([90, 91, 89, 92, 90, 60]), 100, 5); return { older: st.older, se: st.se, seBinomial: st.seBinomial }; })()
    };

    // ---- NEXT-4: the randomised arm -------------------------------------------------------
    // Three things have to hold or the experiment measures nothing:
    //   1. OFF is the identity -- every pre-NEXT-4 path is untouched.
    //   2. The B arm DISPLACES: the withheld top pick must NOT also appear in the session.
    //      A swap would serve both and there would be no contrast at all.
    //   3. Roughly ARM_B_SHARE of slots go B over many seeds, and every served revisit
    //      carries an arm.
    const armOn = seed => E.composeSession(fixture(E), Object.assign({}, OPTS, { seed, rotate: true, arm: true }), FILL);
    const armOff = seed => E.composeSession(fixture(E), Object.assign({}, OPTS, { seed, rotate: true }), FILL);
    const revsOf = s2 => s2.items.filter(it=>it.why==='revisit');
    let bSlots = 0, aSlots = 0, armless = 0, displaced = 0, dupes = 0;
    for(let seed=1; seed<=200; seed++){
      const on = armOn(seed);
      const revs = revsOf(on);
      revs.forEach(it=>{ if(it.arm==='B') bSlots++; else if(it.arm==='A') aSlots++; else armless++; });
      // no scenario may be served twice in one session, arm or no arm
      const names = on.items.map(it=>it.name);
      if(new Set(names).size !== names.length) dupes++;
      // when a slot went B, the candidate it displaced must be absent from the whole session
      if(revs.some(it=>it.arm==='B')) displaced++;
    }
    // the identity check, on a seed whose ON run actually used the B arm
    let sameSeed = null;
    for(let seed=1; seed<=60 && sameSeed===null; seed++){ if(revsOf(armOn(seed)).some(it=>it.arm==='B')) sameSeed = seed; }
    const onS = sameSeed===null ? null : armOn(sameSeed), offS = sameSeed===null ? null : armOff(sameSeed);
    R.arm = {
      share: E.ARM_B_SHARE, minPerArm: E.ARM_MIN_PER_ARM,
      aSlots, bSlots, armless, dupes,
      bShareObserved: (aSlots + bSlots) ? bSlots/(aSlots + bSlots) : null,
      offHasNoArm: armOff(7).items.every(it=>!it.arm),
      offIdentical: JSON.stringify(armOff(7).items.map(item)) === JSON.stringify(E.composeSession(fixture(E), Object.assign({}, OPTS, { seed: 7, rotate: true }), FILL).items.map(item)),
      // the displacement: on a seed that used B, the withheld candidate is not in the session
      displacedAbsent: (onS && offS) ? (()=>{
        const onNames = new Set(onS.items.map(it=>it.name));
        const bItem = revsOf(onS).find(it=>it.arm==='B');
        // the A-arm run for the same seed serves the top pick for that slot; under B it is held back
        const offRevs = revsOf(offS).map(it=>it.name);
        const withheld = offRevs.find(n=>!onNames.has(n));
        return { bItem: bItem ? bItem.name : null, withheld: withheld || null, stillServed: withheld ? onNames.has(withheld) : null };
      })() : null,
      // and the item must not leak its arm into anything the page renders
      leaks: (()=>{ const on = onS || armOn(1); return on.items.filter(it=>/\barm\b|runner-?up|second pick/i.test(String(it.reason||''))).length; })()
    };
    // the comparison in sessionHistoryStats
    const armLog = rows => rows.map((r, i)=>({ day: 400+i, seedBump: 0, startedAt: 500, rating: null, regime: 'normal', done: 5, size: 10,
      items: [{ name: 'A'+i, why: 'revisit', pbAt: 100, p: 0.5, n: 9, arm: r.arm }] }));
    // six A (four collected) and six B (one collected), every one attempted once after serving
    const armRuns = {};
    const armRows = [];
    [['A', 1], ['A', 1], ['A', 1], ['A', 1], ['A', 0], ['A', 0], ['B', 1], ['B', 0], ['B', 0], ['B', 0], ['B', 0], ['B', 0]]
      .forEach((r, i)=>{ armRuns['A'+i] = [[600, r[1] ? 150 : 50]]; armRows.push({ arm: r[0] }); });
    const armH = E.sessionHistoryStats(armLog(armRows), () => 150, FIXED_MS, null, n => armRuns[n] || null);
    R.armStats = { a: armH.overall.arms.a, b: armH.overall.arms.b, diff: armH.overall.arms.diff,
      scorable: armH.overall.arms.scorable, unassigned: armH.overall.arms.unassigned };

    // ---- step 3c: the exposure window, and the served ledger -------------------------
    // THE REGRESSION THIS PINS. Before 3c an exposure searched the whole future for its
    // first run, independently of every other exposure, so ONE run resolved EVERY earlier
    // serving of that scenario. Served day 100 as arm A, served day 104 as arm B, played
    // ONCE on day 105: both bookings scored a first-try collect off the same run and the
    // same run entered BOTH arms. That is a perfectly correlated pair inside the one
    // comparison whose validity rests on the piles being independent draws, and it needs
    // no reroll -- an ordinary re-serve is enough.
    const DAYMS = 86400000, TB = 1787000000000;
    const oneRunLog = [
      { day: 100, seedBump: 0, startedAt: TB,           rating: null, regime: 'normal', done: 1, size: 1,
        items: [{ name: 'W', why: 'revisit', pbAt: 100, p: 0.5, n: 9, arm: 'A' }] },
      { day: 104, seedBump: 0, startedAt: TB + 4*DAYMS, rating: null, regime: 'normal', done: 1, size: 1,
        items: [{ name: 'W', why: 'revisit', pbAt: 100, p: 0.5, n: 9, arm: 'B' }] }
    ];
    const oneRun = { W: [[TB + 5*DAYMS, 150]] };                  // exactly ONE run, and it is a PB
    const W1 = E.sessionHistoryStats(oneRunLog, () => 150, TB + 6*DAYMS, null, n => oneRun[n] || null);
    // and the mirror: the run lands INSIDE the first window, so the FIRST serving owns it
    const early = { W: [[TB + 2*DAYMS, 150]] };
    const W2 = E.sessionHistoryStats(oneRunLog, () => 150, TB + 6*DAYMS, null, n => early[n] || null);
    // a run landing exactly when the next session was composed belongs to the OLDER window
    const onBoundary = { W: [[TB + 4*DAYMS, 150]] };
    const W3 = E.sessionHistoryStats(oneRunLog, () => 150, TB + 6*DAYMS, null, n => onBoundary[n] || null);
    R.window = {
      lateRun:  { resolved: W1.overall.revisits, collected: W1.overall.collected,
                  aN: W1.overall.arms.a.n, bN: W1.overall.arms.b.n },
      earlyRun: { resolved: W2.overall.revisits, aN: W2.overall.arms.a.n, bN: W2.overall.arms.b.n },
      boundary: { aN: W3.overall.arms.a.n, bN: W3.overall.arms.b.n },
      windowed: W1.overall.windowed,
      // windowEnds itself: three servings of one name, one of another
      ends: (()=>{
        const xs = [{ key: 'k1', name: 'A', at: 10 }, { key: 'k2', name: 'A', at: 20 },
                    { key: 'k3', name: 'A', at: 30 }, { key: 'k4', name: 'B', at: 15 }];
        const m = E.windowEnds(xs);
        return { k1: m.get('k1'), k2: m.get('k2'), k3: m.get('k3'), k4: m.get('k4') };
      })()
    };
    // ---- the ledger is the authority, and it keeps what the log threw away -----------
    // Day 300 served X (arm A) and was REROLLED: seedBump 1 served Y (arm B), and the log
    // kept only the reroll. The ledger kept both. X was played after being served and
    // before the reroll, so it resolves -- and under the log alone it does not exist.
    const rerollLog = [
      { day: 300, seedBump: 1, startedAt: TB + 3600000, rating: null, regime: 'normal', done: 1, size: 1,
        items: [{ name: 'Y', why: 'revisit', pbAt: 100, p: 0.5, n: 9, arm: 'B' }] }
    ];
    const ledger = [
      { name: 'X', why: 'revisit', pbAt: 100, p: 0.5, n: 9, arm: 'A', day: 300, seedBump: 0, servedAt: TB },
      { name: 'Y', why: 'revisit', pbAt: 100, p: 0.5, n: 9, arm: 'B', day: 300, seedBump: 1, servedAt: TB + 3600000 }
    ];
    const played = { X: [[TB + 600000, 150]], Y: [[TB + 7200000, 150]] };
    const runsPlayed = n => played[n] || null;
    const noLedger = E.sessionHistoryStats(rerollLog, () => 150, TB + 2*DAYMS, null, runsPlayed);
    const withLedger = E.sessionHistoryStats(rerollLog, () => 150, TB + 2*DAYMS, null, runsPlayed, ledger);
    R.ledger = {
      without: { aN: noLedger.overall.arms.a.n, bN: noLedger.overall.arms.b.n,
                 from: noLedger.overall.resolvedFrom, orphans: noLedger.overall.orphans },
      with:    { aN: withLedger.overall.arms.a.n, aHits: withLedger.overall.arms.a.hits,
                 bN: withLedger.overall.arms.b.n, bHits: withLedger.overall.arms.b.hits,
                 from: withLedger.overall.resolvedFrom, orphans: withLedger.overall.orphans,
                 sessions: withLedger.overall.sessions },
      // an empty or absent ledger must leave the log path exactly as it was
      emptyIsIdentity: JSON.stringify(E.sessionHistoryStats(rerollLog, () => 150, TB + 2*DAYMS, null, runsPlayed, []).overall)
                    === JSON.stringify(noLedger.overall),
      // A pre-3c session could list the SAME scenario twice -- the owner's own day-20687
      // session has Gridshot as both a revisit and the weakest pick. A name-keyed exposure
      // silently merged the two; the key is positional so both survive, and the windowing
      // still hands the single run to exactly one of them.
      twice: (()=>{
        const dupLog = [{ day: 400, seedBump: 0, startedAt: TB, rating: null, regime: 'normal', done: 1, size: 2,
          items: [{ name: 'D', why: 'revisit', pbAt: 100, p: 0.5, n: 9, arm: 'A' },
                  { name: 'D', why: 'weakest', pbAt: 100, p: 0.5, n: 9 }] }];
        const H = E.sessionHistoryStats(dupLog, () => 150, TB + 2*DAYMS, null, n => n==='D' ? [[TB + 600000, 150]] : null);
        const sess = H.sessions[0];
        return { served: H.overall.served.items, whys: sess.all.map(r=>r.why),
                 resolved: sess.all.filter(r=>r.resolved).length, revisitResolved: H.overall.revisits };
      })(),
      // a ledger row for a scenario with NO run record must be unresolved, never resolved
      // off the PB -- ledger rows carry no tick-off count to lean on
      noRuns: (()=>{
        const L = [{ name: 'Z', why: 'revisit', pbAt: 100, p: 0.5, n: 9, arm: 'A', day: 300, seedBump: 0, servedAt: TB }];
        const H = E.sessionHistoryStats(rerollLog, () => 999, TB + 2*DAYMS, null, runsPlayed, L);
        return { resolved: H.overall.revisits, collected: H.overall.collected };
      })()
    };

    return R;
  }
  const E_SESSION_TYPES_HAS = t => ['floor','transfer','collect','breadth'].includes(t);
  function compareFeatures(R, problems){
    const near = (a, b, eps) => Math.abs(a-b) <= eps;
    const J = x => JSON.stringify(x);
    if(!R){ problems.push('features: missing'); return; }
    // responsiveness units
    if(R.resp3.state!=='unknown' || R.resp3.gain!==null) problems.push('resp: 3 runs must read unknown with gain null, got '+J(R.resp3));
    if(R.resp8.state!=='responsive' || !(R.resp8.gain>0.015 && R.resp8.gain<0.03) || R.resp8.src!=='attempts') problems.push('resp: 8 climbing runs (40th -> 58th percentile) must read responsive at ~+0.02/run, got '+J(R.resp8));
    if(R.respFlat.state!=='plateaued' || !(R.respFlat.gain<=0) || !(R.respFlat.nearPct>0.05)) problems.push('resp: 10 flat runs at 90% of the PB must read plateaued, got '+J(R.respFlat));
    if(R.respNoCurve.state!=='unknown' || R.respNoCurve.gain!==null) problems.push('resp: without a curve the state is unknown, got '+J(R.respNoCurve));
    if(R.respHistory.src!=='history' || !(R.respHistory.gain>0) || R.respHistory.state!=='responsive') problems.push('resp: with 2 runs and 3 raises the fallback must read from history, got '+J(R.respHistory));
    // ordering property
    if(R.order.plateauedInWeakest) problems.push('order: a plateaued scenario must sink out of the weakest five: '+J(R.order.items));
    if(!(R.order.responsiveIdx>=0 && R.order.unknownIdx>=0 && R.order.responsiveIdx < R.order.unknownIdx)) problems.push('order: responsive at 0.30 (+0.03/run) must precede unknown at 0.28: '+J(R.order.items));
    if(!R.order.reasons.some(r=>/responsive: \+\d/.test(r))) problems.push('order: the responsive item reason must say so: '+J(R.order.reasons));
    // board confidence + shrinkage
    if(R.boardConf.none!==1 || R.boardConf.b10k!==1 || R.boardConf.b1m!==1) problems.push('boardConfidence: null / >= 10,000 must be 1, got '+J(R.boardConf));
    if(!near(R.boardConf.b24, 0.345, 0.001) || !near(R.boardConf.b100, 0.5, 0.001) || !near(R.boardConf.b1000, 0.75, 0.001)) problems.push('boardConfidence: 24 -> 0.345, 100 -> 0.5, 1,000 -> 0.75, got '+J(R.boardConf));
    if(!R.shrink.wide || !near(R.shrink.wide.pctShrunk, R.shrink.wide.conf*0.12 + (1-R.shrink.wide.conf)*R.shrink.popLevel, 1e-9)) problems.push('shrink: a 24-player board at 0.12 must rank as conf*0.12 + (1-conf)*popLevel, got '+J(R.shrink));
    if(!R.shrink.slow || R.shrink.slow.conf!==1 || R.shrink.slow.pctShrunk!==null) problems.push('shrink: a 20,000-player board is the identity (conf 1, no shrunk value), got '+J(R.shrink.slow));
    if(!R.shrink.wide || !near(R.shrink.wide.conf, Math.log10(300)/4, 1e-9) || !/board of 300 players \(confidence 0\.62\), ranked as/.test(R.shrink.wide.reason)) problems.push('shrink: conf = log10(300)/4 and the reason must name the board, its confidence and the shrunk rank: '+J(R.shrink.wide));
    if(R.shrink.weakestOrder[0]!=='Tr Reactive Slow' || R.shrink.weakestOrder.indexOf('Fx Static Wide')!==4) problems.push('shrink: Fx Static Wide (0.12 on 300 players -> ~0.25) must drop from first to fifth of the weakest: '+J(R.shrink.weakestOrder));
    // block routes (A2)
    const B2 = R.blockRoutes;
    if(!B2) problems.push('blockRoutes: missing');
    else {
      if(!(B2.minPairs > 0)) problems.push('blockRoutes: the engine exports no ROUTE_MIN_PAIRS');
      else if(B2.members < B2.minPairs) problems.push('blockRoutes: the fixture must give the block at least ROUTE_MIN_PAIRS ('+B2.minPairs+') members or the candidate can never clear the floor, got '+B2.members);
      if(!B2.cand.length || B2.cand[0][0]!=='Cl Dynamic Large') problems.push('blockRoutes: the candidate with ten measured pairs into the block must be found, got '+J(B2.cand));
      else if(!(B2.cand[0][1] > 0.30 && B2.cand[0][1] < 0.36) || B2.cand[0][2]!==B2.members || !B2.cand[0][3]) problems.push('blockRoutes: mean SHRUNK r (~0.40 raw at n 200-290 -> ~0.33 after n/(n+50), S8) over '+B2.members+' pairs, surviving its standard error, got '+J(B2.cand[0]));
      if(B2.thin!==0) problems.push('blockRoutes: under ROUTE_MIN_PAIRS measured pairs there is no claim to make, got '+B2.thin+' candidates');
      const br = B2.routes.filter(r=>r.block);
      if(!br.length) problems.push('blockRoutes: no route carried a block -- the block-level path never fired: '+J(B2.routes));
      else if(br[0].name!=='Cl Dynamic Large') problems.push('blockRoutes: the block route must be the aggregated candidate, got '+J(br));
    }
    // R6 changepoint
    const CP = R.changepoint;
    if(!CP) problems.push('changepoint: missing');
    else {
      if(CP.flat!==null) problems.push('changepoint: a flat series must report NO changepoint -- without the penalty a search always finds one, got '+J(CP.flat));
      if(CP.rising!==null) problems.push('changepoint: a steadily rising series is one line, not two, got '+J(CP.rising));
      if(CP.plateau===null) problems.push('changepoint: a series that climbs then stops must be found');
      else if(!(CP.plateau >= 4 && CP.plateau <= 7)) problems.push('changepoint: the split must land where the climb stops, got index '+CP.plateau);
      if(CP.short!==null) problems.push('changepoint: under CHANGEPOINT_MIN_RUNS ('+CP.minRuns+') a two-segment fit is fitting noise, got '+J(CP.short));
      if(!CP.since || !(CP.since.days > 0) || !(CP.since.drop > 0) || !(CP.since.after <= 0)) problems.push('changepoint: plateauSince must date the run the climb stopped at, got '+J(CP.since));
      if(CP.breakthrough!==null) problems.push('changepoint: an UPWARD change is a breakthrough, not a plateau, got '+J(CP.breakthrough));
    }
    // S6 stuck
    const SK = R.stuck;
    if(!SK) problems.push('stuck: missing');
    else {
      if(SK.longNotStuck.state!=='ok' || SK.shortNotStuck.state!=='ok') problems.push('stuck: a recent best above the older runs is not stuck, got '+J([SK.longNotStuck.state, SK.shortNotStuck.state]));
      if(SK.longStuck.state!=='stuck' || SK.shortStuck.state!=='stuck') problems.push('stuck: a recent window well under the older runs IS stuck, got '+J([SK.longStuck.state, SK.shortStuck.state]));
      // the point of the change: the same recent form reads the same however much history sits behind it
      if(SK.longNotStuck.state!==SK.shortNotStuck.state || SK.longStuck.state!==SK.shortStuck.state) problems.push('stuck: the reading must not depend on how many runs are on record -- that was the whole defect');
      if(SK.longStuck.src!=='rank' || SK.longNotStuck.src!=='rank') problems.push('stuck: with an older window the reading is the rank statistic, got '+J([SK.longStuck.src, SK.longNotStuck.src]));
      if(Math.abs(SK.longNotStuck.expected - 5/6) > 1e-12) problems.push('stuck: the expected share under exchangeability is k/(k+1), got '+SK.longNotStuck.expected);
      if(SK.noOlder.src!=='nearness' || SK.noOlder.state!=='stuck-weak') problems.push('stuck: with no older runs the PB reading is the fallback and must be flagged weak, got '+J(SK.noOlder));
      if(SK.empty.state!=='unknown') problems.push('stuck: no record is unknown, got '+J(SK.empty));
    }
    // A4 soft membership
    const AF = R.affinity;
    if(!AF) problems.push('affinity: missing');
    else {
      if(AF.clear.id!=='A' || !AF.clear.decisive || AF.clear.why!=='decisive') problems.push('affinity: a scenario leaning one community hard must be placed in it, got '+J(AF.clear));
      if(!AF.clear.top || AF.clear.top[2]!==12) problems.push('affinity: the placement must rest on every measured pair into the block, got '+J(AF.clear.top));
      if(AF.tied.id!==null || AF.tied.why!=='tie') problems.push('affinity: two communities within a standard error is a HYBRID and must stay unplaced -- naming a winner there is fabricated structure, got '+J(AF.tied));
      if(AF.thin.id!==null || AF.thin.why!=='unmapped') problems.push('affinity: under AFFINITY_MIN_PAIRS ('+AF.minPairs+') there is no claim to make, got '+J(AF.thin));
      if(AF.negative.id!==null || AF.negative.why!=='no-affinity') problems.push('affinity: a scenario that moves against every community has no affinity, got '+J(AF.negative));
      if(AF.mateFiltered!=='unmapped') problems.push('affinity: a candidate sharing a playlist with the whole block must be filtered out before measuring -- that is co-training, not affinity (got '+AF.mateFiltered+')');
      if(AF.mateUnfiltered!=='A') problems.push('affinity: without the playlist filter that same candidate WOULD be placed, which is what makes the filter load-bearing -- got '+J(AF.mateUnfiltered));
      if(AF.unknown!=='unmapped') problems.push('affinity: a scenario absent from the map is unmapped, got '+AF.unknown);
    }
    // A3 rotation: each trigger, asserted rather than trusted
    const TY = R.types;
    if(!TY) problems.push('types: missing');
    else {
      if(TY.dflt!=='floor') problems.push('types: with nothing triggered the day is a floor session, got '+TY.dflt);
      if(TY.collect!=='collect') problems.push('types: COLLECT_MIN ripe revisits must make it a collect day, got '+TY.collect);
      if(TY.belowCollect==='collect') problems.push('types: one under COLLECT_MIN must not be a collect day, got '+TY.belowCollect);
      if(TY.thinConf!=='breadth') problems.push('types: confidence under CONF_LOW must fill the picture, got '+TY.thinConf);
      if(TY.noStanding!=='breadth') problems.push('types: a block with no standing must fill the picture, got '+TY.noStanding);
      if(TY.sinks!=='transfer') problems.push('types: a weakest block of sinks must go through the map, got '+TY.sinks);
      if(TY.justWorked!=='transfer') problems.push('types: a weakest block worked days ago must go through the map, got '+TY.justWorked);
      if(TY.flipFloor!=='transfer' || TY.flipTransfer!=='floor') problems.push('types: two of the same in a row must alternate, got floor->'+TY.flipFloor+', transfer->'+TY.flipTransfer);
      if(TY.collectSticks!=='collect') problems.push('types: a ripe revisit does not get less ripe -- collect must not be flipped away, got '+TY.collectSticks);
      if(TY.neverTouched!=='floor') problems.push('types: a block never touched is UNKNOWN, not "worked today" -- Number(null) is 0, got '+TY.neverTouched);
      if(TY.noConfReading!=='floor' || TY.noConfAtAll!=='floor') problems.push('types: a missing confidence reading is not confidence 0, got '+TY.noConfReading+' / '+TY.noConfAtAll);
    }
    const RO = R.rotation;
    if(!RO) problems.push('rotation: missing');
    else {
      if(!RO.type || !E_SESSION_TYPES_HAS(RO.type)) problems.push('rotation: composeSession with rotate must name a type, got '+J(RO.type));
      if(!RO.hasWhy) problems.push('rotation: the type must come with a reason the page can print, got '+J(RO.hasWhy));
      if(RO.size!==10) problems.push('rotation: the session is still ten items, got '+RO.size);
      if(J(RO.template)!==J(RO.wanted)) problems.push('rotation: the template must be the slots of that type, got '+J(RO.template)+' wanted '+J(RO.wanted));
      if(RO.offType!==null) problems.push('rotation: WITHOUT opts.rotate there is no type and the pre-A3 behaviour stands, got '+J(RO.offType));
    }
    const SA = R.sampling;
    if(!SA) problems.push('sampling: missing');
    else {
      if(!(SA.distinctLists > 1)) problems.push('sampling: twenty day-seeds produced ONE weakest list -- the sameness complaint is unaddressed');
      if(!SA.stable) problems.push('sampling: the same seed must give the same list (a session must not reshuffle under you)');
      if(!SA.allEligible) problems.push('sampling: a drawn scenario was outside the eligible pool (played, not maxed, at or under level)');
      if(!(SA.damped.after < SA.damped.before)) problems.push('sampling: naming the most-drawn scenarios as recently served did not reduce how often they come back ('+SA.damped.before+' -> '+SA.damped.after+')');
    }
    // R2 scoring: the null model and the proper scoring rule
    const BL = R.baseline;
    if(!BL || BL.n0!==1 || !near(BL.n1, 0.5, 1e-12) || !near(BL.n9, 0.1, 1e-12) || BL.missing!==null) problems.push('baseline: 1/(n+1) -- 0 attempts is certainty, 9 attempts is 0.1, an unknown count is null, got '+J(BL));
    const SC = R.scoring;
    if(!SC) problems.push('scoring: missing');
    else {
      const m = SC.mixed;
      if(!near(m.rate, 0.5, 1e-12) || !near(m.baseline, 0.1, 1e-12) || m.scoredOn!==4) problems.push('scoring: two of four collected against a 1/(9+1) baseline, got '+J(m));
      // the coach said 0.9 twice (both landed) and 0.1 twice (neither did): squared error 0.01 each
      if(!near(m.brier, 0.01, 1e-12)) problems.push('scoring: Brier over [.9 hit, .9 hit, .1 miss, .1 miss] is 0.01, got '+J(m.brier));
      // the null said 0.1 for all four: (0.9^2 + 0.9^2 + 0.1^2 + 0.1^2)/4
      if(!near(m.brierBase, (0.81+0.81+0.01+0.01)/4, 1e-12)) problems.push('scoring: the null model Brier is wrong, got '+J(m.brierBase));
      if(!near(m.skill, 1 - m.brier/m.brierBase, 1e-12) || !(m.skill > 0.9)) problems.push('scoring: a forecast that called all four must score near 1, got '+J(m.skill));
      if(!m.bins.length) problems.push('scoring: the reliability plot has no populated bins, got '+J(m.bins));
      if(!near(SC.sameAsBase, 0, 1e-12)) problems.push('scoring: a forecast identical to the null model has skill exactly 0, got '+J(SC.sameAsBase));
      if(!near(SC.perfect.brier, 0, 1e-12) || !near(SC.perfect.skill, 1, 1e-12)) problems.push('scoring: a perfect forecast is Brier 0, skill 1, got '+J(SC.perfect));
      if(SC.noN!==0) problems.push('scoring: a revisit with no attempt count cannot be scored (no baseline), got '+SC.noN);
    }
    const CAL = R.calibrate;
    if(!CAL) problems.push('calibrate: missing');
    else {
      // (a) identity without offsets
      if(CAL.none.calibrated !== false || CAL.none.offsetsUsed !== 0) problems.push('calibrate: no offsets must report calibrated=false, got '+J(CAL.none));
      if(!near(CAL.none.c4m, 5/26, 1e-12) || CAL.none.c4scale !== 'pct') problems.push('calibrate: without offsets a curved row keeps its percentile as m, got '+J(CAL.none));
      if(CAL.none.curved !== 25) problems.push('calibrate: the reference distribution is the PLAYED curved rows (25 here), got '+CAL.none.curved);
      // (b) THE TRAP: offsets that name none of these rows is NOT a calibration
      if(CAL.missOffsets.calibrated !== false || CAL.missOffsets.offsetsUsed !== 0) problems.push('calibrate: an offsets table naming no row must leave calibrated=false -- Number(null) is 0 and would report a calibration on every uncalibrated build, got '+J(CAL.missOffsets));
      if(!near(CAL.missOffsets.c4m, 5/26, 1e-12)) problems.push('calibrate: a row with no offset entry must keep its percentile, got '+J(CAL.missOffsets));
      // (c) sign: a POSITIVE delta means a generous board, so it must LOWER the percentile
      const S = CAL.some;
      if(S.calibrated !== true || S.offsetsUsed !== 2) problems.push('calibrate: two offsets applied should report calibrated=true and offsetsUsed=2, got '+J(S));
      if(!(S.c4m < S.c4pctBefore)) problems.push('calibrate: a positive delta must LOWER the percentile (generous board), got '+J(S));
      if(!(S.c20m > S.c20pctBefore)) problems.push('calibrate: a negative delta must RAISE the percentile (harsh board), got '+J(S));
      if(!near(S.c4raw, S.c4pctBefore, 1e-12) || !near(S.c20raw, S.c20pctBefore, 1e-12)) problems.push('calibrate: pctRaw must keep the number you can check on the leaderboard, got '+J(S));
      if(S.c9raw !== null) problems.push('calibrate: an unadjusted row must not claim a pctRaw, got '+J(S.c9raw));
      // (d) the S3 quantile map, and that it is monotone
      const M = CAL.mapped;
      if(!M.lowMapped || !M.highMapped || M.lowScale !== 'pct') problems.push('calibrate: a played curve-less row must be quantile-mapped onto the percentile scale, got '+J(M));
      if(!(M.lowM < M.highM)) problems.push('calibrate: the quantile map must be monotone -- a higher To 2nd cannot rank lower, got '+J(M));
      if(!(M.lowM >= 0 && M.highM <= 1)) problems.push('calibrate: a mapped value must stay inside [0,1], got '+J(M));
      // (e) an unplayed row contributes nothing and is not mapped
      if(CAL.unplayed.mapped || CAL.unplayed.scale !== 'to2nd') problems.push('calibrate: an unplayed row has no standing to map, got '+J(CAL.unplayed));
      // (f) under the floor, raw To 2nd
      if(CAL.thin.mapped || CAL.thin.scale !== 'to2nd' || !near(CAL.thin.m, 0.10, 1e-12)) problems.push('calibrate: under METRIC_MIN_CURVED the fallback is raw To 2nd, got '+J(CAL.thin));
      // (g) idempotence -- the app calibrates once and hands the same list to two callers
      if(CAL.idempotent !== true) problems.push('calibrate: a row set that already carries m must be returned untouched');
      // (h) adjustPercentile algebra
      const A = CAL.adjust;
      if(!near(A.zero, 0.5, 1e-12)) problems.push('calibrate: a zero delta is the identity, got '+J(A.zero));
      if(!(A.down < 0.5 && A.up > 0.5)) problems.push('calibrate: adjustPercentile sign is wrong, got '+J(A));
      if(!(A.atZero > 0 && A.atOne < 1)) problems.push('calibrate: the eps clamp must keep a 0 or 1 percentile finite, got '+J(A));
      if(A.nullIn !== null) problems.push('calibrate: adjustPercentile(null) must be null, got '+J(A.nullIn));
    }
    const RS = R.resolve;
    if(!RS) problems.push('resolve: missing');
    else {
      if(RS.strict.from !== 'runs' || RS.legacy.from !== 'pb') problems.push('resolve: the result must say which rule resolved it, got '+J([RS.strict.from, RS.legacy.from]));
      // four revisits scheduled, three attempted after being served
      if(RS.strict.scheduled !== 4 || RS.strict.revisits !== 3) problems.push('resolve: 4 scheduled, 3 with a run after they were served, got '+J(RS.strict));
      // R0 collected first try; R1 only on a later run; R3 never
      if(RS.strict.collected !== 1) problems.push('resolve: exactly one FIRST-try collect, got '+RS.strict.collected);
      if(RS.strict.collectedAny !== 2) problems.push('resolve: two collected on ANY run, got '+RS.strict.collectedAny);
      if(!near(RS.strict.rate, 1/3, 1e-12) || !near(RS.strict.rateAny, 2/3, 1e-12)) problems.push('resolve: rates are over RESOLVED revisits, got '+J(RS.strict));
      const byName = {}; RS.strict.rows.forEach(r=>{ byName[r[0]] = r; });
      // [name, resolved, hit, hitAny, k, base, baseAny]
      if(!byName.R0 || byName.R0[1]!==true || byName.R0[2]!==1 || byName.R0[4]!==1) problems.push('resolve: R0 is a first-try collect on one run, got '+J(byName.R0));
      if(!byName.R1 || byName.R1[2]!==0 || byName.R1[3]!==1 || byName.R1[4]!==2) problems.push('resolve: R1 missed first try and collected on the second -- the case the old rule scored as a clean hit, got '+J(byName.R1));
      if(!byName.R2 || byName.R2[1]!==false || byName.R2[4]!==0) problems.push('resolve: R2 was never attempted after being served and must be UNRESOLVED, not a miss, got '+J(byName.R2));
      if(!byName.R3 || byName.R3[1]!==true || byName.R3[2]!==0 || byName.R3[3]!==0) problems.push('resolve: R3 was attempted twice and never beaten, got '+J(byName.R3));
      // the two baselines: 1/(n+1) for the first run, k/(n+k) for any of k
      if(!near(byName.R1[5], 0.1, 1e-12)) problems.push('resolve: the strict baseline is 1/(9+1), got '+J(byName.R1[5]));
      if(!near(byName.R1[6], 2/11, 1e-12)) problems.push('resolve: the any-run baseline is k/(n+k) = 2/11 on two tries over nine priors, got '+J(byName.R1[6]));
      if(byName.R2[6] !== null) problems.push('resolve: an unresolved item has no k, so no any-run baseline, got '+J(byName.R2[6]));
      // an unresolved revisit cannot enter the Brier pool
      if(RS.scoredOn !== 3) problems.push('resolve: only resolved revisits are scored, got '+RS.scoredOn);
      // the OLD rule, for contrast: the PB is 150 everywhere, so all four read as collected
      if(RS.legacy.collected !== 4 || RS.legacy.revisits !== 4) problems.push('resolve: the legacy PB rule counts every item and calls them all collected -- that contrast is the point, got '+J(RS.legacy));
      // Q4: the served stats span every item, not only revisits
      if(RS.served.items !== 4 || RS.served.resolved !== 3 || RS.served.firstTry !== 1 || RS.served.anyTime !== 2) problems.push('resolve: served stats over every item, got '+J(RS.served));
      if(RS.served.runs !== 5) problems.push('resolve: served.runs counts the logged runs after serving (1+2+2), got '+RS.served.runs);
      const MX = RS.mixed;
      if(MX.servedItems !== 3 || MX.servedResolved !== 2 || MX.servedFirstTry !== 1) problems.push('resolve: a weakest and a route item are scored the same way as a revisit (Q4), got '+J(MX));
      if(MX.revisitsResolved !== 0) problems.push('resolve: the one revisit in that session was never attempted, so no revisit resolved, got '+J(MX));
    }
    const SN = R.stuckNull;
    if(!SN) problems.push('stuckNull: missing');
    else {
      // 15 older runs: the exact SD is sqrt(k(m+k+1)/(m(k+1)^2(k+2))) = 0.16667, the binomial
      // one 0.09623 -- 1.7x apart, and the bar sits a full SD below 5/6 either way.
      if(SN.long.older !== 15) problems.push('stuckNull: expected a 15-run older window, got '+SN.long.older);
      if(!near(SN.long.se, 0.166667, 1e-4)) problems.push('stuckNull: the exact SD at k=5, m=15 is 0.16667, got '+J(SN.long.se));
      if(!near(SN.long.seBinomial, Math.sqrt((5/6)*(1/6)/15), 1e-9)) problems.push('stuckNull: the binomial SD is kept for the record, got '+J(SN.long.seBinomial));
      if(!(SN.long.se > SN.long.seBinomial * 1.6)) problems.push('stuckNull: the exact SD must be materially LARGER on a long record -- that gap is the drift being removed, got '+J(SN.long));
      if(!(SN.long.p >= 0 && SN.long.p <= 1)) problems.push('stuckNull: the exact one-sided p must be a probability, got '+J(SN.long.p));
      // at m = 1 the two coincide exactly, which is why the short-record reading is unchanged
      if(!near(SN.m1.se, SN.m1.seBinomial, 1e-9)) problems.push('stuckNull: at one older run the exact and binomial SDs are equal, got '+J(SN.m1));
    }
    const AM = R.arm;
    if(!AM) problems.push('arm: missing');
    else {
      if(!(AM.share > 0 && AM.share < 1)) problems.push('arm: the engine exports no usable ARM_B_SHARE, got '+J(AM.share));
      if(!AM.offHasNoArm || !AM.offIdentical) problems.push('arm: OFF must be the identity -- no arm on any item and the same list as before NEXT-4, got '+J([AM.offHasNoArm, AM.offIdentical]));
      if(AM.armless) problems.push('arm: every served revisit must carry an arm when the experiment is on, got '+AM.armless+' without one');
      if(AM.dupes) problems.push('arm: a scenario was served twice in one session -- the displacement must not reintroduce the withheld pick, got '+AM.dupes+' sessions');
      if(!AM.bSlots) problems.push('arm: no slot ever took the runner-up over 200 seeds -- the experiment never runs');
      // The realised share is at MOST ARM_B_SHARE and is below it here (about 0.15 against
      // 0.25) because a B slot consumes two candidates and this fixture's revisit pool is
      // barely deeper than its slot count, so a later slot is often forced back to A. That
      // is the invariant worth pinning -- never above, never near zero -- rather than a
      // number that only holds for one pool depth. On a real profile the pool is dozens
      // deep and the two coincide.
      if(!(AM.bShareObserved <= AM.share + 0.02)) problems.push('arm: the realised B share can never EXCEED ARM_B_SHARE ('+AM.share+'), got '+J(AM.bShareObserved));
      if(!(AM.bShareObserved > AM.share*0.4)) problems.push('arm: the realised B share collapsed -- the experiment is barely running, got '+J(AM.bShareObserved)+' against '+AM.share);
      if(AM.leaks) problems.push('arm: BLINDED -- no item reason may mention the arm, got '+AM.leaks+' that do');
      // THE POINT: a B slot withholds the top pick rather than reordering it
      const D = AM.displacedAbsent;
      if(!D || !D.bItem) problems.push('arm: no seed produced a B slot to check displacement against, got '+J(D));
      else if(D.withheld === null) problems.push('arm: turning the arm ON must remove some revisit the OFF run served -- if the same set is served, B reordered instead of displacing, got '+J(D));
      else if(D.stillServed) problems.push('arm: the withheld top pick is still in the session -- that is a swap, and a swap measures nothing, got '+J(D));
    }
    const AS = R.armStats;
    if(!AS) problems.push('armStats: missing');
    else {
      if(AS.a.n !== 6 || AS.b.n !== 6) problems.push('armStats: six resolved per arm, got '+J([AS.a.n, AS.b.n]));
      if(AS.a.hits !== 4 || AS.b.hits !== 1) problems.push('armStats: four of six and one of six collected, got '+J([AS.a.hits, AS.b.hits]));
      // excess over baseline, not raw rate: every item here has n = 9 so the baseline is 0.1
      if(!near(AS.a.excess, 4/6 - 0.1, 1e-12) || !near(AS.b.excess, 1/6 - 0.1, 1e-12)) problems.push('armStats: the comparison is on excess over 1/(n+1), got '+J([AS.a.excess, AS.b.excess]));
      if(!near(AS.diff, 3/6, 1e-12)) problems.push('armStats: the difference of excesses is what the experiment reports, got '+J(AS.diff));
      if(AS.scorable !== false) problems.push('armStats: six per arm is under ARM_MIN_PER_ARM, so no verdict yet, got '+J(AS.scorable));
      if(AS.unassigned !== 0) problems.push('armStats: every row here carries an arm, got '+J(AS.unassigned));
    }
    const WN = R.window;
    if(!WN) problems.push('window: missing');
    else {
      if(WN.windowed !== true) problems.push('window: the engine must report that resolution is windowed, got '+J(WN.windowed));
      // THE REGRESSION: one run, two servings -- exactly one exposure may claim it
      if(WN.lateRun.resolved !== 1 || WN.lateRun.collected !== 1) problems.push('window: ONE run of a scenario served twice must resolve exactly ONE exposure, got resolved '+WN.lateRun.resolved+' collected '+WN.lateRun.collected);
      if(WN.lateRun.aN !== 0 || WN.lateRun.bN !== 1) problems.push('window: a run AFTER the second serving belongs to the second serving alone -- arm A must not also book it, got A '+WN.lateRun.aN+' B '+WN.lateRun.bN);
      if(WN.earlyRun.aN !== 1 || WN.earlyRun.bN !== 0) problems.push('window: a run BETWEEN the two servings belongs to the FIRST, and the second is then unresolved, got A '+WN.earlyRun.aN+' B '+WN.earlyRun.bN);
      if(WN.earlyRun.resolved !== 1) problems.push('window: still exactly one resolved exposure when the run lands early, got '+WN.earlyRun.resolved);
      if(WN.boundary.aN !== 1 || WN.boundary.bN !== 0) problems.push('window: a run landing EXACTLY when the next session was composed belongs to the older window, got A '+WN.boundary.aN+' B '+WN.boundary.bN);
      if(WN.ends.k1 !== 20 || WN.ends.k2 !== 30 || WN.ends.k3 !== Infinity) problems.push('window: windowEnds must bound each serving by the NEXT serving of the same name, got '+J([WN.ends.k1, WN.ends.k2, WN.ends.k3]));
      if(WN.ends.k4 !== Infinity) problems.push('window: a name served once is bounded by nothing, got '+J(WN.ends.k4));
    }
    const LD = R.ledger;
    if(!LD) problems.push('ledger: missing');
    else {
      if(LD.without.aN !== 0) problems.push('ledger: without it the rerolled-away exposure is invisible -- that is the defect, got A '+LD.without.aN);
      if(LD.without.from !== 'runs') problems.push('ledger: with no ledger the provenance stays runs, got '+J(LD.without.from));
      if(LD.with.aN !== 1 || LD.with.aHits !== 1) problems.push('ledger: the rerolled-away exposure was served AND played, so it must resolve with its arm, got A n '+LD.with.aN+' hits '+LD.with.aHits);
      if(LD.with.bN !== 1 || LD.with.bHits !== 1) problems.push('ledger: the surviving exposure must still resolve, got B n '+LD.with.bN+' hits '+LD.with.bHits);
      if(LD.with.from !== 'ledger') problems.push('ledger: the provenance must say the ledger produced the numbers, got '+J(LD.with.from));
      if(LD.with.orphans !== 1) problems.push('ledger: the exposure with no surviving log row must be COUNTED and named, not silently absorbed, got '+J(LD.with.orphans));
      if(LD.with.sessions !== 1) problems.push('ledger: the session list stays the display record of what the log kept, got '+J(LD.with.sessions));
      if(!LD.emptyIsIdentity) problems.push('ledger: an empty ledger must leave the pre-3c log path byte-identical');
      if(LD.noRuns.resolved !== 0 || LD.noRuns.collected !== 0) problems.push('ledger: a row whose scenario has NO run record must be unresolved, never resolved off the PB, got '+J(LD.noRuns));
      // the legacy duplicate-name session: both slots survive, ONE of them owns the run
      const TW = LD.twice;
      if(TW.served !== 2 || J(TW.whys) !== J(['revisit', 'weakest'])) problems.push('ledger: a session listing one scenario twice keeps BOTH slots -- the key is positional, not by name, got '+J(TW));
      if(TW.resolved !== 1) problems.push('ledger: one run must resolve exactly ONE of two same-name slots, got '+TW.resolved+' resolved');
      if(TW.revisitResolved !== 1) problems.push('ledger: and it is the slot the window gives it to, got '+J(TW));
    }



    // revisit forecast
    const f = R.forecast && R.forecast.forecast;
    if(!R.forecast || R.forecast.name!=='Sw Old Switch' || !f) problems.push('forecast: Sw Old Switch must carry a forecast, got '+J(R.forecast));
    else {
      // two pieces of evidence: neighbour A (+0.12, sync-dated) and the touched-but-unmoved
      // neighbour B (0). The third used to be a LABEL BRIDGE whose only touched scenario was
      // A counted a second time -- removed 2026-08-25 with the rest of that table (A2/S5);
      // where a pairs index ships, the forecast reads the measured neighbourhood instead.
      const want = [['Cl Wide Pasu', 0.5, 0.12, null, true], ['Tr Control Pill', 0.4, 0, null, false]];
      if(f.evidence.length!==want.length || !f.evidence.every((e, i)=> e[0]===want[i][0] && near(e[1], want[i][1], 1e-9) && near(e[2], want[i][2], 1e-9) && e[3]===want[i][3] && e[4]===want[i][4])) problems.push('forecast: evidence must be A (+0.12) and the touched-but-unmoved B (0), and nothing else -- the third row used to be a label bridge whose only touched scenario was A counted twice: '+J(f.evidence));
      // COACH-1 (Review Ledger IV): the r appears TWICE -- once as the weight, once as the
      // attenuation -- because a neighbour moving by delta predicts r*delta of YOUR movement,
      // not delta. And the weight is the SHRUNK r, the one estimator S8/R4 settled on. So
      //     w  = shrinkR(r, n),  pred = w * delta,  gain = sum(w * pred) / sum(w)
      // Here: w_A = 0.5*400/450 = 0.4444, w_B = 0.4*300/350 = 0.34286, only A moved (+0.12),
      // so gain = 0.4444 * (0.4444 * 0.12) / (0.4444 + 0.34286) = 0.030108.
      // The old r-weighted MEAN OF MOVEMENTS gave 0.066667 -- it read a neighbour's 12-point
      // gain as 12 of your own points. Worth stating as an inequality too, because that is
      // the property that must hold whatever the numbers are.
      const wA = 0.5*400/450, wB = 0.4*300/350;
      const gainAttenuated = (wA*(wA*0.12) + wB*(wB*0)) / (wA + wB);
      const gainOldForm = (0.5*0.12 + 0.4*0) / (0.5 + 0.4);
      if(!near(f.gain, gainAttenuated, 1e-9) || !near(f.margin, 0.02, 1e-9) || !near(f.odds, gainAttenuated-0.02, 1e-9)) problems.push('forecast: gain must attenuate by the shrunk r (w*delta), not average the neighbours\' movements, got '+J(f));
      if(!(f.gain < gainOldForm*0.6)) problems.push('forecast: the attenuated gain must be materially below the old r-weighted mean of movements ('+gainOldForm.toFixed(4)+'), got '+f.gain);
      if(!f.evidence.every(e=>e[1] !== undefined)) problems.push('forecast: every evidence row keeps its raw r for display');
      if(!near(f.p, 1/(1+Math.exp(-(gainAttenuated-0.02)/0.04)), 1e-9)) problems.push('forecast: p must be logistic(odds/0.04), got '+f.p);
      // the BUCKET and the uncalibrated note, never a percentage: p is an invented
      // logistic and must not read as a measured probability (2026-08-24)
      // The bucket is whatever forecastBucket says of THIS p -- asserting the word would
      // pin the arithmetic twice, and the attenuation moved this case from good to fair.
      const wantBucket = f.p >= 0.6 ? 'good' : (f.p >= 0.4 ? 'fair' : 'poor');
      if(!new RegExp('first-try PB odds: '+wantBucket+' \\(uncalibrated').test(R.forecast.reason) || /\(\d+%\)/.test(R.forecast.reason) || !/sync-dated/.test(R.forecast.reason)) problems.push('forecast: reason must carry forecastBucket(p) ("'+wantBucket+'") + the uncalibrated note, no percentage, and the sync-dated flag: '+R.forecast.reason);
      if(!Number.isFinite(f.p)) problems.push('forecast: p must still be computed and logged for calibration, got '+J(f.p));
    }
    // Tr Old Smooth: neighbour Tr Recent Sphere +0.10 (r 0.6) and the smoothness|reactive tracking
    // bridge (r 0.62) over its two touched scenarios (+0.10 and 0 -> +0.05): gain 0.075, prior
    // margin 0.05 (no recent-runs reading), odds 0.025 -> p 0.65 -- ahead of the 40-day candidate
    // Tr Old Smooth (20 days away) has one neighbour that moved +0.10 at r 0.6; the
    // 40-day candidate has none, so the forecast reorders the revisit pool past pure
    // recency. p rose from 0.65 to 0.78 on 2026-08-25 only because the label-bridge row
    // that used to dilute the r-weighted mean is gone (A2/S5).
    // 0.53 rather than 0.78 since COACH-1: one neighbour at r 0.6 on n 500 that moved
    // +0.10 gives w = 0.6*500/550 = 0.5455 and gain = 0.5455*0.10 = 0.05455 against the old
    // form's 0.10. What the case is FOR is the ordering, so assert that as well as the value.
    if(!R.forecastOrder.length || R.forecastOrder[0][0]!=='Tr Old Smooth') problems.push('forecast order: the forecast candidate (Tr Old Smooth, 20 d) must come before the longest-unplayed one, got '+J(R.forecastOrder));
    else if(J(R.forecastOrder)!==J([['Tr Old Smooth', 0.53]])) problems.push('forecast order: p moved with the attenuation and is pinned at 0.53, got '+J(R.forecastOrder));
    // v0.5 blocks
    const B = R.blocks;
    if(!B || B.standings.length!==3 || B.standings.some(s=>s[2]===null)) problems.push('blocks: three block standings expected, got '+J(B && B.standings));
    if(!B || B.weakestBlocks.length < 2) problems.push('blocks: the weakest slice must span at least two blocks, got '+J(B && B.weakestBlocks));
    if(!B || B.coverage.length!==1) problems.push('blocks: exactly one coverage item expected (a block untouched for 14 days), got '+J(B && B.coverage));
    if(!B || B.size!==10) problems.push('blocks: the session must still hold 10 items, got '+J(B && B.size));
    if(!B || B.sameAsV04) problems.push('blocks: with blocks the item list must differ from the v0.4 list (the map is steering)');
    // templates
    Object.keys(R.templates).forEach(k=>{ const [c, size] = k.split('@'); const t = R.templates[k]; const sum = t.slice(1).reduce((a,b)=>a+b, 0); const want = Math.min(Number(size), 10);
      if(sum!==want) problems.push('template '+k+': slots sum to '+sum+', expected '+want+' ('+J(t)+')');
      const cn = c==='null' ? null : Number(c);
      if((cn===null || (cn>=0.3 && cn<=0.65)) && Number(size)===10 && J(t)!==J(['mid',5,2,1,1,1])) problems.push('template '+k+': the middle band must be exactly 5/2/1/1/1, got '+J(t));
      if(cn!==null && cn<0.3 && t[0]!=='low') problems.push('template '+k+': c < 0.30 is the low band, got '+J(t));
      if(cn!==null && cn>0.65 && t[0]!=='high') problems.push('template '+k+': c > 0.65 is the high band, got '+J(t));
    });
    // no run evidence: density reads as 0 in the mean (reported null) and c is capped at the
    // high band's floor, so calendar time alone never reaches the high band
    if(R.confNoAtt.density!==null || !near(R.confNoAtt.c, Math.min((R.confNoAtt.coverage + 0.5)/3, 0.65), 0.001)) problems.push('profileConfidence without attempts: density null and c = min((coverage + 0 + days)/3, 0.65), got '+J(R.confNoAtt));
    if(R.confWithAtt.density===null) problems.push('profileConfidence with attempts records must carry a density, got '+J(R.confWithAtt));
    if(R.bands.low.n!==10 || R.bands.high.n!==10 || R.bands.low.template.band!=='low' || R.bands.high.template.band!=='high') problems.push('bands: low/high templates must still compose 10 items, got '+J({ low: R.bands.low, high: R.bands.high }));
    if(R.bands.high.whys.fillout) problems.push('bands: the high band has no fill-out slot (top-up only adds weakest first), got '+J(R.bands.high.whys));
    if(!(R.bands.high.whys.weakest>=6) || !(R.bands.high.whys.revisit===2)) problems.push('bands: the high band must carry 6 weakest and 2 revisits, got '+J(R.bands.high.whys));
    if(!(R.bands.low.whys.fillout===2) || !(R.bands.low.whys.weakest>=4)) problems.push('bands: the low band must carry 2 fill-outs, got '+J(R.bands.low.whys));
    // game knob
    if(!R.game.offSameAsMain) problems.push('game: weight 0 must reproduce the main snapshot exactly');
    const gi = n => R.game.on.findIndex(x=>x[0]===n);
    if(!(gi('Tr Smooth Thin')>=0 && gi('Tr Smooth Thin') < gi('Sw Speed Small'))) problems.push('game: the carrier Tr Smooth Thin (0.25 - 0.08) must rank above Sw Speed Small (0.18) at weight 1: '+J(R.game.on));
    if(!(gi('Tr Reactive Slow')>=0 && gi('Tr Reactive Slow') < gi('Tr Smooth Thin'))) problems.push('game: the bonus (0.08) must not lift the carrier over a 10-point weaker scenario: '+J(R.game.on));
    if(!R.game.on.some(x=>x[0]==='Fx Static Wide' && x[2]==='neighbour')) problems.push('game: a neighbour of a carrier (Fx Static Wide, r 0.62) must be marked neighbour: '+J(R.game.on));
    if(!R.game.reasons.some(r=>/game-relevant \(cs\/val or tac-fps\)/.test(r)) || !R.game.reasons.some(r=>/co-varies with game-relevant scenarios \(r 0\.62\)/.test(r))) problems.push('game: reasons must name the bonus and the neighbour share: '+J(R.game.reasons));
    // history stats
    const h = R.history;
    if(h.sessions.length!==3 || h.sessions[0][6]!==true || h.sessions[1][6]!==false) problems.push('history: 3 sessions newest first, the live one flagged: '+J(h.sessions));
    // the live session has nothing done yet, so its revisits are not counted (a session that
    // was never played must not deflate the return-collect rate)
    // [scheduled, resolved, collected] per session. Since Review Ledger IV COACH-2
    // `revisits` counts what was SCHEDULED and `resolved` what was actually attempted --
    // the live session scheduled one and played nothing, which is unresolved, not missed.
    // (No runsOf here, so this exercises the legacy PB path and its done-count gate.)
    if(J(h.sessions.map(s=>[s[3], s[7], s[4]]))!==J([[1,0,0],[2,2,1],[1,1,1]])) problems.push('history: [scheduled, resolved, collected] per session must be [1,0,0] (live, nothing done -> unresolved), [2,2,1], [1,1,1], got '+J(h.sessions));
    if(h.overall.revisits!==3 || h.overall.collected!==2 || !near(h.overall.rate, 2/3, 1e-9) || !near(h.overall.predicted, (0.8*1 + 0.5*2)/3, 1e-9)) problems.push('history: overall must exclude the live session (3 revisits, 2 collected, predicted mean weighted by revisits), got '+J(h.overall));
    if(h.weeks.length!==2 || h.weeks[0][1]!==1 || h.weeks[1][1]!==2) problems.push('history: two contiguous Monday-start weeks (1 session, then 2), got '+J(h.weeks));
    if(!(h.weeks[0][3]===1 && h.weeks[1][3]===1 && h.weeks[1][2]===2)) problems.push('history: weekly collected/revisits must follow the sessions, got '+J(h.weeks));
    if(J(h.weeks[1][6])!==J({ easy: 0, good: 0, hard: 1 })) problems.push('history: the live week tallies one hard rating, got '+J(h.weeks[1][6]));
  }
  // ---- EXPECTED: pasted from `node test/session.js --print` on the v0.3 engine (2026-08-22);
  // v0.4 (same day, later) changed exactly one line -- guards.weakR lost the r = 0.2
  // bridge route -- and every other line is v0.3's, which is the "reduces to v0.3
  // without its evidence" contract made executable. ----
  const EXPECTED = {
    "main": {
      "regime": "normal", "level": 4, "popLevel": 0.47,
      "weakLabels": [
        ["static","facet",0.355,6],
        ["clicking","facet",0.42,12],
        ["dynamic","facet",0.47,4],
        ["switching","facet",0.48,7],
        ["tracking","facet",0.5,11],
        ["smooth","facet",0.52,5]
      ],
      "items": [
        {"name":"Fx Static Wide","why":"weakest","via":null},
        {"name":"Tr Reactive Slow","why":"weakest","via":null},
        {"name":"Sw Speed Small","why":"weakest","via":null},
        {"name":"Cl Dynamic Mid","why":"weakest","via":null},
        {"name":"Tr Smooth Thin","why":"weakest","via":null},
        {"name":"Cl Dynamic Large","why":"route","via":{"target":"Fx Static Wide","viaLabel":null,"r":0.51,"n":260}},
        {"name":"Tr Smooth Cube","why":"route","via":{"target":"Tr Reactive Slow","viaLabel":null,"r":0.48,"n":180}},
        {"name":"Sw Gap Switch","why":"fillout","via":null},
        {"name":"Cl Easy Flick","why":"quickwin","via":null},
        {"name":"Sw Old Switch","why":"revisit","via":null}
      ]
    },
    "topup": { "items": [
        {"name":"Fx Static Wide","why":"weakest","via":null},
        {"name":"Tr Reactive Slow","why":"weakest","via":null},
        {"name":"Sw Speed Small","why":"weakest","via":null},
        {"name":"Cl Dynamic Mid","why":"weakest","via":null},
        {"name":"Tr Smooth Thin","why":"weakest","via":null},
        {"name":"Cl Dynamic Large","why":"route","via":{"target":"Fx Static Wide","viaLabel":null,"r":0.51,"n":260}},
        {"name":"Tr Smooth Cube","why":"route","via":{"target":"Tr Reactive Slow","viaLabel":null,"r":0.48,"n":180}},
        {"name":"Sw Gap Switch","why":"fillout","via":null},
        {"name":"Cl Easy Flick","why":"quickwin","via":null},
        {"name":"Sw Old Switch","why":"revisit","via":null},
        {"name":"Cl NoCurve Tap","why":"weakest","via":null},
        {"name":"Sw Switch Basic","why":"weakest","via":null}
      ] },
    "thin": { "regime": "thin", "level": null, "items": [
        ["Cl Easy Flick","placement","clicking"],
        ["Tr Smooth Sphere","placement","tracking"],
        ["Sw Old Switch","placement","switching"],
        ["Cl Newcomer Tile","placement","clicking"],
        ["Tr Newcomer Smooth","placement","tracking"],
        ["Sw Newcomer TS","placement","switching"],
        ["Cl Dynamic Large","placement","clicking"],
        ["Tr Control Pill","placement","tracking"],
        ["Cl Ground Static","placement","switching"],
        ["Cl Maxed Easy","placement","clicking"]
      ] },
    "guards": {
      "routes": [
        {"name":"Cl Dynamic Large","target":"Fx Static Wide","viaLabel":null},
        {"name":"Tr Smooth Cube","target":"Tr Reactive Slow","viaLabel":null}
      ],
      "playlistMateUsed": false, "crossPlaylistUsed": true
    },
    "playedRated": {"main":32,"thin":12}
  };
  function compare(expected, actual){
    const problems = [];
    const J = x => JSON.stringify(x);
    const same = (path, a, b) => { if(J(a)!==J(b)) problems.push(path+': expected '+J(a)+' got '+J(b)); };
    if(!expected){ problems.push('EXPECTED is empty -- paste the output of node test/session.js --print'); return problems; }
    // the snapshot, line by line
    ['regime','level','popLevel'].forEach(k=>same('main.'+k, expected.main[k], actual.main[k]));
    same('main.weakLabels', expected.main.weakLabels, actual.main.weakLabels);
    const lists = [['main.items', expected.main.items, actual.main.items], ['topup.items', expected.topup.items, actual.topup.items], ['thin.items', expected.thin.items, actual.thin.items]];
    lists.forEach(([path, e, a])=>{
      const n = Math.max(e.length, a.length);
      for(let i=0;i<n;i++) same(path+'['+i+']', e[i], a[i]);
    });
    ['regime','level'].forEach(k=>same('thin.'+k, expected.thin[k], actual.thin[k]));
    same('guards.routes', expected.guards.routes, actual.guards.routes);
    ['playlistMateUsed','crossPlaylistUsed'].forEach(k=>same('guards.'+k, expected.guards[k], actual.guards[k]));
    same('playedRated', expected.playedRated, actual.playedRated);
    // the named probes: the intent, executable, with a message that says which rule moved
    const m = actual.main;
    if(m.regime!=='normal') problems.push('probe: main fixture must compose in the normal regime ('+actual.playedRated.main+' played rated), got '+m.regime);
    if(m.level!==4) problems.push('probe: level (median rung of played) must be 4, got '+m.level);
    if(m.items.length!==10) problems.push('probe: size 10 must give 10 items, got '+m.items.length);
    const whys = m.items.map(it=>it.why);
    ['weakest','route','fillout','quickwin','revisit'].forEach(w=>{ if(!whys.includes(w)) problems.push('probe: no "'+w+'" item in the main run'); });
    if(m.items.filter(it=>it.why==='weakest').some(it=>it.name==='Cl Stuck Flicks')) problems.push('probe: the stuck scenario (lowest percentile, recent tries well under the PB) must sink out of the weakest five');
    const routes = m.items.filter(it=>it.why==='route');
    if(routes.length!==2) problems.push('probe: the main run must carry two routes, got '+routes.length);
    if(!routes.some(it=>it.name==='Cl Dynamic Large' && it.via && it.via.target==='Fx Static Wide')) problems.push('probe: the cross-playlist route into Fx Static Wide is missing (Cl Dynamic Large, r 0.51 -- the r 0.62 neighbour shares its playlist)');
    if(!routes.some(it=>it.name==='Tr Smooth Cube' && it.via && it.via.target==='Tr Reactive Slow')) problems.push('probe: the second cross-playlist route (Tr Smooth Cube -> Tr Reactive Slow) is missing');
    if(routes.some(it=>it.name==='Fx Static Small')) problems.push('probe: a playlist-mate was routed in the main run');
    m.items.forEach(it=>{ if(it.via && it.via.viaLabel) problems.push('probe: a label-bridge route survived -- that table no longer feeds the coach: '+J(it)); });
    if(actual.thin.regime!=='thin') problems.push('probe: the 12-played fixture must compose in the thin regime, got '+actual.thin.regime);
    if(actual.thin.level!==null) problems.push('probe: thin regime has no level, got '+actual.thin.level);
    if(actual.thin.items.length!==10 || actual.thin.items.some(x=>x[1]!=='placement')) problems.push('probe: thin regime must be 10 placement items, got '+J(actual.thin.items.map(x=>x[1])));
    const g = actual.guards;
    if(!g || g.playlistMateUsed) problems.push('probe: Fx Static Small shares Pack A with Fx Static Wide and is its strongest neighbour (r 0.62) -- a playlist-mate must never be a route: '+J(g && g.routes));
    if(!g || !g.crossPlaylistUsed) problems.push('probe: the cross-playlist route (Cl Dynamic Large, r 0.51) must be taken once the playlist-mate is refused -- if it is missing the refusal is swallowing the slot: '+J(g && g.routes));
    // v0.4 feature cases, by property
    compareFeatures(actual.features, problems);
    return problems;
  }
  // One item per line so a regeneration diff reads item by item.
  function serialize(actual){
    const line = x => JSON.stringify(x);
    const list = arr => '[\n' + arr.map(x=>'      '+line(x)).join(',\n') + '\n    ]';
    return '{\n' +
      '  "main": {\n' +
      '    "regime": '+line(actual.main.regime)+', "level": '+line(actual.main.level)+', "popLevel": '+line(actual.main.popLevel)+',\n' +
      '    "weakLabels": '+list(actual.main.weakLabels)+',\n' +
      '    "items": '+list(actual.main.items)+'\n  },\n' +
      '  "topup": { "items": '+list(actual.topup.items)+' },\n' +
      '  "thin": { "regime": '+line(actual.thin.regime)+', "level": '+line(actual.thin.level)+', "items": '+list(actual.thin.items)+' },\n' +
      '  "guards": {\n' +
      '    "routes": '+list(actual.guards.routes)+',\n' +
      '    "playlistMateUsed": '+line(actual.guards.playlistMateUsed)+', "crossPlaylistUsed": '+line(actual.guards.crossPlaylistUsed)+'\n  },\n' +
      '  "playedRated": '+line(actual.playedRated)+'\n}';
  }
  const api = { compute, compare, serialize, fixture, thinFixture, FIXED_MS, LABEL_BRIDGES, RUNS, FILL, EXPECTED };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (require.main === module) {
      const path = require('path');
      const E = require(path.join(__dirname, '..', 'src', 'engine.js'));
      const actual = compute(E);
      if (process.argv.includes('--print')) { console.log(serialize(actual)); process.exit(0); }
      const problems = compare(EXPECTED, actual);
      console.log(`session: ${actual.main.items.length} items (level ${actual.main.level}, ${actual.playedRated.main} played rated), thin ${actual.thin.items.length}; problems ${problems.length}`);
      if (problems.length) { problems.slice(0, 20).forEach(p => console.log('  ' + p)); process.exit(1); }
    }
  } else {
    root.__miniEvxlSession = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
