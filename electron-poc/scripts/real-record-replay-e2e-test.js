const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');



const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');
function reviewRun(outputDir, reviewFile) { const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json'); const approval = EvidenceApproval.openEvidenceApproval({ manifestFile }); EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile)); const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true }); if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(manifestFile); console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`); }
function createEvidence(page) { return Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') }); }
async function finishEvidence(page, qc, scenarioError) { await page.close().catch(() => {}); qc.recordAssertions([{ id: 'scenario-contract', status: scenarioError ? 'failed' : 'passed', details: scenarioError?.message || '' }]); qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' }); qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' }); const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false }); if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(qc.manifestFile); console.log(`${scriptName}: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`); if (scenarioError) throw scenarioError; }
let outDir, evidencePage, evidenceQc

const width = Number(process.env.NH_REAL_RECORD_REPLAY_WIDTH || 1360);
const height = Number(process.env.NH_REAL_RECORD_REPLAY_HEIGHT || 920);
const sourcePlayground = path.resolve(root, '..', 'playground');
let isolatedPlayground;

function prepareIsolatedPlayground() {
  ;
  fs.mkdirSync(path.join(isolatedPlayground, 'save'), { recursive: true });
  for (const name of ['nhdat', 'sysconf', 'symbols', 'license']) fs.copyFileSync(path.join(sourcePlayground, name), path.join(isolatedPlayground, name));
  for (const name of ['perm', 'record', 'logfile', 'xlogfile', 'livelog', 'paniclog']) fs.writeFileSync(path.join(isolatedPlayground, name), '');
}





async function evalExpr(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function shot(cdp, name) {
  const id = path.basename(name, path.extname(name));
  return evidencePage.nativeScreenshotEvidence(evidenceQc, id, {
    classification: 'synthetic-fixture',
    viewport: { width, height, devicePixelRatio: 1 },
    state: id,
  });
}
async function clickCenter(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  return box;
}
async function boxForText(cdp, selector, pattern) {
  const box = await evalExpr(cdp, `(() => { const re = new RegExp(${JSON.stringify(pattern)}, 'i'); const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((candidate) => re.test(candidate.innerText || candidate.textContent || '')); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText || el.textContent || ''} : null; })()`);
  if (!box) throw new Error(`missing ${selector} matching ${pattern}`);
  return box;
}
async function clickBox(cdp, box) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
async function doubleClickBox(cdp, box) {
  for (const clickCount of [1, 2]) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount });
    await Harness.delay(80);
  }
}
async function press(cdp, key, code, text) {
  const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
  const params = { key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  if (text !== undefined) params.text = text;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}
async function state(cdp) {
  return evalExpr(cdp, `(() => {
    const automation = window.__nethackAutomation?.state?.() || {};
    const recording = window.__nethackAutomation?.currentRecording?.() || null;
    return {
      running: automation.runningState?.running || false,
      status: automation.status || document.getElementById('status')?.textContent || '',
      body: document.body.innerText || '',
      seen: document.getElementById('shim-output')?.dataset?.seen || '',
      dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
      toolbarText: document.getElementById('recording-toolbar')?.innerText || '',
      recordingStatus: document.getElementById('recording-status')?.innerText || '',
      seed: recording?.seed || '',
      seedSource: recording?.seedSource || '',
      savePath: ((document.getElementById('recording-status')?.innerText || '') + '\\n' + (document.getElementById('recording-toolbar')?.innerText || '')).match(/Recording saved: (.*\\.nhrec\\.json)/)?.[1] || '',
      events: recording?.events?.length || 0,
      checkpoints: recording?.events?.filter((event) => event.type === 'checkpoint').length || 0,
      inputs: recording?.inputs?.length || 0,
      recordingEvents: (recording?.events || []).map((event) => ({ type: event.type, source: event.source || '', commandId: event.command?.commandId || event.event?.payload?.commandId || '', eventType: event.event?.eventType || '', key: event.key || '', keycode: event.keycode || 0 })),
      sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
      sentUiProtocolAcks: window.__nethackPromptTest?.sentUiProtocolAcks?.() || [],
      sentInputs: window.__nethackPromptTest?.sentInputs?.() || [],
      sentPayloads: window.__nethackPromptTest?.sentPayloads?.() || [],
      dialog: window.__nethackPromptTest?.dialog?.() || {},
      transactions: window.__nethackPromptTest?.commandTransactions?.() || {},
      equipment: window.__nethackPromptTest?.equipment?.() || {},
      rows: Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).map((el) => ({ key: el.dataset.key || '', text: el.innerText })),
      slots: Array.from(document.querySelectorAll('.paper-doll-slots .equipment-slot')).map((el) => ({ slot: el.dataset.slot, text: el.innerText, equipped: el.classList.contains('equipped') })),
      activePromptQuestion: automation.activePrompt?.question || '',
    };
  })()`);
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
function slotText(s, slot) { return (s.slots || []).find((entry) => entry.slot === slot)?.text || ''; }
function isEquipmentScreen(s) { return Boolean(s.dialog?.interactionOpen) && /Equipment\s*\/\s*Inventory/i.test(s.dialog?.title || ''); }
function lastCompleted(s) { return s.transactions?.lastCompleted || null; }
async function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...options.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (data) => { stdout += String(data); });
    child.stderr.on('data', (data) => { stderr += String(data); });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      const result = { code, signal, stdout, stderr };
      code === 0 ? resolve(result) : reject(Object.assign(new Error(`${cmd} ${args.join(' ')} failed with ${code || signal}\n${stderr}`), result));
    });
  });
}

