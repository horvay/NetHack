const assert = require('node:assert/strict');
const TransferSession = require('../src/shared/transfer-session');

function row(objectId, displayName, selector = '') {
  return { objectId, displayName, selector: selector ? selector.charCodeAt(0) : undefined, inventoryLetter: selector };
}

let clock = 1000;
const session = TransferSession.createTransferSession({ now: () => clock, timeoutMs: 500, idPrefix: 'proof' });

let result = session.dispatch({
  type: 'open',
  kind: 'ground-pickup',
  sessionId: 'ground-12-8',
  route: 'direct',
  groundCoord: { x: 12, y: 8 },
  leftRows: [row(101, 'cream pie'), row(102, 'lichen corpse')],
  rightRows: [row(201, 'spear', 'a')],
});
assert.equal(result.snapshot.owner.id, 'transfer:ground-12-8');
assert.equal(result.snapshot.panes.left.length, 2);
assert.ok(Object.isFrozen(result.snapshot.panes.left[0]), 'published rows are immutable');
assert.equal(result.effects[0].eventType, 'transfer.session.opened');

session.dispatch({ type: 'toggle', side: 'left', selector: 'left-object-101' });
result = session.dispatch({ type: 'toggle', side: 'left', selector: 'left-object-102' });
assert.deepEqual(result.snapshot.selection.left, ['left-object-101', 'left-object-102']);
result = session.dispatch({ type: 'submit', sides: ['left'] });
const firstDirect = result.effects.find((effect) => effect.type === 'dispatch-direct');
assert.equal(firstDirect.direction, 'ground-to-inventory');
assert.equal(firstDirect.row.objectId, 101);
assert.equal(result.snapshot.queuedCount, 1);

result = session.dispatch({ type: 'confirmed', transferId: firstDirect.transferId, sessionId: 'wrong-session', direction: 'ground-to-inventory', itemId: 101 });
assert.equal(result.snapshot.pending.transferId, firstDirect.transferId, 'wrong-session confirmation is ignored');
assert.ok(result.effects.some((effect) => effect.type === 'ignored-followup'));
result = session.dispatch({ type: 'confirmed', transferId: firstDirect.transferId, sessionId: 'ground-12-8', direction: 'ground-to-inventory', itemId: 101 });
const secondDirect = result.effects.find((effect) => effect.type === 'dispatch-direct');
assert.equal(secondDirect.row.objectId, 102, 'multi-selection serializes direct commands');
assert.equal(result.snapshot.panes.left.length, 1, 'optimistic presentation hides only the confirmed row');
assert.equal(result.snapshot.authoritativePanes.left.length, 2, 'authoritative rows are never mutated optimistically');

result = session.dispatch({ type: 'rejected', transferId: secondDirect.transferId, sessionId: 'ground-12-8', reason: 'inventory is full' });
assert.equal(result.snapshot.status, 'rejected');
assert.equal(result.snapshot.panes.left.length, 1, 'prior confirmed optimism remains until authoritative refresh');
session.dispatch({ type: 'pane', side: 'right', rows: [row(201, 'spear'), row(101, 'cream pie')] });
assert.equal(session.snapshot().panes.left.length, 1, 'destination refresh alone does not resurrect a still-authoritative source row');
assert.equal(session.snapshot().panes.right.length, 2, 'destination refresh replaces rather than duplicates the optimistic target row');
assert.match(result.snapshot.feedback, /inventory is full/i);
session.dispatch({ type: 'pane', side: 'left', rows: [row(102, 'lichen corpse')] });
assert.equal(session.snapshot().panes.left.length, 1);

result = session.dispatch({ type: 'move', sourceSide: 'left', selector: 'left-object-102' });
clock += 501;
result = session.dispatch({ type: 'tick' });
assert.equal(result.snapshot.status, 'rejected');
assert.match(result.snapshot.feedback, /timed out/i);
assert.equal(result.snapshot.panes.left.length, 1, 'timeout restores immutable authoritative presentation');

result = session.dispatch({ type: 'interrupt', reason: 'a naming prompt took ownership' });
assert.equal(result.snapshot.active, false);
assert.ok(result.effects.some((effect) => effect.eventType === 'transfer.session.closed'));

