const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const bridge = path.join(root, 'shim-bridge', 'nh-shim-bridge');
const protocol = 'nethack-electron-ui/v2';

const families = {
  ground: {
    inputType: 'ground-transfer',
    eventStem: 'ground_transfer',
    command(commandId, transactionId) {
      return {
        protocol,
        commandType: 'ground.transfer',
        commandId,
        transactionId,
        payload: {
          transferId: `transfer-${commandId}`,
          direction: 'ground-to-inventory',
          coord: { x: 12, y: 8 },
          itemId: 1234,
          count: 'all',
        },
      };
    },
  },
  containerTransfer: {
    inputType: 'container-transfer',
    eventStem: 'container_transfer',
    command(commandId, transactionId) {
      return {
        protocol,
        commandType: 'container.transfer',
        commandId,
        transactionId,
        payload: {
          transferId: `transfer-${commandId}`,
          sessionId: `session-${commandId}`,
          direction: 'container-to-inventory',
          containerId: 4321,
          itemId: 1234,
        },
      };
    },
  },
  containerSnapshot: {
    inputType: 'container-snapshot',
    eventStem: 'container_snapshot',
    command(commandId, transactionId) {
      return {
        protocol,
        commandType: 'container.snapshot',
        commandId,
        transactionId,
        payload: { sessionId: `session-${commandId}`, containerId: 4321 },
      };
    },
  },
  equipment: {
    inputType: 'equipment-change',
    eventStem: 'equipment_change',
    command(commandId, transactionId) {
      return {
        protocol,
        commandType: 'equipment.change',
        commandId,
        transactionId,
        payload: { action: 'wieldMain', itemId: 1234, slotId: 'mainHand', hand: '' },
      };
    },
  },
  terrain: {
    inputType: 'terrain-action',
    eventStem: 'terrain_action',
    command(commandId, transactionId) {
      return {
        protocol,
        commandType: 'terrain.action',
        commandId,
        transactionId,
        payload: { action: 'stairsDown', terrain: 'stairs.down', coord: { x: 12, y: 8 } },
      };
    },
  },
};

function wrapper(family, commandId, transactionId) {
  return {
    type: family.inputType,
    command: family.command(commandId, transactionId),
  };
}

function runBridge(inputs, done, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const child = spawn(bridge, [], {
      cwd: root,
      env: {
        ...process.env,
        NH_ELECTRON_TEST_FIXTURES: '1',
        NETHACKOPTIONS: '!tutorial,!autopickup',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const events = [];
    const stderr = [];
    let remainder = '';
    let closed = false;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill('SIGTERM'); } catch {}
      if (error) reject(error);
      else resolve({ events, stderr: stderr.join('') });
    };
    const timer = setTimeout(() => {
      finish(new Error(`bridge timeout; stderr=${stderr.join('').slice(0, 1000)}; events=${JSON.stringify(events.slice(-20))}`));
    }, timeoutMs);
    child.stdout.on('data', (data) => {
      remainder += String(data);
      const lines = remainder.split(/\r?\n/);
      remainder = lines.pop() || '';
      for (const line of lines) {
        if (!line) continue;
        try { events.push(JSON.parse(line)); } catch {}
      }
      if (done(events)) finish();
    });
    child.stderr.on('data', (data) => stderr.push(String(data)));
    child.on('error', finish);
    child.on('close', (code, signal) => {
      closed = true;
      if (!settled) finish(new Error(`bridge closed early (${code ?? signal}); stderr=${stderr.join('').slice(0, 1000)}`));
    });
    child.stdin.write(`${inputs.map((input) => typeof input === 'string' ? input : JSON.stringify(input)).join('\n')}\n`);
    setTimeout(() => { if (!closed) { try { child.stdin.end(); } catch {} } }, 100);
  });
}

function eventFor(events, family, lifecycle, commandId) {
  return events.find((event) => event.name === `shim_${family.eventStem}_${lifecycle}` && event.commandId === commandId);
}

