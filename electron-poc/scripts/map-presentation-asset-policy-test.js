#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const TileAssets = require('../src/shared/tile-assets');
const MapPresentation = require('../src/shared/map-presentation');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/tiles/manifest.json'), 'utf8'));
const tileMap = JSON.parse(fs.readFileSync(path.join(root, 'assets/tiles/tile-map.json'), 'utf8'));
const tileAssetsById = TileAssets.assetsById(manifest);

function model(cell, cells = [[cell]]) {
  return MapPresentation.cellViewModel(cell, 0, 0, { tileMapConfig: tileMap, tileAssetsById, cells });
}
function assert(name, condition, detail) {
  if (!condition) throw new Error(`${name}: ${detail || 'assertion failed'}`);
}

const floor = model({ ch: '.', glyph: 3992, semanticKind: 'terrain', semanticName: 'room floor' });
assert('room floor keeps legacy CSS rendering', floor.assetId === 'room-floor' && floor.useCssTerrain && floor.classes.includes('terrain-floor') && !floor.backgroundImage, JSON.stringify(floor));

const corridor = model({ ch: '#', semanticKind: 'terrain', semanticName: 'corridor' });
assert('corridor keeps legacy CSS rendering', ['lit-corridor', 'dark-corridor'].includes(corridor.assetId) && corridor.useCssTerrain && corridor.classes.includes('terrain-corridor') && !corridor.backgroundImage, JSON.stringify(corridor));

const sink = model({ ch: '{', glyph: 4013, semanticKind: 'fixture', semanticName: 'sink' });
const sinkTooltip = MapPresentation.tooltipInfoForCell({ ch: '{', glyph: 4013, semanticKind: 'fixture', semanticName: 'sink' }, 36, 9, { tileMapConfig: tileMap, tileAssetsById, cells: [[{ ch: '{', glyph: 4013, semanticKind: 'fixture', semanticName: 'sink' }]] });
assert('sink glyph 4013 uses transparent overlay art over floor rather than an opaque terrain card', sink.assetId === 'sink' && sink.classes.includes('terrain-floor') && sink.classes.includes('tile-overlay') && sink.baseTileId === 'css-terrain-floor' && !sink.backgroundImage && /sink\.png/.test(sink.tileImage || '') && sinkTooltip.title === 'Sink' && sinkTooltip.assetId === 'sink', JSON.stringify({ sink, sinkTooltip }));

const scroll = model({ ch: '?', semanticKind: 'object', semanticName: 'scroll labeled ELBIB YLOH', semanticKnown: false });
assert('unidentified mapped scroll label uses generic scroll art rather than hidden identity art while forcing CSS floor class behind it', scroll.assetId === 'scroll-class-icon' && scroll.classes.includes('terrain-floor') && /scroll-class-icon\.png/.test(scroll.backgroundImage || scroll.tileImage || '') && !/genocide\.png/.test(scroll.backgroundImage || scroll.tileImage || ''), JSON.stringify(scroll));

const wall = model({ ch: '|', glyph: 3930, semanticKind: 'terrain', semanticName: 'vertical wall' });
assert('walls keep legacy CSS rendering despite generated wall assets', wall.assetId === 'vertical-wall' && wall.useCssTerrain && wall.classes.includes('terrain-wall-v') && !wall.backgroundImage, JSON.stringify(wall));
const blankVerticalWall = model({ ch: ' ', glyph: 3930, semanticKind: 'wall', semanticName: 'vertical wall' });
const blankHorizontalWall = model({ ch: ' ', glyph: 3931, semanticKind: 'wall', semanticName: 'horizontal wall' });
const blankWallCorner = model({ ch: ' ', glyph: 3932, semanticKind: 'wall', semanticName: 'top left corner wall' });
assert('native blank wall characters still render as CSS walls from their mapped asset orientation', blankVerticalWall.classes.includes('terrain-wall-v') && !blankVerticalWall.classes.includes('terrain-rock') && blankHorizontalWall.classes.includes('terrain-wall-h') && !blankHorizontalWall.classes.includes('terrain-rock') && blankWallCorner.classes.includes('terrain-wall') && !blankWallCorner.classes.includes('terrain-rock'), JSON.stringify({ blankVerticalWall, blankHorizontalWall, blankWallCorner }));
const blankRoomFloor = model({ ch: ' ', glyph: 3992, semanticKind: 'terrain', semanticName: 'floor of a room' });
const blankCorridor = model({ ch: ' ', glyph: 3991, semanticKind: 'corridor', semanticName: 'corridor' });
const rememberedDarkCorridor = model({ ch: ' ', glyph: 3991, cmapIndex: 22, semanticKind: 'corridor', semanticName: 'dark corridor' });
assert('remembered dark corridor remains a rendered passable corridor after leaving sight', rememberedDarkCorridor.assetId === 'dark-corridor' && rememberedDarkCorridor.classes.includes('terrain-corridor') && !rememberedDarkCorridor.classes.includes('terrain-rock'), JSON.stringify(rememberedDarkCorridor));
const nonblankRock = model({ ch: '.', semanticKind: 'terrain', semanticName: 'unexplored stone' });
assert('mapped semantic terrain wins over inconsistent native display characters', blankRoomFloor.classes.includes('terrain-floor') && !blankRoomFloor.classes.includes('terrain-rock') && blankCorridor.classes.includes('terrain-corridor') && !blankCorridor.classes.includes('terrain-rock') && nonblankRock.classes.includes('terrain-rock') && !nonblankRock.classes.includes('terrain-floor'), JSON.stringify({ blankRoomFloor, blankCorridor, nonblankRock }));

