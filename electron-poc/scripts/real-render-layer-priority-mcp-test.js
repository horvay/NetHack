#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-render-layer-priority');
const scenarioId = 'render/layer-priority';
const port = Number(process.env.NH_RENDER_LAYER_CDP_PORT || 9644);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ running: window.__nethackAutomation?.state?.().runningState?.running || false, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '', body: document.body.innerText }))()`); }
async function start(cdp) { await click(cdp, '#start-shim'); await delay(250); await click(cdp, '#confirm-character'); await waitFor(async () => (await state(cdp)).running, 20000); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); }
async function mapMetrics(cdp) { return evalExpr(cdp, `(() => {
  const summarize = (el) => {
    const layers = Array.from(el.querySelectorAll('.tile-layer')).map((layer) => ({ role: layer.className.match(/tile-layer-([a-z-]+)/)?.[1] || '', tileId: layer.dataset.tileId || '', label: layer.dataset.label || '', zIndex: getComputedStyle(layer).zIndex, backgroundImage: layer.style.backgroundImage || '', text: layer.textContent || '' }));
    const r = el.getBoundingClientRect();
    return { x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), glyph: el.dataset.glyph || el.textContent || '', className: el.className || '', layerOrder: el.dataset.layerOrder || '', tileId: el.dataset.tileId || '', objectTileId: el.dataset.objectTileId || '', semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '', objectLayerSemanticKind: el.dataset.objectLayerSemanticKind || '', objectLayerSemanticName: el.dataset.objectLayerSemanticName || '', aria: el.getAttribute('aria-label') || '', layers, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
  };
  const cells = Array.from(document.querySelectorAll('.tile-cell')).map(summarize);
  const hero = cells.find((c) => c.semanticKind === 'hero' || c.glyph === '@' || /hero|valkyrie/i.test(c.aria));
  const rel = (dx, dy) => hero ? cells.find((c) => c.x === hero.x + dx && c.y === hero.y + dy) || null : null;
  return { hero, westObject: rel(-1, 0), eastMonster: rel(1, 0), northFloor: rel(0, -1), body: document.body.innerText };
})()`); }
async function hoverCell(cdp, cell) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cell.rect.left + cell.rect.width / 2, y: cell.rect.top + cell.rect.height / 2 }); await delay(150); }
async function tooltip(cdp) { return evalExpr(cdp, `(() => ({ hidden: document.getElementById('map-tooltip')?.hidden, title: document.getElementById('map-tooltip-title')?.textContent || '', description: document.getElementById('map-tooltip-description')?.textContent || '', text: document.getElementById('map-tooltip')?.innerText || '' }))()`); }
async function showProofPanel(cdp, metrics) { return evalExpr(cdp, `((data) => {
  document.getElementById('map-tooltip').hidden = true;
  document.getElementById('layer-proof-panel')?.remove();
  const panel = document.createElement('section');
  panel.id = 'layer-proof-panel';
  panel.style.cssText = 'position:fixed;left:24px;top:108px;z-index:9999;background:#08090d;border:2px solid #f6d365;border-radius:14px;padding:14px;display:flex;gap:14px;align-items:flex-start;box-shadow:0 18px 40px rgba(0,0,0,.62);--tile-size:80px';
  const entries = [['Object on floor', data.westObject], ['Player over box', data.hero], ['Jackal over chest', data.eastMonster], ['Normal floor', data.northFloor]];
  for (const [label, cell] of entries) {
    const original = document.querySelector('.tile-cell[data-map-x="' + cell.x + '"][data-map-y="' + cell.y + '"]');
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;gap:8px;justify-items:center;color:#fff4c1;font:700 13px system-ui,sans-serif;max-width:110px;text-align:center';
    const clone = original.cloneNode(true);
    clone.classList.remove('adjacent-move-target', 'cursor');
    clone.style.width = '80px'; clone.style.height = '80px'; clone.style.outline = '1px solid rgba(255,255,255,.24)'; clone.style.outlineOffset = '0';
    const caption = document.createElement('div'); caption.textContent = label;
    wrap.append(clone, caption); panel.appendChild(wrap);
  }
  document.body.appendChild(panel);
  return true;
})(${JSON.stringify(metrics)})`); }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '515151', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', (d) => { logs += d; process.stdout.write(d); }); child.stderr.on('data', (d) => { logs += d; process.stderr.write(d); });
  let cdp; const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); fs.writeFileSync(path.join(outDir, 'electron.log'), logs); };
  process.on('exit', cleanup);
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 2, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    const loaded = await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
    const metrics = await waitFor(async () => { const m = await mapMetrics(cdp); return m.hero?.layerOrder && m.westObject?.tileId && m.eastMonster?.layerOrder ? m : null; }, 10000).catch(async (error) => { fs.writeFileSync(path.join(outDir, 'layer-timeout-debug.json'), JSON.stringify(await mapMetrics(cdp).catch(() => ({})), null, 2)); await shot(cdp, 'debug-layer-timeout.png').catch(() => undefined); throw error; });
    assert('object on floor renders as object over terrain', /apple/i.test(`${metrics.westObject.tileId} ${metrics.westObject.semanticName} ${metrics.westObject.aria}`) && metrics.westObject.layerOrder === 'terrain<object' && /terrain-floor/.test(metrics.westObject.className), JSON.stringify(metrics.westObject));
    assert('player standing on container renders player above box above floor', metrics.hero.layerOrder === 'terrain<object<actor' && /large-box/.test(metrics.hero.objectTileId) && metrics.hero.layers.some((l) => l.role === 'object' && /large box/i.test(l.label)) && metrics.hero.layers.some((l) => l.role === 'actor'), JSON.stringify(metrics.hero));
    const heroObjectLayer = metrics.hero.layers.find((l) => l.role === 'object');
    const heroActorLayer = metrics.hero.layers.find((l) => l.role === 'actor');
    assert('player layer z-index is greater than object layer z-index', Number(heroActorLayer.zIndex) > Number(heroObjectLayer.zIndex), JSON.stringify(metrics.hero.layers));
    assert('monster sharing object renders monster above chest above floor', metrics.eastMonster.layerOrder === 'terrain<object<actor' && /jackal/i.test(`${metrics.eastMonster.semanticName} ${metrics.eastMonster.aria}`) && /chest/.test(metrics.eastMonster.objectTileId) && metrics.eastMonster.layers.some((l) => l.role === 'object' && /chest/i.test(l.label)), JSON.stringify(metrics.eastMonster));
    assert('adjacent terrain remains ordinary back layer', metrics.northFloor && /terrain-floor/.test(metrics.northFloor.className) && !metrics.northFloor.objectTileId && !metrics.northFloor.layers.length, JSON.stringify(metrics.northFloor));
    await hoverCell(cdp, metrics.hero);
    const heroTip = await tooltip(cdp);
    assert('hero tooltip keeps object information', !heroTip.hidden && /hero|valkyrie/i.test(heroTip.title) && /Also here: Large Box/i.test(heroTip.description), JSON.stringify(heroTip));
    await hoverCell(cdp, metrics.eastMonster);
    const monsterTip = await tooltip(cdp);
    assert('monster tooltip keeps object information', !monsterTip.hidden && /jackal/i.test(monsterTip.title) && /Also here: Chest/i.test(monsterTip.description), JSON.stringify(monsterTip));
    const screenshot = await shot(cdp, '01-layer-priority-map.png');
    await showProofPanel(cdp, metrics);
    const proofScreenshot = await shot(cdp, '02-layer-priority-proof-panel.png');
    fs.writeFileSync(path.join(outDir, 'layer-priority-debug.json'), JSON.stringify({ ...metrics, heroTip, monsterTip }, null, 2));
    const summary = [`# Render layer priority real Electron smoke`, '', 'PASS', '', `Scenario: ${scenarioId}`, `Map screenshot: ${screenshot}`, `Zoomed proof panel screenshot: ${proofScreenshot}`, '', 'Command: npm run test:real-render-layer-priority-mcp', '', 'Verified in the real Electron/game path:', '- apple object on floor renders as object over terrain', '- player/hero on large box renders layer order terrain < object < actor', '- jackal on chest renders layer order terrain < object < actor', '- adjacent normal floor has no object/actor overlay', '- hero and monster hover tooltips retain the underlying object names', '', 'Layer evidence:', '```json', JSON.stringify({ hero: metrics.hero, westObject: metrics.westObject, eastMonster: metrics.eastMonster, northFloor: metrics.northFloor, heroTip, monsterTip }, null, 2), '```', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-render-layer-priority-summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
