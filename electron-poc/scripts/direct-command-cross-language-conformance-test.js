const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CommandGateway = require('../src/shared/command-gateway');
const ShimProtocol = require('../src/shared/shim-protocol');
const UiProtocolV2 = require('../src/shared/ui-protocol-v2');
const { createGameProcess } = require('../src/main/game-process');

const electronRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(electronRoot, '..');
const bridge = path.join(electronRoot, 'shim-bridge', 'nh-shim-bridge');
const protocol = UiProtocolV2.protocol;

assert.equal(fs.existsSync(bridge), true, `built fixture bridge is required at ${bridge}`);

function direct(commandType, payload, expectedRevision) {
  const suffix = commandType.replace(/\W+/g, '-');
  return {
    protocol,
    commandId: `cmd-conformance-${suffix}`,
    commandType,
    transactionId: `txn-conformance-${suffix}`,
    ...(expectedRevision ? { expectedRevision } : {}),
    payload,
  };
}

function actionExecute() {
  return CommandGateway.createActionExecuteCommand({
    commandId: 'cmd-conformance-action-execute',
    transactionId: 'txn-conformance-action-execute',
    action: { id: 'slot.swapMainAlternate', label: 'Swap main and alternate weapons' },
    route: { actionId: 'slot.swapMainAlternate', command: 'x' },
    source: 'cross-language-conformance',
  });
}

const commands = [
  direct('ground.transfer', {
    transferId: 'transfer-conformance-ground',
    direction: 'ground-to-inventory',
    coord: { x: 12, y: 8 },
    itemId: 900001,
    count: 'all',
  }),
  direct('container.transfer', {
    transferId: 'transfer-conformance-container',
    sessionId: 'session-conformance-container',
    direction: 'container-to-inventory',
    containerId: 900002,
    itemId: 900003,
  }),
  direct('container.snapshot', {
    sessionId: 'session-conformance-snapshot',
    containerId: 900004,
  }),
  direct('equipment.change', {
    action: 'wieldMain',
    itemId: 900005,
    slotId: 'mainHand',
  }, { inventory: 0, equipment: 0 }),
  direct('terrain.action', {
    action: 'stairsDown',
    terrain: 'stairs.down',
    coord: { x: 12, y: 8 },
  }, { map: 0, inventory: 0 }),
  actionExecute(),
];

const implementedTypes = Object.entries(CommandGateway.commandPlanningSpecs)
  .filter(([, spec]) => spec.implementedRoute === true)
  .map(([commandType]) => commandType)
  .sort();
assert.deepEqual(commands.map((command) => command.commandType).sort(), implementedTypes,
  'fixtures cover the production gateway registry exactly, without a second route registry');

function planningContext() {
  return {
    uiProtocol: UiProtocolV2,
    inventoryRevision: 0,
    equipmentRevision: 0,
    groundRevision: 0,
    containerRevision: 0,
    mapRevision: 0,
    inventoryItems: [],
    groundItems: [],
    activeInputOwner: null,
    requireExpectedRevisionForKnownSnapshots: true,
  };
}

function makeSession(label) {
  const sent = [];
  const diagnostics = [];
  const normalized = [];
  const game = createGameProcess({
    repoRoot,
    nethackBin: '',
    shimBridgeBin: bridge,
    send(channel, payload) {
      sent.push({ channel, payload });
      if (channel !== 'nethack:shimEvent') return;
      for (const entry of Array.isArray(payload) ? payload : [payload]) normalized.push(entry);
    },
    env: {
      ...process.env,
      NH_ELECTRON_TEST_FIXTURES: '1',
      NETHACKOPTIONS: '!tutorial,!autopickup,pettype:none',
    },
    diagnostics: {
      appendEvent(event) { diagnostics.push(event); return { seq: diagnostics.length, runId: `conformance-${label}` }; },
      startRun() { return { run: null }; },
      finalize() {},
    },
  });
  const started = game.startShimBridge({ seed: '424242' });
  assert.equal(started.ok, true, `${label}: fixture bridge starts through game-process`);

  async function waitFor(predicate, description, timeoutMs = 15000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const value = predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`${label}: timed out waiting for ${description}; normalized tail=${JSON.stringify(normalized.slice(-20))}`);
  }

  function event(name, commandId) {
    return normalized.find((entry) => entry?.valid === true && entry.event?.name === name
      && (!commandId || entry.event.commandId === commandId));
  }

  async function close() {
    game.stop();
    await waitFor(() => sent.find((entry) => entry.channel === 'nethack:exit'), 'bridge exit', 3000).catch(() => null);
  }

  return { game, diagnostics, normalized, event, waitFor, close };
}

function lifecyclePrefix(plan) {
  return plan.bridgeType === 'ui-command' ? 'bridge_ui_command' : `shim_${plan.bridgeType.replace(/-/g, '_')}`;
}

