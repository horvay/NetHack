#!/usr/bin/env node
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const RecoveryState = require('../src/main/recovery-state');

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'save'), { recursive: true });
}

function writePidFile(file, pid, extraBytes = 0) {
  const buffer = Buffer.alloc(4 + extraBytes, 0);
  buffer.writeInt32LE(pid, 0);
  fs.writeFileSync(file, buffer);
}

function writeCheckpointSet(playground, pid) {
  writePidFile(path.join(playground, 'alock.0'), pid, 8192);
  fs.writeFileSync(path.join(playground, 'alock.1'), Buffer.alloc(4096, 1));
}

const repoRoot = path.resolve(__dirname, '..', '..');
const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-startup-recovery-'));
const playground = path.join(workRoot, 'playground');
const uid = typeof process.getuid === 'function' ? process.getuid() : 0;

try {
  resetDir(playground);
  fs.writeFileSync(path.join(playground, 'save', `${uid}SavedHero`), Buffer.from('prefix SavedHero\0Arc-Hum-Mal-Law\0suffix', 'latin1'));
  let state = RecoveryState.getRecoveryState({ repoRoot, env: { ...process.env, NH_TEST_PLAYGROUND: playground } });
  assert.strictEqual(state.hasContinue, true, 'manual save should be continuable');
  assert.strictEqual(state.primaryCandidate.kind, 'save');
  assert.strictEqual(state.primaryCandidate.playerSpec, '-uSavedHero');
  assert.deepStrictEqual(state.primaryCandidate.character, { role: 'Arc', race: 'Hum', gender: 'Mal', alignment: 'Law' }, 'save identity should expose restored character for immediate avatar selection');
  assert.deepStrictEqual(RecoveryState.parseSaveCharacterBuffer(Buffer.from('SavedHero\0Arc-Hum-Mal-Law', 'latin1'), 'SavedHero'), { role: 'Arc', race: 'Hum', gender: 'Mal', alignment: 'Law' });

  resetDir(playground);
  fs.writeFileSync(path.join(playground, 'save', `${uid}GzipHero.gz`), zlib.gzipSync(Buffer.from('prefix GzipHero\0Val-Hum-Fem-Law\0suffix', 'latin1')));
  state = RecoveryState.getRecoveryState({ repoRoot, env: { ...process.env, NH_TEST_PLAYGROUND: playground } });
  assert.deepStrictEqual(state.primaryCandidate.character, { role: 'Val', race: 'Hum', gender: 'Fem', alignment: 'Law' }, 'gzip save identity should be parsed when present');

  resetDir(playground);
  writeCheckpointSet(playground, 999999);
  state = RecoveryState.getRecoveryState({ repoRoot, env: { ...process.env, NH_TEST_PLAYGROUND: playground } });
  assert.strictEqual(state.hasContinue, true, 'dead checkpoint with level files should be offered');
  assert.strictEqual(state.primaryCandidate.kind, 'checkpoint');
  assert.strictEqual(state.primaryCandidate.base, 'alock');

  resetDir(playground);
  writePidFile(path.join(playground, 'alock.0'), 999999, 0);
  state = RecoveryState.getRecoveryState({ repoRoot, env: { ...process.env, NH_TEST_PLAYGROUND: playground } });
  assert.strictEqual(state.hasContinue, false, '4 byte pid-only stale lock should not be offered');

  resetDir(playground);
  writePidFile(path.join(playground, 'alock.0'), 999999, 8192);
  state = RecoveryState.getRecoveryState({ repoRoot, env: { ...process.env, NH_TEST_PLAYGROUND: playground } });
  assert.strictEqual(state.hasContinue, false, 'level zero bytes without checkpoint level files should not be offered');

  resetDir(playground);
  writeCheckpointSet(playground, process.pid);
  state = RecoveryState.getRecoveryState({ repoRoot, env: { ...process.env, NH_TEST_PLAYGROUND: playground } });
  assert.strictEqual(state.hasContinue, false, 'active lock should not be offered as a previous game');

  console.log(JSON.stringify({ ok: true, workRoot, checks: ['save', 'checkpoint', 'pid-only-lock', 'checkpoint-without-level-files', 'active-lock'] }, null, 2));
} finally {
  fs.rmSync(workRoot, { recursive: true, force: true });
}
