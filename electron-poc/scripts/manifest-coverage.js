const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/tiles/manifest.json'), 'utf8'));
const tileMap = JSON.parse(fs.readFileSync(path.join(root, 'assets/tiles/tile-map.json'), 'utf8'));
const assets = manifest.assets || [];
const byId = new Map(assets.map((asset) => [asset.id, asset]));
const referenceSections = ['defaults', 'char', 'glyphNumber', 'semanticName', 'semanticKind'];
const references = referenceSections.flatMap((section) => Object.entries(tileMap[section] || {}).map(([key, id]) => ({ section, key, id })));
const referenced = new Set(references.map(({ id }) => id).filter(Boolean));
const missingRefs = references.filter(({ id }) => id && !byId.has(id));
const missingFiles = assets.filter((asset) => asset.installedPath && !fs.existsSync(path.resolve(root, '..', asset.installedPath)));
const auditedSemanticMappings = {
  pit: 'pit',
  web: 'web',
  hole: 'hole',
  'anti-magic-field': 'anti-magic-trap',
  'anti-magic-trap': 'anti-magic-trap',
};
const auditedSemanticMismatches = Object.entries(auditedSemanticMappings)
  .filter(([semanticName, expectedId]) => tileMap.semanticName?.[semanticName] !== expectedId)
  .map(([semanticName, expectedId]) => ({ semanticName, expectedId, actualId: tileMap.semanticName?.[semanticName] }));
const glyphAssets = assets.filter((asset) => asset.glyph && !['space', '| or -', 'UI', 'overlay', 'corner', 'tee', 'bridge', 'beam', 'flash', 'cloud', 'shield', 'water', 'ice', 'lava'].includes(asset.glyph));
const glyphsInManifest = new Set(glyphAssets.map((asset) => asset.glyph));
const glyphsMapped = new Set(Object.keys(tileMap.char || {}));
const unmappedManifestGlyphs = [...glyphsInManifest].filter((glyph) => !glyphsMapped.has(glyph));
const report = {
  assetCount: assets.length,
  referencedAssetIds: referenced.size,
  missingReferenceCount: missingRefs.length,
  missingFileCount: missingFiles.length,
  auditedSemanticMismatchCount: auditedSemanticMismatches.length,
  manifestGlyphCount: glyphsInManifest.size,
  mappedGlyphCount: glyphsMapped.size,
  unmappedManifestGlyphs,
  missingRefs: missingRefs.map(({ section, key, id }) => `${section}.${key} -> ${id}`),
  auditedSemanticMismatches,
  missingFiles: missingFiles.map((asset) => asset.installedPath),
};
console.log(JSON.stringify(report, null, 2));
if (missingRefs.length || missingFiles.length || auditedSemanticMismatches.length) process.exit(1);
if (unmappedManifestGlyphs.length) process.exit(1);
