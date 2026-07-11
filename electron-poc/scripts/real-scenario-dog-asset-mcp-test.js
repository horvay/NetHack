const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_DOG_ASSET_OUT_DIR || path.join(root, 'test-output', 'real-scenario-dog-asset');
const scenarioId = 'pet/dog-asset-variants';
const port = Number(process.env.NH_DOG_ASSET_CDP_PORT || 9678);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(150); } throw last || new Error('timed out'); }
async function connect(url) { const ws = new WebSocket(url); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const message = JSON.parse(event.data); if (!message.id || !pending.has(message.id)) return; const entry = pending.get(message.id); pending.delete(message.id); message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result); }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evaluate(cdp, expression) { const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
async function screenshot(cdp, name) { await cdp.send('Page.bringToFront'); await delay(300); const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true }); const file = path.join(outDir, name); fs.writeFileSync(file, Buffer.from(result.data, 'base64')); return file; }
async function primeScreenshotSurface(cdp) { await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true }); }
async function pointer(cdp, selector, click = false) { const point = await evaluate(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center',inline:'center'}); const r=el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!point) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y }); if (click) { await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 }); } await delay(250); }
async function click(cdp, selector) { return pointer(cdp, selector, true); }
async function state(cdp) { return evaluate(cdp, `(() => ({ running:Boolean(window.__nethackAutomation?.state?.().runningState?.running), dialogs:Array.from(document.querySelectorAll('dialog[open]')).map(d=>d.id), seen:document.getElementById('shim-output')?.dataset?.seen||'', shim:document.getElementById('shim-output')?.innerText||'' }))()`); }
async function start(cdp) {
  await click(cdp, '#start-shim');
  if ((await state(cdp)).dialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game');
  await waitFor(() => evaluate(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 7000);
  await click(cdp, '#confirm-character');
  await waitFor(async () => (await state(cdp)).running);
  if ((await state(cdp)).dialogs.includes('intro-dialog')) await click(cdp, '#intro-continue');
  await evaluate(cdp, `document.getElementById('document-dialog')?.close?.('close')`);
}
async function dogCells(cdp) { return evaluate(cdp, `(() => Array.from(document.querySelectorAll('.tile-cell')).filter(el => /dog/i.test([el.dataset.semanticName,el.getAttribute('aria-label')].join(' '))).map(el => ({x:Number(el.dataset.mapX),y:Number(el.dataset.mapY),tileId:el.dataset.tileId||'',glyph:el.dataset.glyph||'',glyphNumber:el.dataset.glyphNumber||'',semanticKind:el.dataset.semanticKind||'',semanticName:el.dataset.semanticName||'',aria:el.getAttribute('aria-label')||'',className:el.className||''})))()`); }
async function tooltip(cdp) { return evaluate(cdp, `(() => { const tip=document.getElementById('map-tooltip'), icon=document.getElementById('map-tooltip-icon'); return {hidden:Boolean(tip?.hidden),text:tip?.innerText||'',title:document.getElementById('map-tooltip-title')?.textContent||'',description:document.getElementById('map-tooltip-description')?.textContent||'',assetId:icon?.dataset.tileId||'',iconImage:icon?.style.backgroundImage||''}; })()`); }
function assert(name, value, detail = '') { if (!value) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.', '--disable-gpu'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', data => { logs += data; process.stdout.write(data); }); child.stderr.on('data', data => { logs += data; process.stderr.write(data); });
  let cdp; const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); fs.writeFileSync(path.join(outDir, 'electron.log'), logs); };
  process.on('exit', cleanup);
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.some(page => page.type === 'page') ? list : null; });
    cdp = await connect(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(() => evaluate(cdp, `document.readyState === 'complete' && Boolean(window.__nethackPromptTest)`), 10000);
    await start(cdp);
    await waitFor(async () => /bridge_test_scenario_loaded/.test(`${(await state(cdp)).seen}\n${(await state(cdp)).shim}`), 10000);
    const cells = await waitFor(async () => { const found = await dogCells(cdp); return found.length >= 4 ? found : null; });
    const bossDog = cells.find(cell => cell.semanticKind === 'pet' && cell.semanticName === 'dog');
    const tameLittleDog = cells.find(cell => cell.semanticKind === 'pet' && cell.semanticName === 'little dog');
    const hostileLittleDog = cells.find(cell => cell.semanticKind === 'monster' && cell.semanticName === 'little dog');
    const hostileLargeDog = cells.find(cell => cell.semanticKind === 'monster' && cell.semanticName === 'large dog');
    assert('real Boss dog glyph 1167 uses repaired adult dog art', bossDog?.tileId === 'dog' && bossDog.glyphNumber === '1167', JSON.stringify(cells));
    assert('real tame little dog uses dedicated pet art', tameLittleDog?.tileId === 'little-dog-pet', JSON.stringify(cells));
    assert('real hostile little dog keeps little-dog art', hostileLittleDog?.tileId === 'little-dog', JSON.stringify(cells));
    assert('real hostile large dog keeps large-dog art', hostileLargeDog?.tileId === 'large-dog', JSON.stringify(cells));
    const mapShot = await screenshot(cdp, '01-real-all-dog-variants-map.png');
    await pointer(cdp, `.tile-cell[data-map-x="${bossDog.x}"][data-map-y="${bossDog.y}"]`);
    const bossTip = await tooltip(cdp); await delay(750); await primeScreenshotSurface(cdp); const bossShot = await screenshot(cdp, '02-real-boss-dog-glyph-1167-tooltip.png');
    assert('real Boss tooltip uses repaired canonical dog', !bossTip.hidden && bossTip.assetId === 'dog' && /Pet · Full source monsters · glyph 1167/.test(bossTip.description) && /full-source-monsters\/dog\.png/.test(bossTip.iconImage), JSON.stringify(bossTip));
    await pointer(cdp, `.tile-cell[data-map-x="${tameLittleDog.x}"][data-map-y="${tameLittleDog.y}"]`);
    const tameLittleTip = await tooltip(cdp); await delay(750); await primeScreenshotSurface(cdp); const tameLittleShot = await screenshot(cdp, '03-real-tame-little-dog-tooltip.png');
    assert('real tame little dog tooltip uses dedicated pet art', !tameLittleTip.hidden && tameLittleTip.assetId === 'little-dog-pet' && /Pet · Player, pets, and identity · glyph/.test(tameLittleTip.description), JSON.stringify(tameLittleTip));
    assert('real dog UI has no fallback/developer text', !/Name unavailable|Inventory selector|Program in disorder|Please report these messages/i.test(await evaluate(cdp, 'document.body.innerText')), 'unexpected visible fallback/error text');
    const result = { scenarioId, cells, bossTooltip: bossTip, tameLittleDogTooltip: tameLittleTip, screenshots: { map: mapShot, bossDog: bossShot, tameLittleDog: tameLittleShot } };
    fs.writeFileSync(path.join(outDir, 'real-dog-asset-result.json'), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(outDir, 'real-dog-asset-summary.md'), `# Real Electron dog asset proof\n\nPASS\n\n- Exact Boss case: tame adult Dog, glyph 1167, uses repaired canonical dog art.\n- Tame little dog uses dedicated little-dog-pet art.\n- Hostile little dog and large dog retain distinct growth-stage art.\n- Map and hover tooltips were captured from the real fixture-enabled Electron/NetHack path.\n\nScreenshots:\n- ${mapShot}\n- ${bossShot}\n- ${tameLittleShot}\n`);
    console.log(JSON.stringify(result, null, 2));
  } finally { cleanup(); }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
