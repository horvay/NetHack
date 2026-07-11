const assert = require('node:assert/strict');
const GameViewState = require('../src/shared/game-view-state');
const Container = require('../src/shared/container-contents-snapshot-adapter');
const Transfer = require('../src/shared/transfer-transaction-model');
const UiProtocol = require('../src/shared/ui-protocol-v2');
const Harness = require('../src/shared/test-harness');

const effectOf = Harness.effectOf;
const containerEvents = Harness.createUiEventFactory({ prefix: 'raw-container' });
function sessionEvent(type, sessionId, container = { publicId: 'large-box', displayName: 'large box' }, sequence = 1) {
  return Container.createContainerSessionEvent(type, { sessionId, container }, { sequence, source: { layer: 'test' } });
}
function rawSessionEvent(type, sessionId, container = { publicId: 'large-box', displayName: 'large box' }, sequence = 1) {
  const payload = type === 'container.session.closed' ? { sessionId, container, reason: 'closed' } : { sessionId, container };
  return containerEvents.envelope(type, payload, { sequence, eventId: `evt-raw-${type}-${sessionId}-${sequence}` });
}
function snapshotEvent(sessionId, revision, items, sequence = revision + 10, container = { publicId: 'large-box', displayName: 'large box' }) {
  return Container.createContainerContentsSnapshotEvent({ sessionId, revision, container, items }, { sequence, source: { layer: 'test' } });
}

const view = GameViewState.createGameViewState();
let result = view.process(sessionEvent('container.session.opened', 'loot-session-1'));
assert(effectOf(result, 'container-session-opened'), 'container session open should be reduced by shared game-view-state');
assert.equal(view.state.containerContents.sessionsById.get('loot-session-1').status, 'active');

result = view.process(snapshotEvent('loot-session-1', 1, [
  { selector: 'a', text: 'a - an uncursed scroll labeled ELBIB YLOH', glyphChar: 63, semanticKind: 'object', semanticName: 'scroll of genocide', semanticAppearance: 'scroll labeled ELBIB YLOH', semanticKnown: false },
  { selector: 'b', text: 'b - a food ration', glyphChar: 37, semanticKind: 'object', semanticName: 'food ration', semanticKnown: true },
]));
let accepted = effectOf(result, 'container-contents-snapshot');
assert(accepted, 'public container.contents.snapshot should be accepted for an active session');
assert.equal(accepted.snapshot.sessionId, 'loot-session-1');
assert.equal(accepted.snapshot.items.length, 2);
assert.equal(accepted.snapshot.items[0].displayName, 'an uncursed scroll labeled ELBIB YLOH');
assert.equal(accepted.snapshot.items[0].semanticName, undefined, 'unknown container row identity must be redacted');
assert.equal(accepted.snapshot.items[0].known.identity, false);
assert.equal(accepted.snapshot.items[1].semanticName, 'food ration', 'known public identity may be retained');
assert.equal(accepted.delta.changed, true);
assert.equal(accepted.delta.added.length, 2);

result = view.process(snapshotEvent('loot-session-1', 0, [{ text: 'a - a stale rock' }], 12));
let rejected = effectOf(result, 'container-contents-snapshot-rejected');
assert(rejected?.stale, 'lower-revision container snapshot should be rejected with stale evidence');
assert.equal(Container.containerContentsAt(view.state.containerContents, 'loot-session-1').items.length, 2, 'stale lower revision must not update state');

result = view.process(snapshotEvent('loot-session-1', 1, [
  { selector: 'a', text: 'a - an uncursed scroll labeled ELBIB YLOH', glyphChar: 63, semanticKind: 'object', semanticName: 'scroll of genocide', semanticAppearance: 'scroll labeled ELBIB YLOH', semanticKnown: false },
  { selector: 'b', text: 'b - a food ration', glyphChar: 37, semanticKind: 'object', semanticName: 'food ration', semanticKnown: true },
], 120));
accepted = effectOf(result, 'container-contents-snapshot');
assert.equal(accepted.delta.changed, false, 'same-revision identical duplicate should be idempotent and not mutate state');

result = view.process(snapshotEvent('loot-session-1', 1, [{ text: 'a - same revision but different gem' }], 121));
rejected = effectOf(result, 'container-contents-snapshot-rejected');
assert(/conflicting container contents snapshot revision 1/.test(rejected?.reason || ''), 'same-revision conflicting payload should be rejected, not mutate state');
assert.equal(Container.containerContentsAt(view.state.containerContents, 'loot-session-1').items.length, 2);

