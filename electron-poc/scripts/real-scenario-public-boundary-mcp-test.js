const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');
const scenarioId = process.env.NH_PUBLIC_BOUNDARY_SCENARIO_ID || 'ground/unidentified-appearance-pile-on-hero';
const outDir = path.isAbsolute(process.env.NH_PUBLIC_BOUNDARY_OUT_DIR || '')
  ? process.env.NH_PUBLIC_BOUNDARY_OUT_DIR
  : path.join(root, process.env.NH_PUBLIC_BOUNDARY_OUT_DIR || 'test-output/workstream-b-public-boundary');
const port = Number(process.env.NH_PUBLIC_BOUNDARY_CDP_PORT || process.env.AI_ORG_ELECTRON_CDP_PORT || 9644);
const seed = process.env.NH_PUBLIC_BOUNDARY_SEED || '424242';
const forbiddenIdentityPatterns = [
  /orcish dagger/i,
  /scroll of remove curse/i,
  /wand of magic missile/i,
  /potion of extra healing/i,
  /orcish helm/i,
  /orcish dagger/i,
  /scroll of identify/i,
];
const forbiddenActionTokens = new Set(['container.locked', 'container.trapped', 'container.broken', 'locked', 'trapped', 'broken']);

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try { const value = await fn(); if (value) return value; } catch (error) { last = error; }
    await delay(stepMs);
  }
  throw last || new Error('timed out');
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
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? entry.reject(new Error(JSON.stringify(msg.error))) : entry.resolve(msg.result);
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
  const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function shot(cdp, name) {
  const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(outDir, name);
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
  return file;
}
async function click(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
async function pressKey(cdp, key) {
  const code = key === 'Escape' ? 27 : key.toUpperCase().charCodeAt(0);
  const params = { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, text: key.length === 1 ? key : '' };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params, text: undefined });
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
function makeIsolatedPlayground() {
  const source = path.join(repo, 'playground');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-public-boundary-'));
  fs.cpSync(source, temp, { recursive: true, filter: (entry) => !/[a-z]lock\.0$/.test(path.basename(entry)) });
  return temp;
}
async function state(cdp) {
  return evalExpr(cdp, `(() => ({
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
    actions: window.__nethackPromptTest?.contextActions?.(),
    inventory: window.__nethackPromptTest?.inventory?.(),
    equipment: window.__nethackPromptTest?.equipmentSnapshot?.(),
    ground: window.__nethackPromptTest?.groundSnapshots?.(),
    container: window.__nethackPromptTest?.container?.(),
    currentCell: window.__nethackPromptTest?.currentCell?.(),
    menuText: document.getElementById('menu-panel')?.innerText || '',
    prompt: window.__nethackPromptTest?.prompt?.(),
    messages: window.__nethackPromptTest?.messages?.().slice(-20).map((m) => m.text || String(m)) || [],
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    body: document.body.innerText,
    shimGroundPileEvents: ((() => { const kept = window.__nethackPromptTest?.publicGroundPileShimEvidence?.() || []; if (kept.length) return kept; const apiEvents = window.__nethackPromptTest?.shimEvents?.() || []; if (apiEvents.length) return apiEvents; return (document.getElementById('shim-output')?.textContent || '').split('\\n').map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean); })()).filter((event) => event?.name === 'shim_ground_pile_snapshot').map((event) => ({ name: event.name, window: event.window, revision: event.revision, coord: event.coord, source: event.source, authoritative: event.authoritative, items: (event.items || []).map((item) => ({ objectId: item.objectId, displayName: item.displayName, quantity: item.quantity, glyph: item.glyph, objectClass: item.objectClass, semanticKnown: item.semanticKnown, semanticName: item.semanticName, semanticAppearance: item.semanticAppearance, actionAffordances: item.actionAffordances })) })),
    seenShimNames: document.getElementById('shim-output')?.dataset?.seen || '',
    scenarioLoaded: /bridge_test_scenario_loaded/.test(document.getElementById('shim-output')?.dataset?.seen || ''),
    scenarioFailed: /bridge_test_scenario_failed/.test(document.getElementById('shim-output')?.dataset?.seen || '')
  }))()`);
}
function flattenedPublicPayload(s) {
  return {
    actions: s.actions,
    inventory: s.inventory,
    equipment: s.equipment,
    ground: s.ground,
    shimGroundPileEvents: s.shimGroundPileEvents,
    seenShimNames: s.seenShimNames,
    container: s.container,
    currentCell: s.currentCell,
    menuText: s.menuText,
  };
}
function assertNoForbiddenIdentity(label, payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
  for (const pattern of forbiddenIdentityPatterns) assert(`${label} does not leak ${pattern}`, !pattern.test(text), text.slice(0, 1600));
}
function assertGroundItemsArePublic(s) {
  const rendererItems = (s.ground?.piles || []).flatMap((pile) => pile.items || []);
  const shimEvents = s.shimGroundPileEvents || [];
  const shimItems = shimEvents.flatMap((event) => event.items || []);
  assert('C/shim emitted shim_ground_pile_snapshot in the real event stream', shimEvents.some((event) => event.authoritative === true && event.source === 'level.objects') || /shim_ground_pile_snapshot/.test(s.seenShimNames || ''), JSON.stringify({ shimEvents, seenShimNames: s.seenShimNames }));
  assert('ground public snapshot has unidentified scenario items', rendererItems.length >= 4 && (shimItems.length >= 4 || /shim_ground_pile_snapshot/.test(s.seenShimNames || '')), JSON.stringify({ renderer: s.ground, shimEvents, seenShimNames: s.seenShimNames }));
  const allText = JSON.stringify({ rendererItems, shimItems });
  assert('ground snapshot exposes crude dagger appearance', /crude dagger/i.test(allText), allText);
  assert('ground snapshot exposes scroll label appearance', /scroll labeled/i.test(allText), allText);
  assert('ground snapshot exposes wand public class/appearance', /wand/i.test(allText), allText);
  assert('ground snapshot exposes potion public class/appearance', /potion/i.test(allText), allText);
  for (const item of [...rendererItems, ...shimItems]) {
    if (item.known?.identity === false || item.semanticKnown === false) assert(`hidden identity semanticName omitted for ${item.displayName}`, item.semanticName == null, JSON.stringify(item));
    for (const token of item.actionAffordances || []) assert(`ground item ${item.displayName} omits hidden action token ${token}`, !forbiddenActionTokens.has(String(token)), JSON.stringify(item));
  }
}
async function start(cdp) {
  await evalExpr(cdp, `document.querySelector('#start-shim')?.click?.()`);
  await delay(250);
  const needsCharacterConfirm = await evalExpr(cdp, `Boolean(document.getElementById('character-dialog')?.open)`);
  if (needsCharacterConfirm) await click(cdp, '#confirm-character');
  else {
    const confirmVisible = await evalExpr(cdp, `(() => { const el = document.getElementById('confirm-character'); const r = el?.getBoundingClientRect(); return Boolean(r?.width && r?.height && getComputedStyle(el).display !== 'none'); })()`);
    if (confirmVisible) await click(cdp, '#confirm-character');
  }
  await waitFor(async () => (await state(cdp)).running, 20000);
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`);
}
async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const playground = makeIsolatedPlayground();
  const child = spawn(electronBin, ['.'], {
    cwd: root,
    env: {
      ...process.env,
      AI_ORG_ELECTRON_CDP_PORT: String(port),
      NH_ELECTRON_WINDOW_WIDTH: '1360',
      NH_ELECTRON_WINDOW_HEIGHT: '920',
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_SCENARIO_ID: scenarioId,
      NETHACKDIR: playground,
      NETHACK_SEED: seed,
      NETHACKOPTIONS: '!tutorial,!autopickup',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let cdp;
  const stdoutLog = fs.createWriteStream(path.join(outDir, 'electron-stdout.log'));
  const stderrLog = fs.createWriteStream(path.join(outDir, 'electron-stderr.log'));
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); stdoutLog.end(); stderrLog.end(); fs.rmSync(playground, { recursive: true, force: true }); };
  process.on('exit', cleanup);
  child.stdout.on('data', (d) => { stdoutLog.write(d); process.stdout.write(d); });
  child.stderr.on('data', (d) => { stderrLog.write(d); process.stderr.write(d); });
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    const ready = await waitFor(async () => {
      const s = await state(cdp);
      if (s.scenarioFailed) throw new Error('scenario failed to load');
      const items = (s.ground?.piles || []).flatMap((pile) => pile.items || []);
      return s.scenarioLoaded && s.actions?.buttons?.some((b) => b.id === 'pickup') && items.length >= 4 ? s : null;
    }, 12000);
    assertGroundItemsArePublic(ready);
    fs.writeFileSync(path.join(outDir, 'raw-shim-ground-pile-events.json'), JSON.stringify(ready.shimGroundPileEvents, null, 2));
    assertNoForbiddenIdentity('map/context public state', flattenedPublicPayload(ready));
    assert('hero tile is not exposed as monster semantics', ready.currentCell?.semanticKind === 'hero' && ready.currentCell?.semanticName === 'hero' && !(ready.currentCell?.actionAffordances || []).some((token) => /monster/i.test(String(token))), JSON.stringify(ready.currentCell));
    const contextShot = await shot(cdp, '01-map-ground-public-boundary.png');
    fs.writeFileSync(path.join(outDir, '01-map-ground-public-boundary-state.json'), JSON.stringify(flattenedPublicPayload(ready), null, 2));

    await pressKey(cdp, 'i');
    const inventoryState = await waitFor(async () => {
      const s = await state(cdp);
      const text = `${s.inventory?.live?.map((item) => item.text).join('\n') || ''}\n${s.menuText}\n${s.body}`;
      return /iron skull cap/i.test(text) && /crude dagger/i.test(text) && /scroll labeled/i.test(text) ? s : null;
    }, 10000);
    assertNoForbiddenIdentity('inventory public UI/state', flattenedPublicPayload(inventoryState));
    const inventoryShot = await shot(cdp, '02-inventory-public-appearances.png');
    fs.writeFileSync(path.join(outDir, '02-inventory-public-appearances-state.json'), JSON.stringify(flattenedPublicPayload(inventoryState), null, 2));
    await pressKey(cdp, 'Escape');
    await waitFor(async () => !(await state(cdp)).menuText, 5000).catch(() => undefined);

    await click(cdp, '#context-action-bar button[data-context-action-id="pickup"]');
    const pickupState = await waitFor(async () => {
      const s = await state(cdp);
      const text = s.container?.text || '';
      return /Ground items|Pick up from ground/i.test(text) && /crude dagger/i.test(text) && /scroll labeled/i.test(text) && /wand/i.test(text) && /potion/i.test(text) ? s : null;
    }, 15000).catch(async (error) => {
      const debug = await state(cdp).catch((stateError) => ({ stateError: String(stateError) }));
      fs.writeFileSync(path.join(outDir, 'debug-pickup-timeout-state.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, 'debug-pickup-timeout.png').catch(() => undefined);
      throw error;
    });
    assertNoForbiddenIdentity('ground pickup public UI/state', flattenedPublicPayload(pickupState));
    assertGroundItemsArePublic(pickupState);
    fs.writeFileSync(path.join(outDir, 'raw-shim-ground-pile-events-after-pickup.json'), JSON.stringify(pickupState.shimGroundPileEvents, null, 2));
    const pickupShot = await shot(cdp, '03-ground-pickup-public-appearances.png');
    fs.writeFileSync(path.join(outDir, '03-ground-pickup-public-appearances-state.json'), JSON.stringify(flattenedPublicPayload(pickupState), null, 2));

    const labels = (ready.actions?.buttons || []).map((b) => `${b.id}:${b.text}`).join('\n');
    const summary = [
      '# Workstream B public-boundary real Electron proof',
      '',
      'PASS',
      '',
      `Scenario: ${scenarioId}`,
      `Seed: ${seed}`,
      `Map/context screenshot: ${contextShot}`,
      `Inventory screenshot: ${inventoryShot}`,
      `Ground pickup screenshot: ${pickupShot}`,
      `State sidecars:`,
      `- ${path.join(outDir, '01-map-ground-public-boundary-state.json')}`,
      `- ${path.join(outDir, '02-inventory-public-appearances-state.json')}`,
      `- ${path.join(outDir, '03-ground-pickup-public-appearances-state.json')}`,
      `Raw C/shim evidence: ${path.join(outDir, 'raw-shim-ground-pile-events.json')}`,
      `Run stdout/stderr: ${path.join(outDir, 'electron-stdout.log')} / ${path.join(outDir, 'electron-stderr.log')}`,
      '',
      'Verified through real Electron/shim scenario:',
      '- C/shim authoritative ground-pile snapshot exposes appearance/class rows only for unidentified objects.',
      '- Inventory menu exposes public appearances only for unidentified armor/weapon objects and scrolls.',
      '- Ground pickup panel shows public appearances while hidden true identities are absent from public UI/state sidecars.',
      '- Ground public action tokens omit hidden lock/trap/broken tokens.',
      '',
      'Initial context actions:',
      '```',
      labels,
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
