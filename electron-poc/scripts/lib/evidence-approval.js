'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const version = 'nethack-evidence-approval/v1';
const captureClassifications = Object.freeze(['actual-player', 'synthetic-fixture', 'diagnostic', 'unclassified']);
const captureAdapters = Object.freeze(['cdp', 'native', 'unknown']);
const terminalInspectionStatuses = new Set(['passed', 'rejected']);
const terminalDecisionStatuses = new Set(['approved', 'rejected']);
const assertionStatuses = new Set(['passed', 'failed']);

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function frozenClone(value) {
  return deepFreeze(clone(value));
}

function safeId(value, label = 'id') {
  const id = String(value || '').trim();
  if (!id || id.length > 160 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(id) || id.includes('..')) {
    throw new TypeError(`Evidence Approval ${label} must be a safe non-empty identifier`);
  }
  return id;
}

function requireText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new TypeError(`Evidence Approval ${label} is required`);
  return text;
}

function canonicalRoot(rootDir) {
  fs.mkdirSync(rootDir, { recursive: true });
  return fs.realpathSync(rootDir);
}

function absoluteArtifactPath(rootDir, artifactPath) {
  const absolute = path.resolve(artifactPath);
  if (absolute !== rootDir && !absolute.startsWith(`${rootDir}${path.sep}`)) {
    throw new TypeError(`Evidence artifact is outside the Verification Run root: ${artifactPath}`);
  }
  const canonical = fs.realpathSync(absolute);
  if (canonical !== absolute) throw new TypeError(`Evidence artifact must not be a symbolic link: ${artifactPath}`);
  const stat = fs.statSync(canonical);
  if (!stat.isFile()) throw new TypeError(`Evidence artifact must be a regular file: ${artifactPath}`);
  return canonical;
}

function artifactRecord(rootDir, input, role) {
  if (!input || typeof input !== 'object') throw new TypeError(`Evidence Approval ${role} artifact is required`);
  const absolute = absoluteArtifactPath(rootDir, input.path);
  const data = fs.readFileSync(absolute);
  const { path: ignoredPath, size: ignoredSize, bytes: ignoredBytes, sha256: ignoredSha, role: ignoredRole, provenance: ignoredProvenance, ...metadata } = input;
  return {
    role,
    path: absolute,
    size: data.length,
    bytes: data.length,
    sha256: sha256(data),
    ...clone(metadata),
  };
}

function verifyArtifact(rootDir, artifact, label, errors) {
  if (!artifact || typeof artifact !== 'object') {
    errors.push(`${label} artifact is required`);
    return false;
  }
  try {
    const actual = artifactRecord(rootDir, artifact, artifact.role);
    if (actual.size !== artifact.size) errors.push(`${label} size mismatch`);
    if (actual.sha256 !== artifact.sha256) errors.push(`${label} hash mismatch`);
    return actual.size === artifact.size && actual.sha256 === artifact.sha256;
  } catch (error) {
    errors.push(`${label} ${error.message}`);
    return false;
  }
}

function assertionStatus(manifest) {
  if (!manifest.assertions.length) return 'pending';
  return manifest.assertions.some((outcome) => outcome.status === 'failed') ? 'failed' : 'passed';
}

