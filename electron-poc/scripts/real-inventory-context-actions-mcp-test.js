const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const defaultScenarioId = 'ground/pickup-pile-on-hero';
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function shot(cdp, name) { const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'actual-player', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 }); return capture.raw.path; }
function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-inventory-context-actions-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
async function press(cdp, key, code, text) { const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0; const params = { key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }; if (text !== undefined) params.text = text; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }); }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); return box; }
async function rightClickText(cdp, selector, pattern) { const source = String(pattern); const box = await evalExpr(cdp, `(() => { const re = new RegExp(${JSON.stringify(source)}, 'i'); const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((row) => re.test(row.innerText || '')); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText,key:el.dataset.key || ''} : null; })()`); if (!box) throw new Error(`missing text ${source} in ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'right', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'right', clickCount: 1 }); return box; }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) {
  return evalExpr(cdp, `(() => {
    const logViewport = document.querySelector('#ux-items-root .uxm-recent-log-scroll');
    return {
      dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
      dialog: window.__nethackPromptTest?.dialog?.() || {},
      equipment: window.__nethackPromptTest?.equipment?.() || {},
      inventory: window.__nethackPromptTest?.inventory?.() || {},
      messages: window.__nethackPromptTest?.messages?.().slice(-20).map((message) => message.text || String(message)) || [],
      inventoryLog: {
        lines: Array.from(logViewport?.querySelectorAll('li') || [], (line) => line.textContent),
        scrollable: Boolean(logViewport && logViewport.scrollHeight > logViewport.clientHeight),
      },
      sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
      running: window.__nethackAutomation?.state?.().runningState?.running || false,
      body: document.body.innerText,
      seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
      shim: document.getElementById('shim-output')?.innerText || '',
      contextMenu: document.querySelector('.uxm-item-context-menu')?.innerText || '',
      commandTransactions: window.__nethackPromptTest?.commandTransactions?.() || {},
      sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
      sentUiProtocolAcks: window.__nethackPromptTest?.sentUiProtocolAcks?.() || [],
    };
  })()`);
}
async function start(cdp) {
  await click(cdp, '#start-shim');
  const dialogs = await waitFor(async () => { const open = (await state(cdp)).dialogs; return open.includes('startup-choice-dialog') || open.includes('character-dialog') ? open : null; }, 10000);
  if (dialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game');
  await waitFor(async () => (await state(cdp)).dialogs.includes('character-dialog'), 10000);
  await waitFor(async () => evalExpr(cdp, `!document.getElementById('confirm-character')?.disabled`), 10000);
  await evalExpr(cdp, `(() => { const input = document.getElementById('player-name'); input.value = 'Context' + Date.now().toString(36).slice(-5); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click(cdp, '#confirm-character');
  await waitFor(async () => (await state(cdp)).running, 20000);
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); window.__nethackPromptTest?.clearSentInputs?.(); })()`);
}

async function runCase(caseName, actionId, expectedCommandPattern, options = {}) {
  const scenarioId = options.scenarioId || defaultScenarioId;
  const rowPattern = options.rowPattern || 'scroll';
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  let scenarioError = null;
  let result;
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true });
    await start(cdp);
    await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    await press(cdp, 'i', 'KeyI', 'i');
    const before = await waitFor(async () => { const s = await state(cdp); return s.equipment?.open && /Inventory & equipment/i.test(s.body) && new RegExp(rowPattern, 'i').test(s.body) ? s : null; }, 10000);
    assert(`${caseName} exposes canonical NetHack messages beneath the character portrait`, before.inventoryLog.lines.length > 0
      && before.inventoryLog.lines.at(-1) === before.messages.at(-1), JSON.stringify({ messages: before.messages, inventoryLog: before.inventoryLog }));
    if (options.waitBeforeContextMs) await delay(options.waitBeforeContextMs);
    const beforeShot = await shot(cdp, `${caseName}-01-inventory-before-context.png`);
    const row = await rightClickText(cdp, '#ux-items-root .uxm-item-row', rowPattern);
    await waitFor(async () => { const s = await state(cdp); return new RegExp(actionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(s.body) || s.contextMenu ? s : null; }, 5000);
    const context = await state(cdp);
    const railActionIds = await evalExpr(cdp, `Array.from(document.querySelectorAll('#ux-items-root .uxm-selection-actions > button[data-action-id]')).map((button) => button.dataset.actionId)`);
    const contextShot = await shot(cdp, `${caseName}-02-context-menu.png`);
    await evalExpr(cdp, 'window.__nethackPromptTest?.clearSentInputs?.()');
    await evalExpr(cdp, `document.querySelector('.uxm-item-context-menu [data-action-id="${actionId}"]')?.click()`);
    await delay(900);
    const immediateAfterClick = await state(cdp);
    fs.writeFileSync(path.join(outDir, `${caseName}-immediate-after-click-state.json`), JSON.stringify(immediateAfterClick, null, 2));
    let postSelectionShot = '';
    let postSelectionState = null;
    let postContinuationShot = '';
    let postContinuationState = null;
    if (options.postSelectionPromptPattern) {
      const pattern = new RegExp(options.postSelectionPromptPattern, 'i');
      postSelectionState = await waitFor(async () => {
        const s = await state(cdp);
        return !s.equipment.open && pattern.test(`${s.dialog?.prompt || ''}\n${s.messages.join('\n')}\n${s.body}`) ? s : null;
      }, 8000);
      assert(`${caseName} closes inventory before the post-selection effect interaction`, postSelectionState.equipment.open === false && !/Inventory & equipment/.test(postSelectionState.body), JSON.stringify(postSelectionState.equipment));
      assert(`${caseName} keeps the NetHack effect interaction active without ownership failure`, !/native item follow-up changed|another prompt, menu, or transfer owns input|direct command is blocked/i.test(`${postSelectionState.messages.join('\n')}\n${postSelectionState.body}`), postSelectionState.body.slice(0, 1600));
      postSelectionShot = await shot(cdp, `${caseName}-03-post-selection-effect.png`);
      for (const key of options.postSelectionKeys || []) await press(cdp, key, key === '.' ? 'Period' : `Key${key.toUpperCase()}`, key);
      await delay(300);
      const possibleNamingPrompt = await state(cdp);
      if (possibleNamingPrompt.dialog?.interactionOpen && possibleNamingPrompt.dialog?.textEntry) await press(cdp, 'Escape', 'Escape');
    }
    if (options.postSelectionContinuationPattern) {
      await evalExpr(cdp, `Array.from(document.querySelectorAll('#interaction-options .choice-button')).find((button) => /Continue/i.test(button.textContent || ''))?.click()`);
      const continuationPattern = new RegExp(options.postSelectionContinuationPattern, 'i');
      postContinuationState = await waitFor(async () => {
        const s = await state(cdp);
        return continuationPattern.test(`${s.dialog?.prompt || ''}\n${s.messages.join('\n')}\n${s.body}`) ? s : null;
      }, 8000);
      postContinuationShot = await shot(cdp, `${caseName}-04-post-tip-interaction.png`);
    }
    const findSemantic = (s) => {
      const txs = s.commandTransactions?.transactions || [];
      const semantic = txs.find((tx) => tx.semanticActionId === actionId || tx.guiAction?.actionId === actionId || tx.result?.actionId === actionId);
      if (!semantic || (options.requireCompletion && semantic.status !== 'completed')) return null;
      return { ...s, semanticTransaction: semantic };
    };
    const after = findSemantic(immediateAfterClick) || await waitFor(async () => findSemantic(await state(cdp)), 8000);
    const afterShot = await shot(cdp, `${caseName}-${postSelectionShot ? '04' : '03'}-after-action.png`);
    const interactionClasses = await evalExpr(cdp, `({
      cursors: document.querySelectorAll('#game-grid .cursor').length,
      adjacentTargets: document.querySelectorAll('#game-grid .adjacent-move-target').length,
      adjacentCoordinates: Array.from(document.querySelectorAll('#game-grid .adjacent-move-target')).map((cell) => [cell.dataset.mapX, cell.dataset.mapY]),
    })`);
    assert(`${caseName} selected row matches requested item`, new RegExp(rowPattern, 'i').test(row.text), row.text);
    const expectedActionLabel = options.actionLabel || (actionId === 'item.read.scroll' ? 'Read' : actionId === 'item.quaff' ? 'Quaff' : 'Drop');
    assert(`${caseName} context menu contains action`, context.contextMenu.includes(actionId) || new RegExp(expectedActionLabel, 'i').test(context.contextMenu), context.contextMenu);
    if (options.expectedPrimaryActionId) assert(`${caseName} primary rail action is ${options.expectedPrimaryActionId}`, railActionIds[0] === options.expectedPrimaryActionId, JSON.stringify(railActionIds));
    if (options.expectedVisibleFact) assert(`${caseName} preserves the NetHack-visible item fact`, new RegExp(options.expectedVisibleFact, 'i').test(row.text), row.text);
    assert(`${caseName} sent the expected direct selector sequence`, expectedCommandPattern.test(after.sent), JSON.stringify({ sent: after.sent, row }));
    assert(`${caseName} semantic action acknowledged`, after.semanticTransaction && (after.semanticTransaction.semanticActionId === actionId || after.semanticTransaction.guiAction?.actionId === actionId || after.semanticTransaction.result?.actionId === actionId), JSON.stringify(after.commandTransactions, null, 2));
    assert(`${caseName} semantic target selector recorded`, after.semanticTransaction.guiAction?.target?.selector || after.semanticTransaction.result?.target?.selector, JSON.stringify(after.semanticTransaction, null, 2));
    if (options.requireCompletion) assert(`${caseName} completes and changes authoritative inventory`, after.semanticTransaction.status === 'completed' && after.semanticTransaction.result?.status === 'success' && !after.inventory.items.some((item) => String(item.inventoryLetter || '') === String(row.key || '')), JSON.stringify({ transaction: after.semanticTransaction, inventory: after.inventory }));
    if (options.expectedAfterPattern) assert(`${caseName} renders the resulting equipped item in its paper-doll slot`, new RegExp(options.expectedAfterPattern, 'is').test(after.body), after.body.slice(0, 2400));
    if (options.expectedMessagePattern) assert(`${caseName} reports the authoritative NetHack result`, new RegExp(options.expectedMessagePattern, 'i').test(after.messages.join('\n')), JSON.stringify(after.messages));
    if (!options.expectWorkspaceClosed && options.expectedMessagePattern) {
      assert(`${caseName} updates the visible inventory log with the authoritative result`, new RegExp(options.expectedMessagePattern, 'i').test(after.inventoryLog.lines.join('\n')), JSON.stringify(after.inventoryLog));
    }
    if (options.expectedInventoryFactAbsent) assert(`${caseName} updates the selected inventory row`, !new RegExp(options.expectedInventoryFactAbsent, 'i').test(JSON.stringify(after.inventory)), JSON.stringify(after.inventory));
    if (options.expectWorkspaceClosed) assert(`${caseName} closes inventory at the owned action boundary`, after.equipment.open === false && !/Inventory & equipment/.test(after.body), JSON.stringify(after.equipment));
    assert(`${caseName} no redundant Do what chooser or ownership failure`, !/Do what with .*\?\s*Choose visible item rows|Read this scroll to activate its magic|What do you want to rub|another prompt, menu, or transfer owns input|v2 action execution is blocked/i.test(after.body), after.body.slice(0, 1600));
    if (options.maxVisibleCursorCells != null) {
      assert(`${caseName} clears stale cursor and adjacent-target outlines`, interactionClasses.cursors <= 1 && interactionClasses.adjacentTargets <= options.maxVisibleCursorCells, JSON.stringify(interactionClasses));
    }
    result = { beforeShot, contextShot, postSelectionShot, postContinuationShot, afterShot, before, contextMenu: context.contextMenu, railActionIds, postSelectionState, postContinuationState, interactionClasses, after, row };
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
  console.log(`real-inventory-context-actions-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
  return result;
}

