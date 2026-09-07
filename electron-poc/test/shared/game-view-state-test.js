const assert = require('node:assert/strict');
const GameViewState = require('../../src/shared/game-view-state');

const protocol = 'nethack-electron-ui/v2';
let sequence = 0;

function uiEvent(eventType, payload) {
  sequence += 1;
  return {
    protocol,
    sequence,
    eventId: `evt-game-view-${sequence}`,
    eventType,
    turn: 1,
    payload,
  };
}

function effectOf(result, type) {
  return result.effects.find((effect) => effect.type === type);
}

function assertEffect(result, type) {
  const effect = effectOf(result, type);
  assert(effect, `expected ${type}; received ${result.effects.map((candidate) => candidate.type).join(', ')}`);
  return effect;
}

const interactionView = GameViewState.createGameViewState({ mapWidth: 6, mapHeight: 4 });
const menuOwner = { kind: 'system', window: 7 };
const menuIdentity = {
  window: 7,
  requestId: 'menu-current',
  menuId: 'menu-current',
  transactionId: 'tx-menu',
  menuPurpose: 'inventory.select',
  owner: menuOwner,
  lifecycleRevision: 4,
};
interactionView.process({ name: 'shim_start_menu', ...menuIdentity });
interactionView.process({
  name: 'shim_add_menu',
  ...menuIdentity,
  selector: 97,
  text: 'a - a dagger',
  objectId: 11,
  semanticKind: 'object',
  semanticName: 'dagger',
  semanticKnown: true,
});
interactionView.process({ name: 'shim_end_menu', ...menuIdentity, prompt: 'Choose an item:' });
const selecting = interactionView.process({ name: 'shim_select_menu', ...menuIdentity, how: 1 });
assertEffect(selecting, 'render-menu');
let interactionSnapshot = interactionView.snapshot();
assert.equal(interactionSnapshot.currentMenu.requestId, 'menu-current', 'the active menu publishes its owning request');
assert.equal(interactionSnapshot.currentMenu.transactionId, 'tx-menu', 'the active menu publishes its owning transaction');
assert.deepEqual(interactionSnapshot.currentMenu.owner, menuOwner, 'the active menu publishes its explicit owner');
assert.equal(interactionSnapshot.activePrompt.requestId, 'menu-current', 'the menu-selection prompt has the same request owner as its menu');
assert.deepEqual(interactionSnapshot.activePrompt.owner, menuOwner, 'the menu-selection prompt preserves the menu owner');

const staleMenuAnswer = interactionView.process({
  name: 'bridge_menu_answer',
  window: 7,
  requestId: 'menu-stale',
  return: 1,
  selector: 97,
});
const rejectedMenuAnswer = assertEffect(staleMenuAnswer, 'menu-answer-event-rejected');
assert.match(rejectedMenuAnswer.reason, /request id does not match active menu/);
interactionSnapshot = interactionView.snapshot();
assert.equal(interactionSnapshot.currentMenu.requestId, 'menu-current', 'a stale answer cannot close another request\'s menu');
assert.equal(interactionSnapshot.activePrompt.requestId, 'menu-current', 'a stale answer cannot close another request\'s menu prompt');

const acceptedMenuAnswer = interactionView.process({
  name: 'bridge_menu_answer',
  window: 7,
  requestId: 'menu-current',
  return: 1,
  selector: 97,
});
assertEffect(acceptedMenuAnswer, 'close-interaction');
interactionSnapshot = interactionView.snapshot();
assert.equal(interactionSnapshot.currentMenu, null);
assert.equal(interactionSnapshot.activePrompt, null);

const promptOwner = { kind: 'system', window: 0 };
const promptOpened = interactionView.process({
  name: 'shim_yn_function',
  query: 'Really quit?',
  choices: 'yn',
  requestId: 'prompt-current',
  transactionId: 'tx-prompt',
  promptPurpose: 'prompt.confirm',
  owner: promptOwner,
  lifecycleRevision: 9,
});
assertEffect(promptOpened, 'render-prompt');
interactionSnapshot = interactionView.snapshot();
assert.equal(interactionSnapshot.activePrompt.requestId, 'prompt-current', 'the active prompt publishes its owning request');
assert.equal(interactionSnapshot.activePrompt.transactionId, 'tx-prompt', 'the active prompt publishes its owning transaction');
assert.deepEqual(interactionSnapshot.activePrompt.owner, promptOwner, 'the active prompt publishes its explicit owner');

