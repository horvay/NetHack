const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'container-active-selector-remap');
const port = Number(process.env.NH_CONTAINER_ACTIVE_REMAP_CDP_PORT || 9498);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 100) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { await cdp.send('Runtime.evaluate', { expression: 'document.activeElement?.blur?.(); window.scrollTo(0, 0)' }); await cdp.send('Page.bringToFront'); await delay(150); const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.', '--disable-gpu'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1320', NH_ELECTRON_WINDOW_HEIGHT: '880' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup); child.stdout.on('data', (d) => process.stdout.write(d)); child.stderr.on('data', (d) => process.stderr.write(d));
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1320, height: 880, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "document.readyState === 'complete' && !!window.__nethackPromptTest" })).result.value, 10000);
    const result = await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      t.reset(); t.setRunning(true);
      t.event({name:'shim_start_menu', window:794});
      [[':', 'Look inside the large box'], ['o', 'take something out'], ['i', 'put something in'], ['q', 'do nothing']].forEach(([key, text]) => t.event({name:'shim_add_menu', window:794, selector:key.charCodeAt(0), text}));
      t.event({name:'shim_end_menu', window:794, prompt:'Do what with the large box?'});
      t.event({name:'shim_select_menu', window:794, how:1});
      t.event({name:'shim_start_menu', window:795});
      [[97, 'a - an uncursed food ration'], [98, 'b - a +0 dagger'], [99, 'c - an uncursed scroll of identify']].forEach(([selector, text]) => t.event({name:'shim_add_menu', window:795, selector, text, semanticKind:'object'}));
      t.event({name:'shim_end_menu', window:795, prompt:'Take out what?'});
      t.event({name:'shim_select_menu', window:795, how:2});
      t.event({name:'shim_start_menu', window:796});
      t.event({name:'shim_add_menu', window:796, selector:102, text:'f - a tin opener', semanticKind:'object'});
      t.event({name:'shim_end_menu', window:796, prompt:'Put in what?'});
      t.event({name:'shim_select_menu', window:796, how:2});
      t.event({name:'bridge_menu_answer', window:796, return:0});
      t.event({name:'shim_start_menu', window:797});
      t.event({name:'shim_add_menu', window:797, selector:97, text:'a - an uncursed scroll of identify', semanticKind:'object'});
      t.event({name:'shim_end_menu', window:797, prompt:'Take out what?'});
      t.event({name:'shim_select_menu', window:797, how:2});
      t.setContainerStateForTest({
        active: true,
        sessionKind: 'container',
        phase: 'takeout',
        prompt: 'Do what with the large box?',
        actionMenu: { prompt: 'Do what with the large box?', items: [{ selector: 111, text: 'take something out' }, { selector: 105, text: 'put something in' }], awaitingSelection: true, how: 1 },
        takeOutMenu: { prompt: 'Take out what?', items: [{ selector: 97, text: 'a - an uncursed scroll of identify' }], awaitingSelection: true, how: 2 },
        leftItems: [{ selector: 99, text: 'c - an uncursed scroll of identify', semanticKind: 'object' }],
        rightItems: [{ selector: 97, text: 'a - an uncursed food ration' }, { selector: 98, text: 'b - a +0 dagger' }, { selector: 102, text: 'f - a tin opener' }],
        loadedSides: { left: true, right: true },
        loadingSides: { left: false, right: false },
        feedback: 'Stale optimistic last row still displayed while NetHack has relettered the active take-out menu.',
      });
      t.clearSentInputs();
      t.transferContainerItem('left', 'c');
      return { sent: t.sentInputs().join(''), container: t.container(), transfers: t.transferTransactions(), body: document.body.innerText };
    })()`);
    assert('stale active menu path sends no selector or legacy text after direct migration', result.sent === '', JSON.stringify(result));
    assert('stale active menu path keeps panel active and reconciles from visible state without moving the row', result.container.active && result.container.left.some((row) => /scroll of identify/i.test(row.text)) && !result.container.right.some((row) => /scroll of identify/i.test(row.text)), JSON.stringify(result.container));
    assert('transfer transaction is rejected instead of falling back to menu choreography', result.transfers.transfers.some((tx) => tx.direction === 'container-to-inventory' && tx.status === 'rejected' && /Direct container transfer needs stable public container and item IDs/.test(tx.result?.reason || '')), JSON.stringify(result.transfers));
    assert('no fallback or equipment overlay leaked into remap view', !/Inventory selector|Name unavailable|Equipment\s*\/\s*Inventory|Hero equipment/i.test(result.body || ''), result.body.slice(0, 1200));
    fs.writeFileSync(path.join(outDir, 'summary.md'), [`# Container active selector stale-menu regression`, '', 'PASS', '', 'Verified: a stale optimistic row with an active NetHack menu no longer sends a selector or legacy command text; the panel stays visible and reports a direct-route rejection.', '', `Sent input: ${JSON.stringify(result.sent)}`, '', 'Visible panel:', '```', result.container.text, '```', ''].join('\n'));
    console.log('container-active-selector-remap-test PASS');
  } finally { cleanup(); }
}

main().catch((error) => { console.error(error); process.exit(1); });
