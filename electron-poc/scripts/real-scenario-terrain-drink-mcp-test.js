const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');



const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');
function reviewRun(outputDir, reviewFile) { const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json'); const approval = EvidenceApproval.openEvidenceApproval({ manifestFile }); EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile)); const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true }); if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(manifestFile); console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`); }
function createEvidence(page) { return Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') }); }
async function finishEvidence(page, qc, scenarioError) {
  let terminalError = scenarioError;
  await page.close().catch((error) => { if (!terminalError) terminalError = error; });
  qc.recordAssertions([{ id: 'scenario-contract', status: terminalError ? 'failed' : 'passed', details: terminalError?.message || '' }]);
  qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' });
  qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' });
  const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`);
  EvidenceApproval.writeEvidenceReport(qc.manifestFile);
  console.log(`${scriptName}: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`);
  if (terminalError) throw terminalError;
}
function resolveOutDir(value) { return path.isAbsolute(value) ? value : path.join(root, value); }
let outDir, evidencePage, evidenceQc
const scenarioId = process.env.NH_TEST_SCENARIO_ID || 'terrain/fountain-dip-current';
const isSink = /(?:^|\/)sink-current$/.test(scenarioId);





async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { return evidencePage.screenshotEvidence(evidenceQc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width: 1360, height: 920, devicePixelRatio: 1 }, state: path.basename(name, path.extname(name)) }); }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function pressSpace(cdp) { await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ', unmodifiedText: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }







async function state(cdp) { return evalExpr(cdp, `(() => ({
  dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
  actions: window.__nethackPromptTest?.contextActions?.(),
  sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
  sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
  prompt: window.__nethackPromptTest?.prompt?.() || null,
  dialog: window.__nethackPromptTest?.dialog?.() || null,
  messages: window.__nethackPromptTest?.messages?.().slice(-24).map((m) => m.text || String(m)) || [],
  status: document.getElementById('status')?.textContent || '',
  body: document.body.innerText,
  running: window.__nethackAutomation?.state?.().runningState?.running || false,
  seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
  shim: document.getElementById('shim-output')?.innerText || '',
  heroCell: (() => { const el = document.querySelector('.tile-cell.hero, .tile-cell.player, .tile-cell[data-is-hero="true"]') || document.querySelector('.tile-cell[aria-label*="fountain" i]'); return el ? { text: el.textContent, aria: el.getAttribute('aria-label') || '', className: el.className, tileId: el.dataset.tileId || '', semanticName: el.dataset.semanticName || '' } : null; })()
}))()`); }
async function saveState(cdp, name) { const s = await state(cdp); fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(s, null, 2)); return s; }
async function start(cdp) {
  if (await evalExpr(cdp, `Boolean(document.getElementById('startup-choice-dialog')?.open)`)) await click(cdp, '#startup-new-game');
  else await click(cdp, '#start-shim');
  await Harness.waitFor(async () => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 7000);
  await evalExpr(cdp, `(() => { const input = document.getElementById('player-name'); input.value = 'TerrainTester'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click(cdp, '#confirm-character');
  await Harness.waitFor(async () => { const s = await state(cdp); if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim); return s.running ? s : null; }, 20000).catch(async (error) => { const debug = await saveState(cdp, 'debug-start-timeout-state').catch(() => ({})); await shot(cdp, 'debug-start-timeout.png').catch(() => undefined); throw new Error(`${error.message}\n${JSON.stringify(debug).slice(0, 3000)}`); });
  const maybeIntro = await state(cdp);
  if (maybeIntro.dialogs.includes('intro-dialog')) await click(cdp, '#intro-continue');
  else if (/Go bravely|Book of Tyr/i.test(maybeIntro.body || '')) await pressSpace(cdp);
  await Harness.waitFor(async () => { const s = await state(cdp); return !s.dialogs.includes('intro-dialog') && s.running ? s : null; }, 8000);
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
      NETHACK_SEED: '606071',
      NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none,terrainstatus',
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
    const actionId = isSink ? 'drink-sink' : 'drink-fountain';
    const terrainLabel = isSink ? 'sink' : 'fountain';
    const loaded = await Harness.waitFor(async () => { const s = await state(cdp); const trace = `${s.seenShim}\n${s.shim}`; if (/bridge_test_scenario_failed|Too many hacks running now|Cannot get lock/i.test(trace)) throw new Error(trace); return /bridge_test_scenario_loaded/.test(trace) || s.actions?.buttons?.some((b) => b.id === actionId) ? s : null; }, 10000).catch(async (error) => { const debug = await saveState(cdp, 'debug-scenario-readiness-state').catch(() => ({})); await shot(cdp, 'debug-scenario-readiness.png').catch(() => undefined); throw new Error(`${error.message}\n${JSON.stringify(debug).slice(0, 3000)}`); });
    assert('scenario loaded or exposed its fixture-specific context action', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`) || loaded.actions?.buttons?.some((b) => b.id === actionId), JSON.stringify(loaded.actions));
    const ready = await Harness.waitFor(async () => { const s = await state(cdp); return s.actions?.buttons?.some((b) => b.id === actionId && new RegExp(`Drink from ${terrainLabel}`, 'i').test(b.text || '')) ? s : null; }, 10000).catch(async (error) => { const debug = await saveState(cdp, 'debug-before-drink-action-timeout-state').catch(() => ({})); await shot(cdp, 'debug-before-drink-action-timeout.png').catch(() => undefined); throw new Error(`${error.message}\n${JSON.stringify(debug).slice(0, 2000)}`); });
    const contextShot = await shot(cdp, `00-${terrainLabel}-drink-context-actions.png`);
    fs.writeFileSync(path.join(outDir, '00-before-drink-state.json'), JSON.stringify(ready, null, 2));
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await click(cdp, `#context-action-bar button[data-context-action-id="${actionId}"]`);
    let afterDrink;
    if (isSink) {
      const sinkPrompt = await Harness.waitFor(async () => { const s = await state(cdp); return s.sent === 'q' && /drink from the sink/i.test(`${s.prompt?.query || ''}\n${s.dialog?.prompt || ''}`) ? s : null; }, 12000);
      if (sinkPrompt.prompt || sinkPrompt.dialog?.interactionOpen) await click(cdp, '#interaction-options .choice-button[data-key="y"]');
      afterDrink = await Harness.waitFor(async () => { const s = await state(cdp); return s.sent === 'qy' && s.messages.length > ready.messages.length ? s : null; }, 12000).catch(async (error) => { const debug = await saveState(cdp, 'debug-after-sink-confirm-state').catch(() => ({})); await shot(cdp, 'debug-after-sink-confirm.png').catch(() => undefined); throw new Error(`${error.message}\n${JSON.stringify(debug).slice(0, 3000)}`); });
    } else {
      afterDrink = await Harness.waitFor(async () => { const s = await state(cdp); return s.sentUiProtocolCommands.some((command) => command.commandType === 'terrain.action' && command.payload?.action === 'drink' && command.payload?.terrain === 'fountain') && /shim_terrain_action_confirmed/.test(s.shim || '') ? s : null; }, 12000);
    }
    const afterShot = await shot(cdp, `01-after-${terrainLabel}-drink.png`);
    fs.writeFileSync(path.join(outDir, '01-after-drink-state.json'), JSON.stringify(afterDrink, null, 2));
    if (isSink) {
      assert('sink drink uses the classic quaff command and visible confirmation flow', afterDrink.sent === 'qy' && !afterDrink.sentUiProtocolCommands.some((command) => command.commandType === 'terrain.action') && afterDrink.messages.length > ready.messages.length, JSON.stringify({ sent: afterDrink.sent, messages: afterDrink.messages, commands: afterDrink.sentUiProtocolCommands }));
    } else {
      assert('drink route is recorded as direct terrain.action', afterDrink.sentUiProtocolCommands.some((command) => command.commandType === 'terrain.action' && command.payload?.action === 'drink' && command.payload?.terrain === 'fountain'), JSON.stringify(afterDrink.sentUiProtocolCommands));
      assert('direct terrain drink sends no raw #drink, q, or classic key fallback', afterDrink.sent === '', JSON.stringify({ sent: afterDrink.sent }));
      assert('native bridge accepted direct terrain.action drink', /"name":"shim_terrain_action_accepted"[\s\S]*"action":"drink"/.test(afterDrink.shim || ''), (afterDrink.shim || '').slice(-3000));
      assert('native bridge confirmed direct terrain.action drink', /"name":"shim_terrain_action_confirmed"[\s\S]*"action":"drink"/.test(afterDrink.shim || ''), (afterDrink.shim || '').slice(-3000));
      assert('no Extended-command/menu answer for direct drink', !/bridge_extcmd_answer|bridge_menu_answer/i.test(afterDrink.shim || ''), (afterDrink.shim || '').slice(-3000));
    }
    assert('evidence has no disorder/internal errors', !/Program in disorder|Please report these messages|TypeError|ReferenceError|Unhandled|bridge_test_scenario_failed/i.test(`${afterDrink.body || ''}\n${afterDrink.shim || ''}`), `${afterDrink.body || ''}\n${afterDrink.shim || ''}`.slice(-2000));
  } catch (error) {
    scenarioError = error;
  } finally {
    await finishEvidence(page, evidenceQc, scenarioError);
  }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
