const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const CommandGateway = require('../src/shared/command-gateway');
const UiProtocolV2 = require('../src/shared/ui-protocol-v2');

const root = path.resolve(__dirname, '..');
const bridge = path.join(root, 'shim-bridge', 'nh-shim-bridge');

function command(overrides = {}) {
  return {
    protocol: UiProtocolV2.protocol,
    commandType: 'ground.transfer',
    commandId: 'ground-transfer-shim-test',
    transactionId: 'ground-transfer-shim-txn',
    expectedRevision: { ground: 1, inventory: 1 },
    payload: {
      transferId: 'ground-transfer-shim-txn',
      direction: 'ground-to-inventory',
      coord: { x: 12, y: 8 },
      itemId: 1234,
      count: 'all',
      ...(overrides.payload || {}),
    },
    ...overrides.command,
  };
}

function events(output) {
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function runBridgeWithInput(lines, timeoutMs = 1800) {
  return new Promise((resolve, reject) => {
    const child = spawn(bridge, [], { cwd: root, env: { ...process.env, NH_ELECTRON_TEST_FIXTURES: '1', NETHACKOPTIONS: '!tutorial,!autopickup' }, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let closed = false;
    const timer = setTimeout(() => { if (!closed) child.kill('SIGTERM'); }, timeoutMs);
    child.stdout.on('data', (d) => {
      const text = String(d);
      stdout.push(text);
      if (/shim_ground_transfer_(?:accepted|rejected)/.test(text)) child.kill('SIGTERM');
    });
    child.stderr.on('data', (d) => stderr.push(String(d)));
    child.on('error', reject);
    child.on('close', () => { closed = true; clearTimeout(timer); resolve({ stdout: stdout.join(''), stderr: stderr.join('') }); });
    for (const line of lines) child.stdin.write(`${typeof line === 'string' ? line : JSON.stringify(line)}\n`);
    setTimeout(() => { try { child.stdin.end(); } catch {} }, 50);
  });
}

(async () => {
  const valid = command();
  const plan = CommandGateway.validateDirectCommandEnvelope(valid, { uiProtocol: UiProtocolV2, groundRevision: 1, inventoryRevision: 1, requireExpectedRevisionForKnownSnapshots: true });
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.bridgeType, 'ground-transfer');
  assert.equal(plan.implementedRoute, true);

  const partial = command({ payload: { count: 1 } });
  const partialPlan = CommandGateway.validateDirectCommandEnvelope(partial, { uiProtocol: UiProtocolV2, groundRevision: 1, inventoryRevision: 1, requireExpectedRevisionForKnownSnapshots: true });
  assert.equal(partialPlan.ok, false, 'partial-stack count must reject in first slice');
  assert.match(partialPlan.reason, /only supports "all"/);

  const stale = CommandGateway.validateDirectCommandEnvelope(valid, { uiProtocol: UiProtocolV2, groundRevision: 2, inventoryRevision: 1, requireExpectedRevisionForKnownSnapshots: true });
  assert.equal(stale.ok, false, 'stale ground revision must reject before shim');
  assert.equal(stale.blockerToken, 'blocked.input.staleRevision');

  const acceptedRun = await runBridgeWithInput([{ type: 'ground-transfer', command: valid }]);
  const acceptedEvents = events(acceptedRun.stdout);
  const accepted = acceptedEvents.find((event) => event.name === 'shim_ground_transfer_accepted');
  assert(accepted, `expected shim_ground_transfer_accepted, saw ${acceptedRun.stdout.slice(0, 2000)}`);
  assert.equal(accepted.commandId, valid.commandId);
  assert.equal(accepted.transferId, valid.payload.transferId);
  assert.equal(accepted.direction, 'ground-to-inventory');
  assert.deepEqual(accepted.coord, { x: 12, y: 8 });
  assert.equal(accepted.itemId, 1234);
  assert.equal(acceptedEvents.some((event) => event.name === 'bridge_ui_command_accepted' || (event.name === 'bridge_command' && event.keycode !== 0)), false, 'direct ground transfer must not lower ui-command/raw playable key bytes');

  const dropRun = await runBridgeWithInput([{ type: 'ground-transfer', command: command({ payload: { direction: 'inventory-to-ground' } }) }]);
  assert(events(dropRun.stdout).some((event) => event.name === 'shim_ground_transfer_accepted' && event.direction === 'inventory-to-ground'), `expected direct drop accept, saw ${dropRun.stdout.slice(0, 2000)}`);

  const wrapperSpoofRun = await runBridgeWithInput([`{"type":"ground-transfer","protocol":"${UiProtocolV2.protocol}","command":${JSON.stringify(valid)}}`]);
  assert(events(wrapperSpoofRun.stdout).some((event) => event.name === 'shim_ground_transfer_rejected' && /wrapper-level protocol/i.test(event.reason || '')), `expected wrapper spoof rejection, saw ${wrapperSpoofRun.stdout.slice(0, 2000)}`);

  const badCountRun = await runBridgeWithInput([{ type: 'ground-transfer', command: command({ payload: { count: '2' } }) }]);
  assert(events(badCountRun.stdout).some((event) => event.name === 'shim_ground_transfer_rejected' && /count all/i.test(event.reason || '')), `expected count all rejection, saw ${badCountRun.stdout.slice(0, 2000)}`);

  const badCoordRun = await runBridgeWithInput([{ type: 'ground-transfer', command: command({ payload: { coord: { x: -1, y: 8 } } }) }]);
  assert(events(badCoordRun.stdout).some((event) => event.name === 'shim_ground_transfer_rejected' && /unsigned integer|valid coord/i.test(event.reason || '')), `expected malformed coord rejection, saw ${badCoordRun.stdout.slice(0, 2000)}`);

  console.log('direct-ground-transfer-shim-test PASS');
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