const verticalDoor = model({ ch: '-', glyph: 3986, semanticKind: 'door', semanticName: 'vertical open door' });
assert('glyph 3986 maps to vertical open door id but renders with legacy CSS, not generated door art', verticalDoor.assetId === 'open-vertical-door' && verticalDoor.useCssTerrain && verticalDoor.classes.includes('terrain-door-open-vertical') && !verticalDoor.backgroundImage, JSON.stringify(verticalDoor));

const horizontalDoor = model({ ch: '|', glyph: 3987, semanticKind: 'door', semanticName: 'horizontal open door' });
assert('glyph 3987 maps to horizontal open door id, not engraving, but renders with legacy CSS', horizontalDoor.assetId === 'open-horizontal-door' && horizontalDoor.useCssTerrain && horizontalDoor.classes.includes('terrain-door-open-horizontal') && !horizontalDoor.backgroundImage, JSON.stringify(horizontalDoor));

const doorway = model({ ch: '.', glyph: 3985, semanticKind: 'terrain', semanticName: 'no door' });
assert('doorway glyph keeps legacy CSS doorway rendering without open-door class', doorway.assetId === 'no-door-doorway' && doorway.useCssTerrain && doorway.classes.includes('terrain-doorway') && !doorway.classes.includes('terrain-door-open') && !doorway.backgroundImage && /empty doorway/i.test(doorway.ariaLabel), JSON.stringify(doorway));

const horizontalClosedDoorTooltip = MapPresentation.tooltipInfoForCell({ ch: '+', glyph: 3989, semanticKind: 'door', semanticName: 'horizontal closed door' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById, cells: [[{ ch: ' ' }, { ch: '-' }, { ch: ' ' }], [{ ch: '-' }, { ch: '+', glyph: 3989, semanticKind: 'door', semanticName: 'horizontal closed door' }, { ch: '-' }], [{ ch: ' ' }, { ch: '.' }, { ch: ' ' }]] });
assert('door tooltip exposes CSS terrain classes so thumbnail matches map rendering', horizontalClosedDoorTooltip.assetId === 'closed-door' && horizontalClosedDoorTooltip.useCssTerrain && horizontalClosedDoorTooltip.terrainClasses.includes('terrain-door-closed') && horizontalClosedDoorTooltip.terrainClasses.includes('door-in-horizontal-wall'), JSON.stringify(horizontalClosedDoorTooltip));

const emptyDoorwayTooltip = MapPresentation.tooltipInfoForCell({ ch: '.', glyph: 3985, semanticKind: 'terrain', semanticName: 'no door' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById, cells: [[{ ch: ' ' }, { ch: '|' }, { ch: ' ' }], [{ ch: '.' }, { ch: '.', glyph: 3985, semanticKind: 'terrain', semanticName: 'no door' }, { ch: '.' }], [{ ch: ' ' }, { ch: '|' }, { ch: ' ' }]] });
assert('empty doorway tooltip uses no-door-doorway CSS terrain rather than open-door rendering', emptyDoorwayTooltip.title === 'Empty Doorway' && emptyDoorwayTooltip.assetId === 'no-door-doorway' && emptyDoorwayTooltip.useCssTerrain && emptyDoorwayTooltip.terrainClasses.includes('terrain-doorway') && emptyDoorwayTooltip.terrainClasses.includes('door-in-vertical-wall') && !emptyDoorwayTooltip.terrainClasses.includes('terrain-door-open'), JSON.stringify(emptyDoorwayTooltip));

