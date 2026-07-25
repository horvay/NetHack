const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = Number(process.env.NH_REAL_INPUT_WIDTH || 1280);
const height = Number(process.env.NH_REAL_INPUT_HEIGHT || 900);
const { waitFor, delay } = Harness;

async function state(page) {
  return page.evalCheckedValue(`(() => {
    const shimEvents = window.__nethackPromptTest?.shimEvents?.() || [];
    return {
      status: document.getElementById('status')?.textContent || '',
      active: document.activeElement?.id || document.activeElement?.textContent || document.activeElement?.tagName || '',
      dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
      sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
      messages: window.__nethackPromptTest?.messages?.().slice(-8).map((message) => message.text || String(message)) || [],
      seen: document.getElementById('shim-output')?.dataset?.seen || '',
      interaction: window.__nethackPromptTest?.dialog?.(),
      automation: window.__nethackAutomation?.state?.(),
      actionOpen: Boolean(document.getElementById('action-dialog')?.open || document.getElementById('ux-command-palette')?.open),
      actionText: document.querySelector('dialog#ux-command-palette[open], dialog#action-dialog[open]')?.innerText || '',
      hasMapTarget: Boolean(document.querySelector('.target-selection-controls')),
      movementText: document.getElementById('movement-actions')?.innerText || '',
      turn: Number(document.getElementById('log-now-turn')?.textContent) || 0,
      numberPad: shimEvents.filter((event) => event.name === 'shim_number_pad').at(-1) || null,
    };
  })()`);
}

function isRpgEquipmentScreen(value) {
  return Boolean(value?.interaction?.interactionOpen)
    && /Equipment\s*\/\s*Inventory/i.test(value.interaction.title || '')
    && /Hero equipment/i.test(value.interaction.panelControls?.text || '')
    && (value.interaction.options || []).some((option) => /spear|dagger|shield|food ration/i.test(option.text || ''));
}

function hasOldInventoryScreen(value) {
  const dialogText = `${value?.interaction?.title || ''}\n${value?.interaction?.prompt || ''}\n${(value?.interaction?.options || []).map((option) => option.text || '').join('\n')}`;
  return Boolean(value?.interaction?.interactionOpen)
    && /^(Inventory|NetHack choice)$/i.test(String(value.interaction.title || '').trim())
    && !/Hero equipment/i.test(value.interaction.panelControls?.text || '')
    && /spear|dagger|shield|food ration/i.test(dialogText);
}

async function waitForGameplayReady(page, timeoutMs = 7000) {
  return waitFor(async () => {
    const value = await state(page);
    if (value.dialogs.length || value.interaction?.interactionOpen) return null;
    if (/menu awaiting item selection|line input|yes\/no/i.test(value.automation?.status || value.status || '')) return null;
    return value.automation?.runningState?.running ? value : null;
  }, timeoutMs);
}

