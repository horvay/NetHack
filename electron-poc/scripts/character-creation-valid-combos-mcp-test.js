const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_CHARACTER_COMBOS_OUT_DIR || path.join(root, 'test-output', 'character-creation-valid-combos');
const port = Number(process.env.NH_CHARACTER_COMBOS_CDP_PORT || 9503);
const width = Number(process.env.NH_CHARACTER_COMBOS_WIDTH || 1360);
const height = Number(process.env.NH_CHARACTER_COMBOS_HEIGHT || 920);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await delay(stepMs); } throw last || new Error('timed out waiting'); }
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function clickCenter(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
async function state(cdp) { return evalExpr(cdp, `(() => ({
  selects: Object.fromEntries(['role','race','gender','alignment'].map((field) => { const id = {role:'player-role',race:'player-race',gender:'player-gender',alignment:'player-align'}[field]; const el = document.getElementById(id); return [field, { value: el.value, options: Array.from(el.options).map((o) => ({ value: o.value, text: o.textContent })) }]; })),
  comboAvatarId: document.getElementById('character-dialog')?.dataset.comboAvatarId || '',
  comboAvatarAvailable: document.getElementById('character-dialog')?.dataset.comboAvatarAvailable || '',
  player: (() => { const el = Array.from(document.querySelectorAll('.tile-cell')).find((cell) => cell.dataset.tileId && cell.dataset.tileId.includes('-monk-')); if (!el) return null; const r = el.getBoundingClientRect(); return { tileId: el.dataset.tileId, aria: el.getAttribute('aria-label'), x: r.left + r.width/2, y: r.top + r.height/2 }; })(),
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
  status: document.getElementById('status')?.textContent || '',
}))()`); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp; const stdout = []; const stderr = [];
  child.stdout.on('data', d => stdout.push(String(d))); child.stderr.on('data', d => stderr.push(String(d)));
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  const results = { outDir, screenshots: {} };
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find(p => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find(p => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackAutomation")), 10000);
    await clickCenter(cdp, '#start-shim');
    await waitFor(async () => (await evalExpr(cdp, "document.getElementById('character-dialog')?.open")), 5000);
    results.screenshots.initialDialog = await shot(cdp, '01-valid-character-dialog-default.png');
    await evalExpr(cdp, `(() => { const race = document.getElementById('player-race'); race.value = 'Dwa'; race.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    results.dwarfOptions = await state(cdp);
    results.screenshots.dwarfOptions = await shot(cdp, '02-dwarf-role-list-no-monk.png');
    assert('Dwarf role options exclude Monk', !results.dwarfOptions.selects.role.options.some((o) => o.value === 'Mon'), JSON.stringify(results.dwarfOptions.selects.role.options));
    assert('Dwarf Valkyrie remains generated combo backed', results.dwarfOptions.comboAvatarId === 'dwarf-valkyrie-female-avatar' && results.dwarfOptions.comboAvatarAvailable === 'true', JSON.stringify(results.dwarfOptions));
    await evalExpr(cdp, `(() => { const race = document.getElementById('player-race'); race.value = 'Hum'; race.dispatchEvent(new Event('change', { bubbles: true })); const role = document.getElementById('player-role'); role.value = 'Mon'; role.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('player-name').value = 'MonkQA'; })()`);
    results.monkResolved = await state(cdp);
    results.screenshots.monkResolved = await shot(cdp, '03-monk-is-human-only.png');
    assert('Selecting Monk constrains race to Human only', results.monkResolved.selects.race.value === 'Hum' && results.monkResolved.selects.race.options.length === 1, JSON.stringify(results.monkResolved));
    assert('Human Monk generated combo is available', results.monkResolved.comboAvatarId === 'human-monk-female-avatar' && results.monkResolved.comboAvatarAvailable === 'true', JSON.stringify(results.monkResolved));
    await clickCenter(cdp, '#confirm-character');
    await waitFor(async () => !(await evalExpr(cdp, "document.getElementById('character-dialog')?.open")), 5000);
    await waitFor(async () => {
      const s = await state(cdp);
      return s.dialogs.includes('intro-dialog') || (s.dialogs.length === 0 && s.player?.tileId) ? true : null;
    }, 12000);
    if (await evalExpr(cdp, `Boolean(document.getElementById('intro-dialog')?.open)`)) {
      await clickCenter(cdp, '#intro-continue');
      await waitFor(async () => !(await evalExpr(cdp, `Boolean(document.getElementById('intro-dialog')?.open)`)), 5000);
    }
    results.playerCell = await waitFor(async () => { const s = await state(cdp); return s.dialogs.length === 0 && s.player?.tileId ? s.player : null; }, 12000);
    results.screenshots.humanMonkGameplay = await shot(cdp, '04-human-monk-generated-avatar-gameplay.png');
    assert('Real gameplay uses generated Human Monk combo avatar', results.playerCell.tileId === 'human-monk-female-avatar', JSON.stringify(results.playerCell));
    fs.writeFileSync(path.join(outDir, 'character-creation-valid-combos-result.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(outDir, 'character-creation-valid-combos-failure.json'), JSON.stringify({ error: error.stack, stdout, stderr }, null, 2));
    throw error;
  } finally {
    cleanup();
  }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
