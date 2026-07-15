'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');
const width = 1360;
const height = 920;
const scenarioId = 'identity/player-assigned-item-names';
const { waitFor } = Harness;

function preparePlayground(playground) {
  fs.mkdirSync(path.join(playground, 'save'), { recursive: true });
  for (const file of ['nhdat', 'sysconf', 'symbols', 'license']) fs.copyFileSync(path.join(repo, 'playground', file), path.join(playground, file));
  for (const file of ['perm', 'record', 'logfile', 'xlogfile', 'livelog', 'paniclog']) fs.writeFileSync(path.join(playground, file), '');
}

async function state(page) {
  return page.evalCheckedValue(`(() => ({
    running: Boolean(window.__nethackAutomation?.state?.().runningState?.running),
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
    inventory: window.__nethackPromptTest?.inventory?.(),
    equipment: window.__nethackPromptTest?.equipmentSnapshot?.(),
    interaction: window.__nethackPromptTest?.dialog?.(),
    shimEvents: window.__nethackPromptTest?.shimEvents?.() || [],
    body: document.body.innerText,
  }))()`);
}

function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, {
    expectedRunIdentity: approval.runIdentity,
    requireApproval: true,
  });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-player-assigned-names-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}

async function main() {
  const runIdentity = `player-assigned-names-${crypto.randomUUID()}`;
  const outDir = path.join(root, 'test-output', 'verification-runs', runIdentity);
  const playground = path.join(outDir, 'isolated-playground');
  const nativeCaptureDir = path.join(outDir, 'native-capture-source');
  preparePlayground(playground);

  const page = await Harness.createElectronBrowserDriver({
    root,
    outputIdentity: runIdentity,
    width,
    height,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_SCENARIO_ID: scenarioId,
      NH_TEST_PLAYGROUND: playground,
      NETHACKDIR: playground,
      NH_SHIM_RESET_LOCKS: '1',
      NETHACK_SEED: '16',
      NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none',
      NH_DIAGNOSTIC_LOG_DIR: path.join(outDir, 'diagnostics'),
      NH_TEST_CAPTURE_DIR: nativeCaptureDir,
    },
  });
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') });
  const outcomes = [];
  const check = (id, condition, details = '') => {
    outcomes.push({ id, status: condition ? 'passed' : 'failed', details: condition ? '' : String(details || 'Observable scenario condition was not satisfied.') });
    return condition;
  };
  let scenarioError = null;

  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true });
    const profile = await page.evalCheckedValue(`window.netHackPOC.setTestCaptureProfile(${JSON.stringify({ width, height, zoomPercent: 100 })})`, { awaitPromise: true });
    check('native-capture-profile-applied', profile?.ok && profile.contentSize?.[0] === width && profile.contentSize?.[1] === height, JSON.stringify(profile));

    const initialDialogs = await page.evalCheckedValue("Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id)");
    if (initialDialogs.includes('startup-choice-dialog')) await page.click('#startup-new-game'); else await page.click('#start-shim');
    await waitFor(() => page.evalCheckedValue("document.getElementById('character-dialog')?.open"), 5000);
    await page.setInputValue('#player-name', 'NamedFixture');
    await page.setInputValue('#player-role', 'Val');
    await page.setInputValue('#player-race', 'Hum');
    await page.setInputValue('#player-gender', 'Fem');
    await page.setInputValue('#player-align', 'Law');
    await page.setInputValue('#game-seed', '16');
    await page.click('#confirm-character');

    const running = await waitFor(async () => {
      const next = await state(page);
      return next.running && next.shimEvents.some((entry) => (entry.event || entry).name === 'bridge_test_scenario_loaded') && next.inventory?.snapshotItems?.length === 2 ? next : null;
    }, 20000);
    if (running.dialogs.includes('intro-dialog')) await page.click('#intro-continue');

    const inventoryUpdate = running.shimEvents.map((entry) => entry.event || entry).filter((event) => event.name === 'shim_update_inventory').slice(-1)[0];
    const calledNative = inventoryUpdate?.items?.find((item) => item.calledName === 'sunrise');
    const namedNative = inventoryUpdate?.items?.find((item) => item.individualName === 'Dawnbringer');
    check('native-unknown-item-called-name', calledNative?.calledName === 'sunrise', JSON.stringify(inventoryUpdate));
    check('native-unknown-item-semantic-appearance', calledNative?.semanticKnown === false && typeof calledNative.semanticAppearance === 'string' && calledNative.semanticAppearance.length > 0, JSON.stringify(calledNative));
    check('native-unknown-item-hides-semantic-name', calledNative?.semanticName == null, JSON.stringify(calledNative));
    check('native-unknown-item-narrow-knowledge', calledNative?.known?.naming === true && calledNative?.known?.identity === false && calledNative?.known?.appearance === true, JSON.stringify(calledNative));
    check('native-known-sword-individual-name', namedNative?.individualName === 'Dawnbringer' && namedNative?.known?.naming === true, JSON.stringify(namedNative));
    check('native-known-sword-public-identity', namedNative?.semanticKnown === true && namedNative?.semanticName === 'long sword', JSON.stringify(namedNative));

    const calledSnapshot = running.inventory.snapshotItems.find((item) => item.calledName === 'sunrise');
    const namedSnapshot = running.inventory.snapshotItems.find((item) => item.individualName === 'Dawnbringer');
    check('game-view-keeps-called-name', calledSnapshot?.displayName?.includes('called sunrise') && calledSnapshot?.known?.identity === false && calledSnapshot?.calledName === 'sunrise', JSON.stringify(running.inventory));
    check('game-view-keeps-individual-name', namedSnapshot?.displayName?.includes('Dawnbringer') && namedSnapshot?.individualName === 'Dawnbringer', JSON.stringify(running.inventory));

    await page.nativeScreenshotEvidence(qc, '01-named-items-gameplay', {
      classification: 'synthetic-fixture',
      viewport: { width, height, zoomPercent: 100 },
      state: 'fixture-gameplay',
      viewSafeFormat: 'BMP',
      viewSafeScale: 0.5,
    });

    await page.evalCheckedValue("document.getElementById('game-grid')?.focus?.(); true");
    await page.pressKey('i', 'i');
    const menuState = await waitFor(async () => {
      const next = await state(page);
      const visible = `${next.interaction?.panelControls?.text || ''}\n${(next.interaction?.options || []).map((option) => option.text || '').join('\n')}`;
      return /Equipment\s*\/\s*Inventory/i.test(next.interaction?.title || '') && /sunrise/i.test(visible) && /Dawnbringer/i.test(visible) ? next : null;
    }, 10000);
    const menuEvents = menuState.shimEvents.map((entry) => entry.event || entry).filter((event) => event.name === 'shim_add_menu');
    const calledMenu = menuEvents.find((event) => event.calledName === 'sunrise');
    const namedMenu = menuEvents.find((event) => event.individualName === 'Dawnbringer');
    check('native-menu-keeps-called-name', calledMenu?.known?.naming === true && calledMenu?.calledName === 'sunrise' && /called sunrise/i.test(calledMenu?.text || ''), JSON.stringify(calledMenu));
    check('native-menu-keeps-individual-name', namedMenu?.known?.naming === true && namedMenu?.individualName === 'Dawnbringer' && /named Dawnbringer/i.test(namedMenu?.text || ''), JSON.stringify(namedMenu));

    const visibleNameRows = await page.evalCheckedValue(`Array.from(document.querySelectorAll('#interaction-options .menu-item-name')).map((node) => ({ text: node.textContent || '', clipped: node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1, lineClamp: getComputedStyle(node).webkitLineClamp, whiteSpace: getComputedStyle(node).whiteSpace }))`);
    check('game-view-paints-complete-player-names', visibleNameRows.some((row) => /named Dawnbringer/i.test(row.text) && !row.clipped) && visibleNameRows.some((row) => /called sunrise/i.test(row.text) && !row.clipped), JSON.stringify(visibleNameRows));
    check('game-view-name-rows-use-two-lines', visibleNameRows.every((row) => row.lineClamp === '2' && row.whiteSpace === 'normal'), JSON.stringify(visibleNameRows));

    await page.nativeScreenshotEvidence(qc, '02-named-items-inventory', {
      classification: 'synthetic-fixture',
      viewport: { width, height, zoomPercent: 100 },
      state: 'fixture-equipment-inventory',
      viewSafeFormat: 'BMP',
      viewSafeScale: 0.5,
    });
  } catch (error) {
    scenarioError = error;
  } finally {
    await page.close().catch((error) => {
      if (!scenarioError) scenarioError = error;
    });
  }

  outcomes.push({
    id: 'scenario-completed',
    status: scenarioError ? 'failed' : 'passed',
    details: scenarioError ? String(scenarioError.message || scenarioError) : '',
  });
  qc.recordAssertions(outcomes);
  qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
  fs.rmSync(playground, { recursive: true, force: true });
  fs.rmSync(nativeCaptureDir, { recursive: true, force: true });

  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, {
    expectedRunIdentity: runIdentity,
    requireApproval: false,
  });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  console.log(`real-player-assigned-names-mcp-test: CAPTURED ${runIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
  const failed = outcomes.filter((outcome) => outcome.status === 'failed').map((outcome) => outcome.id);
  if (failed.length) throw new Error(`Player-assigned names scenario failed: ${failed.join(', ')}`);
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => {
    console.error(error.stack || error);
    process.exit(1);
  });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
