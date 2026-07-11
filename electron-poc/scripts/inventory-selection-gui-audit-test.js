const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_INVENTORY_SELECTION_OUT_DIR || path.join(root, 'test-output', 'inventory-selection-gui-audit');
const port = Number(process.env.NH_INVENTORY_SELECTION_CDP_PORT || 9481);
const width = Number(process.env.NH_INVENTORY_SELECTION_WIDTH || 1280);
const height = Number(process.env.NH_INVENTORY_SELECTION_HEIGHT || 900);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out waiting'); }
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
function assert(name, ok, details = '') { if (!ok) throw new Error(`${name} failed${details ? `: ${details}` : ''}`); }

const cacheInventoryScript = `(() => { const t=window.__nethackPromptTest; t.reset(); t.setRunning(true); t.event({name:'shim_start_menu', window:71});
  t.event({name:'shim_add_menu', window:71, selector:97, text:'a - a food ration', glyphChar:37, semanticKind:'object', semanticName:'food ration'});
  t.event({name:'shim_add_menu', window:71, selector:98, text:'b - a dagger', glyphChar:41, semanticKind:'object', semanticName:'dagger'});
  t.event({name:'shim_add_menu', window:71, selector:99, text:'c - a leather armor (being worn)', glyphChar:91, semanticKind:'object', semanticName:'leather armor'});
  t.event({name:'shim_add_menu', window:71, selector:100, text:'d - a ring of protection (on left hand)', glyphChar:61, semanticKind:'object', semanticName:'ring of protection'});
  t.event({name:'shim_add_menu', window:71, selector:101, text:'e - 12 arrows (in quiver)', glyphChar:41, semanticKind:'object', semanticName:'arrows'});
  t.event({name:'shim_add_menu', window:71, selector:102, text:'f - a wand of digging (0:4)', glyphChar:47, semanticKind:'object', semanticName:'wand of digging'});
  t.event({name:'shim_add_menu', window:71, selector:103, text:'g - a scroll of identify', glyphChar:63, semanticKind:'object', semanticName:'scroll of identify'});
  t.event({name:'shim_add_menu', window:71, selector:104, text:'h - a potion of healing', glyphChar:33, semanticKind:'object', semanticName:'potion of healing'});
  t.event({name:'shim_add_menu', window:71, selector:105, text:'i - a lizard corpse', glyphChar:37, semanticKind:'object', semanticName:'lizard corpse'});
  t.event({name:'shim_add_menu', window:71, selector:106, text:'j - a magic marker (0:45)', glyphChar:40, semanticKind:'object', semanticName:'magic marker'});
  t.event({name:'shim_add_menu', window:71, selector:107, text:'k - a bag of holding', glyphChar:40, semanticKind:'object', semanticName:'bag of holding'});
  t.event({name:'shim_add_menu', window:71, selector:108, text:'l - an amulet of reflection', glyphChar:34, semanticKind:'object', semanticName:'amulet of reflection'});
  t.event({name:'shim_end_menu', window:71, prompt:'Inventory:'}); return true; })()`;

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup); child.stdout.on('data', d => process.stdout.write(d)); child.stderr.on('data', d => process.stderr.write(d));
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find(p => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find(p => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "document.readyState === 'complete' && !!window.__nethackPromptTest" })).result.value, 10000);

    await evalExpr(cdp, cacheInventoryScript);
    await evalExpr(cdp, `window.__nethackPromptTest.event({name:'shim_yn_function', query:'What do you want to wield? [- abef or ?*]', choices:''})`);
    await evalExpr(cdp, `(() => { const input = document.getElementById('interaction-text'); if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles:true })); } return true; })()`);
    const screenshotCase = await evalExpr(cdp, `window.__nethackPromptTest.dialog()`);
    const screenshotPath = await shot(cdp, 'screenshot-case-wield-abef-none.png');
    const keys = screenshotCase.options.map(o => o.key).sort().join('');
    assert('screenshot case opens choose item dialog', screenshotCase.interactionOpen && /Choose item/i.test(screenshotCase.title));
    assert('screenshot case maps compact bracket selectors', ['a','b','e','f','-'].every(k => screenshotCase.options.some(o => o.key === k)), keys);
    assert('screenshot case filters out disallowed inventory rows', !screenshotCase.options.some(o => o.key === 'c') && !screenshotCase.options.some(o => o.key === 'd'), keys);
    assert('screenshot case shows actual item names', /food ration/i.test(screenshotCase.options.find(o => o.key === 'a')?.text || '') && /dagger/i.test(screenshotCase.options.find(o => o.key === 'b')?.text || '') && /arrows/i.test(screenshotCase.options.find(o => o.key === 'e')?.text || '') && /wand of digging/i.test(screenshotCase.options.find(o => o.key === 'f')?.text || ''));
    assert('screenshot case labels hyphen as bare hands/no item', /Bare hands|No item|Nothing|none/i.test(screenshotCase.options.find(o => o.key === '-')?.text || ''));
    assert('screenshot case is not letters-only', screenshotCase.options.filter(o => /inventory-row/.test(o.className || '')).length === 4 && !screenshotCase.options.every(o => /^[-a-z?*]$/i.test((o.text || '').trim())));

    const workflowRows = await evalExpr(cdp, `(() => {
      const prompts = [
        ['apply', 'What do you want to apply? [fjk or ?*]', ['wand of digging','magic marker','bag of holding'], [], true],
        ['wield', 'What do you want to wield? [- be or ?*]', ['dagger','arrows'], ['-'], true],
        ['wear', 'What do you want to wear? [c or ?*]', ['leather armor'], [], true],
        ['takeOffRemoveArmor', 'What do you want to take off? [c or ?*]', ['leather armor'], [], true],
        ['putOnRingAmuletItem', 'What do you want to put on? [dl or ?*]', ['ring of protection','amulet of reflection'], [], true],
        ['removeRingAmulet', 'What do you want to remove? [dl or ?*]', ['ring of protection','amulet of reflection'], [], true],
        ['quiver', 'What do you want to ready? [- e or ?*]', ['arrows'], ['-'], true],
        ['throwFire', 'What do you want to throw? [be or ?*]', ['dagger','arrows'], [], true],
        ['read', 'What do you want to read? [g or ?*]', ['scroll of identify'], [], true],
        ['eat', 'What do you want to eat? [ai or ?*]', ['food ration','lizard corpse'], [], true],
        ['quaff', 'What do you want to drink? [h or ?*]', ['potion of healing'], [], true],
        ['zap', 'What do you want to zap? [f or ?*]', ['wand of digging'], [], true],
        ['dipSource', 'What do you want to dip? [bgh or ?*]', ['dagger','scroll of identify','potion of healing'], [], true],
        ['rub', 'What do you want to rub? [j or ?*]', ['magic marker'], [], true],
        ['invoke', 'What do you want to invoke? [fl or ?*]', ['wand of digging','amulet of reflection'], [], true],
        ['offer', 'What do you want to sacrifice? [i or ?*]', ['lizard corpse'], [], true],
        ['writeEngraveTool', 'What do you want to write with? [- fj or ?*]', ['wand of digging','magic marker'], ['-'], true],
        ['forceLockTool', 'What do you want to force the lock with? [bj or ?*]', ['dagger','magic marker'], [], true],
        ['dropItem', 'What do you want to drop? [abc or ?*]', ['food ration','dagger','leather armor'], [], true],
        ['nameCall', 'What do you want to call? [abef or ?*]', ['food ration','dagger','arrows','wand of digging'], [], true],
        ['identifyWhatIsItem', 'What do you want to identify? [gfh or ?*]', ['scroll of identify','wand of digging','potion of healing'], [], true],
        ['spellItemFollowup', 'What do you want to cast it at? [bf or ?*]', ['dagger','wand of digging'], [], true],
        ['specialQuestionStar', 'What do you want to apply? [k or ?*]', ['bag of holding'], ['?','*'], true],
      ];
      const results = [];
      for (const [name, query, expected, specialKeys, expectGui] of prompts) {
        window.__nethackPromptTest.event({name:'shim_yn_function', query, choices:''});
        const dialog = window.__nethackPromptTest.dialog();
        results.push({ name, query, expected, specialKeys, expectGui, open: dialog.interactionOpen, title: dialog.title, prompt: dialog.prompt, text: dialog.options.map(o => o.text).join(' | '), keys: dialog.options.map(o => o.key), classes: dialog.options.map(o => o.className).join(' | '), options: dialog.options });
      }
      return results;
    })()`);
    for (const row of workflowRows) {
      assert(`${row.name} opens GUI item rows`, row.open && /Choose item|Choose engraving tool|Name item/i.test(row.title) && /inventory-row/.test(row.classes), `${row.title} ${row.classes} ${row.text}`);
      for (const bit of row.expected) assert(`${row.name} includes ${bit}`, new RegExp(bit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(row.text), row.text);
      for (const key of row.specialKeys) assert(`${row.name} includes special ${key}`, row.keys.includes(key), row.keys.join(''));
      assert(`${row.name} not letters-only`, row.options.some((o) => /inventory-row/.test(o.className || '') && /[a-z][a-z]+/i.test(o.text || '')), row.text);
    }
    const representativePath = await shot(cdp, 'representative-spread-item-prompt.png');

    const menuAndFollowupRows = await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      const results = {};
      t.event({name:'shim_start_menu', window:81});
      t.event({name:'shim_add_menu', window:81, selector:97, text:'a - 2 arrows in a bag of holding', glyphChar:41, semanticKind:'object', semanticName:'arrows'});
      t.event({name:'shim_add_menu', window:81, selector:98, text:'b - potion of healing inside bag', glyphChar:33, semanticKind:'object', semanticName:'potion of healing'});
      t.event({name:'shim_end_menu', window:81, prompt:'Loot which items from the bag of holding?'}); t.event({name:'shim_select_menu', window:81, how:2}); results.lootContainer = t.dialog();
      t.event({name:'shim_start_menu', window:82});
      t.event({name:'shim_add_menu', window:82, selector:97, text:'a - a food ration', glyphChar:37, semanticKind:'object', semanticName:'food ration'});
      t.event({name:'shim_add_menu', window:82, selector:98, text:'b - a potion of healing', glyphChar:33, semanticKind:'object', semanticName:'potion of healing'});
      t.event({name:'shim_end_menu', window:82, prompt:'Drop what?'}); t.event({name:'shim_select_menu', window:82, how:2}); results.dropMenu = t.dialog();
      t.event({name:'shim_yn_function', query:'What type of object do you want to drop?', choices:'!?+$'}); results.dropClass = t.dialog();
      t.event({name:'shim_start_menu', window:83});
      t.event({name:'shim_add_menu', window:83, selector:97, text:'a - force bolt  Pw 5  Fail 0%'});
      t.event({name:'shim_add_menu', window:83, selector:98, text:'b - healing  Pw 12  Fail 20%'});
      t.event({name:'shim_end_menu', window:83, prompt:'Choose which spell to cast'}); t.event({name:'shim_select_menu', window:83, how:1}); results.spellMenu = t.dialog();
      t.event({name:'shim_yn_function', query:'On which hand do you want to put on the ring?', choices:'lr\\u001b'}); results.ringHand = t.dialog();
      return results;
    })()`);
    assert('loot/container menu has visible rows', menuAndFollowupRows.lootContainer.interactionOpen && /transfer-row|inventory-row/.test(menuAndFollowupRows.lootContainer.options.map(o => o.className).join(' ')) && /arrows|potion/i.test(menuAndFollowupRows.lootContainer.options.map(o => o.text).join(' ')));
    assert('drop item menu has visible item rows', menuAndFollowupRows.dropMenu.interactionOpen && /food ration|potion/i.test(menuAndFollowupRows.dropMenu.options.map(o => o.text).join(' ')) && /inventory-row|transfer-row/.test(menuAndFollowupRows.dropMenu.options.map(o => o.className).join(' ')));
    assert('drop class prompt has named class rows', menuAndFollowupRows.dropClass.interactionOpen && menuAndFollowupRows.dropClass.options.some(o => ['!','?','+','$'].includes(o.key)) && /Potions|Scrolls|Books|Money|class/i.test(menuAndFollowupRows.dropClass.options.map(o => `${o.label || ''} ${o.text || ''}`).join(' ')) && /class-choice/.test(menuAndFollowupRows.dropClass.options.map(o => o.className).join(' ')), JSON.stringify(menuAndFollowupRows.dropClass));
    assert('spell menu has named spell rows', menuAndFollowupRows.spellMenu.interactionOpen && /force bolt|healing/i.test(menuAndFollowupRows.spellMenu.options.map(o => o.text).join(' ')) && /spell-row/.test(menuAndFollowupRows.spellMenu.options.map(o => o.className).join(' ')));
    assert('ring hand followup has named hand buttons', menuAndFollowupRows.ringHand.interactionOpen && /Left hand|Right hand/i.test(menuAndFollowupRows.ringHand.options.map(o => o.text).join(' ')));
    await evalExpr(cdp, `(() => { const t=window.__nethackPromptTest; t.event({name:'shim_start_menu', window:91}); t.event({name:'shim_add_menu', window:91, selector:97, text:'a - 2 arrows in a bag of holding', glyphChar:41, semanticKind:'object', semanticName:'arrows'}); t.event({name:'shim_add_menu', window:91, selector:98, text:'b - potion of healing inside bag', glyphChar:33, semanticKind:'object', semanticName:'potion of healing'}); t.event({name:'shim_end_menu', window:91, prompt:'Loot which items from the bag of holding?'}); t.event({name:'shim_select_menu', window:91, how:2}); return true; })()`);
    const lootPath = await shot(cdp, 'loot-container-transfer-rows.png');
    await evalExpr(cdp, `window.__nethackPromptTest.event({name:'shim_yn_function', query:'What type of object do you want to drop?', choices:'!?+$'})`);
    const classPath = await shot(cdp, 'drop-type-class-rows.png');
    await evalExpr(cdp, `(() => { const t=window.__nethackPromptTest; t.event({name:'shim_start_menu', window:93}); t.event({name:'shim_add_menu', window:93, selector:97, text:'a - force bolt  Pw 5  Fail 0%'}); t.event({name:'shim_add_menu', window:93, selector:98, text:'b - healing  Pw 12  Fail 20%'}); t.event({name:'shim_end_menu', window:93, prompt:'Choose which spell to cast'}); t.event({name:'shim_select_menu', window:93, how:1}); return true; })()`);
    const spellPath = await shot(cdp, 'spell-menu-rows.png');
    const identifyChooser = await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest;
      t.reset(); t.setRunning(true);
      t.event({name:'shim_start_menu', window:94});
      t.event({name:'shim_add_menu', window:94, selector:111, text:'o - a spellbook of identify', glyphChar:43, semanticKind:'object', semanticName:'spellbook of identify'});
      t.event({name:'shim_add_menu', window:94, selector:112, text:'p - a shining spellbook', glyphChar:43, semanticKind:'object', semanticName:'spellbook', semanticKnown:false, semanticAppearance:'shining spellbook'});
      t.event({name:'shim_add_menu', window:94, selector:109, text:'m - a towel', glyphChar:40, semanticKind:'object', semanticName:'towel'});
      t.event({name:'shim_add_menu', window:94, selector:113, text:'q - a blue gem', glyphChar:42, semanticKind:'object', semanticName:'blue gem'});
      t.event({name:'shim_add_menu', window:94, selector:116, text:'t - a green gem', glyphChar:42, semanticKind:'object', semanticName:'green gem'});
      t.event({name:'shim_end_menu', window:94, prompt:'What would you like to identify next?'});
      t.event({name:'shim_select_menu', window:94, how:2});
      return t.dialog();
    })()`);
    assert(
      'identify chooser with spellbook rows stays inventory, not cast-spell UI',
      identifyChooser.interactionOpen
        && /Choose item|Identify|Inventory/i.test(identifyChooser.title || '')
        && !/Spellbook|Spell palette/i.test(`${identifyChooser.title}\n${identifyChooser.panelControls?.text || ''}`)
        && identifyChooser.options.every((o) => /inventory-row/.test(o.className || ''))
        && !identifyChooser.options.some((o) => /spell-row|\bCAST\b/i.test(`${o.className || ''} ${o.text || ''}`))
        && /spellbook of identify|shining spellbook|towel|blue gem/i.test(identifyChooser.options.map((o) => o.text).join(' ')),
      JSON.stringify({ title: identifyChooser.title, classes: identifyChooser.options.map((o) => o.className), text: identifyChooser.options.map((o) => o.text) }),
    );
    const identifyPath = await shot(cdp, 'identify-chooser-compact-rows.png');
    await evalExpr(cdp, `window.__nethackPromptTest.event({name:'shim_yn_function', query:'On which hand do you want to put on the ring?', choices:'lr\\u001b'})`);
    const followupPath = await shot(cdp, 'ring-hand-followup-buttons.png');

    const lazyLoadSuccess = await evalExpr(cdp, `(async () => { const t=window.__nethackPromptTest; t.reset(); t.setRunning(true); t.event({name:'shim_yn_function', query:'What do you want to apply? [ab or ?*]', choices:''}); const loading = t.dialog(); const sentAfterPrompt = t.sentInputs().join(''); t.event({name:'shim_start_menu', window:101}); t.event({name:'shim_add_menu', window:101, selector:97, text:'a - a lamp', glyphChar:40, semanticKind:'object', semanticName:'lamp'}); t.event({name:'shim_add_menu', window:101, selector:98, text:'b - a lock pick', glyphChar:40, semanticKind:'object', semanticName:'lock pick'}); t.event({name:'shim_add_menu', window:101, selector:99, text:'c - a disallowed rock', glyphChar:42, semanticKind:'object', semanticName:'rock'}); t.event({name:'shim_end_menu', window:101, prompt:'Pick an object.'}); await new Promise(resolve => setTimeout(resolve, 0)); const loaded = t.dialog(); return { loading, sentAfterPrompt, loaded, sentFinal: t.sentInputs().join('') }; })()`);
    assert('lazy load starts with safe loading state', lazyLoadSuccess.loading.interactionOpen && /Loading inventory choices/i.test(lazyLoadSuccess.loading.title) && /Loading inventory choices/i.test(lazyLoadSuccess.loading.prompt) && lazyLoadSuccess.loading.options.length === 0, JSON.stringify(lazyLoadSuccess.loading));
    assert('lazy load requests only matching inventory list', lazyLoadSuccess.sentAfterPrompt === '?', lazyLoadSuccess.sentAfterPrompt);
    assert('lazy load returned rows replace loading state', lazyLoadSuccess.loaded.interactionOpen && lazyLoadSuccess.loaded.options.filter(o => /inventory-row/.test(o.className || '')).length === 2 && /lamp|lock pick/i.test(lazyLoadSuccess.loaded.options.map(o => o.text).join(' ')) && !lazyLoadSuccess.loaded.options.some(o => /rock/i.test(o.text || '')), JSON.stringify(lazyLoadSuccess.loaded));
    assert('lazy load success does not send item selectors', lazyLoadSuccess.sentFinal === '?', lazyLoadSuccess.sentFinal);

    const noInventoryBlocked = await evalExpr(cdp, `(async () => { const t=window.__nethackPromptTest; t.reset(); t.setRunning(true); t.event({name:'shim_yn_function', query:'What do you want to apply? [ab or ?*]', choices:''}); const loading = t.dialog(); await new Promise(resolve => setTimeout(resolve, 1050)); const fallback = t.dialog(); return { loading, fallback, sent: t.sentInputs().join('') }; })()`);
    assert('no cached inventory first shows loading state', noInventoryBlocked.loading.interactionOpen && /Loading inventory choices/i.test(noInventoryBlocked.loading.title));
    assert('no cached inventory fallback is safe and concise', noInventoryBlocked.fallback.interactionOpen && !noInventoryBlocked.fallback.options.some(o => /inventory-row/.test(o.className || '')) && /Item names unavailable/i.test(noInventoryBlocked.fallback.prompt) && noInventoryBlocked.fallback.options.some(o => /Name unavailable|Show matching inventory|Show all inventory/i.test(o.text || '')) && !noInventoryBlocked.fallback.options.some(o => /Inventory selector|NetHack did not provide inventory data/i.test(`${o.text || ''}\n${noInventoryBlocked.fallback.prompt || ''}`)) && noInventoryBlocked.sent === '?', JSON.stringify(noInventoryBlocked));
    await evalExpr(cdp, `(() => { const t=window.__nethackPromptTest; t.reset(); t.setRunning(true); t.event({name:'shim_yn_function', query:'What do you want to apply? [ab or ?*]', choices:''}); return true; })()`);
    const lazyLoadingPath = await shot(cdp, 'lazy-load-inventory-loading-state.png');
    await evalExpr(cdp, `new Promise(resolve => setTimeout(resolve, 1050))`);
    const lazyFallbackPath = await shot(cdp, 'lazy-load-inventory-fallback-state.png');

    const summary = { ok: true, screenshotPath, representativePath, lootPath, classPath, spellPath, identifyPath, followupPath, lazyLoadingPath, lazyFallbackPath, screenshotCase, workflowRows, menuAndFollowupRows, identifyChooser, lazyLoadSuccess, noInventoryBlocked };
    fs.writeFileSync(path.join(outDir, 'inventory-selection-gui-audit-summary.json'), JSON.stringify(summary, null, 2));
    console.log(`inventory selection GUI audit test passed: ${screenshotPath}`);
    cleanup();
  } catch (error) {
    cleanup();
    fs.writeFileSync(path.join(outDir, 'inventory-selection-gui-audit-failure.log'), error.stack || String(error));
    throw error;
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
