// mini-evxl engine -- the pure part of the tracker: dataset parsing (v2 and the
// v1 importer), tier reading, evxl's rank rules, volts, pool selection, merged
// progress. No DOM, no storage, no fetch. build.ps1 inlines it into the page
// ahead of app.js; tests load it in Node:  const E = require('./src/engine.js').
// Every rule here is proven against evxl's own functions by dev/rank-diff-test.js.
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
  const wordRe = w => new RegExp('(^|[^a-z0-9%])'+w.replace(/[-\s]/g,'[-\\s]?').replace(/\+/g,'\\+')+'(?=[^a-z0-9%]|$)');
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
    t = t.replace(/(\d+)\s*%\s*(smaller|thinner|larger|bigger|slower|faster)/g, (m, n, w)=>{
      const v = Number(n);
      if(w==='smaller' || w==='thinner') sum += v>=50 ? 2 : v>=15 ? 1 : 0;
      else if(w==='larger' || w==='bigger') sum -= v>=15 ? 1 : 0;
      else if(w==='slower') sum -= 1;
      else if(w==='faster') sum += 1;
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
  return { stripSuffix, entryItems, convertV1Entry, isV1Entry, achievedIndex, preciseTier, scenarioCompletion, subcategoryGroups, subcategoryGroupsNamed, subcategoryBest, tierFrac, tierOf, categoryGroups, RANK_RULES, rankReqRule, benchmarkStanding, benchmarkVolts, standingLabel, pctLabel, hasSelection, selectionGroups, defaultSelection, selectionIssues, rankedItems, mergedProgress, classifyDifficulty, difficultyRung, difficultyFamily, difficultyRungOfText, DIFF_LABELS, classifyFacets, facetChips, FACET_MECHANICS, countScenarios };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MiniEvxlEngine;
