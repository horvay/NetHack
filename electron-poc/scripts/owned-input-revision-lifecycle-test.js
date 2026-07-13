'use strict';

const assert = require('node:assert/strict');
const Model = require('../src/shared/command-transaction-model');

function menuFlow(overrides = {}) {
  return Model.createOwnedInputFlow({
    kind: 'menu-cancel',
    requestId: 'menu-r7',
    transactionId: 'inventory-t7',
    window: 71,
    menuId: 'menu-71-r12',
    menuPurpose: 'inventory.displayInventory',
    ownerKind: 'inventory',
    requestSourceLayer: 'shim-bridge',
    lifecycleRevision: 12,
    acknowledgementEvent: 'bridge_menu_answer',
    acknowledgementLifecycle: 'answered',
    responseKey: '\u001b',
    baselineRevision: { inventory: 12, equipment: 8 },
    requiredRevisionAdvance: ['inventory'],
    requireLinkedEquipmentRevision: true,
    ...overrides,
  });
}
function menuClose(overrides = {}) {
  return {
    name: 'bridge_menu_answer',
    window: 71,
    menuId: 'menu-71-r12',
    requestId: 'menu-r7',
    menuRequestId: 'menu-r7',
    transactionId: 'inventory-t7',
    inputTransactionId: 'inventory-t7',
    lifecycleRevision: 12,
    lifecycle: 'answered',
    menuPurpose: 'inventory.displayInventory',
    requestSource: { layer: 'shim-bridge', window: 71 },
    owner: { kind: 'inventory', window: 71 },
    activeRequestMatch: true,
    inputMatchesMenuTransaction: true,
    return: 0,
    selector: 0,
    selectors: '',
    ...overrides,
  };
}
function without(key) {
  const event = menuClose();
  delete event[key];
  return event;
}
function nestedWithout(parent, key) {
  const event = menuClose();
  event[parent] = { ...event[parent] };
  delete event[parent][key];
  return event;
}

const acknowledged = Model.settleOwnedInputFlow(menuFlow(), menuClose());
assert.equal(acknowledged.ok, true, 'the complete native-shaped menu cancellation is acknowledged');
assert.deepEqual(acknowledged.flow.acknowledgement, {
  name: 'bridge_menu_answer', requestId: 'menu-r7', transactionId: 'inventory-t7', inputTransactionId: 'inventory-t7',
  window: 71, menuId: 'menu-71-r12', lifecycleRevision: 12, responseKey: '\u001b',
});

