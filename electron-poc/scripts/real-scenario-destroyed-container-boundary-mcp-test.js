const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');
const outDir = path.join(root, 'test-output', 'workstream-b-destroyed-container-boundary');
const scenarioId = 'container/locked-chest-force-destroy-on-hero';
const port = Number(process.env.NH_DESTROYED_BOUNDARY_CDP_PORT || 9665);

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function sendKey(cdp, ch) { await evalExpr(cdp, `window.__nethackAutomation.sendKeycode(${JSON.stringify(ch.charCodeAt(0))})`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  actions: window.__nethackPromptTest?.contextActions?.(),
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  prompt: window.__nethackPromptTest?.prompt?.(),
  dialog: window.__nethackPromptTest?.dialog?.(),
  currentCell: window.__nethackPromptTest?.currentCell?.(),
  ground: window.__nethackPromptTest?.groundSnapshots?.(),
  container: window.__nethackPromptTest?.container?.(),
  containerSnapshots: window.__nethackPromptTest?.containerSnapshots?.(),
  menuText: document.getElementById('menu-panel')?.innerText || '',
  messages: window.__nethackPromptTest?.messages?.().slice(-40).map((m) => m.text || String(m)) || [],
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
  shimGroundPileEvents: (window.__nethackPromptTest?.publicGroundPileShimEvidence?.() || []).filter((event) => event?.name === 'shim_ground_pile_snapshot')
}))()`); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
function makeIsolatedPlayground() {
  const source = path.join(repo, 'playground');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-destroyed-boundary-'));
  fs.cpSync(source, temp, { recursive: true, filter: (entry) => !/[a-z]lock\.0$/.test(path.basename(entry)) });
  return temp;
}

const staleSurfacePattern = /\b(?:open-container|force-container|chest|box|container)\b/i;
function collectStrings(value, pathName = '$', out = []) {
  if (value == null) return out;
  if (typeof value === 'string') {
    out.push({ path: pathName, value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${pathName}[${index}]`, out));
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) collectStrings(child, `${pathName}.${key}`, out);
  }
  return out;
}
function publicDialogState(dialog) {
  if (!dialog) return null;
  if (!dialog.interactionOpen && !dialog.documentOpen) return { interactionOpen: false, documentOpen: false, options: [], panelControls: dialog.panelControls?.hidden ? { hidden: true, text: '', buttons: [] } : dialog.panelControls || null };
  return dialog;
}
function publicSnapshotPayloadWithoutHistoricalMessages(s) {
  return {
    actions: s.actions,
    prompt: s.prompt,
    dialog: publicDialogState(s.dialog),
    currentCell: s.currentCell,
    ground: s.ground,
    container: s.container,
    containerSnapshots: s.containerSnapshots,
    menuText: s.menuText,
  };
}
function publicStateSidecar(s) {
  return {
    ...publicSnapshotPayloadWithoutHistoricalMessages(s),
    sent: s.sent,
    messages: s.messages,
    running: s.running,
    seenShim: s.seenShim,
  };
}
function stalePublicSurfaces(s) {
  return collectStrings(publicSnapshotPayloadWithoutHistoricalMessages(s)).filter(({ value }) => staleSurfacePattern.test(value));
}
function assertNoDestroyedContainerSurface(s) {
  const stale = stalePublicSurfaces(s);
  assert('destroyed container public snapshots/state have no stale container/chest/box/open/force surface except historical messages', stale.length === 0, JSON.stringify(stale.slice(0, 20), null, 2));
  const ids = (s.actions?.buttons || []).map((b) => b.id);
  assert('destroyed container context actions omit open-container', !ids.includes('open-container'), ids.join(','));
  assert('destroyed container context actions omit force-container', !ids.includes('force-container'), ids.join(','));
  assert('destroyed container ground snapshot has no stale container item', !(s.ground?.piles || []).flatMap((pile) => pile.items || []).some((item) => staleSurfacePattern.test(`${item.displayName || ''} ${item.semanticName || ''} ${item.semanticAppearance || ''} ${(item.actionAffordances || []).join(' ')}`)), JSON.stringify(s.ground));
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const playground = makeIsolatedPlayground();
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACKDIR: playground, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdoutLog = fs.createWriteStream(path.join(outDir, 'electron-stdout.log'));
  const stderrLog = fs.createWriteStream(path.join(outDir, 'electron-stderr.log'));
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); stdoutLog.end(); stderrLog.end(); fs.rmSync(playground, { recursive: true, force: true }); };
  process.on('exit', cleanup);
  child.stdout.on('data', (d) => { stdoutLog.write(d); process.stdout.write(d); });
  child.stderr.on('data', (d) => { stderrLog.write(d); process.stderr.write(d); });
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; });
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => evalExpr(cdp, `document.readyState === 'complete' && !!window.__nethackPromptTest`));
    await evalExpr(cdp, `document.querySelector('#start-shim')?.click?.()`);
    await delay(250);
    const confirmVisible = await evalExpr(cdp, `(() => { const dialog = document.getElementById('character-dialog'); const button = document.getElementById('confirm-character'); const r = button?.getBoundingClientRect(); return Boolean(dialog?.open || (r?.width && r?.height && getComputedStyle(button).display !== 'none')); })()`);
    if (confirmVisible) await click(cdp, '#confirm-character');
    await waitFor(async () => (await state(cdp)).running);
    await waitFor(async () => /bridge_test_scenario_loaded/.test((await state(cdp)).seenShim || ''), 15000).catch(async (error) => {
      const debug = await state(cdp).catch((stateError) => ({ stateError: String(stateError) }));
      fs.writeFileSync(path.join(outDir, 'debug-scenario-load-timeout-state.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, 'debug-scenario-load-timeout.png').catch(() => undefined);
      throw error;
    });
    await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`);
    const before = await waitFor(async () => { const s = await state(cdp); const ids = (s.actions?.buttons || []).map((b) => b.id); return ids.includes('open-container') ? s : null; }).catch(async (error) => {
      const debug = await state(cdp).catch((stateError) => ({ stateError: String(stateError) }));
      fs.writeFileSync(path.join(outDir, 'debug-before-timeout-state.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, 'debug-before-timeout.png').catch(() => undefined);
      throw error;
    });
    const beforeShot = await shot(cdp, '01-before-destroy-public-container-surface.png');
    fs.writeFileSync(path.join(outDir, 'before-destroy-public-state.json'), JSON.stringify(publicStateSidecar(before), null, 2));

    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid')?.focus?.();`);
    await click(cdp, '#context-action-bar button[data-context-action-id="force-container"]');
    await waitFor(async () => { const s = await state(cdp); return /force its lock/i.test(`${s.prompt?.query || ''}\n${s.dialog?.prompt || ''}`) ? s : null; });
    await sendKey(cdp, 'y');
    let destroyed;
    for (let i = 0; i < 120; i += 1) {
      const s = await state(cdp);
      if (/totally destroyed/i.test((s.messages || []).join('\n'))) { destroyed = s; break; }
      await sendKey(cdp, '.');
      await delay(120);
    }
    assert('container was destroyed by real #force', Boolean(destroyed), JSON.stringify((await state(cdp)).messages));
    const after = await waitFor(async () => { const s = await state(cdp); const ids = (s.actions?.buttons || []).map((b) => b.id); if (!ids.includes('pickup')) return null; try { assertNoDestroyedContainerSurface(s); return s; } catch { return null; } }, 12000);
    assertNoDestroyedContainerSurface(after);
    const afterShot = await shot(cdp, '02-after-destroy-no-stale-container-surface.png');
    fs.writeFileSync(path.join(outDir, 'after-destroy-public-state.json'), JSON.stringify(publicStateSidecar(after), null, 2));
    fs.writeFileSync(path.join(outDir, 'after-destroy-raw-shim-ground-pile-events.json'), JSON.stringify(after.shimGroundPileEvents, null, 2));

    const summary = [
      '# Workstream B destroyed-container stale public cleanup',
      '',
      'PASS',
      '',
      `Scenario: ${scenarioId}`,
      `Before screenshot: ${beforeShot}`,
      `After screenshot: ${afterShot}`,
      `Before state: ${path.join(outDir, 'before-destroy-public-state.json')}`,
      `After state: ${path.join(outDir, 'after-destroy-public-state.json')}`,
      `Raw C/shim ground-pile evidence retained across before/after destruction: ${path.join(outDir, 'after-destroy-raw-shim-ground-pile-events.json')}`,
      `Run stdout/stderr: ${path.join(outDir, 'electron-stdout.log')} / ${path.join(outDir, 'electron-stderr.log')}`,
      '',
      'Verified through real Electron/gameplay:',
      '- visible locked chest surface existed before forcing',
      '- NetHack destroyed the chest after a real #force command',
      '- post-destruction public context actions, current-cell state, ground snapshots, container snapshots, and dialog/menu state have no stale container/chest/box/open-container/force-container surface except historical visible messages',
      '',
      'Before actions:',
      '```',
      before.actions?.text || '',
      '```',
      'After actions:',
      '```',
      after.actions?.text || '',
      '```',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(outDir, 'summary.md'), summary);
    console.log(summary);
  } finally {
    cleanup();
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
