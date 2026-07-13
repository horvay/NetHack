const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
function resolveOutDir(value) { return path.isAbsolute(value) ? value : path.join(root, value); }
const outDir = resolveOutDir(process.env.NH_TERRAIN_DRINK_OUT_DIR || 'test-output/real-scenario-terrain-drink');
const scenarioId = process.env.NH_TEST_SCENARIO_ID || 'terrain/fountain-dip-current';
const isSink = /(?:^|\/)sink-current$/.test(scenarioId);
const port = Number(process.env.AI_ORG_ELECTRON_CDP_PORT || 9644);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 100) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function pressSpace(cdp) { await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ', unmodifiedText: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
function processTree(pid) { if (!pid) return []; let children = []; try { children = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' }).split(/\s+/).filter(Boolean).map(Number); } catch {} return [pid, ...children.flatMap(processTree)]; }
function killProcessTree(pid, signal) { try { process.kill(-pid, signal); } catch {} for (const target of processTree(pid).reverse()) { try { process.kill(target, signal); } catch {} } }
function waitForExit(child, timeoutMs) { if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true); return new Promise((resolve) => { const timer = setTimeout(() => resolve(false), timeoutMs); child.once('exit', () => { clearTimeout(timer); resolve(true); }); }); }
function projectProcessRows() { return execFileSync('ps', ['-eo', 'pid=,ppid=,comm=,args='], { encoding: 'utf8' }).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => { const parts = line.split(/\s+/, 4); const comm = parts[2] || ''; const args = parts[3] || ''; return comm === 'nh-shim-bridge' || (/electron/.test(comm) && args.includes('/home/horvay/work/nethack/electron-poc')); }); }
function processSnapshot() { try { return projectProcessRows().join('\n') || '(none)'; } catch (error) { return `process snapshot unavailable: ${error.message}`; } }
async function terminateProjectProcesses() { for (const signal of ['SIGTERM', 'SIGKILL']) { for (const row of projectProcessRows()) { const pid = Number(row.split(/\s+/, 1)[0]); if (pid && pid !== process.pid) { try { process.kill(pid, signal); } catch {} } } await delay(signal === 'SIGTERM' ? 1000 : 100); } }
async function terminateChildTree(child) { if (!child) return; killProcessTree(child.pid, 'SIGTERM'); await waitForExit(child, 3000); killProcessTree(child.pid, 'SIGKILL'); await waitForExit(child, 1000); }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
  actions: window.__nethackPromptTest?.contextActions?.(),
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
  prompt: window.__nethackPromptTest?.prompt?.() || null,
  dialog: window.__nethackPromptTest?.dialog?.() || null,
  messages: window.__nethackPromptTest?.messages?.().slice(-24).map((m) => m.text || String(m)) || [],
  status: document.getElementById('status')?.textContent || '',
  body: document.body.innerText,
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
  shim: document.getElementById('shim-output')?.innerText || '',
  heroCell: (() => { const el = document.querySelector('.tile-cell.hero, .tile-cell.player, .tile-cell[data-is-hero="true"]') || document.querySelector('.tile-cell[aria-label*="fountain" i]'); return el ? { text: el.textContent, aria: el.getAttribute('aria-label') || '', className: el.className, tileId: el.dataset.tileId || '', semanticName: el.dataset.semanticName || '' } : null; })()
}))()`); }
async function saveState(cdp, name) { const s = await state(cdp); fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(s, null, 2)); return s; }
async function start(cdp) {
  if (await evalExpr(cdp, `Boolean(document.getElementById('startup-choice-dialog')?.open)`)) await click(cdp, '#startup-new-game');
  else await click(cdp, '#start-shim');
  await waitFor(async () => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 7000);
  await evalExpr(cdp, `(() => { const input = document.getElementById('player-name'); input.value = 'TerrainTester'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click(cdp, '#confirm-character');
  await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return s.running ? s : null; }, 20000).catch(async (error) => { const debug = await saveState(cdp, 'debug-start-timeout-state').catch(() => ({})); await shot(cdp, 'debug-start-timeout.png').catch(() => undefined); throw new Error(`${error.message}\n${JSON.stringify(debug).slice(0, 3000)}`); });
  const maybeIntro = await state(cdp);
  if (maybeIntro.dialogs.includes('intro-dialog')) await click(cdp, '#intro-continue');
  else if (/Go bravely|Book of Tyr/i.test(maybeIntro.body || '')) await pressSpace(cdp);
  await waitFor(async () => { const s = await state(cdp); return !s.dialogs.includes('intro-dialog') && s.running ? s : null; }, 8000);
}
async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, detached: true, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_SHIM_RESET_LOCKS: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '606071', NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none,terrainstatus' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; let electronLog = '';
  const cleanup = async () => { try { cdp?.close(); } catch {} await terminateChildTree(child); await terminateProjectProcesses(); fs.writeFileSync(path.join(outDir, 'electron.log'), electronLog); fs.writeFileSync(path.join(outDir, 'post-run-processes.txt'), `${processSnapshot()}\n`); };
  const emergencyCleanup = () => { try { cdp?.close(); } catch {} killProcessTree(child.pid, 'SIGKILL'); };
  process.once('exit', emergencyCleanup); child.stdout.on('data', (d) => { electronLog += String(d); process.stdout.write(d); }); child.stderr.on('data', (d) => { electronLog += String(d); process.stderr.write(d); });
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    const actionId = isSink ? 'drink-sink' : 'drink-fountain';
    const terrainLabel = isSink ? 'sink' : 'fountain';
    const loaded = await waitFor(async () => { const s = await state(cdp); const trace = `${s.seenShim}\n${s.shim}`; if (/bridge_test_scenario_failed|Too many hacks running now|Cannot get lock/i.test(trace)) throw new Error(trace); return /bridge_test_scenario_loaded/.test(trace) || s.actions?.buttons?.some((b) => b.id === actionId) ? s : null; }, 10000).catch(async (error) => { const debug = await saveState(cdp, 'debug-scenario-readiness-state').catch(() => ({})); await shot(cdp, 'debug-scenario-readiness.png').catch(() => undefined); throw new Error(`${error.message}\n${JSON.stringify(debug).slice(0, 3000)}`); });
    assert('scenario loaded or exposed its fixture-specific context action', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`) || loaded.actions?.buttons?.some((b) => b.id === actionId), JSON.stringify(loaded.actions));
    const ready = await waitFor(async () => { const s = await state(cdp); return s.actions?.buttons?.some((b) => b.id === actionId && new RegExp(`Drink from ${terrainLabel}`, 'i').test(b.text || '')) ? s : null; }, 10000).catch(async (error) => { const debug = await saveState(cdp, 'debug-before-drink-action-timeout-state').catch(() => ({})); await shot(cdp, 'debug-before-drink-action-timeout.png').catch(() => undefined); throw new Error(`${error.message}\n${JSON.stringify(debug).slice(0, 2000)}`); });
    const contextShot = await shot(cdp, `00-${terrainLabel}-drink-context-actions.png`);
    fs.writeFileSync(path.join(outDir, '00-before-drink-state.json'), JSON.stringify(ready, null, 2));
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await click(cdp, `#context-action-bar button[data-context-action-id="${actionId}"]`);
    let afterDrink;
    if (isSink) {
      const sinkPrompt = await waitFor(async () => { const s = await state(cdp); return s.sent === 'q' && /drink from the sink/i.test(`${s.prompt?.query || ''}\n${s.dialog?.prompt || ''}`) ? s : null; }, 12000);
      if (sinkPrompt.prompt || sinkPrompt.dialog?.interactionOpen) await click(cdp, '#interaction-options .choice-button[data-key="y"]');
      afterDrink = await waitFor(async () => { const s = await state(cdp); return s.sent === 'qy' && s.messages.length > ready.messages.length ? s : null; }, 12000).catch(async (error) => { const debug = await saveState(cdp, 'debug-after-sink-confirm-state').catch(() => ({})); await shot(cdp, 'debug-after-sink-confirm.png').catch(() => undefined); throw new Error(`${error.message}\n${JSON.stringify(debug).slice(0, 3000)}`); });
    } else {
      afterDrink = await waitFor(async () => { const s = await state(cdp); return s.sentUiProtocolCommands.some((command) => command.commandType === 'terrain.action' && command.payload?.action === 'drink' && command.payload?.terrain === 'fountain') && /shim_terrain_action_confirmed/.test(s.shim || '') ? s : null; }, 12000);
    }
    const afterShot = await shot(cdp, `01-after-${terrainLabel}-drink.png`);
    fs.writeFileSync(path.join(outDir, '01-after-drink-state.json'), JSON.stringify(afterDrink, null, 2));
    if (isSink) {
      assert('sink drink uses the classic quaff command and visible confirmation flow', afterDrink.sent === 'qy' && !afterDrink.sentUiProtocolCommands.some((command) => command.commandType === 'terrain.action') && afterDrink.messages.length > ready.messages.length, JSON.stringify({ sent: afterDrink.sent, messages: afterDrink.messages, commands: afterDrink.sentUiProtocolCommands }));
    } else {
      assert('drink route is recorded as direct terrain.action', afterDrink.sentUiProtocolCommands.some((command) => command.commandType === 'terrain.action' && command.payload?.action === 'drink' && command.payload?.terrain === 'fountain'), JSON.stringify(afterDrink.sentUiProtocolCommands));
      assert('direct terrain drink sends no raw #drink, q, or classic key fallback', afterDrink.sent === '', JSON.stringify({ sent: afterDrink.sent }));
      assert('native bridge accepted direct terrain.action drink', /"name":"shim_terrain_action_accepted"[\s\S]*"action":"drink"/.test(afterDrink.shim || ''), (afterDrink.shim || '').slice(-3000));
      assert('native bridge confirmed direct terrain.action drink', /"name":"shim_terrain_action_confirmed"[\s\S]*"action":"drink"/.test(afterDrink.shim || ''), (afterDrink.shim || '').slice(-3000));
      assert('no Extended-command/menu answer for direct drink', !/bridge_extcmd_answer|bridge_menu_answer/i.test(afterDrink.shim || ''), (afterDrink.shim || '').slice(-3000));
    }
    assert('evidence has no disorder/internal errors', !/Program in disorder|Please report these messages|TypeError|ReferenceError|Unhandled|bridge_test_scenario_failed/i.test(`${afterDrink.body || ''}\n${afterDrink.shim || ''}`), `${afterDrink.body || ''}\n${afterDrink.shim || ''}`.slice(-2000));
    const summary = [`# Real terrain drink scenario`, '', 'PASS', '', `Scenario: ${scenarioId}`, `Command: NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=${scenarioId} NH_TERRAIN_DRINK_OUT_DIR=${path.relative(root, outDir)} node scripts/real-scenario-terrain-drink-mcp-test.js`, '', 'Evidence:', `- Public terrain/context screenshot: ${contextShot}`, `- After drink screenshot: ${afterShot}`, `- Before state sidecar: ${path.join(outDir, '00-before-drink-state.json')}`, `- After state sidecar: ${path.join(outDir, '01-after-drink-state.json')}`, '', 'Verified:', `- public current-square ${terrainLabel} label exposes \`Drink from ${terrainLabel}\``, isSink ? '- clicking it uses the classic quaff/confirmation flow owned by NetHack' : '- clicking it sends typed `terrain.action` with coord/terrain payload and no raw fallback', '', `Sent input stream: ${JSON.stringify(afterDrink.sent)}`, '', 'Diagnostics:', `- Electron/stdout log: ${path.join(outDir, 'electron.log')}`, `- Post-run process snapshot: ${path.join(outDir, 'post-run-processes.txt')}`, ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'summary.md'), summary);
    console.log(summary);
  } finally { await cleanup(); process.removeListener('exit', emergencyCleanup); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
