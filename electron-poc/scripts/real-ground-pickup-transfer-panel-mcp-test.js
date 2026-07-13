const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-ground-pickup-transfer-panel');
const port = Number(process.env.NH_REAL_GROUND_PICKUP_PANEL_CDP_PORT || 9601);
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 25000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await Promise.race([cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }), new Promise((_, reject) => setTimeout(() => reject(new Error('CDP Runtime.evaluate timed out')), 20000))]); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true }); const p=path.join(outDir,name); fs.writeFileSync(p, Buffer.from(res.data,'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function key(cdp, value, code = '') { await cdp.send('Input.dispatchKeyEvent', { type:'keyDown', key:value, code, text:value, unmodifiedText:value }); await cdp.send('Input.dispatchKeyEvent', { type:'keyUp', key:value, code }); }
async function dblclickMatch(cdp, pane, pattern) { const box = await evalExpr(cdp, `(() => { const re = new RegExp(${JSON.stringify(pattern)}, 'i'); const rows = Array.from(document.querySelectorAll('#container-transfer-panel [data-container-pane="${pane}"] .container-item-row')); const el = rows.find((row) => re.test(row.innerText || '')) || rows[0]; el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,text:el.innerText} : null; })()`); if (!box) throw new Error(`missing ${pane} row ${pattern}`); for (let i = 1; i <= 2; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: i }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: i }); await delay(60); } return box.text; }
async function pressArrow(cdp, keyName) { await cdp.send('Input.dispatchKeyEvent', { type:'keyDown', key:keyName, code:keyName }); await cdp.send('Input.dispatchKeyEvent', { type:'keyUp', key:keyName, code:keyName }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ dialogs:Array.from(document.querySelectorAll('dialog[open]')).map(d=>d.id), container:window.__nethackPromptTest?.container?.(), inventory:window.__nethackPromptTest?.inventory?.(), sent:window.__nethackPromptTest?.sentInputs?.().join('')||'', messages:window.__nethackPromptTest?.messages?.().slice(-20).map(m=>m.text||String(m))||[], running:window.__nethackAutomation?.state?.().runningState?.running||false, transferTransactions:window.__nethackPromptTest?.transferTransactions?.(), groundSnapshots:window.__nethackPromptTest?.groundSnapshots?.(), body:document.body.innerText }))()`); }
async function saveState(cdp, name) { const s = await state(cdp); fs.writeFileSync(path.join(outDir, name), JSON.stringify(s, null, 2)); return s; }
async function cursorState(cdp) { return evalExpr(cdp, `(() => { const cursor=window.NetHackUxRuntime?.runtime?.latestPublicState?.()?.snapshot?.game?.cursor||{}; return {x:Number(cursor.x),y:Number(cursor.y)}; })()`); }
async function start(cdp) {
  await evalExpr(cdp, `window.__nethackAutomation.startReplay({ playerSpec: '-uDirect-Val-Hum-Fem-Law', nethackOptions: '!tutorial,!autopickup' })`);
  await waitFor(async () => { const s = await state(cdp); const seen = await evalExpr(cdp, `document.getElementById('shim-output')?.dataset?.seen || ''`); return s.running && /shim_print_glyph|shim_status_update|shim_putstr/.test(seen) ? s : null; }, 25000);
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus(); window.__nethackPromptTest.clearSentInputs(); })()`);
}
async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.', '--disable-gpu'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: 'ground/unidentified-appearance-pile-on-hero' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const keepAlive = setInterval(() => {}, 1000);
  let cdp; const cleanup = () => { clearInterval(keepAlive); try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup); child.stdout.on('data', (d) => process.stdout.write(d)); child.stderr.on('data', (d) => process.stderr.write(d));
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    fs.writeFileSync(path.join(outDir, 'debug-after-start.json'), JSON.stringify(await state(cdp), null, 2));
    await waitFor(async () => { const s = await state(cdp); return s.groundSnapshots?.piles?.some((pile) => pile.items.some((item) => Number.isInteger(item.objectId))) && s.inventory?.snapshotItems?.some((row) => Number.isInteger(row.objectId)) ? s : null; }, 15000);
    const contextShot = await shot(cdp, '01-real-ground-context-before-direct.png');
    await evalExpr(cdp, `(() => { window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid')?.focus(); })()`);
    // Boss reproduction path: classic comma opens a real NetHack pickup menu,
    // which the two-pane shim must release before issuing its own direct command.
    await key(cdp, ',', 'Comma');
    const panelState = await waitFor(async () => { const s = await state(cdp); return s.container?.active && /Ground items/i.test(s.container.text) && s.container?.menu?.awaitingSelection ? s : null; }, 10000);
    const panelShot = await shot(cdp, '02-real-ground-comma-menu-panel-open.png');
    assert('comma-backed panel exposes the real pickup owner before first drag', panelState.sent === ',' && /^Pick up what\?$/i.test(panelState.container?.menu?.prompt || ''), JSON.stringify({ sent: panelState.sent, menu: panelState.container?.menu }));
    const panelBounds = await evalExpr(cdp, `(() => { const rect=document.getElementById('container-transfer-panel')?.getBoundingClientRect(); return rect ? { left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom, viewportWidth:innerWidth, viewportHeight:innerHeight } : null; })()`);
    assert('ground transfer panel remains fully inside the viewport', panelBounds && panelBounds.left >= 0 && panelBounds.top >= 0 && panelBounds.right <= panelBounds.viewportWidth && panelBounds.bottom <= panelBounds.viewportHeight, JSON.stringify(panelBounds));
    await click(cdp, '#container-transfer-panel .container-transfer-heading button');
    const closedState = await waitFor(async () => { const s=await state(cdp); return !s.container?.active && !s.container?.menu?.awaitingSelection ? s : null; }, 10000);
    const closedShot = await shot(cdp, '03-real-ground-panel-closed.png');
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs()`);
    const beforeMove = await cursorState(cdp);
    let movedCursor = null;
    let reverseKey = '';
    for (const [moveKey, oppositeKey] of [['ArrowRight','ArrowLeft'], ['ArrowLeft','ArrowRight'], ['ArrowDown','ArrowUp'], ['ArrowUp','ArrowDown']]) {
      await pressArrow(cdp, moveKey);
      movedCursor = await waitFor(async () => { const cursor=await cursorState(cdp); return (cursor.x !== beforeMove.x || cursor.y !== beforeMove.y) ? cursor : null; }, 1500).catch(() => null);
      if (movedCursor) { reverseKey = oppositeKey; break; }
    }
    if (movedCursor) {
      await pressArrow(cdp, reverseKey);
      await waitFor(async () => { const cursor=await cursorState(cdp); return cursor.x === beforeMove.x && cursor.y === beforeMove.y ? cursor : null; }, 10000);
    }
    assert('closing the ground chooser releases NetHack input without a false failure notice so movement works immediately', !closedState.container?.active && movedCursor && (movedCursor.x !== beforeMove.x || movedCursor.y !== beforeMove.y) && !/NetHack did not accept that action/i.test(closedState.body), JSON.stringify({ beforeMove, movedCursor, closed:closedState.container, body:closedState.body.slice(0, 500) }));
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs()`);
    await key(cdp, ',', 'Comma');
    await waitFor(async () => { const s=await state(cdp); return s.container?.active && s.container?.menu?.awaitingSelection ? s : null; }, 10000);

    await dblclickMatch(cdp, 'left', 'potion|effervescent');
    const pickupState = await waitFor(async () => { const s = await state(cdp); return s.transferTransactions?.transfers?.some((tx) => tx.direction === 'ground-to-inventory' && tx.status === 'success') ? s : null; }, 12000);
    await dblclickMatch(cdp, 'right', 'scroll|identify|labeled');
    const dropState = await waitFor(async () => { const s = await state(cdp); return s.transferTransactions?.transfers?.some((tx) => tx.direction === 'inventory-to-ground' && tx.status === 'success') ? s : null; }, 12000);
    await evalExpr(cdp, `(async () => {
      document.activeElement?.blur?.(); window.scrollTo(0, 0);
      const previousDisplay = document.body.style.display;
      document.body.style.display = 'none'; void document.body.offsetHeight;
      await new Promise(requestAnimationFrame);
      document.body.style.display = previousDisplay; void document.body.offsetHeight;
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    })()`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1359, height: 920, deviceScaleFactor: 1, mobile: false });
    await delay(100);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.bringToFront');
    await delay(300);
    const dropShot = await shot(cdp, '04-real-after-direct-inventory-to-ground.png');
    fs.writeFileSync(path.join(outDir, '04-final-state.json'), JSON.stringify(dropState, null, 2));
    assert('first drag released only the exact comma pickup menu and neither move used legacy pickup/drop selectors', (dropState.sent || '') === ',\u001b', JSON.stringify(dropState.sent));
    assert('panel remains player-facing without ownership/developer errors', !/Pick up what\?|What do you want to drop\?|Direct ground transfer rejected|another prompt, menu, or transfer|direct command is blocked|Inventory selector/i.test(dropState.body), dropState.body.slice(0, 1200));
    const summary = [`# Real ground direct transfer panel MCP validation`, '', 'PASS', '', 'Scenario: ground/unidentified-appearance-pile-on-hero', '', `Before: ${contextShot}`, `Comma-backed panel: ${panelShot}`, `After direct pickup and drop: ${dropShot}`, `Final state: ${path.join(outDir, '04-final-state.json')}`, '', 'Ownership proof: first drag sent one Esc to close the exact active Pick up what? menu, waited for its bridge_menu_answer, then ground.transfer succeeded without a selector/menu fallback.', '', `Pickup transfers: ${JSON.stringify(pickupState.transferTransactions?.transfers?.filter((tx)=>tx.direction==='ground-to-inventory'), null, 2)}`, `Drop transfers: ${JSON.stringify(dropState.transferTransactions?.transfers?.filter((tx)=>tx.direction==='inventory-to-ground'), null, 2)}`, ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-ground-pickup-transfer-panel-summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
