const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_DOOR_CONTEXT_OUT_DIR || path.join(root, 'test-output', 'door-context-prompt');
const port = Number(process.env.NH_DOOR_CONTEXT_CDP_PORT || 9494);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out waiting'); }
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const file = path.join(outDir, name); fs.writeFileSync(file, Buffer.from(res.data, 'base64')); return file; }

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  let cdp; let stdout = ''; let stderr = '';
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1280', NH_ELECTRON_WINDOW_HEIGHT: '900' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  child.stdout.on('data', (data) => { stdout += data.toString(); process.stdout.write(data); });
  child.stderr.on('data', (data) => { stderr += data.toString(); process.stderr.write(data); });
  const results = { outDir, screenshots: {}, checks: {} };
  try {
    const page = await waitFor(async () => (await json(`http://127.0.0.1:${port}/json/list`)).find((p) => p.type === 'page' && p.webSocketDebuggerUrl), 20000);
    cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await waitFor(async () => evalExpr(cdp, `document.readyState === 'complete' && !!window.__nethackPromptTest`), 10000);
    results.locked = await evalExpr(cdp, `(() => { const t=window.__nethackPromptTest; t.reset(); t.setRunning(true); t.event({ name: 'shim_putstr', text: 'This door is locked.' }); return { dialog: t.dialog(), context: t.context() }; })()`);
    results.screenshots.locked = await shot(cdp, '01-locked-door-kick-context.png');
    results.resists = await evalExpr(cdp, `(() => { const t=window.__nethackPromptTest; t.reset(); t.setRunning(true); t.event({ name: 'shim_putstr', text: 'The door resists!' }); return { dialog: t.dialog(), context: t.context(), messages: t.messages().slice(-4) }; })()`);
    results.screenshots.resists = await shot(cdp, '02-unlocked-door-resists-no-context.png');
    results.pickLock = await evalExpr(cdp, `(() => { const t=window.__nethackPromptTest; t.reset(); t.setRunning(true); t.event({ name: 'shim_putstr', text: 'This door is locked.' }); t.event({ name: 'shim_yn_function', query: 'Unlock it with your lock pick?', choices: 'ynq' }); return { dialog: t.dialog(), context: t.context() }; })()`);
    results.screenshots.pickLock = await shot(cdp, '03-rogue-pick-lock-prompt.png');
    results.checks.lockedDoorKickContextAppears = results.locked.dialog.interactionOpen && /Locked door actions/i.test(results.locked.dialog.title || '') && results.locked.dialog.options.some((o) => /Kick door/i.test(o.text || ''));
    results.checks.unlockedDoorResistsDoesNotOpenKickContext = !results.resists.dialog.interactionOpen && results.resists.context == null;
    results.checks.roguePickLockPromptSupersedesContext = results.pickLock.dialog.interactionOpen && /Unlock it with your lock pick/i.test(results.pickLock.dialog.prompt || '') && results.pickLock.dialog.options.some((o) => /^Yes/i.test(o.text || '')) && results.pickLock.context == null;
    fs.writeFileSync(path.join(outDir, 'door-context-prompt-result.json'), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), stdout);
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), stderr);
    const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`Checks failed: ${failed.join(', ')}`);
  } catch (error) {
    results.error = error.stack || String(error);
    fs.writeFileSync(path.join(outDir, 'door-context-prompt-failure.json'), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), stdout);
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), stderr);
    cleanup();
    throw error;
  }
  cleanup();
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
