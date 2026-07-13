const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'container-transfer-panel');
const port = Number(process.env.NH_CONTAINER_PANEL_CDP_PORT || 9497);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 100) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) {
  await evalExpr(cdp, `(async () => {
    document.activeElement?.blur?.(); window.scrollTo(0, 0);
    const previousDisplay = document.body.style.display;
    document.body.style.display = 'none'; void document.body.offsetHeight;
    await new Promise(requestAnimationFrame);
    document.body.style.display = previousDisplay; void document.body.offsetHeight;
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  })()`);
  await cdp.send('Page.bringToFront'); await delay(150);
  const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p;
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.', '--disable-gpu'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1320', NH_ELECTRON_WINDOW_HEIGHT: '880' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup); child.stdout.on('data', (d) => process.stdout.write(d)); child.stderr.on('data', (d) => process.stderr.write(d));
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1320, height: 880, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);

    const metrics = await evalExpr(cdp, `(async () => {
      const t = window.__nethackPromptTest;
      const commands = [];
      const forbidden = /#loot|bridge_extcmd_answer|shimcontainer/i;
      const extendedCommandChrome = new RegExp('Extended command|filter/type any # command', 'i');
      const snapshotEvent = (items = []) => t.event({ name: 'shim_container_contents_snapshot', revision: Date.now() % 100000, sessionId: 'container-42-test', container: { publicId: 'container-42', objectId: 42, displayName: 'large box' }, items });
      const noForbidden = (label) => {
        const sent = t.sentInputs().join('');
        const shim = t.shimEvents().map((entry) => JSON.stringify(entry)).join('\\n');
        const ui = JSON.stringify(commands.concat(t.sentUiProtocolCommands()));
        return { label, ok: !forbidden.test(sent) && !forbidden.test(shim) && !forbidden.test(ui) && !extendedCommandChrome.test(document.body.innerText), sent, shim, ui, body: document.body.innerText };
      };
      const state = () => ({ container: t.container(), prompt: t.prompt(), dialog: t.dialog(), transfers: t.transferTransactions(), status: document.getElementById('status')?.textContent || '', sent: t.sentInputs().join(''), uiCommands: commands.slice(), forbidden: noForbidden('state') });
      t.reset(); t.setRunning(true);
      document.querySelector('[data-command-key="#"]')?.click();
      t.event({ name: 'shim_get_ext_cmd', owner: { kind: 'player' }, requestSource: { layer: 'player-command', reason: 'manual Command # regression' } });
      const commandHashPrompt = { dialog: t.dialog(), paletteOpen: Boolean(document.getElementById('ux-command-palette')?.open), sent: t.sentInputs().join(''), body: document.body.innerText };
      t.cancel();
      document.querySelector('#ux-command-palette .ux-command-palette-heading button')?.click();
      await new Promise((resolve) => setTimeout(resolve, 40));

      t.reset(); t.setRunning(true); t.setCursor(12, 12);
      t.event({ name: 'shim_raw_print', text: 'You see here a chest.' });
      await new Promise((resolve) => setTimeout(resolve, 40));
      const noIdMessageOnly = { actions: t.contextActions(), clicked: t.clickContextAction('open-container'), status: document.getElementById('status')?.textContent || '', sent: t.sentInputs().join(''), ground: t.groundSnapshots() };

      t.reset(); t.setRunning(true); t.setCursor(12, 12);
      t.setGroundPileSnapshotForTest([{ objectId: 42, displayName: 'large box', actionAffordances: ['container'], location: { kind: 'ground' } }]);
      t.event({ name: 'shim_raw_print', text: 'You see here a large box containing 1 item.' });
      await new Promise((resolve) => setTimeout(resolve, 40));
      const visibleMessagePreservesObjectId = { actions: t.contextActions(), ground: t.groundSnapshots(), status: document.getElementById('status')?.textContent || '' };

      t.reset(); t.setRunning(true); commands.length = 0;
      t.setUiCommandHandlerForTest((command) => ({ ok: false, accepted: false, commandId: command.commandId, blockerToken: 'menu-conflict', activeInputOwner: 'native-menu', reason: 'another prompt or menu owns input; container snapshot is blocked' }));
      t.setGroundPileSnapshotForTest([{ objectId: 42, displayName: 'large box', actionAffordances: ['container'], location: { kind: 'ground' } }]);
      t.clickContextAction('open-container');
      await new Promise((resolve) => setTimeout(resolve, 40));
      const ownershipRejected = state();
      t.clearFailureForTest();

      t.reset(); t.setRunning(true);
      t.setUiCommandHandlerForTest((command) => { commands.push(JSON.parse(JSON.stringify(command))); return { ok: true, commandId: command.commandId }; });
      t.setGroundPileSnapshotForTest([{ objectId: 42, displayName: 'large box', actionAffordances: ['container'], location: { kind: 'ground' } }]);
      const openClick = t.clickContextAction('open-container');
      await new Promise((resolve) => setTimeout(resolve, 40));
      const openCommand = commands[commands.length - 1];
      snapshotEvent([
        { objectId: 1001, displayName: 'food ration', semanticName: 'food ration', semanticKnown: true, known: { identity: true, quantity: true }, quantity: 1, location: { kind: 'container' } },
        { objectId: 1002, displayName: 'dagger', semanticName: 'dagger', semanticKnown: true, known: { identity: true, quantity: true }, quantity: 1, location: { kind: 'container' } },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 40));
      const afterOpen = state();
      t.clearSentInputs(); commands.length = 0;

      t.transferContainerItem('left', 'container-object-1001');
      await new Promise((resolve) => setTimeout(resolve, 60));
      const takeOutCommand = commands[commands.length - 1];
      const takeOutTransferId = takeOutCommand?.payload?.transferId || takeOutCommand?.transactionId || '';
      t.event({ name: 'shim_update_inventory', revision: 4001, inventoryRevision: 4001, equipmentRevision: 4001, items: [
        { selector: 99, objectId: 2001, text: 'c - a scroll of identify', quantity: 1, semanticKind: 'object', semanticName: 'scroll of identify', semanticKnown: true },
        { selector: 100, objectId: 1001, text: 'd - a food ration', quantity: 1, semanticKind: 'object', semanticName: 'food ration', semanticKnown: true },
      ] });
      await new Promise((resolve) => setTimeout(resolve, 30));
      const beforeTakeOutCoreConfirmation = state();
      t.event({ name: 'shim_container_transfer_confirmed', transferId: takeOutTransferId, transactionId: takeOutTransferId, direction: 'container-to-inventory', containerId: 42, itemId: 1001, reason: 'container item taken out' });
      await new Promise((resolve) => setTimeout(resolve, 40));
      const afterTakeOut = state();
      t.clearSentInputs(); commands.length = 0;

      const putBackSelector = (t.container().right.find((row) => /food ration/i.test(row.text)) || {}).selector;
      t.transferContainerItem('right', putBackSelector);
      await new Promise((resolve) => setTimeout(resolve, 60));
      const putInCommand = commands[commands.length - 1];
      const putInTransferId = putInCommand?.payload?.transferId || putInCommand?.transactionId || '';
      t.event({ name: 'shim_container_transfer_confirmed', transferId: putInTransferId, transactionId: putInTransferId, direction: 'inventory-to-container', containerId: 42, itemId: 1001, reason: 'inventory item put in container' });
      await new Promise((resolve) => setTimeout(resolve, 40));
      const afterPutIn = state();
      t.clearSentInputs(); commands.length = 0;

      t.refreshTransferPane('left');
      await new Promise((resolve) => setTimeout(resolve, 60));
      const refreshCommand = commands[commands.length - 1];
      snapshotEvent([{ objectId: 1002, displayName: 'dagger', quantity: 1, location: { kind: 'container' } }, { objectId: 1001, displayName: 'food ration', quantity: 1, location: { kind: 'container' } }]);
      await new Promise((resolve) => setTimeout(resolve, 40));
      const afterRefresh = state();
      t.clearSentInputs(); commands.length = 0;

      // Authoritative empty snapshots after a rejection must clear optimistic
      // rows on both sides rather than resurrecting pre-transfer pane data.
      t.setContainerStateForTest({ active:true, sessionKind:'container', phase:'direct-snapshot', prompt:'Open large box', containerId:42, transferSessionId:'container-42-test', leftItems:[{ syntheticSelector:'container-object-1002', displaySelector:'a', text:'dagger', displayName:'dagger', objectId:1002 }], rightItems:[{ selector:99, text:'c - scroll of identify', objectId:2001 }], loadedSides:{left:true,right:true}, loadingSides:{left:false,right:false}, feedback:'Both panes loaded. Drag items between container and inventory.' });
      t.transferContainerItem('right', 'c');
      await new Promise((resolve) => setTimeout(resolve, 50));
      const emptyRollbackCommand = commands[commands.length - 1];
      const emptyRollbackTransferId = emptyRollbackCommand?.payload?.transferId || emptyRollbackCommand?.transactionId || '';
      snapshotEvent([]);
      t.event({ name:'shim_update_inventory', revision:4100, inventoryRevision:4100, equipmentRevision:4100, reason:'authoritative-empty-container-rejection', items:[] });
      t.event({ name:'shim_container_transfer_rejected', transferId:emptyRollbackTransferId, transactionId:emptyRollbackTransferId, sessionId:'container-42-test', direction:'inventory-to-container', containerId:42, itemId:2001, reason:'another input owner won before the transfer started' });
      await new Promise((resolve) => setTimeout(resolve, 80));
      const afterAuthoritativeEmptyRejection = state();
      t.clearSentInputs(); commands.length = 0;

      t.setContainerStateForTest({ active:true, sessionKind:'container', phase:'direct-snapshot', prompt:'Open large box', containerId:42, transferSessionId:'container-42-test', leftItems:[{ syntheticSelector:'container-object-1002', displaySelector:'a', text:'dagger', displayName:'dagger', objectId:1002 }], rightItems:[], loadedSides:{left:true,right:true}, loadingSides:{left:false,right:false}, feedback:'Both panes loaded. Drag items between container and inventory.' });
      t.transferContainerItem('left', 'container-object-1002');
      await new Promise((resolve) => setTimeout(resolve, 5200));
      const afterContainerTimeout = state();
      t.clearSentInputs(); commands.length = 0;

      t.setContainerStateForTest({
        active: true,
        sessionKind: 'container',
        phase: 'direct-snapshot',
        prompt: 'Open large box',
        containerId: 42,
        transferSessionId: 'container-42-test',
        leftItems: [{ syntheticSelector: 'container-object-1002', displaySelector: 'a', text: 'dagger', displayName: 'dagger', objectId: 1002 }],
        rightItems: [{ selector: 99, text: 'c - scroll of identify', objectId: 2001 }],
        loadedSides: { left: true, right: true },
        loadingSides: { left: false, right: false },
        feedback: 'Both panes loaded. Drag items between container and inventory.',
      });
      t.event({ name: 'shim_start_menu', window: 941, owner: { kind: 'inventory' }, menuPurpose: 'inventory.displayInventory' });
      t.event({ name: 'shim_add_menu', window: 941, selector: 99, text: 'c - a scroll of identify', semanticKind: 'object', owner: { kind: 'inventory' }, menuPurpose: 'inventory.displayInventory' });
      t.event({ name: 'shim_end_menu', window: 941, prompt: 'Inventory:', owner: { kind: 'inventory' }, menuPurpose: 'inventory.displayInventory' });
      t.event({ name: 'shim_select_menu', window: 941, how: 1, owner: { kind: 'inventory' }, menuPurpose: 'inventory.displayInventory' });
      t.clearSentInputs(); commands.length = 0;
      t.transferContainerItem('left', 'container-object-1002');
      t.event({ name: 'bridge_menu_answer', window: 941, return: 0 });
      await new Promise((resolve) => setTimeout(resolve, 180));
      const staleInventoryProbeTakeOutCommand = commands[commands.length - 1];
      const afterStaleInventoryProbeDrag = state();
      const staleProbeTransferId = staleInventoryProbeTakeOutCommand?.payload?.transferId || staleInventoryProbeTakeOutCommand?.transactionId || '';
      t.event({ name: 'shim_container_transfer_confirmed', transferId: staleProbeTransferId, transactionId: staleProbeTransferId, direction: 'container-to-inventory', containerId: 42, itemId: 1002, reason: 'container item taken out' });
      await new Promise((resolve) => setTimeout(resolve, 40));
      t.clearSentInputs(); commands.length = 0;

      document.querySelector('#container-transfer-panel .container-transfer-heading button')?.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const afterDone = state();

      t.reset(); t.setRunning(true); commands.length = 0;
      t.setAuthoritativeInventoryForTest([{ selector: 97, objectId: 2001, displayName: 'skeleton key', semanticName: 'skeleton key', quantity: 1, publicClass: 'tool', actionAffordances: ['apply'] }, { selector: 98, objectId: 2002, displayName: 'lock pick', semanticName: 'lock pick', quantity: 1, publicClass: 'tool', actionAffordances: ['apply'] }, { selector: 99, objectId: 2003, displayName: 'credit card', semanticName: 'credit card', quantity: 1, publicClass: 'tool', actionAffordances: ['apply'] }], 5001);
      t.setContainerStateForTest({ active: true, sessionKind: 'container', phase: 'direct-snapshot', prompt: 'Open locked chest', containerId: 42, transferSessionId: 'container-42-locked-test', leftItems: [], rightItems: [{ selector: 97, text: 'stethoscope', objectId: 2001 }], loadedSides: { left: false, right: true }, loadingSides: { left: true, right: false }, feedback: 'Loading container contents from NetHack…' });
      t.event({ name: 'shim_container_snapshot_rejected', commandId: 'container-snapshot-42-locked', transactionId: 'container-42-locked-test', sessionId: 'container-42-locked-test', containerId: 42, status: 'rejected', failureKind: 'locked', reason: 'container is locked' });
      await new Promise((resolve) => setTimeout(resolve, 40));
      const afterLockedReject = state();

      return { commandHashPrompt, noIdMessageOnly, visibleMessagePreservesObjectId, ownershipRejected, openClick, openCommand, afterOpen, takeOutCommand, beforeTakeOutCoreConfirmation, afterTakeOut, putInCommand, afterPutIn, refreshCommand, afterRefresh, emptyRollbackCommand, afterAuthoritativeEmptyRejection, afterContainerTimeout, staleInventoryProbeTakeOutCommand, afterStaleInventoryProbeDrag, afterDone, afterLockedReject, body: document.body.innerText };
    })()`);

    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.clearFailureForTest(); t.setAuthoritativeInventoryForTest([{ selector: 97, objectId: 2001, displayName: 'skeleton key', semanticName: 'skeleton key', quantity: 1, publicClass: 'tool', actionAffordances: ['apply'] }], 5002); t.setContainerStateForTest({ active: true, sessionKind: 'container', phase: 'direct-snapshot', prompt: 'Open locked chest', containerId: 42, transferSessionId: 'container-42-locked-test', leftItems: [], rightItems: [{ selector: 97, text: 'a - a skeleton key', displayName: 'skeleton key', objectId: 2001 }], loadedSides: { left: false, right: true }, loadingSides: { left: true, right: false }, feedback: 'Loading container contents from NetHack…' }); t.event({ name: 'shim_container_snapshot_rejected', commandId: 'container-snapshot-42-locked', transactionId: 'container-42-locked-test', sessionId: 'container-42-locked-test', containerId: 42, status: 'rejected', failureKind: 'locked', reason: 'container is locked' }); t.clearFailureForTest(); })()`);
    const lockedRejectShot = await shot(cdp, 'container-transfer-panel-locked-rejected.png');
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.cancel(); t.setContainerStateForTest({ active: true, sessionKind: 'container', phase: 'direct-snapshot', prompt: 'Open large box', containerId: 42, transferSessionId: 'container-42-test', leftItems: [{ selector: 97, text: 'dagger', objectId: 1002 }, { selector: 98, text: 'food ration', objectId: 1001 }], rightItems: [{ selector: 99, text: 'scroll of identify', objectId: 2001 }], loadedSides: { left: true, right: true }, loadingSides: { left: false, right: false }, feedback: 'Both panes loaded. Drag items between container and inventory.' }); })()`);
    const panelShot = await shot(cdp, 'container-transfer-panel-direct.png');
    await evalExpr(cdp, `(() => { document.querySelector('#container-transfer-panel .container-transfer-heading button')?.click(); })()`);
    await delay(40);
    const doneShot = await shot(cdp, 'container-transfer-panel-done.png');

    assert('locked direct snapshot rejection opens item-specific unlock choices instead of a failed transfer pane', !metrics.afterLockedReject.container.active && metrics.afterLockedReject.dialog?.interactionOpen && /Locked chest actions/i.test(metrics.afterLockedReject.dialog.title || '') && metrics.afterLockedReject.dialog.options?.some((option) => /Unlock with skeleton key/i.test(option.text || '')) && metrics.afterLockedReject.dialog.options?.some((option) => /Unlock with lock pick/i.test(option.text || '')) && metrics.afterLockedReject.dialog.options?.some((option) => /Unlock with credit card/i.test(option.text || '')) && !metrics.afterLockedReject.dialog.options?.some((option) => /Force (?:lock|with)/i.test(option.text || '')) && metrics.afterLockedReject.dialog.options?.some((option) => /Close|Cancel/i.test(option.text || '')) && !/Loading container contents|did not finish opening|normal NetHack flow/i.test(metrics.afterLockedReject.forbidden.body || ''), JSON.stringify({ state: metrics.afterLockedReject }));
    assert('visible Command # button opens the player-owned command palette', metrics.commandHashPrompt.sent === '#' && metrics.commandHashPrompt.paletteOpen && /Command #|Extended command/i.test(metrics.commandHashPrompt.dialog.title || ''), JSON.stringify(metrics.commandHashPrompt));
    assert('message-only current-square container without a public object id does not expose misleading Open chest', !metrics.noIdMessageOnly.actions?.buttons?.some((button) => button.id === 'open-container') && !metrics.noIdMessageOnly.clicked.clicked && metrics.noIdMessageOnly.sent === '', JSON.stringify(metrics.noIdMessageOnly));
    assert('input-ownership rejection closes the pending panel instead of leaving a loading transfer surface', !metrics.ownershipRejected.container.active && metrics.ownershipRejected.container.hidden && !/Loading container contents/i.test(metrics.ownershipRejected.container.text || '') && /Finish the current NetHack choice/i.test(metrics.ownershipRejected.status || ''), JSON.stringify(metrics.ownershipRejected));
    assert('visible ground prose preserves an existing public container object id for direct open', metrics.visibleMessagePreservesObjectId.ground?.piles?.some((pile) => (pile.items || []).some((item) => item.objectId === 42 && (item.actionAffordances || []).includes('container'))) && metrics.visibleMessagePreservesObjectId.actions?.buttons?.some((button) => button.id === 'open-container' && /Open box/i.test(button.text || '')), JSON.stringify(metrics.visibleMessagePreservesObjectId));
    assert('context open dispatches typed container.snapshot, not text input', metrics.openClick.clicked && metrics.openCommand?.commandType === 'container.snapshot' && metrics.openCommand?.payload?.containerId === 42 && metrics.afterOpen.sent === '', JSON.stringify({ openClick: metrics.openClick, openCommand: metrics.openCommand, afterOpen: metrics.afterOpen }));
    assert('opened panel is hydrated from container.contents.snapshot with no Extended-command modal', metrics.afterOpen.container.active && metrics.afterOpen.container.left.length === 2 && metrics.afterOpen.forbidden.ok, JSON.stringify(metrics.afterOpen));
    assert('container-to-inventory dispatches a schema-valid typed container.transfer only', metrics.takeOutCommand?.commandType === 'container.transfer' && metrics.takeOutCommand?.payload?.direction === 'container-to-inventory' && metrics.takeOutCommand?.payload?.containerId === 42 && metrics.takeOutCommand?.payload?.itemId === 1001 && metrics.takeOutCommand?.payload?.item?.targetLocation == null && metrics.afterTakeOut.sent === '' && metrics.afterTakeOut.forbidden.ok, JSON.stringify({ command: metrics.takeOutCommand, state: metrics.afterTakeOut }));
    assert('incidental inventory snapshots do not clear direct container ownership before core confirmation', metrics.beforeTakeOutCoreConfirmation.container.directTransferPendingId === metrics.takeOutCommand?.transactionId && metrics.beforeTakeOutCoreConfirmation.container.directTransferPendingId && metrics.beforeTakeOutCoreConfirmation.forbidden.ok, JSON.stringify(metrics.beforeTakeOutCoreConfirmation));
    assert('inventory-to-container dispatches a schema-valid typed container.transfer only', metrics.putInCommand?.commandType === 'container.transfer' && metrics.putInCommand?.payload?.direction === 'inventory-to-container' && metrics.putInCommand?.payload?.containerId === 42 && metrics.putInCommand?.payload?.itemId === 1001 && metrics.putInCommand?.payload?.item?.targetLocation == null && metrics.afterPutIn.sent === '' && metrics.afterPutIn.forbidden.ok, JSON.stringify({ command: metrics.putInCommand, state: metrics.afterPutIn }));
    assert('pane refresh dispatches typed container.snapshot only', metrics.refreshCommand?.commandType === 'container.snapshot' && metrics.refreshCommand?.payload?.containerId === 42 && metrics.afterRefresh.sent === '' && metrics.afterRefresh.forbidden.ok, JSON.stringify({ command: metrics.refreshCommand, state: metrics.afterRefresh }));
    assert('authoritative empty rejection clears both container panes instead of restoring optimistic rows', metrics.emptyRollbackCommand?.commandType === 'container.transfer' && metrics.afterAuthoritativeEmptyRejection.container.left.length === 0 && metrics.afterAuthoritativeEmptyRejection.container.right.length === 0 && !metrics.afterAuthoritativeEmptyRejection.container.directTransferPendingId, JSON.stringify(metrics.afterAuthoritativeEmptyRejection));
    assert('lost direct container result times out without leaving a ghost transfer lock', !metrics.afterContainerTimeout.container.directTransferPendingId && !metrics.afterContainerTimeout.container.pendingTransfer && /timed out waiting for the NetHack transfer result/i.test(metrics.afterContainerTimeout.container.text), JSON.stringify(metrics.afterContainerTimeout));
    assert('container-to-inventory drag closes a stale inventory probe and dispatches direct transfer without waiting for a later reload', metrics.staleInventoryProbeTakeOutCommand?.commandType === 'container.transfer' && metrics.staleInventoryProbeTakeOutCommand?.payload?.direction === 'container-to-inventory' && metrics.staleInventoryProbeTakeOutCommand?.payload?.itemId === 1002 && metrics.staleInventoryProbeTakeOutCommand?.payload?.transferId && metrics.staleInventoryProbeTakeOutCommand?.transactionId && metrics.afterStaleInventoryProbeDrag.sent === '\u001b' && metrics.afterStaleInventoryProbeDrag.forbidden.ok, JSON.stringify({ command: metrics.staleInventoryProbeTakeOutCommand, state: metrics.afterStaleInventoryProbeDrag }));
    assert('Done closes the panel once without #loot or Extended-command modal', !metrics.afterDone.container.active && metrics.afterDone.container.hidden && (metrics.afterDone.sent === '\u001b' || metrics.afterDone.sent === '') && metrics.afterDone.forbidden.ok, JSON.stringify(metrics.afterDone));

    const evidenceMetrics = JSON.parse(JSON.stringify(metrics));
    evidenceMetrics.commandHashPrompt = { sent: metrics.commandHashPrompt.sent, dialog: { interactionOpen: Boolean(metrics.commandHashPrompt.dialog?.interactionOpen), title: metrics.commandHashPrompt.dialog?.title || '', prompt: metrics.commandHashPrompt.dialog?.prompt || '' } };
    fs.writeFileSync(path.join(outDir, 'direct-no-loot-state.json'), JSON.stringify(evidenceMetrics, null, 2));
    fs.writeFileSync(path.join(outDir, 'summary.md'), `# Container transfer panel direct route test\n\nPASS\n\nLocked rejection screenshot: ${lockedRejectShot}\nPanel screenshot: ${panelShot}\nDone screenshot: ${doneShot}\nState: ${path.join(outDir, 'direct-no-loot-state.json')}\n\nVerified normal open, locked direct-snapshot rejection, container-to-inventory, inventory-to-container, refresh, and Done/close used typed container snapshot/transfer commands with no forbidden classic-route tokens and no visible Extended-command modal.\n`);
    console.log(`container-transfer-panel-test PASS (${panelShot})`);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
