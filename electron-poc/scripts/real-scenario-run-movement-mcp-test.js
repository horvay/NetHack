const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');
function reviewRun(outputDir, reviewFile) { const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json'); const approval = EvidenceApproval.openEvidenceApproval({ manifestFile }); EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile)); const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true }); if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(manifestFile); console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`); }
function createEvidence(page) { return Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') }); }
async function finishEvidence(page, qc, scenarioError) { await page.close().catch(() => {}); qc.recordAssertions([{ id: 'scenario-contract', status: scenarioError ? 'failed' : 'passed', details: scenarioError?.message || '' }]); qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' }); qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' }); const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false }); if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(qc.manifestFile); console.log(`${scriptName}: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`); if (scenarioError) throw scenarioError; }
let outDir;


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
      interaction: {
        open: Boolean(document.getElementById('interaction-dialog')?.open),
        title: document.getElementById('interaction-title')?.textContent?.trim() || '',
      },
    };
  })()`);
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
      NH_TEST_SCENARIO_ID: 'movement/open-runway',
      NETHACK_SEED: '777331',
      NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none,number_pad:2',
    },
  });
  outDir = driver.outputDir;
  const qc = createEvidence(driver);
  let scenarioError;
  try {
    await driver.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true, startButton: true });
    await driver.startDefaultGame({ timeoutMs: 20000, playerName: `MovePad${process.pid}` });
    await driver.dismissIntroDialogs();
    const before = await Harness.waitFor(async () => {
      await driver.dismissIntroDialogs();
      const current = await state(driver);
      if (/bridge_test_scenario_failed/.test(`${current.seenShim}\n${current.shimTail}`)) throw new Error(current.shimTail);
      return current.running && /bridge_test_scenario_loaded/.test(`${current.seenShim}\n${current.shimTail}`) && Number.isInteger(current.cursor?.x) ? current : null;
    }, 12000);
    await driver.dismissIntroDialogs();
    await Harness.waitFor(async () => driver.evalCheckedValue(`!document.getElementById('intro-dialog')?.open && !document.getElementById('document-dialog')?.open`), 7000);
    const guideDismissal = await Harness.waitFor(async () => driver.evalCheckedValue(`(() => {
      const guide = document.querySelector('.ux-first-turn-guide');
      const skip = guide?.querySelector('.ux-onboarding-actions button:first-of-type');
      return !guide?.hidden && skip?.textContent?.trim() === 'Skip guide'
        ? { phase: guide.dataset.phase || '', label: skip.textContent.trim() }
        : null;
    })()`), 7000);
    assert('Field guide is dismissible through its visible Skip guide control', guideDismissal.label === 'Skip guide', JSON.stringify(guideDismissal));
    await driver.click('.ux-first-turn-guide .ux-onboarding-actions button:first-of-type');
    await Harness.waitFor(async () => driver.evalCheckedValue(`document.querySelector('.ux-first-turn-guide')?.hidden === true`), 7000);
    const beforeShot = await driver.screenshotEvidence(qc, '01-before-run', { classification: 'synthetic-fixture', viewport: { width: 1200, height: 820, devicePixelRatio: 1 }, state: 'before-run' });
    await driver.evalCheckedValue('window.__nethackPromptTest.clearSentInputs()');
    await driver.click('#direction-helper [data-key="h"]');
    const west = await Harness.waitFor(async () => {
      const current = await state(driver);
      return current.sent ? current : null;
    }, 5000);
    assert('West compass uses the active native direction key', west.sent === '4', JSON.stringify({ sent: west.sent, interaction: west.interaction }));
    assert('West compass does not open Help in number-pad mode', !west.interaction.open || west.interaction.title !== 'Help', JSON.stringify(west.interaction));
    await Harness.waitFor(async () => {
      const current = await state(driver);
      return !current.interaction.open ? current : null;
    }, 5000);
    await driver.evalCheckedValue('document.getElementById("repeat-count").value = "10"');
    await driver.evalCheckedValue('window.__nethackPromptTest.clearSentInputs()');
    await driver.click('#movement-actions [data-move-direction="h"]');
    const repeatedWest = await Harness.waitFor(async () => {
      const current = await state(driver);
      return current.sent ? current : null;
    }, 5000);
    assert('Repeated west movement uses the native count prefix', repeatedWest.sent === 'n104', JSON.stringify({ sent: repeatedWest.sent, interaction: repeatedWest.interaction }));
    assert('Repeated west movement does not open Help in number-pad mode', !repeatedWest.interaction.open || repeatedWest.interaction.title !== 'Help', JSON.stringify(repeatedWest.interaction));


    await driver.evalCheckedValue('window.__nethackPromptTest.clearSentInputs()');
    await driver.click('#direction-helper [data-compass-run]');
    await driver.click('#direction-helper [data-key="l"]');
    const after = await Harness.waitFor(async () => {
      const current = await state(driver);
      return Number.isInteger(current.cursor?.x) && current.cursor.x >= before.cursor.x + 3 ? current : null;
    }, 10000);
    const afterShot = await driver.screenshotEvidence(qc, '02-after-run', { classification: 'synthetic-fixture', viewport: { width: 1200, height: 820, devicePixelRatio: 1 }, state: 'after-run' });
    assert('Run emits the active native run prefix and direction key', after.sent === 'g6', JSON.stringify({ sent: after.sent, movement: after.movement }));
    assert('Run traverses multiple open squares', after.cursor.x - before.cursor.x >= 3 && after.cursor.y === before.cursor.y, JSON.stringify({ before: before.cursor, after: after.cursor }));
    assert('Run does not leave a direction prompt open', !after.prompt, JSON.stringify(after.prompt));
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ before: before.cursor, west: { sent: west.sent, interaction: west.interaction }, repeatedWest: { sent: repeatedWest.sent, interaction: repeatedWest.interaction }, after: after.cursor, deltaX: after.cursor.x - before.cursor.x, sent: after.sent, screenshots: { before: beforeShot, after: afterShot } }, null, 2));
  } catch (error) {
    const failureState = await state(driver).catch(() => null);
    scenarioError = new Error(`${error?.stack || error}${failureState ? `\nmovement state: ${JSON.stringify(failureState)}` : ''}`);
  } finally {
    await finishEvidence(driver, qc, scenarioError);
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
