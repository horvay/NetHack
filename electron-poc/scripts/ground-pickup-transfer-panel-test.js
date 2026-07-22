const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'ground-pickup-transfer-panel');
const port = Number(process.env.NH_GROUND_PICKUP_PANEL_CDP_PORT || 9501);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 100) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1320', NH_ELECTRON_WINDOW_HEIGHT: '880' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup); child.stdout.on('data', (d) => process.stdout.write(d)); child.stderr.on('data', (d) => process.stderr.write(d));
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1320, height: 880, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "document.readyState === 'complete' && !!window.__nethackPromptTest" })).result.value, 10000);

    const metrics = await evalExpr(cdp, `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const t = window.__nethackPromptTest;
      t.reset(); t.setRunning(true); t.setCursor(12, 8);
      window.__groundTransferCommands = [];
      t.setUiCommandHandlerForTest((command) => { window.__groundTransferCommands.push(JSON.parse(JSON.stringify(command))); return { ok:true, commandId: command.commandId, transactionId: command.transactionId, commandType: command.commandType, bridgeType: 'ground-transfer' }; });
      t.event({name:'shim_update_inventory', revision:3100, inventoryRevision:3100, equipmentRevision:1, reason:'direct-ground-test', items:[
        { selector:97, objectId:501, text:'a - a +0 spear', displayName:'a +0 spear', quantity:1, glyphChar:41, publicClass:'weapon', semanticKind:'object', semanticName:'spear', semanticKnown:true, knownFields:{enchantment:0}, actionAffordances:['drop'] },
        { selector:98, objectId:502, text:'b - a food ration', displayName:'a food ration', quantity:1, glyphChar:37, publicClass:'food', semanticKind:'object', semanticName:'food ration', semanticKnown:true, actionAffordances:['eat','drop'] }
      ]});
      t.setGroundPileSnapshotForTest([
        { objectId:145, displayName:'a cream pie', quantity:1, semanticKind:'object', semanticName:'cream pie', actionAffordances:['pickup'] },
        { objectId:133, displayName:'a lichen corpse', quantity:1, semanticKind:'object', semanticName:'lichen', actionAffordances:['pickup'] }
      ], { x:12, y:8 });
      t.clearSentInputs();
      const reportGroundPile = (window) => {
        t.event({ name:'shim_create_nhwindow', return:window, windowType:4 });
        t.event({ name:'shim_putstr', window, text:'There is a staircase up out of the dungeon here.' });
        t.event({ name:'shim_putstr', window, text:'Things that are here:' });
        t.event({ name:'shim_putstr', window, text:'a cream pie' });
        t.event({ name:'shim_putstr', window, text:'a lichen corpse' });
        t.event({ name:'shim_display_nhwindow', window, blocking:1 });
      };
      reportGroundPile(610);
      await sleep(80);
      const passive = {
        container:t.container(),
        dialogs:Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
        actions:t.contextActions(),
        sent:t.sentInputs().join(''),
        status:document.getElementById('status')?.textContent || '',
      };
      document.querySelector('#context-action-bar button[data-context-action-id="pickup"]')?.click();
      await sleep(80);
      const firstExplicitOpen = t.container();
      const firstExplicitPanel = document.getElementById('container-transfer-panel');
      const firstExplicitRect = firstExplicitPanel?.getBoundingClientRect();
      const firstExplicitLayout = firstExplicitRect ? {
        centerDeltaX: firstExplicitRect.left + (firstExplicitRect.width / 2) - (innerWidth / 2),
        centerDeltaY: firstExplicitRect.top + (firstExplicitRect.height / 2) - (innerHeight / 2),
        contained: firstExplicitRect.left >= 0 && firstExplicitRect.right <= innerWidth && firstExplicitRect.top >= 0 && firstExplicitRect.bottom <= innerHeight,
        animationName: getComputedStyle(firstExplicitPanel).animationName,
      } : null;
      document.querySelector('#container-transfer-panel .container-transfer-heading button')?.click();
      await sleep(80);
      const cancelled = { container:t.container(), sent:t.sentInputs().join('') };
      t.setCursor(13, 8);
      t.setCursor(12, 8);
      reportGroundPile(611);
      await sleep(80);
      const afterMovementRedraw = {
        container:t.container(),
        dialogs:Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
        sent:t.sentInputs().join(''),
      };
      t.setGroundPileSnapshotForTest([
        { objectId:145, displayName:'a cream pie', quantity:1, glyphChar:37, objectClass:'%', publicClass:'food', semanticKind:'object', semanticName:'cream pie', semanticKnown:true, actionAffordances:['pickup'] },
        { objectId:133, displayName:'a lichen corpse', quantity:1, glyphChar:37, objectClass:'%', publicClass:'food', semanticKind:'corpse', semanticName:'lichen', semanticKnown:true, actionAffordances:['pickup'] }
      ], { x:12, y:8 });
      document.querySelector('#context-action-bar button[data-context-action-id="pickup"]')?.click();
      await sleep(80);
      const opened = t.container();
      const sentAfterOpen = t.sentInputs().join('');
      document.querySelector('#container-transfer-panel [data-container-pane="left"] .container-item-row')?.dispatchEvent(new MouseEvent('dblclick', { bubbles:true }));
      await sleep(80);
      const afterPickupCommand = window.__groundTransferCommands.at(-1);
      t.event({name:'shim_update_inventory', revision:3101, inventoryRevision:3101, equipmentRevision:2, reason:'pre-direct-confirmation', items:[
        { selector:97, objectId:501, text:'a - a +0 spear', displayName:'a +0 spear', quantity:1, glyphChar:41, publicClass:'weapon', semanticKind:'object', semanticName:'spear', semanticKnown:true, knownFields:{enchantment:0}, actionAffordances:['drop'] },
        { selector:98, objectId:502, text:'b - a food ration', displayName:'a food ration', quantity:1, glyphChar:37, publicClass:'food', semanticKind:'object', semanticName:'food ration', semanticKnown:true, actionAffordances:['eat','drop'] }
      ]});
      await sleep(40);
      const beforeCoreConfirmation = { container:t.container(), transfers:t.transferTransactions() };
      t.event({ name:'shim_ground_transfer_confirmed', transferId: afterPickupCommand?.transactionId || '', transactionId: afterPickupCommand?.transactionId || '', itemId:145, direction:'ground-to-inventory', coord:{x:12,y:8}, reason:'ground item picked up' });
      t.setGroundPileSnapshotForTest([{ objectId:133, displayName:'a lichen corpse', quantity:1, semanticKind:'object', semanticName:'lichen', actionAffordances:['pickup'] }], { x:12, y:8 });
      const afterPickup = t.container();
      document.querySelector('#container-transfer-panel [data-container-pane="right"] .container-item-row[data-item-name*="spear"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles:true }));
      await sleep(120);
      const afterDropCommand = window.__groundTransferCommands.at(-1);
      t.event({ name:'shim_ground_transfer_confirmed', transferId: afterDropCommand?.transactionId || '', transactionId: afterDropCommand?.transactionId || '', itemId:501, direction:'inventory-to-ground', coord:{x:12,y:8}, reason:'inventory item dropped' });
      t.setGroundPileSnapshotForTest([
        { objectId:133, displayName:'a lichen corpse', quantity:1, semanticKind:'object', semanticName:'lichen', actionAffordances:['pickup'] },
        { objectId:501, displayName:'a +0 spear', quantity:1, semanticKind:'object', semanticName:'spear', actionAffordances:['pickup'] }
      ], { x:12, y:8 });
      const afterDrop = t.container();
      t.setGroundPileSnapshotForTest([
        { objectId:701, displayName:'an uncursed +1 dagger', quantity:1, glyphChar:42 + 1, objectClass:')', publicClass:'weapon', semanticKind:'object', semanticName:'dagger', semanticKnown:true, knownFields:{beatitude:'uncursed', enchantment:1}, actionAffordances:['pickup'] },
        { objectId:702, displayName:'red', quantity:1, glyphChar:42, objectClass:'*', publicClass:'gem', semanticKind:'object', semanticKnown:false, semanticAppearance:'red', known:{identity:false, appearance:true}, actionAffordances:['pickup'] }
      ], { x:12, y:8 });
      await sleep(80);
      const richRows = () => Array.from(document.querySelectorAll('#container-transfer-panel [data-container-pane="left"] .container-item-row')).map((row) => ({
        selector: row.dataset.selector,
        shortcut: row.dataset.shortcut,
        checked: row.getAttribute('aria-checked'),
        text: row.innerText,
        tileId: row.querySelector('.menu-tile')?.dataset.tileId || '',
        badges: Array.from(row.querySelectorAll('.item-badge')).map((badge) => badge.textContent.trim()),
      }));
      const batchBefore = { rows:richRows(), text:document.getElementById('container-transfer-panel')?.innerText || '', takeAll:document.querySelector('[data-take-all-ground]')?.textContent || '', selectedAction:{ text:document.querySelector('[data-transfer-selected]')?.innerText || '', disabled:Boolean(document.querySelector('[data-transfer-selected]')?.disabled) } };
      const panel = document.getElementById('container-transfer-panel');
      panel.querySelector('[data-container-pane="left"] .container-item-row')?.focus();
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key:'a', bubbles:true }));
      await sleep(30);
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key:'b', bubbles:true }));
      await sleep(30);
      const batchSelected = { rows:richRows(), action:{ text:document.querySelector('[data-transfer-selected]')?.innerText || '', disabled:Boolean(document.querySelector('[data-transfer-selected]')?.disabled) }, count:document.querySelector('.container-transfer-selected-count')?.textContent || '' };
      const batchCommandStart = window.__groundTransferCommands.length;
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true }));
      await sleep(60);
      const batchFirstCommand = window.__groundTransferCommands[batchCommandStart];
      t.event({ name:'shim_ground_transfer_confirmed', transferId:batchFirstCommand?.transactionId || '', transactionId:batchFirstCommand?.transactionId || '', itemId:701, direction:'ground-to-inventory', coord:{x:12,y:8}, reason:'first selected item picked up' });
      await sleep(80);
      const batchSecondCommand = window.__groundTransferCommands[batchCommandStart + 1];
      t.event({ name:'shim_ground_transfer_confirmed', transferId:batchSecondCommand?.transactionId || '', transactionId:batchSecondCommand?.transactionId || '', itemId:702, direction:'ground-to-inventory', coord:{x:12,y:8}, reason:'second selected item picked up' });
      await sleep(220);
      const batchAfter = t.container();
      t.setGroundPileSnapshotForTest([
        { objectId:703, displayName:'a dart', quantity:1, glyphChar:41, objectClass:')', publicClass:'weapon', semanticKind:'object', semanticName:'dart', semanticKnown:true, actionAffordances:['pickup'] },
        { objectId:704, displayName:'a food ration', quantity:1, glyphChar:37, objectClass:'%', publicClass:'food', semanticKind:'object', semanticName:'food ration', semanticKnown:true, actionAffordances:['pickup'] }
      ], { x:12, y:8 });
      await sleep(60);
      if (batchAfter.hidden) document.querySelector('#context-action-bar button[data-context-action-id="pickup"]')?.click();
      await sleep(60);
      const takeAllCommandStart = window.__groundTransferCommands.length;
      document.querySelector('[data-take-all-ground]')?.click();
      await sleep(60);
      const takeAllCommand = window.__groundTransferCommands[takeAllCommandStart];
      const takeAllState = { rows:richRows(), container:t.container() };
      return { passive, firstExplicitOpen, firstExplicitLayout, cancelled, afterMovementRedraw, opened, sentAfterOpen, beforeCoreConfirmation, afterPickupCommand, afterDropCommand, afterPickup, afterDrop, batchBefore, batchSelected, batchFirstCommand, batchSecondCommand, batchAfter, takeAllCommand, takeAllState, sent: t.sentInputs().join(''), commands: window.__groundTransferCommands, transfers: t.transferTransactions(), ground: t.groundSnapshots(), body: document.body.innerText };
    })()`);
    assert('passive multi-item ground report does not open pickup UI or send input', !metrics.passive.container.active && metrics.passive.dialogs.length === 0 && metrics.passive.sent === '', JSON.stringify(metrics.passive));
    assert('passive ground evidence keeps the visible Pickup action available', metrics.passive.actions?.buttons?.some((button) => button.id === 'pickup') && /use Pick up or comma/i.test(metrics.passive.status), JSON.stringify(metrics.passive));
    assert('visible Pickup button explicitly opens the snapshot-backed ground panel', metrics.firstExplicitOpen.active && /Pick up from ground/i.test(metrics.firstExplicitOpen.text), JSON.stringify(metrics.firstExplicitOpen));
    assert('pickup panel remains centered and viewport-contained throughout its entrance animation', metrics.firstExplicitLayout && Math.abs(metrics.firstExplicitLayout.centerDeltaX) <= 1 && Math.abs(metrics.firstExplicitLayout.centerDeltaY) <= 1 && metrics.firstExplicitLayout.contained && metrics.firstExplicitLayout.animationName === 'ux-motion-enter-centered-scale', JSON.stringify(metrics.firstExplicitLayout));
    assert('cancel followed by ordinary movement/redraw does not reopen pickup UI', !metrics.cancelled.container.active && !metrics.afterMovementRedraw.container.active && metrics.afterMovementRedraw.dialogs.length === 0 && metrics.afterMovementRedraw.sent === '', JSON.stringify({ cancelled:metrics.cancelled, afterMovementRedraw:metrics.afterMovementRedraw }));
    assert('explicit reopen hydrates the panel without comma', metrics.opened.active && metrics.sentAfterOpen === '', JSON.stringify(metrics));
    assert('explicit panel rows retain authoritative public IDs', metrics.opened.left.some((row) => row.selector === 'ground-object-145' && /cream pie/i.test(row.text)) && metrics.opened.left.some((row) => row.selector === 'ground-object-133' && /lichen corpse/i.test(row.text)), JSON.stringify(metrics.opened.left));
    assert('panel shows meaningful ground and inventory rows', /cream pie|lichen corpse/i.test(metrics.opened.text) && /spear|food ration/i.test(metrics.opened.text) && !/Inventory selector/i.test(metrics.opened.text), metrics.opened.text);
    assert('Enter submits every selected ground item and closes the panel after the last pickup', metrics.batchFirstCommand?.payload?.itemId === 701 && metrics.batchSecondCommand?.payload?.itemId === 702 && !metrics.batchAfter.active && metrics.batchAfter.hidden, JSON.stringify({ first:metrics.batchFirstCommand, second:metrics.batchSecondCommand, after:metrics.batchAfter }));
    assert('ground-to-inventory emits direct ground.transfer only on the first drag', metrics.afterPickupCommand?.commandType === 'ground.transfer' && metrics.afterPickupCommand.payload?.direction === 'ground-to-inventory' && metrics.afterPickupCommand.payload?.itemId === 145 && metrics.afterPickupCommand.payload?.count === 'all', JSON.stringify(metrics.afterPickupCommand));
    assert('an incidental inventory snapshot cannot complete a direct transfer before core confirmation', metrics.beforeCoreConfirmation.container.pendingTransferId === metrics.afterPickupCommand?.transactionId && metrics.beforeCoreConfirmation.transfers?.transfers?.some((tx) => tx.transferId === metrics.afterPickupCommand?.transactionId && tx.status === 'pending'), JSON.stringify(metrics.beforeCoreConfirmation));
    assert('inventory-to-ground emits direct ground.transfer only', metrics.afterDropCommand?.commandType === 'ground.transfer' && metrics.afterDropCommand.payload?.direction === 'inventory-to-ground' && metrics.afterDropCommand.payload?.itemId === 501 && metrics.afterDropCommand.payload?.count === 'all', JSON.stringify(metrics.afterDropCommand));
    assert('no hidden pickup/drop key choreography was sent', !/[,]|d[a-zA-Z]/.test(metrics.sent || ''), JSON.stringify(metrics.sent));
    assert('shared transfer model records direct successes', metrics.transfers?.transfers?.some((tx) => tx.direction === 'ground-to-inventory' && tx.status === 'success') && metrics.transfers?.transfers?.some((tx) => tx.direction === 'inventory-to-ground' && tx.status === 'success'), JSON.stringify((metrics.transfers?.transfers || []).map((tx) => ({ transferId:tx.transferId, direction:tx.direction, status:tx.status, sessionId:tx.sessionId }))));
    assert('ground rows use inventory-grade art, class and known-state badges', metrics.batchBefore.rows.every((row) => row.tileId) && metrics.batchBefore.rows.some((row) => /dagger/i.test(row.text) && row.badges.includes('weapon') && row.badges.includes('uncursed') && row.badges.includes('+1')), JSON.stringify(metrics.batchBefore));
    assert('unidentified appearance includes its public class noun', metrics.batchBefore.rows.some((row) => /red gem/i.test(row.text) && row.badges.includes('gem')) && !metrics.batchBefore.rows.some((row) => /^\s*(?:☐|☑)?\s*b\s*red\s*$/i.test(row.text)), JSON.stringify(metrics.batchBefore.rows));
    assert('ground rows expose letter shortcuts, unmistakable checkbox state, and a visible completion action', metrics.batchBefore.rows.map((row) => row.shortcut).join('') === 'ab' && metrics.batchBefore.selectedAction.disabled && metrics.batchSelected.rows.every((row) => row.checked === 'true' && /☑|Selected/i.test(row.text)) && !metrics.batchSelected.action.disabled && /Take 2 selected\s*Enter/i.test(metrics.batchSelected.action.text) && metrics.batchSelected.count === '2 selected', JSON.stringify({ before:metrics.batchBefore, selected:metrics.batchSelected }));
    assert('Pick up all is visible and starts a complete ground selection batch', /^Pick up all \(2\)$/.test(metrics.batchBefore.takeAll) && metrics.takeAllCommand?.payload?.itemId === 703 && metrics.takeAllState.rows.every((row) => row.checked === 'true' || row.selector === 'ground-object-703'), JSON.stringify({ command:metrics.takeAllCommand, state:metrics.takeAllState }));
    fs.writeFileSync(path.join(outDir, 'summary.md'), `# Ground direct transfer panel test\n\nPASS\n\nCommands: ${JSON.stringify(metrics.commands, null, 2)}\n\nTransfers: ${JSON.stringify(metrics.transfers, null, 2)}\n\nGround: ${JSON.stringify(metrics.ground, null, 2)}\n`);
    console.log('ground-pickup-transfer-panel-test PASS');
  } finally { cleanup(); }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
