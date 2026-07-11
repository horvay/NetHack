const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const UiProtocolV2 = require('../src/shared/ui-protocol-v2');
const ShimProtocol = require('../src/shared/shim-protocol');
const InventorySnapshot = require('../src/shared/inventory-snapshot-adapter');
const EquipmentSnapshot = require('../src/shared/equipment-snapshot-adapter');
const InventoryActionService = require('../src/shared/inventory-action-service');
const PublicBlockers = require('../src/shared/public-blockers');
const GameViewState = require('../src/shared/game-view-state');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'equipment-snapshot', 'golden-cases.json'), 'utf8'));

assert.deepEqual(EquipmentSnapshot.publicEquipmentBlockerLabels, PublicBlockers.publicEquipmentBlockerLabels, 'equipment snapshot adapter uses canonical public blocker labels');
assert.deepEqual(InventoryActionService.publicEquipmentBlockerLabels, PublicBlockers.publicEquipmentBlockerLabels, 'inventory action service uses canonical public blocker labels');
for (const token of PublicBlockers.publicEquipmentBlockerTokens) {
  assert.equal(EquipmentSnapshot.publicEquipmentBlockerLabel(token), PublicBlockers.publicEquipmentBlockerLabel(token), `${token}: equipment label stays synchronized`);
  assert.equal(InventoryActionService.publicEquipmentBlockerLabel(token), PublicBlockers.publicEquipmentBlockerLabel(token), `${token}: action service label stays synchronized`);
}

function slot(snapshot, slotId) {
  return snapshot.slots.find((entry) => entry.slotId === slotId);
}

for (const [name, fixture] of Object.entries(fixtures)) {
  const normalized = ShimProtocol.normalizeRawShimEvent(fixture.event);
  assert.equal(normalized.valid, true, `${name}: v1 shim_update_inventory normalizes`);
  assert.equal(normalized.event.equipmentRevision, fixture.expected.revision, `${name}: v1 preserves equipment revision`);

  const inventorySnapshot = InventorySnapshot.adaptShimInventoryUpdateToSnapshot(normalized.event);
  assert.equal(inventorySnapshot.revision, fixture.expected.inventoryRevision, `${name}: inventory revision available for cross-revision evidence`);

  const snapshot = EquipmentSnapshot.adaptShimInventoryUpdateToEquipmentSnapshot(normalized.event);
  assert.equal(snapshot.revision, fixture.expected.revision, `${name}: equipment revision`);
  assert.equal(snapshot.inventoryRevision, fixture.expected.inventoryRevision, `${name}: equipment carries source inventory revision`);
  assert(snapshot.slots.length >= 14, `${name}: canonical slots include empty paper-doll slots`);

  const v2 = EquipmentSnapshot.createEquipmentSnapshotEvent(normalized.event, { sequence: snapshot.revision, snapshot });
  const checked = UiProtocolV2.validateEventEnvelope(v2);
  assert.equal(checked.ok, true, `${name}: v2 equipment.snapshot validates: ${checked.errors.join('; ')}`);
  assert.deepEqual(v2.revision, { equipment: fixture.expected.revision, inventory: fixture.expected.inventoryRevision }, `${name}: envelope carries equipment and inventory revisions`);

  for (const [slotId, displayName] of Object.entries(fixture.expected.equipped || {})) {
    const entry = slot(snapshot, slotId);
    assert(entry, `${name}: missing slot ${slotId}`);
    assert.equal(entry.publicStatus, 'equipped', `${name}: slot ${slotId} equipped`);
    assert.equal(entry.item?.displayName, displayName, `${name}: slot ${slotId} public display name`);
    assert.equal(entry.item?.location?.kind, 'equipment', `${name}: slot ${slotId} item location is equipment`);
  }
  for (const [slotId, objectId] of Object.entries(fixture.expected.equippedObjectIds || {})) {
    assert.equal(slot(snapshot, slotId)?.objectId, objectId, `${name}: slot ${slotId} object id`);
  }
  for (const slotId of fixture.expected.empty || []) {
    assert.equal(slot(snapshot, slotId)?.publicStatus, 'empty', `${name}: slot ${slotId} explicitly empty`);
  }
  for (const slotId of fixture.expected.forbiddenSemanticNameSlots || []) {
    const entry = slot(snapshot, slotId);
    assert.equal(entry.item?.semanticName, undefined, `${name}: ${slotId} omits hidden semanticName`);
    assert.equal(entry.item?.semanticKnown, false, `${name}: ${slotId} marks semantic identity unknown`);
    assert(entry.item?.semanticAppearance, `${name}: ${slotId} retains public appearance`);
  }

  const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
  const result = view.process(fixture.event);
  assert.equal(view.state.equipment.revision, fixture.expected.revision, `${name}: reducer stores equipment revision`);
  assert.equal(view.state.equipment.inventoryRevision, fixture.expected.inventoryRevision, `${name}: reducer stores source inventory revision`);
  assert.equal(view.state.equipment.orderedSlots.length, snapshot.slots.length, `${name}: reducer stores ordered canonical slots`);
  assert(result.effects.some((effect) => effect.type === 'equipment-snapshot'), `${name}: reducer emits equipment-snapshot diagnostic effect`);
  assert(result.effects.some((effect) => effect.type === 'inventory-updated'), `${name}: reducer preserves compatibility inventory-updated effect`);
}

