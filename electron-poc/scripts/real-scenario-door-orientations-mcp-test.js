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
const scenarioId = 'map/door-orientations';





async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { return evidencePage.screenshotEvidence(evidenceQc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width: 1360, height: 920, devicePixelRatio: 1 }, state: path.basename(name, path.extname(name)) }); }

async function state(cdp) { return evalExpr(cdp, `(() => ({ running: window.__nethackAutomation?.state?.().runningState?.running || false, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '', body: document.body.innerText }))()`); }

async function snapshot(cdp) { return evalExpr(cdp, `(() => {
  const summarize = (el) => ({ x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), glyph: el.dataset.glyph || el.textContent || '', glyphNumber: el.dataset.glyphNumber || '', className: el.className || '', tileId: el.dataset.tileId || '', semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '', aria: el.getAttribute('aria-label') || '', rect: (() => { const r = el.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2, width: r.width, height: r.height }; })() });
  const cells = Array.from(document.querySelectorAll('.tile-cell')).map(summarize);
  const hero = cells.find((c) => c.glyph === '@' || c.semanticKind === 'hero' || c.semanticKind === 'player');
  const at = (dx, dy) => hero ? cells.find((c) => c.x === hero.x + dx && c.y === hero.y + dy) || null : null;
  return { hero, doors: { horizontalClosed: at(-8, -3), horizontalOpen: at(0, -3), verticalOpen: at(4, -3), verticalClosed: at(8, -3), verticalDoorway: at(-4, -3), horizontalDoorway: at(0, -2) }, tooltip: { hidden: document.getElementById('map-tooltip')?.hidden, title: document.getElementById('map-tooltip-title')?.innerText || '', text: document.getElementById('map-tooltip')?.innerText || '', iconClass: document.getElementById('map-tooltip-icon')?.className || '', assetId: document.getElementById('map-tooltip-icon')?.dataset.tileId || '', iconImage: document.getElementById('map-tooltip-icon')?.style.backgroundImage || '' }, body: document.body.innerText };
})()`); }
async function hoverCell(cdp, cell) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cell.rect.x, y: cell.rect.y }); await Harness.delay(250); return snapshot(cdp); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
function hay(c) { return [c?.glyph, c?.glyphNumber, c?.className, c?.tileId, c?.semanticKind, c?.semanticName, c?.aria].join(' '); }

async function main() { if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]); scenarioError = null; ; ;
const page = await Harness.createElectronBrowserDriver({ root, width: 1360, height: 920, env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' } });
const cdp = (outDir = page.outputDir, evidencePage = page, evidenceQc = createEvidence(page), page.cdp) 
;
try { ;
await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
await page.startDefaultGame({ timeoutMs: 20000, playerName: 'DoorTester' });
await Harness.waitFor(async () => (await state(cdp)).running, 20000);
await Harness.delay(300);
await page.dismissIntroDialogs();
await Harness.waitFor(async () => evalExpr(cdp, `!document.getElementById('intro-dialog')?.open && !document.getElementById('document-dialog')?.open`), 5000);
const loaded = await Harness.waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
let snap = await Harness.waitFor(async () => { const s = await snapshot(cdp); return s.hero && Object.values(s.doors).every(Boolean) ? s : null; }, 10000);
const expected = {
  horizontalClosed: { title: 'Closed Door', tileId: 'closed-door', glyphNumber: '3989', icon: /door-in-horizontal-wall/, cell: /terrain-door.*door-in-horizontal-wall/ },
  verticalClosed: { title: 'Closed Door', tileId: 'closed-door', glyphNumber: '3988', icon: /door-in-vertical-wall/, cell: /terrain-door.*door-in-vertical-wall/ },
  horizontalOpen: { title: 'Open Door', tileId: 'open-horizontal-door', glyphNumber: '3987', icon: /terrain-door-open-horizontal|door-in-horizontal-wall/, cell: /terrain-door-open-horizontal/ },
  verticalOpen: { title: 'Open Door', tileId: 'open-vertical-door', glyphNumber: '3986', icon: /terrain-door-open-vertical|door-in-vertical-wall/, cell: /terrain-door-open-vertical/ },
  verticalDoorway: { title: 'Doorway', tileId: 'no-door-doorway', glyphNumber: '3985', icon: /terrain-doorway.*door-in-vertical-wall/, cell: /terrain-doorway.*door-in-vertical-wall/ },
  horizontalDoorway: { title: 'Doorway', tileId: 'no-door-doorway', glyphNumber: '3985', icon: /terrain-doorway.*door-in-horizontal-wall/, cell: /terrain-doorway.*door-in-horizontal-wall/ },
};
const screenshots = { map: await shot(cdp, '00-door-orientation-map.png') };
const hoverEvidence = {};
for (const [name, spec] of Object.entries(expected)) {
  const cell = snap.doors[name];
  assert(`${name} cell class/tile/glyph`, spec.cell.test(hay(cell)) && cell.tileId === spec.tileId && cell.glyphNumber === spec.glyphNumber, JSON.stringify(cell));
  const hovered = await hoverCell(cdp, cell);
  hoverEvidence[name] = { cell, tooltip: hovered.tooltip };
  assert(`${name} tooltip title/icon/tile`, hovered.tooltip.title === spec.title && hovered.tooltip.assetId === spec.tileId && spec.icon.test(hovered.tooltip.iconClass) && !hovered.tooltip.iconImage && (spec.tileId !== 'no-door-doorway' || !/terrain-door-open/.test(hovered.tooltip.iconClass)), JSON.stringify(hovered.tooltip));
  screenshots[name] = await shot(cdp, `tooltip-${name}.png`);
}
const result = { scenarioId, checks: Object.fromEntries(Object.keys(expected).map((k) => [k, true])), hero: snap.hero, doors: snap.doors, hoverEvidence, screenshots };
fs.writeFileSync(path.join(outDir, 'door-orientation-result.json'), JSON.stringify(result, null, 2));

;
; } catch (error) { scenarioError = error; } finally { await finishEvidence(page, evidenceQc, scenarioError); } }
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
