const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_ESCAPE_POPUP_OUT_DIR || path.join(root, 'test-output', 'escape-popup-coverage');
const port = Number(process.env.NH_ESCAPE_POPUP_CDP_PORT || 9518);
const width = Number(process.env.NH_ESCAPE_POPUP_WIDTH || 1360);
const height = Number(process.env.NH_ESCAPE_POPUP_HEIGHT || 920);

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 100) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function pressEscape(cdp) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await delay(80);
}
async function click(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await delay(80);
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function uiState(cdp) { return evalExpr(cdp, `(() => ({
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
  activeId: document.activeElement?.id || '',
  activeText: document.activeElement?.textContent || '',
  status: document.getElementById('status')?.textContent || '',
  contextMenuOpen: Boolean(document.querySelector('.inventory-context-menu')),
  dialog: window.__nethackPromptTest?.dialog?.() || {},
  prompt: window.__nethackPromptTest?.prompt?.() || null,
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  container: window.__nethackPromptTest?.container?.() || {},
  body: document.body.innerText,
}))()`); }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; const stdout = []; const stderr = [];
  child.stdout.on('data', (d) => stdout.push(String(d))); child.stderr.on('data', (d) => stderr.push(String(d)));
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  const results = { outDir, screenshots: {}, checks: {} };
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    const stableDialogClasses = await evalExpr(cdp, `(() => ({
      interaction: document.getElementById('interaction-dialog')?.classList.contains('interaction-dialog') || false,
      document: document.getElementById('document-dialog')?.classList.contains('document-dialog') || false,
      gameOver: document.getElementById('game-over-dialog')?.classList.contains('game-over-dialog') || false,
      action: document.getElementById('action-dialog')?.classList.contains('action-dialog') || false,
      character: document.getElementById('character-dialog')?.classList.contains('character-dialog') || false,
      intro: document.getElementById('intro-dialog')?.classList.contains('intro-dialog') || false,
    }))()`);
    results.checks.stableDialogClasses = Object.values(stableDialogClasses).every(Boolean);

    // With no overlay, Escape remains a normal NetHack cancellation key and is
    // forwarded exactly once.
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.reset(); t.setRunning(true); t.clearSentInputs(); document.getElementById('game-grid')?.focus(); })()`);
    await pressEscape(cdp);
    const noOverlayAfterEsc = await uiState(cdp);
    results.checks.noOverlayEscapeReachedGameExactlyOnce = noOverlayAfterEsc.sent === '\u001b';

    // A real NetHack direction question is not a renderer modal; Escape still
    // follows the prompt input path exactly once.
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.reset(); t.setRunning(true); t.event({name:'shim_yn_function', query:'In what direction?', choices:'hjklyubn.\\u001b', requestId:'direction-escape'}); t.clearSentInputs(); document.getElementById('game-grid')?.focus(); })()`);
    await pressEscape(cdp);
    const directionAfterEsc = await uiState(cdp);
    results.checks.directionPromptEscapeReachedGameExactlyOnce = directionAfterEsc.sent === '\u001b' && !directionAfterEsc.dialogs.includes('interaction-dialog');

    // Generic interaction prompt / quit confirmation: Escape sends NetHack cancel and closes the renderer modal.
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.reset(); t.setRunning(true); t.event({name:'shim_yn_function', query:'Really quit?', choices:'yn\\u001b', requestId:'quit-esc'}); })()`);
    await waitFor(async () => (await uiState(cdp)).dialogs.includes('interaction-dialog'));
    results.screenshots.quitPromptBeforeEsc = await shot(cdp, '01-quit-confirmation-before-escape.png');
    await pressEscape(cdp);
    const quitAfter = await waitFor(async () => { const s = await uiState(cdp); return !s.dialogs.includes('interaction-dialog') ? s : null; });
    results.screenshots.quitPromptAfterEsc = await shot(cdp, '02-quit-confirmation-after-escape.png');
    results.checks.quitPromptEscapeSentCancel = /\u001b/.test(JSON.stringify(quitAfter.sent)) || quitAfter.sent.includes('\u001b');
    results.checks.quitPromptClosed = !quitAfter.dialogs.includes('interaction-dialog') && !quitAfter.prompt;

    // Inventory/equipment overlay: Escape closes the paper-doll inventory and cancels the backing NetHack menu.
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.reset(); t.setRunning(true); t.event({name:'shim_start_menu', window:810}); [['a','a - a +1 long sword (weapon in hand)'], ['b','b - an uncursed food ration'], ['c','c - a wand of digging (0:3)']].forEach(([key,text]) => t.event({name:'shim_add_menu', window:810, selector:key.charCodeAt(0), text, glyphChar:41, semanticKind:'object'})); t.event({name:'shim_end_menu', window:810, prompt:'Inventory:'}); t.event({name:'shim_select_menu', window:810, how:0}); t.clearSentInputs(); })()`);
    await waitFor(async () => { const s = await uiState(cdp); return s.dialogs.includes('interaction-dialog') && /Equipment/.test(s.dialog.title) ? s : null; });
    results.screenshots.equipmentBeforeEsc = await shot(cdp, '03-equipment-overlay-before-escape.png');
    await pressEscape(cdp);
    const equipmentAfter = await waitFor(async () => { const s = await uiState(cdp); return !s.dialogs.includes('interaction-dialog') ? s : null; });
    results.screenshots.equipmentAfterEsc = await shot(cdp, '04-equipment-overlay-after-escape.png');
    results.checks.equipmentOverlayClosed = !equipmentAfter.dialogs.includes('interaction-dialog');
    results.checks.equipmentOverlaySentCancel = equipmentAfter.sent.includes('\u001b');

    // Item context menu: Escape closes only the context menu, leaving its owning equipment overlay open.
    await delay(950);
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.reset(); t.setRunning(true); t.event({name:'shim_start_menu', window:811}); [['a','a - a +1 long sword (weapon in hand)'], ['b','b - an uncursed food ration']].forEach(([key,text]) => t.event({name:'shim_add_menu', window:811, selector:key.charCodeAt(0), text, glyphChar:41, semanticKind:'object'})); t.event({name:'shim_end_menu', window:811, prompt:'Inventory:'}); t.event({name:'shim_select_menu', window:811, how:0}); })()`);
    await waitFor(async () => { const s = await uiState(cdp); return s.dialogs.includes('interaction-dialog') && /Equipment/.test(s.dialog.title || '') ? s : null; });
    await evalExpr(cdp, `(() => { const row = document.querySelector('#interaction-options .choice-button'); const rect = row?.getBoundingClientRect?.(); row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles:true, cancelable:true, clientX:(rect?.left || 40) + 20, clientY:(rect?.top || 40) + 20 })); })()`);
    await waitFor(async () => { const s = await uiState(cdp); return s.contextMenuOpen && s.dialogs.includes('interaction-dialog') ? s : null; });
    results.screenshots.contextMenuBeforeEsc = await shot(cdp, '05-item-context-menu-before-escape.png');
    await pressEscape(cdp);
    const contextAfter = await waitFor(async () => { const s = await uiState(cdp); return !s.contextMenuOpen ? s : null; });
    results.screenshots.contextMenuAfterEsc = await shot(cdp, '06-item-context-menu-after-escape.png');
    results.checks.contextMenuClosed = !contextAfter.contextMenuOpen;
    results.checks.contextMenuDidNotCloseOwner = contextAfter.dialogs.includes('interaction-dialog') && /Equipment/.test(contextAfter.dialog.title || '');

    // Container transfer panel: Escape is equivalent to Done and sends a safe NetHack cancel for the backing menu.
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.reset(); t.setRunning(true); t.setContainerStateForTest({ active:true, sessionKind:'container', phase:'action', prompt:'Do what with the large box?', actionMenu:{ prompt:'Do what with the large box?', items:[{selector:111, text:'take something out'}], awaitingSelection:true, how:1 }, leftItems:[{selector:97, text:'a - an uncursed food ration', semanticKind:'object'}], rightItems:[{selector:98, text:'b - a scroll of identify', semanticKind:'object'}], loadedSides:{left:true,right:true}, loadingSides:{left:false,right:false}, feedback:'Both panes loaded. Drag items between container and inventory.' }); t.clearSentInputs(); document.getElementById('game-grid')?.focus(); })()`);
    await waitFor(async () => { const s = await uiState(cdp); return s.container.active && !s.container.hidden ? s : null; });
    results.screenshots.containerBeforeEsc = await shot(cdp, '07-container-transfer-before-escape.png');
    await pressEscape(cdp);
    const containerAfter = await waitFor(async () => { const s = await uiState(cdp); return s.container.hidden ? s : null; });
    results.screenshots.containerAfterEsc = await shot(cdp, '08-container-transfer-after-escape.png');
    results.checks.containerPanelClosed = containerAfter.container.hidden && !containerAfter.container.active;
    results.checks.containerPanelSentCancel = containerAfter.sent.includes('\u001b');

    // Boss regression: the direct ground-transfer overlay is intentionally a
    // passive input owner, but Escape must still invoke its visible Done action
    // without forwarding Escape to the dungeon. Focus and drag styling should
    // not change that routing.
    const groundDragSetup = await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.reset(); t.setRunning(true); t.setContainerStateForTest({ active:true, sessionKind:'ground-pickup', phase:'ground-snapshot', prompt:'Ground items', leftItems:[{selector:97, text:'a - a runed dagger', semanticKind:'object'}], rightItems:[{selector:98, text:'b - a food ration', semanticKind:'object'}], loadedSides:{left:true,right:true}, feedback:'Drag a ground row to Your inventory to pick it up.' }); t.clearSentInputs(); const row = document.querySelector('.container-item-row'); const pane = document.querySelector('.container-pane.right-pane'); row?.focus(); const transfer = new DataTransfer(); row?.dispatchEvent(new DragEvent('dragstart', { bubbles:true, cancelable:true, dataTransfer:transfer })); pane?.dispatchEvent(new DragEvent('dragover', { bubbles:true, cancelable:true, dataTransfer:transfer })); return { dragging:row?.classList.contains('dragging'), dragOver:pane?.classList.contains('drag-over'), payload:transfer.getData('application/x-nethack-container-transfer') }; })()`);
    const groundBefore = await waitFor(async () => { const s = await uiState(cdp); return s.container.active && !s.container.hidden ? s : null; });
    results.screenshots.groundBeforeEsc = await shot(cdp, '08b-ground-transfer-before-escape.png');
    await pressEscape(cdp);
    const groundAfter = await waitFor(async () => { const s = await uiState(cdp); return s.container.hidden ? s : null; });
    results.screenshots.groundAfterEsc = await shot(cdp, '08c-ground-transfer-after-escape.png');
    results.checks.groundTransferDragActivated = Boolean(groundDragSetup?.dragging && groundDragSetup?.dragOver && groundDragSetup?.payload);
    results.checks.groundTransferClosed = groundAfter.container.hidden && !groundAfter.container.active;
    results.checks.groundTransferEscapeDidNotReachGame = groundAfter.sent === '';
    results.checks.groundTransferDragStateCleared = !(await evalExpr(cdp, `Boolean(document.querySelector('.dragging, .drag-over'))`));

    // Three nested owners: a native Actions modal is above a body-owned ground
    // item context menu, which is above the passive ground panel. Each distinct
    // Escape closes one visible layer; a held repeat closes nothing extra.
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.setContainerStateForTest({ active:true, sessionKind:'ground-pickup', phase:'ground-snapshot', prompt:'Ground items', leftItems:[{selector:97, text:'a - a runed dagger', semanticKind:'object'}], rightItems:[{selector:98, text:'b - a food ration', semanticKind:'object'}], loadedSides:{left:true,right:true}, feedback:'Drag a ground row to Your inventory to pick it up.' }); t.clearSentInputs(); const row = document.querySelector('.container-pane.left-pane .container-item-row'); const rect = row?.getBoundingClientRect?.(); row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles:true, cancelable:true, clientX:(rect?.left || 40) + 20, clientY:(rect?.top || 40) + 20 })); document.getElementById('open-actions')?.click(); })()`);
    await waitFor(async () => { const s = await uiState(cdp); return s.container.active && s.contextMenuOpen && s.dialogs.includes('action-dialog') ? s : null; });
    results.screenshots.nestedBeforeEsc = await shot(cdp, '08d-nested-actions-over-ground-before-escape.png');
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    const nestedAfterFirst = await waitFor(async () => { const s = await uiState(cdp); return !s.dialogs.includes('action-dialog') && s.contextMenuOpen && s.container.active && !s.container.hidden ? s : null; });
    results.screenshots.nestedAfterFirstEsc = await shot(cdp, '08e-nested-after-first-escape.png');
    const sentAfterTopmostCancel = nestedAfterFirst.sent;
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', autoRepeat: true, windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await delay(80);
    const nestedAfterHeldRepeat = await uiState(cdp);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await pressEscape(cdp);
    const nestedAfterSecond = await waitFor(async () => { const s = await uiState(cdp); return !s.contextMenuOpen && !s.container.hidden ? s : null; });
    results.screenshots.nestedAfterSecondEsc = await shot(cdp, '08f-nested-after-second-escape.png');
    await pressEscape(cdp);
    const nestedAfterThird = await waitFor(async () => { const s = await uiState(cdp); return s.container.hidden ? s : null; });
    results.checks.nestedEscapeClosedModalOnly = !nestedAfterFirst.dialogs.includes('action-dialog') && nestedAfterFirst.contextMenuOpen && !nestedAfterFirst.container.hidden;
    results.checks.heldEscapeRepeatDidNotTearThroughStack = nestedAfterHeldRepeat.contextMenuOpen && !nestedAfterHeldRepeat.container.hidden && nestedAfterHeldRepeat.sent === sentAfterTopmostCancel;
    results.checks.nestedSecondEscapeClosedContextOnly = !nestedAfterSecond.contextMenuOpen && !nestedAfterSecond.container.hidden;
    results.checks.nestedThirdEscapeClosedGround = nestedAfterThird.container.hidden;
    results.checks.nestedGroundEscapeDidNotAddGameInput = sentAfterTopmostCancel === '' && nestedAfterThird.sent === '';

    // Shop offers share the interaction-dialog cancel path.
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.reset(); t.setRunning(true); t.event({name:'shim_yn_function', query:'Izchak offers 8 gold pieces for your runed dagger. Sell it?', choices:'ynaq\\u001b', requestId:'shop-escape'}); t.clearSentInputs(); })()`);
    await waitFor(async () => { const s = await uiState(cdp); return s.dialogs.includes('interaction-dialog') && /Shopkeeper offer/i.test(s.dialog.title || '') ? s : null; });
    results.screenshots.shopBeforeEsc = await shot(cdp, '08g-shop-offer-before-escape.png');
    await pressEscape(cdp);
    const shopAfter = await waitFor(async () => { const s = await uiState(cdp); return !s.dialogs.includes('interaction-dialog') ? s : null; });
    results.checks.shopOfferClosed = !shopAfter.dialogs.includes('interaction-dialog');
    results.checks.shopOfferSentCancel = shopAfter.sent.includes('\u001b');

    // Help/document window: Escape from the filter field closes the document instead of leaking to gameplay.
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.reset(); t.setRunning(true); t.event({name:'shim_create_nhwindow', return:910, windowType:4}); t.event({name:'shim_putstr', window:910, text:'NetHack help/file window'}); t.event({name:'shim_putstr', window:910, text:'Commands: i inventory, ? help, Esc cancels menus.'}); t.event({name:'shim_display_nhwindow', window:910, blocking:1}); document.getElementById('document-filter')?.focus(); })()`);
    await waitFor(async () => (await uiState(cdp)).dialogs.includes('document-dialog'));
    results.screenshots.documentBeforeEsc = await shot(cdp, '09-document-window-before-escape.png');
    await pressEscape(cdp);
    const documentAfter = await waitFor(async () => { const s = await uiState(cdp); return !s.dialogs.includes('document-dialog') ? s : null; });
    results.screenshots.documentAfterEsc = await shot(cdp, '10-document-window-after-escape.png');
    results.checks.documentWindowClosedFromFilter = !documentAfter.dialogs.includes('document-dialog');

    // Read-only menu/dialog: Escape cancels the NetHack informational menu.
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.reset(); t.setRunning(true); t.event({name:'shim_start_menu', window:812}); t.event({name:'shim_add_menu', window:812, selector:0, text:'Tip: farlooking does not spend a turn.'}); t.event({name:'shim_end_menu', window:812, prompt:'Tip'}); t.event({name:'shim_select_menu', window:812, how:0}); t.clearSentInputs(); })()`);
    await waitFor(async () => { const s = await uiState(cdp); return s.dialogs.includes('interaction-dialog') && /Tip|Review/.test(`${s.dialog.title}\n${s.dialog.prompt}`) ? s : null; });
    results.screenshots.readOnlyMenuBeforeEsc = await shot(cdp, '11-read-only-menu-before-escape.png');
    await pressEscape(cdp);
    const readOnlyAfter = await waitFor(async () => { const s = await uiState(cdp); return !s.dialogs.includes('interaction-dialog') ? s : null; });
    results.screenshots.readOnlyMenuAfterEsc = await shot(cdp, '12-read-only-menu-after-escape.png');
    results.checks.readOnlyMenuClosed = !readOnlyAfter.dialogs.includes('interaction-dialog');
    results.checks.readOnlyMenuSentCancel = readOnlyAfter.sent.includes('\u001b');

    // App popups: settings, character/new-game, and action command modal all close on Escape.
    await evalExpr(cdp, `window.__nethackPromptTest.reset(); window.__nethackPromptTest.setRunning(false); document.getElementById('settings-button')?.click();`);
    const settingsBefore = await waitFor(async () => { const s = await uiState(cdp); return s.dialogs.includes('settings-dialog') ? s : null; });
    results.screenshots.settingsBeforeEsc = await shot(cdp, '13-settings-before-escape.png');
    await pressEscape(cdp);
    const settingsAfter = await waitFor(async () => { const s = await uiState(cdp); return !s.dialogs.includes('settings-dialog') ? s : null; });
    results.checks.settingsDialogOpened = settingsBefore.dialogs.includes('settings-dialog');
    results.checks.settingsDialogClosed = !settingsAfter.dialogs.includes('settings-dialog');
    await evalExpr(cdp, `document.getElementById('start-shim')?.click();`);
    const characterBefore = await waitFor(async () => { const s = await uiState(cdp); return s.dialogs.includes('character-dialog') ? s : null; });
    results.screenshots.characterBeforeEsc = await shot(cdp, '14-character-before-escape.png');
    await pressEscape(cdp);
    const characterAfter = await waitFor(async () => { const s = await uiState(cdp); return !s.dialogs.includes('character-dialog') ? s : null; });
    results.checks.characterDialogOpened = characterBefore.dialogs.includes('character-dialog');
    results.checks.characterDialogClosed = !characterAfter.dialogs.includes('character-dialog');
    await evalExpr(cdp, `window.__nethackPromptTest.setRunning(true);`);
    await click(cdp, '#open-actions');
    await evalExpr(cdp, `document.getElementById('repeat-count')?.focus()`);
    results.screenshots.actionsBeforeEsc = await shot(cdp, '15-actions-before-escape.png');
    await pressEscape(cdp);
    const actionsAfter = await waitFor(async () => { const s = await uiState(cdp); return !s.dialogs.includes('action-dialog') ? s : null; });
    results.checks.actionDialogClosed = !actionsAfter.dialogs.includes('action-dialog');

    // Startup choice is required: Escape is consumed but cannot dismiss it.
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.reset(); t.setRunning(false); const dialog = document.getElementById('startup-choice-dialog'); if (!dialog.open) dialog.showModal(); document.getElementById('startup-new-game')?.focus(); })()`);
    await waitFor(async () => (await uiState(cdp)).dialogs.includes('startup-choice-dialog'));
    results.screenshots.startupBeforeEsc = await shot(cdp, '15b-startup-required-before-escape.png');
    await pressEscape(cdp);
    const startupAfter = await uiState(cdp);
    results.screenshots.startupAfterEsc = await shot(cdp, '15c-startup-required-after-escape.png');
    results.checks.startupChoiceStaysOpen = startupAfter.dialogs.includes('startup-choice-dialog');
    results.checks.startupEscapeDidNotReachGame = startupAfter.sent === '';
    await evalExpr(cdp, `document.getElementById('startup-choice-dialog')?.close('test-cleanup')`);

    // Game-over/final chronicle: close an equipment owner while its nested item
    // menu exists, then prove the hidden stale node cannot outrank game over.
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.reset(); t.setRunning(true); t.event({name:'shim_start_menu', window:813}); t.event({name:'shim_add_menu', window:813, selector:97, text:'a - a +1 long sword (weapon in hand)', glyphChar:41, semanticKind:'object'}); t.event({name:'shim_end_menu', window:813, prompt:'Inventory:'}); t.event({name:'shim_select_menu', window:813, how:0}); })()`);
    await waitFor(async () => (await uiState(cdp)).dialogs.includes('interaction-dialog'));
    await evalExpr(cdp, `(() => { const row = document.querySelector('#interaction-options .choice-button'); const rect = row?.getBoundingClientRect?.(); row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles:true, cancelable:true, clientX:(rect?.left || 40) + 20, clientY:(rect?.top || 40) + 20 })); })()`);
    await waitFor(async () => (await uiState(cdp)).contextMenuOpen);
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.clearSentInputs(); t.event({name:'shim_putstr', window:1, text:'You die...'}); })()`);
    await waitFor(async () => (await uiState(cdp)).dialogs.includes('game-over-dialog'), 3000);
    results.screenshots.gameOverBeforeEsc = await shot(cdp, '16-game-over-before-escape.png');
    await pressEscape(cdp);
    const gameOverAfter = await uiState(cdp);
    results.screenshots.gameOverAfterEsc = await shot(cdp, '17-game-over-after-escape.png');
    results.checks.gameOverClosedNestedContextMenu = !gameOverAfter.contextMenuOpen;
    results.checks.gameOverStaysOpen = gameOverAfter.dialogs.includes('game-over-dialog');
    results.checks.gameOverEscapeDidNotReachGame = gameOverAfter.sent === '';
    results.checks.gameOverEscapeReasonVisible = /Escape keeps the final chronicle open/i.test(gameOverAfter.body);
    results.checks.gameOverFocusesNewGame = gameOverAfter.activeId === 'game-over-new';

    fs.writeFileSync(path.join(outDir, 'escape-popup-coverage-summary.json'), JSON.stringify(results, null, 2));
    const md = ['# Escape popup coverage', '', `Output: ${outDir}`, '', '## Checks', ...Object.entries(results.checks).map(([name, ok]) => `- ${ok ? 'PASS' : 'FAIL'} ${name}`), '', '## Screenshots', ...Object.entries(results.screenshots).map(([name, p]) => `- ${name}: ${p}`), ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'escape-popup-coverage-summary.md'), md);
    console.log(md);
    const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`Escape popup coverage failed: ${failed.join(', ')}`);
  } finally {
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), stdout.join(''));
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), stderr.join(''));
    cleanup();
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