const selectAll = TransferSession.createTransferSession({ now: () => clock, timeoutMs: 500, idPrefix: 'select-all' });
selectAll.dispatch({
  type: 'open',
  kind: 'container',
  sessionId: 'container-select-all',
  route: 'direct',
  container: { publicId: 'container-77', objectId: 77, displayName: 'chest' },
  leftRows: [row(401, 'dagger', 'a'), row(402, 'food ration', 'b'), row(403, 'scroll', 'c')],
  rightRows: [row(501, 'tin opener', 'd')],
  loadedSides: { left: true, right: true },
});
result = selectAll.dispatch({ type: 'select-all', side: 'left', rowKeys: ['left-object-401', 'left-object-402'] });
assert.deepEqual(result.snapshot.selection.left, ['left-object-401', 'left-object-402'], 'select-all selects only the eligible container rows supplied by the UI');
assert.equal(result.effects.length, 0, 'select-all never dispatches a transfer');
selectAll.dispatch({ type: 'pane', side: 'left', rows: [row(401, 'dagger', 'q'), row(402, 'food ration', 'r'), row(403, 'scroll', 's')] });
assert.deepEqual(selectAll.snapshot().selection.left, ['left-object-401', 'left-object-402'], 'selection survives authoritative selector refresh by public object identity');
result = selectAll.dispatch({ type: 'submit', sides: ['left'] });
const selectAllFirst = result.effects.find((effect) => effect.type === 'dispatch-direct');
assert.equal(selectAllFirst.row.objectId, 401);
assert.equal(result.snapshot.queuedCount, 1);
result = selectAll.dispatch({ type: 'select-all', side: 'left' });
assert.deepEqual(result.snapshot.selection.left, ['left-object-402'], 'select-all is disabled while a correlated transfer is pending');
result = selectAll.dispatch({ type: 'confirmed', transferId: selectAllFirst.transferId, sessionId: 'container-select-all', direction: 'container-to-inventory', itemId: 401 });
const selectAllSecond = result.effects.find((effect) => effect.type === 'dispatch-direct');
assert.equal(selectAllSecond.row.objectId, 402, 'selected container rows dispatch sequentially without duplicates');
result = selectAll.dispatch({ type: 'confirmed', transferId: selectAllSecond.transferId, sessionId: 'container-select-all', direction: 'container-to-inventory', itemId: 402 });
assert.match(result.snapshot.feedback, /Waiting for refreshed NetHack rows/i, 'batch completion waits while authoritative panes still contradict the transfers');
assert.equal(result.snapshot.pending, null);
assert.equal(result.snapshot.queuedCount, 0);
selectAll.dispatch({ type: 'pane', side: 'left', rows: [row(403, 'scroll', 's')] });
assert.match(selectAll.snapshot().feedback, /Waiting for refreshed NetHack rows/i, 'source settlement alone does not claim full reconciliation');
result = selectAll.dispatch({ type: 'pane', side: 'right', rows: [row(501, 'tin opener', 'd'), row(401, 'dagger', 'q'), row(402, 'food ration', 'r')] });
assert.equal(result.snapshot.feedback, '2 selected items moved.', 'fully authoritative panes remove stale waiting copy');

const classic = TransferSession.createTransferSession({ now: () => clock, timeoutMs: 500, idPrefix: 'classic' });
result = classic.dispatch({
  type: 'menu',
  menu: {
    window: 7,
    requestId: 'request-action',
    awaitingSelection: true,
    prompt: 'Do what with the large box?',
    items: [{ selector: 'o'.charCodeAt(0), text: 'o - take items out' }, { selector: 'i'.charCodeAt(0), text: 'i - put items in' }],
  },
  kind: 'container',
  sessionId: 'container-42',
  container: { publicId: 'container-42', objectId: 42, displayName: 'large box' },
  inventoryRows: [row(201, 'spear', 'a')],
});
assert.equal(result.snapshot.route, 'classic');
assert.equal(result.snapshot.owner.ownsMenu, true);
classic.dispatch({
  type: 'menu',
  menu: {
    window: 8,
    requestId: 'request-items',
    awaitingSelection: true,
    how: 2,
    prompt: 'Take out what?',
    items: [{ selector: 'a'.charCodeAt(0), objectId: 301, text: 'a - a dagger', displayName: 'dagger' }],
  },
});
result = classic.dispatch({ type: 'move', sourceSide: 'left', objectId: 301 });
const classicCommand = result.effects.find((effect) => effect.type === 'dispatch-classic');
assert.equal(classicCommand.text, 'a\n');
assert.equal(classicCommand.expectedRequestId, 'request-items');

