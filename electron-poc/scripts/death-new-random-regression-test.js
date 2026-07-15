const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const evidenceDir = process.env.RUN_EVIDENCE_DIR || path.join(root, 'test-output', 'death-new-random-regression');
const port = Number(process.env.CDP_PORT || 9554);
const fixturePath = path.join(root, 'test', 'fixtures', 'game-over-death-events.jsonl');

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  } finally { clearTimeout(timer); }
}
async function waitFor(fn, timeoutMs = 15000, intervalMs = 150) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) { last = error; }
    await delay(intervalMs);
  }
  throw last || new Error('timed out waiting for condition');
}
async function waitForCdp(timeoutMs = 10000) {
  return waitFor(async () => json(`http://127.0.0.1:${port}/json/list`), timeoutMs);
}
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return {
    send(method, params = {}) {
      const callId = ++id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
    },
    close() { ws.close(); },
  };
}
async function evalExpr(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function screenshot(cdp, file) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  return file;
}
async function pressKey(cdp, key, text = key) {
  const upper = key.length === 1 ? key.toUpperCase() : key;
  const virtualKeyCode = key.length === 1 ? upper.charCodeAt(0) : (key === 'Escape' ? 27 : (key === 'Enter' ? 13 : 0));
  const params = { key, code: key.length === 1 ? `Key${upper}` : key, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode, text: key.length === 1 ? String(text ?? key) : '' };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params, text: undefined });
}
async function pageState(cdp) {
  return evalExpr(cdp, `(() => {
    const promptTest = window.__nethackPromptTest;
    return {
      status: window.__nethackAutomation?.state?.().status || '',
      running: window.__nethackAutomation?.state?.().runningState?.running || false,
      mode: window.__nethackAutomation?.state?.().runningState?.mode || '',
      pid: window.__nethackAutomation?.state?.().runningState?.pid || 0,
      shimEventCount: window.__nethackAutomation?.state?.().shimEventCount || 0,
      mapWindowId: window.__nethackAutomation?.state?.().mapWindowId || null,
      gameOverOpen: document.getElementById('game-over-dialog').open,
      characterOpen: document.getElementById('character-dialog').open,
      inventory: promptTest?.inventory?.() || { revision: 0, items: [] },
      itemEquipment: promptTest?.itemEquipment?.() || null,
      body: document.body.innerText,
    };
  })()`);
}

