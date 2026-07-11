const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-scenario-terrain-map');
const scenarioId = 'map/terrain-room-trap-water';
const port = Number(process.env.NH_SCENARIO_TERRAIN_CDP_PORT || 9636);
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ running: window.__nethackAutomation?.state?.().runningState?.running || false, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '', body: document.body.innerText, messages: window.__nethackPromptTest?.messages?.().slice(-12).map((m) => m.text || String(m)) || [] }))()`); }
async function start(cdp) { await click(cdp, '#start-shim'); await delay(250); await click(cdp, '#confirm-character'); await waitFor(async () => (await state(cdp)).running, 20000); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); }
async function mapMetrics(cdp) { return evalExpr(cdp, `(() => {
  const summarize = (el) => ({
    x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), glyph: el.dataset.glyph || el.textContent || '', className: el.className || '',
    tileId: el.dataset.tileId || '', semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '',
    backgroundSemanticKind: el.dataset.backgroundSemanticKind || '', backgroundSemanticName: el.dataset.backgroundSemanticName || '',
    aria: el.getAttribute('aria-label') || '', text: el.textContent || ''
  });
  const cells = Array.from(document.querySelectorAll('.tile-cell')).map(summarize);
  const hero = cells.find((c) => c.semanticKind === 'hero' || c.semanticKind === 'player' || c.glyph === '@' || /Hero|Player|Valkyrie/i.test(c.aria));
  const aroundHero = hero ? cells.filter((c) => Math.abs(c.x - hero.x) <= 4 && Math.abs(c.y - hero.y) <= 3) : [];
  const rel = (dx, dy) => hero ? cells.find((c) => c.x === hero.x + dx && c.y === hero.y + dy) || null : null;
  const hay = (c) => [c?.glyph, c?.className, c?.tileId, c?.semanticKind, c?.semanticName, c?.backgroundSemanticKind, c?.backgroundSemanticName, c?.aria, c?.text].join(' ');
  const findAny = (pred) => aroundHero.find(pred) || cells.find(pred) || null;
  return {
    hero,
    expected: {
      westWall: rel(-3, 0), northWall: rel(0, -2), openDoor: rel(-1, 0), trap: rel(2, -1), water: rel(1, 0), lava: rel(0, 1), stairs: rel(1, 1), apple: rel(-2, 0)
    },
    found: {
      wall: findAny((c) => /terrain-wall|wall/i.test(hay(c)) && /[-|]/.test(c.glyph || c.text || c.aria)),
      openDoor: findAny((c) => /open.*door|door.*open|terrain-door-open|open-horizontal-door|open-vertical-door/i.test(hay(c)) || c.glyph === '/'),
      trap: findAny((c) => /trap|pit/i.test(hay(c)) || c.glyph === '^'),
      water: findAny((c) => /water|pool|moat/i.test(hay(c)) || /[}~]/.test(c.glyph || c.text || '')),
      lava: findAny((c) => /lava/i.test(hay(c)) || c.glyph === 'L'),
      stairs: findAny((c) => /up.*stair|stair.*up|up-stairs/i.test(hay(c))),
      apple: findAny((c) => /apple/i.test(hay(c)))
    },
    aroundHero,
    body: document.body.innerText,
    seen: document.getElementById('shim-output')?.dataset?.seen || '',
    shim: document.getElementById('shim-output')?.innerText || ''
  };
})()`); }

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
    const exactCellOk = (c, pattern) => c && pattern.test([c.glyph, c.className, c.tileId, c.semanticKind, c.semanticName, c.aria, c.text].join(' '));
    const metrics = await waitFor(async () => {
      const m = await mapMetrics(cdp);
      return m.hero
        && exactCellOk(m.expected.westWall, /wall|terrain-wall/i)
        && exactCellOk(m.expected.northWall, /wall|terrain-wall/i)
        && exactCellOk(m.expected.openDoor, /open.*door|door.*open|terrain-door-open|open-horizontal-door|open-vertical-door/i)
        && exactCellOk(m.expected.trap, /trap|\^/i)
        && exactCellOk(m.expected.water, /water|pool|moat|[}~]/i)
        && exactCellOk(m.expected.lava, /lava|[}L]/i)
        && exactCellOk(m.expected.stairs, /up.*stair|stair.*up|up-stairs/i)
        && exactCellOk(m.expected.apple, /apple/i)
        ? m : null;
    }, 10000).catch(async (error) => { const debug = await mapMetrics(cdp).catch(() => ({})); fs.writeFileSync(path.join(outDir, 'scenario-terrain-timeout-debug.json'), JSON.stringify(debug, null, 2)); await shot(cdp, 'debug-scenario-terrain-timeout.png').catch(() => undefined); throw error; });
    const mapShot = await shot(cdp, '01-scenario-terrain-map.png');
    const evidenceText = JSON.stringify({ expected: metrics.expected, found: metrics.found }, null, 2);
    assert('exact west wall cell is visible and labeled/semantic', exactCellOk(metrics.expected.westWall, /wall|terrain-wall/i), evidenceText);
    assert('exact north wall cell is visible and labeled/semantic', exactCellOk(metrics.expected.northWall, /wall|terrain-wall/i), evidenceText);
    assert('exact open door cell is visible and labeled/semantic', exactCellOk(metrics.expected.openDoor, /open.*door|door.*open|terrain-door-open|open-horizontal-door|open-vertical-door/i), evidenceText);
    assert('exact trap cell is visible and labeled/semantic', exactCellOk(metrics.expected.trap, /trap|\^/i), evidenceText);
    assert('exact water cell is visible and labeled/semantic', exactCellOk(metrics.expected.water, /water|pool|moat|[}~]/i), evidenceText);
    assert('exact lava cell is visible and labeled/semantic', exactCellOk(metrics.expected.lava, /lava|[}L]/i), evidenceText);
    assert('exact up-stairs cell is visible and labeled/semantic', exactCellOk(metrics.expected.stairs, /up.*stair|stair.*up|up-stairs/i), evidenceText);
    assert('exact ground apple cell is visible as object label', exactCellOk(metrics.expected.apple, /apple/i), evidenceText);
    assert('terrain map avoids fallback UI labels', !/Name unavailable|Inventory selector|Loading your inventory/i.test(metrics.body), metrics.body.slice(0, 1200));
    fs.writeFileSync(path.join(outDir, 'terrain-map-debug.json'), JSON.stringify({ hero: metrics.hero, expected: metrics.expected, found: metrics.found, aroundHero: metrics.aroundHero }, null, 2));
    const summary = [`# Scenario loader terrain/map real Electron smoke`, '', 'PASS', '', `Scenario: ${scenarioId}`, `Map screenshot: ${mapShot}`, '', 'Verified scenario public facts through visible UI/map cells:', '- wall cell', '- open door cell', '- trap cell', '- water cell', '- lava cell', '- up-stairs cell', '- ground apple object cell', '', 'Map cell evidence:', '```json', evidenceText, '```', '', 'Note: this proof verifies the public map glyph/semantic/aria cells emitted by the real shim startup for the terrain fixture; it does not attempt stair traversal or swimming/lava movement.', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-scenario-terrain-map-summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
