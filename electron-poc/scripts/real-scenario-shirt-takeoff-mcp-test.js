const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-scenario-shirt-takeoff');
const scenarioId = 'equipment/body-armor-over-shirt';
const port = Number(process.env.NH_SCENARIO_SHIRT_TAKEOFF_CDP_PORT || 9636);
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function press(cdp, key, code, text) { const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0; const params = { key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }; if (text !== undefined) params.text = text; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  interaction: window.__nethackPromptTest?.dialog?.(),
  equipment: window.__nethackPromptTest?.equipment?.(),
  panelSlots: Array.from(document.querySelectorAll('.rpg-equipment-screen .paper-doll-slots .equipment-slot')).map((slot) => ({ slot: slot.dataset.slot, text: slot.innerText, equipped: slot.classList.contains('equipped'), blockerTokens: slot.dataset.blockerTokens || '' })),
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
  shim: document.getElementById('shim-output')?.innerText || '',
  messages: window.__nethackPromptTest?.messages?.().slice(-12).map((m) => m.text || String(m)) || [],
  body: document.body.innerText,
  running: window.__nethackAutomation?.state?.().runningState?.running || false
}))()`); }
async function start(cdp) { await click(cdp, '#start-shim'); await delay(250); await click(cdp, '#confirm-character'); await waitFor(async () => (await state(cdp)).running, 20000).catch(async (error) => { const debug = await state(cdp).catch(() => ({})); fs.writeFileSync(path.join(outDir, 'start-timeout-debug.json'), JSON.stringify(debug, null, 2)); await shot(cdp, 'debug-start-timeout.png').catch(() => undefined); throw error; }); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); }
function dialogText(s) { return `${s.interaction?.title || ''}\n${s.interaction?.prompt || ''}\n${s.interaction?.panelControls?.text || ''}\n${(s.interaction?.options || []).map((o) => o.text || '').join('\n')}`; }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424243', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', (d) => { logs += d; process.stdout.write(d); }); child.stderr.on('data', (d) => { logs += d; process.stderr.write(d); });
  let cdp; const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); fs.writeFileSync(path.join(outDir, 'electron.log'), logs); };
  process.on('exit', cleanup);
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    await evalExpr(cdp, "document.getElementById('game-grid')?.focus?.(); window.__nethackPromptTest?.clearSentInputs?.();");
    await press(cdp, 'i', 'KeyI', 'i');
    const before = await waitFor(async () => { const s = await state(cdp); const text = dialogText(s); return /Equipment\s*\/\s*Inventory/i.test(s.interaction?.title || '') && /Armor \/ body[\s\S]*leather armor/i.test(text) && /T-shirt/i.test(text) ? s : null; }, 10000);
    const beforeShot = await shot(cdp, '01-shirt-under-armor-before-takeoff.png');
    const beforeText = dialogText(before);
    const beforeArmorCards = before.panelSlots.filter((slot) => ['armor-suit', 'shirt'].includes(slot.slot));
    const beforeOffhand = before.panelSlots.find((slot) => slot.slot === 'offhand') || {};
    assert('before takeoff has one body card showing leather armor over hidden shirt card', beforeArmorCards.length === 1 && /leather armor/i.test(beforeArmorCards[0].text) && !/T-shirt/i.test(beforeArmorCards[0].text), JSON.stringify(beforeArmorCards));
    assert('before takeoff shows public body-over-shirt blocker label and token', /Shirt covered/i.test(beforeArmorCards[0].text || '') && /blocked\.armor\.bodyOverShirt/.test(beforeArmorCards[0].blockerTokens || ''), JSON.stringify(beforeArmorCards));
    assert('before takeoff offhand is empty with no swap', /No alternate\/offhand metadata known/i.test(beforeOffhand.text || '') && !/Swap with alternate weapon|Take off|long sword/i.test(beforeOffhand.text || ''), JSON.stringify(beforeOffhand));
    assert('before takeoff has no NetHack disorder messages', !/Program in disorder|Please report these messages|m_detach/i.test(`${before.messages.join('\n')}\n${before.body}`), JSON.stringify(before.messages));

    const takeOffButtonEvidence = await evalExpr(cdp, `(() => { const button = document.querySelector('.rpg-equipment-screen .paper-doll-slots .equipment-slot[data-slot="armor-suit"] button[data-command-key="T"]'); return { text: button?.textContent || '', commandKey: button?.dataset?.commandKey || '', itemSelector: button?.dataset?.itemSelector || '', actionId: button?.dataset?.actionId || '' }; })()`);
    assert('body armor Take off button has direct selector metadata', takeOffButtonEvidence.commandKey === 'T' && /^[A-Za-z]$/.test(takeOffButtonEvidence.itemSelector || ''), JSON.stringify(takeOffButtonEvidence));
    await evalExpr(cdp, "window.__nethackPromptTest?.clearSentInputs?.();");
    await click(cdp, '.rpg-equipment-screen .paper-doll-slots .equipment-slot[data-slot="armor-suit"] button[data-command-key="T"]');
    await delay(500);
    const sentAfterClick = (await state(cdp)).sent;
    const after = await waitFor(async () => { const s = await state(cdp); const armor = s.panelSlots?.find((slot) => slot.slot === 'armor-suit'); return /Equipment\s*\/\s*Inventory/i.test(s.interaction?.title || '') && /T-shirt/i.test(armor?.text || '') ? s : null; }, 30000).catch(async (error) => { const debug = await state(cdp).catch(() => ({})); fs.writeFileSync(path.join(outDir, 'takeoff-timeout-debug.json'), JSON.stringify({ takeOffButtonEvidence, sentAfterClick, debug }, null, 2)); await shot(cdp, 'debug-shirt-takeoff-timeout.png').catch(() => undefined); throw error; });
    const afterShot = await shot(cdp, '02-shirt-visible-after-armor-takeoff.png');
    const afterText = dialogText(after);
    const afterArmorCards = after.panelSlots.filter((slot) => ['armor-suit', 'shirt'].includes(slot.slot));
    const afterOffhand = after.panelSlots.find((slot) => slot.slot === 'offhand') || {};
    assert('Take off sent Escape plus direct T selector before refresh', /^\u001bT./.test(sentAfterClick) || /^\u001bT./.test(after.sent), JSON.stringify({ sentAfterClick, finalSent: after.sent, takeOffButtonEvidence }));
    assert('after takeoff has exactly one body/shirt card showing T-shirt', afterArmorCards.length === 1 && /T-shirt/i.test(afterArmorCards[0].text) && !/leather armor/i.test(afterArmorCards[0].text), JSON.stringify(afterArmorCards));
    assert('after takeoff inventory row offers leather armor wear again', /leather armor[\s\S]*Wear in matching slot/i.test(afterText), afterText);
    assert('after takeoff offhand remains empty with no invalid controls', /No alternate\/offhand metadata known/i.test(afterOffhand.text || '') && !/Swap with alternate weapon|Take off|long sword/i.test(afterOffhand.text || ''), JSON.stringify(afterOffhand));
    assert('after takeoff does not leave item-action modal/prompt visible', !/Take off\s*→\s*Choose item|Do what with .*leather armor\?|Take off this armor/i.test(afterText), afterText);
    assert('after takeoff has no duplicate body/shirt paper-doll card text', (afterText.match(/ARMOR \/ BODY|ARMOR \/ SHIRT/gi) || []).length === 1, afterText);

    const summary = [`# Body armor over shirt real Electron scenario`, '', 'PASS', '', `Scenario: ${scenarioId}`, `Before screenshot: ${beforeShot}`, `After screenshot: ${afterShot}`, '', 'Verified through visible UI:', '- body armor initially owns the single body card while a worn T-shirt remains underneath', '- body card exposes the public blocked.armor.bodyOverShirt label without curse/welded state', '- clicking body armor Take off sends Escape + direct T selector', '- post-takeoff single body/shirt card shows the T-shirt with no duplicate armor body card', '- alternate/offhand remains empty and has no invalid swap/take-off controls', '', 'After equipment text:', '```', afterText, '```', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-scenario-shirt-takeoff-summary.md'), summary);
    fs.writeFileSync(path.join(outDir, 'shirt-takeoff-debug.json'), JSON.stringify({ before: { text: beforeText, armorCards: beforeArmorCards, offhand: beforeOffhand }, after: { sentAfterClick, finalSent: after.sent, takeOffButtonEvidence, text: afterText, armorCards: afterArmorCards, offhand: afterOffhand } }, null, 2));
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