async function proveOrderedPairs() {
  const entries = Object.entries(families);
  let pairCount = 0;
  for (const [activeName, activeFamily] of entries) {
    const activeCommandId = `arb-active-${activeName}`;
    const activeTransactionId = `arb-active-txn-${activeName}`;
    const contenders = entries.map(([blockedName, blockedFamily]) => ({
      blockedName,
      blockedFamily,
      commandId: `arb-blocked-${activeName}-${blockedName}`,
      transactionId: `arb-blocked-txn-${activeName}-${blockedName}`,
    }));
    const inputs = [
      wrapper(activeFamily, activeCommandId, activeTransactionId),
      ...contenders.map(({ blockedFamily, commandId, transactionId }) => wrapper(blockedFamily, commandId, transactionId)),
    ];
    const run = await runBridge(inputs, (events) => contenders.every(({ blockedFamily, commandId }) => eventFor(events, blockedFamily, 'rejected', commandId)));
    const accepted = eventFor(run.events, activeFamily, 'accepted', activeCommandId);
    assert(accepted, `${activeName} must acquire the common direct-command owner`);
    assert.equal(accepted.transactionId, activeTransactionId, `${activeName} accepted correlation`);
    for (const { blockedName, blockedFamily, commandId, transactionId } of contenders) {
      pairCount += 1;
      const rejected = eventFor(run.events, blockedFamily, 'rejected', commandId);
      assert(rejected, `${activeName} -> ${blockedName} must reject`);
      assert.equal(rejected.transactionId, transactionId, `${activeName} -> ${blockedName} rejection correlation`);
      assert.match(rejected.reason || '', /another direct command is active/i, `${activeName} -> ${blockedName} arbitration reason`);
      assert.equal(Boolean(eventFor(run.events, blockedFamily, 'accepted', commandId)), false, `${activeName} -> ${blockedName} must reject before acceptance`);
      assert.equal(Boolean(eventFor(run.events, blockedFamily, 'queued', commandId)), false, `${activeName} -> ${blockedName} must reject before native queue insertion`);
    }
  }
  assert.equal(pairCount, 25, 'all ordered family pairs are covered');
}

async function proveNativeTamperRejection() {
  const tampered = [
    {
      name: 'ground count',
      family: families.ground,
      input: (() => {
        const value = wrapper(families.ground, 'tamper-ground', 'tamper-ground-txn');
        value.command.payload.count = '2';
        return value;
      })(),
      reason: /count all/i,
    },
    {
      name: 'container direction',
      family: families.containerTransfer,
      input: (() => {
        const value = wrapper(families.containerTransfer, 'tamper-container-transfer', 'tamper-container-transfer-txn');
        value.command.payload.direction = 'ground-to-inventory';
        return value;
      })(),
      reason: /unsupported container\.transfer direction/i,
    },
    {
      name: 'snapshot wrapper spoof',
      family: families.containerSnapshot,
      input: { ...wrapper(families.containerSnapshot, 'tamper-container-snapshot', 'tamper-container-snapshot-txn'), commandId: 'wrapper-spoof' },
      reason: /wrapper-level commandId/i,
    },
    {
      name: 'equipment ring mismatch',
      family: families.equipment,
      input: (() => {
        const value = wrapper(families.equipment, 'tamper-equipment', 'tamper-equipment-txn');
        value.command.payload = { action: 'putOnRing', itemId: 1234, slotId: 'ring.right', hand: 'left' };
        return value;
      })(),
      reason: /ring slot and hand disagree/i,
    },
    {
      name: 'terrain mismatch',
      family: families.terrain,
      input: (() => {
        const value = wrapper(families.terrain, 'tamper-terrain', 'tamper-terrain-txn');
        value.command.payload.terrain = 'fountain';
        return value;
      })(),
      reason: /action and terrain are not compatible/i,
    },
  ];
  for (const test of tampered) {
    const commandId = test.input.command.commandId;
    const run = await runBridge([test.input], (events) => events.some((event) => event.name === `shim_${test.family.eventStem}_rejected`));
    const rejected = run.events.find((event) => event.name === `shim_${test.family.eventStem}_rejected`);
    assert(rejected, `${test.name} must reject natively`);
    assert.match(rejected.reason || '', test.reason, `${test.name} native reason`);
    assert.equal(Boolean(eventFor(run.events, test.family, 'accepted', commandId)), false, `${test.name} must fail before acceptance`);
    assert.equal(Boolean(eventFor(run.events, test.family, 'queued', commandId)), false, `${test.name} must fail before queue mutation`);
  }
}

