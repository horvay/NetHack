const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');
const CommandGateway = require('../src/shared/command-gateway');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_UXM01_STALE_EVIDENCE_DIR || path.join(root, 'test-output', 'uxm01-real-stale-transfer');
const port = Number(process.env.NH_UXM01_STALE_CDP_PORT || 19821);
const scenario = 'container/unlocked-chest-on-hero';
const { waitFor, delay } = Harness;

function assert(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

async function state(page) {
  return page.evalCheckedValue(`(() => ({
    running:Boolean(window.__nethackAutomation?.state?.().runningState?.running),
    notice:document.getElementById('ux-player-notice')?.innerText||'',
    failure:window.__nethackPromptTest?.failureState?.()||{},
    panel:window.__nethackPromptTest?.container?.()||{},
    commands:window.__nethackPromptTest?.sentUiProtocolCommands?.()||[],
    acks:window.__nethackPromptTest?.sentUiProtocolAcks?.()||[],
    inventory:window.__nethackPromptTest?.inventory?.()||{},
    active:{id:document.activeElement?.id||'',stableId:document.activeElement?.dataset?.stableId||'',pane:document.activeElement?.closest?.('[data-container-pane]')?.dataset?.containerPane||''},
    lists:Array.from(document.querySelectorAll('#container-transfer-panel .container-item-list')).map((list)=>({pane:list.closest('[data-container-pane]')?.dataset?.containerPane||'',scrollTop:list.scrollTop,rows:Array.from(list.querySelectorAll('[data-stable-id]')).map((row)=>({stableId:row.dataset.stableId,disabled:row.disabled,text:row.innerText.trim()}))})),
    refreshVisible:Boolean(document.querySelector('#container-transfer-panel [data-transfer-refresh]:not([hidden])')),
    body:document.body.innerText,
  }))()`);
}

async function capture(page, qc, id, label) {
  return page.screenshotEvidence(qc, id, { viewport:{width:1360,height:920,devicePixelRatio:1,zoomPercent:100}, state:label, viewSafeFormat:'BMP', viewSafeScale:0.25 });
}

async function main() {
  fs.rmSync(outDir, { recursive:true, force:true });
  fs.mkdirSync(outDir, { recursive:true });
  const qc = Harness.screenshotQc.createScreenshotQc({ rootDir:outDir });
  const evidence = {
    schema:'uxm01-real-stale-transfer/v1',
    planSha256:'51e077cdb244b3ef245f1a5af19a140f12e2f3889a38504cb03e6abeb37acea8',
    evidenceKind:'REAL Electron actual scenario surface plus a test-directed action.execute IPC that is rejected by the real authoritative main-process command gateway. No renderer shim event or failure model is injected; the returned real rejection enters the production PlayerNotice/stale-lock path. This supplements focused controller nearest-row tests.',
    scenario,
    checks:{}, screenshots:{},
  };
  const page = await Harness.createElectronBrowserDriver({
    root, port, width:1360, height:920,
    env:{ NH_ELECTRON_TEST_FIXTURES:'1', NH_SHIM_RESET_LOCKS:'1', NH_TEST_SCENARIO_ID:scenario, NETHACK_SEED:'686868', NETHACKOPTIONS:'!tutorial,!autopickup,pettype:none' },
  });
  try {
    await page.waitForRendererReady({ timeoutMs:15000, promptTest:true, automation:true, startButton:true });
    await page.startDefaultGame({ timeoutMs:20000, playerName:'StaleTransfer' });
    await waitFor(async () => (await state(page)).running, 20000);
    await page.dismissIntroDialogs();
    await waitFor(async () => {
      const current = await state(page);
      return /Open chest/i.test(current.body) ? current : null;
    }, 10000);
    await page.click('#context-action-bar button[data-context-action-id="open-container"]');
    const opened = await waitFor(async () => {
      const current = await state(page);
      return current.panel.active && current.lists[0]?.rows?.length >= 2 && current.lists[1]?.rows?.length >= 1 ? current : null;
    }, 15000);
    await page.evalCheckedValue(`(() => { const rows=document.querySelectorAll('#container-transfer-panel [data-container-pane="left"] [data-stable-id]'); rows[1].focus({preventScroll:true}); const list=rows[1].closest('.container-item-list'); list.scrollTop=12; return true; })()`);
    const before = await state(page);
    const stableId = before.active.stableId;
    const baselineActionCount = before.commands.filter((command) => command.commandType === 'action.execute').length;
    const inventoryRevision = Math.max(2, Number(before.inventory.snapshotRevision || before.inventory.liveRevision || 2));
    const staleCommand = CommandGateway.createActionExecuteCommand({
      commandId:'uxm01-real-stale-transfer-command',
      transactionId:'uxm01-real-stale-transfer-transaction',
      action:{id:'item.drop',label:'Drop'},
      item:{selector:'z',text:'z - stale transfer row',objectId:987654321,actionAffordances:['drop']},
      route:{actionId:'item.drop',command:'dz',selector:'z',label:'Drop'},
      expectedRevision:{inventory:inventoryRevision - 1},
      source:'uxm01-real-stale-transfer-evidence',
      surface:'container-transfer',
    });
    const rejection = await page.evalCheckedValue(`window.__nethackPromptTest.recordAndSendNativeUiCommandForTest(${JSON.stringify(staleCommand)},'uxm01-real-stale-transfer-evidence')`, { awaitPromise:true });
    assert('real authoritative command gateway rejects the stale command', rejection.sent?.ok === false && rejection.sent?.blockerToken === 'blocked.input.staleRevision', JSON.stringify(rejection));
    const locked = await waitFor(async () => {
      const current = await state(page);
      return current.failure.kind === 'stale-revision' && current.refreshVisible && /That item moved/i.test(current.notice) ? current : null;
    }, 5000);
    await delay(400);
    const lockedSettled = await state(page);
    evidence.screenshots.locked = await capture(page, qc, 'real-container-stale-locked', 'REAL authoritative stale rejection on actual container transfer surface; visible Refresh list; rows locked');
    const actionCountAfterSettle = lockedSettled.commands.filter((command) => command.commandType === 'action.execute').length;
    evidence.checks.realGatewayStaleRejection = rejection.sent?.blockerToken === 'blocked.input.staleRevision';
    evidence.checks.visibleStaleNotice = /That item moved\. Refresh the list and try again\./i.test(lockedSettled.notice);
    evidence.checks.visibleProductionRefresh = lockedSettled.refreshVisible && /Refresh list/.test(lockedSettled.panel.text);
    evidence.checks.actionsDisabledWhileStale = lockedSettled.failure.disabledStableIds.length === lockedSettled.lists.flatMap((list) => list.rows).length;
    evidence.checks.stableFocusCaptured = lockedSettled.failure.stableId === stableId && lockedSettled.failure.focusedPane === 'left';
    evidence.checks.noAutoRetryBeforeRefresh = actionCountAfterSettle === baselineActionCount + 1;

    await page.click('#container-transfer-panel [data-transfer-refresh]');
    const refreshed = await waitFor(async () => {
      const current = await state(page);
      const refreshCommands = current.commands.filter((command) => command.commandType === 'container.snapshot');
      return current.failure.kind === '' && !current.refreshVisible && refreshCommands.length >= 2 ? current : null;
    }, 10000);
    await delay(400);
    const refreshedSettled = await state(page);
    evidence.screenshots.refreshed = await capture(page, qc, 'real-container-explicitly-refreshed', 'REAL explicit authoritative container snapshot refresh; stale lock cleared; failed action not retried');
    evidence.checks.explicitRefreshClearsLock = refreshedSettled.failure.kind === '' && !refreshedSettled.refreshVisible;
    evidence.checks.refreshIsAuthoritativeSnapshot = refreshedSettled.commands.filter((command) => command.commandType === 'container.snapshot').length >= 2;
    evidence.checks.failedActionNotRedispatched = refreshedSettled.commands.filter((command) => command.commandType === 'action.execute').length === baselineActionCount + 1;
    evidence.checks.stableFocusRestored = refreshedSettled.active.stableId === stableId && refreshedSettled.active.pane === 'left';
    evidence.checks.paneScrollRestored = refreshedSettled.lists.every((list, index) => list.scrollTop === (locked.failure.scroll[index]?.top || 0));

    const visibleDedupe = await page.evalCheckedValue(`(async () => {
      const service=window.NetHackUxRuntime.runtime.service('notice');
      const node=document.getElementById('ux-player-notice');
      const before=service.history().length;
      let mutations=0;
      const observer=new MutationObserver((records)=>{ mutations+=records.length; });
      observer.observe(node,{subtree:true,childList:true,characterData:true,attributes:true});
      service.show({id:'container-refresh-delivery-1',dedupeKey:'container-refresh:actual-session',kind:'success',message:'Container refreshed',source:'result',persistence:'sticky'});
      await new Promise((resolve)=>setTimeout(resolve,40));
      const afterFirst={history:service.history().length,text:node.innerText,mutations};
      service.show({id:'container-refresh-delivery-2',dedupeKey:'container-refresh:actual-session',kind:'success',message:'Container refreshed',source:'result',persistence:'sticky'});
      await new Promise((resolve)=>setTimeout(resolve,80));
      observer.disconnect();
      return {before,afterFirst,afterDuplicate:{history:service.history().length,text:node.innerText,mutations},retained:service.retainedIdentities()};
    })()`, { awaitPromise:true });
    evidence.screenshots.dedupe = await capture(page, qc, 'real-electron-visible-notice-dedupe', 'REAL Electron PlayerNotice: second delivery ID for one dedupeKey suppressed without rerender');
    evidence.checks.visibleDedupeSuppressed = visibleDedupe.afterFirst.history === visibleDedupe.before + 1 && visibleDedupe.afterDuplicate.history === visibleDedupe.afterFirst.history && visibleDedupe.afterDuplicate.mutations === visibleDedupe.afterFirst.mutations && /Container refreshed/.test(visibleDedupe.afterDuplicate.text);
    evidence.visibleDedupe = visibleDedupe;
    evidence.before = before;
    evidence.rejection = rejection;
    evidence.locked = lockedSettled;
    evidence.refreshed = refreshedSettled;
    evidence.diagnostic = await page.evalCheckedValue('window.netHackPOC.activeDiagnosticRun()', { awaitPromise:true }).catch((error)=>({ok:false,error:error.message}));
  } finally {
    const output = page.output();
    fs.writeFileSync(path.join(outDir, 'electron-stdout.log'), output.stdout);
    fs.writeFileSync(path.join(outDir, 'electron-stderr.log'), output.stderr);
    await page.close().catch(()=>{});
  }
  if (evidence.diagnostic?.diagnostic?.runDir) {
    const summaryFile = path.join(evidence.diagnostic.diagnostic.runDir, 'summary.json');
    if (fs.existsSync(summaryFile)) fs.copyFileSync(summaryFile, path.join(outDir, 'diagnostic-summary.json'));
  }
  evidence.qc = Harness.screenshotQc.validateManifest(qc.manifestFile);
  const failed = Object.entries(evidence.checks).filter(([,value])=>!value).map(([key])=>key);
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(evidence,null,2)}\n`);
  if (failed.length) throw new Error(`UXM-01 real stale transfer evidence failed: ${failed.join(', ')}`);
  console.log(`UXM-01 real stale transfer evidence PASS: ${outDir}`);
}

main().catch((error)=>{ console.error(error.stack||error); process.exit(1); });
