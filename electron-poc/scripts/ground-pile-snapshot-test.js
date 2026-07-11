const assert = require('node:assert/strict');
const Ground = require('../src/shared/ground-pile-snapshot-adapter');
const UiProtocol = require('../src/shared/ui-protocol-v2');
const Transfer = require('../src/shared/transfer-transaction-model');

const coord = { x: 12, y: 8 };
const first = Ground.normalizeGroundPileSnapshotPayload({
  revision: 1,
  coord,
  items: [
    { selector: 97, text: 'a - 3 arrows', glyphChar: 41, semanticKind: 'object', semanticKnown: true, semanticName: 'arrow' },
    { selector: 98, text: 'b - a scroll labeled READ ME', semanticKind: 'object', semanticKnown: false, semanticName: 'scroll of destroy armor', semanticAppearance: 'scroll labeled READ ME', trueName: 'scroll of destroy armor' },
  ],
});
assert.equal(first.revision, 1);
assert.equal(first.coord.x, 12);
assert.equal(first.items.length, 2);
assert.equal(first.items[0].displayName, '3 arrows');
assert.equal(first.items[0].quantity, 3);
assert.equal(first.items[0].location.kind, 'ground');
assert.equal(first.items[1].displayName, 'a scroll labeled READ ME');
assert.equal(first.items[1].semanticName, undefined, 'hidden semanticName is redacted unless identity is public');
assert.equal(first.items[1].trueName, undefined, 'non-public hidden alias is never copied');
assert.equal(first.items[1].known.identity, false);

const event = Ground.createGroundPileSnapshotEvent(first, { sequence: 9, source: { layer: 'renderer' } });
const checked = UiProtocol.validateEventEnvelope(event);
assert.equal(checked.ok, true, checked.errors.join('\n'));
const invalidExtraGroundKey = UiProtocol.validateEventEnvelope({ ...event, eventId: 'evt-ground-pile-extra-key', payload: { ...event.payload, trueName: 'secret object type' } });
assert.equal(invalidExtraGroundKey.ok, false, 'ground.pile.snapshot payload rejects unexpected no-spoiler fields');

let state = Ground.emptyGroundPileState();
state = Ground.applyGroundPileSnapshot(state, first, { event, source: { layer: 'renderer' } });
const pile1 = Ground.groundPileAt(state, coord);
assert.equal(pile1.items.length, 2);
assert.equal(state.revision, 1);

const second = Ground.normalizeGroundPileSnapshotPayload({
  revision: 2,
  coord,
  items: [
    { text: '2 arrows', glyphChar: 41, semanticKind: 'object', semanticKnown: true, semanticName: 'arrow' },
    { text: 'a +0 spear', semanticKind: 'object', semanticKnown: true, semanticName: 'spear' },
  ],
});
const previous = Ground.groundPileAt(state, coord);
state = Ground.applyGroundPileSnapshot(state, second);
const after = Ground.groundPileAt(state, coord);
const delta = Ground.groundPileDelta(previous, after);
assert.equal(delta.fromRevision, 1);
assert.equal(delta.toRevision, 2);
assert.equal(delta.changed, true);
assert.equal(delta.changedCount, 3, JSON.stringify(delta));
assert(delta.updated.some((item) => /arrows/i.test(item.after.displayName) && item.after.quantity === 2), JSON.stringify(delta));
assert(delta.removed.some((item) => /READ ME/i.test(item.displayName)), JSON.stringify(delta));
assert(delta.added.some((item) => /spear/i.test(item.displayName)), JSON.stringify(delta));

const stale = Ground.normalizeGroundPileSnapshotPayload({ revision: 1, coord, items: [{ text: 'a stale rock' }] });
const staleEvent = Ground.createGroundPileSnapshotEvent(stale, { sequence: 10, source: { layer: 'renderer' } });
assert.equal(UiProtocol.validateEventEnvelope(staleEvent).ok, true, 'stale-but-valid public evidence is schema-valid');
const staleIgnored = Ground.applyGroundPileSnapshot(state, stale);
assert.deepEqual(Ground.groundPileAt(staleIgnored, coord).items.map((item) => item.displayName), after.items.map((item) => item.displayName), 'stale lower ground revisions are ignored like inventory/equipment snapshots');
const conflictingEqual = Ground.normalizeGroundPileSnapshotPayload({ revision: 2, coord, items: [{ text: 'a conflicting equal-revision rock' }] });
const equalIgnored = Ground.applyGroundPileSnapshot(state, conflictingEqual);
assert.deepEqual(Ground.groundPileAt(equalIgnored, coord).items.map((item) => item.displayName), after.items.map((item) => item.displayName), 'equal ground revisions are idempotent and cannot overwrite accepted state');

