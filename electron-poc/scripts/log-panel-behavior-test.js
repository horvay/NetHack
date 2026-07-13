const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_LOG_PANEL_OUT_DIR || path.join(root, 'test', 'log-panel-behavior');
const port = Number(process.env.NH_LOG_PANEL_CDP_PORT || 9447);
const width = Number(process.env.NH_LOG_PANEL_WIDTH || 2200);
const height = Number(process.env.NH_LOG_PANEL_HEIGHT || 1800);
const saveScreenshot = process.env.NH_LOG_PANEL_SCREENSHOT !== '0';

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 250) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try { const value = await fn(); if (value) return value; } catch (error) { lastError = error; }
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

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], {
    cwd: root,
    env: {
      ...process.env,
      AI_ORG_ELECTRON_CDP_PORT: String(port),
      NH_ELECTRON_WINDOW_WIDTH: String(width),
      NH_ELECTRON_WINDOW_HEIGHT: String(height),
      NH_ELECTRON_WINDOW_CONTENT_SIZE: '1',
      NH_ELECTRON_SHOW: process.env.NH_ELECTRON_SHOW || '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  child.stdout.on('data', (d) => process.stdout.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));
  try {
    const pages = await waitFor(async () => {
      const list = await json(`http://127.0.0.1:${port}/json/list`);
      return list.find((p) => p.type === 'page') ? list : null;
    }, 20000);
    const page = pages.find((p) => p.type === 'page') || pages[0];
    cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "document.readyState === 'complete' && !!window.__nethackPromptTest" })).result.value, 10000);
    await cdp.send('Runtime.evaluate', { expression: `(() => {
      window.__nethackPromptTest.reset();
      for (let i = 1; i <= 48; i += 1) window.__nethackPromptTest.event({ name: 'shim_putstr', text: 'Log expansion message ' + String(i).padStart(2, '0') });
      document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close('silent'));
    })()` });
    await delay(250);
    await cdp.send('Runtime.evaluate', { expression: `(() => {
      const style = document.createElement('style');
      style.id = 'legacy-compact-log-style';
      style.textContent = '#log-panel{height:auto;max-height:136px;align-self:start}#messages{max-height:4.8em}';
      document.head.appendChild(style);
    })()` });
    await delay(100);
    const legacyCompact = (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      const rect = (el) => { const r = el.getBoundingClientRect(); return { top:r.top, bottom:r.bottom, width:r.width, height:r.height, scrollWidth:el.scrollWidth, scrollHeight:el.scrollHeight, clientWidth:el.clientWidth, clientHeight:el.clientHeight }; };
      const messages = document.getElementById('messages');
      const log = document.getElementById('log-panel');
      const grid = document.getElementById('game-grid');
      const play = document.getElementById('play-area');
      const keyboardHelp = document.getElementById('keyboard-help');
      const visibleLineEstimate = Math.max(0, Math.floor(messages.clientHeight / parseFloat(getComputedStyle(messages).lineHeight || '15')));
      return { viewport: { width: innerWidth, height: innerHeight }, outerWindow: { width: outerWidth, height: outerHeight }, play: rect(play), grid: rect(grid), log: rect(log), messages: rect(messages), keyboardHelp: rect(keyboardHelp), visibleLineEstimate, text: messages.innerText, scrollTop: messages.scrollTop };
    })()` })).result.value;
    if (saveScreenshot) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(outDir, 'before-legacy-compact-log-unused-room.png'), Buffer.from(shot.data, 'base64'));
    }
    await cdp.send('Runtime.evaluate', { expression: "document.getElementById('legacy-compact-log-style')?.remove()" });
    await delay(100);
    const beforeManual = (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      const rect = (el) => { const r = el.getBoundingClientRect(); return { top:r.top, bottom:r.bottom, width:r.width, height:r.height, scrollWidth:el.scrollWidth, scrollHeight:el.scrollHeight, clientWidth:el.clientWidth, clientHeight:el.clientHeight }; };
      const messages = document.getElementById('messages');
      const log = document.getElementById('log-panel');
      const grid = document.getElementById('game-grid');
      const keyboardHelp = document.getElementById('keyboard-help');
      const play = document.getElementById('play-area');
      const visibleLineEstimate = Math.max(0, Math.floor(messages.clientHeight / parseFloat(getComputedStyle(messages).lineHeight || '15')));
      return { viewport: { width: innerWidth, height: innerHeight }, outerWindow: { width: outerWidth, height: outerHeight }, play: rect(play), grid: rect(grid), log: rect(log), messages: rect(messages), keyboardHelp: rect(keyboardHelp), visibleLineEstimate, text: messages.innerText, scrollTop: messages.scrollTop };
    })()` })).result.value;
    await cdp.send('Runtime.evaluate', { expression: `(() => { window.__logPanelBeforeAppendTop = document.getElementById('messages').scrollTop; window.__nethackPromptTest.event({ name: 'shim_putstr', text: 'BOTTOM FOLLOW MESSAGE' }); })()` });
    await delay(100);
    const autoBottom = (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      const messages = document.getElementById('messages');
      return { text: messages.innerText, scrollTop: messages.scrollTop, bottomGap: messages.scrollHeight - messages.scrollTop - messages.clientHeight };
    })()` })).result.value;
    if (saveScreenshot) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(outDir, 'after-log-panel-expanded-autoscroll.png'), Buffer.from(shot.data, 'base64'));
    }
    await cdp.send('Runtime.evaluate', { expression: `(() => { const messages = document.getElementById('messages'); messages.scrollTop = 0; window.__manualScrollTopBeforeAppend = messages.scrollTop; window.__nethackPromptTest.event({ name: 'shim_putstr', text: 'MANUAL SCROLLBACK SHOULD NOT JUMP' }); })()` });
    await delay(100);
    const manual = (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      const messages = document.getElementById('messages');
      return { text: messages.innerText, before: window.__manualScrollTopBeforeAppend, after: messages.scrollTop, bottomGap: messages.scrollHeight - messages.scrollTop - messages.clientHeight };
    })()` })).result.value;
    const gridLogGap = beforeManual.log.top - beforeManual.play.bottom;
    const logKeyboardGap = beforeManual.keyboardHelp.top - beforeManual.log.bottom;
    const legacyGridLogGap = legacyCompact.log.top - legacyCompact.play.bottom;
    const legacyLogKeyboardGap = legacyCompact.keyboardHelp.top - legacyCompact.log.bottom;
    const compactViewport = beforeManual.viewport.height < 1000;
    const metrics = {
      requestedWindow: { width, height, contentSize: true, shown: process.env.NH_ELECTRON_SHOW !== '0' },
      legacyCompact,
      beforeManual,
      autoBottom,
      manual,
      gridLogGap,
      logKeyboardGap,
      legacyGridLogGap,
      legacyLogKeyboardGap,
      compactViewport,
      visibleLineCount: beforeManual.text.split('\n').filter(Boolean).length,
      pass: beforeManual.viewport.width >= 1200
        && beforeManual.viewport.height >= 650
        && gridLogGap >= 6
        && logKeyboardGap >= 6
        && beforeManual.log.height > (compactViewport ? 145 : 420)
        && beforeManual.messages.clientHeight > (compactViewport ? 100 : 380)
        && beforeManual.grid.width >= beforeManual.viewport.width - 40
        && beforeManual.text.includes('Log expansion message 39')
        && beforeManual.text.includes('Log expansion message 48')
        && beforeManual.text.split('\n').filter(Boolean).length >= 20
        && autoBottom.text.includes('BOTTOM FOLLOW MESSAGE')
        && autoBottom.bottomGap <= 32
        && manual.text.includes('MANUAL SCROLLBACK SHOULD NOT JUMP')
        && (manual.bottomGap <= 32 || manual.after <= manual.before + 2),
    };
    fs.writeFileSync(path.join(outDir, 'log-panel-behavior-metrics.json'), JSON.stringify(metrics, null, 2));
    if (saveScreenshot) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(outDir, 'after-manual-scrollback-preserved.png'), Buffer.from(shot.data, 'base64'));
    }
    console.log(JSON.stringify(metrics, null, 2));
    if (!metrics.pass) throw new Error('log panel behavior assertion failed');
  } finally {
    cleanup();
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
