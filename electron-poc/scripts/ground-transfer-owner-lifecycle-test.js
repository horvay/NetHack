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
        { selector:97, objectId:501, text:'a - a bullwhip', quantity:1, semanticKind:'object', semanticName:'bullwhip', semanticKnown:true, actionAffordances:['drop'] },
        { selector:98, objectId:502, text:'b - a leather jacket', quantity:1, semanticKind:'object', semanticName:'leather jacket', semanticKnown:true, actionAffordances:['drop'] }
      ]});
      const ground = () => t.setGroundPileSnapshotForTest([
        { objectId:298, displayName:'a dagger', quantity:1, semanticKind:'object', semanticName:'dagger', semanticKnown:true, actionAffordances:['pickup'] },
        { objectId:296, displayName:'a hooded cloak', quantity:1, semanticKind:'object', semanticAppearance:'hooded cloak', semanticKnown:false, actionAffordances:['pickup'] }
      ], { x:17, y:11 });
      const snapshotPanel = (extra = {}) => t.setContainerStateForTest({ active:true, sessionKind:'ground-pickup', phase:'ground-snapshot', prompt:'Ground items', leftItems:[
        { syntheticSelector:'ground-object-298', objectId:298, text:'a dagger', displayName:'a dagger', semanticKind:'object', semanticKnown:true },
        { syntheticSelector:'ground-object-296', objectId:296, text:'a hooded cloak', displayName:'a hooded cloak', semanticKind:'object', semanticAppearance:'hooded cloak', semanticKnown:false }
      ], rightItems:[
        { selector:97, objectId:501, text:'a - a bullwhip', quantity:1, semanticKind:'object', semanticName:'bullwhip', semanticKnown:true },
        { selector:98, objectId:502, text:'b - a leather jacket', quantity:1, semanticKind:'object', semanticName:'leather jacket', semanticKnown:true }
      ], loadedSides:{left:true,right:true}, feedback:'Move items between ground and inventory.', ...extra });
      const openPickupMenu = (windowId, requestId) => {
        t.event({ name:'shim_start_menu', window:windowId, requestId, menuRequestId:requestId, transactionId:'pickup-command-' + requestId });
        t.event({ name:'shim_add_menu', window:windowId, selector:97, objectId:298, text:'a - a dagger', semanticKind:'object', semanticName:'dagger', semanticKnown:true, requestId });
        t.event({ name:'shim_add_menu', window:windowId, selector:98, objectId:296, text:'b - a hooded cloak', semanticKind:'object', semanticAppearance:'hooded cloak', semanticKnown:false, requestId });
        t.event({ name:'shim_end_menu', window:windowId, prompt:'Pick up what?', requestId, menuRequestId:requestId, transactionId:'pickup-command-' + requestId });
        t.event({ name:'shim_select_menu', window:windowId, how:1, prompt:'Pick up what?', requestId, menuRequestId:requestId, transactionId:'pickup-command-' + requestId });
      };
      inventory(); ground(); t.clearSentInputs();

      // A classic pickup menu is owned by the same Transfer Session interface
      // as direct ground transfer. The public row key is remapped to the active
      // menu selector and correlated to that exact menu request.
      openPickupMenu(711, 'pickup-menu-r1');
      await sleep(40);
      const firstMenuOwner = t.prompt();
      t.transferContainerItem('left', 'ground-object-298');
      t.transferContainerItem('left', 'ground-object-298');
      await sleep(40);
      const classicDispatched = { panel:t.container(), commandState:t.transferPanelCommandState(), sent:t.sentInputs().join(''), commands:window.__ownerCommands.slice() };
      t.event({
        name:'shim_ground_transfer_confirmed',
        transferId:classicDispatched.panel.pendingTransferId,
        transactionId:classicDispatched.panel.pendingTransferId,
        sessionId:classicDispatched.panel.transferSessionId,
        requestId:'stale-pickup-menu',
        itemId:298, direction:'ground-to-inventory', coord:{x:17,y:11},
        reason:'stale menu correlation must be ignored'
      });
      await sleep(40);
      const staleAnswer = { panel:t.container(), sent:t.sentInputs().join(''), commands:window.__ownerCommands.slice() };
      t.clearFailureForTest();
      t.event({
        name:'bridge_menu_answer', window:711,
        requestId:'pickup-menu-r1', menuRequestId:'pickup-menu-r1',
        transactionId:'pickup-command-pickup-menu-r1', inputTransactionId:'pickup-command-pickup-menu-r1',
        lifecycleRevision:Number(firstMenuOwner?.lifecycleRevision) || 1, lifecycle:'answered',
        return:1, selector:97, selectors:'a'
      });
      await sleep(80);
      const exactAnswer = { panel:t.container(), sent:t.sentInputs().join(''), commands:window.__ownerCommands.slice(), transfers:t.transferTransactions() };

      // Closing an active classic transfer invalidates its request correlation.
      openPickupMenu(712, 'pickup-menu-r2');
      await sleep(30);
      const closeMenuOwner = t.prompt();
      const sentBeforeClose = t.sentInputs().join('');
      t.transferContainerItem('left', 'ground-object-296');
      await sleep(30);
      const beforeClassicClose = { panel:t.container(), sent:t.sentInputs().join(''), commandCount:window.__ownerCommands.length };
      document.querySelector('#container-transfer-panel .container-transfer-heading button')?.click();
      t.event({
        name:'bridge_menu_answer', window:712,
        requestId:'pickup-menu-r2', menuRequestId:'pickup-menu-r2',
        transactionId:'pickup-command-pickup-menu-r2', inputTransactionId:'pickup-command-pickup-menu-r2',
        lifecycleRevision:Number(closeMenuOwner?.lifecycleRevision) || 1, lifecycle:'answered',
        return:1, selector:98, selectors:'b'
      });
      await sleep(80);
      const afterClassicClose = { panel:t.container(), sent:t.sentInputs().join(''), sentBeforeClose, commandCount:window.__ownerCommands.length };

      openPickupMenu(713, 'pickup-menu-final');
      await sleep(60);
      return {
        classicDispatched,
        staleAnswer,
        exactAnswer,
        beforeClassicClose,
        afterClassicClose,
        final:t.container(),
        commands:window.__ownerCommands,
        sent:t.sentInputs().join('')
      };
    })()`);

    const screenshot = await shot(cdp, 'ground-owner-lifecycle-final.png');
    fs.writeFileSync(path.join(outDir, 'state.json'), JSON.stringify(metrics, null, 2));
    assert('classic pickup drag remaps the stable public row to the active menu selector exactly once', metrics.classicDispatched.sent === 'a' && metrics.classicDispatched.commands.length === 0 && metrics.classicDispatched.commandState.transfer?.route === 'classic' && metrics.classicDispatched.commandState.transfer?.expectedRequestId === 'pickup-menu-r1', JSON.stringify(metrics.classicDispatched));
    assert('stale classic-menu request cannot complete the correlated transfer', metrics.staleAnswer.panel.pendingTransferId === metrics.classicDispatched.panel.pendingTransferId && metrics.staleAnswer.sent === 'a' && metrics.staleAnswer.commands.length === 0, JSON.stringify(metrics.staleAnswer));
    assert('exact classic-menu answer completes without direct-command handoff', !metrics.exactAnswer.panel.pendingTransferId && metrics.exactAnswer.sent === 'a' && metrics.exactAnswer.commands.length === 0 && metrics.exactAnswer.transfers?.transfers?.some((tx) => tx.status === 'success' && tx.direction === 'ground-to-inventory'), JSON.stringify(metrics.exactAnswer));
    assert('closing a classic Transfer Session invalidates its menu correlation without Esc or direct fallback', metrics.beforeClassicClose.sent === `${metrics.afterClassicClose.sentBeforeClose}b` && !metrics.afterClassicClose.panel.active && metrics.afterClassicClose.commandCount === 0, JSON.stringify({ before:metrics.beforeClassicClose, after:metrics.afterClassicClose }));
    assert('normal final panel contains no developer-jargon ownership error', !/direct command|active-owner|another prompt, menu, or transfer owns input/i.test(metrics.final.text), metrics.final.text);
    fs.writeFileSync(path.join(outDir, 'summary.md'), `# Ground transfer ownership lifecycle regression\n\nPASS\n\nScreenshot: ${screenshot}\n\nCovered: unified classic-menu selector remapping, rapid duplicate suppression, exact request correlation, stale answer rejection, exact answer completion, and close invalidation with no Esc/menu-release/direct-command handoff.\n`);
    console.log(`ground-transfer-owner-lifecycle-test PASS (${screenshot})`);
  } finally { cleanup(); }
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
