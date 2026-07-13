const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');
const outDir = process.env.NH_UXM01_REAL_EVIDENCE_DIR || path.join(root, 'test-output', 'uxm01-real-game-focus-save-mainstream-revision');
const port = Number(process.env.NH_UXM01_REAL_CDP_PORT || 19810);
const { waitFor, delay } = Harness;

function isolatedPlayground() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'uxm01-real-focus-save-'));
  fs.cpSync(path.join(repo, 'playground'), target, { recursive: true, filter: (entry) => !/[a-z]lock\.0$/i.test(path.basename(entry)) });
  return target;
}
function assert(name, condition, detail = '') { if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }
async function state(page) {
  return page.evalCheckedValue(`(() => ({
    running:Boolean(window.__nethackAutomation?.state?.().runningState?.running),
    dialogs:Array.from(document.querySelectorAll('dialog[open]')).map((node)=>node.id),
    dialog:window.__nethackPromptTest?.dialog?.()||{},
    active:{id:document.activeElement?.id||'',stableId:document.activeElement?.dataset?.stableId||'',text:document.activeElement?.innerText?.trim?.()||'',insideDialog:Boolean(document.activeElement?.closest?.('dialog,[role="dialog"]'))},
    focusStack:window.NetHackUxRuntime?.runtime?.service?.('dialog')?.focus?.snapshot?.()||[],
    notice:document.getElementById('ux-player-notice')?.innerText||'',
    noticeHistory:(window.NetHackUxRuntime?.runtime?.service?.('notice')?.history?.()||[]).map((entry)=>({id:entry.notice?.id||entry.id||'',message:entry.notice?.message||entry.message||'',kind:entry.notice?.kind||entry.kind||''})),
    sent:window.__nethackPromptTest?.sentInputs?.().join('')||'',
    rows:Array.from(document.querySelectorAll('#interaction-options .choice-button')).filter((node)=>!node.hidden).map((node)=>({stableId:node.dataset.stableId||'',key:node.dataset.key||'',text:node.innerText.trim(),disabled:node.disabled})),
    context:{open:Boolean(document.querySelector('.inventory-context-menu')),text:document.querySelector('.inventory-context-menu')?.innerText||''},
    messages:(window.__nethackPromptTest?.messages?.()||[]).slice(-20).map((entry)=>entry.text||String(entry)),
    body:document.body.innerText,
  }))()`);
}
async function keyWithModifiers(page, key, code, modifiers = 0, text = '') {
  const vk = key === 'F10' ? 121 : key === 'Tab' ? 9 : (key.length === 1 ? key.toUpperCase().charCodeAt(0) : key === 'Escape' ? 27 : key === 'Enter' ? 13 : 0);
  await page.send('Input.dispatchKeyEvent', { type:'keyDown', key, code, modifiers, windowsVirtualKeyCode:vk, nativeVirtualKeyCode:vk, text });
  await page.send('Input.dispatchKeyEvent', { type:'keyUp', key, code, modifiers, windowsVirtualKeyCode:vk, nativeVirtualKeyCode:vk });
}
async function capture(page, qc, id, stateName) {
  return page.screenshotEvidence(qc, `real-game-${id}`, { viewport:{width:1360,height:920,devicePixelRatio:1,zoomPercent:100}, state:`REAL GAME/CORE ${stateName}`, viewSafeFormat:'BMP', viewSafeScale:0.25 });
}
async function chooseFirstHelpTopic(page) {
  const opened = await waitFor(async () => { const current=await state(page); return current.dialog.documentOpen || (current.dialogs.includes('interaction-dialog') && /Help/i.test(current.dialog.title||'')) ? current : null; }, 10000);
  if (opened.dialog.documentOpen) return opened;
  const key = opened.rows.find((row)=>row.key && row.key !== '\u001b')?.key || 'a';
  await keyWithModifiers(page, key, `Key${key.toUpperCase()}`, 0, key);
  await keyWithModifiers(page, 'Enter', 'Enter');
  return waitFor(async () => { const current=await state(page); return current.dialog.documentOpen ? current : null; }, 10000);
}

