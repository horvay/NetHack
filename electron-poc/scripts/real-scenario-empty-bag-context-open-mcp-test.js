const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');



const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');
function reviewRun(outputDir, reviewFile) { const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json'); const approval = EvidenceApproval.openEvidenceApproval({ manifestFile }); EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile)); const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true }); if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(manifestFile); console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`); }
function createEvidence(page) { return Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') }); }
async function finishEvidence(page, qc, scenarioError) { await page.close().catch(() => {}); qc.recordAssertions([{ id: 'scenario-contract', status: scenarioError ? 'failed' : 'passed', details: scenarioError?.message || '' }]); qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' }); qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' }); const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false }); if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(qc.manifestFile); console.log(`${scriptName}: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`); if (scenarioError) throw scenarioError; }
let outDir, evidencePage, evidenceQc, scenarioError
const scenarioId = process.env.NH_SCENARIO_EMPTY_BAG_ID || 'container/empty-bag-on-hero';





async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { return evidencePage.screenshotEvidence(evidenceQc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width: 1360, height: 920, devicePixelRatio: 1 }, state: path.basename(name, path.extname(name)) }); }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) {
  return evalExpr(cdp, `(() => ({
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
    actions: window.__nethackPromptTest?.contextActions?.(),
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    sentPayloads: window.__nethackPromptTest?.sentPayloads?.() || [],
    sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
    prompt: window.__nethackPromptTest?.prompt?.() || null,
    messages: window.__nethackPromptTest?.messages?.().slice(-24).map((m) => m.text || String(m)) || [],
    container: window.__nethackPromptTest?.container?.(),
    containerSnapshots: window.__nethackPromptTest?.containerSnapshots?.(),
    promptPanel: { hidden: document.getElementById('prompt-panel')?.hidden, text: document.getElementById('prompt-panel')?.textContent || '' },
    menuPanel: { hidden: document.getElementById('menu-panel')?.hidden, text: document.getElementById('menu-panel')?.textContent || '' },
    status: document.getElementById('status')?.textContent || '',
    interaction: window.__nethackPromptTest?.dialog?.(),
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    body: document.body.innerText,
    seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
    shim: document.getElementById('shim-output')?.innerText || ''
  }))()`);
}
async function saveState(cdp, name) { const s = await state(cdp); fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(s, null, 2)); return s; }
async function start(cdp) {
  await click(cdp, '#start-shim');
  await Harness.waitFor(() => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 7000);
  await click(cdp, '#confirm-character');
  await Harness.waitFor(async () => {
    const s = await state(cdp);
    if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim);
    return s.running ? s : null;
  }, 20000);
  if ((await state(cdp)).dialogs.includes('intro-dialog')) await click(cdp, '#intro-continue');
  await Harness.waitFor(async () => !(await state(cdp)).dialogs.includes('intro-dialog'), 5000);
}
function assertEmptyBagPanel(label, s) {
  const panelText = s.container?.text || '';
  const visible = `${panelText}\n${s.promptPanel?.hidden ? '' : s.promptPanel?.text || ''}\n${s.menuPanel?.hidden ? '' : s.menuPanel?.text || ''}\n${s.interaction?.interactionOpen ? `${s.interaction.title || ''}\n${s.interaction.prompt || ''}` : ''}`;
  assert(`${label}: empty bag message is visible in NetHack output`, /The bag is empty\./i.test(`${(s.messages || []).join('\n')}\n${s.container?.menu?.prompt || ''}\n${s.body || ''}`), `${(s.messages || []).join('\n')}\n${s.container?.menu?.prompt || ''}`);
  assert(`${label}: container transfer panel remains visible`, s.container?.active && !s.container.hidden, JSON.stringify(s.container));
  assert(`${label}: left pane shows stable empty state`, /Open bag|Container inventory|This container is empty/i.test(panelText) && /This container is empty/i.test(panelText), panelText);
  assert(`${label}: inventory pane remains populated`, /Your inventory/i.test(panelText) && /dagger|leather armor|small shield|potion of healing/i.test(panelText), panelText);
  assert(`${label}: no loading placeholder remains`, !/Loading container contents|Loading your inventory/i.test(visible), visible.slice(0, 1600));
  assert(`${label}: no wrong menu or inventory overlay owns the UI`, !/Extended command|Equipment\s*\/\s*Inventory|Hero equipment|Choose from the menu|Inventory: Menu/i.test(visible), visible.slice(0, 1600));
  assert(`${label}: top prompt/menu chrome is hidden for container ownership`, s.promptPanel?.hidden && s.menuPanel?.hidden, JSON.stringify({ promptPanel: s.promptPanel, menuPanel: s.menuPanel }));
  assert(`${label}: shared public container snapshot records an empty active bag session`, s.containerSnapshots?.sessions?.some((session) => session.status === 'active' && /bag/i.test(session.container?.displayName || session.container?.publicId || '')) && s.containerSnapshots?.snapshots?.some((snapshot) => /bag/i.test(snapshot.container?.displayName || snapshot.container?.publicId || '') && snapshot.items.length === 0), JSON.stringify(s.containerSnapshots));
}
async function sampleEmptyBag(cdp, label, durationMs = 1100, stepMs = 100) {
  const samples = [];
  const start = Date.now();
  do {
    const s = await state(cdp);
    samples.push({ atMs: Date.now() - start, containerText: s.container?.text || '', messages: s.messages || [], promptHidden: s.promptPanel?.hidden, menuHidden: s.menuPanel?.hidden, status: s.status || '' });
    assertEmptyBagPanel(`${label} sample ${samples.length}`, s);
    await Harness.delay(stepMs);
  } while (Date.now() - start < durationMs);
  fs.writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify(samples, null, 2));
  return samples;
}
async function main() { if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]); scenarioError = null; ; ;
const page = await Harness.createElectronBrowserDriver({ root, width: 1360, height: 920, env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '515151', NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none' } });
const cdp = (outDir = page.outputDir, evidencePage = page, evidenceQc = createEvidence(page), page.cdp) 
; ; ;
try { ;
await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
await Harness.waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
await start(cdp);
const loaded = await Harness.waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
const ready = await Harness.waitFor(async () => {
  const s = await state(cdp);
  return s.actions?.buttons?.some((b) => b.id === 'open-container' && /Loot bag/i.test(b.text || '')) ? s : null;
}, 10000);
const contextShot = await shot(cdp, '00-context-actions-before-loot-bag.png');
assert('empty bag context action is Loot bag', ready.actions?.buttons?.some((b) => b.id === 'open-container' && /Loot bag/i.test(b.text || '')), ready.actions?.text || '');
await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
const openStarted = Date.now();
await click(cdp, '#context-action-bar button[data-context-action-id="open-container"]');
let immediate;
try {
  immediate = await Harness.waitFor(async () => {
    const s = await state(cdp);
    return /The bag is empty\./i.test(`${(s.messages || []).join('\n')}\n${s.container?.menu?.prompt || ''}\n${s.body || ''}`) && s.container?.active ? s : null;
  }, 12000);
} catch (error) {
  const debug = await state(cdp).catch(() => ({}));
  fs.writeFileSync(path.join(outDir, 'debug-after-loot-bag-timeout-state.json'), JSON.stringify(debug, null, 2));
  await shot(cdp, 'debug-after-loot-bag-timeout.png').catch(() => undefined);
  throw error;
}
fs.writeFileSync(path.join(outDir, '01-after-empty-message-state.json'), JSON.stringify(immediate, null, 2));
const immediateShot = await shot(cdp, '01-after-empty-message.png');
assertEmptyBagPanel('immediately after empty bag message', immediate);
const remaining = Math.max(0, 1050 - (Date.now() - openStarted));
if (remaining) await Harness.delay(remaining);
const samples = await sampleEmptyBag(cdp, '02-empty-bag-one-second-samples', 1100, 100);
const afterOneSecond = await saveState(cdp, '02-empty-bag-after-one-second-state');
const oneSecondShot = await shot(cdp, '02-empty-bag-after-one-second.png');
assertEmptyBagPanel('after at least one full second', afterOneSecond);
assert('empty bag context-open does not send delayed take-out or inventory probes', afterOneSecond.sent === '#loot\n', JSON.stringify({ sent: afterOneSecond.sent }));
assert('empty bag #loot context-open is validated as v2 action.execute bridge metadata', (afterOneSecond.sentPayloads || []).some((payload) => payload.uiProtocolCommandType === 'action.execute' && payload.uiProtocolActionId === 'ground.openContainer' && payload.guiActionId === 'ground.openContainer'), JSON.stringify(afterOneSecond.sentPayloads || []));
assert('empty bag #loot v2 envelope carries explicit public ground target and prompt ownership policy', (afterOneSecond.sentUiProtocolCommands || []).some((command) => command.commandType === 'action.execute' && command.actionId === 'ground.openContainer' && command.targets?.location?.kind === 'ground' && command.payload?.target?.location?.kind === 'ground' && command.payload?.promptPolicy === 'netHack-owned-followup'), JSON.stringify(afterOneSecond.sentUiProtocolCommands || []));
const problemText = `${afterOneSecond.messages?.join('\n') || ''}\n${afterOneSecond.body || ''}\n${afterOneSecond.shim || ''}`;
assert('empty bag evidence has no NetHack/internal JS disorder text', !/Program in disorder|Please report these messages|TypeError|ReferenceError|Unhandled|bridge_test_scenario_failed/i.test(problemText), problemText.slice(-2000));

;
; } catch (error) { scenarioError = error; } finally { await finishEvidence(page, evidenceQc, scenarioError); } }
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
