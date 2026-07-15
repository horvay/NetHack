const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = Number(process.env.NH_ELECTRON_WINDOW_WIDTH || 1360);
const height = Number(process.env.NH_ELECTRON_WINDOW_HEIGHT || 920);
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
  console.log(`real-escape-popup-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await delay(120); }
async function key(cdp, key, text = '') { const special = { Escape: ['Escape', 27], Enter: ['Enter', 13] }; const [codeName, code] = special[key] || [`Key${key.toUpperCase()}`, key.toUpperCase().charCodeAt(0)]; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: codeName, text, unmodifiedText: text, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: codeName, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code }); await delay(160); }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map(d => d.id),
  interaction: window.__nethackPromptTest?.dialog?.() || {},
  prompt: window.__nethackPromptTest?.prompt?.() || null,
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  messages: window.__nethackPromptTest?.messages?.().slice(-8).map((m) => m.text || String(m)) || [],
  body: document.body.innerText,
  status: document.getElementById('status')?.textContent || '',
}))()`); }
async function startRealGame(cdp) {
  const initial = await state(cdp);
  if (initial.dialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game');
  else await click(cdp, '#start-shim');
  await waitFor(async () => (await state(cdp)).dialogs.includes('character-dialog'), 5000);
  await evalExpr(cdp, `(() => { const input = document.getElementById('player-name'); if (input) input.value = 'EscapeAudit'; })()`);
  await click(cdp, '#confirm-character');
  await waitFor(async () => (await state(cdp)).running, 20000);
  await evalExpr(cdp, `document.getElementById('game-grid')?.focus(); window.__nethackPromptTest?.clearSentInputs?.();`);
  return state(cdp);
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  const page = await Harness.createElectronBrowserDriver({ root, width, height, env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: 'ground/unidentified-appearance-pile-on-hero' } });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  const results = { outDir, screenshots: {}, checks: {} };
  let scenarioError = null;
  try {
    results.started = await startRealGame(cdp);
    if (results.started.dialogs.includes('intro-dialog')) {
      results.screenshots.introBeforeEsc = await shot(cdp, '00-real-intro-before-escape.png');
      if (results.started.dialogs.includes('document-dialog')) {
        await key(cdp, 'Escape');
        results.documentOverIntroAfter = await waitFor(async () => { const s = await state(cdp); return !s.dialogs.includes('document-dialog') && s.dialogs.includes('intro-dialog') ? s : null; }, 5000);
        results.screenshots.introAfterTopDocumentEsc = await shot(cdp, '00b-real-intro-after-top-document-escape.png');
      }
      await key(cdp, 'Escape');
      results.introAfter = await waitFor(async () => { const s = await state(cdp); return !s.dialogs.includes('intro-dialog') ? s : null; }, 5000);
    }
    await evalExpr(cdp, `document.getElementById('game-grid')?.focus(); window.__nethackPromptTest?.clearSentInputs?.();`);
    results.screenshots.started = await shot(cdp, '01-real-game-started.png');

    // Real NetHack direction prompt: Open asks for a direction. Escape must be
    // the second and only second input, then plain map Escape must also forward
    // exactly once when no UI layer is open.
    await evalExpr(cdp, `window.__nethackPromptTest?.clearSentInputs?.(); document.getElementById('game-grid')?.focus();`);
    await key(cdp, 'o', 'o');
    const directionOpen = await waitFor(async () => { const s = await state(cdp); return /direction/i.test(s.prompt?.query || '') ? s : null; }, 7000);
    results.screenshots.directionBeforeEsc = await shot(cdp, '01a-real-direction-prompt-before-escape.png');
    await key(cdp, 'Escape');
    const directionAfter = await waitFor(async () => { const s = await state(cdp); return !/direction/i.test(s.prompt?.query || '') ? s : null; }, 7000);
    results.screenshots.directionAfterEsc = await shot(cdp, '01b-real-direction-prompt-after-escape.png');
    await evalExpr(cdp, `window.__nethackPromptTest?.clearSentInputs?.(); document.getElementById('game-grid')?.focus();`);
    await key(cdp, 'Escape');
    const noOverlayEscapeAfter = await state(cdp);
    await evalExpr(cdp, `window.__nethackPromptTest?.clearSentInputs?.();`);

    await key(cdp, 'i', 'i');
    const inventoryOpen = await waitFor(async () => { const s = await state(cdp); return s.dialogs.includes('interaction-dialog') && /Equipment|Inventory/i.test(s.interaction.title || '') ? s : null; }, 7000);
    results.screenshots.inventoryBeforeEsc = await shot(cdp, '02-real-inventory-before-escape.png');
    await evalExpr(cdp, `(() => { const row = document.querySelector('#interaction-options .choice-button'); const rect = row?.getBoundingClientRect?.(); row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles:true, cancelable:true, clientX:(rect?.left || 40) + 20, clientY:(rect?.top || 40) + 20 })); })()`);
    const realContextOpen = await waitFor(async () => { const open = await evalExpr(cdp, `Boolean(document.querySelector('.inventory-context-menu'))`); return open ? await state(cdp) : null; }, 5000);
    if (realContextOpen) {
      results.screenshots.inventoryContextBeforeEsc = await shot(cdp, '02b-real-inventory-context-before-escape.png');
      await key(cdp, 'Escape');
      results.realContextAfter = await waitFor(async () => { const open = await evalExpr(cdp, `Boolean(document.querySelector('.inventory-context-menu'))`); return !open ? await state(cdp) : null; }, 5000);
      results.screenshots.inventoryContextAfterEsc = await shot(cdp, '02c-real-inventory-context-after-escape.png');
    }
    await key(cdp, 'Escape');
    const inventoryAfter = await waitFor(async () => { const s = await state(cdp); return !s.dialogs.includes('interaction-dialog') ? s : null; }, 7000);
    results.screenshots.inventoryAfterEsc = await shot(cdp, '03-real-inventory-after-escape.png');
    await evalExpr(cdp, `window.__nethackPromptTest?.clearSentInputs?.();`);
    await key(cdp, '.', '.');
    const afterWait = await state(cdp);

    // Real fixture path for the Boss report: open Pick up from ground from the
    // visible context action, focus a row, and press Escape. The panel should
    // invoke Done locally and must not add an Escape/game command.
    await waitFor(async () => {
      const ready = await evalExpr(cdp, `Boolean(document.querySelector('[data-context-action-id="pickup"]')) && Boolean(window.__nethackPromptTest?.groundSnapshots?.().piles?.some((pile) => pile.items.length))`);
      return ready ? state(cdp) : null;
    }, 10000);
    await click(cdp, '[data-context-action-id="pickup"]');
    const realGroundOpen = await waitFor(async () => {
      const open = await evalExpr(cdp, `!document.getElementById('container-transfer-panel')?.hidden && /Pick up from ground/i.test(document.getElementById('container-transfer-panel')?.innerText || '')`);
      return open ? state(cdp) : null;
    }, 7000);
    const realGroundPanelText = await evalExpr(cdp, `document.getElementById('container-transfer-panel')?.innerText || ''`);
    const realGroundDragSetup = await evalExpr(cdp, `(() => { window.__nethackPromptTest?.clearSentInputs?.(); const row = document.querySelector('#container-transfer-panel .container-item-row'); const pane = document.querySelector('#container-transfer-panel .container-pane.right-pane'); row?.focus(); const transfer = new DataTransfer(); row?.dispatchEvent(new DragEvent('dragstart', { bubbles:true, cancelable:true, dataTransfer:transfer })); pane?.dispatchEvent(new DragEvent('dragover', { bubbles:true, cancelable:true, dataTransfer:transfer })); return { dragging:row?.classList.contains('dragging'), dragOver:pane?.classList.contains('drag-over'), payload:transfer.getData('application/x-nethack-container-transfer') }; })()`);
    results.screenshots.groundBeforeEsc = await shot(cdp, '03a-real-ground-transfer-before-escape.png');
    await key(cdp, 'Escape');
    const realGroundAfter = await waitFor(async () => {
      const hidden = await evalExpr(cdp, `document.getElementById('container-transfer-panel')?.hidden`);
      return hidden ? state(cdp) : null;
    }, 7000);
    results.screenshots.groundAfterEsc = await shot(cdp, '03aa-real-ground-transfer-after-escape.png');
    const groundDragStateAfter = await evalExpr(cdp, `Boolean(document.querySelector('.dragging, .drag-over'))`);

    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.event({name:'shim_create_nhwindow', return:920, windowType:4}); t.event({name:'shim_putstr', window:920, text:'NetHack help/file window'}); t.event({name:'shim_putstr', window:920, text:'Commands: i inventory, ? help, Esc cancels menus.'}); t.event({name:'shim_display_nhwindow', window:920, blocking:1}); document.getElementById('document-filter')?.focus(); })()`);
    const helpOpen = await waitFor(async () => { const s = await state(cdp); return s.dialogs.includes('interaction-dialog') || s.dialogs.includes('document-dialog') ? s : null; }, 7000);
    results.screenshots.helpBeforeEsc = await shot(cdp, '03b-real-document-help-before-escape.png');
    await key(cdp, 'Escape');
    const helpAfter = await waitFor(async () => { const s = await state(cdp); return !s.dialogs.includes('interaction-dialog') && !s.dialogs.includes('document-dialog') ? s : null; }, 7000);
    results.screenshots.helpAfterEsc = await shot(cdp, '03c-real-document-help-after-escape.png');

    await evalExpr(cdp, `(() => { const t = window.__nethackPromptTest; t.setContainerStateForTest({ active:true, sessionKind:'container', phase:'action', prompt:'Do what with the large box?', actionMenu:{ prompt:'Do what with the large box?', items:[{selector:111, text:'take something out'}], awaitingSelection:true, how:1 }, leftItems:[{selector:97, text:'a - an uncursed food ration', semanticKind:'object'}], rightItems:[{selector:98, text:'b - a scroll of identify', semanticKind:'object'}], loadedSides:{left:true,right:true}, loadingSides:{left:false,right:false}, feedback:'Both panes loaded. Drag items between container and inventory.' }); t.clearSentInputs(); document.getElementById('game-grid')?.focus(); })()`);
    const containerOpen = await waitFor(async () => { const visible = await evalExpr(cdp, `!document.getElementById('container-transfer-panel')?.hidden`); return visible ? await state(cdp) : null; }, 5000);
    results.screenshots.containerBeforeEsc = await shot(cdp, '03d-real-container-transfer-before-escape.png');
    await key(cdp, 'Escape');
    const containerAfter = await waitFor(async () => { const hidden = await evalExpr(cdp, `document.getElementById('container-transfer-panel')?.hidden`); return hidden ? await state(cdp) : null; }, 5000);
    results.screenshots.containerAfterEsc = await shot(cdp, '03e-real-container-transfer-after-escape.png');

    await click(cdp, '#open-actions');
    results.screenshots.actionsBeforeEsc = await shot(cdp, '04-real-actions-before-escape.png');
    await key(cdp, 'Escape');
    const actionsAfter = await waitFor(async () => { const s = await state(cdp); return !s.dialogs.includes('action-dialog') ? s : null; }, 5000);
    results.screenshots.actionsAfterEsc = await shot(cdp, '05-real-actions-after-escape.png');

    await evalExpr(cdp, `window.__nethackPromptTest?.clearSentInputs?.(); window.__nethackPromptTest?.event?.({name:'shim_putstr', window:1, text:'You die...'});`);
    const gameOverOpen = await waitFor(async () => { const s = await state(cdp); return s.dialogs.includes('game-over-dialog') ? s : null; }, 5000);
    results.screenshots.gameOverBeforeEsc = await shot(cdp, '08-real-game-over-before-escape.png');
    await key(cdp, 'Escape');
    const gameOverAfter = await state(cdp);
    results.screenshots.gameOverAfterEsc = await shot(cdp, '09-real-game-over-after-escape.png');

    results.checks = {
      realGameStarted: Boolean(results.started.running),
      realNestedDocumentEscClosedTopmostOnly: results.started.dialogs.includes('document-dialog') ? Boolean(results.documentOverIntroAfter && results.documentOverIntroAfter.dialogs.includes('intro-dialog')) : true,
      realIntroEscClosed: results.started.dialogs.includes('intro-dialog') ? Boolean(results.introAfter && !results.introAfter.dialogs.includes('intro-dialog')) : true,
      realDirectionPromptOpenedFromGameplayKey: /direction/i.test(directionOpen.prompt?.query || ''),
      realDirectionEscapeReachedGameExactlyOnce: directionAfter.sent === `o\u001b`,
      realNoOverlayEscapeReachedGameExactlyOnce: noOverlayEscapeAfter.sent === '\u001b',
      realInventoryOpenedFromKeyboard: /Equipment|Inventory/i.test(inventoryOpen.interaction.title || ''),
      realInventoryContextEscClosedOnlyMenu: realContextOpen ? Boolean(results.realContextAfter && results.realContextAfter.dialogs.includes('interaction-dialog')) : true,
      realInventoryEscClosed: !inventoryAfter.dialogs.includes('interaction-dialog'),
      realInventoryEscapeHasNoFailureNotice: !/NetHack did not accept that action|Review the current state and try again/i.test(inventoryAfter.body || ''),
      gameplayResponsiveAfterInventoryEsc: afterWait.running && afterWait.sent.includes('.') && !afterWait.dialogs.includes('game-over-dialog'),
      realGroundTransferOpenedFromVisibleAction: Boolean(realGroundOpen && /Pick up from ground/i.test(realGroundOpen.body || '')),
      realGroundTransferRowsExcludePromptProse: !/\bIn what direction\b|\bNever mind\b/i.test(realGroundPanelText),
      realGroundTransferEscClosed: !realGroundAfter.dialogs.includes('interaction-dialog') && !/Pick up from ground/i.test(realGroundAfter.body || ''),
      realGroundTransferEscDidNotReachGame: realGroundAfter.sent === '',
      realGroundTransferDragActivated: Boolean(realGroundDragSetup?.dragging && realGroundDragSetup?.dragOver && realGroundDragSetup?.payload),
      realGroundTransferDragStateCleared: !groundDragStateAfter,
      realHelpEscClosed: !helpAfter.dialogs.includes('interaction-dialog') && !helpAfter.dialogs.includes('document-dialog'),
      realContainerEscClosed: containerOpen && containerAfter.sent.includes('\u001b'),
      realActionDialogEscClosed: !actionsAfter.dialogs.includes('action-dialog'),
      realGameOverStaysOpenOnEsc: gameOverOpen.dialogs.includes('game-over-dialog') && gameOverAfter.dialogs.includes('game-over-dialog'),
      realGameOverEscapeDidNotReachGame: gameOverAfter.sent === '',
      realGameOverEscapeReasonVisible: /Escape keeps the final chronicle open/i.test(gameOverAfter.body || ''),
    };
    fs.writeFileSync(path.join(outDir, 'real-escape-popup-mcp-summary.json'), JSON.stringify(results, null, 2));
    const md = ['# Real Escape popup MCP/CDP regression', '', `Output: ${outDir}`, '', '## Checks', ...Object.entries(results.checks).map(([k, v]) => `- ${v ? 'passed' : 'failed'} ${k}`), '', '## Screenshots', ...Object.entries(results.screenshots).map(([k, v]) => `- ${k}: ${v}`), ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-escape-popup-mcp-summary.md'), md);
    console.log(md);
    const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([k]) => k);
    if (failed.length) throw new Error(`Real Escape popup MCP failed: ${failed.join(', ')}`);
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
  console.log(`real-escape-popup-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}
const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
