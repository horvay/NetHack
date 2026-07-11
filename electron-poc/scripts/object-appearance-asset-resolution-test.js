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

function imageBasename(view) {
  const image = `${view.backgroundImage || ''} ${view.tileImage || ''}`;
  const match = image.match(/([^/'")]+\.png)/);
  return match ? match[1] : '';
}
function modelFor(cell) {
  const cells = [[cell]];
  const view = MapPresentation.cellViewModel(cell, 1, 1, { tileMapConfig, tileAssetsById, cells });
  const tooltip = MapPresentation.tooltipInfoForCell(cell, 1, 1, { tileMapConfig, tileAssetsById, cells });
  return {
    cell,
    assetId: view.assetId,
    categorySlug: tileAssetsById.get(view.assetId)?.categorySlug || '',
    image: imageBasename(view),
    ariaLabel: view.ariaLabel,
    classes: view.classes,
    tooltip: tooltip && { title: tooltip.title, assetId: tooltip.assetId, description: tooltip.description },
  };
}
function assertCase(row) {
  if (row.assetId !== row.expectedAssetId) {
    throw new Error(`${row.id} expected ${row.expectedAssetId}, got ${row.assetId}: ${JSON.stringify(row, null, 2)}`);
  }
  if (row.mustInclude && !new RegExp(row.mustInclude, 'i').test(`${row.image} ${row.ariaLabel} ${row.tooltip?.title || ''}`)) {
    throw new Error(`${row.id} missing ${row.mustInclude}: ${JSON.stringify(row, null, 2)}`);
  }
  if (row.expectedTooltipTitle && row.tooltip?.title !== row.expectedTooltipTitle) {
    throw new Error(`${row.id} expected tooltip title ${row.expectedTooltipTitle}, got ${row.tooltip?.title}: ${JSON.stringify(row, null, 2)}`);
  }
  if (row.mustVisibleNotInclude && new RegExp(row.mustVisibleNotInclude, 'i').test(`${row.ariaLabel} ${row.tooltip?.title || ''} ${row.tooltip?.description || ''}`)) {
    throw new Error(`${row.id} visibly included forbidden ${row.mustVisibleNotInclude}: ${JSON.stringify(row, null, 2)}`);
  }
  if (row.mustNotInclude && new RegExp(row.mustNotInclude, 'i').test(`${row.assetId} ${row.image} ${row.ariaLabel} ${row.tooltip?.title || ''} ${row.tooltip?.description || ''}`)) {
    throw new Error(`${row.id} included forbidden ${row.mustNotInclude}: ${JSON.stringify(row, null, 2)}`);
  }
}

const cases = [
  // Boss report/root-cause class: unidentified armor appearances used to fall all the way to armor-class-icon.
  { id: 'boss-iron-skull-cap-map-tooltip-inventory-cell', group: 'armor appearance', expectedAssetId: 'helmet', mustInclude: 'helmet|Iron Skull Cap', mustNotInclude: 'armor-class-icon|orcish-helm|shield\\.png', cell: { ch: '[', glyph: 3579, semanticKind: 'object', semanticName: 'orcish helm', semanticKnown: false, semanticAppearance: 'iron skull cap' } },
  { id: 'boss-iron-skull-cap-with-missing-class-glyph', group: 'armor appearance', expectedAssetId: 'helmet', mustInclude: 'helmet|Iron Skull Cap', mustNotInclude: 'armor-class-icon|orcish-helm|shield\\.png', cell: { semanticKind: 'object', semanticName: 'orcish helm', semanticKnown: false, semanticAppearance: 'iron skull cap' } },
  { id: 'leather-hat-helmet-appearance', group: 'armor appearance', expectedAssetId: 'helmet', cell: { ch: '[', semanticKind: 'object', semanticName: 'elven leather helm', semanticKnown: false, semanticAppearance: 'leather hat' } },
  { id: 'hard-hat-helmet-appearance', group: 'armor appearance', expectedAssetId: 'helmet', cell: { ch: '[', semanticKind: 'object', semanticName: 'dwarvish iron helm', semanticKnown: false, semanticAppearance: 'hard hat' } },
  { id: 'conical-hat-helmet-appearance', group: 'armor appearance', expectedAssetId: 'helmet', cell: { ch: '[', semanticKind: 'object', semanticName: 'dunce cap', semanticKnown: false, semanticAppearance: 'conical hat' } },
  { id: 'crystal-helmet-appearance', group: 'armor appearance', expectedAssetId: 'helmet', cell: { ch: '[', semanticKind: 'object', semanticName: 'helm of brilliance', semanticKnown: false, semanticAppearance: 'crystal helmet' } },
  { id: 'plumed-helmet-appearance', group: 'armor appearance', expectedAssetId: 'helmet', cell: { ch: '[', semanticKind: 'object', semanticName: 'helmet', semanticKnown: false, semanticAppearance: 'plumed helmet' } },
  { id: 'etched-helmet-appearance', group: 'armor appearance', expectedAssetId: 'helmet', cell: { ch: '[', semanticKind: 'object', semanticName: 'helm of caution', semanticKnown: false, semanticAppearance: 'etched helmet' } },
  { id: 'crested-helmet-appearance', group: 'armor appearance', expectedAssetId: 'helmet', cell: { ch: '[', semanticKind: 'object', semanticName: 'helm of opposite alignment', semanticKnown: false, semanticAppearance: 'crested helmet' } },
  { id: 'visored-helmet-appearance', group: 'armor appearance', expectedAssetId: 'helmet', cell: { ch: '[', semanticKind: 'object', semanticName: 'helm of telepathy', semanticKnown: false, semanticAppearance: 'visored helmet' } },
  { id: 'wooden-shield-appearance', group: 'armor appearance', expectedAssetId: 'shield', cell: { ch: '[', semanticKind: 'object', semanticName: 'small shield', semanticKnown: false, semanticAppearance: 'wooden shield' } },
  { id: 'large-round-shield-appearance', group: 'armor appearance', expectedAssetId: 'shield', cell: { ch: '[', semanticKind: 'object', semanticName: 'dwarvish roundshield', semanticKnown: false, semanticAppearance: 'large round shield' } },
  { id: 'cloak-public-appearance', group: 'armor appearance', expectedAssetId: 'cloak', cell: { ch: '[', semanticKind: 'object', semanticName: 'cloak of protection', semanticKnown: false, semanticAppearance: 'tattered cape' } },
  { id: 'gloves-public-appearance', group: 'armor appearance', expectedAssetId: 'gloves', cell: { ch: '[', semanticKind: 'object', semanticName: 'gauntlets of power', semanticKnown: false, semanticAppearance: 'riding gloves' } },
  { id: 'boots-public-appearance', group: 'armor appearance', expectedAssetId: 'boots', cell: { ch: '[', semanticKind: 'object', semanticName: 'speed boots', semanticKnown: false, semanticAppearance: 'combat boots' } },
  { id: 'crude-ring-mail-public-appearance', group: 'armor appearance', expectedAssetId: 'orcish-ring-mail', cell: { ch: '[', semanticKind: 'object', semanticName: 'orcish ring mail', semanticKnown: false, semanticAppearance: 'crude ring mail' } },
  { id: 'crude-chain-mail-public-appearance', group: 'armor appearance', expectedAssetId: 'chain-mail', cell: { ch: '[', semanticKind: 'object', semanticName: 'orcish chain mail', semanticKnown: false, semanticAppearance: 'crude chain mail' } },

  // Known identities should still use exact generated object assets.
  { id: 'known-orcish-helm', group: 'known armor', expectedAssetId: 'orcish-helm', cell: { ch: '[', semanticKind: 'object', semanticName: 'orcish helm', semanticKnown: true, semanticAppearance: 'iron skull cap' } },
  { id: 'known-large-shield', group: 'known armor', expectedAssetId: 'large-shield', cell: { ch: '[', semanticKind: 'object', semanticName: 'large shield', semanticKnown: true } },
  { id: 'known-fedora', group: 'known armor', expectedAssetId: 'fedora', cell: { ch: '[', semanticKind: 'object', semanticName: 'fedora', semanticKnown: true } },

  // Representative non-armor object classes retain no-spoiler public class/appearance policies.
  { id: 'boss-crude-dagger-map-tooltip-inventory-cell', group: 'weapon appearance', expectedAssetId: 'orcish-dagger', expectedTooltipTitle: 'Crude Dagger', mustInclude: 'Crude Dagger|orcish-dagger', mustVisibleNotInclude: 'orcish dagger|Full source objects', mustNotInclude: 'weapon-class-icon', cell: { ch: ')', glyph: 3484, semanticKind: 'object', semanticName: 'orcish dagger', semanticKnown: false, semanticAppearance: 'crude dagger' } },
  { id: 'boss-crude-dagger-with-missing-class-glyph', group: 'weapon appearance', expectedAssetId: 'orcish-dagger', expectedTooltipTitle: 'Crude Dagger', mustInclude: 'Crude Dagger|orcish-dagger', mustVisibleNotInclude: 'orcish dagger|Full source objects', mustNotInclude: 'weapon-class-icon', cell: { semanticKind: 'object', semanticName: 'orcish dagger', semanticKnown: false, semanticAppearance: 'crude dagger' } },
  { id: 'weapon-known-long-sword', group: 'weapon', expectedAssetId: 'long-sword', cell: { ch: ')', semanticKind: 'object', semanticName: 'long sword', semanticKnown: true } },
  { id: 'weapon-unknown-runed-dagger', group: 'weapon', expectedAssetId: 'weapon-class-icon', cell: { ch: ')', semanticKind: 'object', semanticName: 'elven dagger', semanticKnown: false, semanticAppearance: 'runed dagger' } },
  { id: 'tool-known-lock-pick', group: 'tool', expectedAssetId: 'lock-pick', cell: { ch: '(', semanticKind: 'object', semanticName: 'lock pick', semanticKnown: true } },
  { id: 'tool-unknown-key', group: 'tool', expectedAssetId: 'tool-class-icon', cell: { ch: '(', semanticKind: 'object', semanticName: 'skeleton key', semanticKnown: false, semanticAppearance: 'key' } },
  { id: 'food-ration', group: 'food', expectedAssetId: 'food-ration', cell: { ch: '%', semanticKind: 'object', semanticName: 'food ration', semanticKnown: true } },
  { id: 'apple', group: 'food', expectedAssetId: 'apple', cell: { ch: '%', semanticKind: 'object', semanticName: 'apple', semanticKnown: true } },
  { id: 'potion-unknown', group: 'potion', expectedAssetId: 'potion-class-icon', mustNotInclude: 'healing', cell: { ch: '!', semanticKind: 'object', semanticName: 'healing', semanticKnown: false, semanticAppearance: 'purple-red' } },
  { id: 'potion-unknown-ruby-appearance', group: 'potion', expectedAssetId: 'potion-class-icon', expectedTooltipTitle: 'Ruby Potion', mustNotInclude: 'ruby\.png|gain-level|healing', cell: { ch: '!', glyph: 3755, semanticKind: 'object', semanticName: 'gain level', semanticKnown: false, semanticAppearance: 'ruby' } },
  { id: 'scroll-unknown-safe-label', group: 'scroll', expectedAssetId: 'read-me', mustNotInclude: 'destroy-armor', cell: { ch: '?', semanticKind: 'object', semanticName: 'destroy armor', semanticKnown: false, semanticAppearance: 'scroll labeled READ ME' } },
  { id: 'scroll-unknown-unsafe-label', group: 'scroll', expectedAssetId: 'scroll-class-icon', mustNotInclude: 'create-monster|foobie-bletch', cell: { ch: '?', semanticKind: 'object', semanticName: 'create monster', semanticKnown: false, semanticAppearance: 'scroll labeled FOOBIE BLETCH' } },
  { id: 'spellbook-unknown-thin', group: 'spellbook', expectedAssetId: 'spellbook-class-icon', mustNotInclude: 'jumping|closed-door', cell: { ch: '+', semanticKind: 'object', semanticName: 'jumping', semanticKnown: false, semanticAppearance: 'thin' } },
  { id: 'wand-unknown-long', group: 'wand', expectedAssetId: 'wand-class-icon', mustNotInclude: 'death|open-vertical-door', cell: { ch: '/', semanticKind: 'object', semanticName: 'death', semanticKnown: false, semanticAppearance: 'long' } },

  // Monsters, corpses/statues, and terrain/cmap representative checks.
  { id: 'monster-jackal', group: 'monster', expectedAssetId: 'jackal', cell: { ch: 'd', glyph: 395, semanticKind: 'monster', semanticName: 'jackal' } },
  { id: 'corpse-jackal', group: 'corpse', expectedAssetId: 'jackal', cell: { ch: '%', semanticKind: 'corpse', semanticName: 'jackal' } },
  { id: 'statue-of-jackal', group: 'statue', expectedAssetId: 'jackal', cell: { ch: '`', semanticKind: 'statue', semanticName: 'statue of a jackal' } },
  { id: 'terrain-floor', group: 'terrain', expectedAssetId: 'room-floor', cell: { ch: '.', glyph: 3992, semanticKind: 'terrain', semanticName: 'floor of a room' } },
  { id: 'terrain-fountain-cmap', group: 'terrain', expectedAssetId: 'fountain', cell: { ch: '{', glyph: 4014, semanticKind: 'fixture', semanticName: 'fountain' } },
  { id: 'terrain-engraving-cmap', group: 'terrain', expectedAssetId: 'engraving', cell: { ch: '`', glyph: 3994, cmapIndex: 21, semanticKind: 'engraving', semanticName: 'engraving in a room' } },
  { id: 'trap-fire', group: 'trap', expectedAssetId: 'fire-trap', cell: { ch: '^', semanticKind: 'trap', semanticName: 'fire' } },
];

const rows = cases.map((entry) => ({ ...entry, ...modelFor(entry.cell) }));
rows.forEach(assertCase);
const summary = rows.reduce((acc, row) => { acc[row.group] = (acc[row.group] || 0) + 1; return acc; }, {});
const report = { auditedAt: new Date().toISOString(), summary, rows };
const outPath = path.join(root, 'asset-generation/outputs/object-appearance-asset-resolution-audit.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, audited: rows.length, output: path.relative(root, outPath), summary }, null, 2));
