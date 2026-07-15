const assert = require('node:assert/strict');
const InventorySnapshot = require('../src/shared/inventory-snapshot-adapter');
const InventoryActionService = require('../src/shared/inventory-action-service');
const EquipmentScreen = require('../src/ux/equipment-screen');

const unpaidSnapshot = InventorySnapshot.adaptShimInventoryUpdateToSnapshot({
  revision: 7,
  items: [
    { selector: 97, objectId: 101, text: 'a - an uncursed food ration (unpaid, 45 zorkmids)', quantity: 1, semanticName: 'food ration', semanticKnown: true, publicClass: 'food', actionAffordances: ['eat', 'pay', 'shop.unpaid', 'shop.unpaid.owner.4242'] },
    { selector: 98, objectId: 102, text: 'b - 2 potions of healing (unpaid, 100 zorkmids)', quantity: 2, semanticName: 'potion of healing', semanticKnown: true, publicClass: 'potion', actionAffordances: ['quaff', 'pay', 'shop.unpaid', 'shop.unpaid.owner.4242'] },
  ],
});
assert.deepEqual(unpaidSnapshot.items.map((item) => item.actionAffordances), [
  ['eat', 'pay', 'shop.unpaid', 'shop.unpaid.owner.4242'],
  ['quaff', 'pay', 'shop.unpaid', 'shop.unpaid.owner.4242'],
], 'public inventory snapshots preserve native unpaid and owner affordances');
assert.equal(Object.isFrozen(unpaidSnapshot), true, 'payment facts are immutable');
assert.equal(Object.isFrozen(unpaidSnapshot.items), true, 'payment rows are immutable');

const payActions = unpaidSnapshot.items.map((item) => InventoryActionService.itemActionAffordances(item).find((action) => action.id === 'item.pay'));
assert(payActions.every((action) => action?.enabled), 'each unpaid public row exposes Pay / buy item');
assert(payActions.every((action) => action.label === 'Pay / buy item'), 'payment label remains player-facing');
assert.deepEqual(payActions.map((action) => action.execution.keys), ['pa', 'pb'], 'payment semantics retain each exact inventory selector');

const inventory = Object.freeze({ revision: 7, orderedItems: unpaidSnapshot.items });
const equipment = Object.freeze({ revision: 7, inventoryRevision: 7, orderedSlots: Object.freeze([]) });
const intents = [];
const owner = EquipmentScreen.createController({ onIntent(intent) { intents.push(intent); return true; } });
owner.reconcile({ inventory, equipment });
for (const item of unpaidSnapshot.items) {
  assert.equal(owner.request({ kind: 'item-action', stableId: `object:${item.objectId}`, actionId: 'item.pay', inventoryRevision: 7 }), true, 'owner plans payment from the current public row');
  const intent = intents.at(-1);
  assert.equal(intent.action.id, 'item.pay');
  assert.equal(intent.command, `p${item.inventoryLetter}`, 'owner routes payment with the exact immutable selector');
  assert.deepEqual(intent.expectedRevision, { inventory: 7, equipment: 7 });
  owner.settle({ intentId: intent.intentId, status: 'completed', message: 'Payment complete.' });
  assert.match(owner.snapshot().feedback, /Payment complete/);
}
const beforeStale = intents.length;
assert.equal(owner.request({ kind: 'item-action', stableId: 'object:101', actionId: 'item.pay', inventoryRevision: 6 }), false, 'changed bill revision rejects payment');
assert.equal(intents.length, beforeStale, 'stale payment sends no command');
assert.match(owner.snapshot().feedback, /Inventory changed/);

console.log('shop payment item owner contract tests OK');
