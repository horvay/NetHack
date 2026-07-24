const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const executable = process.argv[2];
const screenshotPath = process.argv[3];
if (!executable || !screenshotPath) {
  throw new Error('usage: node packaged-electron-smoke.js <electron-executable> <screenshot-path>');
}

const port = 9490;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'nethack-electron-smoke-'));
const child = spawn(path.resolve(executable), [
  `--user-data-dir=${userData}`,
  `--remote-debugging-port=${port}`,
  '--no-first-run',
], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk; });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function retry(action, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw lastError || new Error('operation timed out');
}

async function connect() {
  const target = await retry(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!response.ok) throw new Error(`DevTools endpoint returned ${response.status}`);
    const targets = await response.json();
    const page = targets.find((candidate) => candidate.type === 'page');
    if (!page) throw new Error('Electron page target not ready');
    return page;
  });

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  return { socket, send };
}

async function run() {
  const { socket, send } = await connect();
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'renderer evaluation failed');
    return result.result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await retry(async () => {
    const ready = await evaluate(`document.body?.innerText.includes('Start new game')`);
    if (!ready) throw new Error('Start new game control not ready');
  });

  await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent.includes('Start new game')).click()`);
  await retry(async () => {
    if (!(await evaluate(`document.querySelector('#character-dialog')?.open === true`))) {
      throw new Error('character dialog not open');
    }
  });
  await evaluate(`(() => {
    const input = document.querySelector('#character-dialog input');
    input.value = 'WindowsSmoke';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate(`Array.from(document.querySelectorAll('#character-dialog button')).find((button) => button.textContent.includes('Enter dungeon')).click()`);

  const startup = await retry(async () => {
    const state = await evaluate(`({
      continueButton: Array.from(document.querySelectorAll('dialog[open] button')).some((button) => button.textContent.includes('Continue')),
      mapCells: document.querySelectorAll('[data-map-x]').length,
      openDialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
      body: document.body.innerText.slice(-500),
    })`);
    if (!state.continueButton && state.mapCells < 1000) throw new Error(`game startup not ready: ${JSON.stringify(state)}`);
    return state;
  }, 90_000);
  if (startup.continueButton) {
    await evaluate(`Array.from(document.querySelectorAll('dialog[open] button')).find((button) => button.textContent.includes('Continue')).click()`);
  }

  const gameplay = await retry(async () => {
    const state = await evaluate(`({
      mapCells: document.querySelectorAll('[data-map-x]').length,
      heroVisible: document.body.innerText.includes('WindowsSmoke'),
      title: document.title,
    })`);
    if (state.mapCells < 1000 || !state.heroVisible) throw new Error(`gameplay not ready: ${JSON.stringify(state)}`);
    return state;
  }, 90_000);

  const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync(path.dirname(path.resolve(screenshotPath)), { recursive: true });
  fs.writeFileSync(path.resolve(screenshotPath), Buffer.from(capture.data, 'base64'));
  assert.ok(fs.statSync(path.resolve(screenshotPath)).size > 10_000, 'gameplay screenshot is unexpectedly small');
  console.log(JSON.stringify({ passed: true, ...gameplay, screenshot: path.resolve(screenshotPath) }));
  socket.close();
}

run().catch((error) => {
  console.error(error.stack || error);
  if (stderr) console.error(stderr);
  process.exitCode = 1;
}).finally(() => {
  child.stdout.destroy();
  child.stderr.destroy();
  child.kill('SIGKILL');
  child.unref();
  fs.rmSync(userData, { recursive: true, force: true });
});