const stalePromptAnswer = interactionView.process({
  name: 'bridge_prompt_answer',
  keycode: 121,
  requestId: 'prompt-stale',
});
const rejectedPromptAnswer = assertEffect(stalePromptAnswer, 'prompt-answer-event-rejected');
assert.match(rejectedPromptAnswer.reason, /request id does not match active prompt/);
assert.equal(interactionView.snapshot().activePrompt.requestId, 'prompt-current', 'a stale answer cannot close another request\'s prompt');

const acceptedPromptAnswer = interactionView.process({
  name: 'bridge_prompt_answer',
  keycode: 121,
  requestId: 'prompt-current',
});
assertEffect(acceptedPromptAnswer, 'close-interaction');
assert.equal(interactionView.snapshot().activePrompt, null);

const publicationView = GameViewState.createGameViewState({ mapWidth: 6, mapHeight: 4 });
publicationView.process({ name: 'shim_create_nhwindow', return: 2, windowType: 3 });
const mapPublication = publicationView.process({
  name: 'shim_print_glyph',
  window: 2,
  x: 3,
  y: 1,
  char: '@',
  glyph: 725,
  semanticKind: 'hero',
  semanticName: 'you',
  semanticKnown: true,
});
assertEffect(mapPublication, 'render-map');
assert.equal(publicationView.snapshot().directionKeys, 'hykulnjb><', 'Game View defaults to classic vi directions until NetHack publishes its active layout');
assert.equal(publicationView.snapshot().numberPadEnabled, false, 'Game View defaults to vi count-prefix semantics');
const directionPublication = publicationView.process({ name: 'shim_number_pad', enabled: 1, directionKeys: '47896321><' });
assert.deepEqual(directionPublication.effects, [], 'direction layout publication changes no player-facing surface by itself');
publicationView.process({ name: 'shim_status_enablefield', field: 0, label: 'Hero', enabled: true });
const statusPublication = publicationView.process({ name: 'shim_status_update', field: 0, value: 'Ada' });
assertEffect(statusPublication, 'render-status');
const messagePublication = publicationView.process({ name: 'shim_putstr', window: 1, text: 'You hear a door open.' });
assert.deepEqual(assertEffect(messagePublication, 'message'), { type: 'message', text: 'You hear a door open.', appended: true });
const publicationSnapshot = publicationView.snapshot();
assert.strictEqual(publicationView.snapshot(), publicationSnapshot, 'same-revision snapshots are returned by identity without another deep copy');
assert.equal(publicationSnapshot.mapWindowId, 2);
assert.equal(publicationSnapshot.mapRevision, 1);
assert.equal(publicationSnapshot.mapCells[1][3].ch, '@');
assert.equal(publicationSnapshot.mapCells[1][3].semanticKind, 'hero');
assert.equal(publicationSnapshot.statusLabels.get(0), 'Hero');
assert.equal(publicationSnapshot.statusValues.get(0), 'Ada');
assert.deepEqual(publicationSnapshot.messages, ['You hear a door open.']);
assert.equal(publicationSnapshot.directionKeys, '47896321><', 'Game View publishes the active native number-pad direction layout');
assert.equal(publicationSnapshot.numberPadEnabled, true, 'Game View publishes native number-pad count-prefix semantics');
assert.deepEqual(Object.keys(publicationView).sort(), ['process', 'snapshot', 'version'], 'the interface exposes no mutable state');
assert(Object.isFrozen(publicationSnapshot), 'snapshot root is frozen');
assert(Object.isFrozen(publicationSnapshot.mapCells), 'map rows collection is frozen');
assert(Object.isFrozen(publicationSnapshot.mapCells[1]), 'each map row is frozen');
assert(Object.isFrozen(publicationSnapshot.mapCells[1][3]), 'each map cell is frozen');
assert(Object.isFrozen(publicationSnapshot.cursor), 'nested interaction facts are frozen');
assert(Object.isFrozen(publicationSnapshot.messages), 'message publication is frozen');
assert(Object.isFrozen(publicationSnapshot.statusValues), 'map-like public facts are frozen');
assert.throws(() => publicationSnapshot.statusValues.set(0, 'Mallory'), /immutable Game View snapshot/);
publicationView.process({ name: 'shim_print_glyph', window: 2, x: 3, y: 1, char: '#', glyph: 18, semanticKind: 'terrain', semanticName: 'corridor', semanticKnown: true });
const changedPublicationSnapshot = publicationView.snapshot();
assert.equal(publicationSnapshot.mapCells[1][3].ch, '@', 'an earlier snapshot stays detached after later map publication');
assert.equal(changedPublicationSnapshot.mapCells[1][3].ch, '#');
assert.notEqual(changedPublicationSnapshot.mapCells[1][3], publicationSnapshot.mapCells[1][3], 'map cells are detached snapshot values');
assert.strictEqual(changedPublicationSnapshot.mapCells[0], publicationSnapshot.mapCells[0], 'unchanged map rows retain immutable identity across snapshots');
assert.notStrictEqual(changedPublicationSnapshot.mapCells[1], publicationSnapshot.mapCells[1], 'the changed map row receives a new immutable value');
const sparseReloadView = GameViewState.createGameViewState({ mapWidth: 6, mapHeight: 4 });
sparseReloadView.process({ name: 'shim_create_nhwindow', return: 2, windowType: 3 });
sparseReloadView.process({ name: 'shim_print_glyph', window: 2, x: 1, y: 1, char: '.', glyph: 3992, semanticKind: 'terrain', semanticName: 'room floor' });
const sparseReset = assertEffect(sparseReloadView.process({ name: 'shim_clear_nhwindow', window: 2 }), 'map-reset');
assert.deepEqual(sparseReset.dirtyCells, [{ x: 1, y: 1 }], 'map reset dirties only cells rendered on the previous level');
sparseReloadView.process({ name: 'shim_print_glyph', window: 2, x: 4, y: 2, char: '#', glyph: 18, semanticKind: 'terrain', semanticName: 'corridor' });
const sparseFlush = assertEffect(sparseReloadView.process({ name: 'shim_display_nhwindow', window: 2, blocking: 0 }), 'flush-map');
assert.deepEqual(sparseFlush.dirtyCells, [{ x: 4, y: 2 }], 'deferred level paint publishes only coordinates touched on the new level');
const resetPublicationView = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
const resetPublicationSnapshot = resetPublicationView.snapshot();
assert(!Object.prototype.hasOwnProperty.call(publicationView, 'reset'), 'reset is explicit construction of a new Game View, not mutation of a published instance');
assert.equal(resetPublicationSnapshot.mapRevision, 0, 'a newly constructed Game View starts at the initial map revision');
assert.deepEqual(resetPublicationSnapshot.messages, [], 'a newly constructed Game View carries no factual message history from an earlier instance');
assert.equal(resetPublicationSnapshot.statusValues.size, 0, 'a newly constructed Game View carries no factual status from an earlier instance');

