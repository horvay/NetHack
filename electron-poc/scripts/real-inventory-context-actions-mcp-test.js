const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_REAL_INVENTORY_CONTEXT_OUT_DIR || path.join(root, 'test-output', 'real-inventory-context-actions');
const scenarioId = 'ground/pickup-pile-on-hero';
const basePort = Number(process.env.NH_REAL_INVENTORY_CONTEXT_CDP_PORT || 9687);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out waiting'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function press(cdp, key, code, text) { const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0; const params = { key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }; if (text !== undefined) params.text = text; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }); }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); return box; }
async function rightClickText(cdp, selector, pattern) { const source = String(pattern); const box = await evalExpr(cdp, `(() => { const re = new RegExp(${JSON.stringify(source)}, 'i'); const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((row) => re.test(row.innerText || '')); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText,key:el.dataset.key || ''} : null; })()`); if (!box) throw new Error(`missing text ${source} in ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'right', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'right', clickCount: 1 }); return box; }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id), dialog: window.__nethackPromptTest?.dialog?.() || {}, inventory: window.__nethackPromptTest?.inventory?.() || {}, messages: window.__nethackPromptTest?.messages?.().slice(-20).map((m) => m.text || String(m)) || [], sent: window.__nethackPromptTest?.sentInputs?.().join('') || '', running: window.__nethackAutomation?.state?.().runningState?.running || false, body: document.body.innerText, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '', contextMenu: document.querySelector('.inventory-context-menu')?.innerText || '', commandTransactions: window.__nethackPromptTest?.commandTransactions?.() || {} }))()`); }
async function start(cdp) {
  await click(cdp, '#start-shim');
  const dialogs = await waitFor(async () => { const open = (await state(cdp)).dialogs; return open.includes('startup-choice-dialog') || open.includes('character-dialog') ? open : null; }, 10000);
  if (dialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game');
  await waitFor(async () => (await state(cdp)).dialogs.includes('character-dialog'), 10000);
  await click(cdp, '#confirm-character');
  await waitFor(async () => (await state(cdp)).running, 20000);
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); window.__nethackPromptTest?.clearSentInputs?.(); })()`);
}

async function runCase(caseName, actionId, expectedCommandPattern, port, options = {}) {
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout = []; const stderr = []; child.stdout.on('data', (d) => stdout.push(String(d))); child.stderr.on('data', (d) => stderr.push(String(d)));
  let cdp; const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    await press(cdp, 'i', 'KeyI', 'i');
    const before = await waitFor(async () => { const s = await state(cdp); return s.dialog?.interactionOpen && /Equipment \/ Inventory/i.test(s.dialog.title || '') && /scroll/i.test(s.body) ? s : null; }, 10000);
    if (options.waitBeforeContextMs) await delay(options.waitBeforeContextMs);
    const beforeShot = await shot(cdp, `${caseName}-01-inventory-before-context.png`);
    const row = await rightClickText(cdp, '#interaction-options .rpg-inventory-row', 'scroll');
    await waitFor(async () => { const s = await state(cdp); return new RegExp(actionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(s.body) || s.contextMenu ? s : null; }, 5000);
    const context = await state(cdp);
    const contextShot = await shot(cdp, `${caseName}-02-context-menu.png`);
    await evalExpr(cdp, 'window.__nethackPromptTest?.clearSentInputs?.()');
    await click(cdp, `.inventory-context-menu [data-action-id="${actionId}"]`);
    await delay(900);
    const immediateAfterClick = await state(cdp);
    fs.writeFileSync(path.join(outDir, `${caseName}-immediate-after-click-state.json`), JSON.stringify(immediateAfterClick, null, 2));
    const findSemantic = (s) => {
      const txs = s.commandTransactions?.transactions || [];
      const semantic = txs.find((tx) => tx.semanticActionId === actionId || tx.guiAction?.actionId === actionId || tx.result?.actionId === actionId);
      return semantic ? { ...s, semanticTransaction: semantic } : null;
    };
    const after = findSemantic(immediateAfterClick) || await waitFor(async () => findSemantic(await state(cdp)), 8000);
    const afterShot = await shot(cdp, `${caseName}-03-after-action.png`);
    assert(`${caseName} selected row is a scroll`, /scroll/i.test(row.text), row.text);
    assert(`${caseName} context menu contains action`, context.contextMenu.includes(actionId) || new RegExp(actionId === 'item.read.scroll' ? 'Read' : 'Drop', 'i').test(context.contextMenu), context.contextMenu);
    assert(`${caseName} sent direct command after cancel`, expectedCommandPattern.test(after.sent), JSON.stringify({ sent: after.sent, row }));
    assert(`${caseName} semantic action acknowledged`, after.semanticTransaction && (after.semanticTransaction.semanticActionId === actionId || after.semanticTransaction.guiAction?.actionId === actionId || after.semanticTransaction.result?.actionId === actionId), JSON.stringify(after.commandTransactions, null, 2));
    assert(`${caseName} semantic target selector recorded`, after.semanticTransaction.guiAction?.target?.selector || after.semanticTransaction.result?.target?.selector, JSON.stringify(after.semanticTransaction, null, 2));
    assert(`${caseName} no redundant Do what chooser`, !/Do what with .*\?\s*Choose visible item rows|Read this scroll to activate its magic/i.test(after.body), after.body.slice(0, 1600));
    return { beforeShot, contextShot, afterShot, before, contextMenu: context.contextMenu, after, row };
  } finally {
    fs.writeFileSync(path.join(outDir, `${caseName}-electron-stdout.log`), stdout.join(''));
    fs.writeFileSync(path.join(outDir, `${caseName}-electron-stderr.log`), stderr.join(''));
    cleanup();
  }
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const readScroll = await runCase('read-scroll', 'item.read.scroll', /^\u001br[a-zA-Z]$/u, basePort, { waitBeforeContextMs: 3300 });
  const dropScroll = await runCase('drop-scroll', 'item.drop', /^\u001bd[a-zA-Z]$/u, basePort + 1);
  const summary = [`# Real inventory context action MCP regression`, '', 'PASS', '', `Scenario: ${scenarioId}`, '', '## Read scroll', `- Row: ${readScroll.row.text.replace(/\n/g, ' | ')}`, `- Sent: ${JSON.stringify(readScroll.after.sent)}`, `- Before: ${readScroll.beforeShot}`, `- Context: ${readScroll.contextShot}`, `- After: ${readScroll.afterShot}`, '', '## Drop scroll', `- Row: ${dropScroll.row.text.replace(/\n/g, ' | ')}`, `- Sent: ${JSON.stringify(dropScroll.after.sent)}`, `- Before: ${dropScroll.beforeShot}`, `- Context: ${dropScroll.contextShot}`, `- After: ${dropScroll.afterShot}`, '', 'Both flows used real Electron/CDP mouse and keyboard input against the fixture-backed NetHack bridge and did not show the redundant "Do what with... Choose visible item rows" action chooser after the context-menu action was chosen. The Read case intentionally waits 3.3s after opening inventory before right-clicking, covering normal player browsing time after the short inventory-request window expires.', ''].join('\n');
  fs.writeFileSync(path.join(outDir, 'real-inventory-context-actions-summary.md'), summary);
  fs.writeFileSync(path.join(outDir, 'real-inventory-context-actions-metrics.json'), JSON.stringify({ readScroll, dropScroll }, null, 2));
  console.log(summary);
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
