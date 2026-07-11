const assert = require('node:assert/strict');
const RecordingSchema = require('../src/shared/recording-schema');
const ReplayAdapter = require('../src/shared/replay-adapter');
const UiProtocolV2 = require('../src/shared/ui-protocol-v2');
const { safeLabel } = require('../src/main/replay-runner');

assert.equal(ReplayAdapter.keycodeForInput({ keycode: 126 }), 126);
assert.equal(ReplayAdapter.keycodeForInput({ keycode: 127 }), 0);

const v1 = {
  schema: RecordingSchema.v1,
  seed: '123',
  playerSpec: '-uReplay-Val-Hum-Fem-Law',
  options: { NETHACKOPTIONS: '!tutorial' },
  inputs: [{ key: '.', keycode: 46, source: 'test' }],
};
assert.equal(RecordingSchema.validateRecording(v1).ok, true);
let replay = ReplayAdapter.normalizeRecording(v1);
assert.equal(replay.ok, true);
assert.equal(replay.schemaVersion, 1);
assert.equal(replay.inputs.length, 1);
assert.equal(replay.checkpoints.length, 0);
assert.equal(replay.startConfig.seed, '123');

const v2 = {
  schema: RecordingSchema.v2,
  seed: '456',
  playerSpec: '-uReplay2-Val-Hum-Fem-Law',
  options: { NETHACKOPTIONS: '!tutorial,!autopickup' },
  settings: { contextualMenus: false, autoLootGold: false },
  window: { width: 1200, height: 800 },
  events: [
    { type: 'input', key: 'i', keycode: 105, source: 'test' },
    { type: 'checkpoint', name: 'inventory open', state: { status: 'demo' } },
    { type: 'input', key: '\u001b', keycode: 27, source: 'test' },
  ],
};
assert.equal(RecordingSchema.validateRecording(v2).ok, true);
const saved = RecordingSchema.sanitizeForSave(v2);
assert.equal(saved.ok, true);
assert.equal(saved.recording.inputs.length, 2);
replay = ReplayAdapter.normalizeRecording(saved.recording);
assert.equal(replay.ok, true);
assert.equal(replay.schemaVersion, 2);
assert.equal(replay.inputs.length, 2);
assert.equal(replay.checkpoints.length, 1);
assert.deepEqual(replay.startConfig.settings, v2.settings);
assert.equal(replay.startConfig.nethackOptions, '!tutorial,!autopickup');
assert.equal(safeLabel('checkpoint: inventory open'), 'checkpoint-inventory-open');

const protocolEvent = {
  protocol: UiProtocolV2.protocol,
  sequence: 1,
  eventId: 'evt-recording-test',
  eventType: 'replay.marker',
  turn: 0,
  payload: { name: 'recording schema preserves v2 evidence' },
};
const protocolCommand = {
  protocol: UiProtocolV2.protocol,
  commandId: 'cmd-recording-test',
  commandType: 'replay.control',
  payload: { mode: 'preserve-only' },
};
const protocolAck = UiProtocolV2.createCommandAckEvent({
  sequence: 2,
  eventType: 'command.rejected',
  command: { ...protocolCommand, transactionId: 'txn-recording-test', commandType: 'action.execute', actionId: 'item.drop', payload: { actionId: 'item.drop' } },
  reason: 'another prompt owns input; v2 action execution is blocked',
  supported: true,
  executionSource: 'none',
  replayBehavior: 'preserved evidence only; replay executes input events',
});
const v2Evidence = {
  schema: RecordingSchema.v2,
  events: [
    { type: 'input', key: '.', keycode: 46, source: 'test' },
    { type: 'shim-event', event: { name: 'shim_putstr', text: 'legacy evidence' } },
    { type: 'ui-protocol-event', event: protocolEvent },
    { type: 'ui-protocol-command', command: protocolCommand },
    { type: 'ui-protocol-ack', event: protocolAck },
    { type: 'screenshot', name: 'start', path: 'test-output/replay/start.png' },
    { type: 'state-sidecar', name: 'start', path: 'test-output/replay/start.state.json' },
  ],
};
assert.equal(RecordingSchema.validateRecording(v2Evidence).ok, true);
replay = ReplayAdapter.normalizeRecording(v2Evidence);
assert.equal(replay.ok, true);
assert.equal(replay.inputs.length, 1);
assert.equal(replay.preservedEvidence.length, 6);
assert.equal(replay.protocolEvents.length, 2, 'ui-protocol-ack is preserved as protocol evidence, not replay input');
assert.equal(replay.protocolCommands.length, 1);
assert.equal(replay.shimEvents.length, 1);
assert.equal(replay.inputs.length, 1, 'semantic commands/acks do not add replay inputs');
assert.equal(replay.protocolEvents.find((event) => event.type === 'ui-protocol-ack').event.payload.blockerToken, 'blocked.input.promptActive');
assert(replay.warnings.every((warning) => /preserved non-replay evidence event type/.test(warning)));

const badV2Evidence = { schema: RecordingSchema.v2, events: [{ type: 'ui-protocol-event', event: { ...protocolEvent, payload: null } }] };
assert.equal(RecordingSchema.validateRecording(badV2Evidence).ok, false);
assert.equal(RecordingSchema.validateRecording({ schema: RecordingSchema.v2, events: [{ type: 'checkpoint' }] }).ok, false);
console.log('recording schema/replay adapter test OK');
