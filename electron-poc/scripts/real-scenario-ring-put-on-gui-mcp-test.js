const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-scenario-ring-put-on-gui');
const scenarioId = 'equipment/ring-put-on-gui';
const port = Number(process.env.NH_SCENARIO_RING_CDP_PORT || 9647);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function press(cdp, key, code, text) { const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0; const params = { key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }; if (text !== undefined) params.text = text; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }); }
async function boxForText(cdp, selector, pattern) { const box = await evalExpr(cdp, `(() => { const re = new RegExp(${JSON.stringify(pattern)}, 'i'); const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((candidate) => re.test(candidate.innerText || '')); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText,datasetKey:el.dataset.key || el.dataset.dragSelector || ''} : null; })()`); if (!box) throw new Error(`missing ${selector} matching ${pattern}`); return box; }
async function clickBox(cdp, box) { await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function doubleClickText(cdp, selector, pattern) { const box = await boxForText(cdp, selector, pattern); for (const clickCount of [1, 2]) { await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount }); await delay(80); } return box; }
async function dragTextToSlot(cdp, sourcePattern, targetSlot) { const source = await boxForText(cdp, '#interaction-options .rpg-inventory-row', sourcePattern); const target = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(`.paper-doll-slots .equipment-slot[data-slot="${targetSlot}"]`)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText} : null; })()`); if (!target) throw new Error(`missing slot ${targetSlot}`); const dragData = { items: [{ mimeType: 'application/x-nethack-selector', data: source.datasetKey }, { mimeType: 'text/plain', data: source.datasetKey }], dragOperationsMask: 1 }; await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: target.x, y: target.y, data: dragData }); await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: target.x, y: target.y, data: dragData }); await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: target.x, y: target.y, data: dragData }); return { source, target }; }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
  shim: document.getElementById('shim-output')?.innerText || '',
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  messages: window.__nethackPromptTest?.messages?.().slice(-16).map((m) => m.text || String(m)) || [],
  dialog: window.__nethackPromptTest?.dialog?.() || {},
  activePrompt: window.__nethackAutomation?.state?.().activePrompt || null,
  body: document.body.innerText,
  rows: Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).map((el) => ({ key: el.dataset.key || '', text: el.innerText })),
  slots: Array.from(document.querySelectorAll('.paper-doll-slots .equipment-slot')).map((el) => ({ slot: el.dataset.slot, text: el.innerText, equipped: el.classList.contains('equipped') })),
  feedback: document.getElementById('interaction-feedback')?.textContent || ''
}))()`); }
async function start(cdp) { await evalExpr(cdp, `document.querySelector('#start-shim')?.click()`); await delay(500); await evalExpr(cdp, `document.querySelector('#confirm-character')?.click()`); await waitFor(async () => (await state(cdp)).running, 20000); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
function isEquipmentScreen(s) { return Boolean(s.dialog?.interactionOpen) && /Equipment\s*\/\s*Inventory/i.test(s.dialog?.title || '') && /ring of protection/i.test(s.rows.map((row) => row.text).join('\n')); }
function noFingerPrompt(s) { return !/Which .*?(?:ring-|finger)|Right or Left|left or right|choose a hand/i.test(`${s.dialog?.prompt || ''}\n${s.activePrompt?.query || ''}`); }
function hasFingerPrompt(s) { return /Which .*?(?:ring-|finger)|Right or Left|left or right|choose a hand/i.test(`${s.dialog?.prompt || ''}\n${s.body}\n${s.activePrompt?.query || ''}`); }
function slotText(s, slot) { return (s.slots || []).find((entry) => entry.slot === slot)?.text || ''; }
function rowKey(s, pattern) { const re = new RegExp(pattern, 'i'); const row = (s.rows || []).find((entry) => re.test(entry.text || '')); return row?.key || ''; }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '555123', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', (d) => { logs += d; }); child.stderr.on('data', (d) => { logs += d; });
  let cdp; const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); fs.writeFileSync(path.join(outDir, 'electron.log'), logs); };
  process.on('exit', cleanup);
  const results = { scenarioId, outDir, screenshots: {}, checks: {} };
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((page) => page.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((page) => page.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    results.screenshots.started = await shot(cdp, '01-scenario-loaded.png');
    await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid')?.focus?.();");
    await press(cdp, 'P', 'KeyP', 'P');
    await delay(500);
    await waitFor(async () => { const s = await state(cdp); return /What do you want to put on/i.test(`${s.dialog?.prompt || ''}\n${s.body}`) ? s : null; }, 10000);
    results.afterClassicKeyboardP = await state(cdp);
    results.screenshots.afterClassicKeyboardP = await shot(cdp, '02-after-classic-keyboard-P.png');
    results.classicPutOnMenu = results.afterClassicKeyboardP;
    results.screenshots.classicPutOnMenu = await shot(cdp, '02-classic-keyboard-put-on-menu.png');
    const classicRingRow = await boxForText(cdp, '#interaction-options .choice-button', 'ring of protection');
    const classicRingKey = classicRingRow.datasetKey;
    assert('classic ring selector found', Boolean(classicRingKey), JSON.stringify(results.classicPutOnMenu.rows));
    await clickBox(cdp, classicRingRow);
    results.classicFingerPrompt = await waitFor(async () => { const s = await state(cdp); return hasFingerPrompt(s) ? s : null; }, 10000);
    results.screenshots.classicFingerPrompt = await shot(cdp, '03-classic-keyboard-ring-finger-prompt.png');
    await evalExpr(cdp, "window.__nethackAutomation?.sendKeycode?.(108)");
    await delay(500);
    await evalExpr(cdp, `(async () => { window.__nethackAutomation?.sendKeycode?.(${'R'.charCodeAt(0)}); await new Promise((resolve) => setTimeout(resolve, 80)); window.__nethackAutomation?.sendKeycode?.(32); })()`);
    await delay(700);
    results.afterClassicCleanup = await state(cdp);
    results.screenshots.afterClassicCleanup = await shot(cdp, '03b-after-classic-cleanup.png');

    await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid')?.focus?.(); window.__nethackAutomation?.sendKeycode?.(105);");
    await delay(700);
    results.afterInventoryKey = await state(cdp);
    results.screenshots.afterInventoryKey = await shot(cdp, '03c-after-inventory-key.png');
    results.before = await waitFor(async () => { const s = await state(cdp); return isEquipmentScreen(s) ? s : null; }, 10000);
    results.screenshots.before = await shot(cdp, '04-before-right-ring-drop.png');

    await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs();");
    await dragTextToSlot(cdp, 'ring of protection', 'right-ring');
    await delay(1200);
    results.afterRightFirstDragCommand = await state(cdp);
    results.screenshots.afterRightFirstDragCommand = await shot(cdp, '05-after-first-ring-dragged-to-right-command.png');
    results.afterRightFirstDragRefresh = await waitFor(async () => { const s = await state(cdp); return /ring of protection/i.test(slotText(s, 'right-ring')) ? s : null; }, 10000);
    results.screenshots.afterRightFirstDragRefresh = await shot(cdp, '06-after-first-ring-equipped-on-right.png');

    await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs();");
    await dragTextToSlot(cdp, 'ring of adornment', 'right-ring');
    await delay(700);
    results.afterOccupiedRightReject = await state(cdp);
    results.screenshots.afterOccupiedRightReject = await shot(cdp, '07-after-occupied-right-ring-drop-rejected.png');

    const textAll = `${results.classicPutOnMenu.body}\n${results.classicFingerPrompt.body}\n${results.before.body}\n${results.afterRightFirstDragCommand.body}\n${results.afterRightFirstDragRefresh.body}\n${results.afterOccupiedRightReject.body}`;
    results.checks = {
      scenarioLoaded: /bridge_test_scenario_loaded/.test(`${results.before.seenShim}\n${results.before.shim}`),
      classicKeyboardShowsOrdinaryRingFingerPrompt: hasFingerPrompt(results.classicFingerPrompt),
      classicKeyboardDidNotAutoAnswerHand: String(results.classicFingerPrompt.sent || '') === `P${classicRingKey}`,
      equipmentScreenHasTwoRings: /ring of protection/i.test(results.before.rows.map((r) => r.text).join('\n')) && /ring of adornment/i.test(results.before.rows.map((r) => r.text).join('\n')),
      rightFirstDragSentPutOnSelectorAndRightAnswer: /^\u001bP.r/s.test(String(results.afterRightFirstDragCommand.sent || '')),
      rightFirstDragNoVisibleFingerPrompt: noFingerPrompt(results.afterRightFirstDragCommand) && noFingerPrompt(results.afterRightFirstDragRefresh),
      rightFirstDragEquipsRightRing: /ring of protection/i.test(slotText(results.afterRightFirstDragRefresh, 'right-ring')) && !/ring of protection/i.test(slotText(results.afterRightFirstDragRefresh, 'left-ring')),
      occupiedRightDropRejectedWithoutCommand: String(results.afterOccupiedRightReject.sent || '') === '' && /right ring slot is occupied/i.test(results.afterOccupiedRightReject.feedback || ''),
      occupiedRightDropDidNotEquipOtherHand: !/ring of adornment/i.test(slotText(results.afterOccupiedRightReject, 'left-ring')),
      noFallbackOrDeveloperLabels: !/Inventory selector|Name unavailable|Loading your inventory|Program in disorder|Please report these messages/i.test(textAll),
    };
    fs.writeFileSync(path.join(outDir, 'real-scenario-ring-put-on-gui-summary.json'), JSON.stringify(results, null, 2));
    const md = [`# Real scenario ring put-on GUI smoke`, '', `Scenario: ${scenarioId}`, `Output: ${outDir}`, '', '## Checks', ...Object.entries(results.checks).map(([name, ok]) => `- ${ok ? 'PASS' : 'FAIL'} ${name}`), '', '## Screenshots', ...Object.entries(results.screenshots).map(([name, value]) => `- ${name}: ${value}`), ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-scenario-ring-put-on-gui-summary.md'), md);
    console.log(md);
    const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`Ring put-on GUI scenario failed: ${failed.join(', ')}`);
  } finally {
    cleanup();
  }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
