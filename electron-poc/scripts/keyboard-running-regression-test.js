const assert = require('node:assert/strict');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outputDir = process.env.NH_KEYBOARD_RUNNING_OUT_DIR || path.join(root, 'test-output', 'keyboard-running-regression');
const port = Number(process.env.NH_KEYBOARD_RUNNING_CDP_PORT || 9497);

async function main() {
  const page = await Harness.createElectronPageSession({
    root,
    port,
    width: 1200,
    height: 820,
    outputDir,
    teardownTimeoutMs: 5000,
  });
  let scenarioError;
  try {
    await page.waitForValue("document.readyState === 'complete' && !!window.__nethackPromptTest", 10000);
    const result = await page.evalValue(`(() => {
      const test = window.__nethackPromptTest;
      const dispatch = (shiftKey) => {
        test.reset();
        test.setRunning(true);
        document.getElementById('startup-choice-dialog')?.close?.('keyboard-running-regression');
        document.getElementById('game-grid').focus();
        const event = new KeyboardEvent('keydown', {
          key: 'ArrowLeft',
          code: 'ArrowLeft',
          shiftKey,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(event);
        return { sent: test.sentInputs().join(''), defaultPrevented: event.defaultPrevented };
      };
      return { walk: dispatch(false), run: dispatch(true) };
    })()`);
    assert.deepEqual(result.walk, { sent: 'h', defaultPrevented: true }, 'ArrowLeft walks one square with the canonical west key');
    assert.deepEqual(result.run, { sent: 'gh', defaultPrevented: true }, 'Shift+ArrowLeft sends NetHack run plus west, not one-step west');
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