const publicDagger = {
  objectId: 11,
  inventoryLetter: 'a',
  displayName: 'dagger',
  semanticKind: 'weapon',
  semanticName: 'dagger',
  semanticKnown: true,
  known: { identity: true },
  publicClass: 'weapon',
  equipmentSlots: ['mainHand'],
};
const revisionView = GameViewState.createGameViewState();
assertEffect(revisionView.process(uiEvent('inventory.snapshot', { revision: 2, items: [publicDagger] })), 'inventory-snapshot');
assertEffect(revisionView.process(uiEvent('equipment.snapshot', {
  revision: 3,
  inventoryRevision: 2,
  slots: [{ slotId: 'mainHand', objectId: 11, item: publicDagger }],
})), 'equipment-snapshot');

const staleInventory = assertEffect(
  revisionView.process(uiEvent('inventory.snapshot', { revision: 1, items: [] })),
  'inventory-snapshot-rejected',
);
assert.equal(staleInventory.stale, true);
assert.equal(staleInventory.currentRevision, 2);
const staleEquipment = assertEffect(
  revisionView.process(uiEvent('equipment.snapshot', { revision: 2, inventoryRevision: 2, slots: [] })),
  'equipment-snapshot-rejected',
);
assert.equal(staleEquipment.stale, true);
assert.equal(staleEquipment.currentRevision, 3);
let revisionSnapshot = revisionView.snapshot();
assert.equal(revisionSnapshot.inventory.itemsByObjectId.get(11).displayName, 'dagger', 'stale inventory cannot replace a newer snapshot');
assert.equal(revisionSnapshot.equipment.slotsById.get('mainHand').objectId, 11, 'stale equipment cannot replace a newer snapshot');
assert(Object.isFrozen(revisionSnapshot.inventory), 'nested inventory fact is frozen');
assert(Object.isFrozen(revisionSnapshot.inventory.orderedItems), 'inventory rows are frozen');
assert(Object.isFrozen(revisionSnapshot.inventory.orderedItems[0]), 'inventory items are frozen');
assert(Object.isFrozen(revisionSnapshot.inventory.orderedItems[0].known), 'nested item knowledge is frozen');
assert(Object.isFrozen(revisionSnapshot.equipment.slotsById.get('mainHand')), 'nested equipment slots are frozen');