const objectLayerItem = Ground.groundObjectLayerEventToPublicItem({ objectLayerGlyph: 2222, objectLayerChar: 47, objectLayerSemanticKind: 'object', objectLayerSemanticName: 'wand of death', objectLayerSemanticAppearance: 'glass wand', objectLayerSemanticKnown: false, objectLayerActionAffordances: ['pickup'] }, { x: 4, y: 5 });
assert.equal(objectLayerItem.displayName, 'glass wand');
assert.equal(objectLayerItem.semanticName, undefined, 'off-hero object-layer hidden identities are redacted');
assert.equal(objectLayerItem.known.identity, false);
assert.deepEqual(objectLayerItem.actionAffordances, ['pickup']);
const knownObjectLayerItem = Ground.groundObjectLayerEventToPublicItem({ objectLayerGlyph: 2223, objectLayerChar: 41, objectLayerSemanticKind: 'object', objectLayerSemanticName: 'arrow', objectLayerSemanticKnown: true }, { x: 4, y: 5 });
assert.equal(knownObjectLayerItem.displayName, 'arrow');
assert.equal(knownObjectLayerItem.semanticName, 'arrow');

const containerPile = Ground.normalizeGroundPileSnapshotPayload({
  revision: 3,
  coord,
  items: [
    { text: 'a locked trapped large box', semanticKind: 'object', semanticKnown: true, semanticName: 'large box', actionAffordances: ['container', 'loot', 'container.locked', 'container.trapped', 'container.broken'] },
  ],
});
assert.deepEqual(containerPile.items[0].actionAffordances, ['container', 'loot', 'container.locked', 'container.trapped', 'container.broken'], 'normalizer preserves raw bridge tokens for validator enforcement');
const containerEvent = Ground.createGroundPileSnapshotEvent(containerPile, { sequence: 11, source: { layer: 'shim-bridge' } });
const invalidContainerEvent = UiProtocol.validateEventEnvelope(containerEvent);
assert.equal(invalidContainerEvent.ok, false, 'public ground-pile event rejects hidden lock/trap/broken action tokens and hidden container display text');
assert.match(invalidContainerEvent.errors.join('\n'), /hidden lock|container\.locked|container\.trapped|container\.broken|hidden container/i);
const redactedContainerPile = Ground.normalizeGroundPileSnapshotPayload({
  revision: 3,
  coord,
  items: [
    { text: 'a large box', semanticKind: 'object', semanticKnown: true, semanticName: 'large box', actionAffordances: ['container', 'loot'] },
  ],
});
assert.equal(UiProtocol.validateEventEnvelope(Ground.createGroundPileSnapshotEvent(redactedContainerPile, { sequence: 12, source: { layer: 'shim-bridge' } })).ok, true, 'redacted public container names stay valid');

