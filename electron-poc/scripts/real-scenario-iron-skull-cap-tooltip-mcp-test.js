const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_IRON_SKULL_CAP_OUT_DIR || path.join(root, 'test-output', 'real-scenario-iron-skull-cap-tooltip');
const scenarioId = 'object/asset-tooltip-iron-skull-cap';
const port = Number(process.env.NH_IRON_SKULL_CAP_CDP_PORT || 9652);
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function press(cdp, key, code, text) { const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0; const params = { key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }; if (text !== undefined) params.text = text; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }); }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function start(cdp) { await click(cdp, '#start-shim'); await delay(250); await click(cdp, '#confirm-character'); await waitFor(async () => evalExpr(cdp, `window.__nethackAutomation?.state?.().runningState?.running || false`), 25000); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); }
async function snapshot(cdp) { return evalExpr(cdp, `(() => {
  const summarize = (el) => ({
    x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), glyph: el.dataset.glyph || el.textContent || '', className: el.className || '', tileId: el.dataset.tileId || '', semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '', aria: el.getAttribute('aria-label') || '', text: el.textContent || '', rect: (() => { const r = el.getBoundingClientRect(); return { left:r.left, top:r.top, width:r.width, height:r.height, cx:r.left+r.width/2, cy:r.top+r.height/2 }; })()
  });
  const cells = Array.from(document.querySelectorAll('.tile-cell')).map(summarize);
  const hero = cells.find((c) => c.semanticKind === 'hero' || c.semanticKind === 'player' || c.glyph === '@' || /Hero|Player/i.test(c.aria));
  const rel = (dx, dy) => hero ? cells.find((c) => c.x === hero.x + dx && c.y === hero.y + dy) || null : null;
  const tip = document.getElementById('map-tooltip'); const icon = document.getElementById('map-tooltip-icon');
  return { hero, east: rel(1,0), tooltip: { hidden: Boolean(tip?.hidden), text: tip?.innerText || '', title: document.getElementById('map-tooltip-title')?.textContent || '', description: document.getElementById('map-tooltip-description')?.textContent || '', assetId: icon?.dataset.tileId || '', iconImage: icon?.style.backgroundImage || '', iconClass: icon?.className || '' }, dialog: window.__nethackPromptTest?.dialog?.(), body: document.body.innerText, seen: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '' };
})()`); }
async function hoverCell(cdp, cell) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cell.rect.cx, y: cell.rect.cy }); await delay(350); return snapshot(cdp); }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', (d) => { logs += d; process.stdout.write(d); }); child.stderr.on('data', (d) => { logs += d; process.stderr.write(d); });
  let cdp; const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); fs.writeFileSync(path.join(outDir, 'electron.log'), logs); };
  process.on('exit', cleanup);
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => evalExpr(cdp, `document.readyState === 'complete' && !!window.__nethackPromptTest`), 10000);
    await start(cdp);
    await waitFor(async () => { const s = await snapshot(cdp); if (/bridge_test_scenario_failed/.test(`${s.seen}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seen}\n${s.shim}`) && s.hero && s.east ? s : null; }, 15000);
    let snap = await snapshot(cdp);
    assert('east iron skull cap cell is visible', /Iron Skull Cap/i.test(`${snap.east.aria} ${snap.east.semanticName}`) || snap.east.tileId === 'helmet', JSON.stringify(snap.east));
    const mapShot = await shot(cdp, '00-map-before-hover.png');
    const hoverSnap = await hoverCell(cdp, snap.east);
    const hoverShot = await shot(cdp, '01-iron-skull-cap-tooltip.png');
    assert('map cell uses helmet asset not armor/shield fallback', hoverSnap.east.tileId === 'helmet' && /helmet\.png/.test(`${hoverSnap.east.aria} ${hoverSnap.tooltip.iconImage}`) && !/armor-class-icon|shield\.png|orcish-helm/.test(`${hoverSnap.east.tileId} ${hoverSnap.tooltip.iconImage}`), JSON.stringify({ cell: hoverSnap.east, tooltip: hoverSnap.tooltip }));
    assert('tooltip title keeps public appearance and no hidden identity', hoverSnap.tooltip.title === 'Iron Skull Cap' && hoverSnap.tooltip.assetId === 'helmet' && /helmet\.png/.test(hoverSnap.tooltip.iconImage || '') && !/orcish helm/i.test(`${hoverSnap.tooltip.title} ${hoverSnap.tooltip.description}`), JSON.stringify(hoverSnap.tooltip));

    await evalExpr(cdp, "document.getElementById('game-grid')?.focus?.(); window.__nethackPromptTest?.clearSentInputs?.();");
    await press(cdp, 'i', 'KeyI', 'i');
    const invSnap = await waitFor(async () => { const s = await snapshot(cdp); return /Equipment\s*\/\s*Inventory/i.test(s.dialog?.title || '') && /Iron Skull Cap/i.test(`${s.dialog?.panelControls?.text || ''}\n${(s.dialog?.options || []).map((o) => o.text || '').join('\n')}`) ? s : null; }, 10000);
    const inventoryShot = await shot(cdp, '02-iron-skull-cap-inventory.png');
    const iconEvidence = await evalExpr(cdp, `(() => Array.from(document.querySelectorAll('.menu-tile[data-tile-id]')).map((el) => ({ tileId: el.dataset.tileId || '', image: el.style.backgroundImage || '', row: el.closest('.option-row,.inventory-row,button')?.innerText || '' })).filter((entry) => /Iron Skull Cap/i.test(entry.row) || entry.tileId === 'helmet'))()`);
    assert('inventory row uses same helmet asset', iconEvidence.some((entry) => /Iron Skull Cap/i.test(entry.row) && entry.tileId === 'helmet' && /helmet\.png/.test(entry.image)), JSON.stringify(iconEvidence));
    assert('no fallback/developer labels visible', !/Name unavailable|Inventory selector|Loading your inventory/i.test(invSnap.body), invSnap.body.slice(0, 1200));
    const result = { scenarioId, screenshots: { map: mapShot, tooltip: hoverShot, inventory: inventoryShot }, mapCell: hoverSnap.east, tooltip: hoverSnap.tooltip, iconEvidence };
    fs.writeFileSync(path.join(outDir, 'iron-skull-cap-tooltip-result.json'), JSON.stringify(result, null, 2));
    const summary = [`# Real iron skull cap asset tooltip smoke`, '', 'PASS', '', `Scenario: ${scenarioId}`, `Map screenshot: ${mapShot}`, `Tooltip screenshot: ${hoverShot}`, `Inventory screenshot: ${inventoryShot}`, '', 'Verified through real Electron/shim scenario:', '- ground Iron Skull Cap map cell and hover tooltip use the helmet public-appearance asset', '- tooltip title stays Iron Skull Cap without revealing the hidden orcish helm identity', '- inventory/equipment row uses the same helmet icon instead of armor-class/shield-like fallback', '', 'Evidence:', '```json', JSON.stringify({ mapCell: result.mapCell, tooltip: result.tooltip, iconEvidence }, null, 2), '```', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-scenario-iron-skull-cap-tooltip-summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
