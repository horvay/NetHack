const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_GROUND_PICKUP_OUT_DIR || path.join(root, 'test-output', 'multi-item-ground-pickup');
const port = Number(process.env.NH_GROUND_PICKUP_CDP_PORT || 9496);
const width = Number(process.env.NH_GROUND_PICKUP_WIDTH || 1280);
const height = Number(process.env.NH_GROUND_PICKUP_HEIGHT || 900);

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) {
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
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
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
async function pageState(cdp) { return evalExpr(cdp, `(() => {
  const d = window.__nethackPromptTest?.dialog?.() || {};
  const rows = Array.from(document.querySelectorAll('#interaction-options .choice-button'));
  const visibleRows = rows.filter((button) => !button.hidden);
  return {
    status: document.getElementById('status')?.textContent || '',
    seen: document.getElementById('shim-output')?.dataset?.seen || '',
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    dialog: d,
    rows: rows.map((button) => ({ key: button.dataset.key, text: button.innerText, className: button.className, hidden: button.hidden, role: button.getAttribute('role'), checked: button.getAttribute('aria-checked') })),
    visibleRows: visibleRows.map((button) => ({ key: button.dataset.key, text: button.innerText, className: button.className, role: button.getAttribute('role'), checked: button.getAttribute('aria-checked') })),
    transfer: window.__nethackPromptTest?.container?.(),
    transferRows: Array.from(document.querySelectorAll('#container-transfer-panel [data-container-pane="left"] .container-item-row')).map((button) => ({ key: button.dataset.selector, text: button.innerText })),
    hasLoading: /Loading inventory choices|Loading ground|Item names are unavailable|Inventory selector\s+[a-z]/i.test([(d.title || ''), (d.prompt || ''), rows.map((r) => r.innerText).join(String.fromCharCode(10)), document.getElementById('container-transfer-panel')?.innerText || ''].join(String.fromCharCode(10))),
    textValue: document.getElementById('interaction-text')?.value || '',
    confirmText: document.getElementById('interaction-confirm')?.textContent || '',
    selectAllVisible: !document.getElementById('interaction-select-all')?.hidden,
  };
})()`); }
async function startShim(cdp) {
  await clickCenter(cdp, '#start-shim'); await delay(200);
  if (await evalExpr(cdp, `document.getElementById('startup-choice-dialog')?.open === true`)) await clickCenter(cdp, '#startup-new-game');
  await waitFor(async () => evalExpr(cdp, `document.getElementById('character-dialog')?.open === true`), 5000);
  await clickCenter(cdp, '#confirm-character');
  const started = await waitFor(async () => { const s = await pageState(cdp); return s.running && /shim_glyph|shim_status_update|shim_curs|shim_putstr/.test(s.seen) ? s : null; }, 20000);
  const dialogs = started.dialog?.interactionOpen ? [] : await evalExpr(cdp, `Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id)`);
  if (dialogs.includes('intro-dialog')) {
    await evalExpr(cdp, `document.getElementById('intro-dialog')?.close?.('continue')`);
    await waitFor(async () => !(await evalExpr(cdp, `document.getElementById('intro-dialog').open`)), 5000);
  }
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid').focus(); window.__nethackPromptTest.clearSentInputs(); })()`);
}
async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height), NH_ELECTRON_TEST_FIXTURES: '1', NH_SHIM_TEST_PICKUP_PILE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; const stdout = []; const stderr = [];
  child.stdout.on('data', (d) => stdout.push(String(d))); child.stderr.on('data', (d) => stderr.push(String(d)));
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  const results = { outDir, screenshots: {}, checks: {} };
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, `document.readyState === 'complete' && !!window.__nethackAutomation`)), 10000);
    await startShim(cdp);

    // NetHack itself creates this deterministic three-object pile when
    // NH_SHIM_TEST_PICKUP_PILE=1 is present.  This is intentionally not a
    // renderer-injected menu fixture: the comma command below must travel
    // through the live shim/game select_menu path, and the rows must be the
    // exact rows emitted by NetHack for the pile.
    await evalExpr(cdp, `document.getElementById('game-grid').focus(); window.__nethackPromptTest.clearSentInputs();`);
    results.screenshots.before = await shot(cdp, '01-real-game-before-ground-pickup.png');
    await press(cdp, ',', 'Comma', ',');
    results.prePickupSent = await waitFor(async () => { const s = await pageState(cdp); return s.sent.includes(',') ? s.sent : null; }, 5000);
    const pickup = await waitFor(async () => { const s = await pageState(cdp); return s.transfer?.active && /Pick up from ground/i.test(s.transfer.text || '') ? s : null; }, 10000);
    results.pickup = pickup;
    results.screenshots.after = await shot(cdp, '02-real-game-multi-item-ground-pickup.png');

    const selectedStableId = pickup.transferRows[0].key;
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs()`);
    await evalExpr(cdp, `window.__nethackPromptTest.transferContainerItem('left', ${JSON.stringify(selectedStableId)})`);
    await delay(200);
    const confirmed = await pageState(cdp);
    results.confirmed = confirmed;

    const visibleText = pickup.transferRows.map((row) => row.text).join('\n');
    results.checks = {
      realPickupKeyPressedThroughLiveShim: typeof results.prePickupSent === 'string' && results.prePickupSent.includes(','),
      realGameGroundRowsRendered: pickup.transferRows.length === 3,
      realGameGroundRowsHaveExactNetHackPileNames: /food ration/i.test(visibleText) && /dagger/i.test(visibleText) && /3\s+arrows?/i.test(visibleText),
      rowsAreNotOldFixtureItems: !/orange potion|FOOBIE BLETCH/i.test(visibleText),
      groundRowsUseTransferPanel: /Ground items/i.test(pickup.transfer.text) && /Your inventory/i.test(pickup.transfer.text),
      notBlankLoadingOrFallback: !pickup.hasLoading && !/Item names are unavailable|Inventory selector|Loading/i.test(visibleText) && visibleText.trim().length > 0,
      explicitActualTransferMovesSelectedStableItem: !confirmed.transferRows.some((row) => row.key === selectedStableId) && /^\u001b?$/.test(confirmed.sent),
      visiblePlayerMeaningfulRows: !/Inventory selector/i.test(pickup.transfer.text),
    };
    fs.writeFileSync(path.join(outDir, 'multi-item-ground-pickup-summary.json'), JSON.stringify(results, null, 2));
    const md = [`# Multi-item ground pickup regression`, '', `Output: ${outDir}`, '', '## Checks', ...Object.entries(results.checks).map(([name, ok]) => `- ${ok ? 'PASS' : 'FAIL'} ${name}`), '', '## Screenshots', ...Object.entries(results.screenshots).map(([name, p]) => `- ${name}: ${p}`), ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'multi-item-ground-pickup-summary.md'), md);
    console.log(md);
    const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`Multi-item ground pickup regression failed: ${failed.join(', ')}`);
  } finally {
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), stdout.join(''));
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), stderr.join(''));
    cleanup();
  }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
