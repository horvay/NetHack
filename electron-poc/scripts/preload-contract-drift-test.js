const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const preload = fs.readFileSync(path.join(root, 'src/preload.js'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'src/shared/preload-contract.js'), 'utf8');
const functions = ['isPlainObject', 'cloneFreeze', 'validStartSize', 'validShimOptions', 'validRecording', 'validKey', 'validShimInput', 'validUiCommand', 'validDiagnosticEvent'];

function findFunctionStart(source, name) {
  const re = new RegExp(`\\bfunction\\s+${name}\\s*\\(`, 'g');
  const match = re.exec(source);
  assert.ok(match, `${name} must exist`);
  return match.index;
}

function findMatchingFunctionEnd(source, brace) {
  let depth = 0;
  let state = 'code';
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === 'line-comment') {
      if (ch === '\n') state = 'code';
      continue;
    }
    if (state === 'block-comment') {
      if (ch === '*' && next === '/') { i += 1; state = 'code'; }
      continue;
    }
    if (state === 'single' || state === 'double' || state === 'template') {
      const quote = state === 'single' ? "'" : state === 'double' ? '"' : '`';
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) state = 'code';
      continue;
    }
    if (ch === '/' && next === '/') { i += 1; state = 'line-comment'; continue; }
    if (ch === '/' && next === '*') { i += 1; state = 'block-comment'; continue; }
    if (ch === "'") { state = 'single'; continue; }
    if (ch === '"') { state = 'double'; continue; }
    if (ch === '`') { state = 'template'; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
      assert.ok(depth >= 0, 'function brace scanner underflowed');
    }
  }
  throw new Error('unterminated function body');
}

function extractFunctionSource(source, name) {
  const start = findFunctionStart(source, name);
  const brace = source.indexOf('{', start);
  assert.notEqual(brace, -1, `${name} must have a body`);
  const end = findMatchingFunctionEnd(source, brace);
  const partial = source.slice(start, end);
  assert.match(partial, new RegExp(`^function\\s+${name}\\s*\\(`), `${name} extraction started at function declaration`);
  assert.equal((partial.match(/[{}]/g) || []).filter(Boolean).length % 2, 0, `${name} extraction should include balanced visible braces`);
  return partial.replace(/\r\n/g, '\n');
}

assert.notEqual(
  extractFunctionSource('function probe() { throw new Error("literal  spacing"); }', 'probe'),
  extractFunctionSource('function probe() { throw new Error("literal spacing"); }', 'probe'),
  'drift comparison must not erase semantically observable whitespace inside string literals',
);
assert.equal(
  extractFunctionSource('function probe() {\r\n  return true;\r\n}', 'probe'),
  extractFunctionSource('function probe() {\n  return true;\n}', 'probe'),
  'drift comparison normalizes only platform line endings',
);
for (const name of functions) {
  assert.equal(extractFunctionSource(preload, name), extractFunctionSource(contract, name), `preload inline validator drifted from shared preload-contract: ${name}`);
}
console.log('preload contract drift check OK');
