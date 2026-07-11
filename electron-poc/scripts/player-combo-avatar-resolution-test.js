const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const TileAssets = require('../src/shared/tile-assets');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'assets/tiles/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const tileAssetsById = TileAssets.assetsById(manifest);

const comboDir = path.join(root, 'assets/tiles/generated/player-combo-avatars');
const comboFiles = fs.readdirSync(comboDir).filter((name) => /-avatar\.png$/.test(name)).sort();
assert.equal(comboFiles.length, 54, 'expected all 54 installed generated player-combo avatar PNGs');

for (const file of comboFiles) {
  const id = file.replace(/\.png$/, '');
  const tile = tileAssetsById.get(id);
  assert.ok(tile, `manifest contains combo asset ${id}`);
  assert.equal(tile.installedPath, `electron-poc/assets/tiles/generated/player-combo-avatars/${file}`);
  assert.equal(tile.categorySlug, 'player-combo-avatars');
  assert.equal(tile.width, 1024, `${id} manifest width`);
  assert.equal(tile.height, 1024, `${id} manifest height`);
}

const cases = [
  [{ role: 'Val', race: 'Hum', gender: 'Fem' }, 'human-valkyrie-female-avatar'],
  [{ role: 'Sam', race: 'Hum', gender: 'Mal' }, 'human-samurai-male-avatar'],
  [{ role: 'Wiz', race: 'Elf', gender: 'Fem' }, 'elf-wizard-female-avatar'],
  [{ role: 'Ran', race: 'Orc', gender: 'Mal' }, 'orc-ranger-male-avatar'],
  [{ role: 'Pri', race: 'Elf', gender: 'Fem' }, 'elf-priest-female-avatar'],
  [{ role: 'Mon', race: 'Hum', gender: 'Mal' }, 'human-monk-male-avatar'],
  [{ role: 'Mon', race: 'Hum', gender: 'Fem' }, 'human-monk-female-avatar'],
  [{ role: 'Cav', race: 'Gno', gender: 'Fem' }, 'gnome-caveman-female-avatar'],
  [{ role: 'valkyrie', race: 'dwarf', gender: 'female' }, 'dwarf-valkyrie-female-avatar'],
];

for (const [character, expected] of cases) {
  assert.equal(TileAssets.playerComboAvatarAssetId(character, tileAssetsById), expected, `direct combo id for ${JSON.stringify(character)}`);
  assert.equal(
    TileAssets.mappedAssetIdForCell({ ch: '@', glyph: 725, semanticKind: 'player', semanticName: 'Valkyrie' }, { tileAssetsById, playerCharacter: character }),
    expected,
    `player map cell resolves to combo avatar for ${JSON.stringify(character)}`,
  );
}

