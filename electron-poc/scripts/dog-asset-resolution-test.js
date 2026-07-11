#!/usr/bin/env node
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const TileAssets = require('../src/shared/tile-assets');
const MapPresentation = require('../src/shared/map-presentation');

const root = path.resolve(__dirname, '..');
const projectRoot = path.resolve(root, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/tiles/manifest.json'), 'utf8'));
const tileMapConfig = JSON.parse(fs.readFileSync(path.join(root, 'assets/tiles/tile-map.json'), 'utf8'));
const tileAssetsById = TileAssets.assetsById(manifest);
const rendererSource = fs.readFileSync(path.join(root, 'src/renderer.js'), 'utf8');
const regenerationSource = fs.readFileSync(path.join(projectRoot, 'asset-generation/scripts/full_tileset_regenerate.py'), 'utf8');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const dog = tileAssetsById.get('dog');
assert.ok(dog, 'manifest contains canonical dog');
const dogCopies = [
  path.join(projectRoot, dog.outputPath),
  path.join(projectRoot, dog.installedPath),
  path.join(root, 'assets/tiles/by-category/full-source-monsters/dog.png'),
];
for (const file of dogCopies) assert.ok(fs.existsSync(file), `dog pipeline copy exists: ${file}`);
assert.equal(new Set(dogCopies.map(hash)).size, 1, 'canonical output, installed asset, and by-category mirror are byte-identical');
assert.equal(hash(dogCopies[0]), dog.sha256, 'manifest cache/provenance hash matches canonical dog output');
assert.equal(dog.workflow, 'asset-generation/scripts/fix_dog_asset.py', 'dog records the actual canonical curation/install workflow');
assert.equal(dog.parentGenerationWorkflow, 'asset-generation/workflows/krea2_basic_rem-background.json', 'dog retains its generated parent candidate RMBG provenance');
assert.equal(dog.sourceCandidateSha256, '38522db76a9c892ab527debfb14f53383945e92feac10bc04d3efbe901ec39b7', 'dog pins the visually approved generated parent candidate');
assert.match(regenerationSource, /CURATED_ASSET_IDS = \{'dog'\}/, 'normal full regeneration knows dog is a pinned curated asset');
assert.match(regenerationSource, /if not args\.replace_curated:[\s\S]*wanted=\[a for a in wanted if a\['id'\] not in CURATED_ASSET_IDS\]/, 'normal and forced regeneration preserve dog unless replacement is explicitly requested');
assert.equal(dog.alphaStats?.opaqueEdgePixels, 0, 'dog has no opaque edge/card pixels');
assert.equal(dog.alphaStats?.visibleGreenMattePixels, 0, 'dog has no visible green matte pixels');

const aliasSource = rendererSource.slice(
  rendererSource.indexOf('const semanticAssetAliases = new Map(['),
  rendererSource.indexOf('const publicRoleNames'),
);
const rendererAliases = new Function(`${aliasSource}; return { semanticAssetAliases, petAssetAliases };`)();
const fallbackSource = rendererSource.slice(
  rendererSource.indexOf('function mappedAssetIdForCell(cell) {'),
  rendererSource.indexOf('\nfunction setStatus('),
);
const rendererFallback = new Function(
  'sharedModules', 'normalizeCell', 'semanticAssetAliases', 'petAssetAliases', 'slugifySemanticName',
  'tileAssetsById', 'tileMapConfig', 'defaultTileMapConfig', 'currentPlayerCharacter',
  `${fallbackSource}; return mappedAssetIdForCell;`,
)(
  {}, TileAssets.normalizeCell, rendererAliases.semanticAssetAliases, rendererAliases.petAssetAliases,
  TileAssets.slugifySemanticName, tileAssetsById, tileMapConfig, TileAssets.defaultTileMapConfig, () => ({}),
);

const variants = ['little-dog', 'dog', 'large-dog', 'little-dog-pet'].map((id) => {
  const asset = tileAssetsById.get(id);
  assert.ok(asset, `manifest contains ${id}`);
  return [id, hash(path.join(projectRoot, asset.installedPath))];
});
assert.equal(new Set(variants.map(([, digest]) => digest)).size, variants.length, `dog variants remain distinct: ${JSON.stringify(variants)}`);

for (const [semanticName, expected] of [
  ['little dog', 'little-dog'],
  ['dog', 'dog'],
  ['large dog', 'large-dog'],
]) {
  const resolved = TileAssets.mappedAssetIdForCell(
    { ch: 'd', semanticKind: 'monster', semanticName },
    { tileMapConfig, tileAssetsById },
  );
  assert.equal(resolved, expected, `non-pet ${semanticName} keeps its species/growth-stage art`);
}

for (const [semanticName, expected] of [
  ['little dog', 'little-dog-pet'],
  ['dog', 'dog'],
  ['large dog', 'large-dog'],
]) {
  const resolved = TileAssets.mappedAssetIdForCell(
    { ch: 'd', glyph: semanticName === 'dog' ? 1167 : undefined, semanticKind: 'pet', semanticName },
    { tileMapConfig, tileAssetsById },
  );
  assert.equal(resolved, expected, `pet ${semanticName} preserves the correct growth-stage art`);
}
assert.equal(
  TileAssets.mappedAssetIdForCell(
    { ch: 'd', glyph: 1165, semanticKind: 'pet', semanticName: 'little dog', assetId: 'little-dog' },
    { tileMapConfig, tileAssetsById },
  ),
  'little-dog-pet',
  'pet-state correction wins over a stale explicit non-pet little-dog asset id',
);
for (const [semanticName, expected] of [['little dog', 'little-dog-pet'], ['dog', 'dog'], ['large dog', 'large-dog']]) {
  assert.equal(
    rendererFallback({ ch: 'd', semanticKind: 'pet', semanticName }),
    expected,
    `executable renderer fallback preserves pet ${semanticName} growth-stage art when the shared module is unavailable`,
  );
}
assert.equal(
  rendererFallback({ ch: 'd', glyph: 1165, semanticKind: 'pet', semanticName: 'little dog', assetId: 'little-dog' }),
  'little-dog-pet',
  'executable renderer fallback gives pet correction precedence over a stale explicit asset id',
);

const bossCell = { ch: 'd', glyph: 1167, semanticKind: 'pet', semanticName: 'dog' };
const bossModel = MapPresentation.cellViewModel(bossCell, 39, 3, { tileMapConfig, tileAssetsById, cells: [[bossCell]] });
const bossTooltip = MapPresentation.tooltipInfoForCell(bossCell, 39, 3, { tileMapConfig, tileAssetsById, cells: [[bossCell]] });
assert.equal(bossModel.assetId, 'dog', 'Boss glyph 1167 map cell resolves to the repaired canonical adult dog sprite');
assert.equal(bossTooltip.assetId, 'dog', 'Boss glyph 1167 tooltip thumbnail resolves to the repaired canonical adult dog sprite');
assert.equal(bossTooltip.title, 'Dog', 'Boss tooltip keeps the player-facing Dog title');
assert.match(bossTooltip.description, /Pet · Full source monsters · glyph 1167 · map 39,3/, 'Boss tooltip reports pet state, repaired adult dog asset category, and exact glyph');

console.log(JSON.stringify({
  ok: true,
  dogSha256: dog.sha256,
  variants: Object.fromEntries(variants),
  boss: { modelAssetId: bossModel.assetId, tooltipAssetId: bossTooltip.assetId, tooltip: bossTooltip.description },
}, null, 2));
