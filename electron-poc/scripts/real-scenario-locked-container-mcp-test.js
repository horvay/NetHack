const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');
const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;
const scenarioId = 'container/locked-trapped-chest-on-hero';
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function shot(cdp, name) {
  const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}
function writeState(outDir, name, value) { const p = path.join(outDir, name); fs.writeFileSync(p, JSON.stringify(value, null, 2)); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function sendKey(cdp, ch) { await evalExpr(cdp, `window.__nethackAutomation.sendKeycode(${JSON.stringify(ch.charCodeAt(0))})`); }
async function sendEsc(cdp) { await evalExpr(cdp, `window.__nethackAutomation.sendKeycode(27)`); }
let assertionOutcomes = null;
function assert(name, ok, detail = '') {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const outcome = { id, status: ok ? 'passed' : 'failed', details: ok ? '' : detail };
  const existing = assertionOutcomes?.find((entry) => entry.id === id);
  if (existing) Object.assign(existing, outcome); else assertionOutcomes?.push(outcome);
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}
async function state(cdp) { return evalExpr(cdp, `(() => ({ dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id), actions: window.__nethackPromptTest?.contextActions?.(), sent: window.__nethackPromptTest?.sentInputs?.().join('') || '', sentPayloads: window.__nethackPromptTest?.sentPayloads?.() || [], sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [], prompt: window.__nethackPromptTest?.prompt?.(), dialog: window.__nethackPromptTest?.dialog?.(), currentCell: window.__nethackPromptTest?.currentCell?.(), messages: window.__nethackPromptTest?.messages?.().slice(-12).map((m) => m.text || String(m)) || [], running: window.__nethackAutomation?.state?.().runningState?.running || false, body: document.body.innerText, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '' }))()`); }
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
  console.log(`real-scenario-locked-container-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
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
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_SHIM_RESET_LOCKS: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' },
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
    const ready = await waitFor(async () => { const s = await state(cdp); const ids = (s.actions?.buttons || []).map((b) => b.id); return ids.includes('open-container') && ids.includes('tip-container') && ids.includes('force-container') && ids.includes('untrap-container') ? s : null; }, 10000).catch(async (error) => { const debug = await state(cdp).catch(() => ({})); fs.writeFileSync(path.join(outDir, 'scenario-locked-timeout-debug.json'), JSON.stringify(debug, null, 2)); await shot(cdp, 'debug-scenario-locked-timeout.png').catch(() => undefined); throw error; });
    const contextShot = await shot(cdp, '01-scenario-locked-container-context-actions.png');
    const contextStatePath = writeState(outDir, '01-scenario-locked-container-context-actions-state.json', ready);
    const labels = (ready.actions.buttons || []).filter((b) => ['open-container', 'tip-container', 'force-container', 'untrap-container'].includes(b.id)).map((b) => `${b.id}:${b.text}`).join('\n');
    assert('locked/trapped context exposes Open box', /open-container:Open box/.test(labels), labels);
    assert('locked/trapped context exposes Force lock', /force-container:Force lock/.test(labels), labels);
    assert('locked/trapped context exposes Tip', /tip-container:Tip/.test(labels), labels);
    assert('locked/trapped context exposes Untrap from visible trapped text', /untrap-container:Untrap/.test(labels), labels);
    assert('context UI avoids fallback labels', !/Inventory selector|Name unavailable|Loading your inventory/i.test(ready.body), ready.body.slice(0, 1200));
    
    await delay(500);
    await waitFor(async () => { const s = await state(cdp); const ids = (s.actions?.buttons || []).map((b) => b.id); return !s.prompt && ids.includes('untrap-container') ? s : null; }, 5000);
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await click(cdp, '#context-action-bar button[data-context-action-id="untrap-container"]');
    await delay(250);
    const afterUntrap = await state(cdp);
    const untrapShot = await shot(cdp, '03-after-untrap-container-followup.png');
    const untrapStatePath = writeState(outDir, '03-after-untrap-container-followup-state.json', afterUntrap);
    assert('Untrap context action routes exactly to #untrap without a direction answer', afterUntrap.sent === '#untrap\n', JSON.stringify({ sent: afterUntrap.sent, messages: afterUntrap.messages, prompt: afterUntrap.prompt, dialog: afterUntrap.dialog }));
    assert('Untrap context action is validated as v2 action.execute ground.untrapContainer', afterUntrap.sentPayloads.some((payload) => payload.uiProtocolCommandType === 'action.execute' && payload.uiProtocolActionId === 'ground.untrapContainer'), JSON.stringify(afterUntrap.sentPayloads));
    assert('Untrap v2 envelope carries explicit public ground target and NetHack-owned follow-up policy', afterUntrap.sentUiProtocolCommands.some((command) => command.commandType === 'action.execute' && command.actionId === 'ground.untrapContainer' && command.targets?.location?.kind === 'ground' && command.payload?.target?.location?.kind === 'ground' && command.payload?.promptPolicy === 'netHack-owned-followup'), JSON.stringify(afterUntrap.sentUiProtocolCommands));
    assert('Bridge accepts native ui-command ground.untrapContainer metadata', /bridge_ui_command_accepted[^\n]*ground\.untrapContainer/.test(afterUntrap.shim || ''), (afterUntrap.shim || '').slice(-2000));
    assert('Bridge does not reject ground.untrapContainer', !/bridge_ui_command_rejected[^\n]*ground\.untrapContainer/.test(afterUntrap.shim || ''), (afterUntrap.shim || '').slice(-2000));
    assert('Untrap opens a NetHack-owned direction prompt', afterUntrap.prompt?.promptType === 'direction' && /direction/i.test(afterUntrap.prompt?.query || ''), JSON.stringify(afterUntrap.prompt));
    
    await evalExpr(cdp, `(() => { const base = window.__nethackPromptTest.sentUiProtocolCommands()[0]; const command = JSON.parse(JSON.stringify(base)); command.commandId = 'cmd-native-active-owner-force'; command.transactionId = 'txn-native-active-owner-force'; command.actionId = 'ground.forceContainer'; command.action = { id: 'ground.forceContainer', label: 'Force lock' }; command.payload.actionId = 'ground.forceContainer'; command.payload.label = 'Force lock'; command.payload.route.actionId = 'ground.forceContainer'; command.payload.route.label = 'Force lock'; command.payload.route.command = '#force\\n'; window.__nethackPromptTest.clearSentInputs(); return window.__nethackPromptTest.nativeRawUiCommand(command); })()`);
    await delay(150);
    const blockedDuringPrompt = await state(cdp);
    const blockedStatePath = writeState(outDir, '03b-active-owner-blocks-force-during-untrap-prompt-state.json', blockedDuringPrompt);
    assert('Active direction prompt blocks native bridge ui-command without raw fallback keys', blockedDuringPrompt.sent === '', JSON.stringify({ sent: blockedDuringPrompt.sent, payloads: blockedDuringPrompt.sentPayloads, status: blockedDuringPrompt.status }));
    assert('Native bridge rejects the second ground.forceContainer ui-command while prompt owns input', /bridge_ui_command_rejected[^\n]*ground\.forceContainer[^\n]*active prompt\/menu owner blocks ui-command/.test(blockedDuringPrompt.shim || ''), (blockedDuringPrompt.shim || '').slice(-2000));
    assert('Native active-owner rejection lowers no force bridge_command keys', !/bridge_command[^\n]*txn-native-active-owner-force/.test(blockedDuringPrompt.shim || ''), (blockedDuringPrompt.shim || '').slice(-2000));
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
  console.log(`real-scenario-locked-container-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
