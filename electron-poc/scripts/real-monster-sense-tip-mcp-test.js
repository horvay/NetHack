const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;
const scenarioId = 'fountain/monster-sense-tip';
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function shot(cdp, name) {
  const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function send(cdp, ch) { await evalExpr(cdp, `window.__nethackAutomation.sendKeycode(${JSON.stringify(ch.charCodeAt(0))})`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
  shim: document.getElementById('shim-output')?.innerText || '',
  dialog: window.__nethackPromptTest?.dialog?.(),
  prompt: window.__nethackPromptTest?.prompt?.(),
  status: document.getElementById('status')?.innerText || '',
  monsterCells: Array.from(document.querySelectorAll('.tile-cell')).filter((cell) => /monster|jackal/i.test([cell.dataset.semanticKind || '', cell.dataset.semanticName || '', cell.getAttribute('aria-label') || '', cell.textContent || ''].join(' '))).map((cell) => ({ x: cell.dataset.mapX, y: cell.dataset.mapY, kind: cell.dataset.semanticKind || '', name: cell.dataset.semanticName || '', label: cell.getAttribute('aria-label') || '', text: cell.textContent || '' })),
  body: document.body.innerText
}))()`); }
async function start(cdp) {
  await cdp.startDefaultGame({ timeoutMs: 25000, playerName: 'BatchBProof' });
  await cdp.dismissIntroDialogs();
    await delay(500);
    await cdp.dismissIntroDialogs();
}
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
  console.log(`real-monster-sense-tip-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
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
    const startShot = await shot(cdp, '01-fountain-scenario-start.png');
    
    await send(cdp, 'q');
    await waitFor(async () => /Drink from the fountain/i.test(`${(await state(cdp)).dialog?.prompt || ''}\n${(await state(cdp)).body}`), 10000).catch(async (error) => {
      const debug = await state(cdp).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, 'debug-after-q-timeout.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, 'debug-after-q-timeout.png').catch(() => undefined);
      throw error;
    });
    const afterQ = await state(cdp);
    fs.writeFileSync(path.join(outDir, 'debug-after-q.json'), JSON.stringify(afterQ, null, 2));
    assert('drink command opens the real fountain prompt', /Drink from the fountain/i.test(`${afterQ.dialog?.prompt || ''}\n${afterQ.body}`), JSON.stringify(afterQ.dialog));
    const beforeSense = afterQ;
    await click(cdp, '#interaction-options .choice-button[data-key="y"]');
    
    const sensed = await waitFor(async () => {
      const s = await state(cdp);
      if (s.dialog?.interactionOpen && /Tip|Spellbook/i.test(s.dialog.title || '')) throw new Error(`unexpected monster-sense modal: ${JSON.stringify(s.dialog)}`);
      return /You sense the presence of monsters/i.test(s.body) && /Move cursor to monster of interest|For instructions type/i.test(s.body) && !s.dialog?.interactionOpen ? s : null;
    }, 15000).catch(async (error) => {
      const debug = await state(cdp).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, 'debug-sensed-timeout.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, 'debug-sensed-timeout.png').catch(() => undefined);
      throw error;
    });
    fs.writeFileSync(path.join(outDir, 'debug-sensed-farlook.json'), JSON.stringify(sensed, null, 2));
    const beforeCoords = new Set((beforeSense.monsterCells || []).map((cell) => `${cell.x},${cell.y}`));
    const newlyRevealed = (sensed.monsterCells || []).filter((cell) => !beforeCoords.has(`${cell.x},${cell.y}`));
    const senseShot = await shot(cdp, '02-real-fountain-monster-sense-no-modal-farlook.png');
    assert('real fountain monster detection leaves no interaction modal open', !sensed.dialog?.interactionOpen, JSON.stringify(sensed.dialog));
    assert('monster-sense message is in the visible log', /You sense the presence of monsters/i.test(sensed.body), sensed.body);
    assert('farlook browse instructions are message-log text, not modal text', /Move cursor to monster of interest|For instructions type/i.test(sensed.body) && !/Farlooking or selecting a map location|Game time does not advance|Spellbook|Spell palette/i.test(sensed.body), sensed.body);
    assert('fountain scenario reveals monster cells after forced fountain monster detection', (sensed.monsterCells || []).length > (beforeSense.monsterCells || []).length || newlyRevealed.length > 0, JSON.stringify({ before: beforeSense.monsterCells, after: sensed.monsterCells, newlyRevealed }));
    await send(cdp, ' ');
    const afterDismiss = await waitFor(async () => { const s = await state(cdp); return /Done\.|water tastes like nothing/i.test(s.body) && !s.dialog?.interactionOpen && !/monster-sense map browse active/i.test(s.status || '') ? s : null; }, 10000);
    fs.writeFileSync(path.join(outDir, 'debug-after-dismiss.json'), JSON.stringify(afterDismiss, null, 2));
    const afterDismissShot = await shot(cdp, '03-after-any-key-normal-gameplay.png');
    assert('space dismisses fountain farlook browse and leaves ordinary no-modal gameplay', !afterDismiss.dialog?.interactionOpen && /Done\.|water tastes like nothing/i.test(afterDismiss.body) && !/monster-sense map browse active/i.test(afterDismiss.status || ''), JSON.stringify(afterDismiss.dialog));
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
  console.log(`real-monster-sense-tip-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
