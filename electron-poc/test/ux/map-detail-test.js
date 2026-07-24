const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Map = require('../../src/ux/map-detail');
const Target = require('../../src/ux/target-presentation');
const Context = require('../../src/ux/context-action-presentation');
const MapPresentation = require('../../src/shared/map-presentation');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/target-presentation-cases.json'), 'utf8'));

const unknownItem = Map.createMapDetailModel({
  selectedCell: { x: 3, y: 4 },
  origin: { x: 1, y: 1 },
  cell: { ch: '/', semanticKind: 'object', semanticName: 'wand of death', semanticKnown: false },
});
assert.equal(unknownItem.publicLabel, 'Unknown');
assert.doesNotMatch(JSON.stringify(unknownItem), /death/i, 'missing public appearance cannot reveal identity');
assert.equal(unknownItem.distance, 3);
assert.equal(Map.version, 'nethack-map-detail/v1');
assert.deepEqual(Map.publicStateCues({ semanticKind: 'trap', actionAffordances: [] }), [], 'trap kind alone does not create a known-trap cue');
assert.deepEqual(Map.publicStateCues({ semanticKind: 'trap', actionAffordances: ['trap.known'] }), ['known-trap']);

const hostileGoblin = Map.createMapDetailModel({
  selectedCell: { x: 10, y: 8 },
  origin: { x: 9, y: 8 },
  cell: {
    ch: 'o',
    semanticKind: 'monster',
    semanticName: 'goblin',
    semanticKnown: true,
    actionAffordances: ['monster.attitude.hostile'],
    creaturePublic: { attitude: 'hostile', size: 'small', status: ['asleep'] },
  },
});
assert.equal(hostileGoblin.publicAttitude, 'hostile');
assert.equal(hostileGoblin.creatureFacts.size, 'small');
assert.deepEqual(hostileGoblin.creatureFactRows.map((row) => `${row.label}:${row.value}`), [
  'Attitude:Hostile',
  'Size:Small',
  'Status:Asleep',
]);
assert.doesNotMatch(JSON.stringify(hostileGoblin), /\b(?:hp|ac|mhp|armor class|hit points)\b/i);

const hallucinated = Map.createMapDetailModel({
  selectedCell: { x: 11, y: 8 },
  cell: {
    ch: 'o',
    semanticKind: 'monster',
    semanticName: 'jabberwock',
    semanticKnown: true,
    actionAffordances: ['monster.hostile-unknown'],
    creaturePublic: { status: [] },
  },
});
assert.equal(hallucinated.creatureFacts, null, 'no creature facts without public attitude/size/status');
assert.deepEqual(hallucinated.creatureFactRows, []);

const appearance = Map.createMapDetailModel({
  selectedCell: { x: 2, y: 2 },
  cell: { ch: '/', semanticKind: 'object', semanticName: 'wand of death', semanticAppearance: 'long wand', semanticKnown: false },
});
assert.equal(appearance.publicLabel, 'Long wand');
assert.equal(appearance.publicLayers[0].label, 'Long wand');
assert.equal(appearance.publicLayers[0].role, 'visible', 'unknown semantics use a generic visible layer role');
assert.equal(Map.publicFallbackLabel({ semanticKind: 'floor', semanticName: 'floor of a room' }), 'Floor of a room');
assert.equal(Map.publicFallbackLabel({ semanticKind: 'door', semanticName: 'vertical closed door' }), 'Vertical closed door');
assert.equal(Map.publicFallbackLabel({ semanticKind: 'monster', semanticName: 'Medusa' }), 'Medusa', 'authoritative proper-name casing is preserved');
assert.doesNotMatch(JSON.stringify(appearance), /death/i);

const hiddenObjectLayer = Map.createMapDetailModel({
  selectedCell: { x: 2, y: 2 },
  cell: { ch: '@', semanticKind: 'hero', semanticName: 'hero', objectLayerSemanticKind: 'object', objectLayerSemanticName: 'wand of death', objectLayerSemanticKnown: false },
});
assert.equal(hiddenObjectLayer.publicLayers.some((layer) => /death/i.test(layer.label)), false);

