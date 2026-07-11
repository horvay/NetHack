#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-status-hud');
const port = Number(process.env.NH_STATUS_HUD_CDP_PORT || 9652);
const scenarioId = 'status/full-hud';
const fullStatusOptions = '!tutorial,!autopickup,time,showscore,showexp,showvers,weaponstatus,armorstatus,terrainstatus,disclose:+i +a +v +g +c +o';
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ running: window.__nethackAutomation?.state?.().runningState?.running || false, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '', body: document.body.innerText }))()`); }
async function start(cdp) {
  const result = await evalExpr(cdp, `(() => window.__nethackAutomation.startReplay({ playerSpec: '-uStatusVal-Val-Hum-Fem-Law', seed: '626262', nethackOptions: ${JSON.stringify(fullStatusOptions)} }))()`);
  if (!result?.ok) throw new Error(`startReplay failed: ${JSON.stringify(result)}`);
  await waitFor(async () => (await state(cdp)).running, 20000);
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`);
}
async function hud(cdp) { return evalExpr(cdp, `(() => window.__nethackPromptTest?.statusHud?.() || { text: document.getElementById('stats-panel')?.innerText || '', groups: [] })()`); }
async function sendWait(cdp) { return evalExpr(cdp, `(() => { window.__nethackAutomation?.sendKeycode?.(46); return true; })()`); }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1440', NH_ELECTRON_WINDOW_HEIGHT: '930', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '626262' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', (d) => { logs += d; process.stdout.write(d); }); child.stderr.on('data', (d) => { logs += d; process.stderr.write(d); });
  let cdp; const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); fs.writeFileSync(path.join(outDir, 'electron.log'), logs); };
  process.on('exit', cleanup);
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 930, deviceScaleFactor: 2, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    const firstHud = await waitFor(async () => {
      const snapshot = await hud(cdp);
      const labels = snapshot.groups.flatMap((group) => group.fields.map((field) => field.label));
      return ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha', 'HP', 'Pw', 'AC', 'XL', 'Dlvl', 'Gold', 'Time', 'XP', 'Carry', 'Wield', 'Armor', 'Version'].every((label) => labels.includes(label)) ? snapshot : null;
    }, 20000).catch(async (error) => { fs.writeFileSync(path.join(outDir, 'status-timeout-debug.json'), JSON.stringify(await hud(cdp).catch(() => ({})), null, 2)); await shot(cdp, 'debug-status-timeout.png').catch(() => undefined); throw error; });
    const firstFields = firstHud.groups.flatMap((group) => group.fields);
    const field = (label) => firstFields.find((item) => item.label === label)?.value || '';
    assert('all six attributes are visible', ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'].every((label) => field(label)), JSON.stringify(firstHud));
    assert('identity/title is visible when emitted', /Val|Electron|Valkyrie|Stripling/i.test(field('Name / role')), JSON.stringify(firstHud));
    assert('vital paired values are visible', /\d+\s*\/\s*\d+/.test(field('HP')) && /\d+\s*\/\s*\d+/.test(field('Pw')), JSON.stringify(firstHud));
    assert('dungeon, gold, AC, XL, time, XP, carry, and version are visible', field('Dlvl') && field('Gold') && field('AC') && field('XL') && field('Time') && field('XP') && field('Carry') && field('Version'), JSON.stringify(firstHud));
    assert('weapon and armor status are visible', field('Wield') && field('Armor'), JSON.stringify(firstHud));
    const screenshot = await shot(cdp, '01-full-status-hud.png');
    const timeBefore = field('Time');
    await sendWait(cdp);
    await delay(500);
    const afterHud = await hud(cdp);
    const afterFields = afterHud.groups.flatMap((group) => group.fields);
    const timeAfter = afterFields.find((item) => item.label === 'Time')?.value || '';
    const liveUpdateObserved = Boolean(timeBefore && timeAfter && timeBefore !== timeAfter) || afterHud.text !== firstHud.text;
    assert('status HUD remains rendered after a live command update', /Str\s+\S+[\s\S]*Dex\s+\S+[\s\S]*HP\s+\d+\s*\//.test(afterHud.text), JSON.stringify(afterHud));
    assert('real wait command advances the visible Time field', Boolean(timeBefore && timeAfter && timeBefore !== timeAfter), JSON.stringify({ timeBefore, timeAfter, afterHud }));
    const updatedScreenshot = await shot(cdp, '02-status-hud-after-wait.png');
    fs.writeFileSync(path.join(outDir, 'status-hud-debug.json'), JSON.stringify({ firstHud, afterHud, timeBefore, timeAfter, liveUpdateObserved }, null, 2));
    const summary = [`# Full top status HUD real Electron smoke`, '', 'PASS', '', `Initial screenshot: ${screenshot}`, `After wait screenshot: ${updatedScreenshot}`, '', 'Command: node scripts/real-status-hud-mcp-test.js', '', 'Verified in the real Electron/game path:', '- top status HUD shows Str, Dex, Con, Int, Wis, Cha', '- top status HUD shows name/role/title when emitted', '- top status HUD shows HP/max HP, Pw/max Pw, AC, XL, dungeon level, and gold', '- status HUD remains rendered after sending a real wait command', `- live turn/time value changed: ${liveUpdateObserved ? 'yes' : 'no'}`, '', 'HUD evidence:', '```json', JSON.stringify({ firstHud, afterHud, timeBefore, timeAfter, liveUpdateObserved, scenarioId, fullStatusOptions }, null, 2), '```', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-status-hud-summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
