#!/usr/bin/env node
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');
const bridge = path.join(root, 'shim-bridge', 'nh-shim-bridge');
const sourcePlayground = path.join(repoRoot, 'playground');
const outDir = process.env.NH_REAL_STARTUP_CHOICE_OUT_DIR || path.join(root, 'test-output', 'real-startup-choice');
const noPreviousPlayground = path.join(outDir, 'no-previous-playground');
const continuePlayground = path.join(outDir, 'continue-playground');
const checkpointPlayground = path.join(outDir, 'checkpoint-playground');
const width = Number(process.env.NH_REAL_STARTUP_CHOICE_WIDTH || 1280);
const height = Number(process.env.NH_REAL_STARTUP_CHOICE_HEIGHT || 900);

const { waitFor, delay } = Harness;

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
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(2000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function createManualSave(playground, playerName) {
  let child;
  try {
    child = startBridge(playground, playerName);
    await waitFor(() => child.output().stdout.includes('bridge_start'), 10000);
    await waitFor(() => /welcome to NetHack|Hello /i.test(child.output().stdout), 15000);
    child.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: 'S'.charCodeAt(0) })}\n`);
    await waitFor(() => /Really save|Save the game/i.test(`${child.output().stdout}\n${child.output().stderr}`), 10000).catch(() => null);
    child.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: 'y'.charCodeAt(0) })}\n`);
    await waitFor(() => saveFiles(playground).length > 0 ? true : null, 15000);
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(3000)]);
    return { saveFiles: saveFiles(playground), output: child.output() };
  } finally {
    await stopChild(child);
  }
}

async function createRecoverableCheckpoint(playground, playerName) {
  let child;
  try {
    child = startBridge(playground, playerName, { NH_TEST_SCENARIO_ID: 'regression/downstairs-current' });
    await waitFor(() => child.output().stdout.includes('bridge_start'), 10000);
    await waitFor(() => /bridge_test_scenario_loaded/.test(child.output().stdout), 15000);
    await waitFor(() => /welcome to NetHack|Hello /i.test(child.output().stdout), 15000);
    const lockFile = await waitFor(() => findOwnLevelZeroLock(playground, child.pid), 10000);
    const base = path.basename(lockFile).replace(/\.0$/, '');
    child.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: '>'.charCodeAt(0) })}\n`);
    await waitFor(() => /You descend the stairs\.|Dlvl:?2|Dlvl\s*2/i.test(child.output().stdout), 20000);
    await waitFor(() => fileSize(lockFile) > 4096 && fileSize(path.join(playground, `${base}.1`)) > 1024 ? true : null, 10000);
    child.kill('SIGKILL');
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(3000)]);
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
  }))()`);
}

async function runNoPreviousFlow(results) {
  resetPlayground(noPreviousPlayground);
  const page = await Harness.createElectronBrowserDriver({
    root,
    port: 9651,
    width,
    height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_PLAYGROUND: noPreviousPlayground },
  });
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    results.noPrevious.initial = await waitFor(async () => {
      const state = await pageState(page);
      return state.startup.open && state.startup.continueHidden ? state : null;
    }, 10000);
    results.screenshots.noPreviousModal = await page.screenshot(path.join(outDir, '01-no-previous-startup-modal.png'));
    await page.click('#startup-new-game');
    await waitFor(async () => (await pageState(page)).dialogs.includes('character-dialog'), 5000);
    results.screenshots.noPreviousCharacter = await page.screenshot(path.join(outDir, '02-no-previous-character-dialog.png'));
    await page.setInputValue('#player-name', 'StartFlow');
    await page.click('#confirm-character');
    results.noPrevious.started = await waitFor(async () => {
      const state = await pageState(page);
      return state.running && state.mapCells > 0 ? state : null;
    }, 20000);
    results.screenshots.noPreviousStarted = await page.screenshot(path.join(outDir, '03-no-previous-new-game-started.png'));
  } finally {
    const output = page.output();
    fs.writeFileSync(path.join(outDir, 'no-previous-electron-stdout.log'), output.stdout);
    fs.writeFileSync(path.join(outDir, 'no-previous-electron-stderr.log'), output.stderr);
    await page.close().catch(() => {});
  }
}

