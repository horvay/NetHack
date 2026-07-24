const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ItemPresentation = require('../../src/ux/item-presentation');
const ItemDetailPanel = require('../../src/ux/item-detail-panel');
const EquipmentScreen = require('../../src/ux/equipment-screen');
const InventoryAdapter = require('../../src/shared/inventory-snapshot-adapter');
const GroundAdapter = require('../../src/shared/ground-pile-snapshot-adapter');
const ContainerAdapter = require('../../src/shared/container-contents-snapshot-adapter');
const EquipmentAdapter = require('../../src/shared/equipment-snapshot-adapter');
const ShimProtocol = require('../../src/shared/shim-protocol');
const MenuMetadataAdapter = require('../../src/shared/menu-metadata-adapter');
const GameViewState = require('../../src/shared/game-view-state');
const UiProtocol = require('../../src/shared/ui-protocol-v2');
const CommandGateway = require('../../src/shared/command-gateway');
const RecordingSchema = require('../../src/shared/recording-schema');
const PublicItemKnowledge = require('../../src/shared/public-item-knowledge');
const InteractionModel = require('../../src/shared/interaction-model');

const unknown = ItemPresentation.presentItem({
  objectId: 10,
  inventoryLetter: 'a',
  displayName: 'an uncursed milky potion called sunrise',
  semanticKnown: false,
  semanticAppearance: 'milky potion',
  known: { identity: false, appearance: true, quantity: true, naming: true },
  calledName: 'sunrise',
  publicClass: 'potion',
  filterGroups: ['consumables', 'magic'],
  knownFields: { beatitude: 'uncursed' },
  ownership: { state: 'owned' },
  glyphChar: '!'.charCodeAt(0),
  actionAffordances: ['quaff', 'drop'],
});
assert.equal(ItemDetailPanel.primaryAction([
  { id: 'item.wield.hold', enabled: true, section: 'primary', danger: 'safe' },
  { id: 'item.read.scroll', enabled: true, section: 'primary', danger: 'caution' },
]).id, 'item.read.scroll', 'Read remains the defining primary scroll action instead of generic wielding');
assert.equal(ItemDetailPanel.primaryAction([
  { id: 'item.wield.hold', enabled: true, section: 'primary', danger: 'safe' },
  { id: 'item.study', enabled: true, section: 'primary', danger: 'caution' },
]).id, 'item.study', 'Read remains the defining primary spellbook action instead of generic wielding');
assert.equal(unknown.knownState, 'appearance');
assert.equal(unknown.displayName, 'an uncursed milky potion called sunrise');
assert.equal(unknown.appearance, 'milky potion');
assert.equal(unknown.calledName, 'sunrise');
assert.deepEqual(unknown.filterGroups, ['consumables', 'magic']);
assert.deepEqual(unknown.knownFields, { beatitude: 'uncursed' });
assert.equal(unknown.actions.some((action) => action.label === 'Quaff'), true);
assert.equal(Object.values(unknown).join(' ').includes('gain level'), false, 'unknown identity is not enriched');

const noClass = ItemPresentation.presentItem({ objectId: 11, inventoryLetter: 'b', displayName: 'a strange object', semanticKnown: false });
assert.deepEqual(noClass.filterGroups, [], 'missing public class stays in All only');
assert.equal(ItemPresentation.matchesItem(noClass, '', 'magic'), false);
assert.equal(ItemPresentation.matchesItem(noClass, '', 'all'), true);
assert.equal(ItemPresentation.matchesItem(unknown, 'potions', 'all'), true, 'public category aliases are searchable');

const longName = 'the blessed rustproof +3 Dragonbane named for the Last Queen of the Dungeons of Doom';
const longModel = ItemPresentation.presentItem({ objectId: 12, inventoryLetter: 'c', displayName: longName, semanticKnown: true, publicClass: 'weapon', filterGroups: ['weapons'] });
assert.equal(longModel.displayName, longName, 'distinguishing name is never truncated in the model');
assert.equal(longModel.quantity, 1);

const plural = ItemPresentation.presentItem({ objectId: 13, inventoryLetter: 'd', displayName: '17 poisoned arrows', quantity: 17, semanticKnown: true, publicClass: 'weapon', filterGroups: ['weapons'], knownFields: { poisoned: true } });
assert.equal(plural.quantity, 17);
assert.equal(ItemPresentation.factRows(plural).some((fact) => fact.label === 'Poisoned' && fact.value === 'Yes'), true);

const shop = ItemPresentation.presentItem({ objectId: 14, inventoryLetter: 'e', displayName: 'a scroll labeled XOR OTA', semanticKnown: false, publicClass: 'scroll', filterGroups: ['consumables', 'magic'], ownership: { state: 'unpaid', price: 120, currency: 'zm' } });
assert.equal(ItemPresentation.factRows(shop).find((fact) => fact.id === 'ownership').value, 'Unpaid, 120 zm');

const namingMatrix = [
  { displayName: 'Sting', individualName: 'Sting', semanticKnown: true, known: { naming: true }, publicClass: 'weapon', filterGroups: ['weapons'], expectedDisplayName: 'Sting named Sting' },
  { displayName: 'a scroll labeled ZELGO MER called warding', calledName: 'warding', semanticKnown: false, semanticAppearance: 'scroll labeled ZELGO MER', known: { identity: false, appearance: true, naming: true }, publicClass: 'scroll', filterGroups: ['consumables', 'magic'] },
  { displayName: 'a floating eye corpse', semanticKnown: true, publicClass: 'food', filterGroups: ['consumables'] },
  { displayName: 'a statue of a peaceful gnome', semanticKnown: true, publicClass: 'other', filterGroups: [] },
];
for (const sample of namingMatrix) assert.equal(ItemPresentation.presentItem(sample).displayName, sample.expectedDisplayName || sample.displayName, `${sample.displayName} follows shared exact-marker naming grammar`);
const exactNamingGrammarMatrix = [
  { id: 'ordinary sword substring', item: { displayName: 'a long sword', semanticKnown: true, known: { identity: true, naming: true }, individualName: 'sword' }, expected: 'a long sword named sword' },
  { id: 'ordinary ring substring', item: { displayName: 'a ring of protection', semanticKnown: true, known: { identity: true, naming: true }, individualName: 'ring' }, expected: 'a ring of protection named ring' },
  { id: 'ordinary potion substring', item: { displayName: 'a potion of healing', semanticKnown: true, known: { identity: true, naming: true }, calledName: 'potion' }, expected: 'a potion of healing called potion' },
  { id: 'unknown public appearance overlap', item: { displayName: 'an opal ring', semanticKnown: false, semanticAppearance: 'opal ring', known: { appearance: true, naming: true }, calledName: 'ring' }, expected: 'an opal ring called ring' },
  { id: 'exact suffix', item: { displayName: 'a long sword named sword', semanticKnown: true, known: { identity: true, naming: true }, individualName: 'sword' }, expected: 'a long sword named sword' },
  { id: 'mixed case exact suffix', item: { displayName: 'a long sword NaMeD SWORD', semanticKnown: true, known: { identity: true, naming: true }, individualName: 'sword' }, expected: 'a long sword NaMeD SWORD' },
  { id: 'punctuation is exact', item: { displayName: 'a long sword named sword', semanticKnown: true, known: { identity: true, naming: true }, individualName: 'sword!' }, expected: 'a long sword named sword named sword!' },
  { id: 'unicode normalization exact suffix', item: { displayName: 'a long sword named Cafe\u0301', semanticKnown: true, known: { identity: true, naming: true }, individualName: 'Café' }, expected: 'a long sword named Cafe\u0301' },
  { id: 'multiple exact markers and trailing state', item: { displayName: 'a long sword named Edge called sunrise (weapon in right hand)', semanticKnown: true, known: { identity: true, naming: true }, individualName: 'Edge', calledName: 'sunrise' }, expected: 'a long sword named Edge called sunrise (weapon in right hand)' },
  { id: 'append before equipment state', item: { displayName: 'a long sword (weapon in right hand)', semanticKnown: true, known: { identity: true, naming: true }, individualName: 'sword' }, expected: 'a long sword named sword (weapon in right hand)' },
  { id: 'authorized named value contains parentheses', item: { displayName: 'a long sword named Edge (legacy)', semanticKnown: true, known: { identity: true, naming: true }, individualName: 'Edge (legacy)' }, expected: 'a long sword named Edge (legacy)' },
  { id: 'authorized called value contains parentheses', item: { displayName: 'an opal ring called circle (safe)', semanticKnown: false, semanticAppearance: 'opal ring', known: { appearance: true, naming: true }, calledName: 'circle (safe)' }, expected: 'an opal ring called circle (safe)' },
  { id: 'authorized name contains reserved equipment-state parentheses', item: { displayName: 'a long sword named Dawn (wielded) (weapon in hand)', semanticKnown: true, known: { identity: true, naming: true }, individualName: 'Dawn (wielded)' }, expected: 'a long sword named Dawn (wielded) (weapon in hand)' },
  { id: 'called marker before lit state', item: { displayName: 'a brass lantern called beacon (lit)', semanticKnown: true, known: { identity: true, naming: true }, calledName: 'beacon' }, expected: 'a brass lantern called beacon (lit)' },
  { id: 'called marker before unpaid state', item: { displayName: 'an opal ring called circle (unpaid)', semanticKnown: false, semanticAppearance: 'opal ring', known: { appearance: true, naming: true }, calledName: 'circle' }, expected: 'an opal ring called circle (unpaid)' },
  { id: 'multiple markers before commercial state', item: { displayName: 'a long sword named Edge called sunrise (unpaid, 50 zorkmids)', semanticKnown: true, known: { identity: true, naming: true }, individualName: 'Edge', calledName: 'sunrise' }, expected: 'a long sword named Edge called sunrise (unpaid, 50 zorkmids)' },
  { id: 'reserved parenthesis name plus second marker and trailing state', item: { displayName: 'a long sword named Edge (unpaid) (unpaid, 40 zorkmids)', semanticKnown: true, known: { identity: true, naming: true }, individualName: 'Edge (unpaid)', calledName: 'sunrise' }, expected: 'a long sword named Edge (unpaid) called sunrise (unpaid, 40 zorkmids)' },
];
for (const grammarCase of exactNamingGrammarMatrix) {
  assert.equal(PublicItemKnowledge.publicDisplayLabel(grammarCase.item), grammarCase.expected, `${grammarCase.id}: shared public grammar`);
  assert.equal(PublicItemKnowledge.publicDisplayLabel({ ...grammarCase.item, displayName: grammarCase.expected }), grammarCase.expected, `${grammarCase.id}: shared public grammar is idempotent`);
  assert.equal(ItemPresentation.presentItem(grammarCase.item).displayName, grammarCase.expected, `${grammarCase.id}: item presentation delegates to shared public grammar`);
  const normalized = InventoryAdapter.normalizePublicInventoryItem(grammarCase.item);
  assert.equal(normalized.displayName, grammarCase.expected, `${grammarCase.id}: inventory/menu/search/action projection uses shared public grammar`);
}
assert.equal(PublicItemKnowledge.publicDisplayLabel({ displayName: 'a long sword sword', semanticKnown: true, known: { identity: true, naming: true }, individualName: 'sword' }), 'a long sword sword named sword', 'ordinary repeated substring is never treated as an exact naming marker');
assert.equal(PublicItemKnowledge.publicDisplayLabel({ displayName: 'a long sword n\u200bamed sword', semanticKnown: true, known: { identity: true, naming: true }, individualName: 'sword' }), 'a long sword n\u200bamed sword named sword', 'zero-width marker obfuscation is not accepted as exact suffix grammar');
for (const appearanceCase of [
  { displayName: 'potion', semanticAppearance: 'sky blue potion', expected: 'sky blue potion' },
  { displayName: 'a wand', semanticAppearance: 'long wand', expected: 'long wand' },
  { displayName: 'ring', semanticAppearance: 'opal ring', expected: 'opal ring' },
  { displayName: 'an item', semanticAppearance: 'scroll labeled KIRJE', expected: 'scroll labeled KIRJE' },
]) {
  const item = { ...appearanceCase, semanticKnown: false, known: { identity: false, appearance: true } };
  assert.equal(PublicItemKnowledge.publicDisplayLabel(item), appearanceCase.expected, 'public semantic appearance replaces a bare object-class fallback');
  assert.equal(ContainerAdapter.normalizeContainerContentsSnapshotPayload({ revision: 1, sessionId: 'appearance-test', container: { publicId: 'box', displayName: 'box' }, items: [item] }).items[0].displayName, appearanceCase.expected, 'container rows use the same public semantic appearance precedence');
}
assert.equal(PublicItemKnowledge.publicDisplayLabel({ displayName: 'an uncursed opal ring called circle', semanticAppearance: 'opal ring', semanticKnown: false, known: { identity: false, appearance: true, naming: true }, calledName: 'circle' }), 'an uncursed opal ring called circle', 'an already-informative public label retains its known facts and player-assigned name');
const unknownFacts = ItemPresentation.presentItem({ displayName: 'a glass wand', semanticKnown: false, semanticAppearance: 'glass wand', publicClass: 'wand', filterGroups: ['magic'], knownFields: {} });
assert.deepEqual(ItemPresentation.factRows(unknownFacts), [{ id: 'identity', label: 'Identity', value: 'Unknown' }], 'unknown BUC, charges, and enchantment are omitted rather than inferred');
const explicitlyRedactedEquippedFilter = ItemPresentation.presentItem({ displayName: 'a gray stone', semanticKnown: false, publicClass: 'gem', filterGroups: [], wornMask: 256 });
assert.deepEqual(explicitlyRedactedEquippedFilter.filterGroups, [], 'an explicitly published empty filter list is not enriched from worn state');

