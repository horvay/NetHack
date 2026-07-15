const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;
const scenarioId = 'object/asset-tooltip-crude-dagger';
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function press(cdp, key, code, text) { const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0; const params = { key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }; if (text !== undefined) params.text = text; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }); }
async function shot(cdp, name) {
  const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}
let assertionOutcomes = null;
function assert(name, ok, detail = '') {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const outcome = { id, status: ok ? 'passed' : 'failed', details: ok ? '' : detail };
  const existing = assertionOutcomes?.find((entry) => entry.id === id);
  if (existing) Object.assign(existing, outcome); else assertionOutcomes?.push(outcome);
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}
async function start(cdp) {
  await cdp.startDefaultGame({ timeoutMs: 25000, playerName: 'BatchBProof' });
  await cdp.dismissIntroDialogs();
    await delay(500);
    await cdp.dismissIntroDialogs();
}
async function snapshot(cdp) { return evalExpr(cdp, `(() => {
  const summarize = (el) => ({
    x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), glyph: el.dataset.glyph || el.textContent || '', glyphNumber: el.dataset.glyphNumber || '', className: el.className || '', tileId: el.dataset.tileId || '', semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '', aria: el.getAttribute('aria-label') || '', text: el.textContent || '', rect: (() => { const r = el.getBoundingClientRect(); return { left:r.left, top:r.top, width:r.width, height:r.height, cx:r.left+r.width/2, cy:r.top+r.height/2 }; })()
  });
  const cells = Array.from(document.querySelectorAll('.tile-cell')).map(summarize);
  const hero = cells.find((c) => c.semanticKind === 'hero' || c.semanticKind === 'player' || c.glyph === '@' || /Hero|Player/i.test(c.aria));
  const rel = (dx, dy) => hero ? cells.find((c) => c.x === hero.x + dx && c.y === hero.y + dy) || null : null;
  const tip = document.getElementById('map-tooltip'); const icon = document.getElementById('map-tooltip-icon');
  return { hero, east: rel(1,0), tooltip: { hidden: Boolean(tip?.hidden), text: tip?.innerText || '', title: document.getElementById('map-tooltip-title')?.textContent || '', description: document.getElementById('map-tooltip-description')?.textContent || '', assetId: icon?.dataset.tileId || '', iconImage: icon?.style.backgroundImage || '', iconClass: icon?.className || '' }, dialog: window.__nethackPromptTest?.dialog?.(), body: document.body.innerText, seen: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '' };
})()`); }
async function hoverCell(cdp, cell) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cell.rect.cx, y: cell.rect.cy }); await delay(350); return snapshot(cdp); }

function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-scenario-crude-dagger-tooltip-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
function recordJsonSidecars(qc, outDir) {
  for (const name of fs.readdirSync(outDir)) {
    if (!name.endsWith('.json') || name === 'evidence-approval.json') continue;
    const file = path.join(outDir, name);
    if (!fs.statSync(file).isFile()) continue;
    qc.recordLog({ id: `sidecar-${name.replace(/[^a-z0-9._-]+/gi, '-')}`, path: file, classification: 'scenario-state' });
  }
}

