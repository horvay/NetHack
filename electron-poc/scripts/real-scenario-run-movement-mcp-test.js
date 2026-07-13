const fs = require('node:fs');
const path = require('node:path');
const { createElectronBrowserDriver, waitFor, removeStalePlaygroundLocks } = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'real-scenario-run-movement');
const port = Number(process.env.NH_SCENARIO_RUN_MOVEMENT_CDP_PORT || 9664);

function assert(name, ok, detail = '') {
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

async function state(driver) {
  return driver.evalCheckedValue(`(() => {
    const automation = window.__nethackAutomation?.state?.() || {};
    return {
      running: Boolean(automation.runningState?.running),
      cursor: automation.cursor || null,
      sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
      movement: window.__nethackPromptTest?.movement?.(),
      prompt: window.__nethackPromptTest?.prompt?.(),
      body: document.body.innerText,
      seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
      shimTail: (document.getElementById('shim-output')?.innerText || '').slice(-6000),
    };
  })()`);
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  removeStalePlaygroundLocks({ root });
  const driver = await createElectronBrowserDriver({
    root,
    port,
    width: 1200,
    height: 820,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_SHIM_RESET_LOCKS: '1',
      NH_TEST_SCENARIO_ID: 'movement/open-runway',
      NETHACK_SEED: '777331',
      NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none',
    },
  });
  try {
    await driver.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true, startButton: true });
    await driver.startDefaultGame({ timeoutMs: 20000, playerName: 'RunTester' });
    await driver.dismissIntroDialogs();
    const before = await waitFor(async () => {
      const s = await state(driver);
      if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shimTail}`)) throw new Error(s.shimTail);
      return s.running && /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shimTail}`) && Number.isInteger(s.cursor?.x) ? s : null;
    }, 12000);
    await driver.dismissIntroDialogs();
    await waitFor(async () => driver.evalCheckedValue(`!document.getElementById('intro-dialog')?.open && !document.getElementById('document-dialog')?.open`), 7000);
    const beforeShot = await driver.screenshot(path.join(outDir, '01-before-run.png'));
    await driver.evalCheckedValue('window.__nethackPromptTest.clearSentInputs()');
    await driver.click('#direction-helper [data-compass-run]');
    await driver.click('#direction-helper [data-key="l"]');
    const after = await waitFor(async () => {
      const s = await state(driver);
      return Number.isInteger(s.cursor?.x) && s.cursor.x >= before.cursor.x + 3 ? s : null;
    }, 10000).catch(async (error) => {
      const debug = await state(driver).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, 'debug-run-state.json'), JSON.stringify(debug, null, 2));
      await driver.screenshot(path.join(outDir, 'debug-run.png')).catch(() => undefined);
      throw error;
    });
    const afterShot = await driver.screenshot(path.join(outDir, '02-after-run.png'));
    assert('Run emits the native direct-run direction key', after.sent === 'L', JSON.stringify({ sent: after.sent, movement: after.movement }));
    assert('Run traverses multiple open squares', after.cursor.x - before.cursor.x >= 3 && after.cursor.y === before.cursor.y, JSON.stringify({ before: before.cursor, after: after.cursor }));
    assert('Run does not leave a direction prompt open', !after.prompt, JSON.stringify(after.prompt));
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ before: before.cursor, after: after.cursor, deltaX: after.cursor.x - before.cursor.x, sent: after.sent, screenshots: { before: beforeShot, after: afterShot } }, null, 2));
    console.log(`real-scenario-run-movement PASS (${before.cursor.x},${before.cursor.y} -> ${after.cursor.x},${after.cursor.y}; sent ${JSON.stringify(after.sent)})`);
    console.log(`Screenshots: ${beforeShot} ${afterShot}`);
  } finally {
    await driver.close().catch(() => undefined);
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
