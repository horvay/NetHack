const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const EvidenceScan = require('../src/shared/direct-api-evidence-scan');
const ContactSheet = require('./direct-api-contact-sheet');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_DIRECT_EQUIPMENT_OUT_DIR || path.join(root, 'test-output', 'real-direct-equipment-change');
const screenshotsDir = path.join(outDir, 'screenshots');
const stateDir = path.join(outDir, 'state');
const basePort = Number(process.env.NH_DIRECT_EQUIPMENT_CDP_PORT || 9655);

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const id = path.basename(name, path.extname(name)); const native = await evalExpr(cdp, `window.netHackPOC.captureTestScreenshot(${JSON.stringify(id)})`); assert(`native screenshot ${name}`, native?.ok && native.method === 'BrowserWindow.webContents.capturePage', JSON.stringify(native)); const p = path.join(screenshotsDir, name); fs.copyFileSync(native.path, p); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function boxForText(cdp, selector, pattern) { const box = await evalExpr(cdp, `(() => { const re = new RegExp(${JSON.stringify(pattern)}, 'i'); const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((candidate) => re.test(candidate.innerText || '')); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText,datasetKey:el.dataset.key || el.dataset.dragSelector || ''} : null; })()`); if (!box) throw new Error(`missing ${selector} matching ${pattern}`); return box; }
async function dragTextToSlot(cdp, sourcePattern, targetSlot) { const source = await boxForText(cdp, '#interaction-options .rpg-inventory-row', sourcePattern); const target = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(`.paper-doll-slots .equipment-slot[data-slot="${targetSlot}"]`)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText} : null; })()`); if (!target) throw new Error(`missing slot ${targetSlot}`); const dragData = { items: [{ mimeType: 'application/x-nethack-selector', data: source.datasetKey }, { mimeType: 'text/plain', data: source.datasetKey }], dragOperationsMask: 1 }; await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: target.x, y: target.y, data: dragData }); await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: target.x, y: target.y, data: dragData }); await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: target.x, y: target.y, data: dragData }); return { source, target }; }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
  shim: document.getElementById('shim-output')?.innerText || '',
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  sentPayloads: window.__nethackPromptTest?.sentPayloads?.() || [],
  sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
  sentUiProtocolAcks: window.__nethackPromptTest?.sentUiProtocolAcks?.() || [],
  equipment: window.__nethackPromptTest?.equipment?.() || {},
  shimEvents: (window.__nethackPromptTest?.shimEvents?.() || []).slice(-240).map((entry) => entry.event || entry.raw || entry),
  messages: window.__nethackPromptTest?.messages?.().slice(-20).map((m) => m.text || String(m)) || [],
  dialog: window.__nethackPromptTest?.dialog?.() || {},
  activePrompt: window.__nethackAutomation?.state?.().activePrompt || null,
  body: document.body.innerText,
  rows: Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).map((el) => ({ key: el.dataset.key || '', text: el.innerText })),
  slots: Array.from(document.querySelectorAll('.paper-doll-slots .equipment-slot')).map((el) => ({ slot: el.dataset.slot, text: el.innerText, equipped: el.classList.contains('equipped') })),
  feedback: document.getElementById('interaction-feedback')?.textContent || '',
  status: document.getElementById('status')?.textContent || ''
}))()`); }
function slotText(s, slot) { return (s.slots || []).find((entry) => entry.slot === slot)?.text || ''; }
function rowsText(s) { return (s.rows || []).map((row) => row.text).join('\n'); }
function isEquipmentScreen(s) { return Boolean(s.dialog?.interactionOpen) && /Equipment\s*\/\s*Inventory/i.test(s.dialog?.title || '') && /Hero equipment/i.test(s.dialog?.panelControls?.text || ''); }
function commandByAction(s, action) { return (s.sentUiProtocolCommands || []).find((command) => command.commandType === 'equipment.change' && command.payload?.action === action); }
function ackEventType(ack) { return ack?.eventType || ack?.payload?.eventType || ''; }
function ackCommand(ack) { return ack?.command || ack?.payload?.command || null; }
function completedByAction(s, action) { return (s.sentUiProtocolAcks || []).find((ack) => ackEventType(ack) === 'command.completed' && (ack.payload?.commandType === 'equipment.change' || ackCommand(ack)?.commandType === 'equipment.change') && (ack.payload?.result?.action === action || ackCommand(ack)?.payload?.action === action)); }
function acceptedByAction(s, action) { return (s.sentUiProtocolAcks || []).find((ack) => ackEventType(ack) === 'command.accepted' && (ack.payload?.commandType === 'equipment.change' || ackCommand(ack)?.commandType === 'equipment.change') && (ack.payload?.result?.action === action || ackCommand(ack)?.payload?.action === action)); }
function hasForbiddenSelectorStream(text) { return /(?:^|\u001b)[TRPwQ][A-Za-z](?:[lr])?/.test(String(text || '')); }
function isOwnedBackingInventoryCancellation(event = {}) {
  const own = (key) => Object.prototype.hasOwnProperty.call(event, key);
  const exactString = (key, value) => own(key) && typeof event[key] === 'string' && event[key] === value;
  const exactInteger = (key, value) => own(key) && typeof event[key] === 'number' && Number.isSafeInteger(event[key]) && Object.is(event[key], value);
  const requestId = own('requestId') && typeof event.requestId === 'string' ? event.requestId : '';
  const transactionId = own('transactionId') && typeof event.transactionId === 'string' ? event.transactionId : '';
  return exactString('name', 'bridge_menu_answer')
    && exactInteger('window', event.window) && Number.isSafeInteger(event.window)
    && own('menuId') && typeof event.menuId === 'string' && Boolean(event.menuId)
    && Boolean(requestId) && exactString('menuRequestId', requestId)
    && Boolean(transactionId) && exactString('inputTransactionId', transactionId)
    && exactInteger('lifecycleRevision', event.lifecycleRevision) && event.lifecycleRevision > 0
    && exactString('lifecycle', 'answered')
    && own('menuPurpose') && typeof event.menuPurpose === 'string' && /^inventory\./.test(event.menuPurpose)
    && own('owner') && event.owner && typeof event.owner === 'object' && !Array.isArray(event.owner)
    && event.owner.kind === 'inventory' && event.owner.window === event.window
    && own('requestSource') && event.requestSource && typeof event.requestSource === 'object' && !Array.isArray(event.requestSource)
    && event.requestSource.layer === 'shim-bridge' && event.requestSource.window === event.window
    && own('activeRequestMatch') && event.activeRequestMatch === true
    && own('inputMatchesMenuTransaction') && event.inputMatchesMenuTransaction === true
    && exactInteger('return', 0) && exactInteger('selector', 0) && exactString('selectors', '')
    && ['selection', 'answer', 'value', 'key'].every((key) => !own(key) || exactString(key, ''));
}
function assertOnlyExactOwnedBackingInventoryCancellations(label, s) {
  const answers = (s.shimEvents || []).filter((event) => event.name === 'bridge_menu_answer');
  assert(`${label} observes at least one native backing-Inventory cancellation`, answers.length > 0, JSON.stringify(answers));
  assert(`${label} accepts no malformed, unowned, foreign-menu, or conflicting cancellation alternative`, answers.every(isOwnedBackingInventoryCancellation), JSON.stringify(answers));
}
function hasHiddenEquipmentChoreography(s) {
  const events = s.shimEvents || [];
  const eventText = JSON.stringify(events.slice(-80));
  return events.some((event) => event.name === 'bridge_ui_command_accepted' || event.name === 'bridge_extcmd_answer' || (event.name === 'bridge_menu_answer' && !isOwnedBackingInventoryCancellation(event)) || (event.name === 'bridge_prompt_answer' && event.autoAnswerReason === 'queued-ring-finger'))
    || /Which .*?(?:ring-|finger)|Right or Left|left or right|choose a hand/i.test(`${s.dialog?.prompt || ''}\n${s.activePrompt?.query || ''}\n${eventText}`)
    || hasForbiddenSelectorStream(s.sent);
}
function publicState(s) {
  return {
    sent: s.sent,
    commands: (s.sentUiProtocolCommands || []).map((command) => ({ commandType: command.commandType, commandId: command.commandId, transactionId: command.transactionId, expectedRevision: command.expectedRevision, payload: command.payload })),
    acks: (s.sentUiProtocolAcks || []).map((ack) => ({ eventType: ack.eventType || ack.payload?.eventType, command: ack.command ? { commandType: ack.command.commandType, commandId: ack.command.commandId, transactionId: ack.command.transactionId, payload: ack.command.payload } : (ack.payload?.command ? { commandType: ack.payload.command.commandType, commandId: ack.payload.command.commandId, transactionId: ack.payload.command.transactionId, payload: ack.payload.command.payload } : undefined), result: ack.result ? { status: ack.result.status, action: ack.result.action, itemId: ack.result.itemId } : (ack.payload?.result ? { status: ack.payload.result.status, action: ack.payload.result.action, itemId: ack.payload.result.itemId } : undefined), reason: ack.reason || ack.payload?.reason, blockerToken: ack.blockerToken || ack.payload?.blockerToken })), 
    rows: s.rows,
    slots: s.slots,
    messages: s.messages,
    feedback: s.feedback,
    status: s.status,
    bridgeEventNames: (s.shimEvents || []).map((event) => ({ name: event.name, commandType: event.commandType, action: event.action, hand: event.hand, slotId: event.slotId, window: event.window, menuId: event.menuId, menuRequestId: event.menuRequestId, menuPurpose: event.menuPurpose, owner: event.owner, requestSource: event.requestSource, lifecycle: event.lifecycle, lifecycleRevision: event.lifecycleRevision, requestId: event.requestId, transactionId: event.transactionId, inputTransactionId: event.inputTransactionId, activeRequestMatch: event.activeRequestMatch, inputMatchesMenuTransaction: event.inputMatchesMenuTransaction, return: event.return, selector: event.selector, selectors: event.selectors, commandId: event.commandId, reason: event.reason }))
  };
}
async function startApp({ scenarioId, port, seed }) {
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1440', NH_ELECTRON_WINDOW_HEIGHT: '1080', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_CAPTURE_DIR: path.join(outDir, 'native-captures'), NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: seed, NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', (d) => { logs += d; }); child.stderr.on('data', (d) => { logs += d; });
  const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((page) => page.type === 'page') ? list : null; }, 20000);
  const cdp = await connect((pages.find((page) => page.type === 'page') || pages[0]).webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  const captureProfile = await evalExpr(cdp, `window.netHackPOC.setTestCaptureProfile(${JSON.stringify({ width: 1440, height: 1080, zoomPercent: 100 })})`);
  assert('native direct-equipment capture profile', captureProfile?.ok && captureProfile.contentSize?.[0] === 1440 && captureProfile.contentSize?.[1] === 1080, JSON.stringify(captureProfile));
  await waitFor(() => evalExpr(cdp, 'innerWidth === 1440 && innerHeight === 1080'), 5000);
  await click(cdp, '#start-shim');
  await delay(250);
  if ((await state(cdp)).dialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game');
  await waitFor(() => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 7000);
  await evalExpr(cdp, `(() => { document.getElementById('player-name').value = 'DirectEquip' + Date.now().toString(36).slice(-5); document.getElementById('player-name').dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click(cdp, '#confirm-character');
  await waitFor(async () => (await state(cdp)).running, 20000);
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`);
  await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
  const cleanup = () => { try { cdp.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); return logs; };
  return { cdp, child, cleanup };
}
async function waitForEquipmentStable(cdp) {
  return waitFor(async () => {
    const first = await state(cdp);
    if (!isEquipmentScreen(first) || /updating inventory/i.test(first.status)) return null;
    const signature = JSON.stringify({ revision: first.equipment?.snapshot?.revision, inventoryRevision: first.equipment?.snapshot?.inventoryRevision, rows: first.rows });
    await delay(400);
    const second = await state(cdp);
    return isEquipmentScreen(second) && !/updating inventory/i.test(second.status) && signature === JSON.stringify({ revision: second.equipment?.snapshot?.revision, inventoryRevision: second.equipment?.snapshot?.inventoryRevision, rows: second.rows }) ? second : null;
  }, 10000, 100);
}
async function openEquipment(cdp) {
  await evalExpr(cdp, "window.__nethackPromptTest?.clearSentInputs?.();");
  await click(cdp, '#inventory-equipment-button');
  await waitFor(async () => { const s = await state(cdp); return isEquipmentScreen(s) ? s : null; }, 15000);
  return waitForEquipmentStable(cdp);
}
function writeState(name, value) { const file = path.join(stateDir, name); fs.writeFileSync(file, JSON.stringify(value, null, 2)); return file; }
function rel(file) { return path.relative(outDir, file).replaceAll(path.sep, '/'); }
function rootRel(file) { return path.relative(root, file).replaceAll(path.sep, '/'); }
function appendEvidence(records, label, s) {
  records.push({ name: `${label}.sent-input-stream`, command: s.sent || '' });
  for (const command of s.sentUiProtocolCommands || []) records.push({ name: `${label}.ui-protocol-command`, commandType: command.commandType, command: command });
  for (const ack of s.sentUiProtocolAcks || []) records.push({ name: `${label}.ui-protocol-ack`, eventType: ack.eventType, commandType: ack.command?.commandType, command: ack.command, result: ack.result ? { status: ack.result.status, action: ack.result.action, itemId: ack.result.itemId } : undefined, reason: ack.reason, blockerToken: ack.blockerToken });
  for (const event of s.shimEvents || []) records.push({ name: `${label}.bridge-event`, eventName: event.name, commandType: event.commandType, action: event.action, hand: event.hand, slotId: event.slotId, commandId: event.commandId, window: event.window, menuId: event.menuId, menuRequestId: event.menuRequestId, menuPurpose: event.menuPurpose, owner: event.owner, requestSource: event.requestSource, lifecycle: event.lifecycle, lifecycleRevision: event.lifecycleRevision, requestId: event.requestId, transactionId: event.transactionId, inputTransactionId: event.inputTransactionId, activeRequestMatch: event.activeRequestMatch, inputMatchesMenuTransaction: event.inputMatchesMenuTransaction, return: event.return, selector: event.selector, selectors: event.selectors, reason: event.reason });
}
async function runIdentityScenario(evidenceRecords, screenshots, stateFiles) {
  const session = await startApp({ scenarioId: 'identity/valkyrie-equipped-inventory', port: basePort, seed: '910101' });
  try {
    const cdp = session.cdp;
    const before = await openEquipment(cdp);
    assert('identity equipment has body armor and quivered arrows', /leather armor/i.test(slotText(before, 'armor-suit')) && /arrow/i.test(slotText(before, 'quiver')), JSON.stringify(publicState(before)));
    screenshots.push({ path: rel(await shot(cdp, '01-identity-before-equipment.png')), label: 'Identity scenario before direct equipment changes', inspectionNotes: ['RPG equipment surface is open with visible leather armor, quivered arrows, long sword, shield, and inventory rows; no item selector prompt or item-action modal is visible.'] });
    stateFiles.push(rel(writeState('01-identity-before-public-state.json', publicState(before))));

    await evalExpr(cdp, "window.__nethackPromptTest?.clearSentInputs?.();");
    await click(cdp, '.paper-doll-slots .equipment-slot[data-slot="shield"] button[data-command-key="T"]');
    const afterTakeOff = await waitFor(async () => {
      const s = await state(cdp);
      return commandByAction(s, 'takeOff') && /No shield worn/i.test(slotText(s, 'shield')) ? s : null;
    }, 25000).catch(async (error) => { const debug = await state(cdp).catch(() => ({})); writeState('debug-takeoff-timeout.json', publicState(debug)); await shot(cdp, 'debug-takeoff-timeout.png').catch(() => undefined); throw error; });
    const takeOffCommand = commandByAction(afterTakeOff, 'takeOff');
    assert('takeOff direct command has public objectId and shield slot', Number.isInteger(takeOffCommand?.payload?.itemId) && takeOffCommand.payload.slotId === 'armor.shield', JSON.stringify(takeOffCommand));
    assert('takeOff has exactly one semantic command and one authoritative command.completed acknowledgement', afterTakeOff.sentUiProtocolCommands.filter((command) => command.commandType === 'equipment.change' && command.payload?.action === 'takeOff').length === 1 && afterTakeOff.sentUiProtocolAcks.filter((ack) => ackEventType(ack) === 'command.completed' && (ack.result?.action || ack.payload?.result?.action) === 'takeOff').length === 1, JSON.stringify(publicState(afterTakeOff)));
    assert('takeOff owns one exact backing-menu Escape and reports the canonical core message', afterTakeOff.sent === '\u001b' && /You were wearing .*wooden shield\./i.test(afterTakeOff.messages.join('\n')), JSON.stringify(publicState(afterTakeOff)));
    assertOnlyExactOwnedBackingInventoryCancellations('takeOff', afterTakeOff);
    assert('takeOff direct action used no hidden selector/menu/prompt choreography', !hasHiddenEquipmentChoreography(afterTakeOff), JSON.stringify(publicState(afterTakeOff)));
    screenshots.push({ path: rel(await shot(cdp, '02-after-direct-takeoff-shield.png')), label: 'After direct takeOff from equipment slot', inspectionNotes: ['Shield slot now reads No shield worn and shield is back in inventory with a wear action; the equipment surface remained open with no take-off selector prompt.'] });
    stateFiles.push(rel(writeState('02-after-direct-takeoff-public-state.json', publicState(afterTakeOff))));
    appendEvidence(evidenceRecords, 'takeOff', afterTakeOff);

    await waitFor(async () => { const s = await state(cdp); return /arrow/i.test(slotText(s, 'quiver')) ? s : null; }, 10000);
    await waitForEquipmentStable(cdp);
    await evalExpr(cdp, "window.__nethackPromptTest?.clearSentInputs?.();");
    await click(cdp, '.paper-doll-slots .equipment-slot[data-slot="quiver"] button[data-command-key="Q"]');
    const afterClearQuiver = await waitFor(async () => {
      const s = await state(cdp);
      return commandByAction(s, 'clearQuiver') && /No quivered ammo known/i.test(slotText(s, 'quiver')) ? s : null;
    }, 25000);
    assert('clearQuiver has exactly one semantic command and one authoritative command.completed acknowledgement', afterClearQuiver.sentUiProtocolCommands.filter((command) => command.commandType === 'equipment.change' && command.payload?.action === 'clearQuiver').length === 1 && afterClearQuiver.sentUiProtocolAcks.filter((ack) => ackEventType(ack) === 'command.completed' && (ack.result?.action || ack.payload?.result?.action) === 'clearQuiver').length === 1, JSON.stringify(publicState(afterClearQuiver)));
    assert('clearQuiver owns one exact backing-menu Escape and reports the canonical core message', afterClearQuiver.sent === '\u001b' && afterClearQuiver.messages.includes('You now have no ammunition readied.'), JSON.stringify(publicState(afterClearQuiver)));
    assertOnlyExactOwnedBackingInventoryCancellations('clearQuiver', afterClearQuiver);
    assert('clearQuiver direct action used no hidden selector choreography', !hasHiddenEquipmentChoreography(afterClearQuiver), JSON.stringify(publicState(afterClearQuiver)));
    screenshots.push({ path: rel(await shot(cdp, '03-after-direct-clear-quiver.png')), label: 'After direct clearQuiver from quiver slot', inspectionNotes: ['Quiver slot is empty after direct clearQuiver; no Q-selector prompt/menu is visible.'] });
    stateFiles.push(rel(writeState('03-after-direct-clear-quiver-public-state.json', publicState(afterClearQuiver))));
    appendEvidence(evidenceRecords, 'clearQuiver', afterClearQuiver);

    await waitForEquipmentStable(cdp);
    await evalExpr(cdp, "window.__nethackPromptTest?.clearSentInputs?.();");
    await dragTextToSlot(cdp, '12 arrows', 'quiver');
    const afterQuiver = await waitFor(async () => {
      const s = await state(cdp);
      return commandByAction(s, 'quiver') && /arrow/i.test(slotText(s, 'quiver')) ? s : null;
    }, 25000).catch(async (error) => { const debug = await state(cdp).catch(() => ({})); writeState('debug-quiver-timeout.json', publicState(debug)); await shot(cdp, 'debug-quiver-timeout.png').catch(() => undefined); throw error; });
    const quiverCommand = commandByAction(afterQuiver, 'quiver');
    assert('quiver direct command has public objectId and quiver slot', Number.isInteger(quiverCommand?.payload?.itemId) && quiverCommand.payload.slotId === 'quiver', JSON.stringify(quiverCommand));
    assert('quiver has exactly one semantic command and one authoritative command.completed acknowledgement', afterQuiver.sentUiProtocolCommands.filter((command) => command.commandType === 'equipment.change' && command.payload?.action === 'quiver').length === 1 && afterQuiver.sentUiProtocolAcks.filter((ack) => ackEventType(ack) === 'command.completed' && (ack.result?.action || ack.payload?.result?.action) === 'quiver').length === 1, JSON.stringify(publicState(afterQuiver)));
    assert('quiver owns one exact backing-menu Escape and reports the canonical core message', afterQuiver.sent === '\u001b' && /12 arrows \(in quiver\)\./i.test(afterQuiver.messages.join('\n')), JSON.stringify(publicState(afterQuiver)));
    assertOnlyExactOwnedBackingInventoryCancellations('quiver', afterQuiver);
    assert('quiver direct action used no hidden selector/menu/prompt choreography', !hasHiddenEquipmentChoreography(afterQuiver), JSON.stringify(publicState(afterQuiver)));
    screenshots.push({ path: rel(await shot(cdp, '04-after-direct-quiver-arrows.png')), label: 'After direct quiver drop to quiver slot', inspectionNotes: ['Arrows are again visibly in the quiver after dropping the row onto the quiver slot; no Q-selector menu or item-action modal is visible.'] });
    stateFiles.push(rel(writeState('04-after-direct-quiver-public-state.json', publicState(afterQuiver))));
    appendEvidence(evidenceRecords, 'quiver', afterQuiver);
  } finally {
    const logs = session.cleanup();
    fs.writeFileSync(path.join(outDir, 'identity-electron-output.raw'), logs);
  }
}
async function runRingScenario(evidenceRecords, screenshots, stateFiles) {
  const session = await startApp({ scenarioId: 'equipment/ring-put-on-gui', port: basePort + 1, seed: '910202' });
  try {
    const cdp = session.cdp;
    const before = await openEquipment(cdp);
    assert('ring scenario has loose protection ring and empty right hand', /ring of protection/i.test(rowsText(before)) && /No right ring worn/i.test(slotText(before, 'right-ring')), JSON.stringify(publicState(before)));
    screenshots.push({ path: rel(await shot(cdp, '05-ring-before-equipment.png')), label: 'Ring scenario before direct right-hand putOnRing', inspectionNotes: ['RPG equipment surface is open with loose ring of protection/adornment rows and empty left/right ring slots; no Put on prompt is visible.'] });
    stateFiles.push(rel(writeState('05-ring-before-public-state.json', publicState(before))));

    await waitForEquipmentStable(cdp);
    await evalExpr(cdp, "window.__nethackPromptTest?.clearSentInputs?.();");
    await dragTextToSlot(cdp, 'ring of protection', 'right-ring');
    const afterRing = await waitFor(async () => {
      const s = await state(cdp);
      return commandByAction(s, 'putOnRing') && /ring of protection/i.test(slotText(s, 'right-ring')) ? s : null;
    }, 25000).catch(async (error) => { const debug = await state(cdp).catch(() => ({})); writeState('debug-ring-timeout.json', publicState(debug)); await shot(cdp, 'debug-ring-timeout.png').catch(() => undefined); throw error; });
    const ringCommand = commandByAction(afterRing, 'putOnRing');
    assert('putOnRing direct command has explicit public right hand and ring slot', Number.isInteger(ringCommand?.payload?.itemId) && ringCommand.payload.hand === 'right' && ringCommand.payload.slotId === 'ring.right', JSON.stringify(ringCommand));
    assert('putOnRing has exactly one semantic command and one authoritative command.completed acknowledgement', afterRing.sentUiProtocolCommands.filter((command) => command.commandType === 'equipment.change' && command.payload?.action === 'putOnRing').length === 1 && afterRing.sentUiProtocolAcks.filter((ack) => ackEventType(ack) === 'command.completed' && (ack.result?.action || ack.payload?.result?.action) === 'putOnRing').length === 1, JSON.stringify(publicState(afterRing)));
    assert('putOnRing owns one exact backing-menu Escape and reports the canonical core message', afterRing.sent === '\u001b' && /ring of protection \(on right hand\)\./i.test(afterRing.messages.join('\n')), JSON.stringify(publicState(afterRing)));
    assertOnlyExactOwnedBackingInventoryCancellations('putOnRing', afterRing);
    assert('putOnRing sent no hidden P-selector or ring-hand answer stream', !hasForbiddenSelectorStream(afterRing.sent), JSON.stringify(publicState(afterRing)));
    assert('putOnRing produced no visible or hidden ring hand prompt/auto-answer event', !hasHiddenEquipmentChoreography(afterRing), JSON.stringify(publicState(afterRing)));
    screenshots.push({ path: rel(await shot(cdp, '06-after-direct-put-on-right-ring.png')), label: 'After direct putOnRing to explicit right hand', inspectionNotes: ['Right ring slot contains ring of protection and left ring remains empty; there is no left/right hand prompt and no hidden hand-answer UI.'] });
    stateFiles.push(rel(writeState('06-after-direct-put-on-right-ring-public-state.json', publicState(afterRing))));
    appendEvidence(evidenceRecords, 'putOnRing', afterRing);
  } finally {
    const logs = session.cleanup();
    fs.writeFileSync(path.join(outDir, 'ring-electron-output.raw'), logs);
  }
}
async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  const evidenceRecords = [];
  const screenshots = [];
  const stateFiles = [];
  await runIdentityScenario(evidenceRecords, screenshots, stateFiles);
  await runRingScenario(evidenceRecords, screenshots, stateFiles);

  fs.writeFileSync(path.join(outDir, 'direct-equipment-events.jsonl'), evidenceRecords.map((record) => JSON.stringify(record)).join('\n') + '\n');
  const extraRules = [
    { id: 'equipment-no-escaped-takeoff-selector-command', field: 'command', regex: '^\\u001b?T[a-zA-Z]$' },
    { id: 'equipment-no-escaped-remove-selector-command', field: 'command', regex: '^\\u001b?R[a-zA-Z]$' },
    { id: 'equipment-no-escaped-puton-selector-command', field: 'command', regex: '^\\u001b?P[a-zA-Z](?:[lr])?$' },
    { id: 'equipment-no-escaped-wield-selector-command', field: 'command', regex: '^\\u001b?w[a-zA-Z]$' },
    { id: 'equipment-no-escaped-quiver-selector-command', field: 'command', regex: '^\\u001b?Q[a-zA-Z]$' },
  ];
  const tokenScan = EvidenceScan.scanOutputDir(outDir, EvidenceScan.rulesForTask('equipment.change', extraRules));
  const boundaryScan = EvidenceScan.scanPublicBoundaryOutputDir(outDir);
  fs.writeFileSync(path.join(outDir, 'forbidden-token-scan.md'), EvidenceScan.markdownSummary(tokenScan, 'Direct equipment.change real MCP forbidden-token scan'));
  fs.writeFileSync(path.join(outDir, 'public-boundary-scan.md'), EvidenceScan.markdownSummary(boundaryScan, 'Direct equipment.change real MCP public-boundary scan'));
  assert('forbidden-token scan passed', tokenScan.ok, EvidenceScan.markdownSummary(tokenScan));
  assert('public-boundary scan passed', boundaryScan.ok, EvidenceScan.markdownSummary(boundaryScan));
  const manifest = EvidenceScan.createEvidenceManifest({
    task: 'equipment.change',
    scenarioId: 'identity/valkyrie-equipped-inventory',
    outputDir: 'test-output/real-direct-equipment-change',
    screenshots,
    stateSidecars: stateFiles,
    logs: ['direct-equipment-events.jsonl'],
    contactSheets: ['contact-sheet.html'],
    forbiddenTokenScan: { passed: tokenScan.ok, tokens: EvidenceScan.rulesForTask('equipment.change', extraRules).map((rule) => rule.id), summary: 'forbidden-token-scan.md' },
    publicBoundaryScan: { passed: boundaryScan.ok, forbiddenFields: EvidenceScan.forbiddenPublicBoundaryFields, summary: 'public-boundary-scan.md' },
    reviewNotes: [
      'Real Electron/CDP run exercised renderer equipment-surface actions against scenario-backed NetHack shim fixtures, not injected DOM-only menus.',
      'Observed equipment.change commands for takeOff, clearQuiver, quiver, and putOnRing; direct action state sidecars show public objectId/slot/hand payloads and command.completed acknowledgements.',
      'Sent input streams contain only surface cancellation/refresh keys, not T/R/P/w/Q selector choreography; right-hand ring payload is explicit and no left/right prompt or auto-answer event appears.',
    ],
  });
  const validation = EvidenceScan.validateEvidenceManifest(manifest);
  assert('evidence manifest valid', validation.ok, validation.errors.join('\n'));
  const written = EvidenceScan.writeEvidenceManifest(outDir, manifest);
  ContactSheet.writeContactSheet(written.manifestPath, path.join(outDir, 'contact-sheet.html'));
  const summary = [
    '# Real direct equipment.change MCP proof', '', 'PASS', '',
    `Output: ${rootRel(outDir)}`,
    `Manifest: ${rootRel(path.join(outDir, 'evidence-manifest.json'))}`,
    `Contact sheet: ${rootRel(path.join(outDir, 'contact-sheet.html'))}`,
    `Forbidden-token scan: ${rootRel(path.join(outDir, 'forbidden-token-scan.md'))}`,
    `Public-boundary scan: ${rootRel(path.join(outDir, 'public-boundary-scan.md'))}`,
    '', 'Screenshots:', ...screenshots.map((entry) => `- ${entry.path}: ${entry.label}`), '',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'summary.md'), summary);
  console.log(summary);
}
main().then(() => process.exit(0)).catch((error) => { console.error(error.stack || error); process.exit(1); });
