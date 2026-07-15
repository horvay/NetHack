const assert = require('node:assert/strict');
const EquipmentScreen = require('../src/ux/equipment-screen');

const items = Object.freeze([
  Object.freeze({ objectId: 201, inventoryLetter: 'b', text: 'b - an uncursed dagger', displayName: 'uncursed dagger', semanticName: 'dagger', semanticKnown: true, known: Object.freeze({ identity: true, appearance: true }), publicClass: 'weapon', actionAffordances: Object.freeze(['wield', 'quiver', 'throw', 'drop', 'engrave']) }),
  Object.freeze({ objectId: 202, selector: 120, text: 'x - a magic marker', displayName: 'magic marker', semanticName: 'magic marker', semanticKnown: true, known: Object.freeze({ identity: true, appearance: true }), publicClass: 'tool', actionAffordances: Object.freeze(['apply', 'engrave', 'drop']) }),
  Object.freeze({ objectId: 203, inventoryLetter: 'e', text: 'e - an uncursed food ration', displayName: 'uncursed food ration', semanticName: 'food ration', semanticKnown: true, known: Object.freeze({ identity: true, appearance: true }), publicClass: 'food', actionAffordances: Object.freeze(['eat', 'drop']) }),
  Object.freeze({ objectId: 204, selector: 113, text: 'q - a milky potion', displayName: 'milky potion', semanticAppearance: 'milky potion', semanticKnown: false, known: Object.freeze({ identity: false, appearance: true }), publicClass: 'potion', actionAffordances: Object.freeze(['quaff', 'dip', 'drop']) }),
  Object.freeze({ objectId: 205, inventoryLetter: 'j', text: 'j - a scroll labeled READ ME', displayName: 'scroll labeled READ ME', semanticAppearance: 'scroll labeled READ ME', semanticKnown: false, known: Object.freeze({ identity: false, appearance: true }), publicClass: 'scroll', actionAffordances: Object.freeze(['read', 'drop']) }),
  Object.freeze({ objectId: 206, selector: 109, text: 'm - an uncursed +0 helmet', displayName: 'uncursed +0 helmet', semanticName: 'helmet', semanticKnown: true, known: Object.freeze({ identity: true, appearance: true }), publicClass: 'armor', equipmentSlots: Object.freeze(['armor.helm']), actionAffordances: Object.freeze(['wear', 'drop']) }),
  Object.freeze({ objectId: 207, inventoryLetter: 'h', text: 'h - a ring of protection (on left hand)', displayName: 'ring of protection', semanticName: 'ring of protection', semanticKnown: true, known: Object.freeze({ identity: true, appearance: true }), publicClass: 'ring', equipmentSlots: Object.freeze(['ring.left', 'ring.right']), equippedState: 'worn', actionAffordances: Object.freeze(['remove', 'engrave']) }),
  Object.freeze({ objectId: 208, selector: 110, text: 'n - an iron skull cap (being worn)', displayName: 'iron skull cap', semanticName: 'helmet', semanticKnown: true, known: Object.freeze({ identity: true, appearance: true }), publicClass: 'armor', equipmentSlots: Object.freeze(['armor.helm']), equippedState: 'worn', actionAffordances: Object.freeze(['takeOff']) }),
  Object.freeze({ objectId: 209, inventoryLetter: 'y', text: 'y - a large box', displayName: 'large box', semanticName: 'large box', semanticKnown: true, known: Object.freeze({ identity: true, appearance: true }), publicClass: 'tool', actionAffordances: Object.freeze(['loot', 'apply', 'drop']) }),
]);
const inventory = Object.freeze({ revision: 31, orderedItems: items });
const equipment = Object.freeze({ revision: 31, inventoryRevision: 31, orderedSlots: Object.freeze([
  Object.freeze({ slotId: 'ring.left', objectId: 207, publicStatus: 'occupied', item: items[6] }),
  Object.freeze({ slotId: 'armor.helm', objectId: 208, publicStatus: 'occupied', item: items[7] }),
]) });
const intents = [];
const owner = EquipmentScreen.createController({ onIntent(intent) { intents.push(intent); return true; } });
owner.reconcile({ inventory, equipment });

function execute(stableId, actionId, expectedCommand) {
  const count = intents.length;
  assert.equal(owner.request({ kind: 'item-action', stableId, actionId, inventoryRevision: 31 }), true, `${actionId} is available`);
  assert.equal(intents.length, count + 1, `${actionId} dispatches one semantic intent`);
  const intent = intents.at(-1);
  assert.equal(intent.type, 'execute-item-action');
  assert.equal(intent.action.id, actionId);
  assert.equal(intent.command, expectedCommand, `${actionId} uses the exact native command and selector`);
  assert.deepEqual(intent.expectedRevision, { inventory: 31, equipment: 31 });
  owner.settle({ intentId: intent.intentId, status: 'completed' });
  return intent;
}

const beforeInspect = intents.length;
const inspectAccepted = owner.request({ kind: 'item-action', stableId: 'object:201', actionId: 'item.inspect', inventoryRevision: 31 });
assert.equal(inspectAccepted, true, `inspect is an available local action: ${JSON.stringify({ snapshot: owner.snapshot(), diagnostics: owner.diagnostics().slice(-5) })}`);
assert.equal(intents.length, beforeInspect, 'inspect spends no turn and dispatches no transport command');
assert.match(owner.snapshot().feedback, /no turn spent/i);
execute('object:201', 'item.name', '#nameb');
execute('object:202', 'item.apply', 'ax');
execute('object:203', 'item.eat', 'ee');
execute('object:204', 'item.quaff', 'qq');
execute('object:205', 'item.read.scroll', 'rj');
execute('object:201', 'item.drop', 'db');
execute('object:201', 'item.wield.mainHand', 'wb');
execute('object:206', 'item.wear', 'Wm');
execute('object:207', 'item.remove.accessory', 'Rh');
execute('object:208', 'item.takeOff', 'Tn');
execute('object:209', 'item.lootOrApply', 'ay');

const beforeStale = intents.length;
assert.equal(owner.request({ kind: 'item-action', stableId: 'object:204', actionId: 'item.quaff', inventoryRevision: 30 }), false, 'stale immutable revision rejects');
assert.equal(intents.length, beforeStale, 'stale rejection dispatches nothing');
assert.match(owner.snapshot().feedback, /Inventory changed/);
owner.reconcile({ transferOwner: Object.freeze({ id: 'transfer-session-direct-actions', active: true }) });
assert.equal(owner.request({ kind: 'item-action', stableId: 'object:201', actionId: 'item.drop', inventoryRevision: 31 }), false, 'Transfer Session precedence rejects item actions');
assert.equal(intents.length, beforeStale, 'transfer-owned rejection dispatches nothing');

console.log(`inventory context direct action owner contract passed (${intents.length} exact semantic intents)`);
