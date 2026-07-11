const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_SCENARIO_STAIRS_CONTEXT_OUT_DIR || path.join(root, 'test-output', 'real-scenario-stairs-context');
const basePort = Number(process.env.NH_SCENARIO_STAIRS_CONTEXT_CDP_PORT || 9654);
const width = 1360;
const height = 920;

const cases = [
  { id: 'stairs/down-on-hero', expectedButtonId: 'descend', expectedLabel: 'Go down stairs', forbiddenLabel: 'Go up stairs', expectedTerrainAction: 'stairsDown', expectedTerrain: 'stairs.down', expectedOutcome: /You descend the stairs\.|Dlvl\s*:?[\s\n]*2/i, screenshotPrefix: 'down-stairs' },
  { id: 'stairs/up-on-hero', expectedButtonId: 'ascend', expectedLabel: 'Go up stairs', forbiddenLabel: 'Go down stairs', expectedTerrainAction: 'stairsUp', expectedTerrain: 'stairs.up', expectedOutcome: /leaving the dungeon requires the visible NetHack confirmation flow/i, screenshotPrefix: 'up-stairs' },
  { id: 'stairs/floor-on-hero', absentLabels: ['Go down stairs', 'Go up stairs', 'Go down ladder', 'Go up ladder'], screenshotPrefix: 'non-stair-floor' },
  { id: 'stairs/ladder-up-on-hero', expectedButtonId: 'ascend-ladder', expectedLabel: 'Go up ladder', forbiddenLabel: 'Go down ladder', expectedTerrainAction: 'ladderUp', expectedTerrain: 'ladder.up', expectedOutcome: /leaving the dungeon requires the visible NetHack confirmation flow/i, screenshotPrefix: 'up-ladder' },
];

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 20000, stepMs = 150) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try { const value = await fn(); if (value) return value; } catch (error) { last = error; }
    await delay(stepMs);
  }
  throw last || new Error('timed out waiting');
}
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const callbacks = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? callbacks.reject(new Error(JSON.stringify(msg.error))) : callbacks.resolve(msg.result);
    }
  });
  return {
    send(method, params = {}) {
      const callId = ++id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
    },
    close() { ws.close(); },
  };
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
async function click(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
function assert(name, ok, detail = '') {
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}
async function state(cdp) {
  return evalExpr(cdp, `(() => {
    const current = window.__nethackPromptTest?.currentCell?.() || null;
    return {
      running: window.__nethackAutomation?.state?.().runningState?.running || false,
      seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
      shim: document.getElementById('shim-output')?.innerText || '',
      body: document.body.innerText,
      actions: window.__nethackPromptTest?.contextActions?.(),
      sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
      messages: window.__nethackPromptTest?.messages?.().slice(-12).map((m) => m.text || String(m)) || [],
      sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
      currentCell: current,
      cursorCell: (() => {
        const el = document.querySelector('#game-grid .tile-cell.cursor');
        return el ? {
          text: el.textContent || '',
          glyph: el.dataset.glyph || '',
          tileId: el.dataset.tileId || '',
          semanticKind: el.dataset.semanticKind || '',
          semanticName: el.dataset.semanticName || '',
          backgroundSemanticKind: el.dataset.backgroundSemanticKind || '',
          backgroundSemanticName: el.dataset.backgroundSemanticName || '',
          aria: el.getAttribute('aria-label') || ''
        } : null;
      })()
    };
  })()`);
}
async function startGame(cdp) {
  if (await evalExpr(cdp, `Boolean(document.getElementById('startup-choice-dialog')?.open)`)) await click(cdp, '#startup-new-game');
  else await click(cdp, '#start-shim');
  await waitFor(async () => evalExpr(cdp, `Boolean(document.getElementById('character-dialog')?.open && document.getElementById('confirm-character'))`), 7000);
  await click(cdp, '#confirm-character');
  await waitFor(async () => (await state(cdp)).running, 20000);
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`);
}

async function runCase(testCase, index) {
  const port = basePort + index;
  const caseDirName = testCase.id.replace(/[\/]/g, '--');
  const env = {
    ...process.env,
    AI_ORG_ELECTRON_CDP_PORT: String(port),
    NH_ELECTRON_WINDOW_WIDTH: String(width),
    NH_ELECTRON_WINDOW_HEIGHT: String(height),
    NH_ELECTRON_TEST_FIXTURES: '1',
    NH_SHIM_RESET_LOCKS: '1',
    NH_TEST_SCENARIO_ID: testCase.id,
    NETHACK_SEED: '424242',
    NETHACKOPTIONS: '!tutorial,!autopickup',
  };
  const child = spawn(electronBin, ['.'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk; process.stdout.write(chunk); });
  child.stderr.on('data', (chunk) => { logs += chunk; process.stderr.write(chunk); });
  let cdp;
  const result = { id: testCase.id, screenshots: {}, checks: {} };
  const cleanup = () => {
    try { cdp?.close(); } catch {}
    if (!child.killed) child.kill('SIGTERM');
    fs.writeFileSync(path.join(outDir, `${caseDirName}-electron.log`), logs);
  };
  try {
    const pages = await waitFor(async () => {
      const list = await json(`http://127.0.0.1:${port}/json/list`);
      return list.find((page) => page.type === 'page') ? list : null;
    }, 20000);
    cdp = await connect((pages.find((page) => page.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
    await startGame(cdp).catch(async (error) => {
      const startupDebug = await evalExpr(cdp, `(() => ({
        startButton: (() => { const el = document.getElementById('start-shim'); const r = el?.getBoundingClientRect(); return el ? { disabled: el.disabled, text: el.textContent, rect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null } : null; })(),
        startupChoiceOpen: Boolean(document.getElementById('startup-choice-dialog')?.open),
        characterOpen: Boolean(document.getElementById('character-dialog')?.open),
        body: document.body.innerText
      }))()`).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, `${caseDirName}-startup-timeout-debug.json`), JSON.stringify(startupDebug, null, 2));
      await screenshot(cdp, `${testCase.screenshotPrefix}-startup-timeout.png`).catch(() => undefined);
      throw error;
    });
    const loaded = await waitFor(async () => {
      const s = await state(cdp);
      if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim);
      return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null;
    }, 10000);
    assert(`${testCase.id} loaded`, /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));

    const ready = await waitFor(async () => {
      const s = await state(cdp);
      const text = s.actions?.text || '';
      if (testCase.expectedLabel) return text.includes(testCase.expectedLabel) ? s : null;
      return /Search/.test(text) && !/Go down stairs|Go up stairs/.test(text) ? s : null;
    }, 7000).catch(async (error) => {
      const debug = await state(cdp).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, `${caseDirName}-timeout-debug.json`), JSON.stringify(debug, null, 2));
      await screenshot(cdp, `${testCase.screenshotPrefix}-timeout.png`).catch(() => undefined);
      throw error;
    });
    result.ready = ready;
    result.screenshots.ready = await screenshot(cdp, `${testCase.screenshotPrefix}-01-context.png`);

    if (testCase.expectedLabel) {
      const buttons = ready.actions?.buttons || [];
      result.checks.expectedButtonVisible = buttons.some((button) => button.id === testCase.expectedButtonId && button.text === testCase.expectedLabel);
      result.checks.wrongStairDirectionAbsent = !buttons.some((button) => button.text === testCase.forbiddenLabel);
      assert(`${testCase.id} shows expected stair action`, result.checks.expectedButtonVisible, JSON.stringify(ready.actions));
      assert(`${testCase.id} omits wrong stair action`, result.checks.wrongStairDirectionAbsent, JSON.stringify(ready.actions));
      await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
      await click(cdp, `#context-action-bar button[data-context-action-id=${JSON.stringify(testCase.expectedButtonId)}]`);
      await delay(400);
      const afterClick = await state(cdp);
      result.afterClick = afterClick;
      result.screenshots.afterClick = await screenshot(cdp, `${testCase.screenshotPrefix}-02-after-click.png`);
      result.checks.routesDirectTerrainAction = afterClick.sentUiProtocolCommands.some((command) => command.commandType === 'terrain.action' && command.payload?.action === testCase.expectedTerrainAction && command.payload?.terrain === testCase.expectedTerrain);
      result.checks.noRawStairKey = afterClick.sent === '';
      assert(`${testCase.id} routes direct terrain.action`, result.checks.routesDirectTerrainAction, JSON.stringify({ sent: afterClick.sent, sentUiProtocolCommands: afterClick.sentUiProtocolCommands, actions: afterClick.actions, messages: afterClick.messages }));
      assert(`${testCase.id} sends no raw stair key`, result.checks.noRawStairKey, JSON.stringify({ sent: afterClick.sent }));
      const outcomeText = `${afterClick.body || ''}\n${(afterClick.messages || []).join('\n')}\n${afterClick.shim || ''}`;
      result.checks.visibleNetHackOutcome = testCase.expectedOutcome.test(outcomeText);
      assert(`${testCase.id} shows NetHack-visible outcome after terrain.action`, result.checks.visibleNetHackOutcome, outcomeText.slice(-1600));
    } else {
      const terrainText = `${JSON.stringify(ready.currentCell || {})}\n${JSON.stringify(ready.cursorCell || {})}`;
      if (testCase.expectedTerrain) {
        result.checks.expectedTerrainSeen = testCase.expectedTerrain.test(terrainText);
        assert(`${testCase.id} exposes expected terrain semantic`, result.checks.expectedTerrainSeen, terrainText);
      }
      const actionText = ready.actions?.text || '';
      result.checks.stairActionsAbsent = testCase.absentLabels.every((label) => !actionText.includes(label));
      assert(`${testCase.id} omits stair/ladder actions`, result.checks.stairActionsAbsent, actionText);
    }
    assert(`${testCase.id} has no fallback/developer UI`, !/Name unavailable|Inventory selector|Loading your inventory|Program in disorder|Please report these messages/i.test(ready.body), ready.body.slice(0, 1200));
    fs.writeFileSync(path.join(outDir, `${caseDirName}-debug.json`), JSON.stringify(result, null, 2));
    return result;
  } finally {
    cleanup();
    await new Promise((resolve) => child.once('close', resolve));
  }
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (let i = 0; i < cases.length; i += 1) {
    results.push(await runCase(cases[i], i));
  }
  const summary = [
    '# Real scenario stairs context action MCP/CDP validation',
    '',
    'PASS',
    '',
    `Output: ${outDir}`,
    '',
    '## Checks',
    ...results.flatMap((result) => [
      `- ${result.id}: ${Object.entries(result.checks).map(([name, ok]) => `${ok ? 'PASS' : 'FAIL'} ${name}`).join('; ')}`,
      `  - Buttons: ${(result.ready?.actions?.buttons || []).map((button) => `${button.id}:${button.text}`).join(' | ')}`,
      result.afterClick ? `  - Sent after click: ${JSON.stringify(result.afterClick.sent)}; direct commands: ${JSON.stringify(result.afterClick.sentUiProtocolCommands)}` : '  - Sent after click: (not clicked; non-stair absence case)',
    ]),
    '',
    '## Screenshots',
    ...results.flatMap((result) => Object.entries(result.screenshots).map(([name, file]) => `- ${result.id} ${name}: ${file}`)),
    '',
    'This proof launches real Electron with fixture-backed NetHack scenarios, clicks the visible contextual stair/ladder buttons, verifies typed `terrain.action` commands with public coord/terrain payloads and no raw `<`/`>` sent-input fallback, and asserts NetHack-visible outcomes after each click. The non-stair floor scenario proves terrain actions are absent away from supported terrain.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'real-scenario-stairs-context-summary.md'), summary);
  console.log(summary);
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
