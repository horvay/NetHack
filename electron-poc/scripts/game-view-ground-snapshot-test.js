const assert = require('node:assert/strict');
const GameViewState = require('../src/shared/game-view-state');
const Ground = require('../src/shared/ground-pile-snapshot-adapter');
const Transfer = require('../src/shared/transfer-transaction-model');

function effectOf(result, type) {
  return (result.effects || []).find((effect) => effect.type === type);
}

const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
view.process({ name: 'shim_create_nhwindow', return: 1, windowType: 3 });
let result = view.process({
  name: 'shim_print_glyph',
  window: 1,
  x: 20,
  y: 7,
  char: '.',
  glyph: 3992,
  objectLayerGlyph: 2101,
  objectLayerChar: 63,
  objectLayerSemanticKind: 'object',
  objectLayerSemanticName: 'scroll of genocide',
  objectLayerSemanticAppearance: 'scroll labeled ELBIB YLOH',
  objectLayerSemanticKnown: false,
  objectLayerActionAffordances: ['pickup'],
});
const mapGroundEffect = effectOf(result, 'ground-pile-snapshot');
assert(mapGroundEffect, 'visible object-layer metadata should produce a shared ground-pile snapshot effect');
assert.equal(mapGroundEffect.snapshot.coord.x, 20);
assert.equal(mapGroundEffect.snapshot.items.length, 1);
assert.equal(mapGroundEffect.snapshot.items[0].displayName, 'scroll labeled ELBIB YLOH');
assert.equal(mapGroundEffect.snapshot.items[0].semanticName, undefined, 'off-hero object-layer facts must redact hidden identity');
assert.equal(mapGroundEffect.snapshot.items[0].known.identity, false);
assert.deepEqual(mapGroundEffect.snapshot.items[0].actionAffordances, ['pickup']);
assert.equal(Ground.groundPileAt(view.state.groundPiles, { x: 20, y: 7 }).items[0].displayName, 'scroll labeled ELBIB YLOH');

result = view.process({ name: 'shim_print_glyph', window: 1, x: 20, y: 7, char: '.', glyph: 3992, semanticKind: 'floor' });
const clearEffect = effectOf(result, 'ground-pile-snapshot');
assert(clearEffect, 'a visible reprint without object-layer metadata clears stale public object-layer facts');
assert.equal(clearEffect.snapshot.items.length, 0);
assert.equal(Ground.groundPileAt(view.state.groundPiles, { x: 20, y: 7 }).items.length, 0);

const rendererFirst = Ground.createGroundPileSnapshotEvent({ revision: 1, coord: { x: 21, y: 7 }, items: [{ text: 'a renderer-observed rock' }] }, { sequence: 11, source: { layer: 'renderer' } });
result = view.process(rendererFirst);
assert.equal(effectOf(result, 'ground-pile-snapshot').snapshot.items[0].displayName, 'a renderer-observed rock');
result = view.process({
  name: 'shim_ground_pile_snapshot',
  window: 1,
  x: 21,
  y: 7,
  revision: 1,
  coord: { x: 21, y: 7 },
  source: 'level.objects',
  authoritative: true,
  items: [{ objectId: 90210, displayName: 'a rock', glyphChar: 96, semanticKind: 'object', semanticKnown: true, semanticName: 'rock' }],
});
const supersedeEffect = effectOf(result, 'ground-pile-snapshot');
assert(supersedeEffect, 'authoritative C/shim snapshot supersedes same-revision renderer/message evidence instead of conflicting');
assert.equal(supersedeEffect.snapshot.revision, 3);
assert.equal(supersedeEffect.snapshot.authoritativeRevision, 1, 'native revision is retained separately from the promoted public revision');
assert.equal(supersedeEffect.snapshot.items[0].objectId, 90210);
assert.equal(effectOf(result, 'ground-pile-snapshot-rejected'), undefined);

