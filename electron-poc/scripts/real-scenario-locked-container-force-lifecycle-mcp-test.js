const fs = require('node:fs');
const path = require('node:path');
const {
  createElectronBrowserDriver,
  waitFor,
  delay,
  removeStalePlaygroundLocks,
} = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-scenario-locked-container-force-lifecycle');
const scenarioId = 'container/locked-chest-east-unrevealed';
const port = Number(process.env.NH_SCENARIO_LOCKED_FORCE_LIFECYCLE_CDP_PORT || 9647);

function assert(name, ok, detail = '') {
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

function writeJson(name, value) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
}

async function state(driver) {
  return driver.evalCheckedValue(`(() => ({
    status: document.getElementById('status')?.textContent || '',
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
    actions: window.__nethackPromptTest?.contextActions?.(),
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    sentPayloads: window.__nethackPromptTest?.sentPayloads?.() || [],
    sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
    sentUiProtocolAcks: window.__nethackPromptTest?.sentUiProtocolAcks?.() || [],
    prompt: window.__nethackPromptTest?.prompt?.(),
    dialog: window.__nethackPromptTest?.dialog?.(),
    currentCell: window.__nethackPromptTest?.currentCell?.(),
    ground: window.__nethackPromptTest?.groundSnapshots?.(),
    messages: window.__nethackPromptTest?.messages?.().slice(-18).map((m) => m.text || String(m)) || [],
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    body: document.body.innerText,
    seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
    shimTail: (document.getElementById('shim-output')?.innerText || '').slice(-6000)
  }))()`);
}

function actionIds(s) {
  return (s.actions?.buttons || []).map((button) => button.id);
}

function actionText(s) {
  return (s.actions?.buttons || []).map((button) => `${button.id}:${button.text}`).join('\n');
}

async function sendGameKey(driver, ch) {
  await driver.evalCheckedValue(`window.__nethackAutomation.sendKeycode(${JSON.stringify(ch.charCodeAt(0))})`);
}

