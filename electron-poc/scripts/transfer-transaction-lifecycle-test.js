const assert = require('node:assert/strict');
const Transfer = require('../src/shared/transfer-transaction-model');

function row(selector, text) { return { selector, text }; }

let state = Transfer.emptyState();
let opened = Transfer.openSession(state, {
  sessionId: 'ground-session-1',
  kind: 'ground-pickup',
  prompt: 'Pick up what?',
  ownerRequestId: 'req-ground-pickup',
  groundCoord: { x: 10, y: 12 },
  leftRows: [row('a', 'a - a food ration'), row('b', 'b - a scroll labeled READ ME')],
  rightRows: [row('c', 'c - a +0 dagger')],
  loadedSides: { left: true, right: true },
});
state = opened.state;
assert.equal(opened.session.sessionId, 'ground-session-1');
assert.equal(state.activeSessionId, 'ground-session-1');

let begun = Transfer.beginTransfer(state, {
  transferId: 'ground-pickup-scroll',
  sessionId: 'ground-session-1',
  groundCoord: { x: 10, y: 12 },
  direction: 'ground-to-inventory',
  sourceSide: 'left',
  targetSide: 'right',
  selector: 'b',
  itemName: 'scroll labeled READ ME',
  expectedRequestId: 'req-ground-pickup',
});
state = begun.state;
assert.equal(begun.transfer.status, 'pending');
assert.equal(begun.transfer.expectedRequestId, 'req-ground-pickup');
assert.equal(state.activeTransferId, 'ground-pickup-scroll');

let confirmed = Transfer.noteConfirmation(state, { transferId: 'ground-pickup-scroll', kind: 'bridge_menu_answer', requestId: 'req-ground-pickup' });
state = confirmed.state;
assert.equal(confirmed.transfer.confirmations[0].requestId, 'req-ground-pickup');

let updated = Transfer.updateSession(state, 'ground-session-1', {
  leftRows: [row('a', 'a - a food ration')],
  rightRows: [row('c', 'c - a +0 dagger'), row('b', 'b - a scroll labeled READ ME')],
});
state = updated.state;
let completed = Transfer.completeTransfer(state, { transferId: 'ground-pickup-scroll' }, { afterPanes: updated.session.panes });
state = completed.state;
assert.equal(completed.transfer.status, 'success');
assert.equal(completed.transfer.result.delta.changed, true);
assert.equal(completed.transfer.result.delta.canonicalChanged, true, 'visible pane deltas remain canonical transfer changes even without ground-pile evidence');
assert.equal(completed.transfer.result.publicEvidence.groundPile, false);
assert.equal(completed.transfer.result.groundPileDelta, null);
assert.equal(completed.transfer.result.delta.before.left.length, 2);
assert.equal(completed.transfer.result.delta.after.right.length, 2);
assert.equal(state.activeTransferId, undefined);

const matchingGroundDelta = { coord: { x: 10, y: 12 }, fromRevision: 1, toRevision: 2, added: [], removed: [{ displayName: 'scroll labeled READ ME' }], updated: [], changedCount: 1, publicEvidence: true, changed: true };
let delayedGroundAttach = Transfer.attachGroundPileDelta(state, { transferId: 'ground-pickup-scroll', sessionId: 'ground-session-1' }, matchingGroundDelta);
state = delayedGroundAttach.state;
assert.equal(delayedGroundAttach.transfer.result.publicEvidence.groundPile, true, 'same-session delayed ground evidence attaches after command completion');
const duplicateGroundAttach = Transfer.attachGroundPileDelta(state, { transferId: 'ground-pickup-scroll' }, { ...matchingGroundDelta, toRevision: 3 });
assert.equal(duplicateGroundAttach.rejected.reason, 'ground pile delta already attached to transfer');
const unrelatedGroundSession = Transfer.openSession(state, { sessionId: 'ground-session-2', kind: 'ground-pickup', groundCoord: { x: 1, y: 1 } }).state;
const unrelatedGroundTransfer = Transfer.beginTransfer(unrelatedGroundSession, { transferId: 'ground-unrelated', sessionId: 'ground-session-2', groundCoord: { x: 1, y: 1 }, direction: 'inventory-to-ground', sourceSide: 'right', targetSide: 'left', selector: 'c', itemName: 'a rock' }).state;
const unrelatedGroundCompleted = Transfer.completeTransfer(unrelatedGroundTransfer, { transferId: 'ground-unrelated' }, { afterPanes: { left: [], right: [] } }).state;
const rejectedWrongGroundCoord = Transfer.attachGroundPileDelta(unrelatedGroundCompleted, { transferId: 'ground-unrelated', sessionId: 'ground-session-2' }, matchingGroundDelta);
assert.equal(rejectedWrongGroundCoord.rejected.reason, 'ground pile delta coordinate does not match transfer evidence identity', 'unrelated delayed ground evidence is rejected with diagnostics');

const duplicateCompletion = Transfer.completeTransfer(state, { transferId: 'ground-pickup-scroll' });
assert.equal(duplicateCompletion.rejected.reason, 'transfer already completed');
assert.equal(duplicateCompletion.state.lastRejected.transferId, 'ground-pickup-scroll');
state = duplicateCompletion.state;

