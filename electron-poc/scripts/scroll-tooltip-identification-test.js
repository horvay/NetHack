#!/usr/bin/env node
const assert = require('assert');
const MapPresentation = require('../src/shared/map-presentation');

const manifest = require('../assets/tiles/manifest.json');
const TileAssets = require('../src/shared/tile-assets');
const tileAssetsById = TileAssets.assetsById(manifest);
const context = { tileAssetsById };

const unidentified = MapPresentation.tooltipInfoForCell({
  ch: '?',
  semanticKind: 'object',
  semanticName: 'food detection',
  semanticKnown: false,
  semanticAppearance: 'scroll labeled ZLORFIK',
}, 4, 2, context);

const readMeHiddenIdentityCell = {
  ch: '?',
  glyph: 3772,
  semanticKind: 'object',
  semanticName: 'destroy armor',
  semanticKnown: false,
  semanticAppearance: 'scroll labeled READ ME',
};
const readMeAppearanceOverHiddenIdentity = MapPresentation.tooltipInfoForCell(readMeHiddenIdentityCell, 74, 18, context);
const readMeCellView = MapPresentation.cellViewModel(readMeHiddenIdentityCell, 74, 18, { ...context, cells: [[readMeHiddenIdentityCell]] });
const injectedHiddenAssetIdCell = {
  ...readMeHiddenIdentityCell,
  assetId: 'destroy-armor',
};
const injectedHiddenAssetIdTooltip = MapPresentation.tooltipInfoForCell(injectedHiddenAssetIdCell, 75, 18, context);
const injectedHiddenAssetIdCellView = MapPresentation.cellViewModel(injectedHiddenAssetIdCell, 75, 18, { ...context, cells: [[injectedHiddenAssetIdCell]] });

const unidentifiedGenericLabel = MapPresentation.tooltipInfoForCell({
  ch: '?',
  semanticKind: 'object',
  semanticName: 'destroy armor',
  semanticKnown: false,
  semanticAppearance: 'scroll labeled MISSING LABEL',
}, 7, 7, context);

const strcScreenshotCell = {
  ch: '?',
  glyph: 3780,
  semanticKind: 'object',
  semanticName: 'scroll labeled STRC PRST SKRZ KRK',
  semanticKnown: false,
};
const strcScreenshotTooltip = MapPresentation.tooltipInfoForCell(strcScreenshotCell, 8, 15, context);
const strcScreenshotCellView = MapPresentation.cellViewModel(strcScreenshotCell, 8, 15, { ...context, cells: [[strcScreenshotCell]] });

const unsafeExactLabelCell = {
  ch: '?',
  semanticKind: 'object',
  semanticName: 'create monster',
  semanticKnown: false,
  semanticAppearance: 'scroll labeled FOOBIE BLETCH',
};
const unsafeExactLabelTooltip = MapPresentation.tooltipInfoForCell(unsafeExactLabelCell, 9, 15, context);
const unsafeExactLabelCellView = MapPresentation.cellViewModel(unsafeExactLabelCell, 9, 15, { ...context, cells: [[unsafeExactLabelCell]] });

const identified = MapPresentation.tooltipInfoForCell({
  ch: '?',
  semanticKind: 'object',
  semanticName: 'food detection',
  semanticKnown: true,
  semanticAppearance: 'scroll labeled ZLORFIK',
}, 5, 2, context);

const hiddenIdentityThinSpellbookCell = {
  ch: '+',
  glyph: 3854,
  semanticKind: 'object',
  semanticName: 'jumping',
  semanticKnown: false,
  semanticAppearance: 'thin',
};
const thinSpellbookAppearanceOverHiddenIdentity = MapPresentation.tooltipInfoForCell(hiddenIdentityThinSpellbookCell, 30, 16, context);
const thinSpellbookCellView = MapPresentation.cellViewModel(hiddenIdentityThinSpellbookCell, 30, 16, { ...context, cells: [[hiddenIdentityThinSpellbookCell]] });