const compared = ItemPresentation.compareItems(
  ItemPresentation.presentItem({ displayName: 'a crude dagger', knownFields: { enchantment: 1 }, publicClass: 'weapon', filterGroups: ['weapons'] }),
  ItemPresentation.presentItem({ displayName: 'a long sword', knownFields: { enchantment: 0, erosion: 1 }, publicClass: 'weapon', filterGroups: ['equipped', 'weapons'], wornMask: 256 }),
);
assert.deepEqual(compared, [
  { id: 'enchantment', label: 'Enchantment', selected: 1, equipped: 0 },
  { id: 'erosion', label: 'Erosion', selected: 'Unknown', equipped: 1 },
], 'comparison aligns known facts and says Unknown rather than guessing');

const equippedRing = ItemPresentation.presentItem({ objectId: 30, displayName: 'a ring of protection', semanticKnown: true, wornMask: 0x20000, filterGroups: ['equipped', 'magic'], equipmentSlots: ['ring.left', 'ring.right'] });
const candidateRing = ItemPresentation.presentItem({ objectId: 31, displayName: 'an opal ring', semanticKnown: false, semanticAppearance: 'opal ring', filterGroups: ['magic'], equipmentSlots: ['ring.left', 'ring.right'] });
const exactBody = ItemPresentation.presentItem({ objectId: 32, displayName: 'a leather armor', semanticKnown: true, equipmentSlots: ['armor.body'] });
const equippedBody = ItemPresentation.presentItem({ objectId: 33, displayName: 'a chain mail', semanticKnown: true, wornMask: 1, equipmentSlots: ['armor.body'] });
const potion = ItemPresentation.presentItem({ objectId: 34, displayName: 'a milky potion', semanticKnown: false, semanticAppearance: 'milky potion', filterGroups: ['consumables', 'magic'], equipmentSlots: [] });
const scroll = ItemPresentation.presentItem({ objectId: 35, displayName: 'a scroll labeled READ ME', semanticKnown: false, semanticAppearance: 'scroll labeled READ ME', filterGroups: ['consumables', 'magic'], equipmentSlots: [] });
const quiveredArrows = ItemPresentation.presentItem({ objectId: 36, displayName: '12 arrows', semanticKnown: true, publicClass: 'weapon', wornMask: 0x200, equipmentSlots: ['mainHand', 'offHand', 'quiver'] });
const looseSword = ItemPresentation.presentItem({ objectId: 37, displayName: 'a long sword', semanticKnown: true, publicClass: 'weapon', equipmentSlots: ['mainHand', 'offHand'] });
assert.equal(EquipmentScreen.equippedComparison(candidateRing, [equippedRing]), equippedRing, 'two-slot jewelry compares through an exact overlapping public slot');
assert.equal(EquipmentScreen.equippedComparison(exactBody, [equippedBody]), equippedBody, 'exact armor slot compares with equipped armor in that slot');
assert.equal(EquipmentScreen.equippedComparison(potion, [equippedRing]), null, 'a potion never compares with a ring through the broad magic filter');
assert.equal(EquipmentScreen.equippedComparison(scroll, [equippedBody]), null, 'a scroll never compares with armor through broad categories');
assert.equal(EquipmentScreen.equippedComparison(looseSword, [quiveredArrows]), null, 'a hand weapon does not compare with ammunition merely occupying the quiver');

const forbiddenWords = ['potion of gain level', 'secret effect', '/private/shop/path', 'hidden-route-token'];
let resolverInput;
const adversarial = ItemPresentation.presentItem({
  objectId: 77,
  inventoryLetter: 'z',
  displayName: 'a potion of gain level',
  text: 'z - potion of gain level',
  name: 'potion of gain level',
  semanticKnown: false,
  semanticAppearance: 'milky potion',
  known: { identity: false, appearance: false, naming: true, privateKnowledge: 'potion of gain level' },
  calledName: 'sunrise',
  publicClass: 'potion',
  filterGroups: ['consumables', 'magic', 'private-shop-filter'],
  equipmentSlots: ['ring.left', 'private.slot'],
  knownFields: { beatitude: 'uncursed', privateEffect: { text: 'secret effect' } },
  ownership: { state: 'unpaid', price: 80, currency: 'zm', shopPath: '/private/shop/path' },
  location: { kind: 'inventory', privatePath: '/private/shop/path' },
  hiddenIdentity: 'potion of gain level',
}, {
  iconResolver(input) { resolverInput = input; return { src: 'file:///public/potion.png', alt: 'secret effect' }; },
  actionService: {
    itemActionAffordances() {
      return [{ id: 'item.quaff', label: 'Quaff', execution: { route: 'compatKeySequence', action: 'item.quaff', keys: 'qz', privateRoute: 'hidden-route-token' }, source: { privateEffect: 'secret effect' }, params: { shopPath: '/private/shop/path' } }];
    },
  },
});
assert.equal(adversarial.displayName, 'Item', 'contradictory redacted appearance also blocks naming authorization and fails closed to a neutral item');
assert.deepEqual(adversarial.equipmentSlots, [], 'non-equippable consumables and private slot tokens are removed');
assert.deepEqual(adversarial.knownFields, { beatitude: 'uncursed' }, 'known-field projection is recursively allowlisted');
assert.deepEqual(adversarial.ownership, { state: 'unpaid', price: 80, currency: 'zm' }, 'ownership projection is recursively allowlisted');
assert.deepEqual(adversarial.actions[0].route, { route: 'compatKeySequence', action: 'item.quaff', keys: 'qz' }, 'action route projection retains only public integration tokens');
assert.deepEqual(resolverInput, {
  stableId: 'object:77', objectId: 77, inventoryLetter: 'z', selector: 122, location: { kind: 'inventory' },
  displayName: 'Item', text: 'z - Item', quantity: 1, wornMask: 0, semanticKnown: false,
  filterGroups: ['consumables', 'magic'], equipmentSlots: [], actionAffordances: [], publicClass: 'potion',
}, 'icon resolver receives the same minimal public projection, never the source record');
function assertNoRecursiveLeak(value, pathName = 'root') {
  if (value == null) return;
  if (typeof value === 'string') {
    for (const forbidden of forbiddenWords) assert.equal(value.includes(forbidden), false, `${pathName} must not contain ${forbidden}`);
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    assert.doesNotMatch(key, /^(?:source|hidden|private|effect|shopPath)$/i, `${pathName}.${key} is not an allowlisted public key`);
    assertNoRecursiveLeak(entry, `${pathName}.${key}`);
  }
}
assertNoRecursiveLeak(adversarial, 'presentation');
const dispatchPayload = EquipmentScreen.publicDispatchPayload(adversarial.actions[0], adversarial);
assert.deepEqual(dispatchPayload.item, { stableId: 'object:77', objectId: 77, inventoryLetter: 'z', selector: 122, location: { kind: 'inventory' } });
assertNoRecursiveLeak(dispatchPayload, 'dispatch');

const raw = {
  selector: 102,
  objectId: 50,
  text: 'f - a +1 long sword (weapon in hand)',
  quantity: 1,
  wornMask: 256,
  semanticKnown: true,
  semanticName: 'long sword',
  publicClass: 'weapon',
  filterGroups: ['equipped', 'weapons'],
  equipmentSlots: ['mainHand', 'offHand'],
  knownFields: { beatitude: 'blessed', enchantment: 1 },
  ownership: { state: 'owned' },
};
const adapted = InventoryAdapter.normalizePublicInventoryItem(raw);
assert.deepEqual(adapted.filterGroups, ['equipped', 'weapons']);
assert.deepEqual(adapted.equipmentSlots, ['mainHand', 'offHand']);
assert.deepEqual(adapted.knownFields, { beatitude: 'blessed', enchantment: 1 });
assert.deepEqual(adapted.ownership, { state: 'owned' });
const adversarialAdapted = InventoryAdapter.normalizePublicInventoryItem({
  ...raw,
  semanticKnown: false,
  semanticName: 'hidden artifact identity',
  known: { identity: false, appearance: true, privateFlag: true },
  publicClass: 'potion',
  filterGroups: ['magic', 'weapons', 'private-filter'],
  equipmentSlots: ['ring.left', 'private.slot'],
  knownFields: { beatitude: 'uncursed', enchantment: 9, privateEffect: 'secret effect' },
  ownership: { state: 'unpaid', price: 40, currency: 'zm', shopPath: '/private/shop/path' },
  privatePath: '/private/shop/path',
});
assert.equal(adversarialAdapted.semanticName, undefined, 'unknown adapter item cannot retain semantic identity');
assert.deepEqual(adversarialAdapted.known, { identity: false, appearance: true, quantity: true });
assert.deepEqual(adversarialAdapted.filterGroups, ['magic'], 'class-incompatible and private filters fail closed');
assert.deepEqual(adversarialAdapted.equipmentSlots, [], 'non-equippable consumable and private slots fail closed');
assert.deepEqual(adversarialAdapted.knownFields, { beatitude: 'uncursed' }, 'class-incompatible and private known fields fail closed');
assert.deepEqual(adversarialAdapted.ownership, { state: 'unpaid', price: 40, currency: 'zm' });
assert.equal(JSON.stringify(adversarialAdapted).includes('private'), false, 'normalized inventory item recursively drops private keys and values');
const adversarialLegacy = InventoryAdapter.publicItemToLegacyChoice(adversarialAdapted);
assert.equal(JSON.stringify(adversarialLegacy).includes('private'), false, 'legacy lowering starts from the recursive public projection');
assert.equal(adversarialLegacy.semanticName, undefined, 'legacy lowering does not re-enrich unknown identity');
for (const [domain, projected] of [
  ['ground', GroundAdapter.normalizePublicGroundItem({ ...adversarialAdapted, privatePath: '/private/shop/path' })],
  ['container', ContainerAdapter.normalizePublicContainerItem({ ...adversarialAdapted, privatePath: '/private/shop/path' })],
]) {
  assert.equal(projected.semanticName, undefined, `${domain} projection does not restore unknown identity`);
  assert.deepEqual(projected.filterGroups, ['magic'], `${domain} projection preserves the recursively allowlisted additive filter contract`);
  assert.deepEqual(projected.knownFields, { beatitude: 'uncursed' }, `${domain} projection preserves only public known fields`);
  assert.equal(JSON.stringify(projected).includes('private'), false, `${domain} projection recursively drops private fields`);
}
const event = InventoryAdapter.createInventorySnapshotEvent({ revision: 3, items: [raw] }, { sequence: 3 });
assert.equal(UiProtocol.validateEventEnvelope(event).ok, true);

// Unknown generic naming is authorization-sensitive at every item ingress.
const hiddenGeneric = 'potion of gain level';
function recursiveStrings(value, output = [], seen = new Set()) {
  if (typeof value === 'string') output.push(value);
  else if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    if (value instanceof Map) for (const [key, entry] of value) { recursiveStrings(key, output, seen); recursiveStrings(entry, output, seen); }
    else if (value instanceof Set) for (const entry of value) recursiveStrings(entry, output, seen);
    else for (const entry of Object.values(value)) recursiveStrings(entry, output, seen);
  }
  return output;
}
function assertNoRecursiveText(value, forbidden, label) {
  assert.equal(recursiveStrings(value).some((text) => text.includes(forbidden)), false, `${label} recursively excludes ${forbidden}`);
}
function assertNoHiddenGeneric(value, label) { assertNoRecursiveText(value, hiddenGeneric, label); }

const omittedKnowledgeMatrix = [
  { id: 'both-flags-absent', flags: {}, expected: 'item', public: false },
  { id: 'known-object-empty', flags: { known: {} }, expected: 'item', public: false },
  { id: 'identity-false', flags: { known: { identity: false } }, expected: 'item', public: false },
  { id: 'semantic-false', flags: { semanticKnown: false }, expected: 'item', public: false },
  { id: 'appearance-false', flags: { known: { appearance: false } }, expected: 'item', public: false },
  { id: 'identity-true', flags: { known: { identity: true } }, expected: hiddenGeneric, public: true },
  { id: 'semantic-true', flags: { semanticKnown: true }, expected: hiddenGeneric, public: true },
  { id: 'appearance-true', flags: { known: { appearance: true } }, expected: hiddenGeneric, public: true },
  { id: 'explicit-semantic-appearance', flags: { semanticAppearance: 'milky potion' }, expected: 'milky potion', public: false },
  { id: 'identity-contradiction-semantic-true', flags: { semanticKnown: true, known: { identity: false } }, expected: 'item', public: false, contradictory: true },
  { id: 'identity-contradiction-known-true', flags: { semanticKnown: false, known: { identity: true } }, expected: 'item', public: false, contradictory: true },
  { id: 'appearance-contradiction', flags: { semanticAppearance: 'milky potion', known: { appearance: false } }, expected: 'item', public: false, contradictory: true },
];
for (const field of ['displayName', 'text', 'name']) {
  for (const matrixCase of omittedKnowledgeMatrix) {
    const source = { objectId: 870, selector: 97, semanticKind: 'object', publicClass: 'potion', filterGroups: ['consumables', 'magic'], [field]: field === 'text' ? `a - ${hiddenGeneric}` : hiddenGeneric, ...matrixCase.flags };
    const label = `omitted-matrix/${field}/${matrixCase.id}`;
    const inventory = InventoryAdapter.normalizePublicInventoryItem(source);
    assert.equal(inventory.displayName, matrixCase.expected, `${label}: inventory follows the explicit knowledge matrix`);
    assert.equal(inventory.known.identity, ['identity-true', 'semantic-true'].includes(matrixCase.id), `${label}: normalized identity authorization is explicit and distinct from appearance authorization`);
    const presented = ItemPresentation.presentItem(source);
    assert.equal(presented.displayName, matrixCase.expected === 'item' ? 'Item' : matrixCase.expected, `${label}: presentation follows the same matrix`);
    let iconInput;
    const iconPresented = ItemPresentation.presentItem(source, { iconResolver(input) { iconInput = input; return null; } });
    const action = iconPresented.actions[0];
    const dispatch = action ? EquipmentScreen.publicDispatchPayload(action, iconPresented) : null;
    const shimInventory = ShimProtocol.normalizeRawShimEvent({ name: 'shim_update_inventory', revision: 11, items: [source] });
    const shimGround = ShimProtocol.normalizeRawShimEvent({ name: 'shim_ground_pile_snapshot', revision: 11, coord: { x: 1, y: 1 }, items: [source] });
    const shimContainer = ShimProtocol.normalizeRawShimEvent({ name: 'shim_container_contents_snapshot', revision: 11, sessionId: 'matrix-omitted', container: { publicId: 'box', displayName: 'box', semanticKnown: false, known: { identity: false, appearance: true } }, items: [source] });
    const menuItem = MenuMetadataAdapter.adaptV1MenuSnapshotToV2Events({ window: 8, prompt: 'Inventory:', items: [source] }, { sequenceStart: 1 }).find((entry) => entry.eventType === 'menu.item');
    if (!matrixCase.public) {
      for (const [projectionName, projection] of [['inventory', inventory], ['presentation', presented], ['icon', iconInput], ['dispatch', dispatch], ['ground', GroundAdapter.normalizePublicGroundItem(source)], ['container', ContainerAdapter.normalizePublicContainerItem(source)], ['shim inventory', shimInventory], ['shim ground', shimGround], ['shim container', shimContainer], ['menu lowering', menuItem]]) assertNoHiddenGeneric(projection, `${label}/${projectionName}`);
      assert.equal(ItemPresentation.matchesItem(presented, hiddenGeneric, 'all'), false, `${label}: hidden generic text is not searchable`);
    }
    assert.equal(UiProtocol.validateEventEnvelope(menuItem).ok, true, `${label}: v1 lowering normalizes safely before producing a v2 menu item`);
  }
}

