const fs = require('node:fs');
const path = require('node:path');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const outDir = process.env.NH_MAP_TOOLTIP_OUT_DIR || path.join(root, 'test', 'map-tooltip');
const port = Number(process.env.NH_MAP_TOOLTIP_CDP_PORT || 9455);
const width = Number(process.env.NH_MAP_TOOLTIP_WIDTH || 1200);
const height = Number(process.env.NH_MAP_TOOLTIP_HEIGHT || 760);

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  await Harness.withElectronPage({ root, port, width, height }, async (page) => {
    await page.waitForValue("document.readyState === 'complete' && !!window.__nethackTooltipTest", 10000);
    await page.run(`window.__nethackTooltipTest.setCells([
        { x: 2, y: 2, ch: '.', semanticKind: 'terrain', semanticName: 'room', semanticKnown: true },
        { x: 1, y: 2, ch: '|', semanticKind: 'terrain', semanticName: 'stone wall', semanticKnown: true },
        { x: 3, y: 2, ch: 'f', semanticKind: 'monster', semanticName: 'kitten', semanticKnown: true, glyph: 798 },
        { x: 4, y: 2, ch: '%', semanticKind: 'object', semanticName: 'food ration', semanticKnown: true },
        { x: 5, y: 2, ch: '%', semanticKind: 'corpse', semanticName: 'kitten', semanticKnown: true, glyph: 900 },
        { x: 6, y: 2, ch: '.', semanticKind: 'engraving', semanticName: 'engraving in a room', semanticKnown: true },
        { x: 7, y: 2, ch: '?', semanticKind: 'object', semanticName: 'scroll of food detection', semanticKnown: true },
        { x: 8, y: 2, ch: '?', semanticKind: 'object', semanticKnown: false, semanticAppearance: 'scroll labeled ZLORFIK' },
        { x: 10, y: 2, ch: '?', semanticKind: 'object', semanticName: 'destroy armor', semanticKnown: false, semanticAppearance: 'scroll labeled READ ME', glyph: 3772 },
        { x: 11, y: 2, ch: '\`', semanticKind: 'engraving', semanticName: 'engraving in a room', semanticKnown: true, glyph: 3994, cmapIndex: 21 },
        { x: 9, y: 2, ch: '\`', semanticKind: 'statue', semanticName: 'goblin', semanticKnown: true, glyph: 903 },
        { x: 12, y: 4, ch: '-', semanticKind: 'terrain', semanticName: 'horizontal wall' },
        { x: 13, y: 4, ch: '+', semanticKind: 'door', semanticName: 'horizontal closed door', featureDescription: 'closed door', glyph: 3989 },
        { x: 14, y: 4, ch: '-', semanticKind: 'terrain', semanticName: 'horizontal wall' },
        { x: 17, y: 3, ch: '|', semanticKind: 'terrain', semanticName: 'vertical wall' },
        { x: 17, y: 4, ch: '+', semanticKind: 'door', semanticName: 'vertical closed door', featureDescription: 'closed door', glyph: 3988 },
        { x: 17, y: 5, ch: '|', semanticKind: 'terrain', semanticName: 'vertical wall' },
        { x: 20, y: 4, ch: '-', semanticKind: 'terrain', semanticName: 'horizontal wall' },
        { x: 21, y: 4, ch: '|', semanticKind: 'door', semanticName: 'horizontal open door', featureDescription: 'open door', glyph: 3987 },
        { x: 22, y: 4, ch: '-', semanticKind: 'terrain', semanticName: 'horizontal wall' },
        { x: 25, y: 3, ch: '|', semanticKind: 'terrain', semanticName: 'vertical wall' },
        { x: 25, y: 4, ch: '-', semanticKind: 'door', semanticName: 'vertical open door', featureDescription: 'open door', glyph: 3986 },
        { x: 25, y: 5, ch: '|', semanticKind: 'terrain', semanticName: 'vertical wall' },
        { x: 28, y: 3, ch: '|', semanticKind: 'terrain', semanticName: 'vertical wall' },
        { x: 28, y: 4, ch: '.', semanticKind: 'terrain', semanticName: 'no door', featureDescription: 'doorway', glyph: 3985 },
        { x: 28, y: 5, ch: '|', semanticKind: 'terrain', semanticName: 'vertical wall' },
        { x: 34, y: 4, ch: '-', semanticKind: 'terrain', semanticName: 'horizontal wall' },
        { x: 35, y: 4, ch: '.', semanticKind: 'terrain', semanticName: 'no door', featureDescription: 'doorway', glyph: 3985 },
        { x: 36, y: 4, ch: '-', semanticKind: 'terrain', semanticName: 'horizontal wall' },
        { x: 30, y: 4, ch: '%', semanticKind: 'corpse', semanticName: 'cave dweller', semanticKnown: true, glyph: 901 },
        { x: 32, y: 4, ch: '$', semanticKind: 'object', semanticName: 'gold piece', semanticKnown: true, glyph: 3886 },
        { x: 38, y: 4, ch: '!', semanticKind: 'object', semanticName: 'gain level', semanticKnown: false, semanticAppearance: 'ruby', glyph: 3755 },
        { x: 39, y: 4, ch: '@', semanticKind: 'monster', semanticName: 'werejackal', semanticKnown: true, glyph: 262 },
        { x: 40, y: 4, ch: 'h', semanticKind: 'monster', semanticName: 'dwarf', semanticKnown: true, glyph: 44 },
        { x: 78, y: 20, ch: '>', semanticKind: 'stairs', semanticName: 'down staircase', semanticKnown: true }
      ]);`);
    const beforeScreenshot = path.join(outDir, 'map-tooltip-before-hidden.png');
    await page.screenshot(beforeScreenshot);
    await page.run(`window.__nethackTooltipTest.showFor(2, 2);`);
    const floorHoverScreenshot = path.join(outDir, 'map-tooltip-floor-hover-no-tooltip.png');
    await page.screenshot(floorHoverScreenshot);
    const metrics = await page.evalValue(`(() => {
      window.__nethackTooltipTest.setCells([
        { x: 2, y: 2, ch: '.', semanticKind: 'terrain', semanticName: 'room', semanticKnown: true },
        { x: 1, y: 2, ch: '|', semanticKind: 'terrain', semanticName: 'stone wall', semanticKnown: true },
        { x: 3, y: 2, ch: 'f', semanticKind: 'monster', semanticName: 'kitten', semanticKnown: true, glyph: 798 },
        { x: 4, y: 2, ch: '%', semanticKind: 'object', semanticName: 'food ration', semanticKnown: true },
        { x: 5, y: 2, ch: '%', semanticKind: 'corpse', semanticName: 'kitten', semanticKnown: true, glyph: 900 },
        { x: 6, y: 2, ch: '.', semanticKind: 'engraving', semanticName: 'engraving in a room', semanticKnown: true },
        { x: 7, y: 2, ch: '?', semanticKind: 'object', semanticName: 'scroll of food detection', semanticKnown: true },
        { x: 8, y: 2, ch: '?', semanticKind: 'object', semanticKnown: false, semanticAppearance: 'scroll labeled ZLORFIK' },
        { x: 10, y: 2, ch: '?', semanticKind: 'object', semanticName: 'destroy armor', semanticKnown: false, semanticAppearance: 'scroll labeled READ ME', glyph: 3772 },
        { x: 11, y: 2, ch: '\`', semanticKind: 'engraving', semanticName: 'engraving in a room', semanticKnown: true, glyph: 3994, cmapIndex: 21, engravingText: 'Elbereth' },
        { x: 9, y: 2, ch: '\`', semanticKind: 'statue', semanticName: 'goblin', semanticKnown: true, glyph: 903 },
        { x: 12, y: 4, ch: '-', semanticKind: 'terrain', semanticName: 'horizontal wall' },
        { x: 13, y: 4, ch: '+', semanticKind: 'door', semanticName: 'horizontal closed door', featureDescription: 'closed door', glyph: 3989 },
        { x: 14, y: 4, ch: '-', semanticKind: 'terrain', semanticName: 'horizontal wall' },
        { x: 17, y: 3, ch: '|', semanticKind: 'terrain', semanticName: 'vertical wall' },
        { x: 17, y: 4, ch: '+', semanticKind: 'door', semanticName: 'vertical closed door', featureDescription: 'closed door', glyph: 3988 },
        { x: 17, y: 5, ch: '|', semanticKind: 'terrain', semanticName: 'vertical wall' },
        { x: 20, y: 4, ch: '-', semanticKind: 'terrain', semanticName: 'horizontal wall' },
        { x: 21, y: 4, ch: '|', semanticKind: 'door', semanticName: 'horizontal open door', featureDescription: 'open door', glyph: 3987 },
        { x: 22, y: 4, ch: '-', semanticKind: 'terrain', semanticName: 'horizontal wall' },
        { x: 25, y: 3, ch: '|', semanticKind: 'terrain', semanticName: 'vertical wall' },
        { x: 25, y: 4, ch: '-', semanticKind: 'door', semanticName: 'vertical open door', featureDescription: 'open door', glyph: 3986 },
        { x: 25, y: 5, ch: '|', semanticKind: 'terrain', semanticName: 'vertical wall' },
        { x: 28, y: 3, ch: '|', semanticKind: 'terrain', semanticName: 'vertical wall' },
        { x: 28, y: 4, ch: '.', semanticKind: 'terrain', semanticName: 'no door', featureDescription: 'doorway', glyph: 3985 },
        { x: 28, y: 5, ch: '|', semanticKind: 'terrain', semanticName: 'vertical wall' },
        { x: 34, y: 4, ch: '-', semanticKind: 'terrain', semanticName: 'horizontal wall' },
        { x: 35, y: 4, ch: '.', semanticKind: 'terrain', semanticName: 'no door', featureDescription: 'doorway', glyph: 3985 },
        { x: 36, y: 4, ch: '-', semanticKind: 'terrain', semanticName: 'horizontal wall' },
        { x: 30, y: 4, ch: '%', semanticKind: 'corpse', semanticName: 'cave dweller', semanticKnown: true, glyph: 901 },
        { x: 32, y: 4, ch: '$', semanticKind: 'object', semanticName: 'gold piece', semanticKnown: true, glyph: 3886 },
        { x: 38, y: 4, ch: '!', semanticKind: 'object', semanticName: 'gain level', semanticKnown: false, semanticAppearance: 'ruby', glyph: 3755 },
        { x: 39, y: 4, ch: '@', semanticKind: 'monster', semanticName: 'werejackal', semanticKnown: true, glyph: 262 },
        { x: 40, y: 4, ch: 'h', semanticKind: 'monster', semanticName: 'dwarf', semanticKnown: true, glyph: 44 },
        { x: 41, y: 4, ch: '@', semanticKind: 'hero', semanticName: 'hero', semanticKnown: true, glyph: 725, backgroundGlyph: 3992, backgroundSemanticKind: 'floor', backgroundSemanticName: 'floor of a room', backgroundSemanticKnown: true, objectLayerGlyph: 3672, objectLayerChar: '(', objectLayerSemanticKind: 'object', objectLayerSemanticName: 'large box', objectLayerSemanticKnown: true },
        { x: 42, y: 4, ch: '_', semanticKind: 'fixture', semanticName: 'altar', semanticKnown: true, featureDescription: 'altar to Tyr (lawful)' },
        { x: 43, y: 4, ch: '@', semanticKind: 'hero', semanticName: 'hero', semanticKnown: true, glyph: 725, backgroundGlyph: 4011, backgroundSemanticKind: 'fixture', backgroundSemanticName: 'altar', backgroundSemanticKnown: true, featureDescription: 'altar to Tyr (lawful)' },
        { x: 78, y: 20, ch: '>', semanticKind: 'stairs', semanticName: 'down staircase', semanticKnown: true }
      ]);
      window.__nethackPromptTest.setGroundPileSnapshotForTest([
        { objectId: 4101, displayName: 'large box', semanticKind: 'object', semanticName: 'large box', semanticKnown: true, glyphChar: 40, location: { kind: 'ground' } },
        { objectId: 4102, displayName: 'food ration', semanticKind: 'object', semanticName: 'food ration', semanticKnown: true, glyphChar: 37, location: { kind: 'ground' } },
        { objectId: 4103, displayName: 'ruby potion', semanticKind: 'object', semanticName: 'gain level', semanticAppearance: 'ruby', semanticKnown: false, glyphChar: 33, location: { kind: 'ground' } }
      ], { x: 41, y: 4 });
      const cellAt = (x, y) => {
        const el = document.querySelector('.tile-cell[data-map-x="' + x + '"][data-map-y="' + y + '"]');
        return el ? { className: el.className || '', tileId: el.dataset.tileId || '', semanticKind: el.dataset.semanticKind || '', aria: el.getAttribute('aria-label') || '', backgroundImage: el.style.backgroundImage || '' } : null;
      };
      const floor = window.__nethackTooltipTest.showFor(2, 2);
      const wall = window.__nethackTooltipTest.showFor(1, 2);
      const monster = window.__nethackTooltipTest.showFor(3, 2);
      const item = window.__nethackTooltipTest.showFor(4, 2);
      const corpse = window.__nethackTooltipTest.showFor(5, 2);
      const engraving = window.__nethackTooltipTest.showFor(6, 2);
      const foodDetection = window.__nethackTooltipTest.showFor(7, 2);
      const labeledScroll = window.__nethackTooltipTest.showFor(8, 2);
      const readMeScroll = window.__nethackTooltipTest.showFor(10, 2);
      const runtimeEngraving = window.__nethackTooltipTest.showFor(11, 2);
      const statue = window.__nethackTooltipTest.showFor(9, 2);
      const hClosedDoor = window.__nethackTooltipTest.showFor(13, 4);
      const vClosedDoor = window.__nethackTooltipTest.showFor(17, 4);
      const hOpenDoor = window.__nethackTooltipTest.showFor(21, 4);
      const vOpenDoor = window.__nethackTooltipTest.showFor(25, 4);
      const vDoorway = window.__nethackTooltipTest.showFor(28, 4);
      const hDoorway = window.__nethackTooltipTest.showFor(35, 4);
      const caveDwellerCorpse = window.__nethackTooltipTest.showFor(30, 4);
      const goldPiece = window.__nethackTooltipTest.showFor(32, 4);
      const rubyPotion = window.__nethackTooltipTest.showFor(38, 4);
      const werejackal = window.__nethackTooltipTest.showFor(39, 4);
      const dwarf = window.__nethackTooltipTest.showFor(40, 4);
      const stackedSquare = window.__nethackTooltipTest.showFor(41, 4);
      const altar = window.__nethackTooltipTest.showFor(42, 4);
      const heroOnAltar = window.__nethackTooltipTest.showFor(43, 4);
      const edge = window.__nethackTooltipTest.showFor(78, 20);
      const withinViewport = (m) => !m.hidden && m.rect.left >= 0 && m.rect.top >= 0 && m.rect.right <= m.viewport.width && m.rect.bottom <= m.viewport.height;
      const cssDoorIcon = (m, orientation) => !m.hidden && /terrain-door/.test(m.iconClass || '') && /has-tooltip-tile/.test(m.iconClass || '') === false && !m.iconImage && (orientation ? new RegExp('terrain-door-open-' + orientation + '|door-in-' + orientation + '-wall').test(m.iconClass || '') : true);
      const cssDoorwayIcon = (m, orientation) => !m.hidden && /terrain-doorway/.test(m.iconClass || '') && !/terrain-door-open/.test(m.iconClass || '') && /has-tooltip-tile/.test(m.iconClass || '') === false && !m.iconImage && new RegExp('door-in-' + orientation + '-wall').test(m.iconClass || '');
      return {
        floor,
        wall,
        monster,
        item,
        corpse,
        engraving,
        foodDetection,
        labeledScroll,
        readMeScroll,
        runtimeEngraving,
        statue,
        hClosedDoor,
        vClosedDoor,
        hOpenDoor,
        vOpenDoor,
        vDoorway,
        hDoorway,
        caveDwellerCorpse,
        goldPiece,
        rubyPotion,
        werejackal,
        dwarf,
        stackedSquare,
        altar,
        heroOnAltar,
        doorCells: { hClosed: cellAt(13, 4), vClosed: cellAt(17, 4), hOpen: cellAt(21, 4), vOpen: cellAt(25, 4), vDoorway: cellAt(28, 4), hDoorway: cellAt(35, 4), caveDwellerCorpse: cellAt(30, 4), goldPiece: cellAt(32, 4), rubyPotion: cellAt(38, 4), werejackal: cellAt(39, 4), dwarf: cellAt(40, 4), readMeScroll: cellAt(10, 2), runtimeEngraving: cellAt(11, 2) },
        edge,
        assertions: {
          basicFloorNoTooltip: floor.hidden === true,
          basicWallNoTooltip: wall.hidden === true,
          monsterShowsNameAndIcon: !monster.hidden && /Kitten/i.test(monster.text) && monster.rect.width > 0 && monster.rect.height > 0,
          itemShowsNameAndIcon: !item.hidden && /Food Ration/i.test(item.text) && item.rect.width > 0 && item.rect.height > 0,
          corpseTooltipUsesRedXOverlay: !corpse.hidden && /Kitten/i.test(corpse.text) && /corpse-overlay/.test(corpse.iconClass || ''),
          engravingUsesRegeneratedCacheBustedTile: !engraving.hidden && engraving.assetId === 'engraving' && String(engraving.iconImage || '').includes('engraving.png') && String(engraving.iconImage || '').includes('?v='),
          foodDetectionUsesRegeneratedFullSourceScroll: !foodDetection.hidden && foodDetection.assetId === 'food-detection' && String(foodDetection.iconImage || '').includes('food-detection.png') && String(foodDetection.iconImage || '').includes('?v='),
          unidentifiedLabeledScrollUsesAppearanceTile: !labeledScroll.hidden && labeledScroll.assetId === 'zlorfik' && /ZLORFIK/i.test(labeledScroll.text),
          hiddenIdentityReadMeScrollUsesAppearanceTile: !readMeScroll.hidden && readMeScroll.assetId === 'read-me' && /Scroll Labeled READ ME/i.test(readMeScroll.text) && /read-me\.png/.test(readMeScroll.iconImage || '') && !/destroy-armor\.png/.test(readMeScroll.iconImage || '') && /scroll labeled READ ME/i.test(cellAt(10, 2)?.aria || '') && !/destroy armor/i.test(String(readMeScroll.text || '') + ' ' + String(cellAt(10, 2)?.aria || '')),
          runtimeEngravingGlyph3994UsesEngravingNotBoulder: !runtimeEngraving.hidden && runtimeEngraving.assetId === 'engraving' && /Engraving In A Room/i.test(runtimeEngraving.text) && /engraving\.png/.test(runtimeEngraving.iconImage || '') && /engraving in a room/i.test(cellAt(11, 2)?.aria || '') && !/boulder/i.test(String(runtimeEngraving.text || '') + ' ' + String(cellAt(11, 2)?.aria || '') + ' ' + String(runtimeEngraving.iconImage || '')),
          statueTooltipNamesCreatureAndStatue: !statue.hidden && /Goblin Statue/i.test(statue.title) && !/^Goblin$/i.test(statue.title),
          statueTooltipUsesGreyTextAndStoneIcon: /map-tooltip-statue/.test(statue.tooltipClass || '') && /statue-overlay/.test(statue.iconClass || '') && /rgb\\(200, 205, 212\\)/.test(statue.titleColor || ''),
          horizontalClosedDoorTooltipUsesSameCssTerrain: hClosedDoor.title === 'Closed Door' && hClosedDoor.assetId === 'closed-door' && cssDoorIcon(hClosedDoor, 'horizontal') && /terrain-door.*door-in-horizontal-wall/.test(cellAt(13, 4)?.className || ''),
          verticalClosedDoorTooltipUsesSameCssTerrain: vClosedDoor.title === 'Closed Door' && vClosedDoor.assetId === 'closed-door' && cssDoorIcon(vClosedDoor, 'vertical') && /terrain-door.*door-in-vertical-wall/.test(cellAt(17, 4)?.className || ''),
          horizontalOpenDoorTooltipUsesSameCssTerrain: hOpenDoor.title === 'Open Door' && hOpenDoor.assetId === 'open-horizontal-door' && cssDoorIcon(hOpenDoor, 'horizontal') && /terrain-door-open-horizontal/.test(cellAt(21, 4)?.className || ''),
          verticalOpenDoorTooltipUsesSameCssTerrain: vOpenDoor.title === 'Open Door' && vOpenDoor.assetId === 'open-vertical-door' && cssDoorIcon(vOpenDoor, 'vertical') && /terrain-door-open-vertical/.test(cellAt(25, 4)?.className || ''),
          verticalDoorwayTooltipReadsAsEmptyGap: vDoorway.title === 'Doorway' && vDoorway.assetId === 'no-door-doorway' && cssDoorwayIcon(vDoorway, 'vertical') && /terrain-doorway/.test(cellAt(28, 4)?.className || '') && !/terrain-door-open/.test(cellAt(28, 4)?.className || ''),
          horizontalDoorwayTooltipReadsAsEmptyGap: hDoorway.title === 'Doorway' && hDoorway.assetId === 'no-door-doorway' && cssDoorwayIcon(hDoorway, 'horizontal') && /terrain-doorway/.test(cellAt(35, 4)?.className || '') && !/terrain-door-open/.test(cellAt(35, 4)?.className || ''),
          caveDwellerCorpseUsesCorpseArtNotFoodRation: /Cave Dweller Corpse/i.test(caveDwellerCorpse.text) && caveDwellerCorpse.assetId === 'corpse' && /corpse\\.png/.test(caveDwellerCorpse.iconImage || '') && !/food-ration\\.png/.test(caveDwellerCorpse.iconImage || '') && cellAt(30, 4)?.tileId === 'corpse',
          goldPieceUsesGoldAssetNotFoodRation: /Gold Piece/i.test(goldPiece.text) && goldPiece.assetId === 'gold-piece' && /gold-piece\\.png/.test(goldPiece.iconImage || '') && !/food-ration\\.png/.test(goldPiece.iconImage || '') && cellAt(32, 4)?.tileId === 'gold-piece',
          rubyPotionUsesPotionClassNotRubyGem: /Ruby Potion/i.test(rubyPotion.text) && rubyPotion.assetId === 'potion-class-icon' && /potion-class-icon\.png/.test(rubyPotion.iconImage || '') && !/ruby\.png|gain-level|healing/.test(String(rubyPotion.assetId || '') + ' ' + String(rubyPotion.iconImage || '')) && cellAt(38, 4)?.tileId === 'potion-class-icon',
          werejackalAtSignUsesMonsterSemanticArtNotHeroAvatar: !werejackal.hidden && werejackal.title === 'Werejackal' && werejackal.assetId === 'werejackal' && /Monster/.test(werejackal.description || '') && /werejackal\.png/.test(werejackal.iconImage || '') && cellAt(39, 4)?.tileId === 'werejackal' && cellAt(39, 4)?.semanticKind === 'monster' && !/Hero|Player combo avatars|human-valkyrie/.test(String(werejackal.text || '') + ' ' + String(werejackal.description || '') + ' ' + String(werejackal.iconImage || '')),
          dwarfGlyph44UsesDwarfMonsterArtAndLabel: !dwarf.hidden && dwarf.title === 'Dwarf' && dwarf.assetId === 'dwarf' && /Monster/.test(dwarf.description || '') && /dwarf\.png/.test(dwarf.iconImage || '') && cellAt(40, 4)?.tileId === 'dwarf' && cellAt(40, 4)?.semanticKind === 'monster' && !/Hobbit|Hero|Player combo avatars|human-valkyrie/.test(String(dwarf.text || '') + ' ' + String(dwarf.description || '') + ' ' + String(dwarf.iconImage || '')),
          stackedSquareShowsTargetOnceAndEveryOtherPublicFact: !stackedSquare.hidden && stackedSquare.title === 'Archeologist' && stackedSquare.contents.map((entry) => entry.label + ':' + entry.kind).join('|') === 'Large Box:Object|Food Ration:Item|Ruby Potion:Item|Floor Of A Room:Floor' && (stackedSquare.text.match(/Archeologist/g) || []).length === 1 && (stackedSquare.text.match(/Large Box/g) || []).length === 1,
          featureTooltipUsesCompleteNativeLookDescription: altar.title === 'Altar To Tyr (Lawful)' && /Dungeon feature/.test(altar.description || ''),
          layeredTooltipKeepsCompleteNativeTerrainDescription: heroOnAltar.contents.some((entry) => entry.label === 'Altar To Tyr (Lawful)' && entry.kind === 'Dungeon feature') && (heroOnAltar.text.match(/Archeologist/g) || []).length === 1,
          rememberedEngravingTextAppearsInTooltip: /Inscription: “Elbereth”/.test(runtimeEngraving.description || ''),
          specialFeatureWithinViewport: /Down Staircase/i.test(edge.text) && withinViewport(edge),
        },
      };
    })()`);
    await page.run(`window.__nethackTooltipTest.showFor(6, 2);`);
    const screenshot = path.join(outDir, 'map-tooltip-after.png');
    await page.screenshot(screenshot);
    await page.run(`window.__nethackTooltipTest.showFor(9, 2);`);
    const statueScreenshot = path.join(outDir, 'map-tooltip-statue-after.png');
    await page.screenshot(statueScreenshot);
    const doorScreenshots = {};
    for (const [name, x, y] of [['horizontalClosed', 13, 4], ['verticalClosed', 17, 4], ['horizontalOpen', 21, 4], ['verticalOpen', 25, 4], ['verticalDoorway', 28, 4], ['horizontalDoorway', 35, 4], ['caveDwellerCorpse', 30, 4], ['goldPiece', 32, 4], ['rubyPotion', 38, 4], ['werejackalAtSignMonster', 39, 4], ['dwarfGlyph44Monster', 40, 4], ['stackedSquare', 41, 4], ['altarNativeLook', 42, 4], ['heroOnAltarNativeLook', 43, 4], ['readMeScroll', 10, 2], ['runtimeEngraving', 11, 2]]) {
      await page.run(`window.__nethackTooltipTest.showFor(${x}, ${y});`);
      const doorPath = path.join(outDir, `map-tooltip-${name}.png`);
      await page.screenshot(doorPath);
      doorScreenshots[name] = doorPath;
    }
    fs.writeFileSync(path.join(outDir, 'map-tooltip-metrics.json'), JSON.stringify({ ...metrics, beforeScreenshot, floorHoverScreenshot, screenshot, statueScreenshot, doorScreenshots }, null, 2));
    console.log(JSON.stringify({ ...metrics, beforeScreenshot, floorHoverScreenshot, screenshot, statueScreenshot, doorScreenshots }, null, 2));
    const failed = Object.entries(metrics.assertions).filter(([, ok]) => !ok).map(([name]) => name);
    if (failed.length) throw new Error(`map tooltip assertions failed: ${failed.join(', ')}`);
  });
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
