const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;
const scenarioId = 'container/locked-chest-unlock-open-context-on-hero';

let assertionOutcomes = null;
function assert(name, ok, detail = '') {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const outcome = { id, status: ok ? 'passed' : 'failed', details: ok ? '' : detail };
  const existing = assertionOutcomes?.find((entry) => entry.id === id);
  if (existing) Object.assign(existing, outcome); else assertionOutcomes?.push(outcome);
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

function writeJson(outDir, name, value) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
}

async function state(driver) {
  return driver.evalCheckedValue(`(() => ({
    status: document.getElementById('status')?.textContent || '',
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
    actions: window.__nethackPromptTest?.contextActions?.(),
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
    sentPayloads: window.__nethackPromptTest?.sentPayloads?.() || [],
    prompt: window.__nethackPromptTest?.prompt?.(),
    container: window.__nethackPromptTest?.container?.(),
    interaction: window.__nethackPromptTest?.dialog?.(),
    inventory: window.__nethackPromptTest?.inventory?.(),
    pendingContainerUnlockOpen: window.__nethackPromptTest?.pendingContainerUnlockOpen?.(),
    messages: window.__nethackPromptTest?.messages?.().slice(-12).map((m) => m.text || String(m)) || [],
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    body: document.body.innerText,
    seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
    shimTail: (document.getElementById('shim-output')?.innerText || '').slice(-8000),
  }))()`);
}

function actionText(s) {
  return (s.actions?.buttons || []).map((button) => `${button.id}:${button.text}`).join('\n');
}
async function shot(cdp, name) {
  const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}

function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-scenario-locked-container-direct-open-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
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
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_SHIM_RESET_LOCKS: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '626262', NETHACKOPTIONS: '!tutorial,!autopickup' },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  const outcomes = [];
  if (typeof assertionOutcomes !== 'undefined') assertionOutcomes = outcomes;
  let scenarioError = null;
  try {
    await cdp.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true, startButton: true });
    await cdp.startDefaultGame({ timeoutMs: 20000, playerName: 'LockOpen' });
    await waitFor(async () => (await state(cdp)).running, 20000);
    await cdp.dismissIntroDialogs();
    await waitFor(async () => /bridge_test_scenario_loaded/.test(`${(await state(cdp)).seenShim}\n${(await state(cdp)).shimTail}`), 10000);
    const ready = await waitFor(async () => {
      const s = await state(cdp);
      return (s.actions?.buttons || []).some((button) => button.id === 'open-container') ? s : null;
    }, 10000);
    const beforeShot = await shot(cdp, '01-before-open-locked-container.png');
    const beforeState = writeJson(outDir, '01-before-open-locked-container-state.json', ready);
    assert('ready state exposes Open container action', /open-container:Open/i.test(actionText(ready)), actionText(ready));
    
    await cdp.evalCheckedValue('window.__nethackPromptTest.clearSentInputs()');
    await cdp.click('#context-action-bar button[data-context-action-id="open-container"]');
    const afterOpen = await waitFor(async () => {
      const s = await state(cdp);
      const text = `${s.interaction?.title || ''}\n${s.interaction?.prompt || ''}\n${(s.interaction?.options || []).map((option) => option.text).join('\n')}`;
      return /shim_container_snapshot_rejected/.test(s.shimTail || '') && /failureKind":"locked/.test(s.shimTail || '') && /Locked chest actions/i.test(text) && /Unlock with skeleton key/i.test(text) && /Close/i.test(text) && !s.container?.active ? s : null;
    }, 12000).catch(async (error) => {
      const debug = await state(cdp).catch(() => ({}));
      writeJson(outDir, 'debug-after-open-timeout-state.json', debug);
      await shot(cdp, 'debug-after-open-timeout.png').catch(() => undefined);
      throw error;
    });
    const afterShot = await shot(cdp, '02-after-direct-open-locked-rejected.png');
    const afterState = writeJson(outDir, '02-after-direct-open-locked-rejected-state.json', afterOpen);
    
    const actionSheetText = `${afterOpen.interaction?.title || ''}\n${afterOpen.interaction?.prompt || ''}\n${(afterOpen.interaction?.options || []).map((option) => option.text).join('\n')}`;
    assert('Open container dispatches typed container.snapshot and no #loot fallback', afterOpen.sent === '' && afterOpen.sentUiProtocolCommands.some((command) => command.commandType === 'container.snapshot' && command.payload?.containerId > 0), JSON.stringify({ sent: afterOpen.sent, commands: afterOpen.sentUiProtocolCommands }));
    assert('Bridge returns structured locked rejection', /shim_container_snapshot_rejected[^\n]*"failureKind":"locked"/.test(afterOpen.shimTail || ''), afterOpen.shimTail);
    assert('Locked rejection closes the transfer panel and opens a player-facing action sheet', !afterOpen.container?.active && afterOpen.interaction?.interactionOpen && /Locked chest actions/i.test(actionSheetText), JSON.stringify({ container: afterOpen.container, interaction: afterOpen.interaction }));
    assert('Action sheet names the available key path without offering an unavailable force path', /Unlock with skeleton key/i.test(actionSheetText) && !/Force (?:lock|with)/i.test(actionSheetText), actionSheetText);
    assert('Action sheet has a clear cancel path and no loading or timeout fallback', /Close|Cancel/i.test(actionSheetText) && !/Loading container contents|did not finish opening|normal NetHack flow/i.test(`${afterOpen.body}\n${actionSheetText}`), `${afterOpen.body}\n${actionSheetText}`);
    await cdp.click('#interaction-options .choice-button');
    const afterUnlock = await waitFor(async () => {
      const s = await state(cdp);
      return s.container?.active && /food ration/i.test(s.container.text || '') && /dagger/i.test(s.container.text || '') ? s : null;
    }, 30000).catch(async (error) => {
      const debug = await state(cdp).catch(() => ({}));
      writeJson(outDir, 'debug-after-unlock-timeout-state.json', debug);
      await shot(cdp, 'debug-after-unlock-timeout.png').catch(() => undefined);
      throw error;
    });
    const unlockedShot = await shot(cdp, '03-after-unlock-open.png');
    const unlockedState = writeJson(outDir, '03-after-unlock-open-state.json', afterUnlock);
    assert('Unlock action applies the visible skeleton key at the current square and confirms the chosen intent', /^af\.y$/.test(afterUnlock.sent || ''), JSON.stringify({ sent: afterUnlock.sent, messages: afterUnlock.messages }));
    assert('Successful lock picking opens fresh container contents and clears continuation state', /food ration/i.test(afterUnlock.container?.text || '') && /dagger/i.test(afterUnlock.container?.text || '') && afterUnlock.pendingContainerUnlockOpen == null, JSON.stringify({ container: afterUnlock.container, pending: afterUnlock.pendingContainerUnlockOpen }));
    assert('Post-unlock panel has no generic timeout fallback', !/did not finish opening|normal NetHack flow|Loading container contents/i.test(`${afterUnlock.body}\n${afterUnlock.container?.text || ''}`), `${afterUnlock.body}\n${afterUnlock.container?.text || ''}`);
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
  console.log(`real-scenario-locked-container-direct-open-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
