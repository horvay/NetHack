const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const { createGameProcess } = require('../src/main/game-process');
const CommandGateway = require('../src/shared/command-gateway');

const root = path.resolve(__dirname, '..');
const rendererSource = fs.readFileSync(path.join(root, 'src/renderer.js'), 'utf8');

function makeCommand(overrides = {}) {
  return CommandGateway.createActionExecuteCommand({
    commandId: overrides.commandId || 'cmd-native-ipc-drop',
    transactionId: overrides.transactionId || 'txn-native-ipc-drop',
    action: { id: 'item.drop', label: 'Drop' },
    item: overrides.item || { selector: 'j', text: 'j - a scroll labeled ZELGO MER', semanticKnown: false, known: { identity: false, appearance: true }, actionAffordances: ['drop'] },
    route: { actionId: 'item.drop', command: 'dj', selector: 'j', label: 'Drop' },
    expectedRevision: overrides.expectedRevision === undefined ? { inventory: 7 } : overrides.expectedRevision,
    source: 'test',
  });
}

function makeGroundCommand(overrides = {}) {
  return CommandGateway.createActionExecuteCommand({
    commandId: overrides.commandId || 'cmd-native-ipc-loot',
    transactionId: overrides.transactionId || 'txn-native-ipc-loot',
    action: { id: 'ground.openContainer', label: 'Open / loot here' },
    route: { actionId: 'ground.openContainer', command: '#loot\n' },
    expectedRevision: overrides.expectedRevision === undefined ? { ground: 7 } : overrides.expectedRevision,
    source: 'test',
    target: overrides.target || { location: { kind: 'ground' }, displayName: 'a large box', semanticKnown: true, known: { identity: true } },
    payload: { promptPolicy: 'netHack-owned-followup' },
  });
}

function makeDirectCommand(commandType, payload, expectedRevision = undefined) {
  return {
    protocol: 'nethack-electron-ui/v2',
    commandId: `cmd-native-ipc-${commandType}`,
    commandType,
    transactionId: `txn-native-ipc-${commandType}`,
    ...(expectedRevision ? { expectedRevision } : {}),
    payload,
  };
}