const laterRendererObservation = Ground.createGroundPileSnapshotEvent({ revision: 4, coord: { x: 21, y: 7 }, items: [{ text: 'a later renderer-observed rock' }] }, { sequence: 12, source: { layer: 'renderer' } });
result = view.process(laterRendererObservation);
assert.equal(effectOf(result, 'ground-pile-snapshot').snapshot.authoritativeRevision, 1, 'renderer observations preserve the last accepted native clock');
result = view.process({
  name: 'shim_ground_pile_snapshot', window: 1, revision: 1, coord: { x: 21, y: 7 }, source: 'level.objects', authoritative: true,
  items: [{ objectId: 90210, displayName: 'a stale delayed rock', semanticKind: 'object', semanticKnown: true, semanticName: 'rock' }],
});
const delayedAuthoritative = effectOf(result, 'ground-pile-snapshot-rejected');
assert(delayedAuthoritative?.stale && delayedAuthoritative?.authoritative, 'a delayed native snapshot cannot be promoted over newer renderer/public state');
assert.equal(Ground.groundPileAt(view.state.groundPiles, { x: 21, y: 7 }).items[0].displayName, 'a later renderer-observed rock');
result = view.process({
  name: 'shim_ground_pile_snapshot', window: 1, revision: 2, coord: { x: 21, y: 7 }, source: 'level.objects', authoritative: true,
  items: [{ objectId: 90211, displayName: 'a newer native rock', semanticKind: 'object', semanticKnown: true, semanticName: 'rock' }],
});
const newerAuthoritative = effectOf(result, 'ground-pile-snapshot');
assert(newerAuthoritative, 'a truly newer native revision supersedes renderer observations');
assert.equal(newerAuthoritative.snapshot.revision, 5);
assert.equal(newerAuthoritative.snapshot.authoritativeRevision, 2);
assert.equal(newerAuthoritative.snapshot.items[0].objectId, 90211);

result = view.process({ name: 'shim_clear_nhwindow', window: 1 });
assert(effectOf(result, 'ground-pile-snapshot'), 'map clear should publish cleared ground-pile state');
assert.equal(Ground.groundPileAt(view.state.groundPiles, { x: 21, y: 7 }), null, 'map clear/level redraw scopes away stale coordinate-only ground piles');

result = view.process({
  name: 'shim_print_glyph',
  window: 1,
  x: 20,
  y: 7,
  char: '.',
  glyph: 3992,
  objectLayerGlyph: 2101,
  objectLayerChar: 63,
  objectLayerSemanticKind: 'object',
  objectLayerSemanticName: 'scroll of genocide',
  objectLayerSemanticAppearance: 'scroll labeled ELBIB YLOH',
  objectLayerSemanticKnown: false,
  objectLayerActionAffordances: ['pickup'],
  groundPileSnapshotAuthoritative: true,
});
assert.equal(effectOf(result, 'ground-pile-snapshot'), undefined, 'authoritative C/shim ground snapshots suppress object-layer inference for the same print_glyph');

result = view.process({
  name: 'shim_ground_pile_snapshot',
  window: 1,
  x: 20,
  y: 7,
  revision: 3,
  coord: { x: 20, y: 7 },
  source: 'level.objects',
  authoritative: true,
  items: [
    { displayName: 'a scroll labeled ELBIB YLOH', glyphChar: 63, semanticKind: 'object', semanticKnown: false, semanticName: 'scroll of genocide', semanticAppearance: 'scroll labeled ELBIB YLOH', actionAffordances: ['pickup'] },
    { displayName: 'a food ration', glyphChar: 37, semanticKind: 'object', semanticKnown: true, semanticName: 'food ration', actionAffordances: ['pickup'] },
    { displayName: 'a locked-looking chest', glyphChar: 40, semanticKind: 'object', semanticKnown: true, semanticName: 'chest', actionAffordances: ['container'] },
  ],
});
const authoritativeEffect = effectOf(result, 'ground-pile-snapshot');
assert(authoritativeEffect, 'full C/shim level.objects ground snapshot should be accepted by shared reducer');
assert.equal(authoritativeEffect.snapshot.items.length, 3, 'authoritative snapshot preserves the full public object list, not only the visible top object');
assert.equal(authoritativeEffect.snapshot.items[0].semanticName, undefined, 'hidden identity from authoritative C/shim ground list is still redacted');
assert(authoritativeEffect.snapshot.items.some((item) => item.displayName === 'a food ration'), JSON.stringify(authoritativeEffect.snapshot.items));
assert.deepEqual(authoritativeEffect.snapshot.items.find((item) => /chest/.test(item.displayName)).actionAffordances, ['container'], 'ground object snapshots must not leak locked/trapped container state as public action hints');

