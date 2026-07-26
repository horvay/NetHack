#!/usr/bin/env node
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');
function reviewRun(outputDir, reviewFile) { const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json'); const approval = EvidenceApproval.openEvidenceApproval({ manifestFile }); EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile)); const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true }); if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(manifestFile); console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`); }
function createEvidence(page) { return Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') }); }
async function finishEvidence(page, qc, scenarioError) { await page.close().catch(() => {}); qc.recordAssertions([{ id: 'scenario-contract', status: scenarioError ? 'failed' : 'passed', details: scenarioError?.message || '' }]); qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' }); qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' }); const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false }); if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(qc.manifestFile); console.log(`${scriptName}: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`); if (scenarioError) throw scenarioError; }
const repoRoot = path.resolve(root, '..');
const bridge = path.join(root, 'shim-bridge', 'nh-shim-bridge');
const sourcePlayground = path.join(repoRoot, 'playground');
let outDir
let noPreviousPlayground;
let continuePlayground;
let checkpointPlayground;
const width = Number(process.env.NH_REAL_STARTUP_CHOICE_WIDTH || 1280);
const height = Number(process.env.NH_REAL_STARTUP_CHOICE_HEIGHT || 900);


function resetPlayground(playground) {
  fs.rmSync(playground, { recursive: true, force: true });
  fs.mkdirSync(path.join(playground, 'save'), { recursive: true });
  for (const name of ['nhdat', 'sysconf', 'symbols', 'license', 'perm']) {
    const src = path.join(sourcePlayground, name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(playground, name));
  }
}

function saveFiles(playground) {
  const saveDir = path.join(playground, 'save');
  try { return fs.readdirSync(saveDir).map((name) => path.join(saveDir, name)); }
  catch { return []; }
}

function bridgeEnv(playground, extra = {}) {
  return {
    ...process.env,
    NH_TEST_PLAYGROUND: playground,
    NETHACKDIR: playground,
    NH_ELECTRON_TEST_FIXTURES: '1',
    NETHACK_SEED: '515151',
    NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none,disclose:+i +a +v +g +c +o',
    ...extra,
  };
}
function readPid(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length < 4) return null;
  const pid = buffer.readInt32LE(0);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

function fileSize(file) {
  try { return fs.statSync(file).size; }
  catch { return 0; }
}

function findOwnLevelZeroLock(playground, pid) {
  try {
    for (const name of fs.readdirSync(playground)) {
      if (!/lock\.0$/.test(name)) continue;
      const file = path.join(playground, name);
      if (readPid(file) === pid) return file;
    }
  } catch {}
  return null;
}