// Active selectors may change between presentation and the native menu. The
// Transfer Session remaps by public object identity instead of replaying a stale letter.
classic.dispatch({
  type: 'pane', side: 'left', rows: [row(302, 'food ration')],
});
classic.dispatch({
  type: 'menu',
  menu: {
    window: 9,
    requestId: 'request-remap',
    awaitingSelection: true,
    how: 2,
    prompt: 'Take out what?',
    items: [{ selector: 'z'.charCodeAt(0), objectId: 302, text: 'z - a food ration', displayName: 'food ration' }],
  },
});
classic.dispatch({ type: 'rejected', transferId: classic.snapshot().pending.transferId, sessionId: 'container-42', requestId: 'request-items', reason: 'retry after selector changed' });
result = classic.dispatch({ type: 'move', sourceSide: 'left', objectId: 302 });
assert.equal(result.effects.find((effect) => effect.type === 'dispatch-classic').text, 'z\n');
result = classic.dispatch({ type: 'confirmed', transferId: classic.snapshot().pending.transferId, sessionId: 'container-42', direction: 'container-to-inventory', itemId: 302 });
assert.ok(result.effects.some((effect) => effect.type === 'ignored-followup'), 'classic completion requires exact active menu request correlation');
result = classic.dispatch({ type: 'confirmed', transferId: classic.snapshot().pending.transferId, sessionId: 'container-42', requestId: 'request-remap', direction: 'container-to-inventory', itemId: 302 });

result = classic.dispatch({ type: 'refresh', side: 'left' });
assert.equal(result.effects.find((effect) => effect.type === 'refresh-classic').side, 'left');
result = classic.dispatch({ type: 'close', reason: 'done' });
assert.equal(result.snapshot.active, false);
assert.ok(result.effects.some((effect) => effect.eventType === 'transfer.session.closed'));

const classicBatch = TransferSession.createTransferSession({ now: () => clock, timeoutMs: 500, idPrefix: 'classic-batch' });
classicBatch.dispatch({
  type: 'menu',
  menu: {
    window: 10,
    requestId: 'request-ground-batch',
    awaitingSelection: true,
    how: 2,
    prompt: 'Pick up what?',
    items: [
      { selector: 'a'.charCodeAt(0), objectId: 501, text: 'a - a dagger', displayName: 'dagger' },
      { selector: 'b'.charCodeAt(0), objectId: 502, text: 'b - a food ration', displayName: 'food ration' },
    ],
  },
  kind: 'ground-pickup',
  sessionId: 'ground-classic-batch',
  groundCoord: { x: 4, y: 9 },
});
result = classicBatch.dispatch({ type: 'select-all', side: 'left' });
assert.deepEqual(result.snapshot.selection.left, ['left-object-501', 'left-object-502']);
result = classicBatch.dispatch({ type: 'submit', sides: ['left'] });
const classicBatchCommand = result.effects.find((effect) => effect.type === 'dispatch-classic');
assert.equal(classicBatchCommand.text, 'ab\n', 'classic multi-select answers one native menu with every selected selector');
assert.equal(result.snapshot.queuedCount, 0, 'classic multi-select is represented by one correlated pending answer');
assert.equal(result.snapshot.pending.batchRows.length, 2);
result = classicBatch.dispatch({
  type: 'confirmed',
  transferId: result.snapshot.pending.transferId,
  sessionId: 'ground-classic-batch',
  requestId: 'request-ground-batch',
  direction: 'ground-to-inventory',
});
assert.equal(result.snapshot.pending, null);
assert.equal(result.snapshot.panes.left.length, 0, 'one native confirmation exhausts the presented source pane');

console.log('transfer-session-test PASS');
