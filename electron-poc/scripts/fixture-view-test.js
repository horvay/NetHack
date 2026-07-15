const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ShimProtocol = require('../src/shared/shim-protocol');
const GameViewState = require('../src/shared/game-view-state');
const InteractionModel = require('../src/shared/interaction-model');
const TileAssets = require('../src/shared/tile-assets');

const root = path.resolve(__dirname, '..');
const fixture = process.argv[2] || path.join(root, 'test/fixtures/accepted-view-events.jsonl');
const tileMap = JSON.parse(fs.readFileSync(path.join(root, 'assets/tiles/tile-map.json'), 'utf8'));
const tileManifest = TileAssets.normalizeManifest(JSON.parse(fs.readFileSync(path.join(root, 'assets/tiles/manifest.json'), 'utf8')));
const tileAssetsById = TileAssets.assetsById(tileManifest);
const events = fs.readFileSync(fixture, 'utf8').trim().split(/\n+/).filter(Boolean).map((line, index) => {
  const normalized = ShimProtocol.parseLine(line);
  assert.equal(normalized.valid, true, `fixture event ${index + 1} must satisfy shim protocol: ${normalized.errors.join(', ')}`);
  return normalized;
});
const gameView = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
const state = {
  mapWidth: 80,
  mapHeight: 21,
  cells: new Map(),
  messages: [],
  status: new Map(),
  extCommands: [],
  extAnswer: null,
  documentLines: [],
  menuAnswer: null,
  actionPromptRows: [],
  actionPromptRowsByVerb: new Map(),
  directionPrompts: 0,
  actionMenuInventoryRows: [],
  inventoryMenuAwaited: false,
  passiveGroundMenuSuppressed: false,
  explicitPickupMenuRows: [],
  explicitPickupMenuHasIcons: false,
  cancelSentEsc: false,
  selectionSentSelector: false,
};
function assetFor(event) {
  return TileAssets.mappedAssetIdForCell({ ch: event.char, glyph: event.glyph, semanticKind: event.semanticKind, semanticName: event.semanticName, cmapIndex: event.cmapIndex }, { tileMapConfig: { ...TileAssets.defaultTileMapConfig, ...tileMap }, tileAssetsById });
}
function promptVerb(query) {
  return String(query || '').match(/(?:want to|like to) (read|quaff|eat|apply|wield|wear|drop|remove|write|engrave)|write with|engrave with/i)?.[1]?.toLowerCase() || (/write with|engrave with/i.test(String(query || '')) ? 'engrave' : undefined);
}
for (const appEvent of events) {
  const event = appEvent.event;
  const result = gameView.process(appEvent);
  const view = gameView.snapshot();
  if (event.name === 'shim_print_glyph' && event.window === view.mapWindowId) {
    state.cells.set(`${event.x},${event.y}`, { ch: event.char, assetId: assetFor(event), glyph: event.glyph });
  }
  if (event.name === 'shim_putstr' || event.name === 'shim_raw_print') state.messages.push(event.text);
  if (event.name === 'shim_putstr' && event.window) state.documentLines.push(event.text);
  if (event.name === 'shim_status_update' && event.field >= 0) state.status.set(event.field, event.value ?? `mask ${event.conditionMask}`);
  if (event.name === 'shim_select_menu' && view.currentMenu) {
    if (view.currentMenu.suppressPicker) state.passiveGroundMenuSuppressed = true;
    if (InteractionModel.menuKind(view.currentMenu) === 'inventory') {
      state.actionMenuInventoryRows = view.currentMenu.items.filter((item) => item.selector);
      if (view.currentMenu.awaitingSelection) state.inventoryMenuAwaited = true;
    }
    if (/pick up/i.test(String(view.currentMenu.prompt || '')) && Number(event.how || 0)) {
      state.explicitPickupMenuRows = view.currentMenu.items.filter((item) => item.selector);
      state.explicitPickupMenuHasIcons = state.explicitPickupMenuRows.every((item) => Boolean(assetFor(item)) || item.glyph != null || item.semanticName);
    }
  }
  if (event.name === 'bridge_menu_answer') {
    if (event.return === 0) state.cancelSentEsc = true;
    if (event.selectors || event.selector) state.selectionSentSelector = true;
    state.menuAnswer = event;
  }
  if (event.name === 'bridge_extcmd_catalog') state.extCommands = event.commands || [];
  if (event.name === 'bridge_extcmd_answer') state.extAnswer = event;
  if (event.name === 'shim_yn_function') {
    const interaction = InteractionModel.buildPromptInteraction(view.activePrompt, view.cachedInventoryChoices);
    if (interaction.kind === 'direction') state.directionPrompts += 1;
    if (InteractionModel.isInventoryActionPrompt(event.query, event.choices)) {
      state.actionPromptRows = interaction.inventoryRows;
      const verb = promptVerb(event.query);
      if (verb) state.actionPromptRowsByVerb.set(verb, state.actionPromptRows.map((item) => item.text).join('\n'));
    }
  }
  if (event.name === 'bridge_direction_prompt') state.directionPrompts += 1;
  for (const effect of result.effects) {
    if (effect.type === 'open-document') state.documentLines.push(...(effect.document?.lines || []));
  }
}
const view = gameView.snapshot();
const isActionInventoryFixture = /action-inventory-prompt-events\.jsonl$/.test(fixture);
const isItemUseActionsFixture = /item-use-action-prompts-events\.jsonl$/.test(fixture);
const isDropActionMenuFixture = /drop-action-menu-events\.jsonl$/.test(fixture);
const isGroundPickupFixture = /ground-pickup-events\.jsonl$/.test(fixture);
const isEngravingWorkflowFixture = /engraving-workflow-events\.jsonl$/.test(fixture);
const assertions = isActionInventoryFixture ? [
  ['action prompt fixture cached inventory choices', view.cachedInventoryChoices.length === 3],
  ['read prompt renders visible inventory-style selectable row', state.actionPromptRows.length === 1 && /scroll/.test(state.actionPromptRows[0].text) && state.actionPromptRows[0].selector === 97],
] : isItemUseActionsFixture ? [
  ['read spellbook/scroll prompt filters to graphical inventory rows', /spellbook/.test(state.actionPromptRowsByVerb.get('read') || '') && /scroll/.test(state.actionPromptRowsByVerb.get('read') || '')],
  ['quaff potion prompt filters to potion row', /potion/.test(state.actionPromptRowsByVerb.get('quaff') || '')],
  ['eat food prompt filters to food row', /food ration/.test(state.actionPromptRowsByVerb.get('eat') || '')],
  ['apply item/tool prompt filters to tool row', /pick-axe/.test(state.actionPromptRowsByVerb.get('apply') || '')],
  ['wield/wear prompts filter to equipment rows', /long sword/.test(state.actionPromptRowsByVerb.get('wield') || '') && /ring mail/.test(state.actionPromptRowsByVerb.get('wear') || '')],
] : isDropActionMenuFixture ? [
  ['drop command select_menu is classified as inventory-style menu', InteractionModel.menuKind(view.currentMenu) === 'inventory'],
  ['drop command menu exposes compact selectable inventory rows from actual menu data', state.actionMenuInventoryRows.length === 2 && state.actionMenuInventoryRows.some((item) => /long sword/.test(item.text)) && state.actionMenuInventoryRows.some((item) => /food ration/.test(item.text))],
] : isGroundPickupFixture ? [
  ['walking onto multi-item square suppresses passive ground picker', state.passiveGroundMenuSuppressed],
  ['explicit pickup opens selectable ground item inventory rows', state.explicitPickupMenuRows.length === 2 && state.explicitPickupMenuRows.some((item) => /food ration/.test(item.text)) && state.explicitPickupMenuRows.some((item) => /potion/.test(item.text))],
  ['explicit pickup ground rows retain tile/icon metadata', state.explicitPickupMenuHasIcons],
  ['pickup cancel and selection bridge answers are preserved', state.cancelSentEsc && state.selectionSentSelector],
] : isEngravingWorkflowFixture ? [
  ['engraving tool prompt is classified as inventory action', state.actionPromptRows.length === 3],
  ['engraving tool rows include magic marker metadata', state.actionPromptRows.some((item) => /magic marker/.test(item.text) && item.semanticName === 'magic marker')],
  ['engraving prompt answer and text answer are represented', events.some((event) => event.name === 'bridge_prompt_answer' && event.event.keycode === 98) && events.some((event) => event.name === 'bridge_line_answer' && event.event.value === 'Elbereth')],
] : [
  ['full map width remains 80', view.mapWidth === 80],
  ['full map height remains 21', view.mapHeight === 21],
  ['player glyph mapped to hero-avatar', state.cells.get('11,4')?.assetId === 'hero-avatar'],
  ['floor glyph mapped to room-floor', state.cells.get('10,4')?.assetId === 'room-floor'],
  ['messages retained', state.messages.some((line) => /welcome to NetHack/.test(line))],
  ['HP status retained', state.status.get(18) === '12' && state.status.get(19) === '16'],
  ['condition mask retained', state.status.get(22) === 'mask 10'],
  ['inventory menu awaits multi selection', state.actionMenuInventoryRows.length === 2 && state.inventoryMenuAwaited && state.menuAnswer?.selectors === 'ab'],
  ['semantic classification retained', state.cells.get('12,4')?.assetId === 'kitten-pet' && state.actionMenuInventoryRows[0]?.semanticKind === 'object'],
  ['source-backed cmap terrain mapped', state.cells.get('13,4')?.assetId === 'fountain' && events.some((event) => event.event.cmapIndex != null && event.event.semanticName === 'fountain')],
  ['semantic open doors do not fall back to wall glyphs', state.cells.get('14,4')?.assetId === 'open-vertical-door' && state.cells.get('15,4')?.assetId === 'open-horizontal-door'],
  ['help/text window lines retained', state.documentLines.some((line) => /Extended command help/.test(line))],
  ['extended command catalog and answer retained', state.extCommands.some((cmd) => cmd.name === 'pray') && state.extCommands.some((cmd) => cmd.name === 'loot') && state.extAnswer?.command === 'pray'],
];
const failed = assertions.filter(([, ok]) => !ok).map(([name]) => name);
console.log(JSON.stringify({ fixture, assertions: assertions.map(([name, ok]) => ({ name, ok })), failed }, null, 2));
if (failed.length) process.exit(1);
