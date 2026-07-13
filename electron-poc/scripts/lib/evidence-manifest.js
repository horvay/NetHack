'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const aggregateAlgorithm = 'sha256 of sorted path\\0size\\0sha256\\n records';
const comparePath = (left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

function safeManifestPath(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\0') || relativePath.includes('\\') || path.posix.isAbsolute(relativePath) || path.posix.normalize(relativePath) !== relativePath || relativePath === '..' || relativePath.startsWith('../')) {
    throw new TypeError(`manifest path must be canonical and root-relative: ${String(relativePath)}`);
  }
  const canonicalRoot = fs.realpathSync(root);
  const absolute = path.resolve(canonicalRoot, ...relativePath.split('/'));
  if (absolute !== canonicalRoot && !absolute.startsWith(`${canonicalRoot}${path.sep}`)) throw new TypeError(`manifest path escapes root: ${relativePath}`);
  const canonicalTarget = fs.realpathSync(absolute);
  if (canonicalTarget !== canonicalRoot && !canonicalTarget.startsWith(`${canonicalRoot}${path.sep}`)) throw new TypeError(`manifest path resolves outside root: ${relativePath}`);
  return absolute;
}

function fileRecord(root, relativePath) {
  const absolute = safeManifestPath(root, relativePath);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile()) throw new TypeError(`manifest path must identify a regular file: ${relativePath}`);
  const data = fs.readFileSync(absolute);
  return Object.freeze({ path: relativePath, size: data.length, sha256: sha256(data) });
}

function recordsForPaths(root, relativePaths) {
  const unique = [...new Set(relativePaths)];
  if (unique.length !== relativePaths.length) throw new TypeError('manifest generation paths must be unique');
  return Object.freeze(unique.map((relativePath) => fileRecord(root, relativePath)).sort(comparePath));
}

function walkFilePaths(root, directory = root, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new TypeError(`evidence trees must not contain symbolic links: ${path.relative(root, absolute)}`);
    if (entry.isDirectory()) walkFilePaths(root, absolute, output);
    else if (entry.isFile()) output.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return output;
}

function aggregateRecords(records) {
  const sorted = [...records].sort(comparePath);
  return sha256(sorted.map((record) => `${record.path}\0${record.size}\0${record.sha256}\n`).join(''));
}

function createManifest({ schema, root, relativePaths = walkFilePaths(root), metadata = {} }) {
  const files = recordsForPaths(root, relativePaths);
  return {
    schema,
    ...metadata,
    root,
    fileCount: files.length,
    aggregateAlgorithm,
    aggregateSha256: aggregateRecords(files),
    files,
  };
}

function verifyManifest(manifest, root = manifest.root, { exactTree = false } = {}) {
  const failures = [];
  if (!manifest || !Array.isArray(manifest.files)) return { fileCount: 0, actualAggregateSha256: aggregateRecords([]), failures: [{ reason: 'manifest files must be an array' }], ok: false };
  if (manifest.aggregateAlgorithm !== aggregateAlgorithm) failures.push({ reason: 'unknown aggregate algorithm', actual: manifest.aggregateAlgorithm });
  if (manifest.fileCount !== manifest.files.length) failures.push({ reason: 'declared file count differs from record count', expected: manifest.fileCount, actual: manifest.files.length });
  const paths = manifest.files.map((record) => record.path);
  const sortedPaths = [...paths].sort();
  if (paths.some((recordPath, index) => recordPath !== sortedPaths[index])) failures.push({ reason: 'manifest files are not sorted by path' });
  if (new Set(paths).size !== paths.length) failures.push({ reason: 'manifest contains duplicate paths' });
  const actual = [];
  for (const expected of manifest.files) {
    try {
      const record = fileRecord(root, expected.path);
      actual.push(record);
      if (record.size !== expected.size || record.sha256 !== expected.sha256) failures.push({ reason: 'file mismatch', path: expected.path, expected, actual: record });
    } catch (error) {
      failures.push({ reason: 'invalid or missing file', path: expected.path, message: error.message });
    }
  }
  if (exactTree) {
    try {
      const expectedPaths = new Set(paths);
      for (const relativePath of walkFilePaths(root).sort()) if (!expectedPaths.has(relativePath)) failures.push({ reason: 'extra file', path: relativePath });
    } catch (error) {
      failures.push({ reason: 'invalid evidence tree', message: error.message });
    }
  }
  const actualAggregateSha256 = aggregateRecords(actual);
  if (actualAggregateSha256 !== manifest.aggregateSha256) failures.push({ reason: 'aggregate mismatch', expected: manifest.aggregateSha256, actual: actualAggregateSha256 });
  if (actual.length !== manifest.fileCount) failures.push({ reason: 'verified file count mismatch', expected: manifest.fileCount, actual: actual.length });
  return { fileCount: actual.length, actualAggregateSha256, failures, ok: failures.length === 0 };
}

module.exports = Object.freeze({ aggregateAlgorithm, aggregateRecords, createManifest, recordsForPaths, verifyManifest, walkFilePaths });
