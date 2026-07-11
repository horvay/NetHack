const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const UiProtocolV2 = require('../src/shared/ui-protocol-v2');
const ShimProtocol = require('../src/shared/shim-protocol');
const InventorySnapshot = require('../src/shared/inventory-snapshot-adapter');
const GameViewState = require('../src/shared/game-view-state');
const InteractionModel = require('../src/shared/interaction-model');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'inventory-snapshot', 'golden-cases.json'), 'utf8'));

for (const [name, fixture] of Object.entries(fixtures)) {
  const normalized = ShimProtocol.normalizeRawShimEvent(fixture.event);
  assert.equal(normalized.valid, true, `${name}: v1 shim_update_inventory normalizes`);
  assert.equal(normalized.event.revision, fixture.expected.revision, `${name}: v1 preserves inventory revision`);

  const snapshot = InventorySnapshot.adaptShimInventoryUpdateToSnapshot(normalized.event);
  assert.equal(snapshot.revision, fixture.expected.revision, `${name}: snapshot revision`);
  assert.equal(snapshot.items.length, fixture.expected.items?.length ?? fixture.expected.letters?.length ?? 0, `${name}: item count`);

  const v2 = InventorySnapshot.createInventorySnapshotEvent(normalized.event, { sequence: snapshot.revision });
  const checked = UiProtocolV2.validateEventEnvelope(v2);
  assert.equal(checked.ok, true, `${name}: v2 inventory.snapshot validates: ${checked.errors.join('; ')}`);
  assert.deepEqual(v2.revision, { inventory: fixture.expected.revision }, `${name}: envelope carries inventory revision`);

  if (fixture.expected.letters) assert.deepEqual(snapshot.items.map((item) => item.inventoryLetter), fixture.expected.letters, `${name}: public inventory letters`);
  if (fixture.expected.objectIds) assert.deepEqual(snapshot.items.map((item) => item.objectId), fixture.expected.objectIds, `${name}: public object ids`);
  if (fixture.expected.displayName) assert.equal(snapshot.items[0].displayName, fixture.expected.displayName, `${name}: selector prefix stripped from displayName`);
  if (fixture.expected.forbiddenSemanticName) {
    assert.equal(normalized.event.items[0].semanticName, undefined, `${name}: normalized v1 compatibility row omits hidden semantic identity`);
    assert.equal(snapshot.items[0].semanticName, undefined, `${name}: hidden semantic identity omitted from public snapshot`);
    assert.equal(snapshot.items[0].semanticAppearance, 'milky potion', `${name}: public appearance retained`);
    assert.equal(snapshot.items[0].known.identity, false, `${name}: identity marked unknown without leaking true name`);
  }

  const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
  const result = view.process(fixture.event);
  assert.equal(view.state.inventory.revision, fixture.expected.revision, `${name}: reducer stores revision`);
  assert.equal(view.state.inventory.orderedItems.length, snapshot.items.length, `${name}: reducer stores ordered items`);
  for (const item of snapshot.items) {
    if (item.objectId != null) assert.equal(view.state.inventory.itemsByObjectId.get(item.objectId)?.displayName, item.displayName, `${name}: reducer indexes objectId ${item.objectId}`);
    if (item.inventoryLetter) assert.equal(view.state.inventory.itemsByLetter.get(item.inventoryLetter)?.displayName, item.displayName, `${name}: reducer indexes letter ${item.inventoryLetter}`);
  }
  if (fixture.expected.forbiddenSemanticName) {
    assert.equal(view.state.cachedInventoryChoices[0].semanticName, undefined, `${name}: cached v1 inventory choices do not retain hidden semantic identity`);
  }
  assert(result.effects.some((effect) => effect.type === 'inventory-snapshot'), `${name}: reducer emits inventory-snapshot diagnostic effect`);
  assert(result.effects.some((effect) => effect.type === 'inventory-updated'), `${name}: reducer preserves compatibility inventory-updated effect`);
}