async function runMonsterDetectionRegression() {
  return runCase('quaff-unidentified-monster-detection', 'item.quaff', /^q[a-zA-Z] /u, {
    scenarioId: 'identity/unidentified-monster-detection-potion',
    rowPattern: 'potion',
    actionLabel: 'Quaff',
    expectedPrimaryActionId: 'item.quaff',
    expectedVisibleFact: 'uncursed',
    requireCompletion: false,
    expectWorkspaceClosed: true,
    postSelectionPromptPattern: 'Move cursor to monster of interest',
  });
}
async function runFoodDetectionRegression() {
  return runCase('read-unidentified-food-detection', 'item.read.scroll', /^r[a-zA-Z]$/u, {
    scenarioId: 'identity/unidentified-food-detection-scroll',
    rowPattern: 'scroll',
    actionLabel: 'Read',
    expectedVisibleFact: 'uncursed',
    requireCompletion: false,
    expectWorkspaceClosed: true,
    postSelectionPromptPattern: 'Review this tip',
    postSelectionContinuationPattern: 'Move cursor to food',
    maxVisibleCursorCells: 8,
  });
}
async function main() {
  if (process.env.NH_REAL_INVENTORY_CASE === 'monster-detection') {
    const monsterDetection = await runMonsterDetectionRegression();
    console.log(JSON.stringify({ monsterDetection }, null, 2));
    return;
  }
  if (process.env.NH_REAL_INVENTORY_CASE === 'food-detection') {
    const foodDetection = await runFoodDetectionRegression();
    console.log(JSON.stringify({ foodDetection }, null, 2));
    return;
  }
  if (process.env.NH_REAL_INVENTORY_CASE === 'takeoff-armor') {
    const takeOffArmor = await runCase('takeoff-worn-body-armor', 'item.takeOff', /^T[a-zA-Z]$/u, {
      scenarioId: 'identity/valkyrie-equipped-inventory',
      rowPattern: 'leather armor',
      actionLabel: 'Take off',
      expectWorkspaceClosed: false,
      expectedMessagePattern: 'finish taking off|were wearing .*leather armor',
      expectedInventoryFactAbsent: 'leather armor[^}]*being worn',
    });
    console.log(JSON.stringify({ takeOffArmor }, null, 2));
    return;
  }
  if (process.env.NH_REAL_INVENTORY_CASE === 'rub-lamp') {
    const rubLamp = await runCase('rub-selected-lamp', 'item.rub', /^#rub\n[a-zA-Z]$/u, {
      scenarioId: 'object/rub-candidates-in-inventory',
      rowPattern: 'oil lamp',
      actionLabel: 'Rub',
      expectedAfterPattern: 'Main hand.*oil lamp',
      expectWorkspaceClosed: false,
      expectedMessagePattern: 'Nothing happens|djinni|genie',
    });
    console.log(JSON.stringify({ rubLamp }, null, 2));
    return;
  }
  const readScroll = await runCase('read-scroll', 'item.read.scroll', /^r[a-zA-Z]$/u, { waitBeforeContextMs: 3300 });
  const dropScroll = await runCase('drop-scroll', 'item.drop', /^d[a-zA-Z]$/u);
  const quaffPotion = await runCase('quaff-potion', 'item.quaff', /^q[a-zA-Z]$/u, {
    scenarioId: 'identity/player-assigned-item-names',
    rowPattern: 'potion',
    actionLabel: 'Quaff',
    expectedPrimaryActionId: 'item.quaff', expectedVisibleFact: 'uncursed', requireCompletion: true, expectWorkspaceClosed: true,
  });
  console.log(JSON.stringify({ defaultScenarioId, readScroll, dropScroll, quaffPotion }, null, 2));
}
const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
