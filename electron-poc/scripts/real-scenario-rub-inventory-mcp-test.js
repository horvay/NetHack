const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const scenarioId = process.env.NH_TEST_SCENARIO_ID || 'object/rub-candidates-in-inventory';
const outDir = path.resolve(root, process.env.NH_RUB_INVENTORY_OUT_DIR || path.join('test-output', 'real-scenario-rub-inventory'));
const port = Number(process.env.AI_ORG_ELECTRON_CDP_PORT || 9642);

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
async function rightClickText(cdp, selector, pattern) {
  const source = String(pattern);
  const box = await evalExpr(cdp, `(() => { const re = new RegExp(${JSON.stringify(source)}, 'i'); const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((row) => re.test(row.innerText || '')); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,text:el.innerText,key:el.dataset.key || ''} : null; })()`);
  if (!box) throw new Error(`missing text ${source} in ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'right', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'right', clickCount: 1 });
  return box;
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) {
  return evalExpr(cdp, `(() => ({
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
    dialog: window.__nethackPromptTest?.dialog?.() || {},
    inventory: window.__nethackPromptTest?.inventory?.() || {},
    messages: window.__nethackPromptTest?.messages?.().slice(-20).map((message) => message.text || String(message)) || [],
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    sentPayloads: window.__nethackPromptTest?.sentPayloads?.() || [],
    sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
    commandTransactions: window.__nethackPromptTest?.commandTransactions?.() || {},
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    body: document.body.innerText,
    contextMenu: document.querySelector('.inventory-context-menu')?.innerText || '',
    seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
    shim: document.getElementById('shim-output')?.innerText || '',
    bridgeUiEvents: (document.getElementById('shim-output')?.innerText || '').split('\\n').map((line) => { try { return JSON.parse(line).event; } catch { return null; } }).filter((event) => event && /^bridge_ui_command_/.test(event.name || '')),
    rowActions: Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).map((row) => ({ text: row.innerText, key: row.dataset.key || '' }))
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
  for (const forbidden of ['trueName', 'baseType', 'objectType', 'otyp', 'beatitude', 'buc', 'cursed', 'blessed', 'enchantment', 'charges', 'trapState', 'contents', 'locked', 'trapped', 'broken']) {
    assert(`v2 command omits hidden field ${forbidden}`, !serialized.includes(`"${forbidden}"`), serialized);
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
    const inventoryReady = await waitFor(async () => { const s = await state(cdp); return s.dialog?.interactionOpen && /Equipment \/ Inventory/i.test(s.dialog.title || '') && /lamp/i.test(s.body) && /magic marker/i.test(s.body) && /towel/i.test(s.body) ? s : null; }, 10000);
    const inventoryShot = await shot(cdp, '01-inventory-rub-candidates.png');

    const rockRow = await rightClickText(cdp, '#interaction-options .rpg-inventory-row', 'rock');
    await delay(250);
    const rockContext = await state(cdp);
    const rockContextShot = await shot(cdp, '02-rock-context-no-rub.png');
    assert('ordinary rock row is visible', /rock/i.test(rockRow.text), rockRow.text);
    assert('ordinary rocks do not expose Rub', !/^Rub$/im.test(rockContext.contextMenu), rockContext.contextMenu);

    await evalExpr(cdp, `document.querySelector('.inventory-context-menu')?.remove?.();`);
    const markerRow = await rightClickText(cdp, '#interaction-options .rpg-inventory-row', 'magic marker');
    await delay(250);
    const markerContext = await state(cdp);
    const markerContextShot = await shot(cdp, '03-marker-context-no-rub.png');
    assert('magic marker does not expose Rub because native #rub does not accept it', !/^Rub$/im.test(markerContext.contextMenu), markerContext.contextMenu);

    await evalExpr(cdp, `document.querySelector('.inventory-context-menu')?.remove?.();`);
    const towelRow = await rightClickText(cdp, '#interaction-options .rpg-inventory-row', 'towel');
    await delay(250);
    const towelContext = await state(cdp);
    const towelContextShot = await shot(cdp, '04-towel-context-no-rub.png');
    assert('towel does not expose Rub because native #rub does not accept it', !/^Rub$/im.test(towelContext.contextMenu), towelContext.contextMenu);

    await evalExpr(cdp, `document.querySelector('.inventory-context-menu')?.remove?.();`);
    const lampRow = await rightClickText(cdp, '#interaction-options .rpg-inventory-row', 'lamp');
    await waitFor(async () => /^Rub$/im.test((await state(cdp)).contextMenu), 5000);
    const lampContext = await state(cdp);
    const lampContextShot = await shot(cdp, '05-lamp-context-rub.png');
    assert('lamp row is visible', /lamp/i.test(lampRow.text), lampRow.text);
    assert('public lamp candidate exposes Rub', /^Rub$/im.test(lampContext.contextMenu), lampContext.contextMenu);
    assert('Rub context does not expose identity spoiler labels', !/magic lamp|touchstone|luckstone|loadstone/i.test(lampContext.contextMenu), lampContext.contextMenu);

    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await click(cdp, '.inventory-context-menu [data-action-id="item.rub"]');
    const afterRub = await waitFor(async () => {
      const s = await state(cdp);
      if (!/#rub\n$/.test(s.sent)) return null;
      return /What do you want to rub/i.test(`${s.dialog.prompt}\n${s.body}`) ? s : null;
    }, 10000).catch(async (error) => {
      const debug = await state(cdp).catch((stateError) => ({ stateError: String(stateError) }));
      fs.writeFileSync(path.join(outDir, 'debug-after-rub-timeout-state.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, 'debug-after-rub-timeout.png').catch(() => undefined);
      throw error;
    });
    const promptShot = await shot(cdp, '06-after-rub-nethack-owned-prompt.png');
    assert('NetHack-owned rub prompt wrapper is visible', /What do you want to rub/i.test(`${afterRub.dialog.prompt}\n${afterRub.body}`), JSON.stringify(afterRub.dialog));
    const rubCommand = afterRub.sentUiProtocolCommands.find((command) => command.commandType === 'action.execute' && command.actionId === 'item.rub');
    assert('item.rub v2 command recorded', rubCommand, JSON.stringify(afterRub.sentUiProtocolCommands));
    const acceptedBridgeEvent = (afterRub.bridgeUiEvents || []).find((event) => event.name === 'bridge_ui_command_accepted' && event.commandId === rubCommand.commandId && event.actionId === 'item.rub');
    assert('bridge accepted item.rub ui-command', acceptedBridgeEvent, JSON.stringify(afterRub.bridgeUiEvents || []));
    assert('bridge did not reject item.rub ui-command', !(afterRub.bridgeUiEvents || []).some((event) => event.name === 'bridge_ui_command_rejected' && event.commandId === rubCommand.commandId), JSON.stringify(afterRub.bridgeUiEvents || []));
    assert('item.rub route command is exactly #rub\\n', rubCommand.payload?.route?.command === '#rub\n', JSON.stringify(rubCommand));
    assert('item.rub prompt policy is NetHack-owned follow-up', rubCommand.payload?.promptPolicy === 'netHack-owned-followup', JSON.stringify(rubCommand));
    assert('item.rub carries public inventory target', rubCommand.targets?.location?.kind === 'inventory' && rubCommand.targets?.selector, JSON.stringify(rubCommand));
    assert('item.rub did not auto-answer selected lamp selector after #rub', !new RegExp(`#rub\\n${rubCommand.targets.selector}`).test(afterRub.sent), JSON.stringify({ sent: afterRub.sent, target: rubCommand.targets }));
    const transactionBytes = (afterRub.sentPayloads || [])
      .filter((payload) => payload.uiProtocolActionId === 'item.rub' && payload.uiProtocolCommandId === rubCommand.commandId)
      .sort((a, b) => (a.commandPosition || 0) - (b.commandPosition || 0))
      .map((payload) => String.fromCharCode(payload.keycode || 0))
      .join('');
    assert('item.rub native transaction key bytes are exactly #rub\\n', transactionBytes === '#rub\n', JSON.stringify({ transactionBytes, sentPayloads: afterRub.sentPayloads }));
    assertNoHiddenIdentityFields(rubCommand);

    const sidecar = {
      scenarioId,
      invocation: `NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=${scenarioId} NH_RUB_INVENTORY_OUT_DIR=${path.relative(root, outDir)} npm run test:real-scenario-rub-inventory-mcp`,
      rows: inventoryReady.rowActions,
      rockContext: { row: rockRow, menu: rockContext.contextMenu },
      markerContext: { row: markerRow, menu: markerContext.contextMenu },
      towelContext: { row: towelRow, menu: towelContext.contextMenu },
      lampContext: { row: lampRow, menu: lampContext.contextMenu },
      afterRub: { sent: afterRub.sent, transactionBytes, dialog: afterRub.dialog, command: rubCommand, sentPayloads: afterRub.sentPayloads, bridgeUiEvents: afterRub.bridgeUiEvents || [], seenShim: afterRub.seenShim || '', bridgeAccepted: Boolean(acceptedBridgeEvent), bridgeRejected: (afterRub.bridgeUiEvents || []).some((event) => event.name === 'bridge_ui_command_rejected' && event.commandId === rubCommand.commandId) },
      screenshots: { inventoryShot, rockContextShot, markerContextShot, towelContextShot, lampContextShot, promptShot },
    };
    fs.writeFileSync(path.join(outDir, 'rub-inventory-state.json'), JSON.stringify(sidecar, null, 2));
    const summary = [`# Real inventory #rub semantic route MCP proof`, '', 'PASS', '', `Scenario: ${scenarioId}`, '', 'Evidence:', `- Inventory rows: ${inventoryShot}`, `- Non-candidate rock context (no Rub): ${rockContextShot}`, `- Non-candidate magic marker context (no Rub): ${markerContextShot}`, `- Non-candidate towel context (no Rub): ${towelContextShot}`, `- Public lamp context with Rub: ${lampContextShot}`, `- NetHack-owned #rub prompt after click: ${promptShot}`, `- State sidecar: ${path.join(outDir, 'rub-inventory-state.json')}`, '', 'Verified:', '- Rub appears for a public inventory lamp candidate and not for ordinary rocks, magic markers, or towels; this matches native NetHack `#rub` accepting lamps/lanterns/stones, not marker/towel rows.', '- Clicking Rub sends a v2 `action.execute` with `actionId: item.rub`, route command exactly `#rub\\n`, a public inventory target, and `promptPolicy: netHack-owned-followup`.', '- Transaction-scoped native UI-command bytes are exactly `#rub\\n`; the full UI stream includes one leading Escape only to close the inventory surface before the semantic command.', '- The shim bridge emits `bridge_ui_command_accepted` and no `bridge_ui_command_rejected`; the normal top-level command waiter is not mistaken for a blocking follow-up prompt.', '- No inventory selector or secondary target answer is bundled after the extended command.', '- The recorded v2 command omits hidden identity/BUC/charges/trap/container fields.', '', `Sent stream: ${JSON.stringify(afterRub.sent)}`, `Transaction bytes: ${JSON.stringify(transactionBytes)}`, ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-scenario-rub-inventory-summary.md'), summary);
    console.log(summary);
  } finally {
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), stdout.join(''));
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), stderr.join(''));
    cleanup();
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
