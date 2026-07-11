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
        [106, 'j - a scroll labeled STRC PRST SKRZ KRK', 63, 'scroll'],
        [109, 'm - a +0 helmet', 91, 'helmet'],
        [110, 'n - a +0 iron skull cap (being worn)', 91, 'helmet'],
      ];
      const openInventory = () => {
        t.reset();
        t.setRunning(true);
        t.event({ name: 'shim_start_menu', window: 310 });
        rows.forEach(([selector, text, glyphChar, semanticName]) => t.event({ name: 'shim_add_menu', window: 310, selector, text, glyphChar, semanticKind: 'object', semanticName }));
        t.event({ name: 'shim_end_menu', window: 310, prompt: 'Inventory:' });
        t.event({ name: 'shim_select_menu', window: 310, how: 0 });
      };
      const runContextAction = async (key, actionId) => {
        openInventory();
        const row = document.querySelector('#interaction-options .rpg-inventory-row[data-key="' + key + '"]');
        row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 780, clientY: 360 }));
        const menuText = document.querySelector('.inventory-context-menu')?.innerText || '';
        t.clearSentInputs();
        document.querySelector('.inventory-context-menu .inventory-context-action[data-action-id="' + actionId + '"]')?.click();
        const immediateSent = t.sentInputs().join('');
        t.forceCloseCurrentMenuForTest();
        await sleep(170);
        const delayedSent = t.sentInputs().join('');
        const sentPayloads = t.sentPayloads?.() || [];
        const result = {
          key, actionId, menuText, immediateSent, delayedSent, sentPayloads,
          dialog: t.dialog(),
          contextMenuOpen: Boolean(document.querySelector('.inventory-context-menu')),
          body: document.body.innerText,
          feedback: document.getElementById('interaction-feedback')?.textContent || '',
        };
        await sleep(360);
        return result;
      };
      const runStaleRevisionBlock = async () => {
        openInventory();
        t.event({ name: 'shim_update_inventory', revision: 7, inventoryRevision: 7, equipmentRevision: 0, items: rows.map(([selector, text, glyphChar, semanticName]) => ({ selector, text, glyphChar, semanticKind: 'object', semanticName })) });
        const row = document.querySelector('#interaction-options .rpg-inventory-row[data-key="j"]');
        row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 780, clientY: 360 }));
        t.clearSentInputs();
        document.querySelector('.inventory-context-menu .inventory-context-action[data-action-id="item.read.scroll"]')?.click();
        const immediateSent = t.sentInputs().join('');
        t.event({ name: 'shim_update_inventory', revision: 99, inventoryRevision: 99, equipmentRevision: 0, items: rows.map(([selector, text, glyphChar, semanticName]) => ({ selector, text: selector === 106 ? 'j - a wand of striking' : text, glyphChar, semanticKind: 'object', semanticName: selector === 106 ? 'wand of striking' : semanticName })) });
        t.forceCloseCurrentMenuForTest();
        await sleep(180);
        return { immediateSent, delayedSent: t.sentInputs().join(''), sentPayloads: t.sentPayloads?.() || [], feedback: document.getElementById('interaction-feedback')?.textContent || '', status: document.getElementById('status')?.textContent || '' };
      };
      const runEquipmentSlotStaleRevisionBlock = async () => {
        openInventory();
        t.event({ name: 'shim_update_inventory', revision: 7, inventoryRevision: 7, equipmentRevision: 7, items: rows.map(([selector, text, glyphChar, semanticName]) => ({ selector, text, glyphChar, wornMask: selector === 110 ? 4 : 0, semanticKind: 'object', semanticName })) });
        const helmetButton = Array.from(document.querySelectorAll('.equipment-slot button[data-item-selector]')).find((button) => /take off|remove|change/i.test(button.textContent || '') && /helmet|head/i.test(button.closest('.equipment-slot')?.innerText || ''));
        if (!helmetButton) return { missing: true, body: document.body.innerText };
        t.clearSentInputs();
        helmetButton.click();
        const immediateSent = t.sentInputs().join('');
        t.event({ name: 'shim_update_inventory', revision: 99, inventoryRevision: 99, equipmentRevision: 99, items: rows.map(([selector, text, glyphChar, semanticName]) => ({ selector, text: selector === 110 ? 'n - a +0 leather armor (being worn)' : text, glyphChar, wornMask: selector === 110 ? 1 : 0, semanticKind: 'object', semanticName: selector === 110 ? 'leather armor' : semanticName })) });
        t.forceCloseCurrentMenuForTest();
        await sleep(180);
        return { missing: false, immediateSent, delayedSent: t.sentInputs().join(''), sentPayloads: t.sentPayloads?.() || [], feedback: document.getElementById('interaction-feedback')?.textContent || '', status: document.getElementById('status')?.textContent || '' };
      };
      const runDelayedCancelCorpseDrop = async () => {
        t.reset();
        t.setRunning(true);
        t.event({ name: 'shim_start_menu', window: 320 });
        [
          [97, 'a - a cursed +1 mace (weapon in right hand)', 41, 'mace'],
          [100, 'd - 4 potions of holy water', 33, 'potion of water'],
          [108, 'l - an iron skull cap', 91, 'helmet'],
          [111, 'o - a goblin corpse', 37, 'goblin corpse'],
        ].forEach(([selector, text, glyphChar, semanticName]) => t.event({ name: 'shim_add_menu', window: 320, selector, text, glyphChar, semanticKind: 'object', semanticName }));
        t.event({ name: 'shim_end_menu', window: 320, prompt: 'Inventory:' });
        t.event({ name: 'shim_select_menu', window: 320, how: 0 });
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
        t.forceCloseCurrentMenuForTest();
        await sleep(140);
        const afterMenuAnswerSent = t.sentInputs().join('');
        const sentPayloads = t.sentPayloads?.() || [];
        return {
          rowText: row?.innerText || '',
          rowKey: row?.dataset.key || '',
          menuText,
          immediateSent,
          beforeMenuAnswerSent,
          afterMenuAnswerSent,
          sentPayloads,
          body: document.body.innerText,
          dialog: t.dialog(),
          commandTransactions: t.commandTransactions(),
        };
      };
      return {
        readScroll: await runContextAction('j', 'item.read.scroll'),
        dropDagger: await runContextAction('b', 'item.drop'),
        wieldDagger: await runContextAction('b', 'item.wield.mainHand'),
        wearHelmet: await runContextAction('m', 'item.wear'),
        takeOffHelmet: await runContextAction('n', 'item.takeOff'),
        staleRevisionBlock: await runStaleRevisionBlock(),
        equipmentSlotStaleRevisionBlock: await runEquipmentSlotStaleRevisionBlock(),
        delayedCorpseDrop: await runDelayedCancelCorpseDrop(),
      };
    })()`);
    const screenshot = await shot(cdp, '01-inventory-context-direct-action-final.png');
    fs.writeFileSync(path.join(outDir, 'inventory-context-direct-action-metrics.json'), JSON.stringify({ metrics, screenshot }, null, 2));

    assert('scroll context menu exposes Read', /Read/i.test(metrics.readScroll.menuText), metrics.readScroll.menuText);
    assert('scroll Read first only cancels backing inventory menu', metrics.readScroll.immediateSent === '\u001b', JSON.stringify(metrics.readScroll));
    assert('scroll Read sends direct read+selector after menu cancellation', metrics.readScroll.delayedSent === '\u001brj', JSON.stringify(metrics.readScroll));
    assert('scroll Read direct selector command is v2 action.execute validated', metrics.readScroll.sentPayloads.some((payload) => payload.uiProtocolCommandType === 'action.execute' && payload.uiProtocolActionId === 'item.read.scroll'), JSON.stringify(metrics.readScroll.sentPayloads));
    assert('scroll Read does not leave a redundant context/action chooser visible', !metrics.readScroll.contextMenuOpen && !/Do what with|Choose visible item rows/i.test(metrics.readScroll.body), metrics.readScroll.body.slice(0, 1200));
    assert('drop first only cancels backing inventory menu', metrics.dropDagger.immediateSent === '\u001b', JSON.stringify(metrics.dropDagger));
    assert('drop sends direct drop+selector', metrics.dropDagger.delayedSent === '\u001bdb', JSON.stringify(metrics.dropDagger));
    assert('drop direct selector command is v2 action.execute validated', metrics.dropDagger.sentPayloads.some((payload) => payload.uiProtocolCommandType === 'action.execute' && payload.uiProtocolActionId === 'item.drop'), JSON.stringify(metrics.dropDagger.sentPayloads));
    assert('wield sends direct wield+selector', metrics.wieldDagger.delayedSent === '\u001bwb', JSON.stringify(metrics.wieldDagger));
    assert('wear sends direct wear+selector', metrics.wearHelmet.delayedSent === '\u001bWm', JSON.stringify(metrics.wearHelmet));
    assert('take off sends direct take-off+selector', metrics.takeOffHelmet.delayedSent === '\u001bTn', JSON.stringify(metrics.takeOffHelmet));
    assert('stale revision v2 rejection does not fall back to raw read+selector', metrics.staleRevisionBlock.immediateSent === '\u001b' && metrics.staleRevisionBlock.delayedSent === '\u001b' && !metrics.staleRevisionBlock.sentPayloads.some((payload) => payload.uiProtocolCommandType === 'action.execute'), JSON.stringify(metrics.staleRevisionBlock));
    assert('stale revision reports blocked v2 action', /revision changed|blocked/i.test(`${metrics.staleRevisionBlock.feedback} ${metrics.staleRevisionBlock.status}`), JSON.stringify(metrics.staleRevisionBlock));
    assert('equipment slot stale revision fixture found helmet slot action', !metrics.equipmentSlotStaleRevisionBlock.missing, JSON.stringify(metrics.equipmentSlotStaleRevisionBlock).slice(0, 1200));
    assert('equipment slot stale revision v2 rejection does not fall back to raw selector command', metrics.equipmentSlotStaleRevisionBlock.immediateSent === '\u001b' && !/Tn|Rn|Qn|wn/.test(metrics.equipmentSlotStaleRevisionBlock.delayedSent) && !metrics.equipmentSlotStaleRevisionBlock.sentPayloads.some((payload) => payload.uiProtocolCommandType === 'action.execute'), JSON.stringify(metrics.equipmentSlotStaleRevisionBlock));
    assert('corpse regression row is exact clicked visible row', metrics.delayedCorpseDrop.rowKey === 'o' && /goblin corpse/i.test(metrics.delayedCorpseDrop.rowText) && /goblin corpse/i.test(metrics.delayedCorpseDrop.menuText), JSON.stringify(metrics.delayedCorpseDrop));
    assert('corpse drop action advertises direct row dispatch', /Drop\s+Shortcut: do\. Drops this visible inventory row directly\./i.test(metrics.delayedCorpseDrop.menuText) && !/Drop\s+Shortcut: do\. A follow-up picker may appear/i.test(metrics.delayedCorpseDrop.menuText), metrics.delayedCorpseDrop.menuText);
    assert('corpse drop waits while backing inventory menu still owns selector d', metrics.delayedCorpseDrop.immediateSent === '\u001b' && metrics.delayedCorpseDrop.beforeMenuAnswerSent === '\u001b', JSON.stringify(metrics.delayedCorpseDrop));
    assert('corpse drop sends exact corpse selector only after inventory menu cancel acknowledgement', metrics.delayedCorpseDrop.afterMenuAnswerSent === '\u001bdo', JSON.stringify(metrics.delayedCorpseDrop));
    assert('corpse drop does not route through holy-water row d', !/Do what with the potions of holy water|Drop this stack/i.test(metrics.delayedCorpseDrop.body), metrics.delayedCorpseDrop.body.slice(0, 1600));
    const redundantText = Object.values(metrics).map((entry) => entry.body).join('\n');
    assert('representative context actions avoid redundant item-action chooser text', !/Do what with .*\?\s*Choose visible item rows|Inventory selector/i.test(redundantText), redundantText.slice(0, 1600));

    const summary = [`# Inventory context direct action routing`, '', 'PASS', '', `Output: ${outDir}`, `Screenshot: ${screenshot}`, '', 'Verified right-click actions delay command keys until after the backing inventory menu is cancelled, so a selected action routes as command+item selector instead of selecting the item row and opening NetHack\'s item-action menu.', '', 'Commands observed:', `- Read scroll: ${JSON.stringify(metrics.readScroll.delayedSent)}`, `- Drop dagger: ${JSON.stringify(metrics.dropDagger.delayedSent)}`, `- Wield dagger: ${JSON.stringify(metrics.wieldDagger.delayedSent)}`, `- Wear helmet: ${JSON.stringify(metrics.wearHelmet.delayedSent)}`, `- Take off helmet: ${JSON.stringify(metrics.takeOffHelmet.delayedSent)}`, `- Delayed cancel corpse drop (holy water at d, corpse at o): ${JSON.stringify(metrics.delayedCorpseDrop.afterMenuAnswerSent)}`, ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'inventory-context-direct-action-summary.md'), summary);
    console.log(summary);
  } finally {
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), stdout.join(''));
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), stderr.join(''));
    cleanup();
  }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
