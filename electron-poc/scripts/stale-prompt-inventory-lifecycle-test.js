const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_STALE_PROMPT_OUT_DIR || path.join(root, 'test-output', 'stale-prompt-inventory-lifecycle');
const port = Number(process.env.NH_STALE_PROMPT_CDP_PORT || 9517);
const width = Number(process.env.NH_STALE_PROMPT_WIDTH || 1360);
const height = Number(process.env.NH_STALE_PROMPT_HEIGHT || 920);
const bossScreenshot = '/home/horvay/.config/ai-org/ai-org-dev-data/attachments/att-1783225077467-0-attachment-phi-drifting-anchor-68.png';
const readOnlyBossScreenshot = '/home/horvay/.config/ai-org/ai-org-dev-data/attachments/att-1783223016234-0-attachment-eta-rolling-anchor-30.png';

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
  const res = await cdp.send('Runtime.evaluate', { returnByValue: true, expression });
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
      rowsText: Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).map((el) => el.innerText).join(String.fromCharCode(10)),
      body: document.body.innerText,
    };
  })()`);
}
function writeSidecar(name, data) {
  const p = path.join(outDir, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}
async function startShim(cdp) {
  await clickCenter(cdp, '#start-shim');
  await delay(200);
  await clickCenter(cdp, '#confirm-character');
  await waitFor(async () => {
    const s = await pageState(cdp);
    return s.running && /shim_print_glyph|shim_status_update|shim_curs|shim_putstr/.test(s.seen) ? s : null;
  }, 25000);
  await waitFor(async () => {
    await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('character-dialog')?.close?.('cancel'); document.getElementById('game-grid')?.focus(); window.__nethackPromptTest?.clearSentInputs?.(); return true; })()`);
    const s = await pageState(cdp);
    return s.openDialogs.length ? null : s;
  }, 5000);
}
async function runInjectedRegression(cdp, artifacts) {
  await evalExpr(cdp, `(() => {
    const t = window.__nethackPromptTest;
    t.reset(); t.setRunning(true);
    t.event({name:'shim_yn_function', query:'What do you want to eat? [fh or ?*]', choices:'fh?*\\u001b'});
    document.getElementById('interaction-dialog')?.close?.('simulated-stale-owner');
    document.getElementById('game-grid')?.focus();
    return true;
  })()`);
  await delay(200);
  artifacts.injectedBeforeScreenshot = await shot(cdp, '01-injected-stale-eat-prompt-before-inventory.png');
  artifacts.injectedBeforeState = writeSidecar('01-injected-stale-eat-prompt-before-inventory.state.json', await pageState(cdp));

  await clickCenter(cdp, '#inventory-equipment-button');
  await evalExpr(cdp, `(() => {
    const t = window.__nethackPromptTest;
    t.event({name:'shim_start_menu', window:301});
    [
      [97, 'a - a +1 long sword (weapon in hand)', 41, 'long sword'],
      [98, 'b - a food ration', 37, 'food ration'],
      [99, 'c - an uncursed ring mail (being worn)', 91, 'ring mail'],
      [100, 'd - a scroll labeled VELOX NEB', 63, 'scroll']
    ].forEach(([selector, text, glyphChar, semanticName]) => t.event({name:'shim_add_menu', window:301, selector, text, glyphChar, semanticKind:'object', semanticName}));
    t.event({name:'shim_end_menu', window:301, prompt:'Menu'});
    return true;
  })()`);
  await waitFor(async () => {
    const s = await pageState(cdp);
    return s.dialog.interactionOpen && /Equipment \/ Inventory/i.test(s.dialog.title || '') ? s : null;
  }, 5000);
  artifacts.injectedAfterScreenshot = await shot(cdp, '02-after-stale-prompt-inventory-button-rpg-screen.png');
  const after = await pageState(cdp);
  artifacts.injectedAfterState = writeSidecar('02-after-stale-prompt-inventory-button-rpg-screen.state.json', after);
  assert('stale item-action prompt cleared before inventory overview', !after.prompt && after.promptPanel.hidden, JSON.stringify(after.promptPanel));
  assert('inventory overview uses RPG equipment screen after stale prompt', /Equipment \/ Inventory/i.test(after.dialog.title || '') && /Hero equipment/i.test(after.paperText) && /food ration|ring mail|long sword/i.test(after.rowsText + after.paperText), JSON.stringify({ title: after.dialog.title, paper: after.paperText, rows: after.rowsText }));
  assert('classic plain inventory picker is not shown after stale prompt', !/Menu\nChoose visible item rows/i.test(after.body), after.body);

  await evalExpr(cdp, `(() => {
    const t = window.__nethackPromptTest;
    t.reset(); t.setRunning(true);
    t.event({name:'shim_yn_function', query:'What do you want to eat? [fh or ?*]', choices:'fh?*'});
    document.getElementById('interaction-dialog')?.close?.('simulated-stale-owner');
    document.getElementById('game-grid')?.focus();
    t.clearSentInputs();
    document.dispatchEvent(new KeyboardEvent('keydown', { key:'i', bubbles:true, cancelable:true }));
    t.event({name:'shim_start_menu', window:302});
    [[97, 'a - a +1 long sword (weapon in hand)', 41, 'long sword'], [98, 'b - a food ration', 37, 'food ration']]
      .forEach(([selector, text, glyphChar, semanticName]) => t.event({name:'shim_add_menu', window:302, selector, text, glyphChar, semanticKind:'object', semanticName}));
    t.event({name:'shim_end_menu', window:302, prompt:'Menu'});
    return true;
  })()`);
  const keyboardAfter = await pageState(cdp);
  artifacts.keyboardAfterState = writeSidecar('03-keyboard-i-after-orphaned-prompt.state.json', keyboardAfter);
  artifacts.keyboardAfterScreenshot = await shot(cdp, '03-keyboard-i-after-orphaned-prompt-rpg-screen.png');
  assert('keyboard i is not trapped by orphaned prompt', /\u001bi|\u001b.*i/s.test(JSON.stringify(keyboardAfter.sent)) || keyboardAfter.sent.includes('i'), JSON.stringify(keyboardAfter));
  assert('keyboard i after orphan opens RPG equipment screen', /Equipment \/ Inventory/i.test(keyboardAfter.dialog.title || '') && /Hero equipment/i.test(keyboardAfter.paperText), JSON.stringify({ title: keyboardAfter.dialog.title, prompt: keyboardAfter.promptPanel }));

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
      prompt: t.prompt(),
      dialog: t.dialog(),
      promptPanel: { hidden: !!promptPanel?.hidden, text: promptPanel?.textContent || '' },
      paper: document.querySelector('.rpg-equipment-screen')?.innerText || '',
      body: document.body.innerText,
      sent: t.sentInputs().join('')
    };
  })()`);
  artifacts.lazyLoadState = writeSidecar('04-prior-inventory-then-drop-lazy-load.state.json', lazyLoadState);
  assert('prior inventory command does not convert non-whitelisted action prompt lazy menu into RPG overview', !/Equipment \/ Inventory/i.test(lazyLoadState.dialog.title || '') && !/Hero equipment/i.test(lazyLoadState.paper), JSON.stringify(lazyLoadState));
  assert('legitimate drop prompt remains owned after lazy inventory menu', /What do you want to drop/i.test(`${lazyLoadState.dialog.prompt}\n${lazyLoadState.promptPanel.text}`), JSON.stringify(lazyLoadState));
}
async function runRealSmoke(cdp, artifacts) {
  await evalExpr(cdp, `(() => { window.__nethackPromptTest?.reset?.(); window.__nethackPromptTest?.setRunning?.(false); return true; })()`);
  await startShim(cdp);
  artifacts.realStartedScreenshot = await shot(cdp, '10-real-game-started.png');
  artifacts.realStartedState = writeSidecar('10-real-game-started.state.json', await pageState(cdp));

  await clickCenter(cdp, '#open-actions');
  await clickCenter(cdp, '#item-actions button[data-command-key="e"]');
  const eatPrompt = await waitFor(async () => {
    const s = await pageState(cdp);
    return /What do you want to eat|don't have anything to eat|not hungry|nothing appropriate/i.test(`${s.body}\n${s.status}`) ? s : null;
  }, 8000).catch(async () => pageState(cdp));
  artifacts.realEatPromptScreenshot = await shot(cdp, '11-real-eat-action-before-cancel.png');
  artifacts.realEatPromptState = writeSidecar('11-real-eat-action-before-cancel.state.json', eatPrompt);

  if (eatPrompt.dialog?.interactionOpen || eatPrompt.prompt || /What do you want to eat/i.test(eatPrompt.body)) {
    await press(cdp, 'Escape', 'Escape');
    await delay(800);
  }
  artifacts.realAfterCancelScreenshot = await shot(cdp, '12-real-after-eat-cancel-no-stale-chip.png');
  const afterCancel = await pageState(cdp);
  artifacts.realAfterCancelState = writeSidecar('12-real-after-eat-cancel-no-stale-chip.state.json', afterCancel);
  assert('real eat cancel does not leave stuck eat prompt chip', !/What do you want to eat/i.test(`${afterCancel.promptPanel.text}\n${afterCancel.menuPanel.text}`), JSON.stringify(afterCancel));

  await clickCenter(cdp, '#inventory-equipment-button');
  const inventory = await waitFor(async () => {
    const s = await pageState(cdp);
    return s.dialog.interactionOpen && /Equipment \/ Inventory/i.test(s.dialog.title || '') ? s : null;
  }, 10000);
  artifacts.realInventoryAfterCancelScreenshot = await shot(cdp, '13-real-inventory-after-eat-cancel-rpg-screen.png');
  artifacts.realInventoryAfterCancelState = writeSidecar('13-real-inventory-after-eat-cancel-rpg-screen.state.json', inventory);
  assert('real inventory after cancelling eat opens RPG equipment screen', /Hero equipment/i.test(inventory.paperText) && /Equipment \/ Inventory/i.test(inventory.dialog.title || ''), JSON.stringify({ title: inventory.dialog.title, paper: inventory.paperText }));
  assert('real inventory after cancelling eat has no stuck prompt chip', !/What do you want to eat/i.test(`${inventory.promptPanel.text}\n${inventory.menuPanel.text}`), JSON.stringify(inventory.promptPanel));
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const artifacts = { outDir, bossScreenshot, readOnlyBossScreenshot };
  if (fs.existsSync(bossScreenshot)) fs.copyFileSync(bossScreenshot, path.join(outDir, '00-boss-stale-eat-prompt-before.png'));
  if (fs.existsSync(readOnlyBossScreenshot)) fs.copyFileSync(readOnlyBossScreenshot, path.join(outDir, '00-boss-read-only-menu-chip-before.png'));

  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  child.stdout.on('data', (d) => process.stdout.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "document.readyState === 'complete' && !!window.__nethackPromptTest && !!window.__nethackAutomation" })).result.value, 10000);

    await runInjectedRegression(cdp, artifacts);
    await runRealSmoke(cdp, artifacts);
    artifacts.summary = 'PASS: stale item-action prompt owner is cleared, Inventory opens the RPG equipment screen, and real Eat cancel leaves no stale chip.';
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