function runContent(manifest) {
  return {
    run: manifest.run,
    captures: manifest.captures.map(({ decision: ignored, ...capture }) => capture),
    assertions: manifest.assertions,
    logs: manifest.logs,
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function runContentSha256(manifest) {
  return sha256(stableJson(runContent(manifest)));
}

function decisionContentSha256(decision) {
  const { binding: ignoredBinding, ...content } = decision || {};
  return sha256(stableJson(content));
}

function createEvidenceReviewRequest(input) {
  const manifest = readManifest(input);
  const validation = validateEvidenceApproval(manifest, { expectedRunIdentity: manifest.run?.identity });
  if (!validation.ok) throw new Error(`Cannot create review request for invalid Evidence Approval: ${validation.errors.join('; ')}`);
  return deepFreeze({
    runIdentity: manifest.run.identity,
    runContentSha256: runContentSha256(manifest),
    captures: manifest.captures.map((capture) => ({
      id: capture.id,
      classification: capture.classification,
      provenance: capture.provenance,
      raw: {
        path: capture.raw.path,
        sha256: capture.raw.sha256,
        bytes: capture.raw.bytes,
      },
      derivative: {
        path: capture.derivative.path,
        sha256: capture.derivative.sha256,
        bytes: capture.derivative.bytes,
        provenance: capture.derivative.provenance,
      },
    })),
  });
}

function readManifest(input) {
  return typeof input === 'string' ? JSON.parse(fs.readFileSync(input, 'utf8')) : clone(input);
}

function validateEvidenceApproval(input, { expectedRunIdentity, requireApproval = false } = {}) {
  let manifest;
  try {
    manifest = readManifest(input);
  } catch (error) {
    return deepFreeze({ ok: false, errors: [`Evidence Approval manifest could not be read: ${error.message}`], state: { captured: false, assertionsPassed: false, manuallyApproved: false } });
  }
  const errors = [];
  if (manifest.schema !== version) errors.push(`unexpected Evidence Approval schema ${manifest.schema || '(missing)'}`);
  const identity = String(manifest.run?.identity || '');
  if (!identity) errors.push('Verification Run identity is required');
  if (expectedRunIdentity != null && identity !== String(expectedRunIdentity)) errors.push('Verification Run identity mismatch');

  let rootDir = '';
  try { rootDir = fs.realpathSync(manifest.rootDir); } catch (error) { errors.push(`Verification Run root is invalid: ${error.message}`); }
  if (!Array.isArray(manifest.captures)) errors.push('captures must be an array');
  if (!Array.isArray(manifest.assertions)) errors.push('assertions must be an array');
  if (!Array.isArray(manifest.logs)) errors.push('logs must be an array');
  const captures = Array.isArray(manifest.captures) ? manifest.captures : [];
  const assertions = Array.isArray(manifest.assertions) ? manifest.assertions : [];
  const logs = Array.isArray(manifest.logs) ? manifest.logs : [];
  const ids = new Set();
  const approvalErrors = [];

  for (const capture of captures) {
    const label = `capture ${capture?.id || '(missing id)'}`;
    if (!capture?.id || ids.has(capture.id)) errors.push(`${label} has a duplicate or missing id`);
    ids.add(capture?.id);
    if (!captureClassifications.includes(capture?.classification)) errors.push(`${label} has an unknown classification`);
    if (!captureAdapters.includes(capture?.provenance?.adapter)) errors.push(`${label} has an unknown capture adapter`);
    if (!String(capture?.provenance?.mechanism || '').trim()) errors.push(`${label} capture provenance mechanism is required`);
    const rawValid = rootDir ? verifyArtifact(rootDir, capture?.raw, `${label} raw`, errors) : false;
    if (capture?.raw?.role !== 'raw-capture') errors.push(`${label} raw role must be raw-capture`);
    const derivativeValid = rootDir ? verifyArtifact(rootDir, capture?.derivative, `${label} derivative`, errors) : false;
    if (capture?.derivative?.role !== 'inspection-derivative') errors.push(`${label} derivative role must be inspection-derivative`);
    if (capture?.derivative?.provenance?.sourceRole !== 'raw-capture') errors.push(`${label} derivative source role mismatch`);
    if (capture?.derivative?.provenance?.sourceSha256 !== capture?.raw?.sha256) errors.push(`${label} derivative source hash mismatch`);
    if (!capture?.derivative?.provenance?.transform || typeof capture.derivative.provenance.transform !== 'object') errors.push(`${label} derivative transform provenance is required`);
    if (!['pending', 'passed', 'rejected'].includes(capture?.inspection?.status)) errors.push(`${label} inspection status is invalid`);
    if (!['pending', 'approved', 'rejected'].includes(capture?.decision?.status)) errors.push(`${label} decision status is invalid`);

    if (capture?.decision?.status !== 'pending') {
      const binding = capture.decision.binding || {};
      if (binding.runIdentity !== identity) approvalErrors.push(`${label} decision run identity no longer matches`);
      if (binding.rawSha256 !== capture?.raw?.sha256) approvalErrors.push(`${label} decision raw hash no longer matches`);
      if (binding.runContentSha256 !== runContentSha256({ ...manifest, captures, assertions, logs })) approvalErrors.push(`${label} decision Verification Run content no longer matches`);
      if (binding.decisionContentSha256 !== decisionContentSha256(capture.decision)) approvalErrors.push(`${label} decision content no longer matches`);
      if (!rawValid || !derivativeValid) approvalErrors.push(`${label} decision artifacts no longer match captured bytes`);
    }
    if (capture?.decision?.status === 'approved') {
      if (capture?.inspection?.status !== 'passed') approvalErrors.push(`${label} approval requires passed inspection`);
      if (capture?.classification === 'unclassified') approvalErrors.push(`${label} approval requires structured capture classification`);
      if (capture?.provenance?.adapter === 'unknown') approvalErrors.push(`${label} approval requires structured capture provenance`);
    }
  }

  const assertionIds = new Set();
  for (const outcome of assertions) {
    if (!outcome?.id || assertionIds.has(outcome.id)) errors.push(`assertion ${outcome?.id || '(missing id)'} has a duplicate or missing id`);
    assertionIds.add(outcome?.id);
    if (!assertionStatuses.has(outcome?.status)) errors.push(`assertion ${outcome?.id || '(missing id)'} status must be passed or failed`);
  }
  const logIds = new Set();
  for (const log of logs) {
    if (!log?.id || logIds.has(log.id)) errors.push(`log ${log?.id || '(missing id)'} has a duplicate or missing id`);
    logIds.add(log?.id);
    if (rootDir) verifyArtifact(rootDir, log?.artifact, `log ${log?.id || '(missing id)'}`, errors);
    if (log?.artifact?.role !== 'verification-log') errors.push(`log ${log?.id || '(missing id)'} role must be verification-log`);
  }

  const derivedAssertionStatus = assertions.length && assertions.every((outcome) => outcome.status === 'passed') ? 'passed' : assertions.some((outcome) => outcome.status === 'failed') ? 'failed' : 'pending';
  if (captures.some((capture) => capture?.decision?.status === 'approved') && derivedAssertionStatus !== 'passed') approvalErrors.push('manual approval requires every observable assertion to pass');
  const captured = captures.length > 0;
  const manuallyApproved = captured && captures.every((capture) => capture?.decision?.status === 'approved') && approvalErrors.length === 0 && errors.length === 0 && derivedAssertionStatus === 'passed';
  if (requireApproval && !manuallyApproved) errors.push('Evidence Approval is incomplete or invalid');
  errors.push(...approvalErrors);
  return deepFreeze({
    ok: errors.length === 0,
    errors,
    runIdentity: identity,
    state: { captured, assertionsPassed: derivedAssertionStatus === 'passed', manuallyApproved },
    assertionStatus: derivedAssertionStatus,
    captureCount: captures.length,
    logCount: logs.length,
  });
}

function createEvidenceApproval({
  rootDir,
  runIdentity,
  manifestFile = path.join(rootDir, 'evidence-approval.json'),
  now = () => new Date().toISOString(),
  initialManifest = null,
} = {}) {
  if (!rootDir) throw new TypeError('Evidence Approval requires a Verification Run rootDir');
  const canonical = canonicalRoot(rootDir);
  const identity = requireText(runIdentity, 'Verification Run identity');
  const resolvedManifest = path.resolve(manifestFile);
  if (resolvedManifest !== canonical && !resolvedManifest.startsWith(`${canonical}${path.sep}`)) throw new TypeError('Evidence Approval manifest must be inside the Verification Run root');
  const manifest = initialManifest ? clone(initialManifest) : {
    schema: version,
    rootDir: canonical,
    run: { identity, startedAt: now() },
    captures: [],
    assertions: [],
    logs: [],
  };
  if (manifest.schema !== version) throw new TypeError(`Cannot open unexpected Evidence Approval schema ${manifest.schema || '(missing)'}`);
  if (path.resolve(manifest.rootDir || '') !== canonical) throw new TypeError('Evidence Approval Verification Run root does not match the manifest');
  if (manifest.run?.identity !== identity) throw new TypeError('Evidence Approval Verification Run identity does not match the manifest');
  function save() {
    if (manifest.run.identity !== identity) throw new Error('Verification Run identity is immutable');
    manifest.updatedAt = now();
    const temporary = `${resolvedManifest}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.renameSync(temporary, resolvedManifest);
    return resolvedManifest;
  }

  function recordCapture({ id, classification = 'unclassified', provenance, raw, derivative, capturedAt = now(), viewport = null, state = null } = {}) {
    const captureId = safeId(id, 'capture id');
    if (manifest.captures.some((capture) => capture.id === captureId)) throw new Error(`Capture ${captureId} is immutable within Verification Run ${identity}`);
    if (!captureClassifications.includes(classification)) throw new TypeError(`Unknown capture classification: ${classification}`);
    if (!provenance || !captureAdapters.includes(provenance.adapter)) throw new TypeError('Capture provenance adapter must be cdp, native, or unknown');
    const mechanism = requireText(provenance.mechanism, 'capture provenance mechanism');
    const rawRecord = artifactRecord(canonical, raw, 'raw-capture');
    const derivativeRecord = artifactRecord(canonical, derivative, 'inspection-derivative');
    derivativeRecord.provenance = {
      sourceRole: 'raw-capture',
      sourceSha256: rawRecord.sha256,
      transform: clone(derivative.provenance?.transform || {}),
    };
    if (!Object.keys(derivativeRecord.provenance.transform).length) throw new TypeError('Derivative transform provenance is required');
    const capture = {
      id: captureId,
      classification,
      capturedAt,
      viewport: clone(viewport),
      state: clone(state),
      provenance: { adapter: provenance.adapter, mechanism, source: clone(provenance.source || null) },
      raw: rawRecord,
      derivative: derivativeRecord,
      inspection: { status: 'pending' },
      decision: { status: 'pending' },
    };
    manifest.captures.push(capture);
    save();
    return frozenClone(capture);
  }

  function recordAssertions(outcomes) {
    if (!Array.isArray(outcomes) || !outcomes.length) throw new TypeError('Evidence Approval assertions must be a non-empty array');
    const known = new Set(manifest.assertions.map((outcome) => outcome.id));
    const additions = outcomes.map((outcome) => {
      const id = safeId(outcome?.id, 'assertion id');
      if (known.has(id)) throw new Error(`Assertion outcome ${id} is immutable within Verification Run ${identity}`);
      known.add(id);
      if (!assertionStatuses.has(outcome?.status)) throw new TypeError(`Assertion ${id} status must be passed or failed`);
      return { id, status: outcome.status, details: String(outcome.details || '') };
    });
    manifest.assertions.push(...additions);
    save();
    return frozenClone({ status: assertionStatus(manifest), outcomes: additions });
  }

  function recordLog({ id, path: logPath, classification = 'verification' } = {}) {
    const logId = safeId(id, 'log id');
    if (manifest.logs.some((log) => log.id === logId)) throw new Error(`Log ${logId} is immutable within Verification Run ${identity}`);
    const log = { id: logId, classification: requireText(classification, 'log classification'), artifact: artifactRecord(canonical, { path: logPath }, 'verification-log') };
    manifest.logs.push(log);
    save();
    return frozenClone(log);
  }

  function inspectCapture(id, { status, inspector, notes } = {}) {
    const capture = manifest.captures.find((entry) => entry.id === safeId(id, 'capture id'));
    if (!capture) throw new Error(`Unknown capture ${id}`);
    if (capture.inspection.status !== 'pending') throw new Error(`Capture ${capture.id} inspection is immutable once ${capture.inspection.status}`);
    if (!terminalInspectionStatuses.has(status)) throw new TypeError('Capture inspection status must be passed or rejected');
    capture.inspection = { status, inspector: requireText(inspector, 'inspector'), inspectedAt: now(), notes: requireText(notes, 'inspection notes') };
    save();
    return frozenClone(capture);
  }

  function decideCapture(id, { status, decidedBy, notes } = {}) {
    const capture = manifest.captures.find((entry) => entry.id === safeId(id, 'capture id'));
    if (!capture) throw new Error(`Unknown capture ${id}`);
    if (capture.decision.status !== 'pending') throw new Error(`Capture ${capture.id} decision is immutable once ${capture.decision.status}`);
    if (!terminalDecisionStatuses.has(status)) throw new TypeError('Evidence Approval decision must be approved or rejected');
    if (status === 'approved') {
      const checked = validateEvidenceApproval(manifest, { expectedRunIdentity: identity });
      if (!checked.ok) throw new Error(`Evidence Approval cannot approve invalid evidence: ${checked.errors.join('; ')}`);
      if (assertionStatus(manifest) !== 'passed') throw new Error('Evidence Approval requires every observable assertion to pass');
      if (capture.inspection.status !== 'passed') throw new Error(`Evidence Approval requires passed inspection, not ${capture.inspection.status}`);
      if (capture.classification === 'unclassified') throw new Error('Evidence Approval requires structured capture classification');
      if (capture.provenance.adapter === 'unknown') throw new Error('Evidence Approval requires structured capture provenance');
    }
    const decision = {
      status,
      decidedBy: requireText(decidedBy, 'decision maker'),
      decidedAt: now(),
      notes: requireText(notes, 'decision notes'),
      binding: {
        runIdentity: identity,
        rawSha256: capture.raw.sha256,
        runContentSha256: runContentSha256(manifest),
      },
    };
    decision.binding.decisionContentSha256 = decisionContentSha256(decision);
    capture.decision = decision;
    save();
    return frozenClone(capture);
  }

  function snapshot() {
    return frozenClone(manifest);
  }

  save();
  return Object.freeze({
    version,
    runIdentity: identity,
    rootDir: canonical,
    manifestFile: resolvedManifest,
    recordCapture,
    recordAssertions,
    recordLog,
    inspectCapture,
    decideCapture,
    snapshot,
  });
}

function openEvidenceApproval({ manifestFile, expectedRunIdentity, now = () => new Date().toISOString() } = {}) {
  if (!manifestFile) throw new TypeError('Opening Evidence Approval requires manifestFile');
  const resolvedManifest = path.resolve(manifestFile);
  const manifest = readManifest(resolvedManifest);
  const validation = validateEvidenceApproval(manifest, { expectedRunIdentity });
  if (!validation.ok) throw new Error(`Cannot open invalid Evidence Approval: ${validation.errors.join('; ')}`);
  return createEvidenceApproval({
    rootDir: manifest.rootDir,
    runIdentity: manifest.run.identity,
    manifestFile: resolvedManifest,
    now,
    initialManifest: manifest,
  });
}

function applyEvidenceReview(approval, input) {
  if (!approval?.snapshot || !approval?.inspectCapture || !approval?.decideCapture) {
    throw new TypeError('Applying Evidence Approval review requires an approval session');
  }
  const review = readManifest(input);
  const snapshot = approval.snapshot();
  const current = validateEvidenceApproval(snapshot, { expectedRunIdentity: snapshot.run.identity });
  const request = createEvidenceReviewRequest(snapshot);
  if (!current.ok) throw new Error(`Cannot review invalid Evidence Approval: ${current.errors.join('; ')}`);
  if (snapshot.captures.some((capture) => capture.inspection?.status !== 'pending' || capture.decision?.status !== 'pending')) {
    throw new Error('Evidence review can only be applied once to pending captures');
  }
  if (review.runIdentity !== snapshot.run.identity) throw new Error('Evidence review Verification Run identity mismatch');
  if (review.runContentSha256 !== request.runContentSha256) throw new Error('Evidence review Verification Run content hash mismatch');
  if (!Array.isArray(review.captures)) throw new TypeError('Evidence review captures must be an array');
  const expectedIds = snapshot.captures.map((capture) => capture.id).sort();
  const reviewIds = review.captures.map((capture) => safeId(capture?.id, 'review capture id')).sort();
  if (new Set(reviewIds).size !== reviewIds.length || stableJson(expectedIds) !== stableJson(reviewIds)) {
    throw new Error('Evidence review must contain exactly one decision for every capture in the Verification Run');
  }
  const byId = new Map(review.captures.map((capture) => [capture.id, capture]));
  for (const id of expectedIds) {
    const entry = byId.get(id);
    if (!terminalInspectionStatuses.has(entry?.inspection?.status)) throw new TypeError(`Evidence review ${id} inspection status must be passed or rejected`);
    requireText(entry.inspection.inspector, `review ${id} inspector`);
    requireText(entry.inspection.notes, `review ${id} inspection notes`);
    if (!terminalDecisionStatuses.has(entry?.decision?.status)) throw new TypeError(`Evidence review ${id} decision status must be approved or rejected`);
    requireText(entry.decision.decidedBy, `review ${id} decision maker`);
    requireText(entry.decision.notes, `review ${id} decision notes`);
    const expected = snapshot.captures.find((capture) => capture.id === id);
    if (entry.rawSha256 !== expected.raw.sha256) throw new Error(`Evidence review ${id} raw hash mismatch`);
    if (entry.decision.status === 'approved' && entry.inspection.status !== 'passed') {
      throw new Error(`Evidence review ${id} cannot approve a rejected inspection`);
    }
  }
  if (review.captures.some((capture) => capture.decision.status === 'approved') && !current.state.assertionsPassed) {
    throw new Error('Evidence review cannot approve a Verification Run with failed or pending assertions');
  }
  for (const id of expectedIds) approval.inspectCapture(id, byId.get(id).inspection);
  for (const id of expectedIds) approval.decideCapture(id, byId.get(id).decision);
  return approval.snapshot();
}

function renderEvidenceReport(input) {
  const manifest = readManifest(input);
  const validation = validateEvidenceApproval(manifest);
  const lines = [
    '# Evidence Approval',
    '',
    `Verification Run: ${manifest.run?.identity || '(missing)'}`,
    `Captured: ${validation.state.captured ? 'YES' : 'NO'}`,
    `Assertions passed: ${validation.state.assertionsPassed ? 'YES' : 'NO'}`,
    `Manually approved: ${validation.state.manuallyApproved ? 'YES' : 'NO'}`,
    '',
    '## Captures',
  ];
  for (const capture of manifest.captures || []) {
    lines.push(`- ${capture.id}: ${capture.classification}; ${capture.provenance?.adapter || 'unknown'} via ${capture.provenance?.mechanism || '(missing)'}`);
    lines.push(`  - raw-capture sha256 ${capture.raw?.sha256 || '(missing)'}`);
    lines.push(`  - inspection-derivative sha256 ${capture.derivative?.sha256 || '(missing)'} from ${capture.derivative?.provenance?.sourceSha256 || '(missing)'}`);
    lines.push(`  - inspection ${capture.inspection?.status || 'pending'}; decision ${capture.decision?.status || 'pending'}`);
  }
  lines.push('', '## Assertions');
  for (const outcome of manifest.assertions || []) lines.push(`- ${outcome.status.toUpperCase()} ${outcome.id}${outcome.details ? `: ${outcome.details}` : ''}`);
  lines.push('', '## Logs');
  for (const log of manifest.logs || []) lines.push(`- ${log.id}: sha256 ${log.artifact?.sha256 || '(missing)'}`);
  lines.push('', '## Validation', validation.ok ? 'VALID' : 'INVALID');
  for (const error of validation.errors) lines.push(`- ${error}`);
  return `${lines.join('\n')}\n`;
}

function writeEvidenceReport(input, outputFile) {
  const manifest = readManifest(input);
  const target = outputFile || path.join(manifest.rootDir, 'evidence-approval.md');
  fs.writeFileSync(target, renderEvidenceReport(manifest));
  return path.resolve(target);
}

module.exports = Object.freeze({
  version,
  createEvidenceApproval,
  openEvidenceApproval,
  createEvidenceReviewRequest,
  applyEvidenceReview,
  validateEvidenceApproval,
  renderEvidenceReport,
  writeEvidenceReport,
});
