const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const UiProtocolV2 = require('../src/shared/ui-protocol-v2');
const ShimProtocol = require('../src/shared/shim-protocol');
const GameViewState = require('../src/shared/game-view-state');
const RecordingSchema = require('../src/shared/recording-schema');
const ReplayAdapter = require('../src/shared/replay-adapter');

const fixtureDir = path.join(__dirname, '..', 'test', 'fixtures', 'ui-protocol-v2');
function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, name), 'utf8'));
}

const validEvents = readJson('valid-events.json');
for (const [index, event] of validEvents.entries()) {
  const checked = UiProtocolV2.validateEventEnvelope(event);
  assert.equal(checked.ok, true, `valid event ${index} should pass: ${checked.errors.join('; ')}`);
  const normalized = UiProtocolV2.normalizeEventEnvelope(event);
  assert.equal(normalized.valid, true);
  assert.equal(normalized.event.eventId, event.eventId);
}
assert.equal(UiProtocolV2.validateEventSequence(validEvents).ok, true);
const nonMonotonic = [validEvents[1], validEvents[0]];
assert.equal(UiProtocolV2.validateEventSequence(nonMonotonic).ok, false);

const invalidEvents = readJson('invalid-events.json');
for (const { case: caseName, event } of invalidEvents) {
  const checked = UiProtocolV2.validateEventEnvelope(event);
  assert.equal(checked.ok, false, `${caseName} should fail closed`);
  const normalized = UiProtocolV2.normalizeEventEnvelope(event);
  assert.equal(normalized.valid, false, `${caseName} normalize should remain invalid`);
  assert.equal(normalized.event, undefined, `${caseName} must not expose a normalized event`);
}

const validCommands = readJson('valid-commands.json');
for (const [index, command] of validCommands.entries()) {
  const checked = UiProtocolV2.validateCommandEnvelope(command);
  assert.equal(checked.ok, true, `valid command ${index} should pass: ${checked.errors.join('; ')}`);
  const normalized = UiProtocolV2.normalizeCommandEnvelope(command);
  assert.equal(normalized.valid, true);
  assert.equal(normalized.command.commandId, command.commandId);
}

const invalidCommands = readJson('invalid-commands.json');
for (const { case: caseName, command } of invalidCommands) {
  const checked = UiProtocolV2.validateCommandEnvelope(command);
  assert.equal(checked.ok, false, `${caseName} should fail closed`);
  const normalized = UiProtocolV2.normalizeCommandEnvelope(command);
  assert.equal(normalized.valid, false, `${caseName} normalize should remain invalid`);
  assert.equal(normalized.command, undefined, `${caseName} must not expose a normalized command`);
}

const marker = UiProtocolV2.createV1CompatibilityDiagnostic({
  sequence: 99,
  eventId: 'evt-v1-compat-generated',
  legacyEventName: 'shim_end_menu',
  legacyPath: 'renderer.menuKind',
  reason: 'classic menu route remains authoritative for this slice',
});
const markerCheck = UiProtocolV2.validateEventEnvelope(marker);
assert.equal(markerCheck.ok, true, markerCheck.errors.join('; '));
assert.equal(marker.eventType, 'diagnostic.v1Compatibility');

const legacy = ShimProtocol.normalizeRawShimEvent({ name: 'shim_putstr', window: 1, text: 'v1 remains compatible' });
assert.equal(legacy.protocol, ShimProtocol.version);
assert.equal(legacy.valid, true);
assert.equal(legacy.event.text, 'v1 remains compatible');
const unknownLegacy = ShimProtocol.normalizeRawShimEvent({ name: 'future_v1_event', text: 'safe unknown' });
assert.equal(unknownLegacy.protocol, ShimProtocol.version);
assert.equal(unknownLegacy.valid, false);
assert.match(unknownLegacy.errors.join(' '), /unknown event/);

