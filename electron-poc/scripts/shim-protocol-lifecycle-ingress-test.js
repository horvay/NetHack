const assert = require('node:assert/strict');

const ShimProtocol = require('../src/shared/shim-protocol');
const UiProtocolV2 = require('../src/shared/ui-protocol-v2');

const correlation = { commandId: 'cmd-native-17', transactionId: 'txn-native-17' };
const ground = { ...correlation, transferId: 'transfer-ground-17', itemId: 1234, direction: 'ground-to-inventory', coord: { x: 42, y: 12 } };
const terrain = { ...correlation, action: 'dip', terrain: 'fountain', coord: { x: 42, y: 12 }, itemId: 91 };
const containerTransfer = { ...correlation, transferId: 'transfer-container-17', containerId: 77, itemId: 91, direction: 'container-to-inventory' };
const containerSnapshot = { ...correlation, sessionId: 'session-container-17', containerId: 77 };
const equipment = { ...correlation, action: 'putOnRing', itemId: 55, slotId: 'ring.left', hand: 'left' };
const bridgeUi = { ...correlation, actionId: 'item.rub' };

const fixtures = [
  { name: 'shim_ground_transfer_accepted', ...ground },
  { name: 'shim_ground_transfer_queued', ...ground },
  { name: 'shim_ground_transfer_confirmed', ...ground, reason: 'ground item picked up' },
  { name: 'shim_ground_transfer_rejected', ...ground, reason: 'ground transfer rejected' },
  { name: 'shim_terrain_action_accepted', ...terrain },
  { name: 'shim_terrain_action_queued', ...terrain },
  { name: 'shim_terrain_action_confirmed', ...terrain, reason: 'item dipped' },
  { name: 'shim_terrain_action_rejected', ...terrain, reason: 'coordinate no longer matches' },
  { name: 'shim_container_transfer_accepted', ...containerTransfer },
  { name: 'shim_container_transfer_queued', ...containerTransfer },
  { name: 'shim_container_transfer_confirmed', ...containerTransfer, reason: 'container item taken out' },
  { name: 'shim_container_transfer_rejected', ...containerTransfer, reason: 'container transfer rejected' },
  { name: 'shim_container_snapshot_accepted', ...containerSnapshot },
  { name: 'shim_container_snapshot_queued', ...containerSnapshot },
  { name: 'shim_container_snapshot_confirmed', ...containerSnapshot, status: 'ok', reason: '' },
  { name: 'shim_container_snapshot_rejected', ...containerSnapshot, status: 'rejected', failureKind: 'stale-target', reason: 'container target no longer exists' },
  { name: 'shim_equipment_change_accepted', ...equipment },
  { name: 'shim_equipment_change_queued', ...equipment },
  { name: 'shim_equipment_change_confirmed', ...equipment, reason: 'ring equipped' },
  { name: 'shim_equipment_change_rejected', ...equipment, reason: 'equipment change rejected' },
  { name: 'bridge_ui_command_accepted', ...bridgeUi, command: '#rub\n' },
  { name: 'bridge_ui_command_rejected', ...bridgeUi, reason: 'command bytes did not match the registered route' },
].map((event) => ({ type: 'shim-event', ...event }));