function directSnapshotEnvelope(eventType, item, sequence) {
  const payload = eventType === 'inventory.snapshot' ? { revision: 1, items: [item] }
    : eventType === 'equipment.snapshot' ? { revision: 1, inventoryRevision: 1, slots: [{ slotId: 'ring.left', objectId: item.objectId, item: { ...item, publicClass: 'ring', equipmentSlots: ['ring.left', 'ring.right'] } }] }
      : eventType === 'ground.pile.snapshot' ? { revision: 1, coord: { x: 1, y: 1 }, items: [item] }
        : { revision: 1, sessionId: 'direct-matrix', container: { publicId: 'box', displayName: 'box', semanticKnown: false, known: { identity: false, appearance: true } }, items: [item] };
  return { protocol: UiProtocol.protocol, sequence, eventId: `evt-${eventType}-${sequence}`, eventType, turn: 1, payload };
}
for (const [index, eventType] of ['inventory.snapshot', 'equipment.snapshot', 'ground.pile.snapshot', 'container.contents.snapshot'].entries()) {
  const directUnknown = directSnapshotEnvelope(eventType, { objectId: 875, displayName: hiddenGeneric }, 200 + index);
  assert.equal(UiProtocol.validateEventEnvelope(directUnknown).ok, false, `${eventType}: direct unknown generic item rejects when identity knowledge is omitted`);
  const directAppearance = directSnapshotEnvelope(eventType, { objectId: 875, displayName: 'milky potion', semanticAppearance: 'milky potion' }, 210 + index);
  assert.equal(UiProtocol.validateEventEnvelope(directAppearance).ok, true, `${eventType}: direct explicit public appearance remains valid`);
}
for (const [index, matrixCase] of omittedKnowledgeMatrix.filter((entry) => entry.contradictory).entries()) {
  const directContradiction = directSnapshotEnvelope('inventory.snapshot', { objectId: 876 + index, displayName: matrixCase.expected === 'item' ? 'item' : matrixCase.expected, ...matrixCase.flags }, 230 + index);
  assert.equal(UiProtocol.validateEventEnvelope(directContradiction).ok, false, `direct v2 rejects ${matrixCase.id}`);
}
const namingCases = [
  { id: 'authorization absent', source: { displayName: hiddenGeneric, calledName: 'sunrise', individualName: 'dawn' }, expectedCalled: undefined, expectedIndividual: undefined, directValid: false },
  { id: 'authorization false', source: { displayName: hiddenGeneric, calledName: 'sunrise', individualName: 'dawn', known: { naming: false } }, expectedCalled: undefined, expectedIndividual: undefined, directValid: false },
  { id: 'naming true exact public values', source: { displayName: hiddenGeneric, calledName: 'sunrise', individualName: 'Dawnbringer', semanticAppearance: 'milky potion', known: { naming: true } }, expectedCalled: 'sunrise', expectedIndividual: 'Dawnbringer', directValid: true },
  { id: 'identity true is not naming authorization', source: { displayName: hiddenGeneric, calledName: 'sunrise', individualName: 'Dawnbringer', known: { identity: true } }, expectedCalled: undefined, expectedIndividual: undefined, directValid: false },
  { id: 'identity true plus naming true', source: { displayName: hiddenGeneric, calledName: 'sunrise', individualName: 'Dawnbringer', known: { identity: true, naming: true } }, expectedCalled: 'sunrise', expectedIndividual: 'Dawnbringer', directValid: true },
  { id: 'identity false plus naming true', source: { displayName: hiddenGeneric, calledName: 'sunrise', individualName: 'Dawnbringer', semanticAppearance: 'milky potion', known: { identity: false, naming: true } }, expectedCalled: 'sunrise', expectedIndividual: 'Dawnbringer', directValid: true },
  { id: 'semantic true contradicts identity false', source: { displayName: hiddenGeneric, calledName: 'sunrise', individualName: 'Dawnbringer', semanticKnown: true, known: { identity: false, naming: true } }, expectedCalled: undefined, expectedIndividual: undefined, directValid: false },
  { id: 'semantic false contradicts identity true', source: { displayName: hiddenGeneric, calledName: 'sunrise', individualName: 'Dawnbringer', semanticKnown: false, known: { identity: true, naming: true } }, expectedCalled: undefined, expectedIndividual: undefined, directValid: false },
  { id: 'redacted appearance contradicts semantic appearance', source: { displayName: hiddenGeneric, calledName: 'sunrise', individualName: 'Dawnbringer', semanticAppearance: 'milky potion', known: { appearance: false, naming: true } }, expectedCalled: undefined, expectedIndividual: undefined, directValid: false },
  { id: 'naming true cannot repeat hidden generic', source: { displayName: hiddenGeneric, calledName: hiddenGeneric, individualName: `the ${hiddenGeneric}`, semanticAppearance: 'milky potion', known: { naming: true } }, expectedCalled: undefined, expectedIndividual: undefined, directValid: false },
  { id: 'naming true cannot wrap hidden generic', source: { displayName: hiddenGeneric, calledName: `sunrise ${hiddenGeneric} reserve`, individualName: `Dawnbringer ${hiddenGeneric}`, semanticAppearance: 'milky potion', known: { naming: true } }, expectedCalled: undefined, expectedIndividual: undefined, directValid: false },
  { id: 'naming true cannot punctuation-obfuscate hidden generic', source: { displayName: hiddenGeneric, calledName: 'potion-of-gain-level', individualName: 'potion\u200b of\u200b gain\u200b level', semanticAppearance: 'milky potion', known: { naming: true } }, expectedCalled: undefined, expectedIndividual: undefined, directValid: false },
  { id: 'safe call may overlap public appearance', source: { displayName: 'an opal ring called ring', calledName: 'ring', semanticAppearance: 'opal ring', known: { naming: true } }, expectedCalled: 'ring', expectedIndividual: undefined, directValid: true },
];
for (const [index, namingCase] of namingCases.entries()) {
  const normalized = InventoryAdapter.normalizePublicInventoryItem({ objectId: 880 + index, ...namingCase.source });
  assert.equal(normalized.calledName, namingCase.expectedCalled, `${namingCase.id}: calledName projection`);
  assert.equal(normalized.individualName, namingCase.expectedIndividual, `${namingCase.id}: individualName projection`);
  if (!namingCase.expectedCalled && !namingCase.expectedIndividual && namingCase.source.known?.identity !== true && namingCase.source.semanticKnown !== true && namingCase.source.known?.appearance !== true) assertNoHiddenGeneric(normalized, `${namingCase.id}: normalized graph`);
  const directDisplayName = /hidden generic|wrap hidden generic/.test(namingCase.id)
    ? hiddenGeneric
    : (namingCase.source.known?.identity === true && namingCase.source.semanticKnown !== false ? hiddenGeneric : (namingCase.source.semanticAppearance || 'item'));
  const direct = directSnapshotEnvelope('inventory.snapshot', {
    objectId: 880 + index,
    ...namingCase.source,
    displayName: directDisplayName,
  }, 300 + index);
  assert.equal(UiProtocol.validateEventEnvelope(direct).ok, namingCase.directValid, `${namingCase.id}: direct v2 naming contract`);
}
const explicitPublicCall = InventoryAdapter.normalizePublicInventoryItem({ displayName: hiddenGeneric, calledName: 'sunrise', semanticAppearance: 'milky potion', known: { naming: true } });
assert.equal(explicitPublicCall.calledName, 'sunrise', 'known.naming authorizes only the exact independent player-assigned called name');
const overlappingAppearanceCall = InventoryAdapter.normalizePublicInventoryItem({ displayName: 'an opal ring called ring', calledName: 'ring', semanticAppearance: 'opal ring', known: { naming: true } });
assert.equal(overlappingAppearanceCall.calledName, 'ring', 'a safe player call overlapping only the explicit public appearance remains authorized');
assert.equal(overlappingAppearanceCall.displayName, 'opal ring called ring', 'overlapping public-appearance call remains visibly marked as a call');
const rejectedNamingKnowledge = InventoryAdapter.normalizePublicInventoryItem({ displayName: hiddenGeneric, semanticAppearance: 'milky potion', known: { naming: true }, calledName: hiddenGeneric });
assert.equal(rejectedNamingKnowledge.known.naming, undefined, 'normalized knowledge omits naming authority when every supplied name is rejected');
const nativeCalledShape = { objectId: 910, selector: 97, text: 'a - a milky potion called sunrise', semanticKind: 'object', semanticKnown: false, semanticAppearance: 'milky potion', known: { naming: true }, calledName: 'sunrise', publicClass: 'potion', filterGroups: ['consumables', 'magic'], equipmentSlots: [], actionAffordances: ['quaff'] };
const nativeNamedShape = { objectId: 911, selector: 98, text: 'b - a long sword named Dawnbringer', semanticKind: 'object', semanticKnown: true, semanticName: 'long sword', known: { identity: true, naming: true }, individualName: 'Dawnbringer', publicClass: 'weapon', filterGroups: ['weapons'], equipmentSlots: ['mainHand', 'offHand'], actionAffordances: ['wield'] };
const nativeShimInventory = ShimProtocol.normalizeRawShimEvent({ name: 'shim_update_inventory', revision: 40, items: [nativeCalledShape, nativeNamedShape] });
assert.equal(nativeShimInventory.valid, true, 'authoritative native-shaped called/named inventory validates');
assert.equal(nativeShimInventory.event.items[0].calledName, 'sunrise', 'native unknown item keeps exact independently emitted calledName before derived appearance knowledge');
assert.equal(nativeShimInventory.event.items[0].known.identity, false, 'native unknown called item does not gain hidden identity knowledge');
assert.equal(nativeShimInventory.event.items[0].known.appearance, true, 'native explicit semanticAppearance becomes public appearance knowledge after naming validation');
assert.equal(nativeShimInventory.event.items[0].text, 'a - milky potion called sunrise', 'native unknown display retains the exact player call without trusting arbitrary suffix text');
assert.equal(nativeShimInventory.event.items[1].individualName, 'Dawnbringer', 'native known sword keeps exact independently emitted individualName');
const nativeSnapshot = InventoryAdapter.adaptShimInventoryUpdateToSnapshot(nativeShimInventory.event);
assert.equal(nativeSnapshot.items[0].calledName, 'sunrise', 'inventory adapter keeps unknown calledName');
assert.equal(nativeSnapshot.items[1].individualName, 'Dawnbringer', 'inventory adapter keeps known individualName');
const nativeSnapshotV2 = InventoryAdapter.createInventorySnapshotEvent(nativeShimInventory.event, { sequence: 40 });
assert.equal(UiProtocol.validateEventEnvelope(nativeSnapshotV2).ok, true, 'native called/named inventory converts to valid v2');
const nativeCalledPresentation = ItemPresentation.presentItem(nativeSnapshot.items[0]);
assert.equal(nativeCalledPresentation.displayName, 'milky potion called sunrise', 'presentation shows the exact authorized unknown-item call');
assert.equal(nativeCalledPresentation.calledName, 'sunrise', 'presentation model keeps calledName');
assert.equal(ItemPresentation.matchesItem(nativeCalledPresentation, 'sunrise', 'all'), true, 'authorized calledName is searchable');
assert.equal(ItemPresentation.matchesItem(nativeCalledPresentation, hiddenGeneric, 'all'), false, 'hidden generic identity is not searchable through a called item');
const nativeCalledDispatch = EquipmentScreen.publicDispatchPayload(nativeCalledPresentation.actions[0], nativeCalledPresentation);
assert.equal(nativeCalledDispatch.item.objectId, 910, 'called-item action dispatch retains only public object identity');
assertNoHiddenGeneric(nativeCalledDispatch, 'native called action dispatch');
for (const [label, projection] of [
  ['ground', GroundAdapter.normalizePublicGroundItem({ ...nativeCalledShape, displayName: nativeCalledShape.text })],
  ['container', ContainerAdapter.normalizePublicContainerItem({ ...nativeCalledShape, displayName: nativeCalledShape.text })],
  ['equipment', EquipmentAdapter.normalizeEquipmentSlot({ slotId: 'mainHand', objectId: 911, item: nativeNamedShape }).item],
]) {
  assert.equal(projection?.calledName || projection?.individualName, label === 'equipment' ? 'Dawnbringer' : 'sunrise', `${label} adapter keeps exact authoritative player name`);
  assertNoHiddenGeneric(projection, `${label} named projection`);
}
const nativeClassicMenuEvent = ShimProtocol.normalizeRawShimEvent({ name: 'shim_add_menu', window: 77, ...nativeCalledShape });
assert.equal(nativeClassicMenuEvent.valid, true, 'authoritative native-shaped classic object menu validates');
assert.equal(nativeClassicMenuEvent.event.calledName, 'sunrise', 'classic shim menu keeps exact calledName field');
assert.equal(nativeClassicMenuEvent.event.text, 'a - milky potion called sunrise', 'classic shim menu text visibly keeps exact called suffix');
const nativeClassicMenuV2 = MenuMetadataAdapter.adaptV1MenuSnapshotToV2Events({ window: 77, prompt: 'Inventory:', items: [nativeClassicMenuEvent.event] }, { sequenceStart: 400 }).find((entry) => entry.eventType === 'menu.item');
assert.equal(nativeClassicMenuV2.payload.item.calledName, 'sunrise', 'classic menu adapter keeps exact calledName in v2');
assert.equal(UiProtocol.validateEventEnvelope(nativeClassicMenuV2).ok, true, 'classic called menu v2 validates');
const nativeMenuView = GameViewState.createGameViewState({ mapWidth: 80, mapHeight: 21 });
nativeMenuView.process({ name: 'shim_start_menu', window: 77 });
nativeMenuView.process({ name: 'shim_add_menu', window: 77, ...nativeCalledShape });
nativeMenuView.process({ name: 'shim_end_menu', window: 77, prompt: 'Inventory:' });
assert.equal(nativeMenuView.snapshot().currentMenu.items[0].calledName, 'sunrise', 'game view keeps classic-menu calledName');
assertNoHiddenGeneric(nativeMenuView.snapshot().currentMenu, 'game-view called classic menu');
const selectorTextOnlyMenu = MenuMetadataAdapter.adaptV1MenuSnapshotToV2Events({ window: 7, prompt: 'Inventory:', items: [{ selector: 97, text: `a - ${hiddenGeneric}` }] }, { sequenceStart: 240 }).find((entry) => entry.eventType === 'menu.item');
assert.equal(selectorTextOnlyMenu.payload.item.text, 'a - item', 'selector/text-only classic inventory row fails closed without semantic metadata');
assertNoHiddenGeneric(selectorTextOnlyMenu, 'selector/text-only classic menu lowering');
const selectorBareTextMenu = MenuMetadataAdapter.adaptV1MenuSnapshotToV2Events({ window: 8, prompt: 'Inventory:', items: [{ selector: 97, text: hiddenGeneric }] }, { sequenceStart: 245 }).find((entry) => entry.eventType === 'menu.item');
assert.equal(selectorBareTextMenu.payload.item.text, 'a - item', 'inventory purpose classifies selector/bare-text rows as objects without relying on selector-prefix shape');
assertNoHiddenGeneric(selectorBareTextMenu, 'selector/bare-text classic inventory lowering');
const selectorTextOnlyShim = ShimProtocol.normalizeRawShimEvent({ name: 'shim_add_menu', window: 7, selector: 97, text: `a - ${hiddenGeneric}` });
assert.equal(selectorTextOnlyShim.event.text, `a - ${hiddenGeneric}`, 'context-free shim ingress preserves ambiguous selector/text prose until menu purpose is known');
assert.equal(selectorTextOnlyShim.event.semanticKnown, undefined, 'context-free shim ingress does not falsely classify ambiguous prose as an object');
const selectorBareTextShim = ShimProtocol.normalizeRawShimEvent({ name: 'shim_add_menu', window: 8, selector: 97, text: hiddenGeneric });
assert.equal(selectorBareTextShim.event.text, hiddenGeneric, 'context-free shim ingress preserves bare ambiguous prose until menu purpose is known');
assert.equal(selectorBareTextShim.event.semanticKnown, undefined, 'bare ambiguous prose remains unclassified before menu context');
const directUnknownMenu = { protocol: UiProtocol.protocol, sequence: 220, eventId: 'evt-direct-unknown-menu', eventType: 'menu.item', turn: 1, payload: { menuId: 'menu-direct', item: { selector: 'a', text: `a - ${hiddenGeneric}`, semanticKind: 'object' } } };
assert.equal(UiProtocol.validateEventEnvelope(directUnknownMenu).ok, false, 'direct v2 object menu item rejects generic text when identity knowledge is omitted');
const directAppearanceMenu = { ...directUnknownMenu, sequence: 221, eventId: 'evt-direct-appearance-menu', payload: { menuId: 'menu-direct', item: { selector: 'a', text: 'a - milky potion', semanticKind: 'object', semanticAppearance: 'milky potion' } } };
assert.equal(UiProtocol.validateEventEnvelope(directAppearanceMenu).ok, true, 'direct v2 object menu item accepts matching explicit public appearance');
const omittedDispatchCommand = CommandGateway.createActionExecuteCommand({ commandId: 'cmd-omitted-generic', actionId: 'item.drop', item: { objectId: 877, selector: 'a', displayName: hiddenGeneric }, route: { actionId: 'item.drop', command: 'da', selector: 'a' } });
assert.equal(omittedDispatchCommand.payload.item.displayName, 'item', 'dispatch command projection neutralizes omitted generic identity');
assert.equal(omittedDispatchCommand.payload.item.known.identity, false, 'dispatch command carries explicit fail-closed knowledge');
assertNoHiddenGeneric(omittedDispatchCommand, 'dispatch command with omitted identity');
assert.equal(UiProtocol.validateCommandEnvelope(omittedDispatchCommand).ok, true, 'safely normalized dispatch command validates without partial leakage');
const targetOverrideCommand = CommandGateway.createActionExecuteCommand({
  commandId: 'cmd-omitted-target', actionId: 'item.drop',
  item: { objectId: 878, selector: 'a', displayName: 'milky potion', semanticAppearance: 'milky potion' },
  target: { selector: 'a', displayName: hiddenGeneric },
  route: { actionId: 'item.drop', command: 'da', selector: 'a' },
  payload: { item: { displayName: hiddenGeneric }, target: { selector: 'a', displayName: hiddenGeneric }, route: { command: hiddenGeneric } },
});
assert.equal(targetOverrideCommand.targets.displayName, 'item', 'top-level action target is fail-closed');
assert.equal(targetOverrideCommand.payload.target.displayName, 'item', 'payload target is fail-closed');
assert.equal(targetOverrideCommand.payload.item.displayName, 'milky potion', 'payload cannot override the canonical sanitized item');
assertNoHiddenGeneric(targetOverrideCommand, 'target/payload override dispatch command');
assert.equal(UiProtocol.validateCommandEnvelope(targetOverrideCommand).ok, true, 'sanitized target/payload command validates');
const hostileRawCommand = structuredClone(targetOverrideCommand);
hostileRawCommand.targets = { selector: 'a', displayName: hiddenGeneric };
hostileRawCommand.payload.target = { selector: 'a', displayName: hiddenGeneric };
assert.equal(UiProtocol.validateCommandEnvelope(hostileRawCommand).ok, false, 'direct hostile target command rejects omitted identity knowledge');
const hostileRecording = { schema: RecordingSchema.v2, createdAt: new Date(0).toISOString(), events: [{ type: 'ui-protocol-command', command: hostileRawCommand }] };
assert.equal(RecordingSchema.validateRecording(hostileRecording).ok, false, 'recording rejects a command containing an unauthorized target label');
const hostileTransferSession = {
  protocol: UiProtocol.protocol, sequence: 260, eventId: 'evt-hostile-transfer-session', eventType: 'transfer.session.opened', turn: 1,
  payload: { sessionId: 'hostile-transfer', kind: 'ground-pickup', leftRows: [{ selector: 'a', text: hiddenGeneric }], rightRows: [], loadedSides: { left: true, right: true } },
};
assert.equal(UiProtocol.validateEventEnvelope(hostileTransferSession).ok, false, 'transfer rows reject omitted generic identity knowledge');
const hostileTransferBegun = {
  protocol: UiProtocol.protocol, sequence: 261, eventId: 'evt-hostile-transfer-begun', eventType: 'transfer.begun', turn: 1,
  payload: { transferId: 'hostile-transfer-1', sessionId: 'hostile-transfer', direction: 'ground-to-inventory', sourceSide: 'left', targetSide: 'right', selector: 'a', itemName: hiddenGeneric, beforePanes: { left: [], right: [] } },
};
assert.equal(UiProtocol.validateEventEnvelope(hostileTransferBegun).ok, false, 'transfer itemName must match an explicitly authorized source row');
const hostileDirectTransfer = { protocol: UiProtocol.protocol, commandId: 'cmd-hostile-transfer', commandType: 'ground.transfer', targets: { displayName: hiddenGeneric, location: { kind: 'ground' } }, payload: { transferId: 't1', direction: 'ground-to-inventory', coord: { x: 1, y: 1 }, itemId: 1, count: 1 } };
assert.equal(UiProtocol.validateCommandEnvelope(hostileDirectTransfer).ok, false, 'non-action direct command target rejects omitted generic identity knowledge');
assert.equal(RecordingSchema.validateRecording({ schema: RecordingSchema.v2, events: [{ type: 'ui-protocol-command', command: hostileDirectTransfer }] }).ok, false, 'recording rejects hostile non-action command targets');
const hostileDirectItemName = { ...hostileDirectTransfer, commandId: 'cmd-hostile-item-name', targets: { itemId: 1, itemName: hiddenGeneric } };
assert.equal(UiProtocol.validateCommandEnvelope(hostileDirectItemName).ok, false, 'non-action targets reject itemName aliases without public knowledge');
assert.equal(RecordingSchema.validateRecording({ schema: RecordingSchema.v2, events: [{ type: 'ui-protocol-command', command: hostileDirectItemName }] }).ok, false, 'recording rejects non-action itemName target aliases');
for (const [label, targets] of [
  ['primitive target array', [hiddenGeneric]],
  ['unknown target key', { leakedLabel: hiddenGeneric }],
  ['identity-bearing publicId', { publicId: hiddenGeneric }],
]) {
  const probe = { ...hostileDirectTransfer, commandId: `cmd-hostile-${label.replace(/\W+/g, '-')}`, targets };
  assert.equal(UiProtocol.validateCommandEnvelope(probe).ok, false, `non-action direct command rejects ${label}`);
  assert.equal(RecordingSchema.validateRecording({ schema: RecordingSchema.v2, events: [{ type: 'ui-protocol-command', command: probe }] }).ok, false, `recording rejects ${label}`);
}
const hostileAffordance = { protocol: UiProtocol.protocol, sequence: 262, eventId: 'evt-hostile-affordance', eventType: 'action.affordances', turn: 1, payload: { actions: [{ actionId: 'item.test', label: 'Test', enabled: true, targets: { displayName: hiddenGeneric } }] } };
assert.equal(UiProtocol.validateEventEnvelope(hostileAffordance).ok, false, 'action affordance targets reject omitted generic identity knowledge');
assert.equal(UiProtocol.validateEventEnvelope({ ...hostileAffordance, sequence: 263, eventId: 'evt-hostile-affordance-payload', payload: { ...hostileAffordance.payload, item: { displayName: hiddenGeneric } } }).ok, false, 'action affordances payload rejects arbitrary item-bearing keys');
for (const [label, targets] of [
  ['itemName alias', { itemName: hiddenGeneric }],
  ['primitive array target', [hiddenGeneric]],
  ['publicId display bypass', { publicId: 'x', displayName: hiddenGeneric }],
]) {
  const probe = structuredClone(hostileAffordance);
  probe.eventId = `evt-hostile-affordance-${label.replace(/\W+/g, '-')}`;
  probe.payload.actions[0].targets = targets;
  assert.equal(UiProtocol.validateEventEnvelope(probe).ok, false, `action affordance rejects ${label}`);
}
const hostileAffordanceParams = structuredClone(hostileAffordance);
hostileAffordanceParams.payload.actions[0].targets = undefined;
hostileAffordanceParams.payload.actions[0].params = { item: { publicId: 'x', displayName: hiddenGeneric } };
assert.equal(UiProtocol.validateEventEnvelope(hostileAffordanceParams).ok, false, 'action affordance params are closed and cannot carry nested item identity');
for (const source of [hiddenGeneric, { itemName: hiddenGeneric }]) {
  const probe = structuredClone(hostileAffordance);
  probe.payload.actions[0].targets = undefined;
  probe.payload.actions[0].source = source;
  assert.equal(UiProtocol.validateEventEnvelope(probe).ok, false, 'action affordance source is restricted to an opaque source token');
}
const publicIdOnlyAffordance = structuredClone(hostileAffordance);
publicIdOnlyAffordance.payload.actions[0].targets = { publicId: hiddenGeneric };
assert.equal(UiProtocol.validateEventEnvelope(publicIdOnlyAffordance).ok, false, 'action affordance publicId rejects semantic identity text');
const hostileChoreography = { protocol: UiProtocol.protocol, sequence: 264, eventId: 'evt-hostile-transfer-choreography', eventType: 'transfer.choreography.updated', turn: 1, payload: { sessionId: 'hostile-transfer', pendingSelection: { action: 'out', selector: 'a', sourceSide: 'left', itemName: hiddenGeneric } } };
assert.equal(UiProtocol.validateEventEnvelope(hostileChoreography).ok, false, 'transfer pendingSelection itemName requires an explicitly public item');
for (const eventType of ['ground.transfer.confirmed', 'container.transfer.confirmed']) {
  const probe = { protocol: UiProtocol.protocol, sequence: 265, eventId: `evt-hostile-${eventType}`, eventType, turn: 1, payload: { commandId: 'cmd-transfer', itemName: hiddenGeneric, item: { displayName: hiddenGeneric } } };
  assert.equal(UiProtocol.validateEventEnvelope(probe).ok, false, `${eventType} closes arbitrary item-bearing payload fields`);
}
const hostilePromptAnswer = { protocol: UiProtocol.protocol, sequence: 266, eventId: 'evt-hostile-prompt-answer', eventType: 'prompt.answered', turn: 1, payload: { promptId: 'p1', item: { displayName: hiddenGeneric } } };
assert.equal(UiProtocol.validateEventEnvelope(hostilePromptAnswer).ok, false, 'prompt answer payload is closed against item identity smuggling');
const hostileMapCell = { protocol: UiProtocol.protocol, sequence: 267, eventId: 'evt-hostile-map-cell', eventType: 'map.cell.updated', turn: 1, payload: { coord: { x: 1, y: 1 }, item: { displayName: hiddenGeneric } } };
assert.equal(UiProtocol.validateEventEnvelope(hostileMapCell).ok, false, 'map cell payload is closed against arbitrary item-bearing fields');
const hostileContainerIdentity = { protocol: UiProtocol.protocol, sequence: 268, eventId: 'evt-hostile-container-identity', eventType: 'container.session.opened', turn: 1, payload: { sessionId: 'hostile-container', container: { publicId: 'box', displayName: hiddenGeneric } } };
assert.equal(UiProtocol.validateEventEnvelope(hostileContainerIdentity).ok, false, 'container identity display requires explicit public knowledge');
const hostileTransferConfirmed = { protocol: UiProtocol.protocol, sequence: 269, eventId: 'evt-hostile-transfer-confirmed-name', eventType: 'transfer.confirmed', turn: 1, payload: { transferId: 't1', name: hiddenGeneric } };
assert.equal(UiProtocol.validateEventEnvelope(hostileTransferConfirmed).ok, false, 'generic transfer confirmation name is restricted to an opaque event token');
for (const commandType of ['prompt.answer', 'menu.select']) {
  const command = { protocol: UiProtocol.protocol, commandId: `cmd-hostile-${commandType}`, commandType, payload: { leakedLabel: hiddenGeneric } };
  assert.equal(UiProtocol.validateCommandEnvelope(command).ok, false, `${commandType} uses a closed payload schema`);
}
const sourceSmuggle = { protocol: UiProtocol.protocol, sequence: 270, eventId: 'evt-hostile-source', eventType: 'replay.marker', turn: 1, source: { layer: 'renderer', itemName: hiddenGeneric }, payload: { name: 'marker' } };
assert.equal(UiProtocol.validateEventEnvelope(sourceSmuggle).ok, false, 'event source rejects arbitrary nested identity fields');
const sectionSmuggle = structuredClone(hostileAffordance);
sectionSmuggle.payload.actions[0].targets = undefined;
sectionSmuggle.payload.actions[0].section = { itemName: hiddenGeneric };
assert.equal(UiProtocol.validateEventEnvelope(sectionSmuggle).ok, false, 'action section is a string, not an identity-bearing object');
const ackSmuggle = { protocol: UiProtocol.protocol, sequence: 271, eventId: 'evt-hostile-ack-delta', eventType: 'command.completed', turn: 1, payload: { commandId: 'cmd1', status: 'success', executionSource: 'native-ui-command', replayBehavior: 'preserved evidence only; no raw fallback input sent', result: { delta: { itemName: hiddenGeneric } } } };
assert.equal(UiProtocol.validateEventEnvelope(ackSmuggle).ok, false, 'command acknowledgement result rejects open-ended delta objects');
const transferOwnerSmuggle = { protocol: UiProtocol.protocol, sequence: 272, eventId: 'evt-hostile-transfer-owner', eventType: 'ground.transfer.rejected', turn: 1, payload: { commandId: 'cmd1', reason: 'blocked', activeInputOwner: { itemName: hiddenGeneric } } };
assert.equal(UiProtocol.validateEventEnvelope(transferOwnerSmuggle).ok, false, 'transfer acknowledgement owner uses a closed schema');
const transferDeltaSmuggle = { protocol: UiProtocol.protocol, sequence: 273, eventId: 'evt-hostile-transfer-delta', eventType: 'transfer.completed', turn: 1, payload: { transferId: 't1', groundPileDelta: { updated: [{ itemName: hiddenGeneric }], changed: true } } };
assert.equal(UiProtocol.validateEventEnvelope(transferDeltaSmuggle).ok, false, 'transfer delta updated entries use a closed before/after schema');
const mapNameSmuggle = { protocol: UiProtocol.protocol, sequence: 274, eventId: 'evt-hostile-map-name', eventType: 'map.cell.updated', turn: 1, payload: { coord: { x: 1, y: 1 }, semanticName: hiddenGeneric } };
assert.equal(UiProtocol.validateEventEnvelope(mapNameSmuggle).ok, false, 'map semantic identity requires explicit knowledge');
const mapAffordanceSmuggle = { protocol: UiProtocol.protocol, sequence: 275, eventId: 'evt-hostile-map-affordance', eventType: 'map.cell.updated', turn: 1, payload: { coord: { x: 1, y: 1 }, actionAffordances: [{ itemName: hiddenGeneric }] } };
assert.equal(UiProtocol.validateEventEnvelope(mapAffordanceSmuggle).ok, false, 'map affordances are public string tokens, not open nested objects');
const coordSmuggle = { ...hostileDirectTransfer, commandId: 'cmd-hostile-coord', targets: { coord: { x: 1, y: 1, itemName: hiddenGeneric } } };
assert.equal(UiProtocol.validateCommandEnvelope(coordSmuggle).ok, false, 'nested coordinates are closed');
assert.equal(CommandGateway.validateDirectCommandEnvelope(coordSmuggle).ok, false, 'gateway intrinsically rejects malformed direct commands without injected protocol context');
const knownSmuggle = { ...hostileDirectTransfer, commandId: 'cmd-hostile-known', targets: { itemId: 1, displayName: 'item', known: { identity: false, itemName: hiddenGeneric } } };
assert.equal(UiProtocol.validateCommandEnvelope(knownSmuggle).ok, false, 'direct target known flags are closed');
for (const recording of [
  { schema: RecordingSchema.v2, events: [], itemName: hiddenGeneric },
  { schema: RecordingSchema.v2, events: [{ type: 'checkpoint', name: 'safe', itemName: hiddenGeneric }] },
  { schema: RecordingSchema.v2, events: [{ type: 'ui-protocol-event', event: { protocol: UiProtocol.protocol, sequence: 999, eventId: 'marker', eventType: 'replay.marker', turn: 0, payload: { name: 'safe' } }, itemName: hiddenGeneric }] },
]) assert.equal(RecordingSchema.sanitizeForSave(recording).ok, false, 'recording root and wrappers reject arbitrary identity-bearing fields');
const backgroundMapSmuggle = { protocol: UiProtocol.protocol, sequence: 276, eventId: 'evt-hostile-background-name', eventType: 'map.cell.updated', turn: 1, payload: { coord: { x: 1, y: 1 }, backgroundSemanticName: hiddenGeneric } };
assert.equal(UiProtocol.validateEventEnvelope(backgroundMapSmuggle).ok, false, 'map background semantic identity requires explicit knowledge');
const typedMapSmuggle = { protocol: UiProtocol.protocol, sequence: 277, eventId: 'evt-hostile-map-type', eventType: 'map.cell.updated', turn: 1, payload: { coord: { x: 1, y: 1 }, semanticKind: { itemName: hiddenGeneric } } };
assert.equal(UiProtocol.validateEventEnvelope(typedMapSmuggle).ok, false, 'map semantic fields are strictly typed');
for (const field of ['calledName', 'individualName', 'objectClass', 'actionAffordances']) {
  const item = { objectId: 999, displayName: 'item', semanticKnown: false, known: { identity: false, appearance: false }, [field]: field === 'actionAffordances' ? [hiddenGeneric] : hiddenGeneric };
  const event = { protocol: UiProtocol.protocol, sequence: 278, eventId: `evt-hostile-item-${field}`, eventType: 'inventory.snapshot', turn: 1, payload: { revision: 1, items: [item] } };
  assert.equal(UiProtocol.validateEventEnvelope(event).ok, false, `public item ${field} cannot smuggle identity`);
}
const selectorSmuggle = { protocol: UiProtocol.protocol, sequence: 279, eventId: 'evt-hostile-transfer-selector', eventType: 'transfer.session.opened', turn: 1, payload: { sessionId: 'selector-smuggle', kind: 'ground-pickup', leftRows: [{ selector: hiddenGeneric, text: 'item', semanticKnown: false, known: { identity: false, appearance: false } }], rightRows: [] } };
assert.equal(UiProtocol.validateEventEnvelope(selectorSmuggle).ok, false, 'transfer selectors are opaque tokens, not identity text');
const factorySmuggle = CommandGateway.createActionExecuteCommand({ commandId: 'cmd-factory-smuggle', actionId: 'item.drop', route: { actionId: 'item.drop', command: 'da', selector: 'a' }, payload: { leakedLabel: hiddenGeneric } });
assertNoHiddenGeneric(factorySmuggle, 'closed command factory payload projection');
for (const targets of [
  { semanticAppearance: hiddenGeneric, known: { identity: false, appearance: true } },
  { known: { identity: false }, appearanceName: hiddenGeneric },
]) {
  const probe = { ...hostileDirectTransfer, commandId: 'cmd-omitted-display-target', targets };
  assert.equal(UiProtocol.validateCommandEnvelope(probe).ok, false, 'public appearance text cannot bypass target display schema by omitting displayName');
  assert.equal(CommandGateway.validateDirectCommandEnvelope(probe).ok, false, 'gateway blocks omitted-display appearance targets');
}
const shimSurfaceProbe = ShimProtocol.normalizeRawShimEvent({ name: 'shim_update_inventory', revision: 30, items: [{ selector: 97, displayName: 'item', semanticKnown: false, known: { identity: false, appearance: false }, calledName: hiddenGeneric, individualName: hiddenGeneric, actionAffordances: [hiddenGeneric] }] });
assertNoHiddenGeneric(shimSurfaceProbe, 'shim item naming and action-token projection');
assert.equal(shimSurfaceProbe.event.items[0].calledName, undefined, 'shim omits naming without explicit public naming knowledge');
assert.deepEqual(shimSurfaceProbe.event.items[0].actionAffordances, [], 'shim drops non-token action affordances');
const shimGroundClassProbe = ShimProtocol.normalizeRawShimEvent({ name: 'shim_ground_pile_snapshot', revision: 31, coord: { x: 1, y: 1 }, items: [{ objectId: 1, displayName: 'item', semanticKnown: false, known: { identity: false, appearance: false }, objectClass: hiddenGeneric }] });
assert.equal(shimGroundClassProbe.event.items[0].objectClass, undefined, 'shim ground objectClass is one public class character');
assertNoHiddenGeneric(shimGroundClassProbe, 'shim ground class projection');
const shimMapProbe = ShimProtocol.normalizeRawShimEvent({ name: 'shim_print_glyph', window: 1, x: 1, y: 1, char: '.', semanticKind: hiddenGeneric, assetId: hiddenGeneric, backgroundSemanticKind: hiddenGeneric, backgroundSemanticName: hiddenGeneric, objectLayerChar: hiddenGeneric, objectLayerSemanticKind: hiddenGeneric, actionAffordances: [hiddenGeneric] });
assertNoHiddenGeneric(shimMapProbe, 'shim map token and semantic-layer projection');
assert.equal(shimMapProbe.event.backgroundSemanticName, undefined, 'shim map background identity requires explicit knowledge');
const exactMapObject = ShimProtocol.normalizeRawShimEvent({ name: 'shim_print_glyph', window: 1, x: 2, y: 1, char: '(', glyph: 1, objectId: 73, displayName: 'a figurine of a horse', semanticKind: 'object', semanticName: 'figurine', semanticKnown: true });
assert.equal(exactMapObject.event.displayName, 'a figurine of a horse', 'known map object keeps the native instance-specific public display name');
const redactedMapObject = ShimProtocol.normalizeRawShimEvent({ name: 'shim_print_glyph', window: 1, x: 3, y: 1, char: '!', glyph: 2, objectId: 74, displayName: 'a potion of death', semanticKind: 'object', semanticName: 'death', semanticAppearance: 'ruby potion', semanticKnown: false });
assert.equal(redactedMapObject.event.displayName, 'ruby potion', 'unidentified map object display name fails closed to its public appearance');
for (const recording of [
  { schema: RecordingSchema.v2, metadata: { recorder: 'test', itemName: hiddenGeneric }, events: [] },
  { schema: RecordingSchema.v2, character: { role: 'Wizard', itemName: hiddenGeneric }, events: [] },
  { schema: RecordingSchema.v2, milestones: [{ type: 'test', itemName: hiddenGeneric }], events: [] },
  { schema: RecordingSchema.v2, events: [{ type: 'input', key: '.', keycode: 46, source: { itemName: hiddenGeneric } }] },
]) assert.equal(RecordingSchema.sanitizeForSave(recording).ok, false, 'recording nested root fields cannot carry unvalidated item identity');
const hostileShimRecording = { schema: RecordingSchema.v2, events: [{ type: 'shim-event', event: { name: 'shim_update_inventory', revision: 1, items: [{ selector: 97, text: `a - ${hiddenGeneric}` }] } }] };
assert.equal(RecordingSchema.validateRecording(hostileShimRecording).ok, false, 'raw shim recordings reject item events that are not already normalized public data');
const safeMenuAnswer = ShimProtocol.normalizeRawShimEvent({ name: 'bridge_menu_answer', targetText: hiddenGeneric, answer: 'a' }).event;
assert.equal(safeMenuAnswer.targetText, 'item', 'normalized shim metadata projects targetText through public item knowledge');
assertNoHiddenGeneric(safeMenuAnswer, 'normalized bridge menu answer metadata');
assert.equal(RecordingSchema.validateRecording({ schema: RecordingSchema.v2, events: [{ type: 'shim-event', event: safeMenuAnswer }] }).ok, true, 'recording accepts already-safe normalized shim metadata');