const badPublicEvents = [
  {
    case: 'snapshot missing revision',
    event: { protocol: UiProtocolV2.protocol, sequence: 200, eventId: 'evt-equipment-missing-revision', eventType: 'equipment.snapshot', turn: 1, payload: { slots: [] } },
  },
  {
    case: 'snapshot revision mismatch',
    event: { protocol: UiProtocolV2.protocol, sequence: 201, eventId: 'evt-equipment-revision-mismatch', eventType: 'equipment.snapshot', turn: 1, revision: { equipment: 9 }, payload: { revision: 8, slots: [] } },
  },
  {
    case: 'snapshot inventory revision mismatch',
    event: { protocol: UiProtocolV2.protocol, sequence: 202, eventId: 'evt-equipment-inventory-revision-mismatch', eventType: 'equipment.snapshot', turn: 1, revision: { equipment: 8, inventory: 7 }, payload: { revision: 8, inventoryRevision: 6, slots: [] } },
  },
  {
    case: 'slot object blocker rejected',
    event: { protocol: UiProtocolV2.protocol, sequence: 203, eventId: 'evt-equipment-object-blocker', eventType: 'equipment.snapshot', turn: 1, payload: { revision: 1, slots: [{ slotId: 'armor.body', publicStatus: 'blocked', blockedBy: [{ trueName: 'cursed cloak' }] }] } },
  },
  {
    case: 'slot hidden action rejected',
    event: { protocol: UiProtocolV2.protocol, sequence: 204, eventId: 'evt-equipment-object-action', eventType: 'equipment.snapshot', turn: 1, payload: { revision: 1, slots: [{ slotId: 'ring.left', actions: [{ trueName: 'ring of levitation' }] }] } },
  },
  {
    case: 'slot hidden blocker token rejected',
    event: { protocol: UiProtocolV2.protocol, sequence: 205, eventId: 'evt-equipment-hidden-blocker', eventType: 'equipment.snapshot', turn: 1, payload: { revision: 1, slots: [{ slotId: 'ring.left', blockedBy: ['blocked.cursed'] }] } },
  },
];
for (const { case: caseName, event } of badPublicEvents) {
  const checked = UiProtocolV2.validateEventEnvelope(event);
  assert.equal(checked.ok, false, `${caseName}: must fail closed`);
}

const compatibility = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
compatibility.process(fixtures.weaponQuiverArmor.event);
compatibility.process({ name: 'shim_start_menu', window: 30 });
compatibility.process({ name: 'shim_add_menu', window: 30, selector: 97, text: 'a - a +0 spear (weapon in hand)', glyphChar: 41, semanticKind: 'object', semanticName: 'spear' });
compatibility.process({ name: 'shim_add_menu', window: 30, selector: 99, text: 'c - a +0 ring mail (being worn)', glyphChar: 91, semanticKind: 'object', semanticName: 'ring mail' });
compatibility.process({ name: 'shim_end_menu', window: 30, prompt: 'Inventory:' });
assert.equal(compatibility.state.cachedInventoryChoices.length, 2, 'classic inventory/equipment compatibility choices remain populated');
assert.equal(compatibility.state.equipment.slotsById.get('mainHand')?.objectId, 2001, 'equipment snapshot coexists with current equipment screen text source');

