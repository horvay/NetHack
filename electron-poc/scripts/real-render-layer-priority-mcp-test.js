#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;
const scenarioId = 'render/layer-priority';
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function shot(cdp, name) {
  const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
let assertionOutcomes = null;
function assert(name, ok, detail = '') {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const outcome = { id, status: ok ? 'passed' : 'failed', details: ok ? '' : detail };
  const existing = assertionOutcomes?.find((entry) => entry.id === id);
  if (existing) Object.assign(existing, outcome); else assertionOutcomes?.push(outcome);
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}
async function state(cdp) { return evalExpr(cdp, `(() => ({ running: window.__nethackAutomation?.state?.().runningState?.running || false, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '', body: document.body.innerText }))()`); }
async function start(cdp) {
  await cdp.startDefaultGame({ timeoutMs: 25000, playerName: 'LayerTester' });
  await cdp.dismissIntroDialogs();
    await delay(500);
    await cdp.dismissIntroDialogs();
}
async function mapMetrics(cdp) { return evalExpr(cdp, `(() => {
  const summarize = (el) => {
    const layers = Array.from(el.querySelectorAll('.tile-layer')).map((layer) => ({ role: layer.className.match(/tile-layer-([a-z-]+)/)?.[1] || '', tileId: layer.dataset.tileId || '', label: layer.dataset.label || '', zIndex: getComputedStyle(layer).zIndex, backgroundImage: layer.style.backgroundImage || '', text: layer.textContent || '' }));
    const r = el.getBoundingClientRect();
    return { x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), glyph: el.dataset.glyph || el.textContent || '', className: el.className || '', layerOrder: el.dataset.layerOrder || '', tileId: el.dataset.tileId || '', objectTileId: el.dataset.objectTileId || '', semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '', objectLayerSemanticKind: el.dataset.objectLayerSemanticKind || '', objectLayerSemanticName: el.dataset.objectLayerSemanticName || '', aria: el.getAttribute('aria-label') || '', layers, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
  };
  const cells = Array.from(document.querySelectorAll('.tile-cell')).map(summarize);
  const hero = cells.find((c) => c.semanticKind === 'hero' || c.glyph === '@' || /hero|valkyrie/i.test(c.aria));
  const rel = (dx, dy) => hero ? cells.find((c) => c.x === hero.x + dx && c.y === hero.y + dy) || null : null;
  return { hero, westObject: rel(-1, 0), eastMonster: rel(1, 0), northFloor: rel(0, -1), body: document.body.innerText };
})()`); }
async function hoverCell(cdp, cell) { await evalExpr(cdp, `(() => { const el = document.querySelector('.tile-cell[data-map-x="${cell.x}"][data-map-y="${cell.y}"]'); if (!el) throw new Error('layer target cell missing'); el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })); })()`); await delay(150); }
async function tooltip(cdp) { return evalExpr(cdp, `(() => ({ hidden: document.getElementById('map-tooltip')?.hidden, title: document.getElementById('map-tooltip-title')?.textContent || '', description: document.getElementById('map-tooltip-description')?.textContent || '', contents: Array.from(document.querySelectorAll('#map-tooltip-contents li')).map((row) => ({ label: row.querySelector('.map-tooltip-content-label')?.textContent || '', kind: row.querySelector('.map-tooltip-content-kind')?.textContent || '' })), text: document.getElementById('map-tooltip')?.innerText || '' }))()`); }
async function showProofPanel(cdp, metrics) { return evalExpr(cdp, `((data) => {
  document.getElementById('map-tooltip').hidden = true;
  document.getElementById('layer-proof-panel')?.remove();
  const panel = document.createElement('section');
  panel.id = 'layer-proof-panel';
  panel.style.cssText = 'position:fixed;left:24px;top:108px;z-index:9999;background:#08090d;border:2px solid #f6d365;border-radius:14px;padding:14px;display:flex;gap:14px;align-items:flex-start;box-shadow:0 18px 40px rgba(0,0,0,.62);--tile-size:80px';
  const entries = [['Object on floor', data.westObject], ['Player over box', data.hero], ['Jackal over chest', data.eastMonster], ['Normal floor', data.northFloor]];
  for (const [label, cell] of entries) {
    const original = document.querySelector('.tile-cell[data-map-x="' + cell.x + '"][data-map-y="' + cell.y + '"]');
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;gap:8px;justify-items:center;color:#fff4c1;font:700 13px system-ui,sans-serif;max-width:110px;text-align:center';
    const clone = original.cloneNode(true);
    clone.classList.remove('adjacent-move-target', 'cursor');
    clone.style.width = '80px'; clone.style.height = '80px'; clone.style.outline = '1px solid rgba(255,255,255,.24)'; clone.style.outlineOffset = '0';
    const caption = document.createElement('div'); caption.textContent = label;
    wrap.append(clone, caption); panel.appendChild(wrap);
  }
  document.body.appendChild(panel);
  return true;
})(${JSON.stringify(metrics)})`); }

function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-render-layer-priority-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
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
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '515151', NETHACKOPTIONS: '!tutorial,!autopickup' },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  const outcomes = [];
  if (typeof assertionOutcomes !== 'undefined') assertionOutcomes = outcomes;
  let scenarioError = null;
  try {
    await start(cdp);
    const loaded = await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
    const metrics = await waitFor(async () => { const m = await mapMetrics(cdp); return m.hero?.layerOrder && m.westObject?.tileId && m.eastMonster?.layerOrder ? m : null; }, 10000).catch(async (error) => { fs.writeFileSync(path.join(outDir, 'layer-timeout-debug.json'), JSON.stringify(await mapMetrics(cdp).catch(() => ({})), null, 2)); await shot(cdp, 'debug-layer-timeout.png').catch(() => undefined); throw error; });
    assert('object on floor renders as object over terrain', /apple/i.test(`${metrics.westObject.tileId} ${metrics.westObject.semanticName} ${metrics.westObject.aria}`) && metrics.westObject.layerOrder === 'terrain<object' && /terrain-floor/.test(metrics.westObject.className), JSON.stringify(metrics.westObject));
    assert('player standing on container renders player above box above floor', metrics.hero.layerOrder === 'terrain<object<actor' && /large-box/.test(metrics.hero.objectTileId) && metrics.hero.layers.some((l) => l.role === 'object' && /large box/i.test(l.label)) && metrics.hero.layers.some((l) => l.role === 'actor'), JSON.stringify(metrics.hero));
    const heroObjectLayer = metrics.hero.layers.find((l) => l.role === 'object');
    const heroActorLayer = metrics.hero.layers.find((l) => l.role === 'actor');
    assert('player layer z-index is greater than object layer z-index', Number(heroActorLayer.zIndex) > Number(heroObjectLayer.zIndex), JSON.stringify(metrics.hero.layers));
    assert('monster sharing object renders monster above chest above floor', metrics.eastMonster.layerOrder === 'terrain<object<actor' && /jackal/i.test(`${metrics.eastMonster.semanticName} ${metrics.eastMonster.aria}`) && /chest/.test(metrics.eastMonster.objectTileId) && metrics.eastMonster.layers.some((l) => l.role === 'object' && /chest/i.test(l.label)), JSON.stringify(metrics.eastMonster));
    assert('adjacent terrain remains ordinary back layer', metrics.northFloor && /terrain-floor/.test(metrics.northFloor.className) && !metrics.northFloor.objectTileId && !metrics.northFloor.layers.length, JSON.stringify(metrics.northFloor));
    await hoverCell(cdp, metrics.hero);
    const heroTip = await tooltip(cdp);
    assert('hero tooltip lists actor, underlying box, every public pile item, and terrain', !heroTip.hidden && /hero|valkyrie/i.test(heroTip.title) && heroTip.contents.some((entry) => /large box/i.test(entry.label) && entry.kind === 'Object') && heroTip.contents.some((entry) => /weapon/i.test(entry.label) && entry.kind === 'Item') && heroTip.contents.some((entry) => /Floor|Stairs/.test(entry.kind)), JSON.stringify(heroTip));
    await hoverCell(cdp, metrics.eastMonster);
    const monsterTip = await tooltip(cdp);
    assert('monster tooltip lists monster, underlying chest, and terrain', !monsterTip.hidden && /jackal/i.test(monsterTip.title) && monsterTip.contents.some((entry) => /chest/i.test(entry.label) && entry.kind === 'Object') && monsterTip.contents.some((entry) => entry.kind === 'Floor'), JSON.stringify(monsterTip));
    const screenshot = await shot(cdp, '01-layer-priority-map.png');
    await showProofPanel(cdp, metrics);
    const proofScreenshot = await shot(cdp, '02-layer-priority-proof-panel.png');
    fs.writeFileSync(path.join(outDir, 'layer-priority-debug.json'), JSON.stringify({ ...metrics, heroTip, monsterTip }, null, 2));
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
  console.log(`real-render-layer-priority-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
