const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_REAL_ENGRAVING_TOOLTIP_OUT_DIR || path.join(root, 'test-output', 'real-engraving-tooltip');
const port = Number(process.env.NH_REAL_ENGRAVING_TOOLTIP_CDP_PORT || 9647);
const width = Number(process.env.NH_REAL_ENGRAVING_TOOLTIP_WIDTH || 1360);
const height = Number(process.env.NH_REAL_ENGRAVING_TOOLTIP_HEIGHT || 920);
const seed = String(process.env.NH_REAL_ENGRAVING_TOOLTIP_SEED || '424242');

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try { const value = await fn(); if (value) return value; } catch (error) { last = error; }
    await delay(stepMs);
  }
  throw last || new Error('timed out');
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
      const request = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? request.reject(new Error(JSON.stringify(msg.error))) : request.resolve(msg.result);
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
  const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function screenshot(cdp, name) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const out = path.join(outDir, name);
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  return out;
}
async function click(cdp, selector) {
  const point = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({ block: 'center', inline: 'center' }); const r = el?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
  if (!point) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
}
async function pressKey(cdp, { key, code, text = '', windowsVirtualKeyCode = 0 }) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text, unmodifiedText: text, windowsVirtualKeyCode });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
}
async function typeText(cdp, text) { await cdp.send('Input.insertText', { text }); }
async function state(cdp) {
  return evalExpr(cdp, `(() => ({
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    body: document.body.innerText || '',
    messages: window.__nethackPromptTest?.messages?.().slice(-12).map((m) => m.text || String(m)) || []
  }))()`);
}
async function startGame(cdp) {
  await click(cdp, '#start-shim');
  await delay(250);
  if (await evalExpr(cdp, `document.getElementById('startup-choice-dialog')?.open === true`)) await click(cdp, '#startup-new-game');
  await waitFor(async () => evalExpr(cdp, `document.getElementById('character-dialog')?.open === true`), 5000);
  await click(cdp, '#confirm-character');
  await waitFor(async () => (await state(cdp)).running, 20000);
  if (/intro-dialog/.test((await state(cdp)).body) || await evalExpr(cdp, `document.getElementById('intro-dialog')?.open === true`)) await click(cdp, '#intro-continue');
  await evalExpr(cdp, `(() => { document.getElementById('game-grid')?.focus?.(); return true; })()`);
}
function assert(name, condition, detail = '') { if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], {
    cwd: root,
    env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height), NETHACK_SEED: seed, NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (data) => { logs += data; process.stdout.write(data); });
  child.stderr.on('data', (data) => { logs += data; process.stderr.write(data); });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); fs.writeFileSync(path.join(outDir, 'electron.log'), logs); };
  process.on('exit', cleanup);
  try {
    const pages = await waitFor(async () => {
      const list = await json(`http://127.0.0.1:${port}/json/list`);
      return list.find((page) => page.type === 'page') ? list : null;
    }, 20000);
    cdp = await connect((pages.find((page) => page.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest"), 10000);
    await startGame(cdp);
    let heroBefore = await waitFor(async () => evalExpr(cdp, `(() => {
      const cells = Array.from(document.querySelectorAll('.tile-cell'));
      const hero = cells.find((el) => el.dataset.semanticKind === 'hero' || el.classList.contains('cursor') || /hero|valkyrie/i.test(el.getAttribute('aria-label') || ''));
      if (!hero) return null;
      return { x: Number(hero.dataset.mapX), y: Number(hero.dataset.mapY) };
    })()`), 10000);
    const initialMove = await evalExpr(cdp, `(() => {
      const hero = { x: ${heroBefore.x}, y: ${heroBefore.y} };
      const keyFor = { '1,-1': 'u', '1,0': 'l', '1,1': 'n', '0,1': 'j', '-1,1': 'b', '-1,0': 'h', '-1,-1': 'y', '0,-1': 'k' };
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
        const el = document.querySelector('.tile-cell[data-map-x="' + (hero.x + dx) + '"][data-map-y="' + (hero.y + dy) + '"]');
        const hay = [el?.className || '', el?.dataset?.semanticKind || '', el?.dataset?.semanticName || '', el?.getAttribute?.('aria-label') || '', el?.dataset?.glyph || ''].join(' ');
        if (el && /terrain-floor|floor of a room|^\.$/.test(hay) && !/monster|pet|object|door|wall|water|lava|trap|stairs/i.test(hay)) return { dx, dy, key: keyFor[dx + ',' + dy] };
      }
      return null;
    })()`);
    if (initialMove) {
      await evalExpr(cdp, `document.getElementById('game-grid')?.focus?.()`);
      await pressKey(cdp, { key: initialMove.key, code: `Key${initialMove.key.toUpperCase()}`, text: initialMove.key, windowsVirtualKeyCode: initialMove.key.toUpperCase().charCodeAt(0) });
      await delay(400);
      heroBefore = await waitFor(async () => evalExpr(cdp, `(() => {
        const cells = Array.from(document.querySelectorAll('.tile-cell'));
        const hero = cells.find((el) => el.dataset.semanticKind === 'hero' || el.classList.contains('cursor') || /hero|valkyrie/i.test(el.getAttribute('aria-label') || ''));
        if (!hero) return null;
        return { x: Number(hero.dataset.mapX), y: Number(hero.dataset.mapY), initialMove: ${JSON.stringify(initialMove)} };
      })()`), 5000);
    }
    await evalExpr(cdp, `document.getElementById('game-grid')?.focus?.()`);
    await pressKey(cdp, { key: 'E', code: 'KeyE', text: 'E', windowsVirtualKeyCode: 69 });
    await waitFor(async () => /write with|engrave|write/i.test((await state(cdp)).body), 7000);
    if (/write with/i.test((await state(cdp)).body)) {
      await pressKey(cdp, { key: '-', code: 'Minus', text: '-', windowsVirtualKeyCode: 189 });
    }
    await waitFor(async () => /what do you want to write|write in the dust|write\?/i.test((await state(cdp)).body), 7000);
    const freeTextScreenshot = await screenshot(cdp, '00-real-engraving-free-text-prompt.png');
    if (process.env.NH_REAL_FREE_TEXT_PROMPT_ONLY === '1') {
      const promptState = await evalExpr(cdp, `(() => ({ title:document.getElementById('interaction-title')?.textContent||'', prompt:document.getElementById('interaction-prompt')?.textContent||'', textEntry:!document.getElementById('interaction-text-row')?.hidden, textLabel:document.getElementById('interaction-text-label')?.textContent||'', inputVisible:Boolean(document.getElementById('interaction-text')?.getClientRects?.().length), sent:window.__nethackPromptTest?.sentInputs?.().join('')||'' }))()`);
      const result = { ok:true, evidenceKind:'REAL Electron and real NetHack uppercase E engrave command; no renderer prompt injection', scope:'UXM-01 actual-player free-text prompt only', seed, heroBefore, prompt:promptState, screenshots:{ freeTextScreenshot } };
      fs.writeFileSync(path.join(outDir, 'real-free-text-prompt-result.json'), JSON.stringify(result, null, 2));
      fs.writeFileSync(path.join(outDir, 'real-free-text-prompt-summary.md'), `# Real free-text prompt proof\n\nPASS\n\n${freeTextScreenshot}\n`);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    await typeText(cdp, 'AI ORG');
    await pressKey(cdp, { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitFor(async () => {
      const s = await state(cdp);
      return /write|engrave|dust|AI ORG/i.test(`${s.body}\n${s.messages.join('\n')}`) ? s : null;
    }, 10000);
    const move = await waitFor(async () => evalExpr(cdp, `(() => {
      const hero = { x: ${heroBefore.x}, y: ${heroBefore.y} };
      const keyFor = { '1,-1': 'u', '1,0': 'l', '1,1': 'n', '0,1': 'j', '-1,1': 'b', '-1,0': 'h', '-1,-1': 'y', '0,-1': 'k' };
      const candidates = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
      for (const [dx, dy] of candidates) {
        const el = document.querySelector('.tile-cell[data-map-x="' + (hero.x + dx) + '"][data-map-y="' + (hero.y + dy) + '"]');
        const hay = [el?.className || '', el?.dataset?.semanticKind || '', el?.dataset?.semanticName || '', el?.getAttribute?.('aria-label') || '', el?.dataset?.glyph || ''].join(' ');
        if (el && (/terrain-floor|adjacent-move-target|floor of a room|^\.$/.test(hay)) && !/monster|pet|object|door|wall|water|lava|trap/i.test(hay)) return { dx, dy, key: keyFor[dx + ',' + dy] };
      }
      return null;
    })()`), 10000).catch(() => ({ dx: 1, dy: 0, key: 'l', fallback: true }));
    await evalExpr(cdp, `document.getElementById('game-grid')?.focus?.()`);
    await pressKey(cdp, { key: move.key, code: `Key${move.key.toUpperCase()}`, text: move.key, windowsVirtualKeyCode: move.key.toUpperCase().charCodeAt(0) });
    const readTargetCell = () => evalExpr(cdp, `(() => {
      const el = document.querySelector('.tile-cell[data-map-x="${heroBefore.x}"][data-map-y="${heroBefore.y}"]');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), glyph: el.dataset.glyph || el.textContent || '',
        glyphNumber: el.dataset.glyphNumber || '', cmapIndex: el.dataset.cmapIndex || '', tileId: el.dataset.tileId || '',
        semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '', aria: el.getAttribute('aria-label') || '',
        className: el.className || '', rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2 }
      };
    })()`);
    let cell = await waitFor(readTargetCell, 10000);
    for (let attempt = 0; attempt < 4 && cell && !/engraving/i.test(`${cell.tileId} ${cell.semanticKind} ${cell.semanticName} ${cell.aria}`) && /pet|monster|hero|player/i.test(`${cell.semanticKind} ${cell.aria}`); attempt += 1) {
      await evalExpr(cdp, `document.getElementById('game-grid')?.focus?.()`);
      await pressKey(cdp, { key: move.key, code: `Key${move.key.toUpperCase()}`, text: move.key, windowsVirtualKeyCode: move.key.toUpperCase().charCodeAt(0) });
      await delay(300);
      cell = await readTargetCell();
    }
    assert('real engraving cell found', cell && /engraving/i.test(`${cell.tileId} ${cell.semanticKind} ${cell.semanticName} ${cell.aria}`), JSON.stringify({ heroBefore, move, cell }));
    assert('real engraving not rendered as boulder', !/boulder/i.test(`${cell.tileId} ${cell.aria}`), JSON.stringify(cell));
    const beforeScreenshot = await screenshot(cdp, '00-real-map-before-engraving-hover.png');
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cell.rect.centerX, y: cell.rect.centerY });
    await delay(300);
    const tooltip = await waitFor(async () => evalExpr(cdp, `(() => {
      const tip = document.getElementById('map-tooltip');
      const icon = document.getElementById('map-tooltip-icon');
      const title = document.getElementById('map-tooltip-title');
      const desc = document.getElementById('map-tooltip-description');
      if (!tip || tip.hidden) return null;
      const rect = tip.getBoundingClientRect();
      return { hidden: tip.hidden, text: tip.innerText || '', title: title?.textContent || '', description: desc?.textContent || '', iconTileId: icon?.dataset?.tileId || '', iconImage: icon?.style?.backgroundImage || '', rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
    })()`), 5000);
    assert('engraving tooltip identifies public feature', /engraving/i.test(`${tooltip.title} ${tooltip.text}`) && tooltip.iconTileId === 'engraving', JSON.stringify(tooltip));
    assert('engraving tooltip does not call it boulder', !/boulder/i.test(`${tooltip.title} ${tooltip.text} ${tooltip.iconImage}`), JSON.stringify(tooltip));
    const hoverScreenshot = await screenshot(cdp, '01-real-engraving-tooltip.png');
    const result = { ok: true, evidenceKind: 'REAL Electron and real NetHack E engrave command; no renderer prompt injection', seed, heroBefore, move, cell, tooltip, screenshots: { freeTextScreenshot, beforeScreenshot, hoverScreenshot }, note: 'The target is a visible engraving feature made through the real NetHack engrave command. NetHack does not automatically repeat a descriptive movement message every time the hero steps onto an engraving; explicit look/read/farlook or this UI tooltip identifies it.' };
    fs.writeFileSync(path.join(outDir, 'engraving-tooltip-result.json'), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(outDir, 'real-engraving-tooltip-summary.md'), [`# Real engraving tooltip MCP proof`, '', 'PASS', '', `Seed: ${seed}`, `Free-text prompt screenshot: ${freeTextScreenshot}`, `Map screenshot: ${beforeScreenshot}`, `Tooltip screenshot: ${hoverScreenshot}`, '', 'Verified a real shim-rendered engraving cell:', '```json', JSON.stringify({ cell, tooltip }, null, 2), '```', ''].join('\n'));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    cleanup();
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
