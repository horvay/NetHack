#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const electronRoot = path.join(repoRoot, 'electron-poc');
const bridge = path.join(electronRoot, 'shim-bridge', 'nh-shim-bridge');
const sourcePlayground = path.join(repoRoot, 'playground');
const workRoot = path.join(electronRoot, 'test-output', 'bridge-lock-isolation');
const playground = path.join(workRoot, 'playground');

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

async function waitFor(predicate, label, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${label}`);
}

function startBridge(player) {
  const child = spawn(bridge, [player], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NH_TEST_PLAYGROUND: playground,
      NETHACKDIR: playground,
      NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none',
    },
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

async function stop(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

(async () => {
  resetDir(workRoot);
  fs.mkdirSync(playground, { recursive: true });
  for (const name of ['nhdat', 'sysconf', 'symbols', 'license', 'perm']) copyIfExists(name);

  let first;
  let second;
  try {
    first = startBridge('-uLockA-Val-Hum-Fem-Law');
    await waitFor(() => first.output().stdout.includes('bridge_start'), 'first bridge_start');
    const alock = path.join(playground, 'alock.0');
    await waitFor(() => fs.existsSync(alock), 'first alock.0');
    await waitFor(() => readPid(alock) === first.pid, `alock.0 to contain first pid ${first.pid}`);

    second = startBridge('-uLockB-Val-Hum-Fem-Law');
    await waitFor(() => second.output().stdout.includes('bridge_start'), 'second bridge_start');

    const firstLockPidAfterSecondStart = readPid(alock);
    assert.strictEqual(
      firstLockPidAfterSecondStart,
      first.pid,
      `second bridge must not delete or overwrite active alock.0; expected ${first.pid}, got ${firstLockPidAfterSecondStart}`,
    );

    const siblingLock = await waitFor(() => {
      for (let code = 'b'.charCodeAt(0); code <= 'z'.charCodeAt(0); code += 1) {
        const file = path.join(playground, `${String.fromCharCode(code)}lock.0`);
        if (fs.existsSync(file) && readPid(file) === second.pid) return file;
      }
      return null;
    }, `a separate lock file for second pid ${second.pid}`);

    console.log(JSON.stringify({ ok: true, firstPid: first.pid, secondPid: second.pid, firstLock: alock, secondLock: siblingLock }, null, 2));
  } catch (error) {
    if (first) {
      const out = first.output();
      console.error('first stdout tail:', out.stdout.slice(-2000));
      console.error('first stderr tail:', out.stderr.slice(-2000));
    }
    if (second) {
      const out = second.output();
      console.error('second stdout tail:', out.stdout.slice(-2000));
      console.error('second stderr tail:', out.stderr.slice(-2000));
    }
    throw error;
  } finally {
    await stop(second);
    await stop(first);
  }
})();
