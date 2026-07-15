const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');



const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');
function reviewRun(outputDir, reviewFile) { const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json'); const approval = EvidenceApproval.openEvidenceApproval({ manifestFile }); EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile)); const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true }); if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(manifestFile); console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`); }
function createEvidence(page) { return Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') }); }
async function finishEvidence(page, qc, scenarioError) { await page.close().catch(() => {}); qc.recordAssertions([{ id: 'scenario-contract', status: scenarioError ? 'failed' : 'passed', details: scenarioError?.message || '' }]); qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' }); qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' }); const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false }); if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(qc.manifestFile); console.log(`${scriptName}: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`); if (scenarioError) throw scenarioError; }
const repo = path.resolve(root, '..');
let outDir, evidencePage, evidenceQc

const width = 1360;
const height = 920;




async function evaluate(cdp, expression) { const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
async function click(cdp, selector) { const point = await evaluate(cdp, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); element?.scrollIntoView?.({block:'center',inline:'center'}); const rect = element?.getBoundingClientRect?.(); return rect ? {x:rect.left+rect.width/2,y:rect.top+rect.height/2} : null; })()`); if (!point) throw new Error(`missing ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 }); }
async function press(cdp, key, code = `Key${key.toUpperCase()}`, text = key) {
  const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : (key === 'Escape' ? 27 : 0);
  await cdp.send('Input.dispatchKeyEvent', { type:'keyDown', key, code, text, windowsVirtualKeyCode:vk, nativeVirtualKeyCode:vk });
  await cdp.send('Input.dispatchKeyEvent', { type:'keyUp', key, code, windowsVirtualKeyCode:vk, nativeVirtualKeyCode:vk });
}
async function screenshot(cdp, name) {
  const id = path.basename(name, path.extname(name));
  return evidencePage.screenshotEvidence(evidenceQc, id, {
    classification: 'synthetic-fixture',
    viewport: { width, height, devicePixelRatio: 1 },
    state: id,
  });
}
async function state(cdp) { return evaluate(cdp, `(() => ({
  running: Boolean(window.__nethackAutomation?.state?.().runningState?.running),
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
  actions: window.__nethackPromptTest?.contextActions?.(),
  inventory: window.__nethackPromptTest?.inventory?.(),
  dialog: window.__nethackPromptTest?.dialog?.(),
  status: document.getElementById('status')?.textContent || '',
  messages: window.__nethackPromptTest?.messages?.().slice(-30).map((entry) => entry.text || String(entry)) || [],
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  activePrompt: window.__nethackAutomation?.state?.().activePrompt || null
}))()`); }

function makeIsolatedPlayground(mode) {
  const playground = fs.mkdtempSync(path.join(os.tmpdir(), `nh-shop-payment-${mode}-`));
  fs.cpSync(path.join(repo, 'playground'), playground, { recursive: true, filter: (entry) => !/[a-z]lock\.0$/i.test(path.basename(entry)) });
  return playground;
}

async function launch(mode) {
  const playground = makeIsolatedPlayground(mode);
  const page = await Harness.createElectronBrowserDriver({
    root,
    width,
    height,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_TEST_PLAYGROUND: playground,
      NETHACKDIR: playground,
      NH_SHIM_TEST_SHOP_PAYMENT_SCENE: mode,
      NH_SHIM_RESET_LOCKS: '1',
      NETHACK_SEED: '424242',
    },
  });
  outDir = page.outputDir;
  evidencePage = page;
  evidenceQc = createEvidence(page);
  const cdp = page.cdp;
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true });
    const startup = await state(cdp);
    if (startup.dialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game');
    else await click(cdp, '#start-shim');
    await Harness.waitFor(() => evaluate(cdp, `document.getElementById('character-dialog')?.open === true`), 5000);
    await click(cdp, '#confirm-character');
    await Harness.waitFor(async () => (await state(cdp)).running);
    const initial = await state(cdp);
    if (initial.dialogs.includes('intro-dialog')) await click(cdp, '#intro-continue');
    await Harness.waitFor(async () => !(await state(cdp)).dialogs.includes('intro-dialog'), 5000);
    await Harness.waitFor(async () => { const current = await state(cdp); return current.actions?.buttons?.some((button) => /^pay-shopkeeper-/.test(button.id || '')) && current.inventory?.unpaidItemCount === 2 ? current : null; }, 12000);
    await Harness.delay(500);
    return { page, cdp, qc: evidenceQc, playground };
  } catch (error) {
    try {
      await finishEvidence(page, evidenceQc, error);
    } finally {
      fs.rmSync(playground, { recursive: true, force: true });
    }
  }
}

