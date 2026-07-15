const assert = require('node:assert/strict');
const GameViewState = require('../src/shared/game-view-state');
const UiProtocol = require('../src/shared/ui-protocol-v2');
const Harness = require('../src/shared/test-harness');

const transferEvents = Harness.createUiEventFactory({ prefix: 'transfer' });
const envelope = transferEvents.envelope;
const event = transferEvents.valid;
const effectOf = Harness.effectOf;
function row(selector, text) { return { selector, text, semanticKnown: false, known: { identity: false, appearance: true } }; }
function publicAppearanceItem(displayName) { return { displayName, semanticKnown: false, known: { identity: false, appearance: true } }; }

const view = GameViewState.createGameViewState();
let result = view.process(event('transfer.session.opened', {
  sessionId: 'shared-ground-session',
  kind: 'ground-pickup',
  prompt: 'Pick up what?',
  ownerRequestId: 'req-ground',
  groundCoord: { x: 10, y: 12 },
  leftRows: [row('a', 'a - a food ration'), row('b', 'b - a scroll labeled READ ME')],
  rightRows: [row('c', 'c - a +0 dagger')],
  loadedSides: { left: true, right: true },
}));
assert(effectOf(result, 'transfer-session-opened'), 'game-view-state should reduce transfer.session.opened');
assert.equal(view.snapshot().transferTransactions.activeSessionId, 'shared-ground-session');
assert.equal(view.snapshot().transferTransactions.sessionsById.get('shared-ground-session').evidenceIdentity.coord.x, 10);

result = view.process(event('transfer.begun', {
  transferId: 'take-scroll',
  sessionId: 'shared-ground-session',
  groundCoord: { x: 10, y: 12 },
  direction: 'ground-to-inventory',
  sourceSide: 'left',
  targetSide: 'right',
  selector: 'b',
  itemName: 'scroll labeled READ ME',
  expectedRequestId: 'req-ground',
  beforePanes: { left: [row('a', 'a - a food ration'), row('b', 'b - a scroll labeled READ ME')], right: [row('c', 'c - a +0 dagger')] },
}));
assert.equal(effectOf(result, 'transfer-transaction-started').transfer.status, 'pending');
assert.equal(view.snapshot().transferTransactions.activeTransferId, 'take-scroll');

result = view.process(event('transfer.confirmed', { transferId: 'take-scroll', kind: 'bridge_menu_answer', requestId: 'req-ground', accepted: true }));
assert.equal(effectOf(result, 'transfer-transaction-confirmed').transfer.confirmations[0].requestId, 'req-ground');

result = view.process(event('transfer.session.updated', {
  sessionId: 'shared-ground-session',
  kind: 'ground-pickup',
  groundCoord: { x: 10, y: 12 },
  leftRows: [row('a', 'a - a food ration')],
  rightRows: [row('c', 'c - a +0 dagger'), row('b', 'b - a scroll labeled READ ME')],
  loadedSides: { left: true, right: true },
  feedback: 'ground pickup refreshed',
}));
assert.equal(effectOf(result, 'transfer-session-updated').session.panes.right.length, 2);
let paneMove = GameViewState.transferPanelOptimisticMoveState(view.snapshot(), {
  kind: 'ground-pickup',
  sessionId: 'shared-ground-session',
  transferId: 'take-scroll',
  groundCoord: { x: 10, y: 12 },
  sourceSide: 'right',
  selector: 'b',
  itemName: 'scroll labeled READ ME',
  loadedSides: { left: true, right: true },
  fallbackPanes: { left: [row('z', 'z - stale fallback')], right: [] },
});
assert.equal(paneMove.ok, true, 'shared optimistic pane helper builds a move patch from session panes');
assert.equal(paneMove.source, 'shared-session-panes', 'shared optimistic pane helper prefers shared session panes over renderer fallback rows');
assert.equal(paneMove.direction, 'inventory-to-ground');
assert.equal(paneMove.panesAfter.left.some((item) => item.selector === 'b'), true, 'shared helper moves row into target pane patch');
assert.equal(paneMove.panesAfter.right.some((item) => item.selector === 'b'), false, 'shared helper removes row from source pane patch');
assert.match(paneMove.sessionPatch.feedback, /shared transfer state/, 'shared helper owns optimistic feedback copy');

result = view.process(event('transfer.completed', {
  transferId: 'take-scroll',
  status: 'success',
  afterPanes: { left: [row('a', 'a - a food ration')], right: [row('c', 'c - a +0 dagger'), row('b', 'b - a scroll labeled READ ME')] },
}));
let completed = effectOf(result, 'transfer-transaction-completed');
assert.equal(completed.transfer.result.publicEvidence.groundPile, false, 'renderer pane delta alone is not public ground evidence');
assert.equal(completed.transfer.result.delta.changed, true, 'renderer pane delta remains available during migration');
assert.equal(view.snapshot().transferTransactions.activeTransferId, undefined);

let invalidEvidence = envelope('transfer.ground-pile-evidence.attached', { transferId: 'take-scroll', sessionId: 'shared-ground-session', coord: { x: 10, y: 12 } });
let checkedInvalid = UiProtocol.validateEventEnvelope(invalidEvidence);
assert.equal(checkedInvalid.ok, false, 'ground evidence attach protocol requires a groundPileDelta');
assert(checkedInvalid.errors.some((error) => /groundPileDelta/.test(error)), checkedInvalid.errors.join('\n'));
invalidEvidence = envelope('transfer.ground-pile-evidence.attached', { transferId: 'take-scroll', sessionId: 'shared-ground-session', coord: { x: 10, y: 12 }, container: { publicId: 'box', displayName: 'box', semanticKnown: false, known: { identity: false, appearance: true } }, groundPileDelta: { coord: { x: 10, y: 12 }, removed: [publicAppearanceItem('scroll labeled READ ME')], publicEvidence: true, changed: true } });
checkedInvalid = UiProtocol.validateEventEnvelope(invalidEvidence);
assert.equal(checkedInvalid.ok, false, 'ground evidence attach protocol rejects top-level container identity fields');
invalidEvidence = envelope('transfer.ground-pile-evidence.attached', { transferId: 'take-scroll', sessionId: 'shared-ground-session', coord: { x: 10, y: 12 }, groundPileDelta: { coord: { x: 10, y: 12 }, container: { publicId: 'box', displayName: 'box', semanticKnown: false, known: { identity: false, appearance: true } }, removed: [publicAppearanceItem('scroll labeled READ ME')], publicEvidence: true, changed: true } });
checkedInvalid = UiProtocol.validateEventEnvelope(invalidEvidence);
assert.equal(checkedInvalid.ok, false, 'ground evidence attach protocol rejects nested container identity fields');

