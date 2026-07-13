'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const EvidenceManifest = require('./lib/evidence-manifest');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nethack-evidence-manifest-'));
try {
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(root, 'z-last.txt'), 'last\n');
  fs.writeFileSync(path.join(root, 'a-first.txt'), 'first\n');
  fs.writeFileSync(path.join(root, 'nested/middle.txt'), 'middle\n');
  const manifest = EvidenceManifest.createManifest({
    schema: 'nethack-evidence-manifest-contract-test/v1',
    root,
    relativePaths: ['z-last.txt', 'nested/middle.txt', 'a-first.txt'],
  });
  assert.deepEqual(manifest.files.map((record) => record.path), ['a-first.txt', 'nested/middle.txt', 'z-last.txt'], 'generation sorts records before manifest serialization');
  assert.equal(manifest.aggregateAlgorithm, 'sha256 of sorted path\\0size\\0sha256\\n records');

  // Independent implementation of the algorithm declared in the serialized schema.
  const serialized = JSON.parse(JSON.stringify(manifest));
  const independentlySorted = [...serialized.files].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  const independentlySerializedRecords = independentlySorted.map((record) => `${record.path}\0${record.size}\0${record.sha256}\n`).join('');
  const independentlyRecomputed = crypto.createHash('sha256').update(independentlySerializedRecords).digest('hex');
  assert.equal(independentlyRecomputed, serialized.aggregateSha256, 'declared sorted-path schema independently reproduces the published aggregate');
  assert.equal(EvidenceManifest.aggregateRecords([...serialized.files].reverse()), serialized.aggregateSha256, 'aggregate computation sorts permuted input records before hashing');
  assert.equal(EvidenceManifest.verifyManifest(serialized, root, { exactTree: true }).ok, true, 'verification reproduces every file and the exact tree');

  const unsorted = { ...serialized, files: [...serialized.files].reverse() };
  const unsortedVerification = EvidenceManifest.verifyManifest(unsorted, root, { exactTree: true });
  assert.equal(unsortedVerification.ok, false, 'verification rejects a manifest whose serialization order contradicts its sorted-path declaration');
  assert(unsortedVerification.failures.some((failure) => failure.reason === 'manifest files are not sorted by path'));

  assert.throws(() => EvidenceManifest.createManifest({ schema: 'duplicate-generation/v1', root, relativePaths: ['a-first.txt', 'a-first.txt'] }), /unique/, 'generation rejects duplicate input paths rather than silently deduplicating');
  const duplicate = JSON.parse(JSON.stringify(serialized));
  duplicate.files.splice(1, 0, { ...duplicate.files[0] });
  duplicate.fileCount = duplicate.files.length;
  duplicate.aggregateSha256 = EvidenceManifest.aggregateRecords(duplicate.files);
  assert(EvidenceManifest.verifyManifest(duplicate, root, { exactTree: true }).failures.some((failure) => failure.reason === 'manifest contains duplicate paths'), 'verification rejects duplicate physical file records');

  for (const escaped of ['../outside.txt', '/tmp/outside.txt', 'nested/../a-first.txt', './a-first.txt', 'nested\\middle.txt']) {
    assert.throws(() => EvidenceManifest.recordsForPaths(root, [escaped]), /canonical|root-relative|escapes/, `generation rejects non-canonical or escaping path ${escaped}`);
  }
  const outside = path.join(path.dirname(root), `${path.basename(root)}-outside.txt`);
  fs.writeFileSync(outside, 'outside\n');
  fs.symlinkSync(outside, path.join(root, 'outside-link.txt'));
  assert.throws(() => EvidenceManifest.recordsForPaths(root, ['outside-link.txt']), /outside root|regular file/, 'generation rejects a symlink escaping the declared root');
  fs.unlinkSync(path.join(root, 'outside-link.txt'));
  fs.unlinkSync(outside);

  const tampered = JSON.parse(JSON.stringify(serialized));
  tampered.files[0].sha256 = '0'.repeat(64);
  assert.equal(EvidenceManifest.verifyManifest(tampered, root).ok, false, 'verification rejects altered per-file records and aggregates');
  console.log('evidence manifest sorted-path generation and independent schema recomputation OK');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
