const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ShimProtocol = require('../src/shared/shim-protocol');
const GameViewState = require('../src/shared/game-view-state');
const MenuMetadataAdapter = require('../src/shared/menu-metadata-adapter');
const UiProtocolV2 = require('../src/shared/ui-protocol-v2');
const InteractionModel = require('../src/shared/interaction-model');
const RecordingSchema = require('../src/shared/recording-schema');
const ReplayAdapter = require('../src/shared/replay-adapter');

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

let nextMatrixSequence = 500;
function adaptedRow(menu, context = {}) {
  const events = MenuMetadataAdapter.adaptV1MenuSnapshotToV2Events(menu, { ...context, sequenceStart: nextMatrixSequence });
  nextMatrixSequence += events.length + 1;
  return events.find((event) => event.eventType === 'menu.item');
}
const selectableAction = { name: 'shim_add_menu', window: 70, selector: 97, text: 'a - Search for traps' };
const normalizedSelectableAction = ShimProtocol.normalizeRawShimEvent(selectableAction);
assert.equal(normalizedSelectableAction.event.text, selectableAction.text, 'selector/text alone remains exact at context-free shim ingress');
assert.equal(normalizedSelectableAction.event.semanticKnown, undefined, 'context-free selectable prose is not projected as an object');
for (const decoratedAction of [
  { ...selectableAction, glyphChar: 41 },
  { ...selectableAction, glyph: 123, glyphChar: 65 },
]) assert.equal(ShimProtocol.normalizeRawShimEvent(decoratedAction).event.text, selectableAction.text, 'decorative/sentinel glyph data alone does not classify selectable action prose as an object');
const glyphOnlyAction = ShimProtocol.normalizeRawShimEvent({ name: 'shim_add_menu', window: 70, selector: 97, text: 'a - Search for traps', glyph: 123, glyphChar: 41 });
assert.equal(glyphOnlyAction.event.text, 'a - Search for traps', 'glyph decoration never overrides missing object semantics before menu context');
const explicitObjectType = ShimProtocol.normalizeRawShimEvent({ name: 'shim_add_menu', window: 70, selector: 97, text: 'a - potion of gain level', glyph: 123, glyphChar: 41, objectClass: ')' });
assert.equal(explicitObjectType.event.text, 'a - item', 'explicit public object type projects a context-free object row safely');
const menuContextMatrix = [
  { id: 'action choice', menu: { prompt: 'Do what with the large box?', how: 1, awaitingSelection: true, items: [selectableAction] }, purpose: 'action.choice', text: selectableAction.text, object: false },
  { id: 'command choice', menu: { prompt: 'Choose a command', how: 1, awaitingSelection: true, items: [{ selector: 97, text: 'a - Search for traps' }] }, purpose: 'system.help', text: 'a - Search for traps', object: false },
  { id: 'help choice', menu: { prompt: 'Help', how: 1, awaitingSelection: true, items: [{ selector: 97, text: 'a - List of game commands' }] }, purpose: 'system.help', text: 'a - List of game commands', object: false },
  { id: 'manual choice', menu: { prompt: 'NetHack manual', how: 1, awaitingSelection: true, items: [{ selector: 97, text: 'a - What is a dungeon feature?' }] }, purpose: 'system.help', text: 'a - What is a dungeon feature?', object: false },
  { id: 'generic trap search', menu: { prompt: 'Choose an activity', how: 1, awaitingSelection: true, items: [{ selector: 97, text: 'a - Search for traps' }] }, purpose: 'menu.generic', text: 'a - Search for traps', object: false },
  { id: 'inventory overview', menu: { prompt: 'Inventory:', how: 0, items: [{ selector: 97, text: 'a - potion of gain level' }] }, purpose: 'inventory.overview', text: 'a - item', object: true },
  { id: 'native inventory purpose', menu: { prompt: 'Menu', how: 0, menuPurpose: 'inventory.displayInventory', menuPurposeExplicit: true, items: [{ selector: 97, text: 'a - potion of gain level' }] }, purpose: 'inventory.displayInventory', text: 'a - item', object: true },
  { id: 'authoritative historical inventory request', menu: { prompt: 'Menu', how: 0, items: [{ selector: 97, text: 'a - potion of gain level' }] }, context: { requestSource: { layer: 'v1-replay', command: 'inventory' } }, purpose: 'inventory.overview', text: 'a - item', object: true },
  { id: 'stale inventory command does not capture action prose', menu: { prompt: 'Menu', how: 1, awaitingSelection: true, items: [{ selector: 97, text: 'a - Search for traps' }] }, context: { lastWorldCommand: 'i' }, purpose: 'menu.generic', text: 'a - Search for traps', object: false },
  { id: 'stale inventory request source does not capture selectable action prose', menu: { prompt: 'Menu', how: 1, awaitingSelection: true, items: [{ selector: 97, text: 'a - Search for traps', glyph: 123, glyphChar: 41 }] }, context: { requestSource: { layer: 'renderer', command: 'inventory' } }, purpose: 'menu.generic', text: 'a - Search for traps', object: false },
  { id: 'pickup objects', menu: { prompt: 'Pick up what?', how: 2, awaitingSelection: true, items: [{ selector: 97, text: 'a - potion of gain level' }] }, purpose: 'ground.pickup', text: 'a - item', object: true },
  { id: 'drop objects', menu: { prompt: 'Drop what?', how: 2, awaitingSelection: true, items: [{ selector: 97, text: 'a - potion of gain level' }] }, purpose: 'inventory.objectChoice', text: 'a - item', object: true },
  { id: 'container takeout objects', menu: { prompt: 'Take out what?', how: 2, awaitingSelection: true, items: [{ selector: 97, text: 'a - potion of gain level' }] }, purpose: 'container.takeOut', text: 'a - item', object: true },
  { id: 'container putin objects', menu: { prompt: 'Put in what?', how: 2, awaitingSelection: true, items: [{ selector: 97, text: 'a - potion of gain level' }] }, purpose: 'container.putIn', text: 'a - item', object: true },
  { id: 'container actions', menu: { prompt: 'Do what with the large box?', how: 1, awaitingSelection: true, items: [{ selector: 97, text: 'a - Look inside' }] }, purpose: 'container.action', text: 'a - Look inside', object: false },
  { id: 'shop object selector', menu: { prompt: 'Pay for which items?', how: 2, awaitingSelection: true, items: [{ selector: 97, text: 'a - potion of gain level (unpaid)' }] }, purpose: 'transfer.classic', text: 'a - item', object: true },
  { id: 'read-only help', menu: { prompt: 'Commands', how: 0, items: [{ selector: 97, text: 'a - Search for traps' }] }, purpose: 'system.help', text: 'a - Search for traps', object: false },
  { id: 'explicit object selector', menu: { prompt: 'Choose an activity', how: 1, awaitingSelection: true, items: [{ selector: 97, text: 'a - potion of gain level', semanticKind: 'object' }] }, purpose: 'action.choice', text: 'a - item', object: true },
];
const replayEvents = [];
for (const entry of menuContextMatrix) {
  const row = adaptedRow({ window: 70, ...entry.menu }, entry.context || {});
  assert.equal(row.payload.item.text, entry.text, `${entry.id}: contextual adapter label`);
  assert.equal(row.payload.item.semanticKind === 'object', entry.object, `${entry.id}: contextual object classification`);
  assert.equal(MenuMetadataAdapter.classifyMenuPurpose({ window: 70, ...entry.menu }, entry.context || {}), entry.purpose, `${entry.id}: expected menu purpose`);
  const checked = UiProtocolV2.validateEventEnvelope(row);
  assert.equal(checked.ok, true, `${entry.id}: adapted row validates: ${checked.errors.join('; ')}`);
  replayEvents.push({ type: 'ui-protocol-event', event: row });
}
const publicAppearanceRow = adaptedRow({ window: 71, prompt: 'Inventory:', how: 0, items: [{ selector: 97, text: 'a - potion of gain level', semanticAppearance: 'milky potion', semanticKnown: false }] });
assert.equal(publicAppearanceRow.payload.item.text, 'a - milky potion', 'authoritative object context preserves explicit public appearance without hidden identity');
const replayMenuMatrix = { schema: RecordingSchema.v2, events: replayEvents };
assert.equal(RecordingSchema.validateRecording(replayMenuMatrix).ok, true, 'context matrix survives closed v2 recording validation');
const replayedMenuMatrix = ReplayAdapter.normalizeRecording(replayMenuMatrix);
assert.equal(replayedMenuMatrix.ok, true, 'context matrix survives replay normalization');
assert.equal(replayedMenuMatrix.protocolEvents.find((entry) => entry.event.payload.item?.semanticKind !== 'object').event.payload.item.text, selectableAction.text, 'replay normalization preserves non-object action text exactly');
assert.equal(replayedMenuMatrix.protocolEvents.some((entry) => entry.event.payload.item?.semanticKind === 'object' && entry.event.payload.item.text === 'a - item'), true, 'replay normalization keeps legacy object rows no-spoiler');

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
