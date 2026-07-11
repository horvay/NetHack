const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_REAL_RECORDING_TOOLBAR_OUT_DIR || path.join(root, 'test-output', 'real-recording-toolbar-mcp');
const port = Number(process.env.NH_REAL_RECORDING_TOOLBAR_CDP_PORT || 9498);
const width = Number(process.env.NH_REAL_RECORDING_TOOLBAR_WIDTH || 1360);
const height = Number(process.env.NH_REAL_RECORDING_TOOLBAR_HEIGHT || 920);

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeoutMs) {
    try { const value = await fn(); if (value) return value; } catch (error) { last = error; }
    await delay(stepMs);
  }
  throw last || new Error('timed out waiting');
}
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const item = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? item.reject(new Error(JSON.stringify(msg.error))) : item.resolve(msg.result);
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
async function evalExpr(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', { returnByValue: true, expression });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function shot(cdp, name) {
  const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(outDir, name);
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
  return file;
}
async function clickCenter(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  return box;
}
async function state(cdp) {
  return evalExpr(cdp, `(() => {
    const toolbar = document.getElementById('recording-toolbar');
    const checkpoint = document.getElementById('record-checkpoint-primary');
    const save = document.getElementById('save-recording-primary');
    const debugCheckpoint = document.getElementById('record-checkpoint');
    const toolbarBox = toolbar?.getBoundingClientRect();
    const checkpointBox = checkpoint?.getBoundingClientRect();
    const automation = window.__nethackAutomation?.state?.() || {};
    return {
      running: automation.runningState?.running || false,
      seen: document.getElementById('shim-output')?.dataset?.seen || '',
      dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
      toolbarHidden: toolbar?.hidden ?? true,
      toolbarText: toolbar?.innerText || '',
      toolbarWidth: Math.round(toolbarBox?.width || 0),
      checkpointText: checkpoint?.innerText || '',
      checkpointVisible: !!checkpoint && !checkpoint.disabled && !toolbar?.hidden && checkpointBox.width > 0 && checkpointBox.height > 0,
      saveText: save?.innerText || '',
      debugCheckpointHidden: debugCheckpoint?.hidden ?? true,
      recordingStatus: document.getElementById('recording-status')?.innerText || '',
      body: document.body.innerText,
    };
  })()`);
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; const stdout = []; const stderr = [];
  child.stdout.on('data', (data) => stdout.push(String(data)));
  child.stderr.on('data', (data) => stderr.push(String(data)));
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  const results = { outDir, screenshots: {}, checks: {} };
  try {
    const pages = await waitFor(async () => {
      const list = await json(`http://127.0.0.1:${port}/json/list`);
      return list.find((page) => page.type === 'page') ? list : null;
    }, 20000);
    cdp = await connect((pages.find((page) => page.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackAutomation")), 10000);

    results.beforeStart = await state(cdp);
    assert('toolbar hidden before recording', results.beforeStart.toolbarHidden);
    results.screenshots.beforeStart = await shot(cdp, '01-before-recording-toolbar-hidden.png');

    await clickCenter(cdp, '#start-shim');
    await delay(200);
    await evalExpr(cdp, `(() => {
      document.getElementById('player-name').value = 'Recorder';
      document.getElementById('player-role').value = 'Val';
      document.getElementById('player-race').value = 'Hum';
      document.getElementById('player-gender').value = 'Fem';
      document.getElementById('player-align').value = 'Law';
      document.getElementById('game-seed').value = '424242';
      document.getElementById('record-inputs').checked = true;
    })()`);
    await clickCenter(cdp, '#confirm-character');
    results.recordingActive = await waitFor(async () => {
      const next = await state(cdp);
      return next.running && /shim_glyph|shim_status_update|shim_curs|shim_putstr/.test(next.seen) && next.checkpointVisible ? next : null;
    }, 20000);
    if (results.recordingActive.dialogs.includes('intro-dialog')) await clickCenter(cdp, '#intro-continue');
    results.screenshots.recordingActive = await shot(cdp, '02-recording-toolbar-visible.png');

    await evalExpr(cdp, `window.prompt = () => 'real-game-toolbar-checkpoint';`);
    await clickCenter(cdp, '#record-checkpoint-primary');
    results.afterCheckpoint = await waitFor(async () => {
      const next = await state(cdp);
      return /Checkpoint recorded: real-game-toolbar-checkpoint/.test(next.toolbarText + next.recordingStatus) ? next : null;
    }, 5000);
    results.screenshots.afterCheckpoint = await shot(cdp, '03-after-primary-checkpoint-click.png');

    assert('normal game toolbar is visible while recording', !results.recordingActive.toolbarHidden && results.recordingActive.toolbarWidth > 400, JSON.stringify(results.recordingActive));
    assert('primary checkpoint button is visible and discoverable', /Add screenshot checkpoint/.test(results.recordingActive.checkpointText) && results.recordingActive.checkpointVisible, JSON.stringify(results.recordingActive));
    assert('primary save button is visible', /Save recording/.test(results.recordingActive.saveText), JSON.stringify(results.recordingActive));
    assert('debug checkpoint mirror remains available when recording', results.recordingActive.debugCheckpointHidden === false, JSON.stringify(results.recordingActive));
    assert('primary checkpoint records named checkpoint', /real-game-toolbar-checkpoint/.test(results.afterCheckpoint.toolbarText + results.afterCheckpoint.recordingStatus), JSON.stringify(results.afterCheckpoint));

    fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(results, null, 2));
    cleanup();
    console.log(`real recording toolbar MCP test OK: ${outDir}`);
  } catch (error) {
    results.error = error.stack || String(error);
    results.stdout = stdout.join('');
    results.stderr = stderr.join('');
    try { fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(results, null, 2)); } catch {}
    cleanup();
    console.error(error.stack || error);
    process.exit(1);
  }
}

main();
