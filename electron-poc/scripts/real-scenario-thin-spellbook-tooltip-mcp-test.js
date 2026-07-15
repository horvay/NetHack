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
const scenarioId = 'object/asset-tooltip-thin-spellbook';





async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function shot(cdp, name) { return evidencePage.screenshotEvidence(evidenceQc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width: 1360, height: 920, devicePixelRatio: 1 }, state: path.basename(name, path.extname(name)) }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function start(cdp) { await click(cdp, '#start-shim'); await Harness.delay(250); await click(cdp, '#confirm-character'); await Harness.waitFor(async () => evalExpr(cdp, `window.__nethackAutomation?.state?.().runningState?.running || false`), 25000); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); }
async function snapshot(cdp) { return evalExpr(cdp, `(() => {
  const summarize = (el) => ({
    x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), glyph: el.dataset.glyph || el.textContent || '', glyphNumber: el.dataset.glyphNumber || '', className: el.className || '', tileId: el.dataset.tileId || '', semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '', aria: el.getAttribute('aria-label') || '', text: el.textContent || '', rect: (() => { const r = el.getBoundingClientRect(); return { left:r.left, top:r.top, width:r.width, height:r.height, cx:r.left+r.width/2, cy:r.top+r.height/2 }; })()
  });
  const cells = Array.from(document.querySelectorAll('.tile-cell')).map(summarize);
  const hero = cells.find((c) => c.semanticKind === 'hero' || c.semanticKind === 'player' || c.glyph === '@' || /Hero|Player|Valkyrie/i.test(c.aria));
  const rel = (dx, dy) => hero ? cells.find((c) => c.x === hero.x + dx && c.y === hero.y + dy) || null : null;
  const tip = document.getElementById('map-tooltip'); const icon = document.getElementById('map-tooltip-icon');
  return { hero, east: rel(1,0), tooltip: { hidden: Boolean(tip?.hidden), text: tip?.innerText || '', title: document.getElementById('map-tooltip-title')?.textContent || '', description: document.getElementById('map-tooltip-description')?.textContent || '', assetId: icon?.dataset.tileId || '', iconImage: icon?.style.backgroundImage || '', iconClass: icon?.className || '' }, body: document.body.innerText, seen: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '' };
})()`); }
async function hoverCell(cdp, cell) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cell.rect.cx, y: cell.rect.cy }); await Harness.delay(350); return snapshot(cdp); }

async function main() { if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]); scenarioError = null; ; ;
const page = await Harness.createElectronBrowserDriver({ root, width: 1360, height: 920, env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '40', NETHACKOPTIONS: '!tutorial,!autopickup' } });
const cdp = (outDir = page.outputDir, evidencePage = page, evidenceQc = createEvidence(page), page.cdp) 
;
try { ;
await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
await Harness.waitFor(async () => evalExpr(cdp, `document.readyState === 'complete' && !!window.__nethackPromptTest`), 10000);
await start(cdp);
await Harness.waitFor(async () => { const s = await snapshot(cdp); if (/bridge_test_scenario_failed/.test(`${s.seen}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seen}\n${s.shim}`) && s.hero && s.east ? s : null; }, 15000);
const snap = await snapshot(cdp);
assert('east thin spellbook cell is visible', /thin spellbook/i.test(`${snap.east.aria} ${snap.east.semanticName}`) && snap.east.tileId === 'spellbook-class-icon', JSON.stringify(snap.east));
assert('east thin spellbook cell is not closed-door CSS', !/terrain-door|closed-door/i.test(`${snap.east.className} ${snap.east.tileId} ${snap.east.aria}`), JSON.stringify(snap.east));
const mapShot = await shot(cdp, '00-map-before-hover.png');
const thinSnap = await hoverCell(cdp, snap.east);
const tooltipShot = await shot(cdp, '01-thin-spellbook-tooltip.png');
assert('thin spellbook tooltip uses public appearance title', thinSnap.tooltip.title === 'Thin Spellbook' && /Object/i.test(thinSnap.tooltip.description), JSON.stringify(thinSnap.tooltip));
assert('thin spellbook tooltip uses spellbook art, not closed-door or hidden spell art', thinSnap.tooltip.assetId === 'spellbook-class-icon' && /spellbook-class-icon\.png/.test(thinSnap.tooltip.iconImage || '') && !/closed-door|chain-lightning|jumping/.test(`${thinSnap.tooltip.iconImage} ${thinSnap.tooltip.assetId}`), JSON.stringify(thinSnap.tooltip));
assert('hidden true spell is not shown to player', !/chain lightning|jumping/i.test(`${thinSnap.east.aria} ${thinSnap.tooltip.text}`), JSON.stringify({ cell: thinSnap.east, tooltip: thinSnap.tooltip }));
assert('spellbook glyph does not advertise door actions', !/Open east door|Kick east door|Close east door/i.test(thinSnap.body), thinSnap.body.slice(0, 1600));
assert('no fallback/developer labels visible', !/Name unavailable|Inventory selector|Loading your inventory/i.test(thinSnap.body), thinSnap.body.slice(0, 1200));
const result = { scenarioId, seed: 40, screenshots: { map: mapShot, tooltip: tooltipShot }, cell: thinSnap.east, tooltip: thinSnap.tooltip };
fs.writeFileSync(path.join(outDir, 'thin-spellbook-tooltip-result.json'), JSON.stringify(result, null, 2));

;
; } catch (error) { scenarioError = error; } finally { await finishEvidence(page, evidenceQc, scenarioError); } }
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
