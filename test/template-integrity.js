// Template integrity guard: asserts the invariants of the SHIPPED template.html
// that the golden test cannot see. golden.js requires src/engine.js directly, so
// it would stay green even if the template's own script block failed to parse or
// carried a stale engine copy -- this test closes that gap. It is CI's
// belt-and-suspenders to build.ps1's own assertions (the build refuses to write
// a template with personal strings; this catches a hand-edited or stale file
// slipping into the repo anyway).
//
//   node test/template-integrity.js
//
// Checks: DOCTYPE/charset/viewport head (quirks-mode rule), every <script>
// block compiles (vm.Script -- parse only, nothing runs), the embedded engine
// is byte-identical to src/engine.js, the benchmarks-data block parses and is
// structure-only (scores-data === {}), the SITE identity block is generic with
// storePrefix "mini-evxl-template", esc() still escapes double quotes, the
// population-data block parses with the shapes the page destructures (labels
// entries are [meanR, pairs]; `pairs.e` rows are [ai, bi, r100, n] with ai < bi,
// indices inside `names`, r100 in -100..100, n >= minShared; `clusters.scenario`
// rows are [id|null, loading, stability, status]; `boards` values are positive
// integers), the shipped per-scenario transfer lists agree with the engine's
// own derivation from the pairs block (neighboursFromIndex, with the rounding
// tolerance explained at the check), and no personal identity string survives
// anywhere in the file.
const fs = require('fs'), path = require('path'), vm = require('vm');
const rootDir = path.join(__dirname, '..');
const norm = s => String(s).replace(/\r\n/g, '\n');
const html = norm(fs.readFileSync(path.join(rootDir, 'template.html'), 'utf8'));
const engine = norm(fs.readFileSync(path.join(rootDir, 'src', 'engine.js'), 'utf8'));

const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };

// ---- head: without these a double-clicked or Pages-hosted copy renders in quirks mode
check(html.startsWith('<!DOCTYPE html>'), 'first bytes are not <!DOCTYPE html>');
check(/<meta charset="utf-8">/i.test(html), 'missing <meta charset="utf-8">');
check(/<meta name="viewport"/i.test(html), 'missing viewport meta');

// ---- every script block parses; JSON blocks parse as JSON
const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
check(blocks.length >= 3, 'expected at least 3 <script> blocks, found ' + blocks.length);
let appBlock = null;
for (const [, attrs, body] of blocks) {
  if (/type="application\/json"/.test(attrs)) continue;
  try { new vm.Script(body); } catch (e) { check(false, 'script block does not parse: ' + e.message); }
  if (body.includes('const MiniEvxlEngine')) appBlock = body;
}
check(!!appBlock, 'no script block contains the engine (const MiniEvxlEngine)');

// ---- embedded engine must be the same bytes as src/engine.js (release drift guard)
if (appBlock) check(appBlock.includes(engine.trimEnd()),
  'embedded engine differs from src/engine.js -- template regenerated against a different engine, or one of the two was edited alone');

