const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;
const scenarioId = 'monster/visible-jackal-east';
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function shot(cdp, name) {
  const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function hover(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y }); await delay(250); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ running: window.__nethackAutomation?.state?.().runningState?.running || false, dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id), seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '', body: document.body.innerText }))()`); }
async function start(cdp) {
  await cdp.startDefaultGame({ timeoutMs: 25000, playerName: 'BatchBProof' });
  await cdp.dismissIntroDialogs();
    await delay(500);
    await cdp.dismissIntroDialogs();
}
async function tooltipState(cdp) { return evalExpr(cdp, `(() => { const tip = document.getElementById('map-tooltip'); return { hidden: !tip || tip.hidden, text: tip?.innerText || '', iconImage: tip?.querySelector('.map-tooltip-icon')?.style?.backgroundImage || '', assetId: tip?.dataset?.assetId || '' }; })()`); }
async function mapMetrics(cdp) { return evalExpr(cdp, `(() => {
  const cells = Array.from(document.querySelectorAll('.tile-cell'));
  const summarize = (el) => ({
    x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), className: el.className || '',
    tileId: el.dataset.tileId || '', glyph: el.dataset.glyph || '', glyphNumber: el.dataset.glyphNumber || '', semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '',
    aria: el.getAttribute('aria-label') || '', text: el.textContent || ''
  });
  const monsters = cells.filter((el) => ['monster', 'pet'].includes(el.dataset.semanticKind)).map(summarize);
  const jackals = monsters.filter((c) => String(c.semanticName || c.tileId || '').toLowerCase() === 'jackal' || String(c.tileId || '').toLowerCase() === 'jackal');
  const dwarves = monsters.filter((c) => /dwarf/i.test([c.semanticName, c.aria, c.tileId].join(' ')));
  const werejackals = monsters.filter((c) => /werejackal/i.test([c.semanticName, c.aria, c.tileId].join(' ')));
  const kittens = monsters.filter((c) => /kitten|cat/i.test([c.semanticName, c.aria, c.tileId].join(' ')) || c.semanticKind === 'pet');
  const hero = cells.find((el) => el.dataset.semanticKind === 'hero' || el.dataset.semanticKind === 'player');
  return { monsters, jackals, dwarves, werejackals, kittens, hero: hero ? summarize(hero) : null, body: document.body.innerText, seen: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '' };
})()`); }
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
  console.log(`real-scenario-monster-map-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
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
    const loaded = await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
    const metrics = await waitFor(async () => { const m = await mapMetrics(cdp); return m.jackals.length && m.dwarves.length && m.werejackals.length && m.kittens.length ? m : null; }, 10000).catch(async (error) => { const debug = await mapMetrics(cdp).catch(() => ({})); fs.writeFileSync(path.join(outDir, 'scenario-monster-timeout-debug.json'), JSON.stringify(debug, null, 2)); await shot(cdp, 'debug-scenario-monster-timeout.png').catch(() => undefined); throw error; });
    const mapShot = await shot(cdp, '01-scenario-visible-monsters-map.png');
    assert('jackal monster rendered as player-facing monster cell', metrics.jackals.length >= 1, JSON.stringify(metrics, null, 2));
    assert('dwarf monster rendered as player-facing monster cell with dwarf asset', metrics.dwarves.length >= 1 && metrics.dwarves.some((d) => d.tileId === 'dwarf' && d.semanticKind === 'monster' && /dwarf/i.test(d.aria || d.semanticName || '')), JSON.stringify(metrics, null, 2));
    assert('werejackal @ monster rendered as monster cell with werejackal asset, not player avatar', metrics.werejackals.length >= 1 && metrics.werejackals.some((w) => w.tileId === 'werejackal' && w.glyph === '@' && w.semanticKind === 'monster' && /werejackal/i.test(w.aria || w.semanticName || '') && !/hero|player|avatar/i.test(`${w.aria} ${w.tileId}`)), JSON.stringify(metrics, null, 2));
    await hover(cdp, '.tile-cell[data-tile-id="dwarf"]');
    const dwarfTooltip = await tooltipState(cdp);
    const dwarfHoverShot = await shot(cdp, '02-scenario-dwarf-hover-card.png');
    assert('dwarf hover card shows monster dwarf glyph with dwarf art', !dwarfTooltip.hidden && /Dwarf/.test(dwarfTooltip.text) && /Monster/.test(dwarfTooltip.text) && /glyph (44|427)/.test(dwarfTooltip.text) && /common-early-monsters\/dwarf\.png/.test(dwarfTooltip.iconImage || ''), JSON.stringify(dwarfTooltip, null, 2));
    await hover(cdp, '.tile-cell[data-tile-id="werejackal"]');
    const werejackalTooltip = await tooltipState(cdp);
    const werejackalHoverShot = await shot(cdp, '03-scenario-werejackal-hover-card.png');
    assert('werejackal @ hover card shows Werejackal monster art and never hero/player art', !werejackalTooltip.hidden && /Werejackal/.test(werejackalTooltip.text) && /Monster/.test(werejackalTooltip.text) && /glyph/.test(werejackalTooltip.text) && /full-source-monsters\/werejackal\.png|werejackal\.png/.test(werejackalTooltip.iconImage || '') && !/Hero|Player combo avatars|hero-avatar|player-pets-identity/.test(`${werejackalTooltip.text} ${werejackalTooltip.iconImage}`), JSON.stringify(werejackalTooltip, null, 2));
    assert('tame kitten rendered as player-facing pet/monster cell', metrics.kittens.length >= 1, JSON.stringify(metrics, null, 2));
    assert('monster cells avoid fallback labels', !/Name unavailable|Loading your inventory|Inventory selector/i.test(metrics.body), metrics.body.slice(0, 1200));
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
  console.log(`real-scenario-monster-map-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