async function main() {
  const page = await Harness.createElectronBrowserDriver({
    root, width, height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  const outcomes = [];
  if (typeof assertionOutcomes !== 'undefined') assertionOutcomes = outcomes;
  let scenarioError = null;
  try {
    await start(cdp);
    await waitFor(async () => { const s = await snapshot(cdp); if (/bridge_test_scenario_failed/.test(`${s.seen}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seen}\n${s.shim}`) && s.hero && s.east ? s : null; }, 15000);
    let snap = await snapshot(cdp);
    assert('east crude dagger cell is visible', /Crude Dagger/i.test(`${snap.east.aria} ${snap.east.semanticName}`) || snap.east.tileId === 'orcish-dagger', JSON.stringify(snap.east));
    const mapShot = await shot(cdp, '00-map-before-hover.png');
    const hoverSnap = await hoverCell(cdp, snap.east);
    const hoverShot = await shot(cdp, '01-crude-dagger-tooltip.png');
    assert('map cell uses crude dagger art not crossed weapon fallback', hoverSnap.east.tileId === 'orcish-dagger' && /orcish-dagger\.png/.test(`${hoverSnap.east.aria} ${hoverSnap.tooltip.iconImage}`) && !/weapon-class-icon/.test(`${hoverSnap.east.tileId} ${hoverSnap.tooltip.iconImage}`), JSON.stringify({ cell: hoverSnap.east, tooltip: hoverSnap.tooltip }));
    assert('tooltip title keeps public appearance and glyph metadata', hoverSnap.tooltip.title === 'Crude Dagger' && hoverSnap.tooltip.assetId === 'orcish-dagger' && /Objects and inventory items · glyph 3484 · map \d+,\d+/.test(hoverSnap.tooltip.description || '') && !/weapon-class-icon|Full source objects/.test(`${hoverSnap.tooltip.assetId} ${hoverSnap.tooltip.iconImage} ${hoverSnap.tooltip.description}`), JSON.stringify(hoverSnap.tooltip));
    assert('visible crude dagger text does not leak hidden orcish identity', !/orcish dagger/i.test(`${hoverSnap.east.aria} ${hoverSnap.tooltip.title} ${hoverSnap.tooltip.description} ${hoverSnap.tooltip.text}`), JSON.stringify({ cell: hoverSnap.east, tooltip: hoverSnap.tooltip }));
    
    await evalExpr(cdp, "document.getElementById('game-grid')?.focus?.(); window.__nethackPromptTest?.clearSentInputs?.();");
    await press(cdp, 'i', 'KeyI', 'i');
    const invSnap = await waitFor(async () => { const s = await snapshot(cdp); return /Equipment\s*\/\s*Inventory/i.test(s.dialog?.title || '') && /Crude Dagger/i.test(`${s.dialog?.panelControls?.text || ''}\n${(s.dialog?.options || []).map((o) => o.text || '').join('\n')}`) ? s : null; }, 10000);
    const inventoryShot = await shot(cdp, '02-crude-dagger-inventory.png');
    const iconEvidence = await evalExpr(cdp, `(() => Array.from(document.querySelectorAll('.menu-tile[data-tile-id]')).map((el) => ({ tileId: el.dataset.tileId || '', image: el.style.backgroundImage || '', row: el.closest('.option-row,.inventory-row,button')?.innerText || '' })).filter((entry) => /Crude Dagger/i.test(entry.row) || entry.tileId === 'orcish-dagger'))()`);
    assert('inventory row uses same crude dagger asset', iconEvidence.some((entry) => /Crude Dagger/i.test(entry.row) && entry.tileId === 'orcish-dagger' && /orcish-dagger\.png/.test(entry.image)), JSON.stringify(iconEvidence));
    assert('inventory visible crude dagger text does not leak hidden orcish identity', !iconEvidence.some((entry) => /orcish dagger/i.test(entry.row || '')) && !/orcish dagger/i.test(invSnap.body || ''), JSON.stringify(iconEvidence));
    assert('no crossed weapon fallback or developer labels visible', !/weapon-class-icon|Name unavailable|Inventory selector|Loading your inventory/i.test(`${invSnap.body}\n${JSON.stringify(iconEvidence)}`), invSnap.body.slice(0, 1200));
  } catch (error) {
    scenarioError = error;
  } finally {
    await page.close().catch((error) => { if (!scenarioError) scenarioError = error; });
  }
  outcomes.push({ id: 'scenario-completed', status: scenarioError ? 'failed' : 'passed', details: scenarioError ? String(scenarioError.message || scenarioError) : '' });
  qc.recordAssertions(outcomes);
  recordJsonSidecars(qc, outDir);
  qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  console.log(`real-scenario-crude-dagger-tooltip-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
