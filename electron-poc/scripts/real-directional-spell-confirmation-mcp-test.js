const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'test-output', 'directional-spell-confirmation');
const { delay, waitFor } = Harness;

function assert(name, ok, detail = '') {
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

async function state(page) {
  return page.evalCheckedValue(`(() => ({
    running: Boolean(window.__nethackAutomation?.state?.().runningState?.running),
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
    prompt: window.__nethackPromptTest?.prompt?.() || null,
    dialog: window.__nethackPromptTest?.dialog?.() || {},
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    activeText: String(document.activeElement?.textContent || '').trim(),
    activeKey: String(document.activeElement?.dataset?.key || ''),
    messages: window.__nethackPromptTest?.messages?.().slice(-10).map((message) => message.text || String(message)) || [],
  }))()`);
}

async function startWizard(page, name) {
  await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
  await page.clickStartShim();
  let dialogs = await waitFor(async () => {
    const current = (await state(page)).dialogs;
    return current.includes('startup-choice-dialog') || current.includes('character-dialog') ? current : null;
  }, 10000);
  if (dialogs.includes('startup-choice-dialog')) {
    await page.click('#startup-new-game');
    dialogs = await waitFor(async () => {
      const current = (await state(page)).dialogs;
      return current.includes('character-dialog') ? current : null;
    }, 5000);
  }
  await page.setInputValue('#player-role', 'Wiz');
  await page.setInputValue('#player-name', name);
  await page.click('#confirm-character');
  await waitFor(async () => (await state(page)).running, 20000);
  await page.dismissIntroDialogs();
  await page.evalCheckedValue(`(() => {
    document.getElementById('game-grid')?.focus?.();
    window.__nethackPromptTest?.clearSentInputs?.();
    return true;
  })()`);
}

async function createPage() {
  return Harness.createElectronBrowserDriver({
    root,
    width: 1360,
    height: 920,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NETHACK_SEED: '424242',
      NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none',
    },
  });
}

async function reproduceYesDefault() {
  const page = await createPage();
  try {
    await startWizard(page, `YesDefault${process.pid}`);
    await page.pressKey('S', 'S');
    const prompt = await waitFor(async () => {
      const current = await state(page);
      return current.dialog?.interactionOpen && /Really save|Save the game/i.test(current.dialog.prompt || '') ? current : null;
    }, 10000);
    const screenshot = path.join(outputDir, '01-save-confirmation-default.png');
    await page.screenshot(screenshot);
    return { focusedChoice: prompt.activeText, focusedKey: prompt.activeKey, screenshot };
  } finally {
    await page.close().catch(() => {});
  }
}

async function reproduceDirectionalCast(mode) {
  const page = await createPage();
  try {
    await startWizard(page, `Direction${mode}${process.pid}`);
    await page.pressKey('Z', 'Z');
    await waitFor(async () => {
      const current = await state(page);
      return current.dialog?.interactionOpen && /Choose which spell to cast/i.test(current.dialog.prompt || '') ? current : null;
    }, 10000);
    if (mode === 'button') {
      await page.click('#interaction-options .choice-button[data-key="a"]');
    } else {
      await page.pressKey('a', 'a');
    }
    const direction = await waitFor(async () => {
      const current = await state(page);
      return /In what direction/i.test(current.prompt?.query || '') ? current : null;
    }, 10000);
    const promptScreenshot = path.join(outputDir, `02-force-bolt-${mode}-direction-prompt.png`);
    await page.screenshot(promptScreenshot);
    if (mode === 'button') {
      await page.click('#direction-helper-options button[data-key="l"]');
    } else {
      await page.pressKey('ArrowRight', '');
    }
    const after = await waitFor(async () => {
      const current = await state(page);
      return current.sent === 'Zal' && !current.prompt && !current.dialog?.interactionOpen ? current : null;
    }, 10000);
    const resultScreenshot = path.join(outputDir, `03-force-bolt-${mode}-result.png`);
    await page.screenshot(resultScreenshot);
    return { before: direction, after, promptScreenshot, resultScreenshot };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const yesDefault = await reproduceYesDefault();
  const keyboardCast = await reproduceDirectionalCast('keyboard');
  const buttonCast = await reproduceDirectionalCast('button');
  const failures = [];
  if (yesDefault.focusedKey.toLowerCase() !== 'y') failures.push(`confirmation focused ${JSON.stringify(yesDefault.focusedChoice)} (${JSON.stringify(yesDefault.focusedKey)}) instead of Yes`);
  for (const [mode, cast] of Object.entries({ keyboard: keyboardCast, button: buttonCast })) {
    if (cast.after.sent !== 'Zal') failures.push(`${mode} path produced ${JSON.stringify(cast.after.sent)} instead of "Zal"`);
    if (cast.after.prompt) failures.push(`direction prompt remained open after ${mode} path: ${JSON.stringify(cast.after.prompt)}`);
    if (cast.after.dialog?.interactionOpen) failures.push(`spell chooser reopened after ${mode} path: ${JSON.stringify(cast.after.dialog)}`);
  }
  assert('directional spell and confirmation defaults', failures.length === 0, failures.join('; '));
  console.log(JSON.stringify({ ok: true, yesDefault, keyboardCast, buttonCast }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