const ironSkullCap = model({ ch: '[', glyph: 3579, semanticKind: 'object', semanticName: 'orcish helm', semanticKnown: false, semanticAppearance: 'iron skull cap' });
const ironSkullCapTooltip = MapPresentation.tooltipInfoForCell({ ch: '[', glyph: 3579, semanticKind: 'object', semanticName: 'orcish helm', semanticKnown: false, semanticAppearance: 'iron skull cap' }, 30, 16, { tileMapConfig: tileMap, tileAssetsById, cells: [[{ ch: '[' }]] });
assert('unidentified iron skull cap uses helmet public-appearance art, not broad armor/shield fallback or hidden orcish identity', ironSkullCap.assetId === 'helmet' && ironSkullCap.classes.includes('terrain-floor') && /helmet\.png/.test(ironSkullCap.backgroundImage || ironSkullCap.tileImage || '') && /Iron Skull Cap/i.test(ironSkullCap.ariaLabel || '') && ironSkullCapTooltip.title === 'Iron Skull Cap' && ironSkullCapTooltip.assetId === 'helmet' && !/armor-class-icon|shield|orcish-helm/i.test(`${ironSkullCap.assetId} ${ironSkullCap.backgroundImage || ''} ${ironSkullCap.tileImage || ''} ${ironSkullCap.ariaLabel || ''} ${ironSkullCapTooltip.description}`), JSON.stringify({ ironSkullCap, ironSkullCapTooltip }));

const crudeDagger = model({ ch: ')', glyph: 3484, semanticKind: 'object', semanticName: 'orcish dagger', semanticKnown: false, semanticAppearance: 'crude dagger' });
const crudeDaggerTooltip = MapPresentation.tooltipInfoForCell({ ch: ')', glyph: 3484, semanticKind: 'object', semanticName: 'orcish dagger', semanticKnown: false, semanticAppearance: 'crude dagger' }, 23, 13, { tileMapConfig: tileMap, tileAssetsById, cells: [[{ ch: ')' }]] });
assert('unidentified crude dagger uses crude/orcish-dagger public-appearance art without diagnostic or hidden identity copy', crudeDagger.assetId === 'orcish-dagger' && crudeDagger.classes.includes('terrain-floor') && /orcish-dagger\.png/.test(crudeDagger.backgroundImage || crudeDagger.tileImage || '') && /Crude Dagger/i.test(crudeDagger.ariaLabel || '') && crudeDaggerTooltip.title === 'Crude Dagger' && crudeDaggerTooltip.assetId === 'orcish-dagger' && !/glyph|map 23,13|Objects and inventory|weapon-class-icon|Full source objects|orcish dagger/i.test(`${crudeDagger.ariaLabel || ''} ${crudeDaggerTooltip.title || ''} ${crudeDaggerTooltip.description || ''}`), JSON.stringify({ crudeDagger, crudeDaggerTooltip }));

const publicArmorAppearances = [
  ['leather hat', 'helmet'], ['hard hat', 'helmet'], ['conical hat', 'helmet'], ['crystal helmet', 'helmet'], ['plumed helmet', 'helmet'], ['etched helmet', 'helmet'], ['crested helmet', 'helmet'], ['visored helmet', 'helmet'],
  ['wooden shield', 'shield'], ['large round shield', 'shield'], ['tattered cape', 'cloak'], ['old gloves', 'gloves'], ['combat boots', 'boots'], ['crude ring mail', 'orcish-ring-mail'], ['crude chain mail', 'chain-mail'],
].map(([appearance, expected]) => [appearance, expected, model({ ch: '[', semanticKind: 'object', semanticName: appearance, semanticKnown: false, semanticAppearance: appearance })]);
assert('representative unidentified armor appearances resolve to subclass/appearance art instead of one broad armor icon', publicArmorAppearances.every(([appearance, expected, view]) => view.assetId === expected), JSON.stringify(publicArmorAppearances));

