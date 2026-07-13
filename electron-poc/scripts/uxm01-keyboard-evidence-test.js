#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_UXM01_KEYBOARD_OUT_DIR || path.join(root, 'test-output', 'uxm01-keyboard-evidence');
const resultFile = path.join(outDir, 'keyboard-matrix.json');
const { waitFor, delay } = Harness;

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

async function inject(page, source) {
  const result = await page.evalCheckedValue(`(() => { const t = window.__nethackPromptTest; if (!t) throw new Error('prompt test API unavailable'); ${source}; return true; })()`);
  await delay(220);
  return result;
}

async function state(page) {
  return page.evalCheckedValue(`(() => ({
    active: { id: document.activeElement?.id || '', key: document.activeElement?.dataset?.key || '', text: document.activeElement?.innerText || '' },
    dialogOpen: Boolean(document.getElementById('interaction-dialog')?.open),
    family: document.getElementById('interaction-dialog')?.dataset?.dialogFamily || '',
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    checked: Array.from(document.querySelectorAll('#interaction-options [aria-checked="true"]')).map((node) => node.dataset.key || node.innerText),
    contextOpen: Boolean(document.querySelector('.inventory-context-menu')),
    focusStack: window.NetHackUxRuntime?.runtime?.service?.('dialog')?.focus?.snapshot?.() || [],
  }))()`);
}

async function key(page, name, options = {}) {
  const virtualKeyCode = options.virtualKeyCode || (name.length === 1 ? name.toUpperCase().charCodeAt(0) : ({ Tab: 9, Enter: 13, Escape: 27, Space: 32, F10: 121, Home: 36, End: 35, ArrowDown: 40 }[name] || 0));
  const params = {
    key: name === 'Space' ? ' ' : name,
    code: name === 'Space' ? 'Space' : (name.length === 1 ? `Key${name.toUpperCase()}` : name),
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
    modifiers: options.modifiers || 0,
    text: options.text == null ? (name.length === 1 ? name : '') : options.text,
  };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params, text: undefined });
  await delay(80);
}

const single = `
  t.reset(); t.clearSentInputs();
  t.event({name:'shim_create_nhwindow',window:801,type:3});
  t.event({name:'shim_start_menu',window:801});
  t.event({name:'shim_add_menu',window:801,selector:97,text:'a - an apple',semanticKind:'object',semanticName:'apple',objectId:801});
  t.event({name:'shim_add_menu',window:801,selector:98,text:'b - a food ration',semanticKind:'object',semanticName:'food ration',objectId:802});
  t.event({name:'shim_end_menu',window:801,prompt:'Choose an item'});
  t.event({name:'shim_select_menu',window:801,how:1});
`;

const multi = `
  t.reset(); t.clearSentInputs();
  t.event({name:'shim_create_nhwindow',window:802,type:3});
  t.event({name:'shim_start_menu',window:802});
  t.event({name:'shim_add_menu',window:802,selector:97,text:'a - an apple',semanticKind:'object',semanticName:'apple',objectId:811});
  t.event({name:'shim_add_menu',window:802,selector:98,text:'b - a food ration',semanticKind:'object',semanticName:'food ration',objectId:812});
  t.event({name:'shim_end_menu',window:802,prompt:'Choose several items'});
  t.event({name:'shim_select_menu',window:802,how:2});
`;

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const page = await Harness.createElectronBrowserDriver({ root, port: 9778, width: 1100, height: 760 });
  const result = { plan: 'NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11', chunk: 'UXM-01', checks: {}, observations: {} };
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    await page.evalCheckedValue(`(() => { const startup = document.getElementById('startup-choice-dialog'); if (startup?.open) startup.close(); return true; })()`);
    await delay(80);

    await inject(page, single);
    await waitFor(async () => (await state(page)).dialogOpen, 5000);
    result.observations.initial = await state(page);
    assert(result.observations.initial.active.key === 'a', 'initial focus did not enter first single-select choice');
    await key(page, 'ArrowDown'); result.observations.arrowDown = await state(page);
    assert(result.observations.arrowDown.active.key === 'b', 'ArrowDown did not move roving focus');
    await key(page, 'Home'); result.observations.home = await state(page);
    assert(result.observations.home.active.key === 'a', 'Home did not move to first choice');
    await key(page, 'End'); result.observations.end = await state(page);
    assert(result.observations.end.active.key === 'b', 'End did not move to final choice');
    await key(page, 'Tab'); result.observations.tab = await state(page);
    assert(result.observations.tab.dialogOpen && result.observations.tab.focusStack.length === 1, `Tab escaped the modal layer: ${JSON.stringify(result.observations.tab)}`);
    await key(page, 'Tab', { modifiers: 8 }); result.observations.shiftTab = await state(page);
    assert(result.observations.shiftTab.dialogOpen && result.observations.shiftTab.focusStack.length === 1, `Shift+Tab escaped the modal layer: ${JSON.stringify(result.observations.shiftTab)}`);

    await inject(page, single); await key(page, 'b', { text: 'b' }); result.observations.menuLetter = await state(page);
    assert(result.observations.menuLetter.sent === 'b', `menu letter sent ${JSON.stringify(result.observations.menuLetter.sent)}`);

    await inject(page, single); await key(page, 'Enter'); result.observations.enter = await state(page);
    assert(result.observations.enter.sent === 'a', `Enter sent ${JSON.stringify(result.observations.enter.sent)}`);

    await inject(page, multi); await key(page, 'Space'); result.observations.space = await state(page);
    assert(result.observations.space.checked.includes('a') && result.observations.space.sent === '', 'Space did not toggle multi-select locally');

    await inject(page, `t.reset(); t.setRunning(true); t.clearSentInputs(); t.event({name:'shim_yn_function',query:'Really quit without saving?',choices:'yn\\u001b',default:'n'});`);
    await key(page, 'Escape');
    result.observations.escape = await waitFor(async () => { const value = await state(page); return value.sent === 'n' ? value : null; }, 3000);
    assert(result.observations.escape.sent === 'n', `Escape sent canonical safe answer  ${JSON.stringify(result.observations.escape.sent)}`);

    await inject(page, `
      t.reset(); t.clearSentInputs();
      t.event({name:'shim_create_nhwindow',window:803,type:3});
      t.event({name:'shim_start_menu',window:803});
      t.event({name:'shim_add_menu',window:803,selector:97,text:'a - an uncursed food ration',semanticKind:'object',semanticName:'food ration',objectId:821});
      t.event({name:'shim_end_menu',window:803,prompt:'Inventory:'});
      t.event({name:'shim_select_menu',window:803,how:0});
    `);
    await waitFor(async () => (await state(page)).dialogOpen, 5000);
    await page.evalCheckedValue(`(() => { const row = document.querySelector('#interaction-options .choice-button'); row?.focus(); return Boolean(row); })()`);
    await key(page, 'F10', { modifiers: 8, text: '' });
    result.observations.shiftF10 = await state(page);
    assert(result.observations.shiftF10.contextOpen && result.observations.shiftF10.sent === '', 'Shift+F10 did not open item context locally');

    for (const name of ['initialFocus', 'arrowRoving', 'homeEnd', 'tabTrap', 'shiftTabTrap', 'menuLetter', 'enterActivation', 'spaceToggle', 'escapeCancellation', 'shiftF10Context']) result.checks[name] = true;
    fs.writeFileSync(resultFile, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`# UXM-01 keyboard evidence\n\nPASS: ${Object.keys(result.checks).join(', ')}\nEvidence: ${resultFile}`);
  } finally {
    const output = page.output();
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), output.stdout);
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), output.stderr);
    await page.close();
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
