const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_QUAFF_SELECTOR_OUT_DIR || path.join(root, 'test-output', 'quaff-potion-selector-regression');
const port = Number(process.env.NH_QUAFF_SELECTOR_CDP_PORT || 9486);
const width = Number(process.env.NH_QUAFF_SELECTOR_WIDTH || 1280);
const height = Number(process.env.NH_QUAFF_SELECTOR_HEIGHT || 900);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 100) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out waiting'); }
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
function assert(name, ok, details = '') { if (!ok) throw new Error(`${name} failed${details ? `: ${details}` : ''}`); }

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

    const before = await evalExpr(cdp, `(() => {
      const t = window.__nethackPromptTest; t.reset(); t.setRunning(true);
      t.event({name:'shim_start_menu', window:201});
      t.event({name:'shim_add_menu', window:201, selector:106, text:'j - a brown potion', glyphChar:33, semanticKind:'object', semanticName:'brown potion'});
      t.event({name:'shim_add_menu', window:201, selector:104, text:'h - a potion of healing', glyphChar:33, semanticKind:'object', semanticName:'potion of healing'});
      t.event({name:'shim_end_menu', window:201, prompt:'Inventory:'});
      t.event({name:'shim_yn_function', query:'What do you want to drink? [j or ?*]', choices:''});
      return t.dialog();
    })()`);
    const beforePath = await shot(cdp, '01-quaff-prompt-cached-potion-name.png');
    const beforeText = `${before.title}\n${before.prompt}\n${before.options.map(o => o.text).join('\n')}`;
    assert('quaff prompt shows actual potion row for selector j', before.interactionOpen && before.options.some(o => o.key === 'j' && /brown potion/i.test(o.text || '') && /inventory-row/.test(o.className || '')), JSON.stringify(before));
    assert('quaff prompt does not show raw Inventory selector fallback', !/Inventory selector|Name unavailable|Show matching inventory|Show all inventory/i.test(beforeText), beforeText);
    assert('quaff prompt is not letters-only', before.options.some(o => /brown potion|potion of healing/i.test(o.text || '')) && !before.options.every(o => /^[-a-z?*]$/i.test(String(o.text || '').trim())), beforeText);

    const lazy = await evalExpr(cdp, `(async () => {
      const t = window.__nethackPromptTest; t.reset(); t.setRunning(true);
      t.event({name:'shim_yn_function', query:'What do you want to drink? [j or ?*]', choices:''});
      const loading = t.dialog(); const sentAfterPrompt = t.sentInputs().join('');
      t.event({name:'shim_start_menu', window:202});
      t.event({name:'shim_add_menu', window:202, selector:106, text:'j - a brown potion', glyphChar:33, semanticKind:'object', semanticName:'brown potion'});
      t.event({name:'shim_add_menu', window:202, selector:97, text:'a - a disallowed apple', glyphChar:37, semanticKind:'object', semanticName:'apple'});
      t.event({name:'shim_end_menu', window:202, prompt:'Inventory:'});
      await new Promise(resolve => setTimeout(resolve, 0));
      return { loading, loaded: t.dialog(), sentAfterPrompt, sentFinal: t.sentInputs().join('') };
    })()`);
    const afterPath = await shot(cdp, '02-quaff-prompt-after-safe-lazy-load.png');
    const loadedText = `${lazy.loaded.title}\n${lazy.loaded.prompt}\n${lazy.loaded.options.map(o => o.text).join('\n')}`;
    assert('lazy quaff starts with loading, not raw selector labels', /Loading inventory choices/i.test(lazy.loading.title) && !/Inventory selector/i.test(JSON.stringify(lazy.loading)), JSON.stringify(lazy.loading));
    assert('lazy quaff sends only ? to request matching inventory', lazy.sentAfterPrompt === '?' && lazy.sentFinal === '?', JSON.stringify(lazy));
    assert('lazy quaff returned menu rows replace loading state with brown potion', lazy.loaded.interactionOpen && lazy.loaded.options.some(o => o.key === 'j' && /brown potion/i.test(o.text || '') && /inventory-row/.test(o.className || '')), loadedText);
    assert('lazy quaff ignores nonmatching inventory rows', !/disallowed apple/i.test(loadedText), loadedText);
    assert('lazy quaff does not show raw fallback labels', !/Inventory selector|Name unavailable|Show matching inventory|Show all inventory/i.test(loadedText), loadedText);

    const cancelLazy = await evalExpr(cdp, `(async () => {
      const t = window.__nethackPromptTest; t.reset(); t.setRunning(true);
      t.event({name:'shim_yn_function', query:'What do you want to drink? [j or ?*]', choices:''});
      const loading = t.dialog();
      document.getElementById('interaction-cancel')?.click();
      const afterCancel = t.dialog();
      const sentAfterCancel = t.sentInputs().join('');
      t.event({name:'shim_start_menu', window:203});
      t.event({name:'shim_add_menu', window:203, selector:106, text:'j - a brown potion', glyphChar:33, semanticKind:'object', semanticName:'brown potion'});
      t.event({name:'shim_end_menu', window:203, prompt:'Inventory:'});
      await new Promise(resolve => setTimeout(resolve, 0));
      return { loading, afterCancel, afterLateMenu: t.dialog(), sentAfterCancel, body: document.body.innerText };
    })()`);
    const cancelPath = await shot(cdp, '03-quaff-escape-cancels-without-second-menu.png');
    assert('Escape/cancel during lazy quaff sends cancel after inventory request', /Loading inventory choices/i.test(cancelLazy.loading.title) && cancelLazy.sentAfterCancel === '?\u001b', JSON.stringify(cancelLazy));
    assert('late inventory rows from canceled quaff lazy-load do not cascade into second equipment/drink menu', !cancelLazy.afterLateMenu.interactionOpen && !/Equipment \/ Inventory|Choose item/i.test(`${cancelLazy.afterLateMenu.title}\n${cancelLazy.afterLateMenu.prompt}`), JSON.stringify(cancelLazy));

    const staleIntro = await evalExpr(cdp, `(async () => {
      const t = window.__nethackPromptTest; t.reset(); t.setRunning(true);
      t.event({name:'shim_create_nhwindow', return:301, windowType:4});
      ['It is written in the Book of Camaxlti:', 'After the Creation, the cruel god Moloch rebelled against the authority of Marduk the Creator.', 'Your god seeks to possess the Amulet of Yendor.', 'Your hour of destiny has come. Go bravely with Camaxlti!'].forEach(text => t.event({name:'shim_putstr', window:301, text}));
      t.event({name:'shim_display_nhwindow', window:301});
      document.getElementById('intro-continue')?.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      t.clearSentInputs();
      t.event({name:'shim_yn_function', query:'What do you want to drink? [j or ?*]', choices:''});
      await new Promise(resolve => setTimeout(resolve, 1050));
      const waiting = t.dialog();
      const beforeTextWindowSent = t.sentInputs().join('');
      t.event({name:'shim_create_nhwindow', return:302, windowType:4});
      ['It is written in the Book of Camaxlti:', 'After the Creation, the cruel god Moloch rebelled against the authority of Marduk the Creator.', 'Your god seeks to possess the Amulet of Yendor.', 'Your hour of destiny has come. Go bravely with Camaxlti! Hello Sable50, welcome to NetHack! You see here a brown potion. j - a brown potion. Never mind.'].forEach(text => t.event({name:'shim_putstr', window:302, text}));
      t.event({name:'shim_display_nhwindow', window:302});
      await new Promise(resolve => setTimeout(resolve, 0));
      return {
        waiting,
        sent: t.sentInputs().join(''), beforeTextWindowSent,
        dialog: t.dialog(),
        introOpen: document.getElementById('intro-dialog')?.open,
        documentOpen: document.getElementById('document-dialog')?.open,
        bodyText: document.body.innerText,
        messages: t.messages().slice(-5),
      };
    })()`);
    const afterShowMatchingPath = await shot(cdp, '04-after-show-matching-inventory-no-intro.png');
    const staleText = `${staleIntro.dialog.title}\n${staleIntro.dialog.prompt}\n${staleIntro.dialog.options.map(o => o.text).join('\n')}\n${staleIntro.bodyText}`;
    assert('timeout keeps a clear no-data state instead of raw selector fallbacks', staleIntro.waiting.interactionOpen && /Drinkable items unavailable|Drinkable item names are not available/i.test(`${staleIntro.waiting.title}\n${staleIntro.waiting.prompt}`) && staleIntro.waiting.options.length === 0 && !/Inventory selector|Name unavailable|Item j|Show matching inventory|Show all inventory/i.test(JSON.stringify(staleIntro.waiting)), JSON.stringify(staleIntro.waiting));
    assert('lazy quaff only asks NetHack for inventory and never chooses j', staleIntro.sent === '?' && staleIntro.beforeTextWindowSent === '?' && !/j/.test(staleIntro.sent), staleIntro.sent);
    assert('stale intro document is not surfaced during quaff prompt flow', !staleIntro.introOpen && !staleIntro.documentOpen && !/The Book of Camaxlti[\s\S]*Begin the descent/i.test(staleText), staleText.slice(0, 1000));
    assert('quaff prompt converts text-window inventory into a clean potion row', staleIntro.dialog.interactionOpen && /What do you want to drink/i.test(staleIntro.dialog.prompt) && staleIntro.dialog.options.length === 1 && staleIntro.dialog.options.some(o => o.key === 'j' && /brown potion/i.test(o.text || '') && /inventory-row/.test(o.className || '')) && !/Name unavailable|Show matching inventory|Show all inventory|What do you want to drink\?\s*\[j or \?\*\].*choice-button/i.test(staleText), JSON.stringify(staleIntro.dialog));

    const summary = { ok: true, beforePath, afterPath, cancelPath, afterShowMatchingPath, before, lazy, cancelLazy: { ...cancelLazy, body: undefined }, staleIntro: { ...staleIntro, bodyText: undefined } };
    fs.writeFileSync(path.join(outDir, 'quaff-potion-selector-regression-summary.json'), JSON.stringify(summary, null, 2));
    console.log(`quaff potion selector regression passed: ${beforePath} ${afterPath} ${afterShowMatchingPath}`);
    cleanup();
  } catch (error) {
    cleanup();
    fs.writeFileSync(path.join(outDir, 'quaff-potion-selector-regression-failure.log'), error.stack || String(error));
    throw error;
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