function bridgeWrites(stdinPath) {
  return fs.readFileSync(stdinPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function assertRendererRegistersPendingCommandBeforeNativeInvoke() {
  const pendingIndex = rendererSource.indexOf('pendingNativeUiCommands.set(v2Plan.commandId');
  const invokeIndex = rendererSource.indexOf('dispatchUiCommand(v2Plan.command)');
  const deleteIndex = rendererSource.indexOf('pendingNativeUiCommands.delete(v2Plan.commandId)');
  const outcomeSetIndex = rendererSource.indexOf('pendingNativeUiCommandBridgeOutcomes.set(commandId');
  const outcomeReadIndex = rendererSource.indexOf('const fastBridgeOutcome = pendingNativeUiCommandBridgeOutcomes.get(v2Plan.commandId)');
  const fastRejectIndex = rendererSource.indexOf("fastBridgeOutcome?.status === 'rejected'");
  const sentStatusIndex = rendererSource.indexOf('setStatus(`sent native v2 action.execute');
  assert.ok(pendingIndex >= 0, 'renderer must register pending native ui-command metadata');
  assert.ok(invokeIndex >= 0, 'renderer must invoke the production-native/test-seam uiCommand dispatcher for v2 action.execute');
  assert.ok(pendingIndex < invokeIndex, 'renderer must register pending native ui-command before invoking main so fast bridge accept/reject events can attach to the full command plan');
  assert.ok(deleteIndex > invokeIndex, 'renderer must clean up pending native ui-command metadata if main rejects before bridge acknowledgement');
  assert.ok(outcomeSetIndex >= 0, 'renderer must preserve fast bridge ack/rejection outcomes while main invoke is unsettled');
  assert.ok(outcomeReadIndex > invokeIndex, 'renderer must inspect fast bridge outcomes after the native uiCommand invoke resolves');
  assert.ok(fastRejectIndex > outcomeReadIndex && fastRejectIndex < sentStatusIndex, 'renderer must return/block on fast bridge rejection before writing a sent/success status');
}

function runPreloadHarness() {
  const preloadSource = fs.readFileSync(path.join(root, 'src/preload.js'), 'utf8');
  const invoked = [];
  let exposed = null;
  const sandbox = {
    console,
    process: { env: {} },
    require(name) {
      if (name !== 'electron') return require(name);
      return {
        contextBridge: { exposeInMainWorld(_name, value) { exposed = value; } },
        ipcRenderer: {
          invoke(channel, payload) {
            invoked.push({ mode: 'invoke', channel, payload });
            return Promise.resolve({ ok: false, reason: 'main process rejected native ui command' });
          },
          send(channel, payload) { invoked.push({ mode: 'send', channel, payload }); },
          on() {},
          removeListener() {},
        },
      };
    },
  };
  const preloadContext = vm.createContext(sandbox);
  vm.runInContext(preloadSource, preloadContext, { filename: 'preload.js' });
  assert(exposed?.uiCommand, 'preload exposes netHackPOC.uiCommand');
  const realmLocalCommand = vm.runInContext(`(${JSON.stringify(makeCommand())})`, preloadContext);
  return exposed.uiCommand(realmLocalCommand).then((ack) => {
    assert.deepEqual(ack, { ok: false, reason: 'main process rejected native ui command' }, 'uiCommand returns invoke ack/rejection from main');
    assert.equal(invoked.length, 1, 'uiCommand performs exactly one IPC call');
    assert.equal(invoked[0].mode, 'invoke', 'uiCommand must use invoke/ack semantics, not fire-and-forget send');
    assert.equal(invoked[0].channel, 'nethack:uiCommand');
  });
}

function writeFakeBridge(tempDir) {
  const stdinPath = path.join(tempDir, 'stdin.ndjson');
  const bridgePath = path.join(tempDir, 'fake-bridge.js');
  fs.writeFileSync(bridgePath, `#!/usr/bin/env node
const fs = require('node:fs');
const out = ${JSON.stringify(stdinPath)};
function emit(event) { process.stdout.write(JSON.stringify({ type: 'shim-event', ...event }) + '\\n'); }
function emitRaw(event) { process.stdout.write(JSON.stringify(event) + '\\n'); }
setTimeout(() => emit({ name: 'shim_update_inventory', revision: 7, inventoryRevision: 7, items: [{ selector: 106, text: 'j - a scroll labeled ZELGO MER', semanticKind: 'object', semanticAppearance: 'scroll labeled ZELGO MER', semanticKnown: false, known: { identity: false, appearance: true } }] }), 10);
setTimeout(() => emit({ name: 'shim_ground_pile_snapshot', revision: 7, coord: { x: 0, y: 0 }, source: 'level.objects', authoritative: true, items: [{ displayName: 'a large box', objectClass: '(', semanticKnown: true, semanticName: 'large box' }] }), 15);
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += String(chunk);
  fs.appendFileSync(out, String(chunk));
  for (;;) {
    const index = buffer.indexOf('\\n');
    if (index < 0) break;
    const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
    if (!line.trim()) continue;
    const payload = JSON.parse(line);
    if (payload.type === 'test-active-prompt') emit({ name: 'shim_yn_function', query: 'What do you want to drop? [j or ?*]', choices: 'j?*\\u001b', requestId: 'prompt-direct-ipc-test', transactionId: 'prompt-direct-ipc-test' });
    if (payload.type === 'test-active-transfer') emitRaw({ protocol: 'nethack-electron-ui/v2', sequence: 41, eventId: 'evt-transfer-opened-direct-ipc', eventType: 'transfer.session.opened', turn: 0, source: { layer: 'test' }, payload: { sessionId: 'transfer-direct-ipc-test', kind: 'container', container: { publicId: 'box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true } }, leftRows: [], rightRows: [], loadedSides: { left: true, right: true } } });
    if (payload.type === 'test-empty-current-ground-with-stale-other-pile') {
      emit({ name: 'shim_ground_pile_snapshot', revision: 8, coord: { x: 1, y: 1 }, source: 'level.objects', authoritative: true, items: [{ displayName: 'a large box', objectClass: '(', semanticKnown: true, semanticName: 'large box' }] });
      emit({ name: 'shim_ground_pile_snapshot', revision: 9, coord: { x: 0, y: 0 }, source: 'level.objects', authoritative: true, items: [] });
      emit({ name: 'shim_print_glyph', window: 2, x: 0, y: 0, char: '@', glyph: 725, ttychar: 64, glyphFlags: 8193, semanticKind: 'hero', semanticName: 'hero', backgroundSemanticKind: 'floor', backgroundSemanticName: 'floor of a room', groundPileSnapshotAuthoritative: true });
      emit({ name: 'shim_raw_print', text: 'You see here a large box.' });
    }
    if (payload.type === 'test-current-cell-container-with-empty-ground-pile') {
      emit({ name: 'shim_ground_pile_snapshot', revision: 8, coord: { x: 0, y: 0 }, source: 'level.objects', authoritative: true, items: [] });
      emit({ name: 'shim_print_glyph', window: 2, x: 0, y: 0, char: '@', glyph: 725, ttychar: 64, glyphFlags: 8193, semanticKind: 'hero', semanticKnown: true, semanticName: 'hero', objectLayerGlyph: 3662, objectLayerChar: '(', objectLayerSemanticKind: 'object', objectLayerSemanticKnown: true, objectLayerSemanticName: 'large box', objectLayerActionAffordances: ['container', 'loot'], groundPileSnapshotAuthoritative: true });
    }
    if (payload.type === 'ui-command') emit({ name: 'bridge_ui_command_accepted', commandId: payload.command?.commandId || '', transactionId: payload.command?.transactionId || '', actionId: payload.command?.actionId || '', command: payload.command?.payload?.route?.command || '' });
  }
});
setInterval(() => {}, 1000);
`, 'utf8');
  fs.chmodSync(bridgePath, 0o755);
  return { bridgePath, stdinPath };
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function runGameProcessHarness() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-native-ipc-'));
  const { bridgePath, stdinPath } = writeFakeBridge(tempDir);
  const diagnosticEvents = [];
  const sent = [];
  const game = createGameProcess({
    repoRoot: root,
    nethackBin: process.execPath,
    shimBridgeBin: bridgePath,
    send(channel, payload) { sent.push({ channel, payload }); },
    env: { ...process.env, NETHACKOPTIONS: '!tutorial,!autopickup' },
    diagnostics: { appendEvent(event) { diagnosticEvents.push(event); return { seq: diagnosticEvents.length, runId: 'native-ipc-test' }; }, startRun() { return { run: null }; }, publicRun() { return null; }, finalize() {} },
  });
  try {
    const started = game.startShimBridge({});
    assert.equal(started.ok, true, 'fake shim bridge starts through game-process');
    await wait(80);

    const accepted = game.uiCommand(makeCommand());
    assert.equal(accepted.ok, true, accepted.reason || 'main should accept fresh command with matching revision');
    await wait(40);
    assert.match(fs.readFileSync(stdinPath, 'utf8'), /"type":"ui-command"/, 'main writes only accepted ui-command envelope to bridge stdin');

    const acceptedFamilies = [
      ['ground.transfer', makeDirectCommand('ground.transfer', { transferId: 'transfer-ground-ipc', direction: 'ground-to-inventory', coord: { x: 0, y: 0 }, itemId: 71, count: 'all' }), 'ground-transfer'],
      ['equipment.change', makeDirectCommand('equipment.change', { action: 'clearQuiver', slotId: 'quiver' }, { inventory: 7, equipment: 7 }), 'equipment-change'],
      ['container.transfer', makeDirectCommand('container.transfer', { direction: 'container-to-inventory', transferId: 'transfer-container-ipc', sessionId: 'session-container-ipc', containerId: 81, itemId: 82 }), 'container-transfer'],
      ['container.snapshot', makeDirectCommand('container.snapshot', { sessionId: 'session-container-ipc', containerId: 81 }), 'container-snapshot'],
    ];
    for (const [commandType, command, bridgeType] of acceptedFamilies) {
      fs.writeFileSync(stdinPath, '', 'utf8');
      const result = game.uiCommand(command);
      assert.equal(result.ok, true, `${commandType} is accepted through the shared main planning call: ${result.reason || ''}`);
      assert.equal(result.bridgeType, bridgeType, `${commandType} forwards the planned route`);
      await wait(20);
      assert.deepEqual(bridgeWrites(stdinPath), [{ type: bridgeType, command }], `${commandType} acceptance performs exactly one planned bridge write`);
    }

    fs.writeFileSync(stdinPath, '', 'utf8');
    const malformedContainer = makeDirectCommand('container.transfer', { direction: 'container-to-inventory', transferId: 'transfer-malformed-ipc', sessionId: 'session-container-ipc', containerId: 81, itemId: 0 });
    const malformedContainerResult = game.uiCommand(malformedContainer);
    assert.equal(malformedContainerResult.ok, false, 'malformed container route rejects through shared planning');
    assert.equal(malformedContainerResult.blockerToken, 'blocked.input.malformedTarget');
    await wait(20);
    assert.deepEqual(bridgeWrites(stdinPath), [], 'malformed container rejection performs zero bridge writes');

    fs.writeFileSync(stdinPath, '', 'utf8');
    game.shimInput({ type: 'test-active-prompt' });
    await wait(60);
    fs.writeFileSync(stdinPath, '', 'utf8');
    const activeOwner = game.uiCommand(makeCommand({ commandId: 'cmd-active-owner', transactionId: 'txn-active-owner' }));
    assert.equal(activeOwner.ok, false, 'main rejects direct uiCommand while a main-side prompt/menu owner is active');
    assert.match(activeOwner.reason, /owns input|prompt|menu/i);
    assert.equal(activeOwner.blockerToken, 'blocked.input.promptActive', 'main returns the prompt blocker token for renderer ack evidence');
    assert.deepEqual(activeOwner.activeInputOwner, { kind: 'question', requestId: 'prompt-direct-ipc-test', transactionId: 'prompt-direct-ipc-test', label: 'What do you want to drop? [j or ?*]', lifecycle: 'opened', source: 'game-view.activePrompt' }, 'main rejection identifies the exact active prompt for diagnostics');
    assert(diagnosticEvents.some((event) => event.type === 'command.rejected' && event.payload?.activeInputOwner?.requestId === 'prompt-direct-ipc-test'), 'diagnostic event preserves the exact blocking owner');
    await wait(40);
    assert.equal(fs.readFileSync(stdinPath, 'utf8'), '', 'active-owner rejected command is not lowered/written to bridge');

    game.stop();
    await wait(80);
    game.startShimBridge({});
    await wait(80);
    fs.writeFileSync(stdinPath, '', 'utf8');
    game.shimInput({ type: 'test-active-transfer' });
    await wait(60);
    fs.writeFileSync(stdinPath, '', 'utf8');
    const activeTransfer = game.uiCommand(makeCommand({ commandId: 'cmd-active-transfer', transactionId: 'txn-active-transfer' }));
    assert.equal(activeTransfer.ok, false, 'main rejects direct uiCommand while a main-side transfer session owns input');
    assert.match(activeTransfer.reason, /owns input|transfer/i);
    assert.equal(activeTransfer.blockerToken, 'blocked.input.transferActive', 'main returns the transfer blocker token for renderer ack evidence');
    await wait(40);
    assert.equal(fs.readFileSync(stdinPath, 'utf8'), '', 'active-transfer rejected command is not lowered/written to bridge');

    game.stop();
    await wait(80);
    game.startShimBridge({});
    await wait(80);
    fs.writeFileSync(stdinPath, '', 'utf8');
    const staleGround = game.uiCommand(makeGroundCommand({ commandId: 'cmd-stale-ground', transactionId: 'txn-stale-ground', expectedRevision: { ground: 6 }, target: { location: { kind: 'ground' }, displayName: 'a different box', semanticKnown: true, known: { identity: true } } }));
    assert.equal(staleGround.ok, false, 'main rejects stale ground revision before bridge write when current public ground rows do not match');
    assert.match(staleGround.reason, /ground revision changed|stale|current public ground target/i);
    assert.equal(staleGround.blockerToken, 'blocked.input.staleRevision');
    await wait(40);
    assert.equal(fs.readFileSync(stdinPath, 'utf8'), '', 'stale-ground rejected command is not lowered/written to bridge');

    fs.writeFileSync(stdinPath, '', 'utf8');
    const matchingStaleGround = game.uiCommand(makeGroundCommand({ commandId: 'cmd-stale-ground-match', transactionId: 'txn-stale-ground-match', expectedRevision: { ground: 6 }, target: { location: { kind: 'ground' }, displayName: 'a large box', semanticKnown: true, known: { identity: true } } }));
    assert.equal(matchingStaleGround.ok, true, matchingStaleGround.reason || 'main tolerates ground revision churn when the current public ground row still matches the target');
    await wait(40);
    assert.match(fs.readFileSync(stdinPath, 'utf8'), /cmd-stale-ground-match/, 'matching stale-ground command is written to bridge as a ui-command envelope');

    fs.writeFileSync(stdinPath, '', 'utf8');
    game.shimInput({ type: 'test-current-cell-container-with-empty-ground-pile' });
    await wait(80);
    fs.writeFileSync(stdinPath, '', 'utf8');
    const currentCellGround = game.uiCommand(makeGroundCommand({ commandId: 'cmd-current-cell-ground', transactionId: 'txn-current-cell-ground', expectedRevision: { ground: 6 }, target: { location: { kind: 'ground' }, displayName: 'a locked large box', semanticKnown: false, known: { identity: false, appearance: true } } }));
    assert.equal(currentCellGround.ok, true, currentCellGround.reason || 'main accepts current public map-cell object layer as ground target evidence when the authoritative pile is empty/stale but the hero is visibly standing on that object');
    await wait(40);
    assert.match(fs.readFileSync(stdinPath, 'utf8'), /cmd-current-cell-ground/, 'current-cell ground command is written to bridge as a ui-command envelope');

    fs.writeFileSync(stdinPath, '', 'utf8');
    game.shimInput({ type: 'test-empty-current-ground-with-stale-other-pile' });
    await wait(80);
    fs.writeFileSync(stdinPath, '', 'utf8');
    const staleHistoricalGround = game.uiCommand(makeGroundCommand({ commandId: 'cmd-stale-ground-history', transactionId: 'txn-stale-ground-history', expectedRevision: { ground: 6 }, target: { location: { kind: 'ground' }, displayName: 'a large box', semanticKnown: true, known: { identity: true } } }));
    assert.equal(staleHistoricalGround.ok, false, 'main rejects stale ground when current cursor pile is empty even if another pile or historical message matches');
    assert.equal(staleHistoricalGround.blockerToken, 'blocked.input.staleRevision');
    await wait(40);
    assert.equal(fs.readFileSync(stdinPath, 'utf8'), '', 'stale historical-ground command is not lowered/written to bridge');

    const stale = game.uiCommand(makeCommand({ commandId: 'cmd-stale', transactionId: 'txn-stale', expectedRevision: { inventory: 6 }, item: { selector: 'j', text: 'j - a wand of striking', actionAffordances: ['drop'] } }));
    assert.equal(stale.ok, false, 'main rejects stale revision before bridge write');
    assert.match(stale.reason, /revision changed|stale|expected revision/i);
    assert.equal(stale.blockerToken, 'blocked.input.staleRevision', 'main returns stale blocker token for renderer ack evidence');
    await wait(40);
    assert.equal(fs.readFileSync(stdinPath, 'utf8'), '', 'stale rejected command is not lowered/written to bridge');

    fs.writeFileSync(stdinPath, '', 'utf8');
    const missingRevision = game.uiCommand(makeCommand({ commandId: 'cmd-no-rev', transactionId: 'txn-no-rev', expectedRevision: {} }));
    assert.equal(missingRevision.ok, false, 'main requires expected revision for known snapshots before bridge write');
    assert.match(missingRevision.reason, /expected revision/i);
    await wait(40);
    assert.equal(fs.readFileSync(stdinPath, 'utf8'), '', 'missing-revision command is not lowered/written to bridge');
  } finally {
    game.stop();
    await wait(80);
  }
}

(async () => {
  assertRendererRegistersPendingCommandBeforeNativeInvoke();
  await runPreloadHarness();
  await runGameProcessHarness();
  console.log('native-ui-command-ipc-test PASS');
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