const mapLayerEvent = {
  name: 'shim_print_glyph',
  window: 3,
  x: 4,
  y: 5,
  char: '?',
  glyph: 111,
  semanticAppearance: 'scroll labeled ZELGO MER',
  backgroundGlyph: 222,
  backgroundSemanticKind: 'terrain',
  backgroundSemanticName: 'room floor',
  backgroundActionAffordances: ['walk'],
  objectLayerGlyph: 333,
  objectLayerChar: 63,
  objectLayerSemanticKind: 'object',
  objectLayerSemanticName: 'scroll',
  objectLayerSemanticAppearance: 'scroll labeled ZELGO MER',
  objectLayerSemanticKnown: false,
  objectLayerActionAffordances: ['pickup'],
};
const normalizedMapLayer = ShimProtocol.normalizeRawShimEvent(mapLayerEvent);
assert.equal(normalizedMapLayer.valid, true);
for (const key of ['backgroundGlyph', 'backgroundSemanticKind', 'backgroundSemanticName', 'backgroundActionAffordances', 'objectLayerGlyph', 'objectLayerChar', 'objectLayerSemanticKind', 'objectLayerSemanticAppearance', 'objectLayerSemanticKnown', 'objectLayerActionAffordances', 'semanticAppearance']) {
  assert.deepEqual(normalizedMapLayer.event[key], mapLayerEvent[key], `v1 map layer field preserved by shim protocol: ${key}`);
}
assert.equal(normalizedMapLayer.event.objectLayerSemanticName, undefined, 'shim protocol redacts object-layer semanticName when semanticKnown is false');
const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
view.process({ name: 'shim_create_nhwindow', return: 3, windowType: 3 });
view.process(mapLayerEvent);
const storedCell = view.state.mapCells[5][4];
for (const key of ['backgroundGlyph', 'backgroundSemanticKind', 'backgroundSemanticName', 'backgroundActionAffordances', 'objectLayerGlyph', 'objectLayerChar', 'objectLayerSemanticKind', 'objectLayerSemanticAppearance', 'objectLayerSemanticKnown', 'objectLayerActionAffordances', 'semanticAppearance']) {
  assert.deepEqual(storedCell[key], mapLayerEvent[key], `v1 map layer field preserved by game view state: ${key}`);
}
assert.equal(storedCell.objectLayerSemanticName, undefined, 'game view state keeps redacted object-layer semanticName absent when semanticKnown is false');

const replayRecording = readJson('replay-recording.json');
const replayCheck = RecordingSchema.validateRecording(replayRecording);
assert.equal(replayCheck.ok, true, replayCheck.message);
const sanitized = RecordingSchema.sanitizeForSave(replayRecording);
assert.equal(sanitized.ok, true, sanitized.message);
assert.equal(sanitized.recording.inputs.length, 1, 'legacy input projection should keep only replayable key input');
const replay = ReplayAdapter.normalizeRecording(sanitized.recording);
assert.equal(replay.ok, true, replay.message);
assert.equal(replay.inputs.length, 1);
assert.equal(replay.checkpoints.length, 1);
assert.equal(replay.preservedEvidence.length, 8);
assert.equal(replay.protocolEvents.length, 4);
assert(replay.protocolEvents.some((event) => event.event.eventType === 'inventory.snapshot' && event.event.payload.revision === 1), 'replay preserves inventory snapshot evidence records');
assert(replay.protocolEvents.some((event) => event.event.eventType === 'equipment.snapshot' && event.event.payload.revision === 1), 'replay preserves equipment snapshot evidence records');
assert.equal(replay.protocolCommands.length, 1);
assert.equal(replay.shimEvents.length, 1);
assert(replay.warnings.some((warning) => /preserved non-replay evidence event type ui-protocol-event/.test(warning)));

const invalidReplay = {
  schema: RecordingSchema.v2,
  events: [{ type: 'ui-protocol-event', event: invalidEvents[0].event }],
};
const invalidReplayCheck = RecordingSchema.validateRecording(invalidReplay);
assert.equal(invalidReplayCheck.ok, false, 'malformed recorded v2 events must fail closed');
assert.match(invalidReplayCheck.message, /invalid ui-protocol-event/);
const nonMonotonicReplay = {
  schema: RecordingSchema.v2,
  events: [
    { type: 'ui-protocol-event', event: validEvents[1] },
    { type: 'ui-protocol-ack', event: validEvents[0] },
  ],
};
assert.equal(RecordingSchema.validateRecording(nonMonotonicReplay).ok, false, 'recorded v2 event streams must be monotonic');
assert.equal(RecordingSchema.validateRecording({ schema: RecordingSchema.v2, events: [{ type: 'input' }] }).ok, false, 'unreplayable input must fail closed');
assert.equal(RecordingSchema.validateRecording({ schema: RecordingSchema.v2, events: [{ type: 'input', keycode: 127 }] }).ok, false, 'DEL keycode is outside current replayable command-gateway range');

console.log('ui protocol v2 golden tests OK');
