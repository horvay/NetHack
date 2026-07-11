#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const electronRoot = path.join(repoRoot, 'electron-poc');
const bridge = path.join(electronRoot, 'shim-bridge', 'nh-shim-bridge');
const sourcePlayground = path.join(repoRoot, 'playground');
const workRoot = path.join(electronRoot, 'test-output', 'bridge-checkpoint-failure-retry');
const playground = path.join(workRoot, 'playground');
const playerName = 'CheckpointRetry';

function resetDir(dir) { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); }
function copyIfExists(name) { const src = path.join(sourcePlayground, name); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(playground, name)); }
function readPid(file) { const buf = fs.readFileSync(file); return buf.length < 4 ? null : buf.readInt32LE(0); }
function fileSize(file) { return fs.existsSync(file) ? fs.statSync(file).size : 0; }
async function waitFor(predicate, label, timeoutMs = 20000) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeoutMs) {
    try { const value = await predicate(); if (value) return value; } catch (error) { last = error; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw last || new Error(`timed out waiting for ${label}`);
}
function startBridge() {
  const child = spawn(bridge, [`-u${playerName}-Val-Hum-Fem-Law`], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NH_TEST_PLAYGROUND: playground,
      NETHACKDIR: playground,
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_SCENARIO_ID: 'regression/downstairs-current',
      NH_TEST_FORCE_DOWNSTAIRS_UNDER_HERO: '1',
      NH_TEST_FAIL_CURRENTLEVEL_REWRITE_IN_CHECKPOINT_ONCE: '1',
      NETHACK_SEED: '424242',
      NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none,disclose:+i +a +v +g +c +o',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  let stdout = ''; let stderr = ''; const events = [];
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    for (const line of chunk.split(/\r?\n/).filter(Boolean)) { try { events.push(JSON.parse(line)); } catch {} }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.output = () => ({ stdout, stderr, events });
  return child;
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => { const timer = setTimeout(resolve, 2500); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
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
function lockBase(lockFile) { return path.basename(lockFile).replace(/\.0$/, ''); }
function sendDescent(child) { child.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: '>'.charCodeAt(0) })}\n`); }

(async () => {
  resetDir(workRoot); fs.mkdirSync(playground, { recursive: true }); fs.mkdirSync(path.join(playground, 'save'), { recursive: true });
  for (const name of ['nhdat', 'sysconf', 'symbols', 'license', 'perm']) copyIfExists(name);
  let child;
  try {
    child = startBridge();
    await waitFor(() => child.output().stdout.includes('bridge_start'), 'bridge_start');
    await waitFor(() => /bridge_test_scenario_loaded/.test(child.output().stdout), 'fixture scenario load');
    await waitFor(() => /welcome to NetHack|Hello /.test(child.output().stdout), 'new game welcome');

    const lockFile = await waitFor(() => findOwnLevelZeroLock(child.pid), `level.0 lock for pid ${child.pid}`);
    const base = lockBase(lockFile);
    assert.strictEqual(fileSize(lockFile), 4, 'pre-checkpoint level.0 should contain only the pid lock');

    sendDescent(child);
    await waitFor(() => /Test fixture: current level checkpoint write failed\.|Dlvl:?2|Dlvl\s*2/.test(child.output().stdout), 'first descent with forced checkpoint rewrite failure');
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.strictEqual(fileSize(lockFile), 4, 'forced failed save_currentstate() must leave level.0 as pid-only for this attempt');

    sendDescent(child);
    await waitFor(() => /Dlvl:?3|Dlvl\s*3/.test(child.output().stdout), 'second descent after failed checkpoint');
    const levelZeroAfterRetry = await waitFor(() => fileSize(lockFile) > 4096 ? fileSize(lockFile) : null, 'retry checkpoint level.0 game state');
    const level2File = path.join(playground, `${base}.2`);
    const checkpointLevelFiles = await waitFor(() => {
      const files = fs.readdirSync(playground)
        .filter((name) => name.startsWith(`${base}.`) && name !== `${base}.0`)
        .map((name) => ({ name, file: path.join(playground, name), size: fileSize(path.join(playground, name)) }))
        .filter((entry) => entry.size > 4096)
        .sort((a, b) => a.name.localeCompare(b.name));
      return fileSize(level2File) > 4096 && files.length >= 3 ? files : null;
    }, 'retry checkpoint level files');

    const summary = {
      ok: true,
      playerName,
      base,
      bridgePid: child.pid,
      lockFile,
      levelZeroAfterRetry,
      level2Size: fileSize(level2File),
      checkpointLevelFiles,
      stdoutTail: child.output().stdout.slice(-4000),
      stderrTail: child.output().stderr.slice(-4000),
    };
    fs.writeFileSync(path.join(workRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    if (child) {
      const out = child.output();
      fs.writeFileSync(path.join(workRoot, 'failure-output.log'), `${out.stdout}\n--- stderr ---\n${out.stderr}`);
      console.error('stdout tail:', out.stdout.slice(-4000));
      console.error('stderr tail:', out.stderr.slice(-4000));
    }
    throw error;
  } finally {
    await stop(child);
  }
})();
