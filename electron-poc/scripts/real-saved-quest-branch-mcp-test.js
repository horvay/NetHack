#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');
const bridge = path.join(root, 'shim-bridge', 'nh-shim-bridge');
const sourcePlayground = path.join(repoRoot, 'playground');
const outDir = process.env.NH_SAVED_QUEST_BRANCH_OUT_DIR || path.join(root, 'test-output', 'real-saved-quest-branch');
const playground = path.join(outDir, 'playground');
const scenarioId = 'quest/leader-admits-worthy-hero';
const playerName = `SavedQuest${Date.now().toString(36).slice(-5)}`;
const port = Number(process.env.NH_SAVED_QUEST_BRANCH_CDP_PORT || 9678);
const { waitFor, delay } = Harness;

function resetPlayground() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(playground, 'save'), { recursive: true });
  for (const name of ['nhdat', 'sysconf', 'symbols', 'license', 'perm']) {
    const source = path.join(sourcePlayground, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(playground, name));
  }
}

function saveFiles() {
  try {
    return fs.readdirSync(path.join(playground, 'save')).map((name) => path.join(playground, 'save', name));
  } catch {
    return [];
  }
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(2000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function createQuestBranchSave() {
  const child = spawn(bridge, [`-u${playerName}-Val-Hum-Fem-Law`], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NH_TEST_PLAYGROUND: playground,
      NETHACKDIR: playground,
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_SCENARIO_ID: scenarioId,
      NETHACK_SEED: '424242',
      NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none,disclose:+i +a +v +g +c +o',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  try {
    await waitFor(() => stdout.includes('bridge_start'), 10000);
    await waitFor(() => /bridge_test_scenario_loaded/.test(stdout), 20000);
    await waitFor(() => /Home:?1|Home\s+1|Norn/i.test(stdout), 15000);
    assert.doesNotMatch(`${stdout}\n${stderr}`, /bridge_test_scenario_failed|Program in disorder/i);
    const promptCountBeforeWait = (stdout.match(/"name":"bridge_command_prompt"/g) || []).length;
    child.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: '.'.charCodeAt(0) })}\n`);
    await waitFor(() => {
      const promptCount = (stdout.match(/"name":"bridge_command_prompt"/g) || []).length;
      return /"name":"bridge_command".*"keycode":46/.test(stdout) && promptCount > promptCountBeforeWait;
    }, 10000);
    child.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: 'S'.charCodeAt(0) })}\n`);
    await waitFor(() => /Really save|Save the game/i.test(`${stdout}\n${stderr}`), 10000).catch(() => null);
    child.stdin.write(`${JSON.stringify({ type: 'keycode', keycode: 'y'.charCodeAt(0) })}\n`);
    await waitFor(() => saveFiles().length ? saveFiles() : null, 15000);
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(3000)]);
    return { saveFiles: saveFiles(), stdoutTail: stdout.slice(-8000), stderrTail: stderr.slice(-4000) };
  } finally {
    await stopChild(child);
  }
}

async function state(page) {
  return page.evalCheckedValue(`(() => ({
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    recovery: window.__nethackAutomation?.recoveryState?.() || null,
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
    actions: window.__nethackPromptTest?.contextActions?.() || null,
    messages: window.__nethackPromptTest?.messages?.().slice(-40).map((message) => message.text || String(message)) || [],
    documentOpen: Boolean(document.getElementById('document-dialog')?.open),
    documentTitle: document.getElementById('document-title')?.textContent || '',
    documentBody: document.getElementById('document-body')?.textContent || '',
    body: document.body.innerText,
    seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
    shimTail: (document.getElementById('shim-output')?.innerText || '').slice(-16000),
  }))()`);
}

async function main() {
  resetPlayground();
  const createdSave = await createQuestBranchSave();
  assert.ok(createdSave.saveFiles.length > 0, 'Quest branch setup created a save file');

  const page = await Harness.createElectronBrowserDriver({
    root,
    port,
    width: 1360,
    height: 920,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_PLAYGROUND: playground,
      NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none,disclose:+i +a +v +g +c +o',
    },
  });
  try {
    await page.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true, startButton: true });
    const startup = await waitFor(async () => {
      const current = await state(page);
      return current.dialogs.includes('startup-choice-dialog') && current.recovery?.hasContinue ? current : null;
    }, 10000);
    const startupShot = await page.screenshot(path.join(outDir, '01-saved-quest-startup-choice.png'));

    await page.click('#startup-continue-game');
    await waitFor(async () => {
      const current = await state(page);
      return current.running && /Restoring save file|Welcome back|Velkommen back/i.test(current.messages.join('\n')) ? current : null;
    }, 30000);
    await page.evalCheckedValue(`(() => {
      document.getElementById('intro-dialog')?.close?.('test');
      document.getElementById('document-dialog')?.close?.('test');
      document.getElementById('game-grid')?.focus?.();
      return true;
    })()`);

    const restored = await waitFor(async () => {
      const current = await state(page);
      const actionText = (current.actions?.buttons || []).map((button) => `${button.id}:${button.text}`).join('\n');
      return /Home\s*1/i.test(current.body) && /chat/i.test(actionText) ? current : null;
    }, 15000);
    const restoredShot = await page.screenshot(path.join(outDir, '02-restored-quest-home.png'));
    assert.doesNotMatch(`${restored.body}\n${restored.shimTail}`, /bridge_test_scenario_failed|Program in disorder|Recovery impossible/i);

    const chatClicked = await page.evalCheckedValue(`(() => {
      const button = document.querySelector('[data-context-action-id^="chat-"]');
      button?.click();
      return Boolean(button);
    })()`);
    assert.ok(chatClicked, 'restored Quest Home exposes the native Chat action for the Norn');
    const dialogue = await waitFor(async () => {
      const current = await state(page);
      return current.documentOpen && /Orb of Fate|Lord Surtur|Ragnarok/i.test(current.documentBody) ? current : null;
    }, 12000);
    const dialogueShot = await page.screenshot(path.join(outDir, '03-restored-quest-dialogue.png'));
    assert.doesNotMatch(`${dialogue.documentBody}\n${dialogue.body}`, /Inventory selector|Name unavailable|Program in disorder/i);

    const result = {
      scenarioId,
      playerName,
      createdSave,
      restored: {
        messages: restored.messages,
        actions: restored.actions,
        branchVisible: /Home\s*1/i.test(restored.body),
      },
      dialogue: {
        title: dialogue.documentTitle,
        body: dialogue.documentBody,
      },
      screenshots: { startup: startupShot, restored: restoredShot, dialogue: dialogueShot },
    };
    fs.writeFileSync(path.join(outDir, 'evidence.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log('# Saved Quest branch restore\nPASS\n' + JSON.stringify(result, null, 2));
  } finally {
    const output = page.output();
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), output.stdout);
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), output.stderr);
    await page.close().catch(() => undefined);
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