function namingCase(field, appearanceFlag) {
  return {
    objectId: 880,
    selector: 97,
    [field]: field === 'text' ? `a - ${hiddenGeneric}` : hiddenGeneric,
    semanticKnown: false,
    semanticAppearance: 'milky potion',
    publicClass: 'potion',
    filterGroups: ['consumables', 'magic'],
    ...(appearanceFlag === undefined ? {} : { known: { identity: false, appearance: appearanceFlag } }),
  };
}
for (const field of ['displayName', 'text', 'name']) {
  for (const appearanceFlag of [undefined, false, true]) {
    const label = `${field}/${String(appearanceFlag)}`;
    const source = namingCase(field, appearanceFlag);
    const inventory = InventoryAdapter.normalizePublicInventoryItem(source);
    const expected = appearanceFlag === true ? hiddenGeneric : (appearanceFlag === false ? 'item' : 'milky potion');
    assert.equal(inventory.displayName, expected, `${label}: inventory projection follows explicit appearance authorization`);
    assert.equal(inventory.known.appearance, appearanceFlag === false ? false : true, `${label}: known appearance is explicit or established only by semantic appearance`);
    const presentation = ItemPresentation.presentItem(source);
    assert.equal(presentation.displayName, appearanceFlag === true ? hiddenGeneric : (appearanceFlag === false ? 'Item' : 'milky potion'), `${label}: direct browser model uses the same fail-closed naming rule`);
    let iconInput;
    const iconPresentation = ItemPresentation.presentItem(source, { iconResolver(input) { iconInput = input; return null; } });
    const dispatch = EquipmentScreen.publicDispatchPayload(iconPresentation.actions[0], iconPresentation);
    if (appearanceFlag !== true) {
      for (const [pathName, projected] of [
        ['inventory', inventory],
        ['presentation', presentation],
        ['icon resolver', iconInput],
        ['dispatch', dispatch],
        ['ground', GroundAdapter.normalizePublicGroundItem(source)],
        ['container', ContainerAdapter.normalizePublicContainerItem(source)],
      ]) assertNoHiddenGeneric(projected, `${label}/${pathName}`);
      assert.equal(ItemPresentation.matchesItem(presentation, hiddenGeneric, 'all'), false, `${label}: search cannot find hidden identity`);
    } else {
      assert.equal(presentation.displayName, hiddenGeneric, `${label}: explicitly authorized public appearance survives`);
      assert.equal(ItemPresentation.matchesItem(presentation, hiddenGeneric, 'all'), true, `${label}: explicitly public appearance remains searchable`);
    }
  }
}