const negativeMatrix = [
  ['foreign family', menuClose({ name: 'bridge_prompt_answer' }), 'foreign-transport'],
  ...['requestId', 'menuRequestId'].map((key) => [`missing ${key}`, without(key), 'unowned-request']),
  ['wrong requestId', menuClose({ requestId: 'menu-r8' }), 'unowned-request'],
  ['conflicting prompt request alias', menuClose({ promptId: 'menu-r8' }), 'unowned-request'],
  ...['transactionId', 'inputTransactionId'].map((key) => [`missing ${key}`, without(key), 'mismatched-transaction']),
  ['wrong transactionId', menuClose({ transactionId: 'inventory-t8' }), 'mismatched-transaction'],
  ['wrong inputTransactionId', menuClose({ inputTransactionId: 'inventory-t8' }), 'mismatched-transaction'],
  ['missing window', without('window'), 'mismatched-menu'],
  ['wrong window', menuClose({ window: 72 }), 'mismatched-menu'],
  ['coerced window', menuClose({ window: '71' }), 'mismatched-menu'],
  ['fractional window', menuClose({ window: 71.9 }), 'mismatched-menu'],
  ['negative zero window', menuClose({ window: -0 }), 'mismatched-menu'],
  ['missing menuId', without('menuId'), 'mismatched-menu'],
  ['wrong menuId', menuClose({ menuId: 'menu-72-r12' }), 'mismatched-menu'],
  ['missing menu purpose', without('menuPurpose'), 'mismatched-menu'],
  ['wrong menu purpose', menuClose({ menuPurpose: 'action.choice' }), 'mismatched-menu'],
  ['missing lifecycle revision', without('lifecycleRevision'), 'stale-lifecycle'],
  ['stale lifecycle revision', menuClose({ lifecycleRevision: 11 }), 'stale-lifecycle'],
  ['coerced lifecycle revision', menuClose({ lifecycleRevision: '12' }), 'stale-lifecycle'],
  ['negative zero lifecycle revision', menuClose({ lifecycleRevision: -0 }), 'stale-lifecycle'],
  ['missing answered lifecycle', without('lifecycle'), 'stale-lifecycle'],
  ['wrong lifecycle', menuClose({ lifecycle: 'ready' }), 'stale-lifecycle'],
  ['missing owner', without('owner'), 'mismatched-owner'],
  ['missing owner kind', nestedWithout('owner', 'kind'), 'mismatched-owner'],
  ['wrong owner kind', menuClose({ owner: { kind: 'ground', window: 71 } }), 'mismatched-owner'],
  ['wrong owner window', menuClose({ owner: { kind: 'inventory', window: 72 } }), 'mismatched-owner'],
  ['negative zero owner window', menuClose({ owner: { kind: 'inventory', window: -0 } }), 'mismatched-owner'],
  ['malformed nested owner', menuClose({ owner: [] }), 'mismatched-owner'],
  ['missing request source', without('requestSource'), 'mismatched-owner'],
  ['wrong request source layer', menuClose({ requestSource: { layer: 'renderer', window: 71 } }), 'mismatched-owner'],
  ['wrong request source window', menuClose({ requestSource: { layer: 'shim-bridge', window: 72 } }), 'mismatched-owner'],
  ['negative zero request source window', menuClose({ requestSource: { layer: 'shim-bridge', window: -0 } }), 'mismatched-owner'],
  ['malformed nested request source', menuClose({ requestSource: null }), 'mismatched-owner'],
  ['missing active request flag', without('activeRequestMatch'), 'unowned-acknowledgement'],
  ['false active request flag', menuClose({ activeRequestMatch: false }), 'unowned-acknowledgement'],
  ['coerced active request flag', menuClose({ activeRequestMatch: 1 }), 'unowned-acknowledgement'],
  ['missing input/menu transaction flag', without('inputMatchesMenuTransaction'), 'unowned-acknowledgement'],
  ['false input/menu transaction flag', menuClose({ inputMatchesMenuTransaction: false }), 'unowned-acknowledgement'],
  ['conflicting active request id', menuClose({ activeRequestId: 'menu-r8' }), 'contradictory-ownership-alias'],
  ['conflicting active menu request id', menuClose({ activeMenuRequestId: 'menu-r8' }), 'contradictory-ownership-alias'],
  ['conflicting active request kind', menuClose({ activeRequestKind: 'prompt' }), 'contradictory-ownership-alias'],
  ['conflicting active menu transaction id', menuClose({ activeMenuTransactionId: 'inventory-t8' }), 'contradictory-ownership-alias'],
  ['conflicting active transaction id', menuClose({ activeTransactionId: 'inventory-t8' }), 'contradictory-ownership-alias'],
  ['matching active ownership aliases', menuClose({ activeRequestId: 'menu-r7', activeRequestKind: 'inventory', activeMenuTransactionId: 'inventory-t7', activeTransactionId: 'inventory-t7', return: -0 }), 'invalid-response'],
  ['missing return', without('return'), 'invalid-response'],
  ['null return', menuClose({ return: null }), 'invalid-response'],
  ['string-coerced return', menuClose({ return: '0' }), 'invalid-response'],
  ['negative zero return', menuClose({ return: -0 }), 'invalid-response'],
  ['non-integer return', menuClose({ return: 0.1 }), 'invalid-response'],
  ['missing selector', without('selector'), 'invalid-response'],
  ['selector-only acknowledgement', (() => { const event = menuClose(); delete event.return; delete event.selectors; return event; })(), 'invalid-response'],
  ['selected row', menuClose({ return: 1, selector: 97, selectors: 'a' }), 'invalid-response'],
  ['coerced selector', menuClose({ selector: '0' }), 'invalid-response'],
  ['negative zero selector', menuClose({ selector: -0 }), 'invalid-response'],
  ['fractional selector', menuClose({ selector: 0.5 }), 'invalid-response'],
  ['missing selectors', without('selectors'), 'invalid-response'],
  ['empty-selector-only acknowledgement', (() => { const event = menuClose(); delete event.return; delete event.selector; return event; })(), 'invalid-response'],
  ['null selectors', menuClose({ selectors: null }), 'invalid-response'],
  ['conflicting answer alias', menuClose({ answer: 'a' }), 'invalid-response'],
  ['conflicting selection alias', menuClose({ selection: 'a' }), 'invalid-response'],
  ['malformed empty alias', menuClose({ value: null }), 'invalid-response'],
];

