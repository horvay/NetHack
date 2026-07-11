const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const ReplayAdapter = require('../shared/replay-adapter');

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function safeLabel(label) { return String(label || 'checkpoint').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-|-$/g, '') || 'checkpoint'; }

function createReplayRunner({ app, win, repoRoot, env = process.env, logger = console }) {
  async function captureReplayScreenshot(outDir, label, index, inputIndex = null) {
    await fs.mkdir(outDir, { recursive: true });
    const file = path.join(outDir, `${String(index).padStart(2, '0')}-${safeLabel(label)}.png`);
    const image = await win.webContents.capturePage();
    await fs.writeFile(file, image.toPNG());
    return { file, label, index, inputIndex };
  }
  async function replayPageState() { return win.webContents.executeJavaScript('window.__nethackAutomation?.state?.()'); }
  async function dismissReplayIntro() { return win.webContents.executeJavaScript('window.__nethackAutomation?.dismissReplayIntro?.()'); }
  async function waitForReplayStable({ timeoutMs = 5000, stableMs = 250 } = {}) {
    const started = Date.now();
    let lastCount = -1;
    let stableSince = 0;
    while (Date.now() - started < timeoutMs) {
      const state = await replayPageState().catch(() => null);
      const count = Number(state?.shimEventCount || 0);
      const running = Boolean(state?.runningState?.running);
      const status = String(state?.status || '');
      const ready = running && count > 0 && !/starting replay|bridge failed/i.test(status);
      if (ready && count === lastCount) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince >= stableMs) return state;
      } else {
        stableSince = 0;
        lastCount = count;
      }
      await sleep(50);
    }
    return replayPageState().catch(() => null);
  }
  function checkpointStateSignature(state = {}) {
    return {
      cursor: state.cursor ? { x: Number(state.cursor.x), y: Number(state.cursor.y), window: Number(state.cursor.window) } : null,
      mapWindowId: state.mapWindowId == null ? null : Number(state.mapWindowId),
      activePromptQuestion: state.activePrompt?.question || null,
      currentMenuItemCount: Number(state.currentMenu?.itemCount || 0) > 0 ? Number(state.currentMenu.itemCount) : null,
      lastMessage: Array.isArray(state.messages) && state.messages.length ? String(state.messages[state.messages.length - 1]) : '',
    };
  }
  function hasComparableCheckpointState(recorded = {}) {
    return Boolean(recorded && typeof recorded === 'object' && (recorded.cursor || recorded.mapWindowId != null || recorded.activePrompt || recorded.currentMenu || (Array.isArray(recorded.messages) && recorded.messages.length)));
  }
  function compareCheckpointState(recorded = {}, replayed = {}) {
    if (!hasComparableCheckpointState(recorded)) return { ok: true, skipped: true, reason: 'checkpoint has no comparable recorded renderer state' };
    const expected = checkpointStateSignature(recorded);
    const actual = checkpointStateSignature(replayed);
    const mismatches = [];
    for (const key of Object.keys(expected)) {
      if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key])) mismatches.push({ key, expected: expected[key], actual: actual[key] });
    }
    return { ok: mismatches.length === 0, expected, actual, mismatches };
  }
  async function writeStateSidecar(outDir, screenshot, state, event, validation = null) {
    const file = screenshot.file.replace(/\.png$/i, '.state.json');
    const sidecar = { screenshot: path.basename(screenshot.file), event, state, validation };
    await fs.writeFile(file, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
    return file;
  }
  async function runIfRequested() {
    const recordingPath = env.NH_VISUAL_REPLAY_RECORDING;
    if (!recordingPath) return false;
    if (!fsSync.existsSync(recordingPath)) throw new Error(`recording not found: ${recordingPath}`);
    const recording = JSON.parse(await fs.readFile(recordingPath, 'utf8'));
    const replay = ReplayAdapter.normalizeRecording(recording);
    if (!replay.ok) throw new Error(replay.message);
    const outDir = env.NH_VISUAL_REPLAY_OUT_DIR || path.join(repoRoot, 'electron-poc', 'test', 'replay-screenshots', path.basename(recordingPath, '.json'));
    const inputDelayMs = Number(env.NH_VISUAL_REPLAY_INPUT_DELAY_MS || 350);
    const initialDelayMs = Number(env.NH_VISUAL_REPLAY_INITIAL_DELAY_MS || 1200);
    const finalDelayMs = Number(env.NH_VISUAL_REPLAY_FINAL_DELAY_MS || 900);
    const screenshotEvery = Math.max(1, Number(env.NH_VISUAL_REPLAY_SCREENSHOT_EVERY || 6));
    const screenshotGapMs = Number(env.NH_VISUAL_REPLAY_SCREENSHOT_GAP_MS || 150);
    const screenshots = [];
    const sidecars = [];
    const checkpointValidations = [];
    let inputCount = 0;
    await fs.mkdir(outDir, { recursive: true });
    if (replay.startConfig.window?.width && replay.startConfig.window?.height) {
      win.setSize(Number(replay.startConfig.window.width), Number(replay.startConfig.window.height));
    }
    await win.webContents.executeJavaScript(`window.__nethackAutomation.startReplay(${JSON.stringify(replay.startConfig)})`);
    await sleep(Math.min(initialDelayMs, 250));
    await waitForReplayStable({ timeoutMs: Math.max(initialDelayMs, 3000) });
    await dismissReplayIntro();
    screenshots.push(await captureReplayScreenshot(outDir, 'start', screenshots.length, 0));
    for (const event of replay.events) {
      if (event.type === 'input') {
        if (!event.keycode) continue;
        inputCount += 1;
        await win.webContents.executeJavaScript(`window.__nethackAutomation.sendKeycode(${JSON.stringify(event.keycode)})`);
        await sleep(Math.min(inputDelayMs, 100));
        await waitForReplayStable({ timeoutMs: Math.max(inputDelayMs, 1000) });
        await dismissReplayIntro();
        if ((inputCount % screenshotEvery) === 0) {
          if (screenshotGapMs > 0) await sleep(screenshotGapMs);
          screenshots.push(await captureReplayScreenshot(outDir, `input-${String(inputCount).padStart(3, '0')}`, screenshots.length, inputCount));
        }
      } else if (event.type === 'checkpoint') {
        await waitForReplayStable({ timeoutMs: Math.max(screenshotGapMs, 1000) });
        if (screenshotGapMs > 0) await sleep(Math.min(screenshotGapMs, 100));
        await dismissReplayIntro();
        const screenshot = await captureReplayScreenshot(outDir, `checkpoint-${event.name}`, screenshots.length, inputCount);
        screenshots.push(screenshot);
        const state = await replayPageState();
        const validation = compareCheckpointState(event.state || {}, state || {});
        checkpointValidations.push({ checkpoint: event.name, ...validation });
        sidecars.push(await writeStateSidecar(outDir, screenshot, state, event, validation));
      }
    }
    await sleep(finalDelayMs);
    screenshots.push(await captureReplayScreenshot(outDir, 'final', screenshots.length, inputCount));
    const summary = {
      ok: true,
      recordingPath,
      outDir,
      schemaVersion: replay.schemaVersion,
      seed: recording.seed,
      playerSpec: recording.playerSpec,
      options: recording.options,
      settings: replay.startConfig.settings,
      window: replay.startConfig.window,
      eventCount: replay.events.length,
      inputCount,
      checkpointCount: replay.checkpoints.length,
      checkpointValidationOk: checkpointValidations.every((item) => item.ok),
      checkpointValidations,
      inputDelayMs,
      initialDelayMs,
      finalDelayMs,
      screenshotEvery,
      screenshotGapMs,
      warnings: replay.warnings,
      synchronization: 'state-stable: waits for the renderer automation shim event count to settle before inputs and checkpoint captures',
      caveats: ['Renderer-only UI state in checkpoint events is captured in sidecar JSON for review; gameplay replay is driven by deterministic seed/options/settings and keycode inputs.', 'Replay supports the complete keycode shim input model used by the Electron UI recorder; unsupported non-keycode shim payloads are not sent by recorder paths and are flagged if encountered during recording.'],
      screenshots,
      sidecars,
      state: await replayPageState(),
    };
    if (!summary.checkpointValidationOk) summary.ok = false;
    await fs.writeFile(path.join(outDir, 'visual-replay-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    logger.log(`[visual-replay] ${JSON.stringify(summary)}`);
    if (!summary.checkpointValidationOk) throw new Error(`visual replay checkpoint validation failed: ${JSON.stringify(checkpointValidations)}`);
    await win.webContents.executeJavaScript('window.__nethackAutomation.stop()');
    app.quit();
    return true;
  }
  return Object.freeze({ version: 'nethack-replay-runner/v2', runIfRequested });
}

module.exports = { createReplayRunner, sleep, safeLabel };