result = view.process(snapshotEvent('loot-session-1', 2, [{ text: 'a - wrong-box item' }], 122, { publicId: 'wrong-box', displayName: 'wrong box' }));
rejected = effectOf(result, 'container-contents-snapshot-rejected');
assert(/container identity does not match session/.test(rejected?.reason || ''), 'snapshot container identity must match the active session identity');
assert.equal(Container.containerContentsAt(view.state.containerContents, 'loot-session-1').items.length, 2);

result = view.process(rawSessionEvent('container.session.opened', 'object-id-session', { publicId: 'object-id-box', displayName: 'large box', objectId: 100 }, 123));
assert.equal(view.state.containerContents.sessionsById.get('object-id-session').container.objectId, 100, 'public container objectId should survive protocol normalization into session identity');
result = view.process(snapshotEvent('object-id-session', 1, [{ text: 'a - a food ration' }], 124, { publicId: 'object-id-box', displayName: 'large box', objectId: 200 }));
rejected = effectOf(result, 'container-contents-snapshot-rejected');
assert(/container identity does not match session/.test(rejected?.reason || ''), 'same publicId but different public objectId must be rejected');
result = view.process(snapshotEvent('object-id-session', 1, [{ text: 'a - a food ration' }], 125, { publicId: 'object-id-box', displayName: 'large box', objectId: 100 }));
accepted = effectOf(result, 'container-contents-snapshot');
assert.equal(accepted.snapshot.container.objectId, 100, 'public container objectId should survive into accepted snapshot identity');

const forbidden = snapshotEvent('loot-session-1', 2, [{ text: 'a - a scroll' }], 13);
forbidden.payload.items[0].trapped = true;
let checked = UiProtocol.validateEventEnvelope(forbidden);
assert(!checked.ok, 'container contents protocol rejects private/spoiler public item fields');
assert(checked.errors.some((error) => /trapped/.test(error)), checked.errors.join('\n'));
result = view.process(forbidden);
rejected = effectOf(result, 'container-contents-snapshot-rejected');
assert(rejected?.errors?.some((error) => /trapped/.test(error)), 'shared reducer surfaces protocol validation evidence');

result = view.process(snapshotEvent('loot-session-1', 2, [
  { selector: 'a', text: 'a - a food ration', semanticKnown: true, semanticName: 'food ration' },
  { selector: 'b', text: 'b - a food ration', semanticKnown: true, semanticName: 'food ration' },
], 14));
accepted = effectOf(result, 'container-contents-snapshot');
assert.equal(accepted.delta.added.length, 1, 'duplicate rows are treated as a multiset: one food ration added');
assert.equal(accepted.delta.removed.length, 1, 'duplicate rows are treated as a multiset: unknown scroll removed');
assert.equal(accepted.snapshot.items.length, 2);

result = view.process(sessionEvent('container.session.closed', 'loot-session-1', { publicId: 'large-box', displayName: 'large box' }, 15));
assert(effectOf(result, 'container-session-closed'), 'container session close should be reduced');
result = view.process(snapshotEvent('loot-session-1', 3, [{ text: 'a - a post-close gem' }], 16));
rejected = effectOf(result, 'container-contents-snapshot-rejected');
assert(/not active/i.test(rejected?.reason || ''), 'snapshot from a closed session must be rejected');
assert.equal(Container.containerContentsAt(view.state.containerContents, 'loot-session-1').revision, 2, 'closed-session snapshot must not update active state');

result = view.process(sessionEvent('container.session.opened', 'loot-session-2', { publicId: 'large-box', displayName: 'large box' }, 17));
assert.equal(view.state.containerContents.sessionsById.get('loot-session-2').status, 'active');
result = view.process(sessionEvent('container.session.opened', 'loot-session-3', { publicId: 'large-box', displayName: 'large box' }, 18));
assert.equal(view.state.containerContents.sessionsById.get('loot-session-2').status, 'replaced', 'new same-container session replaces prior session');
result = view.process(snapshotEvent('loot-session-2', 1, [{ text: 'a - stale replaced-session row' }], 19));
rejected = effectOf(result, 'container-contents-snapshot-rejected');
assert(/not active|replaced/i.test(rejected?.reason || ''), 'snapshot from replaced session must be rejected');