async function stop(run, scenarioError) {
  try {
    await finishEvidence(run.page, run.qc, scenarioError);
  } finally {
    fs.rmSync(run.playground, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]);
  const evidence = { evidenceKind: 'real Electron and native shop scenes', screenshots: {}, checks: {} };
  let run;
  let scenarioError;
  try {
    run = await launch('sufficient');
    evidence.beforePayment = await state(run.cdp);
    const payButton = evidence.beforePayment.actions.buttons.find((button) => /^pay-shopkeeper-/.test(button.id || ''));
    evidence.screenshots.beforePayment = await screenshot(run.cdp, '01-unpaid-items-adjacent-shopkeeper.png');
    await evaluate(run.cdp, 'window.__nethackPromptTest.clearSentInputs()');
    await click(run.cdp, `#context-action-bar button[data-context-action-id="${payButton.id}"]`);
    evidence.paymentMenu = await Harness.waitFor(async () => { const current = await state(run.cdp); return current.dialogs.includes('interaction-dialog') && /Shop payment/i.test(current.dialog?.title || '') ? current : null; }, 8000);
    evidence.screenshots.paymentMenu = await screenshot(run.cdp, '02-shop-payment-item-picker.png');
    await click(run.cdp, '#interaction-options .choice-button[data-key="a"]');
    evidence.partialSelection = await state(run.cdp);
    await click(run.cdp, '#interaction-clear');
    await click(run.cdp, '#interaction-cancel');
    await Harness.waitFor(async () => { const current = await state(run.cdp); return !current.dialogs.includes('interaction-dialog') && current.inventory?.unpaidItemCount === 2 ? current : null; }, 5000);
    await evaluate(run.cdp, 'window.__nethackPromptTest.clearSentInputs()');
    await click(run.cdp, `#context-action-bar button[data-context-action-id="${payButton.id}"]`);
    await Harness.waitFor(async () => { const current = await state(run.cdp); return current.dialogs.includes('interaction-dialog') && /Shop payment/i.test(current.dialog?.title || '') ? current : null; }, 8000);
    await click(run.cdp, '#interaction-select-all');
    await click(run.cdp, '#interaction-confirm');
    evidence.afterPayment = await Harness.waitFor(async () => { const current = await state(run.cdp); return current.inventory?.unpaidItemCount === 0 && !current.actions?.buttons?.some((button) => /^pay-shopkeeper-/.test(button.id || '')) ? current : null; }, 10000);
    evidence.screenshots.afterPayment = await screenshot(run.cdp, '03-paid-inventory-action-removed.png');

    await evaluate(run.cdp, `document.getElementById('game-grid')?.focus?.(); window.__nethackPromptTest.clearSentInputs(); true`);
    await press(run.cdp, 'd');
    const dropMenu = await Harness.waitFor(async () => { const current=await state(run.cdp); return current.dialogs.includes('interaction-dialog') && /drop/i.test(`${current.dialog?.title||''}\n${current.dialog?.prompt||''}`) ? current : null; }, 8000);
    const sellRow = (dropMenu.dialog?.options || []).find((option) => option.key && /food ration|potion of healing/i.test(option.text || '')) || (dropMenu.dialog?.options || []).find((option) => option.key && !/gold|zorkmid|wielded|worn/i.test(option.text || ''));
    if (!sellRow) throw new Error(`real shop offer setup found no droppable owned item: ${JSON.stringify(dropMenu.dialog)}`);
    await click(run.cdp, `#interaction-options .choice-button[data-key="${sellRow.key}"]`);
    evidence.shopOffer = await Harness.waitFor(async () => { const current=await state(run.cdp); return current.dialogs.includes('interaction-dialog') && /offers?|sell it/i.test(`${current.dialog?.title||''}\n${current.dialog?.prompt||''}`) ? current : null; }, 8000);
    evidence.screenshots.shopOffer = await screenshot(run.cdp, '03b-real-shop-sell-offer.png');
    await click(run.cdp, '#interaction-cancel');
    await stop(run);
    run = null;

    run = await launch('insufficient');
    evidence.beforeInsufficient = await state(run.cdp);
    const insufficientButton = evidence.beforeInsufficient.actions.buttons.find((button) => /^pay-shopkeeper-/.test(button.id || ''));
    await evaluate(run.cdp, 'window.__nethackPromptTest.clearSentInputs()');
    await click(run.cdp, `#context-action-bar button[data-context-action-id="${insufficientButton.id}"]`);
    evidence.insufficient = await Harness.waitFor(async () => { const current = await state(run.cdp); return /no gold or credit/i.test(current.messages.join('\n')) ? current : null; }, 8000).catch(async (error) => {
      throw new Error(`insufficient-funds payment did not reach the expected public message: ${error.message}; state=${JSON.stringify(await state(run.cdp))}`);
    });
    await click(run.cdp, '#context-action-bar button[data-context-action-id="more"]');
    await Harness.waitFor(() => evaluate(run.cdp, `document.getElementById('action-dialog')?.open === true`), 5000);
    await click(run.cdp, '#action-dialog-close');
    await Harness.waitFor(() => evaluate(run.cdp, `document.getElementById('action-dialog')?.open !== true`), 5000);
    evidence.screenshots.insufficient = await screenshot(run.cdp, '04-insufficient-funds-message.png');

    evidence.stale = await evaluate(run.cdp, `(() => {
      const test = window.__nethackPromptTest;
      const staleButton = document.querySelector('#context-action-bar button[data-context-action-id^="pay-shopkeeper-"]');
      const revision = (test.inventory().snapshotRevision || 0) + 100;
      test.clearSentInputs();
      test.event({ name: 'shim_update_inventory', revision, inventoryRevision: revision, equipmentRevision: revision, items: [] });
      staleButton?.click();
      return new Promise((resolve) => setTimeout(() => resolve({ sent: test.sentInputs().join(''), actions: test.contextActions(), status: document.getElementById('status')?.textContent || '', messages: test.messages().slice(-8).map((entry) => entry.text || String(entry)) }), 120));
    })()`);
    evidence.stale.evidenceKind = 'SYNTHETIC/INJECTED stale controller supplement; not actual-player proof';
    evidence.recipientSafety = await evaluate(run.cdp, `(() => {
      const test = window.__nethackPromptTest;
      const revision = (test.inventory().snapshotRevision || 0) + 1;
      test.event({ name: 'shim_update_inventory', revision, inventoryRevision: revision, equipmentRevision: revision, items: [{ selector: 97, objectId: 9001, text: 'a - a food ration (unpaid, 60 zorkmids)', quantity: 1, actionAffordances: ['shop.unpaid', 'shop.unpaid.owner.101'] }] });
      window.__nethackTooltipTest.setCells([{ x: 10, y: 10, ch: '@', semanticKind: 'hero', semanticName: 'hero' }, { x: 11, y: 10, ch: '@', semanticKind: 'monster', semanticName: 'shopkeeper', actionAffordances: ['monster.shopkeeper', 'monster.shopkeeper.id.101'] }, { x: 9, y: 10, ch: '@', semanticKind: 'monster', semanticName: 'shopkeeper', actionAffordances: ['monster.shopkeeper', 'monster.shopkeeper.id.202'] }]);
      test.setCursor(10, 10); test.setRunning(true);
      const ambiguous = test.contextActions();
      window.__nethackTooltipTest.setCells([{ x: 10, y: 10, ch: '@', semanticKind: 'hero', semanticName: 'hero' }, { x: 11, y: 10, ch: '@', semanticKind: 'monster', semanticName: 'shopkeeper', actionAffordances: ['monster.shopkeeper', 'monster.shopkeeper.id.202'] }]);
      test.setCursor(10, 10); test.setRunning(true); test.clearSentInputs();
      const replacement = test.contextActions();
      replacement.buttons.find((button) => /^pay-shopkeeper-/.test(button.id || ''))?.click?.();
      return { ambiguous, replacement, sent: test.sentInputs().join('') };
    })()`);

    evidence.recipientSafety.evidenceKind = 'SYNTHETIC/INJECTED recipient-safety controller supplement; not actual-player proof';
    const beforeLabels = evidence.beforePayment.actions?.buttons?.map((button) => button.text) || [];
    const menuText = `${evidence.paymentMenu.dialog?.prompt || ''}\n${(evidence.paymentMenu.dialog?.options || []).map((option) => option.text).join('\n')}`;
    const afterMessages = evidence.afterPayment.messages.join('\n');
    evidence.checks = {
      realElectronStartedWithNativeShopFixture: evidence.beforePayment.running === true,
      unpaidAffordancesCameFromNativeInventory: evidence.beforePayment.inventory.snapshotItems.filter((item) => item.actionAffordances.includes('shop.unpaid') && item.actionAffordances.some((token) => /^shop\.unpaid\.owner\.\d+$/.test(token))).length === 2,
      adjacentShopkeeperShowsCountedPayAction: beforeLabels.includes('Pay shopkeeper (2 items)'),
      payActionAlsoKeepsShopkeeperChat: beforeLabels.some((label) => /Chat with .* shopkeeper/i.test(label)),
      unrelatedAdvancedPayButtonIsNotTheProof: evidence.beforePayment.actions.buttons.some((button) => /^pay-shopkeeper-/.test(button.id || '')),
      clickRoutesNativePayCommand: evidence.paymentMenu.sent === '#pay\n',
      multipleItemsOpenReviewablePaymentPicker: /food ration/i.test(menuText) && /potion of healing/i.test(menuText) && /Pay selected/i.test(evidence.paymentMenu.dialog?.confirmText || ''),
      paymentPickerUsesPlayerFacingStatus: /Choose items to pay for/i.test(`${evidence.paymentMenu.dialog?.prompt || ''}\n${evidence.paymentMenu.status}`),
      paymentPickerSeparatesSelectedSubtotalFromBillTotal: /1 selected.*selected total 60 zm/i.test(evidence.partialSelection.dialog?.feedback || '') && !/87 zm|visible total|bill total/i.test(evidence.partialSelection.dialog?.feedback || ''),
      successfulPaymentClearsNativeUnpaidState: evidence.afterPayment.inventory.unpaidItemCount === 0 && evidence.afterPayment.inventory.snapshotItems.every((item) => !item.actionAffordances.includes('shop.unpaid')),
      successfulPaymentRemovesContextAction: !evidence.afterPayment.actions.buttons.some((button) => /^pay-shopkeeper-/.test(button.id || '')),
      successfulPaymentHasNativeFeedback: /bought|thank you for shopping/i.test(afterMessages),
      successfulPaymentUsesPlayerFacingStatus: evidence.afterPayment.status === 'Payment complete',
      realDropCommandOpensCoreShopOffer: evidence.shopOffer.sent.startsWith('d') && /offers?|sell it/i.test(`${evidence.shopOffer.dialog?.title||''}\n${evidence.shopOffer.dialog?.prompt||''}`),
      shopOfferUsesConfirmationButtons: (evidence.shopOffer.dialog?.options || []).some((option)=>/Accept offer/i.test(option.text||'')) && (evidence.shopOffer.dialog?.options || []).some((option)=>/Decline offer/i.test(option.text||'')),
      insufficientFundsAreReported: /no gold or credit/i.test(evidence.insufficient.messages.join('\n')),
      insufficientFundsStatusUsesNativeResult: /no gold or credit/i.test(evidence.insufficient.status),
      insufficientFundsDoNotHang: !evidence.insufficient.dialogs.includes('interaction-dialog') && !evidence.insufficient.activePrompt,
      insufficientFundsLeaveBillAndActionIntact: evidence.insufficient.inventory.unpaidItemCount === 2 && evidence.insufficient.actions.buttons.some((button) => /^pay-shopkeeper-/.test(button.id || '')),
      staleDetachedActionSendsNothing: evidence.stale.sent === '',
      staleDetachedActionReportsChangedContext: /Payment is no longer available/i.test(`${evidence.stale.status}\n${evidence.stale.messages.join('\n')}`),
      staleSnapshotRemovesPayAction: !evidence.stale.actions.buttons.some((button) => /^pay-shopkeeper-/.test(button.id || '')),
      multipleAdjacentShopkeepersSuppressUntargetedPay: !evidence.recipientSafety.ambiguous.buttons.some((button) => /^pay-shopkeeper-/.test(button.id || '')),
      replacementShopkeeperCannotReceiveAnotherOwnersBill: !evidence.recipientSafety.replacement.buttons.some((button) => /^pay-shopkeeper-/.test(button.id || '')) && evidence.recipientSafety.sent === '',
    };

    fs.writeFileSync(path.join(outDir, 'real-shop-payment-context-debug.json'), JSON.stringify(evidence, null, 2));
    const failed = Object.entries(evidence.checks).filter(([, passed]) => !passed).map(([name]) => name);
    if (failed.length) throw new Error(`shop payment checks failed: ${failed.join(', ')}`);
  } catch (error) {
    scenarioError = error;
  } finally {
    if (run) await stop(run, scenarioError);
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
