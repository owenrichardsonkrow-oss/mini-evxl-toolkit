// Skill-facet snapshot test (2026-08-18): the ratified label-normalization
// vocabulary (src/engine.js FACET_VOCAB, from docs/taxonomy-vocab-ratified.json,
// Owen's rulings R1-R21) applied to every scenario in the shipped template --
// each scenario's flat facet list ("clicking", "static", "env:ground", ...) is
// pinned in test/facets-snapshot.json. Same policy as the golden and the
// difficulty snapshot: regenerate deliberately (--write) after an INTENDED
// vocabulary or dataset change; label drift on an unchanged scenario set is a
// classifier regression to investigate.
//
//   node test/facets.js            # compare
//   node test/facets.js --write    # (maintainer) regenerate the snapshot
//
// Browser: test/harness.html runs it alongside golden + difficulty (the RESULT
// line nests it under "facets"); the personal repo's dev/run-tests.ps1 reads it.
(function(root){
  // Mirrors the app's computeShared/computeUnique facet calls (template.html):
  // classifyFacets over the {category, subcategory} of every group the
  // scenario appears in, across all playlists; facetChips flattens it.
  function compute(E, data){
    const byName = new Map();
    for(const b of data) for(const it of E.entryItems(b)){
      if(!byName.has(it.name)) byName.set(it.name, []);
      byName.get(it.name).push({ category: it.category, subcategory: it.subcategory });
    }
    const entries = {};
    for(const name of [...byName.keys()].sort()){
      entries[name] = E.facetChips(E.classifyFacets(byName.get(name))).join(' ');
    }
    return { entries };
  }
  // Rulings made executable (skipped when a refresh drops the scenario).
  const PROBES = {
    '1w3ts reload Larger': /\bclicking\b.*\bflick\b|\bflick\b/,   // R1: flick = clicking modifier
    'Super Hoover Cart Racers': /\bno-aim\b/,                    // R2: excluded from the aim profile
    'Ballsheet BB': /\bswitching\b.*\bhold\b|\bhold\b/,          // R17: hold-fire on switching
    'Rxzu - Multiform I EZ': /\bclicking\b/,                     // R21: clicking, staged format
    'Pistol Strafe Gallery Sparky': /\bstrafe\b/                 // R6: player-WASD -> strafe modifier
  };
  function compare(golden, actual){
    const problems = [];
    for(const k of Object.keys(golden.entries)){ if(!(k in actual.entries)) problems.push('missing scenario: '+k); }
    for(const k of Object.keys(actual.entries)){ if(!(k in golden.entries)) problems.push('new scenario (not in snapshot): '+k); }
    for(const k of Object.keys(golden.entries)){
      if(k in actual.entries && golden.entries[k] !== actual.entries[k])
        problems.push(k+': snapshot '+JSON.stringify(golden.entries[k])+' vs '+JSON.stringify(actual.entries[k]));
    }
    for(const [name, re] of Object.entries(PROBES)){
      if(name in actual.entries && !re.test(actual.entries[name]))
        problems.push('probe '+JSON.stringify(name)+': expected '+String(re)+' in '+JSON.stringify(actual.entries[name]));
    }
    return problems;
  }
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
      const snapPath = path.join(__dirname, 'facets-snapshot.json');
      const actual = compute(E, data);
      if (process.argv.includes('--write')) {
        fs.writeFileSync(snapPath, serialize(actual), 'utf8');
        console.log('wrote', snapPath, Object.keys(actual.entries).length, 'scenarios');
        process.exit(0);
      }
      const golden = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
      const problems = compare(golden, actual);
      const withMech = Object.values(actual.entries).filter(v=>/\b(clicking|tracking|switching)\b/.test(v)).length;
      console.log(`facets: ${Object.keys(actual.entries).length} scenarios (${withMech} with a mechanic); problems ${problems.length}`);
      if (problems.length) {
        problems.slice(0, 20).forEach(p => console.log('  ' + p));
        if (problems.some(p => p.startsWith('missing scenario:') || p.startsWith('new scenario')))
          console.log('  scenario set changed (structure refresh?) -- if intended, regenerate: node test/facets.js --write');
        process.exit(1);
      }
    }
  } else {
    root.__miniEvxlFacets = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