async function main() {
  if (fs.existsSync(outDir)) fs.renameSync(outDir, `${outDir}.previous-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });
  const removedLocks = removeStalePlaygroundLocks({ root });
  const driver = await createElectronBrowserDriver({
    root,
    port,
    width: 1360,
    height: 920,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_SHIM_RESET_LOCKS: '1',
      NH_TEST_SCENARIO_ID: scenarioId,
      NETHACK_SEED: '515151',
      NETHACKOPTIONS: '!tutorial,!autopickup',
    },
  });
  try {
    await driver.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true, startButton: true });
    await driver.startDefaultGame({ timeoutMs: 20000, playerName: 'ForceLife' });
    await waitFor(async () => (await state(driver)).running, 20000);
    await driver.dismissIntroDialogs();
    await waitFor(async () => /bridge_test_scenario_loaded/.test(`${(await state(driver)).seenShim}\n${(await state(driver)).shimTail}`), 10000);

    await sendGameKey(driver, 'l');
    const initial = await waitFor(async () => {
      const s = await state(driver);
      const ids = actionIds(s);
      const text = `${s.messages.join('\n')}\n${s.currentCell?.groundTexts?.join('\n') || ''}`;
      return ids.includes('open-container') && /chest/i.test(text) ? s : null;
    }, 10000);
    const initialShot = await driver.screenshot(path.join(outDir, '01-on-chest-before-open.png'));
    const initialState = writeJson('01-on-chest-before-open-state.json', initial);
    assert('initial on-chest state exposes Open chest', actionText(initial).includes('open-container:Open chest'), actionText(initial));
    assert('initial on-chest state does not expose Force lock before visible locked message', !actionIds(initial).includes('force-container'), actionText(initial));
    assert('initial visible state does not already describe a locked chest', !/locked chest/i.test(`${initial.messages.join('\n')}\n${initial.currentCell?.visibleMessageGroundTexts?.map((x) => x.text).join('\n') || ''}`), JSON.stringify(initial.messages));

    await driver.evalCheckedValue('window.__nethackPromptTest.clearSentInputs()');
    await driver.click('#context-action-bar button[data-context-action-id="open-container"]');
    const afterOpen = await waitFor(async () => {
      const s = await state(driver);
      const text = `${s.messages.join('\n')}\n${s.body}\n${s.status}`;
      return /(?:turns? out to be locked|locked chest|chest.*locked)/i.test(text) && actionIds(s).includes('force-container') ? s : null;
    }, 10000);
    const afterOpenShot = await driver.screenshot(path.join(outDir, '02-after-open-locked-message-force-visible.png'));
    const afterOpenState = writeJson('02-after-open-locked-message-force-visible-state.json', afterOpen);
    assert('open attempt sends exact #loot route', afterOpen.sent === '#loot\n', JSON.stringify({ sent: afterOpen.sent, status: afterOpen.status }));
    assert('open attempt produces visible locked-container message', /(?:turns? out to be locked|locked chest|chest.*locked)/i.test(afterOpen.messages.join('\n')), JSON.stringify(afterOpen.messages));
    assert('Force lock appears without stepping off/on after visible locked message', actionIds(afterOpen).includes('force-container'), actionText(afterOpen));
    assert('visible locked message created public ground target evidence', (afterOpen.ground?.piles || []).some((pile) => (pile.items || []).some((item) => /locked chest/i.test(item.displayName || ''))) || (afterOpen.currentCell?.visibleMessageGroundTexts || []).some((item) => /locked chest/i.test(item.text || '')), JSON.stringify({ ground: afterOpen.ground, currentCell: afterOpen.currentCell }));

    await driver.evalCheckedValue('window.__nethackPromptTest.clearSentInputs()');
    await driver.click('#context-action-bar button[data-context-action-id="force-container"]');
    const afterForce = await waitFor(async () => {
      const s = await state(driver);
      const text = `${s.messages.join('\n')}\n${s.prompt?.query || ''}\n${s.dialog?.prompt || ''}\n${s.status}\n${s.shimTail}`;
      if (/blocked ground\.forceContainer|ground revision changed|bridge_ui_command_rejected[^\n]*ground\.forceContainer/i.test(text)) throw new Error(`force rejected: ${text.slice(-2000)}`);
      return s.sent === '#force\n' && /bridge_ui_command_accepted[^\n]*ground\.forceContainer/i.test(s.shimTail || '') && /force|lock|weapon|tool|pick-axe|direction/i.test(text) ? s : null;
    }, 12000);
    const afterForceShot = await driver.screenshot(path.join(outDir, '03-after-force-lock-action-proceeds.png'));
    const afterForceState = writeJson('03-after-force-lock-action-proceeds-state.json', afterForce);
    assert('Force lock context action routes exactly to #force', afterForce.sent === '#force\n', JSON.stringify({ sent: afterForce.sent, status: afterForce.status }));
    assert('Force lock is a v2 native ground.forceContainer command', afterForce.sentUiProtocolCommands.some((command) => command.commandType === 'action.execute' && command.actionId === 'ground.forceContainer' && command.targets?.location?.kind === 'ground' && command.payload?.promptPolicy === 'netHack-owned-followup'), JSON.stringify(afterForce.sentUiProtocolCommands));
    assert('Bridge accepted ground.forceContainer without stale-ground rejection', /bridge_ui_command_accepted[^\n]*ground\.forceContainer/i.test(afterForce.shimTail || '') && !/bridge_ui_command_rejected[^\n]*ground\.forceContainer/i.test(afterForce.shimTail || ''), afterForce.shimTail);
    assert('NetHack-owned force prompt/action proceeded after click', /force|lock|weapon|tool|pick-axe|direction/i.test(`${afterForce.messages.join('\n')}\n${afterForce.prompt?.query || ''}\n${afterForce.dialog?.prompt || ''}`), JSON.stringify({ messages: afterForce.messages, prompt: afterForce.prompt, dialog: afterForce.dialog }));
    assert('no raw selector fallback or placeholder UI appeared', !/Inventory selector|Name unavailable|Loading your inventory/i.test(afterForce.body), afterForce.body.slice(0, 1200));

    const summary = [
      '# Locked chest Force lock lifecycle real Electron smoke',
      '',
      'PASS',
      '',
      `Scenario: ${scenarioId}`,
      `Removed stale playground locks before launch: ${removedLocks.map((lock) => path.basename(lock.file)).join(', ') || '(none)'}`,
      '',
      'Verified lifecycle:',
      '- moved onto a real locked chest fixture that was only publicly visible as a chest',
      '- initial current-square context exposed Open chest but not Force lock',
      '- clicking Open chest sent `#loot\\n` and NetHack produced a visible locked-container message',
      '- contextual actions refreshed immediately to include Force lock without moving off/on',
      '- clicking Force lock sent exactly `#force\\n` as native v2 `ground.forceContainer` with a current public ground target and NetHack-owned follow-up policy',
      '- bridge accepted the command; no stale-ground/native rejection and no raw fallback labels were visible',
      '',
      'Screenshots:',
      `- before open: ${initialShot}`,
      `- after locked message: ${afterOpenShot}`,
      `- after force action: ${afterForceShot}`,
      '',
      'State sidecars:',
      `- ${initialState}`,
      `- ${afterOpenState}`,
      `- ${afterForceState}`,
      '',
      'Visible actions after locked message:',
      '```',
      actionText(afterOpen),
      '```',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-scenario-locked-container-force-lifecycle-summary.md'), summary);
    console.log(summary);
  } finally {
    await driver.close().catch(() => {});
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
