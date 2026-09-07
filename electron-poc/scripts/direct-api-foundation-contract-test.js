const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const UiProtocolV2 = require('../src/shared/ui-protocol-v2');
const CommandGateway = require('../src/shared/command-gateway');
const EvidenceScan = require('../src/shared/direct-api-evidence-scan');
const { createGameProcess } = require('../src/main/game-process');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'direct-api-foundation');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

function direct(commandType, payload, expectedRevision = {}) {
  return {
    protocol: UiProtocolV2.protocol,
    commandType,
    commandId: `cmd-${commandType.replace(/\W+/g, '-')}`,
    transactionId: `txn-${commandType.replace(/\W+/g, '-')}`,
    expectedRevision,
    payload,
  };
}

const registry = UiProtocolV2.directCommandRegistry;
assert(registry.current.includes('action.execute'), 'registry distinguishes current command types');
assert(registry.current.includes('container.transfer'), 'registry documents existing direct container commands');
assert(registry.current.includes('equipment.change'), 'registry documents newly implemented direct equipment commands');
assert(registry.current.includes('terrain.action'), 'registry documents newly implemented direct terrain commands');
assert(registry.proposed.includes('container.tip'), 'registry still documents future direct command types');
assert(!registry.proposed.includes('equipment.change'), 'implemented equipment.change is no longer listed as proposed');
assert(!registry.proposed.includes('terrain.action'), 'implemented terrain.action is no longer listed as proposed');
assert(registry.direct.includes('terrain.action'), 'registry exposes direct-command type list');
assert(UiProtocolV2.eventTypes.includes('command.accepted'), 'event registry exposes command.accepted');
assert(UiProtocolV2.eventTypes.includes('command.rejected'), 'event registry exposes command.rejected');
assert(UiProtocolV2.eventTypes.includes('command.completed'), 'event registry exposes command.completed');
for (const status of ['accepted', 'queued', 'completed', 'success', 'failure', 'cancelled', 'rejected']) assert(registry.statuses.includes(status), `status vocabulary includes ${status}`);
const queuedAck = UiProtocolV2.createCommandAckEvent({ sequence: 1, eventType: 'command.accepted', commandId: 'cmd-queued', commandType: 'terrain.action', status: 'queued', executionSource: 'native-ui-command' });
assert.equal(UiProtocolV2.validateEventEnvelope(queuedAck).ok, true, 'queued lifecycle status validates on command.accepted');
assert.match(registry.revisionSemantics, /stale public snapshot guard/);
assert.match(registry.hiddenClassicMenuDriving, /must not drive invisible classic menus/);
assert.match(registry.snapshotAfterChange, /authoritative snapshots/);
assert.match(registry.rendererReconcile, /reconcile/);

const examples = [
  direct('ground.transfer', { transferId: 'ground-panel-1', direction: 'ground-to-inventory', coord: { x: 42, y: 12 }, itemId: 1234, count: 'all' }, { ground: 12, inventory: 31 }),
  direct('equipment.change', { action: 'putOnRing', itemId: 55, slotId: 'ring.left', hand: 'left' }, { inventory: 31, equipment: 14 }),
  direct('equipment.change', { action: 'wearArmor', itemId: 56, slotId: 'armor.body' }, { inventory: 31, equipment: 14 }),
  direct('container.force', { containerId: 77, coord: { x: 42, y: 12 }, toolOrWeaponId: 88, confirmDestructive: true }, { ground: 12, inventory: 31 }),
  direct('item.use', { action: 'rub', itemId: 91, count: 1, followupPolicy: 'visible-netHack-owned' }, { inventory: 9 }),
  direct('terrain.action', { action: 'dip', coord: { x: 42, y: 12 }, terrain: 'fountain', itemId: 91 }, { map: 44, inventory: 9 }),
  direct('altar.action', { action: 'offer', coord: { x: 42, y: 12 }, itemId: 101 }, { map: 44, inventory: 9, ground: 2 }),
  direct('container.tip', { containerId: 77, coord: { x: 42, y: 12 }, confirmDestructive: true }, { ground: 12, inventory: 31 }),
  direct('container.untrap', { containerId: 77, coord: { x: 42, y: 12 } }, { ground: 12, inventory: 31 }),
  direct('container.unlock', { containerId: 77, coord: { x: 42, y: 12 }, toolId: 78, intent: 'unlock' }, { ground: 12, inventory: 31 }),
  direct('target.answer', { targetRequestId: 'target-r1', coord: { x: 43, y: 12 } }, { map: 44 }),
];
for (const proposed of registry.proposed) assert(CommandGateway.directCommandValidationSpec(proposed), `gateway has a validation spec for proposed direct command ${proposed}`);

