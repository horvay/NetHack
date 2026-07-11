const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');
const outDir = process.env.NH_EQUIPMENT_BLOCKERS_OUT_DIR || path.join(root, 'test-output', 'workstream-c-equipment-blockers');
const basePort = Number(process.env.NH_EQUIPMENT_BLOCKERS_CDP_PORT || 0);
const width = Number(process.env.NH_ELECTRON_WINDOW_WIDTH || 1360);
const height = Number(process.env.NH_ELECTRON_WINDOW_HEIGHT || 920);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function freePort(preferred = 0) {
  async function tryListen(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(null));
      server.listen(port, '127.0.0.1', () => {
        const chosen = server.address().port;
        server.close(() => resolve(chosen));
      });
    });
  }
  if (preferred) {
    const chosen = await tryListen(preferred);
    if (chosen) return chosen;
  }
  const fallback = await tryListen(0);
  if (!fallback) throw new Error('unable to allocate CDP port');
  return fallback;
}
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
function sanitizePublicEvidenceValue(value) {
  if (typeof value === 'string') {
    if (/\(weapon in (?:hand|hands|left hand|right hand)\)/i.test(value)) {
      return value.replace(/\s*\(alternate weapon; not wielded\)\s*/ig, ' ').replace(/\s+/g, ' ').trim();
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitizePublicEvidenceValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sanitizePublicEvidenceValue(nested)]));
  return value;
}
function publicStateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const copy = sanitizePublicEvidenceValue(snapshot);
  delete copy.shim;
  copy.shimEvidence = {
    seenShim: String(snapshot.seenShim || ''),
    scenarioLoaded: /bridge_test_scenario_loaded/.test(`${snapshot.seenShim || ''}\n${snapshot.shim || ''}`),
    scenarioFailed: /bridge_test_scenario_failed/.test(`${snapshot.seenShim || ''}\n${snapshot.shim || ''}`),
  };
  return copy;
}
function writeStateSidecar(name, snapshot) {
  const p = path.join(outDir, name);
  fs.writeFileSync(p, JSON.stringify(publicStateSnapshot(snapshot), null, 2));
  return p;
}
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function press(cdp, key, code, text) { const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0; const params = { key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }; if (text !== undefined) params.text = text; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
  shim: document.getElementById('shim-output')?.innerText || '',
  dialog: window.__nethackPromptTest?.dialog?.() || {},
  equipmentSnapshot: window.__nethackPromptTest?.equipmentSnapshot?.() || {},
  equipment: window.__nethackPromptTest?.equipment?.() || {},
  inventory: window.__nethackPromptTest?.inventory?.() || {},
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  rows: Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).map((el) => { const action = el.querySelector('.row-action-pill'); return { key: el.dataset.key || '', text: el.innerText, aria: el.getAttribute('aria-label') || '', actionBlockerTokens: action?.dataset?.blockerTokens || '', actionDisabledReasonToken: action?.dataset?.disabledReasonToken || '', actionDisabledReasonLabel: action?.dataset?.disabledReasonLabel || '' }; }),
  slots: Array.from(document.querySelectorAll('.paper-doll-slots .equipment-slot')).map((el) => ({ slot: el.dataset.slot, text: el.innerText, blockerTokens: el.dataset.blockerTokens || '', title: el.title || '' })),
  contextMenu: document.querySelector('.inventory-context-menu')?.innerText || '',
  contextButtons: Array.from(document.querySelectorAll('.inventory-context-menu button')).map((button) => ({ text: button.innerText, disabled: button.disabled, actionId: button.dataset.actionId || '', title: button.title || '', disabledReasonToken: button.dataset.disabledReasonToken || '', blockerTokens: button.dataset.blockerTokens || '', disabledReasonLabel: button.dataset.disabledReasonLabel || '' })),
  feedback: document.getElementById('interaction-feedback')?.textContent || '',
  body: document.body.innerText
}))()`); }
async function start(cdp) { await click(cdp, '#start-shim'); await delay(250); await click(cdp, '#confirm-character'); await waitFor(async () => (await state(cdp)).running, 20000); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); }
async function rightClickRow(cdp, pattern) { const box = await evalExpr(cdp, `(() => { const re = new RegExp(${JSON.stringify(pattern)}, 'i'); const el = Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).find((row) => re.test(row.innerText || '')); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,text:el.innerText} : null; })()`); if (!box) throw new Error(`missing row ${pattern}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'right', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'right', clickCount: 1 }); return box; }