const authoritativeFirstOpen = Ground.normalizeGroundPileSnapshotPayload({
  revision: 4,
  coord,
  items: [
    { objectId: 145, displayName: 'a cream pie', quantity: 1, semanticName: 'cream pie', semanticKnown: true },
    { objectId: 133, displayName: 'a lichen corpse', quantity: 1, semanticName: 'lichen', semanticKnown: true },
  ],
});
const afterFirstStreamedLine = Ground.reconcileGroundPileObservation(authoritativeFirstOpen.items, [{ text: 'a cream pie' }], { complete: false });
assert.deepEqual(afterFirstStreamedLine.map((item) => item.objectId), [145, 133], 'a partial text-window line cannot discard a sibling public object ID');
const afterSecondStreamedLine = Ground.reconcileGroundPileObservation(afterFirstStreamedLine, [{ text: 'a lichen corpse' }], { complete: false });
assert.deepEqual(afterSecondStreamedLine.map((item) => item.objectId), [145, 133], 'streaming the rest of a first-open ground window keeps both authoritative IDs');
const completeFirstOpenRows = Ground.reconcileGroundPileObservation(afterSecondStreamedLine, [{ text: 'a cream pie' }, { text: 'a lichen corpse' }], { complete: true });
assert.deepEqual(completeFirstOpenRows.map((item) => item.objectId), [145, 133], 'the completed public text window hydrates directly draggable rows from existing stable IDs');
const changedStack = Ground.reconcileGroundPileObservation([{ objectId: 901, displayName: '3 arrows', quantity: 3, semanticName: 'arrow', semanticKnown: true }], [{ text: '2 arrows', quantity: 2 }], { complete: true });
assert.equal(changedStack[0].objectId, 901, 'quantity reconciliation preserves stack identity');
assert.equal(changedStack[0].quantity, 2, 'quantity reconciliation accepts the latest public count');
const ambiguousDuplicates = Ground.reconcileGroundPileObservation([{ objectId: 11, text: 'a dagger' }, { objectId: 12, text: 'a dagger' }], [{ text: 'a dagger' }], { complete: true });
assert.equal(ambiguousDuplicates[0].objectId, undefined, 'ambiguous prose never guesses between duplicate public objects');
const explicitReplacementId = Ground.reconcileGroundPileObservation([{ objectId: 11, text: 'a dagger' }], [{ objectId: 12, text: 'a dagger' }], { complete: true });
assert.equal(explicitReplacementId[0].objectId, 12, 'a newer explicit public object ID is never overwritten by name reconciliation with an older ID');

const duplicateBefore = Ground.normalizeGroundPileSnapshotPayload({ revision: 4, coord, items: [{ text: 'a dagger' }, { text: 'a dagger' }] });
const duplicateAfter = Ground.normalizeGroundPileSnapshotPayload({ revision: 4, coord, items: [{ text: 'a dagger' }] });
const duplicateDelta = Ground.groundPileDelta(duplicateBefore, duplicateAfter);
assert.equal(duplicateDelta.removed.length, 1, JSON.stringify(duplicateDelta));

let transfers = Transfer.emptyState();
transfers = Transfer.openSession(transfers, { sessionId: 'ground-session', kind: 'ground-pickup', groundCoord: coord, leftRows: [{ selector: 'a', text: 'a - a +0 spear' }], rightRows: [], loadedSides: { left: true, right: true } }).state;
const begun = Transfer.beginTransfer(transfers, { transferId: 'drop-spear', sessionId: 'ground-session', groundCoord: coord, direction: 'inventory-to-ground', sourceSide: 'right', targetSide: 'left', selector: 'b', itemName: 'a +0 spear' });
transfers = begun.state;
const completedWithoutEvidence = Transfer.completeTransfer(transfers, { transferId: 'drop-spear' }, { afterPanes: { left: [{ selector: 'a', text: 'a - a +0 spear' }], right: [] } });
assert.equal(completedWithoutEvidence.transfer.result.publicEvidence.groundPile, false);
assert.equal(completedWithoutEvidence.transfer.result.groundPileDelta, null);

transfers = Transfer.openSession(completedWithoutEvidence.state, { sessionId: 'ground-session-2', kind: 'ground-pickup', groundCoord: coord, leftRows: [], rightRows: [{ selector: 'b', text: 'b - a +0 spear' }], loadedSides: { left: true, right: true } }).state;
transfers = Transfer.beginTransfer(transfers, { transferId: 'drop-spear-evidenced', sessionId: 'ground-session-2', groundCoord: coord, direction: 'inventory-to-ground', sourceSide: 'right', targetSide: 'left', selector: 'b', itemName: 'a +0 spear' }).state;
const evidenced = Transfer.completeTransfer(transfers, { transferId: 'drop-spear-evidenced' }, { afterPanes: { left: [{ selector: 'a', text: 'a - a +0 spear' }], right: [] }, groundPileDelta: delta });
assert.equal(evidenced.transfer.result.publicEvidence.groundPile, true);
assert.equal(evidenced.transfer.result.delta.groundPile.changed, true);
assert.equal(evidenced.transfer.result.delta.canonicalChanged, true);

const duplicateAttach = Transfer.attachGroundPileDelta(evidenced.state, { transferId: 'drop-spear-evidenced' }, { ...delta, toRevision: 3 });
assert.equal(duplicateAttach.rejected.reason, 'ground pile delta already attached to transfer');
assert.equal(duplicateAttach.state.transfersById.get('drop-spear-evidenced').result.groundPileDelta.toRevision, 2);

console.log('ground-pile-snapshot-test PASS');
