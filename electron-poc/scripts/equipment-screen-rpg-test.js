const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'tiles', 'manifest.json'), 'utf8'));
const assetsById = new Map((manifest.assets || []).map((asset) => [asset.id, asset]));
function assetUrl(assetId) {
  const asset = assetsById.get(assetId);
  if (!asset?.installedPath) throw new Error(`Missing fixture tile asset ${assetId}`);
  return pathToFileURL(path.resolve(root, '..', asset.installedPath)).href;
}
const fixtureAssetUrls = Object.freeze(Object.fromEntries([
  'spear', 'potion-class-icon', 'helmet', 'arrow', 'leather-armor', 'food-ration', 'pick-axe', 'corpse',
  'long-sword', 'scroll-class-icon', 'wand-class-icon', 'ring-class-icon', 'gem-class-icon', 'chrysoberyl',
  'towel', 'spellbook-class-icon', 'human-valkyrie-female-avatar',
].map((assetId) => [assetId, assetUrl(assetId)])));
const outDir = process.env.NH_EQUIPMENT_SCREEN_OUT_DIR || path.join(root, 'test-output', 'equipment-screen-rpg');
const port = Number(process.env.NH_EQUIPMENT_SCREEN_CDP_PORT || 9491);
const width = Number(process.env.NH_EQUIPMENT_SCREEN_WIDTH || 1440);
const height = Number(process.env.NH_EQUIPMENT_SCREEN_HEIGHT || 1080);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const response = await fetch(url); if (!response.ok) throw new Error(`${response.status} ${url}`); return response.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 100) {
  const started = Date.now(); let lastError;
  while (Date.now() - started < timeoutMs) {
    try { const value = await fn(); if (value) return value; } catch (error) { lastError = error; }
    await delay(stepMs);
  }
  throw lastError || new Error('timed out waiting');
}
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const promise = pending.get(message.id); pending.delete(message.id);
    if (message.error) promise.reject(new Error(JSON.stringify(message.error))); else promise.resolve(message.result);
  });
  return {
    send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); },
    close() { ws.close(); },
  };
}
async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function screenshot(cdp, name) {
  await evaluate(cdp, 'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 60))))');
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(outDir, name); fs.writeFileSync(file, Buffer.from(result.data, 'base64')); return file;
}
async function press(cdp, key, code = key) {
  const virtualKey = key.length === 1 ? key.toUpperCase().charCodeAt(0) : ({ Escape: 27, Enter: 13, ' ': 32 }[key] || 0);
  const params = { key, code, windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}
function assert(name, condition, detail = '') { if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function setViewport(cdp, viewportWidth, viewportHeight) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: viewportWidth, height: viewportHeight, deviceScaleFactor: 1, mobile: false });
  await evaluate(cdp, 'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
}
async function layoutMetrics(cdp) {
  return evaluate(cdp, `(() => {
    const root = document.getElementById('ux-items-root');
    const pane = root.querySelector('.uxm-inventory-pane');
    const list = root.querySelector('.uxm-inventory-list-wrap');
    const rail = root.querySelector('.uxm-selection-rail');
    const rect = (node) => { const box = node?.getBoundingClientRect(); return box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height } : null; };
    const paneBox = rect(pane); const listBox = rect(list); const railBox = rect(rail);
    const rows = Array.from(root.querySelectorAll('.uxm-item-row')).map((row) => ({ box: rect(row), text: row.innerText, icon: row.querySelector('.uxm-item-icon')?.dataset.iconSource || '', image: (() => { const image = row.querySelector('.uxm-item-icon img'); return image ? { src: image.currentSrc || image.src, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, box: rect(image) } : null; })() }));
    const visibleRows = rows.filter((row) => row.box && listBox && row.box.top >= listBox.top - 0.5 && row.box.bottom <= listBox.bottom + 0.5);
    const visibleControls = Array.from(rail?.querySelectorAll(':scope > .uxm-selection-actions > button, :scope > .uxm-selection-actions > details > summary') || []).map((node) => ({ text: node.innerText, box: rect(node) }));
    return {
      viewport: { width: innerWidth, height: innerHeight },
      workspace: rect(root.querySelector('.uxm-items-workspace')),
      pane: paneBox, list: listBox, rail: railBox,
      rowCount: rows.length, visibleRowCount: visibleRows.length,
      resolvedIconCount: rows.filter((row) => row.icon === 'resolved' && row.image?.naturalWidth > 0 && row.image?.naturalHeight > 0).length,
      iconBoxes: rows.map((row) => row.image?.box).filter(Boolean),
      listShare: paneBox && listBox ? listBox.height / paneBox.height : 0,
      railShare: paneBox && railBox ? railBox.height / paneBox.height : 1,
      listScrollHeight: list?.scrollHeight || 0,
      listClientHeight: list?.clientHeight || 0,
      listAndRailSeparated: Boolean(listBox && railBox && listBox.bottom <= railBox.top + 0.5),
      visibleControls,
      controlsContained: visibleControls.every((control) => control.box && paneBox && control.box.left >= paneBox.left && control.box.right <= paneBox.right && control.box.top >= paneBox.top && control.box.bottom <= paneBox.bottom),
      rootHorizontalOverflow: root.scrollWidth > root.clientWidth,
      documentHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      rawFallbackLabels: /Inventory selector|Name unavailable|Loading your inventory|semantic IDs|undefined|null/i.test(root.innerText),
      iconInputs: window.__itemOwnerFixture.iconInputs,
      activeText: document.activeElement?.innerText || '',
    };
  })()`);
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup); child.stdout.on('data', (data) => process.stdout.write(data)); child.stderr.on('data', (data) => process.stderr.write(data));
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((page) => page.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((page) => page.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => evaluate(cdp, "document.readyState === 'complete' && !!window.NetHackUxEquipmentScreen?.controller && !!window.__nethackPromptTest"), 10000);

    const opened = await evaluate(cdp, `(async () => {
      for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close('test');
      const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
      const icons = freeze(${JSON.stringify(fixtureAssetUrls)});
      const item = (objectId, inventoryLetter, displayName, assetId, extra = {}) => freeze({
        objectId, inventoryLetter, text: inventoryLetter + ' - ' + displayName, displayName, quantity: 1,
        semanticKind: 'object', semanticKnown: true, known: { identity: true, appearance: true },
        ownership: { state: 'owned' }, iconSrc: icons[assetId], ...extra,
      });
      const spear = item(501, 'a', '1 spear', 'spear', { selector: 97, glyphChar: 41, semanticName: 'spear', publicClass: 'weapon', filterGroups: ['equipped', 'weapons'], equipmentSlots: ['mainHand'], equippedState: 'wielded', wornMask: 256, actionAffordances: ['wielded', 'quiver', 'engrave'] });
      const potion = item(502, 'b', 'ruby potion', 'potion-class-icon', { glyphChar: 33, semanticName: undefined, semanticAppearance: 'ruby potion', semanticKnown: false, known: { identity: false, appearance: true }, knownFields: { beatitude: 'cursed' }, publicClass: 'potion', filterGroups: ['consumables', 'magic'], actionAffordances: ['quaff', 'drop', 'dip'] });
      const helmet = item(503, 'c', 'uncursed +0 helmet', 'helmet', { selector: 99, glyphChar: 91, semanticName: 'helmet', publicClass: 'armor', filterGroups: ['armor'], equipmentSlots: ['armor.helm'], actionAffordances: ['wear', 'drop'] });
      const items = freeze([
        spear,
        potion,
        helmet,
        item(504, 'd', '12 uncursed arrows', 'arrow', { quantity: 12, glyphChar: 41, semanticName: 'arrow', publicClass: 'weapon', filterGroups: ['weapons'], equipmentSlots: ['mainHand', 'offHand', 'quiver'], actionAffordances: ['quiver', 'throw', 'drop'] }),
        item(505, 'e', 'leather armor', 'leather-armor', { glyphChar: 91, semanticName: 'leather armor', publicClass: 'armor', filterGroups: ['armor'], equipmentSlots: ['armor.body'], actionAffordances: ['wear', 'drop'] }),
        item(506, 'f', 'food ration', 'food-ration', { glyphChar: 37, semanticName: 'food ration', publicClass: 'food', filterGroups: ['consumables'], actionAffordances: ['eat', 'drop'] }),
        item(507, 'g', 'pick-axe', 'pick-axe', { glyphChar: 40, semanticName: 'pick-axe', publicClass: 'tool', actionAffordances: ['apply', 'wield', 'drop'] }),
        item(508, 'h', 'lizard corpse', 'corpse', { glyphChar: 37, semanticName: 'lizard corpse', publicClass: 'food', filterGroups: ['consumables'], actionAffordances: ['eat', 'drop'] }),
        item(509, 'i', 'blessed +2 long sword named Dawnbringer', 'long-sword', { glyphChar: 41, semanticName: 'long sword', publicClass: 'weapon', filterGroups: ['weapons'], equipmentSlots: ['mainHand', 'offHand'], actionAffordances: ['wield', 'engrave', 'drop'] }),
        item(510, 'j', 'scroll labeled TEMOV', 'scroll-class-icon', { glyphChar: 63, semanticKnown: false, known: { identity: false, appearance: true }, semanticAppearance: 'scroll labeled TEMOV', publicClass: 'scroll', filterGroups: ['consumables', 'magic'], actionAffordances: ['read', 'drop'] }),
        item(511, 'k', 'wand of digging', 'wand-class-icon', { glyphChar: 47, semanticName: 'wand of digging', publicClass: 'wand', filterGroups: ['magic'], knownFields: { charges: 3 }, actionAffordances: ['zap', 'engrave', 'drop'] }),
        item(512, 'l', 'ring of protection', 'ring-class-icon', { glyphChar: 61, semanticName: 'ring of protection', publicClass: 'ring', filterGroups: ['magic'], equipmentSlots: ['ring.left', 'ring.right'], actionAffordances: ['putOn', 'drop'] }),
        item(513, 'm', 'yellow gem', 'gem-class-icon', { glyphChar: 42, semanticKnown: false, known: { identity: false, appearance: true }, semanticAppearance: 'yellow gem', publicClass: 'gem', actionAffordances: ['throw', 'drop'] }),
        item(514, 'n', '2 chrysoberyl stones', 'chrysoberyl', { quantity: 2, glyphChar: 42, semanticName: 'chrysoberyl', publicClass: 'gem', actionAffordances: ['throw', 'drop'] }),
        item(515, 'o', 'towel', 'towel', { glyphChar: 40, semanticName: 'towel', publicClass: 'tool', actionAffordances: ['apply', 'drop'] }),
        item(516, 'p', 'thin spellbook', 'spellbook-class-icon', { glyphChar: 43, semanticKnown: false, known: { identity: false, appearance: true }, semanticAppearance: 'thin spellbook', publicClass: 'spellbook', filterGroups: ['magic'], actionAffordances: ['read', 'drop'] }),
      ]);
      const inventory = freeze({ revision: 10, orderedItems: items });
      const equipment = freeze({ revision: 10, inventoryRevision: 10, orderedSlots: [
        freeze({ slotId: 'mainHand', objectId: 501, publicStatus: 'occupied', item: spear }),
        freeze({ slotId: 'armor.helm', objectId: null, publicStatus: 'empty', blockedBy: [] }),
        freeze({ slotId: 'ring.left', objectId: null, publicStatus: 'empty', blockedBy: [] }),
        freeze({ slotId: 'ring.right', objectId: null, publicStatus: 'empty', blockedBy: [] }),
        freeze({ slotId: 'quiver', objectId: null, publicStatus: 'empty', blockedBy: [] }),
      ] });
      const statusValues = freeze([
        freeze([0, 'Brynhild the Stripling']), freeze([1, '18/01']), freeze([2, '12']), freeze([3, '16']),
        freeze([4, '8']), freeze([5, '10']), freeze([6, '9']), freeze([7, 'Lawful']),
        freeze([10, '125']), freeze([11, '4']), freeze([12, '7']), freeze([13, '5']), freeze([14, '3']),
        freeze([16, '214']), freeze([18, '24']), freeze([19, '24']), freeze([20, 'The Dungeons of Doom:4']), freeze([21, '820']),
      ]);
      const messages = freeze([
        'Welcome to NetHack.',
        'Be careful! New moon tonight.',
        'You see here a spear.',
        'You pick up the spear.',
        'You are carrying too much to run.',
        'Your movements are slowed slightly because of your load.',
        'You finish putting on the helmet.',
        'Your pack feels organized.',
        'You feel ready for the dungeon.',
        'Inventory updated.',
      ]);
      window.__itemOwnerFixture = { freeze, spear, potion, helmet, inventory, equipment, statusValues, messages, intents: [], iconInputs: [] };
      const owner = window.NetHackUxEquipmentScreen.controller;
      owner.close({ reason: 'test-reset', cancelNative: false });
      const invoker = document.getElementById('inventory-equipment-button'); invoker.focus();
      owner.open({
        documentRoot: document, inventory, equipment, statusValues, messages, invoker, initialMode: 'equipment',
        avatar: { src: icons['human-valkyrie-female-avatar'], alt: 'Human Valkyrie' },
        iconResolver(rawItem) { window.__itemOwnerFixture.iconInputs.push({ objectId: rawItem.objectId, semanticName: rawItem.semanticName || '', semanticAppearance: rawItem.semanticAppearance || '', glyphChar: rawItem.glyphChar || 0 }); return rawItem.iconSrc ? { src: rawItem.iconSrc } : null; },
        onIntent(intent) { window.__itemOwnerFixture.intents.push(intent); return true; },
      });
      await Promise.all(Array.from(document.querySelectorAll('.uxm-item-icon img')).map((image) => image.decode?.().catch(() => {})));
      return { snapshot: owner.snapshot(), frozen: Object.isFrozen(inventory) && Object.isFrozen(inventory.orderedItems) && Object.isFrozen(potion), activeTag: document.activeElement?.tagName || '', activeText: document.activeElement?.textContent?.trim() || '', activeInside: document.getElementById('ux-items-root').contains(document.activeElement) };
    })()`);
    assert('owner opens from immutable snapshots', opened.snapshot.open && opened.frozen, JSON.stringify(opened));
    assert('owner moves focus inside workspace', opened.activeTag === 'BUTTON' && opened.activeInside, JSON.stringify(opened));

    const initialDom = await evaluate(cdp, `(() => ({
      ownerCount: document.querySelectorAll('[data-ux-owner="items"]').length,
      legacyEquipmentShell: Boolean(document.getElementById('equipment-slots')),
      legacyDialogWriter: Boolean(document.querySelector('#interaction-dialog .rpg-equipment-screen')),
      rowSelectors: Array.from(document.querySelectorAll('#ux-items-root .uxm-item-row')).map((row) => row.dataset.selector),
      body: document.getElementById('ux-items-root').innerText,
      stats: Array.from(document.querySelectorAll('#ux-items-root .uxm-items-status .ux-status-chip')).filter((chip) => chip.getClientRects().length && getComputedStyle(chip).display !== 'none').map((chip) => ({ field: chip.dataset.statusField, label: chip.querySelector('span')?.textContent || '', value: chip.querySelector('strong')?.textContent || '' })),
      overflow: window.NetHackUxEquipmentScreen.controller.snapshot().horizontalOverflow,
      log: (() => { const viewport = document.querySelector('#ux-items-root .uxm-recent-log-scroll'); return { lines: Array.from(viewport?.querySelectorAll('li') || [], (line) => line.textContent), scrollable: Boolean(viewport && viewport.scrollHeight > viewport.clientHeight), atBottom: Boolean(viewport && viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 1) }; })(),
    }))()`);
    const layout1440 = await layoutMetrics(cdp);
    const firstShot = await screenshot(cdp, '01-many-items-1440x1080.png');
    assert('single item DOM owner', initialDom.ownerCount === 1 && !initialDom.legacyEquipmentShell && !initialDom.legacyDialogWriter, JSON.stringify(initialDom));
    assert('numeric selector and inventoryLetter are both routed', initialDom.rowSelectors.includes('a') && initialDom.rowSelectors.includes('b') && initialDom.rowSelectors.includes('c'), JSON.stringify(initialDom.rowSelectors));
    assert('equipment distinctions and empty slots render', /Main hand[\s\S]*spear/i.test(initialDom.body) && /Helmet[\s\S]*Empty/i.test(initialDom.body), initialDom.body);
    assert('1440x1080 inventory dominates the right column and shows at least ten rows', layout1440.listShare >= 0.62 && layout1440.visibleRowCount >= 10 && layout1440.listClientHeight >= 480, JSON.stringify(layout1440));
    assert('1440x1080 compact action rail remains shallow and separate', layout1440.railShare <= 0.18 && layout1440.listAndRailSeparated && layout1440.controlsContained, JSON.stringify(layout1440));
    assert('all many-item rows use decoded resolved art at 28–36 CSS pixels', layout1440.resolvedIconCount === layout1440.rowCount && layout1440.iconBoxes.every((box) => box.width >= 28 && box.width <= 36 && box.height >= 28 && box.height <= 36), JSON.stringify(layout1440));
    assert('canonical icon provider receives raw public semantic metadata', new Set(layout1440.iconInputs.map((entry) => entry.objectId)).size === layout1440.rowCount && layout1440.iconInputs.some((entry) => entry.semanticName === 'spear' && entry.glyphChar === 41) && layout1440.iconInputs.some((entry) => entry.semanticAppearance === 'yellow gem'), JSON.stringify(layout1440.iconInputs));
    assert('1440x1080 workspace has no horizontal overflow or raw labels', !layout1440.rootHorizontalOverflow && !layout1440.documentHorizontalOverflow && !layout1440.rawFallbackLabels && initialDom.overflow === false, JSON.stringify(layout1440));
    assert('wide inventory header exposes live attributes and defenses', ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha', 'HP', 'Pw', 'AC', 'XL'].every((label) => initialDom.stats.some((stat) => stat.label === label && stat.value)), JSON.stringify(initialDom.stats));
    assert('inventory rail shows the latest eight canonical messages in a scrollable newest-last log', initialDom.log.lines.length === 8
      && initialDom.log.lines[0] === 'You see here a spear.'
      && initialDom.log.lines.at(-1) === 'Inventory updated.'
      && initialDom.log.scrollable
      && initialDom.log.atBottom, JSON.stringify(initialDom.log));
    const liveLog = await evaluate(cdp, `(() => {
      const fixture = window.__itemOwnerFixture;
      const viewport = document.querySelector('#ux-items-root .uxm-recent-log-scroll');
      viewport.scrollTop = 0;
      const firstMessages = fixture.freeze([...fixture.messages, 'You finish taking off the helmet.']);
      window.NetHackUxEquipmentScreen.controller.reconcile({ messages: firstMessages });
      const preserved = document.querySelector('#ux-items-root .uxm-recent-log-scroll');
      const preservedTop = preserved.scrollTop;
      preserved.scrollTop = preserved.scrollHeight;
      const secondMessages = fixture.freeze([...firstMessages, 'You feel less protected.']);
      window.NetHackUxEquipmentScreen.controller.reconcile({ messages: secondMessages });
      const updated = document.querySelector('#ux-items-root .uxm-recent-log-scroll');
      return {
        preservedTop,
        lines: Array.from(updated.querySelectorAll('li'), (line) => line.textContent),
        atBottom: updated.scrollHeight - updated.scrollTop - updated.clientHeight <= 1,
      };
    })()`);
    assert('live inventory messages preserve manual review position and follow new output from the bottom', liveLog.preservedTop === 0
      && liveLog.lines.length === 8
      && liveLog.lines.at(-1) === 'You feel less protected.'
      && liveLog.atBottom, JSON.stringify(liveLog));
    const liveStatus = await evaluate(cdp, `(() => {
      const fixture = window.__itemOwnerFixture;
      const statusValues = fixture.freeze(fixture.statusValues.map(([field, value]) => fixture.freeze([field, field === 1 ? '19' : (field === 14 ? '1' : value)])));
      window.NetHackUxEquipmentScreen.controller.reconcile({ statusValues });
      return Array.from(document.querySelectorAll('#ux-items-root .uxm-items-status .ux-status-chip')).filter((chip) => chip.getClientRects().length && getComputedStyle(chip).display !== 'none').map((chip) => ({ label: chip.querySelector('span')?.textContent || '', value: chip.querySelector('strong')?.textContent || '' }));
    })()`);
    assert('inventory header rerenders live equipment-sensitive status values', liveStatus.some((stat) => stat.label === 'Str' && stat.value === '19') && liveStatus.some((stat) => stat.label === 'AC' && stat.value === '1'), JSON.stringify(liveStatus));
    const spellbookPrimary = await evaluate(cdp, `(() => {
      const row = document.querySelector('#ux-items-root .uxm-item-row[data-selector="p"]');
      row?.click();
      row?.scrollIntoView({ block: 'nearest' });
      const button = document.querySelector('#ux-items-root .uxm-selection-actions > button[data-action-id]');
      return { selected: document.querySelector('.uxm-selection-rail .uxm-detail-title')?.textContent || '', actionId: button?.dataset.actionId || '', label: button?.textContent?.trim() || '' };
    })()`);
    const spellbookShot = await screenshot(cdp, '01b-spellbook-read-primary-1440x1080.png');
    assert('spellbook reading is the visible primary action', /spellbook/i.test(spellbookPrimary.selected) && spellbookPrimary.actionId === 'item.study' && /study|read/i.test(spellbookPrimary.label), JSON.stringify(spellbookPrimary));


    await setViewport(cdp, 1280, 900);
    const layout1280 = await layoutMetrics(cdp);
    const compactShot = await screenshot(cdp, '02-many-items-1280x900.png');
    assert('1280x900 inventory remains the majority-height working area with at least ten visible rows beneath the live stat ribbon', layout1280.listShare >= 0.62 && layout1280.visibleRowCount >= 10 && layout1280.listClientHeight >= 480, JSON.stringify(layout1280));
    assert('1280x900 action rail stays shallow, readable, and overflow-free', layout1280.railShare <= 0.2 && layout1280.listAndRailSeparated && layout1280.controlsContained && !layout1280.rootHorizontalOverflow && !layout1280.documentHorizontalOverflow, JSON.stringify(layout1280));
    await evaluate(cdp, `(() => { const summary = document.querySelector('.uxm-action-disclosure > summary'); summary?.focus(); return document.activeElement === summary; })()`);
    await press(cdp, ' ', 'Space'); await delay(40);
    const disclosureKeyboard = await evaluate(cdp, `(() => { const details = document.querySelector('.uxm-action-disclosure'); return { open: Boolean(details?.open), activeIsSummary: document.activeElement === details?.querySelector('summary'), panelVisible: Boolean(details?.querySelector('.uxm-rail-more-panel')?.getBoundingClientRect().height) }; })()`);
    assert('More actions disclosure opens from keyboard and preserves focus', disclosureKeyboard.open && disclosureKeyboard.activeIsSummary && disclosureKeyboard.panelVisible, JSON.stringify(disclosureKeyboard));
    await press(cdp, ' ', 'Space'); await delay(40);


    const overviewRace = await evaluate(cdp, `(() => {
      const owner = window.NetHackUxEquipmentScreen.controller; const fixture = window.__itemOwnerFixture;
      const overview = fixture.freeze({
        requestId: 'inventory-overview-race', menuRequestId: 'inventory-overview-race',
        transactionId: 'inventory-overview-transaction', window: 91, menuId: 'inventory-overview-menu',
        lifecycleRevision: 4, menuPurpose: 'inventory.displayInventory', purpose: 'inventory.displayInventory',
        owner: fixture.freeze({ kind: 'inventory', window: 91 }), awaitingSelection: true, prompt: 'Inventory', items: fixture.inventory.orderedItems,
      });
      owner.close({ reason: 'overview-race-reset', cancelNative: false });
      fixture.intents.length = 0;
      owner.open({
        documentRoot: document, inventory: fixture.inventory, equipment: fixture.equipment,
        interaction: fixture.freeze({ menu: overview, prompt: null }),
        iconResolver(rawItem) { return rawItem.iconSrc ? { src: rawItem.iconSrc } : null; },
        onIntent(intent) { fixture.intents.push(intent); return true; },
      });
      document.querySelector('#ux-items-root .uxm-item-row[data-selector="b"]')?.click();
      const primaryActionId = document.querySelector('#ux-items-root .uxm-selection-actions > button[data-action-id]')?.dataset.actionId || '';
      const accepted = owner.request({ kind: 'item-action', stableId: 'object:502', actionId: 'item.quaff', inventoryRevision: 10 });
      const queued = owner.snapshot();
      const beforeCloseIntents = fixture.intents.map((intent) => ({ type: intent.type, command: intent.command || '', actionId: intent.action?.id || '' }));
      owner.reconcile({ interaction: fixture.freeze({ menu: null, prompt: null }) });
      const dispatched = owner.snapshot();
      const afterCloseIntents = fixture.intents.map((intent) => ({ type: intent.type, command: intent.command || '', actionId: intent.action?.id || '' }));
      const actionIntent = fixture.intents.find((intent) => intent.type === 'execute-item-action');
      if (actionIntent) owner.settle({ intentId: actionIntent.intentId, status: 'completed' });
      const completed = owner.snapshot();
      owner.close({ reason: 'overview-race-complete', cancelNative: false });
      owner.open({
        documentRoot: document, inventory: fixture.inventory, equipment: fixture.equipment,
        iconResolver(rawItem) { return rawItem.iconSrc ? { src: rawItem.iconSrc } : null; },
        onIntent(intent) { fixture.intents.push(intent); return true; },
      });
      return { primaryActionId, accepted, queued, beforeCloseIntents, dispatched, afterCloseIntents, completed };
    })()`);
    assert('Quaff is the first potion action', overviewRace.primaryActionId === 'item.quaff', JSON.stringify(overviewRace));
    assert('potion action queues behind its exact native inventory overview instead of being rejected', overviewRace.accepted && overviewRace.queued.pendingPhase === 'waiting-overview-close' && overviewRace.beforeCloseIntents.length === 1 && overviewRace.beforeCloseIntents[0].type === 'cancel-native-overview', JSON.stringify(overviewRace));
    assert('queued potion action dispatches exactly after the owned overview closes', overviewRace.dispatched.pendingPhase === 'dispatching' && overviewRace.afterCloseIntents.length === 2 && overviewRace.afterCloseIntents[1].type === 'execute-item-action' && overviewRace.afterCloseIntents[1].command === 'qb', JSON.stringify(overviewRace));
    assert('completed quaff closes the inventory workspace', overviewRace.completed.open === false, JSON.stringify(overviewRace.completed));
    const actionMetrics = await evaluate(cdp, `(() => {
      const owner = window.NetHackUxEquipmentScreen.controller;
      document.querySelector('#ux-items-root .uxm-item-row[data-selector="b"]')?.click();
      const labels = Array.from(document.querySelectorAll('#ux-items-root .uxm-detail-actions button[data-action-id]')).map((button) => ({ text: button.textContent.trim(), disabled: button.disabled }));
      const staleAccepted = owner.request({ kind: 'item-action', stableId: 'object:502', actionId: 'item.quaff', inventoryRevision: 9 });
      const stale = owner.snapshot();
      const staleStatus = { role: document.querySelector('.uxm-item-feedback')?.getAttribute('role') || '', live: document.querySelector('.uxm-item-feedback')?.getAttribute('aria-live') || '', text: document.querySelector('.uxm-item-feedback')?.textContent || '' };
      const validAccepted = owner.request({ kind: 'item-action', stableId: 'object:502', actionId: 'item.quaff', inventoryRevision: 10 });
      const planned = owner.snapshot();
      const pendingStatus = { role: document.querySelector('.uxm-item-feedback')?.getAttribute('role') || '', live: document.querySelector('.uxm-item-feedback')?.getAttribute('aria-live') || '', text: document.querySelector('.uxm-item-feedback')?.textContent || '' };
      return { labels, staleAccepted, stale, staleStatus, validAccepted, planned, pendingStatus, firstIntent: window.__itemOwnerFixture.intents.at(-1) };
    })()`);
    assert('action availability preserves quaff and drop labels', actionMetrics.labels.some((entry) => /Quaff/i.test(entry.text) && !entry.disabled) && actionMetrics.labels.some((entry) => /Drop/i.test(entry.text) && !entry.disabled), JSON.stringify(actionMetrics.labels));
    assert('stale snapshot request rejects without dispatch', actionMetrics.staleAccepted === false && /Inventory changed/i.test(actionMetrics.stale.feedback), JSON.stringify(actionMetrics));
    assert('valid action plans through owner', actionMetrics.validAccepted === true && actionMetrics.planned.pendingActionId === 'item.quaff' && actionMetrics.firstIntent.command === 'qb', JSON.stringify(actionMetrics));
    assert('error and loading feedback are exposed as polite live status', actionMetrics.staleStatus.role === 'status' && actionMetrics.staleStatus.live === 'polite' && /Inventory changed/i.test(actionMetrics.staleStatus.text) && actionMetrics.pendingStatus.role === 'status' && /Quaff/i.test(actionMetrics.pendingStatus.text), JSON.stringify(actionMetrics));

    const followup = await evaluate(cdp, `(() => {
      const owner = window.NetHackUxEquipmentScreen.controller; const fixture = window.__itemOwnerFixture;
      const menu = fixture.freeze({ requestId: 'request-followup-1', menuRequestId: 'request-followup-1', transactionId: fixture.intents.at(-1).transactionId, window: 77, menuId: 'menu-77', lifecycleRevision: 12, menuPurpose: 'inventory.itemAction', purpose: 'inventory.itemAction', owner: fixture.freeze({ kind: 'inventory', window: 77 }), awaitingSelection: true, prompt: 'What do you want to drink?', items: [fixture.potion] });
      owner.reconcile({ inventory: fixture.inventory, equipment: fixture.equipment, interaction: fixture.freeze({ menu, prompt: null }) });
      const before = owner.snapshot();
      document.querySelector('#ux-items-root .uxm-native-followup button')?.click();
      const intent = fixture.intents.at(-1);
      return { before, after: owner.snapshot(), intent, modalText: document.querySelector('#ux-items-root .uxm-native-followup')?.innerText || '' };
    })()`);
    const secondShot = await screenshot(cdp, '03-native-followup-owned-modal.png');
    assert('native follow-up reopens inside item owner', followup.before.pendingPhase === 'awaiting-followup' && /What do you want to drink/i.test(followup.modalText), JSON.stringify(followup));
    assert('native selection carries exact request correlation', followup.intent.type === 'select-native-followup' && followup.intent.selector === 'b' && followup.intent.correlation.requestId === 'request-followup-1' && followup.intent.correlation.transactionId === actionMetrics.firstIntent.transactionId && followup.intent.correlation.window === 77 && followup.intent.correlation.menuId === 'menu-77' && followup.intent.correlation.lifecycleRevision === 12, JSON.stringify(followup.intent));
    assert('native selection enters loading phase', followup.after.pendingPhase === 'followup-dispatching', JSON.stringify(followup.after));

    const rejectionAndCompletion = await evaluate(cdp, `(() => {
      const owner = window.NetHackUxEquipmentScreen.controller; const fixture = window.__itemOwnerFixture;
      const followupIntent = fixture.intents.at(-1);
      owner.settle({ intentId: followupIntent.intentId, status: 'rejected', reason: 'native request no longer active' });
      const rejected = owner.snapshot();
      owner.request({ kind: 'item-action', stableId: 'object:503', actionId: 'item.wear', inventoryRevision: 10 });
      const plannedIntent = fixture.intents.at(-1);
      owner.settle({ intentId: plannedIntent.intentId, accepted: true });
      const inventory11 = fixture.freeze({ revision: 11, orderedItems: fixture.inventory.orderedItems });
      const equipment11 = fixture.freeze({ revision: 11, inventoryRevision: 11, orderedSlots: fixture.equipment.orderedSlots });
      owner.reconcile({ inventory: inventory11, equipment: equipment11, interaction: null });
      const completed = owner.snapshot();
      const conflict = fixture.freeze({ revision: 11, orderedItems: [fixture.spear, fixture.freeze({ ...fixture.potion, displayName: 'conflicting same revision' }), fixture.helmet] });
      const outcome = owner.reconcile({ inventory: conflict, equipment: equipment11 });
      return { rejected, completed, outcome, diagnostics: owner.diagnostics().slice(-8) };
    })()`);
    assert('transport rejection is owned and visible', rejectionAndCompletion.rejected.pendingActionId === '' && /no longer active/i.test(rejectionAndCompletion.rejected.feedback), JSON.stringify(rejectionAndCompletion.rejected));
    assert('new authoritative revision completes pending action', rejectionAndCompletion.completed.pendingActionId === '' && rejectionAndCompletion.completed.inventoryRevision === 11 && /complete/i.test(rejectionAndCompletion.completed.feedback), JSON.stringify(rejectionAndCompletion.completed));
    assert('conflicting immutable revision is rejected', rejectionAndCompletion.outcome.inventoryAccepted === false && rejectionAndCompletion.diagnostics.some((entry) => entry.type === 'snapshot.inventory.rejected' && entry.detail.code === 'conflicting-revision'), JSON.stringify(rejectionAndCompletion));

    await press(cdp, 'Escape', 'Escape'); await delay(80);
    const closed = await evaluate(cdp, `(() => ({ snapshot: window.NetHackUxEquipmentScreen.controller.snapshot(), activeId: document.activeElement?.id || '', mountText: document.getElementById('ux-items-root')?.textContent || '' }))()`);
    assert('Escape closes owner and restores invoker focus', !closed.snapshot.open && closed.activeId === 'inventory-equipment-button' && closed.mountText === '', JSON.stringify(closed));

    const applyCompletion = await evaluate(cdp, `(() => {
      const owner = window.NetHackUxEquipmentScreen.controller; const fixture = window.__itemOwnerFixture;
      owner.open({
        documentRoot: document,
        inventory: fixture.freeze({ revision: 11, orderedItems: fixture.inventory.orderedItems }),
        equipment: fixture.freeze({ revision: 11, inventoryRevision: 11, orderedSlots: fixture.equipment.orderedSlots }),
        invoker: document.getElementById('inventory-equipment-button'),
        onIntent(intent) { fixture.intents.push(intent); return true; },
      });
      const accepted = owner.request({ kind: 'item-action', stableId: 'object:507', actionId: 'item.apply', inventoryRevision: 11 });
      const intent = fixture.intents.at(-1);
      owner.settle({ intentId: intent.intentId, status: 'completed' });
      return { accepted, intent, snapshot: owner.snapshot(), mountText: document.getElementById('ux-items-root')?.textContent || '' };
    })()`);
    const applyClosedShot = await screenshot(cdp, '04-apply-complete-closed-workspace.png');
    assert('completed apply closes the inventory workspace', applyCompletion.accepted && applyCompletion.intent.command === 'ag' && applyCompletion.snapshot.open === false && applyCompletion.mountText === '', JSON.stringify(applyCompletion));


    const effectFollowupClosure = await evaluate(cdp, `(() => {
      const owner = window.NetHackUxEquipmentScreen.controller; const fixture = window.__itemOwnerFixture;
      owner.open({
        documentRoot: document,
        inventory: fixture.freeze({ revision: 11, orderedItems: fixture.inventory.orderedItems }),
        equipment: fixture.freeze({ revision: 11, inventoryRevision: 11, orderedSlots: fixture.equipment.orderedSlots }),
        invoker: document.getElementById('inventory-equipment-button'),
        onIntent(intent) { fixture.intents.push(intent); return true; },
      });
      const beforeIntentCount = fixture.intents.length;
      owner.request({ kind: 'item-action', stableId: 'object:502', actionId: 'item.quaff', inventoryRevision: 11 });
      const intent = fixture.intents.at(-1);
      const itemPrompt = fixture.freeze({
        requestId: 'quaff-item-prompt',
        transactionId: intent.transactionId,
        window: 1,
        lifecycleRevision: 20,
        kind: 'question',
        promptPurpose: 'prompt.question',
        query: 'What do you want to drink? [b or ?*]',
        choices: 'b',
      });
      owner.reconcile({ interaction: fixture.freeze({ menu: null, prompt: itemPrompt }) });
      const itemSelection = owner.snapshot();
      const effectPrompt = fixture.freeze({
        requestId: 'monster-detection-cursor',
        transactionId: intent.transactionId,
        window: 1,
        lifecycleRevision: 21,
        kind: 'position',
        promptPurpose: 'prompt.position',
        query: 'Move cursor to monster of interest:',
        choices: '',
      });
      owner.reconcile({ interaction: fixture.freeze({ menu: null, prompt: effectPrompt }) });
      return {
        itemSelection,
        afterEffectPrompt: owner.snapshot(),
        emittedAfterEffectPrompt: fixture.intents.slice(beforeIntentCount).map((entry) => entry.type),
        mountText: document.getElementById('ux-items-root')?.textContent || '',
      };
    })()`);
    assert('post-quaff effect prompt closes inventory without cancelling NetHack interaction', effectFollowupClosure.itemSelection.pendingPhase === 'awaiting-followup' && effectFollowupClosure.afterEffectPrompt.open === false && effectFollowupClosure.mountText === '' && !effectFollowupClosure.emittedAfterEffectPrompt.includes('cancel-native-interaction'), JSON.stringify(effectFollowupClosure));
    const readEffectClosure = await evaluate(cdp, `(() => {
      const owner = window.NetHackUxEquipmentScreen.controller; const fixture = window.__itemOwnerFixture;
      owner.open({
        documentRoot: document,
        inventory: fixture.freeze({ revision: 11, orderedItems: fixture.inventory.orderedItems }),
        equipment: fixture.freeze({ revision: 11, inventoryRevision: 11, orderedSlots: fixture.equipment.orderedSlots }),
        invoker: document.getElementById('inventory-equipment-button'),
        onIntent(intent) { fixture.intents.push(intent); return true; },
      });
      const beforeIntentCount = fixture.intents.length;
      owner.request({ kind: 'item-action', stableId: 'object:510', actionId: 'item.read.scroll', inventoryRevision: 11 });
      const intent = fixture.intents.at(-1);
      const itemPrompt = fixture.freeze({
        requestId: 'read-item-prompt',
        transactionId: intent.transactionId,
        window: 1,
        lifecycleRevision: 30,
        kind: 'question',
        promptPurpose: 'prompt.question',
        query: 'What do you want to read? [j or ?*]',
        choices: 'j',
      });
      owner.reconcile({ interaction: fixture.freeze({ menu: null, prompt: itemPrompt }) });
      const itemSelection = owner.snapshot();
      const effectMenu = fixture.freeze({
        requestId: 'food-detection-farlook-tip',
        menuRequestId: 'food-detection-farlook-tip',
        transactionId: intent.transactionId,
        window: 7,
        menuId: 'food-detection-tip',
        lifecycleRevision: 31,
        menuPurpose: 'menu.generic',
        owner: fixture.freeze({ kind: 'system', window: 7 }),
        awaitingSelection: true,
        prompt: 'Tip: Farlooking or selecting a map location',
        items: [],
      });
      owner.reconcile({ interaction: fixture.freeze({ menu: effectMenu, prompt: null }) });
      return {
        itemSelection,
        afterEffectMenu: owner.snapshot(),
        emittedAfterEffectMenu: fixture.intents.slice(beforeIntentCount).map((entry) => entry.type),
        mountText: document.getElementById('ux-items-root')?.textContent || '',
      };
    })()`);
    assert('post-read detection menu closes inventory without cancelling NetHack interaction', readEffectClosure.itemSelection.pendingPhase === 'awaiting-followup' && readEffectClosure.afterEffectMenu.open === false && readEffectClosure.mountText === '' && !readEffectClosure.emittedAfterEffectMenu.includes('cancel-native-interaction'), JSON.stringify(readEffectClosure));
    const transfer = await evaluate(cdp, `(() => {
      const owner = window.NetHackUxEquipmentScreen.controller; const fixture = window.__itemOwnerFixture; const invoker = document.getElementById('inventory-equipment-button');
      owner.open({ documentRoot: document, inventory: fixture.freeze({ revision: 11, orderedItems: fixture.inventory.orderedItems }), equipment: fixture.freeze({ revision: 11, inventoryRevision: 11, orderedSlots: fixture.equipment.orderedSlots }), invoker, onIntent(intent) { fixture.intents.push(intent); return true; } });
      owner.reconcile({ transferOwner: fixture.freeze({ id: 'transfer-session-1', active: true }) });
      return { snapshot: owner.snapshot(), ownerDom: document.querySelectorAll('[data-ux-owner="items"]:not([hidden])').length };
    })()`);
    const thirdShot = await screenshot(cdp, '05-transfer-precedence-closed-workspace.png');
    assert('Transfer Session precedence closes item owner', !transfer.snapshot.open && transfer.ownerDom === 0, JSON.stringify(transfer));

    const emptyState = await evaluate(cdp, `(() => {
      const owner = window.NetHackUxEquipmentScreen.controller; const fixture = window.__itemOwnerFixture;
      owner.reconcile({ transferOwner: { active: false } });
      const slots = window.NetHackUxEquipmentScreen.GROUPS.flatMap((group) => group.slots).map((slotId) => fixture.freeze({ slotId, objectId: null, publicStatus: 'empty', blockedBy: [] }));
      owner.open({
        documentRoot: document,
        mount: document.getElementById('ux-items-root'),
        inventory: fixture.freeze({ revision: 12, orderedItems: [] }),
        equipment: fixture.freeze({ revision: 12, inventoryRevision: 12, orderedSlots: slots }),
        initialMode: 'inventory',
        invoker: document.getElementById('inventory-equipment-button'),
      });
      return {
        text: document.querySelector('.uxm-item-empty')?.textContent || '',
        rowCount: document.querySelectorAll('.uxm-item-row').length,
        selectedRailText: document.querySelector('.uxm-selection-rail')?.innerText || '',
        horizontalOverflow: owner.snapshot().horizontalOverflow,
      };
    })()`);
    const emptyShot = await screenshot(cdp, '06-empty-inventory-1280x900.png');
    assert('empty inventory gives useful guidance without stale selection or overflow', emptyState.rowCount === 0 && /Pick up an item/i.test(emptyState.text) && /Choose an inventory row/i.test(emptyState.selectedRailText) && !emptyState.horizontalOverflow, JSON.stringify(emptyState));

    console.log(JSON.stringify({
      ok: true,
      screenshots: [firstShot, spellbookShot, compactShot, secondShot, applyClosedShot, thirdShot, emptyShot],
      layout: { baseline1360x920: { listHeight: 178, railHeight: 201, unusedWorkspaceHeight: 286, source: 'pre-change screenshot pixel inspection' }, after1440x1080: layout1440, after1280x900: layout1280 },
      contracts: ['immutable revisions', 'raw canonical icon resolver input', 'resolved icon rows', 'responsive live stat ribbon', 'scrollable live recent log', '10+ visible rows at both requested viewports', 'shallow action rail', 'spellbook read primary action', 'keyboard More actions disclosure', 'numeric selector or inventoryLetter', 'action availability', 'stale rejection', 'exact native follow-up correlation', 'quaff/apply completion closes inventory', 'loading/error/empty states', 'focus/close', 'single DOM owner', 'Transfer Session precedence'],
    }, null, 2));

  } finally { cleanup(); }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