async function proveSharedInputOwnerGates() {
  const entries = Object.entries(families);
  const queuedContenders = entries.map(([name, family]) => ({
    name,
    family,
    commandId: `arb-queued-${name}`,
    transactionId: `arb-queued-txn-${name}`,
  }));
  const queuedRun = await runBridge([
    { key: '.'.repeat(512), transactionId: 'arb-pending-key-burst' },
    ...queuedContenders.map(({ family, commandId, transactionId }) => wrapper(family, commandId, transactionId)),
  ], (events) => queuedContenders.every(({ family, commandId }) => eventFor(events, family, 'rejected', commandId)));
  for (const { name, family, commandId } of queuedContenders) {
    const rejected = eventFor(queuedRun.events, family, 'rejected', commandId);
    assert.match(rejected.reason || '', /pending native command blocks/i, `${name} checks common queue occupancy`);
    assert.equal(Boolean(eventFor(queuedRun.events, family, 'queued', commandId)), false, `${name} queue gate runs before direct mutation`);
  }

  const events = [];
  const stderr = [];
  const child = spawn(bridge, [], {
    cwd: root,
    env: { ...process.env, NH_ELECTRON_TEST_FIXTURES: '1', NETHACKOPTIONS: '!tutorial,!autopickup' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let remainder = '';
  child.stderr.on('data', (data) => stderr.push(String(data)));
  child.stdout.on('data', (data) => {
    remainder += String(data);
    const lines = remainder.split(/\r?\n/);
    remainder = lines.pop() || '';
    for (const line of lines) {
      try { events.push(JSON.parse(line)); } catch {}
    }
  });
  const waitFor = (predicate, label, timeoutMs = 8000) => new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) {
        clearInterval(timer);
        resolve(value);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`${label} timeout; stderr=${stderr.join('').slice(0, 1000)}; events=${JSON.stringify(events.slice(-30))}`));
      }
    }, 20);
  });
  try {
    child.stdin.write(`${JSON.stringify({ keycode: 32, transactionId: 'arb-dismiss-startup' })}\n`);
    await waitFor(() => events.find((event) => event.name === 'bridge_command_prompt'), 'top-level command prompt');
    child.stdin.write(`${JSON.stringify({ keycode: 105, transactionId: 'arb-open-inventory' })}\n`);
    await waitFor(() => events.find((event) => event.name === 'shim_select_menu' && event.awaitingSelection), 'active native menu');
    const menuContenders = entries.map(([name, family]) => ({
      name,
      family,
      commandId: `arb-menu-${name}`,
      transactionId: `arb-menu-txn-${name}`,
    }));
    child.stdin.write(`${menuContenders.map(({ family, commandId, transactionId }) => JSON.stringify(wrapper(family, commandId, transactionId))).join('\n')}\n`);
    await waitFor(() => menuContenders.every(({ family, commandId }) => eventFor(events, family, 'rejected', commandId)), 'all menu-owned rejections');
    for (const { name, family, commandId } of menuContenders) {
      const rejected = eventFor(events, family, 'rejected', commandId);
      assert.match(rejected.reason || '', /active prompt\/menu owner blocks/i, `${name} checks common active menu owner`);
      assert.equal(Boolean(eventFor(events, family, 'queued', commandId)), false, `${name} menu gate runs before direct mutation`);
    }
  } finally {
    try { child.kill('SIGTERM'); } catch {}
  }
}

async function proveLifecycleCorrelationAndCleanup() {
  const firstCommandId = 'arb-cleanup-snapshot';
  const firstTransactionId = 'arb-cleanup-snapshot-txn';
  const first = wrapper(families.containerSnapshot, firstCommandId, firstTransactionId);
  first.command.payload.containerId = 999999;
  const secondCommandId = 'arb-cleanup-terrain';
  const secondTransactionId = 'arb-cleanup-terrain-txn';
  const events = [];
  const child = spawn(bridge, [], {
    cwd: root,
    env: { ...process.env, NH_ELECTRON_TEST_FIXTURES: '1', NETHACKOPTIONS: '!tutorial,!autopickup' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let remainder = '';
  const stderr = [];
  child.stderr.on('data', (data) => stderr.push(String(data)));
  child.stdout.on('data', (data) => {
    remainder += String(data);
    const lines = remainder.split(/\r?\n/);
    remainder = lines.pop() || '';
    for (const line of lines) {
      try { events.push(JSON.parse(line)); } catch {}
    }
  });
  const waitFor = (predicate, label, timeoutMs = 8000) => new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) { clearInterval(timer); resolve(value); }
      else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`${label} timeout; stderr=${stderr.join('').slice(0, 1000)}; events=${JSON.stringify(events.slice(-30))}`));
      }
    }, 20);
  });
  try {
    child.stdin.write(`${JSON.stringify(first)}\n`);
    const accepted = await waitFor(() => eventFor(events, families.containerSnapshot, 'accepted', firstCommandId), 'snapshot accepted');
    const queued = await waitFor(() => eventFor(events, families.containerSnapshot, 'queued', firstCommandId), 'snapshot queued');
    const rejected = await waitFor(() => eventFor(events, families.containerSnapshot, 'rejected', firstCommandId), 'snapshot native result');
    for (const [label, event] of [['accepted', accepted], ['queued', queued], ['rejected', rejected]]) {
      assert.equal(event.commandId, firstCommandId, `${label} command correlation`);
      assert.equal(event.transactionId, firstTransactionId, `${label} transaction correlation`);
      assert.equal(event.sessionId, first.command.payload.sessionId, `${label} session correlation`);
    }
    child.stdin.write(`${JSON.stringify(wrapper(families.terrain, secondCommandId, secondTransactionId))}\n`);
    const secondAccepted = await waitFor(() => eventFor(events, families.terrain, 'accepted', secondCommandId), 'post-cleanup terrain accepted');
    assert.equal(secondAccepted.transactionId, secondTransactionId, 'cleanup releases owner for next family with correlation intact');
  } finally {
    try { child.kill('SIGTERM'); } catch {}
  }
}

(async () => {
  await proveOrderedPairs();
  await proveNativeTamperRejection();
  await proveSharedInputOwnerGates();
  await proveLifecycleCorrelationAndCleanup();
  console.log('direct-command-arbitration-shim-test PASS (25 ordered pairs, 5 native tamper cases, shared input-owner gates, correlated cleanup)');
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