const thinSpellbook = model({ ch: '+', glyph: 3854, semanticKind: 'object', semanticName: 'jumping', semanticKnown: false, semanticAppearance: 'thin' });
assert('unidentified thin spellbook uses public spellbook appearance art instead of closed-door char fallback or hidden jumping art', thinSpellbook.assetId === 'spellbook-class-icon' && thinSpellbook.classes.includes('terrain-floor') && /spellbook-class-icon\.png/.test(thinSpellbook.backgroundImage || thinSpellbook.tileImage || '') && /thin spellbook/i.test(thinSpellbook.ariaLabel || '') && !/closed-door|jumping/i.test(`${thinSpellbook.assetId} ${thinSpellbook.backgroundImage || ''} ${thinSpellbook.tileImage || ''} ${thinSpellbook.ariaLabel || ''}`), JSON.stringify(thinSpellbook));

const thinSpellbookTooltip = MapPresentation.tooltipInfoForCell({ ch: '+', glyph: 3854, semanticKind: 'object', semanticName: 'jumping', semanticKnown: false, semanticAppearance: 'thin' }, 30, 16, { tileMapConfig: tileMap, tileAssetsById, cells: [[{ ch: '+' }]] });
assert('thin spellbook tooltip uses public appearance title and spellbook art without asset taxonomy', thinSpellbookTooltip.title === 'Thin Spellbook' && thinSpellbookTooltip.assetId === 'spellbook-class-icon' && !/Objects and inventory|jumping|closed door|glyph|map \d/i.test(`${thinSpellbookTooltip.title} ${thinSpellbookTooltip.description}`), JSON.stringify(thinSpellbookTooltip));

const unknownWand = model({ ch: '/', glyph: 3860, semanticKind: 'object', semanticName: 'death', semanticKnown: false, semanticAppearance: 'long' });
assert('unidentified wand uses public wand class art instead of open-door char fallback or hidden identity art', unknownWand.assetId === 'wand-class-icon' && unknownWand.classes.includes('terrain-floor') && /wand-class-icon\.png/.test(unknownWand.backgroundImage || unknownWand.tileImage || '') && /long wand/i.test(unknownWand.ariaLabel || '') && !unknownWand.useCssTerrain && !/open-vertical-door|death/i.test(`${unknownWand.assetId} ${unknownWand.backgroundImage || ''} ${unknownWand.tileImage || ''} ${unknownWand.ariaLabel || ''}`), JSON.stringify(unknownWand));
const unknownWandTooltip = MapPresentation.tooltipInfoForCell({ ch: '/', glyph: 3860, semanticKind: 'object', semanticName: 'death', semanticKnown: false, semanticAppearance: 'long' }, 30, 16, { tileMapConfig: tileMap, tileAssetsById, cells: [[{ ch: '/' }]] });
assert('unknown wand tooltip uses public appearance title and wand art without asset taxonomy', unknownWandTooltip.title === 'Long Wand' && unknownWandTooltip.assetId === 'wand-class-icon' && !/Objects and inventory|death|open door|glyph|map \d/i.test(`${unknownWandTooltip.title} ${unknownWandTooltip.description}`), JSON.stringify(unknownWandTooltip));

const unknownRing = model({ ch: '=', glyph: 3610, semanticKind: 'object', semanticName: 'teleportation', semanticKnown: false, semanticAppearance: 'gold' });
assert('unidentified ring keeps class icon and appends ring noun to public appearance', unknownRing.assetId === 'ring-class-icon' && /gold ring/i.test(unknownRing.ariaLabel || '') && !/teleportation/i.test(unknownRing.ariaLabel || ''), JSON.stringify(unknownRing));

const missingAppearanceWand = model({ ch: '/', glyph: 3860, semanticKind: 'object', semanticName: 'death', semanticKnown: false });
const missingAppearanceWandTooltip = MapPresentation.tooltipInfoForCell({ ch: '/', glyph: 3860, semanticKind: 'object', semanticName: 'death', semanticKnown: false }, 30, 16, { tileMapConfig: tileMap, tileAssetsById, cells: [[{ ch: '/' }]] });
assert('unidentified wand with missing appearance fails closed to class art and does not leak hidden identity', missingAppearanceWand.assetId === 'wand-class-icon' && missingAppearanceWandTooltip.title === 'Wand' && !/death|open door/i.test(`${missingAppearanceWand.ariaLabel} ${missingAppearanceWandTooltip.title} ${missingAppearanceWandTooltip.description}`), JSON.stringify({ missingAppearanceWand, missingAppearanceWandTooltip }));