for (const field of ['displayName', 'text', 'name']) {
  const withoutAppearance = { objectId: 889, [field]: field === 'text' ? `a - ${hiddenGeneric}` : hiddenGeneric, semanticKnown: false };
  assert.equal(InventoryAdapter.normalizePublicInventoryItem(withoutAppearance).displayName, 'item', `${field}: missing public appearance falls back to a neutral inventory label`);
  assert.equal(ItemPresentation.presentItem(withoutAppearance).displayName, 'Item', `${field}: missing public appearance falls back to a neutral browser label`);
  assertNoHiddenGeneric(GroundAdapter.normalizePublicGroundItem(withoutAppearance), `${field}/ground without appearance`);
  assertNoHiddenGeneric(ContainerAdapter.normalizePublicContainerItem(withoutAppearance), `${field}/container without appearance`);
}

const rawV2Unknown = (known) => ({
  protocol: UiProtocol.protocol, sequence: 70, eventId: `evt-adversarial-${known?.appearance ?? 'absent'}`, eventType: 'inventory.snapshot', turn: 1,
  payload: { revision: 1, items: [{ objectId: 890, displayName: hiddenGeneric, semanticKnown: false, semanticAppearance: 'milky potion', ...(known ? { known: { identity: false, ...known } } : {}) }] },
});
assert.equal(UiProtocol.validateEventEnvelope(rawV2Unknown()).ok, false, 'raw v2 unknown item cannot treat generic displayName as appearance without authorization');
assert.equal(UiProtocol.validateEventEnvelope(rawV2Unknown({ appearance: false })).ok, false, 'raw v2 unknown item cannot contradict explicit appearance redaction');
assert.equal(UiProtocol.validateEventEnvelope(rawV2Unknown({ appearance: true })).ok, true, 'raw v2 explicitly public generic appearance remains valid');
const invalidV2ThroughShim = ShimProtocol.normalizeRawShimEvent(rawV2Unknown());
assert.equal(invalidV2ThroughShim.valid, false, 'shim wrapper does not mark an invalid v2 unknown-generic event valid');
assertNoHiddenGeneric(invalidV2ThroughShim, 'invalid v2 shim wrapper');
const menuKnownFlagOnly = MenuMetadataAdapter.adaptV1MenuSnapshotToV2Events({ window: 10, prompt: 'Inventory:', items: [{ selector: 97, text: `a - ${hiddenGeneric}`, known: { identity: false }, semanticAppearance: 'milky potion' }] }, { sequenceStart: 80 }).find((entry) => entry.eventType === 'menu.item');
assert.equal(menuKnownFlagOnly.payload.item.text, 'a - milky potion', 'menu v2 lowering honors known.identity false even without semanticKnown');
assert.equal(menuKnownFlagOnly.payload.item.semanticKnown, false);
assertNoHiddenGeneric(menuKnownFlagOnly, 'known-flag-only menu v2 lowering');

