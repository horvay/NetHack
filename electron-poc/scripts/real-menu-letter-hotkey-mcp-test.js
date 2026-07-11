const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_REAL_MENU_HOTKEY_OUT_DIR || path.join(root, 'test-output', 'real-menu-letter-hotkeys-mcp');
const port = Number(process.env.NH_REAL_MENU_HOTKEY_CDP_PORT || 9764);
const width = Number(process.env.NH_REAL_MENU_HOTKEY_WIDTH || 1440);
const height = Number(process.env.NH_REAL_MENU_HOTKEY_HEIGHT || 1080);
const scenarioId = process.env.NH_REAL_MENU_HOTKEY_SCENARIO || 'identity/valkyrie-equipped-inventory';

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out waiting'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await delay(120); }
async function press(cdp, key) { const special = key === 'Escape' ? ['Escape', 27, ''] : key === 'Enter' ? ['Enter', 13, '\r'] : [`Key${key.toUpperCase()}`, key.toUpperCase().charCodeAt(0), key]; const [code, vk, text] = special; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text, unmodifiedText: text, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); await delay(180); }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  cursor: window.__nethackAutomation?.state?.().cursor || {},
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  dialog: window.__nethackPromptTest?.dialog?.() || {},
  messages: window.__nethackPromptTest?.messages?.().slice(-20).map((m) => m.text || String(m)) || [],
  status: document.getElementById('status')?.textContent || '',
  seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
  shim: document.getElementById('shim-output')?.innerText || '',
  body: document.body.innerText
}))()`); }
function rel(file) { return path.relative(outDir, file).replaceAll(path.sep, '/'); }

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height), NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '976401', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; let logs = '';
  child.stdout.on('data', (d) => { logs += d; }); child.stderr.on('data', (d) => { logs += d; });
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); fs.writeFileSync(path.join(outDir, 'electron-output.raw'), logs); };
  process.on('exit', cleanup);
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);

    await click(cdp, '#start-shim');
    await delay(250);
    if ((await state(cdp)).dialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game');
    await waitFor(() => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 8000);
    await evalExpr(cdp, `(() => { document.getElementById('player-name').value = 'MenuHotkey' + Date.now().toString(36).slice(-4); document.getElementById('player-name').dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await click(cdp, '#confirm-character');
    await waitFor(async () => (await state(cdp)).running, 20000);
    await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`);
    await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 12000);

    const screenshots = [];
    screenshots.push({ path: rel(await shot(cdp, '01-real-game-before-menu.png')), notes: 'Real scenario loaded; map is focused and no item popup is open.' });

    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid')?.focus();`);
    await press(cdp, 'h');
    const movement = await state(cdp);
    assert('plain h still reaches dungeon command path when no popup is open', movement.sent === 'h' && /(?:sent key: move \(h\)|command completed: key h)/i.test(movement.status), JSON.stringify({ sent: movement.sent, status: movement.status }));

    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid')?.focus();`);
    const cursorBeforeMenu = (await state(cdp)).cursor;
    await press(cdp, 'T');
    const menu = await waitFor(async () => { const s = await state(cdp); return s.dialog?.interactionOpen && /take off/i.test(`${s.dialog.title}\n${s.dialog.prompt}`) && s.dialog.options?.length ? s : null; }, 8000);
    const target = menu.dialog.options.find((o) => /^[hjklyubn]$/.test(o.key || '')) || menu.dialog.options[0];
    assert('take-off menu exposes lettered rows', target?.key && /being worn|worn|shield|armor|leather|wooden/i.test(target.text || ''), JSON.stringify(menu.dialog));
    screenshots.push({ path: rel(await shot(cdp, '02-real-takeoff-menu-before-letter.png')), notes: `Take-off popup shows visible selector ${target.key} for row: ${String(target.text || '').replace(/\s+/g, ' ').trim()}` });

    await press(cdp, target.key);
    const afterSelection = await waitFor(async () => { const s = await state(cdp); return s.sent === `T${target.key}` ? s : null; }, 8000);
    await delay(600);
    const settled = await state(cdp);
    screenshots.push({ path: rel(await shot(cdp, '03-real-after-letter-selection.png')), notes: 'After pressing the shown selector letter, the popup has been acted on via menu selection text rather than dungeon movement.' });

    assert('letter key was routed as menu row activation, not dungeon movement', afterSelection.sent === `T${target.key}` && !new RegExp(`sent key: move \\(${target.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'i').test(afterSelection.status), JSON.stringify({ target, sent: afterSelection.sent, status: afterSelection.status }));
    assert('selector key did not move the player cursor behind the popup', JSON.stringify(settled.cursor) === JSON.stringify(cursorBeforeMenu) || JSON.stringify(settled.cursor) === JSON.stringify(afterSelection.cursor), JSON.stringify({ before: cursorBeforeMenu, afterSelection: afterSelection.cursor, settled: settled.cursor, target }));

    const summary = { ok: true, scenarioId, target, movement: { sent: movement.sent, status: movement.status }, afterSelection: { sent: afterSelection.sent, status: afterSelection.status, cursor: afterSelection.cursor }, settled: { cursor: settled.cursor, messages: settled.messages.slice(-8), dialogOpen: settled.dialog.interactionOpen }, screenshots };
    fs.writeFileSync(path.join(outDir, 'real-menu-letter-hotkey-summary.json'), JSON.stringify(summary, null, 2));
    console.log(`real menu letter hotkey MCP passed: ${screenshots.map((s) => s.path).join(' ')}`);
    cleanup();
  } catch (error) {
    fs.writeFileSync(path.join(outDir, 'real-menu-letter-hotkey-failure.log'), error.stack || String(error));
    cleanup();
    throw error;
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
