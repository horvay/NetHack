const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_READ_ONLY_MENU_OUT_DIR || path.join(root, 'test-output', 'real-read-only-menu-lifecycle');
const port = Number(process.env.NH_READ_ONLY_MENU_CDP_PORT || 9647);

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 150) {
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
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', { returnByValue: true, expression });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function shot(cdp, name) {
  const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p;
}
async function click(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`);
  if (!box) throw new Error(`missing ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
async function press(cdp, key, text = key) {
  const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : (key === 'Escape' ? 27 : 0);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}
async function pageState(cdp) {
  return evalExpr(cdp, `(() => ({
    status: document.getElementById('status')?.textContent || '',
    seen: document.getElementById('shim-output')?.dataset?.seen || '',
    prompt: window.__nethackPromptTest?.prompt?.() || null,
    dialog: window.__nethackPromptTest?.dialog?.() || {},
    openDialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
    body: document.body.innerText,
    menuPanel: { hidden: !!document.getElementById('menu-panel')?.hidden, text: document.getElementById('menu-panel')?.innerText || '' },
    promptPanel: { hidden: !!document.getElementById('prompt-panel')?.hidden, text: document.getElementById('prompt-panel')?.innerText || '' },
  }))()`);
}
function writeState(name, data) { const p = path.join(outDir, name); fs.writeFileSync(p, JSON.stringify(data, null, 2)); return p; }

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  child.stdout.on('data', (d) => process.stdout.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "document.readyState === 'complete' && !!window.__nethackPromptTest" })).result.value, 10000);
    await click(cdp, '#start-shim');
    await delay(200);
    await click(cdp, '#confirm-character');
    await waitFor(async () => /shim_print_glyph|shim_curs|shim_status_update/.test((await pageState(cdp)).seen), 25000);
    await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('read-only-test'); document.getElementById('document-dialog')?.close?.('read-only-test'); document.getElementById('game-grid')?.focus(); window.__nethackPromptTest?.clearSentInputs?.(); return true; })()`);
    await shot(cdp, '01-game-ready-before-help.png');
    await press(cdp, '?', '?');
    const help = await waitFor(async () => {
      const s = await pageState(cdp);
      return /help|command|information menu|Review this information/i.test(`${s.body}\n${s.status}\n${s.promptPanel.text}\n${s.menuPanel.text}`) ? s : null;
    }, 10000);
    const openPath = await shot(cdp, '02-read-only-help-menu-open.png');
    writeState('02-read-only-help-menu-open-state.json', help);
    if (help.prompt?.kind !== 'menu selection') throw new Error(`expected help topic menu selection, got ${JSON.stringify(help.prompt)}`);
    if (!/Help/i.test(help.dialog?.title || '')) throw new Error(`expected Help title, got ${JSON.stringify(help.dialog)}`);
    if (/\bCHANGE\b|Settings panel/i.test(help.body)) throw new Error('help topic menu was mis-rendered with options/settings chrome');
    await press(cdp, 'a', 'a');
    await press(cdp, 'Enter', '\n');
    const doc = await waitFor(async () => {
      const s = await pageState(cdp);
      return s.dialog?.documentOpen || /NetHack|version information|Copyright|About/i.test(`${s.dialog?.documentBody || ''}\n${s.body}`) ? s : null;
    }, 10000);
    const docPath = await shot(cdp, '03-read-only-help-document-open.png');
    writeState('03-read-only-help-document-open-state.json', doc);
    if (!doc.dialog?.documentOpen) throw new Error(`expected read-only help document, got ${JSON.stringify(doc.dialog)}`);
    await press(cdp, 'Escape', '');
    await delay(500);
    const after = await pageState(cdp);
    const afterPath = await shot(cdp, '04-read-only-help-closed.png');
    writeState('04-read-only-help-closed-state.json', after);
    if (/Review this information|information menu open/i.test(`${after.promptPanel.text}\n${after.menuPanel.text}`)) throw new Error('read-only menu prompt remained visible after Escape');
    const summary = { ok: true, outDir, screenshots: [openPath, docPath, afterPath], helpPrompt: help.prompt, documentOpen: doc.dialog.documentOpen, afterPrompt: after.prompt };
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    cleanup();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
