const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');
const { createScreenshotQc } = require('./lib/screenshot-qc');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');
const outDir = path.resolve(process.env.NH_PLAYER_NAMES_OUT_DIR || path.join(root, 'test-output', 'real-player-assigned-names'));
const playground = path.join(outDir, 'isolated-playground');
const port = Number(process.env.NH_PLAYER_NAMES_CDP_PORT || 9741);
const width = 1360;
const height = 920;
const scenarioId = 'identity/player-assigned-item-names';

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeoutMs) {
    try { const value = await fn(); if (value) return value; } catch (error) { last = error; }
    await delay(stepMs);
  }
  throw last || new Error('timed out waiting');
}
async function json(url) { const response = await fetch(url); if (!response.ok) throw new Error(`${response.status} ${url}`); return response.json(); }
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id); pending.delete(message.id);
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
  });
  return {
    send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); },
    close() { ws.close(); },
  };
}
async function evalExpr(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function click(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el=document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center'}); const r=el?.getBoundingClientRect(); return r&&r.width&&r.height?{x:r.left+r.width/2,y:r.top+r.height/2}:null; })()`);
  if (!box) throw new Error(`missing visible selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
async function press(cdp, key, code, text = key) {
  const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
  const params = { key, code, text, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}
function assert(label, condition, detail = '') { if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`); }
function preparePlayground() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(playground, 'save'), { recursive: true });
  for (const file of ['nhdat', 'sysconf', 'symbols', 'license']) fs.copyFileSync(path.join(repo, 'playground', file), path.join(playground, file));
  for (const file of ['perm', 'record', 'logfile', 'xlogfile', 'livelog', 'paniclog']) fs.writeFileSync(path.join(playground, file), '');
}
async function capture(cdp, id) {
  const capture = await evalExpr(cdp, `window.netHackPOC.captureTestScreenshot(${JSON.stringify(id)})`);
  assert(`${id} uses native capturePage PNG`, capture?.ok && capture.method === 'BrowserWindow.webContents.capturePage', JSON.stringify(capture));
  return capture.path;
}
async function state(cdp) {
  return evalExpr(cdp, `(() => ({
    running: Boolean(window.__nethackAutomation?.state?.().runningState?.running),
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
    inventory: window.__nethackPromptTest?.inventory?.(),
    equipment: window.__nethackPromptTest?.equipmentSnapshot?.(),
    interaction: window.__nethackPromptTest?.dialog?.(),
    shimEvents: window.__nethackPromptTest?.shimEvents?.() || [],
    body: document.body.innerText,
  }))()`);
}

