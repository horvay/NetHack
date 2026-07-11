const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EvidenceScan = require('../src/shared/direct-api-evidence-scan');
const ContactSheet = require('./direct-api-contact-sheet');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'direct-api-evidence-harness');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'screenshots'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'state'), { recursive: true });

const catalog = EvidenceScan.validateScenarioCatalog(path.join(root, 'test', 'scenarios'));
assert.equal(catalog.ok, true, catalog.errors.join('\n'));
for (const task of ['ground.transfer', 'equipment.change', 'terrain.action', 'public-boundary']) {
  assert(EvidenceScan.scenarioIdsForTask(task).length > 0, `${task} should have reusable scenario ids`);
}
assert(EvidenceScan.scenarioIdsForTask('ground.transfer').includes('ground/pickup-pile-on-hero'));
assert(EvidenceScan.scenarioIdsForTask('equipment.change').includes('equipment/ring-put-on-gui'));
assert(EvidenceScan.scenarioIdsForTask('terrain.action').includes('terrain/fountain-dip-on-hero'));

fs.writeFileSync(path.join(outDir, 'events.jsonl'), [
  JSON.stringify({ name: 'command.accepted', commandType: 'ground.transfer', command: 'ground.transfer', payload: { transferId: 'ground-panel-1', direction: 'ground-to-inventory', itemId: 42, coord: { x: 12, y: 8 } } }),
  JSON.stringify({ name: 'command.completed', commandType: 'ground.transfer', result: { status: 'success', snapshots: ['inventory', 'ground'] } }),
  JSON.stringify({ name: 'ground.snapshot', snapshot: { items: [{ objectId: 42, displayName: 'a food ration', actionAffordances: ['pickup'] }] } }),
].join('\n'));
fs.writeFileSync(path.join(outDir, 'state', 'after-transfer.json'), JSON.stringify({
  payload: { commandType: 'ground.transfer', itemId: 42 },
  snapshot: { inventory: [{ objectId: 42, displayName: 'a food ration' }], ground: [] },
}, null, 2));
const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64');
fs.writeFileSync(path.join(outDir, 'screenshots', '01-ground-before.png'), onePixelPng);
fs.writeFileSync(path.join(outDir, 'screenshots', '02-ground-after.png'), onePixelPng);

const tokenScan = EvidenceScan.scanOutputDir(outDir, EvidenceScan.rulesForTask('ground.transfer'));
assert.equal(tokenScan.ok, true, EvidenceScan.markdownSummary(tokenScan));
const boundaryScan = EvidenceScan.scanPublicBoundaryOutputDir(outDir);
assert.equal(boundaryScan.ok, true, EvidenceScan.markdownSummary(boundaryScan));
fs.writeFileSync(path.join(outDir, 'forbidden-token-scan.md'), EvidenceScan.markdownSummary(tokenScan, 'Direct API evidence harness sample forbidden-token scan'));
fs.writeFileSync(path.join(outDir, 'public-boundary-scan.md'), EvidenceScan.markdownSummary(boundaryScan, 'Direct API evidence harness sample public-boundary scan'));

const manifest = EvidenceScan.createEvidenceManifest({
  task: 'ground.transfer',
  scenarioId: 'ground/pickup-pile-on-hero',
  outputDir: 'test-output/direct-api-evidence-harness',
  screenshots: [
    { path: 'screenshots/01-ground-before.png', label: 'Before direct ground transfer', inspectionNotes: ['Ground panel contains player-readable item names and no Pick up what? prompt.'] },
    { path: 'screenshots/02-ground-after.png', label: 'After direct ground transfer', inspectionNotes: ['The item appears in inventory evidence and no drop/pickup selector menu is visible.'] },
  ],
  stateSidecars: ['state/after-transfer.json'],
  logs: ['events.jsonl'],
  contactSheets: ['contact-sheet.html'],
  forbiddenTokenScan: { passed: tokenScan.ok, tokens: EvidenceScan.rulesForTask('ground.transfer').map((rule) => rule.id), summary: 'forbidden-token-scan.md' },
  publicBoundaryScan: { passed: boundaryScan.ok, forbiddenFields: EvidenceScan.forbiddenPublicBoundaryFields, summary: 'public-boundary-scan.md' },
  reviewNotes: ['Sample manifest demonstrates the strict-review artifact shape for implementation slices.', 'Real implementation slices must replace these fixture screenshots with inspected Electron/MCP screenshots.'],
});
const validation = EvidenceScan.validateEvidenceManifest(manifest);
assert.equal(validation.ok, true, validation.errors.join('\n'));
const written = EvidenceScan.writeEvidenceManifest(outDir, manifest);
const contact = ContactSheet.writeContactSheet(written.manifestPath, path.join(outDir, 'contact-sheet.html'));
assert(fs.existsSync(contact.outputPath));
const finalTokenScan = EvidenceScan.scanOutputDir(outDir, EvidenceScan.rulesForTask('ground.transfer'));
assert.equal(finalTokenScan.ok, true, 'final output bundle scan should ignore generated review artifacts and remain reproducible');
const finalBoundaryScan = EvidenceScan.scanPublicBoundaryOutputDir(outDir);
assert.equal(finalBoundaryScan.ok, true, 'final public-boundary scan should remain reproducible');
fs.writeFileSync(path.join(outDir, 'summary.md'), [
  '# Direct API evidence harness sample',
  '',
  'PASS',
  '',
  'Reusable scenario catalog, field-scoped forbidden-token scan, public-boundary scan, manifest validation, and contact-sheet generation all passed on this sample output bundle.',
  '',
  'Manifest: evidence-manifest.json',
  'Contact sheet: contact-sheet.html',
  'Forbidden-token scan: forbidden-token-scan.md',
  'Public-boundary scan: public-boundary-scan.md',
  '',
].join('\n'));

console.log(`direct-api-evidence-harness-test PASS (${path.join(outDir, 'summary.md')})`);
