#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const TileAssets = require('../src/shared/tile-assets');
const MapPresentation = require('../src/shared/map-presentation');

const root = path.resolve(__dirname, '..', '..');
const electronRoot = path.join(root, 'electron-poc');
const manifest = JSON.parse(fs.readFileSync(path.join(electronRoot, 'assets/tiles/manifest.json'), 'utf8'));
const tileMapConfig = JSON.parse(fs.readFileSync(path.join(electronRoot, 'assets/tiles/tile-map.json'), 'utf8'));
const tileAssetsById = TileAssets.assetsById(manifest);
const terrainLikeIds = new Set([
  ...MapPresentation.legacyCssDungeonAssetIds,
  'altar', 'fountain', 'sink', 'throne', 'up-stairs', 'down-stairs', 'ladder-up', 'ladder-down',
]);

function imageBasename(view) {
  const image = `${view.backgroundImage || ''} ${view.tileImage || ''}`;
  const match = image.match(/([^/'")]+\.png)/);
  return match ? match[1] : '';
}
function categoryOf(assetId) {
  return tileAssetsById.get(assetId)?.categorySlug || '';
}
function modelFor(cell) {
  const cells = [[cell]];
  const view = MapPresentation.cellViewModel(cell, 1, 1, { tileMapConfig, tileAssetsById, cells });
  const tooltip = MapPresentation.tooltipInfoForCell(cell, 1, 1, { tileMapConfig, tileAssetsById, cells });
  const normalized = TileAssets.normalizeCell(cell);
  const kind = String(normalized.semanticKind || '').toLowerCase();
  const image = imageBasename(view);
  const titleAndDesc = `${tooltip?.title || ''} ${tooltip?.description || ''} ${view.ariaLabel || ''}`;
  const objectToTerrain = ['object', 'item', 'corpse', 'statue'].includes(kind)
    && (terrainLikeIds.has(view.assetId) || /terrain/.test(categoryOf(view.assetId)))
    && !['coin-pile'].includes(view.assetId);
  const semanticNameIsPublicLabel = /^scroll\s+labeled\s+/i.test(String(normalized.semanticName || '')) && !normalized.semanticAppearance;
  const hiddenName = normalized.semanticKnown === false && !semanticNameIsPublicLabel ? String(normalized.semanticName || '').trim() : '';
  const leaksHiddenName = Boolean(hiddenName && new RegExp(`\\b${hiddenName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(titleAndDesc));
  return {
    cell,
    assetId: view.assetId,
    categorySlug: categoryOf(view.assetId),
    useCssTerrain: view.useCssTerrain,
    classes: view.classes,
    image,
    ariaLabel: view.ariaLabel,
    tooltip: tooltip && { title: tooltip.title, description: tooltip.description, assetId: tooltip.assetId, useCssTerrain: tooltip.useCssTerrain, terrainClasses: tooltip.terrainClasses },
    flags: { objectToTerrain, leaksHiddenName, fallbackGlyph: view.fallbackGlyph || '' },
  };
}
function classify(result, expected) {
  if (expected.needsAsset) return 'needs asset regeneration/replacement';
  if (expected.falsePositive) return 'false positive / acceptable current policy';
  if (expected.broaderPolicy) return 'needs broader tooltip/UI policy cleanup';
  if (expected.assetId && result.assetId === expected.assetId && !result.flags.objectToTerrain && !result.flags.leaksHiddenName) return 'fixed';
  return 'needs narrow resolver fix';
}

const cases = [
  { id: 'sink-glyph-4013', note: 'Boss screenshot case: sink fixture glyph should resolve to sink art, not shared fountain or opaque terrain fallback.', cell: { ch: '{', glyph: 4013, semanticKind: 'fixture', semanticName: 'sink' }, expected: { assetId: 'sink' } },
  { id: 'fountain-glyph-4014', note: 'Nearby fixture feature keeps its own transparent fountain art.', cell: { ch: '{', glyph: 4014, semanticKind: 'fixture', semanticName: 'fountain' }, expected: { assetId: 'fountain' } },
  { id: 'altar-feature', note: 'Nearby floor feature keeps altar art despite shared object/iron-chain glyph.', cell: { ch: '_', semanticKind: 'feature', semanticName: 'altar' }, expected: { assetId: 'altar' } },
  { id: 'thin-spellbook-plus', note: 'Prior Boss report: unidentified + spellbook must not fall through to closed-door.', cell: { ch: '+', glyph: 3854, semanticKind: 'object', semanticName: 'jumping', semanticKnown: false, semanticAppearance: 'thin' }, expected: { assetId: 'spellbook-class-icon' } },
  { id: 'unlisted-spellbook-plus', note: 'Any object + should remain spellbook class art even if the cover adjective is missing from the slug allow-list.', cell: { ch: '+', glyph: 3854, semanticKind: 'object', semanticName: 'unknown spell', semanticKnown: false, semanticAppearance: 'strange' }, expected: { assetId: 'spellbook-class-icon' } },
  { id: 'unknown-wand-slash', note: 'Object / shares the open-door glyph and should use wand class art without revealing hidden identity.', cell: { ch: '/', glyph: 3860, semanticKind: 'object', semanticName: 'death', semanticKnown: false, semanticAppearance: 'long' }, expected: { assetId: 'wand-class-icon' } },
  { id: 'missing-appearance-wand', note: 'Unidentified / wand with missing appearance metadata should fail closed to wand class art/title, not hidden identity.', cell: { ch: '/', glyph: 3860, semanticKind: 'object', semanticName: 'death', semanticKnown: false }, expected: { assetId: 'wand-class-icon' } },
  { id: 'missing-appearance-scroll', note: 'Unidentified scroll with missing appearance metadata should fail closed to scroll class art/title, not hidden identity.', cell: { ch: '?', glyph: 3772, semanticKind: 'object', semanticName: 'destroy armor', semanticKnown: false }, expected: { assetId: 'scroll-class-icon' } },
  { id: 'unknown-potion', note: 'Public potion appearance keeps potion class icon and noun.', cell: { ch: '!', glyph: 3700, semanticKind: 'object', semanticName: 'healing', semanticKnown: false, semanticAppearance: 'purple-red' }, expected: { assetId: 'potion-class-icon' } },
  { id: 'unknown-ruby-potion', note: 'Boss screenshot case: public `ruby` potion appearance should use potion class art, not ruby gem art.', cell: { ch: '!', glyph: 3755, semanticKind: 'object', semanticName: 'gain level', semanticKnown: false, semanticAppearance: 'ruby' }, expected: { assetId: 'potion-class-icon' } },
  { id: 'unknown-ring', note: 'Public ring appearance keeps ring class icon and noun.', cell: { ch: '=', glyph: 3610, semanticKind: 'object', semanticName: 'teleportation', semanticKnown: false, semanticAppearance: 'gold' }, expected: { assetId: 'ring-class-icon' } },
  { id: 'unknown-amulet', note: 'Public amulet appearance keeps amulet class icon and noun.', cell: { ch: '"', glyph: 3640, semanticKind: 'object', semanticName: 'life saving', semanticKnown: false, semanticAppearance: 'spherical' }, expected: { assetId: 'amulet-class-icon' } },
  { id: 'unknown-gem', note: 'Public gem appearance keeps gem class icon and noun.', cell: { ch: '*', glyph: 3900, semanticKind: 'object', semanticName: 'diamond', semanticKnown: false, semanticAppearance: 'white' }, expected: { assetId: 'gem-class-icon' } },
  { id: 'read-me-scroll', note: 'Unidentified READ ME scroll should use public label art, not hidden scroll identity.', cell: { ch: '?', glyph: 3772, semanticKind: 'object', semanticName: 'destroy armor', semanticKnown: false, semanticAppearance: 'scroll labeled READ ME' }, expected: { assetId: 'read-me' } },
  { id: 'strc-prst-screenshot-scroll', note: 'Boss screenshot case: public STRC label has an unsafe non-scroll exact asset and should fail closed to the class icon.', cell: { ch: '?', glyph: 3780, semanticKind: 'object', semanticName: 'scroll labeled STRC PRST SKRZ KRK', semanticKnown: false }, expected: { assetId: 'scroll-class-icon' } },
  { id: 'unsafe-exact-label-scroll', note: 'Exact full-source label assets that are tools/books/relics should not be used for unidentified scroll appearances.', cell: { ch: '?', semanticKind: 'object', semanticName: 'create monster', semanticKnown: false, semanticAppearance: 'scroll labeled FOOBIE BLETCH' }, expected: { assetId: 'scroll-class-icon' } },
  { id: 'unsafe-exact-label-spellbook-garven', note: 'Exact label asset prompt says spellbook/book leather, so it must not be used for an unidentified scroll.', cell: { ch: '?', semanticKind: 'object', semanticName: 'identify', semanticKnown: false, semanticAppearance: 'scroll labeled GARVEN DEH' }, expected: { assetId: 'scroll-class-icon' } },
  { id: 'unsafe-exact-label-spellbook-hapax', note: 'Exact label asset prompt says spellbook/book leather, so it must not be used for an unidentified scroll.', cell: { ch: '?', semanticKind: 'object', semanticName: 'magic mapping', semanticKnown: false, semanticAppearance: 'scroll labeled HAPAX LEGOMENON' }, expected: { assetId: 'scroll-class-icon' } },
  { id: 'unsafe-exact-label-seeded-xor', note: 'Seeded real scenario label XOR OTA has crystal/tool full-source art and should fail closed to scroll class art.', cell: { ch: '?', glyph: 3775, semanticKind: 'object', semanticName: 'remove curse', semanticKnown: false, semanticAppearance: 'scroll labeled XOR OTA' }, expected: { assetId: 'scroll-class-icon' } },
  { id: 'gold-piece', note: 'Gold should use installed coin art, not food/ration fallback.', cell: { ch: '$', glyph: 3886, semanticKind: 'object', semanticName: 'gold piece' }, expected: { assetId: 'gold-piece' } },
  { id: 'known-iron-chain', note: 'Known chain object shares altar glyph but has exact object art.', cell: { ch: '_', semanticKind: 'object', semanticName: 'iron chain' }, expected: { assetId: 'iron-chain' } },
  { id: 'bare-chain-class', note: 'Bare object _ should prefer the one real chain object over altar terrain.', cell: { ch: '_', semanticKind: 'object', semanticKnown: false }, expected: { assetId: 'iron-chain' } },
  { id: 'known-venom', note: 'Known venom semantic name maps to object splash art despite floor glyph.', cell: { ch: '.', semanticKind: 'object', semanticName: 'splash of acid venom' }, expected: { assetId: 'splash-of-acid-venom' } },
  { id: 'bare-venom-class', note: 'Bare object . still has no neutral venom class icon; exact acid/blinding names work, but missing metadata falls through to floor.', cell: { ch: '.', semanticKind: 'object', semanticKnown: false }, expected: { needsAsset: true } },
  { id: 'trap-fire-collision', note: 'Trap semantic name fire collides with object fire asset and should resolve to fire-trap.', cell: { ch: '^', semanticKind: 'trap', semanticName: 'fire' }, expected: { assetId: 'fire-trap' } },
  { id: 'trap-polymorph-collision', note: 'Trap semantic name polymorph collides with object spellbook/wand names and should resolve to polymorph-trap.', cell: { ch: '^', semanticKind: 'trap', semanticName: 'polymorph' }, expected: { assetId: 'polymorph-trap' } },
  { id: 'trap-dart-collision', note: 'Trap semantic name dart collides with object dart asset and should resolve to dart-trap.', cell: { ch: '^', semanticKind: 'trap', semanticName: 'dart' }, expected: { assetId: 'dart-trap' } },
  { id: 'trap-arrow-collision', note: 'Trap semantic name arrow collides with object arrow asset and should resolve to arrow-trap.', cell: { ch: '^', semanticKind: 'trap', semanticName: 'arrow' }, expected: { assetId: 'arrow-trap' } },
  { id: 'trap-statue-collision', note: 'Trap semantic name statue collides with object statue asset and should resolve to statue-trap.', cell: { ch: '^', semanticKind: 'trap', semanticName: 'statue' }, expected: { assetId: 'statue-trap' } },
  { id: 'trap-bear-specific', note: 'Specific discovered bear trap uses its dedicated asset and player-facing name.', cell: { ch: '^', semanticKind: 'trap', semanticName: 'bear trap' }, expected: { assetId: 'bear-trap' } },
  { id: 'trap-land-mine-specific', note: 'Specific discovered land mine uses its dedicated asset rather than generic trap art.', cell: { ch: '^', semanticKind: 'trap', semanticName: 'land mine' }, expected: { assetId: 'land-mine' } },
  { id: 'trap-pit-specific', note: 'Specific discovered pit uses the pit asset.', cell: { ch: '^', semanticKind: 'trap', semanticName: 'pit' }, expected: { assetId: 'pit' } },
  { id: 'trap-web-specific', note: 'Specific discovered web uses the web asset.', cell: { ch: '^', semanticKind: 'trap', semanticName: 'web' }, expected: { assetId: 'web' } },
  { id: 'jackal-corpse', note: 'Corpse keeps recognizable monster art with corpse overlay.', cell: { ch: '%', semanticKind: 'corpse', semanticName: 'jackal' }, expected: { assetId: 'jackal', falsePositive: true } },
  { id: 'unknown-species-corpse', note: 'Unknown corpse species falls to generic corpse, not food ration.', cell: { ch: '%', semanticKind: 'corpse', semanticName: 'cave dweller' }, expected: { assetId: 'corpse' } },
  { id: 'statue-of-jackal', note: 'Statue phrased as "statue of" should still resolve the monster subject, not boulder.', cell: { ch: '`', semanticKind: 'statue', semanticName: 'statue of a jackal' }, expected: { assetId: 'jackal' } },
];

const rows = cases.map((entry) => {
  const result = modelFor(entry.cell);
  return { id: entry.id, note: entry.note, classification: classify(result, entry.expected), ...result };
});
const summary = rows.reduce((acc, row) => { acc[row.classification] = (acc[row.classification] || 0) + 1; return acc; }, {});
const report = { auditedAt: new Date().toISOString(), summary, rows };
const outPath = path.join(root, 'asset-generation/outputs/asset-tooltip-resolver-audit.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, output: path.relative(root, outPath), summary }, null, 2));