const playerTooltip = MapPresentation.tooltipInfoForCell({ ch: ')', glyph: 3484, semanticKind: 'object', semanticName: 'orcish dagger', semanticKnown: false, semanticAppearance: 'crude dagger' }, 23, 13, {});
assert.equal(playerTooltip.title, 'Crude Dagger');
assert.doesNotMatch(playerTooltip.description, /glyph|map 23,13|asset|category|orcish/i);
assert.equal(Object.hasOwn(playerTooltip, 'coordinates'), false);
const diagnosticTooltip = MapPresentation.diagnosticTooltipInfoForCell({ ch: ')', glyph: 3484, semanticKind: 'object', semanticName: 'orcish dagger', semanticKnown: false, semanticAppearance: 'crude dagger' }, 23, 13, {});
assert.match(diagnosticTooltip.diagnosticDescription, /glyph 3484.*map 23,13/);
assert.deepEqual(diagnosticTooltip.coordinates, { x: 23, y: 13 });
const exactFigurineTooltip = MapPresentation.tooltipInfoForCell({ ch: '(', glyph: 1, objectId: 73, displayName: 'a figurine of a horse', semanticKind: 'object', semanticName: 'figurine', semanticKnown: true }, 24, 13, {});
assert.equal(exactFigurineTooltip.title, 'Figurine of a horse', 'tooltip uses the authoritative object-instance name rather than the glyph type');
const layeredFigurineTooltip = MapPresentation.tooltipInfoForCell({ ch: '@', semanticKind: 'hero', semanticName: 'hero', objectLayerGlyph: 1, objectLayerObjectId: 73, objectLayerDisplayName: 'a figurine of a horse', objectLayerSemanticKind: 'object', objectLayerSemanticName: 'figurine', objectLayerSemanticKnown: true }, 24, 13, {});
assert.equal(layeredFigurineTooltip.contents.some((entry) => entry.label === 'Figurine of a horse'), true, 'object beneath an actor keeps its authoritative object-instance name');
// Objects covering stairs must list the staircase in ALSO ON THIS SQUARE, not only generic floor.
const objectOnStairsTooltip = MapPresentation.tooltipInfoForCell({
  ch: ')',
  glyph: 1,
  objectId: 88,
  displayName: '2 darts',
  semanticKind: 'object',
  semanticName: 'dart',
  semanticKnown: true,
  backgroundGlyph: 100,
  backgroundSemanticKind: 'floor',
  backgroundSemanticName: 'floor of a room',
  backgroundSemanticKnown: true,
  featureDescription: 'staircase down',
}, 11, 8, {});
assert.equal(objectOnStairsTooltip.title, '2 darts');
assert.equal(objectOnStairsTooltip.contents.some((entry) => /staircase down/i.test(entry.label) && /stairs/i.test(entry.kind)), true, 'stairs under an object appear in tooltip contents');
assert.equal(objectOnStairsTooltip.contents.some((entry) => /floor of a room/i.test(entry.label)), false, 'generic floor does not replace stairs feature');
const objectOnStairsDetail = Map.createMapDetailModel({
  selectedCell: { x: 11, y: 8 },
  cell: {
    ch: ')',
    semanticKind: 'object',
    semanticName: 'dart',
    semanticKnown: true,
    displayName: '2 darts',
    backgroundSemanticKind: 'floor',
    backgroundSemanticName: 'floor of a room',
    featureDescription: 'staircase down',
  },
});
assert.equal(objectOnStairsDetail.publicLayers.some((layer) => layer.role === 'stairs' && /staircase down/i.test(layer.label)), true, 'map detail lists stairs under covered object');
// Discovered traps under objects must appear in ALSO ON THIS SQUARE.
const objectOnTrapTooltip = MapPresentation.tooltipInfoForCell({
  ch: ')',
  glyph: 1,
  objectId: 89,
  displayName: '2 darts',
  semanticKind: 'object',
  semanticName: 'dart',
  semanticKnown: true,
  backgroundGlyph: 100,
  backgroundSemanticKind: 'floor',
  backgroundSemanticName: 'floor of a room',
  backgroundSemanticKnown: true,
  featureDescription: 'arrow trap',
}, 12, 8, {});
assert.equal(objectOnTrapTooltip.contents.some((entry) => /arrow trap/i.test(entry.label) && /trap/i.test(entry.kind)), true, 'discovered trap under an object appears in tooltip contents');
assert.equal(objectOnTrapTooltip.contents.some((entry) => /floor of a room/i.test(entry.label)), false, 'generic floor does not replace discovered trap');
const bareTrapTooltip = MapPresentation.tooltipInfoForCell({
  ch: '^',
  semanticKind: 'trap',
  semanticName: 'arrow trap',
  semanticKnown: true,
  actionAffordances: ['trap.known'],
}, 12, 9, {});
assert.equal(bareTrapTooltip.contents.some((entry) => /floor of a room/i.test(entry.label)), false, 'bare trap tooltip does not pad with generic floor');
const objectOnTrapDetail = Map.createMapDetailModel({
  selectedCell: { x: 12, y: 8 },
  cell: {
    ch: ')',
    semanticKind: 'object',
    semanticName: 'dart',
    semanticKnown: true,
    displayName: '2 darts',
    backgroundSemanticKind: 'floor',
    backgroundSemanticName: 'floor of a room',
    featureDescription: 'arrow trap',
  },
});
assert.equal(objectOnTrapDetail.publicLayers.some((layer) => layer.role === 'trap' && /arrow trap/i.test(layer.label)), true, 'map detail lists discovered trap under covered object');





