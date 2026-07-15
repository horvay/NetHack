const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const scenarioId = 'container/unlocked-chest-on-hero';
const width = 1360;
const height = 920;
const { waitFor } = Harness;

function assert(name, ok, detail = '') {
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

function writeJson(driver, name, value) {
  const file = path.join(driver.outputDir, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
}

async function state(driver) {
  return driver.evalCheckedValue(`(() => ({
    status: document.getElementById('status')?.textContent || '',
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
    actions: window.__nethackPromptTest?.contextActions?.(),
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
    sentUiProtocolAcks: window.__nethackPromptTest?.sentUiProtocolAcks?.() || [],
    currentCell: window.__nethackPromptTest?.currentCell?.(),
    ground: window.__nethackPromptTest?.groundSnapshots?.(),
    container: window.__nethackPromptTest?.container?.(),
    containerSnapshots: window.__nethackPromptTest?.containerSnapshots?.(),
    dialog: window.__nethackPromptTest?.dialog?.(),
    promptPanel: { hidden: document.getElementById('prompt-panel')?.hidden, text: document.getElementById('prompt-panel')?.textContent || '' },
    menuPanel: { hidden: document.getElementById('menu-panel')?.hidden, text: document.getElementById('menu-panel')?.textContent || '' },
    messages: window.__nethackPromptTest?.messages?.().slice(-18).map((m) => m.text || String(m)) || [],
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    body: document.body.innerText,
    seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
    shimTail: (document.getElementById('shim-output')?.innerText || '').slice(-8000)
  }))()`);
}

function actionText(s) {
  return (s.actions?.buttons || []).map((button) => `${button.id}:${button.text}`).join('\n');
}

function extendedCommandModalVisible(s) {
  const text = `${s.dialog?.title || ''}\n${s.dialog?.prompt || ''}\n${s.promptPanel?.hidden ? '' : s.promptPanel?.text || ''}\n${s.menuPanel?.hidden ? '' : s.menuPanel?.text || ''}`;
  return Boolean(s.dialog?.interactionOpen && /Extended command|filter\/type any # command|matching options/i.test(text));
}
function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-scenario-context-open-chest-direct-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}


async function main() {
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_SHIM_RESET_LOCKS: '1',
      NH_TEST_SCENARIO_ID: scenarioId,
      NETHACK_SEED: '626262',
      NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none',
    },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const driver = Object.freeze({ ...page, qc });
  let scenarioError = null;
  try {
    await driver.waitForRendererReady({ timeoutMs: 15000, promptTest: true, automation: true, startButton: true });
    await driver.startDefaultGame({ timeoutMs: 20000, playerName: 'ChestPath' });
    await waitFor(async () => (await state(driver)).running, 20000);
    await driver.dismissIntroDialogs();
    await waitFor(async () => /bridge_test_scenario_loaded/.test(`${(await state(driver)).seenShim}\n${(await state(driver)).shimTail}`), 10000);

    const ready = await waitFor(async () => {
      const s = await state(driver);
      const open = s.actions?.buttons?.find((button) => button.id === 'open-container');
      const groundContainer = s.ground?.piles?.some((pile) => (pile.items || []).some((item) => Number.isInteger(item.objectId) && item.objectId > 0 && /chest/i.test(item.displayName || '') && (item.actionAffordances || []).includes('container')));
      return open?.text === 'Open chest' && groundContainer ? s : null;
    }, 10000);
    const contextShot = (await driver.screenshotEvidence(qc, '01-open-chest-action-ready', { classification: 'actual-player', viewport: { width, height, zoomPercent: 100 }, state: 'open-chest-action-ready', viewSafeFormat: 'BMP', viewSafeScale: 0.25 })).raw.path;
    const contextState = writeJson(driver, '01-open-chest-action-ready-state.json', ready);
    assert('Open chest appears only with an actionable public chest object id', /open-container:Open chest/.test(actionText(ready)) && ready.ground?.piles?.some((pile) => (pile.items || []).some((item) => item.objectId > 0 && /chest/i.test(item.displayName || ''))), JSON.stringify({ actions: ready.actions, ground: ready.ground }));

    await driver.evalCheckedValue('window.__nethackPromptTest.clearSentInputs()');
    await driver.click('#context-action-bar button[data-context-action-id="open-container"]');
    const panel = await waitFor(async () => {
      const s = await state(driver);
      const text = s.container?.text || '';
      if (/container open needs a public object id/i.test(`${s.status}\n${s.body}`)) throw new Error(`public id regression: ${s.status}`);
      return s.container?.active && /Container inventory/i.test(text) && /Your inventory/i.test(text) && /food ration/i.test(text) && /dagger/i.test(text) && /tin opener/i.test(text) && /scroll of identify/i.test(text) ? s : null;
    }, 15000).catch(async (error) => {
      const debug = await state(driver).catch(() => ({}));
      writeJson(driver, 'debug-open-chest-timeout-state.json', debug);
      await driver.screenshotEvidence(qc, 'debug-open-chest-timeout', { classification: 'actual-player', viewport: { width, height, zoomPercent: 100 }, state: 'open-chest-timeout', viewSafeFormat: 'BMP', viewSafeScale: 0.25 }).catch(() => undefined);
      throw error;
    });
    const panelShot = (await driver.screenshotEvidence(qc, '02-open-chest-direct-container-panel', { classification: 'actual-player', viewport: { width, height, zoomPercent: 100 }, state: 'open-chest-panel', viewSafeFormat: 'BMP', viewSafeScale: 0.25 })).raw.path;
    const panelState = writeJson(driver, '02-open-chest-direct-container-panel-state.json', panel);

    const forbiddenText = `${panel.sent || ''}\n${panel.shimTail || ''}\n${panel.body || ''}`;
    assert('Open chest sent no hidden #loot text input', panel.sent === '', JSON.stringify({ sent: panel.sent, status: panel.status }));
    assert('Open chest dispatched a typed container.snapshot command with the public chest object id', /shim_container_snapshot_accepted[\s\S]*"containerId":\s*\d+/.test(panel.shimTail || '') && /"guiAction":\{"actionId":"container\.snapshot"/.test(panel.shimTail || ''), JSON.stringify({ sentUiProtocolCommands: panel.sentUiProtocolCommands, shimTail: panel.shimTail.slice(-1600) }));
    assert('container snapshot was confirmed and populated through direct public snapshot events', /shim_container_snapshot_confirmed/.test(panel.shimTail || '') && panel.containerSnapshots?.snapshots?.some((snapshot) => /chest/i.test(snapshot.container?.displayName || snapshot.container?.publicId || '') && snapshot.items?.some((item) => /food ration|dagger/i.test(item.displayName || ''))), JSON.stringify({ shimTail: panel.shimTail.slice(-1200), snapshots: panel.containerSnapshots }));
    assert('no Extended-command menu appeared on contextual Open chest', !extendedCommandModalVisible(panel) && !/bridge_extcmd_answer|shimcontainer|#loot/i.test(forbiddenText), JSON.stringify({ dialog: panel.dialog, promptPanel: panel.promptPanel, menuPanel: panel.menuPanel, sent: panel.sent, shimTail: panel.shimTail.slice(-1200) }));
    assert('container panel has player-facing rows and no placeholder selector fallback', !/Inventory selector|Name unavailable|Loading container contents|Loading your inventory/i.test(panel.container?.text || ''), panel.container?.text || '');

    const summary = [
      '# Contextual Open chest direct snapshot real Electron regression',
      '',
      `Scenario: ${scenarioId}`,
      '',
      'Evidence:',
      `- Action ready screenshot: ${contextShot}`,
      `- Action ready state: ${contextState}`,
      `- Direct container panel screenshot: ${panelShot}`,
      `- Direct container panel state: ${panelState}`,
      '',
      'Verified:',
      '- the contextual bar exposed `Open chest` only after the current ground chest had a stable public object id',
      '- clicking `Open chest` dispatched typed `container.snapshot` and opened/populated the container panel',
      '- renderer sent no `#loot` text, no `bridge_extcmd_answer`/`shimcontainer` path appeared, and no Extended-command menu was visible',
      '',
      'Visible actions:',
      '```',
      actionText(ready),
      '```',
      '',
      'Container panel:',
      '```',
      panel.container?.text || '',
      '```',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-scenario-context-open-chest-direct-summary.md'), summary);
    console.log(summary);
  } catch (error) {
    scenarioError = error;
  } finally {
    await page.close().catch((error) => { if (!scenarioError) scenarioError = error; });
  }
  qc.recordAssertions([{ id: 'scenario-completed', status: scenarioError ? 'failed' : 'passed', details: scenarioError ? String(scenarioError.message || scenarioError) : '' }]);
  qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  console.log(`real-scenario-context-open-chest-direct-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}
const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
