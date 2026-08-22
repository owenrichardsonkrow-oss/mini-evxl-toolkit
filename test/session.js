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
//   route     one scenario-level neighbour route (the others refused: rung over
//             level+1, already chosen, stuck) and one label bridge (the stronger
//             bridge by r*log(pairs) wins; among its scenarios the highest
//             standing), with the same-skill bridge ("static|static clicking")
//             and the non-skill bridge ("bonus|...") in the table and never
//             routed;
//   fill out  a gap in a mostly-played playlist; quick win (most playlists
//             first); revisit (longest away, after the quick win took the
//             15-day one); a size-12 run for the top-up order;
//   thin      the same rows with only 12 played -> regime "thin", placement only
//             (pinned quirk: when no unplayed scenario of the wanted mechanic is
//             left, the fallback pick still carries that mechanic as its label --
//             "Cl Ground Static" labelled switching -- a display wrinkle, kept so
//             a fix is a deliberate re-bless and not a silent drift);
//   guards    each refused bridge kind alone in the table, so the refusal is
//             reached (not vacuous) -- and the r = 0.2 bridge alone, which the
//             CURRENT engine accepts (see WEAK_BRIDGE_REFUSED below).
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
    'speedts|static clicking': [0.20, 120],           // the WEAK bridge (r 0.2) -- see WEAK_BRIDGE_REFUSED
    'target switching|dynamic clicking': [0.45, 18]   // real bridge; no weak item reaches it in the main run
  };
  // The r = 0.2 bridge: the engine as of 2026-08-22 (v0.3) accepted any r > 0,
  // so alone in the table it DID become a route (pinned under guards.weakR).
  // Since v0.4 (2026-08-22 late) the bridge loop refuses r < 0.3 -- the map's
  // own pair threshold -- so the assertion is inverted: no route may ever come
  // through it (flag flipped with the guard; EXPECTED.guards.weakR re-blessed).
  const WEAK_BRIDGE_REFUSED = true;
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
    ['Fx Static Wide',      true,  0.12, 0.30, 0.10, 0.35, false, 3, ['static clicking'],                  ['clicking','static'],            [PA],         1, [['Fx Static Small', 0.62, 300], ['Cl Stuck Flicks', 0.55, 220]]],
    ['Tr Reactive Slow',    true,  0.15, 0.32, 0.12, 0.20, false, 4, ['reactive tracking'],                ['tracking','reactive'],          [PB],         0, []],
    ['Sw Speed Small',      true,  0.18, 0.35, 0.15, 0.40, false, 2, ['speedts'],                          ['switching','speed'],            [PC],         0, [['Sw Speed Large', 0.50, 150]]],
    ['Cl Dynamic Mid',      true,  0.22, 0.40, 0.18, 0.25, false, 4, ['dynamic clicking','static'],        ['clicking','dynamic','static'],  [PD],         2, [['Cl Dynamic Mid Hard', 0.70, 400], ['Tr Reactive Slow', 0.40, 200]]],
    ['Tr Smooth Thin',      true,  0.25, 0.42, 0.20, 0.30, false, 3, ['smoothness','bonus'],               ['tracking','smooth'],            [PE],         0, [['Tr Smooth Thin Hard', 0.30, 120]]],
    // the spread rules: 6th in, then a third clicking / third tracking / repeated playlist out
    ['Sw Switch Basic',     true,  0.28, 0.45, 0.22, 0.30, false, 4, ['target switching'],                 ['switching'],                    [PF],         0, []],
    ['Cl Static Micro',     true,  0.30, 0.46, 0.25, 0.35, false, 2, ['static clicking'],                  ['clicking','static'],            [PG],         0, []],
    ['Tr Bounce Ball',      true,  0.31, 0.47, 0.26, 0.30, false, 3, ['bouncesphere'],                     ['tracking','bounce'],            [PH],         0, []],
    ['Sw Evasive Dash',     true,  0.33, 0.48, 0.28, 0.40, false, 3, ['evasive switching'],                ['switching','evasive'],          [PC],         0, []],
    ['Cl NoCurve Tap',      true,  null, 0.35, 0.30, 0.50, false, 3, ['tap'],                              ['clicking'],                     [PA, PB],     0, []],   // no population curve: To 2nd is its metric
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
  const OPTS = { size: 10, seed: 1, now: FIXED_MS, labelBridges: LABEL_BRIDGES };
  const item = it => ({ name: it.name, why: it.why, via: it.via ? { target: it.via.target, viaLabel: it.via.viaLabel, r: it.via.r, n: it.via.n } : null });
  const routeOf = it => ({ name: it.name, target: it.via ? it.via.target : null, viaLabel: it.via ? it.via.viaLabel : null });
  function compute(E){
    const fx = fixture(E);
    const main = E.composeSession(fx, OPTS, FILL);
    const topup = E.composeSession(fixture(E), Object.assign({}, OPTS, { size: 12 }), FILL);
    const thin = E.composeSession(thinFixture(E), OPTS, FILL);
    const guard = key => { const s = E.composeSession(fixture(E), Object.assign({}, OPTS, { labelBridges: { [key]: LABEL_BRIDGES[key] } }), FILL); return s.items.filter(it=>it.why==='route').map(routeOf); };
    return {
      main: { regime: main.regime, level: main.level, popLevel: main.popLevel,
        weakLabels: main.weakLabels.map(p=>[p.label, p.kind, p.median, p.n]),
        items: main.items.map(item) },
      topup: { items: topup.items.map(item) },
      thin: { regime: thin.regime, level: thin.level, items: thin.items.map(it=>[it.name, it.why, it.label]) },
      guards: { sameSkill: guard('static|static clicking'), noSkill: guard('bonus|target switching'), weakR: guard('speedts|static clicking') },
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
    R.history = { sessions: H.sessions.map(s=>[s.day - dayOf(FIXED_MS), s.rating, s.done, s.revisits, s.collected, s.predicted, s.live]), weeks: H.weeks.map(w=>[w.weekStart - dayOf(FIXED_MS), w.sessions, w.revisits, w.collected, w.rate, w.predicted, w.ratings]), overall: H.overall };
    return R;
  }
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
    // revisit forecast
    const f = R.forecast && R.forecast.forecast;
    if(!R.forecast || R.forecast.name!=='Sw Old Switch' || !f) problems.push('forecast: Sw Old Switch must carry a forecast, got '+J(R.forecast));
    else {
      // three pieces of evidence: neighbour A (+0.12, sync-dated), the touched-but-unmoved
      // neighbour B (0), and the label bridge target switching|dynamic clicking (r 0.45),
      // whose only touched scenario in "dynamic clicking" is A again (+0.12)
      const want = [['Cl Wide Pasu', 0.5, 0.12, null, true], ['Tr Control Pill', 0.4, 0, null, false], ['dynamic clicking', 0.45, 0.12, 'dynamic clicking', true]];
      if(f.evidence.length!==3 || !f.evidence.every((e, i)=> e[0]===want[i][0] && near(e[1], want[i][1], 1e-9) && near(e[2], want[i][2], 1e-9) && e[3]===want[i][3] && e[4]===want[i][4])) problems.push('forecast: evidence must be A (+0.12), the touched-but-unmoved B (0) and the dynamic-clicking bridge (+0.12): '+J(f.evidence));
      const gain = (0.5*0.12 + 0.4*0 + 0.45*0.12)/(0.5+0.4+0.45);
      if(!near(f.gain, gain, 1e-9) || !near(f.margin, 0.02, 1e-9) || !near(f.odds, gain-0.02, 1e-9)) problems.push('forecast: gain = r-weighted mean over touched evidence (unmoved counts as 0), margin = nearPct, got '+J(f));
      if(!near(f.p, 1/(1+Math.exp(-(gain-0.02)/0.04)), 1e-9)) problems.push('forecast: p must be logistic(odds/0.04), got '+f.p);
      if(!/first-try PB odds: good \(83%\)/.test(R.forecast.reason) || !/sync-dated/.test(R.forecast.reason)) problems.push('forecast: reason must carry the odds (good, 83%) and the sync-dated flag: '+R.forecast.reason);
    }
    // Tr Old Smooth: neighbour Tr Recent Sphere +0.10 (r 0.6) and the smoothness|reactive tracking
    // bridge (r 0.62) over its two touched scenarios (+0.10 and 0 -> +0.05): gain 0.075, prior
    // margin 0.05 (no recent-runs reading), odds 0.025 -> p 0.65 -- ahead of the 40-day candidate
    if(J(R.forecastOrder)!==J([['Tr Old Smooth', 0.65]])) problems.push('forecast order: the forecast candidate (Tr Old Smooth, 20 d, p 0.65) must come before the longest-unplayed one, got '+J(R.forecastOrder));
    // templates
    Object.keys(R.templates).forEach(k=>{ const [c, size] = k.split('@'); const t = R.templates[k]; const sum = t.slice(1).reduce((a,b)=>a+b, 0); const want = Math.min(Number(size), 10);
      if(sum!==want) problems.push('template '+k+': slots sum to '+sum+', expected '+want+' ('+J(t)+')');
      const cn = c==='null' ? null : Number(c);
      if((cn===null || (cn>=0.3 && cn<=0.65)) && Number(size)===10 && J(t)!==J(['mid',5,2,1,1,1])) problems.push('template '+k+': the middle band must be exactly 5/2/1/1/1, got '+J(t));
      if(cn!==null && cn<0.3 && t[0]!=='low') problems.push('template '+k+': c < 0.30 is the low band, got '+J(t));
      if(cn!==null && cn>0.65 && t[0]!=='high') problems.push('template '+k+': c > 0.65 is the high band, got '+J(t));
    });
    if(R.confNoAtt.density!==null || !near(R.confNoAtt.c, (R.confNoAtt.coverage + 0.5)/2, 0.001)) problems.push('profileConfidence without attempts: density null and c = mean(coverage, days), got '+J(R.confNoAtt));
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
    if(J(h.sessions.map(s=>[s[3], s[4]]))!==J([[1,1],[2,1],[1,1]])) problems.push('history: revisits/collected per session must be [1,1] (live, shown but not totalled), [2,1], [1,1], got '+J(h.sessions));
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
        {"name":"Fx Static Small","why":"route","via":{"target":"Fx Static Wide","viaLabel":null,"r":0.62,"n":300}},
        {"name":"Tr Smooth Sphere","why":"route","via":{"target":"Tr Reactive Slow","viaLabel":"smoothness","r":0.62,"n":25}},
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
        {"name":"Fx Static Small","why":"route","via":{"target":"Fx Static Wide","viaLabel":null,"r":0.62,"n":300}},
        {"name":"Tr Smooth Sphere","why":"route","via":{"target":"Tr Reactive Slow","viaLabel":"smoothness","r":0.62,"n":25}},
        {"name":"Sw Gap Switch","why":"fillout","via":null},
        {"name":"Cl Easy Flick","why":"quickwin","via":null},
        {"name":"Sw Old Switch","why":"revisit","via":null},
        {"name":"Sw Switch Basic","why":"weakest","via":null},
        {"name":"Cl Static Micro","why":"weakest","via":null}
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
      "sameSkill": [{"name":"Fx Static Small","target":"Fx Static Wide","viaLabel":null}],
      "noSkill": [{"name":"Fx Static Small","target":"Fx Static Wide","viaLabel":null}],
      "weakR": [{"name":"Fx Static Small","target":"Fx Static Wide","viaLabel":null}]
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
    ['sameSkill','noSkill','weakR'].forEach(k=>same('guards.'+k, expected.guards[k], actual.guards[k]));
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
    if(!routes.some(it=>it.via && it.via.viaLabel===null && it.via.target==='Fx Static Wide')) problems.push('probe: the scenario-level neighbour route (Fx Static Small -> Fx Static Wide) is missing');
    if(!routes.some(it=>it.via && it.via.viaLabel==='smoothness' && it.via.target==='Tr Reactive Slow')) problems.push('probe: the label-bridge route (smoothness -> reactive tracking, for Tr Reactive Slow) is missing');
    m.items.forEach(it=>{ if(it.via && ['static','static clicking','bonus','target switching'].includes(it.via.viaLabel)) problems.push('probe: a refused bridge kind routed in the main run: '+J(it)); });
    if(actual.thin.regime!=='thin') problems.push('probe: the 12-played fixture must compose in the thin regime, got '+actual.thin.regime);
    if(actual.thin.level!==null) problems.push('probe: thin regime has no level, got '+actual.thin.level);
    if(actual.thin.items.length!==10 || actual.thin.items.some(x=>x[1]!=='placement')) problems.push('probe: thin regime must be 10 placement items, got '+J(actual.thin.items.map(x=>x[1])));
    const g = actual.guards;
    const onlyNeighbour = (name, rs) => { if(rs.length!==1 || rs[0].viaLabel!==null) problems.push('probe: with only the '+name+' bridge in the table the neighbour route must be the only route, got '+J(rs)); };
    onlyNeighbour('same-skill (static|static clicking)', g.sameSkill);
    onlyNeighbour('non-skill (bonus|target switching)', g.noSkill);
    const weakUsed = g.weakR.some(r=>r.viaLabel==='static clicking' && r.target==='Sw Speed Small');
    if(WEAK_BRIDGE_REFUSED && weakUsed) problems.push('probe: the r = 0.2 bridge became a route (WEAK_BRIDGE_REFUSED is true): '+J(g.weakR));
    if(!WEAK_BRIDGE_REFUSED && !weakUsed) problems.push('probe: the r = 0.2 bridge is now refused -- if the r >= 0.3 guard landed on purpose, set WEAK_BRIDGE_REFUSED = true in test/session.js and regenerate EXPECTED (node test/session.js --print); got '+J(g.weakR));
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
      '    "sameSkill": '+line(actual.guards.sameSkill)+',\n' +
      '    "noSkill": '+line(actual.guards.noSkill)+',\n' +
      '    "weakR": '+line(actual.guards.weakR)+'\n  },\n' +
      '  "playedRated": '+line(actual.playedRated)+'\n}';
  }
  const api = { compute, compare, serialize, fixture, thinFixture, FIXED_MS, LABEL_BRIDGES, RUNS, FILL, EXPECTED, WEAK_BRIDGE_REFUSED };
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
