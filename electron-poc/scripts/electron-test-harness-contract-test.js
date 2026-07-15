const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'nethack-electron-harness-contract-'));
const tempRoot = path.join(tempBase, 'electron-poc');
fs.mkdirSync(tempRoot);
const electronModulePath = require.resolve('electron');
require(electronModulePath);
const originalElectronExport = require.cache[electronModulePath].exports;
require.cache[electronModulePath].exports = process.execPath;
const harnessModulePath = require.resolve('./lib/electron-test-harness');
delete require.cache[harnessModulePath];
const Harness = require(harnessModulePath);
require.cache[electronModulePath].exports = originalElectronExport;

const originalFetch = global.fetch;
const originalWebSocket = global.WebSocket;
const fakeCdp = {
  fetchFailure: false,
  rendererReady: true,
  events: [],
  visibleInputChecks: 0,
};

class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = new Map();
    queueMicrotask(() => {
      this.readyState = 1;
      this.emit('open', {});
    });
  }

  addEventListener(type, listener, options = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ listener, once: Boolean(options.once) });
    this.listeners.set(type, listeners);
  }

  emit(type, event) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter(({ once }) => !once));
    for (const { listener } of listeners) listener(event);
  }

  send(payload) {
    const call = JSON.parse(payload);
    fakeCdp.events.push({ method: call.method, params: call.params, url: this.url });
    let result = {};
    if (call.method === 'Runtime.evaluate') {
      const expression = call.params.expression;
      if (expression.includes('THROW_RENDERER_EXCEPTION')) {
        result = {
          exceptionDetails: {
            text: 'Uncaught',
            exception: { description: 'Error: renderer exploded\n    at contract-test:1:1' },
          },
          result: { type: 'object', subtype: 'error' },
        };
      } else if (expression.includes("document.readyState === 'complete'")) {
        result = { result: { type: 'boolean', value: fakeCdp.rendererReady } };
      } else if (expression.includes('requestAnimationFrame')) {
        const frames = expression.match(/requestAnimationFrame/g) || [];
        if (!call.params.awaitPromise || frames.length < 2 || !expression.includes('document.fonts')) {
          result = { exceptionDetails: { text: 'stable paint barrier is incomplete' }, result: {} };
        } else {
          result = { result: { type: 'boolean', value: true } };
        }
      } else if (expression.includes('const input = el instanceof HTMLInputElement')) {
        const checksVisibility = expression.includes("style.visibility === 'hidden'")
          && expression.includes("style.display === 'none'")
          && expression.includes('el.disabled')
          && expression.includes('getBoundingClientRect()');
        fakeCdp.visibleInputChecks += Number(checksVisibility);
        result = checksVisibility
          ? { result: { type: 'string', value: 'Ada' } }
          : { exceptionDetails: { text: 'visible input checks missing' }, result: {} };
      } else {
        result = { result: { type: 'boolean', value: true } };
      }
    } else if (call.method === 'Page.captureScreenshot') {
      result = { data: Buffer.from('stable-png-contract-bytes').toString('base64') };
    }
    queueMicrotask(() => this.emit('message', { data: JSON.stringify({ id: call.id, result }) }));
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    queueMicrotask(() => this.emit('close', {}));
  }
}

function installFakeCdp() {
  global.fetch = async (url) => {
    fakeCdp.events.push({ method: 'HTTP.getTargets', url: String(url) });
    if (fakeCdp.fetchFailure) throw new Error('fake CDP endpoint unavailable');
    const port = new URL(url).port;
    return {
      ok: true,
      status: 200,
      async json() {
        return [{ type: 'page', webSocketDebuggerUrl: `ws://fake-cdp/${port}` }];
      },
    };
  };
  global.WebSocket = FakeWebSocket;
}