async function main() {
  if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]);
  isolatedPlayground = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'nh-record-replay-'));
  prepareIsolatedPlayground();
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_PLAYGROUND: isolatedPlayground,
      NETHACKDIR: isolatedPlayground,
    },
  });
  outDir = page.outputDir;
  evidencePage = page;
  evidenceQc = createEvidence(page);
  const cdp = page.cdp;
  const results = { runIdentity: page.outputIdentity, outDir, isolatedPlayground, screenshots: {} };
  let scenarioError;
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true });
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    const captureProfile = await evalExpr(cdp, `window.netHackPOC.setTestCaptureProfile(${JSON.stringify({ width, height, zoomPercent: 100 })})`);
    assert('native recording capture profile applied', captureProfile?.ok && captureProfile.contentSize?.[0] === width && captureProfile.contentSize?.[1] === height, JSON.stringify(captureProfile));
    await Harness.waitFor(async () => (await evalExpr(cdp, `innerWidth === ${width} && innerHeight === ${height}`)), 5000);

    const initialDialogs = await evalExpr(cdp, "Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id)");
    if (initialDialogs.includes('startup-choice-dialog')) await clickCenter(cdp, '#startup-new-game');
    else await clickCenter(cdp, '#start-shim');
    await Harness.waitFor(async () => (await evalExpr(cdp, "document.getElementById('character-dialog')?.open")), 5000);
    await evalExpr(cdp, `(() => {
      document.getElementById('player-name').value = 'ReplayE2E';
      document.getElementById('player-role').value = 'Val';
      document.getElementById('player-race').value = 'Hum';
      document.getElementById('player-gender').value = 'Fem';
      document.getElementById('player-align').value = 'Law';
      document.getElementById('game-seed').value = '';
      document.getElementById('record-inputs').checked = true;
    })()`);
    await clickCenter(cdp, '#confirm-character');
    results.recordingStarted = await Harness.waitFor(async () => {
      const next = await state(cdp);
      results.lastRecordingStartPoll = next;
      return next.running && next.seed && /bridge_seed/.test(next.seen) ? next : null;
    }, 20000);
    if (results.recordingStarted.dialogs.includes('intro-dialog')) await clickCenter(cdp, '#intro-continue');
    await Harness.waitFor(async () => {
      const next = await state(cdp);
      return !next.dialogs.length && !next.activePromptQuestion ? next : null;
    }, 5000);
    results.gameReady = await Harness.waitFor(async () => {
      const next = await state(cdp);
      return next.running && /shim_print_glyph|shim_status_update|shim_curs|shim_putstr/.test(next.seen) ? next : null;
    }, 20000);
    await evalExpr(cdp, `document.getElementById('game-grid')?.focus()`);
    results.screenshots.recordingStarted = await shot(cdp, '01-recording-started-seed-captured.png');

    const rejectedCommand = {
      protocol: 'nethack-electron-ui/v2',
      commandId: 'cmd-native-reject-replay-e2e',
      commandType: 'action.execute',
      transactionId: 'txn-native-reject-replay-e2e',
      actionId: 'ground.openContainer',
      expectedRevision: {},
      targets: { location: { kind: 'ground' } },
      payload: {
        actionId: 'ground.openContainer',
        label: 'Open / loot here',
        surface: 'ground-context',
        target: { location: { kind: 'ground' } },
        route: { actionId: 'ground.openContainer', command: '#force\n' },
        promptPolicy: 'netHack-owned-followup',
      },
    };
    const beforeRejected = await state(cdp);
    results.rejectedSend = await evalExpr(cdp, `window.__nethackPromptTest.recordAndSendNativeUiCommandForTest(${JSON.stringify(rejectedCommand)}, 'real-record-replay-native-reject')`);
    results.afterRejected = await Harness.waitFor(async () => {
      const next = await state(cdp);
      results.lastRejectPoll = next;
      return next.sentUiProtocolAcks.some((ack) => ack.eventType === 'command.rejected' && ack.payload?.commandId === 'cmd-native-reject-replay-e2e') ? next : null;
    }, 5000);
    await Harness.delay(250);
    results.afterRejectedSettled = await state(cdp);
    assert('rejected native command did not record replay input bytes', results.afterRejectedSettled.inputs === beforeRejected.inputs, JSON.stringify({ before: beforeRejected.inputs, after: results.afterRejectedSettled.inputs, payloads: results.afterRejectedSettled.sentPayloads }));
    assert('rejected native command sent no bridge input payload', results.afterRejectedSettled.sentPayloads.length === beforeRejected.sentPayloads.length, JSON.stringify({ before: beforeRejected.sentPayloads, after: results.afterRejectedSettled.sentPayloads }));
    assert('native rejection recorded ui-protocol-command evidence', results.afterRejected.sentUiProtocolCommands.some((command) => command.commandId === 'cmd-native-reject-replay-e2e'), JSON.stringify(results.afterRejected.sentUiProtocolCommands));
    assert('native rejection recorded rejected ack evidence', results.afterRejected.sentUiProtocolAcks.some((ack) => ack.eventType === 'command.rejected' && ack.payload?.executionSource === 'native-ui-command'), JSON.stringify(results.afterRejected.sentUiProtocolAcks));
    // The rejected-command probe is development evidence inside result.json.
    // Reset its player notice before any accepted recording/replay screenshot.
    await evalExpr(cdp, `window.__nethackPromptTest.clearFailureForTest(); document.getElementById('game-grid')?.focus()`);
    await Harness.waitFor(async () => !/command metadata did not match|revision changed before action execution/i.test((await state(cdp)).body), 5000);

    await evalExpr(cdp, `document.getElementById('game-grid')?.focus()`);
    const beforeSemantic = await state(cdp);
    results.beforeSemantic = beforeSemantic;
    results.screenshots.beforeSemantic = await shot(cdp, '02-before-semantic-action.png');

    results.semanticActionSend = await evalExpr(cdp, `window.__nethackPromptTest.sendSemanticActionForTest('x', { id: 'slot.swapMainAlternate', label: 'Swap with alternate weapon' }, { actionId: 'slot.swapMainAlternate', label: 'Swap with alternate weapon' }, { source: 'equipment-paper-doll', target: { slotId: 'mainHand' }, payload: { promptPolicy: 'no-followup' } })`);
    results.screenshots.semanticActionTarget = await shot(cdp, '03-semantic-action-sent.png');
    results.afterSemanticAccepted = await Harness.waitFor(async () => {
      const next = await state(cdp);
      return next.sentUiProtocolAcks.some((ack) => ack.eventType === 'command.accepted' && ack.payload?.executionSource === 'bridge-ui-command' && ack.payload?.commandId !== 'cmd-native-reject-replay-e2e') && next.inputs > beforeSemantic.inputs ? next : null;
    }, 10000);
    await Harness.delay(1200);
    const afterSemantic = await state(cdp);
    results.afterSemantic = afterSemantic;
    results.screenshots.afterSemantic = await shot(cdp, '04-after-semantic-action-accepted.png');
    const semanticAcceptedAck = afterSemantic.sentUiProtocolAcks.find((ack) => ack.eventType === 'command.accepted' && ack.payload?.executionSource === 'bridge-ui-command' && ack.payload?.commandId !== 'cmd-native-reject-replay-e2e');
    const semanticActionId = semanticAcceptedAck?.payload?.actionId || '';
    assert('semantic action recorded ui-protocol-command evidence', afterSemantic.sentUiProtocolCommands.some((command) => command.commandType === 'action.execute' && command.commandId === semanticAcceptedAck?.payload?.commandId), JSON.stringify(afterSemantic.sentUiProtocolCommands));
    assert('semantic action recorded accepted ack evidence only after bridge accept', Boolean(semanticAcceptedAck?.payload?.commandId && semanticAcceptedAck.payload.executionSource === 'bridge-ui-command'), JSON.stringify(afterSemantic.sentUiProtocolAcks));
    assert('semantic action recorded replay input bytes from accepted native command', afterSemantic.sentPayloads.some((payload) => payload.nativeUiCommand && payload.uiProtocolCommandId === semanticAcceptedAck?.payload?.commandId), JSON.stringify(afterSemantic.sentPayloads));
    assert('semantic action replay inputs leave no visible direction/cmdassist artifact', !/direction prompt|Invalid direction key|cmdassist/i.test(`${afterSemantic.status}\n${afterSemantic.body}`), afterSemantic.status);
    results.semanticAcceptedActionId = semanticActionId;

    results.afterSemanticClosed = afterSemantic;
    results.clearedStaleMenuForCheckpoint = await evalExpr(cdp, `window.__nethackPromptTest.forceCloseCurrentMenuForTest()`);

    results.recordCheckpointResult = await evalExpr(cdp, `window.__nethackAutomation.recordCheckpoint('after-semantic-v2-action')`);
    results.afterCheckpoint = await Harness.waitFor(async () => {
      const next = await state(cdp);
      return next.checkpoints >= 1 ? next : null;
    }, 5000);
    results.screenshots.afterCheckpoint = await shot(cdp, '05-recording-checkpoint-added.png');

    console.log('[e2e] saving recording');
    results.saveRecordingResult = await evalExpr(cdp, `window.__nethackAutomation.saveRecording('manual')`);
    const savedState = await Harness.waitFor(async () => {
      const next = await state(cdp);
      return next.savePath ? next : null;
    }, 5000);
    results.recordingPath = savedState.savePath;
    results.savedRecording = JSON.parse(fs.readFileSync(results.recordingPath, 'utf8'));
    assert('saved recording has effective random seed', results.savedRecording.seed && results.savedRecording.seedSource && results.savedRecording.seedSource !== 'pending-bridge-seed', JSON.stringify(results.savedRecording.seedSource));
    assert('saved recording has input and checkpoint events', results.savedRecording.events.some((event) => event.type === 'input') && results.savedRecording.events.some((event) => event.type === 'checkpoint'));
    assert('saved recording preserves semantic ui-protocol-command evidence', results.savedRecording.events.some((event) => event.type === 'ui-protocol-command' && event.command?.commandType === 'action.execute' && event.command?.commandId !== 'cmd-native-reject-replay-e2e'), JSON.stringify(results.savedRecording.events.filter((event) => event.type === 'ui-protocol-command')));
    assert('saved recording preserves accepted and rejected ack evidence', results.savedRecording.events.some((event) => event.type === 'ui-protocol-ack' && event.event?.eventType === 'command.accepted' && event.event?.payload?.executionSource === 'bridge-ui-command') && results.savedRecording.events.some((event) => event.type === 'ui-protocol-ack' && event.event?.eventType === 'command.rejected' && event.event?.payload?.commandId === 'cmd-native-reject-replay-e2e'), JSON.stringify(results.savedRecording.events.filter((event) => event.type === 'ui-protocol-ack')));
    assert('rejected native command did not create replay input event', !results.savedRecording.events.some((event) => event.type === 'input' && /cmd-native-reject-replay-e2e/.test(JSON.stringify(event))), JSON.stringify(results.savedRecording.events.filter((event) => event.type === 'input')));
    console.log(`[e2e] saved ${results.recordingPath}`);
    await page.close();
    await Harness.delay(500);

    const replayOut = path.join(outDir, 'replay-artifacts');
    fs.rmSync(replayOut, { recursive: true, force: true });
    fs.mkdirSync(replayOut, { recursive: true });
    fs.writeFileSync(path.join(replayOut, 'visual-replay-summary.json'), JSON.stringify({ ok: true, recordingPath: 'STALE-SHOULD-NOT-SURVIVE' }, null, 2));
    console.log(`[e2e] replaying to ${replayOut}`);
    const replay = await run(process.execPath, ['scripts/replay-visual.js', results.recordingPath, '--out', replayOut, '--initial-delay-ms', '2500', '--delay-ms', '700', '--final-delay-ms', '500', '--screenshot-gap-ms', '200'], { env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_PLAYGROUND: isolatedPlayground, NETHACKDIR: isolatedPlayground, NH_DIAGNOSTIC_LOG_DIR: path.join(replayOut, 'diagnostics') } });
    console.log('[e2e] replay complete');
    results.replay = { stdout: replay.stdout, stderr: replay.stderr, outDir: replayOut };
    const summaryPath = path.join(replayOut, 'visual-replay-summary.json');
    assert('visual replay summary exists', fs.existsSync(summaryPath), summaryPath);
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    results.replaySummary = summary;
    results.replaySummaryPath = summaryPath;
    assert('visual replay summary matches the saved recording', path.resolve(summary.recordingPath || '') === path.resolve(results.recordingPath), JSON.stringify({ summary: summary.recordingPath, saved: results.recordingPath }));
    assert('visual replay did not reuse the stale summary sentinel', !/STALE-SHOULD-NOT-SURVIVE/.test(JSON.stringify(summary)), JSON.stringify(summary));
    assert('visual replay captured checkpoint screenshot', summary.checkpointCount >= 1 && summary.screenshots.some((item) => /checkpoint-after-semantic-v2-action/.test(path.basename(item.file))), JSON.stringify(summary.screenshots));
    assert('visual replay validated checkpoint state determinism', summary.checkpointValidationOk === true, JSON.stringify(summary.checkpointValidations));
    assert('visual replay has no direction/cmdassist artifact after semantic action', !/direction prompt|Invalid direction key|cmdassist/i.test(JSON.stringify(summary.state || {})), JSON.stringify(summary.state || {}).slice(0, 1200));
    assert('visual replay wrote checkpoint sidecar', summary.sidecars.length >= 1 && summary.sidecars.every((file) => fs.existsSync(file)), JSON.stringify(summary.sidecars));

    fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(results, null, 2));
  } catch (error) {
    scenarioError = error;
    results.error = error.stack || String(error);
    fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(results, null, 2));
  } finally {
    try {
      await finishEvidence(page, evidenceQc, scenarioError);
    } finally {
      fs.rmSync(isolatedPlayground, { recursive: true, force: true });
    }
  }
}

main();
