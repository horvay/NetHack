const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_SCENARIO_CONTAINER_CONTEXT_OPEN_OUT_DIR || path.join(root, 'test-output', 'real-scenario-container-context-open-lifecycle');
const scenarioId = process.env.NH_SCENARIO_CONTAINER_CONTEXT_OPEN_ID || 'container/locked-chest-unlock-open-context-on-hero';
const port = Number(process.env.NH_SCENARIO_CONTAINER_CONTEXT_OPEN_CDP_PORT || 9639);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 100) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function doubleClick(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await delay(60); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 2 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 2 }); }
async function drag(cdp, fromSelector, toSelector) {
  const points = await evalExpr(cdp, `(() => { const from = document.querySelector(${JSON.stringify(fromSelector)}); const to = document.querySelector(${JSON.stringify(toSelector)}); from?.scrollIntoView?.({block:'center', inline:'center'}); to?.scrollIntoView?.({block:'center', inline:'center'}); const a = from?.getBoundingClientRect(); const b = to?.getBoundingClientRect(); return a && b ? { from:{x:a.left+a.width/2,y:a.top+a.height/2}, to:{x:b.left+b.width/2,y:b.top+b.height/2} } : null; })()`);
  if (!points) throw new Error(`missing drag selectors ${fromSelector} -> ${toSelector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.from.x, y: points.from.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: points.from.x, y: points.from.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 10; i += 1) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.from.x + ((points.to.x - points.from.x) * i / 10), y: points.from.y + ((points.to.y - points.from.y) * i / 10), button: 'left', buttons: 1 });
    await delay(45);
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: points.to.x, y: points.to.y, button: 'left', buttons: 0, clickCount: 1 });
}
async function cdpDragDropPayload(cdp, fromSelector, toSelector) {
  const payload = await evalExpr(cdp, `(() => { const from = document.querySelector(${JSON.stringify(fromSelector)}); const to = document.querySelector(${JSON.stringify(toSelector)}); from?.scrollIntoView?.({block:'center', inline:'center'}); to?.scrollIntoView?.({block:'center', inline:'center'}); const r = to?.getBoundingClientRect(); if (!from || !r) return null; return { x:r.left+r.width/2, y:r.top+r.height/2, data: JSON.stringify({ side: from.dataset.containerSide, selector: from.dataset.selector, itemName: from.dataset.itemName || from.innerText, hasSelector: true }) }; })()`);
  if (!payload) throw new Error(`missing drag payload selectors ${fromSelector} -> ${toSelector}`);
  const data = { items: [{ mimeType: 'application/x-nethack-container-transfer', data: payload.data }, { mimeType: 'application/x-nethack-selector', data: JSON.parse(payload.data).selector || '' }, { mimeType: 'text/plain', data: JSON.parse(payload.data).selector || '' }], dragOperationsMask: 1 };
  await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: payload.x, y: payload.y, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: payload.x, y: payload.y, data });
  await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: payload.x, y: payload.y, data });
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) {
  return evalExpr(cdp, `(() => ({
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
    actions: window.__nethackPromptTest?.contextActions?.(),
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    prompt: window.__nethackPromptTest?.prompt?.() || null,
    messages: window.__nethackPromptTest?.messages?.().slice(-16).map((m) => m.text || String(m)) || [],
    pendingContainerUnlockOpen: window.__nethackPromptTest?.pendingContainerUnlockOpen?.() || null,
    container: window.__nethackPromptTest?.container?.(),
    promptPanel: { hidden: document.getElementById('prompt-panel')?.hidden, text: document.getElementById('prompt-panel')?.textContent || '' },
    menuPanel: { hidden: document.getElementById('menu-panel')?.hidden, text: document.getElementById('menu-panel')?.textContent || '' },
    status: document.getElementById('status')?.textContent || '',
    interaction: window.__nethackPromptTest?.dialog?.(),
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    body: document.body.innerText,
    seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
    shim: document.getElementById('shim-output')?.innerText || ''
  }))()`);
}
async function saveState(cdp, name) { const s = await state(cdp); fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(s, null, 2)); return s; }
function assertStableTransferView(label, s) {
  const visible = `${s.container?.text || ''}\n${s.promptPanel?.hidden ? '' : s.promptPanel?.text || ''}\n${s.menuPanel?.hidden ? '' : s.menuPanel?.text || ''}\n${s.interaction?.interactionOpen ? `${s.interaction.title || ''}\n${s.interaction.prompt || ''}` : ''}`;
  assert(`${label}: container panel remains visible`, s.container?.active && !s.container.hidden, JSON.stringify(s.container));
  assert(`${label}: no full loading placeholder once panes have cached state`, !/Loading your inventory|Loading container contents/i.test(visible), visible.slice(0, 1600));
  assert(`${label}: no wrong intermediate menu visible`, !/Extended command|Equipment\s*\/\s*Inventory|Hero equipment|Choose from the menu|Inventory: Menu/i.test(visible), visible.slice(0, 1600));
}
async function sampleStableTransferView(cdp, label, durationMs = 1100, stepMs = 100) {
  const samples = [];
  const start = Date.now();
  do {
    const s = await state(cdp);
    samples.push({ atMs: Date.now() - start, containerText: s.container?.text || '', promptHidden: s.promptPanel?.hidden, promptText: s.promptPanel?.text || '', menuHidden: s.menuPanel?.hidden, menuText: s.menuPanel?.text || '', interactionOpen: s.interaction?.interactionOpen, interactionTitle: s.interaction?.title || '', status: s.status || '' });
    assertStableTransferView(`${label} sample ${samples.length}`, s);
    await delay(stepMs);
  } while (Date.now() - start < durationMs);
  fs.writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify(samples, null, 2));
  return samples;
}
async function start(cdp) {
  if (await evalExpr(cdp, `Boolean(document.getElementById('startup-choice-dialog')?.open)`)) await click(cdp, '#startup-new-game');
  else await click(cdp, '#start-shim');
  await waitFor(() => evalExpr(cdp, `Boolean(document.getElementById('character-dialog')?.open)`), 7000);
  await evalExpr(cdp, `(() => { const input = document.getElementById('player-name'); if (input && !input.value) { input.value = 'ContainerTester'; input.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
  await waitFor(() => evalExpr(cdp, `!document.getElementById('confirm-character')?.disabled`), 7000);
  await click(cdp, '#confirm-character');
  await waitFor(async () => {
    const s = await state(cdp);
    if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim);
    return s.running ? s : null;
  }, 20000);
  if ((await state(cdp)).dialogs.includes('intro-dialog')) await click(cdp, '#intro-continue');
  await waitFor(async () => !(await state(cdp)).dialogs.includes('intro-dialog'), 5000);
}
function assertCleanContainerOwner(label, s, { requireRightPane = true } = {}) {
  const visibleInteractionText = s.interaction?.interactionOpen ? `${s.interaction?.title || ''}\n${s.interaction?.prompt || ''}` : '';
  const text = `${visibleInteractionText}\n${s.body || ''}\n${s.promptPanel?.text || ''}\n${s.menuPanel?.text || ''}\n${s.status || ''}`;
  const containerText = s.container?.text || '';
  assert(`${label}: container panel remains active`, s.container?.active && !s.container.hidden, JSON.stringify(s.container));
  assert(`${label}: container panel shows actual chest item names`, /Container inventory/i.test(containerText) && /dagger/i.test(containerText) && /food ration/i.test(containerText) && /Your inventory/i.test(containerText) && (!requireRightPane || /skeleton key|tin opener|scroll of identify/i.test(containerText)), containerText);
  assert(`${label}: no extended command modal owns the UI`, !s.interaction?.interactionOpen && !/Extended command|filter\/type any # command|164 matching options|#adjust|#annotate/i.test(text), text.slice(0, 2000));
  assert(`${label}: no normal inventory overlay owns the UI`, !/Equipment\s*\/\s*Inventory|Hero equipment|Inventory: Menu/i.test(text), text.slice(0, 2000));
  assert(`${label}: top prompt/menu chrome is hidden for container ownership`, s.promptPanel?.hidden && s.menuPanel?.hidden && !/Choose from the menu|menu awaiting item selection|Transfer:|Inventory:/i.test(`${s.promptPanel?.text || ''}\n${s.menuPanel?.text || ''}\n${s.status || ''}`), JSON.stringify({ promptPanel: s.promptPanel, menuPanel: s.menuPanel, status: s.status }));
}
async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_SHIM_RESET_LOCKS: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup); child.stdout.on('data', (d) => process.stdout.write(d)); child.stderr.on('data', (d) => process.stderr.write(d));
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    const loaded = await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
    const ready = await waitFor(async () => {
      const s = await state(cdp);
      return s.actions?.buttons?.some((b) => b.id === 'open-container' && b.text === 'Open chest') && s.actions?.buttons?.some((b) => b.id === 'force-container') ? s : null;
    }, 10000);
    const contextShot = await shot(cdp, '00-context-actions-before-open.png');
    assert('locked chest context action is Open chest, not a generic promptless object menu', ready.actions?.buttons?.some((b) => b.id === 'open-container' && b.text === 'Open chest'), ready.actions?.text || '');
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    const openStarted = Date.now();
    await click(cdp, '#context-action-bar button[data-context-action-id="open-container"]');
    const unlockPrompt = await waitFor(async () => {
      const s = await state(cdp);
      const choices = (s.interaction?.options || []).map((option) => option.text || '').join('\n');
      return /Locked chest actions/i.test(s.interaction?.title || '') && /Unlock with skeleton key/i.test(choices) ? s : null;
    }, 5000);
    fs.writeFileSync(path.join(outDir, '01-unlock-prompt-state.json'), JSON.stringify(unlockPrompt, null, 2));
    const unlockShot = await shot(cdp, '01-unlock-prompt.png');
    await evalExpr(cdp, `(() => { const unlock = Array.from(document.querySelectorAll('#interaction-options .choice-button')).find((button) => /Unlock with skeleton key/i.test(button.innerText)); if (!unlock) throw new Error('missing Unlock with skeleton key button'); unlock.click(); })()`);
    const immediate = await waitFor(async () => {
      const s = await state(cdp);
      return s.container?.active && /dagger/i.test(s.container.text || '') && /food ration/i.test(s.container.text || '') ? s : null;
    }, 12000);
    fs.writeFileSync(path.join(outDir, '02-immediate-after-open-state.json'), JSON.stringify(immediate, null, 2));
    const immediateShot = await shot(cdp, '02-immediate-after-open.png');
    assertCleanContainerOwner('immediately after context open', immediate, { requireRightPane: false });
    const readyPanel = await waitFor(async () => {
      const s = await state(cdp);
      return /Both panes loaded/i.test(s.container?.text || '') && /skeleton key|tin opener|scroll of identify/i.test(s.container?.text || '') ? s : null;
    }, 5000);
    const panelReadyAt = Date.now();
    assertCleanContainerOwner('when both panes first finish loading', readyPanel);
    await delay(650);
    const timingWindow = await saveState(cdp, '03-after-wrong-menu-timing-window-state');
    const timingShot = await shot(cdp, '03-after-wrong-menu-timing-window.png');
    assertCleanContainerOwner('after wrong-menu timing window', timingWindow);
    const remaining = Math.max(0, 1050 - (Date.now() - openStarted), 1050 - (Date.now() - panelReadyAt));
    if (remaining) await delay(remaining);
    const afterOneSecond = await saveState(cdp, '04-after-one-second-state');
    const oneSecondShot = await shot(cdp, '04-after-one-second.png');
    assertCleanContainerOwner('after at least one full second', afterOneSecond);
    assert('unlock tool route sends apply, the visible tool selector, current-square direction, and confirmation of the chosen unlock intent', /^af\.y$/.test(afterOneSecond.sent || ''), JSON.stringify({ sent: afterOneSecond.sent }));
    assert('container unlock continuation cleared after successful open', afterOneSecond.pendingContainerUnlockOpen == null, JSON.stringify(afterOneSecond.pendingContainerUnlockOpen));
    const problemText = `${afterOneSecond.messages?.join('\n') || ''}\n${afterOneSecond.body || ''}\n${afterOneSecond.shim || ''}`;
    assert('real context-open lifecycle evidence has no NetHack/internal JS disorder text', !/Program in disorder|Please report these messages|TypeError|ReferenceError|Unhandled|bridge_test_scenario_failed/i.test(problemText), problemText.slice(-2000));
    const beforeTransfer = await saveState(cdp, '05-before-transfer-state');
    const beforeTransferShot = await shot(cdp, '05-before-transfer.png');
    assertStableTransferView('before transfer', beforeTransfer);
    const daggerSelector = beforeTransfer.container?.left?.find((row) => /dagger/i.test(row.text || ''))?.selector;
    assert('dagger row exposes a stable public transfer selector', daggerSelector, JSON.stringify(beforeTransfer.container?.left || []));
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await drag(cdp, `#container-transfer-panel [data-container-pane="left"] .container-item-row[data-selector="${daggerSelector}"]`, '#container-transfer-panel [data-container-pane="right"]');
    const afterFirstTransfer = await waitFor(async () => {
      const s = await state(cdp);
      const leftText = (s.container?.left || []).map((row) => row.text).join('\n');
      const rightText = (s.container?.right || []).map((row) => row.text).join('\n');
      return s.container?.active && !/dagger/i.test(leftText) && /dagger/i.test(rightText) ? s : null;
    }, 12000);
    fs.writeFileSync(path.join(outDir, '06-during-after-first-transfer-state.json'), JSON.stringify(afterFirstTransfer, null, 2));
    const firstTransferShot = await shot(cdp, '06-during-after-first-transfer.png');
    assertStableTransferView('during/after first transfer', afterFirstTransfer);
    const firstTransferSamples = await sampleStableTransferView(cdp, '07-first-transfer-one-second-samples');
    const afterFirstOneSecond = await saveState(cdp, '07-after-first-transfer-one-second-state');
    const firstOneSecondShot = await shot(cdp, '07-after-first-transfer-one-second.png');
    assertStableTransferView('one second after first transfer', afterFirstOneSecond);
    const remainingLeftSelector = afterFirstOneSecond.container?.left?.[0]?.selector;
    assert('one container row remains before empty-container transfer', remainingLeftSelector, JSON.stringify(afterFirstOneSecond.container?.left || []));
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    const remainingRowSelector = `#container-transfer-panel [data-container-pane="left"] .container-item-row[data-selector="${remainingLeftSelector}"]`;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 20 });
    await delay(100);
    await drag(cdp, remainingRowSelector, '#container-transfer-panel [data-container-pane="right"]');
    await delay(600);
    const afterSecondDragAttempt = await state(cdp);
    fs.writeFileSync(path.join(outDir, '08-after-second-drag-attempt-state.json'), JSON.stringify(afterSecondDragAttempt, null, 2));
    if (!(afterSecondDragAttempt.sent || '') && (afterSecondDragAttempt.container?.left || []).length) {
      await cdpDragDropPayload(cdp, remainingRowSelector, '#container-transfer-panel [data-container-pane="right"]').catch(() => undefined);
      await delay(300);
      const afterCdpDragFallback = await state(cdp);
      fs.writeFileSync(path.join(outDir, '08-after-cdp-drag-fallback-state.json'), JSON.stringify(afterCdpDragFallback, null, 2));
      if (!(afterCdpDragFallback.sent || '') && (afterCdpDragFallback.container?.left || []).length) await doubleClick(cdp, remainingRowSelector);
    }
    let emptyFinal;
    try {
      emptyFinal = await waitFor(async () => {
        const s = await state(cdp);
        const leftText = (s.container?.left || []).map((row) => row.text).join('\n');
        const rightText = (s.container?.right || []).map((row) => row.text).join('\n');
        return s.container?.active && !s.container?.pendingTransfer && !(s.container?.left || []).length && /dagger/i.test(rightText) && /food ration/i.test(rightText) && /This container is empty/i.test(s.container?.text || '') ? s : null;
      }, 12000);
    } catch (error) {
      const debug = await state(cdp).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, 'debug-empty-final-timeout-state.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, 'debug-empty-final-timeout.png').catch(() => undefined);
      throw error;
    }
    assertStableTransferView('empty container final', emptyFinal);
    const emptyFinalStabilitySamples = await sampleStableTransferView(cdp, '08-empty-container-final-stability-samples', 650, 100);
    emptyFinal = await saveState(cdp, '08-empty-container-final-state');
    const emptyFinalShot = await shot(cdp, '08-empty-container-final.png');
    assertStableTransferView('empty container final screenshot time', emptyFinal);
    const emptySamples = await sampleStableTransferView(cdp, '09-empty-container-one-second-samples');
    const emptyAfterOneSecond = await saveState(cdp, '09-empty-container-after-one-second-state');
    const emptyAfterOneSecondShot = await shot(cdp, '09-empty-container-after-one-second.png');
    assertStableTransferView('empty container after one second', emptyAfterOneSecond);
    assert('empty container final never gets stuck loading inventory', /This container is empty/i.test(emptyAfterOneSecond.container?.text || '') && !/Loading your inventory|Loading container contents/i.test(emptyAfterOneSecond.container?.text || ''), emptyAfterOneSecond.container?.text || '');
    assert('successful transfers do not surface a rejected-action banner', !/NetHack did not accept that action|Review the current state and try again/i.test(emptyAfterOneSecond.body || ''), (emptyAfterOneSecond.body || '').slice(0, 1400));
    const transferProblemText = `${emptyAfterOneSecond.messages?.join('\n') || ''}\n${emptyAfterOneSecond.body || ''}\n${emptyAfterOneSecond.shim || ''}`;
    assert('real transfer lifecycle evidence has no NetHack/internal JS disorder text', !/Program in disorder|Please report these messages|TypeError|ReferenceError|Unhandled|bridge_test_scenario_failed/i.test(transferProblemText), transferProblemText.slice(-2000));
    const summary = [`# Real context-open container lifecycle regression`, '', 'PASS', '', `Scenario: ${scenarioId}`, `Invocation env: NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=${scenarioId}`, '', 'Evidence:', `- Context actions: ${contextShot}`, `- Unlock prompt: ${unlockShot}`, `- Immediate after open: ${immediateShot}`, `- Immediate state: ${path.join(outDir, '02-immediate-after-open-state.json')}`, `- After wrong-menu timing window: ${timingShot}`, `- Timing-window state: ${path.join(outDir, '03-after-wrong-menu-timing-window-state.json')}`, `- After one full second: ${oneSecondShot}`, `- One-second state: ${path.join(outDir, '04-after-one-second-state.json')}`, `- Before transfer: ${beforeTransferShot}`, `- Before transfer state: ${path.join(outDir, '05-before-transfer-state.json')}`, `- During/after first drag transfer: ${firstTransferShot}`, `- During/after first transfer state: ${path.join(outDir, '06-during-after-first-transfer-state.json')}`, `- First transfer one-second screenshot: ${firstOneSecondShot}`, `- First transfer one-second samples: ${path.join(outDir, '07-first-transfer-one-second-samples.json')} (${firstTransferSamples.length} samples)`, `- Empty-container final screenshot: ${emptyFinalShot}`, `- Empty-container final state: ${path.join(outDir, '08-empty-container-final-state.json')}`, `- Empty-container final stability samples: ${path.join(outDir, '08-empty-container-final-stability-samples.json')} (${emptyFinalStabilitySamples.length} samples)`, `- Empty-container after one second: ${emptyAfterOneSecondShot}`, `- Empty-container one-second samples: ${path.join(outDir, '09-empty-container-one-second-samples.json')} (${emptySamples.length} samples)`, '', 'Verified:', '- player stands on a locked chest with a skeleton key, unlocks from the context Open chest path, then the GUI continues into the real chest transfer panel', '- the container panel remains active immediately, after the regression timing window, and after more than one second from both the Open click and the fully loaded panel', '- no extended-command menu, promptless object menu, category menu, read-only menu, or normal Equipment / Inventory overlay takes over', '- delayed normal inventory probe key `i` is not sent after the live inventory update has already populated the right pane', '- after waiting at least one second with the chest open, real drag/drop moves a chest item into inventory without repeated Loading your inventory / Loading container contents placeholders', '- moving the remaining item out leaves a stable empty-container panel with the carried items visible and no permanent loading state after another one-second wait', '', `Open sent input stream: ${JSON.stringify(afterOneSecond.sent)}`, `First transfer sent input stream: ${JSON.stringify(afterFirstTransfer.sent)}`, `Empty final sent input stream: ${JSON.stringify(emptyAfterOneSecond.sent)}`, '', 'Final visible container panel:', '```', emptyAfterOneSecond.container.text, '```', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