for (const command of examples) {
  const protocolCheck = UiProtocolV2.validateCommandEnvelope(command);
  assert.equal(protocolCheck.ok, true, `${command.commandType} protocol example validates: ${protocolCheck.errors.join('; ')}`);
  const context = { uiProtocol: UiProtocolV2, requireExpectedRevisionForKnownSnapshots: true };
  for (const [key, value] of Object.entries(command.expectedRevision || {})) context[`${key}Revision`] = value;
  if (command.commandType === 'target.answer') context.activeInputOwner = { kind: 'target', requestId: 'target-r1' };
  const plan = CommandGateway.validateDirectCommandEnvelope(command, context);
  assert.equal(plan.ok, true, `${command.commandType} gateway plan validates: ${plan.reason || ''}`);
  assert.equal(typeof plan.bridgeType, 'string');
  assert.equal(typeof plan.implementedRoute, 'boolean', 'direct validation plan exposes whether this slice has an explicit bridge route');
  if (!plan.implementedRoute) assert.notEqual(plan.bridgeType, 'ui-command', 'unimplemented direct routes still refuse generic key fallback');
  assert(Array.isArray(plan.changesSnapshots), 'snapshot-after-change surfaces are documented in the plan');
}

{
  const bad = direct('equipment.change', { action: 'putOnRing', itemId: 55, hand: 'middle' }, { inventory: 31, equipment: 14 });
  const plan = CommandGateway.validateDirectCommandEnvelope(bad, { uiProtocol: UiProtocolV2, inventoryRevision: 31, equipmentRevision: 14 });
  assert.equal(plan.ok, false, 'enum validation rejects unsupported public hand');
  assert.match(plan.reason, /payload.hand/);
}

{
  const invalidEquipmentCommands = [
    ['takeOff missing itemId', { action: 'takeOff', slotId: 'armor.shield' }, /itemId/],
    ['removeAccessory missing itemId', { action: 'removeAccessory', slotId: 'ring.left' }, /itemId/],
    ['wieldMain missing itemId', { action: 'wieldMain', slotId: 'mainHand' }, /itemId/],
    ['quiver missing itemId', { action: 'quiver', slotId: 'quiver' }, /itemId/],
    ['putOnRing missing itemId', { action: 'putOnRing', slotId: 'ring.left', hand: 'left' }, /itemId/],
    ['wearArmor missing itemId', { action: 'wearArmor', slotId: 'armor.body' }, /itemId/],
    ['wearArmor missing slotId', { action: 'wearArmor', itemId: 55 }, /slotId/],
    ['wearArmor non-armor slot', { action: 'wearArmor', itemId: 55, slotId: 'mainHand' }, /slotId/],
    ['putOnRing missing hand', { action: 'putOnRing', itemId: 55, slotId: 'ring.left' }, /hand/],
    ['putOnRing missing slotId', { action: 'putOnRing', itemId: 55, hand: 'left' }, /slotId/],
    ['putOnRing hand-slot disagreement', { action: 'putOnRing', itemId: 55, hand: 'left', slotId: 'ring.right' }, /slotId and hand disagree/],
    ['wieldMain wrong slot', { action: 'wieldMain', itemId: 55, slotId: 'quiver' }, /slotId/],
    ['quiver wrong slot', { action: 'quiver', itemId: 55, slotId: 'mainHand' }, /slotId/],
    ['clearQuiver wrong slot', { action: 'clearQuiver', slotId: 'mainHand' }, /slotId/],
    ['non-ring action has hand', { action: 'wieldMain', itemId: 55, slotId: 'mainHand', hand: 'left' }, /hand/],
  ];
  for (const [label, payload, reasonPattern] of invalidEquipmentCommands) {
    const bad = direct('equipment.change', payload, { inventory: 31, equipment: 14 });
    const plan = CommandGateway.validateDirectCommandEnvelope(bad, { uiProtocol: UiProtocolV2, inventoryRevision: 31, equipmentRevision: 14 });
    assert.equal(plan.ok, false, `command gateway rejects invalid equipment.change before native lowering: ${label}`);
    assert.equal(plan.blockerToken, 'blocked.input.malformedTarget', label);
    assert.match(plan.reason, reasonPattern, label);
  }
}

