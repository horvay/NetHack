const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_GUI_INPUT_OUT_DIR || path.join(root, 'test', 'gui-input-workflow');
const port = Number(process.env.NH_GUI_INPUT_CDP_PORT || 9477);
const width = Number(process.env.NH_GUI_INPUT_WIDTH || 1280);
const height = Number(process.env.NH_GUI_INPUT_HEIGHT || 900);

function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  await Harness.withElectronPage({ root, port, width, height, outputDir: outDir, teardownTimeoutMs: 5000 }, async (page) => {
    await page.waitForCheckedValue("document.readyState === 'complete' && !!window.__nethackPromptTest", 10000);
    await page.evalCheckedValue(`(() => {
      const t = window.__nethackPromptTest;
      t.reset(); t.setRunning(true); t.setCursor(10, 10); t.clearSentInputs();
      for (const id of ['startup-choice-dialog', 'character-dialog', 'intro-dialog', 'document-dialog', 'action-dialog']) document.getElementById(id)?.close?.('focused-proof-setup');
      t.setGroundPileSnapshotForTest([
        { objectId:2101, displayName:'a food ration', quantity:1, semanticKind:'object', semanticName:'food ration', semanticKnown:true, actionAffordances:['pickup'] },
        { objectId:2102, displayName:'a potion of healing', quantity:1, semanticKind:'object', semanticName:'potion of healing', semanticKnown:true, actionAffordances:['pickup'] },
      ], { x:10, y:10 });
      t.setAuthoritativeInventoryForTest([
        { selector:99, objectId:2201, text:'c - a +0 dagger', displayName:'a +0 dagger', quantity:1, semanticKind:'object', semanticName:'dagger', semanticKnown:true, actionAffordances:['drop'] },
      ], 2201);
      t.event({name:'shim_start_menu', window:40, requestId:'pickup-menu-r1', menuRequestId:'pickup-menu-r1', transactionId:'pickup-command-r1'});
      t.event({name:'shim_add_menu', window:40, requestId:'pickup-menu-r1', selector:97, objectId:2101, text:'a - a food ration', glyphChar:37, semanticKind:'object', semanticName:'food ration', semanticKnown:true});
      t.event({name:'shim_add_menu', window:40, requestId:'pickup-menu-r1', selector:98, objectId:2102, text:'b - a potion of healing', glyphChar:33, semanticKind:'object', semanticName:'potion of healing', semanticKnown:true});
      t.event({name:'shim_end_menu', window:40, requestId:'pickup-menu-r1', menuRequestId:'pickup-menu-r1', transactionId:'pickup-command-r1', prompt:'Pick up what?'});
      t.event({name:'shim_select_menu', window:40, requestId:'pickup-menu-r1', menuRequestId:'pickup-menu-r1', transactionId:'pickup-command-r1', prompt:'Pick up what?', how:2});
      return true;
    })()`);
    await page.waitForCheckedValue("window.__nethackPromptTest.container().active && /Ground items/i.test(window.__nethackPromptTest.container().text)", 5000);
    const owner = await page.evalCheckedValue(`(() => {
      const t = window.__nethackPromptTest;
      const panel = document.getElementById('container-transfer-panel');
      const rect = panel.getBoundingClientRect();
      return {
        container:t.container(), dialog:t.dialog(), sent:t.sentInputs().join(''),
        openDialogs:Array.from(document.querySelectorAll('dialog[open]')).map((dialog)=>dialog.id),
        body:document.body.innerText,
        panelWithinViewport:rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        panelNotClipped:panel.scrollWidth <= panel.clientWidth + 1 && panel.scrollHeight <= panel.clientHeight + 1,
        rows:Array.from(document.querySelectorAll('[data-container-pane="left"] .container-item-row')).map((row)=>({stableId:row.dataset.stableId||'',selector:row.dataset.selector||'',text:row.innerText,checked:row.getAttribute('aria-checked')})),
      };
    })()`);
    const ownerScreenshot = await page.screenshot(path.join(outDir, 'explicit-pickup-ground-transfer.png'));

    const selection = await page.evalCheckedValue(`(() => {
      const t = window.__nethackPromptTest;
      const initial = document.querySelector('[data-container-pane="left"] .container-item-row');
      const stableId = initial.dataset.stableId;
      const selector = initial.dataset.selector || initial.dataset.shortcut || '';
      initial.click();
      const current = document.querySelector('[data-container-pane="left"] .container-item-row[data-stable-id="' + CSS.escape(stableId) + '"]');
      const submit = document.querySelector('[data-transfer-selected="true"]');
      return {
        stableId, selector,
        checked:current?.getAttribute('aria-checked') || '',
        selectedCount:document.querySelector('.container-transfer-selected-count')?.textContent || '',
        submitText:submit?.innerText || '',
        interactionOpen:t.dialog().interactionOpen,
        sentBeforeSubmit:t.sentInputs().join(''),
      };
    })()`);
    const selectedScreenshot = await page.screenshot(path.join(outDir, 'explicit-pickup-ground-transfer-selected.png'));
    const completion = await page.evalCheckedValue(`(async () => {
      const t = window.__nethackPromptTest;
      document.querySelector('[data-transfer-selected="true"]').click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      return {
        sentCodes:t.sentInputs().join('').split('').map((character)=>character.charCodeAt(0)),
        container:t.container(),
        commandState:t.transferPanelCommandState(),
        openDialogs:Array.from(document.querySelectorAll('dialog[open]')).map((dialog)=>dialog.id),
        body:document.body.innerText,
      };
    })()`, { awaitPromise: true });

    await page.evalCheckedValue(`(() => {
      const t = window.__nethackPromptTest;
      const pending = t.transferPanelCommandState().transfer;
      t.event({ name:'bridge_menu_answer', window:40, requestId:pending.expectedRequestId, menuRequestId:pending.expectedRequestId, transactionId:pending.transferId, inputTransactionId:pending.transferId, lifecycleRevision:1, lifecycle:'answered', return:1, selector:97, selectors:'a' });
      t.reset(); t.setRunning(true); t.setCursor(10, 10); t.clearSentInputs();
      t.setGroundPileSnapshotForTest([
        { objectId:2103, displayName:'7 arrows', quantity:7, semanticKind:'object', semanticName:'arrow', semanticKnown:true, actionAffordances:['pickup'] },
      ], { x:10, y:10 });
      t.event({name:'shim_start_menu', window:41, requestId:'pickup-menu-r2', menuRequestId:'pickup-menu-r2', transactionId:'pickup-command-r2'});
      t.event({name:'shim_add_menu', window:41, requestId:'pickup-menu-r2', selector:97, objectId:2103, text:'a - 7 arrows', glyphChar:41, semanticKind:'object', semanticName:'arrow', semanticKnown:true});
      t.event({name:'shim_end_menu', window:41, requestId:'pickup-menu-r2', menuRequestId:'pickup-menu-r2', transactionId:'pickup-command-r2', prompt:'Pick up what?'});
      t.event({name:'shim_select_menu', window:41, requestId:'pickup-menu-r2', menuRequestId:'pickup-menu-r2', transactionId:'pickup-command-r2', prompt:'Pick up what?', how:2});
      return true;
    })()`);
    await page.waitForCheckedValue("window.__nethackPromptTest.container().active && window.__nethackPromptTest.container().left.length === 1", 5000);
    const stackSelection = await page.evalCheckedValue(`(() => {
      const t = window.__nethackPromptTest;
      const initial = document.querySelector('[data-container-pane="left"] .container-item-row');
      const stableId = initial.dataset.stableId;
      initial.click();
      const current = document.querySelector('[data-container-pane="left"] .container-item-row[data-stable-id="' + CSS.escape(stableId) + '"]');
      return {
        owner:t.container(), checked:current?.getAttribute('aria-checked') || '',
        selectedCount:document.querySelector('.container-transfer-selected-count')?.textContent || '',
        submitText:document.querySelector('[data-transfer-selected="true"]')?.innerText || '',
        quantityControlAbsent:!current?.querySelector('.quantity-input, .quantity-control'),
        sent:t.sentInputs().join(''),
      };
    })()`);
    const stackScreenshot = await page.screenshot(path.join(outDir, 'explicit-pickup-ground-transfer-stack-selected.png'));

    const assertions = {
      authoritativeGroundTransferOwnsPickup: owner.container.active && !owner.container.hidden && owner.container.status === 'ready' && owner.container.transferSessionId.length > 0 && owner.container.menu?.awaitingSelection === true && owner.container.menu?.prompt === 'Pick up what?' && owner.rows.length === 2 && owner.rows.some((row)=>/food ration/i.test(row.text)) && owner.rows.some((row)=>/potion of healing/i.test(row.text)),
      interactionDialogDoesNotCompeteWithTransferOwner: !owner.dialog.interactionOpen && !owner.openDialogs.includes('interaction-dialog'),
      transferOwnerIsVisibleAndUnclipped: owner.panelWithinViewport && owner.panelNotClipped && /Ground items/i.test(owner.container.text) && /Your inventory/i.test(owner.container.text),
      visibleRowSelectionPreservesExactOwnerIdentity: selection.checked === 'true' && /1 selected/i.test(selection.selectedCount) && /Take 1 selected/i.test(selection.submitText) && !selection.interactionOpen && selection.sentBeforeSubmit === '',
      selectionDispatchesExactOwnedClassicSelector: completion.sentCodes.length === 2 && completion.sentCodes[0] === 97 && completion.sentCodes[1] === 10 && completion.container.pendingTransferId && completion.commandState.transfer?.route === 'classic' && completion.commandState.transfer?.expectedRequestId === 'pickup-menu-r1',
      stackSelectionRemainsWholeRow: stackSelection.owner.active && stackSelection.owner.status === 'ready' && stackSelection.checked === 'true' && /1 selected/i.test(stackSelection.selectedCount) && /Take 1 selected/i.test(stackSelection.submitText) && stackSelection.quantityControlAbsent && stackSelection.sent === '',
      noStartupRawPromptStaleModalOrUnknownCommand: !owner.openDialogs.includes('startup-choice-dialog') && !completion.openDialogs.includes('startup-choice-dialog') && !/Choose your path|Choose visible item rows|Loading inventory choices|Unknown command/i.test(`${owner.body}\n${completion.body}`),
    };
    const metrics = {
      owner, selection, completion, stackSelection,
      screenshots: { ownerScreenshot, selectedScreenshot, stackScreenshot },
      assertions,
    };
    fs.writeFileSync(path.join(outDir, 'gui-input-workflow-metrics.json'), JSON.stringify(metrics, null, 2));
    console.log(JSON.stringify(metrics, null, 2));
    const failed = Object.entries(assertions).filter(([, value]) => !value).map(([name]) => name);
    if (failed.length) throw new Error(`GUI pickup workflow assertions failed: ${failed.join(', ')}`);
  });
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
