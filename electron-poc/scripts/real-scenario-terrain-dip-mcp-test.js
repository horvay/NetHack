const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const EvidenceApproval = require('./lib/evidence-approval');



const root = path.resolve(__dirname, '..');
const scriptName = path.basename(__filename, '.js');
function reviewRun(outputDir, reviewFile) { const manifestFile = path.join(path.resolve(outputDir), 'evidence-approval.json'); const approval = EvidenceApproval.openEvidenceApproval({ manifestFile }); EvidenceApproval.applyEvidenceReview(approval, path.resolve(reviewFile)); const validation = Harness.screenshotQc.validateManifest(manifestFile, { expectedRunIdentity: approval.runIdentity, requireApproval: true }); if (!validation.ok) throw new Error(`Evidence Approval failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(manifestFile); console.log(`${scriptName}: APPROVED ${approval.runIdentity} ${manifestFile}`); }
function createEvidence(page) { return Harness.screenshotQc.createScreenshotQc({ rootDir: page.outputDir, runIdentity: page.outputIdentity, manifestFile: path.join(page.outputDir, 'evidence-approval.json') }); }
async function finishEvidence(page, qc, scenarioError) { await page.close().catch(() => {}); qc.recordAssertions([{ id: 'scenario-contract', status: scenarioError ? 'failed' : 'passed', details: scenarioError?.message || '' }]); qc.recordLog({ id: 'electron-stdout', path: page.logs.stdout, classification: 'electron-stdout' }); qc.recordLog({ id: 'electron-stderr', path: page.logs.stderr, classification: 'electron-stderr' }); const validation = Harness.screenshotQc.validateManifest(qc.manifestFile, { expectedRunIdentity: page.outputIdentity, requireApproval: false }); if (!validation.ok) throw new Error(`Evidence Approval capture failed: ${validation.errors.join('; ')}`); EvidenceApproval.writeEvidenceReport(qc.manifestFile); console.log(`${scriptName}: CAPTURED ${page.outputIdentity} ${qc.manifestFile}`); if (scenarioError) throw scenarioError; }
function resolveOutDir(value) { return path.isAbsolute(value) ? value : path.join(root, value); }
let outDir, evidencePage, evidenceQc
const scenarioId = process.env.NH_TEST_SCENARIO_ID || 'terrain/fountain-dip-current';





async function evalExpr(cdp, expression) { const res = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails)); return res.result.value; }
async function shot(cdp, name) { return evidencePage.screenshotEvidence(evidenceQc, path.basename(name, path.extname(name)), { classification: 'synthetic-fixture', viewport: { width: 1360, height: 920, devicePixelRatio: 1 }, state: path.basename(name, path.extname(name)) }); }
async function click(cdp, selector) { const box = await evalExpr(cdp, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.scrollIntoView?.({block:'center', inline:'center'}); const r = el?.getBoundingClientRect(); return r ? {x:r.left+r.width/2,y:r.top+r.height/2} : null; })()`); if (!box) throw new Error(`missing selector ${selector}`); await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
async function pressKey(cdp, key) { const special = key === 'Escape' ? { code: 'Escape', keyCode: 27, text: '' } : (key === ' ' ? { code: 'Space', keyCode: 32, text: ' ' } : { code: `Key${key.toUpperCase()}`, keyCode: key.toUpperCase().charCodeAt(0), text: key }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: special.code, text: special.text, unmodifiedText: special.text, windowsVirtualKeyCode: special.keyCode, nativeVirtualKeyCode: special.keyCode }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: special.code, windowsVirtualKeyCode: special.keyCode, nativeVirtualKeyCode: special.keyCode }); }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }







