const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness.js');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_UXM01_CANCEL_EVIDENCE_DIR || path.join(root, 'test-output', 'uxm01-real-web-cancellation');
const port = Number(process.env.NH_UXM01_CANCEL_CDP_PORT || 19925);
const playground = process.env.NH_UXM01_CANCEL_PLAYGROUND || '/tmp/nethack-uxm01-web-cancel-chi5';
const { waitFor, delay } = Harness;

function assert(condition, message, detail) {
  if (!condition) throw new Error(`${message}${detail ? `: ${JSON.stringify(detail)}` : ''}`);
}

function preparePlayground() {
  fs.rmSync(playground, { recursive: true, force: true });
  fs.mkdirSync(path.join(playground, 'save'), { recursive: true });
  const source = path.resolve(root, '..', 'playground');
  for (const name of ['nhdat', 'sysconf', 'symbols', 'license', 'perm']) {
    const from = path.join(source, name);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(playground, name));
  }
}

async function state(page) {
  return page.evalCheckedValue(`(() => {
    const game = window.NetHackUxRuntime?.runtime?.latestPublicState?.()?.snapshot?.game || window.__nethackAutomation?.state?.().gameView || {};
    const status = new Map(game.statusValues || []);
    return {
      running: Boolean(window.__nethackAutomation?.state?.().runningState?.running),
      prompt: window.__nethackPromptTest?.prompt?.() || null,
      acknowledgement: window.__nethackPromptTest?.cancellationAcknowledgement?.() || null,
      sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
      payloads: window.__nethackPromptTest?.sentPayloads?.() || [],
      shimEvents: window.__nethackPromptTest?.shimEvents?.().slice(-80) || [],
      messages: (game.messages || []).slice(),
      cursor: game.cursor ? { ...game.cursor } : null,
      time: status.get(16) || '',
      dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
      activeId: document.activeElement?.id || '',
      notice: document.getElementById('ux-player-notice')?.textContent || '',
      body: document.body.innerText,
    };
  })()`);
}