const equipmentNamingCases = [undefined, false, true].map((appearanceFlag, index) => EquipmentAdapter.normalizeEquipmentSnapshotPayload({
  revision: index + 1,
  slots: [{
    slotId: 'ring.left', objectId: 900 + index,
    item: { objectId: 900 + index, displayName: 'ring of conflict', semanticKnown: false, semanticAppearance: 'opal ring', publicClass: 'ring', equipmentSlots: ['ring.left', 'ring.right'], ...(appearanceFlag === undefined ? {} : { known: { identity: false, appearance: appearanceFlag } }) },
  }],
}));
assert.equal(equipmentNamingCases[0].slots[0].item.displayName, 'opal ring');
assert.equal(equipmentNamingCases[1].slots[0].item.displayName, 'item');
assert.equal(equipmentNamingCases[2].slots[0].item.displayName, 'ring of conflict');
assertNoRecursiveText(equipmentNamingCases[0], 'ring of conflict', 'equipment/no appearance flag');
assertNoRecursiveText(equipmentNamingCases[1], 'ring of conflict', 'equipment/appearance false');
const incompatibleEquipment = EquipmentAdapter.normalizeEquipmentSnapshotPayload({ revision: 9, slots: [{ slotId: 'mainHand', item: { objectId: 919, displayName: 'milky potion', semanticKnown: false, semanticAppearance: 'milky potion', publicClass: 'potion' } }] });
assert.equal(incompatibleEquipment.collectionValid, false, 'class-incompatible equipment item makes the authoritative collection malformed');
const mismatchedEquipment = EquipmentAdapter.normalizeEquipmentSnapshotPayload({ revision: 9, slots: [{ slotId: 'mainHand', objectId: 920, item: { objectId: 921, displayName: 'spear', semanticKnown: true, publicClass: 'weapon', equipmentSlots: ['mainHand'] } }] });
assert.equal(mismatchedEquipment.collectionValid, false, 'slot/item object-ID mismatch makes the authoritative collection malformed');
const duplicateEquipment = EquipmentAdapter.normalizeEquipmentSnapshotPayload({ revision: 9, slots: [{ slotId: 'mainHand' }, { slotId: 'mainHand' }] });
assert.equal(duplicateEquipment.collectionValid, false, 'duplicate authoritative equipment slots reject atomically');
const duplicateEquipmentEnvelope = { protocol: UiProtocol.protocol, sequence: 90, eventId: 'evt-duplicate-equipment', eventType: 'equipment.snapshot', turn: 1, payload: { revision: 9, slots: [{ slotId: 'mainHand' }, { slotId: 'mainHand' }] } };
assert.equal(UiProtocol.validateEventEnvelope(duplicateEquipmentEnvelope).ok, false, 'v2 schema rejects duplicate authoritative equipment slots');

for (const appearanceFlag of [undefined, false, true]) {
  const source = namingCase('text', appearanceFlag);
  const shimInventory = ShimProtocol.normalizeRawShimEvent({ name: 'shim_update_inventory', revision: 20, items: [source] });
  assert.equal(shimInventory.valid, true, `shim inventory ${String(appearanceFlag)} remains structurally valid`);
  const expectedText = `a - ${appearanceFlag === true ? hiddenGeneric : (appearanceFlag === false ? 'item' : 'milky potion')}`;
  assert.equal(shimInventory.event.items[0].text, expectedText, `shim inventory ${String(appearanceFlag)} lowers only the authorized label`);
  const shimGround = ShimProtocol.normalizeRawShimEvent({ name: 'shim_ground_pile_snapshot', revision: 20, coord: { x: 1, y: 2 }, items: [source] });
  const shimContainer = ShimProtocol.normalizeRawShimEvent({ name: 'shim_container_contents_snapshot', revision: 20, sessionId: 'matrix', container: { publicId: 'box', displayName: 'box', semanticKnown: false, known: { identity: false, appearance: true } }, items: [source] });
  assert.equal(shimGround.event.items[0].displayName, expectedText.replace(/^a - /, ''));
  assert.equal(shimContainer.event.items[0].displayName, expectedText.replace(/^a - /, ''));
  const inventoryEvent = InventoryAdapter.createInventorySnapshotEvent(shimInventory.event, { sequence: 40 + Number(appearanceFlag === true) });
  assert.equal(UiProtocol.validateEventEnvelope(inventoryEvent).ok, true, `v2 inventory conversion ${String(appearanceFlag)} validates`);
  const menuEvents = MenuMetadataAdapter.adaptV1MenuSnapshotToV2Events({ window: 9, prompt: 'Inventory:', items: [source] }, { sequenceStart: 50 });
  const menuItemEvent = menuEvents.find((entry) => entry.eventType === 'menu.item');
  assert.equal(UiProtocol.validateEventEnvelope(menuItemEvent).ok, true, `v2 menu conversion ${String(appearanceFlag)} validates`);
  if (appearanceFlag !== true) {
    assertNoHiddenGeneric(shimInventory, `shim inventory ${String(appearanceFlag)}`);
    assertNoHiddenGeneric(shimGround, `shim ground ${String(appearanceFlag)}`);
    assertNoHiddenGeneric(shimContainer, `shim container ${String(appearanceFlag)}`);
    assertNoHiddenGeneric(inventoryEvent, `v2 inventory ${String(appearanceFlag)}`);
    assertNoHiddenGeneric(menuItemEvent, `v2 menu ${String(appearanceFlag)}`);
  }
}

const gameView = GameViewState.createGameViewState({ mapWidth: 20, mapHeight: 10 });
let gameResult = gameView.process({ name: 'shim_update_inventory', revision: 60, items: [namingCase('text', undefined)] });
assertNoHiddenGeneric(gameView.snapshot().inventory, 'game-view inventory state');
assertNoHiddenGeneric(gameView.snapshot().cachedInventoryChoices, 'game-view compatibility cache');
assertNoHiddenGeneric(gameResult.effects, 'game-view inventory diagnostics/effects');
gameResult = gameView.process({ name: 'shim_ground_pile_snapshot', revision: 1, coord: { x: 2, y: 3 }, items: [namingCase('name', false)] });
assertNoHiddenGeneric(gameView.snapshot().groundPiles, 'game-view ground state');
assertNoHiddenGeneric(gameResult.effects, 'game-view ground diagnostics/effects');
gameResult = gameView.process({ name: 'shim_container_contents_snapshot', revision: 1, sessionId: 'matrix-session', container: { publicId: 'box', displayName: 'box', semanticKnown: false, known: { identity: false, appearance: true } }, items: [namingCase('displayName', undefined)] });
assertNoHiddenGeneric(gameView.snapshot().containerContents, 'game-view container state');
assertNoHiddenGeneric(gameResult.effects, 'game-view container diagnostics/effects');
const reconciledOmittedObservation = GroundAdapter.reconcileGroundPileObservation([], [{ displayName: hiddenGeneric }], { complete: true });
assertNoHiddenGeneric(reconciledOmittedObservation, 'ground reconciliation without explicit visible-text provenance');
assert.equal(reconciledOmittedObservation[0].displayName, 'item', 'ground reconciliation does not manufacture appearance authorization from its call path');
const reconciledForgedObservation = GroundAdapter.reconcileGroundPileObservation([], [{ displayName: hiddenGeneric }], { complete: true, observedPublicText: true });
assert.equal(reconciledForgedObservation[0].displayName, 'item', 'caller-asserted observation booleans cannot forge visible-text provenance');
const reconciledUnknown = GroundAdapter.reconcileGroundPileObservation(
  [{ objectId: 991, displayName: hiddenGeneric, semanticKnown: true, semanticName: hiddenGeneric, semanticAppearance: 'milky potion' }],
  [{ objectId: 991, displayName: hiddenGeneric, semanticKnown: false, semanticAppearance: 'milky potion' }],
  { complete: true },
);
assert.equal(reconciledUnknown[0].displayName, 'milky potion');
assert.equal(reconciledUnknown[0].semanticName, undefined, 'ground reconciliation cannot restore a prior identity after the incoming observation marks it unknown');
assertNoHiddenGeneric(reconciledUnknown, 'ground reconciliation downgrade');
const reconciledKnownFlagOnly = GroundAdapter.reconcileGroundPileObservation(
  [{ objectId: 993, displayName: hiddenGeneric, semanticKnown: true, semanticName: hiddenGeneric, semanticAppearance: 'milky potion' }],
  [{ objectId: 993, displayName: hiddenGeneric, known: { identity: false }, semanticAppearance: 'milky potion' }],
  { complete: true },
);
assert.equal(reconciledKnownFlagOnly[0].semanticKnown, false, 'known.identity false alone downgrades reconciled semantic knowledge');
assertNoHiddenGeneric(reconciledKnownFlagOnly, 'ground known-flag-only downgrade');

