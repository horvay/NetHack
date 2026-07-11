const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
function resolveOutDir(value) { return path.isAbsolute(value) ? value : path.join(root, value); }
const outDir = resolveOutDir(process.env.NH_TERRAIN_DIP_OUT_DIR || 'test-output/real-scenario-terrain-dip');
const scenarioId = process.env.NH_TEST_SCENARIO_ID || 'terrain/fountain-dip-current';
const port = Number(process.env.AI_ORG_ELECTRON_CDP_PORT || 9641);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 100) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function pressKey(cdp, key) { const special = key === 'Escape' ? { code: 'Escape', keyCode: 27, text: '' } : (key === ' ' ? { code: 'Space', keyCode: 32, text: ' ' } : { code: `Key${key.toUpperCase()}`, keyCode: key.toUpperCase().charCodeAt(0), text: key }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: special.code, text: special.text, unmodifiedText: special.text, windowsVirtualKeyCode: special.keyCode, nativeVirtualKeyCode: special.keyCode }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: special.code, windowsVirtualKeyCode: special.keyCode, nativeVirtualKeyCode: special.keyCode }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
function processTree(pid) {
  if (!pid) return [];
  let children = [];
  try {
    children = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' }).split(/\s+/).filter(Boolean).map(Number);
  } catch {}
  return [pid, ...children.flatMap(processTree)];
}
function killProcessTree(pid, signal) {
  try { process.kill(-pid, signal); } catch {}
  for (const target of processTree(pid).reverse()) {
    try { process.kill(target, signal); } catch {}
  }
}
function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once('exit', () => { clearTimeout(timer); resolve(true); });
  });
}
function projectProcessRows() {
  return execFileSync('ps', ['-eo', 'pid=,ppid=,comm=,args='], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const parts = line.split(/\s+/, 4);
      const comm = parts[2] || '';
      const args = parts[3] || '';
      return comm === 'nh-shim-bridge' || (/electron/.test(comm) && args.includes('/home/horvay/work/nethack/electron-poc'));
    });
}
function processSnapshot() {
  try { return projectProcessRows().join('\n') || '(none)'; }
  catch (error) { return `process snapshot unavailable: ${error.message}`; }
}
async function terminateProjectProcesses() {
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    for (const row of projectProcessRows()) {
      const pid = Number(row.split(/\s+/, 1)[0]);
      if (pid && pid !== process.pid) {
        try { process.kill(pid, signal); } catch {}
      }
    }
    await delay(signal === 'SIGTERM' ? 1000 : 100);
  }
}
async function terminateChildTree(child) {
  if (!child) return;
  killProcessTree(child.pid, 'SIGTERM');
  await waitForExit(child, 3000);
  killProcessTree(child.pid, 'SIGKILL');
  await waitForExit(child, 1000);
}
async function state(cdp) {
  return evalExpr(cdp, `(() => ({
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
    actions: window.__nethackPromptTest?.contextActions?.(),
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    sentPayloads: window.__nethackPromptTest?.sentPayloads?.() || [],
    sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
    prompt: window.__nethackPromptTest?.prompt?.() || null,
    interaction: window.__nethackPromptTest?.dialog?.(),
    messages: window.__nethackPromptTest?.messages?.().slice(-24).map((m) => m.text || String(m)) || [],
    promptPanel: { hidden: document.getElementById('prompt-panel')?.hidden, text: document.getElementById('prompt-panel')?.textContent || '' },
    menuPanel: { hidden: document.getElementById('menu-panel')?.hidden, text: document.getElementById('menu-panel')?.textContent || '' },
    status: document.getElementById('status')?.textContent || '',
    body: document.body.innerText,
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
    shim: document.getElementById('shim-output')?.innerText || '',
    heroCell: (() => { const el = document.querySelector('.tile-cell.hero, .tile-cell.player, .tile-cell[data-is-hero="true"]') || document.querySelector('.tile-cell[aria-label*="fountain" i]'); return el ? { text: el.textContent, aria: el.getAttribute('aria-label') || '', className: el.className, tileId: el.dataset.tileId || '', semanticName: el.dataset.semanticName || '' } : null; })()
  }))()`);
}
async function saveState(cdp, name) { const s = await state(cdp); fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(s, null, 2)); return s; }
async function start(cdp) {
  if (await evalExpr(cdp, `Boolean(document.getElementById('startup-choice-dialog')?.open)`)) await click(cdp, '#startup-new-game');
  else await click(cdp, '#start-shim');
  await waitFor(() => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 7000);
  await click(cdp, '#confirm-character');
  await waitFor(async () => {
    const s = await state(cdp);
    if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim);
    return s.running ? s : null;
  }, 20000);
  const maybeIntro = await state(cdp);
  if (maybeIntro.dialogs.includes('intro-dialog')) await click(cdp, '#intro-continue');
  else if (/Go bravely|Book of Tyr/i.test(maybeIntro.body || '')) await pressKey(cdp, ' ');
  await waitFor(async () => {
    const s = await state(cdp);
    return !s.dialogs.includes('intro-dialog') && s.running ? s : null;
  }, 8000);
}
async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, detached: true, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_SHIM_RESET_LOCKS: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '606070', NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none,terrainstatus' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; let electronLog = '';
  const cleanup = async () => {
    try { cdp?.close(); } catch {}
    await terminateChildTree(child);
    await terminateProjectProcesses();
    fs.writeFileSync(path.join(outDir, 'electron.log'), electronLog);
    fs.writeFileSync(path.join(outDir, 'post-run-processes.txt'), `${processSnapshot()}\n`);
  };
  const emergencyCleanup = () => { try { cdp?.close(); } catch {} killProcessTree(child.pid, 'SIGKILL'); };
  process.once('exit', emergencyCleanup); child.stdout.on('data', (d) => { electronLog += String(d); process.stdout.write(d); }); child.stderr.on('data', (d) => { electronLog += String(d); process.stderr.write(d); });
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    const loaded = await waitFor(async () => { const s = await state(cdp); const trace = `${s.seenShim}\n${s.shim}`; if (/bridge_test_scenario_failed|Too many hacks running now|Cannot get lock/i.test(trace)) throw new Error(trace); return /bridge_test_scenario_loaded/.test(trace) ? s : null; }, 10000).catch(async (error) => {
      const debug = await saveState(cdp, 'debug-scenario-loaded-timeout-state').catch(() => ({}));
      await shot(cdp, 'debug-scenario-loaded-timeout.png').catch(() => undefined);
      throw new Error(`${error.message}\n${JSON.stringify(debug).slice(0, 2000)}`);
    });
    assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
    const ready = await waitFor(async () => {
      const s = await state(cdp);
      return s.actions?.buttons?.some((b) => b.id === 'dip-terrain' && /Dip item in fountain/i.test(b.text || '')) ? s : null;
    }, 10000).catch(async (error) => {
      const debug = await saveState(cdp, 'debug-before-dip-action-timeout-state').catch(() => ({}));
      await shot(cdp, 'debug-before-dip-action-timeout.png').catch(() => undefined);
      throw new Error(`${error.message}\n${JSON.stringify(debug).slice(0, 2000)}`);
    });
    assert('fountain dip context action is visible', ready.actions?.buttons?.some((b) => b.id === 'dip-terrain' && /Dip item in fountain/i.test(b.text || '')), ready.actions?.text || '');
    assert('fountain terrain is visible in public UI on the current square', /fountain/i.test(`${ready.actions?.text || ''}\n${ready.body || ''}\n${JSON.stringify(ready.heroCell || {})}`), JSON.stringify(ready.heroCell));
    const contextShot = await shot(cdp, '00-fountain-context-actions.png');
    fs.writeFileSync(path.join(outDir, '00-before-dip-state.json'), JSON.stringify(ready, null, 2));
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await click(cdp, '#context-action-bar button[data-context-action-id="dip-terrain"]');
    const chooser = await waitFor(async () => {
      const s = await state(cdp);
      const visible = `${s.interaction?.title || ''}\n${s.interaction?.prompt || ''}\n${(s.interaction?.options || []).map((o) => `${o.label || ''} ${o.text || ''}`).join('\n')}`;
      return s.interaction?.interactionOpen && /Dip item in fountain/i.test(visible) && /potion|dagger/i.test(visible) ? s : null;
    }, 12000).catch(async (error) => {
      const debug = await saveState(cdp, 'debug-after-dip-chooser-timeout-state').catch(() => ({}));
      await shot(cdp, 'debug-after-dip-chooser-timeout.png').catch(() => undefined);
      throw new Error(`${error.message}\n${JSON.stringify(debug).slice(0, 2000)}`);
    });
    const chooserShot = await shot(cdp, '01-dip-public-item-chooser.png');
    fs.writeFileSync(path.join(outDir, '01-dip-chooser-state.json'), JSON.stringify(chooser, null, 2));
    await evalExpr(cdp, `(() => { const button = Array.from(document.querySelectorAll('#interaction-dialog button')).find((b) => /dagger|potion/i.test(b.textContent || '')); if (!button) throw new Error('missing public dip item button'); button.click(); })()`);
    const afterDip = await waitFor(async () => {
      const s = await state(cdp);
      return s.sentUiProtocolCommands.some((command) => command.commandType === 'terrain.action' && command.payload?.action === 'dip' && command.payload?.terrain === 'fountain' && command.payload?.itemId > 0) && /shim_terrain_action_confirmed/.test(s.shim || '') ? s : null;
    }, 12000).catch(async (error) => {
      const debug = await saveState(cdp, 'debug-after-direct-dip-timeout-state').catch(() => ({}));
      await shot(cdp, 'debug-after-direct-dip-timeout.png').catch(() => undefined);
      throw new Error(`${error.message}\n${JSON.stringify(debug).slice(0, 2000)}`);
    });
    const promptShot = await shot(cdp, '02-after-direct-terrain-dip.png');
    fs.writeFileSync(path.join(outDir, '02-after-dip-state.json'), JSON.stringify(afterDip, null, 2));
    assert('dip route is recorded as direct terrain.action with public itemId', afterDip.sentUiProtocolCommands.some((command) => command.commandType === 'terrain.action' && command.payload?.action === 'dip' && command.payload?.terrain === 'fountain' && command.payload?.itemId > 0), JSON.stringify(afterDip.sentUiProtocolCommands));
    assert('direct terrain dip sends no raw #dip newline', afterDip.sent === '', JSON.stringify({ sent: afterDip.sent }));
    assert('native bridge accepted direct terrain.action dip', /"name":"shim_terrain_action_accepted"[\s\S]*"action":"dip"/.test(afterDip.shim || ''), (afterDip.shim || '').slice(-3000));
    assert('native bridge confirmed direct terrain.action dip', /"name":"shim_terrain_action_confirmed"[\s\S]*"action":"dip"/.test(afterDip.shim || ''), (afterDip.shim || '').slice(-3000));
    assert('no Extended-command or hidden item selector answered for direct dip', !/bridge_extcmd_answer[\s\S]*dip|bridge_menu_answer[\s\S]*terrain-action/i.test(afterDip.shim || ''), (afterDip.shim || '').slice(-3000));
    const promptText = `${afterDip.interaction?.title || ''}\n${afterDip.interaction?.prompt || ''}\n${afterDip.body || ''}`;
    assert('direct terrain dip evidence does not predict hidden outcomes', !/will bless|will curse|prediction|predicted outcome/i.test(promptText), promptText.slice(0, 2000));
    assert('evidence has no disorder/internal errors', !/Program in disorder|Please report these messages|TypeError|ReferenceError|Unhandled|bridge_test_scenario_failed/i.test(`${promptText}\n${afterDip.shim || ''}`), `${promptText}\n${afterDip.shim || ''}`.slice(-2000));
    const summary = [`# Real terrain dip scenario`, '', 'PASS', '', `Scenario: ${scenarioId}`, `Command: NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=${scenarioId} NH_TERRAIN_DIP_OUT_DIR=${path.relative(root, outDir)} npm run test:real-scenario-terrain-dip-mcp`, '', 'Evidence:', `- Public terrain/context screenshot: ${contextShot}`, `- Public item chooser screenshot: ${chooserShot}`, `- After direct dip screenshot: ${promptShot}`, `- Before state sidecar: ${path.join(outDir, '00-before-dip-state.json')}`, `- Chooser state sidecar: ${path.join(outDir, '01-dip-chooser-state.json')}`, `- After state sidecar: ${path.join(outDir, '02-after-dip-state.json')}`, '', 'Verified:', '- public current-square fountain label exposes `Dip item in fountain`', '- clicking it opens a visible public inventory item chooser', '- selecting an item sends typed `terrain.action` with coord/terrain/itemId', '- no raw `#dip`, Extended-command answer, or hidden item selector answer appears', '- direct result does not expose predicted fountain/item outcomes', '', `Sent input stream: ${JSON.stringify(afterDip.sent)}`, '', 'Diagnostics:', `- Electron/stdout log: ${path.join(outDir, 'electron.log')}`, `- Post-run process snapshot: ${path.join(outDir, 'post-run-processes.txt')}`, ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'summary.md'), summary);
    console.log(summary);
  } finally { await cleanup(); process.removeListener('exit', emergencyCleanup); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