const scenarios = [
  {
    id: 'equipment/body-armor-over-shirt', prefix: 'armor-layering', rowPattern: 'leather armor|T-shirt',
    verify(opened) {
      const armor = (opened.slots || []).find((slot) => slot.slot === 'armor-suit') || {};
      assert('armor UI shows body-over-shirt public blocker', /Shirt covered/i.test(armor.text || '') && /blocked\.armor\.bodyOverShirt/.test(armor.blockerTokens || ''), JSON.stringify(armor));
      const slots = opened.equipmentSnapshot?.slots || [];
      assert('armor snapshot carries body-over-shirt token', slots.some((slot) => slot.slotId === 'armor.shirt' && (slot.blockedBy || []).includes('blocked.armor.bodyOverShirt')), JSON.stringify(slots));
      return ['armor/body layering shows blocked.armor.bodyOverShirt in the paper doll and snapshot'];
    },
  },
  {
    id: 'equipment/both-rings-occupied', prefix: 'both-rings', rowPattern: 'PUT ON',
    verify(opened, withMenu) {
      const left = (opened.slots || []).find((slot) => slot.slot === 'left-ring') || {};
      const right = (opened.slots || []).find((slot) => slot.slot === 'right-ring') || {};
      const putOn = (withMenu.contextButtons || []).find((button) => button.actionId === 'item.putOn.ring');
      assert('left ring UI shows both-rings public blocker', /Both ring slots are occupied/i.test(left.text || '') && /blocked\.ring\.bothOccupied/.test(left.blockerTokens || ''), JSON.stringify(left));
      assert('right ring UI shows both-rings public blocker', /Both ring slots are occupied/i.test(right.text || '') && /blocked\.ring\.bothOccupied/.test(right.blockerTokens || ''), JSON.stringify(right));
      const extraRingRow = (opened.rows || []).find((row) => /ring of adornment/i.test(row.text || '') && /blocked/i.test(row.text || '')) || {};
      assert('extra ring row exposes both-occupied blocker token', /blocked\.ring\.bothOccupied/.test(`${extraRingRow.actionDisabledReasonToken} ${extraRingRow.actionBlockerTokens}`), JSON.stringify(opened.rows));
      assert('extra ring context menu disables put-on with both-occupied label and token', putOn?.disabled === true && /Both ring slots are occupied/i.test(`${putOn.text}\n${putOn.title}`) && /blocked\.ring\.bothOccupied/.test(`${putOn.disabledReasonToken} ${putOn.blockerTokens}`), JSON.stringify(withMenu.contextButtons));
      const slots = opened.equipmentSnapshot?.slots || [];
      assert('ring snapshot carries bothOccupied token', slots.some((slot) => slot.slotId === 'ring.left' && (slot.blockedBy || []).includes('blocked.ring.bothOccupied')) && slots.some((slot) => slot.slotId === 'ring.right' && (slot.blockedBy || []).includes('blocked.ring.bothOccupied')), JSON.stringify(slots));
      return ['both occupied ring slots show blocked.ring.bothOccupied in the paper doll, context menu, and snapshot'];
    },
  },
  {
    id: 'equipment/offhand-shield-twohanded', prefix: 'shield-quiver', rowPattern: 'quarterstaff',
    verify(opened, withMenu) {
      const offhand = (opened.slots || []).find((slot) => slot.slot === 'offhand') || {};
      const quiver = (opened.slots || []).find((slot) => slot.slot === 'quiver') || {};
      const staffWield = (withMenu.contextButtons || []).find((button) => button.actionId === 'item.wield.mainHand');
      assert('offhand paper doll shows shield blocker label', /shield is equipped/i.test(offhand.text || '') && /blocked\.hands\.shieldEquipped/.test(offhand.blockerTokens || ''), JSON.stringify(offhand));
      assert('quiver paper doll shows occupied quiver label', /Quiver occupied/i.test(quiver.text || '') && /blocked\.hands\.quiverOccupied/.test(quiver.blockerTokens || ''), JSON.stringify(quiver));
      assert('quarterstaff context menu disables main-hand wield with public shield label', staffWield?.disabled === true && /shield is equipped/i.test(`${staffWield.text}\n${staffWield.title}`), JSON.stringify(withMenu.contextButtons));
      const slots = opened.equipmentSnapshot?.slots || [];
      assert('shield snapshot contains offhand shield blocker token', slots.some((slot) => slot.slotId === 'offHand' && (slot.blockedBy || []).includes('blocked.hands.shieldEquipped')), JSON.stringify(slots));
      return ['shield/offhand setup shows blocked.hands.shieldEquipped and occupied quiver shows blocked.hands.quiverOccupied'];
    },
  },
  {
    id: 'equipment/twohanded-mainhand', prefix: 'twohanded-mainhand', rowPattern: 'dagger',
    verify(opened) {
      const main = (opened.slots || []).find((slot) => slot.slot === 'main-hand') || {};
      const offhand = (opened.slots || []).find((slot) => slot.slot === 'offhand') || {};
      assert('main-hand UI shows public quarterstaff as equipped two-handed weapon', /quarterstaff|staff/i.test(main.text || ''), JSON.stringify(main));
      assert('offhand UI is blocked by two-handed main-hand weapon', /two-handed weapon uses both hands/i.test(offhand.text || '') && /blocked\.hands\.twoHandedWeapon/.test(offhand.blockerTokens || ''), JSON.stringify(offhand));
      const slots = opened.equipmentSnapshot?.slots || [];
      assert('two-handed snapshot carries offhand twoHandedWeapon token', slots.some((slot) => slot.slotId === 'offHand' && (slot.blockedBy || []).includes('blocked.hands.twoHandedWeapon')), JSON.stringify(slots));
      return ['publicly equipped quarterstaff in main hand blocks offhand with blocked.hands.twoHandedWeapon in UI and snapshot'];
    },
  },
];

