const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ShimProtocol = require('../src/shared/shim-protocol');
const GameViewState = require('../src/shared/game-view-state');
const MenuMetadataAdapter = require('../src/shared/menu-metadata-adapter');
const UiProtocolV2 = require('../src/shared/ui-protocol-v2');
const InteractionModel = require('../src/shared/interaction-model');

const root = path.resolve(__dirname, '..');
const cases = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/menu-metadata-comparison/golden-cases.json'), 'utf8'));

function validateAdaptedEvents(name, menu, context) {
  const events = MenuMetadataAdapter.adaptV1MenuSnapshotToV2Events(menu, { ...context, sequenceStart: 10, turn: 0 });
  assert(events.length >= 2, `${name}: adapter emits opened/ready events`);
  assert.equal(events[0].eventType, 'menu.opened', `${name}: first lifecycle event is menu.opened`);
  assert(events.some((event) => event.eventType === 'menu.ready'), `${name}: lifecycle includes menu.ready`);
  if (Number(menu.how || 0) > 0 || menu.awaitingSelection) assert(events.some((event) => event.eventType === 'menu.selecting'), `${name}: selectable menu includes menu.selecting`);
  for (const event of events) {
    const checked = UiProtocolV2.validateEventEnvelope(event);
    assert.equal(checked.ok, true, `${name}: adapted ${event.eventType} validates: ${checked.errors.join(', ')}`);
    assert.equal(event.payload.menuPurpose || event.payload.item?.menuPurpose, event.eventType === 'menu.item' ? event.payload.item?.menuPurpose : event.payload.menuPurpose, `${name}: event is stable`);
  }
  assert.equal(UiProtocolV2.validateEventSequence(events).ok, true, `${name}: adapted lifecycle sequence is monotonic`);
  return events;
}

for (const testCase of cases) {
  const comparison = MenuMetadataAdapter.compareMenuMetadata(testCase.menu, testCase.context || {});
  assert.equal(comparison.menuPurpose, testCase.expectedPurpose, `${testCase.name}: structured purpose`);
  assert.equal(comparison.oldHeuristicPurpose, testCase.expectedHeuristicPurpose, `${testCase.name}: legacy heuristic purpose`);
  assert.equal(comparison.mismatch, testCase.expectedPurpose !== testCase.expectedHeuristicPurpose, `${testCase.name}: mismatch flag`);
  if (testCase.expectedRequestId) assert.equal(comparison.requestId, testCase.expectedRequestId, `${testCase.name}: explicit request id preserved`);
  const events = validateAdaptedEvents(testCase.name, testCase.menu, testCase.context || {});
  const ready = events.find((event) => event.eventType === 'menu.ready');
  assert.equal(ready.payload.menuPurpose, testCase.expectedPurpose, `${testCase.name}: ready event carries menuPurpose`);
  assert(ready.payload.owner?.kind, `${testCase.name}: owner kind is present`);
  assert(ready.payload.requestSource?.layer, `${testCase.name}: request/source info is present`);
}

const normalizedWithMetadata = ShimProtocol.normalizeRawShimEvent({
  name: 'shim_end_menu',
  window: 30,
  prompt: 'Inventory:',
  menuPurpose: 'inventory.overview',
  menuRequestId: 'req-v1-preserve',
  requestSource: { layer: 'shim-bridge', command: 'inventory' },
  owner: { kind: 'inventory' },
  selectionMode: 'none',
});
assert.equal(normalizedWithMetadata.valid, true, 'v1 shim_end_menu with additive metadata remains valid');
assert.equal(normalizedWithMetadata.event.menuPurpose, 'inventory.overview', 'v1 menuPurpose preserved');
assert.equal(normalizedWithMetadata.event.menuRequestId, 'req-v1-preserve', 'v1 menuRequestId preserved');
assert.equal(normalizedWithMetadata.event.requestSource.command, 'inventory', 'v1 requestSource preserved');

