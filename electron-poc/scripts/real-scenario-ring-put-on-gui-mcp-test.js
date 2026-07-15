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
const scenarioId = 'equipment/ring-put-on-gui';





async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { return evidencePage.screenshotEvidence(evidenceQc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width: 1360, height: 920, devicePixelRatio: 1 }, state: path.basename(name, path.extname(name)) }); }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function press(cdp, key, code, text) { const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0; const params = { key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }; if (text !== undefined) params.text = text; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }); }
async function boxForText(cdp, selector, pattern) { const box = await evalExpr(cdp, `(() => { const re = new RegExp(${JSON.stringify(pattern)}, 'i'); const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((candidate) => re.test(candidate.innerText || '')); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText,datasetKey:el.dataset.key || el.dataset.selector || '',stableId:el.dataset.stableId || ''} : null; })()`); if (!box) throw new Error(`missing ${selector} matching ${pattern}`); return box; }
async function clickBox(cdp, box) { await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function doubleClickText(cdp, selector, pattern) { const box = await boxForText(cdp, selector, pattern); for (const clickCount of [1, 2]) { await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount }); await Harness.delay(80); } return box; }
async function dragTextToSlot(cdp, sourcePattern, targetSlot) { const source = await boxForText(cdp, '#ux-items-root .uxm-item-row', sourcePattern); const target = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(`#ux-items-root .uxm-slot-button[data-slot-id="${targetSlot}"]`)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,text:el.innerText} : null; })()`); if (!target) throw new Error(`missing slot ${targetSlot}`); const dragData = { items: [{ mimeType: 'application/x-nethack-stable-id', data: source.stableId }, { mimeType: 'text/plain', data: source.datasetKey }], dragOperationsMask: 1 }; await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: target.x, y: target.y, data: dragData }); await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: target.x, y: target.y, data: dragData }); await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: target.x, y: target.y, data: dragData }); return { source, target }; }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
  shim: document.getElementById('shim-output')?.innerText || '',
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  messages: window.__nethackPromptTest?.messages?.().slice(-16).map((m) => m.text || String(m)) || [],
  dialog: window.__nethackPromptTest?.dialog?.() || {},
  equipment: window.NetHackUxEquipmentScreen?.controller?.snapshot?.() || {},
  commands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
  activePrompt: window.__nethackAutomation?.state?.().activePrompt || null,
  body: document.body.innerText,
  rows: Array.from(document.querySelectorAll('#ux-items-root .uxm-item-row')).map((el) => ({ key: el.dataset.key || '', stableId: el.dataset.stableId || '', text: el.innerText })),
  slots: Array.from(document.querySelectorAll('#ux-items-root .uxm-slot-button')).map((el) => ({ slot: el.dataset.slotId, text: el.innerText, equipped: el.classList.contains('is-equipped') })),
  feedback: window.NetHackUxEquipmentScreen?.controller?.snapshot?.().feedback || ''
}))()`); }
async function start(cdp) { await evalExpr(cdp, `document.querySelector('#start-shim')?.click()`); await Harness.delay(250); if (await evalExpr(cdp, `Boolean(document.getElementById('startup-choice-dialog')?.open)`)) await click(cdp, '#startup-new-game'); await Harness.waitFor(() => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 7000); await evalExpr(cdp, `(() => { const input = document.getElementById('player-name'); if (input && !input.value) { input.value = 'RingFlow'; input.dispatchEvent(new Event('input', { bubbles: true })); } })()`); await click(cdp, '#confirm-character'); await Harness.waitFor(async () => (await state(cdp)).running, 20000); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
function isEquipmentScreen(s) { return Boolean(s.equipment?.open) && /ring of protection/i.test(s.rows.map((row) => row.text).join('\n')); }
function noFingerPrompt(s) { return !/Which .*?(?:ring-|finger)|Right or Left|left or right|choose a hand/i.test(`${s.dialog?.prompt || ''}\n${s.activePrompt?.query || ''}`); }
function hasFingerPrompt(s) { return /Which .*?(?:ring-|finger)|Right or Left|left or right|choose a hand/i.test(`${s.dialog?.prompt || ''}\n${s.body}\n${s.activePrompt?.query || ''}`); }
function slotText(s, slot) { return (s.slots || []).find((entry) => entry.slot === slot)?.text || ''; }
function rowKey(s, pattern) { const re = new RegExp(pattern, 'i'); const row = (s.rows || []).find((entry) => re.test(entry.text || '')); return row?.key || ''; }

async function main() { if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]); scenarioError = null; ; ;
const page = await Harness.createElectronBrowserDriver({ root, width: 1360, height: 920, env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '555123', NETHACKOPTIONS: '!tutorial,!autopickup' } });
const cdp = (outDir = page.outputDir, evidencePage = page, evidenceQc = createEvidence(page), page.cdp) 
;
const results = { scenarioId, outDir, screenshots: {}, checks: {} };
try { ;
await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
await Harness.waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
await start(cdp);
await Harness.waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
results.screenshots.started = await shot(cdp, '01-scenario-loaded.png');
await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid')?.focus?.();");
await press(cdp, 'P', 'KeyP', 'P');
await Harness.delay(500);
await Harness.waitFor(async () => { const s = await state(cdp); return (s.dialog?.options || []).some((option) => option.key === 'g' && /protection/i.test(option.text || '')) ? s : null; }, 10000).catch(async (error) => { fs.writeFileSync(path.join(outDir, 'classic-name-timeout.json'), JSON.stringify(await state(cdp), null, 2)); throw error; });
results.afterClassicKeyboardP = await state(cdp);
results.screenshots.afterClassicKeyboardP = await shot(cdp, '02-after-classic-keyboard-P.png');
results.classicPutOnMenu = results.afterClassicKeyboardP;
results.screenshots.classicPutOnMenu = await shot(cdp, '02-classic-keyboard-put-on-menu.png');
const classicRingRow = await boxForText(cdp, '#interaction-options .choice-button', 'protection');
const classicRingKey = classicRingRow.datasetKey;
assert('classic ring selector found', Boolean(classicRingKey), JSON.stringify(results.classicPutOnMenu.rows));
await clickBox(cdp, classicRingRow);
results.classicFingerPrompt = await Harness.waitFor(async () => { const s = await state(cdp); return hasFingerPrompt(s) ? s : null; }, 10000);
results.screenshots.classicFingerPrompt = await shot(cdp, '03-classic-keyboard-ring-finger-prompt.png');
await evalExpr(cdp, "window.__nethackAutomation?.sendKeycode?.(108)");
await Harness.delay(500);
await evalExpr(cdp, `(async () => { window.__nethackAutomation?.sendKeycode?.(${'R'.charCodeAt(0)}); await new Promise((resolve) => setTimeout(resolve, 80)); window.__nethackAutomation?.sendKeycode?.(32); })()`);
await Harness.delay(700);
results.afterClassicCleanup = await state(cdp);
results.screenshots.afterClassicCleanup = await shot(cdp, '03b-after-classic-cleanup.png');

await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid')?.focus?.(); window.__nethackAutomation?.sendKeycode?.(105);");
await Harness.delay(700);
results.afterInventoryKey = await state(cdp);
results.screenshots.afterInventoryKey = await shot(cdp, '03c-after-inventory-key.png');
results.before = await Harness.waitFor(async () => { const s = await state(cdp); return isEquipmentScreen(s) ? s : null; }, 10000);
results.screenshots.before = await shot(cdp, '04-before-right-ring-drop.png');

await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs();");
await dragTextToSlot(cdp, 'ring of protection', 'ring.right');
await Harness.delay(1200);
results.afterRightFirstDragCommand = await state(cdp);
results.screenshots.afterRightFirstDragCommand = await shot(cdp, '05-after-first-ring-dragged-to-right-command.png');
results.afterRightFirstDragRefresh = await Harness.waitFor(async () => { const s = await state(cdp); return /ring of protection/i.test(slotText(s, 'ring.right')) ? s : null; }, 10000);
results.screenshots.afterRightFirstDragRefresh = await shot(cdp, '06-after-first-ring-equipped-on-right.png');

await evalExpr(cdp, "window.__nethackPromptTest.clearSentInputs();");
await dragTextToSlot(cdp, 'ring of adornment', 'ring.right');
await Harness.delay(700);
results.afterOccupiedRightReject = await state(cdp);
results.screenshots.afterOccupiedRightReject = await shot(cdp, '07-after-occupied-right-ring-drop-rejected.png');

const textAll = `${results.classicPutOnMenu.body}\n${results.classicFingerPrompt.body}\n${results.before.body}\n${results.afterRightFirstDragCommand.body}\n${results.afterRightFirstDragRefresh.body}\n${results.afterOccupiedRightReject.body}`;
results.checks = {
  scenarioLoaded: /bridge_test_scenario_loaded/.test(`${results.before.seenShim}\n${results.before.shim}`),
  classicKeyboardShowsOrdinaryRingFingerPrompt: hasFingerPrompt(results.classicFingerPrompt),
  classicKeyboardDidNotAutoAnswerHand: String(results.classicFingerPrompt.sent || '') === `P?${classicRingKey}`,
  equipmentScreenHasTwoRings: /ring of protection/i.test(results.before.rows.map((r) => r.text).join('\n')) && /ring of adornment/i.test(results.before.rows.map((r) => r.text).join('\n')),
  rightFirstDragSentPutOnSelectorAndRightAnswer: results.afterRightFirstDragCommand.commands.some((command) => command.commandType === 'equipment.change' && command.payload?.action === 'putOnRing' && command.payload?.hand === 'right' && command.payload?.slotId === 'ring.right'),
  rightFirstDragNoVisibleFingerPrompt: noFingerPrompt(results.afterRightFirstDragCommand) && noFingerPrompt(results.afterRightFirstDragRefresh),
  rightFirstDragEquipsRightRing: /ring of protection/i.test(slotText(results.afterRightFirstDragRefresh, 'ring.right')) && !/ring of protection/i.test(slotText(results.afterRightFirstDragRefresh, 'ring.left')),
  occupiedRightDropRejectedWithoutCommand: results.afterOccupiedRightReject.commands.length === 0 && /right ring slot is occupied/i.test(results.afterOccupiedRightReject.feedback || ''),
  occupiedRightDropDidNotEquipOtherHand: !/ring of adornment/i.test(slotText(results.afterOccupiedRightReject, 'ring.left')),
  noFallbackOrDeveloperLabels: !/Inventory selector|Name unavailable|Loading your inventory|Program in disorder|Please report these messages/i.test(textAll),
};
fs.writeFileSync(path.join(outDir, 'real-scenario-ring-put-on-gui-summary.json'), JSON.stringify(results, null, 2));

;
;
const failed = Object.entries(results.checks).filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) throw new Error(`Ring put-on GUI scenario failed: ${failed.join(', ')}`); } catch (error) { scenarioError = error; } finally { await finishEvidence(page, evidenceQc, scenarioError); } }
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