const missingAppearanceScroll = model({ ch: '?', glyph: 3772, semanticKind: 'object', semanticName: 'destroy armor', semanticKnown: false });
const missingAppearanceScrollTooltip = MapPresentation.tooltipInfoForCell({ ch: '?', glyph: 3772, semanticKind: 'object', semanticName: 'destroy armor', semanticKnown: false }, 30, 16, { tileMapConfig: tileMap, tileAssetsById, cells: [[{ ch: '?' }]] });
assert('unidentified scroll with missing appearance fails closed to scroll class art and does not leak hidden identity', missingAppearanceScroll.assetId === 'scroll-class-icon' && missingAppearanceScrollTooltip.title === 'Scroll' && !/destroy armor/i.test(`${missingAppearanceScroll.ariaLabel} ${missingAppearanceScrollTooltip.title} ${missingAppearanceScrollTooltip.description}`), JSON.stringify({ missingAppearanceScroll, missingAppearanceScrollTooltip }));

const trapCollisions = [
  ['fire', 'fire-trap'], ['polymorph', 'polymorph-trap'], ['dart', 'dart-trap'], ['arrow', 'arrow-trap'], ['statue', 'statue-trap'],
].map(([name, expected]) => [name, expected, model({ ch: '^', glyph: 4000, semanticKind: 'trap', semanticName: name })]);
assert('trap semantic names that collide with object ids prefer trap assets', trapCollisions.every(([name, expected, view]) => view.assetId === expected && !/full-source-objects|objects-inventory/.test(tileAssetsById.get(view.assetId)?.categorySlug || '')), JSON.stringify(trapCollisions));

const statueOfJackal = model({ ch: '`', glyph: 902, semanticKind: 'statue', semanticName: 'statue of a jackal' });
assert('statue semantic names with statue-of phrasing use recognizable monster statue overlay instead of boulder fallback', statueOfJackal.assetId === 'jackal' && statueOfJackal.classes.includes('statue-overlay') && statueOfJackal.classes.includes('tile-overlay') && /statue/i.test(statueOfJackal.ariaLabel || '') && !/boulder/i.test(`${statueOfJackal.assetId} ${statueOfJackal.backgroundImage || ''}`), JSON.stringify(statueOfJackal));

const crudeRingMail = model({ ch: '[', glyph: 3581, semanticKind: 'object', semanticName: 'crude ring mail' });
assert('crude ring mail selects generated orcish ring mail art instead of armor class fallback', crudeRingMail.assetId === 'orcish-ring-mail' && crudeRingMail.classes.includes('terrain-floor') && /orcish-ring-mail\.png/.test(crudeRingMail.backgroundImage || crudeRingMail.tileImage || ''), JSON.stringify(crudeRingMail));