const rendererModels = EquipmentSnapshot.equipmentSnapshotToRendererSlotModels(compatibility.state.equipment, { inventoryByObjectId: compatibility.state.inventory.itemsByObjectId });
assert(rendererModels.some((entry) => entry.id === 'main-hand' && /spear/.test(entry.item?.text || '')), 'gated renderer slot models can consume equipment.snapshot');
assert(rendererModels.some((entry) => entry.id === 'armor-suit' && /ring mail/.test(entry.item?.text || '')), 'canonical armor.body maps to existing renderer armor-suit card only behind flag');

const duplicateHandSnapshot = EquipmentSnapshot.adaptShimEquipmentUpdateToSnapshot({ revision: 31, inventoryRevision: 31, slots: [
  { slotId: 'mainHand', objectId: 7001, item: { selector: 102, objectId: 7001, text: 'f - a blessed +1 long sword (weapon in right hand)', glyphChar: 41, semanticKind: 'object', semanticName: 'long sword', semanticKnown: true } },
  { slotId: 'offHand', objectId: 7001, item: { selector: 102, objectId: 7001, text: 'f - a blessed +1 long sword (weapon in right hand)', glyphChar: 41, semanticKind: 'object', semanticName: 'long sword', semanticKnown: true } },
] });
assert.equal(slot(duplicateHandSnapshot, 'offHand')?.publicStatus, 'empty', 'duplicate main-hand object is not rendered as a fake alternate/offhand item');
assert.equal(slot(duplicateHandSnapshot, 'offHand')?.item, undefined, 'duplicate offhand item payload is removed from equipment snapshot');
const duplicateHandState = EquipmentSnapshot.applyEquipmentSnapshot(EquipmentSnapshot.emptyEquipmentState(), duplicateHandSnapshot);
const duplicateHandModels = EquipmentSnapshot.equipmentSnapshotToRendererSlotModels(duplicateHandState);
assert(duplicateHandModels.some((entry) => entry.id === 'offhand' && !entry.item && /No alternate\/offhand metadata known/i.test(entry.empty) && !entry.actions.some((action) => action.actionId === 'slot.swapMainAlternate')), 'renderer model shows an empty offhand with no swap action when no alternate exists');

const twoHandedNetHackInventoryText = 'e - a +0 quarterstaff (weapon in hands) (alternate weapon; not wielded)';
const sanitizedTwoHandedItem = InventorySnapshot.normalizePublicInventoryItem({ selector: 101, objectId: 7150, text: twoHandedNetHackInventoryText, glyphChar: 41, wornMask: 0x00000100 | 0x00000400, semanticKind: 'object', semanticName: 'quarterstaff', semanticKnown: true });
assert.equal(sanitizedTwoHandedItem.displayName, 'a +0 quarterstaff (weapon in hands)', 'two-handed wielded item display omits contradictory alternate/not-wielded text');
const twoHandedDuplicateMaskSnapshot = EquipmentSnapshot.adaptShimInventoryUpdateToEquipmentSnapshot({ revision: 32, inventoryRevision: 32, equipmentRevision: 32, items: [
  { selector: 101, objectId: 7150, text: twoHandedNetHackInventoryText, glyphChar: 41, wornMask: 0x00000100 | 0x00000400, semanticKind: 'object', semanticName: 'quarterstaff', semanticKnown: true },
] });
assert.equal(slot(twoHandedDuplicateMaskSnapshot, 'mainHand')?.item?.displayName, 'a +0 quarterstaff (weapon in hands)', 'two-handed main-hand item keeps public in-hands label');
assert.equal(slot(twoHandedDuplicateMaskSnapshot, 'offHand')?.item, undefined, 'same two-handed item is not rendered as a contradictory alternate weapon');
assert(slot(twoHandedDuplicateMaskSnapshot, 'offHand')?.blockedBy.includes('blocked.hands.twoHandedWeapon'), 'two-handed main hand blocks offhand after duplicate worn-mask cleanup');

