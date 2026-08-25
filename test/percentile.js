// Cross-language parity for the percentile rule (Review Ledger IV MET-1/MET-2, 2026-08-25).
//
// `percentileRank` (src/engine.js) and `Get-PctRank` (the tracker's dev/population-lib.ps1)
// compute the same number for the same inputs, or the page and the transfer map are ranking
// on different scales -- which is exactly the failure the tracker's CLAUDE.md warns about
// when it says the two "must move together". Nothing checked it until this file: the older
// guard in dev/emergence-selftest.ps1 compared two POWERSHELL copies of the rule with each
// other, which cannot catch a JS/PS divergence at all.
//
// dev/pctrank-fixture.json holds hand-chosen (curve, score) -> expected cases generated from
// an independent third implementation, so a passing run is a three-way agreement. It covers:
// the clean interior path, the tail extrapolation below the last anchor, the eight shipped
// curves whose lower anchors are NEGATIVE (the reason the score axis is not logged), tied
// anchors, a tail pair too close in score to define a slope, a share of exactly 1, a
// non-monotone curve, and the two reachable null paths.
//
// The fixture is generated in the TRACKER repo (beside the curves it is drawn from) and
// copied to test/pctrank-fixture.json by build.ps1 -Template, exactly as src/engine.js is --
// so CI, which never sees the tracker, checks the JS against the same bytes the PowerShell
// self-test checks itself against. A checkout without the fixture skips rather than fails.
//
//   node test/percentile.js
(function(root){
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;

  function run(E, fixture){
    const problems = [];
    const cases = Array.isArray(fixture && fixture.cases) ? fixture.cases : [];
    const tol = Number(fixture && fixture.tolerance) > 0 ? Number(fixture.tolerance) : 1e-9;
    if(!cases.length) return { ok: false, checks: 0, problems: ['fixture holds no cases'] };
    let maxDiff = 0;
    cases.forEach(c=>{
      const got = E.percentileRank(Number(c.score), c.curve);
      const want = (c.expect === null || c.expect === undefined) ? null : Number(c.expect);
      const where = c.label + ' @ ' + c.score;
      // An explicit null check, not a falsy one: 0 is a legitimate percentile and the whole
      // file's history is the Number(null) trap.
      if(want === null){
        if(got !== null && got !== undefined) problems.push(where + ': expected null, got ' + got);
        return;
      }
      if(got === null || got === undefined){ problems.push(where + ': expected ' + want + ', got null'); return; }
      if(!Number.isFinite(got)){ problems.push(where + ': expected ' + want + ', got ' + got); return; }
      const d = Math.abs(got - want);
      if(d > maxDiff) maxDiff = d;
      if(d > tol) problems.push(where + ': expected ' + want + ', got ' + got + ' (d ' + d.toExponential(1) + ')');
    });
    // Properties the fixture cannot pin case by case, asserted over every case's curve.
    cases.forEach(c=>{
      const pts = c.curve;
      if(!Array.isArray(pts) || pts.length < 2) return;
      const top = pts[0][1], last = pts[pts.length-1][1];
      let prev = null, span = Math.max(Math.abs(top), Math.abs(last), 1);
      for(let i=0;i<=200;i++){
        const s = last - span*0.5 + (top*1.2 - (last - span*0.5))*i/200;
        if(!(s > 0)) continue;
        const v = E.percentileRank(s, pts);
        if(v === null) continue;
        if(!(v >= 0 && v <= 1)){ problems.push(c.label + ': percentileRank left [0,1] at score ' + s + ' -> ' + v); break; }
        if(prev !== null && v < prev - 1e-12){ problems.push(c.label + ': percentileRank is not monotone at score ' + s); break; }
        prev = v;
      }
    });
    return { ok: problems.length === 0, checks: cases.length, maxDiff, problems };
  }

  const api = { run };
  if(isNode){
    const fs = require('fs'), path = require('path');
    const E = require('../src/engine.js');
    const fixturePath = path.join(__dirname, 'pctrank-fixture.json');
    if(!fs.existsSync(fixturePath)){
      console.log('percentile: SKIP (no test/pctrank-fixture.json -- run build.ps1 -Template)');
      process.exit(0);
    }
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const r = run(E, fixture);
    if(r.ok){ console.log('percentile: ' + r.checks + ' cases OK (max |d| ' + r.maxDiff.toExponential(1) + ')'); process.exit(0); }
    console.error('percentile: ' + r.problems.length + ' problem(s)');
    r.problems.slice(0, 20).forEach(p=>console.error('  ' + p));
    process.exit(1);
  } else {
    root.__percentileTest = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