function createFakeElectronRoot() {
  fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({ main: 'fake-electron.js' }));
  fs.writeFileSync(path.join(tempRoot, 'fake-electron.js'), `
const fs = require('node:fs');
const path = require('node:path');
const port = process.env.AI_ORG_ELECTRON_CDP_PORT;
process.stdout.write('fake electron ready on ' + port + '\\n');
process.stderr.write('fake electron diagnostics for ' + port + '\\n');
if (process.env.FAKE_PLAYGROUND_LOCK === '1') {
  const playground = path.resolve(process.cwd(), '..', 'playground');
  fs.mkdirSync(playground, { recursive: true });
  const pid = Buffer.alloc(4);
  pid.writeInt32LE(process.pid);
  fs.writeFileSync(path.join(playground, 'tlock.' + process.pid), pid);
}
if (process.env.FAKE_LAUNCH_FAILURE === '1') {
  process.stderr.write('intentional launch failure\\n');
  setTimeout(() => process.exit(23), 5);
} else {
  process.on('SIGTERM', () => process.exit(0));
  setInterval(() => {}, 1000);
}
`);
}

function processIsRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(child, timeoutMs = 3000) {
  if (child.exitCode != null || child.signalCode != null) return { code: child.exitCode, signal: child.signalCode };
  return Promise.race([
    new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal }))),
    Harness.delay(timeoutMs).then(() => null),
  ]);
}

async function testConcurrentRunIsolation(openDrivers) {
  fakeCdp.rendererReady = true;
  fakeCdp.fetchFailure = false;
  const [first, second] = await Promise.all([
    Harness.createElectronBrowserDriver({ root: tempRoot, timeoutMs: 500, teardownTimeoutMs: 100 }),
    Harness.createElectronBrowserDriver({ root: tempRoot, timeoutMs: 500, teardownTimeoutMs: 100 }),
  ]);
  openDrivers.add(first);
  openDrivers.add(second);
  assert.notEqual(first.port, second.port, 'concurrent Verification Runs receive distinct CDP ports');
  assert(first.port > 0 && second.port > 0, 'allocated CDP ports are valid');
  assert.notEqual(first.outputIdentity, second.outputIdentity, 'concurrent Verification Runs receive distinct output identities');
  assert.notEqual(first.outputDir, second.outputDir, 'concurrent Verification Runs retain isolated output directories');
  assert.equal(path.basename(first.outputDir), first.outputIdentity);
  assert.equal(path.basename(second.outputDir), second.outputIdentity);
  assert(fs.existsSync(first.logs.stdout));
  assert(fs.existsSync(second.logs.stderr));

  await assert.rejects(
    first.evalCheckedValue('THROW_RENDERER_EXCEPTION'),
    /Runtime\.evaluate exception: Error: renderer exploded/,
    'checked renderer evaluation propagates renderer exceptions',
  );
  assert.equal(await first.setInputValue('#player-name', 'Ada'), 'Ada');
  assert.equal(fakeCdp.visibleInputChecks, 1, 'visible input path checks type, layout, style, and enabled state');

  fakeCdp.events.length = 0;
  const screenshot = path.join(first.outputDir, 'stable.png');
  await first.screenshot(screenshot);
  assert.equal(fs.readFileSync(screenshot, 'utf8'), 'stable-png-contract-bytes');
  const paintIndex = fakeCdp.events.findIndex(({ method, params }) => method === 'Runtime.evaluate' && params.expression.includes('requestAnimationFrame'));
  const captureIndex = fakeCdp.events.findIndex(({ method }) => method === 'Page.captureScreenshot');
  assert(paintIndex >= 0 && captureIndex > paintIndex, 'screenshot waits for the stable-paint barrier before capture');

  await Promise.all([first.close(), second.close()]);
  openDrivers.delete(first);
  openDrivers.delete(second);
}