const explicitAlternateSnapshot = EquipmentSnapshot.adaptShimInventoryUpdateToEquipmentSnapshot({ revision: 32, inventoryRevision: 32, equipmentRevision: 32, items: [
  { selector: 97, objectId: 7101, text: 'a - a blessed +1 long sword (weapon in hand)', glyphChar: 41, wornMask: 256, semanticKind: 'object', semanticName: 'long sword', semanticKnown: true },
  { selector: 98, objectId: 7102, text: 'b - an uncursed dagger (alternate weapon; not wielded)', glyphChar: 41, wornMask: 1024, semanticKind: 'object', semanticName: 'dagger', semanticKnown: true },
] });
assert.equal(slot(explicitAlternateSnapshot, 'offHand')?.publicStatus, 'equipped', 'explicit alternate weapon remains in the offhand/alternate slot');

const publicBlockerSnapshot = EquipmentSnapshot.adaptShimInventoryUpdateToEquipmentSnapshot({ revision: 33, inventoryRevision: 33, equipmentRevision: 33, items: [
  { selector: 97, objectId: 7301, text: 'a - a bow (weapon in hand)', glyphChar: 41, wornMask: 256, semanticKind: 'object', semanticName: 'bow', semanticKnown: true },
  { selector: 99, objectId: 7302, text: 'c - an uncursed leather armor (being worn)', glyphChar: 91, wornMask: 1, semanticKind: 'object', semanticName: 'leather armor', semanticKnown: true },
  { selector: 100, objectId: 7303, text: 'd - a T-shirt (being worn)', glyphChar: 91, wornMask: 64, semanticKind: 'object', semanticName: 'T-shirt', semanticKnown: true },
  { selector: 103, objectId: 7304, text: 'g - an uncursed small shield (being worn)', glyphChar: 91, wornMask: 8, semanticKind: 'object', semanticName: 'small shield', semanticKnown: true },
  { selector: 104, objectId: 7305, text: 'h - a ring of protection (on left hand)', glyphChar: 61, wornMask: 131072, semanticKind: 'object', semanticName: 'ring of protection', semanticKnown: true },
  { selector: 105, objectId: 7306, text: 'i - a ring of adornment (on right hand)', glyphChar: 61, wornMask: 262144, semanticKind: 'object', semanticName: 'ring of adornment', semanticKnown: true },
  { selector: 108, objectId: 7307, text: 'l - 12 arrows (in quiver)', glyphChar: 41, wornMask: 512, semanticKind: 'object', semanticName: 'arrows', semanticKnown: true },
] });
assert(slot(publicBlockerSnapshot, 'armor.shirt')?.blockedBy.includes('blocked.armor.bodyOverShirt'), 'equipment snapshot exposes body-over-shirt public blocker token');
assert(slot(publicBlockerSnapshot, 'ring.left')?.blockedBy.includes('blocked.ring.bothOccupied'), 'equipment snapshot exposes both-rings-occupied public blocker token');
assert(slot(publicBlockerSnapshot, 'offHand')?.blockedBy.includes('blocked.hands.shieldEquipped'), 'equipment snapshot exposes shield-equipped offhand public blocker token');
assert(slot(publicBlockerSnapshot, 'offHand')?.blockedBy.includes('blocked.hands.twoHandedWeapon'), 'equipment snapshot exposes two-handed main-hand public blocker token');
assert(slot(publicBlockerSnapshot, 'quiver')?.blockedBy.includes('blocked.hands.quiverOccupied'), 'equipment snapshot exposes occupied-quiver public blocker token');
assert.equal(UiProtocolV2.validateEventEnvelope(EquipmentSnapshot.createEquipmentSnapshotEvent({}, { snapshot: publicBlockerSnapshot })).ok, true, 'approved public equipment blocker tokens validate in v2 equipment snapshot');
const publicBlockerModels = EquipmentSnapshot.equipmentSnapshotToRendererSlotModels(EquipmentSnapshot.applyEquipmentSnapshot(EquipmentSnapshot.emptyEquipmentState(), publicBlockerSnapshot));
assert(publicBlockerModels.some((entry) => entry.id === 'offhand' && /shield is equipped/i.test((entry.blockerLabels || []).join(' '))), 'renderer slot models carry player-facing blocker labels');

