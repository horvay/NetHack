'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const EvidenceApproval = require('./lib/evidence-approval');
const Harness = require('./lib/electron-test-harness');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');
const reviewerTimeoutMs = Number(process.env.NH_EVIDENCE_REVIEWER_TIMEOUT_MS || 300000);
const focusedContracts = Object.freeze([
  'electron-test-harness-contract-test.js',
  'evidence-manifest-contract-test.js',
  'screenshot-manifest-test.js',
  'game-view-transfer-transaction-test.js',
  'prompt-menu-lifecycle-test.js',
  'command-transaction-lifecycle-test.js',
  'transfer-transaction-lifecycle-test.js',
  'ground-transfer-owner-lifecycle-test.js',
  'equipment-snapshot-test.js',
]);
const representativeScenarios = Object.freeze([
  Object.freeze({ id: 'locked-container-rejection-unlock-open', script: 'real-scenario-locked-container-direct-open-mcp-test.js' }),
  Object.freeze({ id: 'direct-container-select-all', script: 'real-scenario-container-wand-corpse-direct-mcp-test.js' }),
  Object.freeze({ id: 'direct-ground-transfer', script: 'real-scenario-ground-pickup-mcp-test.js', env: Object.freeze({ NH_FINAL_PROOF_DIRECT_TRANSFER: '1' }) }),
  Object.freeze({ id: 'classic-ground-transfer', script: 'real-ground-pickup-transfer-panel-mcp-test.js', env: Object.freeze({ NH_FINAL_PROOF_PICKUP_ONLY: '1' }) }),
  Object.freeze({ id: 'canonical-gem-inventory-owner', script: 'real-canonical-gem-names-mcp-test.js' }),
  Object.freeze({ id: 'direct-item-equipment-owner', script: 'real-direct-equipment-change-mcp-test.js' }),
  Object.freeze({ id: 'direct-terrain-context-action', script: 'real-scenario-terrain-drink-mcp-test.js' }),
]);

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function configuredReviewer() {
  const configured = String(process.env.NH_EVIDENCE_REVIEWER || '').trim();
  if (!configured) throw new Error('Final proof requires an explicitly configured external NH_EVIDENCE_REVIEWER executable');
  const resolved = fs.realpathSync(path.resolve(configured));
  if (inside(repoRoot, resolved)) throw new Error('NH_EVIDENCE_REVIEWER must be external to the repository; repository hardcoded approval is prohibited');
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || (stat.mode & 0o111) === 0) throw new Error('NH_EVIDENCE_REVIEWER must be an executable regular file');
  return resolved;
}

function run(command, args, { env = process.env, label, timeout = 300000, echo = true } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout,
  });
  if (echo && result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw new Error(`${label || command} failed to execute: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label || command} exited ${result.status}${result.signal ? ` (${result.signal})` : ''}`);
  return result.stdout || '';
}

function captureResults(stdout, script) {
  const matches = [...stdout.matchAll(/:\s+CAPTURED\s+(\S+)\s+([^\n]+evidence-approval\.json)\s*$/gm)];
  if (!matches.length) throw new Error(`${script} did not emit a structured CAPTURED handoff`);
  return Object.freeze(matches.map((match) => Object.freeze({ runIdentity: match[1], manifestFile: path.resolve(match[2].trim()) })));
}

function assertCaptured(run, scenario, identities, roots) {
  if (!fs.existsSync(run.manifestFile)) throw new Error(`${scenario.id} did not retain its Evidence Approval manifest`);
  const manifest = JSON.parse(fs.readFileSync(run.manifestFile, 'utf8'));
  const outputRoot = fs.realpathSync(manifest.rootDir);
  const expectedParent = path.join(root, 'test-output', 'verification-runs');
  if (manifest.run?.identity !== run.runIdentity) throw new Error(`${scenario.id} CAPTURED identity does not match its manifest`);
  if (path.resolve(run.manifestFile) !== path.join(outputRoot, 'evidence-approval.json')) throw new Error(`${scenario.id} manifest is not canonical within its Verification Run root`);
  if (!inside(expectedParent, outputRoot)) throw new Error(`${scenario.id} output root is outside the canonical Verification Run directory`);
  if (path.basename(outputRoot) !== run.runIdentity) throw new Error(`${scenario.id} output root is not bound to its run identity`);
  if (identities.has(run.runIdentity) || roots.has(outputRoot)) throw new Error(`${scenario.id} reused a Verification Run identity or output root`);
  identities.add(run.runIdentity);
  roots.add(outputRoot);
  const validation = Harness.screenshotQc.validateManifest(run.manifestFile, { expectedRunIdentity: run.runIdentity, requireApproval: false });
  if (!validation.ok) throw new Error(`${scenario.id} CAPTURED evidence is invalid: ${validation.errors.join('; ')}`);
  if (!validation.state.captured || !validation.state.assertionsPassed) throw new Error(`${scenario.id} cannot proceed to review without captures and passed assertions`);
  if (validation.state.manuallyApproved) throw new Error(`${scenario.id} capture phase unexpectedly bypassed explicit external review`);
  return Object.freeze({ manifest, outputRoot });
}

