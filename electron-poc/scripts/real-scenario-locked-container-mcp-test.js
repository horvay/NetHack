const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-scenario-locked-container');
const scenarioId = 'container/locked-trapped-chest-on-hero';
const port = Number(process.env.NH_SCENARIO_LOCKED_CDP_PORT || 9633);
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
function writeState(name, value) { const p = path.join(outDir, name); fs.writeFileSync(p, JSON.stringify(value, null, 2)); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function sendKey(cdp, ch) { await evalExpr(cdp, `window.__nethackAutomation.sendKeycode(${JSON.stringify(ch.charCodeAt(0))})`); }
async function sendEsc(cdp) { await evalExpr(cdp, `window.__nethackAutomation.sendKeycode(27)`); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id), actions: window.__nethackPromptTest?.contextActions?.(), sent: window.__nethackPromptTest?.sentInputs?.().join('') || '', sentPayloads: window.__nethackPromptTest?.sentPayloads?.() || [], sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [], prompt: window.__nethackPromptTest?.prompt?.(), dialog: window.__nethackPromptTest?.dialog?.(), currentCell: window.__nethackPromptTest?.currentCell?.(), messages: window.__nethackPromptTest?.messages?.().slice(-12).map((m) => m.text || String(m)) || [], running: window.__nethackAutomation?.state?.().runningState?.running || false, body: document.body.innerText, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '' }))()`); }
async function start(cdp) { await click(cdp, '#start-shim'); await delay(250); await click(cdp, '#confirm-character'); await waitFor(async () => (await state(cdp)).running, 20000); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); }
async function main() {
  if (fs.existsSync(outDir)) {
    const previousDir = `${outDir}.previous-${Date.now()}`;
    fs.renameSync(outDir, previousDir);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_SHIM_RESET_LOCKS: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup); child.stdout.on('data', (d) => process.stdout.write(d)); child.stderr.on('data', (d) => process.stderr.write(d));
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    const loaded = await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000).catch(async (error) => {
      const debug = await state(cdp).catch((stateError) => ({ stateError: String(stateError) }));
      fs.writeFileSync(path.join(outDir, 'scenario-load-timeout-debug.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, 'debug-scenario-load-timeout.png').catch(() => undefined);
      throw error;
    });
    assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
    const ready = await waitFor(async () => { const s = await state(cdp); const ids = (s.actions?.buttons || []).map((b) => b.id); return ids.includes('open-container') && ids.includes('tip-container') && ids.includes('force-container') && ids.includes('untrap-container') ? s : null; }, 10000).catch(async (error) => { const debug = await state(cdp).catch(() => ({})); fs.writeFileSync(path.join(outDir, 'scenario-locked-timeout-debug.json'), JSON.stringify(debug, null, 2)); await shot(cdp, 'debug-scenario-locked-timeout.png').catch(() => undefined); throw error; });
    const contextShot = await shot(cdp, '01-scenario-locked-container-context-actions.png');
    const contextStatePath = writeState('01-scenario-locked-container-context-actions-state.json', ready);
    const labels = (ready.actions.buttons || []).filter((b) => ['open-container', 'tip-container', 'force-container', 'untrap-container'].includes(b.id)).map((b) => `${b.id}:${b.text}`).join('\n');
    assert('locked/trapped context exposes Open box', /open-container:Open box/.test(labels), labels);
    assert('locked/trapped context exposes Force lock', /force-container:Force lock/.test(labels), labels);
    assert('locked/trapped context exposes Tip', /tip-container:Tip/.test(labels), labels);
    assert('locked/trapped context exposes Untrap from visible trapped text', /untrap-container:Untrap/.test(labels), labels);
    assert('context UI avoids fallback labels', !/Inventory selector|Name unavailable|Loading your inventory/i.test(ready.body), ready.body.slice(0, 1200));

    await delay(500);
    await waitFor(async () => { const s = await state(cdp); const ids = (s.actions?.buttons || []).map((b) => b.id); return !s.prompt && ids.includes('untrap-container') ? s : null; }, 5000);
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await click(cdp, '#context-action-bar button[data-context-action-id="untrap-container"]');
    await delay(250);
    const afterUntrap = await state(cdp);
    const untrapShot = await shot(cdp, '03-after-untrap-container-followup.png');
    const untrapStatePath = writeState('03-after-untrap-container-followup-state.json', afterUntrap);
    assert('Untrap context action routes exactly to #untrap without a direction answer', afterUntrap.sent === '#untrap\n', JSON.stringify({ sent: afterUntrap.sent, messages: afterUntrap.messages, prompt: afterUntrap.prompt, dialog: afterUntrap.dialog }));
    assert('Untrap context action is validated as v2 action.execute ground.untrapContainer', afterUntrap.sentPayloads.some((payload) => payload.uiProtocolCommandType === 'action.execute' && payload.uiProtocolActionId === 'ground.untrapContainer'), JSON.stringify(afterUntrap.sentPayloads));
    assert('Untrap v2 envelope carries explicit public ground target and NetHack-owned follow-up policy', afterUntrap.sentUiProtocolCommands.some((command) => command.commandType === 'action.execute' && command.actionId === 'ground.untrapContainer' && command.targets?.location?.kind === 'ground' && command.payload?.target?.location?.kind === 'ground' && command.payload?.promptPolicy === 'netHack-owned-followup'), JSON.stringify(afterUntrap.sentUiProtocolCommands));
    assert('Bridge accepts native ui-command ground.untrapContainer metadata', /bridge_ui_command_accepted[^\n]*ground\.untrapContainer/.test(afterUntrap.shim || ''), (afterUntrap.shim || '').slice(-2000));
    assert('Bridge does not reject ground.untrapContainer', !/bridge_ui_command_rejected[^\n]*ground\.untrapContainer/.test(afterUntrap.shim || ''), (afterUntrap.shim || '').slice(-2000));
    assert('Untrap opens a NetHack-owned direction prompt', afterUntrap.prompt?.promptType === 'direction' && /direction/i.test(afterUntrap.prompt?.query || ''), JSON.stringify(afterUntrap.prompt));

    await evalExpr(cdp, `(() => { const base = window.__nethackPromptTest.sentUiProtocolCommands()[0]; const command = JSON.parse(JSON.stringify(base)); command.commandId = 'cmd-native-active-owner-force'; command.transactionId = 'txn-native-active-owner-force'; command.actionId = 'ground.forceContainer'; command.action = { id: 'ground.forceContainer', label: 'Force lock' }; command.payload.actionId = 'ground.forceContainer'; command.payload.label = 'Force lock'; command.payload.route.actionId = 'ground.forceContainer'; command.payload.route.label = 'Force lock'; command.payload.route.command = '#force\\n'; window.__nethackPromptTest.clearSentInputs(); return window.__nethackPromptTest.nativeRawUiCommand(command); })()`);
    await delay(150);
    const blockedDuringPrompt = await state(cdp);
    const blockedStatePath = writeState('03b-active-owner-blocks-force-during-untrap-prompt-state.json', blockedDuringPrompt);
    assert('Active direction prompt blocks native bridge ui-command without raw fallback keys', blockedDuringPrompt.sent === '', JSON.stringify({ sent: blockedDuringPrompt.sent, payloads: blockedDuringPrompt.sentPayloads, status: blockedDuringPrompt.status }));
    assert('Native bridge rejects the second ground.forceContainer ui-command while prompt owns input', /bridge_ui_command_rejected[^\n]*ground\.forceContainer[^\n]*active prompt\/menu owner blocks ui-command/.test(blockedDuringPrompt.shim || ''), (blockedDuringPrompt.shim || '').slice(-2000));
    assert('Native active-owner rejection lowers no force bridge_command keys', !/bridge_command[^\n]*txn-native-active-owner-force/.test(blockedDuringPrompt.shim || ''), (blockedDuringPrompt.shim || '').slice(-2000));

    const summary = [`# Scenario loader locked/trapped container real Electron smoke`, '', 'PASS', '', `Scenario: ${scenarioId}`, `Context screenshot: ${contextShot}`, `Context state: ${contextStatePath}`, `Untrap follow-up screenshot: ${untrapShot}`, `Untrap state: ${untrapStatePath}`, `Active-owner block state: ${blockedStatePath}`, '', 'Verified scenario public facts through visible UI:', '- contextActions: open-container (Open box)', '- contextActions: tip-container', '- contextActions: force-container', '- contextActions: untrap-container from visible trapped text', '- untrap-container click sends exactly #untrap through native v2 action.execute/ground.untrapContainer with explicit public ground target and NetHack-owned follow-up policy; bridge accepts the ui-command metadata; NetHack opens the direction prompt and no direction answer is bundled', '- while that direction prompt owns input, a second Force lock v2 action is rejected with no raw fallback keys', '- no stale inventory/menu fallback labels in the context UI', '', 'Visible matching actions:', '```', labels, '```', '', `Untrap sent: ${JSON.stringify(afterUntrap.sent)}`, ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-scenario-locked-container-summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
