const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');

const root = path.resolve(__dirname, '..');
const width = 1360;
const height = 920;
const { delay, waitFor } = Harness;
const scenarioId = 'object/gray-stone-public-rub-candidates';

async function evalExpr(cdp, expression) { return cdp.evalCheckedValue(expression, { awaitPromise: true }); }
async function shot(cdp, name) {
  const capture = await cdp.screenshotEvidence(cdp.qc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width, height, zoomPercent: 100 }, state: name, viewSafeFormat: 'BMP', viewSafeScale: 0.25 });
  return capture.raw.path;
}
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
async function rightClickFirstGrayStone(cdp) {
  const box = await evalExpr(cdp, `(() => { const rows = Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')); const el = rows.find((row) => /\\ba gray stone\\b/i.test(row.innerText || '')); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2,text:el.innerText,key:el.dataset.key || ''} : null; })()`);
  if (!box) throw new Error('missing public gray stone inventory row');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'right', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'right', clickCount: 1 });
  return box;
}
let assertionOutcomes = null;
function assert(name, ok, detail = '') {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const outcome = { id, status: ok ? 'passed' : 'failed', details: ok ? '' : detail };
  const existing = assertionOutcomes?.find((entry) => entry.id === id);
  if (existing) Object.assign(existing, outcome); else assertionOutcomes?.push(outcome);
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}
async function state(cdp) {
  return evalExpr(cdp, `(() => ({
    dialog: window.__nethackPromptTest?.dialog?.() || {},
    messages: window.__nethackPromptTest?.messages?.().slice(-20).map((message) => message.text || String(message)) || [],
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    sentPayloads: window.__nethackPromptTest?.sentPayloads?.() || [],
    sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    body: document.body.innerText,
    contextMenu: document.querySelector('.inventory-context-menu')?.innerText || '',
    seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
    shim: document.getElementById('shim-output')?.innerText || '',
    bridgeUiEvents: (document.getElementById('shim-output')?.innerText || '').split('\\n').map((line) => { try { return JSON.parse(line).event; } catch { return null; } }).filter((event) => event && /^bridge_ui_command_/.test(event.name || '')),
    grayRows: Array.from(document.querySelectorAll('#interaction-options .rpg-inventory-row')).filter((row) => /\\bgray stone\\b/i.test(row.innerText || '')).map((row) => ({ text: row.innerText, key: row.dataset.key || '', tileId: row.querySelector('[data-tile-id]')?.dataset.tileId || '' }))
  }))()`);
}
async function start(cdp) {
  await cdp.startDefaultGame({ timeoutMs: 25000, playerName: 'BatchBProof' });
  await cdp.dismissIntroDialogs();
    await delay(500);
    await cdp.dismissIntroDialogs();
}
function assertNoHiddenIdentityFields(command) {
  const serialized = JSON.stringify(command || {});
  for (const forbidden of ['trueName', 'baseType', 'objectType', 'otyp', 'beatitude', 'buc', 'cursed', 'blessed', 'enchantment', 'charges', 'trapState', 'contents', 'locked', 'trapped', 'broken', 'flint', 'touchstone', 'luckstone', 'loadstone']) {
    assert(`v2 command omits hidden field/name ${forbidden}`, !serialized.toLowerCase().includes(forbidden.toLowerCase()), serialized);
  }
}

