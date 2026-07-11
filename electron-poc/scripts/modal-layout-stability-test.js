const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_MODAL_LAYOUT_OUT_DIR || path.join(root, 'test-output', 'modal-layout-stability');
const port = Number(process.env.NH_MODAL_LAYOUT_CDP_PORT || 9547);
const width = Number(process.env.NH_MODAL_LAYOUT_WIDTH || 1620);
const height = Number(process.env.NH_MODAL_LAYOUT_HEIGHT || 930);

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 100) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeoutMs) {
    try { const value = await fn(); if (value) return value; } catch (error) { last = error; }
    await delay(stepMs);
  }
  throw last || new Error('timed out waiting');
}
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function shot(cdp, name) {
  const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const p = path.join(outDir, name);
  fs.writeFileSync(p, Buffer.from(res.data, 'base64'));
  return p;
}
async function press(cdp, key, code = key, text) {
  const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
  const params = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  if (text !== undefined) params.text = text;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
function rectDelta(a, b) {
  const keys = ['left', 'top', 'width', 'height', 'right', 'bottom'];
  return Object.fromEntries(keys.map((key) => [key, Math.round((b[key] - a[key]) * 100) / 100]));
}
function maxAbsDelta(delta) { return Math.max(...Object.values(delta).map((value) => Math.abs(value))); }
function assertStableRect(name, before, after, tolerance = 1) {
  const delta = rectDelta(before, after);
  assert(`${name} bounding box stable`, maxAbsDelta(delta) <= tolerance, JSON.stringify({ before, after, delta, tolerance }));
}
async function layoutSnapshot(cdp) {
  return evalExpr(cdp, `(() => {
    function box(selector) { const el = document.querySelector(selector); const r = el?.getBoundingClientRect?.(); return r ? { left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom } : null; }
    function groupBoxes() { return Array.from(document.querySelectorAll('#stats-panel .status-group')).map((el) => { const r = el.getBoundingClientRect(); return { label: el.querySelector('.status-group-label')?.textContent || '', left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; }); }
    const context = document.getElementById('context-strip');
    const style = context ? getComputedStyle(context) : null;
    return {
      bodyClass: document.body.className,
      modalLock: document.body.classList.contains('modal-overlay-active'),
      contextAriaHidden: context?.getAttribute('aria-hidden') || '',
      contextText: context?.innerText || '',
      contextRect: box('#context-strip'),
      contextStyle: style ? { position: style.position, opacity: style.opacity, pointerEvents: style.pointerEvents, width: style.width, height: style.height } : null,
      openDialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
      rects: { topBar: box('#top-bar'), statsPanel: box('#stats-panel'), quickActions: box('#quick-actions'), contextActionBar: box('#context-action-bar'), gameGrid: box('#game-grid'), logPanel: box('#log-panel') },
      groups: groupBoxes(),
      statsText: document.getElementById('stats-panel')?.innerText || ''
    };
  })()`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  child.stdout.on('data', (d) => process.stdout.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "document.readyState === 'complete' && !!window.__nethackPromptTest" })).result.value, 10000);

    let before = await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      t.reset(); t.setRunning(true); t.setCursor(24, 10);
      const values = [[0,'Ada72 the Digger'],[1,'10'],[2,'10'],[3,'15'],[4,'15'],[5,'14'],[6,'9'],[7,'Lawful'],[8,'0'],[10,'\\\\G00000007:7'],[11,'1'],[12,'1'],[13,'1'],[16,'1'],[18,'15'],[19,'15'],[20,'Dlvl:1']];
      for (const [field, value] of values) t.event({ name: 'shim_status_update', field, value });
      function box(selector) { const el = document.querySelector(selector); const r = el?.getBoundingClientRect?.(); return r ? { left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom } : null; }
      function groupBoxes() { return Array.from(document.querySelectorAll('#stats-panel .status-group')).map((el) => { const r = el.getBoundingClientRect(); return { label: el.querySelector('.status-group-label')?.textContent || '', left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; }); }
      return { bodyClass: document.body.className, modalLock: document.body.classList.contains('modal-overlay-active'), contextText: document.getElementById('context-strip')?.innerText || '', rects: { topBar: box('#top-bar'), statsPanel: box('#stats-panel'), quickActions: box('#quick-actions'), contextActionBar: box('#context-action-bar'), gameGrid: box('#game-grid'), logPanel: box('#log-panel') }, groups: groupBoxes(), statsText: document.getElementById('stats-panel')?.innerText || '' };
    })()`);
    if (before.modalLock) before = await waitFor(async () => { const snapshot = await layoutSnapshot(cdp); return !snapshot.modalLock ? snapshot : null; }, 5000);
    const beforeShot = await shot(cdp, '01-before-inventory-modal.png');
    assert('precondition has status HUD groups', before.groups.length >= 4 && /Hero|Attributes|Vitals|Dungeon/i.test(before.statsText), JSON.stringify(before));
    assert('precondition starts without modal layout lock', !before.modalLock, JSON.stringify(before));

    await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      t.event({ name:'shim_start_menu', window:189, menuPurpose:'inventory.displayInventory', owner:{kind:'inventory', window:189}, lifecycle:'opened' });
      [
        [36, '$ - 7 gold pieces', 36, 'gold'],
        [97, 'a - a blessed +2 bullwhip (alternate weapon; not wielded)', 41, 'bullwhip'],
        [98, 'b - an uncursed +0 leather jacket (being worn)', 91, 'leather jacket'],
        [99, 'c - an uncursed +0 fedora (being worn)', 91, 'fedora'],
        [100, 'd - 4 uncursed food rations', 37, 'food ration'],
        [101, 'e - a +0 pick-axe (weapon in right hand)', 41, 'pick-axe'],
        [102, 'f - a tinning kit (0:72)', 47, 'tinning kit'],
        [103, 'g - an uncursed touchstone', 96, 'touchstone'],
        [104, 'h - an empty uncursed sack', 40, 'sack']
      ].forEach(([selector, text, glyphChar, semanticName]) => t.event({ name:'shim_add_menu', window:189, selector, text, glyphChar, semanticKind:'object', semanticName, menuPurpose:'inventory.displayInventory', owner:{kind:'inventory', window:189}, lifecycle:'opened' }));
      t.event({ name:'shim_end_menu', window:189, prompt:'Menu', menuPurpose:'inventory.displayInventory', owner:{kind:'inventory', window:189}, lifecycle:'ready' });
      t.event({ name:'shim_select_menu', window:189, how:1, menuPurpose:'inventory.displayInventory', owner:{kind:'inventory', window:189}, lifecycle:'selecting' });
      return true;
    })()`);

    const after = await waitFor(async () => evalExpr(cdp, `(() => {
      function box(selector) { const el = document.querySelector(selector); const r = el?.getBoundingClientRect?.(); return r ? { left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom } : null; }
      function groupBoxes() { return Array.from(document.querySelectorAll('#stats-panel .status-group')).map((el) => { const r = el.getBoundingClientRect(); return { label: el.querySelector('.status-group-label')?.textContent || '', left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; }); }
      const context = document.getElementById('context-strip');
      const style = context ? getComputedStyle(context) : null;
      const dialogOpen = document.getElementById('interaction-dialog')?.open;
      const title = document.getElementById('interaction-title')?.textContent || '';
      const options = document.getElementById('interaction-options');
      const optionsStyle = options ? getComputedStyle(options) : null;
      return dialogOpen && document.body.classList.contains('modal-overlay-active') ? { bodyClass: document.body.className, modalLock: true, title, contextText: context?.textContent || '', contextStyle: style ? { position: style.position, opacity: style.opacity, pointerEvents: style.pointerEvents, width: style.width, height: style.height } : null, rects: { topBar: box('#top-bar'), statsPanel: box('#stats-panel'), quickActions: box('#quick-actions'), contextActionBar: box('#context-action-bar'), gameGrid: box('#game-grid'), logPanel: box('#log-panel'), dialog: box('#interaction-dialog'), form: box('#interaction-form'), paper: box('.paper-doll-panel'), options: box('#interaction-options') }, scroll: { bodyWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth, dialogScrollWidth: document.getElementById('interaction-dialog')?.scrollWidth || 0, dialogClientWidth: document.getElementById('interaction-dialog')?.clientWidth || 0, optionsScrollWidth: options?.scrollWidth || 0, optionsClientWidth: options?.clientWidth || 0, optionsOverflowX: optionsStyle?.overflowX || '' }, groups: groupBoxes(), statsText: document.getElementById('stats-panel')?.innerText || '' } : null;
    })()`), 5000);
    const afterShot = await shot(cdp, '02-after-inventory-modal.png');

    assert('inventory/equipment dialog opened', /Equipment\s*\/\s*Inventory/i.test(after.title), after.title);
    assert('equipment dialog keeps its production two-column width instead of inheriting the compact inventory width', after.rects.dialog.width >= 900 && after.rects.options.width >= 300, JSON.stringify({ dialog: after.rects.dialog, options: after.rects.options }));
    assert('equipment dialog does not create page/dialog horizontal overflow', after.scroll.bodyWidth <= after.scroll.viewportWidth + 1 && after.scroll.dialogScrollWidth <= after.scroll.dialogClientWidth + 1 && after.scroll.optionsOverflowX === 'hidden', JSON.stringify(after.scroll));
    assert('menu prompt text is present but removed from layout while modal is active', /Inventory/i.test(after.contextText) && after.contextStyle?.position === 'absolute' && after.contextStyle?.opacity === '0', JSON.stringify(after.contextStyle));
    for (const key of ['topBar', 'statsPanel', 'quickActions', 'contextActionBar', 'gameGrid', 'logPanel']) assertStableRect(key, before.rects[key], after.rects[key], 1);
    assert('same number of status groups before and after modal', before.groups.length === after.groups.length, JSON.stringify({ before: before.groups, after: after.groups }));
    for (let index = 0; index < before.groups.length; index += 1) {
      assert(`status group ${before.groups[index].label} stayed on same row/slot`, before.groups[index].label === after.groups[index].label, JSON.stringify({ before: before.groups, after: after.groups }));
      assertStableRect(`status group ${before.groups[index].label}`, before.groups[index], after.groups[index], 1);
    }

    await press(cdp, 'Escape', 'Escape');
    const closingSamples = [];
    for (let index = 0; index < 26; index += 1) {
      closingSamples.push(await layoutSnapshot(cdp));
      await delay(50);
    }
    const unstableCloseSamples = closingSamples.map((sample, index) => ({
      index,
      openDialogs: sample.openDialogs,
      bodyClass: sample.bodyClass,
      contextText: sample.contextText,
      deltas: Object.fromEntries(['topBar', 'statsPanel', 'quickActions', 'contextActionBar', 'gameGrid', 'logPanel'].map((key) => [key, rectDelta(before.rects[key], sample.rects[key])])),
    })).filter((sample) => Object.values(sample.deltas).some((delta) => maxAbsDelta(delta) > 1));
    assert('inventory Escape close keeps map/background layout stable during stale-menu grace window', unstableCloseSamples.length === 0, JSON.stringify(unstableCloseSamples.slice(0, 5)));
    const afterClose = await waitFor(async () => evalExpr(cdp, `(() => {
      function box(selector) { const el = document.querySelector(selector); const r = el?.getBoundingClientRect?.(); return r ? { left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom } : null; }
      const context = document.getElementById('context-strip');
      const style = context ? getComputedStyle(context) : null;
      function groupBoxes() { return Array.from(document.querySelectorAll('#stats-panel .status-group')).map((el) => { const r = el.getBoundingClientRect(); return { label: el.querySelector('.status-group-label')?.textContent || '', left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; }); }
      return !document.getElementById('interaction-dialog')?.open && !document.body.classList.contains('modal-overlay-active') ? { bodyClass: document.body.className, modalLock: false, contextAriaHidden: context?.getAttribute('aria-hidden') || '', contextText: context?.innerText || '', contextRect: box('#context-strip'), contextStyle: style ? { position: style.position, opacity: style.opacity, pointerEvents: style.pointerEvents, width: style.width, height: style.height } : null, rects: { topBar: box('#top-bar'), statsPanel: box('#stats-panel'), quickActions: box('#quick-actions'), contextActionBar: box('#context-action-bar'), gameGrid: box('#game-grid'), logPanel: box('#log-panel') }, groups: groupBoxes() } : null;
    })()`), 5000);
    assert('Escape close removes modal layout lock and aria-hidden', !afterClose.modalLock && afterClose.contextAriaHidden === '' && afterClose.contextStyle?.position === 'absolute' && afterClose.contextStyle?.opacity === '1', JSON.stringify(afterClose));
    if (afterClose.contextText.trim()) {
      const overlaps = afterClose.groups.filter((group) => !(group.right <= afterClose.contextRect.left || group.left >= afterClose.contextRect.right || group.bottom <= afterClose.contextRect.top || group.top >= afterClose.contextRect.bottom));
      assert('visible non-modal context strip does not overlap status groups', overlaps.length === 0, JSON.stringify({ context: afterClose.contextRect, overlaps, groups: afterClose.groups }));
    }

    await evalExpr(cdp, `document.getElementById('open-actions')?.click()`);
    const actionOpen = await waitFor(async () => evalExpr(cdp, `(() => {
      function box(selector) { const el = document.querySelector(selector); const r = el?.getBoundingClientRect?.(); return r ? { left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom } : null; }
      const open = document.getElementById('action-dialog')?.open && document.body.classList.contains('modal-overlay-active');
      return open ? { title: document.getElementById('action-dialog-title')?.textContent || '', rects: { topBar: box('#top-bar'), statsPanel: box('#stats-panel'), quickActions: box('#quick-actions'), contextActionBar: box('#context-action-bar'), gameGrid: box('#game-grid'), logPanel: box('#log-panel') } } : null;
    })()`), 5000);
    assert('action dialog opens under modal layout lock', /Use item/i.test(actionOpen.title), actionOpen.title);
    const actionShot = await shot(cdp, '03-action-dialog-layout-lock.png');
    for (const key of ['topBar', 'statsPanel', 'quickActions', 'contextActionBar', 'gameGrid', 'logPanel']) assertStableRect(`action ${key}`, afterClose.rects[key], actionOpen.rects[key], 1);
    await evalExpr(cdp, `document.getElementById('action-dialog-close')?.click()`);
    await waitFor(async () => evalExpr(cdp, `!document.getElementById('action-dialog')?.open && !document.body.classList.contains('modal-overlay-active')`), 5000);

    await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      t.setContainerStateForTest({ active:true, sessionKind:'container', phase:'ready', prompt:'Open large box', leftItems:[{selector:97,text:'a - an uncursed food ration',semanticKind:'object'}], rightItems:[{selector:98,text:'b - a scroll of identify',semanticKind:'object'}], loadedSides:{left:true,right:true}, loadingSides:{left:false,right:false}, feedback:'Both panes loaded. Drag items between container and inventory.' });
    })()`);
    const containerOpen = await waitFor(async () => evalExpr(cdp, `(() => {
      function box(selector) { const el = document.querySelector(selector); const r = el?.getBoundingClientRect?.(); return r ? { left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom } : null; }
      const panel = document.getElementById('container-transfer-panel');
      return panel && !panel.hidden && document.body.classList.contains('modal-overlay-active') ? { text: panel.innerText, rects: { topBar: box('#top-bar'), statsPanel: box('#stats-panel'), quickActions: box('#quick-actions'), contextActionBar: box('#context-action-bar'), gameGrid: box('#game-grid'), logPanel: box('#log-panel') } } : null;
    })()`), 5000);
    const containerShot = await shot(cdp, '04-container-transfer-layout-lock.png');
    assert('container transfer panel opens under modal layout lock', /Open large box|Container inventory|Your inventory/i.test(containerOpen.text), containerOpen.text);
    for (const key of ['topBar', 'statsPanel', 'quickActions', 'contextActionBar', 'gameGrid', 'logPanel']) assertStableRect(`container ${key}`, afterClose.rects[key], containerOpen.rects[key], 1);
    await press(cdp, 'Escape', 'Escape');
    await waitFor(async () => evalExpr(cdp, `document.getElementById('container-transfer-panel')?.hidden && !document.body.classList.contains('modal-overlay-active')`), 5000);

    const summary = { beforeShot, afterShot, actionShot, containerShot, before, after, closingSamples, afterClose, actionOpen, containerOpen };
    fs.writeFileSync(path.join(outDir, 'modal-layout-stability-summary.json'), JSON.stringify(summary, null, 2));
    console.log(`modal layout stability test passed: ${beforeShot} ${afterShot}`);
  } catch (error) {
    fs.writeFileSync(path.join(outDir, 'modal-layout-stability-failure.log'), error.stack || String(error));
    throw error;
  } finally {
    cleanup();
  }
}

main();
