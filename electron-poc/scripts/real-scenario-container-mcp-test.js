const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');
const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;
async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
const scenarioId = process.env.NH_SCENARIO_CONTAINER_ID || 'container/unlocked-chest-on-hero';
async function shot(cdp, name) { const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'actual-player', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 }); return capture.raw.path; }
function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-scenario-container-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
}
async function settleAfterDrag(cdp) {
  await evalExpr(cdp, `(async () => {
    document.activeElement?.blur?.(); window.scrollTo(0, 0);
    const panel = document.getElementById('container-transfer-panel');
    const previousPanelVisibility = panel?.style.visibility || '';
    if (panel) panel.style.visibility = 'hidden';
    const previousDisplay = document.body.style.display;
    document.body.style.display = 'none'; void document.body.offsetHeight;
    await new Promise(requestAnimationFrame);
    document.body.style.display = previousDisplay;
    if (panel) panel.style.visibility = previousPanelVisibility;
    void document.body.offsetHeight;
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  })()`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1359, height: 920, deviceScaleFactor: 1, mobile: false });
  await delay(100);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.bringToFront');
  await delay(300);
}
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function drag(cdp, fromSelector, toSelector) {
  const points = await evalExpr(cdp, `(() => { const from = document.querySelector(${JSON.stringify(fromSelector)}); const to = document.querySelector(${JSON.stringify(toSelector)}); from?.scrollIntoView?.({block:'center', inline:'center'}); to?.scrollIntoView?.({block:'center', inline:'center'}); const a = from?.getBoundingClientRect(); const b = to?.getBoundingClientRect(); return a && b ? { from:{x:a.left+a.width/2,y:a.top+a.height/2}, to:{x:b.left+b.width/2,y:b.top+b.height/2} } : null; })()`);
  if (!points) throw new Error(`missing drag selectors ${fromSelector} -> ${toSelector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.from.x, y: points.from.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: points.from.x, y: points.from.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 10; i += 1) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.from.x + ((points.to.x - points.from.x) * i / 10), y: points.from.y + ((points.to.y - points.from.y) * i / 10), button: 'left', buttons: 1 }); await delay(45); }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: points.to.x, y: points.to.y, button: 'left', buttons: 0, clickCount: 1 });
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({ dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id), actions: window.__nethackPromptTest?.contextActions?.(), sent: window.__nethackPromptTest?.sentInputs?.().join('') || '', messages: window.__nethackPromptTest?.messages?.().slice(-16).map((m) => m.text || String(m)) || [], pendingContainerUnlockOpen: window.__nethackPromptTest?.pendingContainerUnlockOpen?.() || null, container: window.__nethackPromptTest?.container?.(), containerSnapshots: window.__nethackPromptTest?.containerSnapshots?.(), transferTransactions: window.__nethackPromptTest?.transferTransactions?.(), promptPanel: { hidden: document.getElementById('prompt-panel')?.hidden, text: document.getElementById('prompt-panel')?.textContent || '' }, menuPanel: { hidden: document.getElementById('menu-panel')?.hidden, text: document.getElementById('menu-panel')?.textContent || '' }, status: document.getElementById('status')?.textContent || '', interaction: window.__nethackPromptTest?.dialog?.(), running: window.__nethackAutomation?.state?.().runningState?.running || false, body: document.body.innerText, seenShim: document.getElementById('shim-output')?.dataset?.seen || '', shim: document.getElementById('shim-output')?.innerText || '' }))()`); }
function extendedCommandModalVisible(s) {
  const text = `${s?.interaction?.title || ''}\n${s?.interaction?.prompt || ''}\n${s?.promptPanel?.hidden ? '' : s?.promptPanel?.text || ''}\n${s?.menuPanel?.hidden ? '' : s?.menuPanel?.text || ''}`;
  return Boolean(s?.interaction?.interactionOpen && /Extended command|filter\/type any # command|matching options/i.test(text));
}
function assertNoExtendedCommandModal(label, s) {
  assert(`${label}: no Extended command modal is visible`, !extendedCommandModalVisible(s), JSON.stringify({ interaction: s?.interaction, promptPanel: s?.promptPanel, menuPanel: s?.menuPanel, status: s?.status }));
}
async function startNoExtendedCommandModalMonitor(cdp, label, stepMs = 35) {
  await evalExpr(cdp, `(() => {
    window.__containerNoExtendedMonitors = window.__containerNoExtendedMonitors || {};
    const label = ${JSON.stringify(label)};
    const startedAt = performance.now();
    const records = [];
    const collect = (trigger) => {
      const interaction = document.getElementById('interaction-dialog');
      const title = document.getElementById('interaction-title')?.textContent || '';
      const prompt = document.getElementById('interaction-prompt')?.textContent || '';
      const promptPanel = document.getElementById('prompt-panel');
      const menuPanel = document.getElementById('menu-panel');
      const text = [title, prompt, promptPanel?.hidden ? '' : promptPanel?.textContent || '', menuPanel?.hidden ? '' : menuPanel?.textContent || ''].join('\\n');
      const hit = Boolean(interaction?.open && /Extended command|filter\\/type any # command|matching options/i.test(text));
      records.push({ atMs: Math.round(performance.now() - startedAt), trigger, hit, interactionOpen: Boolean(interaction?.open), title, prompt, promptPanelHidden: Boolean(promptPanel?.hidden), promptPanelText: promptPanel?.textContent || '', menuPanelHidden: Boolean(menuPanel?.hidden), menuPanelText: menuPanel?.textContent || '', status: document.getElementById('status')?.textContent || '' });
    };
    collect('install-before-transfer');
    const observer = new MutationObserver(() => collect('mutation'));
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['open', 'hidden', 'class', 'style'] });
    let raf = 0;
    const tick = () => { collect('animation-frame'); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    window.__containerNoExtendedMonitors[label] = { stop: () => { cancelAnimationFrame(raf); observer.disconnect(); collect('stop'); return records.slice(); } };
  })()`);
  const samples = [];
  const firstState = await state(cdp);
  samples.push({ atMs: 0, trigger: 'cdp-before-transfer', interaction: firstState.interaction, promptPanel: firstState.promptPanel, menuPanel: firstState.menuPanel, status: firstState.status, containerActive: firstState.container?.active });
  const start = Date.now();
  let stopped = false;
  const worker = (async () => {
    while (!stopped) {
      try {
        const s = await state(cdp);
        samples.push({ atMs: Date.now() - start, trigger: 'cdp-poll', interaction: s.interaction, promptPanel: s.promptPanel, menuPanel: s.menuPanel, status: s.status, containerActive: s.container?.active });
      } catch (error) {
        samples.push({ atMs: Date.now() - start, trigger: 'cdp-poll', error: String(error?.message || error) });
      }
      await delay(stepMs);
    }
  })();
  return {
    async stop() {
      stopped = true;
      await worker;
      const domSamples = await evalExpr(cdp, `(() => window.__containerNoExtendedMonitors?.[${JSON.stringify(label)}]?.stop?.() || [])()`);
      const combined = { cdpSamples: samples, domSamples };
      fs.writeFileSync(path.join(outDir, `${label}-samples.json`), JSON.stringify(combined, null, 2));
      const bad = samples.find(extendedCommandModalVisible);
      const domBad = domSamples.find((sample) => sample.hit);
      assert(`${label}: Extended command modal never appears in sampled transfer window`, !bad && !domBad, JSON.stringify(bad || domBad));
      return combined;
    },
  };
}
async function start(cdp) {
  await click(cdp, '#start-shim');
  await delay(250);
  if ((await state(cdp)).dialogs.includes('startup-choice-dialog')) await click(cdp, '#startup-new-game');
  await waitFor(() => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 7000);
  await click(cdp, '#confirm-character');
  await waitFor(async () => {
    const s = await state(cdp);
    if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim);
    return s.running ? s : null;
  }, 20000);
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
    await start(cdp);
    const loaded = await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
    const expectedOpenLabel = /chest/i.test(scenarioId) ? 'Open chest' : 'Open box';
    const ready = await waitFor(async () => {
      const s = await state(cdp);
      return s.actions?.buttons?.some((b) => b.id === 'open-container' && b.text === expectedOpenLabel) ? s : null;
    }, 10000);
    const contextShot = await shot(cdp, '01-scenario-context-actions.png');
    assert('context action disambiguates the container Open action', ready.actions?.buttons?.some((b) => b.id === 'open-container' && b.text === expectedOpenLabel), ready.actions?.text || '');
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await click(cdp, '#context-action-bar button[data-context-action-id="open-container"]');
    let panel;
    try {
      panel = await waitFor(async () => { const s = await state(cdp); const text = s.container?.text || ''; const topStripClear = s.promptPanel?.hidden && s.menuPanel?.hidden && !/Choose from the menu|Inventory: Menu|Transfer:|menu awaiting item selection/i.test(`${s.promptPanel?.text || ''}\n${s.menuPanel?.text || ''}\n${s.status || ''}`); return /Container inventory/i.test(text) && /food ration/i.test(text) && /dagger/i.test(text) && /tin opener/i.test(text) && /scroll of identify/i.test(text) && topStripClear ? s : null; }, 15000);
    } catch (error) {
      const debug = await state(cdp).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, 'scenario-panel-timeout-debug.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, 'debug-scenario-panel-timeout.png').catch(() => undefined);
      throw error;
    }
    fs.writeFileSync(path.join(outDir, '02-scenario-container-panel-state.json'), JSON.stringify(panel, null, 2));
    const panelShot = await shot(cdp, '02-scenario-container-panel.png');
    const initialLeftRows = panel.container?.left || [];
    const initialRightRows = panel.container?.right || [];
    assert('scenario container pane has stable object-backed drag keys and deterministic visible letters for chest contents', initialLeftRows.some((row) => /^container-object-/.test(row.selector || '') && /^a\s+/i.test(row.text) && /dagger/i.test(row.text)) && initialLeftRows.some((row) => /^container-object-/.test(row.selector || '') && /^b\s+/i.test(row.text) && /food ration/i.test(row.text)), JSON.stringify(initialLeftRows));
    assert('scenario inventory pane has deterministic visible letters for carried inventory', initialRightRows.some((row) => row.selector === 'f' && /tin opener/i.test(row.text)) && initialRightRows.some((row) => row.selector === 'g' && /scroll of identify/i.test(row.text)), JSON.stringify(initialRightRows));
    assert('context container Open action routes through direct container.snapshot instead of #loot or door-open self direction', panel.sent === '' && !panel.sent.startsWith('o.'), JSON.stringify({ sent: panel.sent, messages: panel.messages, snapshots: panel.containerSnapshots }));
    assert('context container Open action does not produce no-door message', !/no door/i.test(panel.messages.join('\n')), panel.messages.join('\n'));
    assert('container unlock continuation is cleared after unlocked container flow opens', panel.pendingContainerUnlockOpen == null, JSON.stringify(panel.pendingContainerUnlockOpen));
    assert('container panel shows scenario large box food ration', /food ration/i.test(panel.container.text), panel.container.text);
    assert('container panel shows scenario large box dagger', /dagger/i.test(panel.container.text), panel.container.text);
    assert('transfer panel shows scenario inventory tin opener', /tin opener/i.test(panel.container.text), panel.container.text);
    assert('transfer panel shows scenario inventory scroll of identify', /scroll of identify/i.test(panel.container.text), panel.container.text);
    assert('scenario inventory is hermetic and does not include starter spear/shield/oil lamp', !/\bspear\b|small shield|oil lamp/i.test(panel.container.text), panel.container.text);
    assert('container panel does not show selector fallback labels', !/Inventory selector/i.test(panel.container.text), panel.container.text);
    assert('container panel does not show stale loading, fallback, or closed/cancelled copy after both panes are visible', !/Loading your inventory|Loading container contents|Name unavailable|menu cancelled\/closed|menu canceled\/closed/i.test(`${panel.container.text}\n${panel.body}`), panel.body.slice(0, 1200));
    assert('normal equipment overlay is not covering container panel', !/Equipment\s*\/\s*Inventory|Hero equipment/i.test(panel.body), panel.body.slice(0, 1000));
    assert('container contextual Open path does not leak stale prompt/menu/status chips into top strip', panel.promptPanel?.hidden && panel.menuPanel?.hidden && !/Choose from the menu|Inventory: Menu|Transfer:|menu awaiting item selection|Read the menu|Read-only NetHack menu/i.test(`${panel.promptPanel?.text || ''}\n${panel.menuPanel?.text || ''}\n${panel.status || ''}`), JSON.stringify({ promptPanel: panel.promptPanel, menuPanel: panel.menuPanel, status: panel.status }));
    await settleAfterDrag(cdp);
    await shot(cdp, '03-after-container-open-no-readonly-chips.png');
    await settleAfterDrag(cdp);
    const noReadOnlyChipShot = await shot(cdp, '03-after-container-open-no-readonly-chips.png');
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    const takeOutNoExtendedMonitor = await startNoExtendedCommandModalMonitor(cdp, '04c-after-container-to-inventory-no-extended-modal');
    const firstContainerDragSelector = initialLeftRows[0]?.selector || '';
    await drag(cdp, `#container-transfer-panel [data-container-pane="left"] .container-item-row[data-selector="${firstContainerDragSelector}"]`, '#container-transfer-panel [data-container-pane="right"]');
    let afterTakeOut;
    try {
      afterTakeOut = await waitFor(async () => {
        const s = await state(cdp);
        const text = s.container?.text || '';
        const leftText = (s.container?.left || []).map((row) => row.text).join('\n');
        const rightText = (s.container?.right || []).map((row) => row.text).join('\n');
        const directSuccess = s.transferTransactions?.transfers?.some((tx) => tx.direction === 'container-to-inventory' && tx.status === 'success' && tx.result?.status === 'success');
        return s.container?.active && directSuccess && !/dagger/i.test(leftText) && /dagger/i.test(rightText) && /Container inventory/i.test(text) && /Your inventory/i.test(text) ? s : null;
      }, 12000);
    } catch (error) {
      const debug = await state(cdp).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, '04-after-container-to-inventory-drag-timeout-state.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, '04-after-container-to-inventory-drag-timeout.png').catch(() => undefined);
      throw error;
    }
    fs.writeFileSync(path.join(outDir, '04-after-container-to-inventory-drag-state.json'), JSON.stringify(afterTakeOut, null, 2));
    await settleAfterDrag(cdp);
    const takeOutDragShot = await shot(cdp, '04-after-container-to-inventory-drag.png');
    const takeOutUsedDirect = afterTakeOut.transferTransactions?.transfers?.some((tx) => tx.direction === 'container-to-inventory' && tx.status === 'success' && tx.result?.status === 'success');
    assert('real immediate container-to-inventory drag uses direct transfer with no #loot/menu-key fallback', takeOutUsedDirect && afterTakeOut.sent === '', JSON.stringify({ sent: afterTakeOut.sent, transfers: afterTakeOut.transferTransactions }));
    assert('real container-to-inventory drag updates both panes and keeps transfer panel visible', afterTakeOut.container?.active && !afterTakeOut.container.left.some((row) => /dagger/i.test(row.text)) && afterTakeOut.container.right.some((row) => /dagger/i.test(row.text)), JSON.stringify(afterTakeOut.container));
    const afterTakeOutEvidence = afterTakeOut;
    assert('real container-to-inventory drag completed with authoritative public container evidence', afterTakeOut.transferTransactions?.transfers?.some((tx) => tx.direction === 'container-to-inventory' && tx.result?.publicEvidence?.containerContents && tx.result?.containerContentsDelta?.removed?.some((item) => /dagger/i.test(item.displayName || ''))), JSON.stringify(afterTakeOut.transferTransactions));
    fs.writeFileSync(path.join(outDir, '04b-after-container-to-inventory-delayed-evidence-state.json'), JSON.stringify(afterTakeOutEvidence, null, 2));
    assert('real container-to-inventory drag leaves no stale top-strip prompt/menu chips', afterTakeOut.promptPanel?.hidden && afterTakeOut.menuPanel?.hidden && !/Choose from the menu|Inventory: Menu|Transfer:|menu awaiting item selection/i.test(`${afterTakeOut.promptPanel?.text || ''}\n${afterTakeOut.menuPanel?.text || ''}\n${afterTakeOut.status || ''}`), JSON.stringify({ promptPanel: afterTakeOut.promptPanel, menuPanel: afterTakeOut.menuPanel, status: afterTakeOut.status }));
    assertNoExtendedCommandModal('real container-to-inventory drag', afterTakeOut);
    const takeOutNoExtendedSamples = await takeOutNoExtendedMonitor.stop();
    const afterTakeOutProblemText = `${afterTakeOut.messages?.join('\n') || ''}\n${afterTakeOut.body || ''}\n${afterTakeOut.shim || ''}`;
    assert('real container-to-inventory evidence has no NetHack/internal JS disorder text', !/Program in disorder|Please report these messages|TypeError|ReferenceError|Unhandled|bridge_test_scenario_failed/i.test(afterTakeOutProblemText), afterTakeOutProblemText.slice(-2000));
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    const putInNoExtendedMonitor = await startNoExtendedCommandModalMonitor(cdp, '05c-after-inventory-to-container-no-extended-modal');
    await drag(cdp, '#container-transfer-panel [data-container-pane="right"] .container-item-row[data-item-name="dagger"]', '#container-transfer-panel [data-container-pane="left"]');
    let afterPutIn;
    try {
      afterPutIn = await waitFor(async () => {
        const s = await state(cdp);
        const leftText = (s.container?.left || []).map((row) => row.text).join('\n');
        const rightText = (s.container?.right || []).map((row) => row.text).join('\n');
        const directPutIn = s.transferTransactions?.transfers?.some((tx) => tx.direction === 'inventory-to-container' && tx.status === 'success' && tx.result?.status === 'success');
        return s.container?.active && !s.container?.pendingTransfer && directPutIn && /dagger/i.test(leftText) && !/dagger/i.test(rightText) ? s : null;
      }, 12000);
    } catch (error) {
      const debug = await state(cdp).catch(() => ({}));
      fs.writeFileSync(path.join(outDir, '05-after-inventory-to-container-drag-timeout-state.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, '05-after-inventory-to-container-drag-timeout.png').catch(() => undefined);
      throw error;
    }
    fs.writeFileSync(path.join(outDir, '05-after-inventory-to-container-drag-state.json'), JSON.stringify(afterPutIn, null, 2));
    await settleAfterDrag(cdp);
    await shot(cdp, '05-after-inventory-to-container-drag.png');
    await settleAfterDrag(cdp);
    const putInDragShot = await shot(cdp, '05-after-inventory-to-container-drag.png');
    const putInUsedDirect = afterPutIn.transferTransactions?.transfers?.some((tx) => tx.direction === 'inventory-to-container' && tx.status === 'success' && tx.result?.status === 'success');
    assert('real inventory-to-container drag uses direct transfer with no #loot/menu-key fallback and keeps panes stable', putInUsedDirect && afterPutIn.sent === '' && !afterPutIn.container?.pendingTransfer, JSON.stringify({ sent: afterPutIn.sent, pending: afterPutIn.container?.pendingTransfer, transfers: afterPutIn.transferTransactions }));
    assert('real inventory-to-container drag updates both panes and keeps transfer panel visible', afterPutIn.container?.active && afterPutIn.container.left.some((row) => /dagger/i.test(row.text)) && !afterPutIn.container.right.some((row) => /dagger/i.test(row.text)), JSON.stringify(afterPutIn.container));
    assertNoExtendedCommandModal('real inventory-to-container drag', afterPutIn);
    const putInNoExtendedSamples = await putInNoExtendedMonitor.stop();
    const afterPutInEvidence = afterPutIn;
    fs.writeFileSync(path.join(outDir, '05b-after-inventory-to-container-delayed-evidence-state.json'), JSON.stringify(afterPutInEvidence, null, 2));
    assert('real inventory-to-container drag records the direct transfer transaction and keeps authoritative panes stable for the player', afterPutIn.transferTransactions?.transfers?.some((tx) => tx.direction === 'inventory-to-container' && tx.result?.publicEvidence?.containerContents) && afterPutIn.container?.active, JSON.stringify({ transfers: afterPutIn.transferTransactions, container: afterPutIn.container }));
    const afterPutInProblemText = `${afterPutIn.messages?.join('\n') || ''}\n${afterPutIn.body || ''}\n${afterPutIn.shim || ''}`;
    assert('real inventory-to-container evidence has no NetHack/internal JS disorder text', !/Program in disorder|Please report these messages|TypeError|ReferenceError|Unhandled|bridge_test_scenario_failed/i.test(afterPutInProblemText), afterPutInProblemText.slice(-2000));
    const summary = [`# Scenario loader real Electron smoke`, '', 'Scenario assertions recorded', '', `Scenario: ${scenarioId}`, `Loaded event: yes`, `Context screenshot: ${contextShot}`, `Container panel screenshot: ${panelShot}`, `Initial container panel state: ${path.join(outDir, '02-scenario-container-panel-state.json')}`, `No read-only chip screenshot: ${noReadOnlyChipShot}`, `After container-to-inventory drag screenshot: ${takeOutDragShot}`, `After container-to-inventory drag state: ${path.join(outDir, '04-after-container-to-inventory-drag-state.json')}`, `Container-to-inventory no-extended samples: ${path.join(outDir, '04c-after-container-to-inventory-no-extended-modal-samples.json')} (${takeOutNoExtendedSamples.cdpSamples.length} CDP samples, ${takeOutNoExtendedSamples.domSamples.length} DOM/frame samples)`, `Delayed container-to-inventory evidence state: ${path.join(outDir, '04b-after-container-to-inventory-delayed-evidence-state.json')}`, `After inventory-to-container drag screenshot: ${putInDragShot}`, `After inventory-to-container drag state: ${path.join(outDir, '05-after-inventory-to-container-drag-state.json')}`, `Inventory-to-container no-extended samples: ${path.join(outDir, '05c-after-inventory-to-container-no-extended-modal-samples.json')} (${putInNoExtendedSamples.cdpSamples.length} CDP samples, ${putInNoExtendedSamples.domSamples.length} DOM/frame samples)`, `Inventory-to-container transaction state: ${path.join(outDir, '05b-after-inventory-to-container-delayed-evidence-state.json')}`, '', 'Verified scenario public facts:', `- contextActions: open-container shown as ${expectedOpenLabel}`, `- clicking ${expectedOpenLabel} sends direct container.snapshot, not #loot or o./door-open`, `- no no-door message after clicking ${expectedOpenLabel}`, '- stale unlock continuation state is cleared after the container panel opens', '- context strip does not show Read the menu or Read-only NetHack menu diagnostics after the contextual Open path', '- deterministic visible letters: container dagger is `a`, food ration is `b`, carried tin opener is `f`, carried scroll is `g`', '- dragging the visible container dagger row into Your inventory uses authoritative direct transfer with no #loot/menu-key fallback and keeps the panes stable with the dagger in inventory', '- no Extended command modal appears during or after the sampled container-to-inventory transfer window', '- direct container-to-inventory completes through authoritative core/public container evidence', '- dragging the same inventory row back to Container inventory uses direct transfer with no #loot/menu-key fallback and keeps panes stable', '- no Extended command modal appears during or after the sampled inventory-to-container transfer window', '- direct inventory-to-container records the transfer transaction and keeps authoritative panes stable', '- synthetic renderer/Electron coverage verifies internal ownership suppression without permitting legacy menu fallback in this scenario', '- containerRows: food ration, dagger', '- inventoryRows: tin opener, scroll of identify', '- inventory is hermetic: no starter spear/shield/oil lamp rows', '', 'Verified absence of stale/fallback/contradictory panel copy:', '- Loading your inventory', '- Inventory selector', '- Name unavailable', '- menu cancelled/closed or menu canceled/closed', '', `Sent input prefix: ${JSON.stringify(panel.sent.slice(0, 16))}`, '', 'Visible transfer panel text:', '```', panel.container.text, '```', ''].join('\n');
    fs.writeFileSync(path.join(outDir, 'real-scenario-container-summary.md'), summary);
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
  console.log(`real-scenario-container-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}
const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
