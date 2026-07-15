'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const EvidenceApproval = require('./lib/evidence-approval');

const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nethack-evidence-approval-'));

function fixtureRun(name) {
  const rootDir = path.join(parent, name);
  fs.mkdirSync(rootDir, { recursive: true });
  const approval = EvidenceApproval.createEvidenceApproval({ rootDir, runIdentity: `${name}-run` });
  return { rootDir, approval };
}

function artifact(rootDir, name, bytes) {
  const file = path.join(rootDir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return file;
}

function capture(approval, rootDir, id, adapter) {
  const raw = artifact(rootDir, `raw-captures/${id}.png`, `raw:${id}`);
  const derivative = artifact(rootDir, `view-safe/${id}.bmp`, `derivative:${id}`);
  return approval.recordCapture({
    id,
    classification: 'actual-player',
    provenance: { adapter, mechanism: adapter === 'cdp' ? 'Page.captureScreenshot' : 'BrowserWindow.webContents.capturePage' },
    raw: { path: raw },
    derivative: { path: derivative, provenance: { transform: { implementation: 'fixture-copy', format: 'BMP', scale: 1 } } },
  });
}

try {
  const primary = fixtureRun('primary');
  const cdp = capture(primary.approval, primary.rootDir, 'cdp-frame', 'cdp');
  const native = capture(primary.approval, primary.rootDir, 'native-frame', 'native');
  const cdpShape = Object.keys(cdp.provenance).sort();
  const nativeShape = Object.keys(native.provenance).sort();
  assert.deepEqual(cdpShape, nativeShape, 'CDP and native capture provenance satisfy the same interface');
  assert.equal(cdp.provenance.adapter, 'cdp');
  assert.equal(native.provenance.adapter, 'native');
  for (const entry of [cdp, native]) {
    assert.equal(entry.raw.role, 'raw-capture');
    assert.equal(entry.derivative.role, 'inspection-derivative');
    assert.equal(entry.derivative.provenance.sourceRole, 'raw-capture');
    assert.equal(entry.derivative.provenance.sourceSha256, entry.raw.sha256, 'derivative provenance binds the exact raw bytes');
    assert.notEqual(entry.derivative.sha256, entry.raw.sha256, 'raw and derivative artifacts remain distinct records');
  }
  const logPath = artifact(primary.rootDir, 'logs/electron.log', 'renderer ready\n');
  const log = primary.approval.recordLog({ id: 'electron', path: logPath, classification: 'electron-output' });
  assert.equal(log.artifact.role, 'verification-log');
  primary.approval.recordAssertions([
    { id: 'renderer-ready', status: 'passed' },
    { id: 'visible-command-result', status: 'passed' },
  ]);
  const reviewRequest = EvidenceApproval.createEvidenceReviewRequest(primary.approval.manifestFile);
  assert.equal(Object.isFrozen(reviewRequest), true, 'review request is immutable');
  const externalReview = {
    runIdentity: reviewRequest.runIdentity,
    runContentSha256: reviewRequest.runContentSha256,
    captures: reviewRequest.captures.map((entry) => ({
      id: entry.id,
      rawSha256: entry.raw.sha256,
      inspection: { status: 'passed', inspector: 'External reviewer', notes: `Opened and inspected exact raw bytes ${entry.raw.sha256}.` },
      decision: { status: 'approved', decidedBy: 'External approver', notes: `Accepted exact ${entry.provenance.adapter} capture bytes.` },
    })),
  };
  EvidenceApproval.applyEvidenceReview(primary.approval, externalReview);

  const accepted = EvidenceApproval.validateEvidenceApproval(primary.approval.manifestFile, { expectedRunIdentity: 'primary-run', requireApproval: true });
  assert.equal(accepted.ok, true, accepted.errors.join('\n'));
  assert.deepEqual(accepted.state, { captured: true, assertionsPassed: true, manuallyApproved: true });
  const report = EvidenceApproval.renderEvidenceReport(primary.approval.manifestFile);
  assert.match(report, /Captured: YES/);
  assert.match(report, /Assertions passed: YES/);
  assert.match(report, /Manually approved: YES/);
  assert.match(report, /raw-capture sha256/);
  assert.match(report, /inspection-derivative sha256/);
  const reportPath = EvidenceApproval.writeEvidenceReport(primary.approval.manifestFile);
  assert.equal(fs.readFileSync(reportPath, 'utf8'), report, 'written report is rendered from the same structured approval manifest');

  fs.writeFileSync(cdp.raw.path, 'overwritten raw bytes');
  const overwritten = EvidenceApproval.validateEvidenceApproval(primary.approval.manifestFile, { requireApproval: true });
  assert.equal(overwritten.ok, false, 'overwriting a raw capture invalidates approval');
  assert.equal(overwritten.state.manuallyApproved, false);
  assert.match(overwritten.errors.join('\n'), /hash mismatch|no longer match captured bytes/);
  fs.writeFileSync(cdp.raw.path, 'raw:cdp-frame');
  assert.equal(EvidenceApproval.validateEvidenceApproval(primary.approval.manifestFile, { requireApproval: true }).ok, true, 'restoring exact approved bytes restores the hash binding');

  const changedDecision = JSON.parse(JSON.stringify(primary.approval.snapshot()));
  changedDecision.captures[0].decision.notes = 'Altered approval notes.';
  const changedDecisionResult = EvidenceApproval.validateEvidenceApproval(changedDecision, { requireApproval: true });
  assert.equal(changedDecisionResult.state.manuallyApproved, false, 'changed approval content invalidates immutable decision state');
  assert.match(changedDecisionResult.errors.join('\n'), /decision content no longer matches/);

  const changedIdentity = JSON.parse(JSON.stringify(primary.approval.snapshot()));
  changedIdentity.run.identity = 'different-run';
  const identityResult = EvidenceApproval.validateEvidenceApproval(changedIdentity, { requireApproval: true });
  assert.equal(identityResult.state.manuallyApproved, false, 'changed Verification Run identity invalidates approval');
  assert.match(identityResult.errors.join('\n'), /run identity no longer matches|Run content no longer matches/);

  const failed = fixtureRun('failed-assertion');
  capture(failed.approval, failed.rootDir, 'failed-frame', 'cdp');
  failed.approval.recordAssertions([{ id: 'visible-result', status: 'failed', details: 'Expected result was absent.' }]);
  failed.approval.inspectCapture('failed-frame', { status: 'passed', inspector: 'Reviewer', notes: 'Frame itself is readable.' });
  assert.throws(() => failed.approval.decideCapture('failed-frame', { status: 'approved', decidedBy: 'Approver', notes: 'Must not pass.' }), /every observable assertion to pass/);
  assert.throws(() => failed.approval.recordAssertions([{ id: 'visible-result', status: 'passed' }]), /immutable/, 'a failed assertion cannot be rewritten as passed');
  assert.equal(EvidenceApproval.validateEvidenceApproval(failed.approval.manifestFile).state.assertionsPassed, false);

  const mismatchedReview = fixtureRun('mismatched-external-review');
  capture(mismatchedReview.approval, mismatchedReview.rootDir, 'hash-bound-frame', 'cdp');
  mismatchedReview.approval.recordAssertions([{ id: 'visible-result', status: 'passed' }]);
  const mismatchRequest = EvidenceApproval.createEvidenceReviewRequest(mismatchedReview.approval.manifestFile);
  const mismatchInput = {
    runIdentity: mismatchRequest.runIdentity,
    runContentSha256: mismatchRequest.runContentSha256,
    captures: [{
      id: 'hash-bound-frame',
      rawSha256: '0'.repeat(64),
      inspection: { status: 'passed', inspector: 'External reviewer', notes: 'Inspected a different file.' },
      decision: { status: 'approved', decidedBy: 'External approver', notes: 'Must not apply.' },
    }],
  };
  assert.throws(() => EvidenceApproval.applyEvidenceReview(mismatchedReview.approval, mismatchInput), /raw hash mismatch/);
  assert.equal(mismatchedReview.approval.snapshot().captures[0].inspection.status, 'pending', 'hash mismatch fails before mutating approval state');
  mismatchInput.captures[0].rawSha256 = mismatchRequest.captures[0].raw.sha256;
  mismatchInput.runContentSha256 = 'f'.repeat(64);
  assert.throws(() => EvidenceApproval.applyEvidenceReview(mismatchedReview.approval, mismatchInput), /content hash mismatch/);

  const pending = fixtureRun('pending-inspection');
  capture(pending.approval, pending.rootDir, 'pending-frame', 'native');
  pending.approval.recordAssertions([{ id: 'visible-result', status: 'passed' }]);
  assert.throws(() => pending.approval.decideCapture('pending-frame', { status: 'approved', decidedBy: 'Approver', notes: 'Must not pass.' }), /passed inspection, not pending/);

  const rejected = fixtureRun('rejected-inspection');
  capture(rejected.approval, rejected.rootDir, 'rejected-frame', 'native');
  rejected.approval.recordAssertions([{ id: 'visible-result', status: 'passed' }]);
  rejected.approval.inspectCapture('rejected-frame', { status: 'rejected', inspector: 'Reviewer', notes: 'Primary control is clipped.' });
  assert.throws(() => rejected.approval.decideCapture('rejected-frame', { status: 'approved', decidedBy: 'Approver', notes: 'Must not pass.' }), /passed inspection, not rejected/);
  rejected.approval.decideCapture('rejected-frame', { status: 'rejected', decidedBy: 'Approver', notes: 'Rejected exact native bytes.' });
  assert.equal(EvidenceApproval.validateEvidenceApproval(rejected.approval.manifestFile).state.manuallyApproved, false);

  const pathProse = fixtureRun('approved-by-path-prohibited');
  pathProse.approval.recordCapture({
    id: 'approved-final-frame',
    classification: 'unclassified',
    provenance: { adapter: 'unknown', mechanism: 'manually approved native final capture' },
    raw: { path: artifact(pathProse.rootDir, 'approved/final-approved.png', 'raw path prose') },
    derivative: { path: artifact(pathProse.rootDir, 'accepted/final-approved.bmp', 'derivative path prose'), provenance: { transform: { format: 'BMP', scale: 1 } } },
  });
  pathProse.approval.recordAssertions([{ id: 'approved-result', status: 'passed', details: 'PASS accepted approved' }]);
  pathProse.approval.inspectCapture('approved-final-frame', { status: 'passed', inspector: 'Reviewer', notes: 'Approved-looking prose is not classification.' });
  assert.throws(() => pathProse.approval.decideCapture('approved-final-frame', { status: 'approved', decidedBy: 'Approver', notes: 'Approved final accepted PASS.' }), /structured capture classification/, 'paths and approval-like prose cannot substitute for structured classification');

  console.log('evidence approval contract OK');
} finally {
  fs.rmSync(parent, { recursive: true, force: true });
}
