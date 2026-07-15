const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const CommandGateway = require('../src/shared/command-gateway');
const UiProtocolV2 = require('../src/shared/ui-protocol-v2');

const root = path.resolve(__dirname, '..');
const bridge = path.join(root, 'shim-bridge', 'nh-shim-bridge');
const activeBridgePids = new Set();
const seenBridgePids = [];

function runBridgeWithInput(lines, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const child = spawn(bridge, [], { cwd: root, env: { ...process.env, NH_ELECTRON_TEST_FIXTURES: '1', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['pipe', 'pipe', 'pipe'] });
    if (child.pid) { activeBridgePids.add(child.pid); seenBridgePids.push(child.pid); }
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let timedOut = false;
    let closed = false;
    function terminate(signal = 'SIGTERM') {
      if (closed || child.killed) return;
      child.kill(signal);
      setTimeout(() => { if (!closed) child.kill('SIGKILL'); }, 250);
    }
    const killTimer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      const text = String(d);
      stdoutBytes += Buffer.byteLength(text);
      if (stdoutBytes <= 200000) stdout.push(text);
      if (/bridge_ui_command_(?:accepted|rejected)/.test(text) && stdout.join('').split(/\r?\n/).filter((line) => /"name":"bridge_command"/.test(line)).length >= 8) terminate();
      if (stdoutBytes > 200000) terminate('SIGKILL');
    });
    child.stderr.on('data', (d) => { if (stderr.join('').length < 200000) stderr.push(String(d)); });
    child.on('error', reject);
    child.on('close', () => { closed = true; if (child.pid) activeBridgePids.delete(child.pid); clearTimeout(killTimer); resolve({ stdout: stdout.join(''), stderr: stderr.join(''), timedOut, pid: child.pid }); });
    for (const line of lines) child.stdin.write(`${typeof line === 'string' ? line : JSON.stringify(line)}\n`);
    setTimeout(() => { try { child.stdin.end(); } catch {} }, 100);
  });
}

function events(output) {
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function startInteractiveBridge(timeoutMs = 8000) {
  const child = spawn(bridge, ['-uNativeCmd-Val-Hum-Fem-Law'], { cwd: path.resolve(root, '..'), env: { ...process.env, NH_ELECTRON_TEST_FIXTURES: '1', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['pipe', 'pipe', 'pipe'] });
  if (child.pid) { activeBridgePids.add(child.pid); seenBridgePids.push(child.pid); }
  child.on('close', () => { if (child.pid) activeBridgePids.delete(child.pid); });
  const seen = [];
  let buffer = '';
  const waiters = [];
  const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
  function ingest(data) {
    buffer += String(data);
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() || '';
    for (const line of parts.filter(Boolean)) {
      let parsed = null;
      try { parsed = JSON.parse(line); } catch {}
      if (!parsed) continue;
      seen.push(parsed);
      for (const waiter of waiters.slice()) {
        if (waiter.predicate(parsed, seen)) {
          clearTimeout(waiter.timer);
          waiters.splice(waiters.indexOf(waiter), 1);
          waiter.resolve(parsed);
        }
      }
    }
  }
  child.stdout.on('data', ingest);
  child.stderr.on('data', () => {});
  return {
    write(payload) { child.stdin.write(`${JSON.stringify(payload)}\n`); },
    waitFor(predicate, ms = 4000) {
      const existing = seen.find((event) => predicate(event, seen));
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, reject, timer: setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(new Error(`timed out waiting for bridge event; saw ${JSON.stringify(seen.slice(-12))}`));
        }, ms) };
        waiters.push(waiter);
      });
    },
    seen,
    close() { clearTimeout(timer); try { child.stdin.end(); } catch {} if (!child.killed) child.kill('SIGTERM'); },
  };
}

