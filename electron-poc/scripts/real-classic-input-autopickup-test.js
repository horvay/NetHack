const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');

function assert(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`);
}

async function state(driver) {
  return driver.evalCheckedValue(`(() => {
    const automation = window.__nethackAutomation?.state?.() || {};
    return {
      running: Boolean(automation.runningState?.running),
      cursor: automation.cursor || null,
      sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
      turn: Number(document.getElementById('log-now-turn')?.textContent) || 0,
      body: document.body.innerText,
      seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
      shimTail: (document.getElementById('shim-output')?.innerText || '').slice(-6000),
      dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
      interaction: window.__nethackPromptTest?.dialog?.(),
    };
  })()`);
}

async function finishEvidence(driver, qc, resultFile, scenarioError) {
  await driver.close().catch(() => {});
  qc.recordAssertions([{ id: 'classic-input-autopickup-contract', status: scenarioError ? 'failed' : 'passed', details: scenarioError?.message || '' }]);
  qc.recordLog({ id: 'electron-stdout', path: driver.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: driver.logs.stderr, classification: 'electron-stderr' });
  if (resultFile) qc.recordLog({ id: 'scenario-result', path: resultFile, classification: 'scenario-result' });
  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: driver.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(qc.manifestFile);
  console.log(`${scriptName}: CAPTURED ${driver.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

async function main() {
  if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]);
  const driver = await Harness.createElectronBrowserDriver({
    root,
    width: 1200,
    height: 820,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_SHIM_RESET_LOCKS: '1',
      NH_TEST_SCENARIO_ID: 'object/asset-tooltip-scroll-gold',
      NETHACK_SEED: '771144',
    },
  });
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: driver.outputDir, runIdentity: driver.outputIdentity, manifestFile: path.join(driver.outputDir, 'evidence-approval.json') });
  let scenarioError;
  let resultFile;
  try {
    await driver.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true, startButton: true });
    await driver.startDefaultGame({ timeoutMs: 20000, playerName: `Classic${process.pid}` });
    const before = await Harness.waitFor(async () => {
      await driver.dismissIntroDialogs();
      const current = await state(driver);
      if (/bridge_test_scenario_failed/.test(`${current.seenShim}\n${current.shimTail}`)) throw new Error(current.shimTail);
      return current.running && /bridge_test_scenario_loaded/.test(`${current.seenShim}\n${current.shimTail}`) && Number.isInteger(current.cursor?.x) ? current : null;
    }, 12000);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await Harness.waitFor(async () => {
      await driver.dismissIntroDialogs();
      return !(await state(driver)).dialogs.length;
    }, 7000);
    await driver.evalCheckedValue(`(() => {
      document.getElementById('game-grid').focus();
      return true;
    })()`);
    const beforeShot = await driver.screenshotEvidence(qc, '01-before-classic-input', { classification: 'synthetic-fixture', viewport: { width: 1200, height: 820, devicePixelRatio: 1 }, state: 'gold-west-before-input' });

    await driver.evalCheckedValue('window.__nethackPromptTest.clearSentInputs()');
    await driver.pressKey('h', 'h');
    const afterPickup = await Harness.waitFor(async () => {
      const current = await state(driver);
      return current.cursor?.x === before.cursor.x - 1 && /Gold\s*7/i.test(current.body) ? current : null;
    }, 7000);
    assert('Vim h moves west instead of opening Help', afterPickup.sent === 'h' && !afterPickup.dialogs.length && !afterPickup.interaction?.interactionOpen, JSON.stringify(afterPickup));
    assert('Stepping west auto-picks the seven gold pieces', /Gold\s*7/i.test(afterPickup.body) && /7 gold pieces/i.test(afterPickup.body), JSON.stringify({ cursor: afterPickup.cursor, body: afterPickup.body.slice(-1200) }));

    const beforeCountTurn = afterPickup.turn;
    await driver.evalCheckedValue('window.__nethackPromptTest.clearSentInputs()');
    await driver.pressKey('5', '5');
    await driver.pressKey('s', 's');
    const afterCount = await Harness.waitFor(async () => {
      const current = await state(driver);
      return current.turn >= beforeCountTurn + 5 ? current : null;
    }, 7000);
    assert('5s repeats search exactly five turns', afterCount.sent === '5s' && afterCount.turn === beforeCountTurn + 5, JSON.stringify({ beforeCountTurn, afterCount }));
    assert('Counted command leaves gameplay unblocked', !afterCount.dialogs.length && !afterCount.interaction?.interactionOpen, JSON.stringify(afterCount));

    const afterShot = await driver.screenshotEvidence(qc, '02-after-vim-gold-and-count', { classification: 'synthetic-fixture', viewport: { width: 1200, height: 820, devicePixelRatio: 1 }, state: 'gold-picked-count-complete' });
    const result = {
      before: { cursor: before.cursor, turn: before.turn },
      afterPickup: { cursor: afterPickup.cursor, turn: afterPickup.turn, sent: afterPickup.sent },
      afterCount: { cursor: afterCount.cursor, turn: afterCount.turn, sent: afterCount.sent },
      screenshots: { before: beforeShot, after: afterShot },
    };
    resultFile = path.join(driver.outputDir, 'classic-input-autopickup-result.json');
    fs.writeFileSync(resultFile, `${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const failureState = await state(driver).catch(() => null);
    scenarioError = new Error(`${error?.stack || error}${failureState ? `\nclassic input state: ${JSON.stringify(failureState)}` : ''}`);
  } finally {
    await finishEvidence(driver, qc, resultFile, scenarioError);
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