{
  const bad = direct('ground.transfer', { transferId: 'x', direction: 'ground-to-inventory', coord: { x: 1, y: 2, z: 0 }, itemId: 1, count: 'all', hiddenSelector: 'a' }, { ground: 1, inventory: 1 });
  const check = UiProtocolV2.validateCommandEnvelope(bad);
  assert.equal(check.ok, false, 'protocol validator rejects unknown direct payload fields');
  assert.match(check.errors.join('\n'), /hiddenSelector|coord\.z/);
}

{
  const bad = direct('container.force', { containerId: 77, coord: { x: 1, y: 2 }, confirmDestructive: true, locked: true }, { ground: 1, inventory: 1 });
  const plan = CommandGateway.validateDirectCommandEnvelope(bad, { uiProtocol: UiProtocolV2, groundRevision: 1, inventoryRevision: 1 });
  assert.equal(plan.ok, false, 'forbidden hidden fields are rejected in public direct-command payloads');
  assert.match(plan.reason, /locked|hidden\/private NetHack state|not an allowed public field/);
}

{
  const stale = direct('item.use', { action: 'rub', itemId: 9, count: 1, followupPolicy: 'visible-netHack-owned' }, { inventory: 2 });
  const plan = CommandGateway.validateDirectCommandEnvelope(stale, { uiProtocol: UiProtocolV2, inventoryRevision: 3, requireExpectedRevisionForKnownSnapshots: true });
  assert.equal(plan.ok, false, 'stale expectedRevision rejects before native routing');
  assert.equal(plan.blockerToken, 'blocked.input.staleRevision');
}

{
  const staleFromZero = direct('item.use', { action: 'rub', itemId: 9, count: 1, followupPolicy: 'visible-netHack-owned' }, { inventory: 5 });
  const plan = CommandGateway.validateDirectCommandEnvelope(staleFromZero, { uiProtocol: UiProtocolV2, inventoryRevision: 0, requireExpectedRevisionForKnownSnapshots: true });
  assert.equal(plan.ok, false, 'supplied stale expectedRevision rejects even when the known current revision is 0');
  assert.equal(plan.blockerToken, 'blocked.input.staleRevision');
}

{
  const wrongRequest = direct('target.answer', { targetRequestId: 'target-r2', coord: { x: 1, y: 1 } }, { map: 1 });
  const plan = CommandGateway.validateDirectCommandEnvelope(wrongRequest, { uiProtocol: UiProtocolV2, mapRevision: 1, activeInputOwner: { kind: 'target', requestId: 'target-r1' } });
  assert.equal(plan.ok, false, 'request-scoped target answers must match the active request exactly');
  assert.equal(plan.blockerToken, 'blocked.input.staleRevision');
}

{
  const noRevision = direct('terrain.action', { action: 'drink', coord: { x: 10, y: 5 }, terrain: 'fountain' }, {});
  const plan = CommandGateway.validateDirectCommandEnvelope(noRevision, { uiProtocol: UiProtocolV2, mapRevision: 4, inventoryRevision: 1, requireExpectedRevisionForKnownSnapshots: true });
  assert.equal(plan.ok, false, 'known public revisions are required unless a slice documents a low-risk omission');
  assert.equal(plan.blockerToken, 'blocked.input.staleRevision');
}

{
  const active = direct('equipment.change', { action: 'takeOff', itemId: 55 }, { inventory: 1, equipment: 1 });
  const plan = CommandGateway.validateDirectCommandEnvelope(active, { uiProtocol: UiProtocolV2, inventoryRevision: 1, equipmentRevision: 1, activeInputOwner: { kind: 'menu', requestId: 'menu-owner-r1', transactionId: 'menu-owner-t1', window: 7, label: 'Choose an item', lifecycle: 'selecting', source: 'game-view.currentMenu' } });
  assert.equal(plan.ok, false, 'prompt/menu ownership blocks direct commands');
  assert.equal(plan.blockerToken, 'blocked.input.menuActive');
  assert.deepEqual(plan.activeInputOwner, { kind: 'menu', requestId: 'menu-owner-r1', transactionId: 'menu-owner-t1', label: 'Choose an item', lifecycle: 'selecting', source: 'game-view.currentMenu', window: 7 }, 'ownership rejection exposes actionable internal owner identity');
}

