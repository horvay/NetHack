#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const electronRoot = path.join(repoRoot, 'electron-poc');
const bridge = path.join(electronRoot, 'shim-bridge', 'nh-shim-bridge');
const sourcePlayground = path.join(repoRoot, 'playground');
const recoverBin = fs.existsSync(path.join(repoRoot, 'util', 'recover'))
  ? path.join(repoRoot, 'util', 'recover')
  : path.join(sourcePlayground, 'recover');
const workRoot = path.join(electronRoot, 'test-output', 'bridge-level-change-checkpoint-recovery');
const playground = path.join(workRoot, 'playground');
const playerName = 'CheckpointA';

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyIfExists(name) {
  const src = path.join(sourcePlayground, name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(playground, name));
}

function readPid(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 4) return null;
  return buf.readInt32LE(0);
}

function bridgeEnv(extra = {}) {
  return {
    ...process.env,
    NH_TEST_PLAYGROUND: playground,
    NETHACKDIR: playground,
    NH_ELECTRON_TEST_FIXTURES: '1',
    NETHACK_SEED: '424242',
    NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none,disclose:+i +a +v +g +c +o',
    ...extra,
  };
}

async function waitFor(predicate, label, timeoutMs = 20000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw last || new Error(`timed out waiting for ${label}`);
}

