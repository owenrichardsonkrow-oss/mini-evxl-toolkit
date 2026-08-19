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
// storePrefix "mini-evxl-template", esc() still escapes double quotes, and no
// personal identity string survives anywhere in the file.
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
check(!/richardsonkrow|mayogobbler/i.test(html), 'personal identity string in template');
check(!/7656119\d{10}/.test(html), 'steam64 id in template');
const noPlaceholder = html.replace('https://steamcommunity.com/id/yourname/', '');
check(!/steamcommunity\.com\/(id|profiles)\//.test(noPlaceholder), 'non-placeholder steamcommunity URL in template');

console.log(`template-integrity: ${data ? data.length : '?'} entries; problems ${problems.length}`);
if (problems.length) { problems.forEach(p => console.log('  ' + p)); process.exit(1); }