function pidExists(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

function assertNoShimBridgeLeak() {
  for (let attempt = 0; attempt < 10 && activeBridgePids.size; attempt += 1) spawnSync('sleep', ['0.2']);
  assert.equal(Array.from(activeBridgePids).join(', '), '', 'all bridge helper child processes should have emitted close');
  const live = seenBridgePids.filter(pidExists);
  assert.equal(live.join(', '), '', `expected no leaked bridge child PIDs from this test, saw ${live.join(', ')}`);
}

function commandFixture({ actionId = 'ground.openContainer', command = '#loot\n', target = { location: { kind: 'ground' }, displayName: 'an empty bag' }, promptPolicy = 'netHack-owned-followup' } = {}) {
  return CommandGateway.createActionExecuteCommand({
    commandId: `cmd-native-${actionId.replace(/\W+/g, '-')}`,
    transactionId: `txn-native-${actionId.replace(/\W+/g, '-')}`,
    action: { id: actionId, label: actionId },
    route: { actionId, command },
    expectedRevision: actionId.startsWith('ground.') ? { ground: 1 } : { inventory: 1 },
    source: actionId.startsWith('ground.') ? 'ground-context' : 'inventory-context',
    target,
    payload: { promptPolicy },
  });
}

(async () => {
  const ground = commandFixture();
  const plan = CommandGateway.validateActionExecuteCommand(ground, { uiProtocol: UiProtocolV2, groundRevision: 1 });
  assert.equal(plan.ok, true, plan.reason);
  const acceptedRun = await runBridgeWithInput([{ type: 'ui-command', command: ground }]);
  const acceptedEvents = events(acceptedRun.stdout);
  const accepted = acceptedEvents.find((event) => event.name === 'bridge_ui_command_accepted' && event.actionId === 'ground.openContainer');
  assert(accepted, `expected bridge_ui_command_accepted, saw ${acceptedRun.stdout.slice(0, 1600)}`);
  assert.equal(accepted.command, '#loot\n');
  const lowered = acceptedEvents.filter((event) => event.name === 'bridge_command' && event.transactionId === ground.transactionId);
  assert.equal(lowered.length, '#loot\n'.length, `expected exact #loot key lowering, saw ${acceptedRun.stdout.slice(0, 1600)}`);
  assert.deepEqual(lowered.map((event) => event.keycode), Array.from('#loot\n').map((ch) => ch.charCodeAt(0)));
  assert(lowered.every((event) => event.guiAction?.actionId === 'ground.openContainer'), 'lowered keys preserve v2 action metadata');

  const untrap = commandFixture({ actionId: 'ground.untrapContainer', command: '#untrap\n', target: { location: { kind: 'ground' }, displayName: 'a trapped large box' } });
  const untrapPlan = CommandGateway.validateActionExecuteCommand(untrap, { uiProtocol: UiProtocolV2, groundRevision: 1 });
  assert.equal(untrapPlan.ok, true, untrapPlan.reason);
  const untrapRun = await runBridgeWithInput([{ type: 'ui-command', command: untrap }]);
  const untrapEvents = events(untrapRun.stdout);
  const untrapAccepted = untrapEvents.find((event) => event.name === 'bridge_ui_command_accepted' && event.actionId === 'ground.untrapContainer');
  assert(untrapAccepted, `expected bridge_ui_command_accepted for ground.untrapContainer, saw ${untrapRun.stdout.slice(0, 1600)}`);
  assert.equal(untrapAccepted.command, '#untrap\n');
  const untrapLowered = untrapEvents.filter((event) => event.name === 'bridge_command' && event.transactionId === untrap.transactionId);
  assert.deepEqual(untrapLowered.map((event) => event.keycode), Array.from('#untrap\n').map((ch) => ch.charCodeAt(0)), 'ground.untrapContainer lowers exactly #untrap and no direction answer');
  assert(untrapLowered.every((event) => event.guiAction?.actionId === 'ground.untrapContainer'), 'untrap lowered keys preserve v2 action metadata');

  const dip = commandFixture({ actionId: 'ground.dipIntoTerrain', command: '#dip\n', target: { location: { kind: 'ground' }, displayName: 'fountain' } });
  const dipPlan = CommandGateway.validateActionExecuteCommand(dip, { uiProtocol: UiProtocolV2, groundRevision: 1 });
  assert.equal(dipPlan.ok, false, 'legacy ground.dipIntoTerrain #dip route is disabled after terrain.action migration');
  const dipRun = await runBridgeWithInput([{ type: 'ui-command', command: dip }]);
  const dipEvents = events(dipRun.stdout);
  assert(dipEvents.some((event) => event.name === 'bridge_ui_command_rejected' && event.actionId === 'ground.dipIntoTerrain'), `expected bridge_ui_command_rejected for ground.dipIntoTerrain, saw ${dipRun.stdout.slice(0, 1600)}`);
  assert.deepEqual(dipEvents.filter((event) => event.name === 'bridge_command' && event.transactionId === dip.transactionId).map((event) => event.keycode), [], 'ground.dipIntoTerrain no longer lowers hidden #dip');

  const rub = commandFixture({ actionId: 'item.rub', command: '#rub\nl', target: { selector: 'l', inventoryLetter: 'l', displayName: 'an oil lamp', location: { kind: 'inventory' } } });
  const rubPlan = CommandGateway.validateActionExecuteCommand(rub, { uiProtocol: UiProtocolV2, inventoryRevision: 1 });
  assert.equal(rubPlan.ok, true, rubPlan.reason);
  const rubRun = await runBridgeWithInput([{ type: 'ui-command', command: rub }]);
  const rubEvents = events(rubRun.stdout);
  assert(rubEvents.some((event) => event.name === 'bridge_ui_command_accepted' && event.actionId === 'item.rub'), `expected bridge_ui_command_accepted for item.rub, saw ${rubRun.stdout.slice(0, 1600)}`);
  assert.deepEqual(rubEvents.filter((event) => event.name === 'bridge_command' && event.transactionId === rub.transactionId).map((event) => event.keycode), Array.from('#rub\nl').map((ch) => ch.charCodeAt(0)), 'item.rub lowers #rub plus the exact selected inventory selector');

  const rubNoTarget = commandFixture({ actionId: 'item.rub', command: '#rub\nl', target: { location: { kind: 'inventory' }, displayName: 'an oil lamp' } });
  const rubNoTargetRun = await runBridgeWithInput([{ type: 'ui-command', command: rubNoTarget }]);
  const rubNoTargetEvents = events(rubNoTargetRun.stdout);
  assert(rubNoTargetEvents.some((event) => event.name === 'bridge_ui_command_rejected' && /selector target/i.test(event.reason || '')), `expected item.rub missing-selector rejection, saw ${rubNoTargetRun.stdout.slice(0, 1600)}`);
  assert.equal(rubNoTargetEvents.some((event) => event.name === 'bridge_command' && event.transactionId === rubNoTarget.transactionId), false, 'item.rub missing selector must not lower keys');

  const item = commandFixture({ actionId: 'item.read.scroll', command: 'rf', target: { selector: 'f', inventoryLetter: 'f', displayName: 'a scroll labeled HACKEM', location: { kind: 'inventory' } }, promptPolicy: 'no-followup' });
  const itemRun = await runBridgeWithInput([{ type: 'ui-command', command: item }]);
  const itemEvents = events(itemRun.stdout);
  assert(itemEvents.some((event) => event.name === 'bridge_ui_command_accepted' && event.actionId === 'item.read.scroll'), `expected item read accepted, saw ${itemRun.stdout.slice(0, 1600)}`);
  assert.deepEqual(itemEvents.filter((event) => event.name === 'bridge_command' && event.transactionId === item.transactionId).map((event) => event.keycode), ['r'.charCodeAt(0), 'f'.charCodeAt(0)]);

  const wrongCommand = commandFixture({ command: '#name\n' });
  const wrongRun = await runBridgeWithInput([{ type: 'ui-command', command: wrongCommand }]);
  const wrongEvents = events(wrongRun.stdout);
  assert(wrongEvents.some((event) => event.name === 'bridge_ui_command_rejected' && /command bytes/i.test(event.reason || '')), `expected wrong bytes rejection, saw ${wrongRun.stdout.slice(0, 1600)}`);
  assert.equal(wrongEvents.some((event) => event.name === 'bridge_command' && event.transactionId === wrongCommand.transactionId), false, 'wrong command bytes must not lower keys');

  const missingCommandId = { ...ground };
  delete missingCommandId.commandId;
  const missingIdRun = await runBridgeWithInput([{ type: 'ui-command', command: missingCommandId }]);
  const missingIdEvents = events(missingIdRun.stdout);
  assert(missingIdEvents.some((event) => event.name === 'bridge_ui_command_rejected' && /commandId/i.test(event.reason || '')), `expected missing commandId rejection, saw ${missingIdRun.stdout.slice(0, 1600)}`);
  assert.equal(missingIdEvents.some((event) => event.name === 'bridge_command' && event.transactionId === missingCommandId.transactionId), false, 'missing commandId must not lower keys');

  const malformed = { ...ground, protocol: 'nethack-electron-ui/v1' };
  const malformedRun = await runBridgeWithInput([{ type: 'ui-command', command: malformed }]);
  const malformedEvents = events(malformedRun.stdout);
  assert(malformedEvents.some((event) => event.name === 'bridge_ui_command_rejected' && /protocol/i.test(event.reason || '')), `expected malformed protocol rejection, saw ${malformedRun.stdout.slice(0, 1600)}`);
  assert.equal(malformedEvents.some((event) => event.name === 'bridge_command' && event.transactionId === malformed.transactionId), false, 'malformed envelope must not lower keys');

  const wrapperProtocolRun = await runBridgeWithInput([`{"type":"ui-command","protocol":"nethack-electron-ui/v2","command":${JSON.stringify(ground)}}`]);
  const wrapperProtocolEvents = events(wrapperProtocolRun.stdout);
  assert(wrapperProtocolEvents.some((event) => event.name === 'bridge_ui_command_rejected' && /wrapper-level protocol/i.test(event.reason || '')), `expected wrapper-level protocol rejection, saw ${wrapperProtocolRun.stdout.slice(0, 1600)}`);
  assert.equal(wrapperProtocolEvents.some((event) => event.name === 'bridge_command' && event.transactionId === ground.transactionId), false, 'wrapper protocol must not satisfy nested command validation or lower keys');

  const duplicateProtocolRaw = JSON.stringify({ type: 'ui-command', command: ground }).replace('"protocol":"nethack-electron-ui/v2"', '"protocol":"bad","protocol":"nethack-electron-ui/v2"');
  const duplicateProtocolRun = await runBridgeWithInput([duplicateProtocolRaw]);
  const duplicateProtocolEvents = events(duplicateProtocolRun.stdout);
  assert(duplicateProtocolEvents.some((event) => event.name === 'bridge_ui_command_rejected' && /duplicate protocol/i.test(event.reason || '')), `expected duplicate protocol rejection, saw ${duplicateProtocolRun.stdout.slice(0, 1600)}`);
  assert.equal(duplicateProtocolEvents.some((event) => event.name === 'bridge_command' && event.transactionId === ground.transactionId), false, 'duplicate protocol must not lower keys');

  const conflictingPayloadAction = JSON.parse(JSON.stringify(ground));
  conflictingPayloadAction.payload.actionId = 'item.drop';
  const conflictingPayloadRun = await runBridgeWithInput([{ type: 'ui-command', command: conflictingPayloadAction }]);
  const conflictingPayloadEvents = events(conflictingPayloadRun.stdout);
  assert(conflictingPayloadEvents.some((event) => event.name === 'bridge_ui_command_rejected' && /payload\.actionId/i.test(event.reason || '')), `expected payload actionId conflict rejection, saw ${conflictingPayloadRun.stdout.slice(0, 1600)}`);
  assert.equal(conflictingPayloadEvents.some((event) => event.name === 'bridge_command' && event.transactionId === ground.transactionId), false, 'conflicting payload actionId must not lower keys');

  const conflictingRouteCommand = JSON.parse(JSON.stringify(ground));
  conflictingRouteCommand.payload.route.keys = '#tip\n';
  const conflictingRouteRun = await runBridgeWithInput([{ type: 'ui-command', command: conflictingRouteCommand }]);
  const conflictingRouteEvents = events(conflictingRouteRun.stdout);
  assert(conflictingRouteEvents.some((event) => event.name === 'bridge_ui_command_rejected' && /route command fields/i.test(event.reason || '')), `expected route command conflict rejection, saw ${conflictingRouteRun.stdout.slice(0, 1600)}`);
  assert.equal(conflictingRouteEvents.some((event) => event.name === 'bridge_command' && event.transactionId === ground.transactionId), false, 'conflicting route command fields must not lower keys');

  const overlongRaw = JSON.stringify({ type: 'ui-command', command: ground }).replace('"payload":{', `"padding":"${'x'.repeat(5000)}","payload":{`);
  const overlongRun = await runBridgeWithInput([overlongRaw]);
  const overlongEvents = events(overlongRun.stdout);
  assert(overlongEvents.some((event) => event.name === 'bridge_ui_command_rejected' && /exceeds bridge parser limit/i.test(event.reason || '')), `expected overlong ui-command rejection, saw ${overlongRun.stdout.slice(0, 1600)}`);
  assert.equal(overlongEvents.some((event) => event.name === 'bridge_command' && event.transactionId === ground.transactionId), false, 'overlong/truncated ui-command must not parse a prefix or lower keys');

  assertNoShimBridgeLeak();
  console.log('native-ui-command-envelope-test PASS');
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
