const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = Number(process.env.NH_CORPSE_OVERLAY_WIDTH || 1280);
const height = Number(process.env.NH_CORPSE_OVERLAY_HEIGHT || 900);
const { delay, waitFor } = Harness;
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function shot(cdp, name) {
  const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}
async function clickCenter(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function hoverFirstCellKind(cdp, kind) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector('.tile-cell[data-semantic-kind="${kind}"]'); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing ${kind} cell to hover`); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y }); await delay(150); }
async function tooltipMetrics(cdp) { return evalExpr(cdp, `(() => { const tip = document.getElementById('map-tooltip'); const icon = document.getElementById('map-tooltip-icon'); const title = document.getElementById('map-tooltip-title'); const description = document.getElementById('map-tooltip-description'); const r = tip?.getBoundingClientRect(); return { hidden: Boolean(tip?.hidden), text: tip?.innerText || '', title: title?.textContent || '', description: description?.textContent || '', tooltipClass: tip?.className || '', titleColor: title ? getComputedStyle(title).color : '', descriptionColor: description ? getComputedStyle(description).color : '', iconClass: icon?.className || '', rect: r ? {left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height} : null }; })()`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ status: document.getElementById('status')?.textContent || '', dialogs: Array.from(document.querySelectorAll('dialog[open]')).map(d => d.id), messages: window.__nethackPromptTest?.messages?.().slice(-8).map(m => m.text || String(m)) || [], seen: document.getElementById('shim-output')?.dataset?.seen || '', automation: window.__nethackAutomation?.state?.() }))()`); }
async function waitForStarted(cdp) {
  await cdp.startDefaultGame({ timeoutMs: 25000, playerName: 'BatchBProof' });
  await cdp.dismissIntroDialogs();
    await delay(500);
    await cdp.dismissIntroDialogs();
  const started = await waitFor(async () => {
    const value = await state(cdp);
    return /shim_glyph|shim_print_glyph|shim_status_update|shim_curs|shim_putstr/.test(value.seen) ? value : null;
  }, 20000);
  await evalExpr(cdp, "document.getElementById('game-grid')?.focus?.()");
  return started;
}
async function liveMapMetrics(cdp) { return evalExpr(cdp, `(() => {
  const cells = Array.from(document.querySelectorAll('.tile-cell'));
  const summarize = (el) => ({
    x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), className: el.className || '',
    tileId: el.dataset.tileId || '', semanticKind: el.dataset.semanticKind || '',
    semanticName: el.dataset.semanticName || '', aria: el.getAttribute('aria-label') || ''
  });
  const corpseCells = cells.filter(el => el.dataset.semanticKind === 'corpse').map(summarize);
  const overlaidCorpses = corpseCells.filter(c => /corpse-overlay/.test(c.className));
  const statueCells = cells.filter(el => el.dataset.semanticKind === 'statue').map(summarize);
  const stoneStatues = statueCells.filter(c => /statue-overlay/.test(c.className) && /tile-overlay/.test(c.className));
  const statueWithCorpseOverlay = statueCells.filter(c => /corpse-overlay/.test(c.className));
  const liveMonsters = cells.filter(el => el.dataset.semanticKind === 'monster' || el.dataset.semanticKind === 'pet').map(summarize);
  const liveMonsterWithOverlay = liveMonsters.filter(c => /corpse-overlay|statue-overlay/.test(c.className));
  return {
    corpseCells, overlaidCorpses, statueCells, stoneStatues, statueWithCorpseOverlay, liveMonsters, liveMonsterWithOverlay,
    gridText: document.getElementById('game-grid')?.getAttribute('aria-label') || '',
    openDialogs: Array.from(document.querySelectorAll('dialog[open]')).map(d => d.id),
    status: document.getElementById('status')?.textContent || '',
    seen: document.getElementById('shim-output')?.dataset?.seen || '',
    shimEventCount: Number(document.getElementById('shim-output')?.dataset?.count || 0),
    messageText: document.getElementById('messages')?.innerText || ''
  };
})()`); }

function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-corpse-overlay-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
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
    env: { ELECTRON_DISABLE_SECURITY_WARNINGS: '1', NH_SHIM_TEST_CORPSE_OVERLAY_SCENE: '1', NETHACK_SEED: '424242' },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  const outcomes = [];
  if (typeof assertionOutcomes !== 'undefined') assertionOutcomes = outcomes;
  let scenarioError = null;
  try {
    const startup = await waitForStarted(cdp);
    const initial = await shot(cdp, '01-live-game-started-before-corpse-assertion.png');
    const metrics = await waitFor(async () => {
      const m = await liveMapMetrics(cdp);
      return m.overlaidCorpses.length && m.stoneStatues.length && m.liveMonsters.length ? m : null;
    }, 10000);
    await delay(300);
    const overlayShot = await shot(cdp, '02-live-game-corpse-red-x-overlay-with-live-monster-negative.png');
    await hoverFirstCellKind(cdp, 'corpse');
    const corpseTooltip = await tooltipMetrics(cdp);
    const tooltipShot = await shot(cdp, '03-live-game-corpse-tooltip-red-x-overlay.png');
    await hoverFirstCellKind(cdp, 'statue');
    const statueTooltip = await tooltipMetrics(cdp);
    const statueTooltipShot = await shot(cdp, '04-live-game-statue-tooltip-grey-label.png');
    const checks = {
      realElectronLaunched: true,
      liveShimStartupReachedMapEvents: /shim_glyph|shim_print_glyph|shim_status_update|shim_curs|shim_putstr/.test(startup.seen || metrics.seen),
      liveGameCorpsePresent: metrics.corpseCells.length > 0,
      liveGameCorpseHasOverlay: metrics.overlaidCorpses.length === metrics.corpseCells.length,
      liveGameStatuePresent: metrics.statueCells.length > 0,
      liveGameStatueHasStoneOverlay: metrics.stoneStatues.length === metrics.statueCells.length,
      statueDoesNotUseCorpseRedX: metrics.statueWithCorpseOverlay.length === 0,
      statueTooltipShownByRealHover: !statueTooltip.hidden && /Jackal Statue/i.test(statueTooltip.title) && /map-tooltip-statue/.test(statueTooltip.tooltipClass || '') && /statue-overlay/.test(statueTooltip.iconClass || '') && /rgb\(200, 205, 212\)/.test(statueTooltip.titleColor || ''),
      liveMonsterPresentForNegativeCase: metrics.liveMonsters.length > 0,
      liveMonsterNoCorpseOrStatueOverlay: metrics.liveMonsterWithOverlay.length === 0,
      corpseTooltipShownByRealHover: !corpseTooltip.hidden && /corpse-overlay/.test(corpseTooltip.iconClass) && /corpse/i.test(corpseTooltip.text),
      noRendererStagedCellsUsed: !/fixture/i.test(metrics.status) && metrics.shimEventCount > 0,
      noUnexpectedDialogs: metrics.openDialogs.length === 0,
    };
    for (const [id, ok] of Object.entries(checks)) outcomes.push({ id, status: ok ? 'passed' : 'failed', details: ok ? '' : 'Observable scenario condition was not satisfied.' });
    const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([id]) => id);
    if (failedChecks.length) throw new Error(`Scenario checks failed: ${failedChecks.join(', ')}`);
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
  console.log(`real-corpse-overlay-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
