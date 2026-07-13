const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const { delay } = Harness;
function assert(name, condition, detail = '') { if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  const page = await Harness.createElectronBrowserDriver({ root, port:19822, width:1360, height:920 });
  try {
    await page.waitForRendererReady({ timeoutMs:10000, promptTest:true, automation:true, startButton:true });
    const result = await page.evalCheckedValue(`(async () => {
      const t=window.__nethackPromptTest;
      t.reset(); t.setRunning(true); t.clearSentInputs();
      const commands=[];
      t.setUiCommandHandlerForTest((command)=>{ commands.push(JSON.parse(JSON.stringify(command))); return Promise.resolve({ok:true,supported:true}); });
      t.setContainerStateForTest({active:true,sessionKind:'container',phase:'direct-snapshot',prompt:'Open box',containerId:42,transferSessionId:'focused-container',leftItems:[{syntheticSelector:'container-1',displaySelector:'a',text:'dagger',objectId:1},{syntheticSelector:'container-2',displaySelector:'b',text:'food ration',objectId:2},{syntheticSelector:'container-3',displaySelector:'c',text:'scroll',objectId:3}],rightItems:[{selector:100,text:'d - tin opener',objectId:4}],loadedSides:{left:true,right:true},loadingSides:{left:false,right:false},feedback:'Both panes loaded.'});
      const leftList=document.querySelector('[data-container-pane="left"] .container-item-list');
      const focused=document.querySelector('[data-stable-id="object:2"]');
      focused.focus({preventScroll:true}); leftList.style.maxHeight='48px'; leftList.style.overflow='auto'; leftList.scrollTop=19;
      t.presentFailureForTest({id:'focused-container-stale',kind:'stale-revision',reason:'revision changed'});
      await new Promise((resolve)=>setTimeout(resolve,20));
      const locked=t.failureState();
      const beforeTransferCommands=t.sentUiProtocolCommands().filter((command)=>command.commandType==='container.transfer').length;
      t.setContainerStateForTest({active:true,sessionKind:'container',phase:'direct-snapshot',prompt:'Open box',containerId:42,transferSessionId:'focused-container',leftItems:[{syntheticSelector:'container-1',displaySelector:'a',text:'dagger',objectId:1},{syntheticSelector:'container-3',displaySelector:'c',text:'scroll',objectId:3}],rightItems:[{selector:100,text:'d - tin opener',objectId:4}],loadedSides:{left:true,right:true},loadingSides:{left:false,right:false},feedback:'That item moved.'});
      document.querySelector('[data-transfer-refresh]')?.click();
      await new Promise((resolve)=>setTimeout(resolve,80));
      const afterContainer={failure:t.failureState(),activeStableId:document.activeElement?.dataset?.stableId||'',scrollTop:leftList.scrollTop,commands:commands.slice(),transferCommands:t.sentUiProtocolCommands().filter((command)=>command.commandType==='container.transfer').length};

      t.setGroundPileSnapshotForTest([{objectId:10,displayName:'dagger',quantity:1,location:{kind:'ground'}},{objectId:11,displayName:'apple',quantity:1,location:{kind:'ground'}}],{x:10,y:10});
      t.setContainerStateForTest({active:true,sessionKind:'ground-pickup',phase:'ground-snapshot',transferSessionId:'focused-ground',leftItems:[{syntheticSelector:'ground-10',displaySelector:'ground',text:'dagger',displayName:'dagger',objectId:10},{syntheticSelector:'ground-11',displaySelector:'ground',text:'apple',displayName:'apple',objectId:11}],rightItems:[{selector:97,text:'a - spear',objectId:12}],loadedSides:{left:true,right:true},feedback:'Move items between ground and inventory.'});
      document.querySelector('[data-stable-id="object:10"]')?.focus({preventScroll:true});
      t.presentFailureForTest({id:'focused-ground-stale',kind:'stale-revision',reason:'ground revision changed'});
      await new Promise((resolve)=>setTimeout(resolve,20));
      const groundLocked=t.failureState();
      document.querySelector('[data-transfer-refresh]')?.click();
      await new Promise((resolve)=>setTimeout(resolve,50));
      const afterGround={failure:t.failureState(),activeStableId:document.activeElement?.dataset?.stableId||'',sent:t.sentInputs().join(''),transferCommands:t.sentUiProtocolCommands().filter((command)=>command.commandType==='ground.transfer').length};
      return {locked,afterContainer,groundLocked,afterGround};
    })()`, { awaitPromise:true });
    assert('container stale lock exposes production Refresh list and disables rows', result.locked.kind === 'stale-revision' && result.locked.refreshVisible && result.locked.disabledStableIds.length === 4, JSON.stringify(result));
    assert('container explicit refresh dispatches only authoritative snapshot and no failed transfer retry', result.afterContainer.failure.kind === '' && result.afterContainer.commands.some((command)=>command.commandType === 'container.snapshot') && result.afterContainer.transferCommands === 0, JSON.stringify(result.afterContainer));
    assert('nearest surviving container row receives focus when the stable row disappeared', result.afterContainer.activeStableId === 'object:3', JSON.stringify(result.afterContainer));
    assert('ground stale lock exposes production Refresh list', result.groundLocked.kind === 'stale-revision' && result.groundLocked.refreshVisible, JSON.stringify(result.groundLocked));
    assert('ground explicit refresh clears the lock on the former early-return path without retrying transfer', result.afterGround.failure.kind === '' && result.afterGround.transferCommands === 0 && result.afterGround.sent === '', JSON.stringify(result.afterGround));
    console.log('UXM-01 stale transfer focused test PASS');
  } finally {
    await page.close().catch(()=>{});
  }
}
main().catch((error)=>{console.error(error.stack||error);process.exit(1);});
