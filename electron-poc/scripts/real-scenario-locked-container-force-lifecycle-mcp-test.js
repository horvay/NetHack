const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;
const scenarioId = 'container/locked-chest-east-unrevealed';

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
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
    actions: window.__nethackPromptTest?.contextActions?.(),
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    sentPayloads: window.__nethackPromptTest?.sentPayloads?.() || [],
    sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
    sentUiProtocolAcks: window.__nethackPromptTest?.sentUiProtocolAcks?.() || [],
    prompt: window.__nethackPromptTest?.prompt?.(),
    dialog: window.__nethackPromptTest?.dialog?.(),
    currentCell: window.__nethackPromptTest?.currentCell?.(),
    ground: window.__nethackPromptTest?.groundSnapshots?.(),
    messages: window.__nethackPromptTest?.messages?.().slice(-18).map((m) => m.text || String(m)) || [],
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    body: document.body.innerText,
    seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
    shimTail: (document.getElementById('shim-output')?.innerText || '').slice(-6000)
  }))()`);
}

function actionIds(s) {
  return (s.actions?.buttons || []).map((button) => button.id);
}

function actionText(s) {
  return (s.actions?.buttons || []).map((button) => `${button.id}:${button.text}`).join('\n');
}

async function sendGameKey(driver, ch) {
  await driver.evalCheckedValue(`window.__nethackAutomation.sendKeycode(${JSON.stringify(ch.charCodeAt(0))})`);
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
  console.log(`real-scenario-locked-container-force-lifecycle-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
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
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_SHIM_RESET_LOCKS: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '515151', NETHACKOPTIONS: '!tutorial,!autopickup' },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  const outcomes = [];
  if (typeof assertionOutcomes !== 'undefined') assertionOutcomes = outcomes;
  let scenarioError = null;
  try {
    await cdp.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true, startButton: true });
    await cdp.startDefaultGame({ timeoutMs: 20000, playerName: 'ForceLife' });
    await waitFor(async () => (await state(cdp)).running, 20000);
    await cdp.dismissIntroDialogs();
    await waitFor(async () => /bridge_test_scenario_loaded/.test(`${(await state(cdp)).seenShim}\n${(await state(cdp)).shimTail}`), 10000);
    
    await sendGameKey(cdp, 'l');
    const initial = await waitFor(async () => {
      const s = await state(cdp);
      const ids = actionIds(s);
      const text = `${s.messages.join('\n')}\n${s.currentCell?.groundTexts?.join('\n') || ''}`;
      return ids.includes('open-container') && /chest/i.test(text) ? s : null;
    }, 10000);
    const initialShot = await shot(cdp, '01-on-chest-before-open.png');
    const initialState = writeJson(outDir, '01-on-chest-before-open-state.json', initial);
    assert('initial on-chest state exposes Open chest', actionText(initial).includes('open-container:Open chest'), actionText(initial));
    assert('initial on-chest state does not expose Force lock before visible locked message', !actionIds(initial).includes('force-container'), actionText(initial));
    assert('initial visible state does not already describe a locked chest', !/locked chest/i.test(`${initial.messages.join('\n')}\n${initial.currentCell?.visibleMessageGroundTexts?.map((x) => x.text).join('\n') || ''}`), JSON.stringify(initial.messages));
    
    await cdp.evalCheckedValue('window.__nethackPromptTest.clearSentInputs()');
    await cdp.click('#context-action-bar button[data-context-action-id="open-container"]');
    const afterOpen = await waitFor(async () => {
      const s = await state(cdp);
      const text = `${s.messages.join('\n')}\n${s.body}\n${s.status}`;
      return /(?:turns? out to be locked|locked chest|chest.*locked)/i.test(text) && actionIds(s).includes('force-container') ? s : null;
    }, 10000);
    const afterOpenShot = await shot(cdp, '02-after-open-locked-message-force-visible.png');
    const afterOpenState = writeJson(outDir, '02-after-open-locked-message-force-visible-state.json', afterOpen);
    assert('open attempt sends typed container snapshot without raw #loot fallback', afterOpen.sent === '' && afterOpen.sentUiProtocolCommands.some((command) => command.commandType === 'container.snapshot'), JSON.stringify({ sent: afterOpen.sent, commands: afterOpen.sentUiProtocolCommands, status: afterOpen.status }));
    assert('open attempt produces visible locked-container guidance', /locked/i.test(`${afterOpen.messages.join('\n')}\n${afterOpen.body}\n${afterOpen.status}`), JSON.stringify({ messages: afterOpen.messages, status: afterOpen.status }));
    assert('Force lock appears without stepping off/on after visible locked message', actionIds(afterOpen).includes('force-container'), actionText(afterOpen));
    assert('locked action sheet offers the wielded force-capable tool', (afterOpen.dialog?.options || []).some((option) => /Force.+pick-axe/i.test(option.text || '')), JSON.stringify(afterOpen.dialog));
    assert('visible locked message created public ground target evidence', (afterOpen.ground?.piles || []).some((pile) => (pile.items || []).some((item) => /locked chest/i.test(item.displayName || ''))) || (afterOpen.currentCell?.visibleMessageGroundTexts || []).some((item) => /locked chest/i.test(item.text || '')), JSON.stringify({ ground: afterOpen.ground, currentCell: afterOpen.currentCell }));
    
    await cdp.evalCheckedValue('window.__nethackPromptTest.clearSentInputs()');
    await cdp.click('#interaction-options .choice-button');
    const afterForce = await waitFor(async () => {
      const s = await state(cdp);
      const text = `${s.messages.join('\n')}\n${s.prompt?.query || ''}\n${s.dialog?.prompt || ''}\n${s.status}\n${s.shimTail}`;
      if (/blocked ground\.forceContainer|ground revision changed|bridge_ui_command_rejected[^\n]*ground\.forceContainer/i.test(text)) throw new Error(`force rejected: ${text.slice(-2000)}`);
      return s.sent === '#force\n' && /bridge_ui_command_accepted[^\n]*ground\.forceContainer/i.test(s.shimTail || '') && /force|lock|weapon|tool|pick-axe|direction/i.test(text) ? s : null;
    }, 12000);
    const afterForceShot = await shot(cdp, '03-after-force-lock-action-proceeds.png');
    const afterForceState = writeJson(outDir, '03-after-force-lock-action-proceeds-state.json', afterForce);
    assert('Force lock context action routes exactly to #force', afterForce.sent === '#force\n', JSON.stringify({ sent: afterForce.sent, status: afterForce.status }));
    assert('Force lock is a v2 native ground.forceContainer command', afterForce.sentUiProtocolCommands.some((command) => command.commandType === 'action.execute' && command.actionId === 'ground.forceContainer' && command.targets?.location?.kind === 'ground' && command.payload?.promptPolicy === 'netHack-owned-followup'), JSON.stringify(afterForce.sentUiProtocolCommands));
    assert('Bridge accepted ground.forceContainer without stale-ground rejection', /bridge_ui_command_accepted[^\n]*ground\.forceContainer/i.test(afterForce.shimTail || '') && !/bridge_ui_command_rejected[^\n]*ground\.forceContainer/i.test(afterForce.shimTail || ''), afterForce.shimTail);
    assert('NetHack-owned force prompt/action proceeded after click', /force|lock|weapon|tool|pick-axe|direction/i.test(`${afterForce.messages.join('\n')}\n${afterForce.prompt?.query || ''}\n${afterForce.dialog?.prompt || ''}`), JSON.stringify({ messages: afterForce.messages, prompt: afterForce.prompt, dialog: afterForce.dialog }));
    assert('no raw selector fallback or placeholder UI appeared', !/Inventory selector|Name unavailable|Loading your inventory/i.test(afterForce.body), afterForce.body.slice(0, 1200));
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
  console.log(`real-scenario-locked-container-force-lifecycle-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
