const assert = require('node:assert/strict');
const ShimProtocol = require('../src/shared/shim-protocol');
const GameViewState = require('../src/shared/game-view-state');
const MenuMetadataAdapter = require('../src/shared/menu-metadata-adapter');

function process(view, event) {
  return view.process(event);
}

// Shared protocol must preserve additive lifecycle fields from shim/main without
// treating them as private renderer-only state.
const normalized = ShimProtocol.normalizeRawShimEvent({
  name: 'shim_start_menu',
  window: 90,
  menuId: 'menu-explicit',
  requestId: 'req-explicit',
  transactionId: 'txn-explicit',
  lifecycleRevision: 12,
  owner: { kind: 'container', window: 90 },
  requestSource: { layer: 'shim-bridge', command: '#loot' },
});
assert.equal(normalized.valid, true, 'shim_start_menu with lifecycle metadata validates');
assert.equal(normalized.event.requestId, 'req-explicit', 'requestId preserved by shim protocol');
assert.equal(normalized.event.transactionId, 'txn-explicit', 'transactionId preserved by shim protocol');
assert.equal(normalized.event.lifecycleRevision, 12, 'lifecycleRevision preserved by shim protocol');

// Adapter fallback ids are revisioned. Old v1 windows are not stable forever;
// request identity changes when a new lifecycle opens on the same NetHack window.
const revisionedMetadata = MenuMetadataAdapter.deriveV1MenuMetadata({
  window: 90,
  lifecycleRevision: 7,
  prompt: 'Take out what?',
  how: 2,
  awaitingSelection: true,
  items: [{ selector: 97, text: 'a - an apple' }],
});
assert.equal(revisionedMetadata.requestId, 'v1-menu-90-r7', 'revisioned fallback request id includes lifecycle revision');
assert.equal(revisionedMetadata.transactionId, 'v1-transaction-v1-menu-90-r7', 'fallback transaction id is stable and non-empty');
assert.equal(revisionedMetadata.owner.kind, 'container', 'container menu owner derived from purpose');

const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
process(view, { name: 'bridge_command', keycode: 'i'.charCodeAt(0) });
process(view, { name: 'shim_start_menu', window: 40 });
const requestId = view.snapshot().currentMenu.requestId;
const transactionId = view.snapshot().currentMenu.transactionId;
const lifecycleRevision = view.snapshot().currentMenu.lifecycleRevision;
assert.match(requestId, /^v1-menu-40-r\d+$/, 'start_menu creates revisioned request id');
assert.match(transactionId, /^v1-command-1-i$/, 'menu inherits active command transaction id');
process(view, { name: 'shim_add_menu', window: 40, selector: 97, text: 'a - a food ration', semanticKind: 'object' });
process(view, { name: 'shim_end_menu', window: 40, prompt: 'Inventory:' });
process(view, { name: 'shim_select_menu', window: 40, how: 0 });
assert.equal(view.snapshot().currentMenu.requestId, requestId, 'request id is stable across start/add/end/select');
assert.equal(view.snapshot().currentMenu.transactionId, transactionId, 'transaction id is stable across start/add/end/select');
assert.equal(view.snapshot().currentMenu.lifecycleRevision, lifecycleRevision, 'lifecycle revision is stable across menu lifecycle');
assert.equal(view.snapshot().activePrompt.requestId, requestId, 'menu selection prompt shares menu request id');
assert.equal(view.snapshot().activePrompt.transactionId, transactionId, 'menu selection prompt shares menu transaction id');
assert.equal(view.snapshot().activePrompt.kind, 'read-only menu', 'read-only information menu remains a legitimate prompt owner');

const staleAdd = process(view, { name: 'shim_add_menu', window: 40, requestId: 'stale-request', selector: 98, text: 'b - stale item' });
assert(staleAdd.effects.some((effect) => effect.type === 'menu-event-rejected'), 'stale add_menu with wrong request id is rejected');
assert(!view.snapshot().currentMenu.items.some((item) => /stale item/.test(item.text)), 'rejected stale add_menu does not mutate current menu');

const wrongWindowAnswer = process(view, { name: 'bridge_menu_answer', window: 999, return: 0 });
assert(wrongWindowAnswer.effects.some((effect) => effect.type === 'menu-answer-event-rejected'), 'wrong-window untagged menu answer is rejected while a request-owned menu is active');
assert(view.snapshot().currentMenu, 'wrong-window untagged menu answer does not close active menu');
const wrongWindowStaleAnswer = process(view, { name: 'bridge_menu_answer', window: 999, requestId: 'stale-request', return: 0 });
assert(wrongWindowStaleAnswer.effects.some((effect) => effect.type === 'menu-answer-event-rejected'), 'wrong-window stale menu answer is rejected while a request-owned menu is active');
assert(view.snapshot().currentMenu, 'wrong-window stale menu answer does not close active menu');
const missingAnswer = process(view, { name: 'bridge_menu_answer', window: 40, return: 0 });
assert(missingAnswer.effects.some((effect) => effect.type === 'menu-answer-event-rejected'), 'untagged menu answer is rejected while a request-owned menu is active');
assert(view.snapshot().currentMenu, 'untagged menu answer does not close active menu');
const staleAnswer = process(view, { name: 'bridge_menu_answer', window: 40, requestId: 'stale-request', return: 0 });
assert(staleAnswer.effects.some((effect) => effect.type === 'menu-answer-event-rejected'), 'stale menu answer with wrong request id is rejected');
assert(view.snapshot().currentMenu, 'stale menu answer does not close active menu');
const readOnlyContinueAnswer = process(view, { name: 'bridge_menu_answer', window: 40, requestId, transactionId, inputTransactionId: transactionId, return: 0 });
assert.equal(view.snapshot().currentMenu, null, 'matching menu answer closes active menu');
assert(!readOnlyContinueAnswer.effects.some((effect) => effect.type === 'command-transaction-completed' && effect.result?.status === 'failure'), 'continuing a read-only information menu does not cancel the command which opened it');

