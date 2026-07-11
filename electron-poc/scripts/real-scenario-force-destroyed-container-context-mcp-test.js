const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-scenario-force-destroyed-container-context');
const scenarioId = 'container/locked-chest-force-destroy-on-hero';
const port = Number(process.env.NH_FORCE_DESTROY_CONTEXT_CDP_PORT || 9641);
const seed = process.env.NH_FORCE_DESTROY_CONTEXT_SEED || '424242';
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function sendKey(cdp, ch) { await evalExpr(cdp, `window.__nethackAutomation.sendKeycode(${JSON.stringify(ch.charCodeAt(0))})`); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id), actions: window.__nethackPromptTest?.contextActions?.(), sent: window.__nethackPromptTest?.sentInputs?.().join('') || '', prompt: window.__nethackPromptTest?.prompt?.(), dialog: window.__nethackPromptTest?.dialog?.(), currentCell: window.__nethackPromptTest?.currentCell?.(), automation: window.__nethackAutomation?.state?.(), messages: window.__nethackPromptTest?.messages?.().slice(-30).map((m) => m.text || String(m)) || [], running: window.__nethackAutomation?.state?.().runningState?.running || false, body: document.body.innerText, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '' }))()`); }
async function start(cdp) {
  await click(cdp, '#start-shim');
  await waitFor(async () => evalExpr(cdp, `Boolean(document.getElementById('character-dialog')?.open)`), 5000);
  await click(cdp, '#confirm-character');
  await waitFor(async () => (await state(cdp)).running, 20000);
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`);
}
async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: seed, NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const ready = await waitFor(async () => { const s = await state(cdp); const ids = (s.actions?.buttons || []).map((b) => b.id); return ids.includes('open-container') && ids.includes('force-container') ? s : null; }, 10000);
    const beforeShot = await shot(cdp, '01-before-force-context-actions.png');
    const beforeLabels = (ready.actions.buttons || []).map((b) => `${b.id}:${b.text}`).join('\n');
    assert('precondition exposes Open chest', /open-container:Open chest/.test(beforeLabels), beforeLabels);
    assert('precondition exposes Force lock', /force-container:Force lock/.test(beforeLabels), beforeLabels);

    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await click(cdp, '#context-action-bar button[data-context-action-id="force-container"]');
    await waitFor(async () => { const s = await state(cdp); const text = `${s.prompt?.query || ''}\n${s.dialog?.prompt || ''}\n${s.body}`; return /force its lock/i.test(text) ? s : null; }, 5000);
    await sendKey(cdp, 'y');

    let destroyedState = null;
    for (let i = 0; i < 120; i += 1) {
      const s = await state(cdp);
      const joined = s.messages.join('\n');
      if (/totally destroyed/i.test(joined)) { destroyedState = s; break; }
      if (/lock is already (?:broken|unlocked)|decide not to force|give up your attempt|cannot force/i.test(joined)) break;
      await sendKey(cdp, '.');
      await delay(120);
    }
    assert('force attempt completely destroyed the chest for this deterministic scenario', Boolean(destroyedState), JSON.stringify({ seed, messages: (await state(cdp)).messages }, null, 2));
    const after = await waitFor(async () => {
      const s = await state(cdp);
      const ids = (s.actions?.buttons || []).map((b) => b.id);
      const cellText = `${s.currentCell?.objectLayerSemanticName || ''} ${s.currentCell?.objectLayerSemanticKind || ''}`;
      return !s.dialogs?.length && ids.includes('pickup') && /dagger object/i.test(cellText) && !ids.includes('open-container') && !ids.includes('force-container') ? s : null;
    }, 5000).catch(async (error) => {
      const debug = await state(cdp).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, 'after-destroy-stale-debug.json'), JSON.stringify(debug, null, 2));
      throw error;
    });
    const afterDestroyShot = await shot(cdp, '02-after-destroy-context-actions.png');
    fs.writeFileSync(path.join(outDir, 'after-destroy-state.json'), JSON.stringify(after, null, 2));
    const ids = (after.actions?.buttons || []).map((b) => b.id);
    const labels = (after.actions?.buttons || []).map((b) => `${b.id}:${b.text}`).join('\n');
    assert('destroyed container no longer exposes open-container context action', !ids.includes('open-container'), labels);
    assert('destroyed container no longer exposes Force lock context action', !ids.includes('force-container'), labels);
    assert('post-destroy context still allows pickup if contents survived, not stale open chest', !/Open chest|Open box|Loot container/i.test(after.actions?.text || ''), after.actions?.text || '');
    assert('UI avoids fallback labels after destroyed chest', !/Inventory selector|Name unavailable|Loading your inventory/i.test(after.body), after.body.slice(0, 1200));

    const summary = [`# Force-destroyed container context action real Electron smoke`, '', 'PASS', '', `Scenario: ${scenarioId}`, `Seed: ${seed}`, `Before screenshot: ${beforeShot}`, `After screenshot: ${afterDestroyShot}`, `State sidecar: ${path.join(outDir, 'after-destroy-state.json')}`, '', 'Verified through real Electron/gameplay:', '- locked chest on the hero square exposed Open chest and Force lock before forcing', '- player forced the lock with a pick-axe and answered the real NetHack confirmation', '- NetHack reported the chest was totally destroyed', '- context actions immediately stopped exposing open-container/force-container for the destroyed chest', '- post-destroy context remained live with Pick up for the surviving dagger object layer', '', 'Post-destroy visible actions:', '```', labels, '```', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
