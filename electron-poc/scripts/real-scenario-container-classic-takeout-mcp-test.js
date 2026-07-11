const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_CLASSIC_TAKEOUT_OUT_DIR || path.join(root, 'test-output', 'real-scenario-container-classic-takeout');
const scenarioId = process.env.NH_CLASSIC_TAKEOUT_SCENARIO_ID || 'container/wand-and-dwarf-corpse-chest-on-hero';
const port = Number(process.env.NH_CLASSIC_TAKEOUT_CDP_PORT || 9633);
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 100) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const file = path.join(outDir, name); fs.writeFileSync(file, Buffer.from(res.data, 'base64')); return file; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function drag(cdp, fromExpression, toSelector) {
  const points = await evalExpr(cdp, `(() => { const from = (${fromExpression}); const to = document.querySelector(${JSON.stringify(toSelector)}); from?.scrollIntoView?.({block:'center', inline:'center'}); to?.scrollIntoView?.({block:'center', inline:'center'}); const a = from?.getBoundingClientRect(); const b = to?.getBoundingClientRect(); return a && b ? { from:{x:a.left+a.width/2,y:a.top+a.height/2}, to:{x:b.left+b.width/2,y:b.top+b.height/2} } : null; })()`);
  if (!points) throw new Error(`missing drag target for ${fromExpression} -> ${toSelector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.from.x, y: points.from.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: points.from.x, y: points.from.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 10; i += 1) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.from.x + ((points.to.x - points.from.x) * i / 10), y: points.from.y + ((points.to.y - points.from.y) * i / 10), button: 'left', buttons: 1 }); await delay(45); }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: points.to.x, y: points.to.y, button: 'left', buttons: 0, clickCount: 1 });
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id), sent: window.__nethackPromptTest?.sentInputs?.().join('') || '', messages: window.__nethackPromptTest?.messages?.().slice(-24).map((m) => m.text || String(m)) || [], container: window.__nethackPromptTest?.container?.(), containerSnapshots: window.__nethackPromptTest?.containerSnapshots?.(), transferTransactions: window.__nethackPromptTest?.transferTransactions?.(), promptPanel: { hidden: document.getElementById('prompt-panel')?.hidden, text: document.getElementById('prompt-panel')?.textContent || '' }, menuPanel: { hidden: document.getElementById('menu-panel')?.hidden, text: document.getElementById('menu-panel')?.textContent || '' }, status: document.getElementById('status')?.textContent || '', interaction: window.__nethackPromptTest?.dialog?.(), running: window.__nethackAutomation?.state?.().runningState?.running || false, body: document.body.innerText, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '' }))()`); }
function extendedCommandModalVisible(s) { const text = `${s?.interaction?.title || ''}\n${s?.interaction?.prompt || ''}\n${s?.promptPanel?.hidden ? '' : s?.promptPanel?.text || ''}\n${s?.menuPanel?.hidden ? '' : s?.menuPanel?.text || ''}`; return Boolean(s?.interaction?.interactionOpen && /Extended command|filter\/type any # command|matching options/i.test(text)); }
async function startNoExtendedCommandModalMonitor(cdp, label, stepMs = 30) {
  await evalExpr(cdp, `(() => { window.__classicTakeoutNoExtended = window.__classicTakeoutNoExtended || {}; const label = ${JSON.stringify(label)}; const startedAt = performance.now(); const records = []; const collect = (trigger) => { const interaction = document.getElementById('interaction-dialog'); const title = document.getElementById('interaction-title')?.textContent || ''; const prompt = document.getElementById('interaction-prompt')?.textContent || ''; const promptPanel = document.getElementById('prompt-panel'); const menuPanel = document.getElementById('menu-panel'); const text = [title, prompt, promptPanel?.hidden ? '' : promptPanel?.textContent || '', menuPanel?.hidden ? '' : menuPanel?.textContent || ''].join('\\n'); const hit = Boolean(interaction?.open && /Extended command|filter\\/type any # command|matching options/i.test(text)); records.push({ atMs: Math.round(performance.now() - startedAt), trigger, hit, interactionOpen: Boolean(interaction?.open), title, prompt, promptPanelHidden: Boolean(promptPanel?.hidden), promptPanelText: promptPanel?.textContent || '', menuPanelHidden: Boolean(menuPanel?.hidden), menuPanelText: menuPanel?.textContent || '', status: document.getElementById('status')?.textContent || '' }); }; collect('install-before-drag'); const observer = new MutationObserver(() => collect('mutation')); observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['open', 'hidden', 'class', 'style'] }); let raf = 0; const tick = () => { collect('animation-frame'); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); window.__classicTakeoutNoExtended[label] = { stop: () => { cancelAnimationFrame(raf); observer.disconnect(); collect('stop'); return records.slice(); } }; })()`);
  const cdpSamples = [];
  const start = Date.now();
  let stopped = false;
  const worker = (async () => { while (!stopped) { const s = await state(cdp).catch((error) => ({ error: String(error?.message || error) })); cdpSamples.push({ atMs: Date.now() - start, trigger: 'cdp-poll', interaction: s.interaction, promptPanel: s.promptPanel, menuPanel: s.menuPanel, status: s.status, containerActive: s.container?.active, error: s.error }); await delay(stepMs); } })();
  return { async stop() { stopped = true; await worker; const domSamples = await evalExpr(cdp, `(() => window.__classicTakeoutNoExtended?.[${JSON.stringify(label)}]?.stop?.() || [])()`); const combined = { cdpSamples, domSamples }; fs.writeFileSync(path.join(outDir, `${label}-samples.json`), JSON.stringify(combined, null, 2)); const bad = cdpSamples.find(extendedCommandModalVisible) || domSamples.find((sample) => sample.hit); assert(`${label}: Extended command modal never appears in sampled classic transfer window`, !bad, JSON.stringify(bad)); return combined; } };
}
async function startGame(cdp) {
  await click(cdp, '#start-shim');
  await delay(250);
  if ((await state(cdp)).dialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game');
  await waitFor(() => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 7000);
  await click(cdp, '#confirm-character');
  await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return s.running ? s : null; }, 20000);
  if ((await state(cdp)).dialogs.includes('intro-dialog')) await click(cdp, '#intro-continue');
  await waitFor(async () => !(await state(cdp)).dialogs.includes('intro-dialog'), 5000);
}
async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup); child.stdout.on('data', (d) => process.stdout.write(d)); child.stderr.on('data', (d) => process.stderr.write(d));
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await startGame(cdp);
    const loaded = await waitFor(async () => { const s = await state(cdp); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
    await waitFor(async () => (await state(cdp)).container?.active || (await state(cdp)).body.includes('Open chest') ? true : null, 10000);
    const contextShot = await shot(cdp, '01-context-open-chest.png');
    await click(cdp, '#context-action-bar button[data-context-action-id="open-container"]');
    const panel = await waitFor(async () => { const s = await state(cdp); const text = s.container?.text || ''; return s.container?.active && /dwarf corpse/i.test(text) && /wand of digging|wand/i.test(text) && /tin opener/i.test(text) ? s : null; }, 15000);
    fs.writeFileSync(path.join(outDir, '02-container-panel-state.json'), JSON.stringify(panel, null, 2));
    const panelShot = await shot(cdp, '02-container-panel-before-classic-drag.png');
    const corpseRow = panel.container.left.find((row) => /corpse/i.test(row.text));
    const wandRow = panel.container.left.find((row) => /wand/i.test(row.text));
    assert('scenario left pane has distinct corpse and wand rows', corpseRow && wandRow && corpseRow.selector !== wandRow.selector, JSON.stringify(panel.container.left));
    await evalExpr(cdp, `window.__nethackPromptTest.setForceClassicContainerTakeOutForTest(true); window.__nethackPromptTest.clearSentInputs();`);
    const monitor = await startNoExtendedCommandModalMonitor(cdp, '03-classic-takeout-no-extended-modal');
    await drag(cdp, `Array.from(document.querySelectorAll('#container-transfer-panel [data-container-pane="left"] .container-item-row')).find((row) => /wand/i.test(row.innerText))`, '#container-transfer-panel [data-container-pane="right"]');
    const after = await waitFor(async () => {
      const s = await state(cdp);
      const leftText = (s.container?.left || []).map((row) => row.text).join('\n');
      const rightText = (s.container?.right || []).map((row) => row.text).join('\n');
      const classic = new RegExp(`#loot\\noa\\n${wandRow.selector}\\n`).test(s.sent || '');
      return s.container?.active && classic && /corpse/i.test(leftText) && !/wand/i.test(leftText) && /wand/i.test(rightText) ? s : null;
    }, 15000);
    const samples = await monitor.stop();
    fs.writeFileSync(path.join(outDir, '03-after-classic-takeout-state.json'), JSON.stringify(after, null, 2));
    const afterShot = await shot(cdp, '03-after-classic-takeout-wand-only.png');
    assert('actual sent input is classic #loot take-out/category/item for the dragged wand', new RegExp(`#loot\\noa\\n${wandRow.selector}\\n`).test(after.sent || '') && !new RegExp(`#loot\\noa\\n${corpseRow.selector}\\n`).test(after.sent || ''), JSON.stringify({ sent: after.sent, corpseSelector: corpseRow.selector, wandSelector: wandRow.selector }));
    assert('dwarf corpse remains in container and only wand moves to inventory', after.container.left.some((row) => /corpse/i.test(row.text)) && !after.container.left.some((row) => /wand/i.test(row.text)) && after.container.right.some((row) => /wand/i.test(row.text)), JSON.stringify(after.container));
    assert('no prompt asks to take the corpse or complains about corpse weight', !/take.*corpse|corpse.*too heavy|too heavy.*corpse|also take/i.test(`${after.messages.join('\n')}\n${after.body}\n${after.shim}`), `${after.messages.join('\n')}\n${after.body}`.slice(-2000));
    assert('no Extended command modal visible after classic take-out', !extendedCommandModalVisible(after), JSON.stringify(after.interaction));
    await click(cdp, '#container-transfer-panel .container-transfer-heading button');
    await waitFor(async () => !(await state(cdp)).container?.active, 5000);
    const beforeReopen = await state(cdp);
    const beforeReopenShimLength = (beforeReopen.shim || '').length;
    await click(cdp, '#context-action-bar button[data-context-action-id="open-container"]');
    const reopened = await waitFor(async () => {
      const s = await state(cdp);
      const leftText = (s.container?.left || []).map((row) => row.text).join('\n');
      const newShim = (s.shim || '').slice(beforeReopenShimLength);
      const takeOutBlocks = newShim.split(/\"name\":\"shim_start_menu\"/).filter((block) => /Take out what\?/.test(block));
      const latestTakeOutBlock = takeOutBlocks[takeOutBlocks.length - 1] || '';
      const coreMenuCorpseOnly = /corpse/i.test(latestTakeOutBlock) && !/wand of digging/i.test(latestTakeOutBlock);
      return s.container?.active && /corpse/i.test(leftText) && !/wand/i.test(leftText) && coreMenuCorpseOnly ? { ...s, newShimAfterReopen: newShim, reopenedTakeOutBlock: latestTakeOutBlock } : null;
    }, 15000);
    fs.writeFileSync(path.join(outDir, '04-reopened-container-core-state.json'), JSON.stringify(reopened, null, 2));
    const reopenedShot = await shot(cdp, '04-reopened-container-core-corpse-only.png');
    assert('reopened real #loot menu proves core container now contains only the corpse', reopened.container.left.some((row) => /corpse/i.test(row.text)) && !reopened.container.left.some((row) => /wand/i.test(row.text)) && /Take out what\?/.test(reopened.reopenedTakeOutBlock || '') && /corpse/i.test(reopened.reopenedTakeOutBlock || '') && !/wand of digging/i.test(reopened.reopenedTakeOutBlock || ''), JSON.stringify({ left: reopened.container.left, takeOutBlock: reopened.reopenedTakeOutBlock || '' }));
    const summary = [`# Classic container take-out real Electron scenario`, '', 'PASS', '', `Scenario: ${scenarioId}`, `Context screenshot: ${contextShot}`, `Before classic drag screenshot: ${panelShot}`, `After classic drag screenshot: ${afterShot}`, `Reopened core container screenshot: ${reopenedShot}`, `Initial state: ${path.join(outDir, '02-container-panel-state.json')}`, `After state: ${path.join(outDir, '03-after-classic-takeout-state.json')}`, `Reopened core state: ${path.join(outDir, '04-reopened-container-core-state.json')}`, `No-Extended samples: ${path.join(outDir, '03-classic-takeout-no-extended-modal-samples.json')} (${samples.cdpSamples.length} CDP samples, ${samples.domSamples.length} DOM/frame samples)`, '', `Corpse selector: ${corpseRow.selector}`, `Wand selector: ${wandRow.selector}`, `Sent input: ${JSON.stringify(after.sent)}`, '', 'Verified:', '- forced renderer take-out through classic #loot fallback instead of direct container.transfer', '- drag began after DOM/RAF/CDP no-Extended-command monitor installation', '- actual input includes #loot, take-out `o`, All types/category `a`, and the wand selector/newline', '- the corpse selector was not sent as the final item selector', '- dwarf corpse remains in the container and the wand moves to inventory', '- closing and reopening the real container #loot menu shows only the dwarf corpse in core container state', '- no corpse/too-heavy prompt and no Extended-command modal appeared', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
