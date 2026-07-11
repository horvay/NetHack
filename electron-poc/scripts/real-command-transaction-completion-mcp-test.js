const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-command-transaction-completion');
const scenarioId = 'identity/valkyrie-equipped-inventory';
const port = Number(process.env.NH_COMMAND_TRANSACTION_CDP_PORT || 9657);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,text:el.innerText} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); return box; }
async function press(cdp, key, code, text) { const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0; const params = { key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }; if (text !== undefined) params.text = text; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }); }
async function boxForText(cdp, selector, pattern) { const box = await evalExpr(cdp, `(() => { const re = new RegExp(${JSON.stringify(pattern)}, 'i'); const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((candidate) => re.test(candidate.innerText || '')); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText,datasetKey:el.dataset.key || el.dataset.dragSelector || ''} : null; })()`); if (!box) throw new Error(`missing ${selector} matching ${pattern}`); return box; }
async function clickBox(cdp, box) { await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function doubleClickText(cdp, selector, pattern) { const box = await boxForText(cdp, selector, pattern); for (const clickCount of [1, 2]) { await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount }); await delay(80); } return box; }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
  shim: document.getElementById('shim-output')?.innerText || '',
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  body: document.body.innerText,
  feedback: document.getElementById('interaction-feedback')?.textContent || '',
  dialog: window.__nethackPromptTest?.dialog?.() || {},
  transactions: window.__nethackPromptTest?.commandTransactions?.() || {},
  inventory: window.__nethackPromptTest?.inventory?.() || {},
  equipmentSnapshot: window.__nethackPromptTest?.equipmentSnapshot?.() || {},
  rows: Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).map((el) => ({ key: el.dataset.key || '', text: el.innerText })),
  slots: Array.from(document.querySelectorAll('.paper-doll-slots .equipment-slot')).map((el) => ({ slot: el.dataset.slot, text: el.innerText, equipped: el.classList.contains('equipped') }))
}))()`); }
async function start(cdp) { await click(cdp, '#start-shim'); await delay(250); await click(cdp, '#confirm-character'); await waitFor(async () => (await state(cdp)).running, 20000); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); }
function slotText(s, slot) { return (s.slots || []).find((entry) => entry.slot === slot)?.text || ''; }
function lastCompleted(s) { return s.transactions?.lastCompleted || null; }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
function isEquipmentScreen(s) { return Boolean(s.dialog?.interactionOpen) && /Equipment\s*\/\s*Inventory/i.test(s.dialog?.title || ''); }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '660077', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    await waitFor(async () => { const s = await state(cdp); fs.writeFileSync(path.join(outDir, '00-start-wait-state.json'), JSON.stringify(s, null, 2)); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 30000);
    await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid')?.focus?.(); window.__nethackAutomation?.sendKeycode?.(105);");
    await delay(1200);
    results.afterInventoryCommand = await state(cdp);
    results.screenshots.afterInventoryCommand = await shot(cdp, '00-after-inventory-command-debug.png');
    const before = await waitFor(async () => { const s = await state(cdp); return isEquipmentScreen(s) && /shield/i.test(slotText(s, 'shield')) && /wand of digging/i.test(`${s.rows.map((r) => r.text).join('\n')}\n${s.body}`) ? s : null; }, 10000);
    results.before = before;
    results.screenshots.before = await shot(cdp, '01-equipment-before-actions.png');

    await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs();");
    await click(cdp, '.paper-doll-slots .equipment-slot[data-slot="shield"] .equipment-slot-actions button');
    const takeOffChoice = await waitFor(async () => boxForText(cdp, '#interaction-options .choice-button', 'Take off this armor').catch(() => null), 2500).catch(() => null);
    results.screenshots.afterTakeOffMenu = await shot(cdp, '01b-shield-action-menu.png');
    if (takeOffChoice) await clickBox(cdp, takeOffChoice);
    await delay(1500);
    results.afterTakeOffCommand = await state(cdp);
    fs.writeFileSync(path.join(outDir, '01c-after-shield-take-off-command-state.json'), JSON.stringify(results.afterTakeOffCommand, null, 2));
    results.screenshots.afterTakeOffCommand = await shot(cdp, '01c-after-shield-take-off-command-debug.png');
    const afterTakeOff = await waitFor(async () => { const s = await state(cdp); fs.writeFileSync(path.join(outDir, '01d-waiting-shield-take-off-state.json'), JSON.stringify(s, null, 2)); const completed = lastCompleted(s); return /No shield worn|No.*shield/i.test(slotText(s, 'shield')) && completed?.result?.status === 'success' ? s : null; }, 15000);
    results.afterTakeOff = afterTakeOff;
    results.screenshots.afterTakeOff = await shot(cdp, '02-after-shield-take-off-completed.png');

    await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs();");
    await doubleClickText(cdp, '#interaction-options .rpg-inventory-row', 'wand of digging');
    await delay(1500);
    results.afterWieldCommand = await state(cdp);
    fs.writeFileSync(path.join(outDir, '02b-after-wand-wield-command-state.json'), JSON.stringify(results.afterWieldCommand, null, 2));
    results.screenshots.afterWieldCommand = await shot(cdp, '02b-after-wand-wield-command-debug.png');
    const afterWield = await waitFor(async () => { const s = await state(cdp); fs.writeFileSync(path.join(outDir, '02c-waiting-wand-wield-state.json'), JSON.stringify(s, null, 2)); const completed = lastCompleted(s); return /wand of digging/i.test(slotText(s, 'main-hand')) && completed?.result?.status === 'success' && /wield/i.test(completed.semanticAction || '') ? s : null; }, 18000);
    results.afterWield = afterWield;
    results.screenshots.afterWield = await shot(cdp, '03-after-wand-wield-completed.png');

    const takeOffResult = lastCompleted(afterTakeOff)?.result || {};
    const wieldResult = lastCompleted(afterWield)?.result || {};
    const textAll = `${before.body}\n${afterTakeOff.body}\n${afterWield.body}`;
    results.checks = {
      scenarioLoaded: /bridge_test_scenario_loaded/.test(`${before.seenShim}\n${before.shim}`),
      shieldTakeOffCompletedTransaction: takeOffResult.status === 'success' && (takeOffResult.delta?.equipment?.slotsChanged || []).some((slot) => slot.slotId === 'armor.shield'),
      shieldVisibleAsEmptyAfterCompletion: /No shield worn/i.test(slotText(afterTakeOff, 'shield')),
      wandWieldCompletedTransaction: wieldResult.status === 'success' && /public-state-updated/.test(wieldResult.kind || '') && (wieldResult.delta?.equipment?.slotsChanged || []).some((slot) => slot.slotId === 'mainHand' && /wand of digging/i.test(slot.after?.displayName || '')),
      wandVisibleInMainHand: /wand of digging/i.test(slotText(afterWield, 'main-hand')),
      transactionIdsTracked: Boolean(lastCompleted(afterTakeOff)?.transactionId && lastCompleted(afterWield)?.transactionId && lastCompleted(afterTakeOff).transactionId !== lastCompleted(afterWield).transactionId),
      noFallbackOrDeveloperLabels: !/Inventory selector|Name unavailable|Program in disorder|Please report these messages/i.test(textAll),
    };
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(results, null, 2));
    const md = [`# Real command transaction completion smoke`, '', `Scenario: ${scenarioId}`, `Output: ${outDir}`, '', '## Checks', ...Object.entries(results.checks).map(([name, ok]) => `- ${ok ? 'PASS' : 'FAIL'} ${name}`), '', '## Screenshots', ...Object.entries(results.screenshots).map(([name, value]) => `- ${name}: ${value}`), ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'summary.md'), md);
    console.log(md);
    const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`Command transaction completion scenario failed: ${failed.join(', ')}`);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
