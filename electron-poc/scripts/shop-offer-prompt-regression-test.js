const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');
const PromptRules = require('../src/shared/prompt-rules');
const InteractionModel = require('../src/shared/interaction-model');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_SHOP_OFFER_OUT_DIR || path.join(root, 'test-output', 'shop-offer-prompt');
const port = Number(process.env.NH_SHOP_OFFER_CDP_PORT || 9627);
const width = Number(process.env.NH_SHOP_OFFER_WIDTH || 900);
const height = Number(process.env.NH_SHOP_OFFER_HEIGHT || 620);

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 100) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try { const value = await fn(); if (value) return value; } catch (error) { last = error; }
    await delay(stepMs);
  }
  throw last || new Error('timed out waiting');
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
      const callbacks = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? callbacks.reject(new Error(JSON.stringify(msg.error))) : callbacks.resolve(msg.result);
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
  const res = await cdp.send('Runtime.evaluate', { returnByValue: true, expression });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function screenshot(cdp, name) {
  const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(outDir, name);
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
  return file;
}
function assert(ok, message) {
  if (!ok) throw new Error(message);
}
function copyProvidedBeforeScreenshot() {
  const source = '/home/horvay/.config/ai-org/ai-org-dev-data/attachments/att-1783634533028-0-attachment-lambda-flying-garden-30.png';
  const target = path.join(outDir, 'before-boss-shop-offer.png');
  if (fs.existsSync(source)) fs.copyFileSync(source, target);
  return fs.existsSync(target) ? target : source;
}

function runSharedModelAssertions() {
  const prompt = { kind: 'question', query: 'Adjama offers 4 gold pieces for your green gem.  Sell it?', choices: 'ynaq' };
  const cachedInventory = [
    { selector: 97, text: 'a - a scalpel' },
    { selector: 110, text: 'n - 3 food rations' },
    { selector: 113, text: 'q - a blue gem' },
  ];
  assert(PromptRules.isFixedChoicePrompt(prompt.query, prompt.choices), 'prompt-rules did not classify ynaq shop offer as fixed choice');
  assert(!PromptRules.isInventoryActionPrompt(prompt.query, prompt.choices), 'prompt-rules misclassified ynaq shop offer as inventory action');
  assert(!InteractionModel.isInventoryActionPrompt(prompt.query, prompt.choices), 'interaction-model misclassified ynaq shop offer as inventory action');
  const built = InteractionModel.buildPromptInteraction(prompt, cachedInventory);
  assert(built.title === 'Shopkeeper offer', `interaction-model title was ${built.title}`);
  assert(!built.inventoryRows.length, 'interaction-model produced inventory rows for shop offer');
  assert(built.query === 'Adjama offers 4 gold pieces for your green gem.', `interaction-model did not clean redundant shop prompt: ${built.query}`);
  assert(built.options.some((option) => /Accept offer/.test(option.label)), 'interaction-model missing Accept offer option');
  const inventoryPrompt = { query: 'What do you want to drop? [ynaq]', choices: 'ynaq' };
  assert(!PromptRules.isFixedChoicePrompt(inventoryPrompt.query, inventoryPrompt.choices), 'explicit inventory selector question should not be fixed-choice solely because letters are ynaq');
}