assertEffect(revisionView.process(uiEvent('inventory.snapshot', { revision: 4, items: [publicDagger] })), 'inventory-snapshot');
const equipmentForOldInventory = assertEffect(
  revisionView.process(uiEvent('equipment.snapshot', { revision: 4, inventoryRevision: 2, slots: [] })),
  'equipment-snapshot-rejected',
);
assert.equal(equipmentForOldInventory.stale, true);
assert.equal(equipmentForOldInventory.currentInventoryRevision, 4, 'equipment is ordered against the accepted inventory revision');
revisionSnapshot = revisionView.snapshot();
assert.equal(revisionSnapshot.inventory.revision, 4);
assert.equal(revisionSnapshot.equipment.revision, 3, 'equipment for an older inventory revision remains rejected even with a newer equipment revision');

revisionView.process({ name: 'bridge_command', keycode: 'W'.charCodeAt(0), transactionId: 'equipment-menu-no-snapshot-write' });
revisionView.process({ name: 'shim_start_menu', window: 41 });
revisionView.process({ name: 'shim_add_menu', window: 41, selector: 97, objectId: 11, text: 'a - dagger', glyphChar: 41, semanticKind: 'object', semanticName: 'dagger', semanticKnown: true });
revisionView.process({ name: 'shim_end_menu', window: 41, prompt: 'Inventory:' });
revisionView.process({ name: 'shim_select_menu', window: 41, how: 1 });
revisionSnapshot = revisionView.snapshot();
assert.equal(revisionSnapshot.inventory.revision, 4, 'public inventory menu rows do not fabricate an authoritative inventory snapshot');
assert.equal(revisionSnapshot.equipment.revision, 3, 'public inventory menu rows cannot clear equipment facts by fabricating an equipment snapshot');
assert.equal(revisionSnapshot.equipment.slotsById.get('mainHand').objectId, 11, 'equipment remains sourced from the last immutable Game View equipment snapshot');

const publicApple = {
  objectId: 21,
  displayName: 'apple',
  semanticKind: 'food',
  semanticName: 'apple',
  semanticKnown: true,
  known: { identity: true },
};
const publicBox = {
  publicId: 'box-31',
  objectId: 31,
  displayName: 'large box',
  semanticKnown: true,
  known: { identity: true },
};
const evidenceView = GameViewState.createGameViewState();
assertEffect(evidenceView.process(uiEvent('ground.pile.snapshot', {
  revision: 5,
  coord: { x: 2, y: 3 },
  items: [publicApple],
})), 'ground-pile-snapshot');
const staleGround = assertEffect(evidenceView.process(uiEvent('ground.pile.snapshot', {
  revision: 4,
  coord: { x: 2, y: 3 },
  items: [],
})), 'ground-pile-snapshot-rejected');
assert.equal(staleGround.stale, true);
assert.equal(staleGround.currentRevision, 5);
assert.equal(evidenceView.snapshot().groundPiles.pilesByCoord.get('2,3').items[0].displayName, 'apple', 'stale ground evidence cannot erase the accepted pile');

