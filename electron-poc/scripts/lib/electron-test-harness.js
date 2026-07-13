const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');
const ScreenshotQc = require('./screenshot-qc');

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function playgroundDirForRoot(root = path.resolve(__dirname, '..', '..')) {
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

function playgroundLockFiles({ root = path.resolve(__dirname, '..', '..') } = {}) {
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

function removeStalePlaygroundLocks({ root = path.resolve(__dirname, '..', '..'), knownFiles } = {}) {
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
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  return {
    send(method, params = {}) {
      const callId = ++id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
    },
    close() { ws.close(); },
  };
}

function launchElectron({ root = path.resolve(__dirname, '..', '..'), port, width, height, env = {}, stdio = ['ignore', 'pipe', 'pipe'] } = {}) {
  const child = spawn(electronBin, ['.'], {
    cwd: root,
    env: {
      ...process.env,
      ...env,
      ...(port ? { AI_ORG_ELECTRON_CDP_PORT: String(port) } : {}),
      ...(width ? { NH_ELECTRON_WINDOW_WIDTH: String(width) } : {}),
      ...(height ? { NH_ELECTRON_WINDOW_HEIGHT: String(height) } : {}),
    },
    stdio,
  });
  const output = { stdout: [], stderr: [] };
  Object.defineProperty(child, 'harnessOutput', { value: output, enumerable: false });
  if (child.stdout) child.stdout.on('data', (d) => { output.stdout.push(String(d)); process.stdout.write(d); });
  if (child.stderr) child.stderr.on('data', (d) => { output.stderr.push(String(d)); process.stderr.write(d); });
  return child;
}

async function connectToElectronPage({ port, timeoutMs = 20000, enable = true } = {}) {
  const pages = await waitFor(async () => {
    const list = await json(`http://127.0.0.1:${port}/json/list`);
    return list.find((p) => p.type === 'page') ? list : null;
  }, timeoutMs);
  const page = pages.find((p) => p.type === 'page') || pages[0];
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

async function captureScreenshot(cdp, file, options = {}) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, ...options });
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
    if (!r.width || !r.height || style.visibility === 'hidden' || style.display === 'none' || el.disabled) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })()`);
}

async function setInputValue(cdp, selector, value) {
  return evaluateValue(cdp, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('missing input ' + ${JSON.stringify(selector)});
    el.focus?.();
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

function cleanupElectron(child, cdp) {
  try { cdp?.close(); } catch {}
  if (child && child.exitCode == null && child.signalCode == null) child.kill('SIGTERM');
}

async function terminateElectron(child, cdp, timeoutMs = 2000) {
  try { cdp?.close(); } catch {}
  if (!child || child.exitCode != null || child.signalCode != null) return;
  const closed = new Promise((resolve) => child.once('close', resolve));
  child.kill('SIGTERM');
  const exitedAfterTerm = await Promise.race([closed.then(() => true), delay(timeoutMs).then(() => false)]);
  if (!exitedAfterTerm && child.exitCode == null) child.kill('SIGKILL');
}

async function createElectronPageSession(options = {}) {
  const { port, width, height } = options;
  const child = launchElectron(options);
  let cdp;
  try {
    ({ cdp } = await connectToElectronPage({ port, timeoutMs: options.timeoutMs || 20000 }));
    if (width && height) await setViewport(cdp, { width, height });
  } catch (error) {
    await terminateElectron(child, cdp).catch(() => {});
    throw error;
  }
  const session = {
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
    async screenshotEvidence(qc, id, options = {}) {
      if (!qc?.rawPath || !qc?.recordCapture) throw new TypeError('screenshotEvidence requires a screenshot QC session');
      const rawFile = qc.rawPath(id);
      await captureScreenshot(cdp, rawFile, options.capture || {});
      return qc.recordCapture(id, rawFile, options);
    },
    output() {
      return Object.freeze({
        stdout: child.harnessOutput?.stdout.join('') || '',
        stderr: child.harnessOutput?.stderr.join('') || '',
      });
    },
    close(timeoutMs) {
      return terminateElectron(child, cdp, timeoutMs);
    },
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
  json,
  playgroundDirForRoot,
  playgroundLockFiles,
  removeStalePlaygroundLocks,
  connect,
  launchElectron,
  connectToElectronPage,
  evaluate,
  evaluateChecked,
  evaluateValue,
  describeRuntimeException,
  waitForExpression,
  waitForCheckedExpression,
  setViewport,
  captureScreenshot,
  visibleElementBox,
  setInputValue,
  clickSelector,
  keyEventParams,
  pressKey,
  cleanupElectron,
  terminateElectron,
  createElectronPageSession,
  withElectronPage,
  createElectronBrowserDriver,
  withElectronBrowserDriver,
});
