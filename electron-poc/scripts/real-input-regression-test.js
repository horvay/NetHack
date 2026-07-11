const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_REAL_INPUT_OUT_DIR || path.join(root, 'test-output', 'real-input-regression');
const port = Number(process.env.NH_REAL_INPUT_CDP_PORT || 9491);
const width = Number(process.env.NH_REAL_INPUT_WIDTH || 1280);
const height = Number(process.env.NH_REAL_INPUT_HEIGHT || 900);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out waiting'); }
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function press(cdp, key, code, text) {
  const params = { key, code: code || key, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0, nativeVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0 };
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
async function state(cdp) { return evalExpr(cdp, `(() => ({
  status: document.getElementById('status')?.textContent || '',
  active: document.activeElement?.id || document.activeElement?.textContent || document.activeElement?.tagName || '',
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map(d => d.id),
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  messages: window.__nethackPromptTest?.messages?.().slice(-6).map(m => m.text || String(m)) || [],
  seen: document.getElementById('shim-output')?.dataset?.seen || '',
  interaction: window.__nethackPromptTest?.dialog?.(),
  automation: window.__nethackAutomation?.state?.(),
  actionOpen: document.getElementById('action-dialog')?.open || false,
  actionText: document.getElementById('action-dialog')?.innerText || '',
  hasMapTarget: Boolean(document.querySelector('.target-selection-controls')),
  movementText: document.getElementById('movement-actions')?.innerText || ''
}))()`); }
async function waitForStarted(cdp) {
  await clickCenter(cdp, '#start-shim'); await delay(200); await clickCenter(cdp, '#confirm-character');
  const started = await waitFor(async () => { const s = await state(cdp); return s.automation?.runningState?.running && /shim_glyph|shim_status_update|shim_curs|shim_putstr/.test(s.seen) ? s : null; }, 20000);
  if (started.dialogs.includes('intro-dialog')) {
    await clickCenter(cdp, '#intro-continue');
    await waitFor(async () => { const s = await state(cdp); return !s.dialogs.includes('intro-dialog') ? s : null; }, 5000);
    await delay(250);
  }
  await evalExpr(cdp, "document.getElementById('game-grid').focus()");
  return state(cdp);
}
async function waitForGameplayReady(cdp, timeoutMs = 7000) {
  return waitFor(async () => {
    const s = await state(cdp);
    if (s.dialogs.length || s.interaction?.interactionOpen) return null;
    if (/menu awaiting item selection|line input|yes\/no/i.test(s.automation?.status || s.status || '')) return null;
    return s.automation?.runningState?.running ? s : null;
  }, timeoutMs);
}
function isRpgEquipmentScreen(s) {
  return Boolean(s?.interaction?.interactionOpen)
    && /Equipment\s*\/\s*Inventory/i.test(s.interaction.title || '')
    && /Hero equipment/i.test(s.interaction.panelControls?.text || '')
    && (s.interaction.options || []).some((option) => /spear|dagger|shield|food ration/i.test(option.text || ''));
}
function hasOldInventoryScreen(s) {
  const dialogText = `${s?.interaction?.title || ''}\n${s?.interaction?.prompt || ''}\n${(s?.interaction?.options || []).map((option) => option.text || '').join('\n')}`;
  return Boolean(s?.interaction?.interactionOpen) && /^(Inventory|NetHack choice)$/i.test(String(s.interaction.title || '').trim()) && !/Hero equipment/i.test(s.interaction.panelControls?.text || '') && /spear|dagger|shield|food ration/i.test(dialogText);
}
async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; const stdout = []; const stderr = [];
  child.stdout.on('data', d => { stdout.push(String(d)); }); child.stderr.on('data', d => { stderr.push(String(d)); });
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  const results = { outDir, screenshots: {}, checks: {} };
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find(p => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find(p => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackAutomation")), 10000);
    results.started = await waitForStarted(cdp);
    results.screenshots.mainGameplay = await shot(cdp, '01-real-gameplay-before-inventory.png');
    await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus();");
    await press(cdp, 'ArrowRight', 'ArrowRight'); await delay(100);
    results.afterMovement = await state(cdp);
    await press(cdp, 'i', 'KeyI', 'i');
    results.afterInventory = await waitFor(async () => { const s = await state(cdp); return isRpgEquipmentScreen(s) ? s : null; }, 7000);
    results.screenshots.inventoryKey = await shot(cdp, '02-real-key-i-rpg-equipment-screen.png');
    await press(cdp, 'Escape', 'Escape');
    results.afterInventoryDismissed = await waitForGameplayReady(cdp);
    await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus();");
    results.beforeInventoryButton = await waitForGameplayReady(cdp);
    results.screenshots.mainGameplayBeforeButton = await shot(cdp, '03-real-gameplay-before-toolbar-button.png');
    await clickCenter(cdp, '#inventory-equipment-button');
    results.afterInventoryButton = await waitFor(async () => { const s = await state(cdp); return isRpgEquipmentScreen(s) ? s : null; }, 7000);
    results.screenshots.inventoryButton = await shot(cdp, '04-real-toolbar-button-rpg-equipment-screen.png');
    await press(cdp, 'Escape', 'Escape');
    await waitFor(async () => { const s = await state(cdp); return !s.dialogs.includes('interaction-dialog') ? s : null; }, 5000);
    await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus();");
    await press(cdp, ',', 'Comma', ','); await delay(300);
    results.afterPickupKeyNoFixture = await state(cdp);
    await evalExpr(cdp, `(() => { const t=window.__nethackPromptTest; t.clearSentInputs(); t.event({name:'shim_start_menu', window:81}); t.event({name:'shim_add_menu', window:81, selector:97, text:'a - a food ration', glyphChar:37, semanticKind:'object', semanticName:'food ration'}); t.event({name:'shim_end_menu', window:81, prompt:'Pick up what?'}); t.event({name:'shim_select_menu', window:81, how:2}); })()`);
    results.pickupFixture = await state(cdp);
    results.screenshots.pickup = await shot(cdp, '04-pickup-flow-prompt.png');
    await clickCenter(cdp, '#interaction-options .choice-button[data-key="a"]');
    await waitFor(async () => {
      const s = await state(cdp);
      const row = s.interaction?.options?.find((option) => option.key === 'a');
      return /☑|selected|checked/i.test(row?.text || s.interaction?.feedback || '') ? s : null;
    }, 3000).catch(async () => state(cdp));
    await clickCenter(cdp, '#interaction-confirm');
    results.afterPickupConfirm = await waitFor(async () => {
      const s = await state(cdp);
      return s.sent === 'a\n' && !s.interaction?.interactionOpen ? s : null;
    }, 5000);
    await evalExpr(cdp, "window.__nethackPromptTest.event({name:'bridge_menu_answer', return:1, selectors:'a'}); window.__nethackPromptTest.clearSentInputs(); if(document.getElementById('interaction-dialog').open) document.getElementById('interaction-dialog').close(); document.getElementById('game-grid').focus();");
    await clickCenter(cdp, '#open-actions'); await delay(100);
    results.afterUseItemActionsClick = await state(cdp);
    results.screenshots.actions = await shot(cdp, '03-after-use-item-actions-click.png');
    await clickCenter(cdp, '#item-actions button[data-command-key="a"]'); await delay(100);
    results.afterActionButton = await state(cdp);
    await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus();");
    await evalExpr(cdp, "window.__nethackPromptTest.event({name:'shim_getlin', query:'What do you want to engrave in the floor here?'}); document.getElementById('interaction-text').focus();");
    await press(cdp, 'ArrowRight', 'ArrowRight'); await press(cdp, 'i', 'KeyI', 'i'); await delay(100);
    results.textOwnerBlock = await state(cdp);
    fs.writeFileSync(path.join(outDir, 'real-input-regression-debug.json'), JSON.stringify(results, null, 2));
    results.checks = {
      realGameStarted: results.started.automation?.runningState?.running && /Velkommen|welcome to NetHack/i.test(results.started.messages.join('\n')),
      noStartupUnknownBlankCommand: !/Unknown command '\s*'|Unknown command/i.test(results.started.messages.join('\n')),
      realMovementReachesBridge: results.afterMovement.sent === 'l',
      realInventoryKeyReachesBridge: /li|i/.test(results.afterInventory.sent),
      keyboardIOpensRpgEquipmentScreen: isRpgEquipmentScreen(results.afterInventory),
      keyboardIDoesNotOpenOldInventory: !hasOldInventoryScreen(results.afterInventory),
      toolbarButtonOpensRpgEquipmentScreen: isRpgEquipmentScreen(results.afterInventoryButton),
      toolbarButtonSendsInventoryCommand: results.afterInventoryButton.sent === 'i',
      toolbarButtonDoesNotOpenOldInventory: !hasOldInventoryScreen(results.afterInventoryButton),
      realPickupKeyReachesBridge: results.afterPickupKeyNoFixture.sent === ',',
      pickupFixtureOpensAndConfirms: results.pickupFixture.interaction?.interactionOpen && results.pickupFixture.interaction?.options?.some((option) => option.key === 'a' && /food ration/i.test(option.text || '')) && results.afterPickupConfirm.sent === 'a\n' && !results.afterPickupConfirm.interaction?.interactionOpen,
      useItemActionsOpens: results.afterUseItemActionsClick.actionOpen && /Eat|Apply|Wield|Drop/i.test(results.afterUseItemActionsClick.actionText),
      actionButtonSendsCommand: results.afterActionButton.sent === 'a',
      keyboardBlockedByTextOwner: results.textOwnerBlock.sent === '',
      noMapTargetPanel: !results.afterUseItemActionsClick.hasMapTarget,
      rightLogOnlyMovementControls: /Walk|Run|Fight/.test(results.afterUseItemActionsClick.movementText) && !/Map target|Preview/.test(results.afterUseItemActionsClick.movementText),
    };
    fs.writeFileSync(path.join(outDir, 'real-input-regression-summary.json'), JSON.stringify(results, null, 2));
    const md = [`# Real input regression`, '', `Output: ${outDir}`, '', '## Checks', ...Object.entries(results.checks).map(([k,v]) => `- ${v ? 'PASS' : 'FAIL'} ${k}`), '', '## Screenshots', ...Object.entries(results.screenshots).map(([k,v]) => `- ${k}: ${v}`), ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-input-regression-summary.md'), md);
    console.log(md);
    const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`Real input regression failed: ${failed.join(', ')}`);
  } finally {
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), stdout.join(''));
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), stderr.join(''));
    cleanup();
  }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