const badPublicEvents = [
  {
    case: 'snapshot missing revision',
    event: { protocol: UiProtocolV2.protocol, sequence: 100, eventId: 'evt-inventory-missing-revision', eventType: 'inventory.snapshot', turn: 1, payload: { items: [] } },
  },
  {
    case: 'snapshot extra hidden payload field',
    event: { protocol: UiProtocolV2.protocol, sequence: 101, eventId: 'evt-inventory-extra-payload', eventType: 'inventory.snapshot', turn: 1, payload: { revision: 1, items: [], contents: [] } },
  },
  {
    case: 'delta missing revision',
    event: { protocol: UiProtocolV2.protocol, sequence: 102, eventId: 'evt-delta-missing-revision', eventType: 'inventory.delta', turn: 1, payload: { added: [{ displayName: 'a food ration' }] } },
  },
  {
    case: 'delta bad removed id',
    event: { protocol: UiProtocolV2.protocol, sequence: 103, eventId: 'evt-delta-bad-removed', eventType: 'inventory.delta', turn: 1, payload: { revision: 2, removed: [{ trueName: 'potion of gain level' }] } },
  },
  {
    case: 'snapshot envelope revision mismatch',
    event: { protocol: UiProtocolV2.protocol, sequence: 104, eventId: 'evt-inventory-revision-mismatch', eventType: 'inventory.snapshot', turn: 1, revision: { inventory: 3 }, payload: { revision: 2, items: [] } },
  },
];
for (const { case: caseName, event } of badPublicEvents) {
  const checked = UiProtocolV2.validateEventEnvelope(event);
  assert.equal(checked.ok, false, `${caseName}: must fail closed`);
}

const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
view.process(fixtures.stackedAndWorn.event);
view.process({ name: 'shim_start_menu', window: 10 });
view.process({ name: 'shim_add_menu', window: 10, selector: 97, text: 'a - 12 ya (in quiver)', semanticKind: 'object' });
view.process({ name: 'shim_add_menu', window: 10, selector: 98, text: 'b - a +0 splint mail (being worn)', semanticKind: 'object' });
view.process({ name: 'shim_end_menu', window: 10, prompt: 'Inventory:' });
const interaction = InteractionModel.buildMenuInteraction(view.state.currentMenu);
assert.match(interaction.prompt, /Inventory/i, 'current v1 inventory overview remains compatible');
assert.equal(view.state.cachedInventoryChoices.length, 2, 'cached inventory choices remain populated for existing screens');
assert.equal(view.state.inventory.revision, 7, 'inventory snapshot coexists with classic inventory menu state');

const unknownMenuView = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
unknownMenuView.process({ name: 'shim_start_menu', window: 20 });
unknownMenuView.process({ name: 'shim_add_menu', window: 20, selector: 99, text: 'c - a milky potion', semanticKind: 'object', semanticName: 'potion of gain level', semanticAppearance: 'milky potion', semanticKnown: false });
unknownMenuView.process({ name: 'shim_end_menu', window: 20, prompt: 'Inventory:' });
unknownMenuView.process({ name: 'shim_select_menu', window: 20, how: 0 });
assert.equal(unknownMenuView.state.currentMenu.items[0].semanticName, undefined, 'classic v1 menu row omits hidden semantic identity when semanticKnown is false');
assert.equal(unknownMenuView.state.cachedInventoryChoices[0].semanticName, undefined, 'classic v1 cached inventory choice omits hidden semantic identity when semanticKnown is false');
assert.equal(unknownMenuView.state.currentMenu.items[0].semanticAppearance, 'milky potion', 'classic v1 menu keeps public appearance text');

const staleView = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
staleView.process({ name: 'shim_update_inventory', revision: 10, inventoryRevision: 10, equipmentRevision: 10, items: [{ selector: 97, objectId: 9001, text: 'a - new spear', glyphChar: 41, semanticKind: 'object', semanticName: 'spear', semanticKnown: true }] });
const staleResult = staleView.process({ name: 'shim_update_inventory', revision: 9, inventoryRevision: 9, equipmentRevision: 9, items: [{ selector: 97, objectId: 9001, text: 'a - old dagger', glyphChar: 41, semanticKind: 'object', semanticName: 'dagger', semanticKnown: true }] });
assert.equal(staleView.state.inventory.revision, 10, 'stale lower inventory revision does not replace accepted snapshot');
assert.equal(staleView.state.inventory.orderedItems[0].displayName, 'new spear', 'stale lower inventory revision does not roll visible item names backward');
assert.equal(staleView.state.cachedInventoryChoices[0].text, 'a - new spear', 'stale lower inventory update does not roll compatibility cache backward');
assert(staleResult.effects.some((effect) => effect.type === 'inventory-snapshot-rejected' && effect.stale), 'stale inventory update emits a rejected diagnostic effect');

console.log('inventory snapshot tests OK');
