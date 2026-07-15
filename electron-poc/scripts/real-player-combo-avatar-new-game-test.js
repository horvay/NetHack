const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = Number(process.env.NH_REAL_PLAYER_AVATAR_WIDTH || 1360);
const height = Number(process.env.NH_REAL_PLAYER_AVATAR_HEIGHT || 920);
const { delay, waitFor } = Harness;
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function shot(cdp, name) {
  const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'actual-player', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}
async function clickCenter(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
async function moveTo(cdp, x, y) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  status: window.__nethackAutomation?.state?.().status || '',
  seen: document.getElementById('shim-output')?.dataset?.seen || '',
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map(d => d.id),
  player: (() => {
    const el = Array.from(document.querySelectorAll('.tile-cell')).find((cell) => cell.dataset.glyph === '@' || cell.getAttribute('aria-label')?.match(/Valkyrie|Player|Hero/i));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { tileId: el.dataset.tileId || '', glyphNumber: el.dataset.glyphNumber || '', aria: el.getAttribute('aria-label') || '', x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })(),
  tooltip: { hidden: document.getElementById('map-tooltip')?.hidden, text: document.getElementById('map-tooltip')?.innerText || '', iconBg: document.querySelector('#map-tooltip .map-tooltip-icon')?.style?.backgroundImage || '' },
}))()`); }
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
  console.log(`real-player-combo-avatar-new-game-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
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
    env: {},
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  const results = { outDir, screenshots: {} };
  const outcomes = [];
  if (typeof assertionOutcomes !== 'undefined') assertionOutcomes = outcomes;
  let scenarioError = null;
  try {
    results.screenshots.beforeStart = await shot(cdp, '01-before-start-character-dialog.png');
    const startSelector = await evalExpr(cdp, `(() => {
      if (document.getElementById('startup-choice-dialog')?.open) return '#startup-new-game';
      return Array.from(document.querySelectorAll('#start-shim, #start, #startup-new-game')).filter((el) => !el.hidden && getComputedStyle(el).display !== 'none' && !el.disabled).map((el) => '#' + el.id)[0] || '#start';
    })()`);
    await clickCenter(cdp, startSelector);
    await waitFor(async () => await evalExpr(cdp, `Boolean(document.getElementById('character-dialog')?.open)`), 10000);
    const playerName = `Avatar${Date.now().toString(36).slice(-6)}`;
    results.playerName = playerName;
    await evalExpr(cdp, `((name) => { document.getElementById('player-name').value = name; document.getElementById('player-role').value = 'Val'; document.getElementById('player-race').value = 'Hum'; document.getElementById('player-gender').value = 'Fem'; document.getElementById('player-align').value = 'Law'; })(${JSON.stringify(playerName)})`);
    await clickCenter(cdp, '#confirm-character');
    await delay(500);
    results.afterConfirm = await state(cdp);
    results.screenshots.afterConfirm = await shot(cdp, '01b-after-confirm-character.png');
    const introOpen = await evalExpr(cdp, `Boolean(document.getElementById('intro-dialog')?.open)`);
    if (introOpen) await clickCenter(cdp, '#intro-continue');
    results.started = await state(cdp);
    results.playerCell = await waitFor(async () => { const s = await state(cdp); if (s?.dialogs?.includes('intro-dialog')) return null; return s?.player?.tileId ? s.player : null; }, 10000);
    await moveTo(cdp, results.playerCell.x, results.playerCell.y);
    await delay(300);
    results.hover = await state(cdp);
    results.screenshots.afterStartHover = await shot(cdp, '02-new-game-human-valkyrie-female-combo-avatar-visible.png');
    assert('player cell uses generated combo avatar', results.playerCell.tileId === 'human-valkyrie-female-avatar', JSON.stringify(results.playerCell));
    assert('tooltip uses generated combo avatar image', /player-combo-avatars\/human-valkyrie-female-avatar\.png/.test(results.hover.tooltip.iconBg), results.hover.tooltip.iconBg);
    assert('tooltip still identifies Valkyrie', /Valkyrie/i.test(results.hover.tooltip.text), results.hover.tooltip.text);
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
  console.log(`real-player-combo-avatar-new-game-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