function externalReview(reviewer, scenario, run) {
  const manifestSha256 = sha256File(run.manifestFile);
  const request = EvidenceApproval.createEvidenceReviewRequest(run.manifestFile);
  const reviewerInput = Object.freeze({
    manifestFile: run.manifestFile,
    manifestSha256,
    runIdentity: request.runIdentity,
    runContentSha256: request.runContentSha256,
    captures: request.captures,
  });
  const stdout = runProcessReviewer(reviewer, scenario, run, reviewerInput);
  let review;
  try {
    review = JSON.parse(stdout.trim());
  } catch (error) {
    throw new Error(`${scenario.id} external reviewer did not emit one JSON review object: ${error.message}`);
  }
  if (sha256File(run.manifestFile) !== manifestSha256) throw new Error(`${scenario.id} external reviewer mutated the immutable capture manifest`);
  const afterReviewer = Harness.screenshotQc.validateManifest(run.manifestFile, { expectedRunIdentity: run.runIdentity, requireApproval: false });
  if (!afterReviewer.ok || !afterReviewer.state.assertionsPassed) throw new Error(`${scenario.id} evidence changed or assertions failed during external review: ${afterReviewer.errors.join('; ')}`);
  if (review.manifestFile !== run.manifestFile || review.manifestSha256 !== manifestSha256) throw new Error(`${scenario.id} external review is not bound to the exact manifest path and bytes`);
  if (review.runIdentity !== request.runIdentity || review.runContentSha256 !== request.runContentSha256) throw new Error(`${scenario.id} external review is not bound to the Verification Run content`);
  if (!Array.isArray(review.captures) || review.captures.length !== request.captures.length) throw new Error(`${scenario.id} external review must cover every capture`);
  const expected = new Map(request.captures.map((capture) => [capture.id, capture.raw.sha256]));
  for (const entry of review.captures) {
    if (!expected.has(entry?.id) || expected.get(entry.id) !== entry.rawSha256) throw new Error(`${scenario.id} external review raw hash mismatch for ${entry?.id || '(missing id)'}`);
    if (entry.inspection?.status !== 'passed' || !String(entry.inspection?.inspector || '').trim() || !String(entry.inspection?.notes || '').trim()) throw new Error(`${scenario.id} external reviewer must attach a passed inspection and explicit notes for ${entry.id}`);
    if (entry.decision?.status !== 'approved' || !String(entry.decision?.decidedBy || '').trim() || !String(entry.decision?.notes || '').trim()) throw new Error(`${scenario.id} external reviewer did not explicitly approve ${entry.id}`);
  }
  return review;
}

function runProcessReviewer(reviewer, scenario, verificationRun, request) {
  const result = spawnSync(reviewer, [verificationRun.manifestFile, JSON.stringify(request)], {
    cwd: os.tmpdir(),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: reviewerTimeoutMs,
  });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw new Error(`${scenario.id} external reviewer failed to execute: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${scenario.id} external reviewer rejected or failed with exit ${result.status}`);
  return result.stdout || '';
}

function approveScenario(scenario, captured, review) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nethack-external-review-'));
  const reviewFile = path.join(temporary, 'review.json');
  try {
    fs.writeFileSync(reviewFile, `${JSON.stringify(review, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    const stdout = run(process.execPath, [path.join('scripts', scenario.script), '--review', path.dirname(captured.manifestFile), reviewFile], {
      label: `${scenario.id} approval`,
      timeout: 120000,
    });
    const approvalPattern = new RegExp(`:\\s+APPROVED\\s+${escapeRegex(captured.runIdentity)}\\s+${escapeRegex(captured.manifestFile)}\\s*$`, 'm');
    if (!approvalPattern.test(stdout)) throw new Error(`${scenario.id} did not emit the expected APPROVED terminal handoff`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  const validation = Harness.screenshotQc.validateManifest(captured.manifestFile, { expectedRunIdentity: captured.runIdentity, requireApproval: true });
  if (!validation.ok || !validation.state.manuallyApproved) throw new Error(`${scenario.id} terminal Evidence Approval is invalid: ${validation.errors.join('; ')}`);
  const report = EvidenceApproval.writeEvidenceReport(captured.manifestFile);
  return Object.freeze({
    scenario: scenario.id,
    runIdentity: captured.runIdentity,
    outputRoot: path.dirname(captured.manifestFile),
    manifestFile: captured.manifestFile,
    report,
    captures: EvidenceApproval.createEvidenceReviewRequest(captured.manifestFile).captures.map((capture) => Object.freeze({ id: capture.id, raw: capture.raw.path, sha256: capture.raw.sha256 })),
  });
}

function main() {
  const reviewer = configuredReviewer();
  for (const contract of focusedContracts) run(process.execPath, [path.join('scripts', contract)], { label: contract, timeout: 120000 });
  run('npm', ['run', 'build:shim:test-fixtures'], { label: 'fixture shim build', timeout: 1200000 });

  const identities = new Set();
  const roots = new Set();
  const approvals = [];
  for (const scenario of representativeScenarios) {
    const locksBefore = new Set(Harness.playgroundLockFiles({ root }).map((lock) => lock.file));
    const stdout = run(process.execPath, [path.join('scripts', scenario.script)], {
      env: { ...process.env, NH_ELECTRON_TEST_FIXTURES: '1', ...(scenario.env || {}) },
      label: scenario.id,
      timeout: 300000,
    });
    const locksAfter = Harness.playgroundLockFiles({ root }).filter((lock) => !locksBefore.has(lock.file));
    if (locksAfter.length) throw new Error(`${scenario.id} left playground locks after teardown: ${locksAfter.map((lock) => lock.name).join(', ')}`);
    const capturedRuns = captureResults(stdout, scenario.script);
    for (const [index, captured] of capturedRuns.entries()) {
      const instance = capturedRuns.length === 1 ? scenario : Object.freeze({ ...scenario, id: `${scenario.id}-${index + 1}` });
      assertCaptured(captured, instance, identities, roots);
      const review = externalReview(reviewer, instance, captured);
      approvals.push(approveScenario(instance, captured, review));
    }
  }

  process.stdout.write(`FINAL VERIFICATION PROOF APPROVED\n${JSON.stringify({ approvals }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error(error.stack || error);
  process.exit(1);
}
