// Snapshot test for the nine-rung difficulty classifier (src/engine.js).
//
// Recomputes every scenario's difficulty label exactly the way the app does --
// the diff index first (per normalised name, placement labels from every
// carrying playlist, NO base lookup), then classifyDifficulty per raw name with
// diffLookupBase -- and compares the full name -> label map against
// test/difficulty-snapshot.json. The classifier is pure (dataset in, labels
// out; no scores), so unlike the golden standings there is no seeding: the
// snapshot pins the classifier AND the shipped dataset together, and any drift
// in either is a behaviour change to look at, not a refactor.
//
//   node test/difficulty.js            # compare against test/difficulty-snapshot.json (CI)
//   node test/difficulty.js --write    # (maintainer) regenerate after an INTENDED
//                                      # classifier or dataset change -- same policy
//                                      # as the golden file: deliberate, never casual.
(function(root){
  // Mirrors the app's getDiffIndex()/diffLookupBase and the Shared/Unique
  // pages' classifyDifficulty calls (template.html). If those call sites
  // change shape, change this mirror in the same commit.
  function compute(E, data){
    const diffNorm = s => String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
    const labels = new Map();
    for(const b of data) for(const it of E.entryItems(b)){
      const k = diffNorm(it.name);
      if(!labels.has(k)) labels.set(k, { name: it.name, diffs: [] });
      labels.get(k).diffs.push(b.difficulty);
    }
    const idx = new Map();
    labels.forEach((v, k)=>idx.set(k, E.difficultyRung(v.name, v.diffs)));
    const lookupBase = c => { const k = diffNorm(c); return idx.has(k) ? idx.get(k) : null; };
    const byName = new Map();
    for(const b of data) for(const it of E.entryItems(b)){
      if(!byName.has(it.name)) byName.set(it.name, []);
      byName.get(it.name).push(b.difficulty);
    }
    const entries = {};
    for(const name of [...byName.keys()].sort()){
      entries[name] = E.classifyDifficulty(name, byName.get(name), lookupBase);
    }
    return { entries };
  }
  // The documented examples from the engine's design comment, asserted by name
  // so the intent stays executable. Skipped when a weekly structure refresh
  // drops the scenario -- the snapshot still covers whatever ships.
  const PROBES = {
    'VT Ground Novice S5 Hard': 'Easy+',              // Easy placement pulled one rung toward "hard"
    'Close Fast Strafes Easy Invincible - Thin': 'Easy+', // modifiers read only past the base scenario
    'Thin Gauntlet V2': 'Hard+'                       // no placement of its own: anchors on its rated base
  };
  function compare(golden, actual){
    const problems = [];
    for(const k of Object.keys(golden.entries)){ if(!(k in actual.entries)) problems.push('missing scenario: '+k); }
    for(const k of Object.keys(actual.entries)){ if(!(k in golden.entries)) problems.push('new scenario (not in snapshot): '+k); }
    for(const k of Object.keys(golden.entries)){
      if(k in actual.entries && golden.entries[k] !== actual.entries[k])
        problems.push(k+': snapshot '+JSON.stringify(golden.entries[k])+' vs '+JSON.stringify(actual.entries[k]));
    }
    for(const [name, want] of Object.entries(PROBES)){
      if(name in actual.entries && actual.entries[name] !== want)
        problems.push('probe '+JSON.stringify(name)+': expected '+JSON.stringify(want)+' got '+JSON.stringify(actual.entries[name]));
    }
    return problems;
  }
  // One "name": "label" pair per line so a regeneration diff reads scenario by scenario.
  function serialize(result){
    const keys = Object.keys(result.entries);
    return '{"entries":{\n' + keys.map(k=>JSON.stringify(k)+':'+JSON.stringify(result.entries[k])).join(',\n') + '\n}}\n';
  }
  const api = { compute, compare, serialize, PROBES };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (require.main === module) {
      const fs = require('fs'), path = require('path');
      const rootDir = path.join(__dirname, '..');
      const E = require(path.join(rootDir, 'src', 'engine.js'));
      const { extractData } = require(path.join(__dirname, 'golden.js'));
      const data = extractData(fs.readFileSync(path.join(rootDir, 'template.html'), 'utf8'));
      const snapPath = path.join(__dirname, 'difficulty-snapshot.json');
      const actual = compute(E, data);
      if (process.argv.includes('--write')) {
        fs.writeFileSync(snapPath, serialize(actual), 'utf8');
        console.log('wrote', snapPath, Object.keys(actual.entries).length, 'scenarios');
        process.exit(0);
      }
      const golden = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
      const problems = compare(golden, actual);
      const rated = Object.values(actual.entries).filter(v=>v).length;
      console.log(`difficulty: ${Object.keys(actual.entries).length} scenarios (${rated} rated); problems ${problems.length}`);
      if (problems.length) { problems.slice(0, 20).forEach(p => console.log('  ' + p)); process.exit(1); }
    }
  } else {
    root.__miniEvxlDifficulty = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
