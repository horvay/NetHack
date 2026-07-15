const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_STALE_PROMPT_OUT_DIR || path.join(root, 'test-output', 'stale-prompt-inventory-lifecycle');
const port = Number(process.env.NH_STALE_PROMPT_CDP_PORT || 9517);
const width = Number(process.env.NH_STALE_PROMPT_WIDTH || 1360);
const height = Number(process.env.NH_STALE_PROMPT_HEIGHT || 920);

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 150) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeoutMs) {
    try { const value = await fn(); if (value) return value; } catch (error) { last = error; }
    await delay(stepMs);
  }
  throw last || new Error('timed out waiting');
}
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function shot(cdp, name) {
  const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const p = path.join(outDir, name);
  fs.writeFileSync(p, Buffer.from(res.data, 'base64'));
  return p;
}
async function clickCenter(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
async function press(cdp, key, code = key, text) {
  const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : (key === 'Escape' ? 27 : 0);
  const params = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  if (text !== undefined) params.text = text;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function pageState(cdp) {
  return evalExpr(cdp, `(() => {
    const promptPanel = document.getElementById('prompt-panel');
    const menuPanel = document.getElementById('menu-panel');
    const interaction = document.getElementById('interaction-dialog');
    const interactionRect = interaction?.getBoundingClientRect();
    const itemsRoot = document.getElementById('ux-items-root');
    const itemsRect = itemsRoot?.getBoundingClientRect();
    return {
      status: document.getElementById('status')?.textContent || '',
      seen: document.getElementById('shim-output')?.dataset?.seen || '',
      running: window.__nethackAutomation?.state?.().runningState?.running || false,
      sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
      prompt: window.__nethackPromptTest?.prompt?.() || null,
      dialog: window.__nethackPromptTest?.dialog?.() || {},
      container: window.__nethackPromptTest?.container?.() || {},
      promptPanel: { hidden: !!promptPanel?.hidden, text: promptPanel?.textContent || '' },
      menuPanel: { hidden: !!menuPanel?.hidden, text: menuPanel?.textContent || '' },
      openDialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
      paperText: document.querySelector('.rpg-equipment-screen')?.innerText || '',
      rows: Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).map((row) => ({ selector: row.dataset.key || '', text: row.innerText })),
      interactionClass: interaction?.className || '',
      interactionClipped: Boolean(interactionRect && (interactionRect.left < 0 || interactionRect.top < 0 || interactionRect.right > innerWidth || interactionRect.bottom > innerHeight || interaction.scrollWidth > interaction.clientWidth + 1)),
      items: {
        open: Boolean(itemsRoot && !itemsRoot.hidden && itemsRoot.classList.contains('uxm-items-overlay')),
        role: itemsRoot?.querySelector('.uxm-items-workspace')?.getAttribute('role') || '',
        title: itemsRoot?.querySelector('#uxm-items-title')?.textContent || '',
        activeMode: itemsRoot?.querySelector('.uxm-items-content')?.dataset?.activeMode || '',
        equipmentHeading: itemsRoot?.querySelector('.uxm-equipment-heading h2')?.textContent || '',
        rows: Array.from(itemsRoot?.querySelectorAll('.uxm-item-row') || []).map((row) => ({ selector: row.dataset.selector || '', text: row.innerText })),
        text: itemsRoot?.innerText || '',
        clipped: Boolean(itemsRect && (itemsRect.left < 0 || itemsRect.top < 0 || itemsRect.right > innerWidth || itemsRect.bottom > innerHeight || itemsRoot.scrollWidth > itemsRoot.clientWidth + 1)),
      },
      body: document.body.innerText,
    };
  })()`);
}
function writeSidecar(name, data) {
  const p = path.join(outDir, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}
function authoritativeInventoryScript(revision, rows) {
  return `window.__nethackPromptTest.setAuthoritativeInventoryForTest(${JSON.stringify(rows)}, ${revision});`;
}
const fourRows = [
  { selector:97, objectId:1301, text:'a - a +1 long sword (weapon in hand)', glyphChar:41, wornMask:256, semanticKind:'object', semanticName:'long sword', semanticKnown:true, quantity:1, actionAffordances:['wield','drop'] },
  { selector:98, objectId:1302, text:'b - a food ration', glyphChar:37, semanticKind:'object', semanticName:'food ration', semanticKnown:true, quantity:1, actionAffordances:['eat','drop'] },
  { selector:99, objectId:1303, text:'c - an uncursed ring mail (being worn)', glyphChar:91, wornMask:1, semanticKind:'object', semanticName:'ring mail', semanticKnown:true, quantity:1, actionAffordances:['take-off','drop'] },
  { selector:100, objectId:1304, text:'d - a scroll labeled VELOX NEB', glyphChar:63, semanticKind:'object', semanticAppearance:'scroll labeled VELOX NEB', semanticKnown:false, quantity:1, actionAffordances:['read','drop'] },
];
async function startShim(cdp) {
  await clickCenter(cdp, '#start-shim');
  await delay(200);
  await clickCenter(cdp, '#startup-new-game');
  await delay(200);
  await evalExpr(cdp, `(() => { const input = document.getElementById('player-name'); input.value = 'StaleProof'; input.dispatchEvent(new Event('input', { bubbles:true })); input.dispatchEvent(new Event('change', { bubbles:true })); return true; })()`);
  await delay(100);
  await clickCenter(cdp, '#confirm-character');
  await waitFor(async () => {
    const state = await pageState(cdp);
    return /shim_print_glyph|shim_status_update|shim_curs|shim_putstr/.test(state.seen) ? state : null;
  }, 25000);
  await waitFor(async () => {
    await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('character-dialog')?.close?.('cancel'); document.getElementById('game-grid')?.focus(); window.__nethackPromptTest?.clearSentInputs?.(); return true; })()`);
    const state = await pageState(cdp);
    return state.openDialogs.length ? null : state;
  }, 5000);
}
async function runInjectedRegression(cdp, artifacts) {
  await evalExpr(cdp, `(() => {
    const t = window.__nethackPromptTest;
    t.reset(); t.setRunning(true);
    t.event({name:'shim_yn_function', query:'What do you want to eat? [fh or ?*]', choices:'fh?*\\u001b'});
    document.getElementById('interaction-dialog')?.close?.('simulated-stale-owner');
    { const prompt = t.prompt(); t.event({name:'bridge_prompt_answer', requestId:prompt.requestId, transactionId:prompt.transactionId, keycode:27}); }
    document.getElementById('game-grid')?.focus();
    ${authoritativeInventoryScript(1301, fourRows)}
    return true;
  })()`);
  await delay(200);
  artifacts.injectedBeforeScreenshot = await shot(cdp, '01-injected-stale-eat-prompt-before-inventory.png');
  artifacts.injectedBeforeState = writeSidecar('01-injected-stale-eat-prompt-before-inventory.state.json', await pageState(cdp));

  await clickCenter(cdp, '#inventory-equipment-button');
  await evalExpr(cdp, `(() => {
    const t = window.__nethackPromptTest;
    t.event({name:'shim_start_menu', window:301});
    ${JSON.stringify(fourRows)}.forEach((item) => t.event({name:'shim_add_menu', window:301, ...item}));
    t.event({name:'shim_end_menu', window:301, prompt:'Menu'});
    return true;
  })()`);
  const after = await waitFor(async () => {
    const state = await pageState(cdp);
    return state.dialog.interactionOpen && /\brpg-equipment-dialog\b/.test(state.interactionClass) && state.rows.length === 4 ? state : null;
  }, 5000);
  artifacts.injectedAfterScreenshot = await shot(cdp, '02-after-stale-prompt-current-equipment-owner.png');
  artifacts.injectedAfterState = writeSidecar('02-after-stale-prompt-current-equipment-owner.state.json', after);
  assert('stale item-action prompt cleared before inventory overview', !after.prompt && after.promptPanel.hidden, JSON.stringify(after.promptPanel));
  assert('stale prompt yields current Equipment owner with authoritative rows',
    /\brpg-equipment-dialog\b/.test(after.interactionClass)
      && /Hero equipment/i.test(after.paperText)
      && after.rows.some((row) => row.selector === 'a' && /long sword/i.test(row.text))
      && after.rows.some((row) => row.selector === 'b' && /food ration/i.test(row.text))
      && after.rows.some((row) => row.selector === 'c' && /ring mail/i.test(row.text))
      && after.rows.some((row) => row.selector === 'd' && /scroll labeled VELOX NEB/i.test(row.text))
      && !after.interactionClipped,
    JSON.stringify({ interactionClass: after.interactionClass, paperText: after.paperText, rows: after.rows }));
  assert('superseded plain inventory picker is absent', !/Menu\nChoose visible item rows/i.test(after.body), after.body);

  await evalExpr(cdp, `(() => {
    const t = window.__nethackPromptTest;
    t.reset(); t.setRunning(true);
    t.event({name:'shim_yn_function', query:'What do you want to eat? [fh or ?*]', choices:'fh?*'});
    document.getElementById('interaction-dialog')?.close?.('simulated-stale-owner');
    { const prompt = t.prompt(); t.event({name:'bridge_prompt_answer', requestId:prompt.requestId, transactionId:prompt.transactionId, keycode:102}); }
    ${authoritativeInventoryScript(1302, fourRows.slice(0, 2))}
    document.getElementById('game-grid')?.focus();
    t.clearSentInputs();
    return true;
  })()`);
  await press(cdp, 'i', 'KeyI', 'i');
  await evalExpr(cdp, `(() => {
    const t = window.__nethackPromptTest;
    t.event({name:'shim_start_menu', window:302});
    ${JSON.stringify(fourRows.slice(0, 2))}.forEach((item) => t.event({name:'shim_add_menu', window:302, ...item}));
    t.event({name:'shim_end_menu', window:302, prompt:'Menu'});
    return true;
  })()`);
  const keyboardAfter = await waitFor(async () => {
    const state = await pageState(cdp);
    return state.dialog.interactionOpen && /\brpg-equipment-dialog\b/.test(state.interactionClass) && state.rows.length === 2 ? state : null;
  }, 5000);
  artifacts.keyboardAfterState = writeSidecar('03-keyboard-i-after-orphaned-prompt.state.json', keyboardAfter);
  artifacts.keyboardAfterScreenshot = await shot(cdp, '03-keyboard-i-after-orphaned-prompt-current-equipment-owner.png');
  assert('keyboard i is not trapped by orphaned prompt', keyboardAfter.sent.includes('i'), JSON.stringify(keyboardAfter));
  assert('keyboard i after orphan opens current Equipment owner', /\brpg-equipment-dialog\b/.test(keyboardAfter.interactionClass) && /Hero equipment/i.test(keyboardAfter.paperText) && keyboardAfter.rows.some((row) => row.selector === 'a' && /long sword/i.test(row.text)) && keyboardAfter.rows.some((row) => row.selector === 'b' && /food ration/i.test(row.text)), JSON.stringify(keyboardAfter));

  const lazyLoadState = await evalExpr(cdp, `(() => {
    const t = window.__nethackPromptTest;
    t.reset(); t.setRunning(true);
    document.getElementById('inventory-equipment-button').click();
    t.clearSentInputs();
    document.dispatchEvent(new KeyboardEvent('keydown', { key:'d', bubbles:true, cancelable:true }));
    t.event({name:'shim_yn_function', query:'What do you want to drop? [a or ?*]', choices:'a?*'});
    t.event({name:'shim_start_menu', window:303});
    t.event({name:'shim_add_menu', window:303, selector:97, text:'a - a potion of healing', glyphChar:33, semanticKind:'object', semanticName:'potion of healing'});
    t.event({name:'shim_end_menu', window:303, prompt:'Inventory:'});
    const promptPanel = document.getElementById('prompt-panel');
    return {
      prompt: t.prompt(), dialog: t.dialog(),
      promptPanel: { hidden: !!promptPanel?.hidden, text: promptPanel?.textContent || '' },
      paper: document.querySelector('.rpg-equipment-screen')?.innerText || '',
      interactionClass: document.getElementById('interaction-dialog')?.className || '',
      body: document.body.innerText, sent: t.sentInputs().join('')
    };
  })()`);
  artifacts.lazyLoadState = writeSidecar('04-prior-inventory-then-drop-lazy-load.state.json', lazyLoadState);
  assert('prior inventory command does not convert non-whitelisted drop prompt into Equipment', !/\brpg-equipment-dialog\b/.test(lazyLoadState.interactionClass) && !/Hero equipment/i.test(lazyLoadState.paper), JSON.stringify(lazyLoadState));
  assert('legitimate drop prompt remains owned after lazy inventory menu', /What do you want to drop/i.test(`${lazyLoadState.dialog.prompt}\n${lazyLoadState.promptPanel.text}`), JSON.stringify(lazyLoadState));
}
async function runRealSmoke(cdp, artifacts) {
  await evalExpr(cdp, `(() => { window.__nethackPromptTest?.reset?.(); window.__nethackPromptTest?.setRunning?.(false); return true; })()`);
  await startShim(cdp);
  artifacts.realStartedScreenshot = await shot(cdp, '10-real-game-started.png');
  artifacts.realStartedState = writeSidecar('10-real-game-started.state.json', await pageState(cdp));

  await clickCenter(cdp, '#open-actions');
  await clickCenter(cdp, '#ux-command-palette [data-command-id="item.eat"]');
  const eatPrompt = await waitFor(async () => {
    const state = await pageState(cdp);
    return /What do you want to eat|don't have anything to eat|not hungry|nothing appropriate/i.test(`${state.dialog.prompt}\n${state.prompt?.query || ''}\n${state.status}`) ? state : null;
  }, 8000);
  artifacts.realEatPromptScreenshot = await shot(cdp, '11-real-eat-action-before-cancel.png');
  artifacts.realEatPromptState = writeSidecar('11-real-eat-action-before-cancel.state.json', eatPrompt);
  assert('real Eat command opens its authoritative prompt owner', /What do you want to eat/i.test(`${eatPrompt.dialog.prompt}\n${eatPrompt.prompt?.query || ''}`) && eatPrompt.dialog.interactionOpen && !eatPrompt.openDialogs.includes('ux-command-palette'), JSON.stringify(eatPrompt));

  if (eatPrompt.dialog?.interactionOpen || eatPrompt.prompt || /What do you want to eat/i.test(eatPrompt.body)) {
    await press(cdp, 'Escape', 'Escape');
    await delay(800);
  }
  let afterCancel = await pageState(cdp);
  if (afterCancel.openDialogs.includes('ux-command-palette')) {
    await press(cdp, 'Escape', 'Escape');
    await delay(400);
    afterCancel = await pageState(cdp);
  }
  artifacts.realAfterCancelScreenshot = await shot(cdp, '12-real-after-eat-cancel-no-stale-chip.png');
  artifacts.realAfterCancelState = writeSidecar('12-real-after-eat-cancel-no-stale-chip.state.json', afterCancel);
  assert('real eat cancel does not leave stuck eat prompt chip or stale command modal', !/What do you want to eat/i.test(`${afterCancel.promptPanel.text}\n${afterCancel.menuPanel.text}`) && !afterCancel.openDialogs.includes('ux-command-palette'), JSON.stringify(afterCancel));

  await evalExpr(cdp, "(() => { window.__nethackPromptTest.clearSentInputs(); return true; })()");
  await clickCenter(cdp, '#inventory-equipment-button');
  await delay(2000);
  const inventory = await pageState(cdp);
  artifacts.realInventoryAfterCancelScreenshot = await shot(cdp, '13-real-inventory-after-eat-cancel-current-equipment-owner.png');
  artifacts.realInventoryAfterCancelState = writeSidecar('13-real-inventory-after-eat-cancel-current-equipment-owner.state.json', inventory);
  assert('real inventory after cancelling eat opens current Equipment owner with authoritative rows',
    /\brpg-equipment-dialog\b/.test(inventory.interactionClass)
      && /Hero equipment/i.test(inventory.paperText)
      && inventory.prompt?.owner?.kind === 'inventory'
      && inventory.rows.length >= 4
      && inventory.rows.every((row) => /^[A-Za-z$]$/.test(row.selector) && row.text.trim().length > 1)
      && inventory.sent === 'i'
      && !inventory.interactionClipped,
    JSON.stringify(inventory));
  assert('real inventory after cancelling eat has no active stale prompt owner', inventory.promptPanel.hidden && !/What do you want to eat/i.test(inventory.prompt?.query || '') && inventory.openDialogs.length === 1 && inventory.openDialogs[0] === 'interaction-dialog', JSON.stringify({ prompt: inventory.prompt, promptPanel: inventory.promptPanel, openDialogs: inventory.openDialogs }));
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const artifacts = { outDir };

  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  child.stdout.on('data', (data) => process.stdout.write(data));
  child.stderr.on('data', (data) => process.stderr.write(data));
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((page) => page.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((page) => page.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "document.readyState === 'complete' && !!window.__nethackPromptTest && !!window.__nethackAutomation" })).result.value, 10000);

    await runRealSmoke(cdp, artifacts);
    await runInjectedRegression(cdp, artifacts);
    artifacts.summary = 'PASS: stale item-action ownership is cleared, Inventory opens the current Equipment owner with authoritative rows, and real Eat cancel leaves no stale chip.';
    writeSidecar('summary.json', artifacts);
    console.log(JSON.stringify(artifacts, null, 2));
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
