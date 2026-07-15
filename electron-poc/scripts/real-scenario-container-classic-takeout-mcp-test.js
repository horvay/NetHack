const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
const scenarioId = process.env.NH_CLASSIC_TAKEOUT_SCENARIO_ID || 'container/wand-and-dwarf-corpse-chest-on-hero';
async function shot(cdp, name) { const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'actual-player', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 }); return capture.raw.path; }
function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-scenario-container-classic-takeout-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function drag(cdp, fromExpression, toSelector) {
  const points = await evalExpr(cdp, `(() => { const from = (${fromExpression}); const to = document.querySelector(${JSON.stringify(toSelector)}); from?.scrollIntoView?.({block:'center', inline:'center'}); to?.scrollIntoView?.({block:'center', inline:'center'}); const a = from?.getBoundingClientRect(); const b = to?.getBoundingClientRect(); return a && b ? { from:{x:a.left+a.width/2,y:a.top+a.height/2}, to:{x:b.left+b.width/2,y:b.top+b.height/2} } : null; })()`);
  if (!points) throw new Error(`missing drag target for ${fromExpression} -> ${toSelector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.from.x, y: points.from.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: points.from.x, y: points.from.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 10; i += 1) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.from.x + ((points.to.x - points.from.x) * i / 10), y: points.from.y + ((points.to.y - points.from.y) * i / 10), button: 'left', buttons: 1 }); await delay(45); }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: points.to.x, y: points.to.y, button: 'left', buttons: 0, clickCount: 1 });
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id), sent: window.__nethackPromptTest?.sentInputs?.().join('') || '', messages: window.__nethackPromptTest?.messages?.().slice(-24).map((m) => m.text || String(m)) || [], container: window.__nethackPromptTest?.container?.(), containerSnapshots: window.__nethackPromptTest?.containerSnapshots?.(), transferTransactions: window.__nethackPromptTest?.transferTransactions?.(), promptPanel: { hidden: document.getElementById('prompt-panel')?.hidden, text: document.getElementById('prompt-panel')?.textContent || '' }, menuPanel: { hidden: document.getElementById('menu-panel')?.hidden, text: document.getElementById('menu-panel')?.textContent || '' }, status: document.getElementById('status')?.textContent || '', interaction: window.__nethackPromptTest?.dialog?.(), running: window.__nethackAutomation?.state?.().runningState?.running || false, body: document.body.innerText, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '' }))()`); }
function extendedCommandModalVisible(s) { const text = `${s?.interaction?.title || ''}\n${s?.interaction?.prompt || ''}\n${s?.promptPanel?.hidden ? '' : s?.promptPanel?.text || ''}\n${s?.menuPanel?.hidden ? '' : s?.menuPanel?.text || ''}`; return Boolean(s?.interaction?.interactionOpen && /Extended command|filter\/type any # command|matching options/i.test(text)); }
async function startNoExtendedCommandModalMonitor(cdp, outDir, label, stepMs = 30) {
  await evalExpr(cdp, `(() => { window.__classicTakeoutNoExtended = window.__classicTakeoutNoExtended || {}; const label = ${JSON.stringify(label)}; const startedAt = performance.now(); const records = []; const collect = (trigger) => { const interaction = document.getElementById('interaction-dialog'); const title = document.getElementById('interaction-title')?.textContent || ''; const prompt = document.getElementById('interaction-prompt')?.textContent || ''; const promptPanel = document.getElementById('prompt-panel'); const menuPanel = document.getElementById('menu-panel'); const text = [title, prompt, promptPanel?.hidden ? '' : promptPanel?.textContent || '', menuPanel?.hidden ? '' : menuPanel?.textContent || ''].join('\\n'); const hit = Boolean(interaction?.open && /Extended command|filter\\/type any # command|matching options/i.test(text)); records.push({ atMs: Math.round(performance.now() - startedAt), trigger, hit, interactionOpen: Boolean(interaction?.open), title, prompt, promptPanelHidden: Boolean(promptPanel?.hidden), promptPanelText: promptPanel?.textContent || '', menuPanelHidden: Boolean(menuPanel?.hidden), menuPanelText: menuPanel?.textContent || '', status: document.getElementById('status')?.textContent || '' }); }; collect('install-before-drag'); const observer = new MutationObserver(() => collect('mutation')); observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['open', 'hidden', 'class', 'style'] }); let raf = 0; const tick = () => { collect('animation-frame'); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); window.__classicTakeoutNoExtended[label] = { stop: () => { cancelAnimationFrame(raf); observer.disconnect(); collect('stop'); return records.slice(); } }; })()`);
  const cdpSamples = [];
  const start = Date.now();
  let stopped = false;
  const worker = (async () => { while (!stopped) { const s = await state(cdp).catch((error) => ({ error: String(error?.message || error) })); cdpSamples.push({ atMs: Date.now() - start, trigger: 'cdp-poll', interaction: s.interaction, promptPanel: s.promptPanel, menuPanel: s.menuPanel, status: s.status, containerActive: s.container?.active, error: s.error }); await delay(stepMs); } })();
  return { async stop() { stopped = true; await worker; const domSamples = await evalExpr(cdp, `(() => window.__classicTakeoutNoExtended?.[${JSON.stringify(label)}]?.stop?.() || [])()`); const combined = { cdpSamples, domSamples }; fs.writeFileSync(path.join(outDir, `${label}-samples.json`), JSON.stringify(combined, null, 2)); const bad = cdpSamples.find(extendedCommandModalVisible) || domSamples.find((sample) => sample.hit); assert(`${label}: Extended command modal never appears in sampled classic transfer window`, !bad, JSON.stringify(bad)); return combined; } };
}
async function startGame(cdp) {
  await click(cdp, '#start-shim');
  await delay(250);
  if ((await state(cdp)).dialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game');
  await evalExpr(cdp, `(() => { const input = document.getElementById('player-name'); if (input) { input.value = 'Classic'; input.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
  await waitFor(() => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 7000);
  await click(cdp, '#confirm-character');
  await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return s.running ? s : null; }, 20000);
  if ((await state(cdp)).dialogs.includes('intro-dialog')) await click(cdp, '#intro-continue');
  await waitFor(async () => !(await state(cdp)).dialogs.includes('intro-dialog'), 5000);
}
async function main() {
  const page = await Harness.createElectronBrowserDriver({
    root, width, height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none' },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  let scenarioError = null;
  try {
    await startGame(cdp);
    const loaded = await waitFor(async () => { const s = await state(cdp); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
    await waitFor(async () => (await state(cdp)).container?.active || (await state(cdp)).body.includes('Open chest') ? true : null, 10000);
    const contextShot = await shot(cdp, '01-context-open-chest.png');
    await evalExpr(cdp, `(async () => { const t = window.__nethackPromptTest; const chest = t.groundSnapshots().piles.flatMap((pile) => pile.items).find((item) => /chest/i.test(item.displayName || item.semanticName || '')); if (!chest) throw new Error('missing public chest target'); return t.sendSemanticActionForTest('#loot\\n', { id: 'ground.openContainer', label: 'Open chest' }, { actionId: 'ground.openContainer' }, { source: 'ground-context', target: { ...chest, location: { kind: 'ground' } }, payload: { promptPolicy: 'netHack-owned-followup' } }); })()`);
    const panel = await waitFor(async () => { const s = await state(cdp); const text = s.container?.text || ''; return s.container?.active && /dwarf corpse/i.test(text) && /wand of digging|wand/i.test(text) && /tin opener/i.test(text) ? s : null; }, 15000);
    fs.writeFileSync(path.join(outDir, '02-container-panel-state.json'), JSON.stringify(panel, null, 2));
    const panelShot = await shot(cdp, '02-container-panel-before-classic-drag.png');
    const corpseRow = panel.container.left.find((row) => /corpse/i.test(row.text));
    const wandRow = panel.container.left.find((row) => /wand/i.test(row.text));
    const corpseMenuSelector = panel.container.menu.items.find((row) => row.selector && /corpse/i.test(row.text))?.selector;
    const wandMenuSelector = panel.container.menu.items.find((row) => row.selector && /wand/i.test(row.text))?.selector;
    assert('scenario left pane has distinct corpse and wand rows', corpseRow && wandRow && corpseRow.selector !== wandRow.selector, JSON.stringify(panel.container.left));
    assert('active native take-out menu exposes distinct exact selectors', corpseMenuSelector && wandMenuSelector && corpseMenuSelector !== wandMenuSelector, JSON.stringify(panel.container.menu));
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs()`);
    const monitor = await startNoExtendedCommandModalMonitor(cdp, outDir, '03-classic-takeout-no-extended-modal');
    await drag(cdp, `Array.from(document.querySelectorAll('#container-transfer-panel [data-container-pane="left"] .container-item-row')).find((row) => /wand/i.test(row.innerText))`, '#container-transfer-panel [data-container-pane="right"]');
    const after = await waitFor(async () => {
      const s = await state(cdp);
      const leftText = (s.container?.left || []).map((row) => row.text).join('\n');
      const rightText = (s.container?.right || []).map((row) => row.text).join('\n');
      return s.container?.active && /corpse/i.test(leftText) && !/wand/i.test(leftText) && /wand/i.test(rightText) ? s : null;
    }, 15000);
    const samples = await monitor.stop();
    fs.writeFileSync(path.join(outDir, '03-after-classic-takeout-state.json'), JSON.stringify(after, null, 2));
    const afterShot = await shot(cdp, '03-after-classic-takeout-wand-only.png');
    assert('classic Transfer Session dispatches only the active menu selector for the dragged wand', after.sent === `${wandMenuSelector}\n` && after.sent !== `${corpseMenuSelector}\n`, JSON.stringify({ sent: after.sent, corpseMenuSelector, wandMenuSelector }));
    assert('dwarf corpse remains in container and only wand moves to inventory', after.container.left.some((row) => /corpse/i.test(row.text)) && !after.container.left.some((row) => /wand/i.test(row.text)) && after.container.right.some((row) => /wand/i.test(row.text)), JSON.stringify(after.container));
    assert('no prompt asks to take the corpse or complains about corpse weight', !/take.*corpse|corpse.*too heavy|too heavy.*corpse|also take/i.test(`${after.messages.join('\n')}\n${after.body}\n${after.shim}`), `${after.messages.join('\n')}\n${after.body}`.slice(-2000));
    assert('no Extended command modal visible after classic take-out', !extendedCommandModalVisible(after), JSON.stringify(after.interaction));
    await click(cdp, '#container-transfer-panel .container-transfer-heading button');
    await waitFor(async () => !(await state(cdp)).container?.active, 5000);
    const beforeReopen = await state(cdp);
    const beforeReopenShimLength = (beforeReopen.shim || '').length;
    await evalExpr(cdp, `(async () => { const t = window.__nethackPromptTest; const chest = t.groundSnapshots().piles.flatMap((pile) => pile.items).find((item) => /chest/i.test(item.displayName || item.semanticName || '')); if (!chest) throw new Error('missing public chest target'); return t.sendSemanticActionForTest('#loot\\n', { id: 'ground.openContainer', label: 'Open chest' }, { actionId: 'ground.openContainer' }, { source: 'ground-context', target: { ...chest, location: { kind: 'ground' } }, payload: { promptPolicy: 'netHack-owned-followup' } }); })()`);
    const reopened = await waitFor(async () => {
      const s = await state(cdp);
      const leftText = (s.container?.left || []).map((row) => row.text).join('\n');
      const newShim = (s.shim || '').slice(beforeReopenShimLength);
      const takeOutBlocks = newShim.split(/\"name\":\"shim_start_menu\"/).filter((block) => /Take out what\?/.test(block));
      const latestTakeOutBlock = takeOutBlocks[takeOutBlocks.length - 1] || '';
      const coreMenuCorpseOnly = /corpse/i.test(latestTakeOutBlock) && !/wand of digging/i.test(latestTakeOutBlock);
      return s.container?.active && /corpse/i.test(leftText) && !/wand/i.test(leftText) && coreMenuCorpseOnly ? { ...s, newShimAfterReopen: newShim, reopenedTakeOutBlock: latestTakeOutBlock } : null;
    }, 15000);
    fs.writeFileSync(path.join(outDir, '04-reopened-container-core-state.json'), JSON.stringify(reopened, null, 2));
    const reopenedShot = await shot(cdp, '04-reopened-container-core-corpse-only.png');
    assert('reopened real #loot menu proves core container now contains only the corpse', reopened.container.left.some((row) => /corpse/i.test(row.text)) && !reopened.container.left.some((row) => /wand/i.test(row.text)) && /Take out what\?/.test(reopened.reopenedTakeOutBlock || '') && /corpse/i.test(reopened.reopenedTakeOutBlock || '') && !/wand of digging/i.test(reopened.reopenedTakeOutBlock || ''), JSON.stringify({ left: reopened.container.left, takeOutBlock: reopened.reopenedTakeOutBlock || '' }));
    const summary = [`# Classic container take-out real Electron scenario`, '', 'Scenario assertions recorded', '', `Scenario: ${scenarioId}`, `Context screenshot: ${contextShot}`, `Before classic drag screenshot: ${panelShot}`, `After classic drag screenshot: ${afterShot}`, `Reopened core container screenshot: ${reopenedShot}`, `Initial state: ${path.join(outDir, '02-container-panel-state.json')}`, `After state: ${path.join(outDir, '03-after-classic-takeout-state.json')}`, `Reopened core state: ${path.join(outDir, '04-reopened-container-core-state.json')}`, `No-Extended samples: ${path.join(outDir, '03-classic-takeout-no-extended-modal-samples.json')} (${samples.cdpSamples.length} CDP samples, ${samples.domSamples.length} DOM/frame samples)`, '', `Corpse public selector: ${corpseRow.selector}`, `Wand public selector: ${wandRow.selector}`, `Corpse active-menu selector: ${corpseMenuSelector}`, `Wand active-menu selector: ${wandMenuSelector}`, `Post-open sent input: ${JSON.stringify(after.sent)}`, '', 'Verified:', '- production semantic Open chest action naturally entered the classic #loot route', '- drag began after DOM/RAF/CDP no-Extended-command monitor installation', '- after the classic route opened the native Take out what? menu, the transfer sent only the active wand selector and Enter', '- the active corpse selector was not sent', '- dwarf corpse remains in the container and the wand moves to inventory', '- closing and reopening the real container #loot menu shows only the dwarf corpse in core container state', '- no corpse/too-heavy prompt and no Extended-command modal appeared', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'summary.md'), summary);
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
  console.log(`real-scenario-container-classic-takeout-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}
const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
