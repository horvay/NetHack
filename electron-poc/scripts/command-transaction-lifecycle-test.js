const assert = require('node:assert/strict');
const ShimProtocol = require('../src/shared/shim-protocol');
const GameViewState = require('../src/shared/game-view-state');
const CommandTransactionModel = require('../src/shared/command-transaction-model');

function process(view, event) { return view.process(event); }
function inv(items, extra = {}) { return { name: 'shim_update_inventory', reason: -2, ...extra, items }; }
function item(letter, text, wornMask = 0, objectId) { return { selector: letter.charCodeAt(0), text: `${letter} - ${text}`, objectId, quantity: 1, wornMask, glyphChar: ')'.charCodeAt(0), semanticKind: 'object', semanticKnown: true, semanticName: text }; }

assert.equal(CommandTransactionModel.commandNameForKey('W'), 'wear', 'wear command is semantic');
const normalizedInventory = ShimProtocol.normalizeRawShimEvent(inv([item('a', 'leather armor')], { transactionId: 'txn-wear-1', inventoryRevision: 1, equipmentRevision: 1 }));
assert.equal(normalizedInventory.valid, true, 'inventory update with transaction id validates');
assert.equal(normalizedInventory.event.transactionId, 'txn-wear-1', 'inventory transaction id is preserved');

const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
let result = process(view, { name: 'bridge_command', keycode: 'W'.charCodeAt(0), transactionId: 'txn-wear-1' });
assert(result.effects.some((effect) => effect.type === 'command-transaction-started'), 'bridge_command starts command transaction');
assert.equal(view.state.commandTransactions.activeId, 'txn-wear-1', 'active transaction id is tracked');
assert.equal(view.state.commandTransactions.byId.get('txn-wear-1').semanticAction, 'wear', 'transaction has semantic action');

result = process(view, { name: 'shim_yn_function', query: 'What do you want to wear? [a]', choices: 'a', requestId: 'req-wear-item', transactionId: 'txn-wear-1' });
assert.equal(view.state.activePrompt.transactionId, 'txn-wear-1', 'prompt preserves transaction id');
assert.equal(view.state.commandTransactions.byId.get('txn-wear-1').lifecycle, 'awaiting-question', 'prompt updates transaction lifecycle');

const answerKey = process(view, { name: 'bridge_command', keycode: 'a'.charCodeAt(0), transactionId: 'txn-selector-a' });
assert(answerKey.effects.some((effect) => effect.type === 'command-input-routed-to-active-interaction'), 'selector key is routed to the active prompt, not a new command transaction');
assert.equal(view.state.commandTransactions.activeId, 'txn-wear-1', 'selector key does not steal the command transaction');
assert.equal(view.state.commandTransactions.byId.has('txn-selector-a'), false, 'selector key transaction id is ignored while prompt owns input');
process(view, { name: 'bridge_prompt_answer', keycode: 'a'.charCodeAt(0), requestId: 'req-wear-item', transactionId: 'txn-wear-1' });

result = process(view, inv([item('a', 'leather armor', 0x00000001, 101)], { transactionId: 'txn-wear-1', inventoryRevision: 1, equipmentRevision: 1 }));
const completion = result.effects.find((effect) => effect.type === 'command-transaction-completed');
assert(completion, 'accepted inventory/equipment snapshot completes transaction');
assert.equal(completion.transaction.result.status, 'success', 'completion is success');
assert.equal(completion.transaction.result.kind, 'public-state-updated', 'completion reports public state update');
assert(completion.delta.inventory.added.some((entry) => /leather armor/i.test(entry.displayName)), 'inventory delta includes added item');
assert(completion.delta.equipment.slotsChanged.some((slot) => slot.slotId === 'armor.body' && /leather armor/i.test(slot.after.displayName)), 'equipment delta includes worn armor slot');
assert.equal(view.state.commandTransactions.activeId, undefined, 'completed transaction clears active id');
const duplicateDirectCompletion = process(view, inv([item('a', 'leather armor', 0x00000001, 101)], { transactionId: 'txn-wear-1', inventoryRevision: 2, equipmentRevision: 2 }));
assert(duplicateDirectCompletion.effects.some((effect) => effect.type === 'command-transaction-completion-rejected'), 'duplicate explicit completion for an already completed direct transaction is rejected');

process(view, { name: 'bridge_command', keycode: 'd'.charCodeAt(0), transactionId: 'txn-drop-2' });
const stale = process(view, inv([], { transactionId: 'txn-wear-1', inventoryRevision: 2, equipmentRevision: 2 }));
assert(stale.effects.some((effect) => effect.type === 'command-transaction-completion-rejected'), 'stale completion for old transaction is rejected');
assert.equal(view.state.commandTransactions.activeId, 'txn-drop-2', 'stale completion does not clear newer active transaction');
assert.equal(view.state.inventory.revision, 2, 'state can still accept newer public snapshot while rejecting stale transaction completion metadata');

const unknownExplicit = process(view, inv([item('b', 'unknown transaction apple', 0, 202)], { transactionId: 'unknown-explicit-txn', inventoryRevision: 3, equipmentRevision: 3 }));
assert(unknownExplicit.effects.some((effect) => effect.type === 'command-transaction-completion-rejected'), 'unknown explicit transaction id is rejected instead of completing the active transaction');
assert.equal(view.state.commandTransactions.activeId, 'txn-drop-2', 'unknown explicit transaction rejection does not clear active transaction');