result = view.process(event('transfer.ground-pile-evidence.attached', {
  transferId: 'take-scroll',
  sessionId: 'shared-ground-session',
  coord: { x: 10, y: 12 },
  groundPileDelta: { fromRevision: 1, toRevision: 2, added: [], removed: [publicAppearanceItem('scroll labeled READ ME')], updated: [], changedCount: 1, publicEvidence: true, changed: true },
}));
assert.equal(effectOf(result, 'transfer-transaction-rejected').reason, 'ground pile delta coordinate is missing', 'ground evidence fails closed when delta identity is omitted');

result = view.process(event('transfer.ground-pile-evidence.attached', {
  transferId: 'take-scroll',
  sessionId: 'shared-ground-session',
  coord: { x: 99, y: 99 },
  groundPileDelta: { coord: { x: 10, y: 12 }, fromRevision: 1, toRevision: 2, added: [], removed: [publicAppearanceItem('scroll labeled READ ME')], updated: [], changedCount: 1, publicEvidence: true, changed: true },
}));
assert.equal(effectOf(result, 'transfer-transaction-rejected').reason, 'ground pile delta event coordinate does not match transfer evidence identity', 'ground evidence fails closed when top-level identity conflicts with stable transfer identity');

result = view.process(event('transfer.ground-pile-evidence.attached', {
  transferId: 'take-scroll',
  sessionId: 'shared-ground-session',
  coord: { x: 99, y: 99 },
  groundPileDelta: { coord: { x: 99, y: 99 }, fromRevision: 1, toRevision: 2, added: [], removed: [publicAppearanceItem('scroll labeled READ ME')], updated: [], changedCount: 1, publicEvidence: true, changed: true },
}));
assert.equal(effectOf(result, 'transfer-transaction-rejected').reason, 'ground pile delta event coordinate does not match transfer evidence identity', 'ground evidence fails closed when event and delta identities are both wrong');

const matchingGroundDelta = { coord: { x: 10, y: 12 }, fromRevision: 1, toRevision: 2, added: [], removed: [publicAppearanceItem('scroll labeled READ ME')], updated: [], changedCount: 1, publicEvidence: true, changed: true };
result = view.process(event('transfer.ground-pile-evidence.attached', {
  transferId: 'take-scroll',
  sessionId: 'shared-ground-session',
  coord: { x: 10, y: 12 },
  groundPileDelta: matchingGroundDelta,
}));
let attached = effectOf(result, 'transfer-transaction-ground-pile-delta-attached');
assert.equal(attached.transfer.result.publicEvidence.groundPile, true, 'same-session delayed public ground evidence attaches under game-view-state');
assert.equal(attached.transfer.result.publicEvidenceAttachedAfterCompletion, true);
assert.equal(attached.transfer.result.delta.rendererPaneDeltaOnly, true, 'public evidence flag remains separate from renderer pane delta history');

result = view.process(event('transfer.ground-pile-evidence.attached', {
  transferId: 'take-scroll',
  sessionId: 'shared-ground-session',
  coord: { x: 99, y: 12 },
  groundPileDelta: { ...matchingGroundDelta, coord: { x: 99, y: 12 } },
}));
assert.equal(effectOf(result, 'transfer-transaction-rejected').reason, 'ground pile delta already attached to transfer', 'duplicate delayed evidence is rejected');

result = view.process(event('transfer.session.opened', {
  sessionId: 'container-session',
  kind: 'container',
  prompt: 'Do what with the large box?',
  ownerRequestId: 'req-container',
  container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 },
  leftRows: [row('a', 'a - an uncursed food ration')],
  rightRows: [row('b', 'b - a scroll of identify')],
  loadedSides: { left: true, right: true },
}));
assert.equal(effectOf(result, 'transfer-session-opened').session.evidenceIdentity.container.objectId, 42);

result = view.process(event('transfer.begun', {
  transferId: 'put-scroll',
  sessionId: 'container-session',
  container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 },
  direction: 'inventory-to-container',
  sourceSide: 'right',
  targetSide: 'left',
  selector: 'b',
  itemName: 'scroll of identify',
  expectedRequestId: 'req-container',
  beforePanes: { left: [row('a', 'a - an uncursed food ration')], right: [row('b', 'b - a scroll of identify')] },
}));
assert.equal(effectOf(result, 'transfer-transaction-started').transfer.expectedRequestId, 'req-container');
result = view.process(event('transfer.confirmed', { transferId: 'put-scroll', kind: 'bridge_menu_answer', requestId: 'wrong-req', accepted: true }));
assert.equal(effectOf(result, 'transfer-transaction-rejected').reason, 'confirmation request id does not match transfer', 'shared transfer confirmation rejects stale request ids at model boundary');

result = view.process(event('transfer.rejected', { transferId: 'put-scroll', sessionId: 'container-session', reason: 'expected prompt request id does not match active prompt', requestId: 'stale-req', expectedRequestId: 'req-container' }));
assert.equal(effectOf(result, 'transfer-transaction-followup-rejected').transfer.status, 'rejected', 'stale transfer follow-up rejection is reduced in shared state');
assert.equal(view.snapshot().transferTransactions.sessionsById.get('container-session').status, 'active', 'stale transfer rejection does not close session');

