const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_THIN_SPELLBOOK_OUT_DIR || path.join(root, 'test-output', 'real-scenario-thin-spellbook-tooltip');
const scenarioId = 'object/asset-tooltip-thin-spellbook';
const port = Number(process.env.NH_THIN_SPELLBOOK_CDP_PORT || 9652);
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function start(cdp) { await click(cdp, '#start-shim'); await delay(250); await click(cdp, '#confirm-character'); await waitFor(async () => evalExpr(cdp, `window.__nethackAutomation?.state?.().runningState?.running || false`), 25000); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); }
async function snapshot(cdp) { return evalExpr(cdp, `(() => {
  const summarize = (el) => ({
    x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), glyph: el.dataset.glyph || el.textContent || '', glyphNumber: el.dataset.glyphNumber || '', className: el.className || '', tileId: el.dataset.tileId || '', semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '', aria: el.getAttribute('aria-label') || '', text: el.textContent || '', rect: (() => { const r = el.getBoundingClientRect(); return { left:r.left, top:r.top, width:r.width, height:r.height, cx:r.left+r.width/2, cy:r.top+r.height/2 }; })()
  });
  const cells = Array.from(document.querySelectorAll('.tile-cell')).map(summarize);
  const hero = cells.find((c) => c.semanticKind === 'hero' || c.semanticKind === 'player' || c.glyph === '@' || /Hero|Player|Valkyrie/i.test(c.aria));
  const rel = (dx, dy) => hero ? cells.find((c) => c.x === hero.x + dx && c.y === hero.y + dy) || null : null;
  const tip = document.getElementById('map-tooltip'); const icon = document.getElementById('map-tooltip-icon');
  return { hero, east: rel(1,0), tooltip: { hidden: Boolean(tip?.hidden), text: tip?.innerText || '', title: document.getElementById('map-tooltip-title')?.textContent || '', description: document.getElementById('map-tooltip-description')?.textContent || '', assetId: icon?.dataset.tileId || '', iconImage: icon?.style.backgroundImage || '', iconClass: icon?.className || '' }, body: document.body.innerText, seen: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '' };
})()`); }
async function hoverCell(cdp, cell) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cell.rect.cx, y: cell.rect.cy }); await delay(350); return snapshot(cdp); }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '40', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const snap = await snapshot(cdp);
    assert('east thin spellbook cell is visible', /thin spellbook/i.test(`${snap.east.aria} ${snap.east.semanticName}`) && snap.east.tileId === 'spellbook-class-icon', JSON.stringify(snap.east));
    assert('east thin spellbook cell is not closed-door CSS', !/terrain-door|closed-door/i.test(`${snap.east.className} ${snap.east.tileId} ${snap.east.aria}`), JSON.stringify(snap.east));
    const mapShot = await shot(cdp, '00-map-before-hover.png');
    const thinSnap = await hoverCell(cdp, snap.east);
    const tooltipShot = await shot(cdp, '01-thin-spellbook-tooltip.png');
    assert('thin spellbook tooltip uses public appearance title', thinSnap.tooltip.title === 'Thin Spellbook' && /Object/i.test(thinSnap.tooltip.description), JSON.stringify(thinSnap.tooltip));
    assert('thin spellbook tooltip uses spellbook art, not closed-door or hidden spell art', thinSnap.tooltip.assetId === 'spellbook-class-icon' && /spellbook-class-icon\.png/.test(thinSnap.tooltip.iconImage || '') && !/closed-door|chain-lightning|jumping/.test(`${thinSnap.tooltip.iconImage} ${thinSnap.tooltip.assetId}`), JSON.stringify(thinSnap.tooltip));
    assert('hidden true spell is not shown to player', !/chain lightning|jumping/i.test(`${thinSnap.east.aria} ${thinSnap.tooltip.text}`), JSON.stringify({ cell: thinSnap.east, tooltip: thinSnap.tooltip }));
    assert('spellbook glyph does not advertise door actions', !/Open east door|Kick east door|Close east door/i.test(thinSnap.body), thinSnap.body.slice(0, 1600));
    assert('no fallback/developer labels visible', !/Name unavailable|Inventory selector|Loading your inventory/i.test(thinSnap.body), thinSnap.body.slice(0, 1200));
    const result = { scenarioId, seed: 40, screenshots: { map: mapShot, tooltip: tooltipShot }, cell: thinSnap.east, tooltip: thinSnap.tooltip };
    fs.writeFileSync(path.join(outDir, 'thin-spellbook-tooltip-result.json'), JSON.stringify(result, null, 2));
    const summary = [`# Real thin spellbook tooltip MCP/CDP validation`, '', 'PASS', '', `Scenario: ${scenarioId}`, 'Seed: 40 (chain lightning is publicly described as a thin spellbook in this fixture run)', `Map screenshot: ${mapShot}`, `Thin spellbook tooltip screenshot: ${tooltipShot}`, '', 'Verified through real Electron/shim scenario:', '- east ground object is rendered from live shim_print_glyph as an unidentified object with public appearance Thin Spellbook', '- map cell and tooltip use spellbook-class-icon art, not closed-door CSS/PNG and not hidden spell identity art', '- hidden true spell name is not visible in aria, title, or tooltip text', '- the + object glyph does not advertise door actions in the context bar', '', 'Evidence:', '```json', JSON.stringify({ cell: result.cell, tooltip: result.tooltip }, null, 2), '```', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-scenario-thin-spellbook-tooltip-summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
