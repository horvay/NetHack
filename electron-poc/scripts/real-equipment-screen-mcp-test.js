const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = Number(process.env.NH_ELECTRON_WINDOW_WIDTH || 1360);
const height = Number(process.env.NH_ELECTRON_WINDOW_HEIGHT || 920);
const { delay, waitFor } = Harness;
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function shot(cdp, name) { const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'actual-player', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 }); return capture.raw.path; }
function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-equipment-screen-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
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
async function rightClickCenter(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((candidate) => /dart|arrow|bolt|ya|ammo/i.test(candidate.innerText || '')) || document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'right', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'right', clickCount: 1 });
  return box;
}
async function boxForText(cdp, selector, pattern) {
  const box = await evalExpr(cdp, `(() => { const re = new RegExp(${JSON.stringify(pattern)}, 'i'); const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((candidate) => re.test(candidate.innerText || '')); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText} : null; })()`);
  if (!box) throw new Error(`missing ${selector} matching ${pattern}`);
  return box;
}
async function doubleClickText(cdp, selector, pattern) {
  const box = await boxForText(cdp, selector, pattern);
  for (const clickCount of [1, 2]) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount });
    await delay(80);
  }
  return box;
}
async function dragTextToSelector(cdp, sourceSelector, sourcePattern, targetSelector) {
  const source = await boxForText(cdp, sourceSelector, sourcePattern);
  const target = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(targetSelector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText} : null; })()`);
  if (!target) throw new Error(`missing drop target ${targetSelector}`);
  const selector = await evalExpr(cdp, `(() => { const re = new RegExp(${JSON.stringify(sourcePattern)}, 'i'); const el = Array.from(document.querySelectorAll(${JSON.stringify(sourceSelector)})).find((candidate) => re.test(candidate.innerText || '')); return el?.dataset?.key || el?.dataset?.dragSelector || ''; })()`);
  const dragData = { items: [{ mimeType: 'application/x-nethack-selector', data: selector }, { mimeType: 'text/plain', data: selector }], dragOperationsMask: 1 };
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: target.x, y: target.y, data: dragData });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: target.x, y: target.y, data: dragData });
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: target.x, y: target.y, data: dragData });
  return { source, target, selector };
}
async function state(cdp) { return evalExpr(cdp, `(() => {
  const automation = window.__nethackAutomation?.state?.() || {};
  return {
    running: automation.runningState?.running || false,
    automationStatus: automation.status || '',
    seen: document.getElementById('shim-output')?.dataset?.seen || '',
    messages: window.__nethackPromptTest?.messages?.().slice(-8).map(m => m.text || String(m)) || [],
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    dialog: window.__nethackPromptTest?.dialog?.() || {},
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map(d => d.id),
    title: document.querySelector('#interaction-dialog h2')?.innerText || '',
    body: document.body.innerText,
    buttonLabel: document.getElementById('inventory-equipment-button')?.innerText || '',
    paperText: document.querySelector('.rpg-equipment-screen')?.innerText || '',
    playerAvatar: (() => { const el = document.querySelector('.player-avatar-display'); const img = el?.querySelector('.player-avatar-image'); const imgStyle = img ? getComputedStyle(img) : null; const imgBox = img?.getBoundingClientRect(); return { text: el?.innerText || '', tileId: el?.dataset?.tileId || '', src: el?.dataset?.avatarSrc || img?.getAttribute('src') || '', objectFit: img?.style?.objectFit || imgStyle?.getPropertyValue('object-fit') || '', objectPosition: img?.style?.objectPosition || imgStyle?.getPropertyValue('object-position') || '', width: Math.round(imgBox?.width || 0), height: Math.round(imgBox?.height || 0) }; })(),
    slotTexts: Array.from(document.querySelectorAll('.paper-doll-slots .equipment-slot')).map(el => ({slot: el.dataset.slot, text: el.innerText, equipped: el.classList.contains('equipped')})),
    inventorySnapshot: window.__nethackPromptTest?.inventory?.() || null,
    equipmentSnapshot: window.__nethackPromptTest?.equipmentSnapshot?.() || null,
    rowTexts: Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).map(el => el.innerText)
  };
})()`); }
async function startRealGame(cdp) {
  await clickCenter(cdp, '#start-shim');
  await delay(200);
  await evalExpr(cdp, `(() => { document.getElementById('player-role').value = 'Sam'; document.getElementById('player-align').value = 'Law'; document.getElementById('player-name').value = 'Electron'; })()`);
  await clickCenter(cdp, '#confirm-character');
  await waitFor(async () => { const s = await state(cdp); return s.running && /shim_glyph|shim_status_update|shim_curs|shim_putstr/.test(s.seen) ? s : null; }, 20000);
  const s = await state(cdp);
  if (s.dialogs.includes('intro-dialog')) {
    await clickCenter(cdp, '#intro-continue');
    await waitFor(async () => !(await state(cdp)).dialogs.includes('intro-dialog'), 5000);
  }
  await evalExpr(cdp, "document.getElementById('game-grid').focus(); window.__nethackPromptTest.clearSentInputs();");
  return state(cdp);
}
function isRpg(s) {
  const title = s.dialog?.title || s.title || '';
  const all = `${title}\n${s.paperText}\n${s.rowTexts.join('\n')}`;
  const slotNames = new Set((s.slotTexts || []).map((slot) => slot.slot));
  const requiredSlots = ['main-hand', 'armor-suit', 'shield', 'quiver', 'helmet', 'boots', 'left-ring', 'right-ring'];
  return /Equipment\s*\/\s*Inventory/i.test(title)
    && /Hero equipment/i.test(s.paperText)
    && Boolean(s.playerAvatar?.tileId)
    && /\.png/i.test(s.playerAvatar?.src || '')
    && s.playerAvatar?.objectFit === 'contain'
    && requiredSlots.every((slot) => slotNames.has(slot))
    && /spear|dagger|shield|food ration|armor|mail|bow|arrow|dart|katana|wakizashi|ya/i.test(all);
}
function slotItemLine(slotText) {
  return String(slotText || '').split('\n').map((line) => line.trim()).find((line, index) => index > 0 && line && !/^(?:Wield|Swap|Set|Throw|Take|Wear|Put|Remove|No\b)/i.test(line)) || '';
}
function isOldInventory(s) {
  const title = String(s.dialog?.title || s.title || '').trim();
  const all = `${title}\n${s.dialog?.prompt || ''}\n${s.rowTexts.join('\n')}\n${s.body}`;
  return /^(Inventory|NetHack choice|Menu)$/i.test(title) && !/Hero equipment/i.test(s.paperText) && /spear|dagger|shield|food ration|armor|mail|bow|arrow|dart/i.test(all);
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function waitForGameplayReady(cdp, timeoutMs = 7000) {
  return waitFor(async () => {
    const s = await state(cdp);
    if (s.dialogs.length || s.dialog?.interactionOpen) return null;
    if (/menu awaiting item selection|line input|yes\/no|updating/i.test(s.automationStatus)) return null;
    return s.running ? s : null;
  }, timeoutMs);
}

async function main() {
  const page = await Harness.createElectronBrowserDriver({ root, width, height, env: {} });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  const results = { outDir, screenshots: {}, checks: {} };
  let scenarioError = null;
  try {
    results.started = await startRealGame(cdp);
    results.screenshots.beforeKey = await shot(cdp, '01-real-game-before-key-i.png');

    await press(cdp, 'i', 'KeyI', 'i');
    results.afterKey = await waitFor(async () => { const s = await state(cdp); return isRpg(s) ? s : null; }, 7000);
    results.screenshots.afterKey = await shot(cdp, '02-real-key-i-equipment-screen.png');
    if (results.afterKey.rowTexts.some((text) => /dart|arrow|bolt|ya|ammo/i.test(text))) {
      results.actualDartsContextClick = await rightClickCenter(cdp, '#interaction-options .rpg-inventory-row');
      await delay(150);
      results.actualDartsContext = await evalExpr(cdp, `(() => ({ text: document.querySelector('.inventory-context-menu')?.innerText || '', feedback: document.getElementById('interaction-feedback')?.textContent || '' }))()`);
      results.screenshots.actualDartsContext = await shot(cdp, '02b-real-samurai-ammo-context-menu.png');
    }
    await evalExpr(cdp, "document.querySelector('.inventory-context-menu')?.remove();");
    await clickCenter(cdp, '#interaction-cancel');
    await delay(300);
    results.afterKeyDismissClickState = await state(cdp);
    fs.writeFileSync(path.join(outDir, 'after-key-dismiss-click-debug.json'), JSON.stringify(results.afterKeyDismissClickState, null, 2));
    results.screenshots.afterKeyDismissClick = await shot(cdp, '02c-after-inventory-close-click.png');
    results.afterKeyDismissed = await waitForGameplayReady(cdp);

    // Real game swap validation: Samurai starts with main and alternate weapons.
    await delay(1000);
    await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus();");
    await clickCenter(cdp, '#inventory-equipment-button');
    results.actualSwapBefore = await waitFor(async () => { const s = await state(cdp); return isRpg(s) ? s : null; }, 10000);
    results.screenshots.actualSwapBefore = await shot(cdp, '03a-real-swap-before-main-alternate.png');
    fs.writeFileSync(path.join(outDir, 'actual-swap-before-debug.json'), JSON.stringify(results.actualSwapBefore, null, 2));
    const beforeMainText = slotItemLine(results.actualSwapBefore.slotTexts.find((slot) => slot.slot === 'main-hand')?.text || '');
    const beforeOffhandText = slotItemLine(results.actualSwapBefore.slotTexts.find((slot) => slot.slot === 'offhand')?.text || '');
    await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs();");
    await clickCenter(cdp, '.paper-doll-slots .equipment-slot[data-slot="offhand"] button[data-action-id="slot.swapMainAlternate"]');
    await delay(1500);
    results.actualSwapAfter = await state(cdp);
    results.screenshots.actualSwapAfter = await shot(cdp, '03b-real-swap-after-main-alternate-swapped.png');
    fs.writeFileSync(path.join(outDir, 'actual-swap-after-debug.json'), JSON.stringify(results.actualSwapAfter, null, 2));
    await clickCenter(cdp, '#interaction-cancel');
    await waitForGameplayReady(cdp);
    await delay(1000);

    await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus();");
    results.beforeButton = await waitForGameplayReady(cdp);
    results.screenshots.beforeButton = await shot(cdp, '03-real-game-before-inventory-equipment-button.png');
    await clickCenter(cdp, '#inventory-equipment-button');
    results.afterButton = await waitFor(async () => { const s = await state(cdp); return isRpg(s) ? s : null; }, 7000);
    results.screenshots.afterButton = await shot(cdp, '04-real-button-equipment-screen.png');

    await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs();");
    results.actualSingleClickWeaponClick = await boxForText(cdp, '#interaction-options .rpg-inventory-row', 'katana');
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: results.actualSingleClickWeaponClick.x, y: results.actualSingleClickWeaponClick.y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: results.actualSingleClickWeaponClick.x, y: results.actualSingleClickWeaponClick.y, button: 'left', clickCount: 1 });
    await delay(150);
    results.actualSingleClickWeapon = await state(cdp);
    results.screenshots.actualSingleClickWeapon = await shot(cdp, '04a-real-single-click-weapon-noop.png');

    await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs();");
    results.actualDoubleClickWeaponClick = await doubleClickText(cdp, '#interaction-options .rpg-inventory-row', 'katana');
    await delay(1000);
    results.actualDoubleClickWeaponAfterCommand = await state(cdp);
    fs.writeFileSync(path.join(outDir, 'actual-double-click-weapon-after-command-debug.json'), JSON.stringify(results.actualDoubleClickWeaponAfterCommand, null, 2));
    results.screenshots.actualDoubleClickWeaponAfterCommand = await shot(cdp, '04b0-real-double-click-weapon-after-command.png');
    results.actualDoubleClickWeaponAfterLiveRefresh = await waitFor(async () => { const s = await state(cdp); return isRpg(s) ? s : null; }, 7000);
    results.screenshots.actualDoubleClickWeaponAfterLiveRefresh = await shot(cdp, '04b-real-double-click-katana-main-hand-still-open.png');

    await clickCenter(cdp, '#interaction-cancel');
    await waitForGameplayReady(cdp, 10000);
    await evalExpr(cdp, `window.__nethackAutomation?.stop?.()`);
    await delay(1000);
    results.dragDrop = await evalExpr(cdp, `(async () => {
      const t = window.__nethackPromptTest;
      t.reset(); t.setRunning(true);
      // The live-game half of this test intentionally leaves public inventory
      // snapshots populated. Seed this deterministic segment's public snapshot
      // with the same selector set as the fixture below so injected selectors
      // m/n/o/p are never shadowed by the Samurai live inventory a/b/c/d/e.
      t.setInventorySnapshotFeatureFlags?.({ useSnapshotForOverview: true });
      t.setEquipmentSnapshotFeatureFlags?.({ useSnapshotForPaperDoll: true });
      t.event({ name: 'shim_update_inventory', reason: -1, revision: 190, inventoryRevision: 190, equipmentRevision: 190, items: [
        { selector: 97, objectId: 1901, text: 'a - a blessed +1 long sword (weapon in hand)', quantity: 1, glyphChar: 41, wornMask: 256, semanticKind: 'object', semanticName: 'long sword', semanticKnown: true },
        { selector: 98, objectId: 1902, text: 'b - an uncursed dagger (alternate weapon; not wielded)', quantity: 1, glyphChar: 41, wornMask: 0, semanticKind: 'object', semanticName: 'dagger', semanticKnown: true },
        { selector: 99, objectId: 1903, text: 'c - an uncursed ring mail (being worn)', quantity: 1, glyphChar: 91, wornMask: 1, semanticKind: 'object', semanticName: 'ring mail', semanticKnown: true },
        { selector: 109, objectId: 1904, text: 'm - a +0 helmet', quantity: 1, glyphChar: 91, wornMask: 0, semanticKind: 'object', semanticName: 'helmet', semanticKnown: true },
        { selector: 110, objectId: 1905, text: 'n - 5 darts', quantity: 5, glyphChar: 41, wornMask: 0, semanticKind: 'object', semanticName: 'darts', semanticKnown: true },
        { selector: 111, objectId: 1906, text: 'o - a quarterstaff', quantity: 1, glyphChar: 41, wornMask: 0, semanticKind: 'object', semanticName: 'quarterstaff', semanticKnown: true },
        { selector: 112, objectId: 1907, text: 'p - an uncursed ring of protection', quantity: 1, glyphChar: 61, wornMask: 0, semanticKind: 'object', semanticName: 'ring of protection', semanticKnown: true }
      ] });
      t.event({name:'shim_start_menu', window:190});
      [
        [97, 'a - a blessed +1 long sword (weapon in hand)', 41, 'long sword'],
        [98, 'b - an uncursed dagger (alternate weapon; not wielded)', 41, 'dagger'],
        [99, 'c - an uncursed ring mail (being worn)', 91, 'ring mail'],
        [109, 'm - a +0 helmet', 91, 'helmet'],
        [110, 'n - 5 darts', 41, 'darts'],
        [111, 'o - a quarterstaff', 41, 'quarterstaff'],
        [112, 'p - an uncursed ring of protection', 61, 'ring of protection']
      ].forEach(([selector, text, glyphChar, semanticName]) => t.event({name:'shim_add_menu', window:190, selector, text, glyphChar, semanticKind:'object', semanticName}));
      t.event({name:'shim_end_menu', window:190, prompt:'Inventory:'});
      const describeRows = () => Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).map((el) => ({ key: el.dataset.key, text: el.innerText })).filter((row) => row.key || row.text);
      const requireElement = (el, label) => {
        if (!el) throw new Error('missing ' + label + '; current rows: ' + JSON.stringify(describeRows()) + '; current slots: ' + Array.from(document.querySelectorAll('.paper-doll-slots .equipment-slot')).map((slot) => slot.dataset.slot).join(','));
        return el;
      };
      const rowByKey = (key) => requireElement(document.querySelector('#interaction-options .rpg-inventory-row[data-key="' + CSS.escape(key) + '"]'), 'inventory row ' + key);
      const slotById = (slotId) => requireElement(document.querySelector('.paper-doll-slots .equipment-slot[data-slot="' + CSS.escape(slotId) + '"]'), 'equipment slot ' + slotId);
      t.clearSentInputs();
      rowByKey('m').click();
      const singleClickHelmetSent = t.sentInputs().join('');
      const singleClickHelmetTitle = document.getElementById('interaction-title').textContent;
      const singleClickContextOpen = Boolean(document.querySelector('.inventory-context-menu'));
      t.clearSentInputs();
      rowByKey('m').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
      t.forceCloseCurrentMenuForTest?.();
      await new Promise((resolve) => setTimeout(resolve, 170));
      const doubleClickHelmetSent = t.sentInputs().join('');
      const hasChooseBadge = Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row .menu-badges span')).some((badge) => /^CHOOSE$/i.test(badge.textContent.trim()));
      t.clearSentInputs();
      rowByKey('p').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
      t.forceCloseCurrentMenuForTest?.();
      await new Promise((resolve) => setTimeout(resolve, 170));
      const doubleClickRingSent = t.sentInputs().join('');
      const ringFeedback = document.getElementById('interaction-feedback').textContent;
      const openAfterRing = document.getElementById('interaction-dialog').open;
      document.querySelector('.inventory-context-menu')?.remove();
      t.clearSentInputs();
      rowByKey('p').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 880, clientY: 420 }));
      const ringContextText = document.querySelector('.inventory-context-menu')?.innerText || '';
      Array.from(document.querySelectorAll('.inventory-context-menu .inventory-context-action')).find((button) => /Put on left ring/i.test(button.innerText || ''))?.click();
      t.forceCloseCurrentMenuForTest?.();
      await new Promise((resolve) => setTimeout(resolve, 170));
      const contextRingSent = t.sentInputs().join('');
      const contextRingFeedback = document.getElementById('interaction-feedback').textContent;
      await new Promise((resolve) => setTimeout(resolve, 360));
      t.clearSentInputs();
      document.querySelector('.inventory-context-menu')?.remove();
      const dispatchDomDrop = (source, target) => {
        const dt = new DataTransfer();
        source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
        target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
      };
      t.clearSentInputs();
      dispatchDomDrop(rowByKey('m'), slotById('helmet'));
      t.forceCloseCurrentMenuForTest?.();
      await new Promise((resolve) => setTimeout(resolve, 170));
      const drop = async (rowKey, slotId, clickAfterDrop = false) => {
        t.clearSentInputs();
        const source = rowByKey(rowKey);
        dispatchDomDrop(source, slotById(slotId));
        t.forceCloseCurrentMenuForTest?.();
        await new Promise((resolve) => setTimeout(resolve, 170));
        if (clickAfterDrop) source.click();
        return { sent: t.sentInputs().join(''), feedback: document.getElementById('interaction-feedback').textContent, title: document.getElementById('interaction-title').textContent, open: document.getElementById('interaction-dialog').open, body: document.body.innerText };
      };
      const helmet = { sent: t.sentInputs().join(''), feedback: document.getElementById('interaction-feedback').textContent, title: document.getElementById('interaction-title').textContent, paper: document.querySelector('.rpg-equipment-screen')?.innerText || '' };
      t.setEquipmentSnapshotFeatureFlags?.({ useSnapshotForPaperDoll: false });
      t.event({name:'shim_start_menu', window:191});
      [
        [97, 'a - a blessed +1 long sword (alternate weapon; not wielded)', 41, 'long sword'],
        [98, 'b - an uncursed dagger (weapon in hand)', 41, 'dagger'],
        [99, 'c - an uncursed ring mail (being worn)', 91, 'ring mail'],
        [109, 'm - a +0 helmet', 91, 'helmet'],
        [110, 'n - 5 darts', 41, 'darts'],
        [111, 'o - a quarterstaff', 41, 'quarterstaff'],
        [112, 'p - an uncursed ring of protection', 61, 'ring of protection']
      ].forEach(([selector, text, glyphChar, semanticName]) => t.event({name:'shim_add_menu', window:191, selector, text, glyphChar, semanticKind:'object', semanticName}));
      t.event({name:'shim_end_menu', window:191, prompt:'Inventory:'});
      const swapAfterRefresh = { paper: document.querySelector('.rpg-equipment-screen')?.innerText || '', slots: Array.from(document.querySelectorAll('.paper-doll-slots .equipment-slot')).map(el => ({ slot: el.dataset.slot, text: el.innerText })) };
      const staffMainHand = await drop('o', 'main-hand', true);
      const dartsMainHand = await drop('n', 'main-hand', true);
      const dartsQuiver = await drop('n', 'quiver', true);
      const ringRightSlotDrop = await drop('p', 'right-ring', true);
      rowByKey('n').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 880, clientY: 340 }));
      const contextMenuText = document.querySelector('.inventory-context-menu')?.innerText || '';
      document.querySelector('.inventory-context-menu')?.remove();
      return { ...helmet, helmet, singleClickHelmetSent, singleClickHelmetTitle, singleClickContextOpen, doubleClickHelmetSent, doubleClickRingSent, ringFeedback, openAfterRing, ringContextText, contextRingSent, contextRingFeedback, hasChooseBadge, swapAfterRefresh, staffMainHand, dartsMainHand, dartsQuiver, ringRightSlotDrop, contextMenuText, paper: document.querySelector('.rpg-equipment-screen')?.innerText || '' };
    })()`);
    results.screenshots.dragDrop = await shot(cdp, '05-real-app-simulated-drag-helmet-to-slot.png');
    results.screenshots.swapRefresh = await shot(cdp, '06-real-app-simulated-swap-after-refresh.png');

    results.checks = {
      mcpCdpRealElectronGameStarted: Boolean(results.started.running) && /welcome to NetHack|Velkommen/i.test(results.started.messages.join('\n')),
      visibleInventoryEquipmentButton: /Inventory\s*\/\s*Equipment\s*\(i\)/i.test(results.started.buttonLabel),
      keyboardIReachesLiveBridge: /i/.test(results.afterKey.sent || ''),
      keyboardIOpensHeroEquipment: isRpg(results.afterKey),
      keyboardIDoesNotShowOldInventory: !isOldInventory(results.afterKey),
      toolbarButtonReachesSameLiveBridgeCommand: results.afterButton.sent === 'i',
      toolbarButtonOpensHeroEquipment: isRpg(results.afterButton),
      toolbarButtonDoesNotShowOldInventory: !isOldInventory(results.afterButton),
      snapshotOverviewAndPaperDollDefaultToVisiblePath: results.afterKey.inventorySnapshot?.featureFlags?.useSnapshotForOverview === true && results.afterKey.equipmentSnapshot?.featureFlags?.useSnapshotForPaperDoll === true && Number(results.afterKey.inventorySnapshot?.snapshotRevision || 0) > 0 && Number(results.afterKey.equipmentSnapshot?.revision || 0) > 0,
      snapshotVisibleRowsDoNotLeakHiddenIdentity: !/Inventory selector|semantic IDs|levitation|trueName|objectType|otyp/i.test(`${results.afterKey.rowTexts.join('\n')}\n${results.afterKey.paperText}`),
      inventoryRowsDoNotShowVagueChooseBadge: !results.afterKey.rowTexts.some((text) => /\bCHOOSE\b/.test(text)) && !results.afterButton.rowTexts.some((text) => /\bCHOOSE\b/.test(text)) && results.dragDrop.hasChooseBadge === false,
      simulatedSingleClickInventoryRowNoOp: results.dragDrop.singleClickHelmetSent === '' && /Equipment \/ Inventory/i.test(results.dragDrop.singleClickHelmetTitle || '') && !results.dragDrop.singleClickContextOpen,
      simulatedDoubleClickInventoryRowRoutesPrimaryAction: /^(?:\u001b)?Wmi?$/.test(results.dragDrop.doubleClickHelmetSent || ''),
      simulatedDoubleClickRingAnswersHandPrompt: /^(?:\u001b)?Ppli?$/.test(results.dragDrop.doubleClickRingSent || '') && /left hand/i.test(results.dragDrop.ringFeedback || '') && results.dragDrop.openAfterRing === true,
      simulatedRightClickRingUsesAutoHandRoute: /^(?:\u001b)?Ppli?$/.test(results.dragDrop.contextRingSent || '') && /Put on left ring/i.test(results.dragDrop.ringContextText || '') && /left hand/i.test(results.dragDrop.contextRingFeedback || '') && !/choose a hand|Which ring|left or right/i.test(`${results.dragDrop.ringContextText || ''}\n${results.dragDrop.contextRingFeedback || ''}`),
      actualInventoryCloseButtonDismissesRpgOnce: results.afterKeyDismissed?.running === true && results.afterKeyDismissClickState?.dialog?.interactionOpen === false,
      actualSingleClickInventoryRowNoOpVisiblePath: (results.actualSingleClickWeapon?.sent || '') === '' && isRpg(results.actualSingleClickWeapon) && !/Choose an action for this item|Do what with/i.test(results.actualSingleClickWeapon?.body || ''),
      actualDoubleClickInventoryRowKeepsEquipmentOpenAndRefreshes: /\u001bwa/.test(results.actualDoubleClickWeaponAfterCommand?.sent || '') && isRpg(results.actualDoubleClickWeaponAfterCommand) && isRpg(results.actualDoubleClickWeaponAfterLiveRefresh) && /katana/i.test((results.actualDoubleClickWeaponAfterLiveRefresh?.slotTexts || []).find((slot) => slot.slot === 'main-hand')?.text || '') && !/Choose an action for this item|Do what with/i.test(`${results.actualDoubleClickWeaponAfterCommand?.body || ''}\n${results.actualDoubleClickWeaponAfterLiveRefresh?.body || ''}`),
      actualSamuraiInventoryHasAmmo: results.afterKey.rowTexts.some((text) => /dart|arrow|bolt|ya|ammo/i.test(text)),
      actualRightClickAmmoShowsModernActions: (() => { const text = results.actualDartsContext?.text || ''; const expected = (/Wield in main hand/i.test(text) && /Ready in quiver/i.test(text) && /Throw/i.test(text)) || (/Clear\/change quiver/i.test(text) && /Fire \/ shoot readied item/i.test(text)); return expected && !/Do what with|Inventory selector|semantic IDs|compatibility commands|\b(?:item|slot)\.[A-Za-z]/i.test(text); })(),
      actualSwapButtonRoutesXAndChangesRealGameState: /x/.test(results.actualSwapAfter?.sent || '') && (() => { const afterMainText = slotItemLine((results.actualSwapAfter?.slotTexts || []).find((slot) => slot.slot === 'main-hand')?.text || ''); const afterOffhandText = slotItemLine((results.actualSwapAfter?.slotTexts || []).find((slot) => slot.slot === 'offhand')?.text || ''); results.actualSwapComparison = { beforeMainText, beforeOffhandText, afterMainText, afterOffhandText }; return Boolean(beforeMainText && beforeOffhandText && afterMainText === beforeOffhandText && afterOffhandText === beforeMainText); })() && !/Do what with|Inventory selector/i.test(`${results.actualSwapBefore?.paperText || ''}\n${results.actualSwapAfter?.paperText || ''}`),
      simulatedDragDropRoutesWearCommandInRealApp: /^(?:\u001b)?Wmi?$/.test(results.dragDrop.sent || '') && /Wear|Helmet/i.test(results.dragDrop.feedback || ''),
      simulatedStaffMainHandRoutesWieldWithoutGenericMenu: /^(?:\u001b)?woi?$/.test(results.dragDrop.staffMainHand?.sent || '') && /Wield|main hand/i.test(results.dragDrop.staffMainHand?.feedback || '') && /Equipment \/ Inventory/i.test(results.dragDrop.staffMainHand?.title || '') && !/Do what with|Choose an action for this item|Throw one of these|Wield this stack as your weapon/i.test(results.dragDrop.staffMainHand?.body || ''),
      simulatedDartsMainHandRoutesWieldWithoutGenericMenu: /^(?:\u001b)?wni?$/.test(results.dragDrop.dartsMainHand?.sent || '') && /Wield|main hand/i.test(results.dragDrop.dartsMainHand?.feedback || '') && /Equipment \/ Inventory/i.test(results.dragDrop.dartsMainHand?.title || '') && !/Do what with the darts\?|Throw one of these|Wield this stack as your weapon/i.test(results.dragDrop.dartsMainHand?.body || ''),
      simulatedDartsQuiverRoutesQuiverCommand: /^(?:\u001b)?Qni?$/.test(results.dragDrop.dartsQuiver?.sent || '') && /quiver|Ready/i.test(results.dragDrop.dartsQuiver?.feedback || ''),
      simulatedRingDropRightSlotTargetsRightRing: /^(?:\u001b)?Ppri?$/.test(results.dragDrop.ringRightSlotDrop?.sent || '') && /right hand/i.test(results.dragDrop.ringRightSlotDrop?.feedback || '') && !/Which ring|choose a hand/i.test(results.dragDrop.ringRightSlotDrop?.body || ''),
      simulatedRightClickDartsShowsModernActions: /Wield in main hand/i.test(results.dragDrop.contextMenuText || '') && /Ready in quiver/i.test(results.dragDrop.contextMenuText || '') && /Throw/i.test(results.dragDrop.contextMenuText || '') && !/Do what with the darts\?|Inventory selector|semantic IDs|compatibility commands|\b(?:item|slot)\.[A-Za-z]/i.test(results.dragDrop.contextMenuText || ''),
    };
    fs.writeFileSync(path.join(outDir, 'real-equipment-screen-mcp-summary.json'), JSON.stringify(results, null, 2));
    const md = [`# Real equipment screen MCP/CDP regression`, '', `Output: ${outDir}`, '', 'This starts real Electron NetHack and uses CDP keyboard/mouse events against the visible app for keyboard, toolbar, context menu, and swap paths. It then requests live bridge stop before running deterministic DOM-simulated drag/drop routing inside the same renderer session; that segment is routing coverage, not native pointer drag proof.', '', '## Checks', ...Object.entries(results.checks).map(([k,v]) => `- ${v ? 'passed' : 'failed'} ${k}`), '', '## Screenshots', ...Object.entries(results.screenshots).map(([k,v]) => `- ${k}: ${v}`), ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-equipment-screen-mcp-summary.md'), md);
    console.log(md);
    const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`Real equipment screen MCP regression failed: ${failed.join(', ')}`);
  } catch (error) {
    scenarioError = error;
  } finally {
    await page.close().catch((error) => { if (!scenarioError) scenarioError = error; });
  }
  qc.recordAssertions([{ id: 'scenario-completed', status: scenarioError ? 'failed' : 'passed', details: scenarioError ? String(scenarioError.message || scenarioError) : '' }]);
  qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  console.log(`real-equipment-screen-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}
const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
