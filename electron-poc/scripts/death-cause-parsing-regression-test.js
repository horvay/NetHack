const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.RUN_EVIDENCE_DIR || path.join(root, 'test-output', 'death-cause-parsing');
const port = Number(process.env.CDP_PORT || 9554);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 100) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const callbacks = pending.get(msg.id); pending.delete(msg.id); msg.error ? callbacks.reject(new Error(JSON.stringify(msg.error))) : callbacks.resolve(msg.result); } });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) { const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
async function shot(cdp, name) { const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const file = path.join(outDir, name); fs.writeFileSync(file, Buffer.from(result.data, 'base64')); return file; }
async function gameOverMetrics(cdp) {
  return evalExpr(cdp, `(() => ({
    cause: document.getElementById('game-over-cause').textContent,
    stoneCause: document.getElementById('game-over-stone-cause').textContent,
    modalOpen: document.getElementById('game-over-dialog').open,
    sections: document.getElementById('game-over-sections').textContent,
  }))()`);
}
async function scenario(cdp, name, events, expected) {
  await evalExpr(cdp, `(() => { window.__nethackPromptTest.reset(); window.__nethackPromptTest.setRunning(true); })()`);
  for (const event of events) await evalExpr(cdp, `window.__nethackPromptTest.event(${JSON.stringify({ event })})`);
  await delay(1800);
  const metrics = await gameOverMetrics(cdp);
  const screenshot = await shot(cdp, `${name}.png`);
  assert.equal(metrics.modalOpen, true, `${name}: modal is open`);
  assert.match(metrics.cause, expected, `${name}: panel cause`);
  assert.match(metrics.stoneCause, expected, `${name}: gravestone cause`);
  return { name, expected: String(expected), metrics, screenshot };
}
async function lateFinalCauseScenario(cdp) {
  const name = '07-late-final-cause-refresh';
  await evalExpr(cdp, `(() => { window.__nethackPromptTest.reset(); window.__nethackPromptTest.setRunning(true); })()`);
  await evalExpr(cdp, `window.__nethackPromptTest.event(${JSON.stringify({ event: { name: 'shim_putstr', window: 1, text: 'You die...' } })})`);
  await waitFor(async () => (await gameOverMetrics(cdp)).modalOpen, 3000);
  const before = await gameOverMetrics(cdp);
  assert.match(before.stoneCause, /You die/i, `${name}: fixture starts with generic gravestone cause`);
  await evalExpr(cdp, `window.__nethackPromptTest.event(${JSON.stringify({ event: { name: 'shim_create_nhwindow', return: 71, windowType: 4 } })})`);
  await evalExpr(cdp, `window.__nethackPromptTest.event(${JSON.stringify({ event: { name: 'shim_putstr', window: 71, text: 'Goodbye Electron the Tourist...' } })})`);
  await evalExpr(cdp, `window.__nethackPromptTest.event(${JSON.stringify({ event: { name: 'shim_putstr', window: 71, text: 'You died in The Dungeons of Doom on dungeon level 2, killed by a fox.' } })})`);
  await evalExpr(cdp, `window.__nethackPromptTest.event(${JSON.stringify({ event: { name: 'shim_display_nhwindow', window: 71 } })})`);
  await waitFor(async () => /Killed by a fox/i.test((await gameOverMetrics(cdp)).stoneCause), 3000);
  const metrics = await gameOverMetrics(cdp);
  const screenshot = await shot(cdp, `${name}.png`);
  assert.equal(metrics.modalOpen, true, `${name}: modal remains open`);
  assert.match(metrics.cause, /Killed by a fox/i, `${name}: panel cause refreshes after modal opens`);
  assert.match(metrics.stoneCause, /Killed by a fox/i, `${name}: gravestone cause refreshes after modal opens`);
  assert.match(metrics.sections, /killed by a fox/i, `${name}: late final statistics are preserved`);
  return { name, expected: '/Killed by a fox/i', before, metrics, screenshot };
}
(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electron, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1200', NH_ELECTRON_WINDOW_HEIGHT: '900' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp;
  try {
    const page = await waitFor(async () => (await json(`http://127.0.0.1:${port}/json/list`)).find((target) => target.type === 'page'), 20000);
    cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
    await waitFor(() => evalExpr(cdp, `document.readyState === 'complete' && !!window.__nethackPromptTest`), 10000);
    const results = [];
    results.push(await scenario(cdp, '01-combat-you-die', [
      { name: 'shim_putstr', window: 1, text: 'The jackal bites!' },
      { name: 'shim_putstr', window: 1, text: 'You die...' },
      { name: 'shim_yn_function', query: 'Do you want your possessions identified?', choices: 'ynq' },
    ], /Killed by a jackal/i));
    results.push(await scenario(cdp, '02-starvation', [
      { name: 'shim_putstr', window: 1, text: 'You die from starvation.' },
      { name: 'shim_yn_function', query: 'Do you want your possessions identified?', choices: 'ynq' },
    ], /Starved to death/i));
    results.push(await scenario(cdp, '03-final-dump-cause', [
      { name: 'shim_putstr', window: 1, text: 'The grid bug bites!' },
      { name: 'shim_putstr', window: 1, text: 'You die...' },
      { name: 'shim_create_nhwindow', return: 70, windowType: 4 },
      { name: 'shim_putstr', window: 70, text: 'Goodbye Electron the Tourist...' },
      { name: 'shim_putstr', window: 70, text: 'You died in The Dungeons of Doom on dungeon level 2, killed by a fox.' },
      { name: 'shim_display_nhwindow', window: 70 },
    ], /Killed by a fox/i));
    results.push(await scenario(cdp, '04-shopkeeper-zap-over-grid-bug-message', [
      { name: 'shim_putstr', window: 1, text: 'The grid bug bites!' },
      { name: 'shim_putstr', window: 1, text: 'Eypau zaps an iron wand!' },
      { name: 'shim_putstr', window: 1, text: 'The wand hits you!' },
      { name: 'shim_putstr', window: 1, text: 'You die...' },
      { name: 'shim_putstr', window: 1, text: 'Eypau takes all your possessions.' },
    ], /Killed by Eypau/i));
    results.push(await scenario(cdp, '05-native-final-killer-over-stale-message', [
      { name: 'shim_putstr', window: 1, text: 'The grid bug bites!' },
      { name: 'shim_putstr', window: 1, text: 'You die...' },
      { name: 'shim_native_end_diagnostic', phase: 'really_done.final_killer', how: 0, reason: 'died', killerName: 'wand zapped by Eypau', killerFormat: 0, killer: 'killed by a wand zapped by Eypau', finalFlow: true, disclosureFlow: false, taken: false },
    ], /Killed by a wand zapped by Eypau/i));
    results.push(await scenario(cdp, '06-early-native-does-not-block-final-dump', [
      { name: 'shim_putstr', window: 1, text: 'The grid bug bites!' },
      { name: 'shim_putstr', window: 1, text: 'You die...' },
      { name: 'shim_native_end_diagnostic', phase: 'done.final', how: 0, reason: 'died', killerName: 'grid bug', killerFormat: 0, killer: 'killed by a grid bug', finalFlow: true, disclosureFlow: false, taken: false },
      { name: 'shim_create_nhwindow', return: 72, windowType: 4 },
      { name: 'shim_putstr', window: 72, text: 'Goodbye Electron the Tourist...' },
      { name: 'shim_putstr', window: 72, text: 'You died in The Dungeons of Doom on dungeon level 2, killed by a fox.' },
      { name: 'shim_display_nhwindow', window: 72 },
    ], /Killed by a fox/i));
    results.push(await lateFinalCauseScenario(cdp));
    const resultPath = path.join(outDir, 'death-cause-parsing-results.json');
    fs.writeFileSync(resultPath, `${JSON.stringify({ ok: true, outDir, results }, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, resultPath, outDir }, null, 2));
    cdp.close();
  } finally {
    if (cdp) { try { cdp.close(); } catch {} }
    child.kill('SIGTERM');
    await delay(250);
    if (!child.killed) child.kill('SIGKILL');
  }
})().catch((error) => { console.error(error); process.exit(1); });
