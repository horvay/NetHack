const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_MOVEMENT_PALETTE_OUT_DIR || path.join(root, 'test-output/movement-palette-regression');
const port = Number(process.env.NH_MOVEMENT_PALETTE_CDP_PORT || 19477);

async function state(page) {
  return page.evalCheckedValue(`(() => ({
    helpOpen: Boolean(document.getElementById('ux-help-center')?.open),
    paletteOpen: Boolean(document.getElementById('ux-command-palette')?.open),
    actionOpen: Boolean(document.getElementById('action-dialog')?.open),
    activeId: document.activeElement?.id || '',
    movementMode: document.querySelector('[data-movement-mode][aria-pressed="true"]')?.dataset?.movementMode || '',
    repeatFocused: document.activeElement?.id === 'repeat-count',
    sent: window.__nethackPromptTest.sentInputs().join(''),
  }))()`);
}

async function activate(page, commandId) {
  const current = await state(page);
  if (current.helpOpen || current.actionOpen) await page.pressKey('Escape');
  await page.evalCheckedValue('window.__nethackPromptTest.clearSentInputs(); true');
  await page.click('#open-actions');
  await page.click(`#ux-command-palette [data-command-id="${commandId}"]`);
  await Harness.delay(100);
  return state(page);
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const results = {};
  await Harness.withElectronPage({ root, port, width: 1280, height: 900, outputDir: outDir }, async (page) => {
    await page.waitForCheckedValue("document.readyState === 'complete' && !!window.__nethackPromptTest && !!window.NetHackUxRuntime?.runtime?.domain('discovery')", 10000);
    await page.evalCheckedValue(`(() => {
      const t = window.__nethackPromptTest;
      t.reset();
      t.setRunning(true);
      t.clearSentInputs();
      for (const id of ['startup-choice-dialog', 'character-dialog', 'intro-dialog', 'document-dialog', 'action-dialog', 'interaction-dialog']) document.getElementById(id)?.close?.();
      return true;
    })()`);

    for (const [commandId, expectedMode] of [['dungeon.walk', 'walk'], ['dungeon.run', 'run'], ['dungeon.fight', 'fight']]) {
      results[commandId] = await activate(page, commandId);
      assert.equal(results[commandId].helpOpen, false, `${commandId} must not open Help`);
      assert.equal(results[commandId].movementMode, expectedMode, `${commandId} must arm ${expectedMode} mode`);
      assert.equal(results[commandId].actionOpen, true, `${commandId} must open the direction controls`);
      assert.equal(results[commandId].sent, '', `${commandId} must wait for a direction`);
    }
    await page.click('#movement-actions [data-move-direction="k"]');
    await Harness.delay(100);
    results.fightDirection = await state(page);
    assert.equal(results.fightDirection.sent, 'Fk', 'Fight followed by North must send the classic F + direction command');
    assert.equal(results.fightDirection.actionOpen, false, 'Choosing a Fight direction must close the direction controls');

    results['dungeon.counts'] = await activate(page, 'dungeon.counts');
    assert.equal(results['dungeon.counts'].helpOpen, false, 'Count prefixes must not open Help');
    assert.equal(results['dungeon.counts'].actionOpen, true, 'Count prefixes must open the repeat controls');
    assert.equal(results['dungeon.counts'].repeatFocused, true, `Count prefixes must focus the repeat count control, not ${results['dungeon.counts'].activeId || 'nothing'}`);
    assert.equal(results['dungeon.counts'].sent, '', 'Count prefixes must not send a command before an action is chosen');

    results['help.center'] = await activate(page, 'help.center');
    assert.equal(results['help.center'].helpOpen, true, 'Help must open the Help center');
    assert.equal(results['help.center'].sent, '', 'Help must not send a core command');
  });

  fs.writeFileSync(path.join(outDir, 'result.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