function makeIsolatedPlayground() {
  const source = path.join(repo, 'playground');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-equipment-blockers-'));
  fs.cpSync(source, temp, { recursive: true, filter: (entry) => !/[a-z]lock\.0$/.test(path.basename(entry)) });
  return temp;
}

async function runScenario(entry, index) {
  const port = await freePort(basePort ? basePort + index : 0);
  const playground = makeIsolatedPlayground();
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height), NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: entry.id, NH_TEST_PLAYGROUND: playground, NETHACKDIR: playground, NETHACK_SEED: String(737373 + index), NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', (d) => { logs += d; process.stdout.write(d); });
  child.stderr.on('data', (d) => { logs += d; process.stderr.write(d); });
  let cdp;
  let closed = false;
  child.once('close', () => { closed = true; });
  const cleanup = async () => {
    try { cdp?.close(); } catch {}
    if (!child.killed && !closed) child.kill('SIGTERM');
    if (!closed) await Promise.race([
      new Promise((resolve) => child.once('close', resolve)),
      delay(2500),
    ]);
    fs.writeFileSync(path.join(outDir, `${String(index + 1).padStart(2, '0')}-${entry.prefix}-electron.log`), logs);
    fs.rmSync(playground, { recursive: true, force: true });
  };
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 25000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    await evalExpr(cdp, "document.getElementById('game-grid')?.focus?.(); window.__nethackPromptTest?.clearSentInputs?.();");
    await press(cdp, 'i', 'KeyI', 'i');
    const opened = await waitFor(async () => { const s = await state(cdp); return /Equipment\s*\/\s*Inventory/i.test(s.dialog?.title || '') && (s.rows || []).length ? s : null; }, 10000);
    const ordinal = String(index + 1).padStart(2, '0');
    const screenShot = await shot(cdp, `${ordinal}-${entry.prefix}-paper-doll.png`);
    const paperDollState = writeStateSidecar(`${ordinal}-${entry.prefix}-paper-doll-state.json`, opened);
    let withMenu = opened;
    let menuShot = '';
    let contextMenuState = '';
    if (entry.rowPattern) {
      await rightClickRow(cdp, entry.rowPattern);
      await delay(300);
      withMenu = await state(cdp);
      menuShot = await shot(cdp, `${ordinal}-${entry.prefix}-context-menu.png`);
      contextMenuState = writeStateSidecar(`${ordinal}-${entry.prefix}-context-menu-state.json`, withMenu);
    }
    const verified = entry.verify(opened, withMenu);
    const blockerSurface = `${opened.slots.map((slot) => slot.text).join('\n')}\n${withMenu.contextMenu}\n${withMenu.feedback}`;
    assert(`${entry.prefix}: no hidden/internal labels leak in blocker surfaces`, !/\bwelded\b|\botyp\b|trueName|Inventory selector/i.test(blockerSurface), blockerSurface);
    const runtimeSurface = `${opened.body}\n${opened.shim}\n${withMenu.body}\n${withMenu.shim}`;
    assert(`${entry.prefix}: no NetHack/runtime disorder text in real evidence`, !/Program in disorder|Please report these messages|bridge_test_scenario_failed|TypeError|ReferenceError|Unhandled/i.test(runtimeSurface), runtimeSurface.slice(-4000));
    return { scenarioId: entry.id, prefix: entry.prefix, port, screenshots: { paperDoll: screenShot, contextMenu: menuShot }, stateSidecars: { paperDoll: paperDollState, contextMenu: contextMenuState }, opened: publicStateSnapshot(opened), withMenu: publicStateSnapshot(withMenu), verified };
  } finally {
    await cleanup();
  }
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const requested = String(process.env.NH_EQUIPMENT_BLOCKERS_SCENARIOS || '').split(',').map((item) => item.trim()).filter(Boolean);
  const selectedScenarios = requested.length ? scenarios.filter((entry) => requested.includes(entry.id) || requested.includes(entry.prefix)) : scenarios;
  assert('requested equipment blocker scenarios matched', selectedScenarios.length > 0, requested.join(','));
  const results = [];
  for (let index = 0; index < selectedScenarios.length; index += 1) results.push(await runScenario(selectedScenarios[index], index));
  const summary = ['# Workstream C equipment blocker real scenarios', '', 'PASS', '', ...results.flatMap((result) => [
    `## ${result.scenarioId}`,
    '',
    `Paper doll screenshot: ${result.screenshots.paperDoll}`,
    `Paper doll state sidecar: ${result.stateSidecars.paperDoll}`,
    `Context menu screenshot: ${result.screenshots.contextMenu}`,
    `Context menu state sidecar: ${result.stateSidecars.contextMenu}`,
    '',
    'Verified:',
    ...result.verified.map((line) => `- ${line}`),
    '- blocker surfaces omit hidden curse/welded/internal identity facts',
    '',
  ])].join('\n');
  fs.writeFileSync(path.join(outDir, 'equipment-blockers-summary.md'), summary);
  fs.writeFileSync(path.join(outDir, 'equipment-blockers-state.json'), JSON.stringify({ ok: true, results }, null, 2));
  console.log(summary);
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