assertEffect(evidenceView.process(uiEvent('container.session.opened', {
  sessionId: 'container-session',
  container: publicBox,
})), 'container-session-opened');
assertEffect(evidenceView.process(uiEvent('container.contents.snapshot', {
  revision: 6,
  sessionId: 'container-session',
  container: publicBox,
  items: [publicApple],
})), 'container-contents-snapshot');
const staleContainer = assertEffect(evidenceView.process(uiEvent('container.contents.snapshot', {
  revision: 5,
  sessionId: 'container-session',
  container: publicBox,
  items: [],
})), 'container-contents-snapshot-rejected');
assert.equal(staleContainer.stale, true);
assert.equal(staleContainer.currentRevision, 6);
assert.equal(evidenceView.snapshot().containerContents.contentsBySessionId.get('container-session').items[0].displayName, 'apple', 'stale container evidence cannot erase accepted contents');

const transferView = GameViewState.createGameViewState();
const ration = {
  objectId: 41,
  displayName: 'food ration',
  semanticKind: 'food',
  semanticName: 'food ration',
  semanticKnown: true,
  known: { identity: true },
};
const rationRow = {
  selector: 'a',
  text: 'food ration',
  objectId: 41,
  quantity: 1,
  semanticKnown: true,
  known: { identity: true },
};
assertEffect(transferView.process(uiEvent('ground.pile.snapshot', {
  revision: 1,
  coord: { x: 4, y: 5 },
  items: [ration],
})), 'ground-pile-snapshot');
assertEffect(transferView.process(uiEvent('transfer.session.opened', {
  sessionId: 'ground-session',
  kind: 'ground-pickup',
  leftRows: [rationRow],
  rightRows: [],
  loadedSides: { left: true, right: true },
  groundCoord: { x: 4, y: 5 },
})), 'transfer-session-opened');
const transferBegun = transferView.process(uiEvent('transfer.begun', {
  transferId: 'ground-transfer-1',
  sessionId: 'ground-session',
  direction: 'ground-to-inventory',
  sourceSide: 'left',
  targetSide: 'right',
  selector: 'a',
  itemName: 'food ration',
  beforePanes: { left: [rationRow], right: [] },
  groundCoord: { x: 4, y: 5 },
}));
assertEffect(transferBegun, 'transfer-transaction-started');
assertEffect(transferBegun, 'transfer-pending-ground-pile-evidence-recorded');
let transferSnapshot = transferView.snapshot();
assert.equal(transferSnapshot.transferTransactions.transfersById.get('ground-transfer-1').status, 'pending');
assert.equal(transferSnapshot.pendingTransferEvidence.ground.transferId, 'ground-transfer-1');
assert.deepEqual(transferSnapshot.pendingTransferEvidence.ground.coord, { x: 4, y: 5 });

const evidenceAttached = transferView.process(uiEvent('ground.pile.snapshot', {
  revision: 2,
  coord: { x: 4, y: 5 },
  items: [],
}));
assertEffect(evidenceAttached, 'ground-pile-snapshot');
const attachedDelta = assertEffect(evidenceAttached, 'transfer-transaction-ground-pile-delta-attached');
assert.equal(attachedDelta.groundPileDelta.changed, true);
assert.equal(attachedDelta.groundPileDelta.removed[0].objectId, 41);
transferSnapshot = transferView.snapshot();
assert.equal(transferSnapshot.pendingTransferEvidence.ground, null, 'matching public evidence satisfies the pending evidence obligation');
assert.equal(transferSnapshot.transferTransactions.transfersById.get('ground-transfer-1').result.groundPileDelta.publicEvidence, true);

const transferCompleted = transferView.process(uiEvent('transfer.completed', {
  transferId: 'ground-transfer-1',
  sessionId: 'ground-session',
  status: 'completed',
  afterPanes: { left: [], right: [rationRow] },
}));
const completion = assertEffect(transferCompleted, 'transfer-transaction-completed');
assert.equal(completion.transfer.status, 'completed');
assert.equal(completion.result.publicEvidence.groundPile, true);
transferSnapshot = transferView.snapshot();
assert.equal(transferSnapshot.transferTransactions.activeTransferId, undefined);
assert.equal(transferSnapshot.transferTransactions.lastCompleted.transferId, 'ground-transfer-1');
assert.equal(transferSnapshot.transferTransactions.transfersById.get('ground-transfer-1').status, 'completed');
assert.equal(transferSnapshot.pendingTransferEvidence.ground, null);
assert.deepEqual(transferSnapshot.groundPiles.pilesByCoord.get('4,5').items, []);