async function main() {
  fs.rmSync(outDir, { recursive:true, force:true });
  fs.mkdirSync(outDir, { recursive:true });
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir:outDir });
  const playground = isolatedPlayground();
  const saveDir = path.join(playground, 'save');
  const saveDirBackup = path.join(playground, 'save-real-path-backup');
  function restoreSaveDirectory() {
    if (fs.existsSync(saveDir) && fs.statSync(saveDir).isFile()) fs.rmSync(saveDir, { force:true });
    if (fs.existsSync(saveDirBackup) && !fs.existsSync(saveDir)) fs.renameSync(saveDirBackup, saveDir);
  }
  const evidence = { schema:'uxm01-real-game-focus-save/v2', revisionBasis:'NetHack UX Modernization Developer Breakout Master Plan, UXM-2026-07-11; SHA-256 51e077cdb244b3ef245f1a5af19a140f12e2f3889a38504cb03e6abeb37acea8', evidenceKind:'REAL Electron + real NetHack core in a test-gated scenario. Inventory, item prompt, focus, uppercase S, cancellation, deliberate real save-directory failure, confirmation, and save acknowledgement use actual player inputs. Only the separately labeled fallback supplement injects renderer events.', scenario:'identity/valkyrie-equipped-inventory', checks:{}, screenshots:{}, focus:{}, save:{} };
  const page = await Harness.createElectronBrowserDriver({ root, port, width:1360, height:920, env:{ NH_ELECTRON_TEST_FIXTURES:'1', NH_TEST_SCENARIO_ID:evidence.scenario, NH_TEST_PLAYGROUND:playground, NETHACKDIR:playground, NH_SHIM_RESET_LOCKS:'1', NETHACK_SEED:'424242' } });
  try {
    await page.waitForRendererReady({ timeoutMs:10000, promptTest:true, automation:true, startButton:true });
    await page.send('Page.bringToFront'); await page.send('Emulation.setFocusEmulationEnabled', { enabled:true });
    await page.startDefaultGame({ timeoutMs:20000, playerName:'UxFocusSave' });
    await waitFor(async () => (await state(page)).running, 20000);
    evidence.diagnostic = await page.evalCheckedValue('window.netHackPOC.activeDiagnosticRun()', { awaitPromise:true }).catch((error)=>({ok:false,error:error.message}));
    if ((await state(page)).dialogs.includes('intro-dialog')) await page.click('#intro-continue');
    await waitFor(async () => !(await state(page)).dialogs.includes('intro-dialog'), 5000);

    await page.evalCheckedValue(`document.getElementById('game-grid').focus(); window.__nethackPromptTest.clearSentInputs(); true`);
    await page.pressKey('i');
    let inventory = await waitFor(async () => { const current=await state(page); return current.dialogs.includes('interaction-dialog') && current.rows.length >= 2 ? current : null; }, 10000);
    evidence.screenshots.inventory = await capture(page, qc, 'inventory-focus-surface', 'actual player i command opened inventory focus surface');
    const firstStable = inventory.rows[0].stableId;
    for (let attempt=0; attempt<80 && !(await state(page)).active.stableId; attempt+=1) { await keyWithModifiers(page, 'Tab', 'Tab'); await delay(40); }
    assert('Tab reaches a real inventory row', Boolean((await state(page)).active.stableId), JSON.stringify((await state(page)).active));
    await page.pressKey('ArrowDown');
    const nonFirst = await state(page);
    assert('ArrowDown focuses a non-first real inventory row', nonFirst.active.stableId && nonFirst.active.stableId !== firstStable, JSON.stringify(nonFirst.active));
    const nonFirstStable = nonFirst.active.stableId;
    await keyWithModifiers(page, 'F10', 'F10', 8);
    const context = await waitFor(async () => { const current=await state(page); return current.context.open ? current : null; }, 5000);
    evidence.screenshots.context = await capture(page, qc, 'inventory-non-first-context', 'non-first inventory row Shift+F10 context');
    await page.pressKey('Escape');
    const afterContext = await waitFor(async () => { const current=await state(page); return !current.context.open ? current : null; }, 5000);
    evidence.focus.nonFirstContext = { stableId:nonFirstStable, afterClose:afterContext.active };
    assert('closing context restores exact non-first row', afterContext.active.stableId === nonFirstStable, JSON.stringify(afterContext.active));
    await page.pressKey('Escape');
    const afterInventory = await waitFor(async () => { const current=await state(page); return !current.dialogs.includes('interaction-dialog') ? current : null; }, 5000);
    assert('nested close sequence ends on map and only the core-cancel Escape is sent', afterInventory.active.id === 'game-grid' && afterInventory.sent === 'i\u001b', JSON.stringify(afterInventory));
    evidence.focus.nestedClose = { contextDepth:context.focusStack.length, afterContextDepth:afterContext.focusStack.length, afterInventoryDepth:afterInventory.focusStack.length, finalActive:afterInventory.active, sent:afterInventory.sent };
    await delay(600);
    const mapFallback = afterInventory;
    evidence.focus.mapFallback = mapFallback.active;

    await page.evalCheckedValue(`window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus(); true`);
    await page.pressKey('T');
    const coreSingleSelect = await waitFor(async () => { const current=await state(page); return current.dialogs.includes('interaction-dialog') && current.rows.length >= 1 && /take off|choose an item/i.test(`${current.dialog.title || ''}\n${current.dialog.prompt || ''}\n${current.notice}`) ? current : null; }, 10000);
    evidence.realCoreSingleSelect = coreSingleSelect;
    evidence.screenshots.coreSingleSelect = await capture(page, qc, 'core-single-select', 'actual player uppercase T command opened the real core item prompt');
    await page.pressKey('Escape');
    await waitFor(async () => !(await state(page)).dialogs.includes('interaction-dialog'), 5000);

    async function openSaveConfirmation() {
      await page.click('#open-actions');
      await page.click('#system-actions [data-command-key="S"]');
      return waitFor(async () => { const current=await state(page); return current.dialogs.includes('interaction-dialog') && /save/i.test(`${current.dialog.title || ''}\n${current.body}`) ? current : null; }, 10000);
    }
    async function activateSaveChoice(key) {
      await page.evalCheckedValue(`(() => { const button=document.querySelector('#interaction-options .choice-button[data-key=${JSON.stringify(key)}]'); if(!button) throw new Error('missing visible Save choice'); button.click(); return true; })()`);
    }

    await page.evalCheckedValue(`window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus(); true`);
    evidence.save.cancelBefore = await openSaveConfirmation();
    fs.writeFileSync(path.join(outDir, 'save-after-activation-debug.json'), `${JSON.stringify(evidence.save.cancelBefore,null,2)}\n`);
    evidence.screenshots.savePending = await capture(page, qc, 'save-awaiting-core', 'uppercase S confirmation before cancellation or core acknowledgement');
    assert('no success is shown before core acknowledgement', !/Game saved/i.test(evidence.save.cancelBefore.notice), evidence.save.cancelBefore.notice);
    await activateSaveChoice('n');
    evidence.save.cancelled = await waitFor(async () => { const current=await state(page); return !current.dialogs.includes('interaction-dialog') && current.running ? current : null; }, 5000).catch(async (error) => {
      const current = await state(page);
      fs.writeFileSync(path.join(outDir, 'save-cancel-timeout-debug.json'), `${JSON.stringify({ error:error.message, current }, null, 2)}\n`);
      throw error;
    });
    assert('real Escape cancellation does not show Save success', !evidence.save.cancelled.noticeHistory.some((entry)=>entry.message === 'Game saved'), JSON.stringify(evidence.save.cancelled.noticeHistory));

    fs.renameSync(saveDir, saveDirBackup);
    fs.writeFileSync(saveDir, 'test-owned save failure blocker\n');
    await page.evalCheckedValue(`window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus(); true`);
    evidence.save.failureBefore = await openSaveConfirmation();
    await activateSaveChoice('y');
    await waitFor(async () => (await state(page)).messages.some((message)=>/Saving\.\.\./.test(message)) ? true : null, 10000);
    evidence.save.failed = await waitFor(async () => {
      const current = await state(page);
      if (/Cannot open save file/i.test(current.messages.join('\n')) && /Cannot save the game/i.test(current.notice)) return current;
      return null;
    }, 10000).catch(async (error) => {
      const current = await state(page);
      fs.writeFileSync(path.join(outDir, 'save-failure-timeout-debug.json'), `${JSON.stringify({ error:error.message, current }, null, 2)}\n`);
      throw error;
    });
    evidence.screenshots.saveFailed = await capture(page, qc, 'save-core-rejected', 'real core save failure after a unique test-owned directory blocked the save-file path');
    restoreSaveDirectory();
    assert('real core save failure PlayerNotice itself stays visible and has no false success', /Cannot save the game/i.test(evidence.save.failed.notice) && !evidence.save.failed.noticeHistory.some((entry)=>entry.message === 'Game saved'), JSON.stringify(evidence.save.failed));

    await page.evalCheckedValue(`window.__nethackPromptTest.clearSentInputs(); document.getElementById('game-grid').focus(); true`);
    evidence.save.acceptBefore = await openSaveConfirmation();
    await activateSaveChoice('y');
    await waitFor(async () => (await state(page)).messages.some((message)=>/Saving\.\.\./.test(message)) ? true : null, 10000);
    await page.pressKey(' ');
    await delay(250);
    fs.writeFileSync(path.join(outDir, 'save-after-confirm-debug.json'), `${JSON.stringify(await state(page),null,2)}\n`);
    const saved = await waitFor(async () => { const current=await state(page); return current.noticeHistory.some((entry)=>entry.message === 'Game saved') ? current : null; }, 20000, 25);
    evidence.save.accepted = saved;
    evidence.screenshots.saveAccepted = await capture(page, qc, 'save-core-acknowledged', 'Game saved only after real core acknowledgement');
    evidence.checks.realSaveUsesUppercaseS = /S/.test(saved.sent) || saved.noticeHistory.some((entry)=>/saved/.test(entry.id));
    evidence.checks.realSaveCancelledWithoutSuccess = evidence.save.cancelled.running && !evidence.save.cancelled.noticeHistory.some((entry)=>entry.message === 'Game saved');
    evidence.checks.realSaveFailureWithoutSuccess = /Cannot open save file/i.test(evidence.save.failed.messages.join('\n')) && !evidence.save.failed.noticeHistory.some((entry)=>entry.message === 'Game saved');
    evidence.checks.realSaveAcknowledged = saved.noticeHistory.some((entry)=>entry.message === 'Game saved');
    evidence.checks.realSaveHasTypedId = saved.noticeHistory.some((entry)=>/saved/.test(entry.id));

    // Supplemental synthetic fault injection. It is deliberately not presented as real gameplay proof.
    evidence.save.syntheticSupplement = await page.evalCheckedValue(`(() => {
      const t=window.__nethackPromptTest; t.reset(); t.setRunning(true); t.clearSentInputs();
      const before=(window.NetHackUxRuntime.runtime.service('notice').history()||[]).length;
      t.event({name:'bridge_command',keycode:83,transactionId:'synthetic-save-failed'});
      t.event({name:'bridge_unsupported_command',keycode:83,transactionId:'synthetic-save-failed',reason:'synthetic storage failure'});
      const failed={sent:t.sentInputs().join(''),notice:document.getElementById('ux-player-notice')?.textContent||'',history:(window.NetHackUxRuntime.runtime.service('notice').history()||[]).slice(before)};
      t.reset(); t.setRunning(true); t.clearSentInputs();
      const beforeCancel=(window.NetHackUxRuntime.runtime.service('notice').history()||[]).length;
      t.event({name:'bridge_command',keycode:83,transactionId:'synthetic-save-cancelled'});
      t.event({name:'shim_yn_function',query:'Really save?',choices:'yn\\u001b',requestId:'synthetic-save-cancelled'});
      document.getElementById('interaction-cancel')?.click();
      const cancelled={sent:t.sentInputs().join(''),notice:document.getElementById('ux-player-notice')?.textContent||'',history:(window.NetHackUxRuntime.runtime.service('notice').history()||[]).slice(beforeCancel)};
      return {evidenceKind:'SYNTHETIC/INJECTED renderer fault supplement',failed,cancelled};
    })()`);
    evidence.checks.syntheticFailedHasNoFalseSuccess = !/Game saved/i.test(JSON.stringify(evidence.save.syntheticSupplement.failed));
    evidence.checks.syntheticCancelledHasNoFalseSuccess = !/Game saved/i.test(JSON.stringify(evidence.save.syntheticSupplement.cancelled));

    evidence.checks.realInventoryFocusSurface = inventory.rows.length >= 2 && inventory.dialogs.includes('interaction-dialog');
    evidence.checks.realCoreSingleSelect = coreSingleSelect.rows.length >= 1 && coreSingleSelect.sent.startsWith('T');
    evidence.checks.realNonFirstContextReturn = afterContext.active.stableId === nonFirstStable;
    evidence.checks.realNestedCloseSequence = context.focusStack.length >= 2 && afterContext.focusStack.length >= 1 && afterInventory.focusStack.length === 0;
    evidence.checks.realMapFallback = mapFallback.active.id === 'game-grid';
  } finally {
    const output = page.output();
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), output.stdout);
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), output.stderr);
    restoreSaveDirectory();
    await page.close().catch(()=>{});
    fs.rmSync(playground, { recursive:true, force:true });
  }
  if (evidence.diagnostic?.diagnostic?.runDir) {
    const diagnosticSummary = path.join(evidence.diagnostic.diagnostic.runDir, 'summary.json');
    if (fs.existsSync(diagnosticSummary)) {
      evidence.diagnostic.finalSummary = JSON.parse(fs.readFileSync(diagnosticSummary, 'utf8'));
      fs.copyFileSync(diagnosticSummary, path.join(outDir, 'diagnostic-summary.json'));
    }
  }
  evidence.qc = Harness.screenshotQc.validateManifest(qc.manifestFile);
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(evidence,null,2)}\n`);
  const failed = Object.entries(evidence.checks).filter(([,value])=>!value).map(([name])=>name);
  console.log(`# UXM-01 real focus/save evidence\n\n${failed.length ? `FAIL: ${failed.join(', ')}` : 'PASS'}\nOutput: ${outDir}`);
  if (failed.length) throw new Error(`real focus/save evidence failed: ${failed.join(', ')}`);
}
main().catch((error)=>{console.error(error.stack||error);process.exit(1);});
