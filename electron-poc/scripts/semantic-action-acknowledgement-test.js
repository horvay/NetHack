const assert = require('node:assert/strict');
const GameViewState = require('../src/shared/game-view-state');
const CommandTransactionModel = require('../src/shared/command-transaction-model');
const UiProtocolV2 = require('../src/shared/ui-protocol-v2');

function process(view, event) { return view.process(event); }
function inv(items, extra = {}) { return { name: 'shim_update_inventory', reason: -2, ...extra, items }; }
function item(letter, text, wornMask = 0, objectId = letter.charCodeAt(0)) {
  return { selector: letter.charCodeAt(0), text: `${letter} - ${text}`, objectId, quantity: 1, wornMask, glyphChar: ')'.charCodeAt(0), semanticKind: 'object', semanticKnown: true, semanticName: text };
}
function guiAction(actionId, label, selector, text, followupPlan = []) {
  return { actionId, label, targetSelector: selector, targetText: text, followupPlan, commandPosition: 1, commandLength: 2, source: 'synthetic-gui-action' };
}

assert.deepEqual(
  CommandTransactionModel.normalizeGuiAction({ guiAction: guiAction('item.read.scroll', 'Read', 'j', 'j - a scroll labeled KIRJE', []) }).target,
  { selector: 'j', text: 'j - a scroll labeled KIRJE' },
  'GUI action metadata normalizes target selector and item text',
);
assert.deepEqual(
  CommandTransactionModel.normalizeGuiAction({ guiAction: { ...guiAction('item.drop', 'Drop', 'b', 'b - a dagger', []), uiProtocolCommandId: 'cmd-drop-b', uiProtocolCommandType: 'action.execute', uiProtocolActionId: 'item.drop' } }).uiProtocol,
  { commandId: 'cmd-drop-b', commandType: 'action.execute', actionId: 'item.drop' },
  'GUI action metadata preserves v2 command id for later acknowledgement evidence',
);

{
  const command = { protocol: UiProtocolV2.protocol, commandId: 'cmd-stale-drop', commandType: 'action.execute', transactionId: 'txn-stale-drop', actionId: 'item.drop', payload: { actionId: 'item.drop' } };
  const rejectedAck = UiProtocolV2.createCommandAckEvent({ sequence: 1, eventType: 'command.rejected', command, reason: 'inventory revision changed before action execution', supported: true, executionSource: 'none' });
  const checked = UiProtocolV2.validateEventEnvelope(rejectedAck);
  assert.equal(checked.ok, true, checked.errors.join('; '));
  assert.equal(rejectedAck.payload.blockerToken, 'blocked.input.staleRevision');
  assert.equal(rejectedAck.payload.replayBehavior, 'preserve-only; replay executes input events', 'ack evidence is explicit that replay is not semantic-command driven');
  const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
  const result = view.process(rejectedAck);
  assert(result.effects.some((effect) => effect.type === 'command-protocol-ack-recorded'), 'shared state records command rejection ack evidence');
  assert.equal(view.state.lastCommandProtocolRejection.commandId, 'cmd-stale-drop');
  assert.equal(view.state.lastCommandProtocolRejection.blockerToken, 'blocked.input.staleRevision');
  const snapshot = view.snapshot();
  assert.equal(snapshot.lastCommandProtocolAck.commandId, 'cmd-stale-drop', 'snapshot exposes latest command acknowledgement evidence');
  assert.equal(snapshot.lastCommandProtocolRejection.commandId, 'cmd-stale-drop', 'snapshot exposes latest command rejection evidence');
  assert(snapshot.commandProtocolAcks.some((ack) => ack.commandId === 'cmd-stale-drop'), 'snapshot preserves command acknowledgement history');

  const invalidAck = { ...rejectedAck, eventId: 'evt-command-rejected-invalid-status', payload: { ...rejectedAck.payload, status: 'accepted' } };
  const invalid = view.process(invalidAck);
  assert(invalid.effects.some((effect) => effect.type === 'command-protocol-invalid-ack-rejected'), 'invalid command ack has a specific rejection effect');
  assert(!invalid.effects.some((effect) => /snapshot-rejected/.test(effect.type)), 'invalid command ack is not reported as an unrelated snapshot rejection');
}

