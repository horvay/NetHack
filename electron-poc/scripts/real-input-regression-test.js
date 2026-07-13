const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_REAL_INPUT_OUT_DIR || path.join(root, 'test-output', 'real-input-regression');
const port = Number(process.env.NH_REAL_INPUT_CDP_PORT || 9491);
const width = Number(process.env.NH_REAL_INPUT_WIDTH || 1280);
const height = Number(process.env.NH_REAL_INPUT_HEIGHT || 900);
const { waitFor, delay } = Harness;

async function state(page) {
  return page.evalCheckedValue(`(() => ({
    status: document.getElementById('status')?.textContent || '',
    active: document.activeElement?.id || document.activeElement?.textContent || document.activeElement?.tagName || '',
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    messages: window.__nethackPromptTest?.messages?.().slice(-8).map((message) => message.text || String(message)) || [],
    seen: document.getElementById('shim-output')?.dataset?.seen || '',
    interaction: window.__nethackPromptTest?.dialog?.(),
    automation: window.__nethackAutomation?.state?.(),
    actionOpen: document.getElementById('action-dialog')?.open || false,
    actionText: document.getElementById('action-dialog')?.innerText || '',
    hasMapTarget: Boolean(document.querySelector('.target-selection-controls')),
    movementText: document.getElementById('movement-actions')?.innerText || ''
  }))()`);
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
    viewport: { width, height, zoomPercent: 100 },
    state: stateName,
    viewSafeFormat: 'BMP',
    viewSafeScale: 0.25,
  });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir });
  const staleLocksRemovedBeforeStart = Harness.removeStalePlaygroundLocks({ root });
  const initialLockFiles = new Set(Harness.playgroundLockFiles({ root }).map((lock) => lock.file));
  const page = await Harness.createElectronBrowserDriver({ root, port, width, height });
  const results = { outDir, staleLocksRemovedBeforeStart, screenshots: {}, checks: {} };
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true, startButton: true });
    await page.startDefaultGame({ timeoutMs: 10000, playerName: `Input${Date.now().toString(36).slice(-6)}` });
    results.startedWithIntro = await waitFor(async () => {
      const value = await state(page);
      return value.automation?.runningState?.running && /shim_glyph|shim_status_update|shim_curs|shim_putstr/.test(value.seen) ? value : null;
    }, 25000);
    if (results.startedWithIntro.dialogs.includes('intro-dialog')) {
      await page.click('#intro-continue', { timeoutMs: 5000 });
      await waitFor(async () => !(await state(page)).dialogs.includes('intro-dialog'), 5000);
      await delay(300);
    }
    await page.evalCheckedValue("document.getElementById('game-grid').focus(); true");
    results.started = await state(page);
    results.screenshots.mainGameplay = await capture(page, qc, '01-real-gameplay-before-inventory', 'gameplay');

    await page.evalCheckedValue("window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus(); true");
    await page.pressKey('ArrowRight');
    await delay(150);
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
    await page.click('#item-actions button[data-command-key="a"]');
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
    fs.writeFileSync(path.join(outDir, 'diagnostic-summary.json'), `${JSON.stringify(results.diagnostic, null, 2)}\n`);
    results.screenshotManifest = qc.manifestFile;
    fs.writeFileSync(path.join(outDir, 'real-input-regression-debug.json'), `${JSON.stringify(results, null, 2)}\n`);
    const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([name]) => name);
    const md = [
      '# Real input regression', '', `Output: ${outDir}`, '', '## Checks',
      ...Object.entries(results.checks).map(([name, ok]) => `- ${ok ? 'PASS' : 'FAIL'} ${name}`),
      '', '## Screenshots',
      ...Object.entries(results.screenshots).map(([name, entry]) => `- ${name}: raw ${entry.raw.path}; view-safe ${entry.derivative.path}`),
      '', `Screenshot QC manifest: ${qc.manifestFile}`, '',
    ].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-input-regression-summary.json'), `${JSON.stringify(results, null, 2)}\n`);
    fs.writeFileSync(path.join(outDir, 'real-input-regression-summary.md'), md);
    console.log(md);
    if (failed.length) throw new Error(`Real input regression failed: ${failed.join(', ')}`);
  } finally {
    const output = page.output();
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), output.stdout);
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), output.stderr);
    await page.close().catch(() => {});
    const newLocks = Harness.playgroundLockFiles({ root }).filter((lock) => !initialLockFiles.has(lock.file));
    Harness.removeStalePlaygroundLocks({ root, knownFiles: newLocks.map((lock) => lock.file) });
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