assert(unidentified, 'unidentified scroll should produce tooltip');
assert(readMeAppearanceOverHiddenIdentity, 'READ ME appearance regression should produce tooltip');
assert(injectedHiddenAssetIdTooltip, 'explicit hidden assetId regression should produce tooltip');
assert(unidentifiedGenericLabel, 'generic unidentified scroll should produce tooltip');
assert(strcScreenshotTooltip, 'STRC screenshot scroll should produce tooltip');
assert(unsafeExactLabelTooltip, 'unsafe exact-label scroll should produce tooltip');
assert(identified, 'identified scroll should produce tooltip');
assert(thinSpellbookAppearanceOverHiddenIdentity, 'thin spellbook appearance regression should produce tooltip');
assert.strictEqual(unidentified.title, 'Scroll Labeled ZLORFIK');
assert.strictEqual(unidentified.assetId, 'zlorfik');
assert.strictEqual(readMeAppearanceOverHiddenIdentity.title, 'Scroll Labeled READ ME');
assert.strictEqual(readMeAppearanceOverHiddenIdentity.assetId, 'read-me');
assert(!/Destroy Armor/.test(readMeAppearanceOverHiddenIdentity.title), 'READ ME tooltip must not reveal hidden true scroll name');
assert(!/destroy armor/i.test(readMeAppearanceOverHiddenIdentity.description), 'READ ME tooltip description must not reveal hidden true scroll name');
assert(!/destroy-armor\.png/.test(TileAssets.tileUrl(readMeAppearanceOverHiddenIdentity.tile)), 'READ ME tooltip must not use the hidden destroy-armor icon');
assert.strictEqual(readMeCellView.assetId, 'read-me');
assert(/scroll labeled READ ME/i.test(readMeCellView.ariaLabel), 'READ ME map aria label should use visible appearance');
assert(!/destroy armor/i.test(readMeCellView.ariaLabel), 'READ ME map aria label must not reveal hidden true scroll name');
assert.strictEqual(injectedHiddenAssetIdTooltip.title, 'Scroll Labeled READ ME');
assert.strictEqual(injectedHiddenAssetIdTooltip.assetId, 'read-me');
assert.strictEqual(injectedHiddenAssetIdCellView.assetId, 'read-me');
assert(!/destroy-armor\.png|destroy armor/i.test(`${TileAssets.tileUrl(injectedHiddenAssetIdTooltip.tile)} ${injectedHiddenAssetIdTooltip.title} ${injectedHiddenAssetIdTooltip.description} ${injectedHiddenAssetIdCellView.ariaLabel}`), 'explicit hidden assetId must not bypass public unknown-scroll appearance safeguards');
assert.strictEqual(unidentifiedGenericLabel.title, 'Scroll Labeled MISSING LABEL');
assert.strictEqual(unidentifiedGenericLabel.assetId, 'scroll-class-icon');
assert.strictEqual(strcScreenshotTooltip.title, 'Scroll Labeled STRC PRST SKRZ KRK');
assert.strictEqual(strcScreenshotTooltip.assetId, 'scroll-class-icon');
assert.strictEqual(strcScreenshotCellView.assetId, 'scroll-class-icon');
assert(/scroll labeled STRC PRST SKRZ KRK/i.test(strcScreenshotCellView.ariaLabel), 'STRC map aria label should use public visible label');
assert(!/strc-prst-skrz-krk\.png/.test(TileAssets.tileUrl(strcScreenshotTooltip.tile)), 'STRC tooltip must not use unsafe unrelated label art');
assert(!/destroy armor|remove curse|create monster|genocide|identify/i.test(`${strcScreenshotTooltip.title} ${strcScreenshotTooltip.description} ${strcScreenshotCellView.ariaLabel}`), 'STRC tooltip and aria must not reveal hidden scroll identity');
assert.strictEqual(unsafeExactLabelTooltip.title, 'Scroll Labeled FOOBIE BLETCH');
assert.strictEqual(unsafeExactLabelTooltip.assetId, 'scroll-class-icon');
assert.strictEqual(unsafeExactLabelCellView.assetId, 'scroll-class-icon');
assert(!/foobie-bletch\.png|create-monster\.png/.test(TileAssets.tileUrl(unsafeExactLabelTooltip.tile)), 'unsafe exact-label tooltip must fail closed to scroll class art');
assert(!/create monster/i.test(`${unsafeExactLabelTooltip.title} ${unsafeExactLabelTooltip.description} ${unsafeExactLabelCellView.ariaLabel}`), 'unsafe exact-label tooltip and aria must not reveal hidden true scroll name');
const safeExactScrollLabels = new Map([
  ['TEMOV', 'temov'],
  ['READ ME', 'read-me'],
  ['ZLORFIK', 'zlorfik'],
]);
const unsafeExactScrollLabels = ['FOOBIE BLETCH', 'GARVEN DEH', 'ETAOIN SHRDLU', 'LOREM IPSUM', 'FNORD', 'KO BATE', 'ABRA KA DABRA', 'ASHPD SODALG', 'GNIK SISI VLE', 'HAPAX LEGOMENON', 'EIRIS SAZUN IDISI', 'PHOL ENDE WODAN', 'GHOTI', 'MAPIRO MAHAMA DIROMAT', 'VAS CORP BET MANI', 'XOR OTA', 'STRC PRST SKRZ KRK'];
for (const [label, expectedAssetId] of safeExactScrollLabels) {
  assert.strictEqual(TileAssets.scrollLabelAssetId(`scroll labeled ${label}`, tileAssetsById), expectedAssetId, `${label} should keep safe scroll/parchment label art`);
}
for (const label of unsafeExactScrollLabels) {
  const cell = { ch: '?', semanticKind: 'object', semanticName: 'hidden scroll identity', semanticKnown: false, semanticAppearance: `scroll labeled ${label}` };
  const tooltip = MapPresentation.tooltipInfoForCell(cell, 12, 15, context);
  const view = MapPresentation.cellViewModel(cell, 12, 15, { ...context, cells: [[cell]] });
  assert.strictEqual(tooltip.assetId, 'scroll-class-icon', `${label} should fail closed to scroll class art`);
  assert.strictEqual(view.assetId, 'scroll-class-icon', `${label} map cell should fail closed to scroll class art`);
  assert(!/hidden scroll identity/i.test(`${tooltip.title} ${tooltip.description} ${view.ariaLabel}`), `${label} must not leak hidden identity`);
}
assert.strictEqual(identified.title, 'Food Detection');
assert.strictEqual(identified.assetId, 'food-detection');
assert.strictEqual(thinSpellbookAppearanceOverHiddenIdentity.title, 'Thin Spellbook');
assert.strictEqual(thinSpellbookAppearanceOverHiddenIdentity.assetId, 'spellbook-class-icon');
assert(!/jumping/i.test(thinSpellbookAppearanceOverHiddenIdentity.title), 'thin spellbook tooltip must not reveal hidden true spell');
assert(!/jumping/i.test(thinSpellbookAppearanceOverHiddenIdentity.description), 'thin spellbook tooltip description must not reveal hidden true spell');
assert(!/closed-door\.png/.test(TileAssets.tileUrl(thinSpellbookAppearanceOverHiddenIdentity.tile)), 'thin spellbook tooltip must not use the closed-door icon');
assert.strictEqual(thinSpellbookCellView.assetId, 'spellbook-class-icon');
assert(/thin spellbook/i.test(thinSpellbookCellView.ariaLabel), 'thin spellbook map aria label should use visible appearance plus class noun');
assert(!/jumping/i.test(thinSpellbookCellView.ariaLabel), 'thin spellbook map aria label must not reveal hidden true spell');
assert(!/Food Detection/.test(unidentified.title), 'unidentified tooltip must not reveal true scroll name');

