const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_LOCKED_DOOR_OUT_DIR || path.join(root, 'test-output', 'real-locked-door-autounlock');
const port = Number(process.env.NH_LOCKED_DOOR_CDP_PORT || 9492);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out waiting'); }
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const file = path.join(outDir, name); fs.writeFileSync(file, Buffer.from(res.data, 'base64')); return file; }
async function press(cdp, key) { await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, text: key.length === 1 ? key : undefined, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : undefined }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : undefined }); }
async function click(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left + r.width / 2, y:r.top + r.height / 2} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
async function state(cdp) { return evalExpr(cdp, `(() => ({
  status: document.getElementById('status')?.textContent || '',
  prompt: window.__nethackPromptTest?.prompt?.(),
  dialog: window.__nethackPromptTest?.dialog?.(),
  context: window.__nethackPromptTest?.context?.(),
  messages: window.__nethackPromptTest?.messages?.().slice(-12) || [],
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  automation: window.__nethackAutomation?.state?.(),
  cursor: window.__nethackAutomation?.state?.().cursor,
  doors: Array.from(document.querySelectorAll('.tile-cell')).filter((el) => /door/i.test((el.dataset.semanticKind || '') + ' ' + (el.dataset.semanticName || '')) || el.textContent === '+').map((el) => ({ x:Number(el.dataset.mapX), y:Number(el.dataset.mapY), text:el.getAttribute('aria-label') || el.textContent, kind:el.dataset.semanticKind, name:el.dataset.semanticName })).slice(0,20)
}))()`); }
function directionFromTo(a, b) { const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y); return { '-1,-1':'y', '0,-1':'k', '1,-1':'u', '-1,0':'h', '1,0':'l', '-1,1':'b', '0,1':'j', '1,1':'n' }[`${dx},${dy}`]; }

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  let cdp; let stdout = ''; let stderr = '';
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '900', NH_SHIM_TEST_LOCKED_DOOR_SCENE: '1', NETHACK_SEED: '424242' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  child.stdout.on('data', (data) => { stdout += data.toString(); process.stdout.write(data); });
  child.stderr.on('data', (data) => { stderr += data.toString(); process.stderr.write(data); });
  const results = { outDir, screenshots: {}, checks: {} };
  try {
    const pages = await waitFor(async () => (await json(`http://127.0.0.1:${port}/json/list`)).find((p) => p.type === 'page' && p.webSocketDebuggerUrl), 20000);
    cdp = await connect(pages.webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await waitFor(async () => evalExpr(cdp, `document.readyState === 'complete' && !!window.__nethackAutomation && !!window.__nethackPromptTest`), 10000);
    await click(cdp, '#start-shim');
    await delay(100);
    const characterOpen = await evalExpr(cdp, `document.getElementById('character-dialog')?.open`);
    if (characterOpen) {
      await evalExpr(cdp, `document.getElementById('player-role').value='Rog'; document.getElementById('player-race').value='Hum'; document.getElementById('player-gender').value='Fem'; document.getElementById('player-align').value='Cha'; document.getElementById('player-name').value='Lockpick'; true`);
      await click(cdp, '#confirm-character');
    }
    await waitFor(async () => { const s = await state(cdp); return s.automation?.runningState?.running && s.doors.length && s.cursor ? s : null; }, 30000);
    if (await evalExpr(cdp, `document.getElementById('intro-dialog')?.open`)) await click(cdp, '#intro-continue');
    results.screenshots.started = await shot(cdp, '01-started-adjacent-locked-door.png');
    const before = await state(cdp);
    const adjacent = before.doors.find((d) => /closed|locked/i.test(`${d.name || ''} ${d.text || ''}`) && Math.abs(d.x - before.cursor.x) <= 1 && Math.abs(d.y - before.cursor.y) <= 1 && (d.x !== before.cursor.x || d.y !== before.cursor.y));
    if (!adjacent) throw new Error(`No adjacent test door found: ${JSON.stringify(before)}`);
    const direction = directionFromTo(before.cursor, adjacent);
    results.door = { cursor: before.cursor, adjacent, direction };
    await press(cdp, direction);
    const promptState = await waitFor(async () => { const s = await state(cdp); return /Unlock it with your lock pick/i.test(s.dialog?.prompt || '') ? s : null; }, 10000);
    results.promptState = promptState;
    results.screenshots.prompt = await shot(cdp, '02-real-autounlock-prompt.png');
    await click(cdp, '#interaction-options .choice-button[data-key="y"]');
    const after = await waitFor(async () => { const s = await state(cdp); return s.messages.some((m) => /succeed in picking the lock|give up your attempt|stop picking|This door is locked/i.test(m)) && !s.dialog?.interactionOpen && !s.prompt ? s : null; }, 15000);
    results.after = after;
    results.screenshots.after = await shot(cdp, '03-after-y-control-returned.png');
    await press(cdp, '.');
    await waitFor(async () => { const s = await state(cdp); return /sent key: wait|stats updated|command accepted/i.test(s.status) ? s : null; }, 5000);
    results.afterWait = await state(cdp);
    results.screenshots.afterWait = await shot(cdp, '04-after-followup-wait.png');
    results.checks.realElectronStarted = true;
    results.checks.lockedDoorPromptVisible = /Unlock it with your lock pick/i.test(promptState.dialog?.prompt || '');
    results.checks.staleContextClearedAtPrompt = promptState.context == null;
    results.checks.yWasSent = /y/.test(results.after.sent || '');
    results.checks.controlReturnedAfterAnswer = !after.dialog?.interactionOpen && !after.prompt;
    results.checks.followupInputAccepted = /\./.test(results.afterWait.sent || '') || /sent key: wait|command accepted/i.test(results.afterWait.status || '');
    const ok = Object.values(results.checks).every(Boolean);
    fs.writeFileSync(path.join(outDir, 'real-locked-door-autounlock-result.json'), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), stdout);
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), stderr);
    if (!ok) throw new Error(`Checks failed: ${JSON.stringify(results.checks)}`);
  } catch (error) {
    results.error = error.stack || String(error);
    fs.writeFileSync(path.join(outDir, 'real-locked-door-autounlock-failure.json'), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), stdout);
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), stderr);
    cleanup();
    throw error;
  }
  cleanup();
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