async function runContinueFlow(results) {
  resetPlayground(continuePlayground);
  results.continue.createdSave = await createManualSave(continuePlayground, 'ContinueHero');
  assert(results.continue.createdSave.saveFiles.length > 0, 'setup must create a manual save file');
  const page = await Harness.createElectronBrowserDriver({
    root,
    port: 9652,
    width,
    height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_PLAYGROUND: continuePlayground },
  });
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    results.continue.initial = await waitFor(async () => {
      const state = await pageState(page);
      return state.startup.open && !state.startup.continueHidden && state.recovery?.hasContinue ? state : null;
    }, 10000);
    results.screenshots.continueModal = await page.screenshot(path.join(outDir, '04-continue-startup-modal.png'));
    await page.click('#startup-continue-game');
    results.continue.started = await waitFor(async () => {
      const state = await pageState(page);
      const log = state.messages.join('\n');
      return state.running && /Restoring save file|Welcome back|Velkommen back/i.test(log) ? state : null;
    }, 25000);
    results.screenshots.continuedGame = await page.screenshot(path.join(outDir, '05-continued-previous-game.png'));
  } finally {
    const output = page.output();
    fs.writeFileSync(path.join(outDir, 'continue-electron-stdout.log'), output.stdout);
    fs.writeFileSync(path.join(outDir, 'continue-electron-stderr.log'), output.stderr);
    await page.close().catch(() => {});
  }
}

async function runCheckpointContinueFlow(results) {
  resetPlayground(checkpointPlayground);
  results.checkpoint.createdCheckpoint = await createRecoverableCheckpoint(checkpointPlayground, 'CrashHero');
  assert(results.checkpoint.createdCheckpoint.lockSize > 4096, 'setup must create a recoverable checkpoint lock');
  const page = await Harness.createElectronBrowserDriver({
    root,
    port: 9653,
    width,
    height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_PLAYGROUND: checkpointPlayground },
  });
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    results.checkpoint.initial = await waitFor(async () => {
      const state = await pageState(page);
      return state.startup.open && !state.startup.continueHidden && state.recovery?.primaryCandidate?.kind === 'checkpoint' ? state : null;
    }, 10000);
    results.screenshots.checkpointModal = await page.screenshot(path.join(outDir, '06-checkpoint-startup-modal.png'));
    await page.click('#startup-continue-game');
    results.checkpoint.started = await waitFor(async () => {
      const state = await pageState(page);
      const log = state.messages.join('\n');
      return state.running && /Restoring save file|Welcome back|Velkommen back|Dlvl:?2|Dlvl\s*2/i.test(log) ? state : null;
    }, 30000);
    results.screenshots.checkpointContinuedGame = await page.screenshot(path.join(outDir, '07-checkpoint-recovered-game.png'));
  } finally {
    const output = page.output();
    fs.writeFileSync(path.join(outDir, 'checkpoint-electron-stdout.log'), output.stdout);
    fs.writeFileSync(path.join(outDir, 'checkpoint-electron-stderr.log'), output.stderr);
    await page.close().catch(() => {});
  }
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const results = { outDir, screenshots: {}, noPrevious: {}, continue: {}, checkpoint: {}, checks: {} };
  await runNoPreviousFlow(results);
  await runContinueFlow(results);
  await runCheckpointContinueFlow(results);
  results.checks = {
    noPreviousModalShown: results.noPrevious.initial?.startup?.open === true,
    noInvalidContinueOffered: results.noPrevious.initial?.startup?.continueHidden === true,
    noPreviousNewGameStarted: results.noPrevious.started?.running === true && results.noPrevious.started?.mapCells > 0,
    continueModalShown: results.continue.initial?.startup?.open === true,
    continueOptionOfferedForSave: results.continue.initial?.startup?.continueHidden === false,
    previousGameRestored: results.continue.started?.running === true,
    characterDialogSkippedOnContinue: !results.continue.started?.dialogs?.includes('character-dialog'),
    checkpointModalShown: results.checkpoint.initial?.startup?.open === true,
    checkpointOptionOffered: results.checkpoint.initial?.recovery?.primaryCandidate?.kind === 'checkpoint',
    checkpointRecoveredAndRestored: results.checkpoint.started?.running === true,
  };
  const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([name]) => name);
  fs.writeFileSync(path.join(outDir, 'real-startup-choice-summary.json'), JSON.stringify(results, null, 2));
  const md = ['# Real startup choice modal test', '', `Output: ${outDir}`, '', '## Checks', ...Object.entries(results.checks).map(([name, ok]) => `- ${ok ? 'PASS' : 'FAIL'} ${name}`), '', '## Screenshots', ...Object.entries(results.screenshots).map(([name, file]) => `- ${name}: ${file}`), ''].join('\n');
  fs.writeFileSync(path.join(outDir, 'real-startup-choice-summary.md'), md);
  console.log(md);
  if (failed.length) throw new Error(`startup choice checks failed: ${failed.join(', ')}`);
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
