// mini-evxl engine -- the pure part of the tracker: dataset parsing (v2 and the
// v1 importer), tier reading, evxl's rank rules, volts, pool selection, merged
// progress, difficulty rungs, skill facets. No DOM, no storage, no fetch.
// build.ps1 inlines it into the page ahead of the src/app/*.js fragments; tests
// load it in Node:  const E = require('./src/engine.js').
// Every rank rule here is proven against evxl's own functions by dev/rank-diff-test.js.
// A note for readers: the rank rules from scenarioEnergy() through the 28-mode tail
// deliberately keep evxl's own one-letter variable names -- they read as minified
// code because they were transliterated from it, and their correctness rests on the
// differential test, not on readability. Don't tidy them for their own sake; if a
// mode ever needs to change, the diff test is what makes a readable rewrite safe.
const MiniEvxlEngine = (function(){
  function stripSuffix(s){ return String(s).replace(/\s*-\s*[\d,]+$/,'').trim(); }

  // ---- dataset format (v2, 2026-08-16 late) --------------------------------
  // An entry is STRUCTURE only — the same for every player:
  //   { name, pack, difficulty,
  //     tiers:  ["Iron","Bronze",…],                          // ladder order
  //     groups: [ { category, subcategory,                    // evxl's table order
  //                 scenarios: [ { name, thresholds:[n,…] }, … ] }, … ],
  //     rankCalc, evxlId, evxlRankOffset, evxlDiffIndex,      // stamped by apply-evxl-catalog.ps1
  //     selection: {…} }                                       // pool benchmarks only
  // Scores live apart: the #scores-data block seeds the per-browser store, and
  // every item's score is read from the store (parsedItemsFor). Groups are the
  // catalog's own layout, and are told apart by POSITION (gi), never by name —
  // evxl encodes an uncategorised benchmark as one group per scenario, all
  // unnamed, and the rank engine must see them as separate subcategories.
  //
  // The old v1 shape (hdrs/rows mirroring evxl's scraped table, a score baked
  // into every row, a `%` cell to find it by) is still accepted by the importer
  // and converted on the way in — see convertV1Entry().
  //
  // One entry's scenarios as engine items, in table order:
  //   { name, tiers:[[tierName, threshold],…], score:0, gi, category, subcategory,
  //     tags:[category, subcategory] minus blanks (the filter chips), group }
  // `group` is the detail page's heading: the category when the entry has any,
  // else the lone label (which the catalog files under subcategory).
  function entryItems(b){
    const tierNames = Array.isArray(b.tiers) ? b.tiers.map(String) : [];
    const groups = Array.isArray(b.groups) ? b.groups : [];
    const hasCats = groups.some(g=>g && String(g.category||'').trim());
    const items=[];
    groups.forEach((g,gi)=>{
      if(!g) return;
      const category = String(g.category||'').trim(), subcategory = String(g.subcategory||'').trim();
      const tags = [category, subcategory].filter(Boolean);
      const group = hasCats ? category : subcategory;
      (Array.isArray(g.scenarios) ? g.scenarios : []).forEach(s=>{
        if(!s || !s.name) return;
        const th = Array.isArray(s.thresholds) ? s.thresholds : [];
        items.push({ name: String(s.name).trim(), tiers: tierNames.map((n,i)=>[n, Number(th[i])||0]), score: 0, gi, category, subcategory, tags, group });
      });
    });
    return items;
  }
  // v1 → v2 for the importer (the same reading the page did for years, plus the
  // grouping the rank engine used: the catalog layout `subcats` when its counts
  // add up, else the table's own label path). Returns { entry, scores } — the
  // row scores go to the store, not the entry.
  function convertV1Entry(b){
    const hdrs = Array.isArray(b.hdrs) ? b.hdrs.map(String) : [];
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const sIdx = hdrs.indexOf('Scenario');
    const maxDepth = Math.max(sIdx,0);
    const hasEnergyCol = hdrs[hdrs.length-1]==='Energy';
    const tierNames = hdrs.slice(sIdx+3, hasEnergyCol?hdrs.length-1:hdrs.length);
    const curLevels = new Array(Math.max(maxDepth,1)).fill('');
    const items=[]; const scores = new Map();
    rows.forEach(row=>{
      if(!Array.isArray(row) || row.length<=1) return;
      let p=-1;
      for(let i=0;i<row.length;i++){ if(/^-?\d+(\.\d+)?%$/.test(row[i])){p=i;break;} }
      if(p<2) return;
      const name=String(row[p-2]).trim(), score=parseFloat(String(row[p-1]).replace(/,/g,''))||0;
      const labels=row.slice(0,Math.max(p-2,0));
      if(maxDepth>0 && labels.length>0){
        const start = maxDepth-labels.length;
        for(let i=0;i<labels.length;i++){ curLevels[Math.max(start+i,0)]=stripSuffix(labels[i]); }
      }
      const thresholds = tierNames.map((n,i)=>parseFloat(String(row[p+1+i]!==undefined?row[p+1+i]:'0').replace(/,/g,''))||0);
      items.push({ name, thresholds, tags: curLevels.filter(Boolean) });
      if(score>0 && (!scores.has(name) || scores.get(name)<score)) scores.set(name, score);
    });
    const groups=[];
    const sc = Array.isArray(b.subcats) ? b.subcats : [];
    const sum = sc.reduce((a,x)=>a+(Number(x[2])||0),0);
    if(sc.length && sum===items.length){
      let i=0;
      sc.forEach(x=>{ const n=Number(x[2])||0; if(n<=0) return; groups.push({ category:String(x[0]||'').trim(), subcategory:String(x[1]||'').trim(), scenarios: items.slice(i,i+n).map(it=>({name:it.name, thresholds:it.thresholds})) }); i+=n; });
    } else {
      let last=null, lastKey=null;
      items.forEach((it,i)=>{
        const key = it.tags.length ? it.tags.join('::') : '#'+i;
        if(!last || key!==lastKey){ last={ category: it.tags.length>1 ? it.tags[0] : '', subcategory: it.tags.length ? it.tags[it.tags.length-1] : '', scenarios:[] }; groups.push(last); lastKey=key; }
        last.scenarios.push({name:it.name, thresholds:it.thresholds});
      });
    }
    const entry = { name: b.name, pack: b.pack || b.name, difficulty: b.difficulty, tiers: tierNames, groups };
    ['rankCalc','evxlId','evxlRankOffset','evxlDiffIndex','selection','rankReq'].forEach(f=>{ if(b[f]!==undefined && b[f]!==null) entry[f]=b[f]; });
    return { entry, scores };
  }
  function isV1Entry(b){ return !!(b && Array.isArray(b.hdrs) && Array.isArray(b.rows) && !Array.isArray(b.groups)); }

  // Highest tier index the score has reached — evxl's own reading (its H()):
  // an unplayed scenario (score 0) reaches nothing, and a 0/blank threshold
  // counts as passed for any positive score. This is the ONE rule for bars,
  // labels and the rank engine alike; they used to disagree.
  function achievedIndex(score, tiers){
    let idx=-1;
    if(!(score>0)) return idx;
    for(let i=0;i<tiers.length;i++){ if(score>=tiers[i][1]) idx=i; }
    return idx;
  }
  // 1-based tier plus fractional progress toward the next one (evxl's
  // preciseRank). Only used to pick the best scenario inside a subcategory.
  function preciseTier(score, tiers){
    const idx = achievedIndex(score, tiers);
    const r = idx+1, n = tiers.length;
    if(r===0) return 0;
    if(r===n){ const top=tiers[n-1][1], prev=n>1?tiers[n-2][1]:0; const w=Math.abs(top-prev)||1; return r + Math.max(0,(score-top)/w); }
    const lo=tiers[r-1][1], span=tiers[r][1]-lo;
    return r + (span>0 ? (score-lo)/span : 0);
  }

  // How far one scenario is through its own tier ladder, 0..1. Each tier is an
  // equal step (same reasoning as the merged bars: rank order, not raw point
  // magnitude), with linear interpolation inside the current step.
  function scenarioCompletion(score, tiers){
    const th = tiers.map(t=>t[1]).filter(v=>v>0);
    const n = th.length;
    if(n===0) return 0;
    let idx=-1;
    for(let i=0;i<n;i++){ if(score>=th[i]) idx=i; }
    if(idx===n-1) return 1;
    if(idx<0) return th[0]>0 ? Math.max(0, Math.min(1, score/th[0]))/n : 0;
    const lower=th[idx], upper=th[idx+1];
    const frac = upper>lower ? (score-lower)/(upper-lower) : 0;
    return (idx+1+frac)/n;
  }

  // ---- Rank engine ------------------------------------------------------
  // Playlist-level standing, computed from tier thresholds and your own
  // scores — no evxl, no server. Modelled on evxl's own engine, which was
  // read out of its JS bundle (see CLAUDE.md, "evxl's JS bundle carries its
  // whole catalog"): every benchmark declares a `rankCalculation` mode, and
  // the displayed rank is
  //
  //     max( mode rank , "Complete" rank )
  //
  // where the Complete rank is the highest tier EVERY scenario has reached
  // (shown as "X Complete"), and the mode rank is whatever that benchmark's
  // rule says (shown bare, "X"). The rules live in RANK_RULES, keyed by the
  // entry's `rankCalc` (stamped by apply-evxl-catalog.ps1) — 40 of evxl's 41
  // modes, each proven against evxl's own functions by dev/rank-diff-test.js
  // (the tracker repo's CLAUDE.md has the per-mode table). Each rule is
  // `(items, b, ctx) → 1-based tier` (0 = none), where ctx carries the tier
  // count, the Complete tier and, for pool benchmarks, the whole pool. A mode
  // with no rule (`aimbeast`, an external service) shows the Complete rank
  // only — true, just conservative — flagged `modeSupported:false` so the UI
  // can say so.
  //
  // `pct` is the continuous companion for cards and sorting: mean scenario
  // completion. The floor tier alone is a poor progress signal because one
  // weak scenario pins the whole playlist; the mean moves when anything does.

  // Subcategory groups in table order — the entry's own groups (evxl's catalog
  // layout), told apart by position (`gi`) so unnamed groups stay separate.
  // Works on any subset of an entry's items (a pool selection, the diff test's
  // synthetic vectors): each item remembers which group it came from.
  function subcategoryGroups(items, b){ return subcategoryGroupsNamed(items, b).map(g=>g.items); }
  // Same, keeping the labels: [{cat, sub, items}]. Some modes filter
  // subcategories by name (vt-energy drops anything containing "strafe").
  function subcategoryGroupsNamed(items, b){
    const byGi = new Map();
    items.forEach((it,i)=>{
      const key = Number.isFinite(it.gi) ? it.gi : ('#'+i);
      if(!byGi.has(key)) byGi.set(key, {cat: it.category||'', sub: it.subcategory||'', items: []});
      byGi.get(key).items.push(it);
    });
    return [...byGi.values()];
  }

  // The scenario a subcategory counts by: its best played one (evxl's ue()).
  // Prefers any ranked scenario over unranked ones; among ranked, the higher
  // preciseTier; among unranked, the higher energy if an energy function is
  // given, else the closer to its first threshold. null = nothing played.
  function subcategoryBest(group, energyFn){
    let best=null, bestTier=0, bestPrecise=0, bestFrac=-1;
    group.forEach(it=>{
      if(!(it.score>0)) return;
      const tier = achievedIndex(it.score, it.tiers)+1;
      const precise = tier>0 ? preciseTier(it.score, it.tiers) : 0;
      const first = it.tiers.length ? it.tiers[0][1] : 0;
      const frac = energyFn ? energyFn(it) : (first>0 ? it.score/first : 0);
      let better = false;
      if(!best) better = true;
      else if(tier>0 && bestTier===0) better = true;
      else if(tier>0 && bestTier>0) better = precise>bestPrecise;
      else if(tier===0 && bestTier===0) better = frac>bestFrac;
      if(better){ best=it; bestTier=tier; bestPrecise=precise; bestFrac=frac; }
    });
    return best;
  }
  function subcategoryTier(group){
    const best = subcategoryBest(group);
    return best ? achievedIndex(best.score, best.tiers)+1 : 0;
  }

  // ---- energy (evxl's W()) -------------------------------------------------
  // A scenario's "energy": its position on this difficulty's energy ladder,
  // where reaching tier r is worth `th[r-1]` and the ladder is
  // th = [(offset+1)*100, …, (offset+n)*100] — every difficulty of a benchmark
  // sits on one long ladder, offset by the ranks of the difficulties before it.
  // Below the first tier: ramps from 0 up to th[0]-100 by a "fake" tier one
  // gap below the first threshold, then on to th[0]. Above the top: continues
  // one more gap (or `overSpan` gaps), then flat.
  function scenarioEnergy(it, th, overSpan, lowerOffset, noTrunc){
    const t = (lowerOffset===undefined) ? 100 : lowerOffset;
    const T = noTrunc ? (x=>x) : Math.trunc;
    const score = it.score;
    const tv = it.tiers.map(x=>x[1]);
    const base = achievedIndex(score, it.tiers)+1;
    if(base===0){
      if(!(score>0) || tv.length<2) return 0;
      const f=tv[0], m=tv[1]-f, bb=f-m, p=th[0]-t, y=th[0];
      const N = score<bb ? score/bb*p : p+(score-bb)/(f-bb)*(y-p);
      return T(N);
    }
    const pr = preciseTier(score, it.tiers);
    const a=th.length, i=th[0]-t, l=th[a-1], g=a>1?th[a-2]:0, u=(l-g)||100, h=l+u;
    if(pr<=0) return 0;
    if(pr<1) return T(i+pr*(th[0]-i));
    if(pr<a){ const d=Math.floor(pr), k=pr-d, f=d===0?i:th[d-1], R=th[d]; return T(f+k*(R-f)); }
    if(pr<a+overSpan) return T(l+(pr-a)*(h-l));
    return T(h);
  }
  // evxl's Z(): per-subcategory best energy (subcategories optionally
  // filtered by name), each capped, harmonic mean → rank on `thresholds`.
  // Any counted subcategory at 0 energy → Unranked (evxl's X()).
  function zRank(items, b, cfg){
    const th = cfg.thresholds;
    if(!th || !th.length) return 0;
    const cap = Number.isFinite(cfg.cap) ? cfg.cap : Infinity;
    const energyFn = it => scenarioEnergy(it, th, cfg.overSpan, cfg.lowerOffset);
    const groups = subcategoryGroupsNamed(items, b).filter(g => cfg.filter ? cfg.filter(g) : true);
    const energies = groups.map(g=>{
      const best = subcategoryBest(g.items, energyFn);
      if(!best) return 0;
      return Math.min(energyFn(best), cap);
    });
    if(energies.length===0 || energies.some(e=>!(e>0))) return 0;
    const hm = Math.round(energies.length/energies.reduce((a,e)=>a+1/e,0)*10)/10;
    for(let i=th.length-1;i>=0;i--){ if(hm>=th[i]) return i+1; }
    return 0;
  }
  // generic-energy / -uncapped: this difficulty's slice of the benchmark-wide
  // 100-per-rank ladder (offset by preceding difficulties); capped one rank
  // above the top (uncapped: only "advanced" is capped, at 1200).
  function energyRank(items, b, ctx, opts){
    const n = ctx.tierCount;
    if(n===0) return 0;
    const off = Number(b.evxlRankOffset)||0;
    const th = Array.from({length:n},(_,i)=>(off+i+1)*100);
    const cap = opts.capped ? (off+n+1)*100 : (String(b.difficulty||'').trim().toLowerCase()==='advanced' ? 1200 : Infinity);
    return zRank(items, b, { thresholds: th, lowerOffset: 100, overSpan: opts.overSpan, cap });
  }
  // vt-energy (Voltaic S5/S5.5; evxl's Y()+pe()): a fixed 100…1500 ladder
  // sliced per difficulty (novice 100–400, intermediate 500–800, advanced
  // 900–1200; unknown names take the whole ladder), fake-lower offset 0 for
  // novice else 100, over-max span 1, "strafe" subcategories excluded from the
  // mean, and advanced capped at 1200. ("elite (unofficial)" isn't in our data.)
  function vtEnergyRank(items, b, ctx){
    const ladder = [100,200,300,400,500,600,700,800,900,1000,1100,1200,1300,1400,1500];
    const diff = String(b.difficulty||'').trim().toLowerCase();
    let slice = { novice:[0,4], intermediate:[4,8], advanced:[8,12] }[diff] || [0, ladder.length];
    if(diff==='elite (unofficial)'){
      // evxl's pe(): the top of the ladder, one step lower when the first
      // tier is a Grandmaster tier.
      const first = ((Array.isArray(b.tiers) && b.tiers[0]) || (items[0] && items[0].tiers[0] && items[0].tiers[0][0]) || '');
      slice = String(first).toLowerCase().replace(/[^a-z]/g,'').startsWith('grandmaster') ? [8,14] : [9,15];
    }
    const th = ladder.slice(slice[0], slice[1]);
    return zRank(items, b, { thresholds: th, lowerOffset: diff==='novice' ? 0 : 100, overSpan: 1,
      cap: diff==='advanced' ? 1200 : Infinity,
      filter: g => !String(g.sub||'').toLowerCase().includes('strafe') });
  }
  // aplus-alt (Aimerz+; evxl's hn()): every scenario contributes
  // (tier + progress) × 100/N (below the first tier: score/first × 100/N);
  // the sum is read off a 100-per-tier ladder.
  function aplusAltRank(items, b, ctx){
    const n = ctx.tierCount; if(!n || !items.length) return 0;
    const th = Array.from({length:n},(_,i)=>(i+1)*100);
    const s = 100/items.length;
    let total = 0;
    items.forEach(it=>{
      const tv = it.tiers.map(x=>x[1]);
      const base = achievedIndex(it.score, it.tiers)+1;
      let d;
      if(base===0){ const k = tv[0]||1; d = (it.score>0 ? it.score : 0)/k*s; }
      else d = (base + tierFrac(it))*s;
      total += d;
    });
    total = Math.round(total*100)/100;
    let r=0; for(let i=th.length-1;i>=0;i--){ if(total>=th[i]){ r=i+1; break; } }
    return r;
  }
  // jade-palace (evxl's Sn()): benchmark-wide ladder like generic-energy;
  // per-scenario energy (below first tier: score/first × first threshold;
  // maxed: top + min(over,1)×100, or uncapped over×100 on Easy); each
  // subcategory counts the mean of its top half (top 3 on Fundamentals);
  // harmonic mean with zeros treated as 0.1; on Easy, if the capped mean is
  // ≥ 600 the uncapped one is used instead.
  function jadePalaceRank(items, b, ctx){
    const n = ctx.tierCount; if(!n) return 0;
    const off = Number(b.evxlRankOffset)||0;
    const c = Array.from({length:n},(_,i)=>(off+i+1)*100);
    const diff = String(b.difficulty||'').trim().toLowerCase();
    const isEasy = diff==='easy', isFund = diff==='fundamentals';
    const energies = it => {
      let L=0, G=0;
      const tv = it.tiers.map(x=>x[1]);
      if(it.score>0 && tv.length>0){
        const base = achievedIndex(it.score, it.tiers)+1;
        if(base===0){ const V=tv[0]; if(V>0){ L = Math.min(it.score/V,1)*c[0]; G=L; } }
        else if(base===tv.length){ const top=tv[tv.length-1], prev=tv.length>1?tv[tv.length-2]:0, J=Math.abs(top-prev)||1, se=Math.max(0,(it.score-top)/J), xe=Math.min(se,1), oe=c[c.length-1]; L = oe+xe*100; G = isEasy ? oe+se*100 : L; }
        else { const lo=c[base-1]||0, hi=(c[base]!==undefined?c[base]:c[c.length-1]); L = lo + tierFrac(it)*(hi-lo); G=L; }
        L=Math.trunc(L); G=Math.trunc(G);
      }
      return [L,G];
    };
    const topMean = (arr) => { const r=[...arr].sort((a,b)=>b-a); const t = isFund ? Math.min(3,r.length) : Math.floor(r.length/2); const o=r.slice(0,t); return o.length===0 ? 0 : Math.trunc(o.reduce((a,x)=>a+x,0)/o.length); };
    const hm = (arr) => { if(!arr.length) return 0; const nn=arr.map(x=>x>0?x:.1); return Math.trunc(nn.length/nn.reduce((a,x)=>a+1/x,0)); };
    const capped=[], uncapped=[];
    subcategoryGroups(items, b).forEach(g=>{ const O=[], w=[]; g.forEach(it=>{ const [L,G]=energies(it); O.push(L); w.push(G); }); capped.push(topMean(O)); uncapped.push(topMean(w)); });
    const m = hm(capped);
    const N = (isEasy && m>=600) ? hm(uncapped) : m;
    let T=0; for(let i=0;i<c.length;i++){ if(N>=c[i]) T=i+1; }
    return T;
  }
  // generic-energy-alt (evxl's Ye()): per-SCENARIO energies on a per-difficulty
  // ladder [100..n*100] (no offset), arithmetic mean over every scenario
  // (unplayed ones count as 0), capped at top+50.
  function energyAltRank(items, b, ctx){
    const n = ctx.tierCount;
    if(n===0 || items.length===0) return 0;
    const s = Array.from({length:n},(_,i)=>(i+1)*100);
    const cap = s[n-1]+50;
    const energies = items.map(it=>{
      if(!(it.score>0)) return 0;
      const tv = it.tiers.map(x=>x[1]);
      const base = achievedIndex(it.score, it.tiers)+1;
      let m;
      if(base===0){ const p = tv[0]||1; m = it.score/p*s[0]; }
      else if(base===tv.length){ const y=tv[tv.length-1], N=tv.length>1?tv[tv.length-2]:0, T=Math.abs(y-N)||1; m = s[n-1] + Math.min((it.score-y)/T, .5)*100; }
      else { const lo=s[base-1]||0, hi=s[base]||cap; const pr=preciseTier(it.score,it.tiers); const frac=Math.max(0,Math.min(pr-base,1)); m = lo + frac*(hi-lo); }
      return Math.min(Math.trunc(m), cap);
    });
    const mean = Math.round(energies.reduce((a,e)=>a+e,0)/energies.length*10)/10;
    let r=0; for(let k=0;k<s.length;k++){ if(mean>=s[k]) r=k+1; }
    return r;
  }

  // Shared tail of every "harmonic mean of subcategory energies" mode: any
  // subcategory at 0 → Unranked; else HM rounded to 0.1 and read off `thresholds`.
  function harmonicRank(energies, thresholds){
    if(energies.length===0 || energies.some(e=>!(e>0))) return 0;
    const hm = Math.round(energies.length/energies.reduce((a,e)=>a+1/e,0)*10)/10;
    let r=0; for(let i=0;i<thresholds.length;i++){ if(hm>=thresholds[i]) r=i+1; }
    return r;
  }
  // evxl's H().progressToNext for a ranked scenario: inside the ladder, the
  // clamped 0..1 fraction to the next tier; at the top, the FRACTIONAL part of
  // how many top-gaps the score is over (1.7 gaps over → 0.7, not 1).
  function tierFrac(it){
    const base = achievedIndex(it.score, it.tiers)+1;
    if(base<=0) return 0;
    const g = preciseTier(it.score, it.tiers)-base;
    if(base===it.tiers.length) return g - Math.floor(g);
    return Math.max(0, Math.min(g, 1));
  }

  // Deadman's Static S1/S2 + Poke Static (evxl's ze()): ladder starts at 100
  // (500 for "boss+" and for an 8-tier "boss", 900 for "boss++"), +100 per
  // tier, the last step only +10. Per-scenario energy sits on that ladder
  // (over-max adds up to +10 per over-gap); each subcategory counts its max.
  function dmRank(items, b, ctx){
    const n = ctx.tierCount; if(!n) return 0;
    const diff = String(b.difficulty||'').trim().toLowerCase();
    let o = 100;
    if((diff==='boss' && n===8) || diff==='boss+') o = 500; else if(diff==='boss++') o = 900;
    const s = []; for(let i=0;i<n;i++){ s.push(i===0 ? o : (i===n-1 ? s[i-1]+10 : s[i-1]+100)); }
    const energyOf = it => {
      if(!(it.score>0)) return 0;
      const tv = it.tiers.map(x=>x[1]);
      const base = achievedIndex(it.score, it.tiers)+1;
      if(base===0) return 0;
      let x;
      if(base===tv.length){ const top=tv[tv.length-1], prev=tv.length>1?tv[tv.length-2]:0, w=Math.abs(top-prev)||1; x = s[s.length-1] + Math.max(0,(it.score-top)/w)*10; }
      else { const v=s[base-1]||0, O=s[base]; x = v + tierFrac(it)*(O-v); }
      return Math.max(0, Math.trunc(x));
    };
    return harmonicRank(subcategoryGroups(items, b).map(g=>Math.max(0, ...g.map(energyOf))), s);
  }
  // Deadman's Static S3 (evxl's Be()): 4 fixed thresholds per difficulty —
  // Level N → [(N-1)*300+100, +100, +200, 1510]; anything with "boss" →
  // [1300,1400,1500,1510]. Below the first tier a scenario still earns energy
  // proportionally (capped at the first threshold); at max tier it earns the top.
  function dmS3Rank(items, b, ctx){
    const diff = String(b.difficulty||'').trim().toLowerCase();
    let t = [100,200,300,1510];
    if(diff.includes('boss')) t = [1300,1400,1500,1510];
    else { const m = diff.match(/level\s*([1-4])/i); if(m){ const R=(Number(m[1])-1)*300+100; t=[R,R+100,R+200,1510]; } }
    const energyOf = it => {
      if(!(it.score>0)) return 0;
      const tv = it.tiers.map(x=>x[1]);
      const base = achievedIndex(it.score, it.tiers)+1;
      let S;
      if(base===0){ const x=tv[0]||1, E=t[0]; S = Math.min(it.score/x*E, E); }
      else if(base===tv.length){ S = t[t.length-1]; }
      else { const x=t[base-1]||0, E=(t[base]!==undefined ? t[base] : t[t.length-1]); S = x + tierFrac(it)*(E-x); }
      return Math.max(0, Math.trunc(S));
    };
    return harmonicRank(subcategoryGroups(items, b).map(g=>Math.max(0, ...g.map(energyOf))), t);
  }

  const RANK_RULES = {
    'dm'(items, b, ctx){ return dmRank(items, b, ctx); },
    'dm-s3'(items, b, ctx){ return dmS3Rank(items, b, ctx); },
    'vt-energy'(items, b, ctx){ return vtEnergyRank(items, b, ctx); },
    'aplus-alt'(items, b, ctx){ return aplusAltRank(items, b, ctx); },
    'jade-palace'(items, b, ctx){ return jadePalaceRank(items, b, ctx); },
    // min over subcategory bests; any 0 → 0
    basic(items, b){
      const groups = subcategoryGroups(items, b);
      let min = Infinity;
      for(const g of groups){ const t = subcategoryTier(g); if(t===0) return 0; if(t<min) min=t; }
      return Number.isFinite(min) ? min : 0;
    },
    'generic-energy'(items, b, ctx){ return energyRank(items, b, ctx, {capped:true, overSpan:1}); },
    'generic-energy-uncapped'(items, b, ctx){ return energyRank(items, b, ctx, {capped:false, overSpan:9999}); },
    'generic-energy-alt'(items, b, ctx){ return energyAltRank(items, b, ctx); },
    complete(items, b, ctx){ return ctx.completeTier; },
    // TSK Mixed Benchmarks: per-difficulty counts read off evxl's engine.
    tsk(items, b, ctx){
      const table = {
        'beginner':{needed:4}, 'main':{needed:8}, 'ultimate':{overMax:8, maxRank:10, needed:12},
        'static':{needed:9}, 'strafes':{needed:7},
        "thundah's bouncesphere":{overMax:2, maxRank:2, needed:4},
        'reactive by slapped':{overMax:2, maxRank:4, needed:6},
        'beginner classic':{needed:5}, 'main classic':{needed:7},
        'extra classic':{overMax:3, maxRank:4, needed:9}
      };
      const cfg = table[String(b && b.difficulty || '').trim().toLowerCase()];
      if(!cfg) return RANK_RULES.basic(items, b, ctx);
      const tierCount = ctx.tierCount;
      const tiersArr = items.map(it=>achievedIndex(it.score, it.tiers)+1);
      const overMax = items.filter(it=>{ const n=it.tiers.length; return n>0 && achievedIndex(it.score,it.tiers)+1===n && it.score>it.tiers[n-1][1]; }).length;
      const atOrAbove = t => tiersArr.reduce((a,x)=>a+(x>=t?1:0),0);
      const highestWith = need => { for(let t=tierCount;t>=1;t--){ if(atOrAbove(t)>=need) return t; } return 0; };
      if(cfg.overMax && overMax>=cfg.overMax) return tierCount;
      if(cfg.maxRank){
        const atMax = items.filter(it=>it.tiers.length>0 && achievedIndex(it.score,it.tiers)+1===it.tiers.length).length;
        if(atMax>=cfg.maxRank) return tierCount;
      }
      return cfg.needed ? highestWith(cfg.needed) : 0;
    }
  };
  // Legacy per-entry override from before the modes were known: N scenarios
  // at a tier or above. Kept so an imported dataset that set rankReq still
  // works. Not in RANK_RULES: it isn't an evxl mode, so no dataset can select
  // it by name.
  function rankReqRule(items, b, ctx){
    const need = Math.min(Math.floor(b.rankReq), items.length);
    const tiersArr = items.map(it=>achievedIndex(it.score, it.tiers)+1);
    for(let t=ctx.tierCount;t>=1;t--){ if(tiersArr.reduce((a,x)=>a+(x>=t?1:0),0)>=need) return t; }
    return 0;
  }

  // ---- the long tail: 28 small modes, each read off evxl's engine ----------
  // Shared bits. `tierOf` is the 1-based tier (0 = none). `topN(need)` is the
  // "N scenarios at a tier or above" rule that half of these turn out to be.
  const tierOf = it => achievedIndex(it.score, it.tiers)+1;
  function topN(items, need, tierCount){
    const tiers = items.map(tierOf);
    for(let t=tierCount; t>=1; t--){ if(tiers.reduce((a,x)=>a+(x>=t?1:0),0) >= need) return t; }
    return 0;
  }
  // Category-level groups (consecutive subcategories with the same category).
  function categoryGroups(items, b){
    const out=[]; let last=null;
    subcategoryGroupsNamed(items, b).forEach(g=>{ if(!last || last.cat!==g.cat){ last={cat:g.cat, items:[], subs:[]}; out.push(last); } last.items.push(...g.items); last.subs.push(g); });
    return out;
  }
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const rankOnLadder = (value, th) => { let r=0; for(let i=0;i<th.length;i++){ if(value>=th[i]) r=i+1; } return r; };

  // fe(): every scenario contributes an energy on the difficulty's ladder;
  // ANY scenario at 0 (unplayed, or below-first-tier rounding to 0) → Unranked;
  // harmonic mean, rank on the ladder. Used by mh and avasive.
  function feRank(items, b, ctx, ladders, fallbackKey){
    const diff = String(b.difficulty||'').trim().toLowerCase();
    const t = ladders[diff] || ladders[fallbackKey];
    if(!t || !items.length) return 0;
    const en = items.map(it=>{
      const tv = it.tiers.map(x=>x[1]);
      const base = tierOf(it);
      if(!(it.score>0)) return 0;
      if(base===0){ const R=tv[0]||1; return Math.trunc(it.score/R*t[0]); }
      if(base===tv.length){ const R=tv[tv.length-1]||1, m=tv.length>1?tv[tv.length-2]:0, bb=(R-m)||1; return Math.trunc(t[t.length-1]+(it.score-R)/bb*100); }
      const k=t[base-1]||0, f=t[base]; return Math.trunc(k+tierFrac(it)*(f-k));
    });
    if(en.some(x=>x===0)) return 0;
    const a = Math.round(en.length/en.reduce((s,x)=>s+1/x,0)*10)/10;
    return t.filter(x=>a>=x).length;
  }

  // Shared by 33 and iris (evxl's Xe()+Qe()) -- see their entry below.
  function xeRank(items, b, ctx){
    const s = ctx.tierCount; if(!s) return 0;
    const diff = String(b.difficulty||'').trim().toLowerCase();
    const starts = { novice:100, beginner:100, easy:100, intermediate:100, adv:200, advanced:200, hard:200 };
    const c = starts[diff] || ((Number(b.evxlDiffIndex)||0)+1)*100;
    const a = Array.from({length:s},(_,R)=>c+R*100);
    const catMeans = categoryGroups(items, b).map(cg=>{
      const subMs = cg.subs.map(g=>{
        const N = g.items.map(it=>{
          const tv=it.tiers.map(x=>x[1]); if(!(it.score>0) || !tv.length) return 0;
          const base=tierOf(it); let w=0;
          if(base===0) w=0;
          else if(base===tv.length) w=a[a.length-1];
          else { const lo=a[base-1]||0, P=(a[base]!==undefined?a[base]:a[a.length-1]); w=lo+tierFrac(it)*(P-lo); }
          return Math.max(0, Math.round(w*100)/100);
        });
        const T = Math.ceil(N.length/2);
        const S = N.filter(x=>x>=a[0]).length;
        if(N.length===0) return 0;
        return S>=T ? Math.round([...N].sort((x,E)=>E-x).slice(0,T).reduce((x,E)=>x+E,0)/T) : Math.round(N.reduce((x,E)=>x+E,0)/(T*2));
      });
      return Math.round(subMs.length ? subMs.reduce((p,y)=>p+y,0)/subMs.length : 0);
    });
    let h = 0;
    if(catMeans.length && catMeans.every(f=>f>0)) h = catMeans.reduce((f,R)=>f+R,0)/catMeans.length;
    h = Math.round(h);
    return rankOnLadder(h, a);
  }

  Object.assign(RANK_RULES, {
    // --- "N scenarios at the tier" family (evxl's ne()/Ue()/$e()/Ge()/Fe()/Je()) ---
    'asb'(items, b, ctx){ return topN(items, 8, ctx.tierCount); },
    'e1se'(items, b, ctx){ return topN(items, 6, ctx.tierCount); },
    'tpt'(items, b, ctx){ return topN(items, 5, ctx.tierCount); },
    'hewchy'(items, b, ctx){ return topN(items, 12, ctx.tierCount); },
    'dojo'(items, b, ctx){ return topN(items, 4, ctx.tierCount); },
    'dojo2'(items, b, ctx){ return topN(items, 3, ctx.tierCount); },
    'dojo3'(items, b, ctx){ return topN(items, 5, ctx.tierCount); },
    'rbe'(items, b, ctx){ return topN(items, 9, ctx.tierCount); },

    // --- Z-energy customs (evxl's Y() with a custom config) ---
    'ca-s1'(items, b, ctx){
      return zRank(items, b, { thresholds:[1500,1550,1600,1650,1700,1750,1800], lowerOffset:50, overSpan:2,
        cap: String(b.difficulty||'').trim().toLowerCase()==='advanced' ? 1200 : Infinity,
        filter: g => !String(g.sub||'').toLowerCase().includes('strafe') });
    },
    'mira'(items, b, ctx){
      const diff = String(b.difficulty||'').trim().toLowerCase();
      return zRank(items, b, { thresholds: diff==='easy' ? [100,200,300,400,500] : [600,700,800,900,1000], lowerOffset:50, overSpan:1, cap: diff==='advanced' ? 1200 : Infinity });
    },
    'sa-s2'(items, b, ctx){
      return zRank(items, b, { thresholds:[1200,1300,1400,1500,1600], lowerOffset:50, overSpan:1,
        cap: String(b.difficulty||'').trim().toLowerCase()==='advanced' ? 1200 : Infinity,
        filter: g => !String(g.sub||'').toLowerCase().includes('strafe') });
    },
    'val-energy'(items, b, ctx){
      const ladder=[100,200,300,400,500,600,700,800,900,1000,1100,1200,1300,1400,1500];
      const diff = String(b.difficulty||'').trim().toLowerCase();
      const sl = { easy:[0,4], medium:[4,8], hard:[8,12] }[diff] || [0, ladder.length];
      return zRank(items, b, { thresholds: ladder.slice(sl[0], sl[1]), lowerOffset:100, overSpan:1, cap: diff==='advanced' ? 1200 : Infinity });
    },

    // --- fe() family ---
    'mh'(items, b, ctx){ return feRank(items, b, ctx, { easy:[100,200,300,400], medium:[500,600,700,800], hard:[900,1000,1100,1200,1300] }, 'easy'); },
    'avasive'(items, b, ctx){ return feRank(items, b, ctx, { genesis:[100,200,300,400,500], ascension:[600,700,800,900,1000], enlightenment:[1100,1200,1300,1400,1500], wallhack:[100,200,300,400,500,600,700,800,900] }, 'genesis'); },

    // --- points tables ---
    // MIYU: tier t is worth t+1 points (0 if unranked); thresholds fixed.
    'MIYU'(items, b, ctx){
      const th=[16,24,32,40,48,56,63];
      const total = items.reduce((a,it)=>{ const t=tierOf(it); return a + (t<=0 ? 0 : t+1); }, 0);
      return rankOnLadder(total, th);
    },
    // RXZU: each tier maps to a point value; average over ALL scenarios.
    'RXZU'(items, b, ctx){
      const diff = String(b.difficulty||'').trim().toLowerCase();
      const t = diff==='easy' ? [200,300,400,500,600,700,800,900,1000,1100,1200]
              : diff==='hard' ? [400,500,600,700,800,850,900,950,1000,1050,1100,1150,1200] : null;
      if(!t || !items.length) return 0;
      const sum = items.reduce((a,it)=>{ const d=tierOf(it); if(d<=0) return a; const f=Math.min(d,t.length)-1; return a + (f>=0 ? t[f] : 0); }, 0);
      return rankOnLadder(sum/items.length, t);
    },

    // aplus-s1: max(basic rank, "plus" rank) where plus = min over categories of
    // that category's 3rd-highest scenario tier (0 if it has fewer than 3 ranked).
    'aplus-s1'(items, b, ctx){
      const normal = RANK_RULES.basic(items, b, ctx);
      let plus = Infinity;
      categoryGroups(items, b).forEach(cg=>{
        const h = cg.items.map(tierOf).filter(x=>x>0).sort((a,c)=>c-a);
        const third = h.length>=3 ? h[2] : 0;
        plus = Math.min(plus, third);
      });
      if(!Number.isFinite(plus)) plus = 0;
      return Math.max(normal, plus);
    },

    // mh-tracking (evxl's mn()+dn()): ladder starts at (offset − diffIndex + 1)·100,
    // +100 per tier; per subcategory the mean of its top two scenario energies
    // (half of a lone one), energies un-truncated with unlimited over-max span;
    // harmonic mean (any subcategory at 0 → Unranked).
    'mh-tracking'(items, b, ctx){
      const n = ctx.tierCount; if(!n) return 0;
      const off = Number(b.evxlRankOffset)||0, idx = Number(b.evxlDiffIndex)||0;
      const c = (off - idx + 1)*100;
      const t = Array.from({length:n},(_,l)=>c+l*100);
      const means = subcategoryGroups(items, b).map(g=>{
        const R = g.filter(it=>it.score>0).map(it=>scenarioEnergy(it, t, Infinity, 100, true)).sort((a,c)=>c-a);
        if(R.length===0) return 0;
        return R.length===1 ? R[0]/2 : (R[0]+R[1])/2;
      });
      if(!means.length || means.some(m=>!(m>0))) return 0;
      const l = Math.round(means.length/means.reduce((a,m)=>a+1/m,0)*10)/10;
      return t.filter(h=>l>=h).length;
    },

    // cb-s1 (evxl's un()): 6-step 300…1800 ladder; every scenario's energy as
    // a percentage of 1800, summed; rank on the same ladder. (Maxed scenarios
    // index the ladder at min(tier+over, 5) — evxl's code, mirrored as is.)
    'cb-s1'(items, b, ctx){
      const r=[300,600,900,1200,1500,1800];
      let total = 0;
      items.forEach(it=>{
        const tv = it.tiers.map(x=>x[1]); const h = tierOf(it);
        let f;
        if(h===0) f = (it.score>0 ? it.score : 0)/(tv[0]||1)*r[0];
        else if(h===tv.length){ const R=tv[h-1], m=h>1?tv[h-2]:0, bb=Math.abs(R-m)||1, p=Math.max(0,(it.score-R)/bb); const ix=Math.min(h+p, r.length-1); f = Number.isInteger(ix) ? r[ix] : NaN; }
        else f = r[h-1]+(r[h]-r[h-1])*tierFrac(it);
        total += f/1800*100;
      });
      if(!Number.isFinite(total)) return 0;
      let k=0; for(let i=r.length-1;i>=0;i--){ if(total>=r[i]){ k=i+1; break; } }
      return k;
    },

    // aoi (evxl's We()): rank = highest tier that either ≥4 subcategories reach
    // with one scenario, or ≥3 subcategories reach with two.
    'aoi'(items, b, ctx){
      const subs = subcategoryGroups(items, b).map(g=>g.filter(it=>it.score>0).map(tierOf));
      const ranks = [...new Set(subs.flat())].filter(x=>x>0).sort((a,c)=>c-a);
      for(const i of ranks){
        const one = subs.filter(u=>u.filter(h=>h>=i).length>=1).length;
        const two = subs.filter(u=>u.filter(h=>h>=i).length>=2).length;
        if(one>=4 || two>=3) return i;
      }
      return 0;
    },

    // ra-s4 (evxl's gn()+Ne()+ye()): per category, the top-4 scenarios by
    // precise tier, each mapped through a piecewise points table (Easy vs the
    // rest), summed; rank on a matching thresholds table.
    'ra-s4'(items, b, ctx){
      const easy = String(b.difficulty||'').trim().toLowerCase()==='easy';
      const t = easy ? [20,50,80,110,140,170] : [200,235,270,320,360,400];
      const o = easy ? [240,600,960,1320,1680,2040] : [2400,2820,3240,3840,4320,4800];
      const ye = (e, n, r, tt) => {
        if(n.length<2 || r.length<2 || n.length!==r.length) return 0;
        if(e<n[1]){ const s=n[1]-n[0], c=(r[2]-r[1])/(2/3); return Math.max(0, Math.ceil(r[1]+(e-n[1])/s*c)); }
        for(let s=1; s<n.length-1; s++){ if(e<=n[s+1]) return r[s]+(e-n[s])/(n[s+1]-n[s])*(r[s+1]-r[s]); }
        const oo=n.length-1; return r[oo]+(e-n[oo])/(n[oo]-n[oo-1])*(r[oo]-r[oo-1])/tt;
      };
      let total = 0;
      categoryGroups(items, b).forEach(cg=>{
        const top = [...cg.items].sort((a,c)=>preciseTier(c.score,c.tiers)-preciseTier(a.score,a.tiers)).slice(0,4);
        top.forEach(it=>{ total += ye(it.score, it.tiers.map(x=>x[1]), t, 3/2); });
      });
      let k=0; for(let i=o.length-1;i>=0;i--){ if(total>=o[i]){ k=i+1; break; } }
      return k;
    },

    // mira-apex (evxl's qe()): 10-per-tier ladder; per subcategory the max
    // scenario energy; harmonic mean with zeros treated as 0.1.
    'mira-apex'(items, b, ctx){
      const n = ctx.tierCount; if(!n) return 0;
      const t = Array.from({length:n},(_,k)=>(k+1)*10);
      const en = subcategoryGroups(items, b).map(g=>Math.max(0, ...g.map(it=>{
        const tv=it.tiers.map(x=>x[1]); if(!(it.score>0) || !tv.length) return 0;
        const base=tierOf(it); let S=0;
        if(base===0){ const x=tv[0]; if(x>0) S=Math.min(it.score/x,1)*t[0]; }
        else if(base===tv.length) S=t[t.length-1];
        else { const x=t[base-1]||0, E=(t[base]!==undefined?t[base]:t[t.length-1]); S=x+tierFrac(it)*(E-x); }
        return Math.max(0, Math.trunc(S));
      })));
      if(!en.length) return 0;
      const pos = en.filter(x=>x>0);
      let g = 0;
      if(pos.length>0){
        const k = pos.length===en.length ? en : en.map(x=>x===0?.1:x);
        g = k.length/k.reduce((a,x)=>a+1/x,0);
      }
      g = Math.round(g*10)/10;
      return rankOnLadder(g, t);
    },

    // 33 / iris (evxl's Xe()+Qe()): ladder start by difficulty name (novice/
    // beginner/easy/intermediate 100, adv/advanced/hard 200, else (index+1)·100),
    // +100 per tier. Per subcategory: if at least half its scenarios reach the
    // first threshold, the mean of the top half; else the sum over twice the
    // half. Category = mean of its subcategories; overall = mean of categories
    // if all > 0. Rank on the ladder.
    '33': xeRank,
    'iris': xeRank,

    // ra-s5 (evxl's Ve()): generic ladder (offset). Per scenario energy with a
    // special below-first-tier ramp for "reactive" subcategories (measured from
    // 800/830 rather than 0), rounding to 2dp; per subcategory: reactive needs
    // exactly 4 scenarios → (max of first pair + max of second pair)/2, else the
    // mean of the top two (half of a lone one); harmonic mean, all > 0.
    'ra-s5'(items, b, ctx){
      const n = ctx.tierCount; if(!n) return 0;
      const off = Number(b.evxlRankOffset)||0;
      const c = Array.from({length:n},(_,i)=>(off+i+1)*100);
      const diff = String(b.difficulty||'').trim().toLowerCase();
      const subE = subcategoryGroupsNamed(items, b).map(g=>{
        const reactive = String(g.sub||'').toLowerCase().includes('reactive');
        const x = g.items.map(it=>{
          const tv=it.tiers.map(v=>v[1]);
          if(!(it.score>0)) return 0;
          const base=tierOf(it); let q=0;
          if(base===0){
            const j=tv[0]||1; let U=0, L=0;
            if(reactive){ U = diff==='entry' ? 800 : 830; L=2; }
            const G=it.score-U, z=j-U; let $=0;
            if(z>0){ const J=Math.max(0,G/z)*100; $=Math.round(J*Math.pow(10,L))/Math.pow(10,L); }
            q = c[0]*($/100);
          } else if(base===tv.length) q = c[c.length-1];
          else { const j=c[base-1]||0, U=(c[base]!==undefined?c[base]:c[c.length-1]), L=Math.round(tierFrac(it)*100); q=j+(U-j)*(L/100); }
          return Math.max(0, Math.round(q*100)/100);
        });
        let E=0;
        if(x.length===0) E=0;
        else if(reactive){ E = x.length!==4 ? 0 : (Math.max(x[0],x[1])+Math.max(x[2],x[3]))/2; }
        else { const O=[...x].sort((w,C)=>C-w); E = O.length===1 ? O[0]/2 : (O[0]+O[1])/2; }
        return Math.round(E);
      });
      if(!subE.length || !subE.every(m=>m>0)) return 0;
      const k = Math.round(subE.length/subE.reduce((a,p)=>a+1/p,0));
      return rankOnLadder(k, c);
    },

    // xyz (evxl's kn()): per subcategory the list of scenario tiers; a tier x is
    // reached when every subcategory has ≥v scenarios at x or above AND the total
    // is ≥ v·subcategories — v = 3 at the top tier, 4 below (Newcomer: 2 always).
    // Everything at the top → Pinnacle (top tier).
    'xyz'(items, b, ctx){
      const subs = subcategoryGroups(items, b).map(g=>g.map(tierOf));
      const flat = subs.flat(); const l = flat.length;
      const u = Math.max(ctx.tierCount, ...items.map(it=>it.tiers.length));
      if(u<=0 || l===0) return 0;
      if(flat.every(x=>x===u)) return u;
      const newcomer = String(b.difficulty||'').trim().toLowerCase()==='newcomer';
      const d = subs.length;
      for(let x=u; x>=1; x--){
        const v = newcomer ? 2 : (x===u ? 3 : 4);
        const per = subs.map(j=>j.filter(U=>U>=x).length);
        const tot = flat.filter(j=>j>=x).length;
        if(per.every(j=>j>=v) && tot>=v*d) return x;
      }
      return 0;
    },

    // xyz2 (evxl's yn()): tiers counted only for ranked scenarios, per
    // category. All ranked and all at the top → top; every category with ≥3 at
    // the top → top; any category with <4 ranked → Unranked; else the minimum
    // over categories of the 4th-highest tier.
    'xyz2'(items, b, ctx){
      const diff = String(b.difficulty||'').trim().toLowerCase();
      const o = { easy:[12,11,10,9,8,7,6,5,4,3,2,1], hard:[10,9,8,7,6,5,4,3,2,1] }[diff] || [];
      if(!o.length) return 0;
      const u = o[0];
      const cats = categoryGroups(items, b).map(cg=>cg.items.filter(it=>tierOf(it)>0).map(tierOf));
      const all = cats.flat();
      if(items.length>0 && all.length===items.length && all.every(y=>y===u)) return u;
      if(cats.every(y=>y.filter(N=>N===u).length>=3)) return u;
      let insufficient=false; const fourth=[];
      cats.forEach(N=>{ if(N.length<4){ insufficient=true; fourth.push(0); } else { fourth.push([...N].sort((S,M)=>M-S)[3]); } });
      if(insufficient) return 0;
      return Math.min(...fourth);
    },

    // xyz-smoothness-v2 (evxl's pn()): counts of scenarios at or above each
    // tier; all at the top → Pinnacle; ≥6 at the top → top; else the highest
    // lower tier that ≥9 scenarios reach.
    'xyz-smoothness-v2'(items, b, ctx){
      const o = ctx.tierCount; const t = items.length;
      if(!t || o<=0) return 0;
      const l = items.map(it=>{ if(!(it.score>0)) return 0; return Math.max(0, tierOf(it)); });
      const g = {}; for(let m=1;m<=o;m++) g[m] = l.filter(bb=>bb>=m).length;
      const u = g[o]||0;
      if(u>=t) return o;
      if(u>=6) return o;
      for(let m=o-1;m>=1;m--){ if((g[m]||0)>=9) return m; }
      return 0;
    }
  });

  function benchmarkStanding(items, b, opts){
    b = b || {};
    if(!items || items.length===0){
      return { pct:0, rankIdx:-1, rankName:null, complete:false, floorIdx:-1, blockers:0, total:0, tierCount:0, maxed:false, mode:b.rankCalc||null, modeSupported:false, modeTier:0, completeTier:0 };
    }
    // Completion (`pct`) is over everything the playlist carries; for pool
    // benchmarks the RANK — Complete tier, mode tier, floor, blockers — is read
    // off the selection only, exactly as evxl narrows its table first.
    let sum=0;
    items.forEach(it=>{ sum += scenarioCompletion(it.score, it.tiers); });
    const pct = sum/items.length;
    const pool = items;
    items = rankedItems(items, b);
    if(items.length===0){
      return { pct, rankIdx:-1, rankName:null, complete:false, floorIdx:-1, blockers:0, total:0, tierCount:0, maxed:false, mode:b.rankCalc||null, modeSupported:!!(b.rankCalc && RANK_RULES[b.rankCalc]), modeTier:0, completeTier:0 };
    }
    const total = items.length;
    const ref = items.find(it=>it.tiers && it.tiers.length>0);
    const tierCount = ref ? ref.tiers.length : 0;

    const achieved = items.map(it=>achievedIndex(it.score, it.tiers));
    // Complete tier: highest tier every scenario has reached (1-based; 0 = none).
    let floorIdx=-1;
    for(let t=0; t<tierCount; t++){ if(achieved.every(i=>i>=t)) floorIdx=t; }
    const completeTier = floorIdx+1;

    const mode = b.rankCalc || null;
    // Selection benchmarks need the whole pool for their minimum-per-group
    // checks (a subcategory with nothing selected must still count as a group);
    // callers with a synthetic subset (the diff test) pass the pool in.
    const ctx = { completeTier, tierCount, pool: (opts && opts.pool) || pool };
    let rule = null;
    if(Number.isFinite(Number(b.rankReq)) && Number(b.rankReq)>0) rule = rankReqRule;
    else if(mode && RANK_RULES[mode]) rule = RANK_RULES[mode];
    const modeSupported = !!rule;
    const modeTier = rule ? Math.max(0, Math.min(tierCount, rule(items, b, ctx))) : 0;

    // evxl: show the mode rank when it beats the Complete rank, else "X Complete".
    let rankIdx, complete;
    if(modeTier > completeTier){ rankIdx = modeTier-1; complete = false; }
    else { rankIdx = completeTier-1; complete = completeTier>0; }
    const rankName = (rankIdx>=0 && ref && ref.tiers[rankIdx]) ? ref.tiers[rankIdx][0] : null;
    const blockers = achieved.filter(i=>i<=floorIdx).length;
    // When the floor IS the top tier, every scenario is maxed — the same count
    // means the opposite thing, so callers label it differently.
    const maxed = floorIdx>=0 && tierCount>0 && floorIdx===tierCount-1;
    return { pct, rankIdx, rankName, complete, floorIdx, blockers, total, tierCount, maxed, mode, modeSupported, modeTier, completeTier };
  }

  // Volts — evxl's own "secondary progress metric", read out of its page
  // component (En()/Ee()): each scenario earns score ÷ top-tier threshold × 100
  // ("100 per scenario for max rank", uncapped, 0 if unplayed), summed and
  // rounded. A benchmark literally named "Viscose Benchmarks" uses the
  // rank-range variant, (score − first) ÷ (top − first) × 100, floored at 0.
  // Verified exact against the live page (cAt Easy: 2,318) on 2026-08-16.
  function benchmarkVolts(items, b){
    const rankRange = String(b && b.name || '').trim()==='Viscose Benchmarks';
    let sum = 0;
    // Pool benchmarks: evxl sums over the selected scenarios (its narrowed table).
    rankedItems(items, b).forEach(it=>{
      const tv = it.tiers.map(x=>x[1]);
      if(!tv.length || !(it.score>0)) return;
      const top = tv[tv.length-1];
      if(top===0) return;
      if(rankRange){ if(tv.length<2) return; const first=tv[0], span=top-first; if(span===0) return; sum += Math.max(0,(it.score-first)/span)*100; }
      else sum += Math.max(0, it.score/top*100);
    });
    return Math.round(sum);
  }

  function standingLabel(st){
    if(!st.rankName) return 'Unranked';
    return st.rankName + (st.complete ? ' Complete' : '');
  }
  function pctLabel(p){ return (p*100).toFixed(p>=0.995?0:1)+'%'; }

  // ---- scenario selection (evxl's selectable-top-n, REVENGE Benchmark) -----
  // Some benchmarks are a POOL rather than a fixed list: the KovaaK's playlist
  // behind the share code carries every scenario (48 for REVENGE, in 12
  // labelled blocks), and evxl lets the player pick `select` of them (at least
  // `minCat` per category and `minSub` per subcategory) — its page header
  // reads "Scenario Pool · 24 of 48 selected · 8+ per category · 4+ per
  // subcategory · Configure". With nothing picked, evxl's default (its Cn())
  // is the first `minSub` of each subcategory in table order, then top-up per
  // category, then round-robin. The rank rule (Pe()) sorts every SCORED
  // selected scenario by precise tier and reads the tier of the N-th best
  // (N = `baseN`, or `fullN` when the whole pool is selected); fewer than N
  // scored, or a selection under the minimums → Unranked. Ported 2026-08-17
  // from evxl's engine; the entry's `selection` block is stamped from the
  // catalog by apply-evxl-catalog.ps1.
  //
  // The dataset keeps the whole pool (so it matches the KovaaK's playlist and
  // survives a structure refresh); the selection is a per-browser preference
  // (`mini-evxl-scenario-selection`, benchKey → [names]) with evxl's default
  // when unset. Owen's call (2026-08-17): the playlist's FULL SCOPE is the
  // pool — every pool scenario is a member of the playlist for Shared/Unique,
  // completion, counts, Quick wins and sync — while the RANK and VOLTS keep
  // evxl's selection-based calculation. So parsedItemsFor() returns the whole
  // pool with a `selected` flag on each item, and benchmarkStanding() /
  // benchmarkVolts() narrow to the selected items themselves.

  function hasSelection(b){ return !!(b && b.selection && Number(b.selection.select)>0); }
  // Category / subcategory groups of the POOL, from the catalog layout.
  function selectionGroups(pool, b){
    const groups = subcategoryGroupsNamed(pool, b);
    const cats = []; let last=null;
    groups.forEach(g=>{ if(!last || last.cat!==g.cat){ last={cat:g.cat, items:[]}; cats.push(last); } last.items.push(...g.items); });
    return { subs: groups, cats };
  }
  function defaultSelection(pool, b){
    const cfg = b.selection;
    const r = Number(cfg.select)||0, t = Number(cfg.minCat)||0, o = Number(cfg.minSub)||0;
    if(r<=0 || pool.length===0) return new Set();
    if(t<=0 && o<=0) return new Set(pool.slice(0,r).map(it=>it.name));
    const { subs, cats } = selectionGroups(pool, b);
    const s = new Set();
    for(const g of subs){ for(const it of g.items.slice(0,o)){ if(s.size>=r) break; s.add(it.name); } }
    for(const c of cats){
      let have = c.items.filter(it=>s.has(it.name)).length;
      for(const it of c.items){ if(have>=t || s.size>=r) break; if(!s.has(it.name)){ s.add(it.name); have++; } }
    }
    let i=0;
    while(s.size<r && s.size<pool.length && cats.length){
      const g = cats[i%cats.length].items.find(it=>!s.has(it.name));
      if(g) s.add(g.name);
      if(++i > cats.length*pool.length) break;
    }
    return s;
  }
  // The active selection for a benchmark: the stored one (kept to names that
  // still exist in the pool, capped like evxl's _e()) or the default.

  // Which minimums a selection misses (evxl's categorySelectionIssues /
  // subcategorySelectionIssues): names of the offending groups.
  function selectionIssues(pool, b, set){
    const cfg = b.selection, { subs, cats } = selectionGroups(pool, b);
    const count = arr => arr.filter(it=>set.has(it.name)).length;
    return {
      cats: (Number(cfg.minCat)>0 ? cats.filter(c=>count(c.items)<cfg.minCat).map(c=>c.cat||'Scenarios') : []),
      subs: (Number(cfg.minSub)>0 ? subs.filter(g=>count(g.items)<cfg.minSub).map(g=>(g.cat?g.cat+' / ':'')+(g.sub||'Scenarios')) : [])
    };
  }
  RANK_RULES['selectable-top-n'] = function(items, b, ctx){
    const cfg = b.selection; if(!cfg) return 0;
    const pool = ctx.pool || items;
    const set = new Set(items.map(it=>it.name));
    const issues = selectionIssues(pool, b, set);
    if(issues.cats.length || issues.subs.length) return 0;
    const full = pool.length>0 && set.size===pool.length;
    const N = full && Number(cfg.fullN)>0 ? Number(cfg.fullN) : (Number(cfg.baseN)||12);
    const ranked = items.filter(it=>it.score>0).map(it=>({ base: tierOf(it), precise: preciseTier(it.score, it.tiers) }))
      .sort((a,c)=>c.precise-a.precise);
    if(ranked.length < N) return 0;
    return Math.max(0, Math.floor(ranked[N-1].base));
  };

  // The items a pool benchmark is RANKED on: the selection. `selected` is
  // undefined on synthetic items (the diff test builds its own subset), which
  // reads as selected.
  function rankedItems(items, b){
    return hasSelection(b) ? items.filter(it=>it.selected!==false) : items;
  }

  function countScenarios(changes){ return new Set(changes.map(c=>c.scenario)).size; }

  // Progress stats against the same merged ruler buildMergedEqualBar draws:
  // toMax = 100% minus (top - score) / (top - min) once score clears the lowest
  //         tier, i.e. how far from min to top the score has come; below the
  //         lowest tier there's no "min" to anchor against, so it stays as the
  //         raw score / top instead (0% unplayed, climbing toward the min tier).
  // to2nd = identical formula to toMax, but anchored to the second-highest
  //         distinct rank threshold across every shared playlist instead of the top one.
  // toNext = how far between the current merged tier and the next one the score sits.
  function mergedProgress(playlists, score){
    const merged = [];
    playlists.forEach(pl=>{ pl.tiers.forEach(([,thresh])=>{ merged.push(thresh); }); });
    merged.sort((a,b)=>a-b);
    const n = merged.length;
    if(n===0) return { toMax:0, to2nd:0, toNext:0, maxed:false };   // no tiers anywhere: nothing to measure against
    const top = merged[n-1];
    const min = merged[0];
    const uniqueDesc = [...new Set(merged)].sort((a,b)=>b-a);
    const second = uniqueDesc.length>1 ? uniqueDesc[1] : uniqueDesc[0];
    let idx=-1;
    for(let i=0;i<n;i++){ if(score>=merged[i]) idx=i; }
    const toMax = score<min
      ? (top>0 ? score/top : 0)
      : (top>min ? 1 - (top-score)/(top-min) : 0);
    const to2nd = score<min
      ? (second>0 ? score/second : 0)
      : (second>min ? 1 - (second-score)/(second-min) : 0);
    let toNext, maxed=false;
    if(idx===n-1){ maxed=true; toNext=1; }
    else if(idx<0){ const upper=merged[0]; toNext = upper>0 ? score/upper : 0; }
    else { const lower=merged[idx], upper=merged[idx+1]; toNext = upper>lower ? (score-lower)/(upper-lower) : 0; }
    return { toMax, to2nd, toNext, maxed };
  }

  // ---- Attempts (DESIGN_INTENT D10/D11, 2026-08-18) ----------------------------
  // The score store is max-only; attempts are the runs behind it. One record per
  // scenario:  { n, last: [[t, s], ...] }  -- n = distinct attempts seen, last =
  // the most recent ATTEMPT_KEEP of them newest-first, t in ms, s the run's score.
  // Sources (app side): the deep sync's last-scores/by-name rows (KovaaK's keeps
  // the last 10 runs per scenario), total-play's record-run epoch, local stats
  // CSVs (one file = one run), auto-check PB events, and the file's own
  // #attempts-data seed. The same run can arrive from several sources with
  // slightly different timestamps, so two attempts with the same score inside
  // ATTEMPT_DEDUPE_MS are one run.
  const ATTEMPT_KEEP = 20;
  const ATTEMPT_DEDUPE_MS = 10*60*1000;
  // Merge `incoming` ([[t,s],...] or [{t,s},...]) into a record; returns { rec, added }.
  function mergeAttempts(rec, incoming){
    const cur = rec && Array.isArray(rec.last) ? rec.last.map(x=>[Number(x[0]), Number(x[1])]).filter(x=>Number.isFinite(x[0]) && x[0]>0 && Number.isFinite(x[1]) && x[1]>=0) : [];
    let n = rec && Number.isFinite(Number(rec.n)) ? Number(rec.n) : cur.length;
    let added = 0;
    (incoming||[]).forEach(a=>{
      const t = Number(Array.isArray(a) ? a[0] : a && a.t), s = Number(Array.isArray(a) ? a[1] : a && a.s);
      if(!(Number.isFinite(t) && t>0 && Number.isFinite(s) && s>=0)) return;
      const dup = cur.some(x=> x[1]===s && Math.abs(x[0]-t) < ATTEMPT_DEDUPE_MS);
      if(dup) return;
      cur.push([t, s]); n++; added++;
    });
    cur.sort((a,b)=>b[0]-a[0]);
    return { rec: { n: Math.max(n, cur.length), last: cur.slice(0, ATTEMPT_KEEP) }, added };
  }
  // What a card or the session engine wants to know: plays, when last, how the
  // recent runs sit against the PB (nearness = best of the last k / pb).
  function attemptSummary(rec, pb, nowMs, k){
    k = k || 5;
    const last = rec && Array.isArray(rec.last) ? rec.last : [];
    if(!last.length) return { n: rec && rec.n ? Number(rec.n) : 0, lastT: 0, recentBest: 0, nearness: null, daysSince: null };
    const lastT = Number(last[0][0]);
    const recent = last.slice(0, k).map(x=>Number(x[1]));
    const recentBest = Math.max(0, ...recent);
    const nearness = pb>0 ? recentBest/pb : null;
    return { n: Math.max(Number(rec.n)||0, last.length), lastT, recentBest, nearness, daysSince: nowMs ? (nowMs-lastT)/86400000 : null };
  }

  // ---- Population percentiles (DESIGN_INTENT D8, stamped 2026-08-22) ------------
  // data/percentiles.json -> #population-data.percentiles: scenario -> anchors
  // [[fractionFromTop, score], ...] ascending fraction (= descending score), 7 per
  // scenario, sampled from KovaaK's leaderboards at home (dev/harvest-percentiles.ps1).
  // percentileRank(score, anchors) -> 0..1, the share of the board the score beats
  // (1 - fractionFromTop), linear between anchors; above the top anchor it is
  // 1 - topFraction (0.99), below the last anchor it tapers toward 0 in proportion
  // to how far under the last score it is. Caveats on record: per-scenario boards
  // are self-selected populations, and a board's size is its confidence.
  function percentileRank(score, anchors){
    if(!(score>0) || !Array.isArray(anchors) || anchors.length<2) return null;
    const pts = anchors;               // stamped sorted ascending by fraction
    const n = pts.length;
    if(score >= pts[0][1]) return 1 - pts[0][0];
    const last = pts[n-1];
    if(score <= last[1]){ const below = last[1]>0 ? (last[1]-score)/last[1] : 1; return Math.max(0, (1-last[0]) * (1-below)); }
    for(let i=0;i<n-1;i++){
      const hi = pts[i], lo = pts[i+1];
      if(score <= hi[1] && score >= lo[1]){
        const span = hi[1]-lo[1]; const t = span>0 ? (score-lo[1])/span : 0.5;
        return 1 - (lo[0] + t*(hi[0]-lo[0]));
      }
    }
    return 0.5;
  }
  // ---- Board calibration (Review Ledger III S1/A1, 2026-08-25) -------------------
  // A percentile is a rank inside ONE scenario's leaderboard, and the leaderboards are
  // not comparable populations: a million-player board is mostly people who played it
  // once, a thousand-player board is people who sought it out. Measured on the owner's
  // set, r(log10 board size, his percentile) = +0.60; inside each of 3,000 sampled
  // players it averages +0.37 and is positive for 96.4% of them, so it is the metric,
  // not the player. Ranking "weakest by percentile" was therefore ranking board
  // popularity -- and the block standings built on those percentiles with it.
  // data/offsets.json (dev/fit-board-offsets.ps1) carries a per-scenario `delta`: a
  // shift of the percentile's LOGIT, fitted as logit(pct) ~ playerLevel + delta over
  // 7,703 sampled players and re-centred so the median board's delta is 0. So an
  // adjusted percentile reads as "where you would rank on a typical board" and stays a
  // percentile. Logit, not percentile points: measured, the linear form leaves a mean
  // within-player bias of +0.046 and pushes 2.7% of cells outside [0,1]; the logit form
  // leaves -0.008 and cannot leave [0,1] at all. Applying it is one line:
  const PCT_EPS = 0.005;   // a percentile of exactly 0 or 1 is the curve's end, not infinite ability
  function adjustPercentile(p, delta){
    const v = Number(p);
    if(!Number.isFinite(v)) return null;
    const d = Number(delta);
    if(!Number.isFinite(d) || d===0) return v;
    const c = Math.min(Math.max(v, PCT_EPS), 1-PCT_EPS);
    return 1/(1+Math.exp(-(Math.log(c/(1-c)) - d)));
  }
  // "38th percentile" / "top 12%" wording for a 0..1 rank.
  function ordinal(n){ const m100 = n % 100, m10 = n % 10; return n + ((m100>=11 && m100<=13) ? 'th' : m10===1 ? 'st' : m10===2 ? 'nd' : m10===3 ? 'rd' : 'th'); }
  function percentileLabel(p){ if(p===null || p===undefined) return ''; const top = Math.round((1-p)*100); return top<=50 ? 'top '+Math.max(1,top)+'%' : ordinal(Math.max(1, Math.round(p*100)))+' percentile'; }

  // ---- Session engine v0.3 (2026-08-22: percentile metric + transfer routes) ------
  // Composes today's session: `size` items, each with a WHY, from a plain list
  // of scenarios the app prepares. Built around the loop Owen ran by hand --
  // "sort played scenarios by weakness, high-score the weakest ten, refresh" --
  // with his two fixes (cap difficulty at his level; let the dataset fill out)
  // and, since 2026-08-22, the two things the population data makes possible:
  //   * the METRIC is the population percentile (D8) where a curve exists
  //     (`pct`, 0..1 = share of that scenario's board you beat), with To 2nd as
  //     the stand-in for the few scenarios without one;
  //   * ROUTES (DESIGN_INTENT: "stuck floors get indirect routes through the
  //     transfer table"): for the weakest scenarios, a neighbour whose residual
  //     strength co-varies with it across thousands of players (`neighbours`:
  //     [[name, r, sharedPlayers], ...], stamped from the label-blind map, n >= 100)
  //     -- practising the neighbour is the indirect way to move the weak one.
  //     On record: co-variation is a shared-skill PRIOR for transfer, not proof.
  //   scenarios: [{ name, played:bool, pct:0..1|null, to2nd:0..1, toMax:0..1, toNext:0..1,
  //                 maxed:bool, rung:-1..8, labels:[curator], facets:[...], playlists:int,
  //                 plKeys:[benchKey...], att:{ n, lastT, nearness } | null, raises14d:int,
  //                 neighbours:[[name, r, n], ...],
  //                 -- v0.4 (all optional; absent = the v0.3 reading) --
  //                 resp: responsiveness() | null, raises:[[t, pctFrom, pctTo], ...] oldest-first,
  //                 runPcts:[[t, pct], ...] newest-first, boardN:int|null, gameHit:bool }]
  //   playlistFill: { benchKey: { name, played, total } }
  //   opts: { size:10, seed:int (a day number), now:ms, labelBridges,
  //           gameWeight:0..1 (0), gameFacets:[...], confidence:{c}|null, template:{...}|null }
  // Returns { regime:'thin'|'normal', level:rung, popLevel:0..1|null, weakLabels:[{label, kind, median, n}],
  //           confidence, template, items:[{ name, why, reason, label, rung, pct, to2nd, toMax, via,
  //           resp, forecast, boardN, conf, pctShrunk, game }] }.
  // Slices: WEAKEST (played, not maxed, rung <= level, ascending metric; spread --
  // at most 2 per primary label and 1 per playlist; "stuck" sinks), ROUTE (for
  // the weakest items, their strongest neighbour at/under level+1 that you are
  // better at or haven't played), FILL OUT (unplayed gaps in mostly-played
  // playlists), QUICK WIN, REVISIT. Thin regime (< SESSION_THIN_PLAYED played
  // rated scenarios): a placement round-robin across the mechanics -- "just play".
  //
  // v0.4 (2026-08-22 late) layers six things on v0.3, each built so that it is
  // LITERALLY the identity when its evidence is missing -- the weakest sort key
  // is v0.3's key plus terms that are 0, "plateaued" needs a responsiveness
  // reading, the revisit forecast is null unless a neighbour actually moved,
  // board confidence is 1 without a board size, the game bonus is 0 at weight 0,
  // and the middle confidence band IS the v0.3 template. The toolkit's
  // test/session.js pins v0.3's output on a synthetic fixture as the proof.
  //   1. RESPONSIVENESS (D11, gain per ATTEMPT in percentile space): the weakest
  //      key becomes percentile minus the gain a session's attempts can expect;
  //      "plateaued" (>= PLATEAU_MIN_RUNS runs, no gain, recent best well under
  //      the PB) sinks beside "stuck"; "unknown" (< RESP_MIN_RUNS runs) is
  //      exactly v0.3 -- never penalised, never boosted.
  //   2. REVISIT FORECAST: how the candidate's transfer neighbours and label-
  //      bridged scenarios moved since its last visit, against its own gap to PB;
  //      logged per item so the return-collect record can calibrate it.
  //   3. ADAPTIVE TEMPLATE by profile confidence (three bands; mid = 5/2/1/1/1).
  //   4. GAME-RELEVANCE knob: a capped percentile bonus for scenarios carrying
  //      game:cs/val / game:tacfps, spread one hop through transfer neighbours.
  //   5. BOARD CONFIDENCE: a small board's percentile is shrunk toward the
  //      user's overall level in the ranking (log10(n)/4, clamped).
  //   6. SESSION HISTORY stats (sessionHistoryStats) for the history view.
  const SESSION_THIN_PLAYED = 30;
  const SESSION_TEMPLATE = { weakest: 5, route: 2, fillout: 1, quickwin: 1, revisit: 1 };
  // Profile-confidence bands -> templates (slot counts at size 10; a smaller
  // session shrinks them by largest remainder, see sessionTemplate). Thin profile:
  // fill the picture (more fill-out); full profile: get out of the way (more
  // weakest, more revisits).
  const SESSION_TEMPLATES = {
    low:  { weakest: 4, route: 2, fillout: 2, quickwin: 1, revisit: 1 },
    mid:  SESSION_TEMPLATE,
    high: { weakest: 6, route: 1, fillout: 0, quickwin: 1, revisit: 2 }
  };
  // c < CONF_LOW -> low band; c > CONF_HIGH -> high band; between -> mid (= v0.3).
  // 0.30, not 0.35: a profile whose played set is fully curved but has no logged
  // runs and no history yet reads c = (1 + 0 + 0)/3 = 0.33 -- thin evidence, and
  // thin evidence must compose the v0.3 list, not a different template. The high
  // band additionally needs run evidence (profileConfidence caps c at CONF_HIGH
  // while the attempts store is empty).
  const CONF_LOW = 0.30, CONF_HIGH = 0.65;
  const CONF_HISTORY_DAYS = 90;                      // days of score history that count as a full picture
  const RESP_MIN_RUNS = 4;                           // fewer runs in the window -> "unknown" (v0.3 treatment)
  const RESP_WINDOW_DAYS = 60;                       // runs older than this say nothing about responsiveness now
  const PLATEAU_MIN_RUNS = 6;                        // "plateaued" needs at least this many runs with no gain
  const PLATEAU_GAP = 0.05;                          // ...and a recent best this many percentile points under the PB
  const RESP_NEAR = 0.03;                            // recent best within this of the PB = still reproducing it
  const SESSION_PLANNED_ATTEMPTS = 5;                // attempts a session item is budgeted; expected gain = gain/run x this
  const RESP_DEADBAND = 0.01/SESSION_PLANNED_ATTEMPTS; // |gain| under this per attempt reads as 0 (flat series = no signal)
  const EXPGAIN_CAP = 0.15;                          // cap on the expected-gain term (percentile points)
  const GAME_BONUS = 0.08;                           // full-weight bonus for a direct game-facet carrier (percentile points)
  const GAME_FACETS_DEFAULT = ['game:cs/val', 'game:tacfps'];
  const FORECAST_SLOPE = 0.04;                       // logistic slope of the revisit forecast (a stated prior, uncalibrated)
  const FORECAST_PRIOR_MARGIN = 0.05;                // gap to PB assumed when the candidate's recent runs are unknown
  const FORECAST_MAX_BRIDGES = 3;                    // label bridges that may contribute forecast evidence (strongest by r)
  // The revisit forecast's p is reported as a BUCKET, never a percentage (2026-08-24):
  // it comes from an invented slope over an invented prior margin, so "83%" reads as a
  // measured probability sitting next to real percentiles. ONE rule, at module scope,
  // because the two places that report it drifted apart the first time (the item reason
  // dropped the percentage and the session page's chip kept it -- review C1, 2026-08-25).
  const FORECAST_GOOD = 0.6, FORECAST_FAIR = 0.4;
  function forecastBucket(p){ if(p===null || p===undefined) return ''; const v = Number(p); return Number.isFinite(v) ? (v>=FORECAST_GOOD ? 'good' : v>=FORECAST_FAIR ? 'fair' : 'poor') : ''; }   // Number(null) is 0, which is finite -- a missing forecast must not read as 'poor'
  const HUB_BONUS = 0.03;                            // v0.5: full bonus for a scenario with >= HUB_FULL positive neighbours (practice there co-varies with the most)
  const HUB_FULL = 8;
  const BLOCK_UNTOUCHED_DAYS = 14;                   // v0.5: a block with no run or raise this long gets the coverage slot
  const BOARD_CONF_MIN = 0.25;                       // 24-player board -> 0.35, 100 -> 0.5, 1,000 -> 0.75, >= 10,000 -> 1
  const DAY_MS = 86400000;
  // Board confidence from the number of unique players on the scenario's
  // leaderboard: log10(n)/4 clamped to [BOARD_CONF_MIN, 1]; no size -> 1 (the
  // identity, so an old build without boards ranks exactly as v0.3).
  function boardConfidence(n){ if(!(Number.isFinite(n) && n>0)) return 1; return Math.max(BOARD_CONF_MIN, Math.min(1, Math.log10(n)/4)); }
  // Responsiveness of one scenario: gain per attempt in PERCENTILE space over the
  // runs inside the window (least-squares slope of percentile on run index), with
  // the score history's raises as the fallback evidence when the attempts record
  // is too short. rec = { n, last:[[t, s], ...] } newest-first (the ATTEMPTS
  // record), raises = [[t, fromScore, toScore], ...] oldest-first, curve = the
  // scenario's percentile anchors (null -> state 'unknown'), opts.pb = the PB.
  // Returns { n (runs in window), gain (pct points per attempt | null), src
  // ('attempts' | 'history' | null), nearness (best of last 5 / PB, score space),
  // nearPct (pct(PB) - pct(best of last 5) | null), recentPct, state }.
  //   responsive  gain > 0, or >= RESP_MIN_RUNS runs landing within RESP_NEAR of the PB
  //   plateaued   >= PLATEAU_MIN_RUNS runs, gain <= 0, recent best > PLATEAU_GAP under the PB (or nearness < 0.85)
  //   unknown     everything else -- "just hasn't played enough", treated exactly as v0.3
  function responsiveness(rec, raises, curve, nowMs, opts){
    opts = opts || {};
    const last = rec && Array.isArray(rec.last) ? rec.last.map(x=>[Number(x[0]), Number(x[1])]).filter(x=>Number.isFinite(x[0]) && Number.isFinite(x[1])) : [];
    const since = nowMs - RESP_WINDOW_DAYS*DAY_MS;
    const pb = Number(opts.pb) > 0 ? Number(opts.pb) : Math.max(0, ...last.map(x=>x[1]));
    const recent = last.slice().sort((a,b)=>b[0]-a[0]).slice(0, 5).map(x=>x[1]);
    const recentBest = recent.length ? Math.max(...recent) : 0;
    const nearness = pb>0 && recent.length ? recentBest/pb : null;
    const hasCurve = Array.isArray(curve) && curve.length>=2;
    const p = s => hasCurve ? percentileRank(s, curve) : null;
    const inWin = last.filter(x=>x[0]>=since).sort((a,b)=>a[0]-b[0]);
    const pcts = hasCurve ? inWin.map(x=>p(x[1])).filter(v=>v!==null) : [];
    const n = inWin.length;
    const out = { n, gain: null, src: null, nearness, nearPct: null, recentPct: null, state: 'unknown' };
    if(!hasCurve) return out;
    const pbPct = p(pb), recPct = recentBest>0 ? p(recentBest) : null;
    out.recentPct = recPct;
    out.nearPct = (pbPct!==null && recPct!==null) ? Math.max(0, pbPct - recPct) : null;
    if(pcts.length >= RESP_MIN_RUNS){
      // least-squares slope of percentile on run index
      const k = pcts.length, mx = (k-1)/2, my = pcts.reduce((a,b)=>a+b, 0)/k;
      let sxy = 0, sxx = 0;
      pcts.forEach((y, i)=>{ sxy += (i-mx)*(y-my); sxx += (i-mx)*(i-mx); });
      out.gain = sxx>0 ? sxy/sxx : 0; out.src = 'attempts';
    } else {
      const rs = (raises||[]).map(r=>[Number(r[0]), Number(r[1]), Number(r[2])]).filter(r=>r[0]>=since && r[1]>0 && r[2]>0).sort((a,b)=>a[0]-b[0]);
      if(rs.length >= 2){
        const from = p(rs[0][1]), to = p(rs[rs.length-1][2]);
        if(from!==null && to!==null){ out.gain = (to - from)/rs.length; out.src = 'history'; }
      }
    }
    // Dead band: a least-squares slope over 4-20 runs is never exactly 0, so a flat
    // series must not flip between 'responsive' and 'plateaued' on the sign of noise.
    // Below RESP_DEADBAND per attempt (one percentile point over a planned session)
    // the gain reads as 0 (review 2026-08-22 late).
    if(out.gain!==null && Math.abs(out.gain) < RESP_DEADBAND) out.gain = 0;
    if(out.gain!==null && out.gain>0) out.state = 'responsive';
    else if(n >= RESP_MIN_RUNS && out.nearPct!==null && out.nearPct <= RESP_NEAR) out.state = 'responsive';
    else if(n >= PLATEAU_MIN_RUNS && out.gain!==null && out.gain<=0 && ((out.nearPct!==null && out.nearPct > PLATEAU_GAP) || (nearness!==null && nearness < 0.85))) out.state = 'plateaued';
    return out;
  }
  // How much of a picture the profile gives: coverage (played scenarios with a
  // curve / played), attempts density (share of played scenarios with at least
  // RESP_MIN_RUNS logged runs -- 0 when no row has an attempts record: missing
  // evidence, not a missing source; reported as null so the meta line can say
  // "no runs logged"), days of score history / 90. Without any run evidence the
  // reading is capped at CONF_HIGH: calendar time alone must never put a
  // profile in the high band (review 2026-08-22 late). A fully-curved profile
  // with no runs and no history reads (1 + 0 + 0)/3 = 0.33 -> mid band = v0.3.
  function profileConfidence(scenarios, nowMs, historyDays){
    const played = (scenarios||[]).filter(sc=>sc.played);
    const coverage = played.length ? played.filter(sc=>sc.pct!==null && sc.pct!==undefined).length/played.length : 0;
    const anyAtt = played.some(sc=>sc.att && sc.att.n>0);
    const density = anyAtt ? played.filter(sc=>sc.att && sc.att.n>=RESP_MIN_RUNS).length/played.length : null;
    const days = Math.max(0, Math.min(1, (Number(historyDays)||0)/CONF_HISTORY_DAYS));
    let c = (coverage + days + (density===null ? 0 : density))/3;
    if(density===null) c = Math.min(c, CONF_HIGH);
    return { c: Math.round(c*1000)/1000, coverage: Math.round(coverage*1000)/1000, density: density===null ? null : Math.round(density*1000)/1000, days: Math.round(days*1000)/1000 };
  }
  // The slice template for a confidence reading. c null or in the middle band
  // -> SESSION_TEMPLATE itself. The bands are sized for 10 items; a SMALLER
  // session shrinks the slots by largest-remainder rounding (they sum to size),
  // a larger one keeps the slots and lets the top-up (more weakest, then
  // unplayed) fill the rest, exactly as v0.3 did -- the toolkit's size-12
  // snapshot pins that.
  function sessionTemplate(c, size){
    size = Number(size)>0 ? Math.round(Number(size)) : 10;
    const band = (c===null || c===undefined || !Number.isFinite(Number(c))) ? 'mid' : (Number(c) < CONF_LOW ? 'low' : (Number(c) > CONF_HIGH ? 'high' : 'mid'));
    const base = SESSION_TEMPLATES[band];
    const keys = ['weakest', 'route', 'fillout', 'quickwin', 'revisit'];
    const total = keys.reduce((a,k)=>a+base[k], 0);
    if(size >= total) return Object.assign({ band }, base);
    const raw = keys.map(k=>base[k]*size/total);
    const out = {}; let used = 0;
    keys.forEach((k, i)=>{ out[k] = Math.floor(raw[i]); used += out[k]; });
    const order = keys.map((k, i)=>[raw[i]-Math.floor(raw[i]), -i, k]).sort((a,b)=> b[0]-a[0] || b[1]-a[1]);
    for(let i=0; used<size && i<order.length; i++){ out[order[i][2]]++; used++; }
    for(let i=0; used<size; i++){ out[keys[i % keys.length]]++; used++; }
    out.band = band;
    return out;
  }
  // Revisit forecast for one candidate: how its transfer neighbours (r > 0,
  // n >= 100) and its label-bridged scenarios moved in percentile space since the
  // candidate's last visit T, against the candidate's own gap to its PB. A
  // scenario is evidence only when it was TOUCHED since T (a run logged or a PB
  // raise after T); its movement is pct(now) - pct(PB as of T). The PB as of T
  // is read from the score history ONLY: the `from` of the earliest raise after
  // T (sync-dated), and when no raise is logged after T while the history window
  // (helpers.historySince, the app's raisesSince start) reaches back to T, the PB
  // simply has not moved (delta 0). A logged run at or before T is NOT used as
  // the PB as of T -- it is only a lower bound (the PB run is evicted from the
  // 20-run record, and seeded/imported PBs never had one), and reading it as the
  // PB reported movement that never happened (review 2026-08-22 late). When T is
  // older than the history window and nothing was logged after it, the scenario
  // is not evidence. An unmoved but touched scenario counts as 0 in the weighted
  // mean. Returns null when no evidence moved -- the v0.3 reduction (revisits
  // then keep the longest-unplayed order). p = logistic((gain - margin)/
  // FORECAST_SLOPE): a stated prior, logged per item so the return-collect
  // record can say whether 70% means 70%.
  function revisitForecast(sc, byName, bridges, byLabel, helpers){
    if(!(sc.att && sc.att.lastT>0)) return null;
    const T = sc.att.lastT;
    const hasP = row => row && row.played && row.pct!==null && row.pct!==undefined;
    const touched = row => !!((row.att && row.att.lastT > T) || (row.raises||[]).some(r=>Number(r[0]) > T));
    const historySince = helpers && Number.isFinite(Number(helpers.historySince)) ? Number(helpers.historySince) : null;
    // PB as of T in percentile space; null = not evidence (unplayed at T, or T older than the history window)
    const pctAt = row => {
      const first = (row.raises||[]).find(r=>Number(r[0]) > T);
      if(first){ if(first[1]===null || first[1]===undefined) return null; return { pct: Math.min(row.pct, Number(first[1])), synced: true }; }
      if(historySince!==null && T >= historySince) return { pct: row.pct, synced: false };   // history covers (T, now] and holds no raise: unmoved
      return null;
    };
    const evidence = [];
    (sc.neighbours||[]).forEach(nb=>{
      if(!(nb[1]>0) || !(nb[2]>=100)) return;
      const row = byName.get(nb[0]); if(!hasP(row) || !touched(row)) return;
      const at = pctAt(row); if(!at) return;
      evidence.push({ name: row.name, r: nb[1], n: nb[2], delta: row.pct - at.pct, via: null, synced: at.synced });
    });
    if(bridges && byLabel && helpers){
      // A label-rich scenario (nine curator labels is common) would re-count the
      // same moved scenarios through every bridge, so only the strongest
      // FORECAST_MAX_BRIDGES bridges by r contribute.
      const seen = new Set(); const labelEv = [];
      helpers.labelsOf(sc).forEach(L=>{
        if(helpers.noSkillLabel(L)) return;
        Object.keys(bridges).forEach(key=>{
          const [a,b] = key.split('|'); if(a===b || helpers.sameSkill(a,b)) return;
          const M = a===L ? b : (b===L ? a : null); if(!M || helpers.noSkillLabel(M) || seen.has(M)) return;
          const r = bridges[key][0]; if(!(r>0)) return;
          const rows = (byLabel.get(M)||[]).filter(row=>row.name!==sc.name && hasP(row) && touched(row) && !helpers.labelsOf(row).includes(L));
          const ds = rows.map(row=>{ const at = pctAt(row); return at ? { d: row.pct - at.pct, synced: at.synced } : null; }).filter(Boolean);
          if(!ds.length) return;
          seen.add(M);
          labelEv.push({ name: M, r, n: ds.length, delta: ds.reduce((s,x)=>s+x.d, 0)/ds.length, via: M, synced: ds.some(x=>x.synced) });
        });
      });
      labelEv.sort((a,b)=> b.r - a.r).slice(0, FORECAST_MAX_BRIDGES).forEach(e=>evidence.push(e));
    }
    if(!evidence.some(e=>e.delta>0)) return null;
    const wsum = evidence.reduce((s,e)=>s+e.r, 0);
    const gain = evidence.reduce((s,e)=>s+e.r*e.delta, 0)/wsum;
    const margin = sc.resp && sc.resp.nearPct!==null && sc.resp.nearPct!==undefined ? sc.resp.nearPct : FORECAST_PRIOR_MARGIN;
    const odds = gain - margin;
    const p = 1/(1+Math.exp(-odds/FORECAST_SLOPE));
    return { gain, margin, odds, p, evidence, synced: evidence.some(e=>e.synced) };
  }
  // Session-history statistics for the history view. log = the session log
  // ([{day, seedBump, startedAt, rating, regime, done, size, conf, template,
  // items:[{name, why, pbAt, p}]}]), pbNow = name -> current PB (function, Map or
  // object), liveKey = {day, seedBump} of the live session (its revisits are not
  // resolved yet, so it is listed but left out of the return-collect totals).
  // Weeks start on Monday (day numbers count from Thursday 1970-01-01) and run
  // contiguously from the first logged week to the week of nowMs, oldest first.
  function sessionHistoryStats(log, pbNow, nowMs, liveKey){
    const pb = typeof pbNow==='function' ? pbNow : (pbNow instanceof Map ? (n=>pbNow.get(n)) : (n=>(pbNow||{})[n]));
    const isLive = e => !!(liveKey && e.day===liveKey.day && (e.seedBump||0)===(liveKey.seedBump||0));
    const sessions = (log||[]).filter(e=>e && Number.isFinite(e.day)).map(e=>{
      const items = Array.isArray(e.items) ? e.items : [];
      const done = typeof e.done==='number' ? e.done : (e.done && typeof e.done==='object' ? Object.keys(e.done).length : 0);
      // The log is written at compose time, so a session that was opened and never
      // played is in it too; its revisits were never attempted and must not count
      // toward the return-collect rate (review 2026-08-22 late): only sessions with
      // at least one item done contribute revisits.
      const revs = done > 0 ? items.filter(it=>it.why==='revisit') : [];
      const collected = revs.filter(it=>(Number(pb(it.name))||0) > (Number(it.pbAt)||0)).length;
      const ps = revs.map(it=>Number(it.p)).filter(v=>Number.isFinite(v));
      return { day: e.day, seedBump: e.seedBump||0, startedAt: e.startedAt, rating: e.rating||null, regime: e.regime||null, done, size: Number(e.size)||items.length,
        revisits: revs.length, collected, predicted: ps.length ? ps.reduce((a,b)=>a+b, 0)/ps.length : null, conf: e.conf===undefined ? null : e.conf, template: e.template||null, live: isLive(e) };
    }).sort((a,b)=> b.startedAt - a.startedAt || b.day - a.day);
    const weekOf = day => day - (((day % 7) + 7 + 3) % 7);
    const nowDay = Math.floor((nowMs - new Date(nowMs).getTimezoneOffset()*60000)/DAY_MS);
    const weeks = [];
    if(sessions.length){
      const first = weekOf(Math.min(...sessions.map(s=>s.day))), lastW = weekOf(nowDay);
      for(let w=first; w<=lastW; w+=7){
        const ss = sessions.filter(s=>weekOf(s.day)===w);
        const closed = ss.filter(s=>!s.live);
        const revisits = closed.reduce((a,s)=>a+s.revisits, 0), collected = closed.reduce((a,s)=>a+s.collected, 0);
        const preds = closed.filter(s=>s.predicted!==null);
        const ratings = { easy: 0, good: 0, hard: 0 }; ss.forEach(s=>{ if(s.rating && ratings[s.rating]!==undefined) ratings[s.rating]++; });
        weeks.push({ weekStart: w, sessions: ss.length, done: ss.reduce((a,s)=>a+s.done, 0), size: ss.reduce((a,s)=>a+s.size, 0), revisits, collected,
          rate: revisits ? collected/revisits : null, predicted: preds.length ? preds.reduce((a,s)=>a+s.predicted*s.revisits, 0)/preds.reduce((a,s)=>a+s.revisits, 0) : null, ratings });
      }
    }
    const closed = sessions.filter(s=>!s.live);
    const revisits = closed.reduce((a,s)=>a+s.revisits, 0), collected = closed.reduce((a,s)=>a+s.collected, 0);
    const preds = closed.filter(s=>s.predicted!==null);
    const overall = { sessions: sessions.length, revisits, collected, rate: revisits ? collected/revisits : null,
      predicted: preds.length ? preds.reduce((a,s)=>a+s.predicted*s.revisits, 0)/preds.reduce((a,s)=>a+s.revisits, 0) : null };
    return { sessions, weeks, overall };
  }
  // ---- The comparable competency number, `m` (Review Ledger III A1 + S3, 2026-08-25) --
  // One pass over the rows that gives every played scenario a number on ONE scale, so
  // that "weakest" means weakest skill rather than weakest board or weakest metric:
  //   curved            m = adjustPercentile(pct, delta)   -- the board calibration above
  //   played, no curve  m = the QUANTILE MAP of its To 2nd onto the distribution of the
  //                     calibrated percentiles, over the player's own played curved set
  //   neither           m = To 2nd, exactly as before
  // Why the quantile map (S3): sessionMetric used to return the percentile where a curve
  // existed and To 2nd otherwise, and sort ascending on the result -- but the two are not
  // the same scale and barely the same quantity (r = 0.33 across the owner's played set;
  // medians 0.730 vs 0.606). A curve-less scenario at the MEDIAN of the To-2nd
  // distribution entered the sort as if it were in his bottom 32%. Every scenario played
  // for the first time has no curve until the next harvest, so the newest thing you
  // played reliably topped your own weakest list -- a self-reinforcing loop, observed
  // live on 2026-08-24 (a PB set 44 minutes earlier ranked above an 11th-percentile
  // scenario). The map is monotone, uses only the player's own two distributions, and
  // needs METRIC_MIN_CURVED of them; under that it falls back to raw To 2nd.
  // `mScale` says which quantity `m` is, so a reason can name what it compared.
  const METRIC_MIN_CURVED = 20;
  // share of `sorted` at or below t, mid-rank so a run of ties maps to its middle
  function quantileOfValue(sorted, t){
    let lo = 0, hi = sorted.length;
    while(lo<hi){ const mid = (lo+hi)>>1; if(sorted[mid] < t) lo = mid+1; else hi = mid; }
    let end = lo; while(end<sorted.length && sorted[end]<=t) end++;
    return sorted.length ? (lo+end)/(2*sorted.length) : 0;
  }
  // the value at quantile q, linear between order statistics (R type 7)
  function valueAtQuantile(sorted, q){
    if(!sorted.length) return null;
    const pos = Math.min(sorted.length-1, Math.max(0, q*(sorted.length-1)));
    const lo = Math.floor(pos), hi = Math.min(sorted.length-1, lo+1);
    return sorted[lo] + (pos-lo)*(sorted[hi]-sorted[lo]);
  }
  // Rows in, rows out. Idempotent (a row that already carries `m` is returned untouched),
  // so the app may calibrate once and hand the same list to composeSession and
  // skillProfile. opts.offsets = data/offsets.json's `offsets` block, or null: with no
  // offsets the curved rows keep their raw percentile and only the S3 map applies; with
  // neither, every row's `m` is exactly what sessionMetric returned before.
  function calibrateScenarios(scenarios, opts){
    const list = scenarios || [];
    if(list.length && list.every(sc=>sc && Number.isFinite(sc.m))) return list;
    const o = Object.assign({ offsets: null, minCurved: METRIC_MIN_CURVED }, opts||{});
    // No offsets table, or no row for this scenario, is NULL -- not 0. Number(null) is 0 and
    // Number.isFinite(0) is true, so the shorter spelling reported a calibration on every
    // uncalibrated build and silently switched off the board shrinkage it replaces.
    const deltaOf = name => {
      if(!o.offsets || !Object.prototype.hasOwnProperty.call(o.offsets, name)) return null;
      const row = o.offsets[name];
      const d = Array.isArray(row) ? Number(row[0]) : Number(row);
      return Number.isFinite(d) ? d : null;
    };
    const hasP = sc => sc && sc.pct!==null && sc.pct!==undefined && Number.isFinite(Number(sc.pct));
    const adjOf = new Map();
    let offsetsUsed = 0;
    list.forEach(sc=>{
      if(!hasP(sc)) return;
      const d = deltaOf(sc.name);
      if(d===null){ adjOf.set(sc.name, Number(sc.pct)); return; }
      offsetsUsed++; adjOf.set(sc.name, adjustPercentile(sc.pct, d));
    });
    // the reference distributions come from the PLAYED curved rows only -- an unplayed
    // scenario has no standing to contribute and its To 2nd is 0 by construction
    const refAdj = [], refT2 = [];
    list.forEach(sc=>{ if(sc && sc.played && adjOf.has(sc.name)){ refAdj.push(adjOf.get(sc.name)); refT2.push(Number(sc.to2nd)||0); } });
    refAdj.sort((a,b)=>a-b); refT2.sort((a,b)=>a-b);
    const canMap = refAdj.length >= o.minCurved;
    let mapped = 0;
    const out = list.map(sc=>{
      if(!sc) return sc;
      if(adjOf.has(sc.name)){
        const m = adjOf.get(sc.name);
        return (m===Number(sc.pct)) ? Object.assign({}, sc, { m, mScale: 'pct' })
                                    : Object.assign({}, sc, { m, mScale: 'pct', pct: m, pctRaw: Number(sc.pct) });
      }
      if(canMap && sc.played){ mapped++; return Object.assign({}, sc, { m: valueAtQuantile(refAdj, quantileOfValue(refT2, Number(sc.to2nd)||0)), mScale: 'pct', mMapped: true }); }
      return Object.assign({}, sc, { m: Number(sc.to2nd)||0, mScale: 'to2nd' });
    });
    out.calibrated = offsetsUsed > 0;
    out.offsetsUsed = offsetsUsed;
    out.mapped = mapped;
    out.curved = refAdj.length;
    return out;
  }
  function seededRandom(seed){ let s = (seed>>>0) || 1; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function medianOf(arr){ const s = arr.slice().sort((a,b)=>a-b); const n=s.length; if(!n) return null; return n%2 ? s[(n-1)/2] : (s[n/2-1]+s[n/2])/2; }
  // The competency number for one scenario. `m` is calibrateScenarios' comparable value
  // (board-adjusted percentile, or a curve-less scenario's To 2nd mapped onto that
  // scale); a row that never went through it falls back to the pre-2026-08-25 rule --
  // percentile where a curve exists, else To 2nd -- so every caller still works.
  const sessionMetric = sc => Number.isFinite(sc.m) ? sc.m : ((sc.pct!==null && sc.pct!==undefined) ? sc.pct : sc.to2nd);
  // Weakness by label over played scenarios: median metric, n. Labels = the
  // scenario's facets when it has any (curator labels normalised, minus pack /
  // section noise), else its raw curator labels.
  const skillLabelsOf = sc => { const f = (sc.facets||[]).filter(x=>!x.includes(':') && x!=='no-aim'); return f.length ? f : (sc.labels||[]).filter(Boolean); };
  // ---- label / route helpers shared by the session coach and the overlap page ----
  // (lifted out of composeSession's closure 2026-08-22 for the overlap page;
  // behaviour identical -- toolkit test/session.js pins the coach's output.)
  // A raw curator label the way the map script keys it: lower-cased, trimmed
  // (dev/transfer-map.ps1's ([string]$g.category).Trim().ToLower()).
  const normalizeLabel = s => String(s||'').toLowerCase().trim();
  // The facet set a curator label carries through the vocabulary (mechanic +
  // modifiers), or null when the vocabulary does not know it / marks it as
  // carrying no skill. "static" -> {static}, "static clicking" -> {clicking, static}.
  const labelFacetSet = l => { const e = facetEntry('category', l) || facetEntry('subcategory', l); if(!e || e.a) return null; const s = new Set(); if(e.m) s.add(e.m); (e.mod||[]).forEach(m=>s.add(m)); return s.size ? s : null; };
  // Two labels name the same skill when one's facet set is a subset of the
  // other's ("static" / "static clicking"); "reactive tracking" vs "smoothness"
  // ({tracking, reactive} vs {tracking, smooth}) are different skills. Labels the
  // vocabulary doesn't know are never the same skill here (raw-label test only).
  const sameSkillLabels = (a, b) => { const fa = labelFacetSet(a), fb = labelFacetSet(b); if(!fa || !fb) return false; const sub = (x,y) => [...x].every(v=>y.has(v)); return sub(fa,fb) || sub(fb,fa); };
  // A label the vocabulary marks as carrying no skill (section numbers, pack
  // names) or as a difficulty word ("easy"): can't be either end of a route.
  const noSkillLabel = l => { const cats = FACET_VOCAB.categories, subs = FACET_VOCAB.subcategories; const e = Object.prototype.hasOwnProperty.call(cats, l) ? cats[l] : (Object.prototype.hasOwnProperty.call(subs, l) ? subs[l] : null); return !!(e && e.a); };
  // The user's level: median rung of the played, rated scenarios (rounded); null with none.
  function sessionLevel(scenarios){ const rungs = (scenarios||[]).filter(sc=>sc.played && sc.rung>=0).map(sc=>sc.rung); return rungs.length ? Math.round(medianOf(rungs)) : null; }
  // Stuck: several recent tries (>= 4) whose best sits well under the PB (nearness < 0.85).
  const isStuck = sc => !!(sc.att && sc.att.n>=4 && sc.att.nearness!==null && sc.att.nearness<0.85);
  const isPlateaued = sc => !!(sc.resp && sc.resp.state==='plateaued');
  // Can y serve as a route for the weak scenario w at this level? The session's
  // rule in one place: y rated, at or under level+1, not maxed, not stuck, not
  // plateaued, and either unplayed or standing >= 5 points higher than w on ONE
  // scale (percentile vs percentile when both have a curve, To 2nd vs To 2nd
  // otherwise -- `cmp` says which). `why` names the first failed condition.
  function routeCheck(y, w, level){
    if(!y) return { ok: false, cmp: null, why: 'missing' };
    const usePct = (y.pct!==null && y.pct!==undefined) && (w && w.pct!==null && w.pct!==undefined);
    const cmp = usePct ? 'pct' : 'to2nd';
    if(!(y.rung>=0)) return { ok: false, cmp, why: 'unrated' };
    if(level!==null && level!==undefined && y.rung > level+1) return { ok: false, cmp, why: 'above level' };
    if(y.maxed) return { ok: false, cmp, why: 'maxed' };
    if(isStuck(y)) return { ok: false, cmp, why: 'stuck' };
    if(isPlateaued(y)) return { ok: false, cmp, why: 'plateaued' };
    if(y.played && w){
      const higher = usePct ? y.pct >= w.pct + 0.05 : y.to2nd >= w.to2nd + 0.05;
      if(!higher) return { ok: false, cmp, why: 'not higher' };
    }
    return { ok: true, cmp, why: null };
  }
  // Weakness by label. Default: the scenario's skill labels (facets when it has
  // any, else raw curator labels) -- the session's profile. opts.keyBy 'labels':
  // rows keyed by NORMALISED raw curator label (kind 'label'), the overlap
  // page's standing per matrix row.
  function skillProfile(scenarios, opts){
    const byLabels = !!(opts && opts.keyBy==='labels');
    const keysOf = byLabels ? (sc => [...new Set((sc.labels||[]).map(normalizeLabel).filter(Boolean))]) : skillLabelsOf;
    const by = new Map();
    scenarios.forEach(sc=>{ if(!sc.played || sc.maxed) return; keysOf(sc).forEach(l=>{ if(!by.has(l)) by.set(l, []); by.get(l).push(sc); }); });
    const out = [];
    by.forEach((list, label)=>{
      const median = medianOf(list.map(sessionMetric));
      const raises = list.reduce((a,sc)=>a+(sc.raises14d||0), 0);
      const kind = (!byLabels && list.some(sc=>(sc.facets||[]).includes(label))) ? 'facet' : 'label';
      out.push({ label, kind, median, n: list.length, raises14d: raises });
    });
    return out.sort((a,b)=> a.median - b.median || b.n - a.n);
  }
  function composeSession(scenarios, opts, playlistFill){
    opts = Object.assign({ size: 10, seed: 1, now: Date.now(), gameWeight: 0, gameFacets: GAME_FACETS_DEFAULT, confidence: null, template: null, offsets: null }, opts||{});
    playlistFill = playlistFill || {};
    // Calibrate ONCE, at the boundary (Review Ledger III A1/S3): every comparison below --
    // the weakest key, routeCheck's "you stand higher here", skillProfile's medians, the
    // block standings -- then operates on one comparable scale without knowing about it.
    // Idempotent, so an app that already calibrated for its own strip pays nothing.
    scenarios = calibrateScenarios(scenarios, { offsets: opts.offsets });
    const calibrated = !!scenarios.calibrated;
    const rnd = seededRandom(opts.seed);
    const shuffle = arr => { const a = arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
    const byName = new Map(scenarios.map(sc=>[sc.name, sc]));
    const rated = scenarios.filter(sc=>sc.rung>=0);
    const played = rated.filter(sc=>sc.played);
    const chosen = new Set();
    const items = [];
    const pct = x => Math.round((x||0)*100)+'%';
    const label = sc => (sc.rung>=0 ? DIFF_LABELS[sc.rung] : 'Unrated');
    const primary = sc => { const l = skillLabelsOf(sc); return l.length ? l[0] : ''; };
    const hasPct = sc => sc.pct!==null && sc.pct!==undefined;
    // What the ranking actually used, said out loud. A calibrated percentile names the raw
    // one it came from (that is the number you can check on the leaderboard); a curve-less
    // scenario names the quantile map rather than pretending it has a percentile.
    const adjNote = sc => (sc.pctRaw!==undefined && sc.pctRaw!==null && Math.abs(sc.pctRaw - sc.pct) >= 0.02) ? ' (adjusted for this board, '+percentileLabel(sc.pctRaw)+' on its own leaderboard)' : '';
    const standing = sc => hasPct(sc) ? percentileLabel(sc.pct)+' of players'+adjNote(sc)
      : (sc.mMapped ? 'To 2nd '+pct(Math.min(1, sc.to2nd))+' — no population curve yet, so it ranks where that sits among your curved scenarios ('+percentileLabel(sc.m)+')'
                    : 'To 2nd '+pct(Math.min(1, sc.to2nd))+' (no population curve yet)');
    // Routes compare on ONE scale: percentile vs percentile when both sides have a
    // curve, To 2nd vs To 2nd otherwise; the route carries which (routeCheck's
    // `cmp`), so its reason reports the quantity that was actually compared.
    const standingAs = (sc, cmp) => (cmp==='pct' && hasPct(sc)) ? percentileLabel(sc.pct)+' of players' : 'To 2nd '+pct(Math.min(1, sc.to2nd));
    // ---- v0.4 terms, each 0 / the identity without its evidence ----
    const gameW = Math.max(0, Math.min(1, Number(opts.gameWeight)||0));
    const isHit = sc => !!(sc && sc.gameHit);
    // direct carrier: the full bonus; a neighbour of one: the strongest positive r's share
    const gameShare = sc => { if(gameW<=0) return 0; if(isHit(sc)) return 1; let best = 0; (sc.neighbours||[]).forEach(nb=>{ if(nb[1]>best && isHit(byName.get(nb[0]))) best = nb[1]; }); return best; };
    const gameBonus = sc => gameW * GAME_BONUS * gameShare(sc);
    const expectedGain = sc => (sc.resp && sc.resp.gain>0) ? Math.min(EXPGAIN_CAP, sc.resp.gain * SESSION_PLANNED_ATTEMPTS) : 0;
    const conf = sc => boardConfidence(sc.boardN===null || sc.boardN===undefined ? null : Number(sc.boardN));
    const plateaued = isPlateaued;
    // game-first stable partition for the shuffled pools (identity at weight 0)
    const gameFirst = list => gameW>0 ? list.filter(sc=>gameShare(sc)>0).concat(list.filter(sc=>gameShare(sc)<=0)) : list;
    const template = opts.template || sessionTemplate(opts.confidence && opts.confidence.c!==undefined ? opts.confidence.c : null, opts.size);
    const gameNote = sc => { const s = gameShare(sc); return s<=0 ? '' : (isHit(sc) ? ' · game-relevant (cs/val or tac-fps)' : ' · co-varies with game-relevant scenarios (r '+s.toFixed(2)+')'); };
    // ---- v0.5: the overlap map steers the session (DESIGN_INTENT: the map exists
    // to prescribe practice). opts.blocks = { of(name) -> block id | null,
    // list: [{id, name}] } is the page's practise-separately set at its default
    // knobs (the app builds it from the shipped pairs block; absent -> every term
    // below is the identity and the session is v0.4 exactly). A block is a set of
    // scenarios measured to move independently of the other blocks -- a different
    // skill. Three uses: (1) the WEAKEST slice is spread across blocks by how far
    // each stands under the others (floor-biased, never all from one block);
    // (2) one COVERAGE slot goes to the block nothing touched in BLOCK_UNTOUCHED_DAYS
    // (variety is the efficient path, and an untouched independent skill decays
    // unseen); (3) within a block, a HUB -- a scenario whose strength co-varies
    // with many others (>= HUB_FULL positive neighbours at n >= 100) -- ranks a
    // little earlier: practice there is the shared-skill prior's best bet.
    const blocks = opts.blocks && typeof opts.blocks.of==='function' ? opts.blocks : null;
    const blockOf = sc => blocks ? (blocks.of(sc.name) || null) : null;
    const blockList = blocks ? (blocks.list||[]).map(b=>({ id: b.id, name: b.name||b.id })) : [];
    const blockNameOf = sc => { const id = blockOf(sc); if(!id) return null; const b = blockList.find(x=>x.id===id); return b ? b.name : id; };
    const hubDegree = sc => (sc.neighbours||[]).filter(nb=>nb && nb[1]>0 && nb[2]>=100).length;
    const hubBonus = sc => blocks ? HUB_BONUS*Math.min(1, hubDegree(sc)/HUB_FULL) : 0;
    const take = (list, why, reason, n, via) => { for(const sc of list){ if(items.length>=opts.size || n<=0) break; if(chosen.has(sc.name)) continue; chosen.add(sc.name);
      const cf = conf(sc);
      items.push({ name: sc.name, why, reason: typeof reason==='function' ? reason(sc) : reason, label: sc._label||primary(sc)||null, rung: sc.rung, pct: hasPct(sc) ? sc.pct : null, to2nd: sc.to2nd, toMax: sc.toMax, via: (typeof via==='function' ? via(sc) : via)||null,
        resp: sc.resp ? { state: sc.resp.state, gain: sc.resp.gain, n: sc.resp.n, nearPct: sc.resp.nearPct, src: sc.resp.src } : null,
        forecast: sc._forecast || null, boardN: sc.boardN===undefined ? null : sc.boardN, conf: cf,
        pctShrunk: (!calibrated && hasPct(sc) && cf<1 && popLevel!==null) ? cf*sc.pct + (1-cf)*popLevel : null,
        pctRaw: sc.pctRaw===undefined ? null : sc.pctRaw, m: Number.isFinite(sc.m) ? sc.m : null, mMapped: !!sc.mMapped,
        game: gameShare(sc)>0 ? (isHit(sc) ? 'direct' : 'neighbour') : null,
        block: blockOf(sc), blockName: blockNameOf(sc) }); n--; } };
    let popLevel = null;
    if(played.length < SESSION_THIN_PLAYED){
      const pool = shuffle(rated.filter(sc=>!sc.played && sc.rung<=4));
      const mechs = FACET_MECHANICS.slice();
      let guard = 0;
      while(items.length<opts.size && guard++<opts.size*4){
        const m = mechs[items.length % mechs.length];
        const pick = pool.find(sc=>!chosen.has(sc.name) && (sc.facets||[]).includes(m)) || pool.find(sc=>!chosen.has(sc.name));
        if(!pick) break;
        take([Object.assign({}, pick, {_label: m})], 'placement', 'Placement — '+m+' at '+label(pick)+': there isn\'t enough played history yet to say where you stand, so play and generate evidence.', 1);
      }
      return { regime: 'thin', level: null, popLevel: null, weakLabels: [], confidence: opts.confidence||null, template: null, items };
    }
    const level = sessionLevel(played);
    const curved = played.filter(hasPct);
    popLevel = curved.length ? medianOf(curved.map(sc=>sc.pct)) : null;
    const weakLabels = skillProfile(rated).filter(p=>p.n>=4);
    // ---- WEAKEST: the loop, on the population metric. Rung <= level.
    const stuck = isStuck;
    // v0.3's stuck test OR-ed with v0.4's plateaued reading: both sink, neither routes.
    const sinks = sc => stuck(sc) || plateaued(sc);
    // Small-board shrinkage toward the user's overall level: identity at conf 1
    // (no board size, or >= 10,000 players) and without a popLevel.
    // RETIRED where the board calibration applies (2026-08-25, Review Ledger III A1).
    // boardConfidence's log10(n)/4 was an invented curve standing in for exactly the bias
    // the offsets now measure and remove; applying both would double-count it and put a
    // board-size term back into the ranking the calibration just took out. Board size is
    // still shown on every item -- displayed, not silently mixed into the number.
    const shrunk = sc => { const m = sessionMetric(sc); if(calibrated || !hasPct(sc) || popLevel===null) return m; const cf = conf(sc); return cf>=1 ? m : cf*m + (1-cf)*popLevel; };
    // The v0.4 weakest key: v0.3's metric, shrunk, minus the gain a session can
    // expect here, minus the game-relevance bonus -- every term 0 without evidence.
    const weakKey = sc => shrunk(sc) - expectedGain(sc) - gameBonus(sc) - hubBonus(sc);
    const weakPool = played.filter(sc=>!sc.maxed && sc.rung<=level)
      .sort((a,b)=> (sinks(a)?1:0)-(sinks(b)?1:0) || weakKey(a)-weakKey(b) || a.toMax-b.toMax || b.playlists-a.playlists);
    const perLabel = new Map(), perPl = new Set();
    const spread = [];
    for(const sc of weakPool){
      const l = primary(sc);
      if(l && (perLabel.get(l)||0) >= 2) continue;
      if((sc.plKeys||[]).some(k=>perPl.has(k))) continue;
      spread.push(sc); if(l) perLabel.set(l, (perLabel.get(l)||0)+1); (sc.plKeys||[]).forEach(k=>perPl.add(k));
      if(spread.length >= template.weakest*2) break;
    }
    const respNote = sc => { const r = sc.resp; if(!r) return '';
      if(r.state==='responsive' && r.gain>0) return ' — responsive: +'+(r.gain*100).toFixed(1)+' pts/run over '+r.n+' runs'+(r.src==='history' ? ' (from PB raises)' : '');
      if(r.state==='plateaued') return ' — plateaued: '+r.n+' runs, no gain, best recent '+(r.nearPct!==null ? Math.round(r.nearPct*100)+' pts' : 'well')+' under PB';
      return ''; };
    const shrinkNote = sc => { if(calibrated) return ''; const cf = conf(sc); return (hasPct(sc) && cf<1 && popLevel!==null) ? ' — board of '+Number(sc.boardN).toLocaleString()+' players (confidence '+cf.toFixed(2)+'), ranked as '+percentileLabel(shrunk(sc)) : ''; };
    const weakReason = sc=>'Weakest — '+standing(sc)+(primary(sc)?' in '+primary(sc):'')+', '+label(sc)+' (at or under your level, so a high score is reachable)'+(sc.playlists>1?'; moves '+sc.playlists+' playlists':'')+(stuck(sc)?' — note: several recent tries well under the PB':'')+respNote(sc)+shrinkNote(sc)+gameNote(sc)+'.';
    // Block standings: median percentile over the played, curved scenarios of each
    // block (the same number the Overlap page shows as 'you N%'); lastT = the newest
    // run on any of its scenarios.
    let blockStats = [];
    if(blocks){
      const per = new Map();
      played.forEach(sc=>{ const b = blockOf(sc); if(!b) return; if(!per.has(b)) per.set(b, { pcts: [], lastT: 0, n: 0 }); const e = per.get(b); e.n++; if(hasPct(sc)) e.pcts.push(sc.pct); if(sc.att && sc.att.lastT>e.lastT) e.lastT = sc.att.lastT; });
      blockStats = blockList.map(b=>{ const e = per.get(b.id)||{ pcts: [], lastT: 0, n: 0 }; return { id: b.id, name: b.name, played: e.n, rated: e.pcts.length, median: e.pcts.length ? medianOf(e.pcts) : null, lastT: e.lastT||null }; });
    }
    const blockNote = sc => { if(!blocks) return ''; const id = blockOf(sc); const bs = blockStats.find(b=>b.id===id); if(!bs || bs.median===null) return ''; const ranked = blockStats.filter(b=>b.median!==null).sort((a,b)=>a.median-b.median); const pos = ranked.findIndex(b=>b.id===id)+1; return ' — '+bs.name+' block: your standing '+percentileLabel(bs.median)+(ranked.length>1 ? ' ('+(pos===1 ? 'your weakest' : ordinal(pos)+' weakest')+' of '+ranked.length+' blocks)' : '')+(hubDegree(sc)>=HUB_FULL ? '; a hub — moves with '+hubDegree(sc)+' others' : ''); };
    const weakReasonB = sc => weakReason(sc)+blockNote(sc);
    if(blocks && blockStats.some(b=>b.median!==null)){
      // Slots across blocks by how far each stands under the others: weight =
      // 1 - median (floor at 0.05), largest-remainder rounding, weakest block first;
      // a block whose pool runs dry hands its slots to the next weakest.
      const ranked = blockStats.filter(b=>b.median!==null && b.rated>=2).sort((a,b)=> a.median-b.median || (a.name<b.name?-1:1));
      // COLD is a MEASURED absence, never a missing one: the block has runs on record
      // and none of them inside BLOCK_UNTOUCHED_DAYS. A block with no logged run at all
      // is UNKNOWN -- the same reading profileConfidence gives an empty attempts store --
      // and does not take a slot. Review C4 (2026-08-25): `lastT === null` counted as
      // untouched, so on a store with few logged runs every block qualified, the sort
      // tied on `lastT || 0`, and the slot went to whichever block sorted first by NAME.
      // On the owner's page that was the block he stood strongest in, in a reason that
      // said so ("your standing top 9% (8th weakest of 8 blocks)").
      const isCold = b => b.played>0 && b.lastT!==null && (opts.now - b.lastT) > BLOCK_UNTOUCHED_DAYS*DAY_MS;
      const coverageSlot = template.weakest>1 && blockStats.some(isCold) ? 1 : 0;
      const slots = template.weakest - coverageSlot;
      const ws = ranked.map(b=>Math.max(0.05, 1-b.median)); const wsum = ws.reduce((a,b)=>a+b, 0) || 1;
      const raw = ws.map(w=>w*slots/wsum); const alloc = raw.map(Math.floor); let used = alloc.reduce((a,b)=>a+b, 0);
      const order = raw.map((r,i)=>[r-Math.floor(r), -i]).sort((a,b)=> b[0]-a[0] || b[1]-a[1]);
      for(let i=0; used<slots && i<order.length; i++){ alloc[-order[i][1]]++; used++; }
      const perPlB = new Set(); let carry = 0;
      ranked.forEach((b, i)=>{
        let want = alloc[i] + carry; carry = 0;
        const pool = spread.filter(sc=>blockOf(sc)===b.id && !chosen.has(sc.name)).concat(weakPool.filter(sc=>blockOf(sc)===b.id && !chosen.has(sc.name) && !spread.includes(sc)));
        const before = items.length;
        take(pool.filter(sc=>!(sc.plKeys||[]).some(k=>perPlB.has(k))), 'weakest', weakReasonB, want);
        items.slice(before).forEach(it=>{ const sc = byName.get(it.name); (sc && sc.plKeys||[]).forEach(k=>perPlB.add(k)); });
        carry = want - (items.length - before);
      });
      if(carry>0) take(spread, 'weakest', weakReasonB, carry);   // no block could absorb them: the plain v0.4 order
      // COVERAGE: the block nothing touched for BLOCK_UNTOUCHED_DAYS -- its weakest
      // non-sink scenario at or under level; the least recently touched block first.
      if(coverageSlot){
        // Among the neglected blocks the WEAKEST earns the slot (D1's floor bias is
        // what decides between them), then the longest neglected, then the name so the
        // order is deterministic. Ordering by recency alone spent the slot on whichever
        // block happened to be coldest regardless of whether it needed the work.
        const cold = blockStats.filter(isCold).sort((a,b)=> (a.median===null?1:0)-(b.median===null?1:0) || (a.median-b.median) || (a.lastT||0)-(b.lastT||0) || (a.name<b.name?-1:1));
        for(const b of cold){
          const pool = weakPool.filter(sc=>blockOf(sc)===b.id && !sinks(sc) && !chosen.has(sc.name));
          const before = items.length;
          take(pool, 'coverage', sc=>'Coverage — nothing in the '+b.name+' block for '+Math.round((opts.now-b.lastT)/DAY_MS)+' days: it moves independently of the blocks you have been training, so it does not improve by proxy; '+standing(sc)+', '+label(sc)+blockNote(sc)+'.', 1);
          if(items.length>before) break;
        }
      }
    } else {
      take(spread, 'weakest', weakReasonB, template.weakest);
    }
    // ---- ROUTE: for the weakest items, a strong neighbour to train instead/as well.
    // Neighbour must exist in the pool, sit at or under level+1, not be maxed,
    // not be stuck, and either be unplayed or stand higher than the weak one --
    // volume there is productive where volume on the weak one may not be.
    // (routeCheck, module scope, is that rule; the overlap page marks routes with it.)
    const weakItems = items.filter(it=>it.why==='weakest').map(it=>byName.get(it.name)).filter(Boolean);
    const routes = [];
    weakItems.forEach(w=>{
      (w.neighbours||[]).forEach(nb=>{
        const y = byName.get(nb[0]); if(!y || chosen.has(y.name)) return;
        if(!(nb[1]>0)) return;   // positive co-variation only
        const rc = routeCheck(y, w, level); if(!rc.ok) return;
        routes.push({ y, w, r: nb[1], n: nb[2], cmp: rc.cmp });
      });
    });
    routes.sort((a,b)=> b.r*Math.log(b.n) - a.r*Math.log(a.n));
    const routeSeen = new Set(); const routeList = [];
    for(const rt of routes){ if(routeSeen.has(rt.w.name) || chosen.has(rt.y.name) || routeList.some(x=>x.y.name===rt.y.name)) continue; routeSeen.add(rt.w.name); routeList.push(rt); }
    // Label-level fallback (opts.labelBridges: { "a|b": [meanR, scenarioPairs] }, raw
    // curator labels lower-cased, from the map's comparison block): the weakest
    // scenarios tend to be the unpopular ones with no scenario-level neighbour, so
    // bridge through a label the weak one carries -- "strength in M moves with
    // strength in L across the population" -- and pick a scenario in M at your
    // level that you stand higher on or haven't played.
    const bridges = opts.labelBridges || {};
    // A bridge's two labels must name different skills (sameSkillLabels, module
    // scope, through the facet vocabulary: "static" / "static clicking" is one
    // skill spelled twice and is skipped; "tracking" vs "dodge" or "reactive
    // tracking" vs "smoothness" are real bridges), and neither end may be a label
    // the vocabulary marks as carrying no skill (noSkillLabel).
    const sameSkill = sameSkillLabels;
    const labelsOf = sc => [...new Set((sc.labels||[]).map(normalizeLabel).filter(Boolean))];
    // scenarios per raw label (built once; the bridge loop and the revisit forecast both read it)
    let _byLabel = null;
    const byLabelMap = () => { if(_byLabel) return _byLabel; _byLabel = new Map(); rated.forEach(sc=>{ labelsOf(sc).forEach(l=>{ if(!_byLabel.has(l)) _byLabel.set(l, []); _byLabel.get(l).push(sc); }); }); return _byLabel; };
    // A bridge weaker than the map's own pair threshold (|r| >= 0.3) is noise, not
    // a route (overlap review, 2026-08-22; v0.3 accepted any r > 0).
    const BRIDGE_MIN_R = 0.3;
    if(routeList.length < template.route && Object.keys(bridges).length){
      const byLabel = byLabelMap();
      for(const w of weakItems){
        if(routeList.length >= template.route) break;
        if(routeSeen.has(w.name)) continue;
        const cands = [];
        labelsOf(w).forEach(L=>{
          if(noSkillLabel(L)) return;
          Object.keys(bridges).forEach(key=>{
            const [a,b] = key.split('|'); if(a===b || sameSkill(a,b)) return;
            const M = a===L ? b : (b===L ? a : null); if(!M || noSkillLabel(M)) return;
            const [r, pairs] = bridges[key]; if(!(r>=BRIDGE_MIN_R)) return;
            (byLabel.get(M)||[]).forEach(y=>{
              if(y.name===w.name || chosen.has(y.name) || routeList.some(x=>x.y.name===y.name)) return;
              const rc = routeCheck(y, w, level); if(!rc.ok) return;   // level, maxed, stuck/plateaued, standing
              if(labelsOf(y).includes(L)) return;   // must be a genuinely different label
              // ...and a genuinely different skill: "static" -> "static clicking" is one
              // skill spelled twice (identical facet sets), while "reactive tracking" ->
              // "smooth tracking" shares the mechanic and differs in modifier -- exactly the
              // indirect route the design wants. So the facet SETS must differ; scenarios
              // with no facets fall back to the raw-label test above.
              const fy = skillLabelsOf(y).slice().sort().join('|'), fw = skillLabelsOf(w).slice().sort().join('|');
              if(fy && fw && fy===fw) return;
              cands.push({ y, w, r, n: pairs, viaLabel: M, fromLabel: L, labelRoute: true, cmp: rc.cmp });
            });
          });
        });
        if(!cands.length) continue;
        cands.sort((a,b)=> b.r*Math.log(b.n+1) - a.r*Math.log(a.n+1) || (sessionMetric(b.y) - sessionMetric(a.y)));
        routeSeen.add(w.name); routeList.push(cands[0]);
      }
    }
    take(routeList.map(rt=>Object.assign({}, rt.y, { _label: primary(rt.y), _route: rt })), 'route',
      sc=>{ const rt = sc._route; return rt.labelRoute
        ? 'Route — across the sampled players, strength in "'+rt.viaLabel+'" moves with strength in "'+rt.fromLabel+'" (mean r '+rt.r.toFixed(2)+' over '+rt.n+' scenario pairs), and '+rt.w.name+' is one of your weakest in "'+rt.fromLabel+'"; you '+(sc.played ? 'stand higher here ('+standingAs(sc, rt.cmp)+' vs '+standingAs(rt.w, rt.cmp)+')' : 'haven\'t played it')+', so volume here is the indirect way to raise it. '+label(sc)+'.'
        : 'Route — strength here moves with '+rt.w.name+' across '+rt.n.toLocaleString()+' players (r '+rt.r.toFixed(2)+'); you '+(sc.played ? 'stand higher here ('+standingAs(sc, rt.cmp)+' vs '+standingAs(rt.w, rt.cmp)+')' : 'haven\'t played it')+', so volume here is the indirect way to raise '+rt.w.name+'. '+label(sc)+'.'; },
      template.route, sc=>({ target: sc._route.w.name, r: sc._route.r, n: sc._route.n, viaLabel: sc._route.viaLabel||null }));
    // ---- FILL OUT: gaps in the playlists you have mostly played
    const fillPl = Object.keys(playlistFill).map(k=>Object.assign({key:k}, playlistFill[k])).filter(p=>p.total>0 && p.played<p.total && p.played/p.total>=0.6).sort((a,b)=> (b.played/b.total)-(a.played/a.total) || b.total-a.total);
    const fillTargets = new Set(fillPl.map(p=>p.key));
    const fillPool = gameFirst(shuffle(rated.filter(sc=>!sc.played && sc.rung<=level+1 && (sc.plKeys||[]).some(k=>fillTargets.has(k)))));
    take(fillPool, 'fillout', sc=>{ const p = fillPl.find(x=>(sc.plKeys||[]).includes(x.key)); return 'Fill out — '+(p? p.name+' is '+Math.round(p.played/p.total*100)+'% played and this is one of its gaps' : 'a gap in a playlist you have mostly played')+'; a fuller played set settles the ordering. '+label(sc)+gameNote(sc)+'.'; }, template.fillout);
    // ---- QUICK WIN
    const qw = played.filter(sc=>!sc.maxed && sc.toNext>=0.7 && !chosen.has(sc.name)).sort((a,b)=> b.playlists - a.playlists || b.toNext - a.toNext);
    take(qw, 'quickwin', sc=>'Quick win — '+Math.round(sc.toNext*100)+'% of the way to the next tier across '+sc.playlists+' playlist'+(sc.playlists===1?'':'s')+'.', template.quickwin);
    // ---- REVISIT: the v0.3 pool (> 14 days away, not maxed, rung <= level).
    // Candidates with a forecast (a neighbour or bridged label actually moved
    // since the visit) come first by first-try PB odds; the rest keep v0.3's
    // longest-unplayed order -- with no movement anywhere the two are the same list.
    const helpers = { labelsOf, sameSkill, noSkillLabel, historySince: opts.historySince };
    const rev = played.filter(sc=>sc.att && sc.att.lastT>0 && (opts.now - sc.att.lastT) > 14*86400000 && !sc.maxed && sc.rung<=level && !chosen.has(sc.name)).sort((a,b)=> a.att.lastT - b.att.lastT);
    rev.forEach(sc=>{ sc._forecast = revisitForecast(sc, byName, Object.keys(bridges).length ? bridges : null, Object.keys(bridges).length ? byLabelMap() : null, helpers); });
    const revOrdered = rev.filter(sc=>sc._forecast).sort((a,b)=> b._forecast.p - a._forecast.p || a.att.lastT - b.att.lastT).concat(rev.filter(sc=>!sc._forecast));
    // The bucket, never the percentage. p comes from a logistic with an INVENTED
    // slope (FORECAST_SLOPE) over an invented prior margin, so "83%" reads as a
    // measured probability sitting next to real percentiles when it is nothing of
    // the kind -- a score that looks more principled than it is. The measured
    // quantities (how far the co-varying scenarios moved, over how many, at what r,
    // against your own gap to the PB) are all printed; p is still logged per item
    // so the return-collect record can calibrate it, and the percentage comes back
    // the day predicted and collected can be compared (2026-08-24).
    const oddsWord = forecastBucket;
    take(revOrdered, 'revisit', sc=>{ const f = sc._forecast; const days = Math.round((opts.now - sc.att.lastT)/86400000);
      if(!f) return 'Revisit — last played '+days+' days ago; go collect the PB (if it falls first try, the time away did the work).';
      const rs = f.evidence.map(e=>e.r); const rTxt = rs.length>1 ? Math.min(...rs).toFixed(1)+'–'+Math.max(...rs).toFixed(1) : rs[0].toFixed(2);
      const moved = f.evidence.filter(e=>e.delta>0).length, nbs = f.evidence.filter(e=>!e.via).length, lbs = f.evidence.length - nbs;
      const what = (nbs ? nbs+' co-varying '+(nbs===1 ? 'scenario' : 'scenarios') : '')+(nbs && lbs ? ' and ' : '')+(lbs ? lbs+' bridged '+(lbs===1 ? 'label' : 'labels') : '');
      return 'Revisit — last played '+days+' days ago; since then '+what+' you touched moved '+(f.gain>=0?'+':'')+(f.gain*100).toFixed(0)+' pts on average ('+moved+' of '+f.evidence.length+' moved; r '+rTxt+') against a '+(f.margin*100).toFixed(0)+'-pt gap to your PB — first-try PB odds: '+oddsWord(f.p)+' (uncalibrated: the bucket comes from an assumed curve, not from your record yet)'+(f.synced ? '; sync-dated evidence' : '')+'.'; }, template.revisit);
    // ---- top up: more of the weakest list, then unplayed at/under level
    take(weakPool, 'weakest', weakReasonB, opts.size-items.length);
    if(items.length<opts.size) take(gameFirst(shuffle(rated.filter(sc=>!sc.played && sc.rung<=level))), 'fillout', sc=>'Unplayed at '+label(sc)+' — fills out the picture'+gameNote(sc)+'.', opts.size-items.length);
    rev.forEach(sc=>{ delete sc._forecast; });
    return { regime: 'normal', level, popLevel, weakLabels, confidence: opts.confidence||null, template, items, blocks: blocks ? blockStats : null,
      calibrated, mapped: scenarios.mapped||0, curved: scenarios.curved||0 };
  }

  // ---- Overlap page: the population map, recomputed from scenario pairs -------
  // (2026-08-22, DESIGN_INTENT D12 reading: a statistic on categories is allowed
  // when it can be recomputed from scenarios -- here it is, in the page.)
  // All pure. Inputs are data/transfer.json's shapes: a `pairs` block
  // {minShared, names:[...], e:[ai, bi, r100, n, ...]} (every tested pair at
  // n >= minShared, r100 = round(r*100), ai < bi) and/or the legacy per-scenario
  // lists name -> [[neighbour, r, n], ...] (top k positive + up to kNeg negative
  // at |r| >= minR, the session's input).
  // ±band on one Pearson r at n shared players: 1.96/sqrt(n-3), the width of a
  // 95% interval in Fisher-z space read straight off as r -- an approximation
  // (exact only near r = 0, narrower at large |r|), used as a claim-strength
  // floor, never as a test. n = 100 -> ±0.20, 400 -> ±0.10, 1,800 -> ±0.046.
  function rBand(n){ return 1.96/Math.sqrt(Math.max((Number(n)||0)-3, 1)); }
  const TRANSFER_META_KEYS = ['meta', 'labels', 'pairs', 'clusters'];
  // The adjacency index over the shipped pairs. source 'pairs' when the pairs
  // block exists (every tested pair, both directions decoded once); 'legacy'
  // when only the per-scenario lists exist -- then edges(name) is exactly that
  // scenario's shipped list (directed: A may list B while B's list, full of
  // stronger pairs, omits A) and forEachPair visits each unordered pair once;
  // 'none' without either. minShared = the floor the data holds (pairs.minShared,
  // else meta.minShared, else 100): a page control must never go under it.
  function buildOverlapIndex(transfer){
    const adj = new Map();
    const edge = (a, b, r, n) => { if(!adj.has(a)) adj.set(a, []); adj.get(a).push({ name: b, r, n }); };
    let source = 'none', minShared = 100, names = [];
    const p = transfer && transfer.pairs;
    const pairList = [];   // [a, b, r, n] unordered, each once
    if(p && Array.isArray(p.e) && Array.isArray(p.names) && p.e.length){
      source = 'pairs'; minShared = Number(p.minShared)>0 ? Number(p.minShared) : minShared;
      const nm = p.names, e = p.e;
      for(let i=0; i+3<e.length; i+=4){
        const a = nm[e[i]], b = nm[e[i+1]], r = e[i+2]/100, n = e[i+3];
        if(a===undefined || b===undefined) continue;
        edge(a, b, r, n); edge(b, a, r, n); pairList.push([a, b, r, n]);
      }
      names = nm.slice().sort();
    } else if(transfer && typeof transfer==='object'){
      const seen = new Set();
      Object.keys(transfer).forEach(k=>{
        if(TRANSFER_META_KEYS.includes(k) || !Array.isArray(transfer[k])) return;
        transfer[k].forEach(row=>{
          if(!Array.isArray(row) || typeof row[0]!=='string') return;
          const r = Number(row[1]), n = Number(row[2]);
          if(!Number.isFinite(r) || !Number.isFinite(n)) return;
          edge(k, row[0], r, n);
          const key = k < row[0] ? k+'\u0000'+row[0] : row[0]+'\u0000'+k;
          if(!seen.has(key)){ seen.add(key); pairList.push(k < row[0] ? [k, row[0], r, n] : [row[0], k, r, n]); }
        });
      });
      if(adj.size){ source = 'legacy'; names = [...adj.keys()].sort(); }
      const ms = transfer.meta && Number(transfer.meta.minShared); if(ms>0) minShared = ms;
    }
    return {
      source, minShared, names,
      has: name => adj.has(name),
      edges: name => adj.get(name) || [],
      degree: name => (adj.get(name) || []).length,
      forEachPair: fn => { for(const q of pairList) fn(q[0], q[1], q[2], q[3]); },
      pairCount: pairList.length
    };
  }
  // One scenario against everything it was tested with. Rows {name, r, n, band}.
  //   with        r >= minR, sorted by the LOWER edge (r - band) desc -- 0.60 at
  //               n = 100 (±0.20) ranks under 0.58 at n = 1,800 (±0.05);
  //   against     r <= -minR, by the upper edge (r + band) asc;
  //   weak        unrelatedR <= |r| < minR, by |r| desc;
  //   unrelated   |r| < unrelatedR AND |r| + band < minR (the band cannot reach
  //               the strong floor), by n desc; null on the legacy source, which
  //               holds no near-zero pair at all;
  //   inconclusive  count of |r| < unrelatedR rows whose band reaches minR --
  //               "too thin to call", never "unrelated".
  // tested = rows at n >= minN; complete = the source holds every tested pair.
  function overlapOf(name, index, opts){
    const o = Object.assign({ minN: 100, minR: 0.3, unrelatedR: 0.15 }, opts||{});
    const legacy = index.source!=='pairs';
    const rows = index.edges(name).filter(e=>e.n>=o.minN).map(e=>({ name: e.name, r: e.r, n: e.n, band: rBand(e.n) }));
    const withR = [], against = [], weak = [], unrelated = [];
    let inconclusive = 0;
    rows.forEach(row=>{
      const a = Math.abs(row.r);
      if(row.r >= o.minR) withR.push(row);
      else if(row.r <= -o.minR) against.push(row);
      else if(a >= o.unrelatedR) weak.push(row);
      else if(a + row.band < o.minR) unrelated.push(row);
      else inconclusive++;
    });
    withR.sort((x,y)=> (y.r-y.band)-(x.r-x.band) || y.n-x.n || (x.name<y.name?-1:x.name>y.name?1:0));
    against.sort((x,y)=> (x.r+x.band)-(y.r+y.band) || y.n-x.n || (x.name<y.name?-1:x.name>y.name?1:0));
    weak.sort((x,y)=> Math.abs(y.r)-Math.abs(x.r) || y.n-x.n || (x.name<y.name?-1:x.name>y.name?1:0));
    unrelated.sort((x,y)=> y.n-x.n || Math.abs(x.r)-Math.abs(y.r) || (x.name<y.name?-1:x.name>y.name?1:0));
    return { tested: rows.length, with: withR, against, weak, unrelated: legacy ? null : unrelated, inconclusive: legacy ? 0 : inconclusive, complete: !legacy };
  }
  // The group x group matrix (curator labels, folded labels, emergent clusters --
  // any groupsOf(name) -> [group id, ...]). A scenario pair (x, y) at n >= minN
  // contributes its r ONCE to every unordered cell {A, B} with A in groupsOf(x)
  // and B in groupsOf(y) -- dev/transfer-map.ps1's label-pair rule, except that a
  // pair whose two scenarios both carry both labels lands in cell {A, B} once,
  // not twice, so `tested` counts DISTINCT scenario pairs and pairs(a, b) lists
  // exactly the rows behind the cell (their mean is the cell's meanR -- the
  // falsifiability click). groups = [{id, size}] in evidence order (size desc,
  // id asc; size = scenarios in the index carrying the group, >= minSize).
  //   cell(a, b)    {meanR, tested, strongPos, strongNeg} | null (nothing tested)
  //   cohesion(id)  cell(id, id).meanR | null -- how much the group's own
  //                 scenarios move together
  //   overlap(a, b) meanR / sqrt(cohesion(a) * cohesion(b)) | null when either
  //                 cohesion < minCohesion (0.05: the ratio is unstable when a
  //                 group's own scenarios don't move together) or a cell is
  //                 missing -- the share of the skill inside A that A also
  //                 shares with B, and it cancels most of the sample-skew
  //                 shrinkage (which scales every r by about the same factor)
  //   pairs(a, b)   [{a, b, r, n}] behind the cell, lazily scanned, cached
  function groupMatrix(index, groupsOf, opts){
    const o = Object.assign({ minN: 100, strongR: 0.3, minSize: 1, minCohesion: 0.05 }, opts||{});
    const gid = x => String(x);
    const memberOf = new Map();   // name -> [ids]
    const sizes = new Map();
    index.names.forEach(name=>{
      const ids = [...new Set((groupsOf(name)||[]).map(gid))];
      memberOf.set(name, ids);
      ids.forEach(id=>sizes.set(id, (sizes.get(id)||0)+1));
    });
    const key = (a, b) => { a = gid(a); b = gid(b); return a<=b ? a+'\u0000'+b : b+'\u0000'+a; };
    const cells = new Map();
    const touch = (a, b, r) => {
      const k = key(a, b); let c = cells.get(k); if(!c){ c = { sum: 0, tested: 0, strongPos: 0, strongNeg: 0 }; cells.set(k, c); }
      c.sum += r; c.tested++; if(r >= o.strongR) c.strongPos++; else if(r <= -o.strongR) c.strongNeg++;
    };
    index.forEachPair((x, y, r, n)=>{
      if(n < o.minN) return;
      const gx = memberOf.get(x) || [], gy = memberOf.get(y) || [];
      if(!gx.length || !gy.length) return;
      const hit = new Set();
      gx.forEach(a=>gy.forEach(b=>hit.add(key(a, b))));
      hit.forEach(k=>{ const [a, b] = k.split('\u0000'); touch(a, b, r); });
    });
    const groups = [...sizes.entries()].filter(([, size])=>size>=o.minSize).map(([id, size])=>({ id, size }))
      .sort((a,b)=> b.size-a.size || (a.id<b.id?-1:a.id>b.id?1:0));
    const cell = (a, b) => { const c = cells.get(key(a, b)); return c ? { meanR: c.sum/c.tested, tested: c.tested, strongPos: c.strongPos, strongNeg: c.strongNeg } : null; };
    const cohesion = id => { const c = cell(id, id); return c ? c.meanR : null; };
    const overlap = (a, b) => {
      const c = cell(a, b), ca = cohesion(a), cb = cohesion(b);
      if(!c || ca===null || cb===null || ca < o.minCohesion || cb < o.minCohesion) return null;
      return c.meanR/Math.sqrt(ca*cb);
    };
    const pairCache = new Map();
    const pairs = (a, b) => {
      const k = key(a, b); if(pairCache.has(k)) return pairCache.get(k);
      const A = gid(a), B = gid(b); const out = [];
      index.forEachPair((x, y, r, n)=>{
        if(n < o.minN) return;
        const gx = memberOf.get(x) || [], gy = memberOf.get(y) || [];
        if((gx.includes(A) && gy.includes(B)) || (gx.includes(B) && gy.includes(A))) out.push({ a: x, b: y, r, n });
      });
      pairCache.set(k, out); return out;
    };
    return { groups, cell, cohesion, overlap, pairs, groupsOfName: name => (memberOf.get(name) || []).slice(), opts: o };
  }
  // The greedy "practise separately" set over a group matrix. Walk the groups
  // in `order` -- 'evidence' (size desc, id asc: a property of the map, the same
  // for every player) or 'weakness' (the caller's standing Map id -> {median, n},
  // median asc, unknown last) -- and keep a group when its cohesion >= minCohesion,
  // its own cell has >= minTested pairs, and its overlap with EVERY kept group is
  // under maxOverlap (positive overlap absorbs; negative overlap = a different
  // skill, kept apart). A group whose pair cell with a kept group holds < minTested
  // pairs is `thin` (the comparison can't be made -- never counted as independent);
  // one at or over the cut is absorbed (`skipped`, listed under the kept group's
  // coveredBy). Deterministic. opts.eligible(id) filters the candidates first.
  //   { kept: [{id, size, cohesion, tested, coveredBy: [{id, overlap}]}],
  //     incoherent: [{id, cohesion}], thin: [{id, tested, vs}], skipped: [{id, by, overlap}] }
  function independentGroups(matrix, opts){
    const o = Object.assign({ maxOverlap: 0.25, minCohesion: 0.10, minTested: 30, order: 'evidence', standing: null, eligible: null }, opts||{});
    let cands = matrix.groups.filter(g=>!o.eligible || o.eligible(g.id));
    if(o.order==='weakness'){
      const st = id => { const s = o.standing && (o.standing instanceof Map ? o.standing.get(id) : o.standing[id]); return s && s.median!==null && s.median!==undefined && Number.isFinite(Number(s.median)) ? Number(s.median) : null; };
      const idx = new Map(cands.map((g, i)=>[g.id, i]));
      cands = cands.slice().sort((a,b)=>{ const sa = st(a.id), sb = st(b.id); if(sa===null && sb===null) return idx.get(a.id)-idx.get(b.id); if(sa===null) return 1; if(sb===null) return -1; return sa-sb || idx.get(a.id)-idx.get(b.id); });
    }
    const kept = [], incoherent = [], thin = [], skipped = [];
    for(const g of cands){
      // an own cell with too few tested pairs cannot be judged at all -> thin (never
      // 'doesn't hold together'); only a measurable cell can be incoherent
      const own = matrix.cell(g.id, g.id);
      if(!own || own.tested < o.minTested){ thin.push({ id: g.id, tested: own ? own.tested : 0, vs: null }); continue; }
      const coh = matrix.cohesion(g.id);
      if(coh===null || coh < o.minCohesion){ incoherent.push({ id: g.id, cohesion: coh }); continue; }
      let verdict = null;
      for(const k of kept){
        const c = matrix.cell(g.id, k.id);
        if(!c || c.tested < o.minTested){ verdict = { thin: true, vs: k.id, tested: c ? c.tested : 0 }; break; }
        const ov = matrix.overlap(g.id, k.id);
        if(ov===null){ verdict = { thin: true, vs: k.id, tested: c.tested }; break; }
        // POSITIVE overlap at or over the cut absorbs; a NEGATIVE overlap is the
        // paradigm of a different skill (they move against each other), so it keeps
        // the group apart (2026-08-22 late: the first rule read |overlap| and
        // swallowed static/flick/micro into tracking because they move against it).
        if(ov >= o.maxOverlap){ verdict = { by: k, overlap: ov }; break; }
      }
      if(!verdict){ kept.push({ id: g.id, size: g.size, cohesion: coh, tested: own.tested, coveredBy: [] }); }
      else if(verdict.thin){ thin.push({ id: g.id, tested: verdict.tested, vs: verdict.vs }); }
      else { skipped.push({ id: g.id, by: verdict.by.id, overlap: verdict.overlap }); verdict.by.coveredBy.push({ id: g.id, overlap: verdict.overlap }); }
    }
    return { kept, incoherent, thin, skipped };
  }
  // Fold same-skill spellings: label -> fold key. Labels with a facet set fold
  // to the sorted facet join ("static click" and "static clicking" -> "clicking|static");
  // labels the vocabulary doesn't know (or marks as no-skill) stay themselves.
  function foldLabels(labels){
    const out = new Map();
    (labels||[]).forEach(l=>{ const s = labelFacetSet(l); out.set(l, s ? [...s].sort().join('|') : l); });
    return out;
  }
  // The session's shipped bridge table (data/transfer.json `labels`, "a|b" ->
  // [meanR, scenarioPairs]) as rows, meanR desc: within (a === b), sameSkill
  // (one skill spelled twice -- the session never routes through it), nonSkill
  // (an end the vocabulary marks as carrying no skill). Mean r over pairs that
  // individually passed |r| >= 0.3 at n >= 12 -- a pair missing here is NOT
  // evidence of independence; the matrix is.
  function bridgeRows(labels, opts){
    const o = Object.assign({ minPairs: 10 }, opts||{});
    const out = [];
    Object.keys(labels||{}).forEach(key=>{
      const v = labels[key]; if(!Array.isArray(v) || v.length<2) return;
      const meanR = Number(v[0]), pairs = Number(v[1]);
      if(!Number.isFinite(meanR) || !(pairs >= o.minPairs)) return;
      const i = key.indexOf('|'); if(i<0) return;
      const a = key.slice(0, i), b = key.slice(i+1);
      out.push({ a, b, meanR, pairs, within: a===b, sameSkill: a!==b && sameSkillLabels(a, b), nonSkill: noSkillLabel(a) || noSkillLabel(b) });
    });
    return out.sort((x,y)=> y.meanR-x.meanR || y.pairs-x.pairs || (x.a<y.a?-1:x.a>y.a?1:0) || (x.b<y.b?-1:x.b>y.b?1:0));
  }
  // The stamper's per-scenario rule (dev/stamp-population.ps1) in JS: rows at
  // n >= minN and |r| >= minR; the top k POSITIVE by r (ties by name, ordinal),
  // then up to kNeg NEGATIVE by r ascending (|r| desc, ties by name) appended.
  // Returns [[name, r, n], ...] -- the shape of the shipped lists. The shipped
  // lists were selected on 3-decimal r while the pairs block carries r100, so a
  // comparison must tolerate the rounding edge (see the toolkit's
  // test/template-integrity.js).
  function neighboursFromIndex(index, name, opts){
    const o = Object.assign({ k: 8, kNeg: 4, minR: 0.3, minN: index.minShared }, opts||{});
    const cmpName = (x, y) => x.name<y.name ? -1 : x.name>y.name ? 1 : 0;
    const rows = index.edges(name).filter(e=>e.n>=o.minN && Math.abs(e.r)>=o.minR);
    const pos = rows.filter(e=>e.r>0).sort((x,y)=> y.r-x.r || cmpName(x,y)).slice(0, o.k);
    const neg = rows.filter(e=>e.r<=0).sort((x,y)=> x.r-y.r || cmpName(x,y)).slice(0, o.kNeg);
    return pos.concat(neg).map(e=>[e.name, e.r, e.n]);
  }
  // groupsOf for the clusters block ({meta, scenario: {name: [id|null, loading,
  // stability, status]}, cluster: {id: {...}}}): name -> [String(id)] for
  // members; provisional / unstable rows join only with opts.includeProvisional /
  // opts.includeUnstable; unassigned (id null) and unknown names -> []. Status
  // strings as the stamper writes them: member, provisional, unstable, unassigned.
  // The returned function carries .statusOf(name) -> status | null and .ids.
  function clusterGroupsOf(clusters, opts){
    const o = Object.assign({ includeProvisional: false, includeUnstable: false }, opts||{});
    const sc = clusters && clusters.scenario && typeof clusters.scenario==='object' ? clusters.scenario : {};
    const ok = status => status==='member' || (status==='provisional' && o.includeProvisional) || (status==='unstable' && o.includeUnstable);
    const fn = name => { const row = sc[name]; if(!Array.isArray(row) || row[0]===null || row[0]===undefined) return []; return ok(String(row[3])) ? [String(row[0])] : []; };
    fn.statusOf = name => { const row = sc[name]; return Array.isArray(row) ? String(row[3]) : null; };
    fn.ids = Object.keys(clusters && clusters.cluster && typeof clusters.cluster==='object' ? clusters.cluster : {});
    return fn;
  }

  // ---- Difficulty attribute (redefined 2026-08-17/18, Owen's design) ---------
  // A NINE-rung scale, read as family × nudge:
  //     0 Easy-  1 Easy  2 Easy+ | 3 Intermediate-  4 Intermediate  5 Intermediate+ | 6 Hard-  7 Hard  8 Hard+
  // plus -1 = unrated. Not a continuous index on purpose: the inputs are curators'
  // words, name suffixes and one leaderboard percentile — nine ordered labels say
  // "about here" and can be defended rung by rung; a 0-100 number could not.
  //
  //   1. PLACEMENT — every playlist difficulty LABEL maps through DIFF_LABEL_VOCAB
  //      to a rung. Family from the word (Novice/Easy → Easy family, Medium/Main/
  //      Intermediate → Intermediate, Hard/Advanced → Hard), rung from its
  //      intensity: Newcomer/Entry/Level 1/Genesis sit below Easy (0); Expert/
  //      Elite/Boss+/Boss++/Ultimate/Demonic sit above Hard (8); Pre-Advanced is
  //      Intermediate+ (5); Deadman's Level 1..4/Boss/Boss+/Boss++ spread 0/2/4/6/
  //      7/8/8. Track/season labels ("All", "S1", "Static", "#2 Tracking") say
  //      nothing, and a label's POSITION in its ladder is deliberately not used
  //      (most unknown ladders are tracks, not levels). Median across the playlists
  //      carrying the scenario (even count → rounded mean of the middle two).
  //   2. NAME TIER WORDS pull one rung TOWARD their level: "VT Ground Novice S5 Hard"
  //      placed Easy (1) + "hard" (7) → Easy+ (2) — Owen: a bonus variant built to
  //      be harder than its base, still an easy-family scenario. The last tier word
  //      in the name is the one that acts (family word first, modifier last).
  //   3. NAME MODIFIERS (size/speed/mechanic words) push by direction × magnitude
  //      rungs and SUM: "Small & Slow" cancels, "20% Smaller & Faster" is +2. They
  //      are read only from the part of the name AFTER its base scenario (longest
  //      prefix that is itself a scenario in the dataset, via the caller's lookup)
  //      or, without a base, after the first tier word — "Close Fast Strafes Easy
  //      Invincible - Thin" reads only "Invincible - Thin", because Close/Fast are
  //      the scenario's name, not modifiers of it. Directions come from
  //      dev/modifier-survey.js (1,403 base+variant pairs, observed playlist-
  //      placement delta) cross-checked against KovaaK's leaderboards at the
  //      top-20% percentile (dev/kovaaks-modifier-check.ps1): bigger/slower/<100%
  //      = easier, smaller/thinner/faster/>100% = harder; magnitude 2 where the
  //      community ratio is strong.
  //   4. NO PLACEMENT: the name's own tier words anchor it (first word's rung, one
  //      rung toward the last); failing that a rated BASE scenario anchors it and
  //      the remainder's modifiers apply; failing that -1 (unrated).
  // classifyDifficulty(name, labels, lookupBase?) → label ('Hard+' … ''; '' = unrated)
  // difficultyRung(name, labels, lookupBase?) → 0..8 or -1
  // lookupBase(candidateName) → null if no such scenario, else its rung (-1 unrated)
  // DIFF_LABELS[rung]; difficultyFamily(label) → 'Easy'|'Intermediate'|'Hard'|''
  const DIFF_LABELS = ['Easy-', 'Easy', 'Easy+', 'Intermediate-', 'Intermediate', 'Intermediate+', 'Hard-', 'Hard', 'Hard+'];
  const DIFF_FAMILY_OF = ['Easy','Easy','Easy','Intermediate','Intermediate','Intermediate','Hard','Hard','Hard'];
  const DIFF_LABEL_VOCAB = [
    // phrases first (a phrase must win over a word it contains)
    ['pre-advanced', 5], ['beginner+', 2], ['boss++', 8], ['boss+', 8],
    ['level 1', 0], ['level 2', 2], ['level 3', 4], ['level 4', 6],
    ['newcomer', 0], ['entry', 0], ['genesis', 0], ['fundamentals', 1],
    ['easier', 1], ['easy', 1], ['novice', 1], ['beginner', 1], ['轻松', 1],
    ['intermediate', 4], ['medium', 4], ['normal', 4], ['main', 4], ['basic', 4], ['ascension', 4], ['中等', 4],
    ['hard', 7], ['advanced', 7], ['adv', 7], ['boss', 7], ['veteran', 7], ['enlightenment', 7], ['wallhack', 7], ['evil', 7], ['promax', 7], ['困难', 7],
    ['expert', 8], ['elite', 8], ['ultimate', 8], ['demonic', 8]
  ];
  // Tier words that may act inside a scenario NAME (a subset — label words that
  // also name mechanics or packs are left out: "static", "main", "basic", "boss"…).
  const DIFF_NAME_TIER_WORDS = new Set(['newcomer','entry','easier','easy','novice','beginner','intermediate','medium','advanced','adv','hard','expert','elite','level 1','level 2','level 3','level 4']);
  // Size / speed / mechanic modifiers in names: [phrase, rungs] (+ harder, − easier),
  // longer phrases first. Calibrated 2026-08-18 against KovaaK's leaderboards
  // (dev/kovaaks-modifier-check.ps1: variant ÷ base score at the top-20% rank,
  // 722 pairs, 0 failed requests): 2 rungs where the ratio was ≤0.75 or ≥1.35,
  // 1 rung otherwise; a word the community scored the same as its base is 0.
  //   harder: small 0.72 (10↑/2↓), thin 0.81 (8/0), extra small 0.76, xsmall 0.82,
  //           30% smaller 0.91 (8/0), 50% smaller 0.57, long 0.82 (10/0)
  //   easier: larger 1.26, massive 1.31, jumbo 1.25, big 1.19, large 1.18,
  //           30% larger 1.32, short 1.70 (11/0), static 1.13 (5/0), 90% 1.20, 80% (6↓/1↑)
  //   neutral by data: bare "smaller" 0.98 (11 same), slightly larger/smaller ~0.99,
  //           close 0.98; "harder" 1.00 on 4 pairs is kept +1 on the author's word only.
  //   ignored (different scoring, ratio meaningless): invincible N, micro, pure,
  //           goated, viscose, diamond, regen, reload.
  // Lone percentages are handled by regex below; "N% smaller/larger" by the word
  // (N ≥ 50 smaller → 2; N < 15 → nothing).
  const DIFF_NAME_MODIFIERS = [
    ['even smaller', 1], ['extra small', 1], ['xsmall', 1], ['x-small', 1], ['very thin', 2], ['extra thin', 2],
    ['slightly smaller', 0], ['slightly larger', 0], ['smaller', 0],
    ['small', 2], ['thin', 1], ['tiny', 1], ['faster', 1], ['harder', 1], ['long', 1],
    ['larger', -1], ['large', -1], ['bigger', -1], ['big', -1], ['jumbo', -1], ['massive', -1], ['huge', -1], ['giant', -1],
    ['slower', -1], ['slowed', -1], ['slow', -1], ['short', -2], ['static', -1], ['no ufo', -1], ['less blinks', -1]
  ];
  // Memoised: classifyDifficulty builds ~80 of these per call and runs over
  // every scenario on load; the table of vocab words is small and fixed.
  const _wordReCache = new Map();
  const wordRe = w => { let re = _wordReCache.get(w); if(!re){ re = new RegExp('(^|[^a-z0-9%])'+w.replace(/[-\s]/g,'[-\\s]?').replace(/\+/g,'\\+')+'(?=[^a-z0-9%]|$)'); _wordReCache.set(w, re); } return re; };
  function difficultyRungOfLabel(label){
    const t = String(label||'').toLowerCase().trim();
    if(!t) return -1;
    for(const [w, r] of DIFF_LABEL_VOCAB){
      if(/[a-z]/.test(w) ? wordRe(w).test(t) : t.includes(w)) return r;
    }
    return -1;
  }
  // Tier words in a name, in order of appearance: [{r, pos, end}]
  function difficultyNameTierWords(name){
    const t = String(name||'').toLowerCase();
    const found = [];
    for(const [w, r] of DIFF_LABEL_VOCAB){
      if(!DIFF_NAME_TIER_WORDS.has(w)) continue;
      const m = wordRe(w).exec(t);
      if(m) found.push({ r, pos: m.index + m[1].length, end: m.index + m[0].length });
    }
    const mi = wordRe('int').exec(t); if(mi) found.push({ r: 4, pos: mi.index + mi[1].length, end: mi.index + mi[0].length });   // Revosect "… Int"
    found.sort((a,b)=>a.pos-b.pos);
    return found;
  }
  // Net modifier push for a piece of name text, in rungs.
  function difficultyNameModifiers(text){
    let t = String(text||'').toLowerCase();
    let sum = 0;
    // "N% smaller|larger|…" — the word gives the direction, N the size:
    // smaller/thinner N≥50 → +2, N≥15 → +1 (30% smaller measured 0.91, 50% 0.57);
    // larger/bigger N≥15 → −1 (30% larger 1.32); slower −1 / faster +1; N<15 → nothing.
    // The bare words count the same way when a percent precedes them ("30% small"
    // measured 0.65 on KovaaK's, 2026-08-18 Finding 2 — the percent belongs to the
    // size word, it is not a lone scale): small/thin like smaller, large/big like
    // larger, slow like slower, fast like faster.
    t = t.replace(/(\d+)\s*%\s*(smaller|thinner|larger|bigger|slower|faster|small|thin|large|big|slow|fast)\b/g, (m, n, w)=>{
      const v = Number(n);
      if(w==='smaller' || w==='thinner' || w==='small' || w==='thin') sum += v>=50 ? 2 : v>=15 ? 1 : 0;
      else if(w==='larger' || w==='bigger' || w==='large' || w==='big') sum -= v>=15 ? 1 : 0;
      else if(w==='slower' || w==='slow') sum -= 1;
      else if(w==='faster' || w==='fast') sum += 1;
      return ' ';
    });
    // "N% size" (target scale) inverts the bare-percent rule below -- bigger
    // targets are easier: >=115 -> -1 (like "larger"); <=90 -> +1 (<=50 -> +2,
    // like "smaller"). Speed-style names still read through the bare rule.
    // (Remote-session finding 1, 2026-08-18: "6 Sphere Hipfire 200% Size" had
    // read +1 harder; ported here from the toolkit branch, which is the rule's
    // origin -- the build overwrites the toolkit's engine from this file.)
    t = t.replace(/(\d+)\s*%\s*size/g, (m, n)=>{ const v=Number(n); if(v>=115) sum -= 1; else if(v<=90) sum += v<=50 ? 2 : 1; return ' '; });
    // a lone "N%" (size or speed scale): ≤90 → easier (80% and 90% both measured
    // easier), ≥115 → harder (150%/200% 0.67 mean placement delta), else nothing
    t = t.replace(/(\d+)\s*%/g, (m, n)=>{ const v=Number(n); if(v<=90) sum -= 1; else if(v>=115) sum += 1; return ' '; });
    for(const [w, r] of DIFF_NAME_MODIFIERS){
      const re = wordRe(w);
      if(re.test(t)){ sum += r; t = t.replace(new RegExp(re.source, 'g'), ' '); }
    }
    return sum;
  }
  const clampRung = r => Math.max(0, Math.min(8, r));
  function towardRung(from, target){ return target>from ? from+1 : target<from ? from-1 : from; }
  function medianRung(rungs){
    const s = rungs.slice().sort((a,b)=>a-b);
    const n = s.length;
    if(!n) return -1;
    if(n%2) return s[(n-1)/2];
    return Math.round((s[n/2-1] + s[n/2]) / 2);
  }
  // Longest prefix of `name` (on word boundaries) that lookupBase knows as a scenario.
  function splitAtBase(name, lookupBase){
    if(typeof lookupBase!=='function') return null;
    const words = String(name||'').split(/\s+/);
    for(let k=words.length-1; k>=1; k--){
      const base = words.slice(0,k).join(' ');
      const r = lookupBase(base);
      if(r!==null && r!==undefined) return { base, baseRung: r, rest: words.slice(k).join(' ') };
    }
    return null;
  }
  function difficultyRung(name, difficulties, lookupBase){
    const placement = medianRung((difficulties||[]).map(difficultyRungOfLabel).filter(r=>r>=0));
    const tier = difficultyNameTierWords(name);
    const split = splitAtBase(name, lookupBase);
    // modifiers count only past the base, or past the first tier word, or (no anchor in the name) everywhere
    const modText = split ? split.rest : (tier.length ? String(name).slice(tier[0].end) : String(name||''));
    const mods = difficultyNameModifiers(modText);
    if(placement>=0){
      const r = tier.length ? towardRung(placement, tier[tier.length-1].r) : placement;
      return clampRung(r + mods);
    }
    if(tier.length){
      const r = tier.length===1 ? tier[0].r : towardRung(tier[0].r, tier[tier.length-1].r);
      return clampRung(r + mods);
    }
    if(split && split.baseRung>=0) return clampRung(split.baseRung + mods);
    return -1;
  }
  function classifyDifficulty(name, difficulties, lookupBase){
    const r = difficultyRung(name, difficulties, lookupBase);
    return r<0 ? '' : DIFF_LABELS[r];
  }
  function difficultyFamily(label){ const i = DIFF_LABELS.indexOf(label); return i<0 ? '' : DIFF_FAMILY_OF[i]; }
  function difficultyRungOfText(label){ return DIFF_LABELS.indexOf(label); }   // 'Hard+' → 8, '' → -1

  // ---- Skill facets (ratified 2026-08-18, Owen R1-R21) --------------------
  // The label-normalization vocabulary from docs/taxonomy-proposal-2026-08-18.md
  // (toolkit): every curator category / subcategory label maps to
  //   m   -> a mechanic: clicking | tracking | switching
  //   mod -> modifiers (static, dynamic, reactive, speed, precise, evasive,
  //          control, micro, smooth, reading, flick, timing, stability, strafe,
  //          blending, anti-movement, blink, hold, wide, ...)
  //   f   -> [facet, value] for env (air/ground), game (cs/val, tacfps, ow),
  //          weapon, region, axis, targets, special
  //   a   -> "nofacet" (curator/pack/section label, no skill meaning),
  //          "evict" (difficulty word -- the difficulty attribute owns it),
  //          "exclude" (not an aim scenario, e.g. a racing game in a scenario)
  // Per DESIGN_INTENT.md this is SCAFFOLDING for display and v1 sessions -- it
  // cleans curator strings into displayable facets and makes no truth claim
  // about skill structure (D12: that must emerge from taxonomy-blind analysis).
  // Rulings of note: flick = clicking modifier (R1); bare "static" = modifier
  // only (R3); movement/dodge = the player-WASD "strafe" modifier (R6/R7 --
  // may be promoted to a mechanic if the emergence analysis separates it);
  // transfer adds nothing (R9); hold = hold-fire on switching (R17); rush /
  // triad / multiform are formats (R18/R20/R21). Generated from
  // docs/taxonomy-vocab-ratified.json (toolkit) -- edit there, regenerate here.
  const FACET_VOCAB = {
  categories: {
    "(:": {"a":"nofacet"},
    "<:": {"a":"nofacet"},
    "1": {"a":"nofacet"},
    "2": {"a":"nofacet"},
    "3": {"a":"nofacet"},
    "4": {"a":"nofacet"},
    "advanced": {"a":"evict"},
    "air": {"f":["env","air"]},
    "angelic tac fps": {"f":["game","tacfps"]},
    "aoiaim": {"a":"nofacet"},
    "ar": {"f":["weapon","ar"]},
    "arm": {"f":["region","arm"]},
    "beginner": {"a":"evict"},
    "beginner+": {"a":"evict"},
    "blend": {"mod":["blending"]},
    "blink": {"mod":["blink"]},
    "bonus": {"a":"nofacet"},
    "bouncesphere": {"m":"tracking","mod":["bounce"]},
    "category": {"a":"nofacet"},
    "click": {"m":"clicking"},
    "click timing": {"m":"clicking","mod":["timing"]},
    "clicking": {"m":"clicking"},
    "control": {"mod":["control"]},
    "control and smooth tracking": {"m":"tracking","mod":["control","smooth"]},
    "control tracking": {"m":"tracking","mod":["control"]},
    "controlled": {"mod":["control"]},
    "correction": {"mod":["micro"]},
    "cs/val": {"f":["game","cs/val"]},
    "diagonal": {"f":["axis","diagonal"]},
    "dodge": {"mod":["strafe"]},
    "dynamic": {"mod":["dynamic"]},
    "dynamic click": {"m":"clicking","mod":["dynamic"]},
    "dynamic clicking": {"m":"clicking","mod":["dynamic"]},
    "easy": {"a":"evict"},
    "evasive switching": {"m":"switching","mod":["evasive"]},
    "flick": {"m":"clicking","mod":["flick"]},
    "flick tech": {"m":"clicking","mod":["flick"]},
    "flick-tech": {"m":"clicking","mod":["flick"]},
    "flicking": {"m":"clicking","mod":["flick"]},
    "flicks and click-timing": {"m":"clicking","mod":["flick","timing"]},
    "ground": {"f":["env","ground"]},
    "ground tracking": {"m":"tracking","f":["env","ground"]},
    "hard": {"a":"evict"},
    "henwood benchmarks": {"a":"nofacet"},
    "hold": {"m":"switching","mod":["hold"]},
    "horizontal": {"f":["axis","horizontal"]},
    "intermediate": {"a":"evict"},
    "large angles": {"mod":["wide"]},
    "linear radial smoothness": {"m":"tracking","mod":["smooth"]},
    "matty ow benchmark": {"f":["game","ow"]},
    "micro": {"mod":["micro"]},
    "micros": {"mod":["micro"]},
    "movement": {"mod":["strafe"]},
    "no aim": {"f":["special","no-aim"],"a":"exclude"},
    "normal": {"a":"evict"},
    "other": {"a":"nofacet"},
    "precise": {"mod":["precise"]},
    "precise tracking": {"m":"tracking","mod":["precise"]},
    "raw": {"mod":["raw"]},
    "raw smoothness": {"m":"tracking","mod":["smooth","raw"]},
    "reactive": {"mod":["reactive"]},
    "reactive and anti movement": {"mod":["reactive","anti-movement"]},
    "reactive tracking": {"m":"tracking","mod":["reactive"]},
    "reactivity": {"mod":["reactive"]},
    "reflex": {"mod":["reflex"]},
    "revamp": {"a":"nofacet"},
    "rush": {"m":"tracking"},
    "scenarios": {"a":"nofacet"},
    "shotgun": {"f":["weapon","shotgun"]},
    "smg": {"f":["weapon","smg"]},
    "smooth": {"mod":["smooth"]},
    "smoothness": {"m":"tracking","mod":["smooth"]},
    "specific": {"a":"nofacet"},
    "speed": {"mod":["speed"]},
    "speedts": {"m":"switching","mod":["speed"]},
    "stability": {"mod":["stability"]},
    "static": {"mod":["static"]},
    "static click": {"m":"clicking","mod":["static"]},
    "static clicking": {"m":"clicking","mod":["static"]},
    "strafe": {"mod":["strafe"]},
    "strafe and anti movement": {"mod":["strafe","anti-movement"]},
    "strafes": {"mod":["strafe"]},
    "strafing": {"mod":["strafe"]},
    "switch": {"m":"switching"},
    "switching": {"m":"switching"},
    "tap": {"m":"clicking"},
    "target switching": {"m":"switching"},
    "tempo": {"mod":["timing"]},
    "track": {"m":"tracking"},
    "tracking": {"m":"tracking"},
    "transfer": {"a":"nofacet"},
    "triad": {"a":"nofacet"},
    "ts": {"m":"switching"},
    "wrist": {"f":["region","wrist"]},
    "动态点击": {"m":"clicking","mod":["dynamic"]},
    "定位": {"mod":["static"]},
    "跟枪": {"m":"tracking"},
    "跟踪": {"m":"tracking"},
    "转火": {"m":"switching"}
  },
  subcategories: {
    "1": {"a":"nofacet"},
    "2": {"a":"nofacet"},
    "2 target": {"f":["targets","2"]},
    "3": {"a":"nofacet"},
    "3 target": {"f":["targets","3"]},
    "3x3": {"a":"nofacet"},
    "4 target": {"f":["targets","4"]},
    "5 target": {"f":["targets","5"]},
    "6 target": {"f":["targets","6"]},
    "air": {"f":["env","air"]},
    "arm": {"f":["region","arm"]},
    "blending": {"mod":["blending"]},
    "bounce": {"mod":["bounce"]},
    "centering": {"mod":["stability"]},
    "click": {"m":"clicking"},
    "clicking": {"m":"clicking"},
    "control": {"mod":["control"]},
    "ctrl": {"mod":["control"]},
    "devts": {"a":"nofacet"},
    "dodge": {"mod":["strafe"]},
    "dynamic": {"mod":["dynamic"]},
    "elusive": {"mod":["evasive"]},
    "entry": {"a":"evict"},
    "evasive": {"mod":["evasive"]},
    "fingertip": {"f":["region","fingertip"]},
    "flick": {"m":"clicking","mod":["flick"]},
    "fluidity": {"mod":["smooth"]},
    "ground": {"f":["env","ground"]},
    "horizontal": {"f":["axis","horizontal"]},
    "hybrid": {"mod":["hybrid"]},
    "linear": {"a":"nofacet"},
    "mass": {"a":"nofacet"},
    "micro": {"mod":["micro"]},
    "micro-dynamic": {"mod":["micro","dynamic"]},
    "micro-static": {"mod":["micro","static"]},
    "micro-tracking": {"m":"tracking","mod":["micro"]},
    "micros": {"mod":["micro"]},
    "mix": {"mod":["hybrid"]},
    "multiform": {"m":"clicking"},
    "patts": {"a":"nofacet"},
    "pokeball": {"a":"nofacet"},
    "precise": {"mod":["precise"]},
    "precision": {"mod":["precise"]},
    "predict": {"mod":["reading"]},
    "raw": {"mod":["raw"]},
    "react": {"mod":["reactive"]},
    "reaction": {"mod":["reflex"]},
    "reactive": {"mod":["reactive"]},
    "reactivity": {"mod":["reactive"]},
    "reading": {"mod":["reading"]},
    "reflex": {"mod":["reflex"]},
    "regen": {"a":"nofacet"},
    "smooth": {"mod":["smooth"]},
    "smoothness": {"mod":["smooth"]},
    "speed": {"mod":["speed"]},
    "sphere": {"a":"nofacet"},
    "sta": {"mod":["static"]},
    "stability": {"mod":["stability"]},
    "static": {"mod":["static"]},
    "strafe": {"mod":["strafe"]},
    "switch": {"m":"switching"},
    "switching": {"m":"switching"},
    "technique": {"a":"nofacet"},
    "thin": {"a":"nofacet"},
    "track": {"m":"tracking"},
    "tracking": {"m":"tracking"},
    "vertical": {"f":["axis","vertical"]},
    "voxts": {"a":"nofacet"},
    "wide": {"mod":["wide"]},
    "wide wall": {"a":"nofacet"},
    "wrist": {"f":["region","wrist"]},
    "xents": {"a":"nofacet"},
    "xyz": {"a":"nofacet"}
  }
};
  const FACET_MECHANICS = ['clicking', 'tracking', 'switching'];
  const facetNorm = s => String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
  function facetEntry(kind, label){
    const k = facetNorm(label);
    if(!k) return null;
    const map = kind==='category' ? FACET_VOCAB.categories : FACET_VOCAB.subcategories;
    if(Object.prototype.hasOwnProperty.call(map, k)) return map[k];
    return kind==='subcategory' ? { a: 'nofacet' } : null;   // one-off subcategories default to nofacet
  }
  // classifyFacets(pairs): pairs = [{category, subcategory}] -- one per playlist
  // group the scenario appears in (across all carrying playlists). Returns
  //   { mechanics: [...], modifiers: [...], other: {env:[...], game:[...], ...},
  //     exclude: bool, evidence: n }
  // Sets are unions across playlists (a curator placing a scenario under two
  // mechanics is a fact, not an error); a scenario with no mapped label at all
  // comes back empty (name evidence is a later proposal).
  function classifyFacets(pairs){
    const mech = new Set(), mods = new Set(), other = {};
    let exclude = false, evidence = 0;
    (pairs||[]).forEach(p=>{
      [['category', p && p.category], ['subcategory', p && p.subcategory]].forEach(([kind, label])=>{
        const e = facetEntry(kind, label);
        if(!e) return;
        evidence++;
        if(e.a==='exclude') exclude = true;
        if(e.m) mech.add(e.m);
        (e.mod||[]).forEach(m=>mods.add(m));
        if(Array.isArray(e.f) && e.f.length===2){ (other[e.f[0]] = other[e.f[0]] || new Set()).add(e.f[1]); }
      });
    });
    const o = {}; Object.keys(other).forEach(k=>{ o[k] = [...other[k]].sort(); });
    return { mechanics: FACET_MECHANICS.filter(m=>mech.has(m)), modifiers: [...mods].sort(), other: o, exclude, evidence };
  }
  // Flat display list, mechanic first: ["clicking", "static", "micro", "env:ground", ...]
  function facetChips(fx){
    if(!fx) return [];
    const out = fx.mechanics.slice().concat(fx.modifiers);
    Object.keys(fx.other).sort().forEach(k=>{ fx.other[k].forEach(v=>out.push(k+':'+v)); });
    if(fx.exclude) out.push('no-aim');
    return out;
  }
  return { stripSuffix, entryItems, convertV1Entry, isV1Entry, achievedIndex, preciseTier, scenarioCompletion, subcategoryGroups, subcategoryGroupsNamed, subcategoryBest, tierFrac, tierOf, categoryGroups, RANK_RULES, rankReqRule, benchmarkStanding, benchmarkVolts, standingLabel, pctLabel, hasSelection, selectionGroups, defaultSelection, selectionIssues, rankedItems, mergedProgress, classifyDifficulty, difficultyRung, difficultyFamily, difficultyRungOfText, DIFF_LABELS, classifyFacets, facetChips, FACET_MECHANICS, countScenarios, mergeAttempts, attemptSummary, ATTEMPT_KEEP, composeSession, skillProfile, percentileRank, percentileLabel, responsiveness, boardConfidence, profileConfidence, sessionTemplate, revisitForecast, forecastBucket, sessionHistoryStats, SESSION_TEMPLATES, GAME_FACETS_DEFAULT, RESP_MIN_RUNS,
    adjustPercentile, calibrateScenarios, METRIC_MIN_CURVED,
    // overlap page (2026-08-22): the session's label/route helpers at module scope + the pair-index layer
    normalizeLabel, labelFacetSet, sameSkillLabels, noSkillLabel, sessionLevel, isStuck, routeCheck,
    rBand, buildOverlapIndex, overlapOf, groupMatrix, independentGroups, foldLabels, bridgeRows, neighboursFromIndex, clusterGroupsOf };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MiniEvxlEngine;
