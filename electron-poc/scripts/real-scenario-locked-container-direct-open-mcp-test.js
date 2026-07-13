const fs = require('node:fs');
const path = require('node:path');
const {
  createElectronBrowserDriver,
  waitFor,
  removeStalePlaygroundLocks,
} = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-scenario-locked-container-direct-open');
const scenarioId = 'container/locked-chest-unlock-open-context-on-hero';
const port = Number(process.env.NH_SCENARIO_LOCKED_DIRECT_OPEN_CDP_PORT || 9656);

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
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
    actions: window.__nethackPromptTest?.contextActions?.(),
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
    sentPayloads: window.__nethackPromptTest?.sentPayloads?.() || [],
    prompt: window.__nethackPromptTest?.prompt?.(),
    container: window.__nethackPromptTest?.container?.(),
    interaction: window.__nethackPromptTest?.dialog?.(),
    inventory: window.__nethackPromptTest?.inventory?.(),
    pendingContainerUnlockOpen: window.__nethackPromptTest?.pendingContainerUnlockOpen?.(),
    messages: window.__nethackPromptTest?.messages?.().slice(-12).map((m) => m.text || String(m)) || [],
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    body: document.body.innerText,
    seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
    shimTail: (document.getElementById('shim-output')?.innerText || '').slice(-8000),
  }))()`);
}

function actionText(s) {
  return (s.actions?.buttons || []).map((button) => `${button.id}:${button.text}`).join('\n');
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
      NETHACK_SEED: '626262',
      NETHACKOPTIONS: '!tutorial,!autopickup',
    },
  });
  try {
    await driver.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true, startButton: true });
    await driver.startDefaultGame({ timeoutMs: 20000, playerName: 'LockOpen' });
    await waitFor(async () => (await state(driver)).running, 20000);
    await driver.dismissIntroDialogs();
    await waitFor(async () => /bridge_test_scenario_loaded/.test(`${(await state(driver)).seenShim}\n${(await state(driver)).shimTail}`), 10000);

    const ready = await waitFor(async () => {
      const s = await state(driver);
      return (s.actions?.buttons || []).some((button) => button.id === 'open-container') ? s : null;
    }, 10000);
    const beforeShot = await driver.screenshot(path.join(outDir, '01-before-open-locked-container.png'));
    const beforeState = writeJson('01-before-open-locked-container-state.json', ready);
    assert('ready state exposes Open container action', /open-container:Open/i.test(actionText(ready)), actionText(ready));

    await driver.evalCheckedValue('window.__nethackPromptTest.clearSentInputs()');
    await driver.click('#context-action-bar button[data-context-action-id="open-container"]');
    const afterOpen = await waitFor(async () => {
      const s = await state(driver);
      const text = `${s.interaction?.title || ''}\n${s.interaction?.prompt || ''}\n${(s.interaction?.options || []).map((option) => option.text).join('\n')}`;
      return /shim_container_snapshot_rejected/.test(s.shimTail || '') && /failureKind":"locked/.test(s.shimTail || '') && /Locked chest actions/i.test(text) && /Unlock with skeleton key/i.test(text) && /Close/i.test(text) && !s.container?.active ? s : null;
    }, 12000).catch(async (error) => {
      const debug = await state(driver).catch(() => ({}));
      writeJson('debug-after-open-timeout-state.json', debug);
      await driver.screenshot(path.join(outDir, 'debug-after-open-timeout.png')).catch(() => undefined);
      throw error;
    });
    const afterShot = await driver.screenshot(path.join(outDir, '02-after-direct-open-locked-rejected.png'));
    const afterState = writeJson('02-after-direct-open-locked-rejected-state.json', afterOpen);

    const actionSheetText = `${afterOpen.interaction?.title || ''}\n${afterOpen.interaction?.prompt || ''}\n${(afterOpen.interaction?.options || []).map((option) => option.text).join('\n')}`;
    assert('Open container dispatches typed container.snapshot and no #loot fallback', afterOpen.sent === '' && afterOpen.sentUiProtocolCommands.some((command) => command.commandType === 'container.snapshot' && command.payload?.containerId > 0), JSON.stringify({ sent: afterOpen.sent, commands: afterOpen.sentUiProtocolCommands }));
    assert('Bridge returns structured locked rejection', /shim_container_snapshot_rejected[^\n]*"failureKind":"locked"/.test(afterOpen.shimTail || ''), afterOpen.shimTail);
    assert('Locked rejection closes the transfer panel and opens a player-facing action sheet', !afterOpen.container?.active && afterOpen.interaction?.interactionOpen && /Locked chest actions/i.test(actionSheetText), JSON.stringify({ container: afterOpen.container, interaction: afterOpen.interaction }));
    assert('Action sheet names the available key path without offering an unavailable force path', /Unlock with skeleton key/i.test(actionSheetText) && !/Force (?:lock|with)/i.test(actionSheetText), actionSheetText);
    assert('Action sheet has a clear cancel path and no loading or timeout fallback', /Close|Cancel/i.test(actionSheetText) && !/Loading container contents|did not finish opening|normal NetHack flow/i.test(`${afterOpen.body}\n${actionSheetText}`), `${afterOpen.body}\n${actionSheetText}`);
    await driver.click('#interaction-options .choice-button');
    const afterUnlock = await waitFor(async () => {
      const s = await state(driver);
      return s.container?.active && /food ration/i.test(s.container.text || '') && /dagger/i.test(s.container.text || '') ? s : null;
    }, 30000).catch(async (error) => {
      const debug = await state(driver).catch(() => ({}));
      writeJson('debug-after-unlock-timeout-state.json', debug);
      await driver.screenshot(path.join(outDir, 'debug-after-unlock-timeout.png')).catch(() => undefined);
      throw error;
    });
    const unlockedShot = await driver.screenshot(path.join(outDir, '03-after-unlock-open.png'));
    const unlockedState = writeJson('03-after-unlock-open-state.json', afterUnlock);
    assert('Unlock action applies the visible skeleton key at the current square and confirms the chosen intent', /^af\.y$/.test(afterUnlock.sent || ''), JSON.stringify({ sent: afterUnlock.sent, messages: afterUnlock.messages }));
    assert('Successful lock picking opens fresh container contents and clears continuation state', /food ration/i.test(afterUnlock.container?.text || '') && /dagger/i.test(afterUnlock.container?.text || '') && afterUnlock.pendingContainerUnlockOpen == null, JSON.stringify({ container: afterUnlock.container, pending: afterUnlock.pendingContainerUnlockOpen }));
    assert('Post-unlock panel has no generic timeout fallback', !/did not finish opening|normal NetHack flow|Loading container contents/i.test(`${afterUnlock.body}\n${afterUnlock.container?.text || ''}`), `${afterUnlock.body}\n${afterUnlock.container?.text || ''}`);

    const summary = [
      '# Locked container direct-open real Electron regression',
      '',
      'PASS',
      '',
      `Scenario: ${scenarioId}`,
      `Removed stale playground locks before launch: ${removedLocks.map((lock) => path.basename(lock.file)).join(', ') || '(none)'}`,
      '',
      'Verified:',
      '- clicking Open dispatched typed `container.snapshot` and no `#loot` text fallback',
      '- bridge returned `shim_container_snapshot_rejected` with `failureKind:"locked"`',
      '- the transfer panel closed and a `Locked chest actions` sheet named the available `Unlock with skeleton key` path and a cancel path',
      '- no loading placeholder or generic timeout fallback remained visible',
      '- selecting the key applies it to the current square, then a fresh container snapshot opens the actual contents',
      '- the unlock continuation clears and no generic post-pick timeout fallback appears',
      '',
      'Screenshots:',
      `- before click: ${beforeShot}`,
      `- after locked rejection: ${afterShot}`,
      `- after unlock/open: ${unlockedShot}`,
      '',
      'State sidecars:',
      `- ${beforeState}`,
      `- ${afterState}`,
      `- ${unlockedState}`,
      '',
    ].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-scenario-locked-container-direct-open-summary.md'), summary);
    console.log(summary);
  } finally {
    await driver.close().catch(() => {});
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
