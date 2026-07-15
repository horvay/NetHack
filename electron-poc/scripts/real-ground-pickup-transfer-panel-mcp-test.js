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
  console.log(`real-ground-pickup-transfer-panel-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function key(cdp, value, code = '') { const text = value.length === 1 ? { text:value, unmodifiedText:value } : {}; await cdp.send('Input.dispatchKeyEvent', { type:'keyDown', key:value, code, ...text }); await cdp.send('Input.dispatchKeyEvent', { type:'keyUp', key:value, code }); }
async function dragMatch(cdp, pane, pattern, targetPane) {
  const points = await evalExpr(cdp, `(() => {
    const re = new RegExp(${JSON.stringify(pattern)}, 'i');
    const rows = Array.from(document.querySelectorAll('#container-transfer-panel [data-container-pane="${pane}"] .container-item-row'));
    const source = rows.find((row) => re.test(row.innerText || '')) || rows[0];
    const target = document.querySelector('#container-transfer-panel [data-container-pane="${targetPane}"]');
    const from = source?.getBoundingClientRect();
    const to = target?.getBoundingClientRect();
    return from && to ? { from:{x:from.left+from.width/2,y:from.top+from.height/2}, to:{x:to.left+to.width/2,y:to.top+to.height/2}, text:source.innerText } : null;
  })()`);
  if (!points) throw new Error(`missing drag ${pane} row ${pattern} or ${targetPane} pane`);
  await cdp.send('Input.dispatchMouseEvent', { type:'mouseMoved', ...points.from });
  await cdp.send('Input.dispatchMouseEvent', { type:'mousePressed', ...points.from, button:'left', buttons:1, clickCount:1 });
  for (let step = 1; step <= 8; step += 1) {
    await cdp.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:points.from.x+(points.to.x-points.from.x)*step/8, y:points.from.y+(points.to.y-points.from.y)*step/8, button:'left', buttons:1 });
    await delay(35);
  }
  await cdp.send('Input.dispatchMouseEvent', { type:'mouseReleased', ...points.to, button:'left', buttons:0, clickCount:1 });
  return points.text;
}
async function pressArrow(cdp, keyName) { await cdp.send('Input.dispatchKeyEvent', { type:'keyDown', key:keyName, code:keyName }); await cdp.send('Input.dispatchKeyEvent', { type:'keyUp', key:keyName, code:keyName }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ dialogs:Array.from(document.querySelectorAll('dialog[open]')).map(d=>d.id), container:window.__nethackPromptTest?.container?.(), inventory:window.__nethackPromptTest?.inventory?.(), sent:window.__nethackPromptTest?.sentInputs?.().join('')||'', messages:window.__nethackPromptTest?.messages?.().slice(-20).map(m=>m.text||String(m))||[], running:window.__nethackAutomation?.state?.().runningState?.running||false, transferTransactions:window.__nethackPromptTest?.transferTransactions?.(), groundSnapshots:window.__nethackPromptTest?.groundSnapshots?.(), body:document.body.innerText }))()`); }
async function saveState(cdp, name) { const s = await state(cdp); fs.writeFileSync(path.join(outDir, name), JSON.stringify(s, null, 2)); return s; }
async function cursorState(cdp) { return evalExpr(cdp, `(() => { const cursor=window.NetHackUxRuntime?.runtime?.latestPublicState?.()?.snapshot?.game?.cursor||{}; return {x:Number(cursor.x),y:Number(cursor.y)}; })()`); }
async function start(cdp) {
  await evalExpr(cdp, `window.__nethackAutomation.startReplay({ playerSpec: '-uDirect-Val-Hum-Fem-Law', nethackOptions: '!tutorial,!autopickup' })`);
  await waitFor(async () => { const s = await state(cdp); const seen = await evalExpr(cdp, `document.getElementById('shim-output')?.dataset?.seen || ''`); return s.running && /shim_print_glyph|shim_status_update|shim_putstr/.test(seen) ? s : null; }, 25000);
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus(); window.__nethackPromptTest.clearSentInputs(); })()`);
}
async function main() {
  const page = await Harness.createElectronBrowserDriver({
    root, width, height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: 'ground/unidentified-appearance-pile-on-hero' },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  let scenarioError = null;
  try {
    await start(cdp);
    fs.writeFileSync(path.join(outDir, 'debug-after-start.json'), JSON.stringify(await state(cdp), null, 2));
    await waitFor(async () => { const s = await state(cdp); return s.groundSnapshots?.piles?.some((pile) => pile.items.some((item) => Number.isInteger(item.objectId))) && s.inventory?.items?.some((row) => Number.isInteger(row.objectId)) ? s : null; }, 15000);
    const contextShot = await shot(cdp, '01-real-ground-context-before-classic.png');
    await evalExpr(cdp, `(() => { window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid')?.focus(); })()`);
    // Classic comma opens a real NetHack pickup menu; the Transfer Session
    // dispatches the selected row through that menu's exact request owner.
    await key(cdp, ',', 'Comma');
    const panelState = await waitFor(async () => { const s = await state(cdp); return s.container?.active && /Ground items/i.test(s.container.text) && s.container?.menu?.awaitingSelection ? s : null; }, 10000);
    const panelShot = await shot(cdp, '02-real-ground-comma-menu-panel-open.png');
    const panelUi = await evalExpr(cdp, `(() => ({ takeAll:document.querySelector('[data-take-all-ground]')?.textContent||'', selectedAction:{text:document.querySelector('[data-transfer-selected]')?.innerText||'',disabled:Boolean(document.querySelector('[data-transfer-selected]')?.disabled)}, rows:Array.from(document.querySelectorAll('#container-transfer-panel [data-container-pane="left"] .container-item-row')).map((row)=>({ shortcut:row.dataset.shortcut, checked:row.getAttribute('aria-checked'), text:row.innerText, tileId:row.querySelector('.menu-tile')?.dataset.tileId||'', badges:Array.from(row.querySelectorAll('.item-badge')).map((badge)=>badge.textContent.trim()) })) }))()`);
    assert('comma-backed panel exposes the real pickup owner before first drag', panelState.sent === ',' && /^Pick up what\?$/i.test(panelState.container?.menu?.prompt || ''), JSON.stringify({ sent: panelState.sent, menu: panelState.container?.menu }));
    const panelBounds = await evalExpr(cdp, `(() => { const rect=document.getElementById('container-transfer-panel')?.getBoundingClientRect(); return rect ? { left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom, viewportWidth:innerWidth, viewportHeight:innerHeight } : null; })()`);
    assert('ground transfer panel remains fully inside the viewport', panelBounds && panelBounds.left >= 0 && panelBounds.top >= 0 && panelBounds.right <= panelBounds.viewportWidth && panelBounds.bottom <= panelBounds.viewportHeight, JSON.stringify(panelBounds));
    assert('ground rows show inventory-grade art, class labels, letter checkboxes, Pick up all, and a disabled selected-item action', /^Pick up all \(\d+\)$/.test(panelUi.takeAll) && panelUi.selectedAction.disabled && /Take selected\s*Enter/i.test(panelUi.selectedAction.text) && panelUi.rows.length >= 2 && panelUi.rows.every((row, index) => row.shortcut === String.fromCharCode(97 + index) && row.checked === 'false' && row.tileId && row.badges.length), JSON.stringify(panelUi));
    await click(cdp, '#container-transfer-panel .container-transfer-heading button');
    const closedState = await waitFor(async () => { const s=await state(cdp); return !s.container?.active && !s.container?.menu?.awaitingSelection ? s : null; }, 10000);
    const closedShot = await shot(cdp, '03-real-ground-panel-closed.png');
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs()`);
    const beforeMove = await cursorState(cdp);
    let movedCursor = null;
    let reverseKey = '';
    for (const [moveKey, oppositeKey] of [['ArrowRight','ArrowLeft'], ['ArrowLeft','ArrowRight'], ['ArrowDown','ArrowUp'], ['ArrowUp','ArrowDown']]) {
      await pressArrow(cdp, moveKey);
      movedCursor = await waitFor(async () => { const cursor=await cursorState(cdp); return (cursor.x !== beforeMove.x || cursor.y !== beforeMove.y) ? cursor : null; }, 1500).catch(() => null);
      if (movedCursor) { reverseKey = oppositeKey; break; }
    }
    if (movedCursor) {
      await pressArrow(cdp, reverseKey);
      await waitFor(async () => { const cursor=await cursorState(cdp); return cursor.x === beforeMove.x && cursor.y === beforeMove.y ? cursor : null; }, 10000);
    }
    assert('closing the ground chooser releases NetHack input without a false failure notice so movement works immediately', !closedState.container?.active && movedCursor && (movedCursor.x !== beforeMove.x || movedCursor.y !== beforeMove.y) && !/NetHack did not accept that action/i.test(closedState.body), JSON.stringify({ beforeMove, movedCursor, closed:closedState.container, body:closedState.body.slice(0, 500) }));
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs()`);
    await key(cdp, ',', 'Comma');
    await waitFor(async () => { const s=await state(cdp); return s.container?.active && s.container?.menu?.awaitingSelection ? s : null; }, 10000);

    await key(cdp, 'a', 'KeyA');
    await waitFor(async () => (await evalExpr(cdp, `document.querySelector('#container-transfer-panel [data-container-pane="left"] .container-item-row')?.getAttribute('aria-checked')`)) === 'true', 5000);
    const selectedAction = await evalExpr(cdp, `(() => ({text:document.querySelector('[data-transfer-selected]')?.innerText||'',disabled:Boolean(document.querySelector('[data-transfer-selected]')?.disabled),count:document.querySelector('.container-transfer-selected-count')?.textContent||'',rowText:document.querySelector('#container-transfer-panel [data-container-pane="left"] .container-item-row')?.innerText||''}))()`);
    assert('letter selection exposes an enabled visible Take selected completion action and non-color-only row state', !selectedAction.disabled && /Take 1 selected\s*Enter/i.test(selectedAction.text) && selectedAction.count === '1 selected' && /Selected/i.test(selectedAction.rowText), JSON.stringify(selectedAction));
    const selectedShot = await shot(cdp, '04-real-ground-letter-selected.png');
    await key(cdp, 'Enter', 'Enter');
    const pickupState = await waitFor(async () => { const s = await state(cdp); return s.transferTransactions?.transfers?.some((tx) => tx.direction === 'ground-to-inventory' && tx.status === 'success') ? s : null; }, 12000);
    if (process.env.NH_FINAL_PROOF_PICKUP_ONLY === '1') {
      await delay(350);
      const settledPickupState = await state(cdp);
      const pickupShot = await shot(cdp, '05-real-after-classic-ground-to-inventory.png');
      fs.writeFileSync(path.join(outDir, '04-final-state.json'), JSON.stringify(settledPickupState, null, 2));
      assert('classic pickup dispatches exactly its owned selector and completes successfully', /^,[A-Za-z]\n$/.test(settledPickupState.sent || '') && settledPickupState.transferTransactions?.transfers?.some((tx) => tx.direction === 'ground-to-inventory' && tx.status === 'success'), JSON.stringify({ sent: settledPickupState.sent, transfers: settledPickupState.transferTransactions }));
      assert('classic pickup settles without rejection, stale prompt, or fallback copy', !settledPickupState.transferTransactions?.lastRejected && !/Pick up what\?|Direct ground transfer rejected|NetHack did not accept that action|another prompt, menu, or transfer|direct command is blocked|Inventory selector/i.test(settledPickupState.body || ''), (settledPickupState.body || '').slice(0, 1200));
      const summary = [`# Focused real ground classic Transfer Session proof`, '', `Scenario: ground/unidentified-appearance-pile-on-hero`, `Before: ${contextShot}`, `Comma-backed panel: ${panelShot}`, `Letter-selected row: ${selectedShot}`, `After classic ground-to-inventory transfer: ${pickupShot}`, `Final state: ${path.join(outDir, '04-final-state.json')}`, '', 'The visible letter shortcut selected one public ground row and one Enter dispatched only the selector owned by the active Pick up what? menu. The authoritative transaction completed without a rejected transaction or player-facing rejection notice.', '', `Pickup transfers: ${JSON.stringify(settledPickupState.transferTransactions?.transfers?.filter((tx) => tx.direction === 'ground-to-inventory'), null, 2)}`, ''].join('\n');
      fs.writeFileSync(path.join(outDir, 'real-ground-pickup-transfer-panel-summary.md'), summary);
      console.log(summary);
    } else {
    await dragMatch(cdp, 'right', '.+', 'left');
    const dropState = await waitFor(async () => { const s = await state(cdp); return s.transferTransactions?.transfers?.some((tx) => tx.direction === 'inventory-to-ground' && tx.status === 'success') ? s : null; }, 12000);
    await evalExpr(cdp, `(async () => {
      document.activeElement?.blur?.(); window.scrollTo(0, 0);
      const previousDisplay = document.body.style.display;
      document.body.style.display = 'none'; void document.body.offsetHeight;
      await new Promise(requestAnimationFrame);
      document.body.style.display = previousDisplay; void document.body.offsetHeight;
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    })()`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1359, height: 920, deviceScaleFactor: 1, mobile: false });
    await delay(100);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.bringToFront');
    await delay(300);
    const dropShot = await shot(cdp, '05-real-after-classic-inventory-to-ground.png');
    fs.writeFileSync(path.join(outDir, '04-final-state.json'), JSON.stringify(dropState, null, 2));
    assert('pickup and drop dispatch only the selectors correlated to their exact classic prompt owners', /^,[A-Za-z]\nd[A-Za-z]$/.test(dropState.sent || '') && !(dropState.sent || '').includes('\u001b'), JSON.stringify(dropState.sent));
    assert('panel remains player-facing without false ownership or command rejection errors', !/Pick up what\?|What do you want to drop\?|Direct ground transfer rejected|NetHack did not accept that action|another prompt, menu, or transfer|direct command is blocked|Inventory selector/i.test(dropState.body), dropState.body.slice(0, 1200));
    assert('successful classic ground transfers never publish a rejected transaction', !dropState.transferTransactions?.lastRejected, JSON.stringify(dropState.transferTransactions?.lastRejected));
    const summary = [`# Real ground classic Transfer Session MCP validation`, '', 'Scenario assertions recorded', '', 'Scenario: ground/unidentified-appearance-pile-on-hero', '', `Before: ${contextShot}`, `Comma-backed panel: ${panelShot}`, `Letter-selected row: ${selectedShot}`, `After classic pickup and drop: ${dropShot}`, `Final state: ${path.join(outDir, '04-final-state.json')}`, '', 'Ownership proof: the letter shortcut selected a public ground row and Enter dispatched only the selector correlated to the active Pick up what? menu. The follow-up inventory-to-ground move opened the native drop prompt and dispatched only its remapped current selector, with no Esc release or direct-command handoff.', '', `Pickup transfers: ${JSON.stringify(pickupState.transferTransactions?.transfers?.filter((tx)=>tx.direction==='ground-to-inventory'), null, 2)}`, `Drop transfers: ${JSON.stringify(dropState.transferTransactions?.transfers?.filter((tx)=>tx.direction==='inventory-to-ground'), null, 2)}`, ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-ground-pickup-transfer-panel-summary.md'), summary);
    console.log(summary);
    }
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
  console.log(`real-ground-pickup-transfer-panel-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}
const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
