const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');
const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;
const scenarioId = 'container/locked-chest-force-destroy-on-hero';
const seed = process.env.NH_FORCE_DESTROY_CONTEXT_SEED || '424242';
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function shot(cdp, name) {
  const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function sendKey(cdp, ch) { await evalExpr(cdp, `window.__nethackAutomation.sendKeycode(${JSON.stringify(ch.charCodeAt(0))})`); }
let assertionOutcomes = null;
function assert(name, ok, detail = '') {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const outcome = { id, status: ok ? 'passed' : 'failed', details: ok ? '' : detail };
  const existing = assertionOutcomes?.find((entry) => entry.id === id);
  if (existing) Object.assign(existing, outcome); else assertionOutcomes?.push(outcome);
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}
async function state(cdp) { return evalExpr(cdp, `(() => ({ dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id), actions: window.__nethackPromptTest?.contextActions?.(), sent: window.__nethackPromptTest?.sentInputs?.().join('') || '', prompt: window.__nethackPromptTest?.prompt?.(), dialog: window.__nethackPromptTest?.dialog?.(), currentCell: window.__nethackPromptTest?.currentCell?.(), automation: window.__nethackAutomation?.state?.(), messages: window.__nethackPromptTest?.messages?.().slice(-30).map((m) => m.text || String(m)) || [], running: window.__nethackAutomation?.state?.().runningState?.running || false, body: document.body.innerText, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '' }))()`); }
async function start(cdp) {
  await cdp.startDefaultGame({ timeoutMs: 25000, playerName: 'BatchBProof' });
  await cdp.dismissIntroDialogs();
    await delay(500);
    await cdp.dismissIntroDialogs();
}

function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-scenario-force-destroyed-container-context-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
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
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: seed, NETHACKOPTIONS: '!tutorial,!autopickup' },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  const outcomes = [];
  if (typeof assertionOutcomes !== 'undefined') assertionOutcomes = outcomes;
  let scenarioError = null;
  try {
    await start(cdp);
    const loaded = await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000).catch(async (error) => {
      const debug = await state(cdp).catch((stateError) => ({ stateError: String(stateError) }));
      fs.writeFileSync(path.join(outDir, 'scenario-load-timeout-debug.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, 'debug-scenario-load-timeout.png').catch(() => undefined);
      throw error;
    });
    assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
    const ready = await waitFor(async () => { const s = await state(cdp); const ids = (s.actions?.buttons || []).map((b) => b.id); return ids.includes('open-container') && ids.includes('force-container') ? s : null; }, 10000);
    const beforeShot = await shot(cdp, '01-before-force-context-actions.png');
    const beforeLabels = (ready.actions.buttons || []).map((b) => `${b.id}:${b.text}`).join('\n');
    assert('precondition exposes Open chest', /open-container:Open chest/.test(beforeLabels), beforeLabels);
    assert('precondition exposes Force lock', /force-container:Force lock/.test(beforeLabels), beforeLabels);
    
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await click(cdp, '#context-action-bar button[data-context-action-id="force-container"]');
    await waitFor(async () => { const s = await state(cdp); const text = `${s.prompt?.query || ''}\n${s.dialog?.prompt || ''}\n${s.body}`; return /force its lock/i.test(text) ? s : null; }, 5000);
    await sendKey(cdp, 'y');
    
    let destroyedState = null;
    for (let i = 0; i < 120; i += 1) {
      const s = await state(cdp);
      const joined = s.messages.join('\n');
      if (/totally destroyed/i.test(joined)) { destroyedState = s; break; }
      if (/lock is already (?:broken|unlocked)|decide not to force|give up your attempt|cannot force/i.test(joined)) break;
      await sendKey(cdp, '.');
      await delay(120);
    }
    assert('force attempt completely destroyed the chest for this deterministic scenario', Boolean(destroyedState), JSON.stringify({ seed, messages: (await state(cdp)).messages }, null, 2));
    const after = await waitFor(async () => {
      const s = await state(cdp);
      const ids = (s.actions?.buttons || []).map((b) => b.id);
      const cellText = `${s.currentCell?.objectLayerSemanticName || ''} ${s.currentCell?.objectLayerSemanticKind || ''}`;
      return !s.dialogs?.length && ids.includes('pickup') && /dagger object/i.test(cellText) && !ids.includes('open-container') && !ids.includes('force-container') ? s : null;
    }, 5000).catch(async (error) => {
      const debug = await state(cdp).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, 'after-destroy-stale-debug.json'), JSON.stringify(debug, null, 2));
      throw error;
    });
    const afterDestroyShot = await shot(cdp, '02-after-destroy-context-actions.png');
    fs.writeFileSync(path.join(outDir, 'after-destroy-state.json'), JSON.stringify(after, null, 2));
    const ids = (after.actions?.buttons || []).map((b) => b.id);
    const labels = (after.actions?.buttons || []).map((b) => `${b.id}:${b.text}`).join('\n');
    assert('destroyed container no longer exposes open-container context action', !ids.includes('open-container'), labels);
    assert('destroyed container no longer exposes Force lock context action', !ids.includes('force-container'), labels);
    assert('post-destroy context still allows pickup if contents survived, not stale open chest', !/Open chest|Open box|Loot container/i.test(after.actions?.text || ''), after.actions?.text || '');
    assert('UI avoids fallback labels after destroyed chest', !/Inventory selector|Name unavailable|Loading your inventory/i.test(after.body), after.body.slice(0, 1200));
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
  console.log(`real-scenario-force-destroyed-container-context-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