const browserContext = {
  console,
  document: { getElementById: () => null },
  setTimeout(callback) { callback(); return 1; },
};
browserContext.window = browserContext;
browserContext.self = browserContext;
vm.createContext(browserContext);
for (const source of ['runtime.js', 'map-detail.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/ux', source), 'utf8'), browserContext, { filename: source });
}
const mapDomain = browserContext.NetHackUxRuntime.runtime.domain('map');
assert.equal(typeof mapDomain.select, 'function', 'browser module registers the map controller as the domain interface');
mapDomain.setActionProvider({
  actionsForCell({ coord }) {
    return [{ id: 'map.look', label: `Look at ${coord.x},${coord.y}` }];
  },
});
const domainModel = mapDomain.select({ x: 7, y: 4 });
assert.equal(domainModel.publicActions[0].id, 'map.look');
assert.equal(domainModel.publicActions[0].label, 'Look at 7,4');

for (const testCase of fixture.valid) {
  const metadata = Target.normalizeTargetMetadata(testCase.metadata);
  assert.equal(metadata.promptId, testCase.metadata.promptId, testCase.name);
}
for (const testCase of fixture.invalid) {
  assert.throws(() => Target.normalizeTargetMetadata(testCase.metadata), undefined, testCase.name);
}

const unknownMetadata = fixture.valid[0].metadata;
const unknownTarget = Target.createTargetPresentation({ selectedCell: { x: 12, y: 8 }, publicLabel: 'dark corridor', distance: 2, metadata: unknownMetadata });
assert.equal(unknownTarget.validation, 'core-will-validate');
assert.equal(unknownTarget.statusText, 'NetHack will validate this target.');
assert.equal(Object.hasOwn(unknownTarget, 'authoritativeLos'), false);
assert.equal(Object.hasOwn(unknownTarget, 'authoritativeRange'), false);
assert.doesNotMatch(Target.targetSummary(unknownTarget), /path|route|line of effect|validity/i);

const legalMetadata = fixture.valid[1].metadata;
const legalTarget = Target.createTargetPresentation({ selectedCell: { x: 13, y: 8 }, publicLabel: 'jackal', distance: 3, metadata: legalMetadata });
assert.equal(legalTarget.validation, 'confirmed-legal');
assert.equal(legalTarget.authoritativeLos, true);
assert.equal(legalTarget.authoritativeRange, 6);
assert.equal(legalTarget.acknowledgement.state, 'accepted');
assert.throws(() => Target.normalizeTargetMetadata({ promptId: 'untrusted-legality', revision: 1, candidates: [{ targetId: 'x', coord: { x: 1, y: 1 }, state: 'legal' }] }), /core authority/);
assert.throws(() => Target.acceptMetadata(Target.normalizeTargetMetadata(legalMetadata), legalMetadata), /stale or duplicate/);
assert.throws(() => Target.acceptMetadata(null, legalMetadata, { activePromptId: 'another-prompt' }), /does not own/);
const unrelatedTarget = Target.createTargetPresentation({ selectedCell: { x: 0, y: 0 }, publicLabel: 'Unknown', metadata: legalMetadata });
assert.equal(unrelatedTarget.acknowledgement, undefined, 'acknowledgement never attaches to an unrelated noncandidate cell');

