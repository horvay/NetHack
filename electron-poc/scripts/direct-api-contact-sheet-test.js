const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EvidenceScan = require('../src/shared/direct-api-evidence-scan');
const ContactSheet = require('./direct-api-contact-sheet');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'test-output', 'direct-api-evidence-harness', 'contact-sheet-fixture');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'screenshots'), { recursive: true });

const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64');
fs.writeFileSync(path.join(outDir, 'screenshots', '01-before.png'), onePixelPng);
fs.writeFileSync(path.join(outDir, 'screenshots', '02-after.png'), onePixelPng);

const manifest = EvidenceScan.createEvidenceManifest({
  task: 'equipment.change',
  scenarioId: 'equipment/ring-put-on-gui',
  screenshots: [
    { path: 'screenshots/01-before.png', label: 'Before ring placement', inspectionNotes: ['Context menu shows left/right hand choices by label, not selector letters.'] },
    { path: 'screenshots/02-after.png', label: 'After ring placement', inspectionNotes: ['Paper doll reconciled from public equipment snapshot.'] },
  ],
  stateSidecars: ['state/after.json'],
  contactSheets: ['contact-sheet.html'],
  forbiddenTokenScan: { passed: true, tokens: ['bridge_extcmd_answer', 'P<selector>'] },
  publicBoundaryScan: { passed: true, forbiddenFields: EvidenceScan.forbiddenPublicBoundaryFields },
  reviewNotes: ['No ring-hand prompt hidden behind the UI.', 'No hidden fields in public result sidecar.'],
});
const validation = EvidenceScan.validateEvidenceManifest(manifest);
assert.equal(validation.ok, true, validation.errors.join('\n'));
const { manifestPath } = EvidenceScan.writeEvidenceManifest(outDir, manifest);
const html = ContactSheet.createContactSheetHtml(manifest, { generatedAt: '2026-07-08T00:00:00.000Z' });
assert.match(html, /Before ring placement/);
assert.match(html, /Context menu shows left\/right hand choices/);
assert.match(html, /screenshots\/01-before\.png/);
assert.match(html, /Forbidden-token scan: <strong>PASS<\/strong>/);

const result = ContactSheet.writeContactSheet(manifestPath, path.join(outDir, 'contact-sheet.html'));
assert.deepEqual(result.screenshots, ['screenshots/01-before.png', 'screenshots/02-after.png']);
assert.match(fs.readFileSync(result.outputPath, 'utf8'), /Paper doll reconciled/);
console.log('direct-api-contact-sheet-test PASS');