async function capture(page, qc, id, snapshot) {
  const raw = qc.rawPath(id);
  await page.screenshot(raw);
  return qc.recordCapture(id, raw, {
    viewport: { width: 1360, height: 920, zoomPercent: 100 },
    state: snapshot,
    viewSafeFormat: 'BMP',
    viewSafeScale: 0.5,
  });
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  preparePlayground();
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir });
  const page = await Harness.createElectronBrowserDriver({
    root,
    port,
    width: 1360,
    height: 920,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_SCENARIO_ID: 'status/condition-trap',
      NH_TEST_PLAYGROUND: playground,
      NH_ELECTRON_SHOW: '1',
    },
  });
  const summary = {
    plan: 'NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11',
    baseline: 'UXM-01-GLIMMER-GREEN-2026-07-11-313c638da058',
    scenario: 'status/condition-trap',
    port,
    playground,
    outDir,
    screenshots: {},
    checks: {},
  };
  try {
    await page.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true, startButton: true });
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    const started = await page.evalCheckedValue(`window.__nethackAutomation.startReplay(${JSON.stringify({
      playerSpec: '-uUXM01Cancel-Val-Hum-Fem-Law',
      seed: '902902',
      scenarioId: 'status/condition-trap',
      nethackOptions: '!tutorial,!autopickup,time,showscore,showexp,showvers,weaponstatus,armorstatus,terrainstatus',
      settings: { hudDensity: 'compact', map: { mode: 'full' } },
    })})`, { awaitPromise: true });
    assert(started?.ok, 'real scenario failed to start', started);
    await waitFor(async () => (await state(page)).running || null, 25000);
    const openDialogs = await page.evalCheckedValue("Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id)");
    if (openDialogs.includes('intro-dialog')) await page.click('#intro-continue', { timeoutMs: 5000 });
    await page.evalCheckedValue("document.getElementById('game-grid').focus(); window.__nethackPromptTest.clearSentInputs(); true");
    await delay(350);

    const beforeAttempt = await state(page);
    await page.pressKey('l', 'l');
    const promptOpen = await waitFor(async () => {
      const current = await state(page);
      return /Really step into that web\?/i.test(current.prompt?.query || '') && current.dialogs.includes('interaction-dialog') ? current : null;
    }, 7000);
    summary.beforeAttempt = beforeAttempt;
    summary.promptOpen = promptOpen;
    summary.screenshots.before = await capture(page, qc, '01-real-web-confirmation-before-escape', promptOpen);

    await page.pressKey('Escape');
    const after = await waitFor(async () => {
      const current = await state(page);
      return !current.dialogs.includes('interaction-dialog') && current.acknowledgement?.status === 'acknowledged' ? current : null;
    }, 7000);
    await delay(900);
    const settled = await state(page);
    summary.after = after;
    summary.settled = settled;
    summary.screenshots.after = await capture(page, qc, '02-real-web-cancelled-settled', settled);

    const diagnosticText = `${settled.messages.join('\n')}\n${settled.body}\n${JSON.stringify(settled.shimEvents)}`;
    const cancelPayloads = settled.payloads.filter((payload) => payload.guiActionId === 'interaction.cancel');
    const answerEvents = settled.shimEvents.filter((entry) => entry?.event?.name === 'bridge_prompt_answer' || entry?.name === 'bridge_prompt_answer').map((entry) => entry.event || entry);
    summary.checks = {
      realPromptOpened: /Really step into that web\?/i.test(promptOpen.prompt?.query || ''),
      exactlyOneAttemptAndCanonicalCancel: settled.sent === 'ln',
      oneTypedCancelPayload: cancelPayloads.length === 1 && cancelPayloads[0].keycode === 'n'.charCodeAt(0) && cancelPayloads[0].guiActionId === 'interaction.cancel',
      typedCancellationAcknowledged: settled.acknowledgement?.intent === 'cancel' && settled.acknowledgement?.responseKey === 'n' && settled.acknowledgement?.transportEvent === 'bridge_prompt_answer' && settled.acknowledgement?.canonicalChoice === true,
      bridgeAcknowledgedCanonicalNo: answerEvents.some((event) => Number(event.keycode) === 'n'.charCodeAt(0)),
      dialogClosed: !settled.dialogs.includes('interaction-dialog'),
      mapFocusReturned: settled.activeId === 'game-grid',
      noCursorMovement: JSON.stringify(settled.cursor) === JSON.stringify(beforeAttempt.cursor),
      noTurnSpent: String(settled.time) === String(beforeAttempt.time),
      didNotEnterWeb: !settled.messages.some((message) => /You stumble into a spider web!/i.test(message)),
      noYnFunctionDiagnostic: !/yn_function\(\) returned/i.test(diagnosticText),
      noProgramInDisorder: !/Program in disorder/i.test(diagnosticText),
      noDevteamReport: !/devteam@nethack\.org/i.test(diagnosticText),
    };
    const failures = Object.entries(summary.checks).filter(([, passed]) => !passed).map(([name]) => name);
    if (failures.length) throw new Error(`web cancellation checks failed: ${failures.join(', ')}`);

    summary.diagnostic = await page.evalCheckedValue('window.netHackPOC.activeDiagnosticRun()', { awaitPromise: true }).catch((error) => ({ ok: false, error: error.message }));
    fs.writeFileSync(path.join(outDir, 'diagnostic-summary.json'), `${JSON.stringify(summary.diagnostic, null, 2)}\n`);
  } catch (error) {
    summary.failure = { message: error.message, stack: error.stack };
    summary.failureState = await state(page).catch((stateError) => ({ error: stateError.message }));
    throw error;
  } finally {
    summary.manifest = qc.manifestFile;
    summary.manifestValidation = Harness.screenshotQc.validateManifest(qc.manifestFile);
    const output = page.output();
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), output.stdout);
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), output.stderr);
    fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    await page.close().catch(() => {});
  }
  console.log(`UXM-01 real web cancellation PASS: ${outDir}`);
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
