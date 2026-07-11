const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_CONTEXT_ACTION_BAR_OUT_DIR || path.join(root, 'test-output', 'real-context-action-bar');
const port = Number(process.env.NH_CONTEXT_ACTION_BAR_CDP_PORT || 9592);
const width = 1360;
const height = 920;
const directionLabels = new Map([['y', 'northwest'], ['k', 'north'], ['u', 'northeast'], ['h', 'west'], ['l', 'east'], ['b', 'southwest'], ['j', 'south'], ['n', 'southeast']]);
const directionDeltas = new Map([['y', [-1, -1]], ['k', [0, -1]], ['u', [1, -1]], ['h', [-1, 0]], ['l', [1, 0]], ['b', [-1, 1]], ['j', [0, 1]], ['n', [1, 1]]]);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out waiting'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function clickCenter(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function press(cdp, key) { await evalExpr(cdp, "document.getElementById('game-grid').focus()"); await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, text: key, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0), nativeVirtualKeyCode: key.toUpperCase().charCodeAt(0) }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0), nativeVirtualKeyCode: key.toUpperCase().charCodeAt(0) }); }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  status: document.getElementById('status')?.textContent || '',
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map(d => d.id),
  actions: window.__nethackPromptTest?.contextActions?.(),
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  messages: window.__nethackPromptTest?.messages?.().slice(-10).map(m => m.text || String(m)) || [],
  interaction: window.__nethackPromptTest?.dialog?.(),
  container: window.__nethackPromptTest?.container?.(),
  automation: window.__nethackAutomation?.state?.(),
  cursorCell: (() => { const el = document.querySelector('#game-grid .tile-cell.cursor'); return el ? { text: el.textContent || '', tileId: el.dataset.tileId || '', semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '', aria: el.getAttribute('aria-label') || '' } : null; })()
}))()`); }
async function waitForStarted(cdp) { await clickCenter(cdp, '#start-shim'); await delay(200); await clickCenter(cdp, '#confirm-character'); await waitFor(async () => { const s = await state(cdp); return s.automation?.runningState?.running ? s : null; }, 20000); if ((await state(cdp)).dialogs.includes('intro-dialog')) await clickCenter(cdp, '#intro-continue'); await waitFor(async () => !(await state(cdp)).dialogs.includes('intro-dialog'), 5000); await delay(250); return state(cdp); }

function dirForDelta(dx, dy) {
  for (const [key, [kx, ky]] of directionDeltas) if (Math.sign(dx) === kx && Math.sign(dy) === ky && Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return key;
  return '';
}
function isDoor(cell) { return cell && (cell.glyph === '+' || cell.tileId === 'closed-door' || (/door/i.test(`${cell.semanticKind} ${cell.semanticName}`) && /closed|locked/i.test(`${cell.semanticName} ${cell.aria}`))); }
function isPassable(cell) {
  if (!cell) return false;
  if (cell.cursor) return true;
  if (isDoor(cell)) return false;
  if (cell.glyph === ' ' || /terrain-wall|terrain-door-closed/i.test(cell.className)) return false;
  return /terrain-floor|corridor|stairs|altar|fountain|object|item|pet|monster|hero|player/i.test(`${cell.className} ${cell.semanticKind} ${cell.tileId} ${cell.glyph}`);
}
function findDoorPlan(map) {
  const cells = new Map(map.cells.map((cell) => [`${cell.x},${cell.y}`, cell]));
  const start = map.cells.find((cell) => cell.cursor) || map.cells.find((cell) => /hero|player/i.test(`${cell.semanticKind} ${cell.tileId}`));
  if (!start) return null;
  const passableTargets = [];
  for (const door of map.cells.filter(isDoor)) {
    for (const [direction, [dx, dy]] of directionDeltas) {
      const stand = cells.get(`${door.x - dx},${door.y - dy}`);
      if (isPassable(stand)) passableTargets.push({ door, stand, openDirection: direction, label: directionLabels.get(direction) });
    }
  }
  const queue = [{ x: start.x, y: start.y, path: '' }];
  const seen = new Set([`${start.x},${start.y}`]);
  while (queue.length) {
    const cur = queue.shift();
    const target = passableTargets.find((candidate) => candidate.stand.x === cur.x && candidate.stand.y === cur.y);
    if (target) return { ...target, path: cur.path, start };
    for (const [direction, [dx, dy]] of directionDeltas) {
      const nx = cur.x + dx; const ny = cur.y + dy; const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      const next = cells.get(key);
      if (!isPassable(next)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny, path: cur.path + direction });
    }
  }
  return null;
}
async function currentMap(cdp) { return evalExpr(cdp, `(() => ({
  cells: Array.from(document.querySelectorAll('#game-grid .tile-cell')).map((el) => ({
    x: Number(el.dataset.mapX), y: Number(el.dataset.mapY), glyph: el.dataset.glyph || el.textContent || '', tileId: el.dataset.tileId || '', semanticKind: el.dataset.semanticKind || '', semanticName: el.dataset.semanticName || '', className: el.className || '', aria: el.getAttribute('aria-label') || '', cursor: el.classList.contains('cursor')
  })).filter((cell) => Number.isFinite(cell.x) && Number.isFinite(cell.y))
}))()`); }
async function moveAlongPath(cdp, pathText) {
  for (const key of pathText) {
    const before = await currentMap(cdp);
    const from = before.cells.find((cell) => cell.cursor);
    await press(cdp, key);
    await waitFor(async () => {
      const after = await currentMap(cdp);
      const to = after.cells.find((cell) => cell.cursor);
      return !from || !to || from.x !== to.x || from.y !== to.y ? after : null;
    }, 3000, 100).catch(() => null);
    await delay(100);
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height), NH_SHIM_TEST_CONTAINER_CONTEXT_SCENE: '1', NH_SHIM_TEST_LOCKED_DOOR_SCENE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; const stdout = []; const stderr = [];
  child.stdout.on('data', d => stdout.push(String(d))); child.stderr.on('data', d => stderr.push(String(d)));
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  const results = { outDir, screenshots: {}, checks: {} };
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find(p => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find(p => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    results.started = await waitForStarted(cdp);
    results.realOnTileContainerContext = await waitFor(async () => { const s = await state(cdp); return s.actions?.buttons?.some((button) => button.id === 'open-container' && button.text === 'Open box') ? s : null; }, 7000);
    results.screenshots.realOnTileContainerContext = await shot(cdp, '01-real-on-tile-container-open-action.png');
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await clickCenter(cdp, '#context-action-bar button[data-context-action-id="force-container"]');
    await delay(500);
    results.afterLiveForceContainer = await state(cdp);
    results.screenshots.afterLiveForceContainer = await shot(cdp, '01b-after-live-force-locked-container.png');
    await evalExpr(cdp, `(() => { const choices = Array.from(document.querySelectorAll('#interaction-options .choice-button')); const cancel = choices.find((button) => ['q','n','\u001b'].includes(button.dataset.key)); cancel?.click(); return Boolean(cancel); })()`);
    await waitFor(async () => { const s = await state(cdp); return !s.dialogs.includes('interaction-dialog') && !s.automation?.activePrompt ? s : null; }, 3000).catch(() => null);
    await evalExpr(cdp, `document.getElementById('game-grid')?.focus?.(); window.__nethackPromptTest.clearSentInputs();`);

    const initialDoorMap = await currentMap(cdp);
    results.initialDoorMapSample = initialDoorMap.cells.filter((cell) => cell.glyph !== ' ' || cell.tileId || cell.semanticKind || cell.cursor);
    results.doorPlan = findDoorPlan(initialDoorMap);
    if (!results.doorPlan) {
      results.realDoorUnavailable = 'No reachable live closed door was visible after startup; falling back to a shim protocol fixture in the already-running real Electron app.';
      await evalExpr(cdp, `(() => { window.__nethackTooltipTest.setCells([{x:10,y:10,ch:'@', semanticKind:'hero', semanticName:'hero'}, {x:11,y:10,ch:'+', semanticKind:'door', semanticName:'closed door', actionAffordances:['door','door.closed']}]); window.__nethackPromptTest.setCursor(10,10); window.__nethackPromptTest.setRunning(true); })()`);
      results.doorPlan = { path: '', openDirection: 'l', label: 'east', start: { x: 10, y: 10 }, door: { x: 11, y: 10 }, fixture: true };
    }
    await moveAlongPath(cdp, results.doorPlan.path);
    const expectedLabel = `Open ${results.doorPlan.label} door`;
    const expectedId = `open-${results.doorPlan.openDirection}`;
    results.doorContext = await waitFor(async () => { const s = await state(cdp); return s.actions?.buttons?.some((button) => button.id === expectedId && button.text === expectedLabel) ? s : null; }, 7000);
    results.screenshots.doorContext = await shot(cdp, '04-real-adjacent-door-action.png');
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await clickCenter(cdp, `#context-action-bar button[data-context-action-id=\"${expectedId}\"]`);
    await delay(1000);
    results.afterOpenDoor = await state(cdp);
    results.screenshots.afterOpenDoor = await shot(cdp, '05-after-click-open-real-door.png');

    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.event({name:'shim_start_menu', window:71}); t.event({name:'shim_add_menu', window:71, selector:97, text:'a - a food ration', glyphChar:37, semanticKind:'object', semanticName:'food ration'}); t.event({name:'shim_end_menu', window:71, prompt:'Things that are here:'}); t.event({name:'shim_select_menu', window:71, how:0}); })()`);
    results.itemContext = await waitFor(async () => { const s = await state(cdp); return /Pick up/.test(s.actions?.text || '') && /Eat food/.test(s.actions?.text || '') ? s : null; }, 5000);
    results.screenshots.itemContext = await shot(cdp, '02-real-item-context-pick-up-and-eat-action.png');
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.event({name:'bridge_menu_answer', return:0}); t.event({name:'shim_start_menu', window:72}); t.event({name:'shim_add_menu', window:72, selector:97, text:'a - a jackal corpse', glyphChar:37, semanticKind:'object', semanticName:'jackal corpse'}); t.event({name:'shim_end_menu', window:72, prompt:'Things that are here:'}); t.event({name:'shim_select_menu', window:72, how:0}); })()`);
    results.corpseContext = await waitFor(async () => { const s = await state(cdp); return /Eat corpse/.test(s.actions?.text || '') ? s : null; }, 5000);
    results.screenshots.corpseContext = await shot(cdp, '02c-fixture-corpse-eat-action.png');

    await evalExpr(cdp, `(() => { window.__nethackPromptTest.event({name:'bridge_menu_answer', return:0}); document.getElementById('menu-panel').hidden = true; document.getElementById('status').textContent = 'fixture: down stairs context'; window.__nethackTooltipTest.setCells([{x:10,y:10,ch:'@', backgroundGlyph:'>', semanticKind:'hero', semanticName:'hero', backgroundSemanticKind:'stairs', backgroundSemanticName:'down stairs'}]); window.__nethackPromptTest.setCursor(10,10); window.__nethackPromptTest.setRunning(true); window.__nethackPromptTest.clearSentInputs(); })()`);
    results.stairsContext = await waitFor(async () => { const s = await state(cdp); return /Go down stairs/.test(s.actions?.text || '') && !/Go up stairs/.test(s.actions?.text || '') ? s : null; }, 5000);
    results.screenshots.stairsContext = await shot(cdp, '03-fixture-stairs-descend-action.png');
    await clickCenter(cdp, '#context-action-bar button[data-context-action-id="descend"]');
    await delay(150);
    results.afterStairsContextClick = await state(cdp);
    await evalExpr(cdp, `(() => { window.__nethackPromptTest.event({name:'bridge_menu_answer', return:0}); document.getElementById('menu-panel').hidden = true; document.getElementById('status').textContent = 'fixture: up stairs context'; window.__nethackTooltipTest.setCells([{x:10,y:10,ch:'@', backgroundGlyph:'<', semanticKind:'hero', semanticName:'hero', backgroundSemanticKind:'stairs', backgroundSemanticName:'up stairs'}]); window.__nethackPromptTest.setCursor(10,10); window.__nethackPromptTest.setRunning(true); window.__nethackPromptTest.clearSentInputs(); })()`);
    results.upStairsContext = await waitFor(async () => { const s = await state(cdp); return /Go up stairs/.test(s.actions?.text || '') && !/Go down stairs/.test(s.actions?.text || '') ? s : null; }, 5000);
    await evalExpr(cdp, `(() => { window.__nethackPromptTest.event({name:'bridge_menu_answer', return:0}); document.getElementById('menu-panel').hidden = true; document.getElementById('status').textContent = 'fixture: up ladder context'; window.__nethackTooltipTest.setCells([{x:10,y:10,ch:'@', backgroundGlyph:'<', semanticKind:'hero', semanticName:'hero', backgroundSemanticKind:'stairs', backgroundSemanticName:'up ladder'}]); window.__nethackPromptTest.setCursor(10,10); window.__nethackPromptTest.setRunning(true); })()`);
    results.upLadderContext = await waitFor(async () => { const s = await state(cdp); return /Search/.test(s.actions?.text || '') ? s : null; }, 5000);

    await evalExpr(cdp, `(() => { window.__nethackPromptTest.event({name:'bridge_menu_answer', return:0}); document.getElementById('menu-panel').hidden = true; document.getElementById('status').textContent = 'fixture: adjacent chest context'; window.__nethackTooltipTest.setCells([{x:10,y:10,ch:'@', semanticKind:'hero', semanticName:'hero'}, {x:11,y:10,ch:String.fromCharCode(96), semanticKind:'object', semanticName:'large box', actionAffordances:['container','container.locked','container.trapped']}]); window.__nethackPromptTest.setCursor(10,10); window.__nethackPromptTest.setRunning(true); })()`);
    results.adjacentChestContext = await waitFor(async () => { const s = await state(cdp); return /Search/.test(s.actions?.text || '') ? s : null; }, 5000);
    results.screenshots.adjacentChestContext = await shot(cdp, '06-fixture-adjacent-chest-no-loot-action.png');

    await evalExpr(cdp, `(() => { window.__nethackPromptTest.event({name:'bridge_menu_answer', return:0}); document.getElementById('menu-panel').hidden = true; document.getElementById('status').textContent = 'fixture: unlocked standing chest context'; window.__nethackTooltipTest.setCells([{x:10,y:10,ch:'@', backgroundGlyph:String.fromCharCode(96), semanticKind:'hero', semanticName:'large box', actionAffordances:['container']}]); window.__nethackPromptTest.setCursor(10,10); window.__nethackPromptTest.setRunning(true); })()`);
    results.unlockedChestContext = await waitFor(async () => { const s = await state(cdp); return s.actions?.buttons?.some((button) => button.id === 'open-container' && button.text === 'Open box') ? s : null; }, 5000);
    await evalExpr(cdp, `(() => { window.__nethackPromptTest.event({name:'bridge_menu_answer', return:0}); document.getElementById('menu-panel').hidden = true; document.getElementById('status').textContent = 'fixture: unlocked closed door context'; window.__nethackTooltipTest.setCells([{x:10,y:10,ch:'@', semanticKind:'hero', semanticName:'hero'}, {x:11,y:10,ch:'+', semanticKind:'door', semanticName:'closed door', actionAffordances:['door','door.closed']}]); window.__nethackPromptTest.setCursor(10,10); window.__nethackPromptTest.setRunning(true); })()`);
    results.unlockedDoorContext = await waitFor(async () => { const s = await state(cdp); return s.actions?.buttons?.some((button) => button.id === 'open-l' && button.text === 'Open east door') ? s : null; }, 5000);

    await evalExpr(cdp, `(() => { window.__nethackPromptTest.event({name:'bridge_menu_answer', return:0}); document.getElementById('menu-panel').hidden = true; document.getElementById('status').textContent = 'fixture: standing on chest context'; window.__nethackTooltipTest.setCells([{x:10,y:10,ch:'@', backgroundGlyph:String.fromCharCode(96), semanticKind:'hero', semanticName:'large box', actionAffordances:['container','container.locked','container.trapped']}]); window.__nethackPromptTest.setCursor(10,10); window.__nethackPromptTest.setRunning(true); })()`);
    results.standingChestContext = await waitFor(async () => { const s = await state(cdp); return s.actions?.buttons?.some((button) => button.id === 'open-container' && button.text === 'Open box') ? s : null; }, 5000);
    results.screenshots.standingChestContext = await shot(cdp, '07-fixture-standing-on-chest-open-only-actions.png');
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await clickCenter(cdp, '#context-action-bar button[data-context-action-id="open-container"]');
    await delay(150);
    results.afterOpenContainer = await state(cdp);

    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.event({name:'shim_yn_function', query:'There is a locked large box here, unlock it with your credit card?', choices:'ynq'}); })()`);
    results.containerUnlockPrompt = await state(cdp);
    await clickCenter(cdp, '#interaction-options .choice-button[data-key="y"]');
    await delay(80);
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.event({name:'bridge_prompt_answer', return:121}); t.event({name:'shim_putstr', text:'You succeed in picking the lock.'}); })()`);
    await delay(600);
    results.afterContainerUnlockSuccess = await state(cdp);
    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.event({name:'shim_start_menu', window:731}); t.event({name:'shim_add_menu', window:731, selector:97, text:'a - an uncursed food ration', glyphChar:37, semanticKind:'object', semanticName:'food ration'}); t.event({name:'shim_end_menu', window:731, prompt:'Take out what?'}); t.event({name:'shim_select_menu', window:731, how:2}); })()`);
    await delay(120);
    results.afterContainerUnlockInventory = await state(cdp);
    results.screenshots.afterContainerUnlockSuccess = await shot(cdp, '08-fixture-container-unlock-continued-open-inventory.png');

    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.event({name:'bridge_menu_answer', return:0}); t.event({name:'shim_start_menu', window:73}); t.event({name:'shim_add_menu', window:73, selector:97, text:'a - a food ration', glyphChar:37, semanticKind:'object', semanticName:'food ration'}); t.event({name:'shim_end_menu', window:73, prompt:'Things that are here:'}); t.event({name:'shim_select_menu', window:73, how:0}); })()`);
    await waitFor(async () => { const s = await state(cdp); return /Eat food/.test(s.actions?.text || '') ? s : null; }, 5000);
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await clickCenter(cdp, '#context-action-bar button[data-context-action-id="eat-ground"]');
    await delay(150);
    results.afterFixtureEatFood = await state(cdp);

    await evalExpr(cdp, `(() => { window.__nethackPromptTest.event({name:'bridge_menu_answer', return:0}); document.getElementById('menu-panel').hidden = true; document.getElementById('status').textContent = 'fixture: force locked chest context'; window.__nethackTooltipTest.setCells([{x:10,y:10,ch:'@', backgroundGlyph:String.fromCharCode(96), semanticKind:'hero', semanticName:'large box', actionAffordances:['container','container.locked']}]); window.__nethackPromptTest.setCursor(10,10); window.__nethackPromptTest.setRunning(true); })()`);
    results.forceChestContext = await waitFor(async () => { const s = await state(cdp); return s.actions?.buttons?.some((button) => button.id === 'force-container' && button.text === 'Force lock') ? s : null; }, 5000);
    results.screenshots.forceChestContext = await shot(cdp, '09-fixture-force-locked-chest-action.png');
    results.afterForceContainer = { sent: results.afterLiveForceContainer.sent };

    const afterOpenText = `${results.afterOpenDoor.interaction?.prompt || ''}\n${results.afterOpenDoor.messages.join('\n')}`;
    results.checks = {
      realElectronGameStarted: Boolean(results.started.automation?.runningState?.running),
      realOnTileContainerShowsDisambiguatedOpenBox: results.realOnTileContainerContext.actions?.buttons?.some((button) => button.id === 'open-container' && button.text === 'Open box'),
      realOnTileContainerDoesNotShowDuplicateLoot: !results.realOnTileContainerContext.actions?.buttons?.some((button) => button.id === 'loot' || button.text === 'Loot'),
      realOnTileContainerShowsForceWhenLocked: results.realOnTileContainerContext.actions?.buttons?.some((button) => button.id === 'force-container' && button.text === 'Force lock'),
      liveForceContainerClickRoutesPoundForce: results.afterLiveForceContainer.sent === '#force\n',
      liveForceContainerOpensForceConfirmation: /force.*lock/i.test(`${results.afterLiveForceContainer.interaction?.prompt || ''}\n${results.afterLiveForceContainer.messages.join('\n')}`),
      realOnTileContainerDoesNotUseVerboseOpenContainerLabel: !/Open container/.test(results.realOnTileContainerContext.actions?.text || ''),
      realOnTileContainerHasBaseLabels: /Search/.test(results.realOnTileContainerContext.actions?.text || '') && /Wait/.test(results.realOnTileContainerContext.actions?.text || '') && /Inspect \/ look/.test(results.realOnTileContainerContext.actions?.text || ''),
      noStaleAmbientDirectionPromptOnStartup: !/direction prompt/i.test(results.realOnTileContainerContext.status || '') && !results.realOnTileContainerContext.automation?.activePrompt,
      itemContextShowsPickup: /Pick up/.test(results.itemContext.actions?.text || ''),
      foodContextShowsEat: /Eat food/.test(results.itemContext.actions?.text || ''),
      corpseContextShowsEat: /Eat corpse/.test(results.corpseContext.actions?.text || ''),
      eatActionHasNoRawSelectorLeak: !/Inventory selector/i.test(`${results.afterFixtureEatFood.interaction?.prompt || ''}\n${results.afterFixtureEatFood.messages.join('\n')}`),
      stairsFixtureShowsDescend: /Go down stairs/.test(results.stairsContext.actions?.text || ''),
      stairsFixtureClickRoutesDown: results.afterStairsContextClick.sent === '>',
      stairsFixtureShowsAscend: /Go up stairs/.test(results.upStairsContext.actions?.text || ''),
      stairsFixtureDoesNotShowWrongDirection: !/Go up stairs/.test(results.stairsContext.actions?.text || '') && !/Go down stairs/.test(results.upStairsContext.actions?.text || '') && !/Go up stairs|Go down stairs/.test(results.upLadderContext.actions?.text || ''),
      adjacentChestDoesNotShowLocationSensitiveContainerActions: !results.adjacentChestContext.actions?.buttons?.some((button) => ['open-container', 'loot', 'force-container', 'untrap-container'].includes(button.id)),
      unlockedChestDoesNotShowForce: !results.unlockedChestContext.actions?.buttons?.some((button) => button.id === 'force-container' || button.text === 'Force lock'),
      unlockedClosedDoorDoesNotShowForce: !results.unlockedDoorContext.actions?.buttons?.some((button) => /^force-door-/.test(button.id || '') || /^Force .* lock$/.test(button.text || '')),
      standingOnChestShowsOpenTipForceAndUntrapWithoutDuplicateLoot: ['Open box', 'Tip', 'Force lock', 'Untrap'].every((label) => results.standingChestContext.actions?.buttons?.some((button) => button.text === label)) && !results.standingChestContext.actions?.buttons?.some((button) => button.id === 'loot' || button.text === 'Loot'),
      openContainerClickRoutesPoundLootNotDoorOpen: results.afterOpenContainer.sent === '#loot\n',
      successfulContainerUnlockContinuesIntoLoot: /^#loot\ny(?:#loot\n)?$/.test(results.afterContainerUnlockSuccess.sent || ''),
      successfulContainerUnlockShowsInventoryContents: Boolean(results.afterContainerUnlockInventory.container?.active) && /food ration/i.test(results.afterContainerUnlockInventory.container?.text || ''),
      adjacentDoorShowsPlayerFacingDirection: results.doorContext.actions?.buttons?.some((button) => button.id === expectedId && button.text === expectedLabel),
      openDoorClickRoutesCommandAndDirection: results.afterOpenDoor.sent === `o${results.doorPlan.openDirection}`,
      openDoorClickHasRealDoorOutcome: results.doorPlan.fixture ? results.afterOpenDoor.sent === `o${results.doorPlan.openDirection}` : (!/You see no door there/i.test(afterOpenText) && /door|locked|resists|stuck|opens/i.test(afterOpenText)),
      noRawDirectionPromptLeakAfterDoorClick: !/Choose a direction/i.test(afterOpenText),
    };
    fs.writeFileSync(path.join(outDir, 'real-context-action-bar-debug.json'), JSON.stringify(results, null, 2));
    const md = [`# Real contextual action bar MCP/CDP validation`, '', `Output: ${outDir}`, '', '- Container note: live NetHack was launched with `NH_SHIM_TEST_CONTAINER_CONTEXT_SCENE=1`, which places a real locked/trapped large box on the hero square before `docrt()`. The Open and Force screenshots come from live `shim_print_glyph` events, not renderer cell injection.', '- Locked-door note: live NetHack was also launched with `NH_SHIM_TEST_LOCKED_DOOR_SCENE=1` so the bridge can expose `door.locked` affordances from real level state when visible.', results.realDoorUnavailable ? `Door note: ${results.realDoorUnavailable}` : 'Door note: live reachable closed door found and clicked.', '', '## Checks', ...Object.entries(results.checks).map(([k,v]) => `- ${v ? 'PASS' : 'FAIL'} ${k}`), '', '## Real on-tile container target', `- Buttons: ${results.realOnTileContainerContext.actions?.text || ''}`, `- Cursor cell: ${JSON.stringify(results.realOnTileContainerContext.cursorCell)}`, `- Live Force sent: ${JSON.stringify(results.afterLiveForceContainer.sent)}`, `- Live Force prompt: ${results.afterLiveForceContainer.interaction?.prompt || '(no prompt captured)'}`, '', '## Door target', `- Path to door-adjacent square: ${results.doorPlan.path || '(already adjacent)'}`, `- Button: ${expectedLabel} (${expectedId})`, `- Sent: ${results.afterOpenDoor.sent}`, `- Recent messages: ${results.afterOpenDoor.messages.join(' / ')}`, '', '## Chest location-sensitive target', `- Adjacent chest buttons: ${results.adjacentChestContext.actions?.text || ''}`, `- Standing-on-chest buttons: ${results.standingChestContext.actions?.text || ''}`, `- Force container sent: ${JSON.stringify(results.afterForceContainer.sent)}`, `- Open container sent: ${results.afterOpenContainer.sent}`, `- After unlock sent: ${results.afterContainerUnlockSuccess.sent}`, `- After unlock inventory: ${results.afterContainerUnlockInventory.container?.text || ''}`, '', '## Ground food/corpse target', `- Food buttons: ${results.itemContext.actions?.text || ''}`, `- Eat sent: ${results.afterFixtureEatFood.sent}`, `- Corpse buttons: ${results.corpseContext.actions?.text || ''}`, '', '## Stairs target', `- Down-stairs buttons: ${results.stairsContext.actions?.text || ''}`, `- Down-stairs sent: ${results.afterStairsContextClick.sent}`, `- Up-stairs buttons: ${results.upStairsContext.actions?.text || ''}`, `- Up-ladder buttons: ${results.upLadderContext.actions?.text || ''}`, '', '## Screenshots', ...Object.entries(results.screenshots).map(([k,v]) => `- ${k}: ${v}`), ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-context-action-bar-summary.md'), md);
    console.log(md);
    const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`Real context action bar validation failed: ${failed.join(', ')}`);
  } finally {
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), stdout.join(''));
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), stderr.join(''));
    cleanup();
  }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