const v2GameView = GameViewState.createGameViewState();
const v2InventoryEvent = InventoryAdapter.createInventorySnapshotEvent({ revision: 5, items: [namingCase('displayName', undefined)] }, { sequence: 101 });
let v2Result = v2GameView.process(v2InventoryEvent);
assert.equal(v2GameView.snapshot().inventory.revision, 5, 'game-view consumes valid v2 inventory snapshots');
assertNoHiddenGeneric(v2GameView.snapshot().inventory, 'game-view v2 inventory state');
assertNoHiddenGeneric(v2Result.effects, 'game-view v2 inventory effects');
const v2EquipmentSnapshot = EquipmentAdapter.normalizeEquipmentSnapshotPayload({ revision: 5, inventoryRevision: 5, slots: [{ slotId: 'ring.left', objectId: 992, item: { objectId: 992, displayName: 'ring of conflict', semanticKnown: false, semanticAppearance: 'opal ring', publicClass: 'ring', equipmentSlots: ['ring.left', 'ring.right'] } }] });
const v2EquipmentEvent = EquipmentAdapter.createEquipmentSnapshotEvent({}, { snapshot: v2EquipmentSnapshot, sequence: 102 });
v2Result = v2GameView.process(v2EquipmentEvent);
assert.equal(v2GameView.snapshot().equipment.revision, 5, 'game-view consumes valid v2 equipment snapshots');
assertNoRecursiveText(v2GameView.snapshot().equipment, 'ring of conflict', 'game-view v2 equipment state');
assertNoRecursiveText(v2Result.effects, 'ring of conflict', 'game-view v2 equipment effects');
const optionalRevisionEquipment = { ...v2EquipmentEvent, sequence: 104, eventId: 'evt-equipment-optional-inventory-revision', payload: { ...v2EquipmentEvent.payload, revision: 6 } };
delete optionalRevisionEquipment.payload.inventoryRevision;
optionalRevisionEquipment.revision = { equipment: 6 };
v2Result = v2GameView.process(optionalRevisionEquipment);
assert.equal(v2GameView.snapshot().equipment.revision, 6, 'optional equipment inventoryRevision inherits current public inventory revision instead of being rejected as zero');

// Authoritative collections reject atomically instead of replacing state with a filtered subset.
let inventoryState = InventoryAdapter.applyInventorySnapshot(InventoryAdapter.emptyInventoryState(), { revision: 1, items: [{ objectId: 1, displayName: 'food ration', semanticKnown: true }] });
const inventoryBeforeMalformed = InventoryAdapter.cloneInventoryState(inventoryState);
inventoryState = InventoryAdapter.applyInventorySnapshot(inventoryState, { revision: 2, items: [{ objectId: 2, displayName: 'apple', semanticKnown: true }, { private: 'secret' }] });
assert.deepEqual(inventoryState.orderedItems, inventoryBeforeMalformed.orderedItems, 'mixed valid/invalid inventory snapshot is rejected atomically');
assert.equal(inventoryState.revision, 1);
const malformedRecognizableInventory = InventoryAdapter.applyInventorySnapshot(inventoryState, { revision: 3, items: [{ objectId: 3, displayName: 'orange', semanticKnown: true }, { objectId: 4, text: 42, semanticKnown: false }] });
assert.equal(malformedRecognizableInventory.revision, 1, 'recognizable item with malformed generic text rejects the full inventory collection');
const malformedRecognizableShim = ShimProtocol.normalizeRawShimEvent({ name: 'shim_update_inventory', revision: 3, items: [{ selector: 97, text: 'a - orange', semanticKnown: true }, { selector: 98, text: 42, semanticKnown: false }] });
assert.equal(malformedRecognizableShim.valid, false, 'shim rejects a recognizable malformed item instead of neutralizing and committing it');

let equipmentState = EquipmentAdapter.applyEquipmentSnapshot(EquipmentAdapter.emptyEquipmentState(), { revision: 1, slots: [{ slotId: 'mainHand', objectId: 11, item: { objectId: 11, displayName: 'spear', semanticKnown: true, publicClass: 'weapon', equipmentSlots: ['mainHand'] } }] });
const equipmentBeforeMalformed = EquipmentAdapter.cloneEquipmentState(equipmentState);
equipmentState = EquipmentAdapter.applyEquipmentSnapshot(equipmentState, { revision: 2, slots: [{ slotId: 'mainHand', objectId: 12, item: { objectId: 12, displayName: 'dagger', semanticKnown: true } }, { private: 'secret' }] });
assert.deepEqual(equipmentState.orderedSlots, equipmentBeforeMalformed.orderedSlots, 'mixed valid/invalid equipment snapshot is rejected atomically');
assert.equal(equipmentState.revision, 1);

let groundState = GroundAdapter.applyGroundPileSnapshot(GroundAdapter.emptyGroundPileState(), { revision: 1, coord: { x: 4, y: 4 }, items: [{ objectId: 21, displayName: 'rock', semanticKnown: true }] });
const groundBeforeMalformed = GroundAdapter.groundPileAt(groundState, { x: 4, y: 4 });
groundState = GroundAdapter.applyGroundPileSnapshot(groundState, { revision: 2, coord: { x: 4, y: 4 }, items: [{ objectId: 22, displayName: 'gem', semanticKnown: true }, { private: 'secret' }] });
assert.deepEqual(GroundAdapter.groundPileAt(groundState, { x: 4, y: 4 }), groundBeforeMalformed, 'mixed valid/invalid ground snapshot is rejected atomically');

let containerState = ContainerAdapter.openSession(ContainerAdapter.emptyContainerContentsState(), { sessionId: 'atomic', container: { publicId: 'box', displayName: 'box', semanticKnown: false, known: { identity: false, appearance: true } } });
let containerApplied = ContainerAdapter.applyContainerContentsSnapshot(containerState, { revision: 1, sessionId: 'atomic', container: { publicId: 'box', displayName: 'box', semanticKnown: false, known: { identity: false, appearance: true } }, items: [{ objectId: 31, displayName: 'ration', semanticKnown: true }] });
containerState = containerApplied.state;
const containerBeforeMalformed = ContainerAdapter.containerContentsAt(containerState, 'atomic');
containerApplied = ContainerAdapter.applyContainerContentsSnapshot(containerState, { revision: 2, sessionId: 'atomic', container: { publicId: 'box', displayName: 'box', semanticKnown: false, known: { identity: false, appearance: true } }, items: [{ objectId: 32, displayName: 'apple', semanticKnown: true }, { private: 'secret' }] });
assert.equal(containerApplied.accepted, false, 'mixed valid/invalid container snapshot reports rejection');
assert.deepEqual(ContainerAdapter.containerContentsAt(containerApplied.state, 'atomic'), containerBeforeMalformed, 'mixed valid/invalid container snapshot preserves prior contents atomically');
assertNoHiddenGeneric(containerApplied.state, 'container malformed rejection state remains sanitized');
assertNoRecursiveText(containerApplied.state, 'secret', 'container malformed rejection does not retain malformed item payload');

const malformedShim = ShimProtocol.normalizeRawShimEvent({ name: 'shim_update_inventory', revision: 61, items: [{ selector: 97, text: 'a - apple', semanticKnown: true }, { private: 'secret' }] });
assert.equal(malformedShim.valid, false, 'shim lowering rejects a mixed malformed authoritative collection instead of filtering it');
const beforeInvalidWrapper = JSON.stringify(gameView.snapshot().inventory.orderedItems);
const ignoredInvalidWrapper = gameView.process({ name: 'shim_update_inventory', revision: 61, items: [{ selector: 97, text: 'a - apple', semanticKnown: true }, { private: 'secret' }] });
assert.equal(JSON.stringify(gameView.snapshot().inventory.orderedItems), beforeInvalidWrapper, 'game-view ignores malformed shim wrapper without replacing accepted inventory');
assert.deepEqual(ignoredInvalidWrapper.effects, [], 'invalid shim wrapper publishes no effects');
const invalidV2InventoryResult = v2GameView.process({ protocol: UiProtocol.protocol, sequence: 103, eventId: 'evt-invalid-inventory-wrapper', eventType: 'inventory.snapshot', turn: 1, payload: { revision: 6, items: [{ displayName: hiddenGeneric, semanticKnown: false, private: 'secret' }] } });
assert.equal(v2GameView.snapshot().inventory.revision, 5, 'invalid v2 inventory wrapper preserves prior state');
assertNoHiddenGeneric(invalidV2InventoryResult, 'invalid v2 inventory diagnostic');
assertNoRecursiveText(invalidV2InventoryResult, 'secret', 'invalid v2 inventory diagnostic is sanitized');
const invalidValueDiagnostic = v2GameView.process({ protocol: UiProtocol.protocol, sequence: 105, eventId: 'evt-invalid-value-diagnostic', eventType: 'inventory.snapshot', turn: 1, payload: { revision: 7, items: [{ displayName: 'milky potion', semanticKnown: false, semanticAppearance: 'milky potion', known: { identity: false, appearance: true }, publicClass: hiddenGeneric, knownFields: { charges: 1 } }] } });
assertNoHiddenGeneric(invalidValueDiagnostic, 'validator errors cannot echo a hidden attacker-controlled schema value');
const invalidValueEnvelope = { protocol: UiProtocol.protocol, sequence: 106, eventId: 'evt-direct-validator-value', eventType: 'inventory.snapshot', turn: 1, payload: { revision: 8, items: [{ displayName: 'milky potion', semanticKnown: false, semanticAppearance: 'milky potion', known: { identity: false, appearance: true }, publicClass: hiddenGeneric, knownFields: { charges: 1 } }] } };
assertNoHiddenGeneric(UiProtocol.validateEventEnvelope(invalidValueEnvelope), 'direct validator errors cannot echo attacker-controlled values');
assertNoHiddenGeneric(UiProtocol.normalizeEventEnvelope(invalidValueEnvelope), 'normalized validator diagnostics cannot echo attacker-controlled values');
const duplicateShimEnvelope = { name: 'shim_update_inventory', revision: 8, items: [{ selector: 97, objectId: 10001, text: 'a - apple', semanticKnown: true }, { selector: 97, objectId: 10002, text: 'a - orange', semanticKnown: true }] };
assert.equal(ShimProtocol.normalizeRawShimEvent(duplicateShimEnvelope).valid, false, 'shim rejects duplicate authoritative selectors before adaptation');
const inventoryBeforeDuplicateShim = v2GameView.snapshot().inventory.revision;
assert.doesNotThrow(() => v2GameView.process(duplicateShimEnvelope), 'game-view ignores duplicate shim keys without throwing');
assert.equal(v2GameView.snapshot().inventory.revision, inventoryBeforeDuplicateShim, 'duplicate shim keys preserve prior inventory state');
const duplicateGroundLetters = GroundAdapter.normalizeGroundPileSnapshotPayload({ revision: 8, coord: { x: 1, y: 1 }, items: [{ selector: 97, displayName: 'apple', semanticKnown: true }, { selector: 97, displayName: 'orange', semanticKnown: true }] });
assert.equal(duplicateGroundLetters.collectionValid, false, 'ground authoritative collections reject duplicate selectors atomically');
const groundBeforeInvalidProtocol = GroundAdapter.groundPileAt(gameView.snapshot().groundPiles, { x: 2, y: 3 });
const invalidProtocolResult = gameView.process({
  protocol: UiProtocol.protocol, sequence: 99, eventId: 'evt-invalid-ground-wrapper', eventType: 'ground.pile.snapshot', turn: 1,
  payload: { revision: 99, coord: { x: 2, y: 3 }, items: [{ objectId: 999, displayName: 'apple', semanticKnown: true }, { private: 'secret', displayName: hiddenGeneric, semanticKnown: false }] },
});
assert.deepEqual(GroundAdapter.groundPileAt(gameView.snapshot().groundPiles, { x: 2, y: 3 }), groundBeforeInvalidProtocol, 'invalid v2 wrapper does not replace accepted ground state');
assertNoHiddenGeneric(invalidProtocolResult, 'invalid v2 game-view diagnostic');
assertNoRecursiveText(invalidProtocolResult, 'secret', 'invalid v2 game-view diagnostic is sanitized');

const groupedSlots = EquipmentScreen.GROUPS.flatMap((group) => group.slots);
for (const required of ['armor.helm', 'eyes', 'amulet', 'armor.cloak', 'armor.body', 'armor.shirt', 'armor.gloves', 'armor.boots', 'armor.shield', 'mainHand', 'offHand', 'ring.left', 'ring.right', 'quiver']) assert(groupedSlots.includes(required), `equipment layout includes ${required}`);
assert.equal(new Set(groupedSlots).size, groupedSlots.length, 'every semantic slot has one stable callout position');
assert.equal(EquipmentScreen.GROUPS.filter((group) => group.rail === 'left').length, 3);
assert.equal(EquipmentScreen.GROUPS.filter((group) => group.rail === 'right').length, 3);

