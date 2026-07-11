const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-scenario-identity-equipment');
const scenarioId = 'identity/valkyrie-equipped-inventory';
const port = Number(process.env.NH_SCENARIO_IDENTITY_CDP_PORT || 9635);
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function press(cdp, key, code, text) { const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0; const params = { key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }; if (text !== undefined) params.text = text; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => {
  const summarizeCell = (el) => el ? ({ x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), className: el.className || '', tileId: el.dataset.tileId || '', semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '', aria: el.getAttribute('aria-label') || '', text: el.textContent || '' }) : null;
  const hero = Array.from(document.querySelectorAll('.tile-cell')).find((el) => ['hero', 'player'].includes(el.dataset.semanticKind) || el.dataset.glyph === '@');
  return {
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
    statusText: document.getElementById('status')?.textContent || '',
    statusLines: document.getElementById('status-lines')?.textContent || '',
    stats: document.getElementById('stats-panel')?.innerText || '',
    messages: window.__nethackPromptTest?.messages?.().slice(-18).map((m) => m.text || String(m)) || [],
    inventory: window.__nethackPromptTest?.inventory?.(),
    equipment: window.__nethackPromptTest?.equipment?.(),
    interaction: window.__nethackPromptTest?.dialog?.(),
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    hero: summarizeCell(hero),
    body: document.body.innerText,
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
    shim: document.getElementById('shim-output')?.innerText || ''
  };
})()`); }
async function start(cdp) {
  await click(cdp, '#start-shim');
  await delay(250);
  if ((await state(cdp)).dialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game');
  await waitFor(() => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 7000);
  await evalExpr(cdp, `(() => { document.getElementById('player-name').value = 'ScenarioIdentity' + Date.now().toString(36).slice(-5); document.getElementById('player-name').dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click(cdp, '#confirm-character');
  await waitFor(async () => (await state(cdp)).running, 20000);
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`);
}
function hasText(text, pattern) { return pattern.test(String(text || '')); }
function isIdentityVisible(s) {
  const publicText = [s.statusText, s.statusLines, s.stats, s.messages.join('\n'), s.hero?.aria, s.hero?.semanticName, s.hero?.tileId].join('\n');
  return /Valkyrie|\bVal\b/i.test(publicText) && /female|Fem/i.test(publicText) && /lawful|Law/i.test(publicText);
}
function isScenarioEquipmentScreen(s) {
  const dialogText = `${s.interaction?.title || ''}\n${s.interaction?.prompt || ''}\n${s.interaction?.panelControls?.text || ''}\n${(s.interaction?.options || []).map((o) => o.text || '').join('\n')}`;
  return Boolean(s.interaction?.interactionOpen)
    && /Equipment\s*\/\s*Inventory/i.test(s.interaction.title || '')
    && /Hero equipment/i.test(s.interaction.panelControls?.text || '')
    && /long sword/i.test(dialogText)
    && /shield/i.test(dialogText)
    && /leather armor/i.test(dialogText)
    && /arrow/i.test(dialogText)
    && /wand of digging/i.test(dialogText);
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', (d) => { logs += d; process.stdout.write(d); }); child.stderr.on('data', (d) => { logs += d; process.stderr.write(d); });
  let cdp; const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); fs.writeFileSync(path.join(outDir, 'electron.log'), logs); };
  process.on('exit', cleanup);
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    const loaded = await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
    const gameplay = await waitFor(async () => { const s = await state(cdp); return isIdentityVisible(s) ? s : null; }, 10000).catch(async (error) => { const debug = await state(cdp).catch(() => ({})); fs.writeFileSync(path.join(outDir, 'scenario-identity-timeout-debug.json'), JSON.stringify(debug, null, 2)); await shot(cdp, 'debug-scenario-identity-timeout.png').catch(() => undefined); throw error; });
    const gameplayShot = await shot(cdp, '01-scenario-valkyrie-status-map.png');
    await evalExpr(cdp, "document.getElementById('game-grid')?.focus?.(); window.__nethackPromptTest?.clearSentInputs?.();");
    await press(cdp, 'i', 'KeyI', 'i');
    const equipmentScreen = await waitFor(async () => { const s = await state(cdp); return isScenarioEquipmentScreen(s) ? s : null; }, 10000).catch(async (error) => { const debug = await state(cdp).catch(() => ({})); fs.writeFileSync(path.join(outDir, 'scenario-equipment-timeout-debug.json'), JSON.stringify(debug, null, 2)); await shot(cdp, 'debug-scenario-equipment-timeout.png').catch(() => undefined); throw error; });
    const inventoryShot = await shot(cdp, '02-scenario-valkyrie-equipment-inventory.png');
    const dialogText = `${equipmentScreen.interaction.title}\n${equipmentScreen.interaction.prompt}\n${equipmentScreen.interaction.panelControls.text}\n${equipmentScreen.interaction.options.map((o) => o.text).join('\n')}`;
    const equipmentText = equipmentScreen.interaction.panelControls.text || equipmentScreen.equipment.text || '';
    fs.writeFileSync(path.join(outDir, 'pre-assert-equipment-debug.json'), JSON.stringify({ equipmentScreen, dialogText, equipmentText }, null, 2));
    assert('identity proof has no NetHack impossible/program disorder messages', !/Program in disorder|Please report these messages|m_detach/i.test(`${gameplay.messages.join('\n')}\n${equipmentScreen.messages.join('\n')}\n${equipmentScreen.body}`), JSON.stringify({ gameplay: gameplay.messages, equipment: equipmentScreen.messages }));
    assert('hero cell is public hero/player semantics, not monster semantics', ['hero', 'player'].includes(String(gameplay.hero?.semanticKind || '').toLowerCase()), JSON.stringify(gameplay.hero));
    assert('visible equipment state is not contradictory', !/weapon in (?:right |left )?hand[\s\S]*alternate weapon; not wielded|alternate weapon; not wielded[\s\S]*weapon in (?:right |left )?hand/i.test(dialogText), dialogText);
    assert('wand is charged but not mislabeled as quivered/readied ammo', !/wand of digging[\s\S]*READY IN QUIVER|READY IN QUIVER[\s\S]*wand of digging/i.test(dialogText), dialogText);
    assert('inventory shows blessed +1 long sword wielded', /blessed \+1 long sword/i.test(dialogText) && /weapon in hand|weapon in right hand|wielded|main hand/i.test(dialogText), dialogText);
    assert('inventory shows worn shield', /(?:small|wooden) shield/i.test(dialogText) && /being worn|Shield/i.test(dialogText), dialogText);
    assert('inventory shows worn leather armor', /leather armor/i.test(dialogText) && /being worn|Armor/i.test(dialogText), dialogText);
    assert('inventory shows quivered arrows', /12 arrows/i.test(dialogText) && /in quiver|Quiver/i.test(dialogText), dialogText);
    assert('inventory shows charged wand of digging', /wand of digging/i.test(dialogText) && /\(0:3\)|3 charge|charges/i.test(dialogText), dialogText);
    assert('paper doll equipment slots show scenario gear', /Weapon \/ main hand[\s\S]*long sword/i.test(equipmentText) && /Shield[\s\S]*(?:small|wooden) shield/i.test(equipmentText) && /Armor \/ body[\s\S]*leather armor/i.test(equipmentText) && /Quiver[\s\S]*arrow/i.test(equipmentText), equipmentText);
    assert('paper doll does not duplicate the wielded sword into empty alternate/offhand', /Weapon \/ main hand[\s\S]*long sword/i.test(equipmentText) && /Alternate \/ offhand[\s\S]*No alternate\/offhand metadata known/i.test(equipmentText) && !/Alternate \/ offhand[\s\S]*long sword/i.test(equipmentText) && !/Alternate \/ offhand[\s\S]*Swap with alternate weapon/i.test(equipmentText), equipmentText);
    const offhandControlEvidence = await evalExpr(cdp, `(() => {
      const offhandSlot = document.querySelector('.paper-doll-slots .equipment-slot[data-slot="offhand"]');
      const buttonLabels = Array.from(offhandSlot?.querySelectorAll('button') || []).map((button) => button.textContent.trim());
      document.querySelector('.inventory-context-menu')?.remove?.();
      offhandSlot?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 520, clientY: 360 }));
      const contextText = document.querySelector('.equipment-slot-context-menu')?.innerText || '';
      return { text: offhandSlot?.innerText || '', equipped: offhandSlot?.classList.contains('equipped') || false, buttonLabels, contextText };
    })()`);
    assert('empty alternate/offhand exposes no invalid swap or take-off controls', /No alternate\/offhand metadata known/i.test(offhandControlEvidence.text) && !offhandControlEvidence.equipped && offhandControlEvidence.buttonLabels.length === 0 && !/Swap with alternate weapon|Take off/i.test(`${offhandControlEvidence.text}\n${offhandControlEvidence.contextText}`), JSON.stringify(offhandControlEvidence));
    assert('scenario inventory is hermetic and does not include starter spear/oil lamp', !/\bspear\b|oil lamp/i.test(dialogText), dialogText);
    assert('inventory UI avoids fallback labels', !/Inventory selector|Name unavailable|Loading your inventory/i.test(dialogText), dialogText);

    await evalExpr(cdp, "window.__nethackPromptTest?.clearSentInputs?.();");
    await click(cdp, '.paper-doll-slots .equipment-slot[data-slot="armor-suit"] button[data-command-key="T"]');
    const afterTakeOff = await waitFor(async () => {
      const s = await state(cdp);
      const text = `${s.interaction?.title || ''}\n${s.interaction?.prompt || ''}\n${s.interaction?.panelControls?.text || ''}\n${(s.interaction?.options || []).map((o) => o.text || '').join('\n')}`;
      return /Equipment\s*\/\s*Inventory/i.test(s.interaction?.title || '') && /Armor \/ body[\s\S]*No body armor worn/i.test(text) ? s : null;
    }, 12000).catch(async (error) => { const debug = await state(cdp).catch(() => ({})); fs.writeFileSync(path.join(outDir, 'takeoff-timeout-debug.json'), JSON.stringify(debug, null, 2)); await shot(cdp, 'debug-takeoff-timeout.png').catch(() => undefined); throw error; });
    const takeOffShot = await shot(cdp, '03-scenario-armor-takeoff-direct.png');
    const takeOffText = `${afterTakeOff.interaction?.title || ''}\n${afterTakeOff.interaction?.prompt || ''}\n${afterTakeOff.interaction?.panelControls?.text || ''}\n${(afterTakeOff.interaction?.options || []).map((o) => o.text || '').join('\n')}`;
    assert('armor slot Take off sends cancel plus direct take-off selector and refreshes inventory', afterTakeOff.sent.startsWith('\u001bT'), afterTakeOff.sent);
    assert('armor slot Take off does not leave the item action modal/prompt visible', !/Take off\s*→\s*Choose item|Do what with .*leather armor\?|Name this specific leather armor|Take off this armor/i.test(takeOffText), takeOffText);
    assert('equipment state updates after take-off', /Armor \/ body[\s\S]*No body armor worn/i.test(takeOffText) && /leather armor[\s\S]*Wear in matching slot/i.test(takeOffText), takeOffText);
    const afterTakeOffOffhand = afterTakeOff.equipment?.slots?.find((entry) => entry.slot === 'offhand') || {};
    assert('alternate/offhand remains empty after armor take-off refresh', /No alternate\/offhand metadata known/i.test(afterTakeOffOffhand.text || '') && !/long sword|Swap with alternate weapon|Take off/i.test(afterTakeOffOffhand.text || '') && afterTakeOffOffhand.equipped === false, JSON.stringify(afterTakeOffOffhand));
    const afterTakeOffSlotEvidence = await evalExpr(cdp, `(() => {
      const cards = Array.from(document.querySelectorAll('.paper-doll-slots .equipment-slot')).map((el) => ({ slot: el.dataset.slot, text: el.innerText, equipped: el.classList.contains('equipped'), box: (() => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) }; })() }));
      const armorLike = cards.filter((card) => ['armor-suit', 'shirt'].includes(card.slot));
      return { cards, armorLike };
    })()`);
    assert('post-takeoff has exactly one visible body/shirt card and no duplicate overlapping armor-body card', afterTakeOffSlotEvidence.armorLike.length === 1 && afterTakeOffSlotEvidence.armorLike[0].slot === 'armor-suit' && /No body armor worn/i.test(afterTakeOffSlotEvidence.armorLike[0].text) && !/leather armor[\s\S]*Take off/i.test(afterTakeOffSlotEvidence.armorLike[0].text), JSON.stringify(afterTakeOffSlotEvidence.armorLike));

    const identityEvidence = { statusText: gameplay.statusText, statusLines: gameplay.statusLines, stats: gameplay.stats, messages: gameplay.messages, hero: gameplay.hero };
    const equipmentEvidence = { dialogTitle: equipmentScreen.interaction.title, options: equipmentScreen.interaction.options, equipmentSlots: equipmentScreen.equipment.slots, offhandControlEvidence, takeOff: { sent: afterTakeOff.sent, screenshot: takeOffShot, text: takeOffText, afterTakeOffSlotEvidence } };
    fs.writeFileSync(path.join(outDir, 'identity-equipment-debug.json'), JSON.stringify({ identityEvidence, equipmentEvidence }, null, 2));
    const summary = [`# Scenario loader identity/equipment real Electron smoke`, '', 'PASS', '', `Scenario: ${scenarioId}`, `Status/map screenshot: ${gameplayShot}`, `Equipment/inventory screenshot: ${inventoryShot}`, `Direct take-off screenshot: ${takeOffShot}`, '', 'Verified scenario public facts through visible UI:', '- identity/status channel includes Valkyrie, female, and lawful', '- inventory rows include blessed +1 long sword, worn shield, worn leather armor, 12 quivered arrows, and wand of digging (0:3)', '- RPG equipment paper-doll slots show weapon, empty alternate/offhand, shield, armor, and quiver items without duplicate sword swap controls', '- clicking Take off on the worn armor slot directly removes it and returns to the equipment screen without the item-action modal', '- post-takeoff equipment screen has one body/shirt card and no duplicate armor-body overlap', '- hermetic inventory excludes starter spear/oil lamp', '', 'Identity evidence:', '```json', JSON.stringify(identityEvidence, null, 2), '```', '', 'Equipment dialog text:', '```', dialogText, '```', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-scenario-identity-equipment-summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
