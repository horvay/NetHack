'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Qc = require('./lib/screenshot-qc');

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nethack-screenshot-qc-'));
try {
  const qc = Qc.createScreenshotQc({ rootDir, runIdentity: 'screenshot-contract-run' });
  assert.equal(path.basename(qc.manifestFile), 'evidence-approval.json', 'Screenshot QC has no competing manifest filename');
  const raw = qc.rawPath('cdp-frame');
  const generated = spawnSync('python3', ['-c', [
    'from PIL import Image',
    'import sys',
    "image=Image.new('RGB',(16,12),(31,27,24))",
    "image.putpixel((4,3),(214,171,67))",
    'image.save(sys.argv[1])',
  ].join('\n'), raw], { encoding: 'utf8' });
  assert.equal(generated.status, 0, generated.stderr);
  const cdp = qc.recordCapture('cdp-frame', raw, {
    viewport: { width: 16, height: 12 },
    state: 'test',
    classification: 'synthetic-fixture',
    captureAdapter: 'cdp',
    captureMethod: 'Page.captureScreenshot',
  });
  assert.equal(cdp.raw.width, 16);
  assert.equal(cdp.raw.height, 12);
  assert.equal(cdp.derivative.width, 16);
  assert.equal(cdp.derivative.height, 12);
  assert.equal(cdp.raw.role, 'raw-capture');
  assert.equal(cdp.derivative.role, 'inspection-derivative');
  assert.equal(cdp.derivative.provenance.sourceSha256, cdp.raw.sha256);
  assert.equal(Qc.validateManifest(qc.manifestFile).ok, true);
  const rawBytesBeforeDuplicate = fs.readFileSync(cdp.raw.path);
  const derivativeBytesBeforeDuplicate = fs.readFileSync(cdp.derivative.path);
  assert.throws(() => qc.recordCapture('cdp-frame', raw, {
    classification: 'synthetic-fixture',
    captureAdapter: 'cdp',
    captureMethod: 'Page.captureScreenshot',
  }), /immutable/, 'duplicate capture ids fail before any screenshot bytes are overwritten');
  assert.deepEqual(fs.readFileSync(cdp.raw.path), rawBytesBeforeDuplicate, 'duplicate capture leaves canonical raw bytes unchanged');
  assert.deepEqual(fs.readFileSync(cdp.derivative.path), derivativeBytesBeforeDuplicate, 'duplicate capture leaves derivative bytes unchanged');
  assert.deepEqual(Qc.validateManifest(qc.manifestFile).state, { captured: true, assertionsPassed: false, manuallyApproved: false });

  const external = path.join(rootDir, 'external-source.png');
  fs.copyFileSync(raw, external);
  const native = qc.recordCapture('native-frame', external, {
    viewport: { width: 16, height: 12 },
    state: 'test-copy',
    classification: 'actual-player',
    captureAdapter: 'native',
    captureMethod: 'BrowserWindow.webContents.capturePage',
  });
  assert.equal(native.raw.path, qc.rawPath('native-frame'), 'arbitrary sources are preserved under raw-captures');
  assert.deepEqual(Object.keys(cdp.provenance).sort(), Object.keys(native.provenance).sort(), 'CDP and native provenance use one interface');

  qc.recordAssertions([{ id: 'frame-dimensions', status: 'passed' }, { id: 'painted-region', status: 'passed' }]);
  qc.inspectCapture('cdp-frame', { status: 'passed', inspector: 'Contract reviewer', notes: 'Synthetic dimensions and nonuniform pixel survived the transcode.' });
  qc.inspectCapture('native-frame', { status: 'passed', inspector: 'Contract reviewer', notes: 'Native source was copied to canonical raw evidence before derivation.' });
  qc.decideCapture('cdp-frame', { status: 'approved', decidedBy: 'Contract approver', notes: 'Approved exact synthetic CDP bytes.' });
  qc.decideCapture('native-frame', { status: 'approved', decidedBy: 'Contract approver', notes: 'Approved exact native bytes.' });
  const checked = Qc.validateManifest(qc.manifestFile, { requireApproval: true, expectedRunIdentity: 'screenshot-contract-run' });
  assert.equal(checked.ok, true, checked.errors.join(', '));
  assert.equal(checked.state.manuallyApproved, true);

  fs.appendFileSync(cdp.derivative.path, 'tamper');
  const tampered = Qc.validateManifest(qc.manifestFile, { requireApproval: true });
  assert.equal(tampered.ok, false, 'derivative hash tampering invalidates approval');
  assert.equal(tampered.state.manuallyApproved, false);
  console.log('screenshot Evidence Approval contract OK');
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true });
}
