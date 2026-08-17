// Golden-standings regression test for the rank engine (src/engine.js).
//
// For every playlist in the dataset, throws N seeded random score vectors at
// the engine and records {modeTier, completeTier, volts}. The recorded answers
// (test/golden-standings.json) were produced by an engine that the maintainer's
// private differential test had just proven identical to evxl's own rank code
// (40 modes, thousands of vectors) -- so any change that moves a golden answer
// is a behaviour change to look at, not a refactor.
//
//   node test/golden.js            # compare against test/golden-standings.json (CI)
//   node test/golden.js --write    # (maintainer) regenerate the golden file
//
// The dataset is read out of template.html's benchmarks-data block, so this
// tests exactly what ships. Also runs in a browser (dev/test-harness.html in the
// personal repo) for machines without Node.
(function(root){
  function mulberry32(seed){ let s = seed>>>0; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function randomScore(rnd, tiers){
    const tv = tiers.map(x=>x[1]).filter(v=>v>0);
    if(!tv.length) return 0;
    const u = rnd();
    if(u < 0.2) return 0;
    if(u < 0.4) return Math.round(tv[0]*rnd()*100)/100;
    if(u < 0.8){ const i = Math.floor(rnd()*(tv.length-1)); const lo=tv[i], hi=tv[Math.min(i+1,tv.length-1)]; return Math.round((lo + rnd()*Math.max(hi-lo,1))*100)/100; }
    return Math.round((tv[tv.length-1]*(1+rnd()*0.4))*100)/100;
  }
  // Compute the golden table: { seed, vectors, entries: { "name||difficulty": [[modeTier, completeTier, volts], ...] } }
  function compute(E, data, opts){
    opts = Object.assign({ seed: 20260816, vectors: 12 }, opts||{});
    const rnd = mulberry32(opts.seed);
    const entries = {};
    for(const b of data){
      const base = E.entryItems(b);
      const rows = [];
      for(let v=0; v<opts.vectors; v++){
        const items = base.map(it=>Object.assign({}, it, { score: randomScore(rnd, it.tiers) }));
        // pool benchmarks: exercise the default selection (evxl's), the whole pool, and a fixed subset
        let ranked = items, standingOpts;
        if(E.hasSelection(b)){
          let set;
          if(v%3===0) set = E.defaultSelection(items, b);
          else if(v%3===1) set = new Set(items.map(it=>it.name));
          else set = new Set(items.filter((_,i)=>i%2===0).map(it=>it.name));
          items.forEach(it=>{ it.selected = set.has(it.name); });
          ranked = items; standingOpts = { pool: items };
        }
        const st = E.benchmarkStanding(ranked, b, standingOpts);
        rows.push([st.modeTier, st.completeTier, E.benchmarkVolts(ranked, b), Math.round(st.pct*1e6)/1e6]);
      }
      entries[b.name+'||'+b.difficulty] = rows;
    }
    return { seed: opts.seed, vectors: opts.vectors, entries };
  }
  function compare(golden, actual){
    const problems = [];
    const gk = Object.keys(golden.entries), ak = Object.keys(actual.entries);
    for(const k of gk){ if(!(k in actual.entries)) problems.push('missing entry: '+k); }
    for(const k of ak){ if(!(k in golden.entries)) problems.push('new entry (not in golden): '+k); }
    for(const k of gk){
      const g = golden.entries[k], a = actual.entries[k]; if(!a) continue;
      for(let i=0;i<Math.min(g.length,a.length);i++){ if(JSON.stringify(g[i])!==JSON.stringify(a[i])){ problems.push(k+' vector '+i+': golden '+JSON.stringify(g[i])+' vs '+JSON.stringify(a[i])); break; } }
    }
    return problems;
  }
  function extractData(html){
    const tag = '<script id="benchmarks-data" type="application/json">';
    const s = html.indexOf(tag); if(s<0) throw new Error('no benchmarks-data block');
    const e = html.indexOf('</script>', s+tag.length);
    return JSON.parse(html.slice(s+tag.length, e).replace(/<\\\//g, '</'));
  }
  const api = { compute, compare, extractData };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (require.main === module) {
      const fs = require('fs'), path = require('path');
      const root = path.join(__dirname, '..');
      const E = require(path.join(root, 'src', 'engine.js'));
      const data = extractData(fs.readFileSync(path.join(root, 'template.html'), 'utf8'));
      const goldenPath = path.join(__dirname, 'golden-standings.json');
      const write = process.argv.includes('--write');
      const actual = compute(E, data);
      if (write) { fs.writeFileSync(goldenPath, JSON.stringify(actual, null, 0).replace(/\],\[/g, '],\n['), 'utf8'); console.log('wrote', goldenPath, Object.keys(actual.entries).length, 'entries'); process.exit(0); }
      const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
      const problems = compare(golden, actual);
      console.log(`golden: ${Object.keys(golden.entries).length} entries × ${golden.vectors} vectors; actual ${Object.keys(actual.entries).length} entries; problems ${problems.length}`);
      if (problems.length) { problems.slice(0, 20).forEach(p => console.log('  ' + p)); process.exit(1); }
    }
  } else {
    root.__miniEvxlGolden = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
