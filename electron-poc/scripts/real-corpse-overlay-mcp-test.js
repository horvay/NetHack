const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_CORPSE_OVERLAY_OUT_DIR || path.join(root, 'test-output', 'real-corpse-overlay-mcp');
const port = Number(process.env.NH_CORPSE_OVERLAY_CDP_PORT || 9598);
const width = Number(process.env.NH_CORPSE_OVERLAY_WIDTH || 1280);
const height = Number(process.env.NH_CORPSE_OVERLAY_HEIGHT || 900);
fs.mkdirSync(outDir, { recursive: true });
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out waiting'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function clickCenter(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function hoverFirstCellKind(cdp, kind) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector('.tile-cell[data-semantic-kind="${kind}"]'); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing ${kind} cell to hover`); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y }); await delay(150); }
async function tooltipMetrics(cdp) { return evalExpr(cdp, `(() => { const tip = document.getElementById('map-tooltip'); const icon = document.getElementById('map-tooltip-icon'); const title = document.getElementById('map-tooltip-title'); const description = document.getElementById('map-tooltip-description'); const r = tip?.getBoundingClientRect(); return { hidden: Boolean(tip?.hidden), text: tip?.innerText || '', title: title?.textContent || '', description: description?.textContent || '', tooltipClass: tip?.className || '', titleColor: title ? getComputedStyle(title).color : '', descriptionColor: description ? getComputedStyle(description).color : '', iconClass: icon?.className || '', rect: r ? {left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height} : null }; })()`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ status: document.getElementById('status')?.textContent || '', dialogs: Array.from(document.querySelectorAll('dialog[open]')).map(d => d.id), messages: window.__nethackPromptTest?.messages?.().slice(-8).map(m => m.text || String(m)) || [], seen: document.getElementById('shim-output')?.dataset?.seen || '', automation: window.__nethackAutomation?.state?.() }))()`); }
async function waitForStarted(cdp) {
  await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackAutomation && !!window.__nethackPromptTest")), 10000);
  await clickCenter(cdp, '#start-shim');
  await delay(200);
  await clickCenter(cdp, '#confirm-character');
  const started = await waitFor(async () => { const s = await state(cdp); return s.automation?.runningState?.running && /shim_glyph|shim_print_glyph|shim_status_update|shim_curs|shim_putstr/.test(s.seen) ? s : null; }, 20000);
  if (started.dialogs.includes('intro-dialog')) {
    await clickCenter(cdp, '#intro-continue');
    await waitFor(async () => !(await state(cdp)).dialogs.includes('intro-dialog'), 5000);
  }
  await delay(250);
  await evalExpr(cdp, "document.getElementById('game-grid').focus()");
  return state(cdp);
}
async function liveMapMetrics(cdp) { return evalExpr(cdp, `(() => {
  const cells = Array.from(document.querySelectorAll('.tile-cell'));
  const summarize = (el) => ({
    x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), className: el.className || '',
    tileId: el.dataset.tileId || '', semanticKind: el.dataset.semanticKind || '',
    semanticName: el.dataset.semanticName || '', aria: el.getAttribute('aria-label') || ''
  });
  const corpseCells = cells.filter(el => el.dataset.semanticKind === 'corpse').map(summarize);
  const overlaidCorpses = corpseCells.filter(c => /corpse-overlay/.test(c.className));
  const statueCells = cells.filter(el => el.dataset.semanticKind === 'statue').map(summarize);
  const stoneStatues = statueCells.filter(c => /statue-overlay/.test(c.className) && /tile-overlay/.test(c.className));
  const statueWithCorpseOverlay = statueCells.filter(c => /corpse-overlay/.test(c.className));
  const liveMonsters = cells.filter(el => el.dataset.semanticKind === 'monster' || el.dataset.semanticKind === 'pet').map(summarize);
  const liveMonsterWithOverlay = liveMonsters.filter(c => /corpse-overlay|statue-overlay/.test(c.className));
  return {
    corpseCells, overlaidCorpses, statueCells, stoneStatues, statueWithCorpseOverlay, liveMonsters, liveMonsterWithOverlay,
    gridText: document.getElementById('game-grid')?.getAttribute('aria-label') || '',
    openDialogs: Array.from(document.querySelectorAll('dialog[open]')).map(d => d.id),
    status: document.getElementById('status')?.textContent || '',
    seen: document.getElementById('shim-output')?.dataset?.seen || '',
    shimEventCount: Number(document.getElementById('shim-output')?.dataset?.count || 0),
    messageText: document.getElementById('messages')?.innerText || ''
  };
})()`); }

(async () => {
  const proc = spawn(electronBin, ['.'], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      AI_ORG_ELECTRON_CDP_PORT: String(port),
      NH_ELECTRON_WINDOW_WIDTH: String(width),
      NH_ELECTRON_WINDOW_HEIGHT: String(height),
      NH_SHIM_TEST_CORPSE_OVERLAY_SCENE: '1',
      NETHACK_SEED: '424242'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  proc.stdout.on('data', (d) => { logs += d.toString(); });
  proc.stderr.on('data', (d) => { logs += d.toString(); });
  let cdp;
  try {
    const target = await waitFor(async () => (await json(`http://127.0.0.1:${port}/json/list`)).find((t) => t.type === 'page' && t.webSocketDebuggerUrl), 20000);
    cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const startup = await waitForStarted(cdp);
    const initial = await shot(cdp, '01-live-game-started-before-corpse-assertion.png');
    const metrics = await waitFor(async () => {
      const m = await liveMapMetrics(cdp);
      return m.overlaidCorpses.length && m.stoneStatues.length && m.liveMonsters.length ? m : null;
    }, 10000);
    await delay(300);
    const overlayShot = await shot(cdp, '02-live-game-corpse-red-x-overlay-with-live-monster-negative.png');
    await hoverFirstCellKind(cdp, 'corpse');
    const corpseTooltip = await tooltipMetrics(cdp);
    const tooltipShot = await shot(cdp, '03-live-game-corpse-tooltip-red-x-overlay.png');
    await hoverFirstCellKind(cdp, 'statue');
    const statueTooltip = await tooltipMetrics(cdp);
    const statueTooltipShot = await shot(cdp, '04-live-game-statue-tooltip-grey-label.png');
    const checks = {
      realElectronLaunched: true,
      liveShimStartupReachedMapEvents: /shim_glyph|shim_print_glyph|shim_status_update|shim_curs|shim_putstr/.test(startup.seen || metrics.seen),
      liveGameCorpsePresent: metrics.corpseCells.length > 0,
      liveGameCorpseHasOverlay: metrics.overlaidCorpses.length === metrics.corpseCells.length,
      liveGameStatuePresent: metrics.statueCells.length > 0,
      liveGameStatueHasStoneOverlay: metrics.stoneStatues.length === metrics.statueCells.length,
      statueDoesNotUseCorpseRedX: metrics.statueWithCorpseOverlay.length === 0,
      statueTooltipShownByRealHover: !statueTooltip.hidden && /Jackal Statue/i.test(statueTooltip.title) && /map-tooltip-statue/.test(statueTooltip.tooltipClass || '') && /statue-overlay/.test(statueTooltip.iconClass || '') && /rgb\(200, 205, 212\)/.test(statueTooltip.titleColor || ''),
      liveMonsterPresentForNegativeCase: metrics.liveMonsters.length > 0,
      liveMonsterNoCorpseOrStatueOverlay: metrics.liveMonsterWithOverlay.length === 0,
      corpseTooltipShownByRealHover: !corpseTooltip.hidden && /corpse-overlay/.test(corpseTooltip.iconClass) && /corpse/i.test(corpseTooltip.text),
      noRendererStagedCellsUsed: !/fixture/i.test(metrics.status) && metrics.shimEventCount > 0,
      noUnexpectedDialogs: metrics.openDialogs.length === 0,
    };
    const md = [`# Real corpse and statue overlay MCP/CDP validation`, '', `Output: ${outDir}`, '', '## Startup/root cause check', '- Real Electron launched: yes', '- Shim/game startup reached live map events: yes', '- Startup wait waits for renderer automation hooks before clicking New game.', '', '## Live-game setup', '- The Electron process was started with `NH_SHIM_TEST_CORPSE_OVERLAY_SCENE=1` and `NETHACK_SEED=424242`.', '- The fixture is injected in NetHack game initialization, not through renderer DOM hooks: it places a real jackal corpse object, a real jackal statue object, and a live jackal monster near the player before `docrt()`, so the screenshot is produced from live shim `shim_print_glyph` map events.', '- The tooltip screenshots are produced by dispatching real mouse hovers over the rendered corpse and statue cells in the live Electron game.', '', '## Checks', ...Object.entries(checks).map(([k,v]) => `- ${v ? 'PASS' : 'FAIL'} ${k}`), '', '## Live map cell evidence', '```json', JSON.stringify(metrics, null, 2), '```', '', '## Corpse tooltip evidence', '```json', JSON.stringify(corpseTooltip, null, 2), '```', '', '## Statue tooltip evidence', '```json', JSON.stringify(statueTooltip, null, 2), '```', '', '## Screenshots', `- Live Electron game after real shim startup: ${initial}`, `- Live-game corpse red-X and statue stone overlays with live monster negative: ${overlayShot}`, `- Live-game corpse tooltip with matching red-X overlay: ${tooltipShot}`, `- Live-game statue tooltip with grey text and statue label: ${statueTooltipShot}`, ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-corpse-overlay-mcp-summary.md'), md);
    if (!Object.values(checks).every(Boolean)) throw new Error(md);
    console.log(md);
  } finally {
    if (cdp) cdp.close();
    proc.kill('SIGTERM');
    fs.writeFileSync(path.join(outDir, 'electron.log'), logs);
  }
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