const bodyAndShirtState = EquipmentSnapshot.applyEquipmentSnapshot(EquipmentSnapshot.emptyEquipmentState(), EquipmentSnapshot.normalizeEquipmentSnapshotPayload({ revision: 34, slots: [
  { slotId: 'armor.body', item: { selector: 99, objectId: 7201, text: 'c - an uncursed leather armor (being worn)', glyphChar: 91 } },
  { slotId: 'armor.shirt', item: { selector: 100, objectId: 7202, text: 'd - a T-shirt (being worn)', glyphChar: 91 } },
] }));
const bodyAndShirtModels = EquipmentSnapshot.equipmentSnapshotToRendererSlotModels(bodyAndShirtState);
assert.equal(bodyAndShirtModels.filter((entry) => entry.id === 'armor-suit').length, 1, 'body armor and shirt never create overlapping body cards');
assert(/leather armor/i.test(bodyAndShirtModels.find((entry) => entry.id === 'armor-suit')?.item?.text || ''), 'body armor owns the body card while worn over a shirt');
const shirtOnlyState = EquipmentSnapshot.applyEquipmentSnapshot(EquipmentSnapshot.emptyEquipmentState(), EquipmentSnapshot.normalizeEquipmentSnapshotPayload({ revision: 34, slots: [
  { slotId: 'armor.body' },
  { slotId: 'armor.shirt', item: { selector: 100, objectId: 7202, text: 'd - a T-shirt (being worn)', glyphChar: 91 } },
] }));
const shirtOnlyModels = EquipmentSnapshot.equipmentSnapshotToRendererSlotModels(shirtOnlyState);
assert.equal(shirtOnlyModels.filter((entry) => entry.id === 'armor-suit').length, 1, 'shirt maps to the single body card only after body armor is gone');
assert(/T-shirt/i.test(shirtOnlyModels.find((entry) => entry.id === 'armor-suit')?.item?.text || ''), 'shirt is visible in the unique body card after armor is removed');

const sequenceView = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
const sequenceEvents = [];
for (const event of [fixtures.weaponQuiverArmor.event, fixtures.ringsAmuletShieldLayers.event]) {
  const result = sequenceView.process(event);
  for (const effect of result.effects) {
    if (effect.event?.protocol === UiProtocolV2.protocol) sequenceEvents.push(effect.event);
  }
}
const sequenceCheck = UiProtocolV2.validateEventSequence(sequenceEvents);
assert.equal(sequenceCheck.ok, true, `inventory/equipment reducer evidence stream stays monotonic: ${sequenceCheck.errors.join('; ')}`);
assert.deepEqual(sequenceEvents.map((event) => event.eventType), ['inventory.snapshot', 'equipment.snapshot', 'inventory.snapshot', 'equipment.snapshot'], 'reducer preserves inventory and equipment v2 event evidence in order');

const staleEquipmentView = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
staleEquipmentView.process({ name: 'shim_update_inventory', revision: 12, inventoryRevision: 12, equipmentRevision: 12, items: [{ selector: 97, objectId: 9201, text: 'a - new spear (weapon in hand)', glyphChar: 41, wornMask: 256, semanticKind: 'object', semanticName: 'spear', semanticKnown: true }] });
const staleEquipmentResult = staleEquipmentView.process({ name: 'shim_update_inventory', revision: 11, inventoryRevision: 11, equipmentRevision: 11, items: [{ selector: 97, objectId: 9201, text: 'a - old dagger (weapon in hand)', glyphChar: 41, wornMask: 256, semanticKind: 'object', semanticName: 'dagger', semanticKnown: true }] });
assert.equal(staleEquipmentView.state.equipment.revision, 12, 'stale lower equipment revision does not replace accepted snapshot');
assert.equal(staleEquipmentView.state.equipment.slotsById.get('mainHand')?.item?.displayName, 'new spear (weapon in hand)', 'stale lower equipment revision does not roll paper-doll item names backward');
assert(staleEquipmentResult.effects.some((effect) => effect.type === 'equipment-snapshot-rejected' && effect.stale), 'stale equipment update emits a rejected diagnostic effect');

console.log('equipment snapshot tests OK');