let sequence = 1;
for (const fixture of fixtures) {
  assert.equal(typeof ShimProtocol.validators[fixture.name], 'function', `${fixture.name} has a real ingress validator`);
  const bridgeJson = JSON.stringify(fixture);
  const normalized = ShimProtocol.normalizeRawShimEvent(JSON.parse(bridgeJson));
  assert.equal(normalized.known, true, `${fixture.name} is registered`);
  assert.equal(normalized.valid, true, `${fixture.name} accepts its real bridge shape: ${normalized.errors.join('; ')}`);
  assert.deepEqual(normalized.event, normalized.payload, `${fixture.name} exposes one canonical public payload`);
  assert.equal(ShimProtocol.normalizeRawShimEvent(normalized.event).valid, true, `${fixture.name} public payload is stable on repeated ingress`);
  assert.equal(normalized.event.commandId, fixture.commandId, `${fixture.name} preserves command correlation`);
  assert.equal(normalized.event.transactionId, fixture.transactionId, `${fixture.name} preserves transaction correlation`);
  if (fixture.transferId) assert.equal(normalized.event.transferId, fixture.transferId, `${fixture.name} preserves transfer correlation`);
  if (fixture.sessionId) assert.equal(normalized.event.sessionId, fixture.sessionId, `${fixture.name} preserves session correlation`);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized.event, 'privateState'), false, `${fixture.name} publishes no private state`);
  if (fixture.name === 'bridge_ui_command_accepted') assert.equal(Object.prototype.hasOwnProperty.call(normalized.event, 'command'), false, 'raw route command bytes do not cross shim ingress');

  const acknowledgement = ShimProtocol.adaptLifecycleToCommandAcknowledgement(normalized, { sequence, turn: 17, source: { layer: 'renderer' } });
  const checkedAck = UiProtocolV2.validateEventEnvelope(acknowledgement);
  assert.equal(checkedAck.ok, true, `${fixture.name} adapts to an accepted canonical acknowledgement: ${checkedAck.errors.join('; ')}`);
  assert.equal(acknowledgement.payload.commandId, fixture.commandId, `${fixture.name} acknowledgement preserves commandId`);
  assert.equal(acknowledgement.payload.transactionId, fixture.transactionId, `${fixture.name} acknowledgement preserves transactionId`);
  if (fixture.transferId) assert.equal(acknowledgement.payload.transferId, fixture.transferId, `${fixture.name} acknowledgement preserves transferId`);
  if (fixture.sessionId) assert.equal(acknowledgement.payload.sessionId, fixture.sessionId, `${fixture.name} acknowledgement preserves sessionId`);
  const acknowledgementIngress = ShimProtocol.normalizeRawShimEvent(JSON.parse(JSON.stringify(acknowledgement)));
  assert.equal(acknowledgementIngress.known, true, `${fixture.name} canonical acknowledgement is known at ingress`);
  assert.equal(acknowledgementIngress.valid, true, `${fixture.name} canonical acknowledgement is accepted at ingress`);
  sequence += 1;
}

const bridgeCommand = ShimProtocol.normalizeRawShimEvent(JSON.parse(JSON.stringify({
  name: 'bridge_command',
  type: 'shim-event',
  keycode: 114,
  queuedBefore: 0,
  queuedAfter: 1,
  transactionId: 'txn-bridge-key-1',
  requestSource: { layer: 'shim-bridge' },
  guiAction: { actionId: 'item.read.scroll', label: 'Read', targetSelector: 'f', targetText: 'a scroll', followupPlan: 'no-followup', expectedRequestId: 'prompt-1', commandPosition: 1, commandLength: 2 },
})));
assert.equal(bridgeCommand.known, true, 'bridge_command is registered');
assert.equal(bridgeCommand.valid, true, bridgeCommand.errors.join('; '));
assert.equal(bridgeCommand.event.transactionId, 'txn-bridge-key-1', 'bridge_command preserves transaction correlation');
assert.equal(bridgeCommand.event.guiAction.actionId, 'item.read.scroll', 'bridge_command preserves public action correlation');
assert.equal(JSON.stringify(bridgeCommand.event).includes('targetText'), true, 'public bridge action presentation remains available');

const partialNativeRejection = ShimProtocol.normalizeRawShimEvent({ name: 'shim_ground_transfer_rejected', direction: 'ground-to-inventory', reason: 'wrapper-level protocol is not allowed' });
assert.equal(partialNativeRejection.known, true, 'native rejection without parseable command correlation remains known');
assert.equal(partialNativeRejection.valid, true, partialNativeRejection.errors.join('; '));
assert.equal(ShimProtocol.adaptLifecycleToCommandAcknowledgement(partialNativeRejection, { sequence }), undefined, 'uncorrelated native rejection cannot masquerade as a command acknowledgement');