let invalidChoreography = envelope('transfer.choreography.updated', { sessionId: 'container-session', pendingSelection: { action: 'out', selector: 'a', sourceSide: 'left', trapped: true } });
let checkedInvalidChoreography = UiProtocol.validateEventEnvelope(invalidChoreography);
assert.equal(checkedInvalidChoreography.ok, false, 'transfer choreography schema rejects non-public pending selection fields');
assert(checkedInvalidChoreography.errors.some((error) => /trapped/.test(error)), checkedInvalidChoreography.errors.join('\n'));
result = view.process(event('transfer.choreography.updated', { sessionId: 'container-session', pendingSelection: { action: 'in', selector: 'b', sourceSide: 'right', transferId: 'put-scroll' }, reason: 'stale transfer selection' }));
assert.equal(effectOf(result, 'transfer-transaction-rejected').reason, 'pending transfer selection does not match an active transfer in the session', 'shared choreography rejects stale rejected transfer ids');
result = view.process(event('transfer.choreography.updated', { sessionId: 'missing-container-session', reopenPending: true, reason: 'stale session id' }));
assert.equal(effectOf(result, 'transfer-transaction-rejected').reason, 'transfer session is not active', 'stale choreography session updates fail closed');

result = view.process(event('transfer.begun', {
  transferId: 'put-scroll-delayed',
  sessionId: 'container-session',
  container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 },
  direction: 'inventory-to-container',
  sourceSide: 'right',
  targetSide: 'left',
  selector: 'b',
  itemName: 'scroll of identify',
  expectedRequestId: '',
  beforePanes: { left: [row('a', 'a - an uncursed food ration')], right: [row('b', 'b - a scroll of identify')] },
}));
assert.equal(effectOf(result, 'transfer-transaction-started').transfer.expectedRequestId, '', 'explicit empty expectedRequestId is preserved');
result = view.process(event('transfer.choreography.updated', {
  sessionId: 'container-session',
  pendingSelection: { action: 'in', selector: 'b', sourceSide: 'right', targetSide: 'left', itemName: 'scroll of identify', item: publicAppearanceItem('a scroll of identify'), transferId: 'put-scroll-delayed', requestId: '', at: 1 },
  autoLoadingSide: 'right',
  refreshIntent: { kind: 'container-pending-item-menu-selection', side: 'right', transferId: 'put-scroll-delayed', command: '#loot\n', delayMs: 80, reason: 'waiting for put-in menu', at: 2 },
  reason: 'test pending selection',
}));
let choreographyEffect = effectOf(result, 'transfer-choreography-updated');
assert.equal(choreographyEffect.choreography.pendingSelection.selector, 'b', 'shared reducer records pending container item selection for an active transfer');
assert.equal(choreographyEffect.choreography.autoLoadingSide, 'right', 'shared reducer records auto-loading side intent');
let choreographyState = GameViewState.transferPanelChoreographyState(view.snapshot(), { kind: 'container', sessionId: 'container-session', container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 } });
assert.equal(choreographyState.source, 'shared-session-choreography', 'shared choreography helper exposes reducer-owned transfer choreography');
assert.equal(choreographyState.pendingSelection.transferId, 'put-scroll-delayed');
assert.equal(choreographyState.refreshIntent.kind, 'container-pending-item-menu-selection');
result = view.process(event('transfer.choreography.updated', { sessionId: 'container-session', clearPendingSelection: true, autoLoadingSide: '', autoNextSide: 'left', reopenPending: true, clearRefreshIntent: true, reason: 'item menu opened' }));
choreographyEffect = effectOf(result, 'transfer-choreography-updated');
assert.equal(choreographyEffect.choreography.pendingSelection, null, 'shared reducer clears pending selection explicitly');
assert.equal(choreographyEffect.choreography.autoNextSide, 'left', 'shared reducer records queued auto-next side');
assert.equal(choreographyEffect.choreography.reopenPending, true, 'shared reducer records reopen intent instead of renderer-only flag');
result = view.process(event('transfer.completed', { transferId: 'put-scroll-delayed', sessionId: 'wrong-container-session', status: 'success', afterPanes: { left: [row('a', 'a - an uncursed food ration'), row('b', 'b - a scroll of identify')], right: [] } }));
assert.equal(effectOf(result, 'transfer-transaction-rejected').reason, 'completion session id does not match transfer', 'shared transfer completion rejects wrong session ids');
result = view.process(event('transfer.completed', { transferId: 'put-scroll-delayed', sessionId: 'container-session', status: 'success', containerContentsDelta: { added: [publicAppearanceItem('scroll of identify')], publicEvidence: true, changed: true }, afterPanes: { left: [row('a', 'a - an uncursed food ration'), row('b', 'b - a scroll of identify')], right: [] } }));
assert.equal(effectOf(result, 'transfer-transaction-rejected').reason, 'container contents delta session id is missing', 'invalid public evidence on completion is rejected instead of silently dropped');

result = view.process(event('transfer.completed', {
  transferId: 'put-scroll-delayed',
  status: 'success',
  afterPanes: { left: [row('a', 'a - an uncursed food ration'), row('b', 'b - a scroll of identify')], right: [] },
}));
assert.equal(effectOf(result, 'transfer-transaction-completed').transfer.result.publicEvidence.containerContents, false);