{
  const diagnostics = [];
  const game = createGameProcess({ repoRoot: path.resolve(root, '..'), nethackBin: '', shimBridgeBin: '', send: () => {}, diagnostics: { appendEvent: (event) => diagnostics.push(event) } });
  const command = direct('container.tip', { containerId: 77, coord: { x: 42, y: 12 }, confirmDestructive: true }, { ground: 0, inventory: 0 });
  const result = game.uiCommand(command);
  assert.equal(result.ok, false, 'registered-but-unimplemented direct route must fail closed');
  assert.equal(result.blockerToken, 'blocked.input.unsupportedRoute');
  assert.equal(result.implementationState, 'registered-unimplemented');
  assert(diagnostics.some((event) => event.type === 'command.rejected' && event.payload?.commandType === 'container.tip' && event.payload?.planningAuthority === 'CommandGateway'), 'game-process records CommandGateway-owned implementation-state rejection evidence');
}

const scanDir = path.join(outDir, 'clean-scan');
fs.mkdirSync(scanDir, { recursive: true });
fs.writeFileSync(path.join(scanDir, 'events.jsonl'), [
  JSON.stringify({ name: 'command.accepted', commandType: 'equipment.change', command: 'equipment.change', payload: { status: 'accepted' } }),
  JSON.stringify({ name: 'inventory.snapshot', text: 'Inventory is stable.' }),
].join('\n'));
const forbiddenRules = [
  { id: 'no-extcmd-answer', field: 'name', equals: 'bridge_extcmd_answer' },
  { id: 'no-pickup-prompt', field: 'text', regex: '\\bPick up what\\?' },
  { id: 'no-classic-force-command', field: 'command', regex: '^#force\\n?$' },
  { id: 'no-drop-selector-command', field: 'command', regex: '^d[a-zA-Z]$' },
];
const scan = EvidenceScan.scanOutputDir(scanDir, forbiddenRules);
assert.equal(scan.ok, true, EvidenceScan.markdownSummary(scan));
fs.writeFileSync(path.join(outDir, 'field-scoped-forbidden-token-scan.md'), EvidenceScan.markdownSummary(scan, 'Direct API foundation clean forbidden-token scan'));

const manifest = {
  status: 'PASS',
  generatedAt: new Date().toISOString(),
  registry: { current: registry.current, proposed: registry.proposed, direct: registry.direct, statuses: registry.statuses },
  examples: examples.map((command) => ({ commandType: command.commandType, commandId: command.commandId, expectedRevision: command.expectedRevision, payloadKeys: Object.keys(command.payload) })),
  evidence: {
    summary: path.join(outDir, 'summary.md'),
    forbiddenTokenScan: path.join(outDir, 'field-scoped-forbidden-token-scan.md'),
  },
};
fs.writeFileSync(path.join(outDir, 'evidence-manifest.json'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(outDir, 'summary.md'), [
  '# Direct API foundation contract',
  '',
  'PASS',
  '',
  'Validated foundation conventions without migrating a player workflow.',
  '',
  '## Covered',
  '',
  '- Command/event registry distinguishes existing v2 commands from proposed direct API command types.',
  '- Shared status/reason and revision semantics are exposed by `ui-protocol-v2`.',
  '- Command-gateway helpers validate object IDs, coordinates, counts, enum fields, expected revisions, unknown payload keys, hidden public fields, and active owner conflicts.',
  '- Game-process guard rejects registered-but-unimplemented direct commands with `blocked.input.unsupportedRoute` and `fallback: none` instead of using `ui-command` key fallback.',
  '- Field-scoped forbidden-token scan helper produced a clean scan summary for this foundation output directory.',
  '',
  `Manifest: ${path.join(outDir, 'evidence-manifest.json')}`,
  `Forbidden-token scan: ${path.join(outDir, 'field-scoped-forbidden-token-scan.md')}`,
  '',
].join('\n'));

console.log(`direct-api-foundation-contract-test PASS (${path.join(outDir, 'summary.md')})`);