function reviewRun(outputDir, reviewFile) {
  const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json');
  const approval = EvidenceApproval.openEvidenceApproval({ manifestFile });
  EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile));
  const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true });
  if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(manifestFile);
  console.log(`real-scenario-gray-stone-public-rub-mcp-test: APPROVED ${approval.runIdentity} ${manifestFile}`);
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
    env: { NH_ELECTRON_TEST_FIXTURES: '1', NH_TEST_SCENARIO_ID: scenarioId, NETHACK_SEED: '424242', NETHACKOPTIONS: '!tutorial,!autopickup' },
  });
  const outDir = page.outputDir;
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir: outDir, runIdentity: page.outputIdentity, manifestFile: path.join(outDir, 'evidence-approval.json') });
  const cdp = Object.freeze({ ...page, qc });
  const outcomes = [];
  if (typeof assertionOutcomes !== 'undefined') assertionOutcomes = outcomes;
  let scenarioError = null;
  try {
    await start(cdp);
    await waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return /bridge_test_scenario_loaded/.test(`${s.seenShim}\n${s.shim}`) ? s : null; }, 10000);
    
    await press(cdp, 'i', 'KeyI', 'i');
    const inventoryReady = await waitFor(async () => { const s = await state(cdp); return s.grayRows.length === 4 ? s : null; }, 10000);
    assert('all gray rows are public text only', inventoryReady.grayRows.every((row) => /\ba gray stone\b/i.test(row.text) && !/flint|touchstone|luckstone|loadstone|quiver pouch/i.test(row.text)), JSON.stringify(inventoryReady.grayRows));
    assert('gray rows use one public/appearance tile id', new Set(inventoryReady.grayRows.map((row) => row.tileId)).size === 1, JSON.stringify(inventoryReady.grayRows));
    assert('gray rows do not use identity tile ids', !/flint|touchstone|luckstone|loadstone/i.test(JSON.stringify(inventoryReady.grayRows)), JSON.stringify(inventoryReady.grayRows));
    const inventoryShot = await shot(cdp, '01-public-gray-stone-inventory.png');
    
    const grayRow = await rightClickFirstGrayStone(cdp);
    await waitFor(async () => /^Rub$/im.test((await state(cdp)).contextMenu), 5000);
    const context = await state(cdp);
    assert('public gray stone exposes Rub', /^Rub$/im.test(context.contextMenu), context.contextMenu);
    assert('context menu omits hidden gray-stone identities', !/flint|touchstone|luckstone|loadstone/i.test(context.contextMenu), context.contextMenu);
    const contextShot = await shot(cdp, '02-public-gray-stone-context-rub.png');
    
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await click(cdp, '.inventory-context-menu [data-action-id="item.rub"]');
    const afterRub = await waitFor(async () => {
      const s = await state(cdp);
      if (!/#rub\n$/.test(s.sent)) return null;
      return /What do you want to rub/i.test(`${s.dialog.prompt}\n${s.body}`) ? s : null;
    }, 10000);
    const promptShot = await shot(cdp, '03-after-public-gray-stone-rub-prompt.png');
    const rubCommand = afterRub.sentUiProtocolCommands.find((command) => command.commandType === 'action.execute' && command.actionId === 'item.rub');
    assert('item.rub v2 command recorded', rubCommand, JSON.stringify(afterRub.sentUiProtocolCommands));
    const acceptedBridgeEvent = (afterRub.bridgeUiEvents || []).find((event) => event.name === 'bridge_ui_command_accepted' && event.commandId === rubCommand.commandId && event.actionId === 'item.rub');
    assert('bridge accepted item.rub ui-command', acceptedBridgeEvent, JSON.stringify(afterRub.bridgeUiEvents || []));
    assert('item.rub route command is exactly #rub\\n', rubCommand.payload?.route?.command === '#rub\n', JSON.stringify(rubCommand));
    assert('NetHack-owned rub prompt wrapper is visible', /What do you want to rub/i.test(`${afterRub.dialog.prompt}\n${afterRub.body}`), JSON.stringify(afterRub.dialog));
    assertNoHiddenIdentityFields(rubCommand);
    
    const sidecar = { scenarioId, grayRows: inventoryReady.grayRows, grayRow, contextMenu: context.contextMenu, afterRub: { sent: afterRub.sent, dialog: afterRub.dialog, command: rubCommand, bridgeAccepted: Boolean(acceptedBridgeEvent), bridgeUiEvents: afterRub.bridgeUiEvents || [] }, screenshots: { inventoryShot, contextShot, promptShot } };
    fs.writeFileSync(path.join(outDir, 'gray-stone-public-rub-state.json'), JSON.stringify(sidecar, null, 2));
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
  console.log(`real-scenario-gray-stone-public-rub-mcp-test: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (scenarioError) throw scenarioError;
}

const reviewIndex = process.argv.indexOf('--review');
if (reviewIndex !== -1) {
  Promise.resolve().then(() => reviewRun(process.argv[reviewIndex + 1], process.argv[reviewIndex + 2])).catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exit(1); });
}