function assertNormalized(record, label) {
  assert(record, `${label}: expected normalized lifecycle event`);
  assert.equal(record.protocol, ShimProtocol.version, `${label}: crosses strict ShimProtocol ingress`);
  assert.equal(record.known, true, `${label}: lifecycle is registered`);
  assert.equal(record.valid, true, `${label}: lifecycle is valid: ${(record.errors || []).join('; ')}`);
  assert.deepEqual(record.event, record.payload, `${label}: normalized event and payload are canonical aliases`);
}

function canonicalAck(record, command, sequence) {
  assertNormalized(record, `${command.commandType} ${record?.event?.name || 'lifecycle'}`);
  const acknowledgement = ShimProtocol.adaptLifecycleToCommandAcknowledgement(record, {
    sequence,
    turn: 0,
    source: { layer: 'test' },
  });
  assert(acknowledgement, `${command.commandType}: correlated native lifecycle adapts to an acknowledgement`);
  const checked = UiProtocolV2.validateEventEnvelope(acknowledgement);
  assert.equal(checked.ok, true, `${command.commandType}: canonical acknowledgement validates: ${checked.errors.join('; ')}`);
  assert.equal(checked.event.payload.commandId, command.commandId, `${command.commandType}: acknowledgement command correlation`);
  assert.equal(checked.event.payload.transactionId, command.transactionId, `${command.commandType}: acknowledgement transaction correlation`);
  assert.equal(checked.event.payload.commandType, command.commandType, `${command.commandType}: acknowledgement family correlation`);
  return checked.event;
}

async function proveImplementedFamily(command, sequenceBase) {
  const protocolCheck = UiProtocolV2.validateCommandEnvelope(command);
  assert.equal(protocolCheck.ok, true, `${command.commandType}: v2 command validates: ${protocolCheck.errors.join('; ')}`);
  const plan = CommandGateway.planCommand(command, planningContext());
  assert.equal(plan.ok, true, `${command.commandType}: gateway plans command: ${plan.reason || ''}`);
  assert.equal(plan.planningAuthority, 'CommandGateway', `${command.commandType}: one planning authority`);
  assert.equal(plan.implementationState, 'implemented', `${command.commandType}: route is implemented`);

  const session = makeSession(command.commandType.replace(/\W+/g, '-'));
  try {
    const result = session.game.uiCommand(command);
    assert.deepEqual(result, {
      ok: true,
      commandId: command.commandId,
      transactionId: command.transactionId,
      commandType: command.commandType,
      actionId: plan.actionId || undefined,
      bridgeType: plan.bridgeType,
      implementationState: 'implemented',
    }, `${command.commandType}: game-process returns the planned correlation and bridge route`);

    const writes = session.diagnostics.filter((entry) => entry.type === 'shim.stdin.write'
      && entry.payload?.payload?.command?.commandId === command.commandId);
    assert.equal(writes.length, 1, `${command.commandType}: exactly one game-process transport write`);
    assert.deepEqual(writes[0].payload.payload, plan.bridgePayload, `${command.commandType}: transport shape is the frozen gateway plan`);

    const prefix = lifecyclePrefix(plan);
    const accepted = await session.waitFor(() => session.event(`${prefix}_accepted`, command.commandId), `${prefix}_accepted`);
    canonicalAck(accepted, command, sequenceBase);

    const correlations = ['commandId', 'transactionId'];
    if (command.payload?.transferId) correlations.push('transferId');
    if (command.commandType === 'container.snapshot') correlations.push('sessionId');
    for (const field of correlations) {
      const expected = command[field] ?? command.payload?.[field];
      if (expected !== undefined) assert.equal(accepted.event[field], expected, `${command.commandType}: accepted ${field} is stable`);
    }

    if (command.commandType === 'action.execute') {
      assert.equal(Object.prototype.hasOwnProperty.call(accepted.event, 'command'), false,
        'action.execute: raw command bytes are removed by strict normalization');
      const lowered = await session.waitFor(() => session.normalized.find((entry) => entry?.valid === true
        && entry.event?.name === 'bridge_command'
        && entry.event?.transactionId === command.transactionId), 'normalized bridge_command execution');
      assertNormalized(lowered, 'action.execute lowered key');
      assert.equal(lowered.event.keycode, 'x'.charCodeAt(0), 'action.execute: native execution lowers the exact public route key');
      assert.equal(lowered.event.transactionId, command.transactionId, 'action.execute: lowered native key preserves transaction correlation');
      assert.equal(lowered.event.guiAction?.actionId, command.actionId, 'action.execute: lowered native key preserves public action correlation');
      return { commandType: command.commandType, transport: plan.bridgePayload, bridgeType: plan.bridgeType, lifecycle: [accepted.event.name, lowered.event.name], result: 'accepted-and-lowered-x' };
    }

    const queued = await session.waitFor(() => session.event(`${prefix}_queued`, command.commandId), `${prefix}_queued`);
    canonicalAck(queued, command, sequenceBase + 1);
    const terminal = await session.waitFor(() => session.event(`${prefix}_confirmed`, command.commandId)
      || session.event(`${prefix}_rejected`, command.commandId), `${prefix} terminal lifecycle`);
    const terminalAck = canonicalAck(terminal, command, sequenceBase + 2);
    for (const field of correlations) {
      const expected = command[field] ?? command.payload?.[field];
      if (expected !== undefined) assert.equal(terminal.event[field], expected, `${command.commandType}: terminal ${field} is stable`);
    }
    return {
      commandType: command.commandType,
      transport: plan.bridgePayload,
      bridgeType: plan.bridgeType,
      lifecycle: [accepted.event.name, queued.event.name, terminal.event.name],
      result: terminalAck.payload.status,
      reason: terminal.event.reason || '',
    };
  } finally {
    await session.close();
  }
}