{
  const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
  process(view, inv([item('j', 'a scroll labeled KIRJE', 0, 333)], { inventoryRevision: 1, equipmentRevision: 1 }));
  const readAction = guiAction('item.read.scroll', 'Read', 'j', 'j - a scroll labeled KIRJE', []);
  let result = process(view, { name: 'bridge_command', keycode: 'r'.charCodeAt(0), transactionId: 'txn-read-scroll', guiAction: readAction });
  assert(result.effects.some((effect) => effect.type === 'command-transaction-started'), 'semantic GUI command starts a transaction');
  let tx = view.state.commandTransactions.byId.get('txn-read-scroll');
  assert.equal(tx.semanticAction, 'read');
  assert.equal(tx.semanticActionId, 'item.read.scroll');
  assert.equal(tx.guiAction.target.selector, 'j');
  assert.equal(tx.guiAction.target.text, 'j - a scroll labeled KIRJE');

  process(view, { name: 'shim_yn_function', query: 'What do you want to read? [j]', choices: 'j', requestId: 'req-read-item', transactionId: 'txn-read-scroll' });
  result = process(view, { name: 'bridge_command', keycode: 'j'.charCodeAt(0), transactionId: 'txn-read-selector', guiAction: { ...readAction, commandPosition: 2 } });
  assert(result.effects.some((effect) => effect.type === 'command-input-routed-to-active-interaction'), 'selector key is acknowledged as active semantic follow-up');
  tx = view.state.commandTransactions.byId.get('txn-read-scroll');
  const answer = tx.interactions.find((entry) => entry.kind === 'answer-key');
  assert.equal(answer.followupOwnership.actionId, 'item.read.scroll');
  assert.equal(answer.followupOwnership.targetSelector, 'j');
  assert.equal(answer.followupOwnership.matchesTargetSelector, true);

  const rejected = process(view, { name: 'bridge_prompt_answer', keycode: 'j'.charCodeAt(0), requestId: 'stale-read-req', transactionId: 'txn-read-scroll' });
  assert(rejected.effects.some((effect) => effect.type === 'command-transaction-followup-rejected'), 'stale semantic follow-up answer is rejected on the transaction');
  assert.equal(view.state.activePrompt.requestId, 'req-read-item', 'stale follow-up rejection does not close active prompt');

  process(view, { name: 'bridge_prompt_answer', keycode: 'j'.charCodeAt(0), requestId: 'req-read-item', transactionId: 'txn-read-scroll' });
  const completed = process(view, inv([item('j', 'a scroll labeled KIRJE', 0, 333)], { transactionId: 'txn-read-scroll', inventoryRevision: 2, equipmentRevision: 2 }));
  const completion = completed.effects.find((effect) => effect.type === 'command-transaction-completed');
  assert(completion, 'semantic read transaction completes from accepted public snapshot');
  assert.equal(completion.result.status, 'success');
  assert.equal(completion.result.actionId, 'item.read.scroll');
  assert.equal(completion.result.target.selector, 'j');
  assert.equal(completion.result.kind, 'public-state-unchanged', 'read can safely acknowledge without an inventory/equipment delta');
}

{
  const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
  const ringAction = guiAction('item.putOn.ring', 'Put on right ring', 'd', 'd - an uncursed granite ring', ['hand']);
  process(view, { name: 'bridge_command', keycode: 'P'.charCodeAt(0), transactionId: 'txn-puton-ring', guiAction: ringAction });
  process(view, { name: 'shim_yn_function', query: 'What do you want to put on? [d]', choices: 'd', requestId: 'req-puton-item', transactionId: 'txn-puton-ring' });
  process(view, { name: 'bridge_command', keycode: 'd'.charCodeAt(0), transactionId: 'txn-puton-selector', guiAction: { ...ringAction, commandPosition: 2 } });
  let tx = view.state.commandTransactions.byId.get('txn-puton-ring');
  assert.equal(tx.interactions.find((entry) => entry.kind === 'answer-key').followupOwnership.matchesTargetSelector, true, 'put-on selector belongs to GUI ring action');
  process(view, { name: 'bridge_prompt_answer', keycode: 'd'.charCodeAt(0), requestId: 'req-puton-item', transactionId: 'txn-puton-ring' });
  process(view, { name: 'shim_yn_function', query: 'Right or left ring-finger? [rl]', choices: 'rl', requestId: 'req-puton-hand', transactionId: 'txn-puton-ring' });
  process(view, { name: 'bridge_command', keycode: 'r'.charCodeAt(0), transactionId: 'txn-puton-hand-r', guiAction: { ...ringAction, targetSelector: 'r', commandPosition: 3, commandLength: 3 } });
  tx = view.state.commandTransactions.byId.get('txn-puton-ring');
  assert(tx.interactions.some((entry) => entry.kind === 'prompt' && /ring-finger/i.test(entry.query || '')), 'ring hand follow-up prompt is owned by the semantic transaction');
  assert(tx.interactions.some((entry) => entry.kind === 'answer-key' && entry.key === 'r'), 'ring hand answer is recorded as follow-up');
  process(view, { name: 'bridge_prompt_answer', keycode: 'r'.charCodeAt(0), requestId: 'req-puton-hand', transactionId: 'txn-puton-ring' });
  const completed = process(view, inv([item('d', 'an uncursed granite ring (on right hand)', 0x00040000, 444)], { transactionId: 'txn-puton-ring', inventoryRevision: 1, equipmentRevision: 1 }));
  const completion = completed.effects.find((effect) => effect.type === 'command-transaction-completed');
  assert.equal(completion.result.actionId, 'item.putOn.ring');
  assert(completion.delta.equipment.slotsChanged.some((slot) => slot.slotId === 'ring.right'), 'put-on ring completion links the public equipment delta');
}

