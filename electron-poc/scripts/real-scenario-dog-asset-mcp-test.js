const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;
const scenarioId = 'pet/dog-asset-variants';
async function evaluate(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function screenshot(cdp, name) {
  const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}
async function primeScreenshotSurface(cdp) { await cdp.send('Page.bringToFront'); await delay(300); }
async function pointer(cdp, selector, click = false) { const point = await evaluate(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center',inline:'center'}); const r=el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!point) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y }); if (click) { await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 }); } await delay(250); }
async function click(cdp, selector) { return pointer(cdp, selector, true); }
async function state(cdp) { return evaluate(cdp, `(() => ({ running:Boolean(window.__nethackAutomation?.state?.().runningState?.running), dialogs:Array.from(document.querySelectorAll('dialog[open]')).map(d=>d.id), seen:document.getElementById('shim-output')?.dataset?.seen||'', shim:document.getElementById('shim-output')?.innerText||'' }))()`); }
async function start(cdp) {
  await cdp.startDefaultGame({ timeoutMs: 25000, playerName: 'BatchBProof' });
  await cdp.dismissIntroDialogs();
    await delay(500);
    await cdp.dismissIntroDialogs();
}
async function dogCells(cdp) { return evaluate(cdp, `(() => Array.from(document.querySelectorAll('.tile-cell')).filter(el => /dog/i.test([el.dataset.semanticName,el.getAttribute('aria-label')].join(' '))).map(el => ({x:Number(el.dataset.mapX),y:Number(el.dataset.mapY),tileId:el.dataset.tileId||'',glyph:el.dataset.glyph||'',glyphNumber:el.dataset.glyphNumber||'',semanticKind:el.dataset.semanticKind||'',semanticName:el.dataset.semanticName||'',aria:el.getAttribute('aria-label')||'',className:el.className||'',allyMarker:Boolean(el.querySelector('.tile-ally-marker'))})))()`); }
async function tooltip(cdp) { return evaluate(cdp, `(() => { const tip=document.getElementById('map-tooltip'), icon=document.getElementById('map-tooltip-icon'); return {hidden:Boolean(tip?.hidden),text:tip?.innerText||'',title:document.getElementById('map-tooltip-title')?.textContent||'',description:document.getElementById('map-tooltip-description')?.textContent||'',assetId:icon?.dataset.tileId||'',iconImage:icon?.style.backgroundImage||''}; })()`); }
let assertionOutcomes = null;
function assert(name, ok, detail = '') {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const outcome = { id, status: ok ? 'passed' : 'failed', details: ok ? '' : detail };
  const existing = assertionOutcomes?.find((entry) => entry.id === id);
  if (existing) Object.assign(existing, outcome); else assertionOutcomes?.push(outcome);
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-scenario-dog-asset-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
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
    await waitFor(async () => /bridge_test_scenario_loaded/.test(`${(await state(cdp)).seen}\n${(await state(cdp)).shim}`), 10000);
    const cells = await waitFor(async () => { const found = await dogCells(cdp); return found.length >= 4 ? found : null; });
    const bossDog = cells.find(cell => cell.semanticKind === 'pet' && cell.semanticName === 'dog');
    const tameLittleDog = cells.find(cell => cell.semanticKind === 'pet' && cell.semanticName === 'little dog');
    const hostileLittleDog = cells.find(cell => cell.semanticKind === 'monster' && cell.semanticName === 'little dog');
    const hostileLargeDog = cells.find(cell => cell.semanticKind === 'monster' && cell.semanticName === 'large dog');
    assert('real Boss dog glyph 1167 uses repaired adult dog art', bossDog?.tileId === 'dog' && bossDog.glyphNumber === '1167', JSON.stringify(cells));
    assert('real tame little dog uses dedicated pet art', tameLittleDog?.tileId === 'little-dog-pet', JSON.stringify(cells));
    assert('real hostile little dog keeps little-dog art', hostileLittleDog?.tileId === 'little-dog', JSON.stringify(cells));
    assert('real hostile large dog keeps large-dog art', hostileLargeDog?.tileId === 'large-dog', JSON.stringify(cells));
    assert('real tame dogs have ally markers', bossDog?.allyMarker === true && tameLittleDog?.allyMarker === true, JSON.stringify(cells));
    assert('real hostile dogs have no ally markers', hostileLittleDog?.allyMarker === false && hostileLargeDog?.allyMarker === false, JSON.stringify(cells));
    const mapShot = await screenshot(cdp, '01-real-all-dog-variants-map.png');
    await pointer(cdp, `.tile-cell[data-map-x="${bossDog.x}"][data-map-y="${bossDog.y}"]`);
    const bossTip = await tooltip(cdp); await delay(750); await primeScreenshotSurface(cdp); const bossShot = await screenshot(cdp, '02-real-boss-dog-glyph-1167-tooltip.png');
    assert('real Boss tooltip uses repaired canonical dog', !bossTip.hidden && bossTip.assetId === 'dog' && /Pet · Full source monsters · glyph 1167/.test(bossTip.description) && /full-source-monsters\/dog\.png/.test(bossTip.iconImage), JSON.stringify(bossTip));
    await pointer(cdp, `.tile-cell[data-map-x="${tameLittleDog.x}"][data-map-y="${tameLittleDog.y}"]`);
    const tameLittleTip = await tooltip(cdp); await delay(750); await primeScreenshotSurface(cdp); const tameLittleShot = await screenshot(cdp, '03-real-tame-little-dog-tooltip.png');
    assert('real tame little dog tooltip uses dedicated pet art', !tameLittleTip.hidden && tameLittleTip.assetId === 'little-dog-pet' && /Pet · Player, pets, and identity · glyph/.test(tameLittleTip.description), JSON.stringify(tameLittleTip));
    assert('real dog UI has no fallback/developer text', !/Name unavailable|Inventory selector|Program in disorder|Please report these messages/i.test(await evaluate(cdp, 'document.body.innerText')), 'unexpected visible fallback/error text');
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
  console.log(`real-scenario-dog-asset-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
