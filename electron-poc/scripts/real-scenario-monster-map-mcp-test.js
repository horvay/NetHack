const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_SCENARIO_MONSTER_OUT_DIR || path.join(root, 'test-output', 'real-scenario-monster-map');
const scenarioId = 'monster/visible-jackal-east';
const port = Number(process.env.NH_SCENARIO_MONSTER_CDP_PORT || 9634);
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function hover(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y }); await delay(250); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ running: window.__nethackAutomation?.state?.().runningState?.running || false, dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id), seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '', body: document.body.innerText }))()`); }
async function start(cdp) {
  await click(cdp, '#start-shim');
  await delay(250);
  if ((await state(cdp)).dialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game');
  await waitFor(() => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 7000);
  await click(cdp, '#confirm-character');
  await waitFor(async () => (await state(cdp)).running, 20000);
  if ((await state(cdp)).dialogs.includes('intro-dialog')) await click(cdp, '#intro-continue');
  await waitFor(async () => !(await state(cdp)).dialogs.includes('intro-dialog'), 5000);
  await evalExpr(cdp, `(() => { document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`);
}
async function tooltipState(cdp) { return evalExpr(cdp, `(() => { const tip = document.getElementById('map-tooltip'); return { hidden: !tip || tip.hidden, text: tip?.innerText || '', iconImage: tip?.querySelector('.map-tooltip-icon')?.style?.backgroundImage || '', assetId: tip?.dataset?.assetId || '' }; })()`); }
async function mapMetrics(cdp) { return evalExpr(cdp, `(() => {
  const cells = Array.from(document.querySelectorAll('.tile-cell'));
  const summarize = (el) => ({
    x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), className: el.className || '',
    tileId: el.dataset.tileId || '', glyph: el.dataset.glyph || '', glyphNumber: el.dataset.glyphNumber || '', semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '',
    aria: el.getAttribute('aria-label') || '', text: el.textContent || ''
  });
  const monsters = cells.filter((el) => ['monster', 'pet'].includes(el.dataset.semanticKind)).map(summarize);
  const jackals = monsters.filter((c) => String(c.semanticName || c.tileId || '').toLowerCase() === 'jackal' || String(c.tileId || '').toLowerCase() === 'jackal');
  const dwarves = monsters.filter((c) => /dwarf/i.test([c.semanticName, c.aria, c.tileId].join(' ')));
  const werejackals = monsters.filter((c) => /werejackal/i.test([c.semanticName, c.aria, c.tileId].join(' ')));
  const kittens = monsters.filter((c) => /kitten|cat/i.test([c.semanticName, c.aria, c.tileId].join(' ')) || c.semanticKind === 'pet');
  const hero = cells.find((el) => el.dataset.semanticKind === 'hero' || el.dataset.semanticKind === 'player');
  return { monsters, jackals, dwarves, werejackals, kittens, hero: hero ? summarize(hero) : null, body: document.body.innerText, seen: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '' };
})()`); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

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
    const metrics = await waitFor(async () => { const m = await mapMetrics(cdp); return m.jackals.length && m.dwarves.length && m.werejackals.length && m.kittens.length ? m : null; }, 10000).catch(async (error) => { const debug = await mapMetrics(cdp).catch(() => ({})); fs.writeFileSync(path.join(outDir, 'scenario-monster-timeout-debug.json'), JSON.stringify(debug, null, 2)); await shot(cdp, 'debug-scenario-monster-timeout.png').catch(() => undefined); throw error; });
    const mapShot = await shot(cdp, '01-scenario-visible-monsters-map.png');
    assert('jackal monster rendered as player-facing monster cell', metrics.jackals.length >= 1, JSON.stringify(metrics, null, 2));
    assert('dwarf monster rendered as player-facing monster cell with dwarf asset', metrics.dwarves.length >= 1 && metrics.dwarves.some((d) => d.tileId === 'dwarf' && d.semanticKind === 'monster' && /dwarf/i.test(d.aria || d.semanticName || '')), JSON.stringify(metrics, null, 2));
    assert('werejackal @ monster rendered as monster cell with werejackal asset, not player avatar', metrics.werejackals.length >= 1 && metrics.werejackals.some((w) => w.tileId === 'werejackal' && w.glyph === '@' && w.semanticKind === 'monster' && /werejackal/i.test(w.aria || w.semanticName || '') && !/hero|player|avatar/i.test(`${w.aria} ${w.tileId}`)), JSON.stringify(metrics, null, 2));
    await hover(cdp, '.tile-cell[data-tile-id="dwarf"]');
    const dwarfTooltip = await tooltipState(cdp);
    const dwarfHoverShot = await shot(cdp, '02-scenario-dwarf-hover-card.png');
    assert('dwarf hover card shows monster dwarf glyph with dwarf art', !dwarfTooltip.hidden && /Dwarf/.test(dwarfTooltip.text) && /Monster/.test(dwarfTooltip.text) && /glyph (44|427)/.test(dwarfTooltip.text) && /common-early-monsters\/dwarf\.png/.test(dwarfTooltip.iconImage || ''), JSON.stringify(dwarfTooltip, null, 2));
    await hover(cdp, '.tile-cell[data-tile-id="werejackal"]');
    const werejackalTooltip = await tooltipState(cdp);
    const werejackalHoverShot = await shot(cdp, '03-scenario-werejackal-hover-card.png');
    assert('werejackal @ hover card shows Werejackal monster art and never hero/player art', !werejackalTooltip.hidden && /Werejackal/.test(werejackalTooltip.text) && /Monster/.test(werejackalTooltip.text) && /glyph/.test(werejackalTooltip.text) && /full-source-monsters\/werejackal\.png|werejackal\.png/.test(werejackalTooltip.iconImage || '') && !/Hero|Player combo avatars|hero-avatar|player-pets-identity/.test(`${werejackalTooltip.text} ${werejackalTooltip.iconImage}`), JSON.stringify(werejackalTooltip, null, 2));
    assert('tame kitten rendered as player-facing pet/monster cell', metrics.kittens.length >= 1, JSON.stringify(metrics, null, 2));
    assert('monster cells avoid fallback labels', !/Name unavailable|Loading your inventory|Inventory selector/i.test(metrics.body), metrics.body.slice(0, 1200));
    const summary = [`# Scenario loader visible monster real Electron smoke`, '', 'PASS', '', `Scenario: ${scenarioId}`, `Map screenshot: ${mapShot}`, `Dwarf hover screenshot: ${dwarfHoverShot}`, `Werejackal hover screenshot: ${werejackalHoverShot}`, '', 'Verified scenario public facts through visible UI:', '- monsterRows include jackal', '- monsterRows include dwarf glyph using dwarf asset', '- monsterRows include werejackal `@` monster using monster semantics/art, not player avatar art', '- dwarf hover card says Dwarf / Monster / dwarf glyph and uses common-early-monsters/dwarf.png', '- werejackal hover card says Werejackal / Monster and uses werejackal monster art', '- monsterRows include tame kitten/pet', '- map cells were produced by real shim startup and live glyph rendering', '', 'Visible monster cell evidence:', '```json', JSON.stringify({ jackals: metrics.jackals, dwarves: metrics.dwarves, dwarfTooltip, werejackals: metrics.werejackals, werejackalTooltip, kittens: metrics.kittens, hero: metrics.hero }, null, 2), '```', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-scenario-monster-map-summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
