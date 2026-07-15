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
const scenarioId = 'equipment/body-armor-over-shirt';





async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { return evidencePage.screenshotEvidence(evidenceQc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width: 1360, height: 920, devicePixelRatio: 1 }, state: path.basename(name, path.extname(name)) }); }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function press(cdp, key, code, text) { const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0; const params = { key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }; if (text !== undefined) params.text = text; await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) { return evalExpr(cdp, `(() => ({
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
  equipment: window.__nethackPromptTest?.equipment?.() || {},
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  commands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
  acks: window.__nethackPromptTest?.sentUiProtocolAcks?.() || [],
  seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
  shim: document.getElementById('shim-output')?.innerText || '',
  messages: window.__nethackPromptTest?.messages?.().slice(-12).map((m) => m.text || String(m)) || [],
  body: document.body.innerText,
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  rows: Array.from(document.querySelectorAll('#ux-items-root .uxm-item-row')).map((row) => ({ key: row.dataset.key || '', stableId: row.dataset.stableId || '', text: row.innerText })),
  slots: Array.from(document.querySelectorAll('#ux-items-root .uxm-slot-button')).map((slot) => ({ slot: slot.dataset.slotId || '', text: slot.innerText, equipped: slot.classList.contains('is-equipped'), blockerTokens: slot.dataset.blockerTokens || '' })),
  feedback: window.NetHackUxEquipmentScreen?.controller?.snapshot?.().feedback || ''
}))()`); }
async function start(cdp) { await evalExpr(cdp, `document.querySelector('#start-shim')?.click()`); await Harness.delay(250); if (await evalExpr(cdp, `Boolean(document.getElementById('startup-choice-dialog')?.open)`)) await click(cdp, '#startup-new-game'); await Harness.waitFor(() => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 7000); await evalExpr(cdp, `(() => { const input = document.getElementById('player-name'); if (input && !input.value) { input.value = 'ShirtFlow'; input.dispatchEvent(new Event('input', { bubbles: true })); } })()`); await click(cdp, '#confirm-character'); await Harness.waitFor(async () => (await state(cdp)).running, 20000); await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); })()`); }
function slotText(s, slotId) { return (s.slots || []).find((slot) => slot.slot === slotId)?.text || ''; }

async function main() { if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]); scenarioError = null; ; ;
const page = await Harness.createElectronBrowserDriver({ root, width: 1360, height: 920, env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424243', NETHACKOPTIONS: '!tutorial,!autopickup' } });
const cdp = (outDir = page.outputDir, evidencePage = page, evidenceQc = createEvidence(page), page.cdp) 
;
try { ;
await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 920, deviceScaleFactor: 1, mobile: false });
await Harness.waitFor(async () => (await evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest")), 10000);
await start(cdp);
await Harness.waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
await evalExpr(cdp, "window.__nethackPromptTest?.clearSentInputs?.();");
await click(cdp, '#inventory-equipment-button');
const before = await Harness.waitFor(async () => { const s = await state(cdp); return s.equipment?.open && /leather armor/i.test(slotText(s, 'armor.body')) && /T-shirt/i.test(slotText(s, 'armor.shirt')) ? s : null; }, 15000);
const beforeShot = await shot(cdp, '01-shirt-under-armor-before-takeoff.png');
const beforeBody = before.slots.find((slot) => slot.slot === 'armor.body') || {};
const beforeShirt = before.slots.find((slot) => slot.slot === 'armor.shirt') || {};
assert('owner shows body armor and the covered shirt as distinct layered slots', /leather armor/i.test(beforeBody.text || '') && /T-shirt/i.test(beforeShirt.text || ''), JSON.stringify({ beforeBody, beforeShirt }));
await click(cdp, '#ux-items-root .uxm-slot-button[data-slot-id="armor.shirt"]');
const coveredShirtAction = await evalExpr(cdp, `(() => ({ buttonPresent: Boolean(document.querySelector('#ux-items-root .uxm-detail-actions button[data-action-id="item.takeOff"]')), blockedText: document.querySelector('#ux-items-root .uxm-blocked-actions')?.innerText || '' }))()`);
assert('covered shirt preserves its public takeoff blocker', !coveredShirtAction.buttonPresent && /Take off[\s\S]*Shirt covered; remove armor first/i.test(coveredShirtAction.blockedText), JSON.stringify(coveredShirtAction));
assert('before takeoff has no NetHack disorder messages', !/Program in disorder|Please report these messages|m_detach/i.test(`${before.messages.join('\n')}\n${before.body}`), JSON.stringify(before.messages));

await click(cdp, '#ux-items-root .uxm-slot-button[data-slot-id="armor.body"]');
const takeOffButtonEvidence = await evalExpr(cdp, `(() => { const button = document.querySelector('#ux-items-root .uxm-detail-actions button[data-action-id="item.takeOff"]'); return { text: button?.textContent || '', actionId: button?.dataset.actionId || '', disabled: Boolean(button?.disabled) }; })()`);
assert('body armor exposes the semantic Take off action', takeOffButtonEvidence.actionId === 'item.takeOff' && /Take off/i.test(takeOffButtonEvidence.text) && !takeOffButtonEvidence.disabled, JSON.stringify(takeOffButtonEvidence));
await evalExpr(cdp, "window.__nethackPromptTest?.clearSentInputs?.();");
await evalExpr(cdp, `document.querySelector('#ux-items-root .uxm-equipment-details .uxm-detail-actions button[data-action-id="item.takeOff"]')?.click()`);
const dispatched = await Harness.waitFor(async () => { const s = await state(cdp); return s.commands.some((command) => command.commandType === 'action.execute' && command.actionId === 'item.takeOff') && (/\bbeing doffed\b/i.test(slotText(s, 'armor.body')) || /\bEmpty\b/i.test(slotText(s, 'armor.body'))) ? s : null; }, 15000);
const takeOffCommand = dispatched.commands.find((command) => command.commandType === 'action.execute' && command.actionId === 'item.takeOff');
const takeOffAccepted = dispatched.acks.find((ack) => (ack.eventType || ack.payload?.eventType) === 'command.accepted' && ack.payload?.commandId === takeOffCommand?.commandId && ack.payload?.executionSource === 'bridge-ui-command');
assert('multi-turn body Take off emits one semantic action.execute command', dispatched.commands.filter((command) => command.commandType === 'action.execute' && command.actionId === 'item.takeOff').length === 1 && takeOffCommand?.expectedRevision?.inventory > 0 && takeOffCommand?.expectedRevision?.equipment > 0, JSON.stringify(dispatched.commands));
assert('multi-turn body Take off is accepted by the exact gateway command', Boolean(takeOffAccepted), JSON.stringify(dispatched.acks));
let after = dispatched;
if (!/\bEmpty\b/i.test(slotText(after, 'armor.body'))) {
  await evalExpr(cdp, `document.querySelector('#ux-items-root .uxm-items-close')?.click()`);
  for (let turn = 0; turn < 4; turn += 1) {
    await evalExpr(cdp, `document.querySelector('[data-command-key="."]')?.click()`);
    await Harness.delay(300);
  }
  await click(cdp, '#inventory-equipment-button');
  after = await Harness.waitFor(async () => { const s = await state(cdp); return s.equipment?.open && /\bEmpty\b/i.test(slotText(s, 'armor.body')) && /T-shirt/i.test(slotText(s, 'armor.shirt')) ? s : null; }, 30000).catch(async (error) => { const debug = await state(cdp).catch(() => ({})); fs.writeFileSync(path.join(outDir, 'takeoff-timeout-debug.json'), JSON.stringify({ takeOffButtonEvidence, dispatched, debug }, null, 2)); await shot(cdp, 'debug-shirt-takeoff-timeout.png').catch(() => undefined); throw error; });
}
const afterShot = await shot(cdp, '02-shirt-visible-after-armor-takeoff.png');
assert('after takeoff reveals the still-worn shirt while body armor is empty', /\bEmpty\b/i.test(slotText(after, 'armor.body')) && /T-shirt/i.test(slotText(after, 'armor.shirt')), JSON.stringify(after.slots));
assert('after takeoff keeps the leather armor as one carried item', after.rows.filter((row) => /leather armor/i.test(row.text)).length === 1, JSON.stringify(after.rows));
assert('owner remains open without a duplicate native item prompt', after.equipment?.open && !after.dialogs.includes('interaction-dialog'), JSON.stringify({ equipment: after.equipment, dialogs: after.dialogs }));
assert('after takeoff has no NetHack disorder messages', !/Program in disorder|Please report these messages|m_detach/i.test(`${after.messages.join('\n')}\n${after.body}`), JSON.stringify(after.messages));

fs.writeFileSync(path.join(outDir, 'shirt-takeoff-debug.json'), JSON.stringify({ before: { body: beforeBody, shirt: beforeShirt }, dispatched: { command: takeOffCommand, accepted: takeOffAccepted, slots: dispatched.slots }, after: { slots: after.slots, rows: after.rows, feedback: after.feedback }, screenshots: { beforeShot, afterShot } }, null, 2));
; } catch (error) { scenarioError = error; } finally { await finishEvidence(page, evidenceQc, scenarioError); } }
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