const goldPiece = model({ ch: '$', glyph: 3886, semanticKind: 'object', semanticName: 'gold piece' });
const goldPieceTile = tileAssetsById.get('gold-piece');
const coinPileTile = tileAssetsById.get('coin-pile');
const foodRationTile = tileAssetsById.get('food-ration');
const fileSha = (tile) => require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root, tile.installedPath.replace(/^electron-poc\//, '')))).digest('hex');
assert('gold piece exact object mapping uses the fixed gold-piece coin art, not food/ration fallback', goldPiece.assetId === 'gold-piece' && goldPiece.classes.includes('terrain-floor') && /gold-piece\.png/.test(goldPiece.backgroundImage || goldPiece.tileImage || '') && fileSha(goldPieceTile) === fileSha(coinPileTile) && fileSha(goldPieceTile) !== fileSha(foodRationTile), JSON.stringify({ goldPiece, goldSha: fileSha(goldPieceTile), coinSha: fileSha(coinPileTile), foodSha: fileSha(foodRationTile) }));

const engraving = model({ ch: '`', glyph: 3994, cmapIndex: 21, semanticKind: 'engraving', semanticName: 'engraving in a room' });
assert('engraving glyph remains engraving overlay', engraving.assetId === 'engraving' && engraving.baseTileId === 'css-terrain-floor' && /engraving\.png/.test(engraving.tileImage || ''), JSON.stringify(engraving));

const ironBars = model({ ch: '#', glyph: 3990, cmapIndex: 17, semanticKind: 'terrain', semanticName: 'iron bars' });
assert('iron bars cmap glyph 3990 does not regress to engraving art', ironBars.assetId === 'iron-bars' && /iron-bars\.png/.test(ironBars.backgroundImage || ironBars.tileImage || '') && !/engraving/i.test(`${ironBars.assetId} ${ironBars.ariaLabel}`), JSON.stringify(ironBars));

const runtimeEngraving = model({ ch: '`', glyph: 3994, cmapIndex: 21, semanticKind: 'engraving', semanticName: 'engraving in a room' });
const runtimeEngravingTooltip = MapPresentation.tooltipInfoForCell({ ch: '`', glyph: 3994, cmapIndex: 21, semanticKind: 'engraving', semanticName: 'engraving in a room' }, 14, 16, { tileMapConfig: tileMap, tileAssetsById, cells: [[{ ch: '`', glyph: 3994, cmapIndex: 21, semanticKind: 'engraving', semanticName: 'engraving in a room' }]] });
assert('runtime engraving cmap glyph 3994 uses engraving art, tooltip, and aria rather than boulder art', runtimeEngraving.assetId === 'engraving' && /engraving\.png/.test(runtimeEngraving.tileImage || '') && /engraving/i.test(runtimeEngraving.ariaLabel || '') && !/boulder/i.test(`${runtimeEngraving.assetId} ${runtimeEngraving.ariaLabel} ${runtimeEngravingTooltip.title}`) && runtimeEngravingTooltip.title === 'Engraving In A Room', JSON.stringify({ runtimeEngraving, runtimeEngravingTooltip }));

const fallbackEngraving = model({ ch: '`', glyph: 3994, cmapIndex: 21 });
const fallbackEngravingTooltip = MapPresentation.tooltipInfoForCell({ ch: '`', glyph: 3994, cmapIndex: 21 }, 14, 16, { tileMapConfig: tileMap, tileAssetsById, cells: [[{ ch: '`', glyph: 3994, cmapIndex: 21 }]] });
assert('runtime engraving cmap glyph 3994 fails safe to public engraving when semantic metadata is absent', fallbackEngraving.assetId === 'engraving' && /engraving/i.test(fallbackEngraving.ariaLabel || '') && fallbackEngravingTooltip.title === 'Engraving' && !/boulder/i.test(`${fallbackEngraving.assetId} ${fallbackEngraving.ariaLabel} ${fallbackEngravingTooltip.title}`), JSON.stringify({ fallbackEngraving, fallbackEngravingTooltip }));

const fallbackCorridorEngraving = model({ ch: '#', glyph: 3997, cmapIndex: 24 });
const fallbackCorridorEngravingTooltip = MapPresentation.tooltipInfoForCell({ ch: '#', glyph: 3997, cmapIndex: 24 }, 14, 16, { tileMapConfig: tileMap, tileAssetsById, cells: [[{ ch: '#', glyph: 3997, cmapIndex: 24 }]] });
assert('runtime corridor engraving cmap glyph 3997 fails safe to public engraving when semantic metadata is absent', fallbackCorridorEngraving.assetId === 'engraving' && /engraving/i.test(fallbackCorridorEngraving.ariaLabel || '') && fallbackCorridorEngravingTooltip.title === 'Engraving' && !/corridor|boulder/i.test(`${fallbackCorridorEngraving.assetId} ${fallbackCorridorEngraving.ariaLabel} ${fallbackCorridorEngravingTooltip.title}`), JSON.stringify({ fallbackCorridorEngraving, fallbackCorridorEngravingTooltip }));

const semanticBoulder = model({ ch: '`', semanticKind: 'object', semanticName: 'boulder' });
const semanticBoulderTooltip = MapPresentation.tooltipInfoForCell({ ch: '`', semanticKind: 'object', semanticName: 'boulder' }, 15, 16, { tileMapConfig: tileMap, tileAssetsById, cells: [[{ ch: '`', semanticKind: 'object', semanticName: 'boulder' }]] });
assert('object boulders still resolve from public object semantics instead of cmap engraving fallback', semanticBoulder.assetId === 'boulder' && /boulder\.png/.test(semanticBoulder.tileImage || '') && semanticBoulderTooltip.title === 'Boulder', JSON.stringify({ semanticBoulder, semanticBoulderTooltip }));

const werejackalAtSignCell = { ch: '@', glyph: 262, semanticKind: 'monster', semanticName: 'werejackal' };
const werejackalAtSign = MapPresentation.cellViewModel(werejackalAtSignCell, 53, 7, { tileMapConfig: tileMap, tileAssetsById, cells: [[werejackalAtSignCell]], playerCharacter: { role: 'Val', race: 'Hum', gender: 'Fem' } });
const werejackalAtSignTooltip = MapPresentation.tooltipInfoForCell(werejackalAtSignCell, 53, 7, { tileMapConfig: tileMap, tileAssetsById, cells: [[werejackalAtSignCell]], playerCharacter: { role: 'Val', race: 'Hum', gender: 'Fem' } });
assert('monster glyph rendered as @ keeps monster identity and art rather than player/hero combo avatar', werejackalAtSign.assetId === 'werejackal' && /werejackal\.png/.test(werejackalAtSign.tileImage || werejackalAtSign.backgroundImage || '') && /werejackal/i.test(werejackalAtSign.ariaLabel || '') && werejackalAtSignTooltip.title === 'Werejackal' && /Monster/.test(werejackalAtSignTooltip.description || '') && !/Hero|Player combo avatars|human-valkyrie/i.test(`${werejackalAtSign.assetId} ${werejackalAtSignTooltip.description} ${werejackalAtSign.tileImage || ''}`), JSON.stringify({ werejackalAtSign, werejackalAtSignTooltip }));
const dwarfMonsterCell = { ch: 'h', glyph: 44, semanticKind: 'monster', semanticName: 'dwarf' };
const dwarfMonster = MapPresentation.cellViewModel(dwarfMonsterCell, 60, 12, { tileMapConfig: tileMap, tileAssetsById, cells: [[dwarfMonsterCell]], playerCharacter: { role: 'Val', race: 'Hum', gender: 'Fem' } });
const dwarfMonsterTooltip = MapPresentation.tooltipInfoForCell(dwarfMonsterCell, 60, 12, { tileMapConfig: tileMap, tileAssetsById, cells: [[dwarfMonsterCell]], playerCharacter: { role: 'Val', race: 'Hum', gender: 'Fem' } });
const dwarfGlyphOnlyCell = { ch: 'h', glyph: 44 };
const dwarfGlyphOnly = MapPresentation.cellViewModel(dwarfGlyphOnlyCell, 60, 12, { tileMapConfig: tileMap, tileAssetsById, cells: [[dwarfGlyphOnlyCell]], playerCharacter: { role: 'Val', race: 'Hum', gender: 'Fem' } });
const dwarfRuntimeGlyphOnlyCell = { ch: 'h', glyph: 427 };
const dwarfRuntimeGlyphOnly = MapPresentation.cellViewModel(dwarfRuntimeGlyphOnlyCell, 60, 12, { tileMapConfig: tileMap, tileAssetsById, cells: [[dwarfRuntimeGlyphOnlyCell]], playerCharacter: { role: 'Val', race: 'Hum', gender: 'Fem' } });
assert('dwarf glyph 44/runtime 427 uses monster dwarf art and label, not h-char hobbit fallback or hero art', dwarfMonster.assetId === 'dwarf' && /dwarf\.png/.test(dwarfMonster.tileImage || dwarfMonster.backgroundImage || '') && /dwarf/i.test(dwarfMonster.ariaLabel || '') && dwarfMonsterTooltip.title === 'Dwarf' && /Monster/.test(dwarfMonsterTooltip.description || '') && dwarfGlyphOnly.assetId === 'dwarf' && dwarfRuntimeGlyphOnly.assetId === 'dwarf' && !/hobbit|hero|valkyrie/i.test(`${dwarfMonster.assetId} ${dwarfMonster.ariaLabel} ${dwarfMonsterTooltip.description} ${dwarfGlyphOnly.assetId} ${dwarfRuntimeGlyphOnly.assetId}`), JSON.stringify({ dwarfMonster, dwarfMonsterTooltip, dwarfGlyphOnly, dwarfRuntimeGlyphOnly }));
const unknownAtSignMonsterCell = { ch: '@', glyph: 9999, semanticKind: 'monster', semanticName: 'unmapped shapeshifter' };
const unknownAtSignMonster = MapPresentation.cellViewModel(unknownAtSignMonsterCell, 54, 7, { tileMapConfig: tileMap, tileAssetsById, cells: [[unknownAtSignMonsterCell]], playerCharacter: { role: 'Val', race: 'Hum', gender: 'Fem' } });
assert('unmapped @ monster falls back to a glyph, not hero/player art', !unknownAtSignMonster.assetId && unknownAtSignMonster.fallbackGlyph === '@' && unknownAtSignMonster.classes.includes('fallback-glyph') && !/hero|valkyrie/i.test(`${unknownAtSignMonster.ariaLabel} ${unknownAtSignMonster.tileImage || ''}`), JSON.stringify(unknownAtSignMonster));

const unknownNumericObjectLayerCell = { ch: '@', glyph: 725, semanticKind: 'hero', semanticName: 'hero', backgroundGlyph: 3992, backgroundSemanticKind: 'floor', backgroundSemanticName: 'floor of a room', objectLayerGlyph: 2222, objectLayerChar: 47, objectLayerSemanticKind: 'object', objectLayerSemanticName: 'wand of death', objectLayerSemanticKnown: false };
const unknownNumericObjectLayer = model(unknownNumericObjectLayerCell);
const unknownNumericObjectLayerTooltip = MapPresentation.tooltipInfoForCell(unknownNumericObjectLayerCell, 0, 0, { tileMapConfig: tileMap, tileAssetsById, cells: [[unknownNumericObjectLayerCell]] });
assert('unknown numeric object-layer char is public-rendered as glyph/class, not numeric code or hidden identity', unknownNumericObjectLayer.layers.some((layer) => layer.role === 'object' && /wand/i.test(layer.label || '') && (layer.fallbackGlyph === '/' || layer.assetId === 'wand-class-icon')) && unknownNumericObjectLayer.objectLayerAssetId === 'wand-class-icon' && !/47|wand of death/i.test(`${unknownNumericObjectLayer.ariaLabel} ${unknownNumericObjectLayerTooltip.description}`), JSON.stringify({ unknownNumericObjectLayer, unknownNumericObjectLayerTooltip }));

const heroOverBoxCell = { ch: '@', glyph: 725, semanticKind: 'hero', semanticName: 'hero', backgroundGlyph: 3992, backgroundSemanticKind: 'floor', backgroundSemanticName: 'floor of a room', objectLayerGlyph: 3672, objectLayerChar: '(', objectLayerSemanticKind: 'object', objectLayerSemanticName: 'large box', objectLayerActionAffordances: ['container', 'container.locked'] };
const heroOverBox = model(heroOverBoxCell);
assert('actor over object uses deterministic terrain<object<actor layer order', heroOverBox.classes.includes('tile-layered') && heroOverBox.layerOrder.join('<') === 'terrain<object<actor', JSON.stringify(heroOverBox));
assert('actor over object keeps the object layer below the hero layer', heroOverBox.assetId === 'hero-avatar' && heroOverBox.objectLayerAssetId === 'large-box' && /large-box\.png/.test(heroOverBox.objectTileImage || '') && /hero-avatar\.png/.test(heroOverBox.tileImage || ''), JSON.stringify(heroOverBox));
const heroOverBoxTooltip = MapPresentation.tooltipInfoForCell(heroOverBoxCell, 0, 0, { tileMapConfig: tileMap, tileAssetsById, cells: [[heroOverBoxCell]] });
assert('actor/object tooltip lists actor, object, and terrain in visible layer order', /Hero/i.test(heroOverBoxTooltip.title) && heroOverBoxTooltip.contents.map((entry) => `${entry.label}:${entry.kind}`).join('|') === 'Hero:Hero|Large Box:Object|Floor Of A Room:Floor', JSON.stringify(heroOverBoxTooltip));

const jackalOverChestCell = { ch: 'd', glyph: 395, semanticKind: 'monster', semanticName: 'jackal', backgroundGlyph: 3992, backgroundSemanticKind: 'floor', backgroundSemanticName: 'floor of a room', objectLayerGlyph: 3671, objectLayerChar: '(', objectLayerSemanticKind: 'object', objectLayerSemanticName: 'chest', objectLayerActionAffordances: ['container'] };
const jackalOverChest = model(jackalOverChestCell);
assert('monster over object uses the same terrain<object<actor layer order', jackalOverChest.classes.includes('tile-layered') && jackalOverChest.layerOrder.join('<') === 'terrain<object<actor' && jackalOverChest.objectLayerAssetId === 'chest' && jackalOverChest.assetId === 'jackal', JSON.stringify(jackalOverChest));
const jackalOverChestTooltip = MapPresentation.tooltipInfoForCell(jackalOverChestCell, 0, 0, { tileMapConfig: tileMap, tileAssetsById, cells: [[jackalOverChestCell]] });
assert('monster/object tooltip lists monster, object, and terrain instead of only the top layer', /Jackal/i.test(jackalOverChestTooltip.title) && jackalOverChestTooltip.contents.map((entry) => `${entry.label}:${entry.kind}`).join('|') === 'Jackal:Monster|Chest:Object|Floor Of A Room:Floor', JSON.stringify(jackalOverChestTooltip));

console.log(JSON.stringify({ pass: true, assertions: 41 }, null, 2));
