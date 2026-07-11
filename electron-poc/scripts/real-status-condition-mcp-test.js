#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-status-condition');
const port = Number(process.env.NH_STATUS_CONDITION_CDP_PORT || 9653);
const scenarioId = 'status/full-hud';
const nethackOptions = '!tutorial,!autopickup,time,showscore,showexp,showvers,weaponstatus,armorstatus,terrainstatus,disclose:+i +a +v +g +c +o';
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) { const start = Date.now(); let last; while (Date.now() - start < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const p = path.join(outDir, name); fs.writeFileSync(p, Buffer.from(res.data, 'base64')); return p; }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function hud(cdp) { return evalExpr(cdp, `(() => window.__nethackPromptTest?.statusHud?.() || { text: document.getElementById('stats-panel')?.innerText || '', groups: [] })()`); }
async function send(cdp, key) { return evalExpr(cdp, `((code) => { window.__nethackAutomation?.sendKeycode?.(code); return true; })(${JSON.stringify(key.charCodeAt(0))})`); }
async function start(cdp) { const result = await evalExpr(cdp, `(() => window.__nethackAutomation.startReplay({ playerSpec: '-uStatusCon-Val-Hum-Fem-Law', seed: '737373', nethackOptions: ${JSON.stringify(nethackOptions)} }))()`); if (!result?.ok) throw new Error(`startReplay failed: ${JSON.stringify(result)}`); await waitFor(async () => evalExpr(cdp, `(() => window.__nethackAutomation?.state?.().runningState?.running || false)()`), 20000); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); await waitFor(async () => (await hud(cdp)).text.includes('Str'), 20000).catch(async (error) => { fs.writeFileSync(path.join(outDir, 'start-timeout-debug.json'), JSON.stringify({ result, hud: await hud(cdp).catch(() => ({})), body: await evalExpr(cdp, 'document.body.innerText').catch(() => '') }, null, 2)); await shot(cdp, 'debug-start-timeout.png').catch(() => undefined); throw error; }); }
async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1440', NH_ELECTRON_WINDOW_HEIGHT: '930', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '737373' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', (d) => { logs += d; process.stdout.write(d); }); child.stderr.on('data', (d) => { logs += d; process.stderr.write(d); });
  let cdp; const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); fs.writeFileSync(path.join(outDir, 'electron.log'), logs); };
  process.on('exit', cleanup);
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 930, deviceScaleFactor: 2, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await start(cdp);
    const terrainHud = await waitFor(async () => { const snapshot = await hud(cdp); return /\bOn\s+\S+/i.test(snapshot.text) ? snapshot : null; }, 10000).catch(async (error) => { fs.writeFileSync(path.join(outDir, 'terrain-timeout-debug.json'), JSON.stringify(await hud(cdp).catch(() => ({})), null, 2)); await shot(cdp, 'debug-terrain-timeout.png').catch(() => undefined); throw error; });
    const terrainShot = await shot(cdp, '01-terrain-status.png');
    let naturalCondition = false;
    let conditionHud = await hud(cdp);
    if (/\b(?:Held\s+Trapped|Trapped)\b/i.test(conditionHud.text)) naturalCondition = true;
    if (!naturalCondition) {
      await evalExpr(cdp, `(() => { window.__nethackPromptTest.event({ name: 'shim_status_update', field: 22, conditionMask: 0x00000002 | 0x00000008 | 0x04000000 }); return true; })()`);
      conditionHud = await waitFor(async () => { const snapshot = await hud(cdp); return /\b(?:Held\s+Trapped|Trapped)\b/i.test(snapshot.text) && /\bBlind\b/i.test(snapshot.text) && /\bConfused\b/i.test(snapshot.text) ? snapshot : null; }, 5000);
    }
    const conditionShot = await shot(cdp, '02-condition-status-trapped.png');
    assert('terrain status visible from real status emission', /\bOn\s+\S+/i.test(terrainHud.text), JSON.stringify(terrainHud));
    assert('condition status visible in the real Electron renderer', /\b(?:Held\s+Trapped|Trapped)\b/i.test(conditionHud.text), JSON.stringify(conditionHud));
    fs.writeFileSync(path.join(outDir, 'status-condition-debug.json'), JSON.stringify({ terrainHud, conditionHud, naturalCondition, scenarioId, nethackOptions }, null, 2));
    const summary = [`# Status terrain and condition Electron smoke`, '', 'PASS', '', `Terrain screenshot: ${terrainShot}`, `Condition screenshot: ${conditionShot}`, '', 'Verified:', '- real status emission shows the Terrain/On status chip', naturalCondition ? '- the core emitted and displayed a Trapped condition chip' : '- injected a shim_status_update mask in the real Electron renderer to prove common condition chips render live', '', '```json', JSON.stringify({ terrainHud, conditionHud, naturalCondition, scenarioId }, null, 2), '```', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-status-condition-summary.md'), summary);
    console.log(summary);
  } finally { cleanup(); }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
