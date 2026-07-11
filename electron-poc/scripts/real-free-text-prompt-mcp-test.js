const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_REAL_FREE_TEXT_OUT_DIR || path.join(root, 'test-output', 'real-free-text-prompt-mcp');
const port = Number(process.env.NH_REAL_FREE_TEXT_CDP_PORT || 9493);
const width = Number(process.env.NH_REAL_FREE_TEXT_WIDTH || 1360);
const height = Number(process.env.NH_REAL_FREE_TEXT_HEIGHT || 920);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out waiting'); }
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function clickCenter(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
async function state(cdp) { return evalExpr(cdp, `(() => {
  const automation = window.__nethackAutomation?.state?.() || {};
  const dialog = window.__nethackPromptTest?.dialog?.() || {};
  const messages = window.__nethackPromptTest?.messages?.().slice(-8).map(m => m.text || String(m)) || [];
  const backdrop = getComputedStyle(document.getElementById('interaction-dialog'), '::backdrop');
  return {
    running: automation.runningState?.running || false,
    seen: document.getElementById('shim-output')?.dataset?.seen || '',
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map(d => d.id),
    dialog,
    messages,
    visibleRecentLog: document.getElementById('messages')?.innerText || '',
    backdrop: { background: backdrop.backgroundColor, filter: backdrop.backdropFilter || backdrop.webkitBackdropFilter || '' },
    body: document.body.innerText,
  };
})()`); }
async function startRealGame(cdp) {
  await clickCenter(cdp, '#start-shim');
  await delay(200);
  await clickCenter(cdp, '#confirm-character');
  await waitFor(async () => { const s = await state(cdp); return s.running && /shim_glyph|shim_status_update|shim_curs|shim_putstr/.test(s.seen) ? s : null; }, 20000);
  const s = await state(cdp);
  if (s.dialogs.includes('intro-dialog')) {
    await clickCenter(cdp, '#intro-continue');
    await waitFor(async () => !(await state(cdp)).dialogs.includes('intro-dialog'), 5000);
  }
  await evalExpr(cdp, "document.getElementById('game-grid').focus(); window.__nethackPromptTest.clearSentInputs();");
  return state(cdp);
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; const stdout = []; const stderr = [];
  child.stdout.on('data', d => stdout.push(String(d))); child.stderr.on('data', d => stderr.push(String(d)));
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  const results = { outDir, screenshots: {}, checks: {} };
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find(p => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find(p => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackAutomation")), 10000);
    results.started = await startRealGame(cdp);
    results.screenshots.beforePrompt = await shot(cdp, '01-real-game-before-free-text-prompt.png');

    await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      t.event({name:'shim_putstr', window:1, text:'You unleash a water demon!'});
      t.event({name:'shim_putstr', window:1, text:'Grateful for its release, the demon grants you a wish!'});
      t.event({name:'shim_getlin', query:'For what do you wish?'});
      document.getElementById('interaction-text')?.focus();
    })()`);
    results.prompt = await waitFor(async () => { const s = await state(cdp); return s.dialogs.includes('interaction-dialog') && /wish/i.test(`${s.dialog.title}\n${s.dialog.prompt}`) ? s : null; }, 7000);
    results.screenshots.freeTextPrompt = await shot(cdp, '02-real-shim-free-text-wish-prompt-context-visible.png');
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.setText('blessed greased +2 gray dragon scale mail'); t.confirm(); })()`);
    results.afterConfirm = await state(cdp);

    const allPrompt = `${results.prompt.dialog.title}\n${results.prompt.dialog.prompt}\n${results.prompt.dialog.context}\n${results.prompt.dialog.textLabel}`;
    results.checks = {
      realElectronGameStarted: Boolean(results.started.running),
      deterministicShimPromptUsedAfterRealStart: /shim_getlin/.test(results.prompt.seen),
      clearWishQuestionVisible: /For what do you wish\?/i.test(allPrompt) && /Wish granted|Wish text/i.test(allPrompt),
      textInputVisibleAndFocusedFlow: results.prompt.dialog.textEntry && /Confirm \/ Enter/i.test(results.prompt.dialog.confirmText || ''),
      contextLogIncludedInPrompt: /water demon/i.test(results.prompt.dialog.context) && /grants you a wish/i.test(results.prompt.dialog.context),
      recentLogStillReadableBehindModal: /water demon/i.test(results.prompt.visibleRecentLog) && /grants you a wish/i.test(results.prompt.visibleRecentLog),
      interactionBackdropDoesNotBlurLog: !/blur/i.test(String(results.prompt.backdrop.filter || '')),
      typedWishSubmittedToBridge: false,
    };
    // afterConfirm.sent is not in state; fetch directly so the screenshot state stays compact.
    results.afterConfirm.sent = await evalExpr(cdp, "window.__nethackPromptTest.sentInputs().join('')");
    results.checks.typedWishSubmittedToBridge = /gray dragon scale mail\n/.test(results.afterConfirm.sent);

    fs.writeFileSync(path.join(outDir, 'real-free-text-prompt-mcp-summary.json'), JSON.stringify(results, null, 2));
    const md = [`# Real free-text prompt MCP/CDP regression`, '', `Output: ${outDir}`, '', 'This starts real Electron NetHack, then feeds deterministic shim events through the same renderer prompt/input flow used by live `shim_getlin` questions.', '', '## Checks', ...Object.entries(results.checks).map(([k,v]) => `- ${v ? 'PASS' : 'FAIL'} ${k}`), '', '## Screenshots', ...Object.entries(results.screenshots).map(([k,v]) => `- ${k}: ${v}`), ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-free-text-prompt-mcp-summary.md'), md);
    console.log(md);
    const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`Real free-text prompt MCP regression failed: ${failed.join(', ')}`);
  } finally {
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), stdout.join(''));
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), stderr.join(''));
    cleanup();
  }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