for (const [label, event, expectedCode] of negativeMatrix) {
  const first = Model.settleOwnedInputFlow(menuFlow(), event);
  assert.equal(first.ok, false, `${label} must fail closed`);
  assert.equal(first.code, expectedCode, `${label} rejection code`);
  assert.equal(first.flow.status, 'rejected', `${label} consumes the one-shot flow`);
  const validAfterMalformed = Model.settleOwnedInputFlow(first.flow, menuClose());
  assert.equal(validAfterMalformed.ok, false, `${label} cannot be followed by a valid dispatch release`);
  assert.equal(validAfterMalformed.code, 'late-duplicate', `${label} leaves no reusable ownership`);
}

let stability = Model.observeOwnedRevisionStability(acknowledged.flow, {
  ownerClosed: true, revision: { inventory: 13, equipment: 8 }, equipmentInventoryRevision: 12,
});
assert.equal(stability.code, 'linked-revision-pending', 'equipment-linked actions wait for their linked inventory revision');
stability = Model.observeOwnedRevisionStability(stability.flow, {
  ownerClosed: true, revision: { inventory: 13, equipment: 8 }, equipmentInventoryRevision: 13,
});
assert.equal(stability.code, 'revision-observed', 'first authoritative stable revision observation does not dispatch');
stability = Model.observeOwnedRevisionStability(stability.flow, {
  ownerClosed: true, revision: { inventory: 13, equipment: 8 }, equipmentInventoryRevision: 13,
});
assert.equal(stability.ready, true, 'unchanged authoritative inventory revision becomes dispatch-ready');
assert.deepEqual(stability.revision, { inventory: 13, equipment: 8 });

const stale = Model.observeOwnedRevisionStability(acknowledged.flow, {
  ownerClosed: true, revision: { inventory: 11, equipment: 8 }, equipmentInventoryRevision: 11,
});
assert.equal(stale.code, 'stale-revision', 'revision rollback is rejected');

const interposed = Model.observeOwnedRevisionStability(acknowledged.flow, {
  ownerClosed: true,
  activeInputOwner: { kind: 'prompt', requestId: 'prompt-r8', transactionId: 'other-t8' },
  revision: { inventory: 13, equipment: 8 }, equipmentInventoryRevision: 13,
});
assert.equal(interposed.code, 'prompt-interposition', 'a late prompt cannot be skipped by the queued action');

const duplicate = Model.settleOwnedInputFlow(acknowledged.flow, menuClose());
assert.equal(duplicate.code, 'late-duplicate', 'a late duplicate close is inert');

const selectedBox = { objectId: 1121, selector: 121, inventoryLetter: 'y', displayName: 'a large box', semanticKind: 'object', semanticName: 'large box' };
const otherBox = { objectId: 2121, selector: 120, inventoryLetter: 'x', displayName: 'a large box', semanticKind: 'object', semanticName: 'large box' };
const exactBox = { ...selectedBox };
const targetMatrix = [
  ['revision change without selected-item change', { revision: 13, orderedItems: [exactBox] }, 13, true, 'exact-target', 1121],
  ['item disappearance', { revision: 13, orderedItems: [] }, 13, false, 'target-disappeared'],
  ['same selector reused by another object', { revision: 13, orderedItems: [{ ...otherBox, selector: 121, inventoryLetter: 'y' }] }, 13, false, 'target-disappeared'],
  ['same-name duplicate keeps exact object', { revision: 13, orderedItems: [otherBox, exactBox] }, 13, true, 'exact-target', 1121],
  ['revision change with selected-item mutation', { revision: 13, orderedItems: [{ ...exactBox, displayName: 'a locked large box', semanticName: 'large box' }] }, 13, false, 'target-mutated'],
  ['stale snapshot revision', { revision: 12, orderedItems: [exactBox] }, 13, false, 'stale-snapshot'],
  ['malformed snapshot revision', { revision: '13', orderedItems: [exactBox] }, 13, false, 'stale-snapshot'],
  ['empty snapshot shape', { revision: 13 }, 13, false, 'empty-snapshot'],
];
for (const [label, snapshot, expectedRevision, ok, code, objectId] of targetMatrix) {
  const resolved = Model.resolveExactOwnedInventoryItem(selectedBox, snapshot, expectedRevision);
  assert.equal(resolved.ok, ok, `${label} acceptance`);
  assert.equal(resolved.code, code, `${label} result code`);
  if (ok) assert.equal(resolved.item.objectId, objectId, `${label} dispatches only the exact selected object ID`);
}

console.log(JSON.stringify({
  passed: true,
  acceptedCases: 1,
  rejectedCases: negativeMatrix.length,
  everyRejectedCaseConsumedOneShot: true,
  exactItemTargetCases: targetMatrix.length,
  revisionAndPromptCases: ['linked revision wait', 'stable inventory revision', 'stale rollback', 'prompt interposition', 'late duplicate'],
}, null, 2));