function startBridge(playground, playerName, extraEnv = {}) {
  const child = spawn(bridge, [`-u${playerName}-Val-Hum-Fem-Law`], {
    cwd: repoRoot,
    env: bridgeEnv(playground, extraEnv),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.output = () => ({ stdout, stderr });
  return child;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), Harness.delay(2000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function createManualSave(playground, playerName) {
  let child;
  try {
    child = startBridge(playground, playerName);
    await Harness.waitFor(() => child.output().stdout.includes('bridge_start'), 10000);
    await Harness.waitFor(() => /welcome to NetHack|Hello /i.test(child.output().stdout), 15000);
    child.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: 'S'.charCodeAt(0) })}\n`);
    await Harness.waitFor(() => /Really save|Save the game/i.test(`${child.output().stdout}\n${child.output().stderr}`), 10000).catch(() => null);
    child.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: 'y'.charCodeAt(0) })}\n`);
    await Harness.waitFor(() => saveFiles(playground).length > 0 ? true : null, 15000);
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), Harness.delay(3000)]);
    return { saveFiles: saveFiles(playground), output: child.output() };
  } finally {
    await stopChild(child);
  }
}
async function createRecoverableCheckpoint(playground, playerName) {
  let child;
  try {
    child = startBridge(playground, playerName, { NH_TEST_SCENARIO_ID: 'regression/downstairs-current' });
    await Harness.waitFor(() => child.output().stdout.includes('bridge_start'), 10000);
    await Harness.waitFor(() => /bridge_test_scenario_loaded/.test(child.output().stdout), 15000);
    await Harness.waitFor(() => /welcome to NetHack|Hello /i.test(child.output().stdout), 15000);
    const lockFile = await Harness.waitFor(() => findOwnLevelZeroLock(playground, child.pid), 10000);
    const base = path.basename(lockFile).replace(/\.0$/, '');
    child.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: '>'.charCodeAt(0) })}\n`);
    await Harness.waitFor(() => /You descend the stairs\.|Dlvl:?2|Dlvl\s*2/i.test(child.output().stdout), 20000);
    await Harness.waitFor(() => fileSize(lockFile) > 4096 && fileSize(path.join(playground, `${base}.1`)) > 1024 ? true : null, 10000);
    child.kill('SIGKILL');
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), Harness.delay(3000)]);
    return { base, lockFile, lockSize: fileSize(lockFile), levelFiles: fs.readdirSync(playground).filter((name) => name.startsWith(`${base}.`) && name !== `${base}.0`) };
  } finally {
    await stopChild(child);
  }
}



async function pageState(page) {
  return page.evalCheckedValue(`(() => ({
    status: document.getElementById('status')?.textContent || '',
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
    startup: {
      open: Boolean(document.getElementById('startup-choice-dialog')?.open),
      summary: document.getElementById('startup-choice-summary')?.innerText || '',
      continueHidden: Boolean(document.getElementById('startup-continue-game')?.hidden),
      continueText: document.getElementById('startup-continue-detail')?.innerText || '',
    },
    messages: window.__nethackPromptTest?.messages?.().map((m) => m.text || String(m)) || [],
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    recovery: window.__nethackAutomation?.recoveryState?.() || null,
    mapCells: Array.from(document.querySelectorAll('.tile-cell')).filter((cell) => (cell.dataset.glyph || ' ') !== ' ').length,
    mapMode: document.body.dataset.uxMapMode || '',
    minimap: (() => {
      const element = document.querySelector('.ux-minimap-button');
      const box = element?.getBoundingClientRect();
      const playAreaBox = document.getElementById('play-area')?.getBoundingClientRect();
      const canvas = element?.querySelector('.ux-minimap-canvas');
      const pixels = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data || [];
      const colors = new Set();
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] > 0) colors.add([pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]].join(','));
      }
      return {
        exists: Boolean(element),
        hidden: element?.hidden ?? true,
        connected: element?.isConnected ?? false,
        width: box?.width || 0,
        height: box?.height || 0,
        top: box?.top || 0,
        playAreaTop: playAreaBox?.top || 0,
        offsetParent: element?.offsetParent?.id || element?.offsetParent?.className || '',
        offsetTop: element?.offsetTop || 0,
        computedTop: element ? getComputedStyle(element).top : '',
        transform: element ? getComputedStyle(element).transform : '',
        canvasWidth: canvas?.width || 0,
        canvasHeight: canvas?.getBoundingClientRect()?.height || 0,
        distinctColors: colors.size,
      };
    })(),
  }))()`);
}

async function runNoPreviousFlow(results) {
  resetPlayground(noPreviousPlayground);
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_PLAYGROUND: noPreviousPlayground },
  });
  outDir = page.outputDir;
  const qc = createEvidence(page);
  let scenarioError;
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    results.noPrevious.initial = await Harness.waitFor(async () => {
      const state = await pageState(page);
      return state.startup.open && state.startup.continueHidden ? state : null;
    }, 10000);
    results.screenshots.noPreviousModal = await page.screenshotEvidence(qc, '01-no-previous-startup-modal', { classification: 'actual-player', viewport: { width, height, devicePixelRatio: 1 }, state: 'no-previous-startup-modal' });
    await page.click('#startup-new-game');
    await Harness.waitFor(async () => (await pageState(page)).dialogs.includes('character-dialog'), 5000);
    results.screenshots.noPreviousCharacter = await page.screenshotEvidence(qc, '02-no-previous-character-dialog', { classification: 'actual-player', viewport: { width, height, devicePixelRatio: 1 }, state: 'no-previous-character-dialog' });
    await page.setInputValue('#player-name', 'StartFlow');
    await page.click('#confirm-character');
    results.noPrevious.started = await Harness.waitFor(async () => {
      const state = await pageState(page);
      return state.running && state.mapCells > 0 ? state : null;
    }, 20000);
    results.screenshots.noPreviousStarted = await page.screenshotEvidence(qc, '03-no-previous-new-game-started', { classification: 'actual-player', viewport: { width, height, devicePixelRatio: 1 }, state: 'no-previous-new-game-started' });
  } catch (error) {
    scenarioError = error;
  } finally {
    await finishEvidence(page, qc, scenarioError);
  }
}

async function runContinueFlow(results) {
  resetPlayground(continuePlayground);
  results.continue.createdSave = await createManualSave(continuePlayground, 'ContinueHero');
  assert(results.continue.createdSave.saveFiles.length > 0, 'setup must create a manual save file');
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_PLAYGROUND: continuePlayground },
  });
  outDir = page.outputDir;
  const qc = createEvidence(page);
  let scenarioError;
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    await page.evalCheckedValue("saveSettings({ map: { mode: 'close', closeRows: 9, minimapSize: 'medium' } }); true");
    await page.send('Page.reload', { ignoreCache: true });
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    results.continue.initial = await Harness.waitFor(async () => {
      const state = await pageState(page);
      return state.startup.open && !state.startup.continueHidden && state.recovery?.hasContinue ? state : null;
    }, 10000);
    results.screenshots.continueModal = await page.screenshotEvidence(qc, '04-continue-startup-modal', { classification: 'actual-player', viewport: { width, height, devicePixelRatio: 1 }, state: 'continue-startup-modal' });
    await page.click('#startup-continue-game');
    results.continue.started = await Harness.waitFor(async () => {
      const state = await pageState(page);
      const log = state.messages.join('\n');
      return state.running && (/Restoring save file|Welcome back|Velkommen back/i.test(log) || state.mapCells > 0) ? state : null;
    }, 25000);
    await page.dismissIntroDialogs();
    await Harness.waitFor(async () => (await pageState(page)).mapCells > 0, 10000);
    await Harness.delay(300);
    results.continue.presentation = await pageState(page);
    assert.strictEqual(results.continue.presentation.mapMode, 'close', 'continued game retains Close-up View');
    assert.strictEqual(results.continue.presentation.minimap.exists && results.continue.presentation.minimap.connected && !results.continue.presentation.minimap.hidden && results.continue.presentation.minimap.width > 0 && results.continue.presentation.minimap.height > 40 && results.continue.presentation.minimap.top >= results.continue.presentation.minimap.playAreaTop && results.continue.presentation.minimap.canvasWidth > 0 && results.continue.presentation.minimap.canvasHeight > 20 && results.continue.presentation.minimap.distinctColors > 2, true, `continued Close-up game restores its visible painted Minimap: ${JSON.stringify(results.continue.presentation.minimap)}`);
    results.screenshots.continuedGame = await page.screenshotEvidence(qc, '05-continued-previous-game', { classification: 'actual-player', viewport: { width, height, devicePixelRatio: 1 }, state: 'continued-previous-game' });
  } catch (error) {
    scenarioError = error;
  } finally {
    await finishEvidence(page, qc, scenarioError);
  }
}
async function runCheckpointContinueFlow(results) {
  resetPlayground(checkpointPlayground);
  results.checkpoint.createdCheckpoint = await createRecoverableCheckpoint(checkpointPlayground, 'CrashHero');
  assert(results.checkpoint.createdCheckpoint.lockSize > 4096, 'setup must create a recoverable checkpoint lock');
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_PLAYGROUND: checkpointPlayground },
  });
  outDir = page.outputDir;
  const qc = createEvidence(page);
  let scenarioError;
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    await page.evalCheckedValue("saveSettings({ map: { mode: 'close', closeRows: 9, minimapSize: 'medium' } }); true");
    await page.send('Page.reload', { ignoreCache: true });
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    results.checkpoint.initial = await Harness.waitFor(async () => {
      const state = await pageState(page);
      return state.startup.open && !state.startup.continueHidden && state.recovery?.primaryCandidate?.kind === 'checkpoint' ? state : null;
    }, 10000);
    results.screenshots.checkpointModal = await page.screenshotEvidence(qc, '06-checkpoint-startup-modal', { classification: 'actual-player', viewport: { width, height, devicePixelRatio: 1 }, state: 'checkpoint-startup-modal' });
    await page.click('#startup-continue-game');
    results.checkpoint.started = await Harness.waitFor(async () => {
      const state = await pageState(page);
      const log = state.messages.join('\n');
      return state.running && (/Restoring save file|Welcome back|Velkommen back|Dlvl:?2|Dlvl\s*2/i.test(log) || state.mapCells > 0) ? state : null;
    }, 30000);
    await page.dismissIntroDialogs();
    await Harness.waitFor(async () => (await pageState(page)).mapCells > 0, 10000);
    await Harness.delay(300);
    results.checkpoint.presentation = await pageState(page);
    assert.strictEqual(results.checkpoint.presentation.mapMode, 'close', 'recovered checkpoint retains Close-up View');
    assert.strictEqual(results.checkpoint.presentation.minimap.exists && results.checkpoint.presentation.minimap.connected && !results.checkpoint.presentation.minimap.hidden && results.checkpoint.presentation.minimap.width > 0 && results.checkpoint.presentation.minimap.height > 40 && results.checkpoint.presentation.minimap.top >= results.checkpoint.presentation.minimap.playAreaTop && results.checkpoint.presentation.minimap.canvasWidth > 0 && results.checkpoint.presentation.minimap.canvasHeight > 20 && results.checkpoint.presentation.minimap.distinctColors > 2, true, `recovered Close-up checkpoint restores its visible painted Minimap: ${JSON.stringify(results.checkpoint.presentation.minimap)}`);
    results.screenshots.checkpointContinuedGame = await page.screenshotEvidence(qc, '07-checkpoint-recovered-game', { classification: 'actual-player', viewport: { width, height, devicePixelRatio: 1 }, state: 'checkpoint-recovered-game' });
  } catch (error) {
    scenarioError = error;
  } finally {
    await finishEvidence(page, qc, scenarioError);
  }
}



async function main() {
  if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]);
  const requestedFlow = process.env.NH_REAL_STARTUP_CHOICE_FLOW || 'all';
  const runAll = requestedFlow === 'all';
  if (runAll) noPreviousPlayground = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'nh-startup-none-'));
  if (runAll || requestedFlow === 'continue') continuePlayground = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'nh-startup-save-'));
  if (runAll || requestedFlow === 'checkpoint') checkpointPlayground = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'nh-startup-checkpoint-'));
  const results = { screenshots: {}, noPrevious: {}, continue: {}, checkpoint: {}, checks: {} };
  if (runAll) await runNoPreviousFlow(results);
  if (runAll || requestedFlow === 'continue') await runContinueFlow(results);
  if (runAll || requestedFlow === 'checkpoint') await runCheckpointContinueFlow(results);
  results.checks = {
    ...(runAll ? {
      noPreviousModalShown: results.noPrevious.initial?.startup?.open === true,
      noInvalidContinueOffered: results.noPrevious.initial?.startup?.continueHidden === true,
      noPreviousNewGameStarted: results.noPrevious.started?.running === true && results.noPrevious.started?.mapCells > 0,
    } : {}),
    ...((runAll || requestedFlow === 'continue') ? {
      continueModalShown: results.continue.initial?.startup?.open === true,
      continueOptionOfferedForSave: results.continue.initial?.startup?.continueHidden === false,
      previousGameRestored: results.continue.started?.running === true,
      characterDialogSkippedOnContinue: !results.continue.started?.dialogs?.includes('character-dialog'),
      continuedCloseUpRestoresPaintedMinimap: results.continue.presentation?.mapMode === 'close'
        && results.continue.presentation?.minimap?.exists
        && !results.continue.presentation?.minimap?.hidden
        && results.continue.presentation?.minimap?.distinctColors > 2,
    } : {}),
    ...((runAll || requestedFlow === 'checkpoint') ? {
      checkpointModalShown: results.checkpoint.initial?.startup?.open === true,
      checkpointOptionOffered: results.checkpoint.initial?.recovery?.primaryCandidate?.kind === 'checkpoint',
      checkpointRecoveredAndRestored: results.checkpoint.started?.running === true,
      recoveredCloseUpRestoresPaintedMinimap: results.checkpoint.presentation?.mapMode === 'close'
        && results.checkpoint.presentation?.minimap?.exists
        && !results.checkpoint.presentation?.minimap?.hidden
        && results.checkpoint.presentation?.minimap?.distinctColors > 2,
    } : {}),
  };
  const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length) throw new Error(`startup choice checks failed: ${failed.join(', ')}`);
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
