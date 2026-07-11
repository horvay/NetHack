const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const scenarioId = 'object/gray-stone-public-rub-candidates';
const outDir = path.resolve(root, process.env.NH_GRAY_STONE_RUB_OUT_DIR || path.join('test-output', 'real-scenario-gray-stone-public-rub'));
const port = Number(process.env.AI_ORG_ELECTRON_CDP_PORT || 9648);

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeoutMs) {
    try { const value = await fn(); if (value) return value; } catch (error) { last = error; }
    await delay(stepMs);
  }
  throw last || new Error('timed out waiting');
}
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const callbacks = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? callbacks.reject(new Error(JSON.stringify(msg.error))) : callbacks.resolve(msg.result);
    }
  });
  return {
    send(method, params = {}) {
      const callId = ++id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
    },
    close() { ws.close(); },
  };
}
async function evalExpr(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function shot(cdp, name) {
  const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(outDir, name);
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
  return file;
}
async function click(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,text:el.innerText} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  return box;
}
async function press(cdp, key, code, text) {
  const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
  const params = { key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  if (text !== undefined) params.text = text;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}
async function rightClickFirstGrayStone(cdp) {
  const box = await evalExpr(cdp, `(() => { const rows = Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')); const el = rows.find((row) => /\\ba gray stone\\b/i.test(row.innerText || '')); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,text:el.innerText,key:el.dataset.key || ''} : null; })()`);
  if (!box) throw new Error('missing public gray stone inventory row');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'right', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'right', clickCount: 1 });
  return box;
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) {
  return evalExpr(cdp, `(() => ({
    dialog: window.__nethackPromptTest?.dialog?.() || {},
    messages: window.__nethackPromptTest?.messages?.().slice(-20).map((message) => message.text || String(message)) || [],
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    sentPayloads: window.__nethackPromptTest?.sentPayloads?.() || [],
    sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    body: document.body.innerText,
    contextMenu: document.querySelector('.inventory-context-menu')?.innerText || '',
    seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
    shim: document.getElementById('shim-output')?.innerText || '',
    bridgeUiEvents: (document.getElementById('shim-output')?.innerText || '').split('\\n').map((line) => { try { return JSON.parse(line).event; } catch { return null; } }).filter((event) => event && /^bridge_ui_command_/.test(event.name || '')),
    grayRows: Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).filter((row) => /\\bgray stone\\b/i.test(row.innerText || '')).map((row) => ({ text: row.innerText, key: row.dataset.key || '', tileId: row.querySelector('[data-tile-id]')?.dataset.tileId || '' }))
  }))()`);
}
async function start(cdp) {
  await click(cdp, '#start-shim');
  await delay(250);
  await click(cdp, '#confirm-character');
  await waitFor(async () => (await state(cdp)).running, 20000);
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); window.__nethackPromptTest?.clearSentInputs?.(); })()`);
}
function assertNoHiddenIdentityFields(command) {
  const serialized = JSON.stringify(command || {});
  for (const forbidden of ['trueName', 'baseType', 'objectType', 'otyp', 'beatitude', 'buc', 'cursed', 'blessed', 'enchantment', 'charges', 'trapState', 'contents', 'locked', 'trapped', 'broken', 'flint', 'touchstone', 'luckstone', 'loadstone']) {
    assert(`v2 command omits hidden field/name ${forbidden}`, !serialized.toLowerCase().includes(forbidden.toLowerCase()), serialized);
  }
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], {
    cwd: root,
    env: {
      ...process.env,
      AI_ORG_ELECTRON_CDP_PORT: String(port),
      NH_ELECTRON_WINDOW_WIDTH: '1360',
      NH_ELECTRON_WINDOW_HEIGHT: '920',
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_SHIM_RESET_LOCKS: '1',
      NH_TEST_SCENARIO_ID: scenarioId,
      NETHACK_SEED: '424242',
      NETHACKOPTIONS: '!tutorial,!autopickup',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = []; const stderr = [];
  child.stdout.on('data', (d) => { stdout.push(String(d)); process.stdout.write(d); });
  child.stderr.on('data', (d) => { stderr.push(String(d)); process.stderr.write(d); });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((page) => page.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((page) => page.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);

    await press(cdp, 'i', 'KeyI', 'i');
    const inventoryReady = await waitFor(async () => { const s = await state(cdp); return s.grayRows.length === 4 ? s : null; }, 10000);
    assert('all gray rows are public text only', inventoryReady.grayRows.every((row) => /\ba gray stone\b/i.test(row.text) && !/flint|touchstone|luckstone|loadstone|quiver pouch/i.test(row.text)), JSON.stringify(inventoryReady.grayRows));
    assert('gray rows use one public/appearance tile id', new Set(inventoryReady.grayRows.map((row) => row.tileId)).size === 1, JSON.stringify(inventoryReady.grayRows));
    assert('gray rows do not use identity tile ids', !/flint|touchstone|luckstone|loadstone/i.test(JSON.stringify(inventoryReady.grayRows)), JSON.stringify(inventoryReady.grayRows));
    const inventoryShot = await shot(cdp, '01-public-gray-stone-inventory.png');

    const grayRow = await rightClickFirstGrayStone(cdp);
    await waitFor(async () => /^Rub$/im.test((await state(cdp)).contextMenu), 5000);
    const context = await state(cdp);
    assert('public gray stone exposes Rub', /^Rub$/im.test(context.contextMenu), context.contextMenu);
    assert('context menu omits hidden gray-stone identities', !/flint|touchstone|luckstone|loadstone/i.test(context.contextMenu), context.contextMenu);
    const contextShot = await shot(cdp, '02-public-gray-stone-context-rub.png');

    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await click(cdp, '.inventory-context-menu [data-action-id="item.rub"]');
    const afterRub = await waitFor(async () => {
      const s = await state(cdp);
      if (!/#rub\n$/.test(s.sent)) return null;
      return /What do you want to rub/i.test(`${s.dialog.prompt}\n${s.body}`) ? s : null;
    }, 10000);
    const promptShot = await shot(cdp, '03-after-public-gray-stone-rub-prompt.png');
    const rubCommand = afterRub.sentUiProtocolCommands.find((command) => command.commandType === 'action.execute' && command.actionId === 'item.rub');
    assert('item.rub v2 command recorded', rubCommand, JSON.stringify(afterRub.sentUiProtocolCommands));
    const acceptedBridgeEvent = (afterRub.bridgeUiEvents || []).find((event) => event.name === 'bridge_ui_command_accepted' && event.commandId === rubCommand.commandId && event.actionId === 'item.rub');
    assert('bridge accepted item.rub ui-command', acceptedBridgeEvent, JSON.stringify(afterRub.bridgeUiEvents || []));
    assert('item.rub route command is exactly #rub\\n', rubCommand.payload?.route?.command === '#rub\n', JSON.stringify(rubCommand));
    assert('NetHack-owned rub prompt wrapper is visible', /What do you want to rub/i.test(`${afterRub.dialog.prompt}\n${afterRub.body}`), JSON.stringify(afterRub.dialog));
    assertNoHiddenIdentityFields(rubCommand);

    const sidecar = { scenarioId, grayRows: inventoryReady.grayRows, grayRow, contextMenu: context.contextMenu, afterRub: { sent: afterRub.sent, dialog: afterRub.dialog, command: rubCommand, bridgeAccepted: Boolean(acceptedBridgeEvent), bridgeUiEvents: afterRub.bridgeUiEvents || [] }, screenshots: { inventoryShot, contextShot, promptShot } };
    fs.writeFileSync(path.join(outDir, 'gray-stone-public-rub-state.json'), JSON.stringify(sidecar, null, 2));
    fs.writeFileSync(path.join(outDir, 'real-scenario-gray-stone-public-rub-summary.md'), ['# Real gray-stone public #rub MCP proof', '', 'PASS', '', `Scenario: ${scenarioId}`, '', 'Evidence:', `- Inventory rows: ${inventoryShot}`, `- Public gray stone context with Rub: ${contextShot}`, `- NetHack-owned #rub prompt after click: ${promptShot}`, `- State sidecar: ${path.join(outDir, 'gray-stone-public-rub-state.json')}`, '', 'Verified public boundary: four hidden FLINT/TOUCHSTONE/LUCKSTONE/LOADSTONE fixtures render as indistinguishable public `gray stone` rows, share one public appearance tile id, expose `Rub`, route to `item.rub` / `#rub`, and omit hidden true identity/BUC/charges fields.', ''].join('\n'));
    console.log('real-scenario-gray-stone-public-rub-mcp-test PASS');
  } finally {
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), stdout.join(''));
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), stderr.join(''));
    cleanup();
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