(async () => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const electron = require('electron');
  const child = spawn(electron, ['.'], {
    cwd: root,
    env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_SHOW: process.env.NH_ELECTRON_SHOW || '1', NH_ELECTRON_WINDOW_WIDTH: '1200', NH_ELECTRON_WINDOW_HEIGHT: '900' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data.toString(); if (process.env.DEBUG_DEATH_NEW_RANDOM_TEST) process.stderr.write(data); });
  child.stdout.on('data', (data) => { stdout += data.toString(); if (process.env.DEBUG_DEATH_NEW_RANDOM_TEST) process.stdout.write(data); });
  let cdp;
  try {
    const pages = await waitForCdp(20000);
    const page = pages.find((p) => p.type === 'page');
    assert(page, 'CDP page exists');
    cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => evalExpr(cdp, `document.readyState === 'complete' && !!window.__nethackPromptTest && !!window.__nethackAutomation`), 10000);

    const playableRun = (state, previousPid = 0) => state.running && state.pid && state.pid !== previousPid && state.shimEventCount > 0 && state.mapWindowId && /welcome to NetHack/i.test(state.body || '') && !state.gameOverOpen && !state.characterOpen;

    await evalExpr(cdp, `document.getElementById('start-shim')?.click(); true`);
    await waitFor(async () => evalExpr(cdp, `document.getElementById('startup-choice-dialog')?.open || document.getElementById('character-dialog')?.open`), 5000);
    await evalExpr(cdp, `document.getElementById('startup-new-game')?.click(); true`);
    await waitFor(async () => evalExpr(cdp, `document.getElementById('character-dialog')?.open === true`), 5000);
    await evalExpr(cdp, `document.getElementById('player-name').value = ${JSON.stringify(`DeathReset${process.pid}`)}; document.getElementById('confirm-character')?.click(); true`);
    let firstRun;
    try {
      firstRun = await waitFor(async () => {
        const state = await pageState(cdp);
        return playableRun(state) ? state : null;
      }, 20000);
    } catch (error) {
      throw new Error(`${error.message}: ${JSON.stringify(await pageState(cdp))}`);
    }
    await evalExpr(cdp, `document.querySelector('#intro-dialog button')?.click?.(); document.getElementById('inventory-equipment-button')?.click(); true`);
    const firstInventory = await waitFor(async () => {
      const state = await pageState(cdp);
      return state.itemEquipment?.open && state.inventory.revision > 0 && state.itemEquipment.inventoryRevision === state.inventory.revision ? state : null;
    }, 10000);
    const firstInventoryPath = await screenshot(cdp, path.join(evidenceDir, '00-first-run-inventory.png'));
    await evalExpr(cdp, `window.NetHackUxEquipmentScreen.controller.close({ reason: 'death-regression-setup', cancelNative: false }); true`);

    const events = fs.readFileSync(fixturePath, 'utf8').trim().split(/\n+/).map((line) => JSON.parse(line));
    for (const event of events) {
      await evalExpr(cdp, `window.__nethackPromptTest.event(${JSON.stringify({ event })})`);
      await delay(20);
    }
    await waitFor(async () => (await pageState(cdp)).gameOverOpen, 8000);
    const beforePath = await screenshot(cdp, path.join(evidenceDir, '01-game-over-new-game-menu.png'));

    await evalExpr(cdp, `document.getElementById('game-over-new').click(); true`);
    const characterModal = await waitFor(async () => {
      const state = await pageState(cdp);
      return state.characterOpen ? state : null;
    }, 5000);
    await evalExpr(cdp, `document.getElementById('player-name').value = ${JSON.stringify(`DeathResetNext${process.pid}`)}; document.getElementById('confirm-character')?.click(); true`);
    const firstPid = firstRun.pid;
    const secondStarting = await waitFor(async () => {
      const state = await pageState(cdp);
      return state.running && state.pid && state.pid !== firstPid && state.shimEventCount > 0 && !state.gameOverOpen && !state.characterOpen ? state : null;
    }, 20000);
    let earlyInput = null;
    if (!secondStarting.mapWindowId) {
      await pressKey(cdp, 'l');
      await delay(300);
      earlyInput = await pageState(cdp);
      assert.equal(earlyInput.running, true, 'early movement before the dungeon map must not stop the new game');
      assert.equal(earlyInput.pid, secondStarting.pid, 'early blocked movement remains attached to the new shim process');
      assert.match(earlyInput.status, /waiting for dungeon map|dungeon running|reading NetHack/i, 'early movement is blocked or the map continues loading');
    }
    const secondRun = await waitFor(async () => {
      const state = await pageState(cdp);
      return playableRun(state, firstPid) ? state : null;
    }, 20000);
    const afterPath = await screenshot(cdp, path.join(evidenceDir, '02-after-start-random-game-running.png'));
    await evalExpr(cdp, `document.querySelector('#intro-dialog button')?.click?.(); true`);
    await waitFor(async () => evalExpr(cdp, `!document.getElementById('intro-dialog').open`), 5000);
    const dungeonPath = await screenshot(cdp, path.join(evidenceDir, '03-after-begin-descent-dungeon-visible.png'));
    await evalExpr(cdp, `document.getElementById('inventory-equipment-button')?.click(); true`);
    const secondInventory = await waitFor(async () => {
      const state = await pageState(cdp);
      return state.itemEquipment?.open ? state : null;
    }, 10000);
    const secondInventoryPath = await screenshot(cdp, path.join(evidenceDir, '05-new-run-inventory.png'));
    const secondPublicNames = secondInventory.inventory.items.map((item) => item.displayName);
    const visibleSecondNames = secondInventory.body;
    assert.equal(secondInventory.itemEquipment.inventoryRevision, secondInventory.inventory.revision, 'new-game workspace uses the second run authoritative inventory revision');
    assert.equal(secondInventory.itemEquipment.inventoryCount, secondInventory.inventory.items.length, 'new-game workspace row count matches the second run authoritative inventory');
    const secondObjectIds = new Set(secondInventory.inventory.items.map((item) => `object:${item.objectId}`));
    assert(secondObjectIds.has(secondInventory.itemEquipment.selectedStableId), 'new-game workspace selection belongs to the second run inventory');
    assert.doesNotMatch(visibleSecondNames, /inventory revision changed before action execution/i, 'new-game workspace has no stale revision rejection');
    assert.doesNotMatch(visibleSecondNames, /You were killed by|Goodbye .* the /i, 'new-game consequence feed contains no prior-run death messages');
    for (const name of secondPublicNames) assert.match(visibleSecondNames, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `new-game workspace shows second-run item: ${name}`);
    await evalExpr(cdp, `window.NetHackUxEquipmentScreen.controller.close({ reason: 'death-regression-verified', cancelNative: false }); true`);

    const beforeMove = await pageState(cdp);
    await pressKey(cdp, 'l');
    await delay(1000);
    const afterMove = await pageState(cdp);
    const movementPath = await screenshot(cdp, path.join(evidenceDir, '04-after-first-movement-game-still-running.png'));

    fs.writeFileSync(path.join(evidenceDir, 'electron-stdout.log'), stdout);
    fs.writeFileSync(path.join(evidenceDir, 'electron-stderr.log'), stderr);
    const result = { ok: true, firstRun, firstInventory, characterModal, secondStarting, earlyInput, secondRun, secondInventory, beforeMove, afterMove, electronExit: { exitCode: child.exitCode, signalCode: child.signalCode }, screenshots: { firstInventoryPath, beforePath, afterPath, dungeonPath, movementPath, secondInventoryPath }, logs: { stdout: path.join(evidenceDir, 'electron-stdout.log'), stderr: path.join(evidenceDir, 'electron-stderr.log') } };
    fs.writeFileSync(path.join(evidenceDir, 'death-new-random-regression-result.json'), `${JSON.stringify(result, null, 2)}\n`);
    assert.equal(child.exitCode, null, 'Electron process remains alive after first movement in new random game');
    assert.equal(child.signalCode, null, 'Electron process was not signalled after first movement in new random game');
    assert.equal(afterMove.running, true, 'new random game remains running after first movement');
    assert.equal(afterMove.pid, secondRun.pid, 'first movement stays attached to the second shim process');
    assert(afterMove.shimEventCount > beforeMove.shimEventCount, 'first movement produced new shim events');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (cdp) cdp.close();
    child.kill('SIGTERM');
    await delay(250);
    if (!child.killed) child.kill('SIGKILL');
    if (stderr && process.env.DEBUG_DEATH_NEW_RANDOM_TEST) console.error(stderr);
  }
})().catch((error) => { console.error(error); process.exit(1); });
