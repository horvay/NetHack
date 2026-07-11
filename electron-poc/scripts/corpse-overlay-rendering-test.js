const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const TileAssets = require('../src/shared/tile-assets');
const MapPresentation = require('../src/shared/map-presentation');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/tiles/manifest.json'), 'utf8'));
const tileMapConfig = JSON.parse(fs.readFileSync(path.join(root, 'assets/tiles/tile-map.json'), 'utf8'));
const tileAssetsById = TileAssets.assetsById(manifest);

function model(cell) {
  return MapPresentation.cellViewModel(cell, 10, 10, { tileMapConfig, tileAssetsById, cells: [[cell]], cursor: {}, mapWindowId: 1 });
}

const corpse = model({ ch: '%', glyph: 900, semanticKind: 'corpse', semanticName: 'jackal' });
assert.equal(corpse.assetId, 'jackal', 'corpse should keep the monster-specific asset so it remains recognizable');
assert.ok(corpse.classes.includes('corpse-tile'), 'corpse cell gets corpse marker class');
assert.ok(corpse.classes.includes('corpse-overlay'), 'corpse cell gets red-X overlay class');
assert.match(corpse.ariaLabel, /jackal corpse/i, 'corpse aria label identifies corpse, not a live monster');

const liveMonster = model({ ch: 'd', glyph: 1, semanticKind: 'monster', semanticName: 'jackal' });
assert.equal(liveMonster.assetId, 'jackal', 'live monster uses same recognizable monster asset');
assert.ok(!liveMonster.classes.includes('corpse-overlay'), 'live monster must not get corpse red-X overlay');
assert.doesNotMatch(liveMonster.ariaLabel || '', /corpse/i, 'live monster label must not say corpse');

const objectCorpseNameOnly = model({ ch: '%', glyph: 901, semanticKind: 'object', semanticName: 'jackal corpse' });
assert.ok(!objectCorpseNameOnly.classes.includes('corpse-overlay'), 'semanticName text alone is not enough; overlay relies on semantic corpse kind');

const unknownSpeciesCorpse = model({ ch: '%', glyph: 901, semanticKind: 'corpse', semanticName: 'cave dweller' });
assert.equal(unknownSpeciesCorpse.assetId, 'corpse', 'corpse species without a generated monster asset falls back to generic corpse, not food ration');
assert.match(unknownSpeciesCorpse.ariaLabel, /cave dweller corpse/i, 'unknown species corpse keeps the player-facing species name');
assert.ok(unknownSpeciesCorpse.classes.includes('corpse-overlay'), 'unknown species corpse still gets the corpse marker overlay');

const statue = model({ ch: '`', glyph: 902, semanticKind: 'statue', semanticName: 'jackal' });
assert.equal(statue.assetId, 'jackal', 'statue should keep the monster-specific asset so it remains recognizable');
assert.ok(statue.classes.includes('statue-tile'), 'statue cell gets statue marker class');
assert.ok(statue.classes.includes('statue-overlay'), 'statue cell gets stone overlay class');
assert.ok(statue.classes.includes('tile-overlay'), 'statue uses an image overlay layer so the stone filter affects the monster, not the floor');
assert.ok(!statue.classes.includes('corpse-overlay'), 'statue must not get the corpse red-X overlay');
assert.match(statue.ariaLabel, /jackal statue/i, 'statue aria label identifies statue, not a live monster');
assert.ok(statue.tileImage, 'statue uses the underlying monster image through the tile overlay pseudo-element');
assert.equal(statue.backgroundImage, '', 'statue does not bake the monster image into the floor background');
const goblinStatueTooltip = MapPresentation.tooltipInfoForCell({ ch: '`', glyph: 903, semanticKind: 'statue', semanticName: 'goblin' }, 10, 10, { tileMapConfig, tileAssetsById, cells: [[statue]] });
assert.match(goblinStatueTooltip.title, /Goblin Statue/i, 'statue tooltip title identifies both monster and statue');
assert.doesNotMatch(goblinStatueTooltip.title, /^Goblin$/i, 'statue tooltip title must not look like a live monster');

const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
assert.match(css, /\.tile-cell\.corpse-overlay::after/, 'CSS defines corpse overlay pseudo-element');
assert.match(css, /\.map-tooltip-icon\.corpse-overlay::after/, 'CSS applies the same corpse overlay to tooltip icons');
assert.match(css, /rgba\(239,\s*68,\s*68,\s*0\.42\)/, 'corpse X red stroke is translucent enough to leave the tile readable');
assert.match(css, /linear-gradient\(45deg[^;]+rgba\(239,\s*68,\s*68/, 'CSS paints one red diagonal of the X');
assert.match(css, /linear-gradient\(-45deg[^;]+rgba\(239,\s*68,\s*68/, 'CSS paints the other red diagonal of the X');
assert.match(css, /\.tile-cell\.statue-overlay\.tile-overlay::before[^{]*{[^}]*grayscale\(1\)/s, 'CSS grayscales the monster image layer for statues');
assert.match(css, /\.map-tooltip-icon\.statue-overlay\.has-tooltip-tile[^{]*{[^}]*grayscale\(1\)/s, 'CSS grayscales statue tooltip icons');
assert.match(css, /\.map-tooltip\.map-tooltip-statue \.map-tooltip-copy strong\s*{[^}]*#c8cdd4/s, 'CSS makes statue tooltip title text grey');
assert.match(css, /\.statue-menu-tile\s*{[^}]*grayscale\(1\)/s, 'CSS grayscales statue tiles in menus and related UI');

console.log('PASS corpse-overlay-rendering-test');