invalidEvidence = envelope('transfer.container-contents-evidence.attached', { transferId: 'put-scroll-delayed', sessionId: 'container-session', container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 } });
checkedInvalid = UiProtocol.validateEventEnvelope(invalidEvidence);
assert.equal(checkedInvalid.ok, false, 'container evidence attach protocol requires a containerContentsDelta');
invalidEvidence = envelope('transfer.container-contents-evidence.attached', { transferId: 'put-scroll-delayed', sessionId: 'container-session', coord: { x: 10, y: 12 }, container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 }, containerContentsDelta: { sessionId: 'container-session', container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 }, added: [publicAppearanceItem('scroll of identify')], publicEvidence: true, changed: true } });
checkedInvalid = UiProtocol.validateEventEnvelope(invalidEvidence);
assert.equal(checkedInvalid.ok, false, 'container evidence attach protocol rejects top-level coordinate fields');
invalidEvidence = envelope('transfer.container-contents-evidence.attached', { transferId: 'put-scroll-delayed', sessionId: 'container-session', container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 }, containerContentsDelta: { coord: { x: 10, y: 12 }, sessionId: 'container-session', container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 }, added: [publicAppearanceItem('scroll of identify')], publicEvidence: true, changed: true } });
checkedInvalid = UiProtocol.validateEventEnvelope(invalidEvidence);
assert.equal(checkedInvalid.ok, false, 'container evidence attach protocol rejects nested coordinate fields');

result = view.process(event('transfer.container-contents-evidence.attached', {
  transferId: 'put-scroll-delayed',
  sessionId: 'container-session',
  container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 },
  containerContentsDelta: { fromRevision: 1, toRevision: 2, added: [publicAppearanceItem('scroll of identify')], removed: [], updated: [], changedCount: 1, publicEvidence: true, changed: true },
}));
assert.equal(effectOf(result, 'transfer-transaction-rejected').reason, 'container contents delta session id is missing', 'container evidence fails closed when delta session identity is omitted');

result = view.process(event('transfer.container-contents-evidence.attached', {
  transferId: 'put-scroll-delayed',
  sessionId: 'container-session',
  container: { publicId: 'wrong-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 99 },
  containerContentsDelta: { sessionId: 'container-session', container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 }, fromRevision: 1, toRevision: 2, added: [publicAppearanceItem('scroll of identify')], removed: [], updated: [], changedCount: 1, publicEvidence: true, changed: true },
}));
assert.equal(effectOf(result, 'transfer-transaction-rejected').reason, 'container contents delta event container identity does not match transfer', 'container evidence fails closed when top-level identity conflicts with stable transfer identity');

