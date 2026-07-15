const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');



const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');
function reviewRun(outputDir, reviewFile) { const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json'); const approval = EvidenceApproval.openEvidenceApproval({ manifestFile }); EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile)); const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true }); if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(manifestFile); console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`); }
function createEvidence(page) { return Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') }); }
async function finishEvidence(page, qc, scenarioError) { await page.close().catch(() => {}); qc.recordAssertions([{ id: 'scenario-contract', status: scenarioError ? 'failed' : 'passed', details: scenarioError?.message || '' }]); qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' }); qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' }); const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false }); if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(qc.manifestFile); console.log(`${scriptName}: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`); if (scenarioError) throw scenarioError; }
const scenarioId = process.env.NH_TEST_SCENARIO_ID || 'object/rub-candidates-in-inventory';
let outDir, evidencePage, evidenceQc






async function evalExpr(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
  if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
async function shot(cdp, name) { return evidencePage.screenshotEvidence(evidenceQc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width: 1360, height: 920, devicePixelRatio: 1 }, state: path.basename(name, path.extname(name)) }); }
async function click(cdp, selector) {
  const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,text:el.innerText} : null; })()`);
  if (!box) throw new Error(`missing selector ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  return box;
}
async function press(cdp, key, code, text) {
  const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
  const params = { key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  if (text !== undefined) params.text = text;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
}
async function rightClickText(cdp, selector, pattern) {
  const source = String(pattern);
  const box = await evalExpr(cdp, `(() => { const re = new RegExp(${JSON.stringify(source)}, 'i'); const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((row) => re.test(row.innerText || '')); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,text:el.innerText,key:el.dataset.key || ''} : null; })()`);
  if (!box) throw new Error(`missing text ${source} in ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'right', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'right', clickCount: 1 });
  return box;
}
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(cdp) {
  return evalExpr(cdp, `(() => ({
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => dialog.id),
    dialog: window.__nethackPromptTest?.dialog?.() || {},
    inventory: window.__nethackPromptTest?.inventory?.() || {},
    equipment: window.NetHackUxEquipmentScreen?.controller?.snapshot?.() || {},
    messages: window.__nethackPromptTest?.messages?.().slice(-20).map((message) => message.text || String(message)) || [],
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    sentPayloads: window.__nethackPromptTest?.sentPayloads?.() || [],
    sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
    commandTransactions: window.__nethackPromptTest?.commandTransactions?.() || {},
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    body: document.body.innerText,
    contextMenu: document.querySelector('.uxm-item-context-menu')?.innerText || '',
    seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
    shim: document.getElementById('shim-output')?.innerText || '',
    bridgeUiEvents: (document.getElementById('shim-output')?.innerText || '').split('\\n').map((line) => { try { return JSON.parse(line).event; } catch { return null; } }).filter((event) => event && /^bridge_ui_command_/.test(event.name || '')),
    followup: { text: document.querySelector('.uxm-native-followup')?.innerText || '', keys: Array.from(document.querySelectorAll('.uxm-native-followup-row')).map((row) => row.dataset.key || '') },
    rowActions: Array.from(document.querySelectorAll('#ux-items-root .uxm-item-row')).map((row) => ({ text: row.innerText, key: row.dataset.key || '' }))
  }))()`);
}
async function start(cdp) {
  await click(cdp, '#start-shim');
  await Harness.delay(250);
  if (await evalExpr(cdp, `Boolean(document.getElementById('startup-choice-dialog')?.open)`)) await click(cdp, '#startup-new-game');
  await Harness.waitFor(() => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 7000);
  await evalExpr(cdp, `(() => { const input = document.getElementById('player-name'); if (input && !input.value) { input.value = 'RubFlow'; input.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
  await click(cdp, '#confirm-character');
  await Harness.waitFor(async () => (await state(cdp)).running, 20000);
  await evalExpr(cdp, `(() => { document.getElementById('intro-dialog')?.close?.('continue'); document.getElementById('document-dialog')?.close?.('close'); document.getElementById('game-grid')?.focus?.(); window.__nethackPromptTest?.clearSentInputs?.(); })()`);
}
function assertNoHiddenIdentityFields(command) {
  const serialized = JSON.stringify(command || {});
  for (const forbidden of ['trueName', 'baseType', 'objectType', 'otyp', 'beatitude', 'buc', 'cursed', 'blessed', 'enchantment', 'charges', 'trapState', 'contents', 'locked', 'trapped', 'broken']) {
    assert(`v2 command omits hidden field ${forbidden}`, !serialized.includes(`"${forbidden}"`), serialized);
  }
}

async function main() {
  if (process.argv[2] === '--review') return reviewRun(process.argv[3], process.argv[4]);
  const page = await Harness.createElectronBrowserDriver({
    root,
    width: 1360,
    height: 920,
    env: {
      NH_ELECTRON_TEST_FIXTURES: '1',
      NH_SHIM_RESET_LOCKS: '1',
      NH_TEST_SCENARIO_ID: scenarioId,
      NETHACK_SEED: '424242',
      NETHACKOPTIONS: '!tutorial,!autopickup',
    },
  });
  outDir = page.outputDir;
  evidencePage = page;
  evidenceQc = createEvidence(page);
  const cdp = page.cdp;
  let scenarioError;
  try {
    await page.waitForRendererReady({ timeoutMs: 10000, promptTest: true, automation: true });
    await start(cdp);
    await Harness.waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);

    await press(cdp, 'i', 'KeyI', 'i');
    const inventoryReady = await Harness.waitFor(async () => { const s = await state(cdp); return s.equipment?.open && /lamp/i.test(s.body) && /magic marker/i.test(s.body) && /towel/i.test(s.body) ? s : null; }, 10000);
    const inventoryShot = await shot(cdp, '01-inventory-rub-candidates.png');

    const rockRow = await rightClickText(cdp, '#ux-items-root .uxm-item-row', 'rock');
    await Harness.delay(250);
    const rockContext = await state(cdp);
    const rockContextShot = await shot(cdp, '02-rock-context-no-rub.png');
    assert('ordinary rock row is visible', /rock/i.test(rockRow.text), rockRow.text);
    assert('ordinary rocks do not expose Rub', !/^Rub$/im.test(rockContext.contextMenu), rockContext.contextMenu);
    await press(cdp, 'Escape', 'Escape');

    const markerRow = await rightClickText(cdp, '#ux-items-root .uxm-item-row', 'magic marker');
    await Harness.delay(250);
    const markerContext = await state(cdp);
    const markerContextShot = await shot(cdp, '03-marker-context-no-rub.png');
    assert('magic marker does not expose Rub because native #rub does not accept it', !/^Rub$/im.test(markerContext.contextMenu), markerContext.contextMenu);
    await press(cdp, 'Escape', 'Escape');

    const towelRow = await rightClickText(cdp, '#ux-items-root .uxm-item-row', 'towel');
    await Harness.delay(250);
    const towelContext = await state(cdp);
    const towelContextShot = await shot(cdp, '04-towel-context-no-rub.png');
    assert('towel does not expose Rub because native #rub does not accept it', !/^Rub$/im.test(towelContext.contextMenu), towelContext.contextMenu);
    await press(cdp, 'Escape', 'Escape');

    const lampRow = await rightClickText(cdp, '#ux-items-root .uxm-item-row', 'lamp');
    await Harness.waitFor(async () => /^Rub$/im.test((await state(cdp)).contextMenu), 5000);
    const lampContext = await state(cdp);
    const lampContextShot = await shot(cdp, '05-lamp-context-rub.png');
    assert('lamp row is visible', /lamp/i.test(lampRow.text), lampRow.text);
    assert('public lamp candidate exposes Rub', /^Rub$/im.test(lampContext.contextMenu), lampContext.contextMenu);
    assert('Rub context does not expose identity spoiler labels', !/magic lamp|touchstone|luckstone|loadstone/i.test(lampContext.contextMenu), lampContext.contextMenu);

    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await click(cdp, '.uxm-item-context-menu [data-action-id="item.rub"]');
    const afterRub = await Harness.waitFor(async () => {
      const s = await state(cdp);
      if (!/#rub\n$/.test(s.sent)) return null;
      return s.equipment?.ownership?.ownsPrompt && /What do you want to rub/i.test(s.followup.text) ? s : null;
    }, 10000).catch(async (error) => {
      const debug = await state(cdp).catch((stateError) => ({ stateError: String(stateError) }));
      fs.writeFileSync(path.join(outDir, 'debug-after-rub-timeout-state.json'), JSON.stringify(debug, null, 2));
      await shot(cdp, 'debug-after-rub-timeout.png').catch(() => undefined);
      throw error;
    });
    const promptShot = await shot(cdp, '06-after-rub-nethack-owned-prompt.png');
    assert('item owner displays the exact NetHack-owned rub follow-up', afterRub.equipment?.ownership?.ownsPrompt && /What do you want to rub/i.test(afterRub.followup.text), JSON.stringify({ equipment: afterRub.equipment, followup: afterRub.followup }));
    const rubCommand = afterRub.sentUiProtocolCommands.find((command) => command.commandType === 'action.execute' && command.actionId === 'item.rub');
    assert('item.rub v2 command recorded', rubCommand, JSON.stringify(afterRub.sentUiProtocolCommands));
    const acceptedBridgeEvent = (afterRub.bridgeUiEvents || []).find((event) => event.name === 'bridge_ui_command_accepted' && event.commandId === rubCommand.commandId && event.actionId === 'item.rub');
    assert('bridge accepted item.rub ui-command', acceptedBridgeEvent, JSON.stringify(afterRub.bridgeUiEvents || []));
    assert('bridge did not reject item.rub ui-command', !(afterRub.bridgeUiEvents || []).some((event) => event.name === 'bridge_ui_command_rejected' && event.commandId === rubCommand.commandId), JSON.stringify(afterRub.bridgeUiEvents || []));
    assert('item.rub route command is exactly #rub\\n', rubCommand.payload?.route?.command === '#rub\n', JSON.stringify(rubCommand));
    assert('item.rub prompt policy is NetHack-owned follow-up', rubCommand.payload?.promptPolicy === 'netHack-owned-followup', JSON.stringify(rubCommand));
    assert('item.rub carries public inventory target', rubCommand.targets?.location?.kind === 'inventory' && rubCommand.targets?.selector, JSON.stringify(rubCommand));
    assert('item.rub did not auto-answer selected lamp selector after #rub', !new RegExp(`#rub\\n${rubCommand.targets.selector}`).test(afterRub.sent), JSON.stringify({ sent: afterRub.sent, target: rubCommand.targets }));
    const transactionBytes = (afterRub.sentPayloads || [])
      .filter((payload) => payload.uiProtocolActionId === 'item.rub' && payload.uiProtocolCommandId === rubCommand.commandId)
      .sort((a, b) => (a.commandPosition || 0) - (b.commandPosition || 0))
      .map((payload) => String.fromCharCode(payload.keycode || 0))
      .join('');
    assert('item.rub native transaction key bytes are exactly #rub\\n', transactionBytes === '#rub\n', JSON.stringify({ transactionBytes, sentPayloads: afterRub.sentPayloads }));
    assertNoHiddenIdentityFields(rubCommand);

    const sidecar = {
      scenarioId,
      invocation: `NH_ELECTRON_TEST_FIXTURES=1 NH_TEST_SCENARIO_ID=${scenarioId} NH_RUB_INVENTORY_OUT_DIR=${path.relative(root, outDir)} npm run test:real-scenario-rub-inventory-mcp`,
      rows: inventoryReady.rowActions,
      rockContext: { row: rockRow, menu: rockContext.contextMenu },
      markerContext: { row: markerRow, menu: markerContext.contextMenu },
      towelContext: { row: towelRow, menu: towelContext.contextMenu },
      lampContext: { row: lampRow, menu: lampContext.contextMenu },
      afterRub: { sent: afterRub.sent, transactionBytes, dialog: afterRub.dialog, command: rubCommand, sentPayloads: afterRub.sentPayloads, bridgeUiEvents: afterRub.bridgeUiEvents || [], seenShim: afterRub.seenShim || '', bridgeAccepted: Boolean(acceptedBridgeEvent), bridgeRejected: (afterRub.bridgeUiEvents || []).some((event) => event.name === 'bridge_ui_command_rejected' && event.commandId === rubCommand.commandId) },
      screenshots: { inventoryShot, rockContextShot, markerContextShot, towelContextShot, lampContextShot, promptShot },
    };
    fs.writeFileSync(path.join(outDir, 'rub-inventory-state.json'), JSON.stringify(sidecar, null, 2));
  } catch (error) {
    scenarioError = error;
  } finally {
    await finishEvidence(page, evidenceQc, scenarioError);
  }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
