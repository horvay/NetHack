const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const evidenceDir = process.env.RUN_EVIDENCE_DIR || path.join(root, 'test', 'game-over');
const screenshotPath = path.join(evidenceDir, 'game-over-modal.png');
const logScreenshotPath = path.join(evidenceDir, 'game-over-log.png');
const metricsPath = path.join(evidenceDir, 'game-over-flow-metrics.json');
const port = Number(process.env.CDP_PORT || 9444);
const fixturePath = path.join(root, 'test', 'fixtures', 'game-over-death-events.jsonl');

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  } finally { clearTimeout(timer); }
}
async function waitForCdp(timeoutMs = 10000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try { return await json(`http://127.0.0.1:${port}/json/list`); } catch (error) { last = error; await delay(150); }
  }
  throw last || new Error('CDP unavailable');
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
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
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

(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const electron = require('electron');
  const child = spawn(electron, ['.'], {
    cwd: root,
    env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_SHOW: process.env.NH_ELECTRON_SHOW || '1', NH_ELECTRON_WINDOW_WIDTH: '1200', NH_ELECTRON_WINDOW_HEIGHT: '900' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data.toString(); if (process.env.DEBUG_GAME_OVER_TEST) process.stderr.write(data); });
  child.stdout.on('data', (data) => { if (process.env.DEBUG_GAME_OVER_TEST) process.stdout.write(data); });
  try {
    if (process.env.DEBUG_GAME_OVER_TEST) console.error('waiting for page');
    const pages = await (async () => {
      const start = Date.now();
      while (Date.now() - start < 20000) {
        const list = await waitForCdp(2000);
        if (list.find((p) => p.type === 'page')) return list;
        await delay(150);
      }
      throw new Error('No CDP page target found');
    })();
    const page = pages.find((p) => p.type === 'page');
    assert(page, 'CDP page exists');
    if (process.env.DEBUG_GAME_OVER_TEST) console.error('connecting page');
    const cdp = await connect(page.webSocketDebuggerUrl);
    if (process.env.DEBUG_GAME_OVER_TEST) console.error('connected');
    await cdp.send('Page.enable');
    if (process.env.DEBUG_GAME_OVER_TEST) console.error('page enabled');
    await cdp.send('Runtime.enable');
    if (process.env.DEBUG_GAME_OVER_TEST) console.error('runtime enabled');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
    await delay(900);
    if (process.env.DEBUG_GAME_OVER_TEST) console.error('sending events');
    const events = fs.readFileSync(fixturePath, 'utf8').trim().split(/\n+/).map((line) => JSON.parse(line));
    let eventIndex = 0;
    for (const event of events) {
      eventIndex += 1;
      if (process.env.DEBUG_GAME_OVER_TEST) console.error('event', eventIndex, event.name);
      const expr = `window.__nethackPromptTest.event(${JSON.stringify({ event })})`;
      const result = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      await delay(25);
    }
    await delay(900);
    if (process.env.DEBUG_GAME_OVER_TEST) console.error('collecting metrics');
    const metrics = (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: `(() => ({
      modalOpen: document.getElementById('game-over-dialog').open,
      cause: document.getElementById('game-over-cause').textContent,
      stoneCause: document.getElementById('game-over-stone-cause').textContent,
      summary: document.getElementById('game-over-summary').textContent,
      sections: document.getElementById('game-over-sections').textContent,
      logScrolls: Array.from(document.querySelectorAll('#game-over-sections .game-over-log')).map((node) => ({ text: node.textContent, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, overflowY: getComputedStyle(node).overflowY })),
      interactionOpen: document.getElementById('interaction-dialog').open,
      promptPanelHidden: document.getElementById('prompt-panel').hidden,
      actionTexts: Array.from(document.querySelectorAll('#game-over-dialog .game-over-actions button')).map((button) => button.textContent.trim()),
      focused: document.activeElement && document.activeElement.id,
    }))()` })).result.value;
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(screenshotPath, Buffer.from(shot.data, 'base64'));
    await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#game-over-sections .game-over-log')?.scrollIntoView({ block: 'center' })` });
    await delay(100);
    const logShot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(logScreenshotPath, Buffer.from(logShot.data, 'base64'));
    fs.writeFileSync(metricsPath, `${JSON.stringify({ screenshotPath, logScreenshotPath, metrics }, null, 2)}\n`);
    assert.equal(metrics.modalOpen, true, 'game-over modal appears');
    assert.match(metrics.cause, /Killed by a jackal/i, 'death reason displayed in text panel');
    assert.match(metrics.stoneCause, /Killed by a jackal/i, 'death reason displayed on gravestone');
    assert.match(metrics.summary, /Score\s*42/i, 'score stats displayed');
    assert.match(metrics.summary, /Dungeon\s*Dlvl:1/i, 'dungeon stats displayed');
    assert.match(metrics.sections, /Goodbye Electron/i, 'raw final stats displayed');
    assert.match(metrics.sections, /Vanquished creatures/i, 'menu statistics displayed');
    assert.match(metrics.sections, /Game log[\s\S]*You were killed by a jackal/i, 'scrollable message log is shown beneath final disclosure sections');
    assert.match(metrics.sections, /Game log[\s\S]*uncursed potion of healing/i, 'game log retains earlier item-identification messages');
    assert(metrics.logScrolls.length === 1 && /auto|scroll/.test(metrics.logScrolls[0].overflowY), `game log has its own vertical scroll region: ${JSON.stringify(metrics.logScrolls)}`);
    assert.equal(metrics.interactionOpen, false, 'yes/no prompt modal not exposed');
    assert.deepEqual(metrics.actionTexts, ['New game', 'Exit'], 'only New game and Exit actions');
    assert.equal(metrics.focused, 'game-over-new', 'New game receives focus');
    const newGameResult = (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: `(() => { document.getElementById('game-over-new').click(); return { gameOverOpen: document.getElementById('game-over-dialog').open, characterOpen: document.getElementById('character-dialog').open }; })()` })).result.value;
    assert.deepEqual(newGameResult, { gameOverOpen: false, characterOpen: true }, 'New game opens character modal');
    console.log(JSON.stringify({ ok: true, screenshotPath, logScreenshotPath, metricsPath }, null, 2));
    cdp.close();
  } finally {
    child.kill('SIGTERM');
    await delay(250);
    if (!child.killed) child.kill('SIGKILL');
    if (stderr && process.env.DEBUG_GAME_OVER_TEST) console.error(stderr);
  }
})().catch((error) => { console.error(error); process.exit(1); });