let container = Transfer.openSession(state, {
  sessionId: 'container-session-1',
  kind: 'container',
  prompt: 'Do what with the large box?',
  ownerRequestId: 'req-container-action',
  container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 },
  leftRows: [row('a', 'a - an uncursed food ration'), row('b', 'b - a +0 dagger')],
  rightRows: [row('c', 'c - an uncursed scroll of identify')],
  loadedSides: { left: true, right: true },
});
state = container.state;
let putIn = Transfer.beginTransfer(state, {
  transferId: 'container-putin-scroll',
  sessionId: 'container-session-1',
  container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 },
  direction: 'inventory-to-container',
  sourceSide: 'right',
  targetSide: 'left',
  selector: 'c',
  itemName: 'scroll of identify',
  expectedRequestId: 'req-container-action',
});
state = putIn.state;
assert.equal(putIn.transfer.expectedRequestId, 'req-container-action');
const completedPutIn = Transfer.completeTransfer(state, { transferId: 'container-putin-scroll' }, { afterPanes: { left: [row('a', 'a - an uncursed food ration'), row('b', 'b - a +0 dagger'), row('c', 'c - an uncursed scroll of identify')], right: [] } });
const matchingContainerDelta = { sessionId: 'container-session-1', container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 }, fromRevision: 1, toRevision: 2, added: [{ displayName: 'scroll of identify' }], removed: [], updated: [], changedCount: 1, publicEvidence: true, changed: true };
const delayedContainerAttach = Transfer.attachContainerContentsDelta(completedPutIn.state, { transferId: 'container-putin-scroll', sessionId: 'container-session-1', container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 } }, matchingContainerDelta);
assert.equal(delayedContainerAttach.transfer.result.publicEvidence.containerContents, true, 'same-session delayed container evidence attaches after command completion');
assert.equal(delayedContainerAttach.transfer.result.delta.changed, true, 'renderer pane delta remains separate from public container evidence');
const rejectedWrongContainerSession = Transfer.attachContainerContentsDelta(completedPutIn.state, { transferId: 'container-putin-scroll', sessionId: 'other-session', container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 } }, matchingContainerDelta);
assert.equal(rejectedWrongContainerSession.rejected.reason, 'container contents delta session id does not match transfer');
const rejectedWrongContainerIdentity = Transfer.attachContainerContentsDelta(completedPutIn.state, { transferId: 'container-putin-scroll', sessionId: 'container-session-1', container: { publicId: 'other-box', displayName: 'other box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 } }, matchingContainerDelta);
assert.equal(rejectedWrongContainerIdentity.rejected.reason, 'container contents delta event container identity does not match transfer');
state = putIn.state;
const freshCommand = Transfer.beginTransfer(state, {
  transferId: 'container-open-fresh-command',
  sessionId: 'container-session-1',
  direction: 'container-to-inventory',
  sourceSide: 'left',
  targetSide: 'right',
  selector: 'a',
  itemName: 'food ration',
  expectedRequestId: '',
});
assert.equal(freshCommand.transfer.expectedRequestId, '', 'explicit empty expectedRequestId is preserved for fresh #loot/comma commands');
const duplicateActive = freshCommand.state;
state = putIn.state;
const stale = Transfer.rejectFollowup(state, { transferId: 'container-putin-scroll', expectedRequestId: 'old-req', requestId: 'old-req' }, 'expected prompt request id does not match active prompt');
state = stale.state;
assert.equal(stale.transfer.status, 'rejected');
assert.equal(state.activeTransferId, undefined);
assert.equal(state.sessionsById.get('container-session-1').status, 'active', 'stale transfer rejection does not close the transfer panel session');
assert.equal(state.sessionsById.get('container-session-1').panes.left.length, 2, 'stale rejection does not roll back stable visible panes');
assert.notEqual(state.lastCompleted?.transferId, 'container-putin-scroll', 'rejected stale follow-up is not reported as a completed transfer');
const closedWithPending = Transfer.closeSession(duplicateActive, { sessionId: 'container-session-1' }, 'panel closed by player');
assert.equal(closedWithPending.state.transfersById.get('container-open-fresh-command').status, 'cancelled', 'closing a session cancels pending transfers instead of orphaning them');

let empty = Transfer.openSession(state, {
  sessionId: 'empty-container-session',
  kind: 'container',
  prompt: 'The bag is empty. Do what with it?',
  leftRows: [],
  rightRows: [row('a', 'a - a +0 mace'), row('b', 'b - a robe')],
  loadedSides: { left: true, right: true },
});
state = empty.state;
assert.equal(empty.session.panes.left.length, 0);
assert.equal(empty.session.loadedSides.left, true);
assert.equal(empty.session.loadedSides.right, true);

const cancelledStart = Transfer.beginTransfer(state, {
  transferId: 'cancelled-container-takeout',
  sessionId: 'empty-container-session',
  direction: 'container-to-inventory',
  sourceSide: 'left',
  targetSide: 'right',
  selector: 'z',
  itemName: 'missing item',
});
state = cancelledStart.state;
const cancelled = Transfer.completeTransfer(state, { transferId: 'cancelled-container-takeout', status: 'cancelled', reason: 'cancelled by player' }, { afterPanes: empty.session.panes });
assert.equal(cancelled.transfer.status, 'cancelled');
assert.equal(cancelled.transfer.result.reason, 'cancelled by player');

console.log('transfer-transaction-lifecycle-test PASS');
