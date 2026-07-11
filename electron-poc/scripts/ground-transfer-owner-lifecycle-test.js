const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronBin = require('electron');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'ground-transfer-owner-lifecycle');
const port = Number(process.env.NH_GROUND_OWNER_CDP_PORT || 9511);
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) { const response = await fetch(url); if (!response.ok) throw new Error(`${response.status} ${url}`); return response.json(); }
async function waitFor(fn, timeoutMs = 15000, stepMs = 100) { const started = Date.now(); let last; while (Date.now() - started < timeoutMs) { try { const value = await fn(); if (value) return value; } catch (error) { last = error; } await delay(stepMs); } throw last || new Error('timed out'); }
async function connect(wsUrl) { const ws = new WebSocket(wsUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); }); let id = 0; const pending = new Map(); ws.addEventListener('message', (event) => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) { const call = pending.get(message.id); pending.delete(message.id); message.error ? call.reject(new Error(JSON.stringify(message.error))) : call.resolve(message.result); } }); return { send(method, params = {}) { const callId = ++id; ws.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolve, reject) => pending.set(callId, { resolve, reject })); }, close() { ws.close(); } }; }
async function evalExpr(cdp, expression) { const result = await cdp.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
async function shot(cdp, name) { const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const output = path.join(outDir, name); fs.writeFileSync(output, Buffer.from(result.data, 'base64')); return output; }
function assert(name, ok, detail = '') { if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`); }

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(electronBin, ['.'], { cwd: root, env: { ...process.env, AI_ORG_ELECTRON_CDP_PORT: String(port), NH_ELECTRON_WINDOW_WIDTH: '1320', NH_ELECTRON_WINDOW_HEIGHT: '880' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp;
  const cleanup = () => { try { cdp?.close(); } catch {} if (!child.killed) child.kill('SIGTERM'); };
  process.on('exit', cleanup); child.stdout.on('data', (data) => process.stdout.write(data)); child.stderr.on('data', (data) => process.stderr.write(data));
  try {
    const pages = await waitFor(async () => { const list = await json(`http://127.0.0.1:${port}/json/list`); return list.find((page) => page.type === 'page') ? list : null; }, 20000);
    cdp = await connect((pages.find((page) => page.type === 'page') || pages[0]).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1320, height: 880, deviceScaleFactor: 1, mobile: false });
    await waitFor(async () => evalExpr(cdp, "document.readyState === 'complete' && !!window.__nethackPromptTest"), 10000);

    const metrics = await evalExpr(cdp, `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const t = window.__nethackPromptTest;
      t.reset(); t.setRunning(true); t.setCursor(17, 11);
      window.__ownerCommands = [];
      window.__rejectNextOwnerCommand = false;
      window.__emptySnapshotsOnReject = false;
      t.setUiCommandHandlerForTest((command) => {
        window.__ownerCommands.push(JSON.parse(JSON.stringify(command)));
        if (window.__rejectNextOwnerCommand) {
          window.__rejectNextOwnerCommand = false;
          if (window.__emptySnapshotsOnReject) {
            window.__emptySnapshotsOnReject = false;
            t.setGroundPileSnapshotForTest([], { x:17, y:11 });
            t.event({ name:'shim_update_inventory', revision:4200, inventoryRevision:4200, equipmentRevision:3, reason:'authoritative-empty-rejection', items:[] });
          }
          return { ok:false, reason:'another prompt, menu, or transfer owns input; direct command is blocked', blockerToken:'blocked.input.menuActive', activeInputOwner:{ kind:'menu', requestId:'competing-menu-r9', label:'Choose another item', lifecycle:'selecting', source:'game-view.currentMenu' } };
        }
        return { ok:true, commandId:command.commandId, transactionId:command.transactionId, commandType:command.commandType, bridgeType:'ground-transfer' };
      });
      const inventory = () => t.event({ name:'shim_update_inventory', revision:4100, inventoryRevision:4100, equipmentRevision:1, reason:'owner-lifecycle', items:[
        { selector:97, objectId:501, text:'a - a bullwhip', quantity:1, semanticKind:'object', semanticName:'bullwhip', actionAffordances:['drop'] },
        { selector:98, objectId:502, text:'b - a leather jacket', quantity:1, semanticKind:'object', semanticName:'leather jacket', actionAffordances:['drop'] }
      ]});
      const ground = () => t.setGroundPileSnapshotForTest([
        { objectId:298, displayName:'a dagger', quantity:1, semanticKind:'object', semanticName:'dagger', actionAffordances:['pickup'] },
        { objectId:296, displayName:'a hooded cloak', quantity:1, semanticKind:'object', semanticAppearance:'hooded cloak', semanticKnown:false, actionAffordances:['pickup'] }
      ], { x:17, y:11 });
      const snapshotPanel = (extra = {}) => t.setContainerStateForTest({ active:true, sessionKind:'ground-pickup', phase:'ground-snapshot', prompt:'Ground items', leftItems:[
        { syntheticSelector:'ground-object-298', objectId:298, text:'a dagger', displayName:'a dagger', semanticKind:'object' },
        { syntheticSelector:'ground-object-296', objectId:296, text:'a hooded cloak', displayName:'a hooded cloak', semanticKind:'object', semanticAppearance:'hooded cloak', semanticKnown:false }
      ], rightItems:[
        { selector:97, objectId:501, text:'a - a bullwhip', quantity:1, semanticKind:'object', semanticName:'bullwhip' },
        { selector:98, objectId:502, text:'b - a leather jacket', quantity:1, semanticKind:'object', semanticName:'leather jacket' }
      ], loadedSides:{left:true,right:true}, feedback:'Move items between ground and inventory.', ...extra });
      const openPickupMenu = (windowId, requestId) => {
        t.event({ name:'shim_start_menu', window:windowId, requestId, menuRequestId:requestId, transactionId:'pickup-command-' + requestId });
        t.event({ name:'shim_add_menu', window:windowId, selector:97, objectId:298, text:'a - a dagger', semanticKind:'object', semanticName:'dagger', requestId });
        t.event({ name:'shim_add_menu', window:windowId, selector:98, objectId:296, text:'b - a hooded cloak', semanticKind:'object', semanticAppearance:'hooded cloak', semanticKnown:false, requestId });
        t.event({ name:'shim_end_menu', window:windowId, prompt:'Pick up what?', requestId, menuRequestId:requestId, transactionId:'pickup-command-' + requestId });
        t.event({ name:'shim_select_menu', window:windowId, how:1, prompt:'Pick up what?', requestId, menuRequestId:requestId, transactionId:'pickup-command-' + requestId });
      };
      inventory(); ground(); t.clearSentInputs();

      // Boss reproduction: a comma-owned pickup menu is represented by the two-pane shim.
      openPickupMenu(711, 'pickup-menu-r1');
      await sleep(40);
      t.transferContainerItem('left', 'a');
      t.transferContainerItem('left', 'a');
      await sleep(40);
      const beforeReleaseAnswer = { panel:t.container(), sent:t.sentInputs().join(''), commands:window.__ownerCommands.slice() };
      t.event({ name:'bridge_menu_answer', window:711, requestId:'pickup-menu-r1', transactionId:'pickup-command-pickup-menu-r1', return:0, answer:'' });
      await sleep(100);
      const firstCommand = window.__ownerCommands.at(-1);
      const afterFirstHandoff = { panel:t.container(), sent:t.sentInputs().join(''), commands:window.__ownerCommands.slice() };
      t.event({ name:'shim_ground_transfer_confirmed', transferId:firstCommand?.transactionId || '', transactionId:firstCommand?.transactionId || '', itemId:298, direction:'ground-to-inventory', coord:{x:17,y:11}, reason:'ground item picked up' });
      await sleep(30);

      // If a real menu selection wins the Esc race, do not also direct-transfer it.
      openPickupMenu(714, 'pickup-menu-selected');
      await sleep(30);
      const commandCountBeforeSelectedAnswer = window.__ownerCommands.length;
      t.transferContainerItem('left', 'b');
      t.event({ name:'bridge_menu_answer', window:714, requestId:'pickup-menu-selected', transactionId:'pickup-command-pickup-menu-selected', return:1, selector:98, selectors:'b' });
      await sleep(80);
      const selectedAnswer = { panel:t.container(), commandCount:window.__ownerCommands.length };

      // If the intended object disappears/reletters to another object, fail closed.
      openPickupMenu(715, 'pickup-menu-disappeared');
      await sleep(30);
      const commandCountBeforeDisappeared = window.__ownerCommands.length;
      t.transferContainerItem('left', 'b');
      t.setGroundPileSnapshotForTest([{ objectId:298, displayName:'a dagger', quantity:1, semanticKind:'object', semanticName:'dagger', actionAffordances:['pickup'] }], { x:17, y:11 });
      t.event({ name:'bridge_menu_answer', window:715, requestId:'pickup-menu-disappeared', transactionId:'pickup-command-pickup-menu-disappeared', return:0, selector:0, selectors:'' });
      await sleep(80);
      const disappearedTarget = { panel:t.container(), commandCount:window.__ownerCommands.length };
      ground();

      // Closing while an ownership handoff is pending must cancel the deferred action.
      openPickupMenu(712, 'pickup-menu-r2');
      await sleep(30);
      const commandCountBeforeClose = window.__ownerCommands.length;
      t.transferContainerItem('left', 'b');
      document.querySelector('#container-transfer-panel .container-transfer-heading button')?.click();
      t.event({ name:'bridge_menu_answer', window:712, requestId:'pickup-menu-r2', transactionId:'pickup-command-pickup-menu-r2', return:0, answer:'' });
      await sleep(80);
      const afterCloseAnswer = { panel:t.container(), commandCount:window.__ownerCommands.length };

      // A prior cancelled unrelated menu must not survive into a reopened transfer session.
      t.event({ name:'shim_start_menu', window:713, requestId:'prior-menu-r3', transactionId:'prior-menu-command' });
      t.event({ name:'shim_add_menu', window:713, selector:97, objectId:501, text:'a - a bullwhip', semanticKind:'object', requestId:'prior-menu-r3' });
      t.event({ name:'shim_end_menu', window:713, prompt:'Menu', requestId:'prior-menu-r3', transactionId:'prior-menu-command' });
      t.event({ name:'shim_select_menu', window:713, how:1, prompt:'Menu', requestId:'prior-menu-r3', transactionId:'prior-menu-command' });
      t.event({ name:'bridge_menu_answer', window:713, requestId:'prior-menu-r3', transactionId:'prior-menu-command', return:0, answer:'' });
      snapshotPanel();
      t.transferContainerItem('left', 'ground-object-296');
      await sleep(60);
      const afterPriorCancelledMenu = { panel:t.container(), command:window.__ownerCommands.at(-1) };
      const reopenedCommand = window.__ownerCommands.at(-1);
      t.event({ name:'shim_ground_transfer_confirmed', transferId:reopenedCommand?.transactionId || '', transactionId:reopenedCommand?.transactionId || '', itemId:296, direction:'ground-to-inventory', coord:{x:17,y:11}, reason:'ground item picked up' });
      await sleep(30);

      // A genuinely competing prompt is preserved and blocks locally; no direct command leaks.
      snapshotPanel({ textWindowGroundItems:true });
      t.event({ name:'shim_yn_function', query:'Really attack the peaceful shopkeeper?', choices:'yn\\u001b', requestId:'competing-prompt-r4', transactionId:'competing-command' });
      await sleep(20);
      const commandCountBeforePrompt = window.__ownerCommands.length;
      t.transferContainerItem('left', 'ground-object-298');
      await sleep(30);
      const competingPrompt = { panel:t.container(), prompt:t.prompt(), commandCount:window.__ownerCommands.length };
      t.event({ name:'bridge_prompt_answer', requestId:'competing-prompt-r4', transactionId:'competing-command', keycode:27, answer:'\\u001b' });
      await sleep(30);
      t.transferContainerItem('left', 'ground-object-298');
      await sleep(60);
      const afterPromptCancelled = window.__ownerCommands.at(-1);
      t.event({ name:'shim_ground_transfer_confirmed', transferId:afterPromptCancelled?.transactionId || '', transactionId:afterPromptCancelled?.transactionId || '', itemId:298, direction:'ground-to-inventory', coord:{x:17,y:11}, reason:'ground item picked up' });
      await sleep(30);

      // A genuinely competing menu closes the transfer shell but stays visible
      // and answerable; it must never become an invisible ghost input owner.
      snapshotPanel();
      const commandCountBeforeCompetingMenu = window.__ownerCommands.length;
      t.event({ name:'shim_start_menu', window:716, requestId:'competing-menu-r5', transactionId:'competing-menu-command' });
      t.event({ name:'shim_add_menu', window:716, selector:121, text:'y - Keep waiting', semanticKind:'choice', requestId:'competing-menu-r5' });
      t.event({ name:'shim_add_menu', window:716, selector:110, text:'n - Stop waiting', semanticKind:'choice', requestId:'competing-menu-r5' });
      t.event({ name:'shim_end_menu', window:716, prompt:'Choose another action', requestId:'competing-menu-r5', transactionId:'competing-menu-command' });
      t.event({ name:'shim_select_menu', window:716, how:1, prompt:'Choose another action', requestId:'competing-menu-r5', transactionId:'competing-menu-command' });
      await sleep(50);
      const competingMenu = { panel:t.container(), dialog:t.dialog(), menu:t.container()?.menu, commandCount:window.__ownerCommands.length, body:document.body.innerText };
      t.event({ name:'bridge_menu_answer', window:716, requestId:'competing-menu-r5', transactionId:'competing-menu-command', return:0, answer:'' });
      await sleep(30);
      snapshotPanel();
      t.transferContainerItem('left', 'ground-object-298');
      await sleep(60);
      const afterCompetingMenuCancelled = window.__ownerCommands.at(-1);
      t.event({ name:'shim_ground_transfer_confirmed', transferId:afterCompetingMenuCancelled?.transactionId || '', transactionId:afterCompetingMenuCancelled?.transactionId || '', itemId:298, direction:'ground-to-inventory', coord:{x:17,y:11}, reason:'ground item picked up' });
      await sleep(30);

      // A main-side ownership race is reconciled with player copy and can be retried.
      snapshotPanel();
      window.__rejectNextOwnerCommand = true;
      t.transferContainerItem('left', 'ground-object-296');
      await sleep(80);
      const rejected = { panel:t.container(), transfers:t.transferTransactions(), rejectedCommand:window.__ownerCommands.at(-1) };
      t.transferContainerItem('left', 'ground-object-296');
      await sleep(60);
      const retryCommand = window.__ownerCommands.at(-1);
      const retried = { panel:t.container(), retryCommand, transfers:t.transferTransactions() };
      t.event({ name:'shim_ground_transfer_confirmed', transferId:retryCommand?.transactionId || '', transactionId:retryCommand?.transactionId || '', itemId:296, direction:'ground-to-inventory', coord:{x:17,y:11}, reason:'ground item picked up' });
      await sleep(30);

      // Authoritative empty snapshots must clear both optimistic panes on rejection.
      snapshotPanel();
      window.__rejectNextOwnerCommand = true;
      window.__emptySnapshotsOnReject = true;
      t.transferContainerItem('left', 'ground-object-296');
      await sleep(100);
      const emptySnapshotRejection = { panel:t.container(), transfers:t.transferTransactions() };

      // A lost core result must time out, release the pending transfer, and allow Done.
      inventory(); ground(); snapshotPanel();
      t.transferContainerItem('left', 'ground-object-298');
      await sleep(5200);
      const timedOut = { panel:t.container(), transfers:t.transferTransactions() };
      document.querySelector('#container-transfer-panel .container-transfer-heading button')?.click();
      await sleep(40);
      const afterTimeoutClose = t.container();

      snapshotPanel();
      t.event({ name:'shim_update_inventory', revision:4300, inventoryRevision:4300, equipmentRevision:2, reason:'final-owner-lifecycle', items:[
        { selector:97, objectId:501, text:'a - a bullwhip', quantity:1, semanticKind:'object', semanticName:'bullwhip', actionAffordances:['drop'] },
        { selector:98, objectId:502, text:'b - a leather jacket', quantity:1, semanticKind:'object', semanticName:'leather jacket', actionAffordances:['drop'] },
        { selector:99, objectId:296, text:'c - a hooded cloak', quantity:1, semanticKind:'object', semanticAppearance:'hooded cloak', semanticKnown:false, actionAffordances:['drop'] }
      ]});
      t.setGroundPileSnapshotForTest([{ objectId:298, displayName:'a dagger', quantity:1, semanticKind:'object', semanticName:'dagger', actionAffordances:['pickup'] }], { x:17, y:11 });
      await sleep(60);
      return { beforeReleaseAnswer, afterFirstHandoff, firstCommand, commandCountBeforeSelectedAnswer, selectedAnswer, commandCountBeforeDisappeared, disappearedTarget, commandCountBeforeClose, afterCloseAnswer, afterPriorCancelledMenu, competingPrompt, commandCountBeforePrompt, afterPromptCancelled, commandCountBeforeCompetingMenu, competingMenu, afterCompetingMenuCancelled, rejected, retried, emptySnapshotRejection, timedOut, afterTimeoutClose, final:t.container(), commands:window.__ownerCommands, sent:t.sentInputs().join('') };
    })()`);

    const screenshot = await shot(cdp, 'ground-owner-lifecycle-final.png');
    fs.writeFileSync(path.join(outDir, 'state.json'), JSON.stringify(metrics, null, 2));
    assert('first drag sends one Esc and no direct command until exact pickup menu answer', metrics.beforeReleaseAnswer.sent === '\u001b' && metrics.beforeReleaseAnswer.commands.length === 0 && metrics.beforeReleaseAnswer.panel.pendingGroundMenuTransferIntent?.requestId === 'pickup-menu-r1', JSON.stringify(metrics.beforeReleaseAnswer));
    assert('rapid duplicate drag does not duplicate the menu release or command', metrics.beforeReleaseAnswer.sent.length === 1 && metrics.afterFirstHandoff.commands.length === 1, JSON.stringify(metrics.afterFirstHandoff));
    assert('matching menu close resumes the first drag through direct ground.transfer', metrics.firstCommand?.commandType === 'ground.transfer' && metrics.firstCommand.payload?.itemId === 298 && metrics.firstCommand.payload?.direction === 'ground-to-inventory', JSON.stringify(metrics.firstCommand));
    assert('successful menu selection winning the release race never dispatches a duplicate direct transfer', metrics.selectedAnswer.commandCount === metrics.commandCountBeforeSelectedAnswer && /completed the pickup choice/i.test(metrics.selectedAnswer.panel.text), JSON.stringify(metrics.selectedAnswer));
    assert('disappeared or selector-reused target fails closed instead of moving a different row', metrics.disappearedTarget.commandCount === metrics.commandCountBeforeDisappeared && /item changed/i.test(metrics.disappearedTarget.panel.text), JSON.stringify(metrics.disappearedTarget));
    assert('closing during release invalidates deferred action and session', metrics.afterCloseAnswer.commandCount === metrics.commandCountBeforeClose && !metrics.afterCloseAnswer.panel.active && !metrics.afterCloseAnswer.panel.pendingGroundMenuTransferIntent, JSON.stringify(metrics.afterCloseAnswer));
    assert('reopen after prior cancelled menu issues direct command immediately', metrics.afterPriorCancelledMenu.command?.commandType === 'ground.transfer' && metrics.afterPriorCancelledMenu.command.payload?.itemId === 296, JSON.stringify(metrics.afterPriorCancelledMenu));
    assert('competing prompt is preserved and blocks without command dispatch', metrics.competingPrompt.prompt?.requestId === 'competing-prompt-r4' && metrics.competingPrompt.commandCount === metrics.commandCountBeforePrompt && /another choice first/i.test(metrics.competingPrompt.panel.text), JSON.stringify(metrics.competingPrompt));
    assert('after legitimate prompt cancellation the same drag is accepted', metrics.afterPromptCancelled?.commandType === 'ground.transfer' && metrics.afterPromptCancelled.payload?.itemId === 298, JSON.stringify(metrics.afterPromptCancelled));
    assert('unrelated live menu remains visible and answerable instead of becoming a ghost owner', !metrics.competingMenu.panel.active && metrics.competingMenu.dialog?.interactionOpen && /Choose another action|Keep waiting|Stop waiting/i.test(metrics.competingMenu.body) && metrics.competingMenu.commandCount === metrics.commandCountBeforeCompetingMenu, JSON.stringify(metrics.competingMenu));
    assert('after unrelated menu cancellation a reopened transfer accepts the first drag', metrics.afterCompetingMenuCancelled?.commandType === 'ground.transfer' && metrics.afterCompetingMenuCancelled.payload?.itemId === 298, JSON.stringify(metrics.afterCompetingMenuCancelled));
    assert('async owner rejection restores rows with player-facing recovery copy', /another choice before the move could start/i.test(metrics.rejected.panel.text) && !/direct command|active-owner|another prompt, menu, or transfer owns input/i.test(metrics.rejected.panel.text) && metrics.rejected.panel.left.some((row) => /hooded cloak/i.test(row.text)), metrics.rejected.panel.text);
    assert('rejection recovery permits immediate retry with a new direct transaction', metrics.retried.retryCommand?.commandType === 'ground.transfer' && metrics.retried.retryCommand.commandId !== metrics.rejected.rejectedCommand?.commandId, JSON.stringify(metrics.retried));
    assert('authoritative empty rejection clears both optimistic panes', metrics.emptySnapshotRejection.panel.left.length === 0 && metrics.emptySnapshotRejection.panel.right.length === 0 && !metrics.emptySnapshotRejection.panel.directTransferPendingId, JSON.stringify(metrics.emptySnapshotRejection));
    assert('lost direct result times out without a ghost transfer lock', !metrics.timedOut.panel.directTransferPendingId && metrics.timedOut.transfers?.transfers?.some((tx) => tx.status === 'rejected' && /timed out/i.test(tx.result?.reason || '')) && /could not be completed/i.test(metrics.timedOut.panel.text), JSON.stringify(metrics.timedOut));
    assert('Done closes normally after timeout recovery', !metrics.afterTimeoutClose.active && metrics.afterTimeoutClose.hidden, JSON.stringify(metrics.afterTimeoutClose));
    assert('normal final panel contains no developer-jargon ownership error', !/direct command|active-owner|another prompt, menu, or transfer owns input/i.test(metrics.final.text), metrics.final.text);
    fs.writeFileSync(path.join(outDir, 'summary.md'), `# Ground transfer ownership lifecycle regression\n\nPASS\n\nScreenshot: ${screenshot}\n\nCovered: first comma-menu drag, rapid repeated drag, exact canceled-answer handoff, successful-selection race, disappeared/relettered target fail-closed behavior, close while pending, reopen after cancelled menu, competing prompt preservation, owner-race rejection recovery/retry, authoritative empty rollback, and lost-result timeout recovery.\n`);
    console.log(`ground-transfer-owner-lifecycle-test PASS (${screenshot})`);
  } finally { cleanup(); }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
