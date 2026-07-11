#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const electronRoot = path.join(repoRoot, 'electron-poc');
const bridge = path.join(electronRoot, 'shim-bridge', 'nh-shim-bridge');
const sourcePlayground = path.join(repoRoot, 'playground');
const workRoot = path.join(electronRoot, 'test-output', 'bridge-lock-pid-tamper-regression');

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyIfExists(playground, name) {
  const src = path.join(sourcePlayground, name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(playground, name));
}

function readPid(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 4) return null;
  return buf.readInt32LE(0);
}

function writePid(file, pid) {
  const fd = fs.openSync(file, 'r+');
  try {
    const buf = Buffer.alloc(4);
    buf.writeInt32LE(pid, 0);
    fs.writeSync(fd, buf, 0, buf.length, 0);
  } finally {
    fs.closeSync(fd);
  }
}

async function waitFor(predicate, label, timeoutMs = 15000) {
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

function startBridge(playground, playerName) {
  const child = spawn(bridge, [`-u${playerName}-Val-Hum-Fem-Law`], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NH_TEST_PLAYGROUND: playground,
      NETHACKDIR: playground,
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_FORCE_DOWNSTAIRS_UNDER_HERO: '1',
      NH_TEST_SCENARIO_ID: 'regression/downstairs-current',
      NETHACK_SEED: '424242',
      NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none,disclose:+i +a +v +g +c +o',
    },
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

async function stop(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

function findOwnLevelZeroLock(playground, pid) {
  for (const name of fs.readdirSync(playground)) {
    if (!/lock\.0$/.test(name)) continue;
    const file = path.join(playground, name);
    if (readPid(file) === pid) return file;
  }
  return null;
}

async function preparePlayground(caseName) {
  const playground = path.join(workRoot, caseName, 'playground');
  fs.mkdirSync(playground, { recursive: true });
  for (const name of ['nhdat', 'sysconf', 'symbols', 'license', 'perm']) copyIfExists(playground, name);
  return playground;
}

async function runTamperCase({ caseName, playerName, tamperedPid, expectedPhase, expectLockPidAfter, expectNoLevelWrites = false, expectDescent = true }) {
  const playground = await preparePlayground(caseName);
  let child;
  try {
    child = startBridge(playground, playerName);
    await waitFor(() => child.output().stdout.includes('bridge_start'), `${caseName} bridge_start`);
    await waitFor(() => /bridge_test_scenario_loaded/.test(child.output().stdout), `${caseName} fixture scenario load`);
    await waitFor(() => /welcome to NetHack|Hello /.test(child.output().stdout), `${caseName} welcome`);

    const lockFile = await waitFor(() => findOwnLevelZeroLock(playground, child.pid), `${caseName} level.0 lock for pid ${child.pid}`);
    const originalPid = readPid(lockFile);
    assert.strictEqual(originalPid, child.pid, `${caseName}: should start with a lock owned by the bridge process`);

    writePid(lockFile, tamperedPid);
    assert.strictEqual(readPid(lockFile), tamperedPid, `${caseName}: should tamper the level.0 lock pid before descent`);
    const sentinelLevelFile = path.join(playground, 'alock.1');
    const sentinelBytes = Buffer.from('active-owner-level-sentinel\n', 'utf8');
    if (expectNoLevelWrites) fs.writeFileSync(sentinelLevelFile, sentinelBytes);
    const levelFilesBeforeCommand = fs.readdirSync(playground).filter((name) => /lock\.\d+$/.test(name)).sort();

    child.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: '>'.charCodeAt(0) })}\n`);

    const commandResult = await waitFor(() => {
      const out = child.output();
      const haystack = `${out.stdout}\n${out.stderr}`;
      if (/This game is void|Somebody is trying some trickery|done\.enter|really_done\.enter|disclose\.enter/.test(haystack)) {
        throw new Error(`${caseName}: unexpected trickery/game-over path after tamper:\n${haystack.slice(-4000)}`);
      }
      if (expectDescent) return /You descend the stairs\.|Dlvl:2|Dlvl\s*2/.test(haystack) ? out : null;
      return haystack.includes(`"phase":"${expectedPhase}"`) ? out : null;
    }, `${caseName} command completion without TRICKED after lock pid tamper`, 20000);

    await waitFor(() => readPid(lockFile) === expectLockPidAfter(child.pid), `${caseName} expected lock pid after checkpoint`);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const levelFilesAfter = fs.readdirSync(playground).filter((name) => /lock\.\d+$/.test(name)).sort();
    if (expectNoLevelWrites) {
      assert.deepStrictEqual(levelFilesAfter, levelFilesBeforeCommand, `${caseName}: active-pid checkpoint block must not create/truncate any level files`);
      assert.deepStrictEqual(fs.readFileSync(sentinelLevelFile), sentinelBytes, `${caseName}: active-pid checkpoint block must not overwrite existing level file contents`);
    }

    const events = child.output().events;
    const nativeEndEvents = events.filter((event) => event.name === 'shim_native_end_diagnostic');
    const recoveryEvents = events.filter((event) => event.name === 'shim_native_command_diagnostic' && event.phase === expectedPhase);
    assert.strictEqual(nativeEndEvents.length, 0, `${caseName}: mismatched lock pid must not emit native end diagnostics: ${JSON.stringify(nativeEndEvents)}`);
    assert(recoveryEvents.length >= 1, `${caseName}: mismatched lock pid should emit ${expectedPhase} diagnostic`);
    if (expectDescent) assert(/You descend the stairs\./.test(commandResult.stdout), `${caseName}: ordinary stairs descent message should still be emitted`);
    else assert(!/You descend the stairs\./.test(commandResult.stdout), `${caseName}: active-pid safety block should not descend or mutate level files`);

    return {
      ok: true,
      caseName,
      bridgePid: child.pid,
      originalPid,
      tamperedPid,
      expectedPhase,
      lockFile,
      lockPidAfter: readPid(lockFile),
      levelFilesBeforeCommand,
      levelFilesAfter,
      recoveryEvents,
      nativeEndEvents,
      stdoutTail: child.output().stdout.slice(-4000),
      stderrTail: child.output().stderr.slice(-4000),
    };
  } catch (error) {
    if (child) {
      const out = child.output();
      fs.writeFileSync(path.join(workRoot, `${caseName}-failure-output.log`), `${out.stdout}\n--- stderr ---\n${out.stderr}`);
      console.error(`${caseName} stdout tail:`, out.stdout.slice(-4000));
      console.error(`${caseName} stderr tail:`, out.stderr.slice(-4000));
    }
    throw error;
  } finally {
    await stop(child);
  }
}

(async () => {
  resetDir(workRoot);

  let sleeper;
  try {
    const stale = await runTamperCase({
      caseName: 'stale-pid-recovered',
      playerName: 'TamperA',
      tamperedPid: 2147400000,
      expectedPhase: 'lock.pid_mismatch.recovered',
      expectLockPidAfter: (bridgePid) => bridgePid,
    });

    sleeper = spawn('sleep', ['30'], { stdio: 'ignore' });
    const active = await runTamperCase({
      caseName: 'active-pid-skipped',
      playerName: 'TamperB',
      tamperedPid: sleeper.pid,
      expectedPhase: 'lock.pid_mismatch.active_pid.checkpoint_blocked',
      expectLockPidAfter: () => sleeper.pid,
      expectNoLevelWrites: true,
      expectDescent: false,
    });

    const summary = {
      ok: true,
      scenarioId: 'regression/downstairs-current',
      stale,
      active,
    };
    fs.writeFileSync(path.join(workRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (sleeper && !sleeper.killed) sleeper.kill('SIGTERM');
  }
})();