const staleEvent = Ground.createGroundPileSnapshotEvent({ revision: 0, coord: { x: 20, y: 7 }, items: [{ text: 'a stale rock' }] }, { sequence: 2, source: { layer: 'test' } });
result = view.process(staleEvent);
const staleEffect = effectOf(result, 'ground-pile-snapshot-rejected');
assert(staleEffect?.stale, 'lower-revision public ground evidence is rejected by shared reducer');
assert.equal(Ground.groundPileAt(view.state.groundPiles, { x: 20, y: 7 }).items.length, 3);

const publicEvent = Ground.createGroundPileSnapshotEvent({
  revision: 5,
  coord: { x: 20, y: 7 },
  items: [{ text: 'a food ration', semanticKnown: true, semanticName: 'food ration' }],
}, { sequence: 3, source: { layer: 'test' } });
result = view.process(publicEvent);
const publicEffect = effectOf(result, 'ground-pile-snapshot');
assert(publicEffect, 'explicit public ground.pile.snapshot events are accepted by shared reducer');
assert.equal(publicEffect.delta.changed, true);
assert.equal(publicEffect.delta.fromRevision, 3);
assert.equal(publicEffect.delta.toRevision, 5);
assert(publicEffect.delta.removed.some((item) => /ELBIB YLOH/.test(item.displayName)), JSON.stringify(publicEffect.delta));
assert(
  publicEffect.delta.added.some((item) => /food ration/.test(item.displayName)) || publicEffect.delta.updated.some((item) => /food ration/.test(item.after?.displayName || '')),
  JSON.stringify(publicEffect.delta)
);

let transfers = Transfer.emptyState();
transfers = Transfer.openSession(transfers, {
  sessionId: 'shared-ground-session',
  kind: 'ground-pickup',
  groundCoord: { x: 20, y: 7 },
  leftRows: [{ selector: 'a', text: 'a - a food ration' }],
  rightRows: [],
  loadedSides: { left: true, right: true },
}).state;
transfers = Transfer.beginTransfer(transfers, {
  transferId: 'take-food-ration',
  sessionId: 'shared-ground-session',
  groundCoord: { x: 20, y: 7 },
  direction: 'ground-to-inventory',
  sourceSide: 'left',
  targetSide: 'right',
  selector: 'a',
  itemName: 'a food ration',
}).state;
const afterPickupPile = { revision: 6, coord: { x: 20, y: 7 }, items: [] };
const pickupDelta = Ground.groundPileDelta(publicEffect.snapshot, afterPickupPile);
const completed = Transfer.completeTransfer(transfers, { transferId: 'take-food-ration' }, {
  afterPanes: { left: [], right: [{ selector: 'a', text: 'a - a food ration' }] },
  groundPileDelta: pickupDelta,
});
assert.equal(completed.transfer.result.publicEvidence.groundPile, true);
assert.equal(completed.transfer.result.delta.groundPile.toRevision, 6);
assert.equal(completed.transfer.result.delta.canonicalChanged, true);

console.log('game-view-ground-snapshot-test PASS');
