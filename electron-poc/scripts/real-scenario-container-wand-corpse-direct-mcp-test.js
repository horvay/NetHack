const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;
const scenarioId = process.env.NH_WAND_CORPSE_DIRECT_SCENARIO_ID || 'container/wand-and-dwarf-corpse-chest-on-hero';
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function shot(cdp, name) {
  const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function key(cdp, value, code = '') {
  const text = value.length === 1 ? value : '';
  const windowsVirtualKeyCode = value === 'Enter' ? 13 : (text ? text.charCodeAt(0) : 0);
  const params = { key: value, code: code || value, text, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}
let assertionOutcomes = null;
function assert(name, ok, detail = '') {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const outcome = { id, status: ok ? 'passed' : 'failed', details: ok ? '' : detail };
  const existing = assertionOutcomes?.find((entry) => entry.id === id);
  if (existing) Object.assign(existing, outcome); else assertionOutcomes?.push(outcome);
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}
async function state(cdp) { return evalExpr(cdp, `(() => ({ dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id), sent: window.__nethackPromptTest?.sentInputs?.().join('') || '', messages: window.__nethackPromptTest?.messages?.().slice(-24).map((m) => m.text || String(m)) || [], container: window.__nethackPromptTest?.container?.(), containerSnapshots: window.__nethackPromptTest?.containerSnapshots?.(), transferTransactions: window.__nethackPromptTest?.transferTransactions?.(), promptPanel: { hidden: document.getElementById('prompt-panel')?.hidden, text: document.getElementById('prompt-panel')?.textContent || '' }, menuPanel: { hidden: document.getElementById('menu-panel')?.hidden, text: document.getElementById('menu-panel')?.textContent || '' }, status: document.getElementById('status')?.textContent || '', interaction: window.__nethackPromptTest?.dialog?.(), running: window.__nethackAutomation?.state?.().runningState?.running || false, body: document.body.innerText, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '' }))()`); }
function extendedCommandModalVisible(s) { const text = `${s?.interaction?.title || ''}\n${s?.interaction?.prompt || ''}\n${s?.promptPanel?.hidden ? '' : s?.promptPanel?.text || ''}\n${s?.menuPanel?.hidden ? '' : s?.menuPanel?.text || ''}`; return Boolean(s?.interaction?.interactionOpen && /Extended command|filter\/type any # command|matching options/i.test(text)); }
async function startNoExtendedCommandModalMonitor(cdp, outDir, label, stepMs = 30) {
  await evalExpr(cdp, `(() => { window.__wandCorpseDirectNoExtended = window.__wandCorpseDirectNoExtended || {}; const label = ${JSON.stringify(label)}; const startedAt = performance.now(); const records = []; const collect = (trigger) => { const interaction = document.getElementById('interaction-dialog'); const title = document.getElementById('interaction-title')?.textContent || ''; const prompt = document.getElementById('interaction-prompt')?.textContent || ''; const promptPanel = document.getElementById('prompt-panel'); const menuPanel = document.getElementById('menu-panel'); const text = [title, prompt, promptPanel?.hidden ? '' : promptPanel?.textContent || '', menuPanel?.hidden ? '' : menuPanel?.textContent || ''].join('\\n'); const hit = Boolean(interaction?.open && /Extended command|filter\\/type any # command|matching options/i.test(text)); records.push({ atMs: Math.round(performance.now() - startedAt), trigger, hit, interactionOpen: Boolean(interaction?.open), title, prompt, promptPanelHidden: Boolean(promptPanel?.hidden), promptPanelText: promptPanel?.textContent || '', menuPanelHidden: Boolean(menuPanel?.hidden), menuPanelText: menuPanel?.textContent || '', status: document.getElementById('status')?.textContent || '' }); }; collect('install-before-drag'); const observer = new MutationObserver(() => collect('mutation')); observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['open', 'hidden', 'class', 'style'] }); let raf = 0; const tick = () => { collect('animation-frame'); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); window.__wandCorpseDirectNoExtended[label] = { stop: () => { cancelAnimationFrame(raf); observer.disconnect(); collect('stop'); return records.slice(); } }; })()`);
  const cdpSamples = [];
  const start = Date.now();
  let stopped = false;
  const worker = (async () => { while (!stopped) { const s = await state(cdp).catch((error) => ({ error: String(error?.message || error) })); cdpSamples.push({ atMs: Date.now() - start, trigger: 'cdp-poll', interaction: s.interaction, promptPanel: s.promptPanel, menuPanel: s.menuPanel, status: s.status, containerActive: s.container?.active, error: s.error }); await delay(stepMs); } })();
  return { async stop() { stopped = true; await worker; const domSamples = await evalExpr(cdp, `(() => window.__wandCorpseDirectNoExtended?.[${JSON.stringify(label)}]?.stop?.() || [])()`); const combined = { cdpSamples, domSamples }; fs.writeFileSync(path.join(outDir, `${label}-samples.json`), JSON.stringify(combined, null, 2)); const bad = cdpSamples.find(extendedCommandModalVisible) || domSamples.find((sample) => sample.hit); assert(`${label}: Extended command modal never appears in sampled direct transfer window`, !bad, JSON.stringify(bad)); return combined; } };
}
async function startGame(cdp) {
  await cdp.startDefaultGame({ timeoutMs: 25000, playerName: 'BatchBProof' });
  await cdp.dismissIntroDialogs();
    await delay(500);
    await cdp.dismissIntroDialogs();
}

function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-scenario-container-wand-corpse-direct-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
function recordJsonSidecars(qc, outDir) {
  for (const name of fs.readdirSync(outDir)) {
    if (!name.endsWith('.json') || name === 'evidence-approval.json') continue;
    const file = path.join(outDir, name);
    if (!fs.statSync(file).isFile()) continue;
    qc.recordLog({ id: `sidecar-${name.replace(/[^a-z0-9._-]+/gi, '-')}`, path: file, classification: 'scenario-state' });
  }
}

async function main() {
  const page = await Harness.createElectronBrowserDriver({
    root, width, height,
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none' },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  const outcomes = [];
  if (typeof assertionOutcomes !== 'undefined') assertionOutcomes = outcomes;
  let scenarioError = null;
  try {
    await startGame(cdp);
    const loaded = await waitFor(async () => { const s = await state(cdp); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
    await waitFor(async () => (await state(cdp)).container?.active || (await state(cdp)).body.includes('Open chest') ? true : null, 10000);
    const contextShot = await shot(cdp, '01-context-open-chest.png');
    await click(cdp, '#context-action-bar button[data-context-action-id="open-container"]');
    const panel = await waitFor(async () => { const s = await state(cdp); const text = s.container?.text || ''; return s.container?.active && /dwarf corpse/i.test(text) && /wand of digging|wand/i.test(text) && /tin opener/i.test(text) ? s : null; }, 15000);
    fs.writeFileSync(path.join(outDir, '02-container-panel-state.json'), JSON.stringify(panel, null, 2));
    const panelShot = await shot(cdp, '02-container-panel-before-select-all.png');
    const corpseRow = panel.container.left.find((row) => /corpse/i.test(row.text));
    const wandRow = panel.container.left.find((row) => /wand/i.test(row.text));
    const activeContainerSnapshot = (panel.containerSnapshots?.snapshots || []).find((snapshot) => snapshot.sessionId === panel.containerSnapshots?.activeSessionId) || (panel.containerSnapshots?.snapshots || []).at(-1) || null;
    const snapshotItemForRow = (row, pattern) => (activeContainerSnapshot?.items || []).find((item) => (item.inventoryLetter && item.inventoryLetter === row?.selector) || pattern.test(`${item.displayName || ''}\n${item.semanticName || ''}`)) || null;
    const corpseObjectId = snapshotItemForRow(corpseRow, /corpse|dwarf/i)?.objectId;
    const wandObjectId = snapshotItemForRow(wandRow, /wand|digging/i)?.objectId;
    assert('scenario left pane has distinct corpse and wand rows with public object ids', corpseRow && wandRow && corpseRow.selector !== wandRow.selector && Number.isInteger(corpseObjectId) && Number.isInteger(wandObjectId), JSON.stringify({ left: panel.container.left, activeContainerSnapshot }));
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs()`);
    const monitor = await startNoExtendedCommandModalMonitor(cdp, outDir, '03-select-all-takeout-no-extended-modal');
    await click(cdp, '#container-transfer-panel [data-select-all-container="true"]');
    const selectedUi = await evalExpr(cdp, `(() => ({
      checked: Array.from(document.querySelectorAll('#container-transfer-panel [data-container-pane="left"] .container-item-row')).map((row) => ({ stableId: row.dataset.stableId, checked: row.getAttribute('aria-checked'), text: row.innerText })),
      selectedCount: document.querySelector('#container-transfer-panel .container-transfer-selected-count')?.textContent || '',
      selectedAction: document.querySelector('#container-transfer-panel [data-transfer-selected="true"]')?.textContent || '',
      selectAllDisabled: Boolean(document.querySelector('#container-transfer-panel [data-select-all-container="true"]')?.disabled),
      sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    }))()`);
    assert('Select all checks both eligible container rows without dispatching', selectedUi.checked.length === 2 && selectedUi.checked.every((row) => row.checked === 'true') && selectedUi.selectedCount === '2 selected' && /Take 2 selected\s*Enter/i.test(selectedUi.selectedAction) && selectedUi.selectAllDisabled && selectedUi.sent === '', JSON.stringify(selectedUi));
    fs.writeFileSync(path.join(outDir, '03-select-all-selected-state.json'), JSON.stringify(selectedUi, null, 2));
    const selectedShot = await shot(cdp, '03-container-select-all-selected.png');
    await evalExpr(cdp, `(() => document.querySelector('#container-transfer-panel [data-container-pane="left"] .container-item-row')?.focus({ preventScroll: true }))()`);
    await key(cdp, 'Enter');
    const after = await waitFor(async () => {
      const s = await state(cdp);
      const leftText = (s.container?.left || []).map((row) => row.text).join('\n');
      const rightText = (s.container?.right || []).map((row) => row.text).join('\n');
      const confirmations = (s.shim || '').match(/shim_container_transfer_confirmed/g) || [];
      return s.container?.active && confirmations.length >= 2 && !/corpse|wand/i.test(leftText) && /corpse/i.test(rightText) && /wand/i.test(rightText) ? s : null;
    }, 15000);
    const samples = await monitor.stop();
    fs.writeFileSync(path.join(outDir, '04-after-select-all-takeout-state.json'), JSON.stringify(after, null, 2));
    const afterShot = await shot(cdp, '04-after-select-all-takeout-both.png');
    const transferredObjectId = (transfer) => Number(transfer.result?.delta?.containerContents?.removed?.[0]?.objectId)
      || Number(String(transfer.selector || '').match(/object-(\d+)$/)?.[1]);
    const successfulTakeouts = (after.transferTransactions?.transfers || []).filter((transfer) => transfer.direction === 'container-to-inventory' && transfer.status === 'success' && [corpseObjectId, wandObjectId].includes(transferredObjectId(transfer)));
    assert('single Enter sends no classic #loot or raw item selectors', after.sent === '', JSON.stringify({ sent: after.sent, corpseSelector: corpseRow.selector, wandSelector: wandRow.selector }));
    assert('shim confirms exactly one direct transfer for each selected public object', successfulTakeouts.length === 2 && new Set(successfulTakeouts.map(transferredObjectId)).size === 2 && successfulTakeouts.some((transfer) => transferredObjectId(transfer) === corpseObjectId) && successfulTakeouts.some((transfer) => transferredObjectId(transfer) === wandObjectId), JSON.stringify({ corpseObjectId, wandObjectId, transfers: after.transferTransactions }));
    assert('both selected container rows move sequentially and inventory rows stay unselected', after.container.left.length === 0 && after.container.right.some((row) => /corpse/i.test(row.text)) && after.container.right.some((row) => /wand/i.test(row.text)) && !after.container.right.some((row) => /tin opener/i.test(row.text) && /selected/i.test(row.text)), JSON.stringify(after.container));
    assert('completed multi-item takeout reports aggregate feedback', /2 selected items moved/i.test(after.container.text || ''), after.container.text || '');
    assert('no prompt complains about corpse weight or asks for an extra selection', !/corpse.*too heavy|too heavy.*corpse|also take|Shall I pick/i.test(`${after.messages.join('\n')}\n${after.body}\n${after.shim}`), `${after.messages.join('\n')}\n${after.body}`.slice(-2000));
    assert('no Extended command modal visible after Select all take-out', !extendedCommandModalVisible(after), JSON.stringify(after.interaction));
  } catch (error) {
    scenarioError = error;
  } finally {
    await page.close().catch((error) => { if (!scenarioError) scenarioError = error; });
  }
  outcomes.push({ id: 'scenario-completed', status: scenarioError ? 'failed' : 'passed', details: scenarioError ? String(scenarioError.message || scenarioError) : '' });
  qc.recordAssertions(outcomes);
  recordJsonSidecars(qc, outDir);
  qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  console.log(`real-scenario-container-wand-corpse-direct-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
