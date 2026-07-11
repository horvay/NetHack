const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-monster-sense-tip');
const scenarioId = 'fountain/monster-sense-tip';
const port = Number(process.env.NH_MONSTER_SENSE_TIP_CDP_PORT || 9684);
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function send(cdp, ch) { await evalExpr(cdp, `window.__nethackAutomation.sendKeycode(${JSON.stringify(ch.charCodeAt(0))})`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
  shim: document.getElementById('shim-output')?.innerText || '',
  dialog: window.__nethackPromptTest?.dialog?.(),
  prompt: window.__nethackPromptTest?.prompt?.(),
  status: document.getElementById('status')?.innerText || '',
  monsterCells: Array.from(document.querySelectorAll('.tile-cell')).filter((cell) => /monster|jackal/i.test([cell.dataset.semanticKind || '', cell.dataset.semanticName || '', cell.getAttribute('aria-label') || '', cell.textContent || ''].join(' '))).map((cell) => ({ x: cell.dataset.mapX, y: cell.dataset.mapY, kind: cell.dataset.semanticKind || '', name: cell.dataset.semanticName || '', label: cell.getAttribute('aria-label') || '', text: cell.textContent || '' })),
  body: document.body.innerText
}))()`); }
async function start(cdp) { await click(cdp, '#start-shim'); await delay(250); await click(cdp, '#confirm-character'); await waitFor(async () => (await state(cdp)).running, 20000); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', (d) => { logs += d; process.stdout.write(d); }); child.stderr.on('data', (d) => { logs += d; process.stderr.write(d); });
  let cdp; const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); fs.writeFileSync(path.join(outDir, 'electron.log'), logs); };
  process.on('exit', cleanup);
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    const loaded = await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
    const startShot = await shot(cdp, '01-fountain-scenario-start.png');

    await send(cdp, 'q');
    await waitFor(async () => /Drink from the fountain/i.test(`${(await state(cdp)).dialog?.prompt || ''}\n${(await state(cdp)).body}`), 10000).catch(async (error) => {
      const debug = await state(cdp).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, 'debug-after-q-timeout.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, 'debug-after-q-timeout.png').catch(() => undefined);
      throw error;
    });
    const afterQ = await state(cdp);
    fs.writeFileSync(path.join(outDir, 'debug-after-q.json'), JSON.stringify(afterQ, null, 2));
    assert('drink command opens the real fountain prompt', /Drink from the fountain/i.test(`${afterQ.dialog?.prompt || ''}\n${afterQ.body}`), JSON.stringify(afterQ.dialog));
    const beforeSense = afterQ;
    await click(cdp, '#interaction-options .choice-button[data-key="y"]');

    const sensed = await waitFor(async () => {
      const s = await state(cdp);
      if (s.dialog?.interactionOpen && /Tip|Spellbook/i.test(s.dialog.title || '')) throw new Error(`unexpected monster-sense modal: ${JSON.stringify(s.dialog)}`);
      return /You sense the presence of monsters/i.test(s.body) && /Move cursor to monster of interest|For instructions type/i.test(s.body) && !s.dialog?.interactionOpen ? s : null;
    }, 15000).catch(async (error) => {
      const debug = await state(cdp).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, 'debug-sensed-timeout.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, 'debug-sensed-timeout.png').catch(() => undefined);
      throw error;
    });
    fs.writeFileSync(path.join(outDir, 'debug-sensed-farlook.json'), JSON.stringify(sensed, null, 2));
    const beforeCoords = new Set((beforeSense.monsterCells || []).map((cell) => `${cell.x},${cell.y}`));
    const newlyRevealed = (sensed.monsterCells || []).filter((cell) => !beforeCoords.has(`${cell.x},${cell.y}`));
    const senseShot = await shot(cdp, '02-real-fountain-monster-sense-no-modal-farlook.png');
    assert('real fountain monster detection leaves no interaction modal open', !sensed.dialog?.interactionOpen, JSON.stringify(sensed.dialog));
    assert('monster-sense message is in the visible log', /You sense the presence of monsters/i.test(sensed.body), sensed.body);
    assert('farlook browse instructions are message-log text, not modal text', /Move cursor to monster of interest|For instructions type/i.test(sensed.body) && !/Farlooking or selecting a map location|Game time does not advance|Spellbook|Spell palette/i.test(sensed.body), sensed.body);
    assert('fountain scenario reveals monster cells after forced fountain monster detection', (sensed.monsterCells || []).length > (beforeSense.monsterCells || []).length || newlyRevealed.length > 0, JSON.stringify({ before: beforeSense.monsterCells, after: sensed.monsterCells, newlyRevealed }));
    await send(cdp, ' ');
    const afterDismiss = await waitFor(async () => { const s = await state(cdp); return /Done\.|water tastes like nothing/i.test(s.body) && !s.dialog?.interactionOpen && !/monster-sense map browse active/i.test(s.status || '') ? s : null; }, 10000);
    fs.writeFileSync(path.join(outDir, 'debug-after-dismiss.json'), JSON.stringify(afterDismiss, null, 2));
    const afterDismissShot = await shot(cdp, '03-after-any-key-normal-gameplay.png');
    assert('space dismisses fountain farlook browse and leaves ordinary no-modal gameplay', !afterDismiss.dialog?.interactionOpen && /Done\.|water tastes like nothing/i.test(afterDismiss.body) && !/monster-sense map browse active/i.test(afterDismiss.status || ''), JSON.stringify(afterDismiss.dialog));

    const summary = [`# Real fountain monster-sense no-modal Electron smoke`, '', 'PASS', '', `Scenario: ${scenarioId}`, `Start screenshot: ${startShot}`, `No-modal farlook screenshot: ${senseShot}`, `After keypress screenshot: ${afterDismissShot}`, `Sensed state JSON: ${path.join(outDir, 'debug-sensed-farlook.json')}`, `After-dismiss state JSON: ${path.join(outDir, 'debug-after-dismiss.json')}`, '', 'Steps:', '1. Started real Electron with fixture scenario: hero standing on a fountain, scenario eventResults forcing the next drink-fountain result to monster-detection, and hostile monsters to reveal.', '2. Sent the real player quaff command `q`.', '3. Answered `y` to NetHack’s real `Drink from the fountain?` prompt.', '4. Verified NetHack message “You sense the presence of monsters.”, revealed monster map cells, and farlook browse instructions in the message log.', '5. Verified no Tip, Spellbook, or other interaction modal opened for the fountain monster-sense result.', '6. Sent Space and verified farlook browse ended, no modal remained, and no monster-sense browse status remained.', '', 'Assertions:', '- message log includes “You sense the presence of monsters.” from the fountain drink path', '- map contains monster cells after the forced fountain monster-detection result', '- farlook browse instruction is message-log text only', '- no Tip/Spellbook/action modal appears after the effect', '- Space returns to ordinary gameplay without an interaction dialog or browse status', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