result = view.process(snapshotEvent('loot-session-3', 1, [{ text: 'a - a food ration', semanticKnown: true, semanticName: 'food ration' }], 20));
accepted = effectOf(result, 'container-contents-snapshot');
assert(accepted, 'replacement active session accepts its own snapshot');

let transfers = Transfer.emptyState();
transfers = Transfer.openSession(transfers, {
  sessionId: 'loot-session-3',
  kind: 'container',
  container: { publicId: 'large-box', displayName: 'large box' },
  leftRows: [{ selector: 'a', text: 'a food ration' }],
  rightRows: [],
  loadedSides: { left: true, right: true },
}).state;
transfers = Transfer.beginTransfer(transfers, {
  transferId: 'take-ration-from-box',
  sessionId: 'loot-session-3',
  container: { publicId: 'large-box', displayName: 'large box' },
  direction: 'container-to-inventory',
  sourceSide: 'left',
  targetSide: 'right',
  selector: 'a',
  itemName: 'a food ration',
}).state;
const before = Container.containerContentsAt(view.state.containerContents, 'loot-session-3');
result = view.process(snapshotEvent('loot-session-3', 2, [], 21));
accepted = effectOf(result, 'container-contents-snapshot');
const containerContentsDelta = accepted.delta || Container.containerContentsDelta(before, accepted.snapshot);
assert.equal(containerContentsDelta.removed.length, 1, 'transfer completion delta records removed container row');
let completed = Transfer.completeTransfer(transfers, { transferId: 'take-ration-from-box' }, {
  afterPanes: { left: [], right: [{ selector: 'a', text: 'a food ration' }] },
  containerContentsDelta,
});
assert.equal(completed.transfer.result.publicEvidence.containerContents, true);
assert.equal(completed.transfer.result.delta.containerContents.toRevision, 2);
assert.equal(completed.transfer.result.delta.canonicalChanged, true);

let attachedState = Transfer.beginTransfer(Transfer.openSession(Transfer.emptyState(), { sessionId: 'loot-session-3', kind: 'container', container: { publicId: 'large-box', displayName: 'large box' } }).state, {
  transferId: 'take-ration-delayed', sessionId: 'loot-session-3', container: { publicId: 'large-box', displayName: 'large box' }, direction: 'container-to-inventory', sourceSide: 'left', targetSide: 'right', selector: 'b', itemName: 'a food ration',
}).state;
const attached = Transfer.attachContainerContentsDelta(attachedState, { transferId: 'take-ration-delayed', sessionId: 'loot-session-3', container: { publicId: 'large-box', displayName: 'large box' } }, containerContentsDelta);
assert.equal(attached.transfer.result.publicEvidence.containerContents, true, 'container deltas can attach before/after completion like ground deltas');
const staleDelayedEvidence = Transfer.attachContainerContentsDelta(attachedState, { transferId: 'take-ration-delayed', sessionId: 'loot-session-3', container: { publicId: 'large-box', displayName: 'large box' } }, { ...containerContentsDelta, sessionId: 'unrelated-session' });
assert.equal(staleDelayedEvidence.rejected.reason, 'container contents delta session id does not match transfer', 'delayed evidence from an unrelated container session is rejected');
const wrongContainerEvidence = Transfer.attachContainerContentsDelta(attachedState, { transferId: 'take-ration-delayed', sessionId: 'loot-session-3', container: { publicId: 'large-box', displayName: 'large box' } }, { ...containerContentsDelta, container: { publicId: 'wrong-box', displayName: 'wrong box' } });
assert.equal(wrongContainerEvidence.rejected.reason, 'container contents delta container identity does not match transfer', 'delayed evidence from a different container identity is rejected');
const wrongKind = Transfer.beginTransfer(Transfer.openSession(Transfer.emptyState(), { sessionId: 'ground-session', kind: 'ground-pickup' }).state, {
  transferId: 'ground-transfer', sessionId: 'ground-session', direction: 'ground-to-inventory', sourceSide: 'left', targetSide: 'right', selector: 'a', itemName: 'a food ration',
}).state;
const rejectedAttach = Transfer.attachContainerContentsDelta(wrongKind, { transferId: 'ground-transfer' }, containerContentsDelta);
assert.equal(rejectedAttach.effect.type, 'transfer-transaction-rejected', 'container content deltas keep transfer direction ownership protections');

console.log('game-view-container-contents-snapshot-test PASS');