const view = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
view.process({ name: 'bridge_command', keycode: 'i'.charCodeAt(0) });
view.process({ name: 'shim_start_menu', window: 40, menuRequestId: 'req-state-menu', requestSource: { layer: 'shim-bridge', command: 'inventory' } });
view.process({ name: 'shim_add_menu', window: 40, selector: 97, text: 'a - a food ration', semanticKind: 'object' });
view.process({ name: 'shim_end_menu', window: 40, prompt: 'Inventory:', menuPurpose: 'inventory.overview' });
view.process({ name: 'shim_select_menu', window: 40, how: 0 });
assert.equal(view.state.currentMenu.menuPurpose, 'inventory.overview', 'game-view-state stores current menu purpose');
assert.equal(view.state.currentMenu.requestId, 'req-state-menu', 'game-view-state stores current menu request id');
assert.equal(view.state.currentMenu.owner.kind, 'inventory', 'game-view-state stores current menu owner');
assert.equal(view.state.currentMenu.selectionMode, 'none', 'game-view-state stores selection mode');
assert.equal(view.state.currentMenu.lifecycle, 'ready', 'game-view-state stores lifecycle facts');

const selectableView = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
selectableView.process({ name: 'shim_start_menu', window: 41 });
selectableView.process({ name: 'shim_add_menu', window: 41, selector: 97, text: 'a - a food ration', semanticKind: 'object' });
selectableView.process({ name: 'shim_end_menu', window: 41, prompt: 'Pick up what?' });
selectableView.process({ name: 'shim_select_menu', window: 41, how: 2 });
assert.equal(selectableView.state.currentMenu.selectionMode, 'many', 'select_menu how=2 updates selection mode');
assert.equal(selectableView.state.currentMenu.lifecycle, 'selecting', 'selectable menu lifecycle becomes selecting');
const selectableRequestId = selectableView.state.currentMenu.requestId;
selectableView.process({ name: 'bridge_menu_answer', window: 41, requestId: selectableRequestId, return: 1, selectors: 'a' });
assert.equal(selectableView.state.currentMenu, null, 'bridge_menu_answer closes stale current menu in shared state');
assert.equal(selectableView.state.menusByWindow.has(41), false, 'bridge_menu_answer clears answered menu window history');
assert.equal(selectableView.state.pendingMenuSelections.has(41), false, 'bridge_menu_answer clears pending menu selection state');
selectableView.process({ name: 'shim_yn_function', query: 'Really proceed? [yn]', choices: 'yn' });
assert.equal(selectableView.state.currentMenu, null, 'follow-up prompt does not coexist with stale current menu');
assert.equal(selectableView.state.activePrompt.promptPurpose, 'prompt.question', 'follow-up prompt remains active with metadata');

const cancelView = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
cancelView.process({ name: 'shim_start_menu', window: 44 });
cancelView.process({ name: 'shim_add_menu', window: 44, selector: 97, text: 'a - a food ration', semanticKind: 'object' });
cancelView.process({ name: 'shim_end_menu', window: 44, prompt: 'Pick up what?' });
cancelView.process({ name: 'shim_select_menu', window: 44, how: 2 });
const cancelRequestId = cancelView.state.currentMenu.requestId;
cancelView.process({ name: 'bridge_menu_answer', window: 44, requestId: cancelRequestId, return: 0, selectors: '' });
assert.equal(cancelView.state.currentMenu, null, 'canceled selectable bridge_menu_answer clears current menu');
assert.equal(cancelView.state.menusByWindow.has(44), false, 'canceled selectable bridge_menu_answer clears menu window history');
cancelView.process({ name: 'shim_yn_function', query: 'Really quit? [yn]', choices: 'yn' });
assert.equal(cancelView.state.currentMenu, null, 'follow-up prompt after canceled selectable menu has no stale current menu');
assert.equal(cancelView.state.activePrompt.promptPurpose, 'prompt.question', 'follow-up prompt after cancel remains active with metadata');

