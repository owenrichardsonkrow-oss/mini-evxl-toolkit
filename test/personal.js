// Cross-language parity for the PERSONAL RETURN-EVENT rule (INTENT-4, step 14, 2026-08-26).
//
// `personalReturnEvents` / `personalTransfer` (src/engine.js) and `Get-PersonalReturnEvents`
// (the tracker's dev/population-lib.ps1) must decide the same events, hits and baselines from
// the same runs. They are two implementations of one rule serving two different consumers --
// the page's personal provenance rung, and the R5 analysis the ledger quotes -- so a drift
// between them puts a number on the page that the analysis behind it does not agree with.
//
// This is not hypothetical. Moving the rule into the lib CHANGED R5's answer, 303 return
// events to 302: the script's own copy never filtered non-positive scores, and the record
// holds five runs logged with a score of 0. Those are not runs. They were counting toward the
// PRIOR count, which lowers the 1/(prior+1) baseline, which flatters the result. The
// JavaScript had filtered them from the start, and nothing compared the two until this file.
//
// dev/personal-fixture.json is generated in the TRACKER repo from an independent third
// implementation, so a passing run is a three-way agreement rather than two copies agreeing
// with each other. It covers: the clean hit and the clean miss; a gap of EXACTLY the minimum
// (which is a return -- the rule is "at least", and a boundary both sides must read the same
// way); a gap just under it; a long total span with no single long gap; a record too short to
// have a prior; two events in one record where the first sets the bar for the second; several
// scenarios pooled, which is what the headline runs over; UNSORTED input, because the store
// hands runs over newest-first; and zero/negative scores, the case above.
//
// The fixture is copied to test/personal-fixture.json by build.ps1 -Template exactly as
// src/engine.js is, so CI -- which never sees the tracker -- checks the JS against the same
// bytes the PowerShell self-test checks itself against. A checkout without it SKIPS.
//
//   node test/personal.js
(function(root){
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;

  function run(E, fixture){
    const problems = [];
    const cases = Array.isArray(fixture && fixture.cases) ? fixture.cases : [];
    const minGap = Number(fixture && fixture.minGap) || 14;
    const minPrior = Number(fixture && fixture.minPrior);
    const opts = { minGap, minPrior: Number.isFinite(minPrior) ? minPrior : 2 };
    let checks = 0, maxDiff = 0;
    const near = (a, b, tol) => Math.abs(Number(a) - Number(b)) <= tol;

    cases.forEach(c => {
      const runs = new Map();
      Object.keys(c.runs || {}).forEach(k => runs.set(k, c.runs[k]));
      const got = E.personalReturnEvents(runs, opts);
      checks++;
      if(got.length !== c.count){
        problems.push(c.case + ': expected ' + c.count + ' return event(s), got ' + got.length);
        return;
      }
      // the fixture lists events sorted by (name, at); sort ours the same way before comparing,
      // because the iteration order over a record set is not part of the rule
      const mine = got.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.at - b.at));
      (c.events || []).forEach((want, i) => {
        const [wName, wAt, wPrior, wHit, wBase] = want;
        const g = mine[i];
        if(g.name !== wName) problems.push(c.case + ' event ' + i + ': expected scenario ' + wName + ', got ' + g.name);
        if(Number(g.at) !== Number(wAt)) problems.push(c.case + ' event ' + i + ': expected t ' + wAt + ', got ' + g.at);
        if(Number(g.prior) !== Number(wPrior)) problems.push(c.case + ' event ' + i + ': expected prior ' + wPrior + ', got ' + g.prior);
        if(Number(g.hit) !== Number(wHit)) problems.push(c.case + ' event ' + i + ': expected hit ' + wHit + ', got ' + g.hit);
        const d = Math.abs(Number(g.baseline) - Number(wBase));
        if(d > maxDiff) maxDiff = d;
        if(!near(g.baseline, wBase, 1e-9)) problems.push(c.case + ' event ' + i + ': expected baseline ' + wBase + ', got ' + g.baseline);
      });

      // and the aggregate, including the exact Poisson-binomial tail -- the piece most likely
      // to drift, because it is the only part with an algorithm rather than a comparison
      const agg = E.personalTransfer(runs, Object.assign({ boot: 200, seed: 1 }, opts));
      checks++;
      if(agg.events !== c.count) problems.push(c.case + ': personalTransfer counted ' + agg.events + ' events, personalReturnEvents ' + c.count);
      if(agg.collected !== c.collected) problems.push(c.case + ': expected ' + c.collected + ' collected, got ' + agg.collected);
      if(c.count){
        const de = Math.abs(Number(agg.expected) - Number(c.expected));
        if(de > maxDiff) maxDiff = de;
        if(!near(agg.expected, c.expected, 1e-9)) problems.push(c.case + ': expected sum-of-baselines ' + c.expected + ', got ' + agg.expected);
        const dp = Math.abs(Number(agg.pTail) - Number(c.pTail));
        if(dp > maxDiff) maxDiff = dp;
        if(!near(agg.pTail, c.pTail, 1e-9)) problems.push(c.case + ': expected Poisson-binomial tail ' + c.pTail + ', got ' + agg.pTail);
        // the interval must bracket the point estimate, whatever the resampling drew
        if(!(agg.ci[0] <= agg.excess + 1e-12 && agg.excess <= agg.ci[1] + 1e-12)) problems.push(c.case + ': the bootstrap interval ' + JSON.stringify(agg.ci) + ' does not contain the excess ' + agg.excess);
      } else {
        if(agg.pTail !== null) problems.push(c.case + ': with no events the tail must be null, got ' + agg.pTail);
        if(agg.enough) problems.push(c.case + ': with no events `enough` must be false');
      }
    });
    return { ok: problems.length === 0, problems, checks, maxDiff };
  }

  const api = { run };
  if(isNode){
    const fs = require('fs'), path = require('path');
    const E = require('../src/engine.js');
    const fixturePath = path.join(__dirname, 'personal-fixture.json');
    if(!fs.existsSync(fixturePath)){
      console.log('personal: SKIP (no test/personal-fixture.json -- run build.ps1 -Template)');
      process.exit(0);
    }
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const r = run(E, fixture);
    if(r.ok){ console.log('personal: ' + r.checks + ' checks OK (max |d| ' + r.maxDiff.toExponential(1) + ')'); process.exit(0); }
    console.error('personal: ' + r.problems.length + ' problem(s)');
    r.problems.slice(0, 20).forEach(p => console.error('  ' + p));
    process.exit(1);
  } else {
    root.__personalTest = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