const resetView = GameViewState.createGameViewState({ mapWidth: 6, mapHeight: 4 });
const resetSnapshot = resetView.snapshot();
assert.equal(resetSnapshot.mapWindowId, undefined);
assert.equal(resetSnapshot.mapRevision, 0);
assert(resetSnapshot.mapCells.every((row) => row.every((cell) => cell.ch === ' ')), 'a new Game View starts with a blank map');
assert.equal(resetSnapshot.statusLabels.size, 0);
assert.equal(resetSnapshot.statusValues.size, 0);
assert.deepEqual(resetSnapshot.messages, []);
assert.equal(resetSnapshot.currentMenu, null);
assert.equal(resetSnapshot.activePrompt, null);
assert.equal(resetSnapshot.inventory.revision, 0);
assert.equal(resetSnapshot.inventory.orderedItems.length, 0);
assert.equal(resetSnapshot.equipment.revision, 0);
assert.equal(resetSnapshot.equipment.orderedSlots.length, 0);
assert.equal(resetSnapshot.groundPiles.revision, 0);
assert.equal(resetSnapshot.groundPiles.pilesByCoord.size, 0);
assert.equal(resetSnapshot.containerContents.revision, 0);
assert.equal(resetSnapshot.containerContents.sessionsById.size, 0);
assert.equal(resetSnapshot.transferTransactions.revision, 0);
assert.equal(resetSnapshot.transferTransactions.sessionsById.size, 0);
assert.equal(resetSnapshot.transferTransactions.transfersById.size, 0);
assert.deepEqual(resetSnapshot.pendingTransferEvidence, { ground: null, container: null, lastIgnored: null });
assert(Object.isFrozen(resetSnapshot.pendingTransferEvidence), 'reset interaction/evidence facts are frozen');
assert.throws(() => resetSnapshot.groundPiles.pilesByCoord.clear(), /immutable Game View snapshot/);

const dirtyBeforeReplacement = GameViewState.createGameViewState({ mapWidth: 6, mapHeight: 4 });
dirtyBeforeReplacement.process({ name: 'shim_create_nhwindow', return: 3, windowType: 3 });
dirtyBeforeReplacement.process({ name: 'shim_print_glyph', window: 3, x: 1, y: 1, char: '@', glyph: 725 });
dirtyBeforeReplacement.process({ name: 'shim_yn_function', query: 'Continue?', choices: 'yn', requestId: 'reset-owned-prompt' });
const dirtySnapshot = dirtyBeforeReplacement.snapshot();
const freshReplacement = GameViewState.createGameViewState({ mapWidth: 6, mapHeight: 4 });
const freshReplacementSnapshot = freshReplacement.snapshot();
assert.equal(dirtySnapshot.mapRevision, 1);
assert.equal(dirtySnapshot.activePrompt.requestId, 'reset-owned-prompt');
assert.equal(freshReplacementSnapshot.mapRevision, 0, 'reset uses a fresh instance with a fresh map revision');
assert.equal(freshReplacementSnapshot.activePrompt, null, 'reset does not retain interaction ownership');
assert.equal(dirtyBeforeReplacement.snapshot().activePrompt.requestId, 'reset-owned-prompt', 'reset replacement cannot mutate the discarded instance');

