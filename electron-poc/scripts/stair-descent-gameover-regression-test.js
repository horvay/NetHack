const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.RUN_EVIDENCE_DIR || path.join(root, 'test-output', 'stair-descent-gameover-regression');
const singleScenarioId = 'regression/downstairs-current';
const multiScenarioId = 'regression/multi-level-downstairs-current';
const port = Number(process.env.NH_STAIR_DESCENT_CDP_PORT || 9648);

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeoutMs) {
    try { const value = await fn(); if (value) return value; } catch (error) { last = error; }
    await delay(stepMs);
  }
  throw last || new Error('timed out');
}
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  });
  return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } };
}
async function evalExpr(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function screenshot(cdp, name) {
  const res = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(outDir, name);
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
  return file;
}
async function writeState(cdp, name) {
  const state = await evalExpr(cdp, `(() => {
    const automation = window.__nethackAutomation?.state?.() || {};
    const prompt = window.__nethackPromptTest?.prompt?.() || null;
    const dialog = window.__nethackPromptTest?.dialog?.() || {};
    const messages = window.__nethackPromptTest?.messages?.().slice(-40) || [];
    const body = document.body.innerText || '';
    const shim = document.getElementById('shim-output')?.innerText || '';
    const statusText = document.getElementById('status')?.textContent || '';
    const gameOverOpen = Boolean(document.getElementById('game-over-dialog')?.open);
    const gameOverText = document.getElementById('game-over-dialog')?.innerText || '';
    const dlvl = Array.from(document.querySelectorAll('[data-status-field], .stat-chip')).map((el) => el.innerText || '').find((text) => /Dlvl/i.test(text)) || body.match(/Dlvl\s*:?\s*\d+/)?.[0] || '';
    const downStairs = [];
    for (let y = 0; y < mapCells.length; y += 1) for (let x = 0; x < mapCells[y].length; x += 1) {
      const c = mapCells[y][x] || {};
      if (c.ch === '>' || /down.*stair|stair.*down/i.test(String(c.semanticName || ''))) downStairs.push({ x, y, ch: c.ch, semanticKind: c.semanticKind, semanticName: c.semanticName });
    }
    return { automation, running: automation.runningState?.running || false, cursor: automation.cursor || cursor, prompt, dialog, messages, statusText, gameOverOpen, gameOverText, dlvl, downStairs, sentInputs: window.__nethackPromptTest?.sentInputs?.() || [], body, shimSeen: document.getElementById('shim-output')?.dataset?.seen || '', shimTail: shim.slice(-8000) };
  })()`);
  const file = path.join(outDir, `${name}.json`);
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  return { state, file };
}
function assert(condition, message, detail = '') { if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ''}`); }
function keycode(char) { return char.charCodeAt(0); }
async function sendKey(cdp, char) { return evalExpr(cdp, `window.__nethackAutomation.sendKeycode(${keycode(char)})`); }
async function sendText(cdp, text, stepMs = 15) { for (const ch of text) { await sendKey(cdp, ch); if (stepMs) await delay(stepMs); } }
function targetPath(from, to) {
  let x = Number(from.x), y = Number(from.y); let keys = '';
  while (x !== to.x || y !== to.y) {
    const dx = Math.sign(to.x - x), dy = Math.sign(to.y - y);
    const key = dx < 0 && dy < 0 ? 'y' : dx === 0 && dy < 0 ? 'k' : dx > 0 && dy < 0 ? 'u' : dx < 0 && dy === 0 ? 'h' : dx > 0 && dy === 0 ? 'l' : dx < 0 && dy > 0 ? 'b' : dx === 0 && dy > 0 ? 'j' : 'n';
    keys += key; x += dx; y += dy;
  }
  return `${keys}.`;
}
async function startReplay(cdp, scenarioId, seed = '424242') {
  await evalExpr(cdp, `window.__nethackAutomation.stop()`);
  await waitFor(async () => {
    const state = await evalExpr(cdp, `window.__nethackAutomation.state().runningState || {}`);
    return !state.running ? true : null;
  }, 5000).catch(() => null);
  const startResult = await evalExpr(cdp, `window.__nethackAutomation.startReplay({ scenarioId: ${JSON.stringify(scenarioId)}, playerSpec: '-u Wizard-Elf-Male-Chaotic', seed: ${JSON.stringify(seed)}, nethackOptions: '!tutorial,!autopickup,disclose:+i +a +v +g +c +o' })`);
  assert(startResult.ok, 'startReplay failed', JSON.stringify(startResult));
  await waitFor(async () => {
    const { state } = await writeState(cdp, `${scenarioId.replace(/[^a-z0-9]+/gi, '-')}-startup-poll-state`);
    if (/bridge_test_scenario_failed/.test(state.shimTail)) throw new Error(state.shimTail);
    return state.running && /bridge_test_scenario_loaded/.test(`${state.shimSeen}\n${state.shimTail}`) && /Hello /.test(`${state.body}\n${state.shimTail}`) ? state : null;
  }, 20000);
  await evalExpr(cdp, `(() => { window.__nethackAutomation.dismissReplayIntro(); document.getElementById('intro-dialog')?.close?.('test-dismiss'); document.getElementById('document-dialog')?.close?.('test-dismiss'); document.getElementById('game-grid')?.focus?.(); return true; })()`);
  await delay(500);
}

async function runSynthetic(cdp) {
  await evalExpr(cdp, `(() => {
    window.__nethackPromptTest.reset();
    window.__nethackPromptTest.setRunning(true);
    window.__nethackPromptTest.event({ name: 'shim_yn_function', query: 'Really quit without saving?', choices: 'ynq' });
  })()`);
  await delay(250);
  const first = await writeState(cdp, 'synthetic-cancelled-quit-prompt-state');
  assert(!first.state.gameOverOpen, 'Really quit prompt must not open game-over modal');
  assert(first.state.sentInputs.length === 0, 'Really quit prompt must not be auto-answered', JSON.stringify(first.state.sentInputs));
  await evalExpr(cdp, `(() => {
    window.__nethackPromptTest.event({ name: 'bridge_prompt_answer', keycode: 110 });
    window.__nethackPromptTest.event({ name: 'shim_yn_function', query: 'Drink from the fountain?', choices: 'ynq' });
  })()`);
  await delay(250);
  const second = await writeState(cdp, 'synthetic-after-cancel-next-ynq-state');
  assert(!second.state.gameOverOpen, 'cancelled quit must not leave stale game-over state');
  assert(second.state.sentInputs.length === 0, 'later ordinary ynq prompt must not be auto-answered', JSON.stringify(second.state.sentInputs));
  await evalExpr(cdp, `(() => {
    window.__nethackPromptTest.reset();
    window.__nethackPromptTest.setRunning(true);
    window.__nethackPromptTest.event({ name: 'shim_yn_function', query: 'Do you want to review attributes now?', choices: 'ynq' });
  })()`);
  await delay(250);
  const third = await writeState(cdp, 'synthetic-ordinary-attributes-prompt-state');
  assert(!third.state.gameOverOpen, 'ordinary attributes/disclosure-like prompt must not open game-over modal');
  assert(third.state.sentInputs.length === 0, 'ordinary attributes/disclosure-like prompt must not be auto-answered', JSON.stringify(third.state.sentInputs));
  const shot = await screenshot(cdp, '00-synthetic-prompts-no-gameover.png');
  return { states: [first.file, second.file, third.file], screenshot: shot };
}

async function runSingleDescent(cdp) {
  await startReplay(cdp, singleScenarioId, '424242');
  const before = await writeState(cdp, '01-single-before-descent-state');
  const beforeShot = await screenshot(cdp, '01-single-before-descent.png');
  assert(!before.state.gameOverOpen, 'before descent should not show game-over');
  assert(/Dlvl\s*:?\s*1|Dlvl\s*\n\s*1/.test(`${before.state.dlvl}\n${before.state.body}\n${before.state.shimTail}`), 'before descent should be on Dlvl:1');

  await sendKey(cdp, '>');
  const after = await waitFor(async () => {
    const result = await writeState(cdp, '02-single-after-descent-poll-state');
    const haystack = `${result.state.messages.join('\n')}\n${result.state.body}\n${result.state.shimTail}`;
    return /You descend the stairs\./.test(haystack) && /Dlvl\s*:?\s*2|Dlvl\s*\n\s*2/.test(haystack) ? result : null;
  }, 15000);
  const afterShot = await screenshot(cdp, '02-single-immediately-after-descent.png');
  assert(after.state.running, 'after descent NetHack process should still be running');
  assert(!after.state.gameOverOpen, 'after descent must not show game-over modal');
  assert(!/Final Attributes|You survived\.|game over; final statistics displayed/i.test(`${after.state.body}\n${after.state.gameOverText}`), 'after descent must not show final disclosure/end text');

  await delay(1800);
  const delayed = await writeState(cdp, '03-single-after-delay-active-gameplay-state');
  const delayedShot = await screenshot(cdp, '03-single-after-delay-active-gameplay.png');
  assert(delayed.state.running, 'delayed state should still be active gameplay');
  assert(!delayed.state.gameOverOpen, 'delayed state must not show game-over modal');
  assert(/Dlvl\s*:?\s*2|Dlvl\s*\n\s*2/.test(`${delayed.state.dlvl}\n${delayed.state.body}\n${delayed.state.shimTail}`), 'delayed state should remain on Dlvl:2');
  assert(!/Final Attributes|You survived\.|game over; final statistics displayed/i.test(`${delayed.state.body}\n${delayed.state.gameOverText}`), 'delayed state must not show final disclosure/end text');

  return { before: before.file, after: after.file, delayed: delayed.file, screenshots: [beforeShot, afterShot, delayedShot] };
}

async function runRealQuit(cdp) {
  await sendText(cdp, '#quit\n');
  const prompt = await waitFor(async () => {
    const result = await writeState(cdp, '14-real-quit-confirmation-prompt-state');
    const haystack = `${result.state.prompt?.query || ''}\n${result.state.body}\n${result.state.shimTail}`;
    return /Really quit(?: without saving)?\??/i.test(haystack) ? result : null;
  }, 8000);
  const promptShot = await screenshot(cdp, '14-real-quit-confirmation-prompt.png');
  assert(!prompt.state.gameOverOpen, 'real quit confirmation prompt must not itself open game-over modal');
  await sendKey(cdp, 'y');
  const quit = await waitFor(async () => {
    const result = await writeState(cdp, '15-real-quit-gameover-poll-state');
    const haystack = `${result.state.messages.join('\n')}\n${result.state.body}\n${result.state.shimTail}\n${result.state.gameOverText}`;
    return result.state.gameOverOpen && /(?:Goodbye|You quit|All available statistics|Game over)/i.test(haystack) ? result : null;
  }, 20000);
  const quitShot = await screenshot(cdp, '15-real-quit-gameover.png');
  assert(quit.state.gameOverOpen, 'accepted real quit should open game-over modal');
  assert(/Game over|Final Chronicle/i.test(quit.state.gameOverText), 'accepted real quit should render final modal text');
  return { prompt: prompt.file, quit: quit.file, screenshots: [promptShot, quitShot] };
}

async function runMultiDescent(cdp) {
  await startReplay(cdp, multiScenarioId, '777777');
  const start = await writeState(cdp, '04-multi-start-on-dlvl1-state');
  const startShot = await screenshot(cdp, '04-multi-start-on-dlvl1.png');
  const original = start.state.cursor;
  let killedBug = null;
  for (let attempt = 0; attempt < 8 && !killedBug; attempt += 1) {
    await sendKey(cdp, 'l');
    await delay(250);
    killedBug = await waitFor(async () => {
      const state = await writeState(cdp, '05-multi-after-grid-bug-poll-state');
      return /(?:grid bug.*killed|kill(?:ed)? the grid bug)/i.test(`${state.state.messages.join('\n')}\n${state.state.body}\n${state.state.shimTail}`) ? state : null;
    }, 1200, 100).catch(() => null);
  }
  assert(killedBug, 'multi-level fixture should kill the adjacent grid bug before descending');
  const afterBug = await writeState(cdp, '05-multi-after-grid-bug-state');
  if (afterBug.state.cursor?.x !== original.x || afterBug.state.cursor?.y !== original.y) {
    const dx = Math.sign(original.x - afterBug.state.cursor.x);
    if (dx < 0) await sendKey(cdp, 'h');
    else if (dx > 0) await sendKey(cdp, 'l');
    await delay(300);
  }
  const beforeFirstDown = await writeState(cdp, '06-multi-before-first-descent-state');
  await sendKey(cdp, '>');
  const dlvl2 = await waitFor(async () => {
    const result = await writeState(cdp, '07-multi-dlvl2-poll-state');
    const haystack = `${result.state.messages.join('\n')}\n${result.state.body}\n${result.state.shimTail}`;
    return /You descend the stairs\./.test(haystack) && /Dlvl\s*:?\s*2|Dlvl\s*\n\s*2/.test(haystack) ? result : null;
  }, 15000);
  assert(!dlvl2.state.gameOverOpen, 'first descent of multi-level run must not show game-over');
  const dlvl2Shot = await screenshot(cdp, '07-multi-active-on-dlvl2.png');

  const onStairs = await writeState(cdp, '08-multi-on-dlvl2-downstairs-state');
  const cell = await evalExpr(cdp, `(() => { const c = mapCells[cursor.y]?.[cursor.x] || {}; return { cursor, ch: c.ch, semanticKind: c.semanticKind, semanticName: c.semanticName, backgroundSemanticKind: c.backgroundSemanticKind, backgroundSemanticName: c.backgroundSemanticName }; })()`);
  fs.writeFileSync(path.join(outDir, '08-multi-on-dlvl2-downstairs-cell.json'), `${JSON.stringify({ state: onStairs.state, file: onStairs.file, cell }, null, 2)}\n`);
  const onStairsShot = await screenshot(cdp, '08-multi-on-dlvl2-before-second-descent.png');

  await sendKey(cdp, '>');
  const dlvl3 = await waitFor(async () => {
    const result = await writeState(cdp, '12-multi-dlvl3-poll-state');
    const haystack = `${result.state.messages.join('\n')}\n${result.state.body}\n${result.state.shimTail}`;
    return /You descend the stairs\./.test(haystack) && /Dlvl\s*:?\s*3|Dlvl\s*\n\s*3/.test(haystack) ? result : null;
  }, 18000);
  await delay(1600);
  const final = await writeState(cdp, '13-multi-after-second-descent-active-state');
  const finalShot = await screenshot(cdp, '13-multi-after-second-descent-active.png');
  assert(dlvl3.state.running && final.state.running, 'after second descent NetHack process should still be running');
  assert(!dlvl3.state.gameOverOpen && !final.state.gameOverOpen, 'second descent must not show game-over modal');
  assert(/Dlvl\s*:?\s*3|Dlvl\s*\n\s*3/.test(`${final.state.dlvl}\n${final.state.body}\n${final.state.shimTail}`), 'after second descent should be on Dlvl:3');
  assert(!/Final Attributes|You survived\.|game over; final statistics displayed/i.test(`${dlvl3.state.body}\n${final.state.body}\n${dlvl3.state.gameOverText}\n${final.state.gameOverText}`), 'second descent must not show final disclosure/end text');

  return { start: start.file, afterBug: afterBug.file, beforeFirstDown: beforeFirstDown.file, dlvl2: dlvl2.file, onStairs: onStairs.file, dlvl3: dlvl3.file, final: final.file, screenshots: [startShot, dlvl2Shot, onStairsShot, finalShot] };
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1360', NH_ELECTRON_WINDOW_HEIGHT: '920', NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_FORCE_DOWNSTAIRS_UNDER_HERO: '1', NH_TEST_SCENARIO_ID: singleScenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup,disclose:+i +a +v +g +c +o' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', (d) => { logs += d; }); child.stderr.on('data', (d) => { logs += d; });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); fs.writeFileSync(path.join(outDir, 'electron.log'), logs); };
  process.on('exit', cleanup);
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((p) => p.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => await evalExpr(cdp, `document.readyState === 'complete' && !!window.__nethackPromptTest && !!window.__nethackAutomation`), 10000);
    const synthetic = await runSynthetic(cdp);
    const single = await runSingleDescent(cdp);
    const multi = await runMultiDescent(cdp);
    const realQuit = await runRealQuit(cdp);
    const summary = { ok: true, singleScenarioId, multiScenarioId, synthetic, single, multi, realQuit };
    fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    fs.writeFileSync(path.join(outDir, 'summary.md'), [`# Stair descent game-over regression`, '', 'PASS', '', `Single scenario: ${singleScenarioId}`, `Multi-level scenario: ${multiScenarioId}`, '', 'Artifacts:', ...single.screenshots.map((p) => `- ${p}`), ...multi.screenshots.map((p) => `- ${p}`), ...realQuit.screenshots.map((p) => `- ${p}`), `- ${synthetic.screenshot}`, '', 'The real Electron run covered a first downstairs transition, then a separate deterministic multi-level run from Dlvl:1 to Dlvl:2 to Dlvl:3. The multi-level run killed the fixture grid bug before the first descent, used the test-fixture stair hook to keep the second down staircase under the hero on Dlvl:2, descended again, remained running, and showed no game-over modal or final disclosure text. The same real Electron process then exercised accepted quit: the confirmation prompt did not open game-over prematurely, and answering yes opened the final game-over modal.', ''].join('\n'));
    console.log(JSON.stringify(summary, null, 2));
  } finally { cleanup(); }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
