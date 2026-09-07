const assert = require('node:assert/strict');
const path = require('node:path');
const TileAssets = require('../src/shared/tile-assets');

const root = path.resolve(__dirname, '..');
const manifest = require(path.join(root, 'assets/tiles/manifest.json'));
const tileMapConfig = require(path.join(root, 'assets/tiles/tile-map.json'));
const tileAssetsById = TileAssets.assetsById(manifest);
const swallowChars = ['/', '-', '\\', '|', '|', '\\', '-', '/'];

for (const [position, ch] of swallowChars.entries()) {
  const resolved = TileAssets.mappedAssetIdForCell(
    { ch, semanticKind: 'engulfment', semanticName: 'fog cloud', engulfmentPosition: position },
    { tileMapConfig, tileAssetsById },
  );
  assert.equal(resolved, 'fog-cloud', `fog cloud engulfment position ${position} resolves from monster identity, not '${ch}' terrain`);
}

for (const ch of new Set(swallowChars)) {
  const unresolved = TileAssets.mappedAssetIdForCell(
    { ch, semanticKind: 'engulfment', semanticName: 'unmapped engulfing monster' },
    { tileMapConfig, tileAssetsById },
  );
  assert.equal(unresolved, undefined, `unmapped engulfment '${ch}' must not borrow door or wall art`);
}

assert.equal(
  TileAssets.mappedAssetIdForCell({ ch: '#', semanticKind: 'terrain', semanticName: 'cloud' }, { tileMapConfig, tileAssetsById }),
  'cloud',
  'native harmless gas regions retain cloud terrain art',
);
assert.equal(
  TileAssets.mappedAssetIdForCell({ ch: '#', semanticKind: 'terrain', semanticName: 'poison cloud' }, { tileMapConfig, tileAssetsById }),
  'poison-cloud',
  'native damaging gas regions retain poison cloud terrain art',
);
assert.equal(
  TileAssets.mappedAssetIdForCell(
    { ch: '#', actorId: 'hero', semanticKind: 'terrain', semanticName: 'cloud' },
    { tileMapConfig, tileAssetsById, playerCharacter: { role: 'Val', race: 'Hum', gender: 'Fem' } },
  ),
  'human-valkyrie-female-avatar',
  'native cloud glyph at the hero coordinate preserves recognizable player art',
);
assert.equal(
  TileAssets.baseTileIdForCell(
    { ch: '#', actorId: 'hero', semanticKind: 'terrain', semanticName: 'cloud' },
    tileAssetsById.get('human-valkyrie-female-avatar'),
  ),
  'cloud',
  'recognizable hero art remains layered over the native vapor art',
);



console.log('engulfment-tile-resolution-test PASS');