{
  const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
  process(view, inv([item('j', 'a scroll labeled KIRJE', 0, 333)], { inventoryRevision: 1, equipmentRevision: 1 }));
  const readAction = guiAction('item.read.scroll', 'Read', 'j', 'j - a scroll labeled KIRJE', []);
  process(view, { name: 'bridge_command', keycode: 'r'.charCodeAt(0), transactionId: 'txn-read-cancel', guiAction: readAction });
  process(view, { name: 'shim_yn_function', query: 'What do you want to read? [j]', choices: 'j', requestId: 'req-read-cancel', transactionId: 'txn-read-cancel' });
  const cancelled = process(view, { name: 'bridge_prompt_answer', keycode: 27, requestId: 'req-read-cancel', transactionId: 'txn-read-cancel' });
  const failure = cancelled.effects.find((effect) => effect.type === 'command-transaction-completed');
  assert.equal(failure?.result?.status, 'failure', 'Esc/cancel completes semantic action as failure rather than success');
  assert.match(failure?.result?.reason || '', /cancelled/i);
  const afterCancelSnapshot = process(view, inv([item('j', 'a scroll labeled KIRJE', 0, 333)], { transactionId: 'txn-read-cancel', inventoryRevision: 2, equipmentRevision: 2 }));
  assert(afterCancelSnapshot.effects.some((effect) => effect.type === 'command-transaction-completion-rejected'), 'post-cancel unchanged snapshot cannot turn cancellation into success');
}

{
  const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
  const nameAction = guiAction('item.name', 'Name this item', 'b', 'b - an uncursed dagger', ['text']);
  process(view, { name: 'bridge_command', keycode: '#'.charCodeAt(0), transactionId: 'txn-line-cancel', guiAction: nameAction });
  process(view, { name: 'shim_getlin', query: 'What do you want to name this item?', requestId: 'req-name-line', transactionId: 'txn-line-cancel' });
  const cancelled = process(view, { name: 'bridge_line_answer', value: '', requestId: 'req-name-line', transactionId: 'txn-line-cancel' });
  assert(cancelled.effects.some((effect) => effect.type === 'command-transaction-completed' && effect.result.status === 'failure' && /cancelled/i.test(effect.result.reason)), 'empty line-input answer cancels semantic text action instead of later succeeding');
}

{
  const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
  const ringAction = guiAction('item.putOn.ring', 'Put on ring', 'd', 'd - an uncursed granite ring', ['hand']);
  process(view, { name: 'bridge_command', keycode: 'P'.charCodeAt(0), transactionId: 'txn-stale-followup', guiAction: ringAction });
  process(view, { name: 'shim_yn_function', query: 'What do you want to put on? [d]', choices: 'd', requestId: 'req-current-ring', transactionId: 'txn-stale-followup' });
  const rejected = process(view, { name: 'bridge_semantic_followup_rejected', keycode: 'd'.charCodeAt(0), reason: 'expected prompt request id does not match active prompt', transactionId: 'txn-stale-followup', guiAction: { ...ringAction, expectedRequestId: 'req-stale-ring' } });
  assert(rejected.effects.some((effect) => effect.type === 'command-transaction-followup-rejected'), 'bridge-level stale semantic follow-up rejection is recorded');
  assert(rejected.effects.some((effect) => effect.type === 'command-transaction-completed' && effect.result.status === 'failure'), 'active semantic action fails instead of consuming a stale follow-up key');
  assert.equal(view.state.activePrompt.requestId, 'req-current-ring', 'stale semantic follow-up rejection does not close the current prompt');
}

{
  const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
  const throwAction = guiAction('item.throw', 'Throw', 'b', 'b - an uncursed dagger', ['target']);
  process(view, { name: 'bridge_command', keycode: 't'.charCodeAt(0), transactionId: 'txn-throw-dagger', guiAction: throwAction });
  const queuedSelector = process(view, { name: 'bridge_command', keycode: 'b'.charCodeAt(0), transactionId: 'txn-throw-selector', guiAction: { ...throwAction, commandPosition: 2 } });
  assert(queuedSelector.effects.some((effect) => effect.type === 'command-input-routed-to-active-semantic-sequence'), 'queued direct selector cannot start a stale raw-key transaction before NetHack opens the prompt');
  assert.equal(view.state.commandTransactions.byId.has('txn-throw-selector'), false, 'queued selector aliases to semantic throw parent instead of becoming key b/fire-like transaction');
}

{
  const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
  const dropAction = guiAction('item.drop', 'Drop', 'b', 'b - an uncursed dagger', ['quantity']);
  process(view, { name: 'bridge_command', keycode: 'd'.charCodeAt(0), transactionId: 'txn-drop-dagger', guiAction: dropAction });
  const failed = process(view, { name: 'bridge_input_queue_full', keycode: 'd'.charCodeAt(0), transactionId: 'txn-drop-dagger', guiAction: dropAction });
  const failure = failed.effects.find((effect) => effect.type === 'command-transaction-completed');
  assert(failure, 'semantic GUI action failure is explicit');
  assert.equal(failure.result.status, 'failure');
  assert.equal(failure.result.actionId, 'item.drop');
  assert.equal(failure.result.target.selector, 'b');
}

console.log('semantic-action-acknowledgement-test PASS');