// ---- dataset: structure only, sane shape
const { extractData } = require(path.join(__dirname, 'golden.js'));
let data = null;
try { data = extractData(html); } catch (e) { check(false, 'benchmarks-data does not parse: ' + e.message); }
if (data) {
  check(Array.isArray(data) && data.length > 0, 'benchmarks-data is empty');
  for (const b of data) {
    if (!b || typeof b.name !== 'string' || !Array.isArray(b.groups)) { check(false, 'malformed entry: ' + JSON.stringify(b && b.name)); break; }
  }
}
const scores = html.match(/<script id="scores-data"[^>]*>([\s\S]*?)<\/script>/);
check(!!scores && scores[1].trim() === '{}', 'scores-data block is not the empty {} seed');
// attempts-data (since 2026-08-18): the owner's logged runs on the personal page; the template ships {}
const attempts = html.match(/<script id="attempts-data"[^>]*>([\s\S]*?)<\/script>/);
check(!attempts || attempts[1].trim() === '{}', 'attempts-data block is not the empty {} seed');
// population-data (since 2026-08-22): percentile curves + transfer neighbours -- population data,
// the same for every player, so the template ships it too; it must parse and have the two maps
const pop = html.match(/<script id="population-data"[^>]*>([\s\S]*?)<\/script>/);
if (pop) {
  try {
    const o = JSON.parse(pop[1].replace(/<\\\//g, '</'));
    check(o && typeof o === 'object' && typeof o.percentiles === 'object' && typeof o.transfer === 'object', 'population-data lacks percentiles/transfer objects');
    const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
    if (o && isObj(o.transfer)) {
      // labels: "a|b" -> [meanR, scenarioPairs] -- the shape the session destructures
      if (o.transfer.labels !== undefined) {
        check(isObj(o.transfer.labels), 'transfer.labels is not an object');
        if (isObj(o.transfer.labels)) {
          for (const [k, v] of Object.entries(o.transfer.labels)) {
            if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number' || !Number.isInteger(v[1])) { check(false, 'transfer.labels entry is not [meanR, pairs]: ' + k); break; }
          }
        }
      }
      // pairs (when the map kept every tested pair): {minShared, names, e:[ai, bi, r100, n, ...]}
      //
      // PERF-1 (step 16): the pair matrix ships in its OWN <script id="population-pairs">
      // element and is parsed on first use, because it is ~74% of the payload and nothing on
      // Home touches it. It is read from there when present, and the checks below are the same
      // ones -- a guard that quietly stopped running after a data-layout change would be worse
      // than no guard, and `if (pairs !== undefined)` would have done exactly that.
      const splitPairs = (() => {
        const m = html.match(/<script id="population-pairs"[^>]*>([\s\S]*?)<\/script>/);
        if (!m || !m[1].trim()) return undefined;
        try { return JSON.parse(m[1]); } catch (e) { check(false, 'population-pairs does not parse: ' + e.message); return undefined; }
      })();
      const pairsBlock = o.transfer.pairs !== undefined ? o.transfer.pairs : splitPairs;
      check(!(o.transfer.pairs !== undefined && splitPairs !== undefined), 'the pair matrix is present BOTH inline and as its own element -- one of them is stale');
      if (pairsBlock !== undefined) {
        const p = pairsBlock;
        check(isObj(p) && Array.isArray(p.names) && Array.isArray(p.e) && Number.isInteger(p.minShared) && p.minShared > 0, 'the pair matrix lacks minShared/names/e');
        if (isObj(p) && Array.isArray(p.names) && Array.isArray(p.e)) {
          check(p.e.length % 4 === 0, 'the pair matrix e length is not a multiple of 4: ' + p.e.length);
          check(p.names.every(n => typeof n === 'string'), 'the pair matrix names holds a non-string');
          let bad = null;
          for (let i = 0; i + 3 < p.e.length && !bad; i += 4) {
            const ai = p.e[i], bi = p.e[i + 1], r100 = p.e[i + 2], n = p.e[i + 3];
            if (!Number.isInteger(ai) || !Number.isInteger(bi) || ai < 0 || bi < 0 || ai >= p.names.length || bi >= p.names.length) bad = 'index outside names at row ' + (i / 4);
            else if (ai >= bi) bad = 'row ' + (i / 4) + ' is not ai < bi';
            else if (!Number.isInteger(r100) || r100 < -100 || r100 > 100) bad = 'r100 out of range at row ' + (i / 4);
            else if (!Number.isInteger(n) || n < p.minShared) bad = 'n under minShared at row ' + (i / 4);
          }
          check(!bad, 'transfer.pairs.e: ' + bad);
        }
      }
      // clusters (when the tracker stamped the D12 emergence freeze): {meta: {freeze: 64 hex, k >= 2}, scenario: {}, cluster: {}}
      if (o.transfer.clusters !== undefined) {
        const c = o.transfer.clusters;
        check(isObj(c) && isObj(c.meta) && isObj(c.scenario) && isObj(c.cluster), 'transfer.clusters lacks meta/scenario/cluster objects');
        if (isObj(c) && isObj(c.meta)) {
          check(typeof c.meta.freeze === 'string' && /^[0-9a-f]{64}$/.test(c.meta.freeze), 'transfer.clusters.meta.freeze is not a 64-hex hash');
          check(Number.isInteger(c.meta.k) && c.meta.k >= 2, 'transfer.clusters.meta.k is not an integer >= 2');
        }
        // scenario rows: [id|null, loading, stability, status] -- the shape clusterGroupsOf reads;
        // every non-null id names a cluster in `cluster` (keys are strings, ids may be numbers)
        if (isObj(c) && isObj(c.scenario) && isObj(c.cluster)) {
          let bad = null;
          for (const [name, row] of Object.entries(c.scenario)) {
            if (!Array.isArray(row) || row.length < 4) { bad = 'row is not [id, loading, stability, status]: ' + name; break; }
            if (row[0] !== null && !Object.prototype.hasOwnProperty.call(c.cluster, String(row[0]))) { bad = 'cluster id ' + row[0] + ' of ' + name + ' is not in clusters.cluster'; break; }
            if (typeof row[3] !== 'string') { bad = 'status is not a string: ' + name; break; }
          }
          check(!bad, 'transfer.clusters.scenario: ' + bad);
        }
      }
      // the shipped per-scenario lists vs the engine's derivation from the pairs block
      // (dev/stamp-population.ps1's rule == engine neighboursFromIndex). The two are
      // NOT byte-comparable: the stamper selects on the map's 3-decimal r while the
      // pairs block carries r100 = round(r*100), so a pair at r 0.295..0.2995 is under
      // the |r| >= 0.3 floor for the stamper and exactly AT it (0.30) for the engine,
      // and two pairs that differ at the third decimal can tie at r100 on the 8th/4th
      // slot. So: (1) every shipped row must be in the index with the same n and
      // round(r*100) within 1 of its r100 (the pair itself agrees); (2) the two lists
      // restricted to |r100| >= 31 -- clear of the floor's rounding edge -- must be
      // the same set of names, except for rows whose |r100| equals the smallest
      // |r100| of that sign in the shipped list (a tie at the slot boundary).
      if (o.transfer.pairs !== undefined && isObj(o.transfer.pairs) && Array.isArray(o.transfer.pairs.e)) {
        const E = require(path.join(rootDir, 'src', 'engine.js'));
        const meta = isObj(o.transfer.meta) ? o.transfer.meta : {};
        const index = E.buildOverlapIndex(o.transfer);
        const listNames = Object.keys(o.transfer).filter(k => !['meta', 'labels', 'pairs', 'clusters'].includes(k) && Array.isArray(o.transfer[k]));
        const step = Math.max(1, Math.floor(listNames.length / 20));
        const sample = listNames.filter((_, i) => i % step === 0).slice(0, 20);
        let bad = null, compared = 0;
        const r100Of = row => Math.round(Number(row[1]) * 100);
        for (const name of sample) {
          const shipped = o.transfer[name];
          const derived = E.neighboursFromIndex(index, name, { k: meta.k || 8, kNeg: meta.kNeg || 4, minR: meta.minR || 0.3 });
          const byName = new Map(index.edges(name).map(e => [e.name, e]));
          for (const row of shipped) {
            const e = byName.get(row[0]);
            if (!e) { bad = name + ': shipped neighbour ' + row[0] + ' is not in the pairs block'; break; }
            if (e.n !== row[2]) { bad = name + ' / ' + row[0] + ': n ' + row[2] + ' shipped vs ' + e.n + ' in the pairs block'; break; }
            if (Math.abs(Math.round(e.r * 100) - r100Of(row)) > 1) { bad = name + ' / ' + row[0] + ': r ' + row[1] + ' shipped vs r100 ' + Math.round(e.r * 100) + ' in the pairs block'; break; }
          }
          if (bad) break;
          const clear = rows => rows.filter(row => Math.abs(r100Of(row)) >= 31);
          const s = clear(shipped), d = clear(derived);
          const boundary = sign => { const v = s.filter(row => sign > 0 ? r100Of(row) > 0 : r100Of(row) < 0).map(row => Math.abs(r100Of(row))); return v.length ? Math.min(...v) : null; };
          const sNames = new Set(s.map(row => row[0])), dNames = new Set(d.map(row => row[0]));
          const differing = s.filter(row => !dNames.has(row[0])).concat(d.filter(row => !sNames.has(row[0])));
          const off = differing.find(row => Math.abs(r100Of(row)) !== boundary(r100Of(row) > 0 ? 1 : -1));
          if (off) { bad = name + ': shipped list and neighboursFromIndex disagree beyond the slot boundary at ' + off[0] + ' (r ' + off[1] + ', n ' + off[2] + ')'; break; }
          compared++;
        }
        check(!bad, 'transfer lists vs pairs block: ' + bad);
        check(compared === sample.length, 'transfer lists vs pairs block: compared ' + compared + ' of ' + sample.length + ' sampled scenarios');
      }
    }
    // boards (since the board-size stamp): scenario -> positive integer
    if (o && o.boards !== undefined) {
      check(isObj(o.boards), 'population-data boards is not an object');
      if (isObj(o.boards)) {
        for (const [k, v] of Object.entries(o.boards)) {
          if (!Number.isInteger(v) || v <= 0) { check(false, 'boards entry is not a positive integer: ' + k); break; }
        }
      }
    }
  } catch (e) { check(false, 'population-data does not parse: ' + e.message); }
}

// ---- SITE identity block: template build must have swapped in generic values
const site = html.match(/const SITE = \{([\s\S]*?)\};/);
check(!!site, 'SITE identity block not found');
if (site) {
  const s = site[1];
  check(/template:\s*true/.test(s), 'SITE.template is not true');
  check(/dev:\s*false/.test(s), 'SITE.dev is not false (dev builds are gitignored, never committed)');
  check(/storePrefix:\s*'mini-evxl-template'/.test(s), "SITE.storePrefix is not 'mini-evxl-template' (store isolation from personal builds on one origin)");
  for (const field of ['owner', 'defaultUsername', 'steamUrl', 'steamLabel', 'evxlProfileUrl']) {
    check(new RegExp(field + ":\\s*''").test(s), 'SITE.' + field + ' is not empty');
  }
}

// ---- esc() must keep escaping double quotes (attribute-injection rule)
check(html.includes('.replace(/"/g,\'&quot;\')'), "esc() no longer escapes '\"'");

// ---- personal strings: identity values must not survive the template build.
// (First-person design comments are fine; identities are not.)
// The tracker's build.ps1 carries the same list; this is the half that runs in CI against
// the released file, and it did not look for the owner's name at all until 2026-08-25
// (Review Ledger IV BUG-6) -- eleven source comments carried it into every build, because
// comments are embedded verbatim. A name in a denylist is not a leak; it is what lets the
// check fail. Write "the owner" in comments that ship.
// The repair table names another player's run history (step 37) -- like the scores block,
// the template ships it EMPTY.
{
  const m = html.match(/id="repairs-data"[^>]*>([^<]*)</);
  check(!!m, 'the repairs-data block is missing from the template');
  if (m) {
    let rep = null; try { rep = JSON.parse(m[1]); } catch (e) {}
    check(rep !== null && Object.keys(rep.quarantine || {}).length === 0,
      'the template must ship an EMPTY repair table -- it names run history that is not the user's');
  }
}
check(!/richardsonkrow|mayogobbler/i.test(html), 'personal identity string in template');
check(!/\bOwen\b/.test(html), "the owner's name survives in the template -- source comments ship verbatim, say \"the owner\" instead");
check(!/7656119\d{10}/.test(html), 'steam64 id in template');
// SECOND-PERSON CLAIMS ABOUT A RECORD THE VISITOR DOES NOT HAVE.
// A leak is not only a NAME. Step 22 put the owner's hazard measurement into the queue's
// P(not yet) tooltip in the second person -- "your own record does NOT match that null ...
// measured over 1,919 runs in 1,238 sittings, your personal bests arrive about 1.33x more
// often" -- and it shipped into the template, where the store is empty and every one of those
// figures belongs to somebody else. The denylist above cannot see it: there is no name in it.
//
// The rule this enforces: page copy may quote the owner's measurements, but in the template it
// must ATTRIBUTE them. So any second-person sentence carrying one of those figures has to sit
// inside an IS_TOOLKIT_TEMPLATE branch. Checked structurally rather than by rendering, because
// the branch is what makes the rendered text right.
// Narrow deliberately: the offence is a MEASURED FIGURE of the owner's asserted as the
// reader's, not the second person as such. The provenance ladder legitimately says
// "Measured on your own record" when DEFINING what the personal rung would mean, and a
// broad pattern flagged all four of those and this file's own explanatory comments too.
const secondPersonRecord = /your personal bests arrive|your own record does NOT match/gi;
let spm, spUnguarded = 0;
while ((spm = secondPersonRecord.exec(html)) !== null) {
  // the guarded form is a ternary on IS_TOOLKIT_TEMPLATE that CONTAINS this text
  const before = html.slice(Math.max(0, spm.index - 1200), spm.index);
  if (!/IS_TOOLKIT_TEMPLATE\s*$|IS_TOOLKIT_TEMPLATE[\s\S]{0,1200}$/.test(before)) spUnguarded++;
}
check(spUnguarded === 0,
  `${spUnguarded} second-person claim(s) about the visitor's own record are NOT inside an ` +
  'IS_TOOLKIT_TEMPLATE branch -- the template would state the owner-s measurement as a fact ' +
  'about a stranger whose store is empty');

const noPlaceholder = html.replace('https://steamcommunity.com/id/yourname/', '');
check(!/steamcommunity\.com\/(id|profiles)\//.test(noPlaceholder), 'non-placeholder steamcommunity URL in template');

console.log(`template-integrity: ${data ? data.length : '?'} entries; problems ${problems.length}`);
if (problems.length) { problems.forEach(p => console.log('  ' + p)); process.exit(1); }