const illegalTarget = Target.createTargetPresentation({ selectedCell: { x: 14, y: 8 }, publicLabel: 'wall', metadata: fixture.valid[2].metadata });
assert.equal(illegalTarget.validation, 'confirmed-illegal');
assert.equal(illegalTarget.statusText, 'That target is blocked.');
assert.equal(Target.acceptanceFor(fixture.valid[2].metadata, 'stale-prompt', 'target-wall'), null, 'stale prompt cannot consume acknowledgement');

assert.equal(Context.attitudeFromPublicCell({ semanticName: 'peaceful kitten', semanticKind: 'monster', actionAffordances: ['monster.hostile-unknown'] }), undefined, 'name text and hostile-unknown never infer attitude');
assert.equal(Context.attitudeFromPublicCell({ actionAffordances: ['monster.pet'] }), 'tame');
assert.equal(Context.attitudeFromPublicCell({ actionAffordances: ['monster.attitude.peaceful'] }), 'peaceful');
assert.equal(Context.attitudeFromPublicCell({ actionAffordances: ['monster.attitude.hostile'] }), 'hostile');

const peaceful = Context.groupCreatureActions([{
  targetId: 'monster-7', publicLabel: 'watchman', direction: 'east', publicAttitude: 'peaceful',
  publicActions: [
    { id: 'chat-7', label: 'Chat', kind: 'chat' },
    { id: 'attack-7', label: 'Attack', kind: 'attack' },
  ],
}]);
assert.equal(peaceful.primary.label, 'Chat');
assert.equal(peaceful.dangerous[0].label, 'Attack');
assert.equal(peaceful.dangerous[0].confirmationRequired, true);

const hostile = Context.groupCreatureActions([{
  targetId: 'monster-8', publicLabel: 'jackal', direction: 'west', publicAttitude: 'hostile',
  publicActions: [{ id: 'attack-8', label: 'Attack', kind: 'attack' }, { id: 'chat-8', label: 'Chat', kind: 'chat' }],
}]);
assert.equal(hostile.primary.label, 'Attack');
assert.equal(hostile.secondary[0].label, 'Chat');

const unknownAttitude = Context.groupCreatureActions([{
  targetId: 'monster-9', publicLabel: 'creature', direction: 'north',
  publicActions: [{ id: 'attack-9', label: 'Attack', kind: 'attack' }],
}]);
assert.equal(unknownAttitude.primary, undefined, 'unknown attitude never promotes attack');
assert.equal(unknownAttitude.secondary[0].label, 'Attack');

const many = Context.groupCreatureActions([
  { targetId: 'monster-a', publicLabel: 'kitten', direction: 'west', publicAttitude: 'tame', publicActions: [{ id: 'chat-a', label: 'Chat', kind: 'chat' }] },
  { targetId: 'monster-b', publicLabel: 'jackal', direction: 'east', publicAttitude: 'hostile', publicActions: [{ id: 'attack-b', label: 'Attack', kind: 'attack' }] },
]);
assert.equal(many.chooserRequired, true);
assert.equal(many.primary.label, 'Choose creature');
assert.equal(many.targets.length, 2);
assert.equal(Context.selectCreatureTarget(many, 'monster-a').primary.label, 'Chat');
assert.throws(() => Context.selectCreatureTarget(many, 'missing-monster'), /unknown creature target/);

const cells = Array.from({ length: 21 }, (_, y) => Array.from({ length: 80 }, (_, x) => ({ ch: '.', semanticKind: 'terrain', semanticName: 'floor of a room', actionAffordances: [], x, y })));
const started = process.hrtime.bigint();
let models = 0;
for (let y = 0; y < 21; y += 1) {
  for (let x = 0; x < 80; x += 1) {
    Map.createMapDetailModel({ selectedCell: { x, y }, origin: { x: 40, y: 10 }, cell: cells[y][x] }, { contextActions: Context });
    models += 1;
  }
}
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
assert.equal(models, 1680);
assert(elapsedMs < 150, `1,680 public presentation models should stay below 150ms, got ${elapsedMs.toFixed(2)}ms`);

console.log(JSON.stringify({ pass: true, models, elapsedMs: Number(elapsedMs.toFixed(3)) }, null, 2));