const wrongTransportType = ShimProtocol.normalizeRawShimEvent({ ...fixtures[0], type: 'shim-event-spoofed' });
assert.equal(wrongTransportType.known, true, 'spoofed transport discriminator remains a recognized lifecycle');
assert.equal(wrongTransportType.valid, false, 'only the exact shim-event transport discriminator is stripped');
assert.deepEqual(wrongTransportType.event, { name: fixtures[0].name }, 'spoofed transport discriminator fails closed without correlation');

for (const fixture of fixtures) {
  const hostile = ShimProtocol.normalizeRawShimEvent({ ...fixture, privateState: { otyp: 123, charges: 9 } });
  assert.equal(hostile.known, true, `${fixture.name} remains recognized when rejected`);
  assert.equal(hostile.valid, false, `${fixture.name} fails closed on a private field`);
  assert.deepEqual(hostile.event, { name: fixture.name }, `${fixture.name} exposes no source fields after rejection`);
  assert.equal(JSON.stringify(hostile).includes('otyp'), false, `${fixture.name} rejected wrapper sanitizes private values`);
}

const malformed = [
  { ...ground, name: 'shim_ground_transfer_accepted', itemId: '1234' },
  { ...ground, name: 'shim_ground_transfer_queued', coord: { x: -1, y: 12 } },
  { ...terrain, name: 'shim_terrain_action_accepted', action: 'invokeHiddenNativeCommand' },
  { ...terrain, name: 'shim_terrain_action_queued', action: 'stairsDown', terrain: 'fountain' },
  { ...terrain, name: 'shim_terrain_action_confirmed', reason: { private: true } },
  { ...containerTransfer, name: 'shim_container_transfer_accepted', direction: 'ground-to-inventory' },
  { ...containerSnapshot, name: 'shim_container_snapshot_accepted', status: 'ok' },
  { ...containerSnapshot, name: 'shim_container_snapshot_confirmed', status: 'rejected', reason: '' },
  { ...containerSnapshot, name: 'shim_container_snapshot_rejected', status: 'rejected', failureKind: 'locked', reason: '' },
  { ...equipment, name: 'shim_equipment_change_accepted', action: 'wearAnything' },
  { ...equipment, name: 'shim_equipment_change_queued', hand: 'right' },
  { ...bridgeUi, name: 'bridge_ui_command_accepted', command: 35 },
  { ...bridgeUi, name: 'bridge_ui_command_rejected', command: '#rub\n', reason: 'route rejected' },
  { name: 'bridge_command', keycode: 114, queuedBefore: 0, queuedAfter: 1, transactionId: 'txn-bridge-key-2', requestSource: { layer: 'shim-bridge', privateFd: 4 } },
];
for (const event of malformed) {
  const normalized = ShimProtocol.normalizeRawShimEvent(event);
  assert.equal(normalized.valid, false, `${event.name} rejects malformed bridge data`);
  assert.deepEqual(normalized.event, { name: event.name }, `${event.name} malformed payload fails closed`);
}

const hostileAck = UiProtocolV2.createCommandAckEvent({
  sequence,
  commandId: 'cmd-ack-private',
  transactionId: 'txn-ack-private',
  transferId: { private: true },
  commandType: 'ground.transfer',
  status: 'accepted',
  executionSource: 'bridge-ui-command',
});
assert.equal(UiProtocolV2.validateEventEnvelope(hostileAck).ok, false, 'acknowledgement constructor leaves malformed transfer correlation invalid');
const privateAck = { ...hostileAck, payload: { ...hostileAck.payload, privateState: true } };
assert.equal(UiProtocolV2.validateEventEnvelope(privateAck).ok, false, 'canonical acknowledgement rejects private payload fields');

console.log(`shim-protocol-lifecycle-ingress-test PASS (${fixtures.length} native lifecycle shapes)`);
