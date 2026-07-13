const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Qc = require('./lib/screenshot-qc');

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nethack-screenshot-qc-'));
try {
  const qc = Qc.createScreenshotQc({ rootDir });
  const raw = qc.rawPath('sample-frame');
  const generated = spawnSync('python3', ['-c', [
    'from PIL import Image',
    'import sys',
    "image=Image.new('RGB',(16,12),(31,27,24))",
    "image.putpixel((4,3),(214,171,67))",
    'image.save(sys.argv[1])',
  ].join('\n'), raw], { encoding: 'utf8' });
  assert.equal(generated.status, 0, generated.stderr);
  const entry = qc.recordCapture('sample-frame', raw, { viewport: { width: 16, height: 12 }, state: 'test' });
  assert.equal(entry.raw.width, 16);
  assert.equal(entry.raw.height, 12);
  assert.equal(entry.derivative.width, 16);
  assert.equal(entry.derivative.height, 12);
  assert.equal(entry.relationship.sourceSha256, entry.raw.sha256);
  assert.equal(Qc.validateManifest(qc.manifestFile).ok, true);
  assert.equal(Qc.validateManifest(qc.manifestFile, { requireInspection: true }).ok, false);
  const external = path.join(rootDir, 'external-source.png');
  fs.copyFileSync(raw, external);
  const copied = qc.recordCapture('copied-frame', external, { viewport: { width: 16, height: 12 }, state: 'test-copy' });
  assert.equal(copied.raw.path, qc.rawPath('copied-frame'), 'arbitrary raw sources are preserved under raw-captures');
  qc.markInspected('sample-frame', { accepted: true, inspector: 'Automated contract setup', notes: 'Synthetic frame dimensions and nonuniform pixel survived the transcode.' });
  qc.markInspected('copied-frame', { accepted: true, inspector: 'Automated contract setup', notes: 'External input was copied into canonical raw evidence before derivation.' });
  const checked = Qc.validateManifest(qc.manifestFile, { requireInspection: true });
  assert.equal(checked.ok, true, checked.errors.join(', '));
  assert.equal(checked.manualInspectionCompleted, true);
  fs.appendFileSync(entry.derivative.path, 'tamper');
  assert.equal(Qc.validateManifest(qc.manifestFile).ok, false, 'hash tampering must fail validation');
  console.log('screenshot QC manifest contract OK');
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true });
}
