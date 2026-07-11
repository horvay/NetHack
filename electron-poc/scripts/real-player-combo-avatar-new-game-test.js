const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_REAL_PLAYER_AVATAR_OUT_DIR || path.join(root, 'test-output', 'real-player-combo-avatar-new-game');
const port = Number(process.env.NH_REAL_PLAYER_AVATAR_CDP_PORT || 9496);
const width = Number(process.env.NH_REAL_PLAYER_AVATAR_WIDTH || 1360);
const height = Number(process.env.NH_REAL_PLAYER_AVATAR_HEIGHT || 920);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out waiting'); }
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function clickCenter(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
async function moveTo(cdp, x, y) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  status: window.__nethackAutomation?.state?.().status || '',
  seen: document.getElementById('shim-output')?.dataset?.seen || '',
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map(d => d.id),
  player: (() => {
    const el = Array.from(document.querySelectorAll('.tile-cell')).find((cell) => cell.dataset.glyph === '@' || cell.getAttribute('aria-label')?.match(/Valkyrie|Player|Hero/i));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { tileId: el.dataset.tileId || '', glyphNumber: el.dataset.glyphNumber || '', aria: el.getAttribute('aria-label') || '', x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })(),
  tooltip: { hidden: document.getElementById('map-tooltip')?.hidden, text: document.getElementById('map-tooltip')?.innerText || '', iconBg: document.querySelector('#map-tooltip .map-tooltip-icon')?.style?.backgroundImage || '' },
}))()`); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; const stdout = []; const stderr = [];
  child.stdout.on('data', d => stdout.push(String(d))); child.stderr.on('data', d => stderr.push(String(d)));
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  const results = { outDir, screenshots: {} };
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find(p => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find(p => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackAutomation")), 10000);
    results.screenshots.beforeStart = await shot(cdp, '01-before-start-character-dialog.png');
    const startSelector = await evalExpr(cdp, `(() => {
      if (document.getElementById('startup-choice-dialog')?.open) return '#startup-new-game';
      return Array.from(document.querySelectorAll('#start-shim, #start, #startup-new-game')).filter((el) => !el.hidden && getComputedStyle(el).display !== 'none' && !el.disabled).map((el) => '#' + el.id)[0] || '#start';
    })()`);
    await clickCenter(cdp, startSelector);
    await waitFor(async () => await evalExpr(cdp, `Boolean(document.getElementById('character-dialog')?.open)`), 10000);
    const playerName = `Avatar${Date.now().toString(36).slice(-6)}`;
    results.playerName = playerName;
    await evalExpr(cdp, `((name) => { document.getElementById('player-name').value = name; document.getElementById('player-role').value = 'Val'; document.getElementById('player-race').value = 'Hum'; document.getElementById('player-gender').value = 'Fem'; document.getElementById('player-align').value = 'Law'; })(${JSON.stringify(playerName)})`);
    await clickCenter(cdp, '#confirm-character');
    await delay(500);
    results.afterConfirm = await state(cdp);
    results.screenshots.afterConfirm = await shot(cdp, '01b-after-confirm-character.png');
    const introOpen = await evalExpr(cdp, `Boolean(document.getElementById('intro-dialog')?.open)`);
    if (introOpen) await clickCenter(cdp, '#intro-continue');
    results.started = await state(cdp);
    results.playerCell = await waitFor(async () => { const s = await state(cdp); if (s?.dialogs?.includes('intro-dialog')) return null; return s?.player?.tileId ? s.player : null; }, 10000);
    await moveTo(cdp, results.playerCell.x, results.playerCell.y);
    await delay(300);
    results.hover = await state(cdp);
    results.screenshots.afterStartHover = await shot(cdp, '02-new-game-human-valkyrie-female-combo-avatar-visible.png');
    assert('player cell uses generated combo avatar', results.playerCell.tileId === 'human-valkyrie-female-avatar', JSON.stringify(results.playerCell));
    assert('tooltip uses generated combo avatar image', /player-combo-avatars\/human-valkyrie-female-avatar\.png/.test(results.hover.tooltip.iconBg), results.hover.tooltip.iconBg);
    assert('tooltip still identifies Valkyrie', /Valkyrie/i.test(results.hover.tooltip.text), results.hover.tooltip.text);
    fs.writeFileSync(path.join(outDir, 'real-player-combo-avatar-new-game-result.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(outDir, 'real-player-combo-avatar-new-game-failure.json'), JSON.stringify({ error: error.stack, stdout, stderr }, null, 2));
    throw error;
  } finally {
    cleanup();
  }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
