const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_PROMPT_SPAM_OUT_DIR || path.join(root, 'test', 'prompt-spam');
const port = Number(process.env.NH_PROMPT_SPAM_CDP_PORT || 9466);
const width = Number(process.env.NH_PROMPT_SPAM_WIDTH || 1200);
const height = Number(process.env.NH_PROMPT_SPAM_HEIGHT || 760);

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const res = await fetch(url); if (!res.ok) throw new Error(`${res.status} ${url}`); return res.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 200) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try { const value = await fn(); if (value) return value; } catch (error) { lastError = error; }
    await delay(stepMs);
  }
  throw lastError || new Error('timed out waiting');
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
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
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

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], {
    cwd: root,
    env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: String(width), NH_ELECTRON_WINDOW_HEIGHT: String(height) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup);
  child.stdout.on('data', (d) => process.stdout.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));
  try {
    const pages = await waitFor(async () => {
      const list = await json(`http://127.0.0.1:${port}/json/list`);
      return list.find((p) => p.type === 'page') ? list : null;
    }, 20000);
    cdp = await connect((pages.find((p) => p.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => (await cdp.send('Runtime.evaluate', { returnByValue: true, expression: "document.readyState === 'complete' && !!window.__nethackPromptTest" })).result.value, 10000);
    const evalResult = await cdp.send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      window.__nethackPromptTest.reset();
      window.__nethackPromptTest.setRunning(true);
      window.__nethackPromptTest.event({ name: 'shim_putstr', text: 'You hit the goblin.' });
      window.__nethackPromptTest.event({ name: 'bridge_direction_prompt', query: 'Choose a direction or map target.', choices: 'ykulnjbh.<>' });
      const active = { messages: window.__nethackPromptTest.messages(), helper: window.__nethackPromptTest.helper(), prompt: window.__nethackPromptTest.prompt() };
      window.__nethackPromptTest.event({ name: 'bridge_direction_answer', return: 1, requestId: active.prompt?.requestId, transactionId: active.prompt?.transactionId, lifecycleRevision: active.prompt?.lifecycleRevision });
      window.__nethackPromptTest.event({ name: 'shim_putstr', text: 'You hit the goblin.' });
      window.__nethackPromptTest.event({ name: 'shim_putstr', text: 'You hit the goblin.' });
      window.__nethackPromptTest.event({ name: 'bridge_direction_prompt', query: 'Choose a direction or map target.', choices: 'ykulnjbh.<>' });
      window.__nethackPromptTest.event({ name: 'bridge_direction_prompt', query: 'Choose a direction or map target.', choices: 'ykulnjbh.<>' });
      const finalPromptOwner = window.__nethackPromptTest.prompt();
      window.__nethackPromptTest.event({ name: 'bridge_direction_answer', return: 0, requestId: finalPromptOwner?.requestId, transactionId: finalPromptOwner?.transactionId, lifecycleRevision: finalPromptOwner?.lifecycleRevision });
      const finalState = { messages: window.__nethackPromptTest.messages(), helper: window.__nethackPromptTest.helper(), prompt: window.__nethackPromptTest.prompt() };
      const promptSpamCount = finalState.messages.filter((m) => /Choose a direction or map target/i.test(m)).length;
      return { active, finalState, promptSpamCount, assertions: {
        promptVisibleOnlyWhileActive: Boolean(active.helper.bodyActive && !active.helper.hidden && active.helper.title === 'Direction' && active.prompt && finalState.helper.bodyActive && !finalState.helper.hidden && finalState.helper.title === 'Move' && finalState.prompt === null),
        noDirectionPromptMessagesLogged: promptSpamCount === 0,
        noConsecutiveDuplicateNormalMessages: (finalState.messages.join('\\n').match(/You hit the goblin\\./g) || []).length === 1,
      } };
    })()` });
    if (evalResult.exceptionDetails) throw new Error(`Runtime evaluation failed: ${JSON.stringify(evalResult.exceptionDetails)}`);
    const metrics = evalResult.result.value;
    if (!metrics) throw new Error(`Runtime evaluation returned no metrics: ${JSON.stringify(evalResult)}`);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const screenshot = path.join(outDir, 'prompt-spam-state.png');
    fs.writeFileSync(screenshot, Buffer.from(shot.data, 'base64'));
    fs.writeFileSync(path.join(outDir, 'prompt-spam-state-metrics.json'), JSON.stringify({ ...metrics, screenshot }, null, 2));
    console.log(JSON.stringify({ ...metrics, screenshot }, null, 2));
    const failed = Object.entries(metrics.assertions).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`prompt spam/state assertions failed: ${failed.join(', ')}`);
  } finally {
    cleanup();
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
