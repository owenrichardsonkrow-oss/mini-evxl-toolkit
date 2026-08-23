// Hand-fixture test for the overlap page's PURE engine layer (src/engine.js,
// 2026-08-22): rBand, buildOverlapIndex, overlapOf, groupMatrix,
// independentGroups, foldLabels, bridgeRows, neighboursFromIndex,
// clusterGroupsOf, skillProfile keyBy 'labels', and the helpers lifted out of
// composeSession (normalizeLabel, labelFacetSet, sameSkillLabels, noSkillLabel,
// sessionLevel, isStuck, routeCheck). No dataset, no population file: eight
// scenarios, four curator labels (a same-skill spelling pair "static clicking" /
// "static click", a real second skill "reactive tracking", a no-skill label
// "bonus"), fourteen tested pairs with known r / n (two at n = 100 to exercise
// the band, one negative, three near zero, one at the 0.30 floor, one weak
// 0.20), plus the equivalent legacy per-scenario lists written by hand with the
// stamper's rule (top 8 positive by r, up to 4 negative by |r|, |r| >= 0.3).
// Every expected number below is computed by hand in the comments -- the test
// is the arithmetic, not a snapshot.
//
//   node test/overlap.js
(function(root){
  // ---- fixture ---------------------------------------------------------------
  const C1 = 'Click One', C2 = 'Click Two', C3 = 'Click Three', T1 = 'Track One', T2 = 'Track Two', T3 = 'Track Three', M1 = 'Mixed One', X1 = 'Lone One';
  const LABELS = {
    [C1]: ['static clicking'], [C2]: ['static clicking'], [C3]: ['static click', 'bonus'],
    [T1]: ['reactive tracking'], [T2]: ['reactive tracking'], [T3]: ['reactive tracking', 'bonus'],
    [M1]: ['static clicking', 'reactive tracking'], [X1]: []
  };
  // [a, b, r, n] -- every tested pair at n >= 100 (the pairs block), unordered.
  const PAIRS = [
    [C1, C2,  0.60,  100],   // band ±0.199 -> lower edge 0.40
    [C1, C3,  0.58, 1800],   // band ±0.046 -> lower edge 0.534 (ranks ABOVE the 0.60 at n = 100)
    [C2, C3,  0.45,  400],
    [T1, T2,  0.55,  900],
    [T1, T3,  0.50,  250],
    [T2, T3,  0.40, 1200],
    [C1, T1, -0.35,  300],   // the negative: "against"
    [C2, T2,  0.05, 1800],   // near zero, band 0.046: 0.096 < 0.3 -> unrelated
    [C3, T3,  0.10,  100],   // near zero at n = 100: 0.10 + 0.199 = 0.299 < 0.3 -> still unrelated, just
    [C1, T2,  0.00,  500],   // near zero, band 0.088 -> unrelated
    [M1, C1,  0.50,  600],
    [M1, T1,  0.48,  700],
    [M1, X1,  0.20, 1000],   // weak (0.15 <= |r| < 0.3)
    [X1, C2,  0.30,  150]    // exactly the floor -> "with"
  ];
  // The inconclusive case (|r| < 0.15 but |r| + band >= 0.3) is added per test
  // below: 0.11 at n = 100 -> 0.11 + 0.199 = 0.309.
  // The legacy per-scenario lists, the stamper's rule applied by hand (k 8, kNeg 4, |r| >= 0.3):
  // positives r desc (ties by name), then negatives r asc.
  const LEGACY = {
    [C1]: [[C2, 0.60, 100], [C3, 0.58, 1800], [M1, 0.50, 600], [T1, -0.35, 300]],
    [C2]: [[C1, 0.60, 100], [C3, 0.45, 400], [X1, 0.30, 150]],
    [C3]: [[C1, 0.58, 1800], [C2, 0.45, 400]],
    [T1]: [[T2, 0.55, 900], [T3, 0.50, 250], [M1, 0.48, 700], [C1, -0.35, 300]],
    [T2]: [[T1, 0.55, 900], [T3, 0.40, 1200]],
    [T3]: [[T1, 0.50, 250], [T2, 0.40, 1200]],
    [M1]: [[C1, 0.50, 600], [T1, 0.48, 700]],
    [X1]: [[C2, 0.30, 150]]
  };
  const NAMES = [C1, C3, C2, X1, M1, T1, T3, T2].slice().sort();   // the pairs block's sorted names
  function pairsTransfer(extra){
    const idx = new Map(NAMES.map((n, i)=>[n, i]));
    const rows = PAIRS.concat(extra||[]).map(([a, b, r, n])=>{ const ai = idx.get(a), bi = idx.get(b); return ai < bi ? [ai, bi, Math.round(r*100), n] : [bi, ai, Math.round(r*100), n]; }).sort((x, y)=> x[0]-y[0] || x[1]-y[1]);
    const e = []; rows.forEach(r=>e.push(r[0], r[1], r[2], r[3]));
    return { meta: { minShared: 100, minR: 0.3, k: 8, kNeg: 4 }, labels: {}, pairs: { minShared: 100, names: NAMES.slice(), e } };
  }
  function legacyTransfer(){
    const t = { meta: { minShared: 100, minR: 0.3, k: 8, kNeg: 4 }, labels: {} };
    Object.keys(LEGACY).forEach(k=>{ t[k] = LEGACY[k].map(r=>r.slice()); });
    return t;
  }
  const LABEL_TABLE = {
    'static|static clicking': [0.71, 40],          // same skill spelled twice
    'smoothness|reactive tracking': [0.62, 25],    // a real bridge
    'bonus|target switching': [0.80, 50],          // a no-skill end
    'static|static': [0.50, 12],                   // within
    'x|y': [0.90, 5]                               // under minPairs 10 -> dropped
  };
  const CLUSTERS = {
    meta: { lens: 'factors', k: 2, freeze: 'f'.repeat(64) },
    scenario: { [C1]: [3, 0.5, 1, 'member'], [C2]: [3, 0.4, 0.6, 'unstable'], [T1]: [5, 0.3, 0.9, 'provisional'], [X1]: [null, 0, 1, 'unassigned'] },
    cluster: { '3': { size: 2 }, '5': { size: 1 } }
  };
  // ---- the run ---------------------------------------------------------------
  function compute(E){
    const problems = []; let checks = 0;
    const J = x => JSON.stringify(x);
    const eq = (what, got, want) => { checks++; if(J(got)!==J(want)) problems.push(what+': expected '+J(want)+' got '+J(got)); };
    const near = (what, got, want, tol) => { checks++; if(!(typeof got==='number' && Math.abs(got-want) <= (tol===undefined ? 1e-9 : tol))) problems.push(what+': expected ~'+want+' got '+J(got)); };
    const ok = (what, cond) => { checks++; if(!cond) problems.push(what); };
    const names = rows => rows.map(r=>r.name);
    // rBand: 1.96/sqrt(n-3), floor at n-3 = 1
    near('rBand(100)', E.rBand(100), 1.96/Math.sqrt(97));
    near('rBand(403)', E.rBand(403), 0.098);
    near('rBand(1800)', E.rBand(1800), 1.96/Math.sqrt(1797));
    near('rBand(4)', E.rBand(4), 1.96);
    near('rBand(3) floors at n-3 = 1', E.rBand(3), 1.96);
    near('rBand(0) floors', E.rBand(0), 1.96);
    // buildOverlapIndex: pairs, legacy, none
    const P = E.buildOverlapIndex(pairsTransfer());
    const L = E.buildOverlapIndex(legacyTransfer());
    const N = E.buildOverlapIndex({ meta: { minShared: 100 } });
    eq('pairs index source', P.source, 'pairs'); eq('pairs index minShared', P.minShared, 100); eq('pairs index names', P.names, NAMES);
    eq('pairs index pairCount', P.pairCount, 14); eq('pairs index degree(C1)', P.degree(C1), 5); ok('pairs index has(C1)', P.has(C1) && !P.has('nope')); eq('pairs index edges(unknown)', P.edges('nope'), []);
    eq('legacy index source', L.source, 'legacy'); eq('legacy index minShared (meta)', L.minShared, 100); eq('legacy index names', L.names, NAMES);
    eq('legacy index pairCount (each unordered pair once)', L.pairCount, 10);
    eq('none index', [N.source, N.names, N.has(C1), N.edges(C1), N.pairCount], ['none', [], false, [], 0]);
    eq('none index on nothing', E.buildOverlapIndex(null).source, 'none');
    // the same edges at |r| >= 0.3 from either source, per scenario (sets of [name, r, n])
    NAMES.forEach(n=>{
      const strong = rows => rows.filter(e=>Math.abs(e.r)>=0.3).map(e=>[e.name, e.r, e.n]).sort((a,b)=> a[0]<b[0]?-1:1);
      eq('edges at |r| >= 0.3 agree for '+n, strong(L.edges(n)), strong(P.edges(n)));
    });
    // legacy lists are directed: a truncated list on one side does not invent an edge on the other
    const trunc = { meta: { minShared: 100 }, [C1]: [[C2, 0.6, 100]], [C2]: [] };
    const Lt = E.buildOverlapIndex(trunc);
    eq('legacy edges are the scenario\'s own list', [Lt.degree(C1), Lt.degree(C2), Lt.pairCount], [1, 0, 1]);
    // forEachPair visits every pair once with (a, b, r, n)
    let count = 0, sumN = 0; P.forEachPair((a, b, r, n)=>{ count++; sumN += n; });
    eq('forEachPair count', count, 14); eq('forEachPair n sum', sumN, PAIRS.reduce((s, p)=>s+p[3], 0));
    // overlapOf on the pairs index, defaults (minN 100, minR 0.3, unrelatedR 0.15)
    const o1 = E.overlapOf(C1, P);
    eq('overlapOf(C1) tested', o1.tested, 5);
    // with, by lower edge r - band: C3 0.58-0.046 = 0.534, M1 0.50-0.080 = 0.420, C2 0.60-0.199 = 0.401
    eq('overlapOf(C1) with order (0.60 at n=100 ranks under 0.58 at n=1800)', names(o1.with), [C3, M1, C2]);
    near('overlapOf(C1) with[0].band', o1.with[0].band, 1.96/Math.sqrt(1797));
    eq('overlapOf(C1) against', names(o1.against), [T1]);
    eq('overlapOf(C1) weak', names(o1.weak), []);
    eq('overlapOf(C1) unrelated (r 0 at n 500: band 0.088 < 0.3)', names(o1.unrelated), [T2]);
    eq('overlapOf(C1) inconclusive', o1.inconclusive, 0); eq('overlapOf(C1) complete', o1.complete, true);
    const o3 = E.overlapOf(C3, P);
    eq('overlapOf(C3) with', names(o3.with), [C1, C2]);
    eq('overlapOf(C3) unrelated: 0.10 at n=100 -> 0.10 + 0.199 = 0.299 < 0.3', names(o3.unrelated), [T3]);
    eq('overlapOf(C3) inconclusive', o3.inconclusive, 0);
    // the inconclusive rule: |r| < 0.15 but |r| + band reaches 0.3 (0.11 at n = 100 -> 0.309)
    const Pi = E.buildOverlapIndex(pairsTransfer([[X1, T3, 0.11, 100]]));
    const oi = E.overlapOf(X1, Pi);
    eq('inconclusive: 0.11 at n=100 is too thin to call', [oi.inconclusive, names(oi.unrelated), oi.tested], [1, [], 3]);
    const ox = E.overlapOf(X1, P);
    eq('overlapOf(X1) with (exactly the 0.30 floor)', names(ox.with), [C2]);
    eq('overlapOf(X1) weak (0.20)', names(ox.weak), [M1]);
    // knobs: minN 200 drops the n=100/150 rows; minR 0.5 moves 0.45 to weak
    const o1n = E.overlapOf(C1, P, { minN: 200 });
    eq('overlapOf(C1, minN 200) tested / with', [o1n.tested, names(o1n.with)], [4, [C3, M1]]);
    const o2r = E.overlapOf(C2, P, { minR: 0.5 });
    eq('overlapOf(C2, minR 0.5) with / weak', [names(o2r.with), names(o2r.weak)], [[C1], [C3, X1]]);
    // the unrelated ceiling is a knob: unrelatedR 0.25 makes the 0.20 row a candidate (band 0.062 -> 0.262 < 0.3 -> unrelated)
    const oxu = E.overlapOf(X1, P, { unrelatedR: 0.25 });
    eq('overlapOf(X1, unrelatedR 0.25) unrelated', names(oxu.unrelated), [M1]);
    // legacy: unrelated null, inconclusive 0, complete false, the shipped rows only
    const ol = E.overlapOf(C1, L);
    eq('overlapOf legacy (C1)', [ol.tested, names(ol.with), names(ol.against), ol.unrelated, ol.inconclusive, ol.complete], [4, [C3, M1, C2], [T1], null, 0, false]);
    // groupMatrix over the curator labels (groupsOf = the label list)
    const groupsOf = n => LABELS[n] || [];
    const SC = 'static clicking', RT = 'reactive tracking', SK = 'static click', BO = 'bonus';
    const M = E.groupMatrix(P, groupsOf);
    eq('groupMatrix groups (evidence order: size desc, id asc)', M.groups, [{ id: RT, size: 4 }, { id: SC, size: 3 }, { id: BO, size: 2 }, { id: SK, size: 1 }]);
    // cells by hand (each scenario pair once per unordered cell):
    //   SC|SC: 0.60 (C1C2), 0.50 (M1C1)                      -> mean 0.55, 2 tested, 2 strong+
    //   RT|RT: 0.55, 0.50, 0.40, 0.48 (M1T1)                 -> 1.93/4 = 0.4825, 4, 4 strong+
    //   SC|RT: -0.35, 0.05, 0.00, 0.50 (M1C1), 0.48 (M1T1)   -> 0.68/5 = 0.136, 5, 2 strong+, 1 strong-
    //   SC|SK: 0.58, 0.45 -> 0.515, 2;  SC|BO: 0.58, 0.45 -> 0.515, 2
    //   RT|BO: 0.50, 0.40, 0.10 (C3T3) -> 1.00/3 = 0.3333, 3, 2 strong+
    //   SK|RT, SK|BO, BO|BO: 0.10 each, 1 tested; SK|SK: nothing
    const cell = (a, b) => { const c = M.cell(a, b); return c ? [Math.round(c.meanR*1e6)/1e6, c.tested, c.strongPos, c.strongNeg] : null; };
    eq('cell SC|SC', cell(SC, SC), [0.55, 2, 2, 0]);
    eq('cell RT|RT', cell(RT, RT), [0.4825, 4, 4, 0]);
    eq('cell SC|RT', cell(SC, RT), [0.136, 5, 2, 1]);
    eq('cell RT|SC (symmetric)', cell(RT, SC), [0.136, 5, 2, 1]);
    eq('cell SC|SK', cell(SC, SK), [0.515, 2, 2, 0]);
    eq('cell SC|BO', cell(SC, BO), [0.515, 2, 2, 0]);
    eq('cell RT|BO', cell(RT, BO), [0.333333, 3, 2, 0]);
    eq('cell BO|BO (a pair whose two scenarios both carry the label counts once)', cell(BO, BO), [0.1, 1, 0, 0]);
    eq('cell SK|SK missing', cell(SK, SK), null);
    eq('cell unknown', cell('nope', SC), null);
    near('cohesion SC', M.cohesion(SC), 0.55); near('cohesion RT', M.cohesion(RT), 0.4825); near('cohesion BO', M.cohesion(BO), 0.10); eq('cohesion SK', M.cohesion(SK), null);
    near('overlap SC|RT = 0.136/sqrt(0.55*0.4825)', M.overlap(SC, RT), 0.136/Math.sqrt(0.55*0.4825));
    near('overlap SC|BO (cohesion 0.10 >= 0.05 still computes)', M.overlap(SC, BO), 0.515/Math.sqrt(0.055));
    eq('overlap SC|SK null (no cohesion)', M.overlap(SC, SK), null);
    eq('overlap under minCohesion null', E.groupMatrix(P, groupsOf, { minCohesion: 0.2 }).overlap(SC, BO), null);
    // pairs(a, b): the rows behind the cell; their mean is the cell's mean, their count the tested count
    const pr = M.pairs(SC, RT);
    eq('pairs(SC, RT) count', pr.length, 5);
    near('pairs(SC, RT) mean == cell mean', pr.reduce((s, p)=>s+p.r, 0)/pr.length, 0.136);
    const unordered = rows => rows.map(p=>[p.a, p.b].sort().join(' + ')).sort();
    eq('pairs(SC, RT) names', unordered(pr), unordered([{ a: C1, b: T1 }, { a: C1, b: T2 }, { a: C2, b: T2 }, { a: M1, b: C1 }, { a: M1, b: T1 }]));
    eq('pairs(SC, SC)', M.pairs(SC, SC).map(p=>p.r).sort(), [0.5, 0.6]);
    eq('pairs(RT, SC) cached symmetric', M.pairs(RT, SC).length, 5);
    eq('pairs of an empty cell', M.pairs(SK, SK), []);
    // minN knob on the matrix: at 300 the C1C2 (100), T1T3 (250), X1C2 (150), C3T3 (100) rows drop
    const M3 = E.groupMatrix(P, groupsOf, { minN: 300 });
    eq('groupMatrix minN 300: SC|SC', M3.cell(SC, SC).tested, 1); eq('groupMatrix minN 300: RT|BO', M3.cell(RT, BO).tested, 1);
    eq('groupMatrix minSize 2 drops SK', E.groupMatrix(P, groupsOf, { minSize: 2 }).groups.map(g=>g.id), [RT, SC, BO]);
    eq('groupMatrix groupsOfName', M.groupsOfName(M1), [SC, RT]);
    // independentGroups: evidence order, cut 0.25, cohesion 0.10, tested 2 (the fixture is small)
    const ig = E.independentGroups(M, { minTested: 2 });
    eq('independent kept (evidence order)', ig.kept.map(k=>[k.id, k.size, k.tested, k.coveredBy.map(c=>c.id)]), [[RT, 4, 4, [SC]]]);
    near('independent: SC covered by RT at overlap 0.264', ig.kept[0].coveredBy[0].overlap, 0.136/Math.sqrt(0.55*0.4825));
    eq('independent skipped', ig.skipped.map(s=>[s.id, s.by]), [[SC, RT]]);
    // SK has no own pair at all: that is 'cannot be measured' (thin, tested 0), not 'does not hold together'
    eq('independent thin (BO: own cell 1 < 2; SK: no own cell)', ig.thin.map(t=>[t.id, t.tested, t.vs]), [[BO, 1, null], [SK, 0, null]]);
    eq('independent incoherent (none: an unmeasurable cell is thin, not incoherent)', ig.incoherent.map(t=>t.id), []);
    eq('independent: cut 0.30 keeps both', E.independentGroups(M, { minTested: 2, maxOverlap: 0.30 }).kept.map(k=>k.id), [RT, SC]);
    eq('independent: default minTested 30 makes everything thin (all four groups, SK included)', E.independentGroups(M).kept.length + E.independentGroups(M).thin.length, 0 + 4);
    // weakness order: the caller's standing decides who is walked first -> a different set
    const standing = new Map([[SC, { median: 0.2, n: 3 }], [RT, { median: 0.5, n: 4 }]]);
    const iw = E.independentGroups(M, { minTested: 2, order: 'weakness', standing });
    eq('independent by weakness: SC first, RT absorbed', [iw.kept.map(k=>k.id), iw.skipped.map(s=>[s.id, s.by])], [[SC], [[RT, SC]]]);
    eq('independent by weakness: unknown standing walks last (BO, SK after the known two)', E.independentGroups(M, { minTested: 2, order: 'weakness', standing: { [RT]: { median: 0.1 } } }).kept.map(k=>k.id), [RT]);
    eq('independent: eligible filter', E.independentGroups(M, { minTested: 2, eligible: id => id!==RT }).kept.map(k=>k.id), [SC]);
    // two groups under the cut are both kept: e = {C1, C3}, g = {T1, T3} ->
    // e|e 0.58 (1), g|g 0.50 (1), e|g: C1T1 -0.35, C3T3 0.10 -> mean -0.125;
    // |overlap| = 0.125/sqrt(0.58*0.50) = 0.232 < 0.25
    const Meg = E.groupMatrix(P, n => (n===C1 || n===C3) ? ['e'] : ((n===T1 || n===T3) ? ['g'] : []));
    near('e/g overlap -0.232', Meg.overlap('e', 'g'), -0.125/Math.sqrt(0.58*0.5));
    eq('e/g: overlap -0.232, cut 0.25 -> both kept', E.independentGroups(Meg, { minTested: 1 }).kept.map(k=>k.id), ['e', 'g']);
    // negative overlap never absorbs, however large: at cut 0.20 |-0.232| is over the cut
    // but the groups move AGAINST each other -- that is a different skill, kept apart
    eq('e/g: overlap -0.232 at cut 0.20 -> still both kept (negative overlap = different skill)', E.independentGroups(Meg, { minTested: 1, maxOverlap: 0.20 }).kept.map(k=>k.id), ['e', 'g']);
    // a thin PAIR cell with a kept group -> thin, never independent: v = {C1, C3, M1},
    // w = {T1, T2, T3} at minN 600 -> v|v: C1C3 (1800), M1C1 (600) = 2; w|w: T1T2 (900),
    // T2T3 (1200) = 2; v|w: M1T1 (700) only = 1 (C1T1 300, C1T2 500, C3T3 100 drop).
    // Evidence order: equal sizes, id asc -> v walked first and kept; w's own cell
    // passes minTested 2 but its cell against v holds one pair -> thin vs v.
    const Mvw = E.groupMatrix(P, n => [C1, C3, M1].includes(n) ? ['v'] : ([T1, T2, T3].includes(n) ? ['w'] : []), { minN: 600 });
    eq('v/w cells at minN 600', [Mvw.cell('v', 'v').tested, Mvw.cell('w', 'w').tested, Mvw.cell('v', 'w').tested], [2, 2, 1]);
    const ivw = E.independentGroups(Mvw, { minTested: 2, maxOverlap: 0.25 });
    eq('thin pair cell: w is thin against kept v, never independent', [ivw.kept.map(k=>k.id), ivw.thin.map(t=>[t.id, t.tested, t.vs]), ivw.skipped.length], [['v'], [['w', 1, 'v']], 0]);
    // foldLabels: identical facet sets fold, the nested pair does NOT (subset is not identity), unknown labels stay
    const fold = E.foldLabels([SC, SK, 'static', RT, BO, 'made-up label']);
    eq('foldLabels', [...fold.entries()], [[SC, 'clicking|static'], [SK, 'clicking|static'], ['static', 'static'], [RT, 'reactive|tracking'], [BO, BO], ['made-up label', 'made-up label']]);
    // bridgeRows: flags and order
    const br = E.bridgeRows(LABEL_TABLE);
    eq('bridgeRows', br.map(b=>[b.a, b.b, b.meanR, b.pairs, b.within, b.sameSkill, b.nonSkill]), [
      ['bonus', 'target switching', 0.80, 50, false, false, true],
      ['static', 'static clicking', 0.71, 40, false, true, false],
      ['smoothness', 'reactive tracking', 0.62, 25, false, false, false],
      ['static', 'static', 0.50, 12, true, false, false]
    ]);
    eq('bridgeRows minPairs 30', E.bridgeRows(LABEL_TABLE, { minPairs: 30 }).map(b=>b.pairs), [50, 40]);
    eq('bridgeRows on nothing', E.bridgeRows(null), []);
    // neighboursFromIndex == the hand-written legacy lists, for every scenario
    NAMES.forEach(n=>eq('neighboursFromIndex('+n+') == legacy list', E.neighboursFromIndex(P, n), LEGACY[n]));
    eq('neighboursFromIndex k 2', E.neighboursFromIndex(P, C1, { k: 2 }), [[C2, 0.60, 100], [C3, 0.58, 1800], [T1, -0.35, 300]]);
    eq('neighboursFromIndex kNeg 0', E.neighboursFromIndex(P, C1, { kNeg: 0 }).length, 3);
    eq('neighboursFromIndex minR 0.5', E.neighboursFromIndex(P, C1, { minR: 0.5 }).map(r=>r[0]), [C2, C3, M1]);
    eq('neighboursFromIndex unknown', E.neighboursFromIndex(P, 'nope'), []);
    // clusterGroupsOf
    const g0 = E.clusterGroupsOf(CLUSTERS);
    eq('clusterGroupsOf members only', [g0(C1), g0(C2), g0(T1), g0(X1), g0('nope')], [['3'], [], [], [], []]);
    eq('clusterGroupsOf includeProvisional', E.clusterGroupsOf(CLUSTERS, { includeProvisional: true })(T1), ['5']);
    eq('clusterGroupsOf includeUnstable', E.clusterGroupsOf(CLUSTERS, { includeUnstable: true })(C2), ['3']);
    eq('clusterGroupsOf statusOf / ids', [g0.statusOf(C1), g0.statusOf(T1), g0.statusOf('nope'), g0.ids], ['member', 'provisional', null, ['3', '5']]);
    eq('clusterGroupsOf on nothing', [E.clusterGroupsOf(null)(C1), E.clusterGroupsOf(null).ids], [[], []]);
    const Mc = E.groupMatrix(P, E.clusterGroupsOf(CLUSTERS, { includeProvisional: true }));
    eq('groupMatrix through clusters: 3|5 = C1T1', [Mc.groups, Mc.cell('3', '5').tested, Mc.cell('3', '5').meanR], [[{ id: '3', size: 1 }, { id: '5', size: 1 }], 1, -0.35]);
    // ---- the lifted helpers ----
    eq('normalizeLabel', E.normalizeLabel('  Static Clicking '), 'static clicking'); eq('normalizeLabel(null)', E.normalizeLabel(null), '');
    eq('labelFacetSet(static clicking)', [...E.labelFacetSet(SC)].sort(), ['clicking', 'static']);
    eq('labelFacetSet(static)', [...E.labelFacetSet('static')], ['static']);
    eq('labelFacetSet(bonus) null (no skill)', E.labelFacetSet(BO), null);
    eq('labelFacetSet(easy) null (evicted)', E.labelFacetSet('easy'), null);
    eq('labelFacetSet(unknown) null', E.labelFacetSet('made-up label'), null);
    eq('sameSkillLabels(static, static clicking)', E.sameSkillLabels('static', SC), true);
    eq('sameSkillLabels(static clicking, static click)', E.sameSkillLabels(SC, SK), true);
    eq('sameSkillLabels(reactive tracking, smoothness)', E.sameSkillLabels(RT, 'smoothness'), false);
    eq('sameSkillLabels(tracking, dodge)', E.sameSkillLabels('tracking', 'dodge'), false);
    eq('sameSkillLabels with an unknown label', E.sameSkillLabels(SC, 'made-up label'), false);
    eq('noSkillLabel', [E.noSkillLabel(BO), E.noSkillLabel('easy'), E.noSkillLabel(SC), E.noSkillLabel('made-up label')], [true, true, false, false]);
    const rows = [{ played: true, rung: 3 }, { played: true, rung: 4 }, { played: true, rung: 5 }, { played: false, rung: 8 }, { played: true, rung: -1 }];
    eq('sessionLevel', E.sessionLevel(rows), 4); eq('sessionLevel even count rounds', E.sessionLevel(rows.concat([{ played: true, rung: 6 }])), 5); eq('sessionLevel none', E.sessionLevel([]), null);
    eq('isStuck', [E.isStuck({ att: { n: 5, nearness: 0.5 } }), E.isStuck({ att: { n: 3, nearness: 0.5 } }), E.isStuck({ att: { n: 5, nearness: 0.9 } }), E.isStuck({ att: { n: 5, nearness: null } }), E.isStuck({})], [true, false, false, false, false]);
    const w = { played: true, pct: 0.28, to2nd: 0.4 };
    const rc = (y, lvl) => { const r = E.routeCheck(y, w, lvl===undefined ? 4 : lvl); return [r.ok, r.cmp, r.why]; };
    eq('routeCheck unplayed at level+1', rc({ played: false, rung: 5 }), [true, 'to2nd', null]);
    eq('routeCheck above level', rc({ played: false, rung: 6 }), [false, 'to2nd', 'above level']);
    eq('routeCheck no level cap when level null', rc({ played: false, rung: 8 }, null), [true, 'to2nd', null]);
    eq('routeCheck unrated', rc({ played: false, rung: -1 }), [false, 'to2nd', 'unrated']);
    eq('routeCheck maxed', rc({ played: true, rung: 4, maxed: true, pct: 0.9 }), [false, 'pct', 'maxed']);
    eq('routeCheck stuck', rc({ played: true, rung: 4, pct: 0.9, att: { n: 5, nearness: 0.5 } }), [false, 'pct', 'stuck']);
    eq('routeCheck plateaued', rc({ played: true, rung: 4, pct: 0.9, resp: { state: 'plateaued' } }), [false, 'pct', 'plateaued']);
    eq('routeCheck not higher (pct)', rc({ played: true, rung: 4, pct: 0.32 }), [false, 'pct', 'not higher']);
    eq('routeCheck higher (pct)', rc({ played: true, rung: 4, pct: 0.33 }), [true, 'pct', null]);
    eq('routeCheck To 2nd scale when one side has no curve', rc({ played: true, rung: 4, pct: null, to2nd: 0.46 }), [true, 'to2nd', null]);
    eq('routeCheck not higher (To 2nd)', rc({ played: true, rung: 4, pct: null, to2nd: 0.44 }), [false, 'to2nd', 'not higher']);
    eq('routeCheck missing', E.routeCheck(null, w, 4).why, 'missing');
    // skillProfile keyBy 'labels': normalised raw labels, kind 'label'; default unchanged
    const prof = [
      { name: 'a', played: true, maxed: false, pct: 0.2, labels: ['Static Clicking'], facets: ['clicking', 'static'] },
      { name: 'b', played: true, maxed: false, pct: 0.4, labels: ['static clicking', 'bonus'], facets: ['clicking', 'static'] },
      { name: 'c', played: false, labels: ['bonus'], facets: [] }
    ];
    const r3 = x => Math.round(x*1000)/1000;
    eq('skillProfile keyBy labels', E.skillProfile(prof, { keyBy: 'labels' }).map(p=>[p.label, p.kind, r3(p.median), p.n]), [['static clicking', 'label', 0.3, 2], ['bonus', 'label', 0.4, 1]]);
    eq('skillProfile default (facets)', E.skillProfile(prof).map(p=>[p.label, p.kind, r3(p.median), p.n]), [['clicking', 'facet', 0.3, 2], ['static', 'facet', 0.3, 2]]);
    return { checks, problems };
  }
  const api = { compute, PAIRS, LEGACY, LABELS, NAMES, pairsTransfer, legacyTransfer, CLUSTERS };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (require.main === module) {
      const path = require('path');
      const E = require(path.join(__dirname, '..', 'src', 'engine.js'));
      const r = compute(E);
      console.log(`overlap: ${r.checks} checks; problems ${r.problems.length}`);
      if (r.problems.length) { r.problems.slice(0, 30).forEach(p => console.log('  ' + p)); process.exit(1); }
    }
  } else {
    root.__miniEvxlOverlap = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
