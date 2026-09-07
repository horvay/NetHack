const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');
const ScreenshotQc = require('./screenshot-qc');

const defaultRoot = path.resolve(__dirname, '..', '..');
const allocatedPorts = new Set();

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function playgroundDirForRoot(root = defaultRoot) {
  return path.resolve(root, '..', 'playground');
}

function readLockPid(file) {
  try {
    const buffer = fs.readFileSync(file);
    if (buffer.length < 4) return null;
    const pid = buffer.readInt32LE(0);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function pidIsRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function playgroundLockFiles({ root = defaultRoot } = {}) {
  const dir = playgroundDirForRoot(root);
  try {
    return fs.readdirSync(dir)
      .filter((name) => /^[a-z]lock\.\d+$/i.test(name))
      .map((name) => {
        const file = path.join(dir, name);
        const pid = readLockPid(file);
        return { file, name, pid, active: pidIsRunning(pid) };
      });
  } catch {
    return [];
  }
}

function removeStalePlaygroundLocks({ root = defaultRoot, knownFiles } = {}) {
  const known = knownFiles ? new Set(Array.from(knownFiles)) : null;
  const removed = [];
  for (const lock of playgroundLockFiles({ root })) {
    if (known && !known.has(lock.file)) continue;
    if (lock.active) continue;
    try {
      fs.rmSync(lock.file, { force: true });
      removed.push(lock);
    } catch {}
  }
  return removed;
}

async function waitFor(fn, timeoutMs = 15000, stepMs = 150) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(stepMs);
  }
  throw lastError || new Error('timed out waiting');
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const rejectPending = (reason) => {
    const error = reason instanceof Error ? reason : new Error('CDP connection closed');
    for (const call of pending.values()) call.reject(error);
    pending.clear();
  };
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  ws.addEventListener('close', () => rejectPending(new Error('CDP connection closed')));
  ws.addEventListener('error', () => rejectPending(new Error('CDP connection failed')));
  return Object.freeze({
    send(method, params = {}) {
      if (ws.readyState != null && ws.readyState > 1) return Promise.reject(new Error('CDP connection is not open'));
      const callId = ++id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
    },
    close() { ws.close(); },
  });
}

function validPort(port) {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

async function reserveAvailablePort(requestedPort) {
  if (requestedPort != null) {
    const port = Number(requestedPort);
    if (!validPort(port)) throw new TypeError(`invalid CDP port: ${requestedPort}`);
    return Object.freeze({ port, release: async () => {} });
  }

  for (;;) {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve);
    });
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : null;
    if (!validPort(port) || allocatedPorts.has(port)) {
      await new Promise((resolve) => server.close(resolve));
      continue;
    }
    allocatedPorts.add(port);
    let released = false;
    return Object.freeze({
      port,
      async release() {
        if (released) return;
        released = true;
        await new Promise((resolve) => server.close(resolve));
      },
    });
  }
}

function createOutputIdentity() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  return `verification-run-${timestamp}-${process.pid}-${crypto.randomUUID()}`;
}

function prepareRunOutput({ root, outputIdentity, outputDir } = {}) {
  const identity = outputIdentity == null ? createOutputIdentity() : String(outputIdentity);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(identity)) throw new TypeError(`invalid output identity: ${identity}`);
  const dir = outputDir
    ? path.resolve(outputDir)
    : path.join(root, 'test-output', 'verification-runs', identity);
  fs.mkdirSync(dir, { recursive: true });
  const logs = Object.freeze({
    stdout: path.join(dir, 'electron-stdout.log'),
    stderr: path.join(dir, 'electron-stderr.log'),
  });
  fs.closeSync(fs.openSync(logs.stdout, 'a'));
  fs.closeSync(fs.openSync(logs.stderr, 'a'));
  return Object.freeze({ outputIdentity: identity, outputDir: dir, logs });
}

function appendLog(file, data) {
  try { fs.appendFileSync(file, data); } catch {}
}

