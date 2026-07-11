const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_MENU_HOTKEY_OUT_DIR || path.join(root, 'test-output', 'menu-letter-hotkeys');
const port = Number(process.env.NH_MENU_HOTKEY_CDP_PORT || 9763);
const width = Number(process.env.NH_MENU_HOTKEY_WIDTH || 1280);
const height = Number(process.env.NH_MENU_HOTKEY_HEIGHT || 900);

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
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
async function press(cdp, key) {
  const code = key === 'Escape' ? 'Escape' : `Key${key.toUpperCase()}`;
  const vk = key === 'Escape' ? 27 : key.toUpperCase().charCodeAt(0);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text: key.length === 1 ? key : '', unmodifiedText: key.length === 1 ? key : '', windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await delay(120);
}
async function state(cdp) { return evalExpr(cdp, `(() => ({
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  payloads: window.__nethackPromptTest?.sentPayloads?.() || [],
  dialog: window.__nethackPromptTest?.dialog?.() || {},
  status: document.getElementById('status')?.textContent || '',
  activeElement: document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName || '',
  body: document.body.innerText
}))()`); }
async function setupSingleSelect(cdp, count = 3) {
  return evalExpr(cdp, `(() => {
    const t = window.__nethackPromptTest;
    t.reset(); t.setRunning(true); t.setCursor(12, 12);
    t.event({name:'shim_start_menu', window:501});
    const rows = [
      ['a', 'a - a robe (being worn)'],
      ['b', 'b - a pair of walking shoes (being worn)'],
      ['h', 'h - a pair of leather gloves (being worn)'],
      ['k', 'k - an iron skull cap (being worn)'],
      ['m', 'm - a small shield (being worn)'],
      ['z', 'z - a cloak (being worn)'],
    ].slice(0, ${count});
    for (const [key, text] of rows) t.event({name:'shim_add_menu', window:501, selector:key.charCodeAt(0), text, glyphChar:91, semanticKind:'object'});
    t.event({name:'shim_end_menu', window:501, prompt:'What do you want to take off?'});
    t.event({name:'shim_select_menu', window:501, how:1});
    return t.dialog();
  })()`);
}
async function setupMultiSelect(cdp) {
  return evalExpr(cdp, `(() => {
    const t = window.__nethackPromptTest;
    t.reset(); t.setRunning(true); t.setCursor(12, 12);
    t.event({name:'shim_start_menu', window:502});
    t.event({name:'shim_add_menu', window:502, selector:104, text:'h - a food ration', glyphChar:37, semanticKind:'object'});
    t.event({name:'shim_add_menu', window:502, selector:106, text:'j - an apple', glyphChar:37, semanticKind:'object'});
    t.event({name:'shim_end_menu', window:502, prompt:'Which inventory items should be marked?'});
    t.event({name:'shim_select_menu', window:502, how:2});
    return t.dialog();
  })()`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; let logs = '';
  child.stdout.on('data', (d) => { logs += d; }); child.stderr.on('data', (d) => { logs += d; });
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); fs.writeFileSync(path.join(outDir, 'electron-output.raw'), logs); };
  process.on('exit', cleanup);
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);

    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.reset(); t.setRunning(true); t.setCursor(12, 12); t.clearSentInputs(); document.getElementById('game-grid')?.focus(); })()`);
    await press(cdp, 'h');
    const noPopup = await state(cdp);
    assert('normal dungeon h still routes as movement key when no popup is open', noPopup.sent === 'h' && /sent key: move \(h\)/i.test(noPopup.status), JSON.stringify(noPopup));

    const menu = await setupSingleSelect(cdp, 3);
    assert('single-select take-off menu is visible with h row', menu.interactionOpen && menu.options.some((o) => o.key === 'h' && /leather gloves/i.test(o.text || '')), JSON.stringify(menu));
    const singleShot = await shot(cdp, '01-single-select-takeoff-menu-before-h.png');
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await press(cdp, 'h');
    const afterSingle = await state(cdp);
    const singleAfterShot = await shot(cdp, '02-single-select-after-h-hotkey.png');
    assert('single-select h hotkey activates the visible menu row exactly once', afterSingle.sent === 'h' && /sent text: h/i.test(afterSingle.status), JSON.stringify(afterSingle));

    const filteredMenu = await setupSingleSelect(cdp, 6);
    assert('large single-select menu uses text filter and still shows h row', filteredMenu.interactionOpen && filteredMenu.textEntry && filteredMenu.options.some((o) => o.key === 'h'), JSON.stringify(filteredMenu));
    const filterShot = await shot(cdp, '03-large-single-select-filter-before-h.png');
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs(); document.getElementById('interaction-text')?.focus();`);
    await press(cdp, 'h');
    const afterFiltered = await state(cdp);
    const filterAfterShot = await shot(cdp, '04-large-single-select-filter-after-h.png');
    assert('single-select h hotkey activates even when filter input is focused', afterFiltered.sent === 'h' && /sent text: h/i.test(afterFiltered.status), JSON.stringify(afterFiltered));

    const multi = await setupMultiSelect(cdp);
    assert('multi-select menu is visible with h row', multi.interactionOpen && multi.options.some((o) => o.key === 'h' && /food ration/i.test(o.text || '')), JSON.stringify(multi));
    const multiShot = await shot(cdp, '05-multi-select-before-h.png');
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await press(cdp, 'h');
    const afterMulti = await state(cdp);
    const multiAfterShot = await shot(cdp, '06-multi-select-after-h-no-immediate-activate.png');
    assert('multi-select h does not immediate-activate or leak to dungeon', afterMulti.sent === '', JSON.stringify(afterMulti));

    const summary = { ok: true, screenshots: [singleShot, singleAfterShot, filterShot, filterAfterShot, multiShot, multiAfterShot], noPopup, afterSingle, afterFiltered, afterMulti };
    fs.writeFileSync(path.join(outDir, 'menu-letter-hotkey-regression-summary.json'), JSON.stringify(summary, null, 2));
    console.log(`menu letter hotkey regression passed: ${summary.screenshots.join(' ')}`);
    cleanup();
  } catch (error) {
    fs.writeFileSync(path.join(outDir, 'menu-letter-hotkey-regression-failure.log'), error.stack || String(error));
    cleanup();
    throw error;
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