async function capture(page, qc, id, stateName) {
  return page.screenshotEvidence(qc, id, {
    classification: 'actual-player',
    viewport: { width, height, zoomPercent: 100 },
    state: stateName,
    viewSafeFormat: 'BMP',
    viewSafeScale: 0.25,
  });
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
  console.log(`real-input-regression-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}

async function main() {
  const page = await Harness.createElectronBrowserDriver({ root, width, height });
  const { outputIdentity: runIdentity, outputDir: outDir } = page;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const results = { runIdentity, screenshots: {}, checks: {} };
  let scenarioError = null;
  let diagnosticFile = null;
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    await page.startDefaultGame({ timeoutMs: 10000, playerName: `Input${Date.now().toString(36).slice(-6)}` });
    results.startedWithIntro = await waitFor(async () => {
      const value = await state(page);
      return value.automation?.runningState?.running && /shim_glyph|shim_status_update|shim_curs|shim_putstr/.test(value.seen) ? value : null;
    }, 25000);
    await waitFor(async () => {
      await page.dismissIntroDialogs();
      return !(await state(page)).dialogs.includes('intro-dialog');
    }, 7000);
    await delay(300);
    await page.dismissIntroDialogs();
    await page.evalCheckedValue("document.getElementById('game-grid').focus(); true");
    results.started = await state(page);
    results.launchDiagnostic = await page.evalCheckedValue('window.netHackPOC.activeDiagnosticRun()', { awaitPromise: true });
    results.screenshots.mainGameplay = await capture(page, qc, '01-real-gameplay-before-inventory', 'gameplay');

    results.beforeClassicKeyboard = await state(page);
    await page.evalCheckedValue("window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus(); true");
    await page.pressKey('h', 'h');
    await delay(300);
    results.afterVimMovement = await state(page);
    if (results.afterVimMovement.dialogs.length || results.afterVimMovement.interaction?.interactionOpen) {
      await page.pressKey('Escape');
      await waitForGameplayReady(page);
    }

    results.beforeCountedSearch = await state(page);
    await page.evalCheckedValue("window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus(); true");
    await page.pressKey('5', '5');
    await page.pressKey('s', 's');
    await delay(700);
    results.afterCountedSearch = await state(page);

    await page.evalCheckedValue("window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus(); true");
    await page.pressKey('ArrowRight');
    await waitFor(async () => {
      const value = await state(page);
      return value.turn >= results.afterCountedSearch.turn + 1 ? value : null;
    }, 5000);
    await delay(400);
    results.afterMovement = await state(page);

    await page.pressKey('i', 'i');
    results.afterInventory = await waitFor(async () => {
      const value = await state(page);
      return isRpgEquipmentScreen(value) ? value : null;
    }, 7000);
    results.screenshots.inventoryKey = await capture(page, qc, '02-real-key-i-rpg-equipment-screen', 'inventory-key');
    await page.pressKey('Escape');
    results.afterInventoryDismissed = await waitForGameplayReady(page);

    await page.evalCheckedValue("window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus(); true");
    results.beforeInventoryButton = await waitForGameplayReady(page);
    results.screenshots.mainGameplayBeforeButton = await capture(page, qc, '03-real-gameplay-before-toolbar-button', 'gameplay-before-toolbar');
    await delay(1000);
    await page.click('#inventory-equipment-button');
    results.afterInventoryButton = await waitFor(async () => {
      const value = await state(page);
      return isRpgEquipmentScreen(value) ? value : null;
    }, 7000);
    results.screenshots.inventoryButton = await capture(page, qc, '04-real-toolbar-button-rpg-equipment-screen', 'inventory-toolbar');
    await page.pressKey('Escape');
    await waitForGameplayReady(page);

    await page.evalCheckedValue("window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus(); true");
    await page.pressKey(',', ',');
    await delay(300);
    results.afterPickupKeyNoFixture = await state(page);
    if (results.afterPickupKeyNoFixture.interaction?.interactionOpen || /menu awaiting|choose an item/i.test(results.afterPickupKeyNoFixture.status || '')) {
      await page.pressKey('Escape');
      results.afterPickupCancel = await waitForGameplayReady(page).catch(async () => state(page));
    }

    await page.evalCheckedValue("window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus(); true");
    await page.click('#open-actions');
    await delay(100);
    results.afterUseItemActionsClick = await state(page);
    results.screenshots.actions = await capture(page, qc, '05-after-use-item-actions-click', 'actions');
    await page.click('#ux-command-palette [data-command-id="item.apply"]');
    results.afterActionButton = await waitFor(async () => {
      const value = await state(page);
      return value.sent === 'a' ? value : null;
    }, 5000);
    await page.pressKey('Escape');
    await delay(250);
    await page.evalCheckedValue("window.__nethackPromptTest.forceCloseCurrentMenuForTest(); window.__nethackPromptTest.event({name:'shim_getlin', query:'What do you want to engrave in the floor here?'}); window.__nethackPromptTest.shimEvents(); true");
    results.textPrompt = await waitFor(async () => {
      const value = await state(page);
      return value.interaction?.interactionOpen && value.interaction?.textEntry ? value : null;
    }, 5000);
    await page.evalCheckedValue("window.__nethackPromptTest.clearSentInputs(); document.getElementById('interaction-text').focus(); true");
    await page.pressKey('ArrowRight');
    await page.pressKey('i', 'i');
    await delay(100);
    results.textOwnerBlock = await state(page);
    await page.pressKey('Escape');

    results.checks = {
      realGameStarted: results.started.automation?.runningState?.running && /Velkommen|welcome to NetHack/i.test(results.started.messages.join('\n')),
      noStartupUnknownBlankCommand: !/Unknown command/i.test(results.started.messages.join('\n')),
      realMovementReachesBridgeOnce: results.afterMovement.sent === 'l',
      nativeUsesClassicKeyboardMode: results.beforeClassicKeyboard.numberPad?.enabled === 0,
      vimMovementAdvancesOneTurn: results.afterVimMovement.sent === 'h' && results.afterVimMovement.turn === results.beforeClassicKeyboard.turn + 1 && !results.afterVimMovement.dialogs.length && !results.afterVimMovement.interaction?.interactionOpen,
      typedCountRepeatsAction: results.afterCountedSearch.sent === '5s' && results.afterCountedSearch.turn === results.beforeCountedSearch.turn + 5,
      realInventoryKeyReachesBridge: /li|i/.test(results.afterInventory.sent),
      keyboardIOpensRpgEquipmentScreen: isRpgEquipmentScreen(results.afterInventory),
      keyboardIDoesNotOpenOldInventory: !hasOldInventoryScreen(results.afterInventory),
      inventoryEscapeReturnsToGameplay: Boolean(results.afterInventoryDismissed.automation?.runningState?.running) && !results.afterInventoryDismissed.interaction?.interactionOpen,
      toolbarButtonOpensRpgEquipmentScreen: isRpgEquipmentScreen(results.afterInventoryButton),
      toolbarButtonSendsInventoryCommand: results.afterInventoryButton.sent === 'i',
      toolbarButtonDoesNotOpenOldInventory: !hasOldInventoryScreen(results.afterInventoryButton),
      realPickupKeyReachesBridge: results.afterPickupKeyNoFixture.sent === ',',
      useItemActionsOpensWithoutDispatch: results.afterUseItemActionsClick.actionOpen && /Eat|Apply|Wield|Drop/i.test(results.afterUseItemActionsClick.actionText) && results.afterUseItemActionsClick.sent === '',
      actionButtonSendsCommand: results.afterActionButton.sent === 'a',
      keyboardBlockedByTextOwner: results.textOwnerBlock.sent === '',
      noMapTargetPanel: !results.afterUseItemActionsClick.hasMapTarget,
      rightLogOnlyMovementControls: /Walk|Run|Fight/.test(results.afterUseItemActionsClick.movementText) && !/Map target|Preview/.test(results.afterUseItemActionsClick.movementText),
    };
    results.diagnostic = await page.evalCheckedValue('window.netHackPOC.activeDiagnosticRun()', { awaitPromise: true }).catch((error) => ({ ok: false, error: error.message }));
    diagnosticFile = path.join(outDir, 'diagnostic-summary.json');
    fs.writeFileSync(diagnosticFile, `${JSON.stringify(results.diagnostic, null, 2)}\n`);
  } catch (error) {
    scenarioError = error;
  } finally {
    await page.close().catch((error) => {
      if (!scenarioError) scenarioError = error;
    });
  }

  const resultsFile = path.join(outDir, 'real-input-regression-result.json');
  fs.writeFileSync(resultsFile, `${JSON.stringify(results, null, 2)}\n`);

  const outcomes = Object.entries(results.checks).map(([id, ok]) => ({
    id,
    status: ok ? 'passed' : 'failed',
    details: ok ? '' : 'Observable scenario condition was not satisfied.',
  }));
  outcomes.push({
    id: 'scenario-completed',
    status: scenarioError ? 'failed' : 'passed',
    details: scenarioError ? String(scenarioError.message || scenarioError) : '',
  });
  qc.recordAssertions(outcomes);
  qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
  qc.recordLog({ id: 'real-input-regression-result', path: resultsFile, classification: 'scenario-result' });
  if (diagnosticFile) qc.recordLog({ id: 'diagnostic-summary', path: diagnosticFile, classification: 'diagnostic' });
  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, {
    expectedRunIdentity: runIdentity,
    requireApproval: false,
  });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  console.log(`real-input-regression-test: CAPTURED ${runIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
  const failed = outcomes.filter((outcome) => outcome.status === 'failed').map((outcome) => outcome.id);
  if (failed.length) throw new Error(`Real input regression failed: ${failed.join(', ')}`);
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