async function main() {
  preparePlayground();
  const qc = createScreenshotQc({ rootDir: path.join(outDir, 'screenshots') });
  const child = spawn(electronBin, ['.'], {
    cwd: root,
    env: {
      ...process.env,
      AI_ORG_ELECTRON_CDP_PORT: String(port),
      NH_ELECTRON_WINDOW_WIDTH: String(width),
      NH_ELECTRON_WINDOW_HEIGHT: String(height),
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_SCENARIO_ID: scenarioId,
      NH_TEST_PLAYGROUND: playground,
      NETHACKDIR: playground,
      NH_SHIM_RESET_LOCKS: '1',
      NETHACK_SEED: '16',
      NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none',
      NH_DIAGNOSTIC_LOG_DIR: path.join(outDir, 'diagnostics'),
      NH_TEST_CAPTURE_DIR: path.join(outDir, 'native-captures'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = []; const stderr = []; let cdp;
  child.stdout.on('data', (data) => stdout.push(String(data)));
  child.stderr.on('data', (data) => stderr.push(String(data)));
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.some((page) => page.type === 'page') ? list : null; });
    cdp = await connect(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await waitFor(() => evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest"), 10000);
    const profile = await evalExpr(cdp, `window.netHackPOC.setTestCaptureProfile(${JSON.stringify({ width, height, zoomPercent: 100 })})`);
    assert('native capture profile applied', profile?.ok && profile.contentSize?.[0] === width && profile.contentSize?.[1] === height, JSON.stringify(profile));
    const initialDialogs = await evalExpr(cdp, "Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id)");
    if (initialDialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game'); else await click(cdp, '#start-shim');
    await waitFor(() => evalExpr(cdp, "document.getElementById('character-dialog')?.open"), 5000);
    await evalExpr(cdp, `(() => {
      document.getElementById('player-name').value='NamedFixture';
      document.getElementById('player-role').value='Val';
      document.getElementById('player-race').value='Hum';
      document.getElementById('player-gender').value='Fem';
      document.getElementById('player-align').value='Law';
      document.getElementById('game-seed').value='16';
    })()`);
    await click(cdp, '#confirm-character');
    const running = await waitFor(async () => { const next = await state(cdp); return next.running && next.shimEvents.some((entry) => (entry.event || entry).name === 'bridge_test_scenario_loaded') && next.inventory?.snapshotItems?.length === 2 ? next : null; }).catch(async (error) => {
      const debug = await state(cdp).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, 'startup-timeout-debug.json'), `${JSON.stringify(debug, null, 2)}\n`);
      throw error;
    });
    if (running.dialogs.includes('intro-dialog')) await click(cdp, '#intro-continue');
    const inventoryUpdate = running.shimEvents.map((entry) => entry.event || entry).filter((event) => event.name === 'shim_update_inventory').slice(-1)[0];
    const calledNative = inventoryUpdate?.items?.find((item) => item.calledName === 'sunrise');
    const namedNative = inventoryUpdate?.items?.find((item) => item.individualName === 'Dawnbringer');
    assert('native unknown item emits exact calledName', calledNative?.calledName === 'sunrise', JSON.stringify(inventoryUpdate));
    assert('native unknown item emits explicit semanticAppearance', calledNative?.semanticKnown === false && typeof calledNative.semanticAppearance === 'string' && calledNative.semanticAppearance.length > 0, JSON.stringify(calledNative));
    assert('native unknown called item does not emit hidden semanticName', calledNative?.semanticName == null, JSON.stringify(calledNative));
    assert('normalized native unknown item keeps narrow naming knowledge without identity authorization', calledNative?.known?.naming === true && calledNative?.known?.identity === false && calledNative?.known?.appearance === true, JSON.stringify(calledNative));
    assert('native known sword emits exact individualName', namedNative?.individualName === 'Dawnbringer' && namedNative?.known?.naming === true, JSON.stringify(namedNative));
    assert('native known sword identity remains independently public', namedNative?.semanticKnown === true && namedNative?.semanticName === 'long sword', JSON.stringify(namedNative));
    const calledSnapshot = running.inventory.snapshotItems.find((item) => item.calledName === 'sunrise');
    const namedSnapshot = running.inventory.snapshotItems.find((item) => item.individualName === 'Dawnbringer');
    assert('renderer snapshot adapter keeps calledName and unknown identity', calledSnapshot?.displayName?.includes('called sunrise') && calledSnapshot?.known?.identity === false && calledSnapshot?.calledName === 'sunrise', JSON.stringify(running.inventory));
    assert('renderer snapshot adapter keeps named sword', namedSnapshot?.displayName?.includes('Dawnbringer') && namedSnapshot?.individualName === 'Dawnbringer', JSON.stringify(running.inventory));
    const gameplayRaw = await capture(cdp, '01-named-items-gameplay');
    qc.recordCapture('01-named-items-gameplay', gameplayRaw, { viewport: { width, height, zoomPercent: 100 }, state: 'real fixture gameplay', captureMethod: 'BrowserWindow.webContents.capturePage', captureSource: gameplayRaw, viewSafeFormat: 'BMP', viewSafeScale: 0.5 });
    await evalExpr(cdp, "document.getElementById('game-grid')?.focus?.()");
    await press(cdp, 'i', 'KeyI');
    const menuState = await waitFor(async () => { const next = await state(cdp); const visible = `${next.interaction?.panelControls?.text || ''}\n${(next.interaction?.options || []).map((option) => option.text || '').join('\n')}`; return /Equipment\s*\/\s*Inventory/i.test(next.interaction?.title || '') && /sunrise/i.test(visible) && /Dawnbringer/i.test(visible) ? next : null; }, 10000).catch(async (error) => {
      const debug = await state(cdp).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, 'menu-timeout-debug.json'), `${JSON.stringify(debug, null, 2)}\n`);
      throw error;
    });
    const menuEvents = menuState.shimEvents.map((entry) => entry.event || entry).filter((event) => event.name === 'shim_add_menu');
    const calledMenu = menuEvents.find((event) => event.calledName === 'sunrise');
    const namedMenu = menuEvents.find((event) => event.individualName === 'Dawnbringer');
    assert('classic native menu keeps exact calledName and naming knowledge', calledMenu?.known?.naming === true && calledMenu?.calledName === 'sunrise' && /called sunrise/i.test(calledMenu?.text || ''), JSON.stringify(calledMenu));
    assert('classic native menu keeps exact individualName and naming knowledge', namedMenu?.known?.naming === true && namedMenu?.individualName === 'Dawnbringer' && /named Dawnbringer/i.test(namedMenu?.text || ''), JSON.stringify(namedMenu));
    const visibleNameRows = await evalExpr(cdp, `Array.from(document.querySelectorAll('#interaction-options .menu-item-name')).map((node) => ({ text: node.textContent || '', clipped: node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1, lineClamp: getComputedStyle(node).webkitLineClamp, whiteSpace: getComputedStyle(node).whiteSpace }))`);
    assert('real current Inventory visibly paints complete Dawnbringer and called sunrise names', visibleNameRows.some((row) => /named Dawnbringer/i.test(row.text) && !row.clipped) && visibleNameRows.some((row) => /called sunrise/i.test(row.text) && !row.clipped), JSON.stringify(visibleNameRows));
    assert('real current Inventory names use the approved two-line allocation', visibleNameRows.every((row) => row.lineClamp === '2' && row.whiteSpace === 'normal'), JSON.stringify(visibleNameRows));
    const menuRaw = await capture(cdp, '02-named-items-inventory');
    qc.recordCapture('02-named-items-inventory', menuRaw, { viewport: { width, height, zoomPercent: 100 }, state: 'real fixture Equipment / Inventory', captureMethod: 'BrowserWindow.webContents.capturePage', captureSource: menuRaw, viewSafeFormat: 'BMP', viewSafeScale: 0.5 });
    const evidence = { scenarioId, seed: '16', inventoryUpdate, calledNative, namedNative, calledSnapshot, namedSnapshot, calledMenu, namedMenu, visibleDialog: menuState.interaction };
    fs.writeFileSync(path.join(outDir, 'public-name-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), stdout.join(''));
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), stderr.join(''));
    console.log('real-player-assigned-names-mcp-test: PASS');
  } finally {
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), stdout.join(''));
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), stderr.join(''));
    cleanup();
    await delay(750);
    fs.rmSync(playground, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