const promptView = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
process(promptView, { name: 'bridge_command', keycode: '#'.charCodeAt(0) });
process(promptView, { name: 'shim_yn_function', query: 'Really quit? [yn]', choices: 'yn', lifecycleRevision: 10, requestId: 'req-current' });
assert.equal(promptView.snapshot().activePrompt.requestId, 'req-current', 'prompt request id preserved');
assert.equal(promptView.snapshot().activePrompt.transactionId, 'v1-command-1--', 'prompt inherits command transaction id');
const stalePrompt = process(promptView, { name: 'shim_yn_function', query: 'What do you want to eat? [a]', choices: 'a', lifecycleRevision: 9, requestId: 'req-old' });
assert(stalePrompt.effects.some((effect) => effect.type === 'prompt-event-rejected'), 'older lifecycle prompt is rejected');
assert.equal(promptView.snapshot().activePrompt.query, 'Really quit? [yn]', 'rejected stale prompt cannot steal active prompt ownership');
const missingPromptAnswer = process(promptView, { name: 'bridge_prompt_answer', keycode: 'y'.charCodeAt(0) });
assert(missingPromptAnswer.effects.some((effect) => effect.type === 'prompt-answer-event-rejected'), 'untagged prompt answer is rejected while a request-owned prompt is active');
assert.equal(promptView.snapshot().activePrompt.requestId, 'req-current', 'untagged prompt answer does not close current prompt');
const stalePromptAnswer = process(promptView, { name: 'bridge_prompt_answer', requestId: 'req-old', keycode: 'y'.charCodeAt(0) });
assert(stalePromptAnswer.effects.some((effect) => effect.type === 'prompt-answer-event-rejected'), 'stale prompt answer is rejected');
assert.equal(promptView.snapshot().activePrompt.requestId, 'req-current', 'stale prompt answer does not close current prompt');
process(promptView, { name: 'bridge_prompt_answer', requestId: 'req-current', keycode: 'n'.charCodeAt(0) });
assert.equal(promptView.snapshot().activePrompt, null, 'matching prompt answer closes current prompt');

const autoView = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
process(autoView, { name: 'shim_yn_function', query: 'Really pray? [yn]', choices: 'yn', requestId: 'visible-prompt' });
process(autoView, { name: 'shim_yn_function', query: 'Which ring-finger, Right or Left? [rl]', choices: 'rl', requestId: 'auto-ring', autoAnswered: true, autoAnswerReason: 'queued-ring-finger' });
assert.equal(autoView.snapshot().activePrompt.requestId, 'visible-prompt', 'auto-answered GUI ring-finger prompt does not steal visible prompt ownership');
const autoAnswer = process(autoView, { name: 'bridge_prompt_answer', requestId: 'auto-ring', keycode: 'r'.charCodeAt(0), autoAnswered: true, autoAnswerReason: 'queued-ring-finger' });
assert(autoAnswer.effects.some((effect) => effect.type === 'prompt-answer-event-rejected'), 'auto-answered ring answer with its own request cannot close unrelated visible prompt');
assert.equal(autoView.snapshot().activePrompt.requestId, 'visible-prompt', 'auto-answered GUI ring-finger answer does not clear unrelated prompt');
process(autoView, { name: 'bridge_prompt_answer', requestId: 'visible-prompt', keycode: 'n'.charCodeAt(0) });
assert.equal(autoView.snapshot().activePrompt, null, 'matching visible prompt answer clears prompt');
process(autoView, { name: 'shim_yn_function', query: 'Which ring-finger, Right or Left? [rl]', choices: 'rl', autoAnswered: true, autoAnswerReason: 'queued-ring-finger' });
assert.equal(autoView.snapshot().activePrompt, null, 'auto-answered GUI ring-finger prompt remains hidden when no prompt is active');
const manualRing = process(autoView, { name: 'shim_yn_function', query: 'Which ring-finger, Right or Left? [rl]', choices: 'rl' });
assert.equal(autoView.snapshot().activePrompt.promptPurpose, 'prompt.equipmentRingFinger', 'manual ring-finger prompt remains visible and classified');
assert.equal(autoView.snapshot().activePrompt.owner.kind, 'equipment', 'manual ring-finger prompt has equipment owner');
assert(manualRing.effects.some((effect) => effect.type === 'render-prompt'), 'manual ring-finger prompt renders');

console.log('prompt-menu-lifecycle-test PASS');