result = view.process(event('transfer.container-contents-evidence.attached', {
  transferId: 'put-scroll-delayed',
  sessionId: 'container-session',
  container: { publicId: 'wrong-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 99 },
  containerContentsDelta: { sessionId: 'container-session', container: { publicId: 'wrong-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 99 }, fromRevision: 1, toRevision: 2, added: [publicAppearanceItem('scroll of identify')], removed: [], updated: [], changedCount: 1, publicEvidence: true, changed: true },
}));
assert.equal(effectOf(result, 'transfer-transaction-rejected').reason, 'container contents delta event container identity does not match transfer', 'container evidence fails closed when event and delta identities are both wrong');

const matchingContainerDelta = { sessionId: 'container-session', container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 }, fromRevision: 1, toRevision: 2, added: [publicAppearanceItem('scroll of identify')], removed: [], updated: [], changedCount: 1, publicEvidence: true, changed: true };
result = view.process(event('transfer.container-contents-evidence.attached', {
  transferId: 'put-scroll-delayed',
  sessionId: 'container-session',
  container: { publicId: 'large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 42 },
  containerContentsDelta: matchingContainerDelta,
}));
attached = effectOf(result, 'transfer-transaction-container-contents-delta-attached');
assert.equal(attached.transfer.result.publicEvidence.containerContents, true, 'same-session delayed container evidence attaches under game-view-state');
assert.equal(attached.transfer.result.delta.rendererPaneDeltaOnly, true);

const sidecar = view.snapshot().transferTransactions;
assert.equal(sidecar.lastCompleted.transferId, 'put-scroll-delayed');
assert.equal(sidecar.lastCompleted.result.publicEvidence.containerContents, true, 'snapshot sidecar exposes transfer transaction state for renderer consumption');

result = view.process(event('transfer.session.closed', { sessionId: 'container-session', reason: 'panel closed by player' }));
assert.equal(effectOf(result, 'transfer-session-closed').session.status, 'closed');

const fallbackPaneMove = GameViewState.transferPanelOptimisticMoveState({ transferTransactions: { sessionsById: new Map(), transfersById: new Map() }, pendingTransferEvidence: {} }, { kind: 'container', sourceSide: 'right', selector: 'x', itemName: 'tin opener', fallbackPanes: { left: [], right: [row('x', 'x - a tin opener')] } });
assert.equal(fallbackPaneMove.ok, true, 'shared optimistic pane helper supports renderer fallback panes when no shared session exists');
assert.equal(fallbackPaneMove.source, 'fallback-panes', 'fallback pane path is explicit and testable');
assert.equal(fallbackPaneMove.panesAfter.left.some((item) => item.selector === 'x'), true, 'fallback pane path constructs the same patch shape');
const duplicateSelectorMove = GameViewState.transferPanelOptimisticMoveState({ transferTransactions: { sessionsById: new Map(), transfersById: new Map() }, pendingTransferEvidence: {} }, { kind: 'ground-pickup', sourceSide: 'right', selector: 'a', itemName: 'spear', fallbackPanes: { left: [row('a', 'a - 3 arrows')], right: [row('a', 'a - spear')] } });
assert.equal(duplicateSelectorMove.ok, true, 'shared optimistic pane helper treats pane selector namespaces independently');
assert.equal(duplicateSelectorMove.panesAfter.left.filter((item) => item.selector === 'a').length, 2, 'same selector letters on opposite panes do not suppress the moved row when text differs');
const sameTextDuplicateMove = GameViewState.transferPanelOptimisticMoveState({ transferTransactions: { sessionsById: new Map(), transfersById: new Map() }, pendingTransferEvidence: {} }, { kind: 'container', sourceSide: 'left', selector: 'a', itemName: 'dagger', fallbackPanes: { left: [row('a', 'dagger')], right: [row('a', 'dagger')] } });
assert.equal(sameTextDuplicateMove.panesAfter.right.filter((item) => item.selector === 'a' && item.text === 'dagger').length, 2, 'pane namespaces stay independent even when selector and display text both match');

const autoView = GameViewState.createGameViewState();
result = autoView.process(event('ground.pile.snapshot', { revision: 1, coord: { x: 4, y: 5 }, items: [publicAppearanceItem('a food ration'), publicAppearanceItem('a scroll labeled READ ME')] }));
assert(effectOf(result, 'ground-pile-snapshot'), 'initial ordinary ground snapshot is accepted');
result = autoView.process(event('ground.pile.snapshot', { revision: 1, coord: { x: 4, y: 5 }, items: [publicAppearanceItem('a scroll labeled READ ME')] }));
assert(effectOf(result, 'ground-pile-snapshot-rejected')?.errors?.some((error) => /conflicting ground pile snapshot revision 1/.test(error)), 'same-revision conflicting ground snapshot is rejected fail-closed');
autoView.process(event('transfer.session.opened', { sessionId: 'auto-ground-session', kind: 'ground-pickup', groundCoord: { x: 4, y: 5 }, leftRows: [row('a', 'a - a food ration'), row('b', 'b - a scroll labeled READ ME')], rightRows: [], loadedSides: { left: true, right: true } }));
result = autoView.process(event('transfer.begun', { transferId: 'auto-take-scroll', sessionId: 'auto-ground-session', groundCoord: { x: 4, y: 5 }, direction: 'ground-to-inventory', sourceSide: 'left', targetSide: 'right', selector: 'b', itemName: 'scroll labeled READ ME', beforePanes: { left: [row('a', 'a - a food ration'), row('b', 'b - a scroll labeled READ ME')], right: [] } }));
assert(effectOf(result, 'transfer-pending-ground-pile-evidence-recorded'), 'transfer begin records shared pending ground evidence');
assert.equal(autoView.snapshot().pendingTransferEvidence.ground.beforePile.items.length, 2, 'pending ground evidence sidecar exposes before pile');
let commandState = GameViewState.transferPanelCommandState(autoView.snapshot(), { kind: 'ground-pickup', sessionId: 'auto-ground-session', groundCoord: { x: 4, y: 5 } });
assert.equal(commandState.transferId, 'auto-take-scroll', 'shared command helper resolves the active ground transfer without renderer-local pending id');
assert.equal(commandState.pendingEvidenceKind, 'ground-pile', 'shared command helper exposes the matching ground pending evidence sidecar');
autoView.process(event('transfer.completed', { transferId: 'auto-take-scroll', status: 'success', afterPanes: { left: [row('a', 'a - a food ration')], right: [row('b', 'b - a scroll labeled READ ME')] } }));
result = autoView.process(event('ground.pile.snapshot', { revision: 2, coord: { x: 4, y: 5 }, items: [publicAppearanceItem('a food ration')] }));
attached = effectOf(result, 'transfer-transaction-ground-pile-delta-attached');
assert(attached, 'ordinary ground.pile.snapshot automatically attaches delayed transfer evidence');
assert.equal(attached.transfer.result.publicEvidence.groundPile, true);
assert.equal(attached.transfer.result.publicEvidenceAttachedAfterCompletion, true);
assert.equal(autoView.snapshot().pendingTransferEvidence.ground, null, 'automatic ground attach clears shared pending evidence');

result = autoView.process(event('transfer.ground-pile-evidence.attached', { transferId: 'auto-take-scroll', sessionId: 'auto-ground-session', coord: { x: 4, y: 5 }, groundPileDelta: { coord: { x: 4, y: 5 }, fromRevision: 1, toRevision: 2, added: [], removed: [publicAppearanceItem('scroll labeled READ ME')], updated: [], changedCount: 1, publicEvidence: true, changed: true } }));
assert.equal(effectOf(result, 'transfer-transaction-rejected').reason, 'ground pile delta already attached to transfer', 'duplicate ground evidence is rejected after automatic attachment');

result = autoView.process(event('ground.pile.snapshot', { revision: 3, coord: { x: 7, y: 7 }, items: [publicAppearanceItem('a dagger'), publicAppearanceItem('an amulet')] }));
autoView.process(event('transfer.session.opened', { sessionId: 'auto-stale-ground-session', kind: 'ground-pickup', groundCoord: { x: 7, y: 7 }, leftRows: [row('a', 'a - a dagger'), row('b', 'b - an amulet')], rightRows: [], loadedSides: { left: true, right: true } }));
autoView.process(event('transfer.begun', { transferId: 'auto-take-amulet', sessionId: 'auto-stale-ground-session', groundCoord: { x: 7, y: 7 }, direction: 'ground-to-inventory', sourceSide: 'left', targetSide: 'right', selector: 'b', itemName: 'amulet', beforePanes: { left: [row('a', 'a - a dagger'), row('b', 'b - an amulet')], right: [] } }));
const beforeStaleRevision = autoView.snapshot().transferTransactions.revision;
result = autoView.process(event('ground.pile.snapshot', { revision: 2, coord: { x: 7, y: 7 }, items: [publicAppearanceItem('an amulet')] }));
assert(effectOf(result, 'ground-pile-snapshot-rejected')?.stale, 'stale ordinary ground snapshot is rejected before evidence matching');
assert.equal(autoView.snapshot().transferTransactions.revision, beforeStaleRevision, 'stale ordinary ground evidence does not mutate transfer state');
result = autoView.process(event('ground.pile.snapshot', { revision: 1, coord: { x: 9, y: 9 }, items: [publicAppearanceItem('an amulet')] }));
assert.equal(effectOf(result, 'transfer-pending-ground-pile-evidence-ignored')?.reason, 'ordinary ground pile snapshot coordinate did not match pending transfer evidence', 'unrelated ground evidence is ignored with reducer diagnostics');
assert.equal(autoView.snapshot().pendingTransferEvidence.ground.transferId, 'auto-take-amulet', 'unrelated ground evidence keeps pending queue intact');
result = autoView.process(event('ground.pile.snapshot', { revision: 4, coord: { x: 7, y: 7 }, items: [publicAppearanceItem('an amulet')] }));
assert.equal(effectOf(result, 'transfer-transaction-rejected').reason, 'ground pile delta does not mention the transfer item', 'same-coordinate unrelated item evidence is rejected by transfer model validation');
assert.equal(autoView.snapshot().pendingTransferEvidence.ground.transferId, 'auto-take-amulet', 'rejected unrelated item evidence does not clear pending queue');
autoView.process(event('transfer.session.opened', { sessionId: 'auto-superseding-ground-session', kind: 'ground-pickup', groundCoord: { x: 9, y: 9 }, leftRows: [row('a', 'a - an amulet')], rightRows: [], loadedSides: { left: true, right: true } }));
result = autoView.process(event('transfer.begun', { transferId: 'auto-take-newer-amulet', sessionId: 'auto-superseding-ground-session', groundCoord: { x: 9, y: 9 }, direction: 'ground-to-inventory', sourceSide: 'left', targetSide: 'right', selector: 'a', itemName: 'amulet', beforePanes: { left: [row('a', 'a - an amulet')], right: [] } }));
assert.equal(effectOf(result, 'transfer-pending-ground-pile-evidence-cleared')?.reason, 'superseded by newer ground transfer pending evidence', 'overwriting single shared pending ground slot emits a clear diagnostic');
assert.equal(autoView.snapshot().pendingTransferEvidence.ground.transferId, 'auto-take-newer-amulet');

const completedCommandView = GameViewState.createGameViewState();
completedCommandView.process(event('transfer.session.opened', { sessionId: 'completed-command-session', kind: 'ground-pickup', groundCoord: { x: 2, y: 2 }, leftRows: [row('a', 'a - a rock')], rightRows: [], loadedSides: { left: true, right: true } }));
completedCommandView.process(event('transfer.begun', { transferId: 'completed-rock', sessionId: 'completed-command-session', groundCoord: { x: 2, y: 2 }, direction: 'ground-to-inventory', sourceSide: 'left', targetSide: 'right', selector: 'a', itemName: 'rock', beforePanes: { left: [row('a', 'a - a rock')], right: [] } }));
completedCommandView.process(event('transfer.completed', { transferId: 'completed-rock', status: 'success', afterPanes: { left: [], right: [row('a', 'a - a rock')] } }));
commandState = GameViewState.transferPanelCommandState(completedCommandView.snapshot(), { kind: 'ground-pickup', sessionId: 'completed-command-session', groundCoord: { x: 2, y: 2 } });
assert.equal(commandState.transfer, null, 'shared command helper does not return completed transfers as active command targets');
completedCommandView.process(event('transfer.begun', { transferId: 'newer-rock', sessionId: 'completed-command-session', groundCoord: { x: 2, y: 2 }, direction: 'inventory-to-ground', sourceSide: 'right', targetSide: 'left', selector: 'a', itemName: 'rock', beforePanes: { left: [], right: [row('a', 'a - a rock')] } }));
commandState = GameViewState.transferPanelCommandState(completedCommandView.snapshot(), { kind: 'ground-pickup', sessionId: 'completed-command-session', groundCoord: { x: 2, y: 2 }, transferId: 'completed-rock', strictTransferId: true });
assert.equal(commandState.transferId, 'completed-rock', 'strict command lookup preserves explicit stale transfer id for rejection diagnostics');
assert.equal(commandState.transfer, null, 'strict command lookup does not substitute a newer active transfer for a stale explicit id');
commandState = GameViewState.transferPanelCommandState(completedCommandView.snapshot(), { kind: 'ground-pickup', sessionId: 'completed-command-session', groundCoord: { x: 2, y: 2 }, transferId: 'completed-rock' });
assert.equal(commandState.transferId, 'newer-rock', 'non-strict panel command lookup still follows shared active transfer over stale renderer-local id');
paneMove = GameViewState.transferPanelOptimisticMoveState(completedCommandView.snapshot(), { kind: 'ground-pickup', sessionId: 'completed-command-session', groundCoord: { x: 2, y: 2 }, sourceSide: 'right', selector: 'a', fallbackPanes: { left: [], right: [row('a', 'a - a rock')] } });
assert.equal(paneMove.ok, true, 'shared optimistic pane helper can construct the next ground drop pane patch');
assert.equal(paneMove.source, 'shared-session-panes', 'helper records the authoritative shared pane source when a session is present');
assert.equal(paneMove.refreshPlan.reopenPending, false, 'ground inventory-to-ground helper returns drop refresh choreography without reopen');
assert.equal(paneMove.refreshPlan.dropPending, true, 'ground inventory-to-ground helper marks drop pending choreography');

const staleGroundCloseView = GameViewState.createGameViewState();
staleGroundCloseView.process(event('transfer.session.opened', { sessionId: 'stale-close-ground-session', kind: 'ground-pickup', groundCoord: { x: 11, y: 11 }, leftRows: [row('a', 'a - a dart')], rightRows: [], loadedSides: { left: true, right: true } }));
staleGroundCloseView.process(event('transfer.begun', { transferId: 'stale-close-pick-dart', sessionId: 'stale-close-ground-session', groundCoord: { x: 11, y: 11 }, direction: 'ground-to-inventory', sourceSide: 'left', targetSide: 'right', selector: 'a', itemName: 'dart', beforePanes: { left: [row('a', 'a - a dart')], right: [] } }));
staleGroundCloseView.process(event('transfer.completed', { transferId: 'stale-close-pick-dart', status: 'success', afterPanes: { left: [], right: [row('a', 'a - a dart')] } }));
result = staleGroundCloseView.process(event('transfer.session.closed', { sessionId: 'stale-close-ground-session', reason: 'Ground pickup panel closed.' }));
assert(effectOf(result, 'transfer-pending-ground-pile-evidence-cleared'), 'explicit transfer.session.closed clears completed ground pending evidence when no future refresh is expected');
assert.equal(staleGroundCloseView.snapshot().pendingTransferEvidence.ground, null);

const staleCloseView = GameViewState.createGameViewState();
staleCloseView.process(event('transfer.session.opened', { sessionId: 'stale-close-container-session', kind: 'container', container: { publicId: 'stale-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 88 }, leftRows: [], rightRows: [row('a', 'a - a dagger')], loadedSides: { left: true, right: true } }));
staleCloseView.process(event('transfer.begun', { transferId: 'stale-close-put-dagger', sessionId: 'stale-close-container-session', container: { publicId: 'stale-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 88 }, direction: 'inventory-to-container', sourceSide: 'right', targetSide: 'left', selector: 'a', itemName: 'dagger', beforePanes: { left: [], right: [row('a', 'a - a dagger')] } }));
staleCloseView.process(event('transfer.completed', { transferId: 'stale-close-put-dagger', status: 'success', afterPanes: { left: [row('a', 'a - a dagger')], right: [] } }));
result = staleCloseView.process(event('transfer.session.closed', { sessionId: 'stale-close-container-session', reason: 'panel closed before refresh' }));
assert(effectOf(result, 'transfer-pending-container-contents-evidence-cleared'), 'transfer.session.closed clears completed container pending evidence when no future refresh is expected');
assert.equal(staleCloseView.snapshot().pendingTransferEvidence.container, null);

const container = { publicId: 'auto-large-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 77 };
const autoContainerView = GameViewState.createGameViewState();
autoContainerView.process(event('container.session.opened', { sessionId: 'auto-container-session', container }));
autoContainerView.process(event('container.contents.snapshot', { revision: 1, sessionId: 'auto-container-session', container, items: [publicAppearanceItem('a food ration')] }));
autoContainerView.process(event('transfer.session.opened', { sessionId: 'auto-container-session', kind: 'container', container, leftRows: [row('a', 'a - a food ration')], rightRows: [row('b', 'b - a dagger')], loadedSides: { left: true, right: true } }));
result = autoContainerView.process(event('transfer.begun', { transferId: 'auto-put-dagger', sessionId: 'auto-container-session', container, direction: 'inventory-to-container', sourceSide: 'right', targetSide: 'left', selector: 'b', itemName: 'dagger', beforePanes: { left: [row('a', 'a - a food ration')], right: [row('b', 'b - a dagger')] } }));
assert(effectOf(result, 'transfer-pending-container-contents-evidence-recorded'), 'transfer begin records shared pending container evidence');
assert.equal(autoContainerView.snapshot().pendingTransferEvidence.container.beforeSnapshot.items.length, 1, 'pending container evidence sidecar exposes before snapshot');
commandState = GameViewState.transferPanelCommandState(autoContainerView.snapshot(), { kind: 'container', sessionId: 'auto-container-session', container });
assert.equal(commandState.transferId, 'auto-put-dagger', 'shared command helper resolves the active container transfer without renderer-local pending id');
assert.equal(commandState.pendingEvidenceKind, 'container-contents', 'shared command helper exposes the matching container pending evidence sidecar');
autoContainerView.process(event('transfer.completed', { transferId: 'auto-put-dagger', status: 'success', afterPanes: { left: [row('a', 'a - a food ration'), row('b', 'b - a dagger')], right: [] } }));
result = autoContainerView.process(event('container.contents.snapshot', { revision: 2, sessionId: 'auto-container-session', container, items: [publicAppearanceItem('a food ration'), publicAppearanceItem('a dagger')] }));
attached = effectOf(result, 'transfer-transaction-container-contents-delta-attached');
assert(attached, 'ordinary container.contents.snapshot automatically attaches delayed transfer evidence');
assert.equal(attached.transfer.result.publicEvidence.containerContents, true);
assert.match(attached.transfer.result.containerContentsDelta.added[0].displayName, /dagger/);
assert.equal(autoContainerView.snapshot().pendingTransferEvidence.container, null, 'automatic container attach clears shared pending evidence');
assert.equal(autoContainerView.snapshot().transferTransactions.lastCompleted.result.publicEvidence.containerContents, true, 'snapshot sidecar exposes automatically attached transfer evidence');
paneMove = GameViewState.transferPanelOptimisticMoveState(autoContainerView.snapshot(), { kind: 'container', sessionId: 'auto-container-session', container, sourceSide: 'left', selector: 'a', itemName: 'food ration', fallbackPanes: { left: [row('a', 'stale fallback ration')], right: [] } });
assert.equal(paneMove.ok, true, 'shared optimistic pane helper builds container pane patches');
assert.equal(paneMove.direction, 'container-to-inventory');
assert.equal(paneMove.refreshPlan.keepOpenThroughRefresh, true, 'container helper carries refresh/reopen choreography as shared output');
assert.equal(paneMove.refreshPlan.reopenPending, true, 'container helper requests reopen choreography after a transfer command');
assert.equal(paneMove.panesAfter.right.some((item) => item.selector === 'a'), true, 'container helper moves selected row into the destination pane patch');

result = autoContainerView.process(event('transfer.container-contents-evidence.attached', { transferId: 'auto-put-dagger', sessionId: 'auto-container-session', container, containerContentsDelta: { sessionId: 'auto-container-session', container, fromRevision: 1, toRevision: 2, added: [publicAppearanceItem('dagger')], removed: [], updated: [], changedCount: 1, publicEvidence: true, changed: true } }));
assert.equal(effectOf(result, 'transfer-transaction-rejected').reason, 'container contents delta already attached to transfer', 'duplicate container evidence is rejected after automatic attachment');

autoContainerView.process(event('container.session.opened', { sessionId: 'other-container-session', container: { publicId: 'other-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 78 } }));
autoContainerView.process(event('container.contents.snapshot', { revision: 1, sessionId: 'other-container-session', container: { publicId: 'other-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 78 }, items: [publicAppearanceItem('a knife')] }));
autoContainerView.process(event('transfer.session.opened', { sessionId: 'other-container-session', kind: 'container', container: { publicId: 'other-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 78 }, leftRows: [row('a', 'a - a knife')], rightRows: [row('b', 'b - a scroll of identify')], loadedSides: { left: true, right: true } }));
autoContainerView.process(event('transfer.begun', { transferId: 'auto-put-scroll-other', sessionId: 'other-container-session', container: { publicId: 'other-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 78 }, direction: 'inventory-to-container', sourceSide: 'right', targetSide: 'left', selector: 'b', itemName: 'scroll of identify', beforePanes: { left: [row('a', 'a - a knife')], right: [row('b', 'b - a scroll of identify')] } }));
result = autoContainerView.process(event('container.contents.snapshot', { revision: 3, sessionId: 'auto-container-session', container, items: [publicAppearanceItem('a food ration'), publicAppearanceItem('a dagger'), publicAppearanceItem('a scroll of identify')] }));
assert.equal(effectOf(result, 'transfer-pending-container-contents-evidence-ignored')?.reason, 'ordinary container contents snapshot session did not match pending transfer evidence', 'unrelated container session evidence is ignored with reducer diagnostics');
assert.equal(autoContainerView.snapshot().pendingTransferEvidence.container.transferId, 'auto-put-scroll-other', 'unrelated container evidence keeps pending queue intact');
result = autoContainerView.process(event('container.session.closed', { sessionId: 'other-container-session', reason: 'player closed container pane' }));
assert(effectOf(result, 'transfer-pending-container-contents-evidence-cleared'), 'closing public container session clears stale pending container evidence');
assert.equal(autoContainerView.snapshot().pendingTransferEvidence.container, null);

const missingRequestMenuView = GameViewState.createGameViewState();
missingRequestMenuView.process(event('transfer.session.opened', { sessionId: 'missing-request-ground-session', kind: 'ground-pickup', groundCoord: { x: 6, y: 6 }, leftRows: [row('a', 'a - 3 arrows')], rightRows: [], loadedSides: { left: true, right: true } }));
missingRequestMenuView.process(event('transfer.begun', { transferId: 'missing-request-transfer', sessionId: 'missing-request-ground-session', groundCoord: { x: 6, y: 6 }, direction: 'ground-to-inventory', sourceSide: 'left', targetSide: 'right', selector: 'a', itemName: 'arrows', expectedRequestId: 'menu-expected', beforePanes: { left: [row('a', 'a - 3 arrows')], right: [] } }));
missingRequestMenuView.process({ name: 'shim_start_menu', window: 990, requestId: 'menu-expected' });
missingRequestMenuView.process({ name: 'shim_add_menu', window: 990, selector: 97, text: 'a - 3 arrows', requestId: 'menu-expected' });
missingRequestMenuView.process({ name: 'shim_end_menu', window: 990, prompt: 'Pick up what?', requestId: 'menu-expected' });
missingRequestMenuView.process({ name: 'shim_select_menu', window: 990, how: 2, requestId: 'menu-expected' });
result = missingRequestMenuView.process({ name: 'bridge_menu_answer', transactionId: 'missing-request-transfer', answer: 'a', return: 1 });
assert(!effectOf(result, 'menu-answer-event-rejected'), 'matching transfer transaction id may close an active owned menu even when the bridge omits requestId');
assert.equal(missingRequestMenuView.snapshot().currentMenu, null, 'missing request id transfer answer clears stale shared currentMenu');
assert.equal(missingRequestMenuView.snapshot().activePrompt, null, 'missing request id transfer answer clears stale shared activePrompt');

const foreignMissingRequestView = GameViewState.createGameViewState();
foreignMissingRequestView.process(event('transfer.session.opened', { sessionId: 'foreign-menu-session', kind: 'container', container: { publicId: 'foreign-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 91 }, leftRows: [row('a', 'a - a rock')], rightRows: [], loadedSides: { left: true, right: true } }));
foreignMissingRequestView.process(event('transfer.begun', { transferId: 'foreign-menu-transfer', sessionId: 'foreign-menu-session', container: { publicId: 'foreign-box', displayName: 'large box', semanticKnown: false, known: { identity: false, appearance: true }, objectId: 91 }, direction: 'container-to-inventory', sourceSide: 'left', targetSide: 'right', selector: 'a', itemName: 'rock', expectedRequestId: 'owned-menu-request', beforePanes: { left: [row('a', 'a - a rock')], right: [] } }));
foreignMissingRequestView.process({ name: 'shim_start_menu', window: 991, requestId: 'foreign-menu-request', transactionId: 'foreign-command' });
foreignMissingRequestView.process({ name: 'shim_add_menu', window: 991, selector: 97, text: 'a - a different prompt row', requestId: 'foreign-menu-request', transactionId: 'foreign-command' });
foreignMissingRequestView.process({ name: 'shim_end_menu', window: 991, prompt: 'Foreign prompt?', requestId: 'foreign-menu-request', transactionId: 'foreign-command' });
foreignMissingRequestView.process({ name: 'shim_select_menu', window: 991, how: 1, requestId: 'foreign-menu-request', transactionId: 'foreign-command' });
result = foreignMissingRequestView.process({ name: 'bridge_menu_answer', transactionId: 'foreign-menu-transfer', answer: 'a', return: 1 });
assert(effectOf(result, 'menu-answer-event-rejected'), 'missing request id transfer answer cannot close a foreign active menu');
assert.equal(foreignMissingRequestView.snapshot().currentMenu.requestId, 'foreign-menu-request', 'foreign menu remains open after rejected missing-request transfer answer');
assert.equal(foreignMissingRequestView.snapshot().activePrompt.requestId, 'foreign-menu-request', 'foreign menu prompt remains open after rejected missing-request transfer answer');

console.log('game-view-transfer-transaction-test PASS');
