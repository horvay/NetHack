const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');



const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');
function reviewRun(outputDir, reviewFile) { const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json'); const approval = EvidenceApproval.openEvidenceApproval({ manifestFile }); EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile)); const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true }); if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(manifestFile); console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`); }
function createEvidence(page) { return Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') }); }
async function finishEvidence(page, qc, scenarioError) { await page.close().catch(() => {}); qc.recordAssertions([{ id: 'scenario-contract', status: scenarioError ? 'failed' : 'passed', details: scenarioError?.message || '' }]); qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' }); qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' }); const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false }); if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(qc.manifestFile); console.log(`${scriptName}: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`); if (scenarioError) throw scenarioError; }
let outDir, evidencePage, evidenceQc, scenarioError
const scenarioId = 'map/terrain-room-trap-water';





async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { return evidencePage.screenshotEvidence(evidenceQc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width: 1360, height: 920, devicePixelRatio: 1 }, state: path.basename(name, path.extname(name)) }); }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ running: window.__nethackAutomation?.state?.().runningState?.running || false, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '', body: document.body.innerText, messages: window.__nethackPromptTest?.messages?.().slice(-12).map((m) => m.text || String(m)) || [] }))()`); }
async function start(cdp) { if (await evalExpr(cdp, `Boolean(document.getElementById('startup-choice-dialog')?.open)`)) await click(cdp, '#startup-new-game'); else await click(cdp, '#start-shim'); await Harness.waitFor(async () => evalExpr(cdp, `Boolean(document.getElementById('character-dialog')?.open)`), 7000); await evalExpr(cdp, `(() => { const input = document.getElementById('player-name'); if (input && !input.value) { input.value = 'TerrainTester'; input.dispatchEvent(new Event('input', { bubbles: true })); } })()`); await click(cdp, '#confirm-character'); await Harness.waitFor(async () => (await state(cdp)).running, 20000); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); }
async function mapMetrics(cdp) { return evalExpr(cdp, `(() => {
  const summarize = (el) => ({
    x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), glyph: el.dataset.glyph || el.textContent || '', className: el.className || '',
    tileId: el.dataset.tileId || '', semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '',
    backgroundSemanticKind: el.dataset.backgroundSemanticKind || '', backgroundSemanticName: el.dataset.backgroundSemanticName || '',
    aria: el.getAttribute('aria-label') || '', text: el.textContent || ''
  });
  const cells = Array.from(document.querySelectorAll('.tile-cell')).map(summarize);
  const hero = cells.find((c) => c.semanticKind === 'hero' || c.semanticKind === 'player' || c.glyph === '@' || /Hero|Player|Valkyrie/i.test(c.aria));
  const aroundHero = hero ? cells.filter((c) => Math.abs(c.x - hero.x) <= 4 && Math.abs(c.y - hero.y) <= 3) : [];
  const rel = (dx, dy) => hero ? cells.find((c) => c.x === hero.x + dx && c.y === hero.y + dy) || null : null;
  const hay = (c) => [c?.glyph, c?.className, c?.tileId, c?.semanticKind, c?.semanticName, c?.backgroundSemanticKind, c?.backgroundSemanticName, c?.aria, c?.text].join(' ');
  const findAny = (pred) => aroundHero.find(pred) || cells.find(pred) || null;
  return {
    hero,
    expected: {
      westWall: rel(-3, 0), northWall: rel(0, -2), openDoor: rel(-1, 0), trap: rel(2, -1), water: rel(1, 0), lava: rel(0, 1), stairs: rel(1, 1), apple: rel(-2, 0)
    },
    found: {
      wall: findAny((c) => /terrain-wall|wall/i.test(hay(c)) && /[-|]/.test(c.glyph || c.text || c.aria)),
      openDoor: findAny((c) => /open.*door|door.*open|terrain-door-open|open-horizontal-door|open-vertical-door/i.test(hay(c)) || c.glyph === '/'),
      trap: findAny((c) => /trap|pit/i.test(hay(c)) || c.glyph === '^'),
      water: findAny((c) => /water|pool|moat/i.test(hay(c)) || /[}~]/.test(c.glyph || c.text || '')),
      lava: findAny((c) => /lava/i.test(hay(c)) || c.glyph === 'L'),
      stairs: findAny((c) => /up.*stair|stair.*up|up-stairs/i.test(hay(c))),
      apple: findAny((c) => /apple/i.test(hay(c)))
    },
    aroundHero,
    body: document.body.innerText,
    seen: document.getElementById('shim-output')?.dataset?.seen || '',
    shim: document.getElementById('shim-output')?.innerText || ''
  };
})()`); }

async function main() { if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]); scenarioError = null; ; ;
const page = await Harness.createElectronBrowserDriver({ root, width: 1360, height: 920, env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' } });
const cdp = (outDir = page.outputDir, evidencePage = page, evidenceQc = createEvidence(page), page.cdp) 
;
try { ;
await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
await Harness.waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
await start(cdp);
const loaded = await Harness.waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
const exactCellOk = (c, pattern) => c && pattern.test([c.glyph, c.className, c.tileId, c.semanticKind, c.semanticName, c.aria, c.text].join(' '));
const metrics = await Harness.waitFor(async () => {
  const m = await mapMetrics(cdp);
  return m.hero
    && exactCellOk(m.expected.westWall, /wall|terrain-wall/i)
    && exactCellOk(m.expected.northWall, /wall|terrain-wall/i)
    && exactCellOk(m.expected.openDoor, /open.*door|door.*open|terrain-door-open|open-horizontal-door|open-vertical-door/i)
    && exactCellOk(m.expected.trap, /trap|\^/i)
    && exactCellOk(m.expected.water, /water|pool|moat|[}~]/i)
    && exactCellOk(m.expected.lava, /lava|[}L]/i)
    && exactCellOk(m.expected.stairs, /up.*stair|stair.*up|up-stairs/i)
    && exactCellOk(m.expected.apple, /apple/i)
    ? m : null;
}, 10000).catch(async (error) => { const debug = await mapMetrics(cdp).catch(() => ({})); fs.writeFileSync(path.join(outDir, 'scenario-terrain-timeout-debug.json'), JSON.stringify(debug, null, 2)); await shot(cdp, 'debug-scenario-terrain-timeout.png').catch(() => undefined); throw error; });
const mapShot = await shot(cdp, '01-scenario-terrain-map.png');
const trapTooltip = await evalExpr(cdp, `window.__nethackTooltipTest.showFor(${metrics.expected.trap.x}, ${metrics.expected.trap.y})`);
const trapTooltipShot = await shot(cdp, '02-specific-trap-tooltip.png');
const evidenceText = JSON.stringify({ expected: metrics.expected, found: metrics.found }, null, 2);
assert('exact west wall cell is visible and labeled/semantic', exactCellOk(metrics.expected.westWall, /wall|terrain-wall/i), evidenceText);
assert('exact north wall cell is visible and labeled/semantic', exactCellOk(metrics.expected.northWall, /wall|terrain-wall/i), evidenceText);
assert('exact open door cell is visible and labeled/semantic', exactCellOk(metrics.expected.openDoor, /open.*door|door.*open|terrain-door-open|open-horizontal-door|open-vertical-door/i), evidenceText);
assert('exact trap cell is visible and labeled/semantic', exactCellOk(metrics.expected.trap, /trap|\^/i), evidenceText);
assert('trap tooltip identifies the specific public trap type instead of generic Trap', trapTooltip.title === 'Pit' && trapTooltip.assetId === 'pit' && trapTooltip.description === 'Trap', JSON.stringify({ cell: metrics.expected.trap, tooltip: trapTooltip }));
assert('exact water cell is visible and labeled/semantic', exactCellOk(metrics.expected.water, /water|pool|moat|[}~]/i), evidenceText);
assert('exact lava cell is visible and labeled/semantic', exactCellOk(metrics.expected.lava, /lava|[}L]/i), evidenceText);
assert('exact up-stairs cell is visible and labeled/semantic', exactCellOk(metrics.expected.stairs, /up.*stair|stair.*up|up-stairs/i), evidenceText);
assert('exact ground apple cell is visible as object label', exactCellOk(metrics.expected.apple, /apple/i), evidenceText);
assert('terrain map avoids fallback UI labels', !/Name unavailable|Inventory selector|Loading your inventory/i.test(metrics.body), metrics.body.slice(0, 1200));
fs.writeFileSync(path.join(outDir, 'terrain-map-debug.json'), JSON.stringify({ hero: metrics.hero, expected: metrics.expected, found: metrics.found, aroundHero: metrics.aroundHero }, null, 2));

;
; } catch (error) { scenarioError = error; } finally { await finishEvidence(page, evidenceQc, scenarioError); } }
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