const ownerInventoryItems = Object.freeze([
  Object.freeze({ objectId: 610, selector: 97, text: 'a - a +1 spear', displayName: 'a +1 spear', semanticName: 'spear', semanticKnown: true, known: Object.freeze({ identity: true, appearance: true }), publicClass: 'weapon', actionAffordances: Object.freeze(['wield', 'drop']) }),
  Object.freeze({ objectId: 611, inventoryLetter: 'b', text: 'b - a ruby potion', displayName: 'ruby potion', semanticAppearance: 'ruby potion', semanticKnown: false, known: Object.freeze({ identity: false, appearance: true }), publicClass: 'potion', actionAffordances: Object.freeze(['quaff', 'drop', 'dip']) }),
  Object.freeze({ objectId: 612, selector: 99, text: 'c - an uncursed helmet', displayName: 'uncursed helmet', semanticName: 'helmet', semanticKnown: true, known: Object.freeze({ identity: true, appearance: true }), publicClass: 'armor', equipmentSlots: Object.freeze(['armor.helm']), actionAffordances: Object.freeze(['wear', 'drop']) }),
]);
const ownerInventory = Object.freeze({ revision: 20, orderedItems: ownerInventoryItems });
const ownerEquipment = Object.freeze({ revision: 20, inventoryRevision: 20, orderedSlots: Object.freeze([
  Object.freeze({ slotId: 'mainHand', objectId: null, publicStatus: 'empty', blockedBy: Object.freeze([]) }),
  Object.freeze({ slotId: 'armor.helm', objectId: null, publicStatus: 'empty', blockedBy: Object.freeze([]) }),
]) });
const ownerIntents = [];
const itemEquipmentOwner = EquipmentScreen.createController({ onIntent(intent) { ownerIntents.push(intent); return true; } });
const initialOwnerReconcile = itemEquipmentOwner.reconcile({ inventory: ownerInventory, equipment: ownerEquipment });
assert.equal(initialOwnerReconcile.inventoryAccepted, true, 'item/equipment owner accepts the first immutable inventory revision');
assert.equal(initialOwnerReconcile.equipmentAccepted, true, 'item/equipment owner accepts the linked equipment revision');
assert.equal(itemEquipmentOwner.snapshot().inventoryCount, 3, 'item/equipment owner derives its inventory model from the authoritative snapshot');
assert.equal(itemEquipmentOwner.request({ kind: 'item-action', stableId: 'object:611', actionId: 'item.quaff', inventoryRevision: 19 }), false, 'stale action revision is rejected before routing');
assert.equal(ownerIntents.length, 0, 'stale action rejection dispatches no transport intent');
assert.equal(itemEquipmentOwner.request({ kind: 'item-action', stableId: 'object:611', actionId: 'item.quaff', inventoryRevision: 20 }), true, 'inventoryLetter action is planned');
assert.equal(ownerIntents.at(-1).command, 'qb', 'inventoryLetter is the exact routed NetHack selector');
itemEquipmentOwner.settle({ intentId: ownerIntents.at(-1).intentId, status: 'completed' });
assert.equal(itemEquipmentOwner.request({ kind: 'item-action', stableId: 'object:612', actionId: 'item.wear', inventoryRevision: 20 }), true, 'numeric selector action is planned');
assert.equal(ownerIntents.at(-1).command, 'Wc', 'numeric selector is converted to its exact NetHack inventory letter');
itemEquipmentOwner.settle({ intentId: ownerIntents.at(-1).intentId, status: 'completed' });
assert.equal(itemEquipmentOwner.request({ kind: 'item-action', stableId: 'object:611', actionId: 'item.quaff', inventoryRevision: 20 }), true, 'owner can plan another exact selector action');
const pendingPromptIntent = ownerIntents.at(-1);
const unrelatedPrompt = Object.freeze({
  kind: 'question',
  requestId: 'prompt-unrelated',
  transactionId: 'other-transaction',
  lifecycleRevision: 6,
  query: 'What do you want to quaff? [b or ?*]',
  choices: '',
  promptPurpose: 'prompt.question',
});
assert.equal(itemEquipmentOwner.reconcile({ interaction: Object.freeze({ prompt: unrelatedPrompt, menu: null }) }).ownership.ownsPrompt, false, 'selector-compatible prompt from another transaction is not claimed');
const completedPrompt = Object.freeze({
  kind: 'question',
  requestId: 'prompt-owned-after-completion',
  transactionId: pendingPromptIntent.transactionId,
  lifecycleRevision: 7,
  query: 'What do you want to quaff? [b or ?*]',
  choices: '',
  promptPurpose: 'prompt.question',
});
assert.equal(itemEquipmentOwner.reconcile({ interaction: Object.freeze({ prompt: completedPrompt, menu: null }) }).ownership.ownsPrompt, true, 'matching selector and exact semantic transaction claim the native prompt');
itemEquipmentOwner.settle({ intentId: pendingPromptIntent.intentId, status: 'completed' });
assert.equal(itemEquipmentOwner.ownership().ownsPrompt, true, 'completed action keeps exact native prompt ownership until its immutable prompt revision retires');
assert.equal(itemEquipmentOwner.reconcile({ interaction: Object.freeze({ prompt: completedPrompt, menu: null }) }).ownership.ownsPrompt, true, 'same native prompt revision cannot leak to a duplicate renderer owner');
assert.equal(itemEquipmentOwner.reconcile({ interaction: Object.freeze({ prompt: null, menu: null }) }).ownership.ownsPrompt, false, 'native prompt ownership retires when that exact prompt disappears');
const conflictingOwnerInventory = Object.freeze({ revision: 20, orderedItems: Object.freeze([ownerInventoryItems[0], Object.freeze({ ...ownerInventoryItems[1], displayName: 'conflicting same revision' }), ownerInventoryItems[2]]) });
assert.equal(itemEquipmentOwner.reconcile({ inventory: conflictingOwnerInventory, equipment: ownerEquipment }).inventoryAccepted, false, 'same-revision conflicting immutable inventory is rejected');
assert(itemEquipmentOwner.diagnostics().some((entry) => entry.type === 'snapshot.inventory.rejected' && entry.detail.code === 'conflicting-revision'), 'owner diagnostics identify conflicting immutable revisions');
assert.equal(itemEquipmentOwner.reconcile({ transferOwner: Object.freeze({ id: 'transfer-1', active: true }) }).ownership.active, false, 'Transfer Session signal takes precedence without a second UI owner');
const newRunOwner = EquipmentScreen.createController();
newRunOwner.reconcile({
  inventory: Object.freeze({ revision: 500, orderedItems: Object.freeze([Object.freeze({ objectId: 9001, inventoryLetter: 'a', displayName: 'old hero sword' })]) }),
  equipment: Object.freeze({ revision: 500, inventoryRevision: 500, orderedSlots: Object.freeze([]) }),
});
assert.deepEqual({ revision: newRunOwner.snapshot().inventoryRevision, count: newRunOwner.snapshot().inventoryCount }, { revision: 500, count: 1 }, 'first run seeds the item owner with its authoritative inventory');
newRunOwner.reset({ reason: 'new-run-test' });
assert.deepEqual({ revision: newRunOwner.snapshot().inventoryRevision, count: newRunOwner.snapshot().inventoryCount }, { revision: 0, count: 0 }, 'new run reset removes the prior hero inventory and revision floor');
newRunOwner.reconcile({
  inventory: Object.freeze({ revision: 1, orderedItems: Object.freeze([Object.freeze({ objectId: 1, inventoryLetter: 'b', displayName: 'new hero food ration' })]) }),
  equipment: Object.freeze({ revision: 1, inventoryRevision: 1, orderedSlots: Object.freeze([]) }),
});
assert.deepEqual({ revision: newRunOwner.snapshot().inventoryRevision, count: newRunOwner.snapshot().inventoryCount }, { revision: 1, count: 1 }, 'new run accepts its low initial revision instead of retaining the previous hero snapshot');
const layeredIntents = [];
const layeredOwner = EquipmentScreen.createController({ onIntent(intent) { layeredIntents.push(intent); return true; } });
const layeredInventory = Object.freeze({ revision: 1, orderedItems: Object.freeze([
  Object.freeze({ objectId: 701, inventoryLetter: 'f', displayName: 'an uncursed +0 T-shirt (being worn)', text: 'f - an uncursed +0 T-shirt (being worn)', publicClass: 'armor', equipmentSlots: Object.freeze(['armor.shirt']), actionAffordances: Object.freeze(['takeOff']) }),
  Object.freeze({ objectId: 702, inventoryLetter: 'g', displayName: 'an uncursed +0 leather armor (being worn)', text: 'g - an uncursed +0 leather armor (being worn)', publicClass: 'armor', equipmentSlots: Object.freeze(['armor.body']), actionAffordances: Object.freeze(['takeOff']) }),
]) });
const layeredEquipment = Object.freeze({ revision: 1, inventoryRevision: 1, orderedSlots: Object.freeze([
  Object.freeze({ slotId: 'armor.body', objectId: 702, publicStatus: 'equipped', blockedBy: Object.freeze(['blocked.armor.bodyOverShirt']) }),
  Object.freeze({ slotId: 'armor.shirt', objectId: 701, publicStatus: 'equipped', blockedBy: Object.freeze(['blocked.armor.bodyOverShirt']) }),
]) });
layeredOwner.reconcile({ inventory: layeredInventory, equipment: layeredEquipment });
assert.equal(layeredOwner.request({ kind: 'item-action', stableId: 'object:701', slotId: 'armor.shirt', actionId: 'item.takeOff', inventoryRevision: 1 }), false, 'covered shirt action is rejected at the owner seam');
assert.equal(layeredOwner.snapshot().feedback, 'Shirt covered; remove armor first.', 'covered shirt rejection uses the public blocker label');
assert.equal(layeredIntents.length, 0, 'covered shirt rejection emits no transport intent');
assert.equal(layeredOwner.request({ kind: 'item-action', stableId: 'object:702', slotId: 'armor.body', actionId: 'item.takeOff', inventoryRevision: 1 }), true, 'outer body armor remains directly removable');
assert.equal(layeredIntents.at(-1).command, 'Tg', 'outer body armor uses its exact authoritative selector');
const ringHandOptions = InteractionModel.buildPromptInteraction({
  kind: 'question',
  query: 'Which ring-finger, Right or Left?',
  choices: 'rl',
});
assert.deepEqual(ringHandOptions.options.map(({ key, label }) => ({ key, label })), [
  { key: 'r', label: 'Right hand' },
  { key: 'l', label: 'Left hand' },
], 'classic ring follow-up exposes semantic hand labels instead of generic command names');
const sacrificeOptions = InteractionModel.buildPromptInteraction({
  kind: 'question',
  query: 'What do you want to sacrifice? [f or ?*]',
  choices: '',
}, [{
  objectId: 703,
  inventoryLetter: 'f',
  displayName: 'an uncursed jackal corpse',
  semanticName: 'jackal corpse',
  publicClass: 'food',
}]);
assert.equal(sacrificeOptions.inventoryRows.length, 1, 'normalized inventory letters hydrate sacrifice selectors without a legacy menu cache');
assert.equal(sacrificeOptions.inventoryRows[0].key, 'f', 'sacrifice row preserves the authoritative inventory letter');
assert.match(sacrificeOptions.inventoryRows[0].itemName, /jackal corpse/i, 'sacrifice row exposes the carried corpse name');

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'ux', 'styles', 'items.css'), 'utf8');
assert.match(css, /grid-template-columns:\s*minmax\(0, 42%\) minmax\(0, 58%\)/, 'full layout allocates inventory the larger width');
assert.match(css, /\.uxm-character-safe-area/, 'character-safe area is explicit');
assert.match(css, /\.uxm-callout-rail/, 'full callout rails are explicit');
assert.match(css, /@container \(max-width: 980px\)/, 'compact structural mode follows the workspace width at the supported 960px target');
assert.match(css, /grid-template-rows:\s*minmax\(340px, 48vh\)/, 'compact figure is a leading substantial region');
assert.doesNotMatch(css, /text-overflow:\s*ellipsis/, 'item names never use ellipsis');
assert.doesNotMatch(css, /overflow-x:\s*auto/, 'workspace never introduces horizontal scrolling');

const large = ItemPresentation.presentItems(Array.from({ length: 120 }, (_, index) => ({
  objectId: 1000 + index,
  inventoryLetter: String.fromCharCode(33 + (index % 90)),
  displayName: `representative carried item ${index + 1} with a distinguishing suffix`,
  publicClass: index % 2 ? 'weapon' : 'armor',
  filterGroups: [index % 2 ? 'weapons' : 'armor'],
})));
assert.equal(large.length, 120, 'presentation accepts a 120-row authoritative list without truncation');
assert.equal(new Set(large.map((item) => item.stableId)).size, 120, 'large inventory stable IDs remain unique');


// Center-drop preferred slot routing (paper-doll middle target).
assert.equal(typeof EquipmentScreen.preferredSlotForEquipmentItem, 'function');
assert.equal(EquipmentScreen.preferredSlotForEquipmentItem({
  objectId: 901, selector: 97, inventoryLetter: 'a', displayName: 'a +1 spear', text: 'a - a +1 spear',
  semanticName: 'spear', semanticKnown: true, publicClass: 'weapon', equipmentSlots: ['mainHand', 'offHand', 'quiver'],
  actionAffordances: ['wield', 'throw', 'drop'],
}), 'mainHand', 'weapons prefer main hand on center drop');
assert.equal(EquipmentScreen.preferredSlotForEquipmentItem({
  objectId: 902, selector: 99, inventoryLetter: 'c', displayName: 'an uncursed helmet', text: 'c - an uncursed helmet',
  semanticName: 'helmet', semanticKnown: true, publicClass: 'armor', equipmentSlots: ['armor.helm'],
  actionAffordances: ['wear', 'drop'],
}), 'armor.helm', 'helmets route to helm slot');
assert.equal(EquipmentScreen.preferredSlotForEquipmentItem({
  objectId: 903, selector: 108, inventoryLetter: 'l', displayName: 'a ring of protection', text: 'l - a ring of protection',
  semanticName: 'ring of protection', semanticKnown: true, publicClass: 'ring', equipmentSlots: ['ring.left', 'ring.right'],
  actionAffordances: ['putOn', 'drop'],
}), 'ring.left', 'rings default to left hand when free');
assert.equal(EquipmentScreen.preferredSlotForEquipmentItem({
  objectId: 904, selector: 98, inventoryLetter: 'b', displayName: 'a ruby potion', text: 'b - a ruby potion',
  semanticAppearance: 'ruby potion', semanticKnown: false, publicClass: 'potion',
  actionAffordances: ['quaff', 'drop'],
}), '', 'non-equipables have no preferred equipment slot');
assert.match(fs.readFileSync(path.join(__dirname, '../../src/ux/equipment-screen.js'), 'utf8'), /smartDrop = 'preferred-slot'|Drop here to equip/, 'paper-doll center exposes a smart drop target');
assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../../src/renderer.js'), 'utf8'), /from the movement compass/, 'compass movement no longer appends walk/run log spam');
assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../../src/renderer.js'), 'utf8'), /\$\{movementMode\} \$\{directionKey/, 'directional movement no longer appends walk/run log spam');

console.log('UXM-05 item presentation and equipment layout tests OK');