async function main() {
  runSharedModelAssertions();
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], {
    cwd: root,
    env: {
      ...process.env,
      AI_ORG_ELECTRON_CDP_PORT: String(port),
      NH_ELECTRON_WINDOW_WIDTH: String(width),
      NH_ELECTRON_WINDOW_HEIGHT: String(height),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  child.stdout.on('data', (data) => process.stdout.write(data));
  child.stderr.on('data', (data) => process.stderr.write(data));
  try {
    const pages = await waitFor(async () => {
      const list = await json(`http://127.0.0.1:${port}/json/list`);
      return list.find((page) => page.type === 'page') ? list : null;
    }, 20000);
    cdp = await connect((pages.find((page) => page.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "document.readyState === 'complete' && !!window.__nethackPromptTest" })).result.value, 10000);

    const setup = `(() => {
      const t = window.__nethackPromptTest;
      t.reset();
      t.setRunning(true);
      t.event({name:'shim_start_menu', window:70});
      t.event({name:'shim_add_menu', window:70, selector:97, text:'a - a +0 scalpel (weapon in hand)', glyphChar:41, semanticKind:'object', semanticName:'scalpel'});
      t.event({name:'shim_add_menu', window:70, selector:110, text:'n - 3 food rations', glyphChar:37, semanticKind:'object', semanticName:'food ration'});
      t.event({name:'shim_add_menu', window:70, selector:113, text:'q - a blue gem', glyphChar:42, semanticKind:'object', semanticName:'blue gem'});
      t.event({name:'shim_end_menu', window:70, prompt:'Inventory:'});
      t.event({name:'shim_yn_function', query:'Adjama offers 4 gold pieces for your green gem.  Sell it?', choices:'ynaq'});
      return t.dialog();
    })()`;
    const dialog = await evalExpr(cdp, setup);
    const promptScreenshot = await screenshot(cdp, 'shop-offer-confirmation.png');
    const optionText = dialog.options.map((option) => option.text).join('\n');
    assert(dialog.interactionOpen, 'shop offer dialog did not open');
    assert(/Shopkeeper offer/i.test(dialog.title), `expected Shopkeeper offer title, got ${dialog.title}`);
    assert(/4 gold pieces/i.test(dialog.prompt) && /green gem/i.test(dialog.prompt), `prompt did not show gold and item: ${dialog.prompt}`);
    assert(!/Sell it\?\s*Sell/i.test(dialog.prompt), `prompt repeated sell copy: ${dialog.prompt}`);
    assert(!dialog.textEntry, 'shop offer should render as fixed buttons, not text/search');
    assert(/Accept offer/i.test(optionText), `missing Accept offer button: ${optionText}`);
    assert(/Decline offer/i.test(optionText), `missing Decline offer button: ${optionText}`);
    assert(/Accept remaining offers/i.test(optionText), `missing accept-remaining shop offer button: ${optionText}`);
    assert(/Stop selling/i.test(optionText), `missing stop-selling shop offer button: ${optionText}`);
    assert(!dialog.options.some((option) => /inventory-row|action-inventory-row/.test(option.className || '')), 'shop offer rendered inventory rows');
    assert(!/scalpel|food ration|blue gem/i.test(optionText), `shop offer leaked unrelated inventory rows: ${optionText}`);
    const layout = await evalExpr(cdp, `(() => Array.from(document.querySelectorAll('#interaction-options .choice-button')).map((button) => {
      const rect = button.getBoundingClientRect();
      const keycap = button.querySelector('.selector-hint')?.getBoundingClientRect();
      const note = button.querySelector('.choice-note')?.getBoundingClientRect();
      return { key: button.dataset.key, height: rect.height, keycapTop: keycap ? Math.round(keycap.top - rect.top) : null, keycapRight: keycap ? Math.round(rect.right - keycap.right) : null, noteWidth: note ? Math.round(note.width) : null, grid: getComputedStyle(button).gridTemplateColumns };
    }))()`);
    assert(layout.every((row) => row.height <= 44), `shop offer rows are still tall/sparse: ${JSON.stringify(layout)}`);
    assert(layout.every((row) => row.keycapTop !== null && row.keycapTop <= 10 && row.keycapRight <= 12), `hotkeys are not aligned on the option row: ${JSON.stringify(layout)}`);
    assert(layout.every((row) => String(row.grid || '').split(' ').length >= 3), `fixed choices are not structured as label/note/key rows: ${JSON.stringify(layout)}`);

    const genericYesNo = await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      t.reset();
      t.setRunning(true);
      t.event({name:'shim_yn_function', query:'Really remove your cloak?', choices:'yn\\u001b'});
      const dialog = t.dialog();
      const layout = Array.from(document.querySelectorAll('#interaction-options .choice-button')).map((button) => ({ key: button.dataset.key, text: button.innerText, className: button.className, grid: getComputedStyle(button).gridTemplateColumns, keycapTop: Math.round((button.querySelector('.selector-hint')?.getBoundingClientRect().top || 0) - button.getBoundingClientRect().top) }));
      return { dialog, layout };
    })()`);
    const genericScreenshot = await screenshot(cdp, 'generic-yes-no-confirmation.png');
    assert(genericYesNo.dialog.options.some((option) => /^Yes\s*y$/i.test(option.text.replace(/\n+/g, ' ').trim())), `generic Yes option gained redundant copy: ${JSON.stringify(genericYesNo.dialog.options)}`);
    assert(genericYesNo.dialog.options.some((option) => /^No\s*n$/i.test(option.text.replace(/\n+/g, ' ').trim())), `generic No option gained redundant copy: ${JSON.stringify(genericYesNo.dialog.options)}`);
    assert(genericYesNo.layout.every((row) => String(row.grid || '').split(' ').length >= 3 && row.keycapTop <= 10), `generic fixed-choice rows are not aligned: ${JSON.stringify(genericYesNo.layout)}`);

    const acceptSent = await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.reset(); t.setRunning(true); t.event({name:'shim_yn_function', query:'Adjama offers 4 gold pieces for your green gem.  Sell it?', choices:'ynaq'}); document.querySelector('#interaction-options .choice-button[data-key="y"]').click(); return t.sentInputs().join(''); })()`);
    assert(acceptSent === 'y', `Accept offer click sent ${JSON.stringify(acceptSent)}`);

    const keyboard = await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      t.reset();
      t.setRunning(true);
      t.event({name:'shim_yn_function', query:'Adjama offers 4 gold pieces for your green gem.  Sell it?', choices:'ynaq'});
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      const afterArrow = t.sentInputs().join('');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true }));
      return { afterArrow, afterN: t.sentInputs().join(''), dialog: t.dialog() };
    })()`);
    assert(keyboard.afterArrow === '', `navigation key leaked to NetHack: ${JSON.stringify(keyboard.afterArrow)}`);
    assert(keyboard.afterN === 'n', `n hotkey did not decline offer: ${JSON.stringify(keyboard.afterN)}`);

    const allAndQuit = await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      t.reset();
      t.setRunning(true);
      t.event({name:'shim_yn_function', query:'Adjama offers 4 gold pieces for your green gem.  Sell it?', choices:'ynaq'});
      document.querySelector('#interaction-options .choice-button[data-key="a"]').click();
      const afterA = t.sentInputs().join('');
      t.event({name:'bridge_prompt_answer', keycode:97});
      t.event({name:'shim_yn_function', query:'Adjama offers 4 gold pieces for your green gem.  Sell it?', choices:'ynaq'});
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true, cancelable: true }));
      return { afterA, afterQ: t.sentInputs().join('') };
    })()`);
    assert(allAndQuit.afterA === 'a', `accept-all click sent ${JSON.stringify(allAndQuit.afterA)}`);
    assert(allAndQuit.afterQ === 'aq', `q hotkey did not append decline-remaining: ${JSON.stringify(allAndQuit.afterQ)}`);

    const metrics = { beforeScreenshot: copyProvidedBeforeScreenshot(), promptScreenshot, genericScreenshot, dialog, layout, genericYesNo, acceptSent, keyboard, allAndQuit, assertions: { sharedModelsRejectInventoryRouting: true, shopOfferIsFixedConfirmation: true, fixedChoicesUseStructuredRows: true, genericFixedChoicesUseStructuredRows: true, allYnaqChoicesSendExpectedKeys: true } };
    fs.writeFileSync(path.join(outDir, 'shop-offer-prompt-metrics.json'), JSON.stringify(metrics, null, 2));
    console.log(JSON.stringify(metrics, null, 2));
  } finally {
    cleanup();
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
