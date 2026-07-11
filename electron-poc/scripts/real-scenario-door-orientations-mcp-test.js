const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_DOOR_ORIENTATION_OUT_DIR || path.join(root, 'test-output', 'real-scenario-door-orientations');
const scenarioId = 'map/door-orientations';
const port = Number(process.env.NH_DOOR_ORIENTATION_CDP_PORT || 9647);
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ running: window.__nethackAutomation?.state?.().runningState?.running || false, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '', body: document.body.innerText }))()`); }
async function start(cdp) { await click(cdp, '#start-shim'); await delay(250); await click(cdp, '#confirm-character'); await waitFor(async () => (await state(cdp)).running, 20000); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); }
async function snapshot(cdp) { return evalExpr(cdp, `(() => {
  const summarize = (el) => ({ x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), glyph: el.dataset.glyph || el.textContent || '', glyphNumber: el.dataset.glyphNumber || '', className: el.className || '', tileId: el.dataset.tileId || '', semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '', aria: el.getAttribute('aria-label') || '', rect: (() => { const r = el.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2, width: r.width, height: r.height }; })() });
  const cells = Array.from(document.querySelectorAll('.tile-cell')).map(summarize);
  const hero = cells.find((c) => c.glyph === '@' || c.semanticKind === 'hero' || c.semanticKind === 'player');
  const at = (dx, dy) => hero ? cells.find((c) => c.x === hero.x + dx && c.y === hero.y + dy) || null : null;
  return { hero, doors: { horizontalClosed: at(-8, -3), horizontalOpen: at(0, -3), verticalOpen: at(4, -3), verticalClosed: at(8, -3), verticalDoorway: at(-4, -3), horizontalDoorway: at(0, -2) }, tooltip: { hidden: document.getElementById('map-tooltip')?.hidden, text: document.getElementById('map-tooltip')?.innerText || '', iconClass: document.getElementById('map-tooltip-icon')?.className || '', assetId: document.getElementById('map-tooltip-icon')?.dataset.tileId || '', iconImage: document.getElementById('map-tooltip-icon')?.style.backgroundImage || '' }, body: document.body.innerText };
})()`); }
async function hoverCell(cdp, cell) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cell.rect.x, y: cell.rect.y }); await delay(250); return snapshot(cdp); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
function hay(c) { return [c?.glyph, c?.glyphNumber, c?.className, c?.tileId, c?.semanticKind, c?.semanticName, c?.aria].join(' '); }

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
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    const loaded = await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
    let snap = await waitFor(async () => { const s = await snapshot(cdp); return s.hero && Object.values(s.doors).every(Boolean) ? s : null; }, 10000);
    const expected = {
      horizontalClosed: { title: /Horizontal Closed Door/i, tileId: 'closed-door', glyphNumber: '3989', icon: /door-in-horizontal-wall/, cell: /terrain-door.*door-in-horizontal-wall/ },
      verticalClosed: { title: /Vertical Closed Door/i, tileId: 'closed-door', glyphNumber: '3988', icon: /door-in-vertical-wall/, cell: /terrain-door.*door-in-vertical-wall/ },
      horizontalOpen: { title: /Horizontal Open Door/i, tileId: 'open-horizontal-door', glyphNumber: '3987', icon: /terrain-door-open-horizontal|door-in-horizontal-wall/, cell: /terrain-door-open-horizontal/ },
      verticalOpen: { title: /Vertical Open Door/i, tileId: 'open-vertical-door', glyphNumber: '3986', icon: /terrain-door-open-vertical|door-in-vertical-wall/, cell: /terrain-door-open-vertical/ },
      verticalDoorway: { title: /Empty Doorway/i, tileId: 'no-door-doorway', glyphNumber: '3985', icon: /terrain-doorway.*door-in-vertical-wall/, cell: /terrain-doorway.*door-in-vertical-wall/ },
      horizontalDoorway: { title: /Empty Doorway/i, tileId: 'no-door-doorway', glyphNumber: '3985', icon: /terrain-doorway.*door-in-horizontal-wall/, cell: /terrain-doorway.*door-in-horizontal-wall/ },
    };
    const screenshots = { map: await shot(cdp, '00-door-orientation-map.png') };
    const hoverEvidence = {};
    for (const [name, spec] of Object.entries(expected)) {
      const cell = snap.doors[name];
      assert(`${name} cell class/tile/glyph`, spec.cell.test(hay(cell)) && cell.tileId === spec.tileId && cell.glyphNumber === spec.glyphNumber, JSON.stringify(cell));
      const hovered = await hoverCell(cdp, cell);
      hoverEvidence[name] = { cell, tooltip: hovered.tooltip };
      assert(`${name} tooltip title/icon/tile`, spec.title.test(hovered.tooltip.text) && hovered.tooltip.assetId === spec.tileId && spec.icon.test(hovered.tooltip.iconClass) && !hovered.tooltip.iconImage && (spec.tileId !== 'no-door-doorway' || !/terrain-door-open/.test(hovered.tooltip.iconClass)), JSON.stringify(hovered.tooltip));
      screenshots[name] = await shot(cdp, `tooltip-${name}.png`);
    }
    const result = { scenarioId, checks: Object.fromEntries(Object.keys(expected).map((k) => [k, true])), hero: snap.hero, doors: snap.doors, hoverEvidence, screenshots };
    fs.writeFileSync(path.join(outDir, 'door-orientation-result.json'), JSON.stringify(result, null, 2));
    const summary = [`# Real door orientation tooltip MCP/CDP validation`, '', 'PASS', '', `Scenario: ${scenarioId}`, '', 'Verified real Electron/fixture-rendered map cells and actual mouse hover tooltips for:', '- Horizontal Closed Door, glyph 3989, tile id closed-door', '- Vertical Closed Door, glyph 3988, tile id closed-door', '- Horizontal Open Door, glyph 3987, tile id open-horizontal-door', '- Vertical Open Door, glyph 3986, tile id open-vertical-door', '- Vertical Empty Doorway, glyph 3985, tile id no-door-doorway', '- Horizontal Empty Doorway, glyph 3985, tile id no-door-doorway', '', 'Screenshots:', ...Object.entries(screenshots).map(([k, v]) => `- ${k}: ${v}`), ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-scenario-door-orientations-summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