const beforeStaleSnapshot = view.state.inventory.revision;
const staleSnapshot = process(view, inv([item('z', 'stale scroll', 0, 999)], { transactionId: 'txn-drop-2', inventoryRevision: 1, equipmentRevision: 1 }));
assert(staleSnapshot.effects.some((effect) => effect.type === 'inventory-snapshot-rejected'), 'older inventory snapshot revision is rejected');
assert.equal(view.state.inventory.revision, beforeStaleSnapshot, 'stale snapshot cannot roll back public inventory revision');

const menuCompletionView = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
process(menuCompletionView, inv([item('f', 'an uncursed -1 wooden shield (being worn)', 0x00000008, 501)], { inventoryRevision: 1, equipmentRevision: 1 }));
process(menuCompletionView, { name: 'bridge_command', keycode: 'T'.charCodeAt(0), transactionId: 'txn-takeoff-menu' });
const refreshInput = process(menuCompletionView, { name: 'bridge_command', keycode: 'i'.charCodeAt(0), transactionId: 'txn-refresh-i' });
assert(refreshInput.effects.some((effect) => effect.type === 'command-input-routed-to-active-transaction-refresh'), 'inventory refresh key is attached to the pending semantic equipment transaction');
process(menuCompletionView, { name: 'shim_start_menu', window: 77, transactionId: 'txn-takeoff-menu' });
process(menuCompletionView, { name: 'shim_add_menu', window: 77, selector: 'f'.charCodeAt(0), text: 'f - an uncursed -1 wooden shield', objectId: 501, glyphChar: ')'.charCodeAt(0), semanticKind: 'object', semanticName: 'wooden shield', semanticKnown: true, transactionId: 'txn-takeoff-menu' });
const menuCompleted = process(menuCompletionView, { name: 'shim_end_menu', window: 77, prompt: 'Inventory:', transactionId: 'txn-takeoff-menu' });
process(menuCompletionView, { name: 'shim_select_menu', window: 77, how: 0, transactionId: 'txn-takeoff-menu' });
const menuCompletion = menuCompleted.effects.find((effect) => effect.type === 'command-transaction-completed');
assert(menuCompletion, 'public inventory menu rows can complete a semantic equipment transaction when no shim_update_inventory arrives');
assert.equal(menuCompletion.transaction.semanticAction, 'take off', 'menu-row completion preserves original semantic action, not refresh i');
assert(menuCompletion.delta.equipment.slotsChanged.some((slot) => slot.slotId === 'armor.shield'), 'menu-row completion includes public equipment slot delta');

const aliasView = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
process(aliasView, { name: 'bridge_command', keycode: 'W'.charCodeAt(0), transactionId: 'txn-alias-wear' });
process(aliasView, { name: 'shim_yn_function', query: 'What do you want to wear? [a]', choices: 'a', requestId: 'req-alias-wear', transactionId: 'txn-alias-wear' });
process(aliasView, { name: 'bridge_command', keycode: 'a'.charCodeAt(0), transactionId: 'txn-alias-selector-a' });
const aliasComplete = process(aliasView, inv([item('a', 'leather armor', 0x00000001, 777)], { transactionId: 'txn-alias-selector-a', inventoryRevision: 1, equipmentRevision: 1 }));
assert(aliasComplete.effects.some((effect) => effect.type === 'command-transaction-completed'), 'known alias transaction id can complete its active semantic parent');
const duplicateAlias = process(aliasView, inv([item('a', 'leather armor', 0x00000001, 777)], { transactionId: 'txn-alias-selector-a', inventoryRevision: 2, equipmentRevision: 2 }));
assert(duplicateAlias.effects.some((effect) => effect.type === 'command-transaction-completion-rejected'), 'duplicate/stale alias completion is rejected after parent transaction completed');

const failView = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
process(failView, { name: 'bridge_command', keycode: 'W'.charCodeAt(0), transactionId: 'txn-fail-1' });
const failed = process(failView, { name: 'bridge_input_queue_full', keycode: 'W'.charCodeAt(0), transactionId: 'txn-fail-1' });
const failure = failed.effects.find((effect) => effect.type === 'command-transaction-completed');
assert(failure, 'queue-full marks matching transaction failed');
assert.equal(failure.result.status, 'failure', 'failure result is explicit');
assert.match(failure.result.reason, /queue/i, 'failure reason is player-debuggable');

process(failView, { name: 'bridge_command', keycode: 'd'.charCodeAt(0), transactionId: 'txn-fail-active' });
const staleFailure = process(failView, { name: 'bridge_input_queue_full', keycode: 'W'.charCodeAt(0), transactionId: 'txn-fail-1' });
assert(staleFailure.effects.some((effect) => effect.type === 'command-transaction-completion-rejected'), 'failure for an already completed old transaction is rejected');
assert.equal(failView.state.commandTransactions.activeId, 'txn-fail-active', 'stale failure does not clear newer active transaction');
assert.equal(failView.state.activeTransactionId, 'txn-fail-active', 'stale failure does not clear game-view active transaction pointer');
const completedFailure = process(failView, { name: 'bridge_input_queue_full', keycode: 'd'.charCodeAt(0), transactionId: 'txn-fail-active' });
assert(completedFailure.effects.some((effect) => effect.type === 'command-transaction-completed'), 'current active failure still completes as failed');
const repeatCompletedFailure = process(failView, { name: 'bridge_input_queue_full', keycode: 'd'.charCodeAt(0), transactionId: 'txn-fail-active' });
assert(repeatCompletedFailure.effects.some((effect) => effect.type === 'command-transaction-completion-rejected'), 'failure cannot overwrite an already failed/completed transaction');

console.log('command-transaction-lifecycle-test PASS');
