const assert = require('node:assert/strict');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outputDir = process.env.NH_CAST_QUICK_ACTION_OUT_DIR || path.join(root, 'test-output', 'cast-quick-action');
const port = Number(process.env.NH_CAST_QUICK_ACTION_CDP_PORT || 9517);

async function main() {
  const page = await Harness.createElectronPageSession({
    root,
    port,
    width: 960,
    height: 720,
    outputDir,
    teardownTimeoutMs: 5000,
  });
  let scenarioError;
  try {
    await page.waitForValue("document.readyState === 'complete' && !!window.__nethackPromptTest", 10000);
    const result = await page.evalValue(`(() => {
      const test = window.__nethackPromptTest;
      const button = document.getElementById('cast-spell-button');
      const state = () => ({ hidden: button.hidden, visible: button.getClientRects().length > 0, title: button.title, label: button.textContent.trim() });

      test.reset();
      test.setRunning(false);
      const noRun = state();

      test.setRunning(true);
      const missingEvent = state();

      test.event({ name: 'shim_spell_availability', knownSpellCount: 2, authoritative: true, source: 'num_spells' });
      const learned = state();
      test.clearSentInputs();
      button.click();
      const clickSent = test.sentInputs().join('');

      test.event({ name: 'shim_spell_availability', knownSpellCount: 0, authoritative: true, source: 'num_spells' });
      const lost = state();

      test.event({ name: 'shim_spell_availability', knownSpellCount: 1, authoritative: true, source: 'num_spells' });
      test.setRunning(false);
      const stopped = state();

      test.reset();
      test.setRunning(true);
      const reset = state();
      return { noRun, missingEvent, learned, clickSent, lost, stopped, reset };
    })()`);

    assert.equal(result.noRun.hidden, true, 'Cast stays hidden without an active run');
    assert.equal(result.missingEvent.hidden, true, 'Cast stays hidden until native availability arrives');
    assert.deepEqual(result.learned, { hidden: false, visible: true, title: 'Cast a spell (Z)', label: 'Cast' }, 'learned native spells reveal the Cast action');
    assert.equal(result.clickSent, 'Z', 'Cast uses the standard playable-key route for Z');
    assert.equal(result.lost.hidden, true, 'losing all learned spells hides Cast');
    assert.equal(result.stopped.hidden, true, 'ending the run hides Cast even with a positive count');
    assert.equal(result.reset.hidden, true, 'new Game View state resets the count to zero');
    for (const name of ['noRun', 'missingEvent', 'lost', 'stopped', 'reset']) {
      assert.equal(result[name].visible, false, `${name}: stylesheet respects hidden Cast state`);
    }
    console.log(JSON.stringify({ passed: true, ...result }));
  } catch (error) {
    scenarioError = error;
  } finally {
    await page.close().catch(() => {});
  }
  if (scenarioError) throw scenarioError;
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
