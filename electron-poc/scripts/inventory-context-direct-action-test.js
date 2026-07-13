const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_INVENTORY_CONTEXT_OUT_DIR || path.join(root, 'test-output', 'inventory-context-direct-action');
const port = Number(process.env.NH_INVENTORY_CONTEXT_CDP_PORT || 9587);
const width = Number(process.env.NH_INVENTORY_CONTEXT_WIDTH || 1360);
const height = Number(process.env.NH_INVENTORY_CONTEXT_HEIGHT || 920);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 100) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out waiting'); }
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout = []; const stderr = [];
  child.stdout.on('data', (d) => stdout.push(String(d)));
  child.stderr.on('data', (d) => stderr.push(String(d)));
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);

    const metrics = await evalExpr(cdp, `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const t = window.__nethackPromptTest;
      const rows = [
        [98, 'b - an uncursed dagger', 41, 'dagger'],
        [101, 'e - an uncursed food ration', 37, 'food ration'],
        [104, 'h - a ring of protection (on left hand)', 61, 'ring'],
        [106, 'j - a scroll labeled STRC PRST SKRZ KRK', 63, 'scroll'],
        [109, 'm - a +0 helmet', 91, 'helmet'],
        [110, 'n - a +0 iron skull cap (being worn)', 91, 'helmet'],
        [113, 'q - a potion of healing', 33, 'potion of healing'],
        [120, 'x - a magic marker', 40, 'magic marker'],
        [121, 'y - a large box', 40, 'large box'],
      ];
      const openInventory = () => {
        t.reset();
        t.setRunning(true);
        t.setUiCommandHandlerForTest(() => ({ ok: true }));
        t.event({ name: 'shim_start_menu', window: 310, requestId: 'inventory-r310', menuRequestId: 'inventory-r310', transactionId: 'inventory-t310' });
        rows.forEach(([selector, text, glyphChar, semanticName], index) => t.event({ name: 'shim_add_menu', window: 310, selector, objectId: 100 + index, text, glyphChar, semanticKind: 'object', semanticName, semanticKnown: true }));
        t.event({ name: 'shim_end_menu', window: 310, prompt: 'Inventory:', requestId: 'inventory-r310', menuRequestId: 'inventory-r310', transactionId: 'inventory-t310' });
        t.event({ name: 'shim_select_menu', window: 310, how: 0, requestId: 'inventory-r310', menuRequestId: 'inventory-r310', transactionId: 'inventory-t310' });
      };
      const answerOwnedInventoryClose = (overrides = {}) => {
        const flow = t.ownedInventoryActionPending?.()?.flow;
        if (!flow) return false;
        t.event({
          name: 'bridge_menu_answer', window: flow.window, menuId: flow.menuId,
          requestId: flow.requestId, menuRequestId: flow.requestId,
          transactionId: flow.transactionId, inputTransactionId: flow.transactionId,
          lifecycleRevision: flow.lifecycleRevision, lifecycle: flow.acknowledgementLifecycle,
          menuPurpose: flow.menuPurpose,
          requestSource: { layer: flow.requestSourceLayer, window: flow.window },
          owner: { kind: flow.ownerKind, window: flow.window },
          activeRequestMatch: true, inputMatchesMenuTransaction: true,
          return: 0, selector: 0, selectors: '',
          ...overrides,
        });
        return true;
      };
      const runContextAction = async (key, actionId) => {
        openInventory();
        const row = document.querySelector('#interaction-options .rpg-inventory-row[data-key="' + key + '"]');
        row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 780, clientY: 360 }));
        const menuText = document.querySelector('.inventory-context-menu')?.innerText || '';
        t.clearSentInputs();
        document.querySelector('.inventory-context-menu .inventory-context-action[data-action-id="' + actionId + '"]')?.click();
        const immediateSent = t.sentInputs().join('');
        const pendingBeforeAnswer = t.ownedInventoryActionPending?.();
        answerOwnedInventoryClose();
        t.event({ name: 'shim_update_inventory', revision: 1, inventoryRevision: 1, equipmentRevision: 1, items: rows.map(([selector, text, glyphChar, semanticName], index) => ({ selector, objectId: 100 + index, text, glyphChar, semanticKind: 'object', semanticName, semanticKnown: true })) });
        const pendingAfterUpdate = t.ownedInventoryActionPending?.();
        await sleep(170);
        const delayedSent = t.sentInputs().join('');
        const sentPayloads = t.sentPayloads?.() || [];
        const sentUiProtocolCommands = t.sentUiProtocolCommands?.() || [];
        const result = {
          key, actionId, menuText, immediateSent, pendingBeforeAnswer, pendingAfterUpdate, delayedSent, sentPayloads, sentUiProtocolCommands,
          dialog: t.dialog(),
          inventory: t.inventory(),
          contextMenuOpen: Boolean(document.querySelector('.inventory-context-menu')),
          body: document.body.innerText,
          feedback: document.getElementById('interaction-feedback')?.textContent || '',
        };
        await sleep(360);
        return result;
      };
      const runStaleRevisionBlock = async () => {
        openInventory();
        t.event({ name: 'shim_update_inventory', revision: 7, inventoryRevision: 7, equipmentRevision: 0, items: rows.map(([selector, text, glyphChar, semanticName], index) => ({ selector, objectId: 100 + index, text, glyphChar, semanticKind: 'object', semanticName, semanticKnown: true })) });
        const row = document.querySelector('#interaction-options .rpg-inventory-row[data-key="j"]');
        row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 780, clientY: 360 }));
        t.clearSentInputs();
        document.querySelector('.inventory-context-menu .inventory-context-action[data-action-id="item.read.scroll"]')?.click();
        const immediateSent = t.sentInputs().join('');
        t.event({ name: 'shim_update_inventory', revision: 99, inventoryRevision: 99, equipmentRevision: 0, items: rows.map(([selector, text, glyphChar, semanticName], index) => ({ selector, objectId: 100 + index, text: selector === 106 ? 'j - a wand of striking' : text, glyphChar, semanticKind: 'object', semanticName: selector === 106 ? 'wand of striking' : semanticName, semanticKnown: true })) });
        answerOwnedInventoryClose();
        await sleep(180);
        return { immediateSent, delayedSent: t.sentInputs().join(''), sentPayloads: t.sentPayloads?.() || [], feedback: document.getElementById('interaction-feedback')?.textContent || '', status: document.getElementById('status')?.textContent || '' };
      };
      const runEquipmentSlotStaleRevisionBlock = async () => {
        openInventory();
        t.event({ name: 'shim_update_inventory', revision: 7, inventoryRevision: 7, equipmentRevision: 7, items: rows.map(([selector, text, glyphChar, semanticName], index) => ({ selector, objectId: 100 + index, text, glyphChar, wornMask: selector === 110 ? 4 : 0, semanticKind: 'object', semanticName, semanticKnown: true })) });
        const helmetButton = Array.from(document.querySelectorAll('.equipment-slot button[data-item-selector]')).find((button) => /take off|remove|change/i.test(button.textContent || '') && /helmet|head/i.test(button.closest('.equipment-slot')?.innerText || ''));
        if (!helmetButton) return { missing: true, body: document.body.innerText };
        t.clearSentInputs();
        helmetButton.click();
        const immediateSent = t.sentInputs().join('');
        t.event({ name: 'shim_update_inventory', revision: 99, inventoryRevision: 99, equipmentRevision: 99, items: rows.map(([selector, text, glyphChar, semanticName], index) => ({ selector, objectId: 100 + index, text: selector === 110 ? 'n - a +0 leather armor (being worn)' : text, glyphChar, wornMask: selector === 110 ? 1 : 0, semanticKind: 'object', semanticName: selector === 110 ? 'leather armor' : semanticName, semanticKnown: true })) });
        answerOwnedInventoryClose();
        await sleep(180);
        return { missing: false, immediateSent, delayedSent: t.sentInputs().join(''), sentPayloads: t.sentPayloads?.() || [], feedback: document.getElementById('interaction-feedback')?.textContent || '', status: document.getElementById('status')?.textContent || '' };
      };
      const runDelayedCancelCorpseDrop = async () => {
        t.reset();
        t.setRunning(true);
        t.event({ name: 'shim_start_menu', window: 320, requestId: 'inventory-r320', menuRequestId: 'inventory-r320', transactionId: 'inventory-t320' });
        [
          [97, 'a - a cursed +1 mace (weapon in right hand)', 41, 'mace'],
          [100, 'd - 4 potions of holy water', 33, 'potion of water'],
          [108, 'l - an iron skull cap', 91, 'helmet'],
          [111, 'o - a goblin corpse', 37, 'goblin corpse'],
        ].forEach(([selector, text, glyphChar, semanticName], index) => t.event({ name: 'shim_add_menu', window: 320, selector, objectId: 201 + index, text, glyphChar, semanticKind: 'object', semanticName, semanticKnown: true }));
        t.event({ name: 'shim_end_menu', window: 320, prompt: 'Inventory:', requestId: 'inventory-r320', menuRequestId: 'inventory-r320', transactionId: 'inventory-t320' });
        t.event({ name: 'shim_select_menu', window: 320, how: 0, requestId: 'inventory-r320', menuRequestId: 'inventory-r320', transactionId: 'inventory-t320' });
        const originalShimInput = window.netHackPOC?.shimInput;
        if (originalShimInput) window.netHackPOC.shimInput = (payload) => Number(payload?.keycode) === 27 ? true : originalShimInput(payload);
        const row = document.querySelector('#interaction-options .rpg-inventory-row[data-key="o"]');
        row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 780, clientY: 690 }));
        const menuText = document.querySelector('.inventory-context-menu')?.innerText || '';
        t.clearSentInputs();
        document.querySelector('.inventory-context-menu .inventory-context-action[data-action-id="item.drop"]')?.click();
        const immediateSent = t.sentInputs().join('');
        await sleep(220);
        const beforeMenuAnswerSent = t.sentInputs().join('');
        if (originalShimInput) window.netHackPOC.shimInput = originalShimInput;
        answerOwnedInventoryClose();
        t.event({ name: 'shim_update_inventory', revision: 1, inventoryRevision: 1, equipmentRevision: 1, items: [
          { selector: 97, objectId: 201, text: 'a - a cursed +1 mace (weapon in right hand)', glyphChar: 41, semanticKind: 'object', semanticName: 'mace', semanticKnown: true },
          { selector: 100, objectId: 202, text: 'd - 4 potions of holy water', glyphChar: 33, semanticKind: 'object', semanticName: 'potion of water', semanticKnown: true },
          { selector: 108, objectId: 203, text: 'l - an iron skull cap', glyphChar: 91, semanticKind: 'object', semanticName: 'helmet', semanticKnown: true },
          { selector: 111, objectId: 204, text: 'o - a goblin corpse', glyphChar: 37, semanticKind: 'object', semanticName: 'goblin corpse', semanticKnown: true },
        ] });
        await sleep(140);
        const afterMenuAnswerSent = t.sentInputs().join('');
        const sentPayloads = t.sentPayloads?.() || [];
        const sentUiProtocolCommands = t.sentUiProtocolCommands?.() || [];
        return {
          rowText: row?.innerText || '',
          rowKey: row?.dataset.key || '',
          menuText,
          immediateSent,
          beforeMenuAnswerSent,
          afterMenuAnswerSent,
          sentPayloads,
          sentUiProtocolCommands,
          body: document.body.innerText,
          dialog: t.dialog(),
          commandTransactions: t.commandTransactions(),
        };
      };
      return {
        inspectDagger: await runContextAction('b', 'item.inspect'),
        nameDagger: await runContextAction('b', 'item.name'),
        applyMarker: await runContextAction('x', 'item.apply'),
        eatFood: await runContextAction('e', 'item.eat'),
        quaffPotion: await runContextAction('q', 'item.quaff'),
        readScroll: await runContextAction('j', 'item.read.scroll'),
        dropDagger: await runContextAction('b', 'item.drop'),
        wieldDagger: await runContextAction('b', 'item.wield.mainHand'),
        wearHelmet: await runContextAction('m', 'item.wear'),
        removeRing: await runContextAction('h', 'item.remove.accessory'),
        takeOffHelmet: await runContextAction('n', 'item.takeOff'),
        lootLargeBox: await runContextAction('y', 'item.lootOrApply'),
        staleRevisionBlock: await runStaleRevisionBlock(),
        equipmentSlotStaleRevisionBlock: await runEquipmentSlotStaleRevisionBlock(),
        delayedCorpseDrop: await runDelayedCancelCorpseDrop(),
      };
    })()`);
    await evalExpr(cdp, `(() => {
      const t=window.__nethackPromptTest; t.reset(); t.setRunning(true); t.clearFailureForTest();
      const identity={requestId:'accepted-final-r399',menuRequestId:'accepted-final-r399',transactionId:'accepted-final-t399'};
      t.event({name:'shim_start_menu',window:399,...identity});
      [
        {selector:97,objectId:3991,text:'a - a blessed rustproof +3 long sword named Dawnbringer',glyphChar:41,semanticKind:'object',semanticName:'long sword',semanticKnown:true},
        {selector:98,objectId:3992,text:'b - an uncursed milky potion called sunrise',glyphChar:33,semanticKind:'object',semanticAppearance:'milky potion',semanticKnown:false,known:{identity:false,appearance:true,naming:true}},
        {selector:121,objectId:3993,text:'y - a large box',glyphChar:40,semanticKind:'object',semanticName:'large box',semanticKnown:true},
      ].forEach((item)=>t.event({name:'shim_add_menu',window:399,...identity,...item}));
      t.event({name:'shim_end_menu',window:399,prompt:'Inventory:',...identity});
      t.event({name:'shim_select_menu',window:399,how:0,...identity});
      return true;
    })()`);
    await waitFor(async () => evalExpr(cdp, `(() => {
      const body = document.body.innerText || '';
      const stale = /inventory revision changed before action execution|stale revision|snapshot|transactionId|objectId/i.test(body);
      return !stale && document.querySelector('#interaction-dialog[open]') ? true : false;
    })()`), 8000, 200).catch(async (error) => { throw new Error(`${error.message}: ${(await evalExpr(cdp, 'document.body.innerText')).slice(0, 3000)}`); });
    const screenshot = await shot(cdp, '01-inventory-context-direct-action-final.png');
    fs.writeFileSync(path.join(outDir, 'inventory-context-direct-action-metrics.json'), JSON.stringify({ metrics, screenshot }, null, 2));

    assert('inspect is a no-turn local action and does not close Inventory or dispatch', metrics.inspectDagger.immediateSent === '' && metrics.inspectDagger.delayedSent === '' && metrics.inspectDagger.sentUiProtocolCommands.length === 0, JSON.stringify(metrics.inspectDagger));
    assert('name action waits for the exact owned close before routing the selected dagger', metrics.nameDagger.immediateSent === '\u001b' && /^\u001b#nameb$/.test(metrics.nameDagger.delayedSent), JSON.stringify(metrics.nameDagger));
    for (const [label, entry, actionId, routeCommand] of [
      ['apply', metrics.applyMarker, 'item.apply', 'ax'],
      ['eat', metrics.eatFood, 'item.eat', 'ee'],
      ['quaff', metrics.quaffPotion, 'item.quaff', 'qq'],
      ['loot-or-apply', metrics.lootLargeBox, 'item.lootOrApply', 'ay'],
    ]) {
      const commands = entry.sentUiProtocolCommands.filter((command) => command.actionId === actionId && command.payload?.route?.command === routeCommand);
      assert(`${label} first sends only the owned backing-menu Escape`, entry.immediateSent === '\u001b', JSON.stringify(entry));
      assert(`${label} dispatches exactly one current-revision semantic command`, entry.delayedSent === '\u001b' && commands.length === 1 && commands[0].expectedRevision?.inventory === entry.inventory.snapshotRevision, JSON.stringify(entry));
    }
    const largeBoxCommand = metrics.lootLargeBox.sentUiProtocolCommands.find((command) => command.actionId === 'item.lootOrApply');
    assert('large-box dispatch owns the exact selected object and never retargets by selector', largeBoxCommand?.payload?.item?.objectId === 108 && largeBoxCommand.payload.item.inventoryLetter === 'y' && largeBoxCommand.payload.route.command === 'ay', JSON.stringify(largeBoxCommand));
    assert('scroll context menu exposes Read', /Read/i.test(metrics.readScroll.menuText), metrics.readScroll.menuText);
    assert('scroll Read first only cancels backing inventory menu', metrics.readScroll.immediateSent === '\u001b', JSON.stringify(metrics.readScroll));
    assert('scroll Read does not fall back to raw read+selector when the native test shim is not running', metrics.readScroll.delayedSent === '\u001b', JSON.stringify(metrics.readScroll));
    assert('scroll Read records the exact native v2 action.execute route', metrics.readScroll.sentUiProtocolCommands.some((command) => command.commandType === 'action.execute' && command.actionId === 'item.read.scroll' && command.payload?.route?.command === 'rj'), JSON.stringify(metrics.readScroll.sentUiProtocolCommands));
    assert('scroll Read does not leave a redundant context/action chooser visible', !metrics.readScroll.contextMenuOpen && !/Do what with|Choose visible item rows/i.test(metrics.readScroll.body), metrics.readScroll.body.slice(0, 1200));
    assert('drop first only cancels backing inventory menu', metrics.dropDagger.immediateSent === '\u001b', JSON.stringify(metrics.dropDagger));
    assert('drop records native drop+selector without raw fallback', metrics.dropDagger.delayedSent === '\u001b' && metrics.dropDagger.sentUiProtocolCommands.some((command) => command.actionId === 'item.drop' && command.payload?.route?.command === 'db'), JSON.stringify(metrics.dropDagger));
    assert('wield records one direct equipment.change without raw selector fallback', metrics.wieldDagger.delayedSent === '\u001b' && metrics.wieldDagger.sentUiProtocolCommands.filter((command) => command.commandType === 'equipment.change' && command.payload?.action === 'wieldMain' && command.payload?.itemId === 100).length === 1, JSON.stringify(metrics.wieldDagger));
    assert('wear remains on the typed action.execute path without raw fallback until direct wear is implemented', metrics.wearHelmet.delayedSent === '\u001b' && metrics.wearHelmet.sentUiProtocolCommands.some((command) => command.actionId === 'item.wear' && command.payload?.route?.command === 'Wm'), JSON.stringify(metrics.wearHelmet));
    assert('remove accessory records one exact-object direct equipment.change without raw selector fallback', metrics.removeRing.delayedSent === '\u001b' && metrics.removeRing.sentUiProtocolCommands.filter((command) => command.commandType === 'equipment.change' && command.payload?.action === 'removeAccessory' && command.payload?.itemId === 102).length === 1, JSON.stringify(metrics.removeRing));
    assert('take off records one direct equipment.change without raw selector fallback', metrics.takeOffHelmet.delayedSent === '\u001b' && metrics.takeOffHelmet.sentUiProtocolCommands.filter((command) => command.commandType === 'equipment.change' && command.payload?.action === 'takeOff' && command.payload?.itemId === 105).length === 1, JSON.stringify(metrics.takeOffHelmet));
    assert('stale revision v2 rejection does not fall back to raw read+selector', metrics.staleRevisionBlock.immediateSent === '\u001b' && metrics.staleRevisionBlock.delayedSent === '\u001b' && !metrics.staleRevisionBlock.sentPayloads.some((payload) => payload.uiProtocolCommandType === 'action.execute'), JSON.stringify(metrics.staleRevisionBlock));
    assert('stale changed target produces no semantic command after the owned close', metrics.staleRevisionBlock.delayedSent === '\u001b', JSON.stringify(metrics.staleRevisionBlock));
    assert('equipment slot stale revision fixture found helmet slot action', !metrics.equipmentSlotStaleRevisionBlock.missing, JSON.stringify(metrics.equipmentSlotStaleRevisionBlock).slice(0, 1200));
    assert('equipment slot stale revision v2 rejection does not fall back to raw selector command', metrics.equipmentSlotStaleRevisionBlock.immediateSent === '\u001b' && !/Tn|Rn|Qn|wn/.test(metrics.equipmentSlotStaleRevisionBlock.delayedSent) && !metrics.equipmentSlotStaleRevisionBlock.sentPayloads.some((payload) => payload.uiProtocolCommandType === 'action.execute'), JSON.stringify(metrics.equipmentSlotStaleRevisionBlock));
    assert('corpse regression row is exact clicked visible row', metrics.delayedCorpseDrop.rowKey === 'o' && /goblin corpse/i.test(metrics.delayedCorpseDrop.rowText) && /goblin corpse/i.test(metrics.delayedCorpseDrop.menuText), JSON.stringify(metrics.delayedCorpseDrop));
    assert('corpse drop action advertises direct row dispatch', /Drop\s+Shortcut: do\. Drops this visible inventory row directly\./i.test(metrics.delayedCorpseDrop.menuText) && !/Drop\s+Shortcut: do\. A follow-up picker may appear/i.test(metrics.delayedCorpseDrop.menuText), metrics.delayedCorpseDrop.menuText);
    assert('corpse drop waits while backing inventory menu still owns selector d', metrics.delayedCorpseDrop.immediateSent === '\u001b' && metrics.delayedCorpseDrop.beforeMenuAnswerSent === '\u001b', JSON.stringify(metrics.delayedCorpseDrop));
    assert('corpse drop records the exact corpse selector in native v2 and never routes through raw holy-water selector d', metrics.delayedCorpseDrop.afterMenuAnswerSent === '\u001b' && metrics.delayedCorpseDrop.sentUiProtocolCommands.some((command) => command.actionId === 'item.drop' && command.payload?.route?.command === 'do'), JSON.stringify(metrics.delayedCorpseDrop));
    assert('corpse drop does not route through holy-water row d', !/Do what with the potions of holy water|Drop this stack/i.test(metrics.delayedCorpseDrop.body), metrics.delayedCorpseDrop.body.slice(0, 1600));
    const redundantText = Object.values(metrics).map((entry) => entry.body).join('\n');
    assert('representative context actions avoid redundant item-action chooser text', !/Do what with .*\?\s*Choose visible item rows|Inventory selector/i.test(redundantText), redundantText.slice(0, 1600));
    const acceptedFrameText = await evalExpr(cdp, 'document.body.innerText');
    assert('accepted final frame contains no stale or internal diagnostic text', !/inventory revision changed before action execution|transactionId|objectId|snapshot rejected/i.test(acceptedFrameText), acceptedFrameText.slice(0, 1800));

    const summary = [`# Inventory context direct action routing`, '', 'PASS', '', `Output: ${outDir}`, `Screenshot: ${screenshot}`, '', 'Verified right-click actions wait for exact request-owned backing-menu cancellation and a stable authoritative revision, then dispatch one typed semantic action; implemented equipment actions use equipment.change while remaining compatibility actions use validated action.execute.', '', 'Commands observed:', `- Read scroll native route: rj`, `- Drop dagger native route: db`, `- Wield dagger direct route: equipment.change wieldMain`, `- Wear helmet typed compatibility route: Wm`, `- Take off helmet direct route: equipment.change takeOff`, `- Corpse drop native route (holy water at d, corpse at o): do`, ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'inventory-context-direct-action-summary.md'), summary);
    console.log(summary);
  } finally {
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), stdout.join(''));
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), stderr.join(''));
    cleanup();
  }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