const cursorOwnedHero = GameViewState.createGameViewState({ mapWidth: 6, mapHeight: 4 });
cursorOwnedHero.process({ name: 'shim_create_nhwindow', return: 4, windowType: 3 });
cursorOwnedHero.process({ name: 'shim_print_glyph', window: 4, x: 1, y: 1, char: '@', glyph: 725, actorId: 'hero', semanticKind: 'hero', semanticName: 'hero' });
cursorOwnedHero.process({ name: 'shim_print_glyph', window: 4, x: 2, y: 1, char: '#', glyph: 4024, semanticKind: 'terrain', semanticName: 'cloud', semanticKnown: true });
cursorOwnedHero.process({ name: 'shim_curs', window: 4, x: 2, y: 1, actorId: 'hero' });
const cursorOwnedHeroSnapshot = cursorOwnedHero.snapshot();
assert.equal(cursorOwnedHeroSnapshot.mapCells[1][2].actorId, 'hero', 'native cursor ownership carries hero identity onto an obscuring region glyph');
assert.equal(cursorOwnedHeroSnapshot.mapCells[1][2].semanticName, 'cloud', 'native cursor ownership preserves truthful cloud terrain semantics');
assert.notEqual(cursorOwnedHeroSnapshot.mapCells[1][1].actorId, 'hero', 'native cursor ownership removes stale hero identity from the previous square');
cursorOwnedHero.process({ name: 'shim_curs', window: 4, x: 2, y: 1, actorId: 'hero' });
cursorOwnedHero.process({ name: 'shim_curs', window: 4, x: 3, y: 1, actorId: 'hero' });
const departedCloudSnapshot = cursorOwnedHero.snapshot();
assert.equal(departedCloudSnapshot.mapCells[1][2].actorId, undefined, 'leaving native vapor removes cursor-projected hero identity');
assert.equal(departedCloudSnapshot.mapCells[1][2].semanticName, 'cloud', 'leaving native vapor restores its primary cloud glyph instead of blanking it');
cursorOwnedHero.process({ name: 'shim_curs', window: 4, x: 2, y: 1, actorId: 'hero' });
cursorOwnedHero.process({ name: 'shim_curs', window: 4, x: 2, y: 1, actorId: 'hero' });
cursorOwnedHero.process({ name: 'shim_print_glyph', window: 4, x: 4, y: 1, char: '@', glyph: 725, actorId: 'hero', semanticKind: 'hero', semanticName: 'hero' });
const glyphDepartedCloudSnapshot = cursorOwnedHero.snapshot();
assert.equal(glyphDepartedCloudSnapshot.mapCells[1][2].actorId, undefined, 'a later hero glyph removes cursor-projected identity from vapor');
assert.equal(glyphDepartedCloudSnapshot.mapCells[1][2].semanticName, 'cloud', 'a later hero glyph also restores the primary cloud glyph');

const longHistoryView = GameViewState.createGameViewState({ mapWidth: 2, mapHeight: 2 });
let firstPublishedTransaction = null;
let previousHistorySnapshot = null;
for (let index = 0; index < 128; index += 1) {
  const transactionId = `long-history-${index}`;
  longHistoryView.process({ name: 'bridge_command', keycode: 'a'.charCodeAt(0), transactionId });
  longHistoryView.process({ name: 'bridge_unsupported_command', transactionId });
  const historySnapshot = longHistoryView.snapshot();
  if (index === 0) firstPublishedTransaction = historySnapshot.commandTransactions.byId.get(transactionId);
  else assert.strictEqual(historySnapshot.commandTransactions.byId.get('long-history-0'), firstPublishedTransaction, 'new snapshots reuse immutable historical transactions instead of recursively copying them');
  if (previousHistorySnapshot) assert.notStrictEqual(historySnapshot.commandTransactions.byId, previousHistorySnapshot.commandTransactions.byId, 'a lifecycle update receives a new immutable history map');
  previousHistorySnapshot = historySnapshot;
}
assert.equal(previousHistorySnapshot.commandTransactions.byId.size, 128, 'long sessions retain the complete command history');
assert(Object.isFrozen(firstPublishedTransaction), 'published historical transactions are immutable');
assert.throws(() => previousHistorySnapshot.commandTransactions.byId.clear(), /immutable command transaction history/, 'published command history rejects mutation');
Map.prototype.set.call(previousHistorySnapshot.commandTransactions.byId, 'forged', {});
assert.equal(previousHistorySnapshot.commandTransactions.byId.has('forged'), false, 'prototype mutation cannot alter published command history');
longHistoryView.process({ name: 'shim_putstr', window: 1, text: 'History remains stable.' });
const unrelatedPublicationSnapshot = longHistoryView.snapshot();
assert.strictEqual(unrelatedPublicationSnapshot.commandTransactions.byId, previousHistorySnapshot.commandTransactions.byId, 'unrelated snapshots reuse the whole immutable command history without walking its entries');
assert.strictEqual(unrelatedPublicationSnapshot.commandTransactions.byId.get('long-history-0'), firstPublishedTransaction, 'unrelated publication preserves historical transaction identity');



console.log('game view state characterization OK');
