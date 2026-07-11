#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const TileAssets = require('../src/shared/tile-assets');
const MapPresentation = require('../src/shared/map-presentation');

const root = path.resolve(__dirname, '..', '..');
const manifestPath = path.join(root, 'electron-poc/assets/tiles/manifest.json');
const tileMapPath = path.join(root, 'electron-poc/assets/tiles/tile-map.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const tileMap = JSON.parse(fs.readFileSync(tileMapPath, 'utf8'));
const assetsById = TileAssets.assetsById(manifest);
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function pngAlphaStats(file) {
  const buf = fs.readFileSync(file);
  if (!buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`not a PNG: ${file}`);
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset); offset += 4;
    const type = buf.toString('ascii', offset, offset + 4); offset += 4;
    const data = buf.subarray(offset, offset + length); offset += length + 4;
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG for alpha audit: ${file}`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported PNG color type ${colorType}: ${file}`);
  if (colorType !== 4 && colorType !== 6) return { width, height, colorType, minAlpha: 255, maxAlpha: 255, transparentPixels: 0, nonTransparentRatio: 1, opaqueEdgePixels: width * 2 + height * 2 };
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = [];
  let pos = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos++];
    const row = Buffer.from(raw.subarray(pos, pos + stride)); pos += stride;
    const bpp = channels;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? row[x - bpp] : 0;
      const up = prev[x] || 0;
      const upLeft = x >= bpp ? prev[x - bpp] || 0 : 0;
      const paeth = (() => { const p = left + up - upLeft; const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upLeft); return pa <= pb && pa <= pc ? left : (pb <= pc ? up : upLeft); })();
      if (filter === 1) row[x] = (row[x] + left) & 255;
      else if (filter === 2) row[x] = (row[x] + up) & 255;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (row[x] + paeth) & 255;
      else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}: ${file}`);
    }
    rows.push(row); prev = row;
  }
  let minAlpha = 255, maxAlpha = 0, transparentPixels = 0, nonTransparentPixels = 0, opaqueEdgePixels = 0;
  const alphaIndex = colorType === 6 ? 3 : 1;
  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    for (let x = 0; x < width; x += 1) {
      const a = row[x * channels + alphaIndex];
      minAlpha = Math.min(minAlpha, a); maxAlpha = Math.max(maxAlpha, a);
      if (a === 0) transparentPixels += 1;
      if (a > 0) nonTransparentPixels += 1;
      if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && a > 250) opaqueEdgePixels += 1;
    }
  }
  return { width, height, colorType, minAlpha, maxAlpha, transparentPixels, nonTransparentRatio: nonTransparentPixels / (width * height), opaqueEdgePixels };
}

const auditedIds = [
  'engraving', 'sink', 'fountain', 'altar',
  'spellbook-class-icon',
  'scroll-class-icon', 'scroll-of-identify', 'scroll-of-light', 'scroll-of-enchant-weapon', 'scroll-of-enchant-armor', 'scroll-of-teleportation',
  'charging', 'create-monster', 'food-detection', 'genocide', 'gold-detection', 'magic-mapping', 'punishment', 'read-me', 'remove-curse', 'taming', 'teleport-away', 'teleport-control', 'teleportation', 'temov', 'zlorfik', 'strc-prst-skrz-krk', 'foobie-bletch', 'garven-deh', 'hapax-legomenon', 'xor-ota', 'level-teleporter', 'helmet', 'shield', 'water', 'death-object',
];
const expectedMappings = new Map([
  ['engraving', 'engraving'],
  ['engraving in a room', 'engraving'],
  ['scroll of food detection', 'food-detection'],
  ['scroll of punishment', 'punishment'],
  ['scroll of remove curse', 'remove-curse'],
  ['scroll of taming', 'taming'],
  ['scroll of teleport away', 'teleport-away'],
  ['scroll of teleport control', 'teleport-control'],
  ['scroll of teleportation', 'scroll-of-teleportation'],
  ['scroll labeled ELBIB YLOH', 'scroll-class-icon'],
  ['scroll labeled THARR', 'scroll-class-icon'],
  ['scroll labeled ELAM EBOW', 'scroll-class-icon'],
  ['scroll labeled TEMOV', 'temov'],
  ['scroll labeled ZLORFIK', 'zlorfik'],
  ['scroll labeled READ ME', 'read-me'],
  ['scroll labeled STRC PRST SKRZ KRK', 'scroll-class-icon'],
  ['scroll labeled FOOBIE BLETCH', 'scroll-class-icon'],
  ['scroll labeled GARVEN DEH', 'scroll-class-icon'],
  ['scroll labeled HAPAX LEGOMENON', 'scroll-class-icon'],
  ['scroll labeled XOR OTA', 'scroll-class-icon'],
  ['semantic appearance scroll labeled ELBIB YLOH', 'scroll-class-icon'],
  ['level teleporter', 'level-teleporter'],
  ['shield', 'shield'],
  ['water', 'water'],
  ['death', 'death-object'],
  ['crude ring mail', 'orcish-ring-mail'],
]);

const errors = [];
const rows = [];
for (const id of auditedIds) {
  const asset = assetsById.get(id);
  if (!asset) { errors.push(`manifest missing ${id}`); continue; }
  const output = path.join(root, asset.outputPath || '');
  const installed = path.join(root, asset.installedPath || '');
  const outputExists = fs.existsSync(output);
  const installedExists = fs.existsSync(installed);
  let outputSha = null, installedSha = null;
  if (!outputExists) errors.push(`${id} output missing: ${asset.outputPath}`);
  else outputSha = sha256(output);
  if (!installedExists) errors.push(`${id} installed missing: ${asset.installedPath}`);
  else installedSha = sha256(installed);
  if (outputSha && installedSha && outputSha !== installedSha) errors.push(`${id} output/install SHA mismatch: ${outputSha} != ${installedSha}`);
  if (asset.sha256 && installedSha && asset.sha256 !== installedSha) errors.push(`${id} manifest sha256 mismatch: ${asset.sha256} != ${installedSha}`);
  const url = TileAssets.tileUrl(asset);
  if ((asset.sha256 || asset.completedAt || asset.coherentRestartAt) && !/\?v=/.test(url)) errors.push(`${id} tileUrl lacks cache-busting version: ${url}`);
  rows.push({ id, outputPath: asset.outputPath, installedPath: asset.installedPath, sha256: installedSha, outputMatchesInstalled: outputSha === installedSha, tileUrl: url });
}

const floorModel = MapPresentation.cellViewModel({ ch: '.', semanticKind: 'terrain', semanticName: 'floor of a room' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '.' }]] });
if (floorModel.assetId !== 'room-floor' || !floorModel.useCssTerrain || floorModel.backgroundImage) {
  errors.push(`legacy CSS terrain not selected for room floor: ${JSON.stringify({ assetId: floorModel.assetId, useCssTerrain: floorModel.useCssTerrain, backgroundImage: floorModel.backgroundImage })}`);
}
const overlayModel = MapPresentation.cellViewModel({ ch: '?', semanticKind: 'object', semanticName: 'scroll labeled ELBIB YLOH', semanticKnown: false }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '?' }]] });
if (overlayModel.assetId !== 'scroll-class-icon' || !overlayModel.classes.includes('terrain-floor') || !/scroll-class-icon\.png/.test(overlayModel.backgroundImage || overlayModel.tileImage || '') || /genocide\.png/.test(overlayModel.backgroundImage || overlayModel.tileImage || '')) {
  errors.push(`unidentified labeled scroll should use generic/label appearance art with CSS floor class, not hidden identity art: ${JSON.stringify({ assetId: overlayModel.assetId, classes: overlayModel.classes, baseTileId: overlayModel.baseTileId, backgroundImage: overlayModel.backgroundImage, tileImage: overlayModel.tileImage })}`);
}
const hiddenIdentityReadMeModel = MapPresentation.cellViewModel({ ch: '?', glyph: 3772, semanticKind: 'object', semanticName: 'destroy armor', semanticKnown: false, semanticAppearance: 'scroll labeled READ ME' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '?' }]] });
const hiddenIdentityPratyavayahModel = MapPresentation.cellViewModel({ ch: '?', semanticKind: 'object', semanticName: 'remove curse', semanticKnown: false, semanticAppearance: 'scroll labeled PRATYAVAYAH' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '?' }]] });
const screenshotStrcModel = MapPresentation.cellViewModel({ ch: '?', glyph: 3780, semanticKind: 'object', semanticName: 'scroll labeled STRC PRST SKRZ KRK', semanticKnown: false }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '?' }]] });
const unsafeExactLabelModel = MapPresentation.cellViewModel({ ch: '?', semanticKind: 'object', semanticName: 'create monster', semanticKnown: false, semanticAppearance: 'scroll labeled FOOBIE BLETCH' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '?' }]] });
if (hiddenIdentityReadMeModel.assetId !== 'read-me' || /destroy-armor\.png/.test(hiddenIdentityReadMeModel.backgroundImage || hiddenIdentityReadMeModel.tileImage || '') || /destroy armor/i.test(hiddenIdentityReadMeModel.ariaLabel || '')) {
  errors.push(`unidentified READ ME scroll should select appearance read-me art/label, not hidden destroy-armor art/label: ${JSON.stringify({ assetId: hiddenIdentityReadMeModel.assetId, ariaLabel: hiddenIdentityReadMeModel.ariaLabel, backgroundImage: hiddenIdentityReadMeModel.backgroundImage, tileImage: hiddenIdentityReadMeModel.tileImage })}`);
}
if (hiddenIdentityPratyavayahModel.assetId !== 'scroll-class-icon' || /remove-curse\.png/.test(hiddenIdentityPratyavayahModel.backgroundImage || hiddenIdentityPratyavayahModel.tileImage || '') || /remove curse/i.test(hiddenIdentityPratyavayahModel.ariaLabel || '')) {
  errors.push(`unidentified PRATYAVAYAH scroll should select generic scroll label art/label, not hidden remove-curse art/label: ${JSON.stringify({ assetId: hiddenIdentityPratyavayahModel.assetId, ariaLabel: hiddenIdentityPratyavayahModel.ariaLabel, backgroundImage: hiddenIdentityPratyavayahModel.backgroundImage, tileImage: hiddenIdentityPratyavayahModel.tileImage })}`);
}
if (screenshotStrcModel.assetId !== 'scroll-class-icon' || /strc-prst-skrz-krk\.png/.test(screenshotStrcModel.backgroundImage || screenshotStrcModel.tileImage || '') || !/scroll labeled STRC PRST SKRZ KRK/i.test(screenshotStrcModel.ariaLabel || '')) {
  errors.push(`STRC screenshot scroll should fail closed to scroll-class-icon because exact label art is not scroll/parchment: ${JSON.stringify({ assetId: screenshotStrcModel.assetId, ariaLabel: screenshotStrcModel.ariaLabel, backgroundImage: screenshotStrcModel.backgroundImage, tileImage: screenshotStrcModel.tileImage })}`);
}
if (unsafeExactLabelModel.assetId !== 'scroll-class-icon' || /foobie-bletch\.png|create-monster\.png/.test(unsafeExactLabelModel.backgroundImage || unsafeExactLabelModel.tileImage || '') || /create monster/i.test(unsafeExactLabelModel.ariaLabel || '')) {
  errors.push(`unsafe exact scroll-label art should fail closed to scroll-class-icon without hidden identity: ${JSON.stringify({ assetId: unsafeExactLabelModel.assetId, ariaLabel: unsafeExactLabelModel.ariaLabel, backgroundImage: unsafeExactLabelModel.backgroundImage, tileImage: unsafeExactLabelModel.tileImage })}`);
}
const transparentFeatureIds = ['sink', 'fountain', 'altar', 'engraving', 'grave'];
for (const id of transparentFeatureIds) {
  const asset = assetsById.get(id);
  if (!asset) { errors.push(`manifest missing transparent feature ${id}`); continue; }
  const stats = pngAlphaStats(path.join(root, asset.installedPath));
  if (stats.minAlpha !== 0 || stats.transparentPixels <= 0 || stats.opaqueEdgePixels !== 0 || stats.nonTransparentRatio > 0.8) {
    errors.push(`transparent feature ${id} should have real alpha/no opaque background card: ${JSON.stringify(stats)}`);
  }
}
const sinkGlyphModel = MapPresentation.cellViewModel({ ch: '{', glyph: 4013, semanticKind: 'fixture', semanticName: 'sink' }, 36, 9, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '{' }]] });
const sinkGlyphTooltip = MapPresentation.tooltipInfoForCell({ ch: '{', glyph: 4013, semanticKind: 'fixture', semanticName: 'sink' }, 36, 9, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '{' }]] });
if (sinkGlyphModel.assetId !== 'sink' || !sinkGlyphModel.classes.includes('tile-overlay') || sinkGlyphModel.backgroundImage || !/sink\.png/.test(sinkGlyphModel.tileImage || '') || sinkGlyphTooltip?.title !== 'Sink' || sinkGlyphTooltip?.assetId !== 'sink') {
  errors.push(`glyph 4013 sink should resolve to transparent sink overlay art for map and tooltip: ${JSON.stringify({ model: { assetId: sinkGlyphModel.assetId, classes: sinkGlyphModel.classes, backgroundImage: sinkGlyphModel.backgroundImage, tileImage: sinkGlyphModel.tileImage }, tooltip: sinkGlyphTooltip && { title: sinkGlyphTooltip.title, assetId: sinkGlyphTooltip.assetId, description: sinkGlyphTooltip.description } })}`);
}
const genericHiddenScrollModel = MapPresentation.cellViewModel({ ch: '?', semanticKind: 'object', semanticName: 'destroy armor', semanticKnown: false, semanticAppearance: 'scroll labeled UNKNOWN MISSING LABEL' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '?' }]] });
if (genericHiddenScrollModel.assetId !== 'scroll-class-icon' || /destroy-armor\.png/.test(genericHiddenScrollModel.backgroundImage || genericHiddenScrollModel.tileImage || '')) {
  errors.push(`unidentified scroll with unmapped label should select generic scroll-class-icon, not hidden destroy-armor art: ${JSON.stringify({ assetId: genericHiddenScrollModel.assetId, backgroundImage: genericHiddenScrollModel.backgroundImage, tileImage: genericHiddenScrollModel.tileImage })}`);
}
const horizontalDoorModel = MapPresentation.cellViewModel({ ch: '|', glyph: 3987, semanticKind: 'door', semanticName: 'horizontal open door' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '|' }]] });
if (horizontalDoorModel.assetId !== 'open-horizontal-door' || !horizontalDoorModel.useCssTerrain || horizontalDoorModel.backgroundImage) {
  errors.push(`horizontal open door glyph should keep its open-door id but render via legacy CSS terrain: ${JSON.stringify({ assetId: horizontalDoorModel.assetId, useCssTerrain: horizontalDoorModel.useCssTerrain, backgroundImage: horizontalDoorModel.backgroundImage, classes: horizontalDoorModel.classes })}`);
}
const emptyDoorwayModel = MapPresentation.cellViewModel({ ch: '.', glyph: 3985, semanticKind: 'terrain', semanticName: 'no door' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '|' }], [{ ch: '.' }], [{ ch: '|' }]] });
if (emptyDoorwayModel.assetId !== 'no-door-doorway' || !emptyDoorwayModel.useCssTerrain || !emptyDoorwayModel.classes.includes('terrain-doorway') || emptyDoorwayModel.classes.includes('terrain-door-open') || !/empty doorway/i.test(emptyDoorwayModel.ariaLabel || '')) {
  errors.push(`empty doorway glyph should render as no-door-doorway CSS terrain, not open-door art/classes: ${JSON.stringify({ assetId: emptyDoorwayModel.assetId, useCssTerrain: emptyDoorwayModel.useCssTerrain, backgroundImage: emptyDoorwayModel.backgroundImage, classes: emptyDoorwayModel.classes, ariaLabel: emptyDoorwayModel.ariaLabel })}`);
}
const thinSpellbookModel = MapPresentation.cellViewModel({ ch: '+', glyph: 3854, semanticKind: 'object', semanticName: 'jumping', semanticKnown: false, semanticAppearance: 'thin' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '+' }]] });
const thinSpellbookTooltip = MapPresentation.tooltipInfoForCell({ ch: '+', glyph: 3854, semanticKind: 'object', semanticName: 'jumping', semanticKnown: false, semanticAppearance: 'thin' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '+' }]] });
if (thinSpellbookModel.assetId !== 'spellbook-class-icon' || !/spellbook-class-icon\.png/.test(thinSpellbookModel.backgroundImage || thinSpellbookModel.tileImage || '') || /closed-door\.png|jumping\.png/.test(thinSpellbookModel.backgroundImage || thinSpellbookModel.tileImage || '') || !/thin spellbook/i.test(thinSpellbookModel.ariaLabel || '') || thinSpellbookTooltip?.title !== 'Thin Spellbook') {
  errors.push(`unidentified thin spellbook should select public spellbook appearance art/title, not closed-door fallback or hidden jumping art: ${JSON.stringify({ model: { assetId: thinSpellbookModel.assetId, ariaLabel: thinSpellbookModel.ariaLabel, backgroundImage: thinSpellbookModel.backgroundImage, tileImage: thinSpellbookModel.tileImage }, tooltip: thinSpellbookTooltip && { title: thinSpellbookTooltip.title, assetId: thinSpellbookTooltip.assetId, description: thinSpellbookTooltip.description } })}`);
}
const unknownWandModel = MapPresentation.cellViewModel({ ch: '/', glyph: 3860, semanticKind: 'object', semanticName: 'death', semanticKnown: false, semanticAppearance: 'long' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '/' }]] });
const unknownWandTooltip = MapPresentation.tooltipInfoForCell({ ch: '/', glyph: 3860, semanticKind: 'object', semanticName: 'death', semanticKnown: false, semanticAppearance: 'long' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '/' }]] });
if (unknownWandModel.assetId !== 'wand-class-icon' || unknownWandModel.useCssTerrain || !/wand-class-icon\.png/.test(unknownWandModel.backgroundImage || unknownWandModel.tileImage || '') || /open-vertical-door\.png|death\.png/.test(unknownWandModel.backgroundImage || unknownWandModel.tileImage || '') || !/long wand/i.test(unknownWandModel.ariaLabel || '') || unknownWandTooltip?.title !== 'Long Wand') {
  errors.push(`unidentified / wand should select public wand class art/title, not open-door fallback or hidden death art: ${JSON.stringify({ model: { assetId: unknownWandModel.assetId, useCssTerrain: unknownWandModel.useCssTerrain, ariaLabel: unknownWandModel.ariaLabel, backgroundImage: unknownWandModel.backgroundImage, tileImage: unknownWandModel.tileImage }, tooltip: unknownWandTooltip && { title: unknownWandTooltip.title, assetId: unknownWandTooltip.assetId, description: unknownWandTooltip.description } })}`);
}
const missingAppearanceHiddenWand = MapPresentation.cellViewModel({ ch: '/', glyph: 3860, semanticKind: 'object', semanticName: 'death', semanticKnown: false }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '/' }]] });
const missingAppearanceHiddenWandTooltip = MapPresentation.tooltipInfoForCell({ ch: '/', glyph: 3860, semanticKind: 'object', semanticName: 'death', semanticKnown: false }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '/' }]] });
if (missingAppearanceHiddenWand.assetId !== 'wand-class-icon' || missingAppearanceHiddenWandTooltip?.title !== 'Wand' || /death|open door/i.test(`${missingAppearanceHiddenWand.ariaLabel} ${missingAppearanceHiddenWandTooltip?.title} ${missingAppearanceHiddenWandTooltip?.description}`)) {
  errors.push(`unidentified wand with missing appearance should fail closed to class art/title and not hidden identity: ${JSON.stringify({ model: { assetId: missingAppearanceHiddenWand.assetId, ariaLabel: missingAppearanceHiddenWand.ariaLabel }, tooltip: missingAppearanceHiddenWandTooltip && { title: missingAppearanceHiddenWandTooltip.title, description: missingAppearanceHiddenWandTooltip.description } })}`);
}
const missingAppearanceHiddenScroll = MapPresentation.cellViewModel({ ch: '?', glyph: 3772, semanticKind: 'object', semanticName: 'destroy armor', semanticKnown: false }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '?' }]] });
const missingAppearanceHiddenScrollTooltip = MapPresentation.tooltipInfoForCell({ ch: '?', glyph: 3772, semanticKind: 'object', semanticName: 'destroy armor', semanticKnown: false }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '?' }]] });
if (missingAppearanceHiddenScroll.assetId !== 'scroll-class-icon' || missingAppearanceHiddenScrollTooltip?.title !== 'Scroll' || /destroy armor/i.test(`${missingAppearanceHiddenScroll.ariaLabel} ${missingAppearanceHiddenScrollTooltip?.title} ${missingAppearanceHiddenScrollTooltip?.description}`)) {
  errors.push(`unidentified scroll with missing appearance should fail closed to class art/title and not hidden identity: ${JSON.stringify({ model: { assetId: missingAppearanceHiddenScroll.assetId, ariaLabel: missingAppearanceHiddenScroll.ariaLabel }, tooltip: missingAppearanceHiddenScrollTooltip && { title: missingAppearanceHiddenScrollTooltip.title, description: missingAppearanceHiddenScrollTooltip.description } })}`);
}
for (const [trapName, expectedTrapId] of [['fire', 'fire-trap'], ['polymorph', 'polymorph-trap'], ['dart', 'dart-trap'], ['arrow', 'arrow-trap'], ['statue', 'statue-trap']]) {
  const trapModel = MapPresentation.cellViewModel({ ch: '^', glyph: 4000, semanticKind: 'trap', semanticName: trapName }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '^' }]] });
  if (trapModel.assetId !== expectedTrapId) errors.push(`trap ${trapName} should resolve to ${expectedTrapId}, not colliding object/class art: ${JSON.stringify({ assetId: trapModel.assetId, ariaLabel: trapModel.ariaLabel, backgroundImage: trapModel.backgroundImage, tileImage: trapModel.tileImage })}`);
}
const statueOfJackalModel = MapPresentation.cellViewModel({ ch: '`', glyph: 902, semanticKind: 'statue', semanticName: 'statue of a jackal' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '`' }]] });
if (statueOfJackalModel.assetId !== 'jackal' || !statueOfJackalModel.classes.includes('statue-overlay') || /boulder\.png/.test(statueOfJackalModel.backgroundImage || statueOfJackalModel.tileImage || '') || !/statue/i.test(statueOfJackalModel.ariaLabel || '')) {
  errors.push(`statue semantic names that include "statue of" should keep recognizable monster statue art, not boulder fallback: ${JSON.stringify({ assetId: statueOfJackalModel.assetId, classes: statueOfJackalModel.classes, ariaLabel: statueOfJackalModel.ariaLabel, backgroundImage: statueOfJackalModel.backgroundImage, tileImage: statueOfJackalModel.tileImage })}`);
}
const crudeRingMailModel = MapPresentation.cellViewModel({ ch: '[', glyph: 3581, semanticKind: 'object', semanticName: 'crude ring mail' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '[' }]] });
if (crudeRingMailModel.assetId !== 'orcish-ring-mail' || !/orcish-ring-mail\.png/.test(crudeRingMailModel.backgroundImage || crudeRingMailModel.tileImage || '')) {
  errors.push(`crude ring mail should select generated orcish ring mail art, not armor-class fallback: ${JSON.stringify({ assetId: crudeRingMailModel.assetId, backgroundImage: crudeRingMailModel.backgroundImage, tileImage: crudeRingMailModel.tileImage })}`);
}
const ironSkullCapModel = MapPresentation.cellViewModel({ ch: '[', glyph: 3579, semanticKind: 'object', semanticName: 'orcish helm', semanticKnown: false, semanticAppearance: 'iron skull cap' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '[' }]] });
const ironSkullCapTooltip = MapPresentation.tooltipInfoForCell({ ch: '[', glyph: 3579, semanticKind: 'object', semanticName: 'orcish helm', semanticKnown: false, semanticAppearance: 'iron skull cap' }, 1, 1, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: '[' }]] });
if (ironSkullCapModel.assetId !== 'helmet' || !/helmet\.png/.test(ironSkullCapModel.backgroundImage || ironSkullCapModel.tileImage || '') || ironSkullCapTooltip?.title !== 'Iron Skull Cap' || /armor-class-icon|orcish-helm|shield/i.test(`${ironSkullCapModel.assetId} ${ironSkullCapModel.backgroundImage || ''} ${ironSkullCapModel.tileImage || ''} ${ironSkullCapTooltip?.description || ''}`)) {
  errors.push(`unidentified iron skull cap should select public helmet/skull-cap appearance art, not broad armor fallback or hidden identity: ${JSON.stringify({ model: { assetId: ironSkullCapModel.assetId, ariaLabel: ironSkullCapModel.ariaLabel, backgroundImage: ironSkullCapModel.backgroundImage, tileImage: ironSkullCapModel.tileImage }, tooltip: ironSkullCapTooltip && { title: ironSkullCapTooltip.title, assetId: ironSkullCapTooltip.assetId, description: ironSkullCapTooltip.description } })}`);
}
const crudeDaggerModel = MapPresentation.cellViewModel({ ch: ')', glyph: 3484, semanticKind: 'object', semanticName: 'orcish dagger', semanticKnown: false, semanticAppearance: 'crude dagger' }, 23, 13, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: ')' }]] });
const crudeDaggerTooltip = MapPresentation.tooltipInfoForCell({ ch: ')', glyph: 3484, semanticKind: 'object', semanticName: 'orcish dagger', semanticKnown: false, semanticAppearance: 'crude dagger' }, 23, 13, { tileMapConfig: tileMap, tileAssetsById: assetsById, cells: [[{ ch: ')' }]] });
if (crudeDaggerModel.assetId !== 'orcish-dagger' || !/orcish-dagger\.png/.test(crudeDaggerModel.backgroundImage || crudeDaggerModel.tileImage || '') || crudeDaggerTooltip?.title !== 'Crude Dagger' || crudeDaggerTooltip?.assetId !== 'orcish-dagger' || !/Objects and inventory items · glyph 3484 · map 23,13/.test(crudeDaggerTooltip?.description || '') || /weapon-class-icon|Full source objects/i.test(`${crudeDaggerModel.assetId} ${crudeDaggerModel.backgroundImage || ''} ${crudeDaggerModel.tileImage || ''} ${crudeDaggerTooltip?.description || ''}`) || /orcish dagger/i.test(`${crudeDaggerModel.ariaLabel || ''} ${crudeDaggerTooltip?.title || ''} ${crudeDaggerTooltip?.description || ''}`)) {
  errors.push(`unidentified crude dagger should select the crude/orcish dagger public-appearance art, not crossed weapon fallback or visible hidden identity: ${JSON.stringify({ model: { assetId: crudeDaggerModel.assetId, ariaLabel: crudeDaggerModel.ariaLabel, backgroundImage: crudeDaggerModel.backgroundImage, tileImage: crudeDaggerModel.tileImage }, tooltip: crudeDaggerTooltip && { title: crudeDaggerTooltip.title, assetId: crudeDaggerTooltip.assetId, description: crudeDaggerTooltip.description } })}`);
}

for (const [semanticName, expectedId] of expectedMappings) {
  const semanticKind = semanticName.includes('engraving') ? 'engraving' : semanticName.includes('teleporter') ? 'trap' : expectedId === 'death' ? 'monster' : 'object';
  const cell = semanticName.startsWith('semantic appearance ')
    ? { ch: '?', semanticKind, semanticName: 'scroll', semanticKnown: false, semanticAppearance: semanticName.replace(/^semantic appearance /, '') }
    : { ch: semanticKind === 'trap' ? '^' : '?', semanticKind, semanticName, semanticKnown: /^scroll labeled /i.test(semanticName) ? false : undefined };
  const actual = TileAssets.mappedAssetIdForCell(cell, { tileMapConfig: tileMap, tileAssetsById: assetsById });
  if (actual !== expectedId) errors.push(`mapping ${JSON.stringify(semanticName)} expected ${expectedId}, got ${actual}`);
}

const report = { auditedAt: new Date().toISOString(), auditedIds, rows, errors };
const out = path.join(root, 'asset-generation/outputs/generated-runtime-asset-audit.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
if (errors.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, audited: rows.length, output: path.relative(root, out) }, null, 2));
