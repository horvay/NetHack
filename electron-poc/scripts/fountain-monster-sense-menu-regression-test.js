const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_FOUNTAIN_MENU_OUT_DIR || path.join(root, 'test-output', 'fountain-monster-sense-menu');
const port = Number(process.env.NH_FOUNTAIN_MENU_CDP_PORT || 9683);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out waiting'); }
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', (d) => { logs += d; process.stdout.write(d); });
  child.stderr.on('data', (d) => { logs += d; process.stderr.write(d); });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); fs.writeFileSync(path.join(outDir, 'electron.log'), logs); };
  process.on('exit', cleanup);
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);

    const metrics = await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      const farlookTip = (windowId) => {
        t.event({ name: 'shim_start_menu', window: windowId });
        t.event({ name: 'shim_add_menu', window: windowId, selector: 0, text: 'Tip: Farlooking or selecting a map location' });
        t.event({ name: 'shim_add_menu', window: windowId, selector: 0, text: '' });
        t.event({ name: 'shim_add_menu', window: windowId, selector: 0, text: 'You are now in a "farlook" mode - the movement keys move the cursor,' });
        t.event({ name: 'shim_add_menu', window: windowId, selector: 0, text: 'not your character. Game time does not advance. This mode is used' });
        t.event({ name: 'shim_add_menu', window: windowId, selector: 0, text: 'to look around the map, or to select a location on it.' });
        t.event({ name: 'shim_add_menu', window: windowId, selector: 0, text: '' });
        t.event({ name: 'shim_add_menu', window: windowId, selector: 0, text: 'When in this mode, you can press ESC to return to normal game mode,' });
        t.event({ name: 'shim_add_menu', window: windowId, selector: 0, text: 'and pressing ? will show the key help.' });
        t.event({ name: 'shim_end_menu', window: windowId, prompt: 'Menu' });
        t.event({ name: 'shim_select_menu', window: windowId, how: 0 });
      };
      t.reset();
      t.setRunning(true);
      t.event({ name: 'shim_putstr', text: 'Drink from the fountain?' });
      t.event({ name: 'shim_putstr', text: 'You sense the presence of monsters.' });
      farlookTip(260);
      const suppressed = { dialog: t.dialog(), prompt: t.prompt(), menuPanel: document.getElementById('menu-panel')?.innerText || '', messages: t.messages(), sent: t.sentInputs().join(''), body: document.body.innerText };

      t.reset();
      t.setRunning(true);
      t.event({ name: 'shim_putstr', text: 'You sense the presence of monsters.' });
      t.event({ name: 'shim_start_menu', window: 261 });
      t.event({ name: 'shim_add_menu', window: 261, selector: 0, text: 'Container notes' });
      t.event({ name: 'shim_add_menu', window: 261, selector: 0, text: 'The box lid is open.' });
      t.event({ name: 'shim_end_menu', window: 261, prompt: 'Menu' });
      t.event({ name: 'shim_select_menu', window: 261, how: 0 });
      const unrelatedInfoAfterSense = { dialog: t.dialog(), body: document.body.innerText, sent: t.sentInputs().join('') };

      t.reset();
      t.setRunning(true);
      farlookTip(262);
      const normalFarlookTip = { dialog: t.dialog(), body: document.body.innerText, sent: t.sentInputs().join('') };

      t.reset();
      t.setRunning(true);
      t.event({ name: 'shim_putstr', text: 'Drink from the fountain?' });
      t.event({ name: 'shim_putstr', text: 'You sense the presence of monsters.' });
      farlookTip(263);
      const finalSuppressed = { dialog: t.dialog(), prompt: t.prompt(), menuPanel: document.getElementById('menu-panel')?.innerText || '', messages: t.messages(), sent: t.sentInputs().join(''), body: document.body.innerText };
      return { ...finalSuppressed, initialSuppressed: suppressed, unrelatedInfoAfterSense, normalFarlookTip };
    })()`);
    const screenshot = await shot(cdp, 'fountain-monster-sense-no-modal.png');
    assert('monster-sense message remains in the log', metrics.messages.some((line) => /You sense the presence of monsters\./i.test(line)), JSON.stringify(metrics.messages));
    assert('farlook tip dialog is suppressed', !metrics.dialog.interactionOpen, JSON.stringify(metrics.dialog));
    assert('read-only menu owner is cleared after suppression', !metrics.prompt, JSON.stringify(metrics.prompt));
    assert('farlook tip text is not shown as body copy', !/Farlooking or selecting a map location|Game time does not advance/i.test(metrics.body), metrics.body);
    assert('suppression auto-continues the hidden read-only tip menu', metrics.sent === ' ', JSON.stringify(metrics));
    assert('monster-sense path did not open actionable spellbook panel', !/Spell palette|Spellbook|Tip\s+Review/i.test(`${metrics.dialog.title}\n${metrics.body}`), metrics.body);
    assert('unrelated read-only info menu after monster-sense message still opens as a modal', metrics.unrelatedInfoAfterSense.dialog.interactionOpen && /Review information/i.test(metrics.unrelatedInfoAfterSense.dialog.title) && /Container notes|box lid is open/i.test(metrics.unrelatedInfoAfterSense.body), JSON.stringify(metrics.unrelatedInfoAfterSense));
    assert('normal farlook tip without recent monster-sense still opens as a Tip modal', metrics.normalFarlookTip.dialog.interactionOpen && metrics.normalFarlookTip.dialog.title === 'Tip' && /Farlooking or selecting a map location/i.test(metrics.normalFarlookTip.body), JSON.stringify(metrics.normalFarlookTip.dialog));
    const summary = [`# Fountain monster-sense no-modal regression`, '', 'PASS', '', `Screenshot: ${screenshot}`, '', 'Verified with the same shim event shape NetHack emits after fountain monster detection enters browse_map/getpos:', '- recent message includes “You sense the presence of monsters.”', '- farlook/getpos Tip text is suppressed instead of rendered as a modal', '- no “Tip” or “Spellbook” interaction dialog opens for the monster-sense result', '- no raw farlook tutorial rows leak into the page body', '- a single space is sent to continue the hidden read-only tip menu so map browse can proceed', '- unrelated read-only information after the same message still opens normally', '- a normal farlook Tip without recent monster-sense still opens normally', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