assert.equal(
  TileAssets.mappedAssetIdForCell({ ch: '@', glyph: 725, semanticKind: 'player', semanticName: 'Monk' }, { tileAssetsById, playerCharacter: { role: 'Mon', race: 'Dwa', gender: 'Mal' } }),
  'monk-role-avatar',
  'invalid monk combo falls back to the generated role avatar instead of the legacy hero avatar',
);
assert.equal(
  TileAssets.mappedAssetIdForCell({ ch: '@', glyph: 725, semanticKind: 'player', semanticName: 'Archeologist' }, { tileAssetsById, playerCharacter: { name: 'LoadedHero' } }),
  'archeologist-role-avatar',
  'loaded-game player cells with only a public role semantic use the player role avatar, not the full-source monster/person asset',
);
assert.equal(
  TileAssets.mappedAssetIdForCell({ ch: '@', glyph: 725, semanticKind: 'player', semanticName: 'Archeologist', assetId: 'hero-avatar' }, { tileAssetsById, playerCharacter: { name: 'LoadedHero' } }),
  'archeologist-role-avatar',
  'loaded-game player cells with a generic hero-avatar assetId still use public role art instead of stale neutral art',
);
assert.equal(
  TileAssets.mappedAssetIdForCell({ ch: '@', glyph: 725, semanticName: 'Archeologist' }, { tileAssetsById, playerCharacter: { name: 'LoadedHero' } }),
  'archeologist-role-avatar',
  'loaded-game player glyph with role semantic but no semanticKind still resolves as the player, not full-source role art',
);
assert.equal(
  TileAssets.mappedAssetIdForCell({ ch: '@', glyph: 725, semanticKind: 'player', semanticName: 'Valkyrie' }, { tileAssetsById, playerCharacter: { name: 'ContinueHero' } }),
  'valkyrie-role-avatar',
  'continued games without race/gender in the launch config still resolve player role semantics to role avatars',
);
assert.equal(
  TileAssets.mappedAssetIdForCell({ ch: '@', glyph: 725, semanticKind: 'hero', semanticName: 'hero' }, { tileAssetsById, playerCharacter: { name: 'ContinueHero' } }),
  'hero-avatar',
  'generic loaded hero cells fall back to the neutral hero avatar instead of a monster/item mapping',
);
for (const badAssetId of ['archeologist', 'werejackal', 'dwarf']) {
  assert.equal(
    TileAssets.mappedAssetIdForCell({ ch: '@', glyph: 725, semanticKind: 'player', semanticName: 'Archeologist', assetId: badAssetId }, { tileAssetsById, playerCharacter: { name: 'LoadedHero' } }),
    'archeologist-role-avatar',
    `player cells ignore unsafe explicit assetId ${badAssetId} and still use player role art`,
  );
}
assert.equal(
  TileAssets.mappedAssetIdForCell({ ch: '@', glyph: 725, semanticKind: 'player', semanticName: 'hero', assetId: 'human-valkyrie-female-avatar' }, { tileAssetsById, playerCharacter: { role: 'Val', race: 'Hum', gender: 'Fem' } }),
  'human-valkyrie-female-avatar',
  'player cells may keep explicit player avatar ids from the player asset categories',
);
assert.equal(
  TileAssets.isPlayerCell({ ch: '@', glyph: 262, semanticKind: 'monster', semanticName: 'werejackal' }),
  false,
  'monster glyphs that render with @ are not player cells',
);
assert.equal(
  TileAssets.mappedAssetIdForCell({ ch: '@', glyph: 262, semanticKind: 'monster', semanticName: 'werejackal' }, { tileAssetsById, playerCharacter: { role: 'Val', race: 'Hum', gender: 'Fem' } }),
  'werejackal',
  'a werejackal monster drawn as @ keeps monster art instead of borrowing the player combo avatar',
);
assert.equal(
  TileAssets.mappedAssetIdForCell({ ch: 'h', glyph: 44, semanticKind: 'monster', semanticName: 'dwarf' }, { tileAssetsById, playerCharacter: { role: 'Val', race: 'Hum', gender: 'Fem' } }),
  'dwarf',
  'dwarf monster glyph 44 resolves to the monster dwarf asset',
);
assert.equal(
  TileAssets.mappedAssetIdForCell({ ch: 'h', glyph: 44 }, { tileAssetsById, playerCharacter: { role: 'Val', race: 'Hum', gender: 'Fem' } }),
  'dwarf',
  'dwarf monster glyph 44 still resolves to dwarf art if semantic metadata is absent instead of char h hobbit fallback',
);
assert.equal(
  TileAssets.mappedAssetIdForCell({ ch: 'h', glyph: 427 }, { tileAssetsById, playerCharacter: { role: 'Val', race: 'Hum', gender: 'Fem' } }),
  'dwarf',
  'runtime dwarf display glyph 427 also resolves to dwarf art if semantic metadata is absent instead of char h hobbit fallback',
);
assert.equal(
  TileAssets.mappedAssetIdForCell({ ch: 'f', glyph: 798, semanticKind: 'pet', semanticName: 'kitten' }, { tileAssetsById, playerCharacter: { role: 'Val', race: 'Hum', gender: 'Fem' } }),
  'kitten-pet',
  'pet kitten glyph mapping remains pet art and is not affected by monster/player mapping changes',
);
assert.equal(
  TileAssets.mappedAssetIdForCell({ ch: '@', glyph: 9999, semanticKind: 'monster', semanticName: 'unmapped shapeshifter' }, { tileAssetsById, playerCharacter: { role: 'Val', race: 'Hum', gender: 'Fem' } }),
  undefined,
  'unmapped @ monsters fail closed to glyph rendering instead of hero-avatar fallback',
);
assert.equal(
  TileAssets.mappedAssetIdForCell({ ch: '@', glyph: 725, semanticKind: 'player', semanticName: 'Valkyrie' }, { tileAssetsById, playerCharacter: { role: 'Val', race: 'Orc', gender: 'Fem' } }),
  'valkyrie-role-avatar',
  'other invalid NetHack combos fall back to generated role avatars instead of a missing image',
);

assert.equal(TileAssets.isOverlayTile(tileAssetsById.get('human-valkyrie-female-avatar')), true, 'combo avatars render as floor overlays on the map');

console.log('player combo avatar resolution: ok');