function startBridge(extraEnv = {}) {
  const child = spawn(bridge, [`-u${playerName}-Val-Hum-Fem-Law`], {
    cwd: repoRoot,
    env: bridgeEnv(extraEnv),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stdout = '';
  let stderr = '';
  const events = [];
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
      try { events.push(JSON.parse(line)); } catch {}
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.output = () => ({ stdout, stderr, events });
  return child;
}

async function stop(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill(signal);
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2500);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

function findOwnLevelZeroLock(pid) {
  for (const name of fs.readdirSync(playground)) {
    if (!/lock\.0$/.test(name)) continue;
    const file = path.join(playground, name);
    if (readPid(file) === pid) return file;
  }
  return null;
}

function lockBase(lockFile) {
  return path.basename(lockFile).replace(/\.0$/, '');
}

function fileSize(file) {
  return fs.existsSync(file) ? fs.statSync(file).size : 0;
}

function listSaveFiles() {
  const saveDir = path.join(playground, 'save');
  if (!fs.existsSync(saveDir)) return [];
  return fs.readdirSync(saveDir).map((name) => path.join(saveDir, name));
}

function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

(async () => {
  resetDir(workRoot);
  fs.mkdirSync(playground, { recursive: true });
  fs.mkdirSync(path.join(playground, 'save'), { recursive: true });
  for (const name of ['nhdat', 'sysconf', 'symbols', 'license', 'perm']) copyIfExists(name);

  let child;
  let restored;
  try {
    child = startBridge({ NH_TEST_SCENARIO_ID: 'regression/downstairs-current' });
    await waitFor(() => child.output().stdout.includes('bridge_start'), 'bridge_start');
    await waitFor(() => /bridge_test_scenario_loaded/.test(child.output().stdout), 'fixture scenario load');
    await waitFor(() => /welcome to NetHack|Hello /.test(child.output().stdout), 'new game welcome');

    const lockFile = await waitFor(() => findOwnLevelZeroLock(child.pid), `level.0 lock for pid ${child.pid}`);
    const base = lockBase(lockFile);
    const initialLockSize = fileSize(lockFile);
    assert.strictEqual(initialLockSize, 4, `new Dlvl:1 game should initially have only the pid lock before any checkpoint, got ${initialLockSize} bytes`);

    child.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: '>'.charCodeAt(0) })}\n`);
    await waitFor(() => {
      const haystack = child.output().stdout;
      return /You descend the stairs\.|Dlvl:?2|Dlvl\s*2/.test(haystack) ? true : null;
    }, 'stairs descent to Dlvl:2');

    const levelZeroAfter = await waitFor(() => fileSize(lockFile) > 4096 ? fileSize(lockFile) : null, 'level.0 checkpoint game state');
    const level1File = path.join(playground, `${base}.1`);
    const level2File = path.join(playground, `${base}.2`);
    await waitFor(() => fileSize(level1File) > 4096 && fileSize(level2File) > 4096 ? true : null, 'old and new level checkpoint files');

    await stop(child, 'SIGKILL');
    assert(!pidIsAlive(child.pid), `interrupted bridge process ${child.pid} must be dead before recovery`);

    const recover = spawnSync(recoverBin, ['-d', playground, base], {
      cwd: repoRoot,
      env: { ...process.env, NETHACKDIR: playground },
      encoding: 'utf8',
    });
    assert.strictEqual(recover.status, 0, `recover utility failed\nstdout:\n${recover.stdout}\nstderr:\n${recover.stderr}`);
    const saveFilesAfterRecover = listSaveFiles();
    assert(saveFilesAfterRecover.length >= 1, 'recover should create a save file');

    restored = startBridge();
    await waitFor(() => restored.output().stdout.includes('bridge_start'), 'restored bridge_start');
    const restoredOutput = await waitFor(() => {
      const out = restored.output();
      const haystack = `${out.stdout}\n${out.stderr}`;
      if (/Error|cannot|couldn't recover|Recovery impossible/i.test(haystack)) {
        throw new Error(`unexpected recovery/restore error:\n${haystack.slice(-4000)}`);
      }
      return /Restoring save file|Welcome back|Velkommen back|Dlvl:?2|Dlvl\s*2/i.test(haystack) ? out : null;
    }, 'restored game startup');
    await waitFor(() => /Dlvl:?2|Dlvl\s*2/i.test(`${restored.output().stdout}\n${restored.output().stderr}`), 'restored game on Dlvl:2');
    const promptCountBeforeWait = restored.output().events.filter((event) => event.name === 'bridge_command_prompt').length;
    restored.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: '.'.charCodeAt(0) })}\n`);
    await waitFor(() => {
      const out = restored.output();
      const promptCount = out.events.filter((event) => event.name === 'bridge_command_prompt').length;
      const waitCommands = out.events.filter((event) => event.name === 'bridge_command' && event.keycode === '.'.charCodeAt(0));
      return waitCommands.length >= 1 && promptCount > promptCountBeforeWait ? true : null;
    }, 'restored game accepts a wait command and returns to command prompt');
    const saveFilesAfterRestore = listSaveFiles();
    assert.strictEqual(saveFilesAfterRestore.length, 0, `normal restore should consume recovered save file, found ${saveFilesAfterRestore.join(', ')}`);

    const summary = {
      ok: true,
      playerName,
      base,
      bridgePid: child.pid,
      initialLockFile: lockFile,
      initialLockSize,
      checkpointSizes: {
        level0: levelZeroAfter,
        level1: fileSize(level1File),
        level2: fileSize(level2File),
      },
      recover: {
        bin: recoverBin,
        status: recover.status,
        stdout: recover.stdout.trim(),
        stderr: recover.stderr.trim(),
        saveFilesAfterRecover,
      },
      restoredPid: restored.pid,
      saveFilesAfterRestore,
      restoredStdoutTail: restoredOutput.stdout.slice(-4000),
      restoredStderrTail: restoredOutput.stderr.slice(-4000),
    };
    fs.writeFileSync(path.join(workRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    if (child) {
      const out = child.output();
      fs.writeFileSync(path.join(workRoot, 'new-game-output.log'), `${out.stdout}\n--- stderr ---\n${out.stderr}`);
      console.error('new game stdout tail:', out.stdout.slice(-4000));
      console.error('new game stderr tail:', out.stderr.slice(-4000));
    }
    if (restored) {
      const out = restored.output();
      fs.writeFileSync(path.join(workRoot, 'restored-output.log'), `${out.stdout}\n--- stderr ---\n${out.stderr}`);
      console.error('restored stdout tail:', out.stdout.slice(-4000));
      console.error('restored stderr tail:', out.stderr.slice(-4000));
    }
    throw error;
  } finally {
    await stop(restored);
    await stop(child);
  }
})();
