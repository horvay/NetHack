const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_EQUIPMENT_SCREEN_OUT_DIR || path.join(root, 'test-output', 'equipment-screen-rpg');
const port = Number(process.env.NH_EQUIPMENT_SCREEN_CDP_PORT || 9491);
const width = Number(process.env.NH_EQUIPMENT_SCREEN_WIDTH || 1360);
const height = Number(process.env.NH_EQUIPMENT_SCREEN_HEIGHT || 920);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out waiting'); }
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function press(cdp, key, code, text) {
  const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
  const params = { key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  if (text !== undefined) params.text = text;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}
async function clickCenter(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function pageState(cdp) { return evalExpr(cdp, `(() => ({
  status: document.getElementById('status')?.textContent || '',
  seen: document.getElementById('shim-output')?.dataset?.seen || '',
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  dialog: window.__nethackPromptTest?.dialog?.() || {},
  body: document.body.innerText,
  buttonLabel: document.getElementById('inventory-equipment-button')?.textContent?.trim() || '',
  buttonTitle: document.getElementById('inventory-equipment-button')?.title || ''
}))()`); }
async function startShim(cdp) {
  await clickCenter(cdp, '#start-shim'); await delay(200); await clickCenter(cdp, '#confirm-character');
  await waitFor(async () => { const s = await pageState(cdp); return s.running && /shim_glyph|shim_status_update|shim_curs|shim_putstr/.test(s.seen) ? s : null; }, 20000);
  await waitFor(async () => {
    await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('character-dialog')?.close?.('cancel'); document.getElementById('game-grid').focus(); window.__nethackPromptTest.clearSentInputs(); })()`);
    const openDialogs = await evalExpr(cdp, `Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id).join(',')`);
    return openDialogs ? null : true;
  }, 5000);
}
async function waitForEquipmentDialog(cdp, timeoutMs = 10000) {
  return waitFor(async () => { const s = await pageState(cdp); return s.dialog?.interactionOpen && /Equipment \/ Inventory/i.test(s.dialog.title || '') ? s : null; }, timeoutMs);
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup); child.stdout.on('data', (d) => process.stdout.write(d)); child.stderr.on('data', (d) => process.stderr.write(d));
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "document.readyState === 'complete' && !!window.__nethackPromptTest && !!window.__nethackAutomation" })).result.value, 10000);

    const affordance = await waitFor(async () => {
      const state = await pageState(cdp);
      return /Inventory\s*\/\s*Equipment\s*\(i\)/i.test(state.buttonLabel || '') ? state : null;
    }, 5000);
    const buttonScreenshot = await shot(cdp, '00-main-ui-inventory-equipment-button.png');
    assert('visible inventory/equipment button label', /Inventory\s*\/\s*Equipment\s*\(i\)/i.test(affordance.buttonLabel), affordance.buttonLabel);
    assert('button title explains shortcut', /RPG hero equipment/i.test(affordance.buttonTitle), affordance.buttonTitle);

    const routeMetrics = await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      t.reset(); t.setRunning(true);
      document.getElementById('inventory-equipment-button').click();
      const buttonSent = t.sentInputs().join('');
      t.reset(); t.setRunning(true); document.getElementById('game-grid').focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true, cancelable: true }));
      const keyboardSent = t.sentInputs().join('');
      return { buttonSent, keyboardSent };
    })()`);
    assert('visible button routes same inventory command', routeMetrics.buttonSent === 'i', JSON.stringify(routeMetrics));
    assert('keyboard i routes inventory command', routeMetrics.keyboardSent === 'i', JSON.stringify(routeMetrics));
    const promptlessMetrics = await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      t.reset(); t.setRunning(true);
      document.getElementById('inventory-equipment-button').click();
      const buttonSentBeforeRows = t.sentInputs().join('');
      t.event({name:'shim_start_menu', window:89});
      [
        [97, 'a - a +1 spear (weapon in right hand)', 41, 'spear'],
        [98, 'b - a +0 dagger (alternate weapon; not wielded)', 41, 'dagger'],
        [99, 'c - an uncursed +3 small shield (being worn)', 91, 'small shield'],
        [100, 'd - an uncursed food ration', 37, 'food ration']
      ].forEach(([selector, text, glyphChar, semanticName]) => t.event({name:'shim_add_menu', window:89, selector, text, glyphChar, semanticKind:'object', semanticName}));
      t.event({name:'shim_end_menu', window:89, prompt:'Menu'});
      const dialog = t.dialog();
      return { buttonSentBeforeRows, dialog, paper: document.querySelector('.rpg-equipment-screen')?.innerText || '', rows: Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).map((el) => el.innerText).join(String.fromCharCode(10)), body: document.body.innerText };
    })()`);
    const promptlessScreenshot = await shot(cdp, '01-button-promptless-menu-rpg-equipment-screen.png');
    assert('button sends inventory before promptless NetHack rows arrive', promptlessMetrics.buttonSentBeforeRows === 'i', promptlessMetrics.buttonSentBeforeRows);
    assert('promptless real NetHack inventory menu opens RPG equipment screen', promptlessMetrics.dialog.interactionOpen && /Equipment \/ Inventory/i.test(promptlessMetrics.dialog.title), promptlessMetrics.dialog.title);
    assert('promptless inventory has hero equipment and real item names', /Hero equipment/i.test(promptlessMetrics.paper) && /spear|small shield/i.test(`${promptlessMetrics.paper}\n${promptlessMetrics.rows}`), `${promptlessMetrics.paper}\n${promptlessMetrics.rows}`);
    assert('promptless screen avoids generic Menu chooser', !/Menu\nChoose visible item rows/i.test(promptlessMetrics.body), promptlessMetrics.body);

    const rememberedGroundMetrics = await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      t.reset(); t.setRunning(true); document.getElementById('game-grid').focus();
      t.event({name:'shim_create_nhwindow', return:88, windowType:4});
      t.event({name:'shim_putstr', window:88, text:'Things that are here:'});
      t.event({name:'shim_putstr', window:88, text:'a scroll labeled READ ME'});
      t.event({name:'shim_putstr', window:88, text:'a food ration'});
      t.event({name:'shim_display_nhwindow', window:88});
      const groundPanelBeforeInventory = t.container();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true, cancelable: true }));
      const keyboardSent = t.sentInputs().join('');
      t.event({name:'shim_start_menu', window:188});
      [
        [97, 'a - a scroll labeled READ ME', 63, 'scroll labeled READ ME'],
        [98, 'b - an uncursed food ration', 37, 'food ration']
      ].forEach(([selector, text, glyphChar, semanticName]) => t.event({name:'shim_add_menu', window:188, selector, text, glyphChar, semanticKind:'object', semanticName}));
      t.event({name:'shim_end_menu', window:188, prompt:'Menu'});
      const dialog = t.dialog();
      return { keyboardSent, groundPanelBeforeInventory, dialog, paper: document.querySelector('.rpg-equipment-screen')?.innerText || '', rows: Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).map((el) => el.innerText).join(String.fromCharCode(10)), body: document.body.innerText };
    })()`);
    assert('keyboard i opens rich equipment screen even when inventory rows match remembered ground stack', rememberedGroundMetrics.keyboardSent === 'i' && rememberedGroundMetrics.groundPanelBeforeInventory.active && rememberedGroundMetrics.dialog.interactionOpen && /Equipment \/ Inventory/i.test(rememberedGroundMetrics.dialog.title) && /Hero equipment/i.test(rememberedGroundMetrics.paper) && /scroll labeled READ ME|food ration/i.test(rememberedGroundMetrics.rows), JSON.stringify(rememberedGroundMetrics));
    assert('remembered ground stack does not regress i into the basic Menu picker', !/Menu\nChoose visible item rows/i.test(rememberedGroundMetrics.body), rememberedGroundMetrics.body);

    const explicitInventoryPurposeMetrics = await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      t.reset(); t.setRunning(true);
      t.event({name:'shim_start_menu', window:189, menuPurpose:'inventory.displayInventory', owner:{kind:'inventory', window:189}, lifecycle:'opened'});
      [
        [36, '$ - 9 gold pieces', 36, 'gold piece'],
        [97, 'a - a +2 bullwhip (weapon in right hand)', 41, 'bullwhip'],
        [98, 'b - an uncursed +0 leather jacket (being worn)', 91, 'leather jacket'],
        [99, 'c - an uncursed +0 fedora (being worn)', 91, 'fedora', 'object'],
        [106, 'a lichen corpse', 37, 'lichen', 'corpse']
      ].forEach(([selector, text, glyphChar, semanticName, semanticKind = 'object']) => t.event({name:'shim_add_menu', window:189, selector, text, glyphChar, semanticKind, semanticName, menuPurpose:'inventory.displayInventory', owner:{kind:'inventory', window:189}, lifecycle:'opened'}));
      t.event({name:'shim_end_menu', window:189, prompt:'Menu', menuPurpose:'inventory.displayInventory', owner:{kind:'inventory', window:189}, lifecycle:'ready'});
      t.event({name:'shim_select_menu', window:189, how:1, menuPurpose:'inventory.displayInventory', owner:{kind:'inventory', window:189}, lifecycle:'selecting'});
      const rich = { dialog: t.dialog(), paper: document.querySelector('.rpg-equipment-screen')?.innerText || '', rows: Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).map((el) => el.innerText).join(String.fromCharCode(10)), body: document.body.innerText };
      t.reset(); t.setRunning(true);
      t.event({name:'shim_yn_function', query:'What do you want to use or apply? [a or ?*]', choices:'a?*\\u001b'});
      t.event({name:'shim_start_menu', window:190, menuPurpose:'inventory.displayInventory', owner:{kind:'inventory', window:190}, lifecycle:'opened'});
      t.event({name:'shim_add_menu', window:190, selector:97, text:'a - a +2 bullwhip (weapon in right hand)', glyphChar:41, semanticKind:'object', semanticName:'bullwhip', menuPurpose:'inventory.displayInventory', owner:{kind:'inventory', window:190}, lifecycle:'opened'});
      t.event({name:'shim_end_menu', window:190, prompt:'Menu', menuPurpose:'inventory.displayInventory', owner:{kind:'inventory', window:190}, lifecycle:'ready'});
      t.event({name:'shim_select_menu', window:190, how:1, menuPurpose:'inventory.displayInventory', owner:{kind:'inventory', window:190}, lifecycle:'selecting'});
      const actionPicker = { dialog: t.dialog(), paper: document.querySelector('.rpg-equipment-screen')?.innerText || '', body: document.body.innerText };
      return { rich, actionPicker };
    })()`);
    const explicitPurposeScreenshot = await shot(cdp, '02-action-prompt-inventory-picker-remains-inventory-only.png');
    assert('explicit inventory.displayInventory menu opens RPG equipment screen even without fresh local request marker', explicitInventoryPurposeMetrics.rich.dialog.interactionOpen && /Equipment \/ Inventory/i.test(explicitInventoryPurposeMetrics.rich.dialog.title) && /Hero equipment/i.test(explicitInventoryPurposeMetrics.rich.paper) && /bullwhip|leather jacket|fedora|lichen corpse/i.test(`${explicitInventoryPurposeMetrics.rich.paper}\n${explicitInventoryPurposeMetrics.rich.rows}`) && !/Menu\nChoose visible item rows/i.test(explicitInventoryPurposeMetrics.rich.body), JSON.stringify(explicitInventoryPurposeMetrics.rich));
    assert('inventory action picker remains legitimate inventory-only state while an item prompt owns the menu', explicitInventoryPurposeMetrics.actionPicker.dialog.interactionOpen && !/Equipment \/ Inventory/i.test(explicitInventoryPurposeMetrics.actionPicker.dialog.title || '') && !/Hero equipment/i.test(explicitInventoryPurposeMetrics.actionPicker.paper), JSON.stringify(explicitInventoryPurposeMetrics.actionPicker));

    const metrics = await evalExpr(cdp, `(async () => {
      const t = window.__nethackPromptTest;
      t.reset(); t.setRunning(true);
      t.event({name:'shim_start_menu', window:90});
      [
        [97, 'a - a blessed +1 long sword (weapon in hand)', 41, 'long sword'],
        [98, 'b - an uncursed dagger (alternate weapon; not wielded)', 41, 'dagger'],
        [99, 'c - an uncursed ring mail (being worn)', 91, 'ring mail'],
        [100, 'd - an uncursed cloak of protection (being worn)', 91, 'cloak'],
        [101, 'e - an uncursed pair of leather gloves (being worn)', 91, 'gloves'],
        [102, 'f - an uncursed pair of iron shoes (being worn)', 91, 'boots'],
        [103, 'g - an uncursed small shield (being worn)', 91, 'shield'],
        [104, 'h - a ring of protection (on left hand)', 61, 'ring'],
        [105, 'i - a ring of adornment (on right hand)', 61, 'ring'],
        [106, 'j - an amulet of reflection (being worn)', 34, 'amulet'],
        [107, 'k - a blindfold (being worn)', 40, 'blindfold'],
        [108, 'l - 12 arrows (in quiver)', 41, 'arrows'],
        [109, 'm - a +0 helmet', 91, 'helmet'],
        [110, 'n - 5 darts', 41, 'darts'],
        [111, 'o - a quarterstaff', 41, 'quarterstaff'],
        [112, 'p - an uncursed splint mail', 91, 'splint mail'],
        [113, 'q - a Hawaiian shirt', 91, 'Hawaiian shirt'],
        [114, 'r - a T-shirt (being worn)', 91, 'T-shirt'],
        [121, 'y - a large box', 40, 'large box']
      ].forEach(([selector, text, glyphChar, semanticName]) => t.event({name:'shim_add_menu', window:90, selector, objectId: selector + 1000, text, glyphChar, semanticKind:'object', semanticName}));
      t.event({name:'shim_end_menu', window:90, prompt:'Inventory:'});
      const dialog = t.dialog();
      const paper = document.querySelector('.rpg-equipment-screen')?.innerText || '';
      const slots = Array.from(document.querySelectorAll('.paper-doll-slots .equipment-slot')).map((el) => ({ slot: el.dataset.slot, text: el.innerText, equipped: el.classList.contains('equipped') }));
      const rows = Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).map((el) => ({ key: el.dataset.key, text: el.innerText, label: el.getAttribute('aria-label'), badges: Array.from(el.querySelectorAll('.menu-badges span')).map((badge) => badge.textContent.trim()).filter(Boolean) }));
      const avatar = document.querySelector('.paper-doll-stage .player-avatar-display');
      const avatarImage = avatar?.querySelector('.player-avatar-image');
      const avatarImageStyle = avatarImage ? getComputedStyle(avatarImage) : null;
      const avatarImageBox = avatarImage?.getBoundingClientRect();
      const stageBox = document.querySelector('.paper-doll-stage')?.getBoundingClientRect();
      const avatarBox = avatar?.getBoundingClientRect();
      const toStageBox = (r) => ({ left: Math.round(r.left - stageBox.left), top: Math.round(r.top - stageBox.top), width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right - stageBox.left), bottom: Math.round(r.bottom - stageBox.top) });
      const slotBoxes = Object.fromEntries(Array.from(document.querySelectorAll('.paper-doll-slots .equipment-slot')).map((el) => [el.dataset.slot, toStageBox(el.getBoundingClientRect())]));
      const avatarStageBox = avatarBox ? toStageBox(avatarBox) : null;
      const stageSize = stageBox ? { width: Math.round(stageBox.width), height: Math.round(stageBox.height) } : null;
      const clickRow = (key) => document.querySelector('#interaction-options .rpg-inventory-row[data-key="' + key + '"]')?.click();
      const doubleClickRow = (key) => document.querySelector('#interaction-options .rpg-inventory-row[data-key="' + key + '"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
      t.clearSentInputs(); clickRow('m'); const singleClickHelmetSent = t.sentInputs().join(''); const singleClickHelmetTitle = document.getElementById('interaction-title').textContent; const singleClickHelmetOpen = document.getElementById('interaction-dialog').open; const singleClickContextOpen = Boolean(document.querySelector('.inventory-context-menu'));
      t.clearSentInputs(); doubleClickRow('m'); await new Promise((resolve) => setTimeout(resolve, 120)); const wearHelmetBeforeCloseSent = t.sentInputs().join(''); const wearHelmetBeforeCloseCommands = t.sentUiProtocolCommands(); t.forceCloseCurrentMenuForTest(); await new Promise((resolve) => setTimeout(resolve, 600)); const wearHelmetSent = t.sentInputs().join(''); const wearHelmetCommands = t.sentUiProtocolCommands();
      t.event({name:'bridge_menu_answer', return:0});
      const wearHelmetAfterCloseSignal = { open: document.getElementById('interaction-dialog').open, title: document.getElementById('interaction-title').textContent, paper: document.querySelector('.rpg-equipment-screen')?.innerText || '', feedback: document.getElementById('interaction-feedback').textContent };
      t.event({name:'shim_start_menu', window:190});
      [
        [97, 'a - a blessed +1 long sword (weapon in hand)', 41, 'long sword'],
        [98, 'b - an uncursed dagger (alternate weapon; not wielded)', 41, 'dagger'],
        [99, 'c - an uncursed ring mail (being worn)', 91, 'ring mail'],
        [100, 'd - an uncursed cloak of protection (being worn)', 91, 'cloak'],
        [101, 'e - an uncursed pair of leather gloves (being worn)', 91, 'gloves'],
        [102, 'f - an uncursed pair of iron shoes (being worn)', 91, 'boots'],
        [103, 'g - an uncursed small shield (being worn)', 91, 'shield'],
        [104, 'h - a ring of protection (on left hand)', 61, 'ring'],
        [105, 'i - a ring of adornment (on right hand)', 61, 'ring'],
        [106, 'j - an amulet of reflection (being worn)', 34, 'amulet'],
        [107, 'k - a blindfold (being worn)', 40, 'blindfold'],
        [108, 'l - 12 arrows (in quiver)', 41, 'arrows'],
        [109, 'm - a +0 helmet (being worn)', 91, 'helmet'],
        [110, 'n - 5 darts', 41, 'darts'],
        [111, 'o - a quarterstaff', 41, 'quarterstaff'],
        [112, 'p - an uncursed splint mail', 91, 'splint mail'],
        [113, 'q - a Hawaiian shirt', 91, 'Hawaiian shirt'],
        [114, 'r - a T-shirt (being worn)', 91, 'T-shirt'],
        [121, 'y - a large box', 40, 'large box']
      ].forEach(([selector, text, glyphChar, semanticName]) => t.event({name:'shim_add_menu', window:190, selector, objectId: selector + 1000, text, glyphChar, semanticKind:'object', semanticName}));
      t.event({name:'shim_end_menu', window:190, prompt:'Inventory:'});
      const wearHelmetAfterRefresh = { open: document.getElementById('interaction-dialog').open, title: document.getElementById('interaction-title').textContent, helmetSlot: document.querySelector('.paper-doll-slots .equipment-slot[data-slot="helmet"]')?.innerText || '', helmetRow: document.querySelector('#interaction-options .rpg-inventory-row[data-key="m"]')?.innerText || '' };
      t.event({name:'bridge_menu_answer', return:0});
      const wearHelmetAfterLateCloseSignal = { open: document.getElementById('interaction-dialog').open, title: document.getElementById('interaction-title').textContent, paper: document.querySelector('.rpg-equipment-screen')?.innerText || '', helmetSlot: document.querySelector('.paper-doll-slots .equipment-slot[data-slot="helmet"]')?.innerText || '', helmetRow: document.querySelector('#interaction-options .rpg-inventory-row[data-key="m"]')?.innerText || '' };
      await new Promise((resolve) => setTimeout(resolve, 320));
      t.clearSentInputs(); doubleClickRow('p'); t.forceCloseCurrentMenuForTest(); await new Promise((resolve) => setTimeout(resolve, 170)); const swapArmorSent = t.sentInputs().join(''); const swapArmorFeedback = document.getElementById('interaction-feedback').textContent; const swapArmorRow = document.querySelector('#interaction-options .rpg-inventory-row[data-key="p"]')?.innerText || ''; const swapArmorAria = document.querySelector('#interaction-options .rpg-inventory-row[data-key="p"]')?.getAttribute('aria-label') || '';
      await new Promise((resolve) => setTimeout(resolve, 320));
      t.clearSentInputs(); doubleClickRow('q'); t.forceCloseCurrentMenuForTest(); await new Promise((resolve) => setTimeout(resolve, 170)); const layeredShirtSwapSent = t.sentInputs().join(''); const layeredShirtFeedback = document.getElementById('interaction-feedback').textContent; const layeredShirtRow = document.querySelector('#interaction-options .rpg-inventory-row[data-key="q"]')?.innerText || '';
      await new Promise((resolve) => setTimeout(resolve, 700));
      t.clearSentInputs(); doubleClickRow('h'); t.forceCloseCurrentMenuForTest(); await new Promise((resolve) => setTimeout(resolve, 220)); const removeRingSent = t.sentInputs().join(''); const removeRingCommands = t.sentUiProtocolCommands();
      t.clearSentInputs(); document.querySelector('.paper-doll-slots .equipment-slot[data-slot="armor-suit"] button[data-command-key="T"]')?.click(); t.forceCloseCurrentMenuForTest(); await new Promise((resolve) => setTimeout(resolve, 170)); const takeOffArmorSent = t.sentInputs().join(''); const takeOffArmorCommands = t.sentUiProtocolCommands(); const takeOffArmorTitle = document.getElementById('interaction-title').textContent; const takeOffArmorPrompt = document.getElementById('interaction-prompt').textContent;
      t.clearSentInputs(); document.querySelector('.paper-doll-slots .equipment-slot[data-slot="quiver"] button[data-command-key="Q"]')?.click(); t.forceCloseCurrentMenuForTest(); await new Promise((resolve) => setTimeout(resolve, 170)); const quiverSent = t.sentInputs().join(''); const quiverCommands = t.sentUiProtocolCommands();
      t.clearSentInputs(); document.querySelector('.paper-doll-slots .equipment-slot[data-slot="offhand"] button[data-action-id="slot.swapMainAlternate"]')?.click(); t.forceCloseCurrentMenuForTest(); await new Promise((resolve) => setTimeout(resolve, 170)); const swapSent = t.sentInputs().join(''); const swapCommands = t.sentUiProtocolCommands(); const swapFeedback = document.getElementById('interaction-feedback').textContent;
      t.event({name:'shim_start_menu', window:91});
      [
        [97, 'a - a blessed +1 long sword (alternate weapon; not wielded)', 41, 'long sword'],
        [98, 'b - an uncursed dagger (weapon in hand)', 41, 'dagger'],
        [99, 'c - an uncursed ring mail (being worn)', 91, 'ring mail'],
        [100, 'd - an uncursed cloak of protection (being worn)', 91, 'cloak'],
        [101, 'e - an uncursed pair of leather gloves (being worn)', 91, 'gloves'],
        [102, 'f - an uncursed pair of iron shoes (being worn)', 91, 'boots'],
        [103, 'g - an uncursed small shield (being worn)', 91, 'shield'],
        [104, 'h - a ring of protection (on left hand)', 61, 'ring'],
        [105, 'i - a ring of adornment (on right hand)', 61, 'ring'],
        [106, 'j - an amulet of reflection (being worn)', 34, 'amulet'],
        [107, 'k - a blindfold (being worn)', 40, 'blindfold'],
        [108, 'l - 12 arrows (in quiver)', 41, 'arrows'],
        [109, 'm - a +0 helmet', 91, 'helmet'],
        [110, 'n - 5 darts', 41, 'darts'],
        [111, 'o - a quarterstaff', 41, 'quarterstaff'],
        [112, 'p - an uncursed splint mail', 91, 'splint mail'],
        [113, 'q - a Hawaiian shirt', 91, 'Hawaiian shirt'],
        [114, 'r - a T-shirt (being worn)', 91, 'T-shirt'],
        [121, 'y - a large box', 40, 'large box']
      ].forEach(([selector, text, glyphChar, semanticName]) => t.event({name:'shim_add_menu', window:91, selector, objectId: selector + 1000, text, glyphChar, semanticKind:'object', semanticName}));
      t.event({name:'shim_end_menu', window:91, prompt:'Inventory:'});
      const swappedSlotText = Array.from(document.querySelectorAll('.paper-doll-slots .equipment-slot')).map((el) => ({ slot: el.dataset.slot, text: el.innerText }));
      const dispatchDrop = async (rowKey, slotId, clickAfterDrop = false) => {
        t.clearSentInputs();
        const row = document.querySelector('#interaction-options .rpg-inventory-row[data-key="' + rowKey + '"]');
        const slot = document.querySelector('.paper-doll-slots .equipment-slot[data-slot="' + slotId + '"]');
        const dt = new DataTransfer();
        row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
        slot.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        slot.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        row.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
        t.forceCloseCurrentMenuForTest();
        await new Promise((resolve) => setTimeout(resolve, 170));
        if (clickAfterDrop) row.click();
        return { sent: t.sentInputs().join(''), commands: t.sentUiProtocolCommands(), feedback: document.getElementById('interaction-feedback').textContent, title: document.getElementById('interaction-title').textContent, open: document.getElementById('interaction-dialog').open, body: document.body.innerText };
      };
      const dragHelmet = await dispatchDrop('m', 'helmet');
      const dragStaffMainHand = await dispatchDrop('o', 'main-hand', true);
      const dragDartsMainHand = await dispatchDrop('n', 'main-hand', true);
      const dragDartsQuiver = await dispatchDrop('n', 'quiver', true);
      t.clearSentInputs();
      const dartsRow = document.querySelector('#interaction-options .rpg-inventory-row[data-key="n"]');
      dartsRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 880, clientY: 340 }));
      const contextMenuText = document.querySelector('.inventory-context-menu')?.innerText || '';
      const contextActionIds = Array.from(document.querySelectorAll('.inventory-context-menu [data-action-id]')).map((el) => el.dataset.actionId);
      t.clearSentInputs();
      const largeBoxRow = document.querySelector('#interaction-options .rpg-inventory-row[data-key="y"]');
      largeBoxRow?.scrollIntoView?.({ block: 'center' });
      largeBoxRow?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 900, clientY: 720 }));
      const largeBoxContextMenuText = document.querySelector('.inventory-context-menu')?.innerText || '';
      const largeBoxContextHeader = document.querySelector('.inventory-context-header')?.innerText || '';
      document.querySelector('.inventory-context-menu [data-action-id="item.lootOrApply"]')?.click();
      t.forceCloseCurrentMenuForTest();
      await new Promise((resolve) => setTimeout(resolve, 170));
      const largeBoxApplySent = t.sentInputs().join('');
      const largeBoxApplyCommands = t.sentUiProtocolCommands();
      const largeBoxApplyFeedback = document.getElementById('interaction-feedback').textContent;
      const dragInvalidFoodToHelmet = await dispatchDrop('m', 'shield');
      const offhandContextMenuText = (() => {
        closeInventoryContextMenu?.();
        const offhandSlot = document.querySelector('.paper-doll-slots .equipment-slot[data-slot="offhand"]');
        offhandSlot.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 520, clientY: 360 }));
        return document.querySelector('.equipment-slot-context-menu')?.innerText || '';
      })();
      const rawGenericContextLeak = /Do what with the darts\?|Inventory selector|Item selector n|Throw one of these|semantic IDs|compatibility commands|\b(?:item|slot)\.[A-Za-z]/i.test(contextMenuText + String.fromCharCode(10) + offhandContextMenuText);
      return { dialog, paper, slots, rows, swappedSlotText, hasPlayerAvatar: Boolean(avatar), playerAvatarTileId: avatar?.dataset.tileId || '', playerAvatarSource: avatar?.dataset.avatarSource || '', playerAvatarSrc: avatar?.dataset.avatarSrc || avatarImage?.getAttribute('src') || '', avatarImageStyle: avatarImage ? { objectFit: avatarImage.style.objectFit || avatarImageStyle?.getPropertyValue('object-fit') || '', objectPosition: avatarImage.style.objectPosition || avatarImageStyle?.getPropertyValue('object-position') || '', width: Math.round(avatarImageBox?.width || 0), height: Math.round(avatarImageBox?.height || 0), naturalWidth: avatarImage?.naturalWidth || 0, naturalHeight: avatarImage?.naturalHeight || 0 } : null, stageSize, avatarStageBox, slotBoxes, singleClickHelmetSent, singleClickHelmetTitle, singleClickHelmetOpen, singleClickContextOpen, wearHelmetBeforeCloseSent, wearHelmetBeforeCloseCommands, wearHelmetSent, wearHelmetCommands, wearHelmetAfterCloseSignal, wearHelmetAfterRefresh, wearHelmetAfterLateCloseSignal, swapArmorSent, swapArmorFeedback, swapArmorRow, swapArmorAria, layeredShirtSwapSent, layeredShirtFeedback, layeredShirtRow, removeRingSent, removeRingCommands, takeOffArmorSent, takeOffArmorCommands, takeOffArmorTitle, takeOffArmorPrompt, quiverSent, quiverCommands, swapSent, swapCommands, swapFeedback, dragHelmet, dragStaffMainHand, dragDartsMainHand, dragDartsQuiver, contextMenuText, contextActionIds, largeBoxContextMenuText, largeBoxContextHeader, largeBoxApplySent, largeBoxApplyCommands, largeBoxApplyFeedback, offhandContextMenuText, rawGenericContextLeak, dragInvalidFoodToHelmet, body: document.body.innerText };
    })()`);
    const screenshot = await shot(cdp, '03-injected-rich-rpg-equipment-screen.png');
    const snapshotVisibleMetrics = await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      t.reset(); t.setRunning(true);
      t.event({ name: 'shim_update_inventory', reason: -1, revision: 21, inventoryRevision: 21, equipmentRevision: 8, items: [
        { selector: 97, objectId: 3101, text: 'a - a +0 spear (weapon in hand)', quantity: 1, glyphChar: 41, wornMask: 256, semanticKind: 'object', semanticName: 'spear', semanticKnown: true },
        { selector: 98, objectId: 3102, text: 'b - a +0 ring mail (being worn)', quantity: 1, glyphChar: 91, wornMask: 1, semanticKind: 'object', semanticName: 'ring mail', semanticKnown: true },
        { selector: 99, objectId: 3103, text: 'c - a pearl ring (on left hand)', quantity: 1, glyphChar: 61, wornMask: 131072, semanticKind: 'object', semanticAppearance: 'pearl ring', semanticKnown: false, semanticName: 'ring of levitation' }
      ] });
      const equipmentDefault = t.equipment();
      const equipmentSnapshot = t.equipmentSnapshot();
      t.event({ name: 'shim_start_menu', window: 222 });
      t.event({ name: 'shim_add_menu', window: 222, selector: 97, text: 'a - stale menu spear label', glyphChar: 41, semanticKind: 'object', semanticName: 'stale spear label' });
      t.event({ name: 'shim_add_menu', window: 222, selector: 98, text: 'b - stale menu armor label', glyphChar: 91, semanticKind: 'object', semanticName: 'stale armor label' });
      t.event({ name: 'shim_add_menu', window: 222, selector: 99, text: 'c - stale menu ring label', glyphChar: 61, semanticKind: 'object', semanticAppearance: 'stale ring appearance', semanticKnown: false, semanticName: 'ring of levitation' });
      t.event({ name: 'shim_end_menu', window: 222, prompt: 'Inventory:' });
      const defaultInventory = t.inventory();
      const defaultRows = Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).map((row) => row.innerText);
      const defaultPaper = document.querySelector('.rpg-equipment-screen')?.innerText || '';
      const disabledInventoryFlags = t.setInventorySnapshotFeatureFlags({ useSnapshotForOverview: false });
      const fallbackRows = Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).map((row) => row.innerText);
      t.setInventorySnapshotFeatureFlags({ useSnapshotForOverview: true });
      const disabledEquipmentFlags = t.setEquipmentSnapshotFeatureFlags({ useSnapshotForPaperDoll: false });
      const equipmentFallback = t.equipment();
      const reenabledEquipmentFlags = t.setEquipmentSnapshotFeatureFlags({ useSnapshotForPaperDoll: true });
      const equipmentReenabled = t.equipment();
      return { equipmentDefault, equipmentSnapshot, defaultInventory, defaultRows, defaultPaper, disabledInventoryFlags, fallbackRows, disabledEquipmentFlags, equipmentFallback, reenabledEquipmentFlags, equipmentReenabled };
    })()`);
    const snapshotFlagScreenshot = await shot(cdp, '04-snapshot-backed-visible-inventory-equipment.png');
    const noAlternateMetrics = await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      t.reset(); t.setRunning(true); document.getElementById('game-grid')?.focus?.();
      t.event({ name: 'shim_update_equipment', revision: 41, inventoryRevision: 41, slots: [
        { slotId: 'mainHand', objectId: 4101, item: { selector: 102, objectId: 4101, text: 'f - a blessed +1 long sword (weapon in right hand)', glyphChar: 41, semanticKind: 'object', semanticName: 'long sword', semanticKnown: true } },
        { slotId: 'offHand', objectId: 4101, item: { selector: 102, objectId: 4101, text: 'f - a blessed +1 long sword (weapon in right hand)', glyphChar: 41, semanticKind: 'object', semanticName: 'long sword', semanticKnown: true } },
        { slotId: 'armor.body', objectId: 4102, item: { selector: 103, objectId: 4102, text: 'g - an uncursed leather armor (being worn)', glyphChar: 91, semanticKind: 'object', semanticName: 'leather armor', semanticKnown: true } },
        { slotId: 'armor.shirt', objectId: 4103, item: { selector: 104, objectId: 4103, text: 'h - a T-shirt (being worn)', glyphChar: 91, semanticKind: 'object', semanticName: 'T-shirt', semanticKnown: true } }
      ] });
      t.event({ name: 'shim_start_menu', window: 241 });
      [
        [102, 'f - a blessed +1 long sword (weapon in right hand)', 41, 'long sword'],
        [103, 'g - an uncursed leather armor (being worn)', 91, 'leather armor'],
        [104, 'h - a T-shirt (being worn)', 91, 'T-shirt']
      ].forEach(([selector, text, glyphChar, semanticName]) => t.event({ name: 'shim_add_menu', window: 241, selector, objectId: selector + 4000, text, glyphChar, semanticKind: 'object', semanticName }));
      t.event({ name: 'shim_end_menu', window: 241, prompt: 'Inventory:' });
      const offhandSlot = document.querySelector('.paper-doll-slots .equipment-slot[data-slot="offhand"]');
      const mainSlot = document.querySelector('.paper-doll-slots .equipment-slot[data-slot="main-hand"]');
      const armorCards = Array.from(document.querySelectorAll('.paper-doll-slots .equipment-slot')).filter((el) => ['armor-suit', 'shirt'].includes(el.dataset.slot)).map((el) => ({ slot: el.dataset.slot, text: el.innerText, equipped: el.classList.contains('equipped') }));
      const offhandButtonLabels = Array.from(offhandSlot?.querySelectorAll('button') || []).map((button) => button.textContent.trim());
      closeInventoryContextMenu?.(); offhandSlot?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 520, clientY: 360 }));
      const offhandContextMenuText = document.querySelector('.equipment-slot-context-menu')?.innerText || '';
      return { paper: document.querySelector('.rpg-equipment-screen')?.innerText || '', mainText: mainSlot?.innerText || '', offhandText: offhandSlot?.innerText || '', offhandEquipped: offhandSlot?.classList.contains('equipped') || false, offhandButtonLabels, offhandContextMenuText, armorCards };
    })()`);
    const noAlternateScreenshot = await shot(cdp, '05-no-alternate-offhand-empty-equipment-screen.png');
    const shirtAfterTakeoffMetrics = await evalExpr(cdp, `(() => new Promise((resolve) => {
      const t = window.__nethackPromptTest;
      t.clearSentInputs?.();
      document.querySelector('.paper-doll-slots .equipment-slot[data-slot="armor-suit"] button[data-command-key="T"]')?.click();
      t.forceCloseCurrentMenuForTest();
      window.setTimeout(() => {
        const sent = t.sentInputs().join('');
        const commands = t.sentUiProtocolCommands();
        t.event({ name: 'shim_update_equipment', revision: 42, inventoryRevision: 42, slots: [
          { slotId: 'mainHand', objectId: 4101, item: { selector: 102, objectId: 4101, text: 'f - a blessed +1 long sword (weapon in right hand)', glyphChar: 41, semanticKind: 'object', semanticName: 'long sword', semanticKnown: true } },
          { slotId: 'offHand', objectId: 4101, item: { selector: 102, objectId: 4101, text: 'f - a blessed +1 long sword (weapon in right hand)', glyphChar: 41, semanticKind: 'object', semanticName: 'long sword', semanticKnown: true } },
          { slotId: 'armor.body' },
          { slotId: 'armor.shirt', objectId: 4103, item: { selector: 104, objectId: 4103, text: 'h - a T-shirt (being worn)', glyphChar: 91, semanticKind: 'object', semanticName: 'T-shirt', semanticKnown: true } }
        ] });
        t.event({ name: 'shim_start_menu', window: 242 });
        [
          [102, 'f - a blessed +1 long sword (weapon in right hand)', 41, 'long sword'],
          [103, 'g - an uncursed leather armor', 91, 'leather armor'],
          [104, 'h - a T-shirt (being worn)', 91, 'T-shirt']
        ].forEach(([selector, text, glyphChar, semanticName]) => t.event({ name: 'shim_add_menu', window: 242, selector, objectId: selector + 4000, text, glyphChar, semanticKind: 'object', semanticName }));
        t.event({ name: 'shim_end_menu', window: 242, prompt: 'Inventory:' });
        const armorCards = Array.from(document.querySelectorAll('.paper-doll-slots .equipment-slot')).filter((el) => ['armor-suit', 'shirt'].includes(el.dataset.slot)).map((el) => ({ slot: el.dataset.slot, text: el.innerText, equipped: el.classList.contains('equipped'), box: (() => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) }; })() }));
        const offhandSlot = document.querySelector('.paper-doll-slots .equipment-slot[data-slot="offhand"]');
        resolve({ sent, commands, paper: document.querySelector('.rpg-equipment-screen')?.innerText || '', armorCards, offhandText: offhandSlot?.innerText || '', offhandEquipped: offhandSlot?.classList.contains('equipped') || false, offhandButtons: Array.from(offhandSlot?.querySelectorAll('button') || []).map((button) => button.textContent.trim()) });
      }, 170);
    }))()`);
    const shirtAfterTakeoffScreenshot = await shot(cdp, '06-shirt-visible-after-body-takeoff-equipment-screen.png');
    const slotText = metrics.slots.map((s) => `${s.slot}: ${s.text}`).join('\n');
    const rowText = metrics.rows.map((r) => r.text).join('\n');
    assert('RPG equipment dialog opens', metrics.dialog.interactionOpen && /Equipment \/ Inventory/i.test(metrics.dialog.title), metrics.dialog.title);
    assert('enlarged player avatar tile visible instead of mannequin', /Hero equipment/i.test(metrics.paper) && metrics.hasPlayerAvatar && /(?:hero-avatar|avatar)$/i.test(metrics.playerAvatarTileId) && /avatar\.png/i.test(metrics.playerAvatarSrc), JSON.stringify({ paper: metrics.paper, tile: metrics.playerAvatarTileId, src: metrics.playerAvatarSrc }));
    assert('player avatar image preserves full-body aspect with object-fit contain instead of CSS background stretching', metrics.avatarImageStyle?.objectFit === 'contain' && /center bottom/i.test(metrics.avatarImageStyle?.objectPosition || '') && metrics.avatarImageStyle.width >= 220 && metrics.avatarImageStyle.height >= 200, JSON.stringify({ avatar: metrics.avatarStageBox, source: metrics.playerAvatarSource, image: metrics.avatarImageStyle }));
    ['main-hand','offhand','quiver','armor-suit','cloak','helmet','gloves','boots','shield','amulet','left-ring','right-ring','eyes'].forEach((slot) => assert(`slot ${slot} visible`, metrics.slots.some((s) => s.slot === slot), slotText));
    ['long sword','ring mail','cloak of protection','leather gloves','iron shoes','small shield','ring of protection','ring of adornment','amulet of reflection','blindfold','12 arrows'].forEach((name) => assert(`equipped ${name} visible`, new RegExp(name, 'i').test(slotText), slotText));
    ['dagger','helmet','darts','quarterstaff','splint mail','Hawaiian shirt','T-shirt','large box','long sword','ring mail'].forEach((name) => assert(`inventory row ${name} visible`, new RegExp(name, 'i').test(rowText), rowText));
    assert('inventory item cards show cleaned item names, not raw leading selector text', !/^\s*[a-z]\s+-\s+/mi.test(rowText), rowText);
    assert('inventory overview rows do not show vague CHOOSE badges', !metrics.rows.some((row) => row.badges.some((badge) => /^CHOOSE$/i.test(badge))) && !/\bCHOOSE\b/.test(rowText), JSON.stringify(metrics.rows));
    assert('single-clicking inventory row is a no-op with no modal/context popup', metrics.singleClickHelmetSent === '' && metrics.singleClickHelmetOpen && /Equipment \/ Inventory/i.test(metrics.singleClickHelmetTitle || '') && !metrics.singleClickContextOpen, JSON.stringify({ sent: metrics.singleClickHelmetSent, title: metrics.singleClickHelmetTitle, open: metrics.singleClickHelmetOpen, context: metrics.singleClickContextOpen }));
    const wearHelmetNativeCommand = (metrics.wearHelmetCommands || []).find((command) => command.actionId === 'item.wear' && command.payload?.route?.command === 'Wm');
    assert('double-clicking unequipped armor row waits for backing inventory menu close before selector/native command', metrics.wearHelmetBeforeCloseSent === '\u001b' && !(metrics.wearHelmetBeforeCloseCommands || []).some((command) => command.actionId === 'item.wear'), JSON.stringify({ before: metrics.wearHelmetBeforeCloseSent, beforeCommands: metrics.wearHelmetBeforeCloseCommands, after: metrics.wearHelmetSent, afterCommands: metrics.wearHelmetCommands }));
    assert('double-clicking unequipped armor row uses native uiCommand Wear route after the backing menu closes', metrics.wearHelmetSent === '\u001bi' && wearHelmetNativeCommand && wearHelmetNativeCommand.commandType === 'action.execute' && wearHelmetNativeCommand.payload?.promptPolicy === 'no-followup', JSON.stringify({ sent: metrics.wearHelmetSent, commands: metrics.wearHelmetCommands }));
    assert('equipment screen stays open when NetHack reports the backing inventory menu closed after an equipment action', metrics.wearHelmetAfterCloseSignal?.open && /Equipment \/ Inventory/i.test(metrics.wearHelmetAfterCloseSignal.title || '') && /Hero equipment/i.test(metrics.wearHelmetAfterCloseSignal.paper || ''), JSON.stringify(metrics.wearHelmetAfterCloseSignal));
    assert('equipment screen live-refreshes newly equipped item into the matching slot and updates the inventory row helper text', metrics.wearHelmetAfterRefresh?.open && /Equipment \/ Inventory/i.test(metrics.wearHelmetAfterRefresh.title || '') && /helmet/i.test(metrics.wearHelmetAfterRefresh.helmetSlot || '') && /being worn/i.test(metrics.wearHelmetAfterRefresh.helmetRow || ''), JSON.stringify(metrics.wearHelmetAfterRefresh));
    assert('equipment screen ignores late close signals after live refresh from an equipment action', metrics.wearHelmetAfterLateCloseSignal?.open && /Equipment \/ Inventory/i.test(metrics.wearHelmetAfterLateCloseSignal.title || '') && /Hero equipment/i.test(metrics.wearHelmetAfterLateCloseSignal.paper || '') && /helmet/i.test(metrics.wearHelmetAfterLateCloseSignal.helmetSlot || '') && /being worn/i.test(metrics.wearHelmetAfterLateCloseSignal.helmetRow || ''), JSON.stringify(metrics.wearHelmetAfterLateCloseSignal));
    assert('double-clicking replacement armor under a cloak routes outer cloak off, suit off, then wear in one smooth sequence', /^\u001bTdTcWpi?$/.test(metrics.swapArmorSent) && /cloak of protection.*ring mail.*splint mail/i.test(metrics.swapArmorFeedback) && /Change armor/i.test(metrics.swapArmorRow) && /removes 2 armor layers first/i.test(metrics.swapArmorAria), JSON.stringify({ sent: metrics.swapArmorSent, feedback: metrics.swapArmorFeedback, row: metrics.swapArmorRow, aria: metrics.swapArmorAria }));
    assert('double-clicking replacement shirt under suit and cloak routes all outer layers before shirt replacement', /^(?:\u001b)?TdTcTrWqi?$/.test(metrics.layeredShirtSwapSent) && /cloak of protection.*ring mail.*T-shirt.*Hawaiian shirt/i.test(metrics.layeredShirtFeedback) && /Change armor/i.test(metrics.layeredShirtRow), JSON.stringify({ sent: metrics.layeredShirtSwapSent, feedback: metrics.layeredShirtFeedback, row: metrics.layeredShirtRow }));
    const removeRingNativeCommand = (metrics.removeRingCommands || []).find((command) => command.commandType === 'equipment.change' && command.payload?.action === 'removeAccessory' && Number.isInteger(command.payload?.itemId));
    assert('double-clicking equipped ring row uses direct equipment.change Remove route without selector choreography', /^\u001b?i?$/.test(metrics.removeRingSent) && !/R[a-zA-Z]/.test(metrics.removeRingSent) && removeRingNativeCommand, JSON.stringify({ sent: metrics.removeRingSent, commands: metrics.removeRingCommands }));
    const takeOffArmorNativeCommand = (metrics.takeOffArmorCommands || []).find((command) => command.commandType === 'equipment.change' && command.payload?.action === 'takeOff' && command.payload?.slotId === 'armor.body' && Number.isInteger(command.payload?.itemId));
    const quiverNativeCommand = (metrics.quiverCommands || []).find((command) => command.commandType === 'equipment.change' && command.payload?.action === 'clearQuiver' && command.payload?.slotId === 'quiver');
    const swapNativeCommand = (metrics.swapCommands || []).find((command) => command.actionId === 'slot.swapMainAlternate' && command.payload?.route?.command === 'x');
    assert('hero equipment armor slot routes direct equipment.change take-off after canceling the backing menu without opening item-action modal', /^\u001b?i?$/.test(metrics.takeOffArmorSent) && !/T[a-zA-Z]/.test(metrics.takeOffArmorSent) && takeOffArmorNativeCommand && /Equipment \/ Inventory/i.test(metrics.takeOffArmorTitle || '') && !/Take off.*Choose item|Do what with/i.test(`${metrics.takeOffArmorTitle}\n${metrics.takeOffArmorPrompt}`), JSON.stringify({ sent: metrics.takeOffArmorSent, title: metrics.takeOffArmorTitle, prompt: metrics.takeOffArmorPrompt, commands: metrics.takeOffArmorCommands }));
    assert('hero equipment quiver slot routes direct equipment.change clearQuiver without selector choreography', /^\u001b?i?$/.test(metrics.quiverSent) && !/Q[a-zA-Z]/.test(metrics.quiverSent) && quiverNativeCommand, JSON.stringify({ sent: metrics.quiverSent, commands: metrics.quiverCommands }));
    assert('hero equipment alternate slot routes first-class semantic swap command after canceling the backing inventory menu', ((/^i?$/.test(metrics.swapSent) && swapNativeCommand) || /^(?:\u001b)?xi?$/.test(metrics.swapSent)) && /Swap main hand with alternate weapon/i.test(metrics.swapFeedback), JSON.stringify({ sent: metrics.swapSent, feedback: metrics.swapFeedback, commands: metrics.swapCommands }));
    assert('hero equipment swap button uses semantic action label', /Swap with alternate weapon/i.test(slotText), slotText);
    assert('right-click alternate slot exposes first-class swap action with player-facing hint', /Swap with alternate weapon[\s\S]*Swap your main-hand and alternate weapons/i.test(metrics.offhandContextMenuText), metrics.offhandContextMenuText);
    assert('post-swap equipment refresh shows labels swapped', metrics.swappedSlotText.some((s) => s.slot === 'main-hand' && /dagger/i.test(s.text)) && metrics.swappedSlotText.some((s) => s.slot === 'offhand' && /long sword/i.test(s.text)), JSON.stringify(metrics.swappedSlotText));
    assert('duplicate main-hand snapshot does not create a fake alternate/offhand item or swap/take-off controls', /long sword/i.test(noAlternateMetrics.mainText) && /No alternate\/offhand metadata known/i.test(noAlternateMetrics.offhandText) && !noAlternateMetrics.offhandEquipped && !/long sword|Swap with alternate weapon|Take off/i.test(noAlternateMetrics.offhandText) && noAlternateMetrics.offhandButtonLabels.length === 0 && !/Swap with alternate weapon|Take off/i.test(noAlternateMetrics.offhandContextMenuText), JSON.stringify(noAlternateMetrics));
    assert('body armor and shirt have a single visible body card with no overlapping duplicate armor-body cards', noAlternateMetrics.armorCards.length === 1 && noAlternateMetrics.armorCards[0].slot === 'armor-suit' && /leather armor/i.test(noAlternateMetrics.armorCards[0].text) && !/T-shirt/.test(noAlternateMetrics.armorCards[0].text), JSON.stringify(noAlternateMetrics.armorCards));
    const shirtTakeoffNativeCommand = (shirtAfterTakeoffMetrics.commands || []).find((command) => command.commandType === 'equipment.change' && command.payload?.action === 'takeOff' && command.payload?.slotId === 'armor.body' && Number.isInteger(command.payload?.itemId));
    assert('taking off body armor while a shirt remains routes direct equipment.change take-off and reveals exactly one shirt-backed body card', /^\u001b?i?$/.test(shirtAfterTakeoffMetrics.sent) && !/T[a-zA-Z]/.test(shirtAfterTakeoffMetrics.sent) && shirtTakeoffNativeCommand && shirtAfterTakeoffMetrics.armorCards.length === 1 && shirtAfterTakeoffMetrics.armorCards[0].slot === 'armor-suit' && /T-shirt/i.test(shirtAfterTakeoffMetrics.armorCards[0].text) && !/leather armor/i.test(shirtAfterTakeoffMetrics.armorCards[0].text) && /No alternate\/offhand metadata known/i.test(shirtAfterTakeoffMetrics.offhandText) && !shirtAfterTakeoffMetrics.offhandEquipped && shirtAfterTakeoffMetrics.offhandButtons.length === 0, JSON.stringify(shirtAfterTakeoffMetrics));
    const dragHelmetNativeCommand = (metrics.dragHelmet.commands || []).find((command) => command.actionId === 'item.wear' && command.payload?.route?.command === 'Wm');
    const dragDartsMainHandNativeCommand = (metrics.dragDartsMainHand.commands || []).find((command) => command.commandType === 'equipment.change' && command.payload?.action === 'wieldMain' && Number.isInteger(command.payload?.itemId));
    const dragDartsQuiverNativeCommand = (metrics.dragDartsQuiver.commands || []).find((command) => command.commandType === 'equipment.change' && command.payload?.action === 'quiver' && command.payload?.slotId === 'quiver' && Number.isInteger(command.payload?.itemId));
    assert('drag helmet to helmet slot routes native wear command plus selector', (((/^i?$/.test(metrics.dragHelmet.sent) || /^\u001b$/.test(metrics.dragHelmet.sent)) && dragHelmetNativeCommand) || /^(?:\u001b)?Wmi?$/.test(metrics.dragHelmet.sent)) && /Wear|Helmet/i.test(metrics.dragHelmet.feedback), JSON.stringify(metrics.dragHelmet));
    assert('drag staff to main-hand stays in native/safe equipment routing without opening item actions', /^i?$/.test(metrics.dragStaffMainHand.sent) && /shield is equipped|no writable shim child/i.test(metrics.dragStaffMainHand.feedback) && /Equipment \/ Inventory/i.test(metrics.dragStaffMainHand.title) && metrics.dragStaffMainHand.open && !/Do what with|Choose an action for this item|Throw one of these|Wield this stack as your weapon/i.test(metrics.dragStaffMainHand.body), JSON.stringify(metrics.dragStaffMainHand));
    assert('drag darts to main-hand routes direct equipment.change wield command without row-click fallthrough', (/^\u001b?i?$/.test(metrics.dragDartsMainHand.sent) || /^\u001b$/.test(metrics.dragDartsMainHand.sent)) && !/w[a-zA-Z]/.test(metrics.dragDartsMainHand.sent) && dragDartsMainHandNativeCommand && /Wield|main hand|no writable shim child/i.test(metrics.dragDartsMainHand.feedback) && /Equipment \/ Inventory/i.test(metrics.dragDartsMainHand.title) && metrics.dragDartsMainHand.open, JSON.stringify(metrics.dragDartsMainHand));
    assert('drag darts to quiver routes direct equipment.change quiver command without row-click fallthrough', (/^\u001b?i?$/.test(metrics.dragDartsQuiver.sent) || /^\u001b$/.test(metrics.dragDartsQuiver.sent)) && !/Q[a-zA-Z]/.test(metrics.dragDartsQuiver.sent) && dragDartsQuiverNativeCommand && /quiver|Ready|no writable shim child/i.test(metrics.dragDartsQuiver.feedback), JSON.stringify(metrics.dragDartsQuiver));
    assert('right-click darts context menu shows modern semantic actions', /Wield in main hand/i.test(metrics.contextMenuText) && /Ready in quiver/i.test(metrics.contextMenuText) && /Throw/i.test(metrics.contextMenuText) && /Drop/i.test(metrics.contextMenuText), metrics.contextMenuText);
    assert('right-click darts context menu keeps semantic action ids in DOM only', ['item.wield.mainHand','item.quiver','item.throw','item.drop'].every((id) => metrics.contextActionIds.includes(id)), JSON.stringify(metrics.contextActionIds));
    assert('right-click lower/scrolled container row opens context menu for exact large box row', /large box/i.test(metrics.largeBoxContextHeader) && /Open \/ loot \/ apply/i.test(metrics.largeBoxContextMenuText), JSON.stringify({ header: metrics.largeBoxContextHeader, menu: metrics.largeBoxContextMenuText }));
    const largeBoxNativeCommand = (metrics.largeBoxApplyCommands || []).find((command) => command.actionId === 'item.lootOrApply' && command.payload?.route?.command === 'ay');
    assert('right-click lower/scrolled container action uses selected large box selector, not darts', (((/^i?$/.test(metrics.largeBoxApplySent) || metrics.largeBoxApplySent === '') && largeBoxNativeCommand) || /^(?:\u001b)?ayi?$/.test(metrics.largeBoxApplySent)) && /large box|no writable shim child/i.test(metrics.largeBoxApplyFeedback) && !/\ban\b|darts/i.test(metrics.largeBoxApplyFeedback), JSON.stringify({ sent: metrics.largeBoxApplySent, feedback: metrics.largeBoxApplyFeedback, commands: metrics.largeBoxApplyCommands }));
    assert('right-click context menus have no raw/generic/developer-facing leakage', !metrics.rawGenericContextLeak, `${metrics.contextMenuText}\n${metrics.offhandContextMenuText}`);
    assert('equipment-slot drops never open generic item-action menu', !/Do what with the darts\?|Do what with.*staff|Choose an action for this item|Throw one of these|Wield this stack as your weapon/i.test(`${metrics.dragStaffMainHand.body}\n${metrics.dragDartsMainHand.body}\n${metrics.dragDartsQuiver.body}`), JSON.stringify({ staff: metrics.dragStaffMainHand, main: metrics.dragDartsMainHand, quiver: metrics.dragDartsQuiver }));
    assert('invalid drag is rejected without sending unsafe input', metrics.dragInvalidFoodToHelmet.sent === '' && /does not match|Only/i.test(metrics.dragInvalidFoodToHelmet.feedback), JSON.stringify(metrics.dragInvalidFoodToHelmet));
    assert('slots are spatially arranged around the enlarged player avatar, not a plain list', metrics.slotBoxes.helmet?.top < metrics.slotBoxes['armor-suit']?.top && metrics.slotBoxes['main-hand']?.left > metrics.slotBoxes.shield?.left, JSON.stringify(metrics.slotBoxes));
    const slotLayoutProblems = Object.entries(metrics.slotBoxes).filter(([, box]) => box.left < 8 || box.top < -1 || box.right > metrics.stageSize.width - 8 || box.bottom > metrics.stageSize.height - 1).map(([slot, box]) => ({ slot, box }));
    assert('equipment cards stay inside the paper-doll stage while avatar can sit behind them', slotLayoutProblems.length === 0, JSON.stringify({ stage: metrics.stageSize, avatar: metrics.avatarStageBox, slotLayoutProblems, boxes: metrics.slotBoxes }));
    assert('snapshot-backed inventory overview is enabled by default and uses public snapshot rows instead of stale compatibility menu text', snapshotVisibleMetrics.defaultInventory.featureFlags.useSnapshotForOverview === true && snapshotVisibleMetrics.defaultInventory.snapshotRevision === 21 && /spear/i.test(snapshotVisibleMetrics.defaultRows.join('\n')) && /ring mail/i.test(snapshotVisibleMetrics.defaultRows.join('\n')) && /pearl ring/i.test(snapshotVisibleMetrics.defaultRows.join('\n')) && !/stale menu|levitation/i.test(snapshotVisibleMetrics.defaultRows.join('\n')), JSON.stringify(snapshotVisibleMetrics));
    assert('inventory overview still has guarded compatibility fallback when the snapshot flag is disabled', snapshotVisibleMetrics.disabledInventoryFlags.useSnapshotForOverview === false && /stale menu spear label/i.test(snapshotVisibleMetrics.fallbackRows.join('\n')), JSON.stringify(snapshotVisibleMetrics));
    assert('snapshot-backed equipment paper doll is enabled by default and renders public worn-mask slots without leaking hidden ring identity', snapshotVisibleMetrics.equipmentSnapshot.featureFlags.useSnapshotForPaperDoll === true && snapshotVisibleMetrics.equipmentSnapshot.revision === 8 && /spear/i.test(snapshotVisibleMetrics.equipmentDefault.text) && /ring mail/i.test(snapshotVisibleMetrics.equipmentDefault.text) && /pearl ring/i.test(snapshotVisibleMetrics.equipmentDefault.text) && !/levitation/i.test(snapshotVisibleMetrics.equipmentDefault.text), JSON.stringify(snapshotVisibleMetrics));
    assert('equipment paper doll can still fall back to compatibility routing behind the feature flag', snapshotVisibleMetrics.disabledEquipmentFlags.useSnapshotForPaperDoll === false && snapshotVisibleMetrics.reenabledEquipmentFlags.useSnapshotForPaperDoll === true && /spear/i.test(snapshotVisibleMetrics.equipmentReenabled.text), JSON.stringify(snapshotVisibleMetrics));
    assert('no raw inventory selector labels or intro text', !/Inventory selector|Welcome to NetHack|Shall I pick/i.test(`${metrics.body} ${rowText}`));
    const summary = { ok: true, screenshots: { button: buttonScreenshot, promptlessButton: promptlessScreenshot, richFixture: screenshot, snapshotFlag: snapshotFlagScreenshot, noAlternate: noAlternateScreenshot, shirtAfterTakeoff: shirtAfterTakeoffScreenshot }, routeMetrics, promptlessMetrics, snapshotVisibleMetrics, noAlternateMetrics, shirtAfterTakeoffMetrics, metrics };
    fs.writeFileSync(path.join(outDir, 'equipment-screen-rpg-summary.json'), JSON.stringify(summary, null, 2));
    console.log(`equipment screen RPG test passed: ${screenshot}`);
  } catch (error) {
    fs.writeFileSync(path.join(outDir, 'equipment-screen-rpg-failure.log'), error.stack || String(error));
    throw error;
  } finally { cleanup(); }
}

main().catch((error) => { console.error(error); process.exit(1); });