async function testLaunchFailureRetainsLogsAndCleansUp() {
  fakeCdp.fetchFailure = true;
  let failure;
  try {
    await Harness.createElectronBrowserDriver({
      root: tempRoot,
      env: { FAKE_LAUNCH_FAILURE: '1' },
      timeoutMs: 500,
      teardownTimeoutMs: 50,
    });
  } catch (error) {
    failure = error;
  } finally {
    fakeCdp.fetchFailure = false;
  }
  assert(failure, 'launch failure must reject the Verification Run');
  assert.match(failure.message, /Electron exited during CDP connection/);
  assert.equal(failure.verificationRun.phase, 'CDP connection');
  assert.equal(processIsRunning(failure.verificationRun.childPid), false, 'failed Electron child is reaped');
  assert.match(fs.readFileSync(failure.verificationRun.logs.stderr, 'utf8'), /intentional launch failure/);
  assert.match(failure.message, /logs:/, 'failure points at retained logs');
}

async function testReadinessFailureRetainsLogsAndCleansLocks() {
  fakeCdp.rendererReady = false;
  let failure;
  try {
    await Harness.createElectronBrowserDriver({
      root: tempRoot,
      env: { FAKE_PLAYGROUND_LOCK: '1' },
      timeoutMs: 500,
      readinessTimeoutMs: 40,
      readinessStepMs: 5,
      teardownTimeoutMs: 100,
    });
  } catch (error) {
    failure = error;
  } finally {
    fakeCdp.rendererReady = true;
  }
  assert(failure, 'renderer readiness failure must reject the Verification Run');
  assert.equal(failure.verificationRun.phase, 'renderer readiness');
  assert.equal(processIsRunning(failure.verificationRun.childPid), false, 'readiness failure tears Electron down');
  assert.match(fs.readFileSync(failure.verificationRun.logs.stdout, 'utf8'), /fake electron ready/);
  assert(failure.verificationRun.removedLocks.some(({ name }) => name.startsWith('tlock.')), 'readiness failure removes its stale playground lock');
  assert.equal(Harness.playgroundLockFiles({ root: tempRoot }).some(({ name }) => name.startsWith('tlock.')), false);
}

async function testTerminateEscalatesAfterPriorSignal() {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"], { stdio: 'ignore' });
  await Harness.delay(100);
  child.kill('SIGTERM');
  assert.equal(child.killed, true, 'precondition: child.killed only means a signal was sent');
  const started = Date.now();
  const termination = await Harness.terminateElectron(child, null, 100);
  const elapsedMs = Date.now() - started;
  const exit = await waitForExit(child, 3000);
  assert(exit, 'terminateElectron should not leave a SIGTERM-ignoring child alive');
  assert.equal(exit.signal, 'SIGKILL');
  assert.equal(termination.escalated, true);
  assert(elapsedMs < 1000, `teardown must remain bounded, took ${elapsedMs}ms`);
}

async function main() {
  createFakeElectronRoot();
  installFakeCdp();
  const openDrivers = new Set();
  try {
    assert.equal(Harness.version, 'nethack-electron-cdp-test-harness/v3');
    assert.equal(typeof Harness.screenshotQc.createScreenshotQc, 'function');
    assert.equal(typeof Harness.screenshotQc.validateManifest, 'function');
    assert.equal(Harness.keyEventParams('Escape').text, '');
    assert.equal(Harness.keyEventParams('Enter', '\n').text, '');
    assert.equal(Harness.keyEventParams('?', '?').text, '?');
    assert.throws(() => Harness.launchElectron({ root: tempRoot }), /requires an allocated CDP port/, 'raw launch has no fixed default port');
    await testConcurrentRunIsolation(openDrivers);
    await testLaunchFailureRetainsLogsAndCleansUp();
    await testReadinessFailureRetainsLogsAndCleansLocks();
    await testTerminateEscalatesAfterPriorSignal();
    console.log('electron test harness contract OK');
  } finally {
    await Promise.all(Array.from(openDrivers, (driver) => driver.close().catch(() => {})));
    global.fetch = originalFetch;
    global.WebSocket = originalWebSocket;
    fs.rmSync(tempBase, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