async function proveTrustStageRejections() {
  const session = makeSession('trust-rejections');
  try {
    const malformed = direct('container.snapshot', { sessionId: 'session-malformed', containerId: 0 });
    const malformedResult = session.game.uiCommand(malformed);
    assert.equal(malformedResult.ok, false, 'malformed public target rejects at v2/gateway trust stage');
    assert.equal(malformedResult.blockerToken, 'blocked.input.malformedTarget');

    const stale = direct('terrain.action', {
      action: 'stairsDown', terrain: 'stairs.down', coord: { x: 12, y: 8 },
    }, { map: 1, inventory: 0 });
    const staleResult = session.game.uiCommand(stale);
    assert.equal(staleResult.ok, false, 'stale public revision rejects at gateway trust stage');
    assert.equal(staleResult.blockerToken, 'blocked.input.staleRevision');

    for (const rejected of [malformed, stale]) {
      assert.equal(session.diagnostics.some((entry) => entry.type === 'shim.stdin.write'
        && entry.payload?.payload?.command?.commandId === rejected.commandId), false,
      `${rejected.commandId}: gateway rejection makes zero native transport writes`);
    }

    const tampered = direct('terrain.action', {
      action: 'stairsDown', terrain: 'fountain', coord: { x: 12, y: 8 },
    }, { map: 0, inventory: 0 });
    const tamperedWrapper = { type: 'terrain-action', command: tampered };
    assert.equal(session.game.shimInput(tamperedWrapper), true, 'native tamper fixture reaches the built bridge through game-process transport');
    const rejected = await session.waitFor(() => session.event('shim_terrain_action_rejected', tampered.commandId), 'native tamper rejection');
    assertNormalized(rejected, 'native tamper rejection');
    assert.match(rejected.event.reason || '', /action and terrain are not compatible/i,
      'built C bridge independently rejects the tampered action/terrain claim');
    assert.equal(session.event('shim_terrain_action_accepted', tampered.commandId), undefined,
      'native tamper rejects before acceptance');
    assert.equal(session.event('shim_terrain_action_queued', tampered.commandId), undefined,
      'native tamper rejects before queue mutation');
    const rejectedAck = canonicalAck(rejected, tampered, 900);
    assert.equal(rejectedAck.eventType, 'command.rejected', 'native rejection becomes canonical rejection evidence');

    const hostileLifecycle = { ...rejected.event, transactionId: { private: 'spoof' } };
    const normalizedHostile = ShimProtocol.normalizeRawShimEvent(hostileLifecycle);
    assert.equal(normalizedHostile.valid, false, 'tampered lifecycle correlation rejects at ShimProtocol trust stage');
    assert.deepEqual(normalizedHostile.event, { name: rejected.event.name }, 'invalid lifecycle exposes no untrusted source fields');
    assert.throws(() => ShimProtocol.adaptLifecycleToCommandAcknowledgement(normalizedHostile, { sequence: 901 }),
      /cannot acknowledge invalid shim lifecycle/i,
      'invalid normalized lifecycle cannot become canonical acknowledgement evidence');

    return {
      malformed: { command: malformed, blockerToken: malformedResult.blockerToken, writes: 0 },
      stale: { command: stale, blockerToken: staleResult.blockerToken, writes: 0 },
      nativeTamper: { transport: tamperedWrapper, lifecycle: rejected.event.name, queued: false, reason: rejected.event.reason },
      acknowledgementTamper: { normalized: false, acknowledged: false },
    };
  } finally {
    await session.close();
  }
}

(async () => {
  const results = [];
  let sequence = 100;
  for (const command of commands) {
    results.push(await proveImplementedFamily(command, sequence));
    sequence += 10;
  }
  const rejections = await proveTrustStageRejections();
  console.log(JSON.stringify({ bridge, implementedTypes, results, rejections }, null, 2));
  console.log('direct-command-cross-language-conformance-test PASS');
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