const promptlessView = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
promptlessView.process({ name: 'bridge_command', keycode: 'i'.charCodeAt(0) });
promptlessView.process({ name: 'shim_start_menu', window: 42 });
promptlessView.process({ name: 'shim_add_menu', window: 42, selector: 97, text: 'a - a +0 dagger', semanticKind: 'object' });
promptlessView.process({ name: 'shim_end_menu', window: 42, prompt: '' });
promptlessView.process({ name: 'shim_select_menu', window: 42, how: 0 });
assert.equal(promptlessView.state.currentMenu.menuPurpose, 'inventory.overview', 'promptless inventory uses last inventory command context in shared state');

const unknownEvents = MenuMetadataAdapter.adaptV1MenuSnapshotToV2Events({ window: 43, prompt: 'Inventory:', how: 0, items: [{ selector: 97, text: 'a - a milky potion', semanticKind: 'object', semanticName: 'potion of gain level', semanticAppearance: 'milky potion', semanticKnown: false }] }, { sequenceStart: 90 });
const unknownItem = unknownEvents.find((event) => event.eventType === 'menu.item').payload.item;
assert.equal(unknownItem.semanticName, undefined, 'v2 menu.item omits hidden semanticName when semanticKnown is false');
assert.equal(unknownItem.semanticAppearance, 'milky potion', 'v2 menu.item keeps public appearance');

view.process({ name: 'shim_yn_function', query: 'What do you want to read? [a-b]', choices: 'ab' });
assert.equal(view.state.activePrompt.promptPurpose, 'prompt.itemAction', 'active prompt stores prompt purpose');
assert.equal(view.state.activePrompt.owner.kind, 'action', 'active prompt stores owner');
assert(view.state.activePrompt.requestId, 'active prompt stores request id');
const promptEvent = MenuMetadataAdapter.adaptV1PromptToV2Event({ name: 'shim_yn_function', query: 'In what direction?', choices: 'hjklyubn.' }, { sequence: 80 });
const promptChecked = UiProtocolV2.validateEventEnvelope(promptEvent);
assert.equal(promptChecked.ok, true, `prompt adapter validates: ${promptChecked.errors.join(', ')}`);
assert.equal(promptEvent.payload.promptPurpose, 'prompt.direction', 'prompt adapter preserves direction purpose');

const mismatch = MenuMetadataAdapter.compareMenuMetadata({ window: 50, prompt: 'Inventory:', how: 0, menuPurpose: 'system.help', menuPurposeExplicit: true, items: [{ selector: 97, text: 'a - a food ration' }] }, { lastWorldCommand: 'i' });
assert.equal(mismatch.mismatch, true, 'comparison diagnostics detect structured-vs-heuristic disagreement');
assert.equal(mismatch.oldHeuristicPurpose, 'inventory.overview', 'mismatch keeps legacy heuristic purpose for dev evidence');
assert.equal(mismatch.menuPurpose, 'system.help', 'mismatch keeps structured purpose for dev evidence');

const farlookTipMenu = {
  window: 260,
  prompt: 'Menu',
  how: 0,
  awaitingSelection: true,
  items: [
    { selector: 0, text: 'Tip: Farlooking or selecting a map location' },
    { selector: 0, text: '' },
    { selector: 0, text: 'not your character. Game time does not advance. This mode is used' },
  ],
};
assert.equal(InteractionModel.menuKind(farlookTipMenu), 'menu', 'read-only farlook tip is not misclassified as spell from the word advance');
assert.equal(InteractionModel.buildMenuInteraction(farlookTipMenu).title, 'Tip', 'read-only farlook tip uses information title');
assert.equal(MenuMetadataAdapter.compareMenuMetadata(farlookTipMenu).menuPurpose, 'menu.generic', 'farlook tip remains a generic information menu, not spell.choice');

console.log('menu-metadata-comparison-test PASS');