function launchElectron({ root = defaultRoot, port, width, height, env = {}, stdio = ['ignore', 'pipe', 'pipe'], outputDir, logs, userDataDir } = {}) {
  if (!validPort(Number(port))) throw new TypeError('launchElectron requires an allocated CDP port');
  const logPaths = logs || (outputDir ? Object.freeze({
    stdout: path.join(outputDir, 'electron-stdout.log'),
    stderr: path.join(outputDir, 'electron-stderr.log'),
  }) : null);
  if (logPaths) {
    fs.mkdirSync(path.dirname(logPaths.stdout), { recursive: true });
    fs.closeSync(fs.openSync(logPaths.stdout, 'a'));
    fs.closeSync(fs.openSync(logPaths.stderr, 'a'));
  }
  // Keep automated screenshot animation frames independent of compositor vsync.
  const child = spawn(electronBin, [...(userDataDir ? [`--user-data-dir=${path.resolve(userDataDir)}`] : []), '.', '--disable-frame-rate-limit'], {
    cwd: root,
    env: {
      ...process.env,
      ...env,
      AI_ORG_ELECTRON_CDP_PORT: String(port),
      ...(width ? { NH_ELECTRON_WINDOW_WIDTH: String(width) } : {}),
      ...(height ? { NH_ELECTRON_WINDOW_HEIGHT: String(height) } : {}),
    },
    stdio,
  });
  const output = { stdout: [], stderr: [] };
  const exited = new Promise((resolve) => {
    child.once('error', (error) => resolve({ error, code: child.exitCode, signal: child.signalCode }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  Object.defineProperties(child, {
    harnessOutput: { value: output, enumerable: false },
    harnessOutputPaths: { value: logPaths, enumerable: false },
    harnessExited: { value: exited, enumerable: false },
  });
  if (child.stdout) child.stdout.on('data', (data) => {
    output.stdout.push(String(data));
    if (logPaths) appendLog(logPaths.stdout, data);
    process.stdout.write(data);
  });
  if (child.stderr) child.stderr.on('data', (data) => {
    output.stderr.push(String(data));
    if (logPaths) appendLog(logPaths.stderr, data);
    process.stderr.write(data);
  });
  child.once('error', (error) => {
    if (logPaths) appendLog(logPaths.stderr, `Electron launch error: ${error.stack || error}\n`);
  });
  return child;
}

async function connectToElectronPage({ port, timeoutMs = 20000, enable = true } = {}) {
  if (!validPort(Number(port))) throw new TypeError('connectToElectronPage requires an allocated CDP port');
  const pages = await waitFor(async () => {
    const list = await json(`http://127.0.0.1:${port}/json/list`);
    return list.find((page) => page.type === 'page') ? list : null;
  }, timeoutMs);
  const page = pages.find((candidate) => candidate.type === 'page') || pages[0];
  const cdp = await connect(page.webSocketDebuggerUrl);
  if (enable) {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
  }
  return { cdp, page, pages };
}

async function evaluate(cdp, expression, options = {}) {
  return cdp.send('Runtime.evaluate', { returnByValue: true, expression, ...options });
}

function describeRuntimeException(result) {
  const details = result && result.exceptionDetails;
  if (!details) return null;
  const text = details.exception?.description || details.text || JSON.stringify(details);
  return `Runtime.evaluate exception: ${text}`;
}

async function evaluateChecked(cdp, expression, options = {}) {
  const result = await evaluate(cdp, expression, options);
  const exception = describeRuntimeException(result);
  if (exception) throw new Error(exception);
  return result;
}

async function evaluateValue(cdp, expression, options = {}) {
  return (await evaluateChecked(cdp, expression, options)).result.value;
}

async function waitForExpression(cdp, expression, timeoutMs = 10000, stepMs = 150) {
  return waitFor(async () => (await evaluate(cdp, expression)).result.value, timeoutMs, stepMs);
}

async function waitForCheckedExpression(cdp, expression, timeoutMs = 10000, stepMs = 150) {
  return waitFor(async () => evaluateValue(cdp, expression), timeoutMs, stepMs);
}

async function setViewport(cdp, { width, height, deviceScaleFactor = 1, mobile = false }) {
  return cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile });
}

async function waitForStablePaint(cdp, { timeoutMs = 3000 } = {}) {
  const paintBarrier = evaluateValue(cdp, `new Promise(async (resolve) => {
    if (document.fonts?.ready) await document.fonts.ready;
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
  })`, { awaitPromise: true });
  let timer;
  try {
    return await Promise.race([
      paintBarrier,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timed out waiting for stable renderer paint')), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function captureScreenshot(cdp, file, options = {}) {
  const { stablePaint = true, stablePaintTimeoutMs, ...captureOptions } = options;
  if (stablePaint) await waitForStablePaint(cdp, { timeoutMs: stablePaintTimeoutMs });
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, ...captureOptions });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  return file;
}

async function visibleElementBox(cdp, selector) {
  return evaluateValue(cdp, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView?.({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (!r.width || !r.height || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0 || el.disabled) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })()`);
}

async function setInputValue(cdp, selector, value) {
  return evaluateValue(cdp, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('missing input ' + ${JSON.stringify(selector)});
    const input = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (!input || !r.width || !r.height || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0 || el.disabled) {
      throw new Error('input is not visible and enabled ' + ${JSON.stringify(selector)});
    }
    el.scrollIntoView?.({ block: 'center', inline: 'center' });
    el.focus();
    el.value = ${JSON.stringify(String(value ?? ''))};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  })()`);
}

async function clickSelector(cdp, selector, { timeoutMs = 10000 } = {}) {
  const box = await waitFor(() => visibleElementBox(cdp, selector), timeoutMs);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  return box;
}

function keyEventParams(key, text = key) {
  const virtualKeyCode = key.length === 1 ? key.toUpperCase().charCodeAt(0) : (key === 'Escape' ? 27 : (key === 'Enter' ? 13 : 0));
  const code = key.length === 1 ? `Key${key.toUpperCase()}` : key;
  const printableText = key.length === 1 ? String(text ?? key) : '';
  return Object.freeze({ key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode, text: printableText });
}

async function pressKey(cdp, key, text = key) {
  const params = keyEventParams(key, text);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params, text: undefined });
}


function childHasExited(child) {
  return !child || child.exitCode != null || child.signalCode != null;
}

async function terminateElectron(child, cdp, timeoutMs = 2000) {
  try { cdp?.close(); } catch {}
  if (childHasExited(child)) return Object.freeze({ exited: true, escalated: false });
  const closed = child.harnessExited || new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  const boundedWait = Math.max(0, Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : 2000);
  child.kill('SIGTERM');
  const exitedAfterTerm = await Promise.race([closed.then(() => true), delay(boundedWait).then(() => false)]);
  if (exitedAfterTerm || childHasExited(child)) return Object.freeze({ exited: true, escalated: false });
  child.kill('SIGKILL');
  const exitedAfterKill = await Promise.race([closed.then(() => true), delay(boundedWait).then(() => false)]);
  return Object.freeze({ exited: exitedAfterKill || childHasExited(child), escalated: true });
}

function lifecycleFailure(error, run, child, phase, removedLocks = []) {
  const cause = error instanceof Error ? error : new Error(String(error));
  const output = Object.freeze({
    stdout: child?.harnessOutput?.stdout.join('') || '',
    stderr: child?.harnessOutput?.stderr.join('') || '',
  });
  Object.defineProperty(cause, 'verificationRun', {
    value: Object.freeze({
      phase,
      outputIdentity: run.outputIdentity,
      outputDir: run.outputDir,
      port: run.port,
      childPid: child?.pid || null,
      logs: run.logs,
      output,
      removedLocks: Object.freeze(removedLocks.slice()),
    }),
    enumerable: true,
  });
  cause.message = `${cause.message} (Verification Run ${run.outputIdentity}; ${phase}; logs: ${run.outputDir})`;
  return cause;
}

async function raceChildExit(child, phase, operation) {
  if (!child?.harnessExited) return operation;
  return Promise.race([
    operation,
    child.harnessExited.then(({ error, code, signal }) => {
      if (error) throw new Error(`Electron failed during ${phase}: ${error.message}`);
      throw new Error(`Electron exited during ${phase} (code ${code}, signal ${signal})`);
    }),
  ]);
}

function newRunLocks(root, initialLockFiles) {
  return playgroundLockFiles({ root })
    .filter((lock) => !initialLockFiles.has(lock.file))
    .map((lock) => lock.file);
}

async function createElectronPageSession(options = {}) {
  const root = path.resolve(options.root || defaultRoot);
  const output = prepareRunOutput({ root, outputIdentity: options.outputIdentity, outputDir: options.outputDir });
  const reservation = await reserveAvailablePort(options.port);
  const run = Object.freeze({ ...output, port: reservation.port });
  const initialLockFiles = new Set(playgroundLockFiles({ root }).map((lock) => lock.file));
  let child;
  let cdp;
  let phase = 'launch';
  try {
    await reservation.release();
    child = launchElectron({ ...options, root, port: run.port, outputDir: run.outputDir, logs: run.logs });
    phase = 'CDP connection';
    ({ cdp } = await raceChildExit(child, phase, connectToElectronPage({
      port: run.port,
      timeoutMs: options.timeoutMs || 20000,
    })));
    if (options.width && options.height) await raceChildExit(child, 'viewport setup', setViewport(cdp, { width: options.width, height: options.height }));
    phase = 'renderer readiness';
    await raceChildExit(child, phase, waitForCheckedExpression(
      cdp,
      "document.readyState === 'complete'",
      options.readinessTimeoutMs || options.timeoutMs || 20000,
      options.readinessStepMs || 150,
    ));
  } catch (error) {
    allocatedPorts.delete(run.port);
    await terminateElectron(child, cdp, options.teardownTimeoutMs).catch(() => {});
    const removedLocks = removeStalePlaygroundLocks({ root, knownFiles: newRunLocks(root, initialLockFiles) });
    throw lifecycleFailure(error, run, child, phase, removedLocks);
  }
  allocatedPorts.delete(run.port);

  let closePromise;
  const close = (timeoutMs = options.teardownTimeoutMs) => {
    if (!closePromise) {
      closePromise = (async () => {
        const termination = await terminateElectron(child, cdp, timeoutMs);
        const removedLocks = removeStalePlaygroundLocks({ root, knownFiles: newRunLocks(root, initialLockFiles) });
        return Object.freeze({ ...termination, removedLocks: Object.freeze(removedLocks) });
      })();
    }
    return closePromise;
  };

  const session = {
    outputIdentity: run.outputIdentity,
    outputDir: run.outputDir,
    port: run.port,
    logs: run.logs,
    child,
    cdp,
    send: (method, params = {}) => cdp.send(method, params),
    evaluate: (expression, evalOptions = {}) => evaluate(cdp, expression, evalOptions),
    evaluateChecked: (expression, evalOptions = {}) => evaluateChecked(cdp, expression, evalOptions),
    run(expression) {
      return cdp.send('Runtime.evaluate', { expression });
    },
    async evalValue(expression, evalOptions = {}) {
      return (await evaluate(cdp, expression, evalOptions)).result.value;
    },
    evalCheckedValue(expression, evalOptions = {}) {
      return evaluateValue(cdp, expression, evalOptions);
    },
    waitForValue(expression, timeoutMs = 10000, stepMs = 150) {
      return waitForExpression(cdp, expression, timeoutMs, stepMs);
    },
    waitForCheckedValue(expression, timeoutMs = 10000, stepMs = 150) {
      return waitForCheckedExpression(cdp, expression, timeoutMs, stepMs);
    },
    visibleBox(selector) {
      return visibleElementBox(cdp, selector);
    },
    click(selector, clickOptions = {}) {
      return clickSelector(cdp, selector, clickOptions);
    },
    pressKey(key, text = key) {
      return pressKey(cdp, key, text);
    },
    setInputValue(selector, value) {
      return setInputValue(cdp, selector, value);
    },
    screenshot(file, screenshotOptions = {}) {
      return captureScreenshot(cdp, file, screenshotOptions);
    },
    async screenshotEvidence(qc, id, screenshotOptions = {}) {
      if (!qc?.rawPath || !qc?.recordCapture) throw new TypeError('screenshotEvidence requires a screenshot QC session');
      const rawFile = qc.rawPath(id);
      await captureScreenshot(cdp, rawFile, screenshotOptions.capture || {});
      return qc.recordCapture(id, rawFile, {
        ...screenshotOptions,
        captureAdapter: 'cdp',
        captureMethod: 'Page.captureScreenshot',
        captureSource: screenshotOptions.captureSource || { protocol: 'Chrome DevTools Protocol' },
      });
    },
    async nativeScreenshotEvidence(qc, id, screenshotOptions = {}) {
      if (!qc?.recordCapture) throw new TypeError('nativeScreenshotEvidence requires a screenshot QC session');
      await waitForStablePaint(cdp, { timeoutMs: screenshotOptions.stablePaintTimeoutMs });
      const capture = await evaluateValue(
        cdp,
        `window.netHackPOC.captureTestScreenshot(${JSON.stringify(String(id))})`,
        { awaitPromise: true },
      );
      if (!capture?.ok || capture.method !== 'BrowserWindow.webContents.capturePage' || !capture.path) {
        throw new Error(`Native screenshot capture failed: ${JSON.stringify(capture)}`);
      }
      return qc.recordCapture(id, capture.path, {
        ...screenshotOptions,
        captureAdapter: 'native',
        captureMethod: capture.method,
        captureSource: { rendererApi: 'window.netHackPOC.captureTestScreenshot', sourcePath: capture.path },
      });
    },
    output() {
      return Object.freeze({
        stdout: child.harnessOutput?.stdout.join('') || '',
        stderr: child.harnessOutput?.stderr.join('') || '',
      });
    },
    close,
  };
  return Object.freeze(session);
}

async function withElectronPage(options, fn) {
  const session = await createElectronPageSession(options);
  try {
    return await fn(session);
  } finally {
    await session.close().catch(() => {});
  }
}

async function createElectronBrowserDriver(options = {}) {
  const page = await createElectronPageSession(options);
  const driver = {
    outputIdentity: page.outputIdentity,
    outputDir: page.outputDir,
    port: page.port,
    logs: page.logs,
    page,
    child: page.child,
    cdp: page.cdp,
    send: page.send,
    evaluate: page.evaluate,
    evaluateChecked: page.evaluateChecked,
    evalValue: page.evalValue,
    evalCheckedValue: page.evalCheckedValue,
    waitForValue: page.waitForValue,
    waitForCheckedValue: page.waitForCheckedValue,
    run: page.run,
    screenshot: page.screenshot,
    screenshotEvidence: page.screenshotEvidence,
    nativeScreenshotEvidence: page.nativeScreenshotEvidence,
    output: page.output,
    visibleBox: page.visibleBox,
    click: page.click,
    pressKey: page.pressKey,
    setInputValue: page.setInputValue,
    waitForRendererReady({ timeoutMs = 10000, promptTest = true, automation = false, startButton = false } = {}) {
      const checks = ["document.readyState === 'complete'"];
      if (promptTest) checks.push('!!window.__nethackPromptTest');
      if (automation) checks.push('!!window.__nethackAutomation');
      if (startButton) checks.push("!!document.querySelector('#start-shim') && !document.querySelector('#start-shim').disabled");
      return page.waitForCheckedValue(`(() => ${checks.join(' && ')})()`, timeoutMs);
    },
    async clickStartShim({ timeoutMs = 10000 } = {}) {
      await page.click('#start-shim', { timeoutMs });
    },
    async confirmDefaultCharacter({ timeoutMs = 10000, playerName = '' } = {}) {
      await waitFor(async () => {
        const dialogs = await page.evalCheckedValue("Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id)");
        return dialogs.includes('character-dialog') ? dialogs : null;
      }, timeoutMs);
      if (playerName) await page.setInputValue('#player-name', playerName);
      await page.click('#confirm-character', { timeoutMs });
    },
    async startDefaultGame({ timeoutMs = 10000, playerName = '' } = {}) {
      let dialogs = await page.evalCheckedValue("Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id)");
      if (!dialogs.includes('startup-choice-dialog') && !dialogs.includes('character-dialog')) {
        await this.clickStartShim({ timeoutMs });
        dialogs = await waitFor(async () => {
          const open = await page.evalCheckedValue("Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id)");
          return open.includes('startup-choice-dialog') || open.includes('character-dialog') ? open : null;
        }, timeoutMs);
      }
      if (dialogs.includes('startup-choice-dialog')) {
        await page.click('#startup-new-game', { timeoutMs });
      }
      await this.confirmDefaultCharacter({ timeoutMs, playerName });
    },
    async dismissIntroDialogs() {
      await page.evalCheckedValue(`(() => {
        document.getElementById('intro-dialog')?.close?.('test-harness');
        document.getElementById('document-dialog')?.close?.('test-harness');
        document.getElementById('game-grid')?.focus?.();
        return true;
      })()`);
    },
    close(timeoutMs) {
      return page.close(timeoutMs);
    },
  };
  return Object.freeze(driver);
}

async function withElectronBrowserDriver(options, fn) {
  const driver = await createElectronBrowserDriver(options);
  try {
    return await fn(driver);
  } finally {
    await driver.close().catch(() => {});
  }
}

module.exports = Object.freeze({
  version: 'nethack-electron-cdp-test-harness/v3',
  screenshotQc: ScreenshotQc,
  delay,
  waitFor,
  playgroundLockFiles,
  removeStalePlaygroundLocks,
  launchElectron,
  setViewport,
  captureScreenshot,
  keyEventParams,
  terminateElectron,
  createElectronPageSession,
  withElectronPage,
  createElectronBrowserDriver,
  withElectronBrowserDriver,
});
