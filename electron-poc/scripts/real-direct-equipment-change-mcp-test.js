const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = 1440;
const height = 1080;
const { delay, waitFor } = Harness;
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function shot(cdp, name) {
  const capture = await cdp.nativeScreenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'actual-player', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}
function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-direct-equipment-change-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function boxForText(cdp, selector, pattern) { const box = await evalExpr(cdp, `(() => { const re = new RegExp(${JSON.stringify(pattern)}, 'i'); const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((candidate) => re.test(candidate.innerText || '')); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText,datasetKey:el.dataset.key || el.dataset.dragSelector || ''} : null; })()`); if (!box) throw new Error(`missing ${selector} matching ${pattern}`); return box; }
async function dragTextToSlot(cdp, sourcePattern, targetSlot) { const source = await boxForText(cdp, '.uxm-item-row', sourcePattern); const normalizedSlot = { 'right-ring': 'ring.right', 'left-ring': 'ring.left', shield: 'armor.shield', 'armor-suit': 'armor.body' }[targetSlot] || targetSlot; const target = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(`.uxm-slot-button[data-slot-id="${normalizedSlot}"]`)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText} : null; })()`); if (!target) throw new Error(`missing slot ${targetSlot}`); const dragData = { items: [{ mimeType: 'application/x-nethack-selector', data: source.datasetKey }, { mimeType: 'text/plain', data: source.datasetKey }], dragOperationsMask: 1 }; await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: target.x, y: target.y, data: dragData }); await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: target.x, y: target.y, data: dragData }); await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: target.x, y: target.y, data: dragData }); return { source, target }; }
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
  ownerDiagnostics: window.NetHackUxEquipmentScreen?.controller?.diagnostics?.().slice(-12) || [],
  shimEvents: (window.__nethackPromptTest?.shimEvents?.() || []).slice(-240).map((entry) => entry.event || entry.raw || entry),
  messages: window.__nethackPromptTest?.messages?.().slice(-20).map((m) => m.text || String(m)) || [],
  dialog: window.__nethackPromptTest?.dialog?.() || {},
  activePrompt: window.__nethackAutomation?.state?.().activePrompt || null,
  body: document.body.innerText,
  rows: Array.from(document.querySelectorAll('#ux-items-root .uxm-item-row')).map((el) => {
    const icon = el.querySelector('.uxm-item-icon'); const image = icon?.querySelector('img'); const box = image?.getBoundingClientRect();
    return { key: el.dataset.key || '', text: el.innerText, iconSource: icon?.dataset.iconSource || '', iconSrc: image?.currentSrc || image?.src || '', iconNaturalWidth: image?.naturalWidth || 0, iconNaturalHeight: image?.naturalHeight || 0, iconBox: box ? { width: box.width, height: box.height } : null };
  }),
  slots: Array.from(document.querySelectorAll('#ux-items-root .uxm-slot-button')).map((el) => ({ slot: el.dataset.slotId, text: el.innerText, equipped: !/\bEmpty\b/i.test(el.innerText) })),
  feedback: document.querySelector('#ux-items-root .uxm-item-feedback')?.textContent || '',
  layout: (() => {
    const root = document.getElementById('ux-items-root'); const pane = root?.querySelector('.uxm-inventory-pane'); const list = root?.querySelector('.uxm-inventory-list-wrap'); const rail = root?.querySelector('.uxm-selection-rail');
    const rect = (node) => { const box = node?.getBoundingClientRect(); return box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height } : null; };
    const paneBox = rect(pane); const listBox = rect(list); const railBox = rect(rail);
    const visibleRows = Array.from(root?.querySelectorAll('.uxm-item-row') || []).filter((row) => { const box = row.getBoundingClientRect(); return listBox && box.top >= listBox.top - 0.5 && box.bottom <= listBox.bottom + 0.5; }).length;
    return { pane: paneBox, list: listBox, rail: railBox, listShare: paneBox && listBox ? listBox.height / paneBox.height : 0, railShare: paneBox && railBox ? railBox.height / paneBox.height : 1, visibleRows, rootHorizontalOverflow: Boolean(root && root.scrollWidth > root.clientWidth), documentHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  })(),
  status: document.getElementById('status')?.textContent || ''
}))()`); }
function slotText(s, slot) { const normalized = { 'right-ring': 'ring.right', 'left-ring': 'ring.left', shield: 'armor.shield', 'armor-suit': 'armor.body' }[slot] || slot; return (s.slots || []).find((entry) => entry.slot === normalized)?.text || ''; }
function rowsText(s) { return (s.rows || []).map((row) => row.text).join('\n'); }
function assertWorkspaceVisual(label, s) {
  const rows = s.rows || []; const layout = s.layout || {};
  assert(`${label} has resolved decoded item art`, rows.length > 0 && rows.every((row) => row.iconSource === 'resolved' && /\.png(?:\?|$)/i.test(row.iconSrc) && row.iconNaturalWidth > 0 && row.iconNaturalHeight > 0 && row.iconBox?.width >= 28 && row.iconBox?.width <= 36 && row.iconBox?.height >= 28 && row.iconBox?.height <= 36), JSON.stringify(rows));
  assert(`${label} keeps the inventory list dominant and the action rail shallow`, layout.listShare >= 0.62 && layout.railShare <= 0.2 && layout.list?.height >= 480 && layout.visibleRows >= Math.min(10, rows.length), JSON.stringify(layout));
  assert(`${label} has no horizontal overflow or raw fallback labels`, !layout.rootHorizontalOverflow && !layout.documentHorizontalOverflow && !/Inventory selector|Name unavailable|Loading your inventory|semantic IDs|undefined|null/i.test(`${rowsText(s)}\n${s.body || ''}`), JSON.stringify({ layout, rows: rowsText(s) }));
}
function isEquipmentScreen(s) { return Boolean(s.equipment?.open) && /Inventory & equipment/i.test(s.body || ''); }
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
    ownerDiagnostics: s.ownerDiagnostics,
    bridgeEventNames: (s.shimEvents || []).map((event) => ({ name: event.name, commandType: event.commandType, action: event.action, hand: event.hand, slotId: event.slotId, window: event.window, menuId: event.menuId, menuRequestId: event.menuRequestId, menuPurpose: event.menuPurpose, owner: event.owner, requestSource: event.requestSource, lifecycle: event.lifecycle, lifecycleRevision: event.lifecycleRevision, requestId: event.requestId, transactionId: event.transactionId, inputTransactionId: event.inputTransactionId, activeRequestMatch: event.activeRequestMatch, inputMatchesMenuTransaction: event.inputMatchesMenuTransaction, return: event.return, selector: event.selector, selectors: event.selectors, commandId: event.commandId, reason: event.reason }))
  };
}
async function startApp({ scenarioId, seed }) {
  const nativeCaptureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nethack-direct-equipment-'));
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_CAPTURE_DIR: nativeCaptureDir,
      NH_TEST_SCENARIO_ID: scenarioId,
      NETHACK_SEED: seed,
      NETHACKOPTIONS: '!tutorial,!autopickup',
    },
  });
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc, nativeCaptureDir });
  await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true });
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  const captureProfile = await evalExpr(cdp, `window.netHackPOC.setTestCaptureProfile(${JSON.stringify({ width, height, zoomPercent: 100 })})`);
  assert('native direct-equipment capture profile', captureProfile?.ok && captureProfile.contentSize?.[0] === width && captureProfile.contentSize?.[1] === height, JSON.stringify(captureProfile));
  await waitFor(() => evalExpr(cdp, `innerWidth === ${width} && innerHeight === ${height}`), 5000);
  await click(cdp, '#start-shim');
  await delay(250);
  if ((await state(cdp)).dialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game');
  await waitFor(() => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 7000);
  await evalExpr(cdp, `(() => { document.getElementById('player-name').value = 'DirectEquip' + Date.now().toString(36).slice(-5); document.getElementById('player-name').dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click(cdp, '#confirm-character');
  await waitFor(async () => (await state(cdp)).running, 20000);
  await page.dismissIntroDialogs();
  await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
  return cdp;
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
  await waitForEquipmentStable(cdp);
  await evalExpr(cdp, `Promise.all(Array.from(document.querySelectorAll('#ux-items-root .uxm-item-icon img')).map((image) => image.decode?.().catch(() => {}))).then(() => true)`);
  return state(cdp);
}
function writeState(cdp, name, value) { const file = path.join(cdp.outputDir, 'state', name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); return file; }
function rel(cdp, file) { return path.relative(cdp.outputDir, file).replaceAll(path.sep, '/'); }
function appendEvidence(records, label, s) {
  records.push({ name: `${label}.sent-input-stream`, command: s.sent || '' });
  for (const command of s.sentUiProtocolCommands || []) records.push({ name: `${label}.ui-protocol-command`, commandType: command.commandType, command: command });
  for (const ack of s.sentUiProtocolAcks || []) records.push({ name: `${label}.ui-protocol-ack`, eventType: ack.eventType, commandType: ack.command?.commandType, command: ack.command, result: ack.result ? { status: ack.result.status, action: ack.result.action, itemId: ack.result.itemId } : undefined, reason: ack.reason, blockerToken: ack.blockerToken });
  for (const event of s.shimEvents || []) records.push({ name: `${label}.bridge-event`, eventName: event.name, commandType: event.commandType, action: event.action, hand: event.hand, slotId: event.slotId, commandId: event.commandId, window: event.window, menuId: event.menuId, menuRequestId: event.menuRequestId, menuPurpose: event.menuPurpose, owner: event.owner, requestSource: event.requestSource, lifecycle: event.lifecycle, lifecycleRevision: event.lifecycleRevision, requestId: event.requestId, transactionId: event.transactionId, inputTransactionId: event.inputTransactionId, activeRequestMatch: event.activeRequestMatch, inputMatchesMenuTransaction: event.inputMatchesMenuTransaction, return: event.return, selector: event.selector, selectors: event.selectors, reason: event.reason });
}
async function runIdentityScenario(evidenceRecords, screenshots, stateFiles) {
  const cdp = await startApp({ scenarioId: 'identity/valkyrie-equipped-inventory', seed: '910101' });
  let scenarioError = null;
  try {
    const before = await openEquipment(cdp);
    assert('identity equipment has body armor and quivered arrows', /leather armor/i.test(slotText(before, 'armor-suit')) && /arrow/i.test(slotText(before, 'quiver')), JSON.stringify(publicState(before)));
    assertWorkspaceVisual('identity equipment at 1440x1080', before);
    screenshots.push({ path: rel(cdp, await shot(cdp, '01-identity-before-equipment.png')), label: 'Identity scenario before direct equipment changes', inspectionNotes: ['RPG equipment surface is open with visible leather armor, quivered arrows, long sword, shield, and inventory rows; no item selector prompt or item-action modal is visible.'] });
    stateFiles.push(rel(cdp, writeState(cdp, '01-identity-before-public-state.json', publicState(before))));

    await evalExpr(cdp, "window.__nethackPromptTest?.clearSentInputs?.();");
    await click(cdp, '#ux-items-root .uxm-slot-button[data-slot-id="armor.shield"]');
    await evalExpr(cdp, `document.querySelector('#ux-items-root .uxm-detail-actions button[data-action-id="item.takeOff"]')?.click()`);
    const afterTakeOff = await waitFor(async () => {
      const s = await state(cdp);
      return commandByAction(s, 'takeOff') && completedByAction(s, 'takeOff') && /\bEmpty\b/i.test(slotText(s, 'shield')) ? s : null;
    }, 25000).catch(async (error) => { const debug = await state(cdp).catch(() => ({})); writeState(cdp, 'debug-takeoff-timeout.json', publicState(debug)); await shot(cdp, 'debug-takeoff-timeout.png').catch(() => undefined); throw error; });
    const takeOffCommand = commandByAction(afterTakeOff, 'takeOff');
    assert('takeOff direct command has public objectId and shield slot', Number.isInteger(takeOffCommand?.payload?.itemId) && takeOffCommand.payload.slotId === 'armor.shield', JSON.stringify(takeOffCommand));
    assert('takeOff has exactly one semantic command and one authoritative command.completed acknowledgement', afterTakeOff.sentUiProtocolCommands.filter((command) => command.commandType === 'equipment.change' && command.payload?.action === 'takeOff').length === 1 && afterTakeOff.sentUiProtocolAcks.filter((ack) => ackEventType(ack) === 'command.completed' && (ack.result?.action || ack.payload?.result?.action) === 'takeOff').length === 1, JSON.stringify(publicState(afterTakeOff)));
    assert('takeOff uses only the native direct command and reports the canonical core message', afterTakeOff.sent === '' && /You were wearing .*wooden shield\./i.test(afterTakeOff.messages.join('\n')), JSON.stringify(publicState(afterTakeOff)));
    assertOnlyExactOwnedBackingInventoryCancellations('takeOff', afterTakeOff);
    assert('takeOff direct action used no hidden selector/menu/prompt choreography', !hasHiddenEquipmentChoreography(afterTakeOff), JSON.stringify(publicState(afterTakeOff)));
    assertWorkspaceVisual('identity after direct takeOff', afterTakeOff);
    screenshots.push({ path: rel(cdp, await shot(cdp, '02-after-direct-takeoff-shield.png')), label: 'After direct takeOff from equipment slot', inspectionNotes: ['Shield slot now reads No shield worn and shield is back in inventory with a wear action; the equipment surface remained open with no take-off selector prompt.'] });
    stateFiles.push(rel(cdp, writeState(cdp, '02-after-direct-takeoff-public-state.json', publicState(afterTakeOff))));
    appendEvidence(evidenceRecords, 'takeOff', afterTakeOff);

    await waitFor(async () => { const s = await state(cdp); return /arrow/i.test(slotText(s, 'quiver')) ? s : null; }, 10000);
    await waitForEquipmentStable(cdp);
    await evalExpr(cdp, "window.__nethackPromptTest?.clearSentInputs?.();");
    await click(cdp, '#ux-items-root .uxm-slot-button[data-slot-id="quiver"]');
    await evalExpr(cdp, `document.querySelector('#ux-items-root .uxm-detail-actions button[data-action-id="slot.clear.quiver"]')?.click()`);
    const afterClearQuiver = await waitFor(async () => {
      const s = await state(cdp);
      return commandByAction(s, 'clearQuiver') && completedByAction(s, 'clearQuiver') && /\bEmpty\b/i.test(slotText(s, 'quiver')) ? s : null;
    }, 25000);
    assert('clearQuiver has exactly one semantic command and one authoritative command.completed acknowledgement', afterClearQuiver.sentUiProtocolCommands.filter((command) => command.commandType === 'equipment.change' && command.payload?.action === 'clearQuiver').length === 1 && afterClearQuiver.sentUiProtocolAcks.filter((ack) => ackEventType(ack) === 'command.completed' && (ack.result?.action || ack.payload?.result?.action) === 'clearQuiver').length === 1, JSON.stringify(publicState(afterClearQuiver)));
    assert('clearQuiver uses only the native direct command and reports the canonical core message', afterClearQuiver.sent === '' && afterClearQuiver.messages.includes('You now have no ammunition readied.'), JSON.stringify(publicState(afterClearQuiver)));
    assertOnlyExactOwnedBackingInventoryCancellations('clearQuiver', afterClearQuiver);
    assert('clearQuiver direct action used no hidden selector choreography', !hasHiddenEquipmentChoreography(afterClearQuiver), JSON.stringify(publicState(afterClearQuiver)));
    screenshots.push({ path: rel(cdp, await shot(cdp, '03-after-direct-clear-quiver.png')), label: 'After direct clearQuiver from quiver slot', inspectionNotes: ['Quiver slot is empty after direct clearQuiver; no Q-selector prompt/menu is visible.'] });
    stateFiles.push(rel(cdp, writeState(cdp, '03-after-direct-clear-quiver-public-state.json', publicState(afterClearQuiver))));
    appendEvidence(evidenceRecords, 'clearQuiver', afterClearQuiver);

    await waitForEquipmentStable(cdp);
    await evalExpr(cdp, "window.__nethackPromptTest?.clearSentInputs?.();");
    await dragTextToSlot(cdp, '12 arrows', 'quiver');
    const afterQuiver = await waitFor(async () => {
      const s = await state(cdp);
      return commandByAction(s, 'quiver') && completedByAction(s, 'quiver') && /arrow/i.test(slotText(s, 'quiver')) ? s : null;
    }, 25000).catch(async (error) => { const debug = await state(cdp).catch(() => ({})); writeState(cdp, 'debug-quiver-timeout.json', publicState(debug)); await shot(cdp, 'debug-quiver-timeout.png').catch(() => undefined); throw error; });
    const quiverCommand = commandByAction(afterQuiver, 'quiver');
    assert('quiver direct command has public objectId and quiver slot', Number.isInteger(quiverCommand?.payload?.itemId) && quiverCommand.payload.slotId === 'quiver', JSON.stringify(quiverCommand));
    assert('quiver has exactly one semantic command and one authoritative command.completed acknowledgement', afterQuiver.sentUiProtocolCommands.filter((command) => command.commandType === 'equipment.change' && command.payload?.action === 'quiver').length === 1 && afterQuiver.sentUiProtocolAcks.filter((ack) => ackEventType(ack) === 'command.completed' && (ack.result?.action || ack.payload?.result?.action) === 'quiver').length === 1, JSON.stringify(publicState(afterQuiver)));
    assert('quiver uses only the native direct command and reports the canonical core message', afterQuiver.sent === '' && /12 arrows \(in quiver\)\./i.test(afterQuiver.messages.join('\n')), JSON.stringify(publicState(afterQuiver)));
    assertOnlyExactOwnedBackingInventoryCancellations('quiver', afterQuiver);
    assert('quiver direct action used no hidden selector/menu/prompt choreography', !hasHiddenEquipmentChoreography(afterQuiver), JSON.stringify(publicState(afterQuiver)));
    assertWorkspaceVisual('identity after direct quiver', afterQuiver);
    screenshots.push({ path: rel(cdp, await shot(cdp, '04-after-direct-quiver-arrows.png')), label: 'After direct quiver drop to quiver slot', inspectionNotes: ['Arrows are again visibly in the quiver after dropping the row onto the quiver slot; no Q-selector menu or item-action modal is visible.'] });
    stateFiles.push(rel(cdp, writeState(cdp, '04-after-direct-quiver-public-state.json', publicState(afterQuiver))));
    appendEvidence(evidenceRecords, 'quiver', afterQuiver);
  } catch (error) {
    scenarioError = error;
  } finally {
    await cdp.close().catch((error) => { if (!scenarioError) scenarioError = error; });
  }
  const eventsFile = path.join(cdp.outputDir, 'direct-equipment-events.jsonl');
  fs.writeFileSync(eventsFile, `${evidenceRecords.map((record) => JSON.stringify(record)).join('\n')}\n`);
  cdp.qc.recordAssertions([{ id: 'scenario-completed', status: scenarioError ? 'failed' : 'passed', details: scenarioError ? String(scenarioError.message || scenarioError) : '' }]);
  cdp.qc.recordLog({ id: 'electron-stdout', path: cdp.logs.stdout, classification: 'electron-stdout' });
  cdp.qc.recordLog({ id: 'electron-stderr', path: cdp.logs.stderr, classification: 'electron-stderr' });
  cdp.qc.recordLog({ id: 'direct-equipment-events', path: eventsFile, classification: 'diagnostic' });
  fs.rmSync(cdp.nativeCaptureDir, { recursive: true, force: true });
  const validation = Harness.screenshotQc.validateManifest(cdp.qc.manifestFile, { expectedRunIdentity: cdp.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  console.log(`real-direct-equipment-change-mcp-test: CAPTURED ${cdp.outputIdentity} ${cdp.qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}
async function runRingScenario(evidenceRecords, screenshots, stateFiles) {
  const cdp = await startApp({ scenarioId: 'equipment/ring-put-on-gui', seed: '910202' });
  let scenarioError = null;
  try {
    const before = await openEquipment(cdp);
    assert('ring scenario has loose protection ring and empty right hand', /ring of protection/i.test(rowsText(before)) && /\bEmpty\b/i.test(slotText(before, 'right-ring')), JSON.stringify(publicState(before)));
    assertWorkspaceVisual('ring equipment at 1440x1080', before);
    screenshots.push({ path: rel(cdp, await shot(cdp, '05-ring-before-equipment.png')), label: 'Ring scenario before direct right-hand putOnRing', inspectionNotes: ['RPG equipment surface is open with loose ring of protection/adornment rows and empty left/right ring slots; no Put on prompt is visible.'] });
    stateFiles.push(rel(cdp, writeState(cdp, '05-ring-before-public-state.json', publicState(before))));

    await waitForEquipmentStable(cdp);
    await evalExpr(cdp, "window.__nethackPromptTest?.clearSentInputs?.();");
    await dragTextToSlot(cdp, 'ring of protection', 'right-ring');
    const afterRing = await waitFor(async () => {
      const s = await state(cdp);
      return commandByAction(s, 'putOnRing') && completedByAction(s, 'putOnRing') && /ring of protection/i.test(slotText(s, 'right-ring')) ? s : null;
    }, 25000).catch(async (error) => { const debug = await state(cdp).catch(() => ({})); writeState(cdp, 'debug-ring-timeout.json', publicState(debug)); await shot(cdp, 'debug-ring-timeout.png').catch(() => undefined); throw error; });
    const ringCommand = commandByAction(afterRing, 'putOnRing');
    assert('putOnRing direct command has explicit public right hand and ring slot', Number.isInteger(ringCommand?.payload?.itemId) && ringCommand.payload.hand === 'right' && ringCommand.payload.slotId === 'ring.right', JSON.stringify(ringCommand));
    assert('putOnRing has exactly one semantic command and one authoritative command.completed acknowledgement', afterRing.sentUiProtocolCommands.filter((command) => command.commandType === 'equipment.change' && command.payload?.action === 'putOnRing').length === 1 && afterRing.sentUiProtocolAcks.filter((ack) => ackEventType(ack) === 'command.completed' && (ack.result?.action || ack.payload?.result?.action) === 'putOnRing').length === 1, JSON.stringify(publicState(afterRing)));
    assert('putOnRing uses only the native direct command and reports the canonical core message', afterRing.sent === '' && /ring of protection \(on right hand\)\./i.test(afterRing.messages.join('\n')), JSON.stringify(publicState(afterRing)));
    assertOnlyExactOwnedBackingInventoryCancellations('putOnRing', afterRing);
    assert('putOnRing sent no hidden P-selector or ring-hand answer stream', !hasForbiddenSelectorStream(afterRing.sent), JSON.stringify(publicState(afterRing)));
    assert('putOnRing produced no visible or hidden ring hand prompt/auto-answer event', !hasHiddenEquipmentChoreography(afterRing), JSON.stringify(publicState(afterRing)));
    assertWorkspaceVisual('ring after direct putOnRing', afterRing);
    screenshots.push({ path: rel(cdp, await shot(cdp, '06-after-direct-put-on-right-ring.png')), label: 'After direct putOnRing to explicit right hand', inspectionNotes: ['Right ring slot contains ring of protection and left ring remains empty; there is no left/right hand prompt and no hidden hand-answer UI.'] });
    stateFiles.push(rel(cdp, writeState(cdp, '06-after-direct-put-on-right-ring-public-state.json', publicState(afterRing))));
    appendEvidence(evidenceRecords, 'putOnRing', afterRing);
  } catch (error) {
    scenarioError = error;
  } finally {
    await cdp.close().catch((error) => { if (!scenarioError) scenarioError = error; });
  }
  const eventsFile = path.join(cdp.outputDir, 'direct-equipment-events.jsonl');
  fs.writeFileSync(eventsFile, `${evidenceRecords.map((record) => JSON.stringify(record)).join('\n')}\n`);
  cdp.qc.recordAssertions([{ id: 'scenario-completed', status: scenarioError ? 'failed' : 'passed', details: scenarioError ? String(scenarioError.message || scenarioError) : '' }]);
  cdp.qc.recordLog({ id: 'electron-stdout', path: cdp.logs.stdout, classification: 'electron-stdout' });
  cdp.qc.recordLog({ id: 'electron-stderr', path: cdp.logs.stderr, classification: 'electron-stderr' });
  cdp.qc.recordLog({ id: 'direct-equipment-events', path: eventsFile, classification: 'diagnostic' });
  fs.rmSync(cdp.nativeCaptureDir, { recursive: true, force: true });
  const validation = Harness.screenshotQc.validateManifest(cdp.qc.manifestFile, { expectedRunIdentity: cdp.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  console.log(`real-direct-equipment-change-mcp-test: CAPTURED ${cdp.outputIdentity} ${cdp.qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}
async function main() {
  await runIdentityScenario([], [], []);
  await runRingScenario([], [], []);
}
const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