console.log(JSON.stringify({
  unidentified: { title: unidentified.title, assetId: unidentified.assetId, description: unidentified.description },
  readMeAppearanceOverHiddenIdentity: { title: readMeAppearanceOverHiddenIdentity.title, assetId: readMeAppearanceOverHiddenIdentity.assetId, description: readMeAppearanceOverHiddenIdentity.description, ariaLabel: readMeCellView.ariaLabel },
  injectedHiddenAssetId: { title: injectedHiddenAssetIdTooltip.title, assetId: injectedHiddenAssetIdTooltip.assetId, description: injectedHiddenAssetIdTooltip.description, ariaLabel: injectedHiddenAssetIdCellView.ariaLabel },
  unidentifiedGenericLabel: { title: unidentifiedGenericLabel.title, assetId: unidentifiedGenericLabel.assetId, description: unidentifiedGenericLabel.description },
  strcScreenshot: { title: strcScreenshotTooltip.title, assetId: strcScreenshotTooltip.assetId, description: strcScreenshotTooltip.description, ariaLabel: strcScreenshotCellView.ariaLabel },
  unsafeExactLabel: { title: unsafeExactLabelTooltip.title, assetId: unsafeExactLabelTooltip.assetId, description: unsafeExactLabelTooltip.description, ariaLabel: unsafeExactLabelCellView.ariaLabel },
  identified: { title: identified.title, assetId: identified.assetId, description: identified.description },
  thinSpellbookAppearanceOverHiddenIdentity: { title: thinSpellbookAppearanceOverHiddenIdentity.title, assetId: thinSpellbookAppearanceOverHiddenIdentity.assetId, description: thinSpellbookAppearanceOverHiddenIdentity.description, ariaLabel: thinSpellbookCellView.ariaLabel },
}, null, 2));
