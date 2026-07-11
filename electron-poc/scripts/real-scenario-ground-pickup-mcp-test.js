const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-scenario-ground-pickup');
const scenarioId = 'ground/pickup-pile-on-hero';
const port = Number(process.env.NH_SCENARIO_GROUND_CDP_PORT || 9632);
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function press(cdp, key, code = `Key${key.toUpperCase()}`) { const vk = key.toUpperCase().charCodeAt(0); const params = { key, code, text:key, windowsVirtualKeyCode:vk, nativeVirtualKeyCode:vk }; await cdp.send('Input.dispatchKeyEvent', { type:'keyDown', ...params }); await cdp.send('Input.dispatchKeyEvent', { type:'keyUp', ...params }); }
async function drag(cdp, fromSelector, toSelector) { const points = await evalExpr(cdp, `(() => { const from=document.querySelector(${JSON.stringify(fromSelector)}); const to=document.querySelector(${JSON.stringify(toSelector)}); const a=from?.getBoundingClientRect(); const b=to?.getBoundingClientRect(); return a&&b?{from:{x:a.left+a.width/2,y:a.top+a.height/2},to:{x:b.left+b.width/2,y:b.top+b.height/2}}:null; })()`); if (!points) throw new Error(`missing drag selectors ${fromSelector} -> ${toSelector}`); await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...points.from}); await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...points.from,button:'left',buttons:1,clickCount:1}); for(let i=1;i<=8;i++){await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:points.from.x+(points.to.x-points.from.x)*i/8,y:points.from.y+(points.to.y-points.from.y)*i/8,button:'left',buttons:1}); await delay(35);} await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...points.to,button:'left',buttons:0,clickCount:1}); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id), document:{ title:document.getElementById('document-title')?.textContent || '', body:document.getElementById('document-body')?.textContent || '' }, actions: window.__nethackPromptTest?.contextActions?.(), container: window.__nethackPromptTest?.container?.(), inventory: window.__nethackPromptTest?.inventory?.(), ground: window.__nethackPromptTest?.groundSnapshots?.(), transfers: window.__nethackPromptTest?.transferTransactions?.(), sent: window.__nethackPromptTest?.sentInputs?.().join('') || '', messages: window.__nethackPromptTest?.messages?.().slice(-12).map((m) => m.text || String(m)) || [], running: window.__nethackAutomation?.state?.().runningState?.running || false, body: document.body.innerText, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '' }))()`); }
async function start(cdp) {
  await click(cdp, '#start-shim');
  await delay(250);
  if (await evalExpr(cdp, `Boolean(document.getElementById('startup-choice-dialog')?.open)`)) await click(cdp, '#startup-new-game');
  await waitFor(async () => evalExpr(cdp, `Boolean(document.getElementById('character-dialog')?.open || window.__nethackAutomation?.state?.().runningState?.running)`), 10000);
  if (await evalExpr(cdp, `Boolean(document.getElementById('character-dialog')?.open)`)) {
    await waitFor(async () => evalExpr(cdp, `!document.getElementById('confirm-character')?.disabled`), 7000);
    await click(cdp, '#confirm-character');
  }
  await waitFor(async () => (await state(cdp)).running, 20000).catch(async (error) => {
    const debug = await state(cdp).catch(() => ({}));
    fs.writeFileSync(path.join(outDir, 'startup-timeout-debug.json'), JSON.stringify(debug, null, 2));
    await shot(cdp, 'startup-timeout.png').catch(() => undefined);
    throw error;
  });
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('game-grid')?.focus?.(); })()`);
}
async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup); child.stdout.on('data', (d) => process.stdout.write(d)); child.stderr.on('data', (d) => process.stderr.write(d));
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    const loaded = await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000).catch(async (error) => { const debug=await state(cdp).catch(()=>({})); fs.writeFileSync(path.join(outDir,'scenario-load-timeout-debug.json'),JSON.stringify(debug,null,2)); await shot(cdp,'scenario-load-timeout.png').catch(()=>undefined); throw error; });
    assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
    const initialContextState = await waitFor(async () => {
      const s = await state(cdp);
      const authoritativePile = (s.ground?.piles || []).find((pile) => (pile.items || []).some((item) => /arrow/i.test(item.displayName)) && (pile.items || []).some((item) => /dagger/i.test(item.displayName)) && (pile.items || []).some((item) => /food ration/i.test(item.displayName)));
      return s.actions?.buttons?.some((b) => b.id === 'pickup') && /shim_ground_pile_snapshot/.test(`${s.seenShim}\n${s.shim}`) && authoritativePile ? { ...s, authoritativePile } : null;
    }, 10000);
    assert('authoritative C/shim ground pile has all scenario objects', initialContextState.authoritativePile.items.length >= 3, JSON.stringify(initialContextState.authoritativePile));
    await delay(600);
    const settledAfterLoad = await state(cdp);
    assert('level load while standing on the pile does not open pickup UI', !settledAfterLoad.container?.active && settledAfterLoad.dialogs.length === 0, JSON.stringify({ dialogs:settledAfterLoad.dialogs, document:settledAfterLoad.document, container:settledAfterLoad.container }));
    await evalExpr(cdp, `(() => { window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid')?.focus?.(); })()`);
    await press(cdp, 'l');
    await waitFor(async () => { const s=await state(cdp); return !s.actions?.buttons?.some((button)=>button.id==='pickup') ? s : null; }, 7000);
    await press(cdp, 'h');
    await waitFor(async () => { const s=await state(cdp); return s.actions?.buttons?.some((button)=>button.id==='pickup') ? s : null; }, 7000);
    await press(cdp, '.', 'Period');
    const redrawResult = await evalExpr(cdp, `window.__nethackAutomation.sendKeycode(18)`);
    assert('real NetHack redraw control key was accepted', redrawResult?.ok, JSON.stringify(redrawResult));
    await delay(600);
    const settledAfterMovement = await state(cdp);
    assert('movement, standing wait, and NetHack redraw do not open pickup UI', !settledAfterMovement.container?.active && settledAfterMovement.dialogs.length === 0, JSON.stringify({ dialogs:settledAfterMovement.dialogs, document:settledAfterMovement.document, container:settledAfterMovement.container, sent:settledAfterMovement.sent }));
    assert('movement/standing/redraw path used expected real NetHack keys only', settledAfterMovement.sent === 'lh.\u0012', JSON.stringify(settledAfterMovement.sent));
    await evalExpr(cdp, `(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); document.getElementById('game-grid')?.focus?.(); })()`);
    await cdp.send('Page.bringToFront');
    await delay(300);
    const contextShot = await shot(cdp, '01-scenario-ground-context-actions.png');
    await press(cdp, ',', 'Comma');
    const commaPanel = await waitFor(async () => { const s=await state(cdp); return s.container?.active && /Pick up from ground/i.test(s.container.text || '') && /arrow/i.test(s.container.text || '') ? s : null; }, 10000);
    const commaPanelShot = await shot(cdp, '01b-explicit-comma-ground-pickup-panel.png');
    assert('explicit comma opens the live multi-item pickup panel', commaPanel.container.left.length >= 3 && commaPanel.sent === 'lh.\u0012,', JSON.stringify({ container:commaPanel.container, sent:commaPanel.sent }));
    await click(cdp, '#container-transfer-panel .container-transfer-heading button');
    await waitFor(async () => { const s=await state(cdp); return !s.container?.active ? s : null; }, 10000);
    await evalExpr(cdp, `document.getElementById('game-grid')?.focus?.()`);
    await press(cdp, '.', 'Period');
    const redrawAfterCancelResult = await evalExpr(cdp, `window.__nethackAutomation.sendKeycode(18)`);
    assert('post-cancel real NetHack redraw control key was accepted', redrawAfterCancelResult?.ok, JSON.stringify(redrawAfterCancelResult));
    await delay(600);
    const settledAfterCancel = await state(cdp);
    assert('cancelling comma pickup then waiting/redrawing does not reopen pickup UI', !settledAfterCancel.container?.active && settledAfterCancel.dialogs.length === 0 && settledAfterCancel.sent === 'lh.\u0012,\u001b.\u0012', JSON.stringify({ dialogs:settledAfterCancel.dialogs, container:settledAfterCancel.container, sent:settledAfterCancel.sent }));
    const cancelledShot = await shot(cdp, '01c-after-comma-cancel-and-redraw.png');
    await click(cdp, '#context-action-bar button[data-context-action-id="pickup"]');
    const panel = await waitFor(async () => { const s = await state(cdp); const text = s.container?.text || ''; return /Pick up from ground|Ground items/i.test(text) && /arrow/i.test(text) && /dagger/i.test(text) && /food ration/i.test(text) && /scroll of identify/i.test(text) ? s : null; }, 15000).catch(async (error) => { const debug = await state(cdp).catch(() => ({})); fs.writeFileSync(path.join(outDir, 'scenario-ground-timeout-debug.json'), JSON.stringify(debug, null, 2)); await shot(cdp, 'debug-scenario-ground-timeout.png').catch(() => undefined); throw error; });
    const panelShot = await shot(cdp, '02-scenario-ground-pickup-panel.png');
    assert('ground panel shows arrows', /3 arrows|arrow/i.test(panel.container.text), panel.container.text);
    assert('ground panel shows dagger', /dagger/i.test(panel.container.text), panel.container.text);
    assert('ground panel shows food ration', /food ration/i.test(panel.container.text), panel.container.text);
    assert('ground pickup panel shows scenario inventory scroll', /scroll of identify/i.test(panel.container.text), panel.container.text);
    assert('renderer retained authoritative ground snapshot with all pile items', (panel.ground?.piles || []).some((pile) => (pile.items || []).some((item) => /arrow/i.test(item.displayName)) && (pile.items || []).some((item) => /dagger/i.test(item.displayName)) && (pile.items || []).some((item) => /food ration/i.test(item.displayName))), JSON.stringify(panel.ground));
    assert('scenario inventory is hermetic and does not include starter spear/shield/oil lamp', !/\bspear\b|small shield|oil lamp/i.test(panel.container.text), panel.container.text);
    assert('ground pickup panel avoids fallback labels', !/Inventory selector|Name unavailable|Open Inventory once|Loading your inventory/i.test(panel.container.text), panel.container.text);
    assert('first-open rows are backed by stable public object IDs', panel.container.left.every((row) => /^ground-object-\d+$/.test(row.selector || '')), JSON.stringify(panel.container.left));
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs()`);
    await drag(cdp, '#container-transfer-panel [data-container-pane="left"] .container-item-row[data-item-name*="arrows"]', '#container-transfer-panel [data-container-pane="right"]');
    const afterFirstDrag = await waitFor(async () => { const s=await state(cdp); return s.transfers?.transfers?.some((tx)=>tx.direction==='ground-to-inventory'&&tx.status==='success') ? s : null; }, 12000);
    await evalExpr(cdp, `(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); })()`);
    await cdp.send('Page.bringToFront');
    await delay(500);
    assert('first ground drag moves the whole arrow stack through direct transfer', afterFirstDrag.container.right.some((row)=>/3 arrows/i.test(row.text)) && !afterFirstDrag.container.left.some((row)=>/3 arrows/i.test(row.text)), JSON.stringify(afterFirstDrag.container));
    assert('first ground drag leaks no pickup/drop menu keys', !/[,]|d[a-zA-Z]/.test(afterFirstDrag.sent || '') && !/Pick up what\?|What do you want to drop\?/i.test(afterFirstDrag.body), JSON.stringify({ sent:afterFirstDrag.sent, body:afterFirstDrag.body.slice(0,1200) }));
    await click(cdp, '#container-transfer-panel .container-transfer-heading button');
    await waitFor(async () => { const s=await state(cdp); return !s.container?.active ? s : null; }, 7000);
    const afterSelectionShot = await shot(cdp, '03-after-explicit-selection.png');
    const summary = [`# Scenario loader ground pickup real Electron smoke`, '', 'PASS', '', `Scenario: ${scenarioId}`, `Context screenshot after movement/wait/redraw without auto-open: ${contextShot}`, `Explicit comma panel screenshot: ${commaPanelShot}`, `Post-comma-cancel screenshot: ${cancelledShot}`, `Ground pickup button panel screenshot: ${panelShot}`, `After explicit item selection screenshot: ${afterSelectionShot}`, '', 'Verified scenario public facts through visible UI:', '- level load on the pile did not open pickup UI', '- ordinary keyboard movement, standing wait, and NetHack redraw did not open pickup UI', '- explicit comma opened the live multi-item pickup panel', '- comma cancellation followed by wait/redraw did not reopen pickup UI', '- visible Pickup button explicitly reopened the panel', '- contextActions: pickup', '- shim event stream includes shim_ground_pile_snapshot from C/shim level.objects', '- authoritative ground snapshot includes arrows, dagger, food ration', '- first-open rows all use ground-object IDs', '- first drag moved the complete 3-arrow stack to inventory', '- no pickup/drop menu key leakage', '- groundRows include arrows, dagger, food ration', '- inventoryRows include scroll of identify', '', 'Visible pickup panel text before drag:', '```', panel.container.text, '```', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-scenario-ground-pickup-summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
