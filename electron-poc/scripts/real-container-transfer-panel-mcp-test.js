const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');
const root = path.resolve(__dirname, '..');
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
  console.log(`real-container-transfer-panel-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function dblclick(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); for (let i = 1; i <= 2; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: i }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: i }); await delay(60); } }
async function drag(cdp, fromSelector, toSelector) {
  const points = await evalExpr(cdp, `(() => {
    const from = document.querySelector(${JSON.stringify(fromSelector)});
    const to = document.querySelector(${JSON.stringify(toSelector)});
    from?.scrollIntoView?.({block:'center', inline:'center'});
    to?.scrollIntoView?.({block:'center', inline:'center'});
    const a = from?.getBoundingClientRect(); const b = to?.getBoundingClientRect();
    return a && b ? { from:{x:a.left+a.width/2,y:a.top+a.height/2}, to:{x:b.left+b.width/2,y:b.top+b.height/2} } : null;
  })()`);
  if (!points) throw new Error(`missing drag selectors ${fromSelector} -> ${toSelector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.from.x, y: points.from.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: points.from.x, y: points.from.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 8; i += 1) {
    const x = points.from.x + ((points.to.x - points.from.x) * i / 8);
    const y = points.from.y + ((points.to.y - points.from.y) * i / 8);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    await delay(40);
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: points.to.x, y: points.to.y, button: 'left', buttons: 0, clickCount: 1 });
}
async function press(cdp, key, text = key) { await evalExpr(cdp, "document.getElementById('game-grid').focus()"); const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 27; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, text, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
  actions: window.__nethackPromptTest?.contextActions?.(),
  container: window.__nethackPromptTest?.container?.(),
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  messages: window.__nethackPromptTest?.messages?.().slice(-12).map((m) => m.text || String(m)) || [],
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  dialog: window.__nethackPromptTest?.dialog?.(),
  body: document.body.innerText,
  shim: document.getElementById('shim-output')?.innerText?.slice(-5000) || '',
  transferTransactions: window.__nethackPromptTest?.transferTransactions?.(),
  uiCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.(),
  uiAcks: window.__nethackPromptTest?.sentUiProtocolAcks?.(),
  currentCell: window.__nethackPromptTest?.currentCell?.()
}))()`); }
async function saveState(cdp, name) { const s = await state(cdp); fs.writeFileSync(path.join(cdp.outputDir, name), JSON.stringify(s, null, 2)); return s; }
async function start(cdp) {
  await click(cdp, '#start-shim');
  await delay(250);
  if ((await state(cdp)).dialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game');
  await delay(150);
  await waitFor(async () => evalExpr(cdp, `document.getElementById('character-dialog')?.open === true`), 5000);
  await evalExpr(cdp, `(() => { const input = document.getElementById('player-name'); input.value = 'ContainerFacts'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click(cdp, '#confirm-character');
  await waitFor(async () => (await state(cdp)).running, 20000).catch(async (error) => {
    const debug = await state(cdp).catch(() => ({}));
    fs.writeFileSync(path.join(cdp.outputDir, 'debug-start-timeout.json'), JSON.stringify(debug, null, 2));
    await shot(cdp, 'debug-start-timeout.png').catch(() => undefined);
    throw error;
  });
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`);
  await waitFor(async () => !(await state(cdp)).dialogs.includes('intro-dialog'), 5000);
}
async function main() {
  const page = await Harness.createElectronBrowserDriver({
    root, width, height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: 'container/multi-item-transfer-large-box-on-hero', NH_SHIM_RESET_LOCKS: '1' },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  let scenarioError = null;
  try {
    await start(cdp);
    await waitFor(async () => (await state(cdp)).actions?.buttons?.some((b) => b.id === 'open-container'), 10000);
    const contextShot = await shot(cdp, '01-real-container-context.png');

    const invShot = '(inventory pane is populated automatically by the container panel)';
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs()`);
    await click(cdp, '#context-action-bar button[data-context-action-id="open-container"]');
    await waitFor(async () => {
      const s = await state(cdp);
      if (s.container?.active) return s;
      if (/Do what with|Take out what|Put in what/i.test(`${s.dialog?.prompt || ''}\n${s.body || ''}`)) return s;
      return null;
    }, 10000).catch(async (error) => {
      const s = await state(cdp);
      fs.writeFileSync(path.join(outDir, 'debug-after-loot-timeout.json'), JSON.stringify(s, null, 2));
      await shot(cdp, 'debug-after-loot-timeout.png');
      throw error;
    });
    const openedShot = await shot(cdp, '03-real-container-panel-open.png');
    const autoLoaded = await waitFor(async () => {
      const s = await state(cdp);
      if (s.container?.left?.length && s.container?.right?.length && !/\bRefresh\b/i.test(s.container.text || '')) return s;
      return null;
    }, 15000).catch(async (error) => {
      const s = await state(cdp);
      fs.writeFileSync(path.join(outDir, 'debug-after-auto-load-timeout.json'), JSON.stringify(s, null, 2));
      await shot(cdp, 'debug-after-auto-load-timeout.png');
      throw error;
    });
    const paneFacts = await evalExpr(cdp, `(() => ({
      left: Array.from(document.querySelectorAll('#container-transfer-panel [data-container-pane="left"] .container-item-row')).map((el) => el.innerText.trim()),
      right: Array.from(document.querySelectorAll('#container-transfer-panel [data-container-pane="right"] .container-item-row')).map((el) => el.innerText.trim()),
      leftItemNames: Array.from(document.querySelectorAll('#container-transfer-panel [data-container-pane="left"] .container-item-row')).map((el) => el.dataset.itemName || ''),
    }))()`);
    const leftPotionName = paneFacts.leftItemNames.find((name) => /potion/i.test(name)) || '';
    const leftShot = await shot(cdp, '04-real-container-both-panes-auto-populated.png');
    const beforeState = await saveState(cdp, '04-real-container-before-transfer-state.json');
    const overlayCheck = await state(cdp);
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs()`);
    await press(cdp, 'i', 'i');
    await evalExpr(cdp, `(() => { document.querySelector('#inventory-equipment-button')?.click(); document.getElementById('open-actions')?.click(); })()`);
    await delay(120);
    const ownershipCheck = await state(cdp);
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs()`);
    await dblclick(cdp, '#container-transfer-panel [data-container-pane="left"] .container-item-row');
    await waitFor(async () => {
      const s = await state(cdp);
      return s.transferTransactions?.transfers?.filter((tx) => tx.direction === 'container-to-inventory' && tx.status === 'success' && tx.result?.status === 'success').length >= 1 ? s : null;
    }, 12000);
    const afterPut = await saveState(cdp, '05-real-container-immediate-after-left-to-right-state.json');
    const putShot = await shot(cdp, '05-real-after-container-to-inventory-drag.png');
    await waitFor(async () => {
      const s = await state(cdp);
      return s.container?.active && s.container.right?.some((row) => /potion|apple|dagger|food ration/i.test(row.text || '')) ? s : null;
    }, 10000);
    await evalExpr(cdp, `(() => { const row = Array.from(document.querySelectorAll('#container-transfer-panel [data-container-pane="right"] .container-item-row')).find((el) => /potion|apple|dagger|food ration/i.test(el.innerText)); if (row) row.id = 'direct-put-back-row'; })()`);
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs()`);
    await dblclick(cdp, '#direct-put-back-row');
    await waitFor(async () => {
      const s = await state(cdp);
      return s.transferTransactions?.transfers?.some((tx) => tx.direction === 'inventory-to-container' && tx.status === 'success' && tx.result?.status === 'success') ? s : null;
    }, 12000).catch(async (error) => {
      const s = await state(cdp);
      fs.writeFileSync(path.join(outDir, 'debug-after-put-back-timeout.json'), JSON.stringify(s, null, 2));
      await shot(cdp, 'debug-after-put-back-timeout.png');
      throw error;
    });
    const afterPutBack = await saveState(cdp, '06-real-container-after-inventory-to-container-state.json');
    const putBackShot = await shot(cdp, '06-real-after-inventory-to-container.png');
    await waitFor(async () => {
      const s = await state(cdp);
      return s.container?.active && s.container.left?.length >= 1 ? s : null;
    }, 10000);
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs()`);
    await dblclick(cdp, '#container-transfer-panel [data-container-pane="left"] .container-item-row');
    await waitFor(async () => {
      const s = await state(cdp);
      return s.transferTransactions?.transfers?.filter((tx) => tx.direction === 'container-to-inventory' && tx.status === 'success' && tx.result?.status === 'success').length >= 2 ? s : null;
    }, 12000).catch(async (error) => {
      const s = await state(cdp);
      fs.writeFileSync(path.join(outDir, 'debug-after-second-transfer-timeout.json'), JSON.stringify(s, null, 2));
      await shot(cdp, 'debug-after-second-transfer-timeout.png');
      throw error;
    });
    const afterSecondPut = await saveState(cdp, '07-real-container-after-second-left-to-right-state.json');
    const secondPutShot = await shot(cdp, '07-real-after-second-container-to-inventory.png');
    await delay(1000);
    const oneSecondState = await saveState(cdp, '08-real-container-one-second-after-left-to-right-state.json');
    const oneSecondShot = await shot(cdp, '08-real-container-one-second-after-left-to-right.png');
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs()`);
    await click(cdp, '#container-transfer-panel .container-transfer-heading button');
    const afterDone = await waitFor(async () => {
      const s = await saveState(cdp, '09-real-container-final-state.json');
      return !s.container?.active ? s : null;
    }, 5000);
    const doneShot = await shot(cdp, '09-real-container-done-closes-once.png');

    const c = afterPut.container;
    const loadedText = autoLoaded.container?.text || '';
    assert('real container panel is visible', c.active && /Container inventory/i.test(c.text) && /Your inventory/i.test(c.text), c.text);
    assert('real left pane shows NetHack item names', /food ration|dagger/i.test(loadedText) && !/Inventory selector/i.test(loadedText), loadedText);
    assert('real right pane shows carried inventory automatically', autoLoaded.container?.right?.length && /spear|shield|food ration|dagger/i.test(loadedText) && !/Open Inventory once|Refresh/i.test(loadedText), loadedText);
    assert('both container panes retain NetHack-visible item facts', paneFacts.left.some((name) => /cursed dagger/i.test(name)) && paneFacts.right.some((name) => /uncursed scroll of identify/i.test(name)), JSON.stringify(paneFacts, null, 2));
    assert('container items use complete inventory-style public appearances instead of bare classes', Boolean(leftPotionName) && !/^(?:a |an )?potion$/i.test(leftPotionName), JSON.stringify(paneFacts, null, 2));
    assert('real internal inventory probe does not cover container with Equipment / Inventory', overlayCheck.container?.active && !overlayCheck.dialog?.interactionOpen && !/Equipment\s*\/\s*Inventory|Hero equipment/i.test(`${overlayCheck.dialog?.title || ''}\n${overlayCheck.body || ''}`), JSON.stringify({ dialog: overlayCheck.dialog, container: overlayCheck.container?.text }));
    assert('real container panel blocks keyboard inventory and toolbar modals while open', ownershipCheck.container?.active && ownershipCheck.sent === '' && !ownershipCheck.dialogs?.includes?.('action-dialog') && !ownershipCheck.dialog?.interactionOpen && !/Equipment\s*\/\s*Inventory|Hero equipment/i.test(`${ownershipCheck.dialog?.title || ''}\n${ownershipCheck.body || ''}`), JSON.stringify({ sent: ownershipCheck.sent, dialogs: ownershipCheck.dialogs, dialog: ownershipCheck.dialog, container: ownershipCheck.container?.text }));
    assert('real open and transfer flow sent no classic loot command text through renderer input', !/#loot/i.test(`${beforeState.sent || ''}${afterPut.sent || ''}${afterPutBack.sent || ''}${afterSecondPut.sent || ''}`), JSON.stringify({ open: beforeState.sent, first: afterPut.sent, putBack: afterPutBack.sent, second: afterSecondPut.sent }));
    assert('real first container-to-inventory double-click used authoritative direct transfer path', /shim_container_transfer_confirmed/.test(`${afterPut.shim}\n${afterPut.sent || ''}`) && !/#loot\no/.test(afterPut.sent || ''), JSON.stringify({ sent: afterPut.sent, shim: afterPut.shim.slice(-1000) }));
    assert('real inventory-to-container double-click used authoritative direct transfer path', /shim_container_transfer_confirmed/.test(`${afterPutBack.shim}\n${afterPutBack.sent || ''}`) && afterPutBack.transferTransactions?.transfers?.some((tx) => tx.direction === 'inventory-to-container' && tx.status === 'success' && tx.result?.status === 'success'), JSON.stringify({ sent: afterPutBack.sent, transfers: afterPutBack.transferTransactions }));
    assert('real first transfer transaction records successful container-to-inventory result', afterPut.transferTransactions?.transfers?.some((tx) => tx.direction === 'container-to-inventory' && tx.status === 'success' && tx.result?.status === 'success' && tx.result?.delta?.changed) && afterPut.transferTransactions?.lastCompleted?.status === 'success', JSON.stringify(afterPut.transferTransactions));
    assert('real second transfer transaction records successful container-to-inventory result with no stale pending transfer', afterSecondPut.transferTransactions?.transfers?.filter((tx) => tx.direction === 'container-to-inventory' && tx.status === 'success' && tx.result?.status === 'success').length >= 2 && !afterSecondPut.transferTransactions?.activeTransferId, JSON.stringify(afterSecondPut.transferTransactions));
    assert('real container panel remains stable after one second', oneSecondState.container?.active && /Container inventory|Your inventory/i.test(oneSecondState.container?.text || ''), JSON.stringify(oneSecondState.container));
    assert('real Done closes the container panel with one click', !afterDone.container?.active && !afterDone.dialog?.interactionOpen && (afterDone.sent === '\u001b' || afterDone.sent === ''), JSON.stringify(afterDone));
    const summary = [`# Real container transfer panel MCP validation`, '', 'Scenario assertions recorded', '', `Context: ${contextShot}`, `Inventory source: ${invShot}`, `Panel opened: ${openedShot}`, `Auto-loaded panes: ${leftShot}`, `Before transfer state: ${path.join(outDir, '04-real-container-before-transfer-state.json')}`, `After first container-to-inventory double-click: ${putShot}`, `Immediate first after-transfer state: ${path.join(outDir, '05-real-container-immediate-after-left-to-right-state.json')}`, `After inventory-to-container double-click: ${putBackShot}`, `Immediate put-back state: ${path.join(outDir, '06-real-container-after-inventory-to-container-state.json')}`, `After second container-to-inventory double-click: ${secondPutShot}`, `Immediate second after-transfer state: ${path.join(outDir, '07-real-container-after-second-left-to-right-state.json')}`, `One-second after-transfer screenshot: ${oneSecondShot}`, `One-second state: ${path.join(outDir, '08-real-container-one-second-after-left-to-right-state.json')}`, `Done closes once: ${doneShot}`, `Final state: ${path.join(outDir, '09-real-container-final-state.json')}`, '', `Ownership blocked sent: ${JSON.stringify(ownershipCheck.sent)}`, `First transfer sent: ${JSON.stringify(afterPut.sent)}`, `Put-back sent: ${JSON.stringify(afterPutBack.sent)}`, `Second transfer sent: ${JSON.stringify(afterSecondPut.sent)}`, `Done sent: ${JSON.stringify(afterDone.sent)}`, '', `Right pane clean names: ${paneFacts.right.join(', ')}`, '', `Auto-loaded panel text:\n\n${loadedText}`, '', `Final panel text after second transfer:\n\n${afterSecondPut.container?.text || c.text}`, ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-container-transfer-panel-summary.md'), summary);
    const forbiddenBundleTokens = ['#' + 'loot', 'bridge_extcmd_answer', 'shimcontainer'];
    const cleanBundleHits = [];
    for (const file of fs.readdirSync(outDir)) {
      if (!/\.(?:json|md|txt)$/i.test(file)) continue;
      const text = fs.readFileSync(path.join(outDir, file), 'utf8');
      for (const token of forbiddenBundleTokens) if (text.toLowerCase().includes(token.toLowerCase())) cleanBundleHits.push({ file, token });
    }
    assert('clean direct evidence bundle contains no forbidden classic route tokens', cleanBundleHits.length === 0, JSON.stringify(cleanBundleHits));
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
  console.log(`real-container-transfer-panel-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}
const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
