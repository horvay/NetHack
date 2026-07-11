const fs = require('node:fs');
const path = require('node:path');
const {
  createElectronBrowserDriver,
  waitFor,
  removeStalePlaygroundLocks,
} = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-scenario-locked-container-direct-open');
const scenarioId = 'container/locked-trapped-chest-on-hero';
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
      const text = `${s.container?.text || ''}\n${s.status}\n${s.body}\n${s.shimTail}`;
      return /shim_container_snapshot_rejected/.test(s.shimTail || '') && /failureKind":"locked/.test(s.shimTail || '') && /container is locked|locked\. Use Force lock/i.test(text) && !/Loading container contents/i.test(s.container?.text || '') ? s : null;
    }, 12000);
    const afterShot = await driver.screenshot(path.join(outDir, '02-after-direct-open-locked-rejected.png'));
    const afterState = writeJson('02-after-direct-open-locked-rejected-state.json', afterOpen);

    assert('Open container dispatches typed container.snapshot and no #loot fallback', afterOpen.sent === '' && afterOpen.sentUiProtocolCommands.some((command) => command.commandType === 'container.snapshot' && command.payload?.containerId > 0), JSON.stringify({ sent: afterOpen.sent, commands: afterOpen.sentUiProtocolCommands }));
    assert('Bridge returns structured locked rejection', /shim_container_snapshot_rejected[^\n]*"failureKind":"locked"/.test(afterOpen.shimTail || ''), afterOpen.shimTail);
    assert('UI panel remains visible with locked message and no loading placeholder', afterOpen.container?.active && /locked\. Use Force lock|container is locked/i.test(afterOpen.container.text || '') && !/Loading container contents/i.test(afterOpen.container.text || ''), JSON.stringify(afterOpen.container));
    assert('Status/message area shows locked guidance', /locked/i.test(`${afterOpen.status}\n${afterOpen.messages.join('\n')}`), JSON.stringify({ status: afterOpen.status, messages: afterOpen.messages }));

    const summary = [
      '# Locked container direct-open real Electron regression',
      '',
      'PASS',
      '',
      `Scenario: ${scenarioId}`,
      `Removed stale playground locks before launch: ${removedLocks.map((lock) => path.basename(lock.file)).join(', ') || '(none)'}`,
      '',
      'Verified:',
      '- real scenario loaded with a locked/trapped container on the hero square',
      '- clicking Open dispatched typed `container.snapshot` and no `#loot` text fallback',
      '- bridge returned `shim_container_snapshot_rejected` with `failureKind:"locked"` and reason `container is locked`',
      '- UI replaced the loading state with visible locked guidance; no `Loading container contents…` remained in the panel',
      '',
      'Screenshots:',
      `- before click: ${beforeShot}`,
      `- after locked rejection: ${afterShot}`,
      '',
      'State sidecars:',
      `- ${beforeState}`,
      `- ${afterState}`,
      '',
    ].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-scenario-locked-container-direct-open-summary.md'), summary);
    console.log(summary);
  } finally {
    await driver.close().catch(() => {});
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