async function state(cdp) {
  return evalExpr(cdp, `(() => ({
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id),
    actions: window.__nethackPromptTest?.contextActions?.(),
    sent: window.__nethackPromptTest?.sentInputs?.().join('') || '',
    sentPayloads: window.__nethackPromptTest?.sentPayloads?.() || [],
    sentUiProtocolCommands: window.__nethackPromptTest?.sentUiProtocolCommands?.() || [],
    prompt: window.__nethackPromptTest?.prompt?.() || null,
    interaction: window.__nethackPromptTest?.dialog?.(),
    messages: window.__nethackPromptTest?.messages?.().slice(-24).map((m) => m.text || String(m)) || [],
    promptPanel: { hidden: document.getElementById('prompt-panel')?.hidden, text: document.getElementById('prompt-panel')?.textContent || '' },
    menuPanel: { hidden: document.getElementById('menu-panel')?.hidden, text: document.getElementById('menu-panel')?.textContent || '' },
    status: document.getElementById('status')?.textContent || '',
    body: document.body.innerText,
    running: window.__nethackAutomation?.state?.().runningState?.running || false,
    seenShim: document.getElementById('shim-output')?.dataset?.seen || '',
    shim: document.getElementById('shim-output')?.innerText || '',
    heroCell: (() => { const el = document.querySelector('.tile-cell.hero, .tile-cell.player, .tile-cell[data-is-hero="true"]') || document.querySelector('.tile-cell[aria-label*="fountain" i]'); return el ? { text: el.textContent, aria: el.getAttribute('aria-label') || '', className: el.className, tileId: el.dataset.tileId || '', semanticName: el.dataset.semanticName || '' } : null; })()
  }))()`);
}
async function saveState(cdp, name) { const s = await state(cdp); fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(s, null, 2)); return s; }
async function start(cdp) {
  if (await evalExpr(cdp, `Boolean(document.getElementById('startup-choice-dialog')?.open)`)) await click(cdp, '#startup-new-game');
  else {
    await click(cdp, '#start-shim');
    await Harness.delay(250);
    if (await evalExpr(cdp, `Boolean(document.getElementById('startup-choice-dialog')?.open)`)) await click(cdp, '#startup-new-game');
  }
  await Harness.waitFor(() => evalExpr(cdp, `document.getElementById('character-dialog')?.open && !document.getElementById('confirm-character')?.disabled`), 7000);
  await evalExpr(cdp, `(() => { const input = document.getElementById('player-name'); if (input && !input.value) { input.value = 'DipFlow'; input.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
  await click(cdp, '#confirm-character');
  await Harness.waitFor(async () => {
    const s = await state(cdp);
    if (/bridge_test_scenario_failed/.test(`${s.seenShim}\n${s.shim}`)) throw new Error(s.shim);
    return s.running ? s : null;
  }, 20000);
  const maybeIntro = await state(cdp);
  if (maybeIntro.dialogs.includes('intro-dialog')) await click(cdp, '#intro-continue');
  else if (/Go bravely|Book of Tyr/i.test(maybeIntro.body || '')) await pressKey(cdp, ' ');
  await Harness.waitFor(async () => {
    const s = await state(cdp);
    return !s.dialogs.includes('intro-dialog') && s.running ? s : null;
  }, 8000);
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
      NETHACK_SEED: '606070',
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
    const loaded = await Harness.waitFor(async () => { const s = await state(cdp); const trace = `${s.seenShim}\n${s.shim}`; if (/bridge_test_scenario_failed|Too many hacks running now|Cannot get lock/i.test(trace)) throw new Error(trace); return /bridge_test_scenario_loaded/.test(trace) ? s : null; }, 10000).catch(async (error) => {
      const debug = await saveState(cdp, 'debug-scenario-loaded-timeout-state').catch(() => ({}));
      await shot(cdp, 'debug-scenario-loaded-timeout.png').catch(() => undefined);
      throw new Error(`${error.message}\n${JSON.stringify(debug).slice(0, 2000)}`);
    });
    assert('scenario loaded event visible', /bridge_test_scenario_loaded/.test(`${loaded.seenShim}\n${loaded.shim}`), loaded.shim.slice(-1000));
    const ready = await Harness.waitFor(async () => {
      const s = await state(cdp);
      return s.actions?.buttons?.some((b) => b.id === 'dip-terrain' && /Dip item in fountain/i.test(b.text || '')) ? s : null;
    }, 10000).catch(async (error) => {
      const debug = await saveState(cdp, 'debug-before-dip-action-timeout-state').catch(() => ({}));
      await shot(cdp, 'debug-before-dip-action-timeout.png').catch(() => undefined);
      throw new Error(`${error.message}\n${JSON.stringify(debug).slice(0, 2000)}`);
    });
    assert('fountain dip context action is visible', ready.actions?.buttons?.some((b) => b.id === 'dip-terrain' && /Dip item in fountain/i.test(b.text || '')), ready.actions?.text || '');
    assert('fountain terrain is visible in public UI on the current square', /fountain/i.test(`${ready.actions?.text || ''}\n${ready.body || ''}\n${JSON.stringify(ready.heroCell || {})}`), JSON.stringify(ready.heroCell));
    const contextShot = await shot(cdp, '00-fountain-context-actions.png');
    fs.writeFileSync(path.join(outDir, '00-before-dip-state.json'), JSON.stringify(ready, null, 2));
    await evalExpr(cdp, `window.__nethackPromptTest.clearSentInputs();`);
    await click(cdp, '#context-action-bar button[data-context-action-id="dip-terrain"]');
    const chooser = await Harness.waitFor(async () => {
      const s = await state(cdp);
      const visible = `${s.interaction?.title || ''}\n${s.interaction?.prompt || ''}\n${(s.interaction?.options || []).map((o) => `${o.label || ''} ${o.text || ''}`).join('\n')}`;
      return s.interaction?.interactionOpen && /Dip item in fountain/i.test(visible) && /potion|dagger/i.test(visible) ? s : null;
    }, 12000).catch(async (error) => {
      const debug = await saveState(cdp, 'debug-after-dip-chooser-timeout-state').catch(() => ({}));
      await shot(cdp, 'debug-after-dip-chooser-timeout.png').catch(() => undefined);
      throw new Error(`${error.message}\n${JSON.stringify(debug).slice(0, 2000)}`);
    });
    const chooserShot = await shot(cdp, '01-dip-public-item-chooser.png');
    fs.writeFileSync(path.join(outDir, '01-dip-chooser-state.json'), JSON.stringify(chooser, null, 2));
    await evalExpr(cdp, `(() => { const button = Array.from(document.querySelectorAll('#interaction-dialog button')).find((b) => /dagger|potion/i.test(b.textContent || '')); if (!button) throw new Error('missing public dip item button'); button.click(); })()`);
    const afterDip = await Harness.waitFor(async () => {
      const s = await state(cdp);
      return s.sentUiProtocolCommands.some((command) => command.commandType === 'terrain.action' && command.payload?.action === 'dip' && command.payload?.terrain === 'fountain' && command.payload?.itemId > 0) && /shim_terrain_action_confirmed/.test(s.shim || '') ? s : null;
    }, 12000).catch(async (error) => {
      const debug = await saveState(cdp, 'debug-after-direct-dip-timeout-state').catch(() => ({}));
      await shot(cdp, 'debug-after-direct-dip-timeout.png').catch(() => undefined);
      throw new Error(`${error.message}\n${JSON.stringify(debug).slice(0, 2000)}`);
    });
    const promptShot = await shot(cdp, '02-after-direct-terrain-dip.png');
    fs.writeFileSync(path.join(outDir, '02-after-dip-state.json'), JSON.stringify(afterDip, null, 2));
    assert('dip route is recorded as direct terrain.action with public itemId', afterDip.sentUiProtocolCommands.some((command) => command.commandType === 'terrain.action' && command.payload?.action === 'dip' && command.payload?.terrain === 'fountain' && command.payload?.itemId > 0), JSON.stringify(afterDip.sentUiProtocolCommands));
    assert('direct terrain dip sends no raw #dip newline', afterDip.sent === '', JSON.stringify({ sent: afterDip.sent }));
    assert('native bridge accepted direct terrain.action dip', /"name":"shim_terrain_action_accepted"[\s\S]*"action":"dip"/.test(afterDip.shim || ''), (afterDip.shim || '').slice(-3000));
    assert('native bridge confirmed direct terrain.action dip', /"name":"shim_terrain_action_confirmed"[\s\S]*"action":"dip"/.test(afterDip.shim || ''), (afterDip.shim || '').slice(-3000));
    assert('no Extended-command or hidden item selector answered for direct dip', !/bridge_extcmd_answer[\s\S]*dip|bridge_menu_answer[\s\S]*terrain-action/i.test(afterDip.shim || ''), (afterDip.shim || '').slice(-3000));
    const promptText = `${afterDip.interaction?.title || ''}\n${afterDip.interaction?.prompt || ''}\n${afterDip.body || ''}`;
    assert('direct terrain dip evidence does not predict hidden outcomes', !/will bless|will curse|prediction|predicted outcome/i.test(promptText), promptText.slice(0, 2000));
    assert('evidence has no disorder/internal errors', !/Program in disorder|Please report these messages|TypeError|ReferenceError|Unhandled|bridge_test_scenario_failed/i.test(`${promptText}\n${afterDip.shim || ''}`), `${promptText}\n${afterDip.shim || ''}`.slice(-2000));
  } catch (error) {
    scenarioError = error;
  } finally {
    await finishEvidence(page, evidenceQc, scenarioError);
  }
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
