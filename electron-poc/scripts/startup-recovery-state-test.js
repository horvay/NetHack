#!/usr/bin/env node
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const RecoveryState = require('../src/main/recovery-state');
const LaunchPolicy = require('../src/main/launch-policy');

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

const publicPrepareKeys = new Set([
  'ok', 'message', 'kind', 'playerName', 'character', 'candidate', 'recoveredFrom', 'recovery',
  'hasContinue', 'primaryCandidate', 'candidates', 'id', 'status', 'canContinue', 'heroName',
  'role', 'timestamp', 'modifiedAt', 'name', 'race', 'gender', 'alignment',
]);
const forbiddenPrepareKeys = /^(stdout|stderr|playground|file|base|pid|playerSpec|levelFiles|recoverBin|recover|error|signal|executable|args?)$/;
function assertStrictPublicPrepareResponse(value, secrets = [], location = 'response') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertStrictPublicPrepareResponse(entry, secrets, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      for (const secret of secrets.filter(Boolean)) assert.strictEqual(value.includes(secret), false, `${location} must not leak ${secret}`);
    }
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    assert.strictEqual(forbiddenPrepareKeys.test(key), false, `${location}.${key} is private`);
    assert.strictEqual(publicPrepareKeys.has(key), true, `${location}.${key} is not on the public allowlist`);
    assertStrictPublicPrepareResponse(nested, secrets, `${location}.${key}`);
  }
}

function assertCompatibilityPrepareResponse(value, secrets = []) {
  const { playerSpec, ...strictFields } = value;
  assert.strictEqual(typeof playerSpec, 'string', 'active compatibility success exposes only its required launch argument');
  assertStrictPublicPrepareResponse(strictFields, secrets);
}

function assertCompatibilityLaunchArgument(prepared, expectedPlayerSpec) {
  assert.strictEqual(prepared.ok, true, 'compatibility launch data is present only after successful preparation');
  assert.strictEqual(prepared.playerSpec, expectedPlayerSpec, 'active compatibility response identifies the exact prepared save');
  const launch = LaunchPolicy.shimLaunchConfig({ options: { playerSpec: prepared.playerSpec }, env: {} });
  assert.deepStrictEqual(launch.args, [expectedPlayerSpec], 'launch policy preserves the compatibility argument consumed by the frozen route');
  assert.notStrictEqual(launch.args.length, 0, 'the compatibility projection does not create an empty launch configuration');
}

const repoRoot = path.resolve(__dirname, '..', '..');
const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nh-startup-recovery-'));
const playground = path.join(workRoot, 'playground');
const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
const nativeRecoverSource = fs.readFileSync(path.join(repoRoot, 'util', 'recover.c'), 'utf8');
const rendererSource = fs.readFileSync(path.join(repoRoot, 'electron-poc', 'src', 'renderer.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(repoRoot, 'electron-poc', 'src', 'main.js'), 'utf8');
assert.match(nativeRecoverSource, /Fprintf\(stderr, "recovered \\"%s\\" to %s\\n", argv\[argno\],\s*savename\);/, 'correlation parser is anchored to the native recover success-line contract');
assert.match(rendererSource, /startShimRun\(\{ playerSpec: prepared\.playerSpec, character, runKind: 'continue', recovery: prepared \}\)/, 'regression tracks the presently frozen Continue launch consumer');
assert.match(mainSource, /nethack:prepareContinueGame[^\n]+RecoveryState\.prepareContinueGame\(/, 'active IPC remains on the compatibility presenter until UXM-09A atomically promotes the strict handoff');

async function main() {
try {
  resetDir(playground);
  const savedHeroFile = path.join(playground, 'save', `${uid}SavedHero`);
  const unselectedHeroFile = path.join(playground, 'save', `${uid}NewerUnselectedHero`);
  fs.writeFileSync(savedHeroFile, Buffer.from('prefix SavedHero\0Arc-Hum-Mal-Law\0suffix', 'latin1'));
  fs.writeFileSync(unselectedHeroFile, Buffer.from('prefix NewerUnselectedHero\0Val-Hum-Fem-Law\0suffix', 'latin1'));
  fs.utimesSync(savedHeroFile, new Date('2026-07-11T09:00:00.000Z'), new Date('2026-07-11T09:00:00.000Z'));
  fs.utimesSync(unselectedHeroFile, new Date('2026-07-11T09:05:00.000Z'), new Date('2026-07-11T09:05:00.000Z'));
  let state = RecoveryState.getRecoveryState({ repoRoot, env: { ...process.env, NH_TEST_PLAYGROUND: playground } });
  const savedHeroCandidate = state.candidates.find((candidate) => candidate.playerName === 'SavedHero');
  assert.strictEqual(state.hasContinue, true, 'manual save should be continuable');
  assert.strictEqual(state.primaryCandidate.playerName, 'NewerUnselectedHero', 'fixture proves the requested save is not the automatic primary candidate');
  assert.strictEqual(savedHeroCandidate.kind, 'save');
  assert.strictEqual(savedHeroCandidate.status, 'saved');
  assert.match(savedHeroCandidate.id, /^save:[a-f0-9]{20}$/, 'public save identity is opaque');
  assert.strictEqual(savedHeroCandidate.id.includes(`${uid}SavedHero`), false, 'public save identity does not contain the filename');
  assert.strictEqual(savedHeroCandidate.heroName, 'SavedHero');
  assert.strictEqual(savedHeroCandidate.role, 'Archeologist');
  assert.deepStrictEqual(savedHeroCandidate.character, { name: 'SavedHero', role: 'Arc', race: 'Hum', gender: 'Mal', alignment: 'Law' }, 'save identity should expose only public restored-character metadata for immediate avatar selection');
  assert.strictEqual(typeof savedHeroCandidate.timestamp, 'string', 'save timestamp is public Continue metadata');
  assert.strictEqual(state.primaryCandidate.playerSpec, undefined, 'startup metadata omits the internal launch argument');
  assert.strictEqual(state.primaryCandidate.file, undefined, 'startup metadata omits the save path');
  assert.strictEqual(state.playground, undefined, 'startup metadata omits the playground path');
  assert.strictEqual(state.recoverBin, undefined, 'startup metadata omits the recovery executable path');
  assert.deepStrictEqual(RecoveryState.parseSaveCharacterBuffer(Buffer.from('SavedHero\0Arc-Hum-Mal-Law', 'latin1'), 'SavedHero'), { role: 'Arc', race: 'Hum', gender: 'Mal', alignment: 'Law' });
  const preparedSave = await RecoveryState.prepareContinueGame({ repoRoot, env: { ...process.env, NH_TEST_PLAYGROUND: playground }, candidateId: savedHeroCandidate.id });
  assertCompatibilityLaunchArgument(preparedSave, '-uSavedHero');
  assertCompatibilityPrepareResponse(preparedSave, [playground, `${uid}SavedHero`, '-uSavedHero']);
  assert.strictEqual(preparedSave.candidate.id, savedHeroCandidate.id, 'active Continue preparation preserves the exact selected opaque candidate');
  const strictPreparedSave = RecoveryState.toStrictPrepareResponse(preparedSave);
  assert.strictEqual(strictPreparedSave.playerSpec, undefined, 'proposed strict response omits the raw launch argument');
  assertStrictPublicPrepareResponse(strictPreparedSave, [playground, `${uid}SavedHero`, '-uSavedHero']);
  const strictPreparedSaveEndToEnd = await RecoveryState.prepareContinueGameStrict({ repoRoot, env: { ...process.env, NH_TEST_PLAYGROUND: playground }, candidateId: savedHeroCandidate.id });
  assert.deepStrictEqual(strictPreparedSaveEndToEnd, strictPreparedSave, 'staged strict entry point produces the proposed sanitized contract without changing the active IPC route');
  const adversarialStrict = RecoveryState.toStrictPrepareResponse({
    ok: true,
    kind: 'save',
    playerSpec: '-uLeakedHero',
    playerName: '/private/leaked/name',
    character: { role: '/private/leaked/role' },
    candidate: { id: 'save:not-opaque', kind: 'save', canContinue: true, file: '/private/save', playerName: '/private/candidate' },
    recovery: { playground: '/private/playground', stdout: 'path output', candidates: [{ id: 'save:not-opaque', kind: 'save', file: '/private/nested-save' }] },
  });
  assert.strictEqual(adversarialStrict.ok, false, 'malformed strict success fails closed instead of being coerced into a save response');
  assertStrictPublicPrepareResponse(adversarialStrict, ['/private', '-uLeakedHero', 'path output']);
  const mismatchedStrict = RecoveryState.toStrictPrepareResponse({
    ok: true,
    kind: 'save',
    candidate: { id: 'checkpoint:0123456789abcdef0123', kind: 'checkpoint', canContinue: true },
    recovery: { candidates: [], primaryCandidate: null },
  });
  assert.strictEqual(mismatchedStrict.ok, false, 'strict save success rejects a checkpoint candidate instead of coercing mismatched semantics');
  fs.writeFileSync(savedHeroFile, Buffer.from('prefix ReplacedHero\0Wiz-Hum-Mal-Neu\0suffix', 'latin1'));
  const replacedSaveSelection = await RecoveryState.prepareContinueGame({ repoRoot, env: { ...process.env, NH_TEST_PLAYGROUND: playground }, candidateId: savedHeroCandidate.id });
  assert.strictEqual(replacedSaveSelection.ok, false, 'an opaque save selection is bound to the displayed file generation and fails if that save is replaced');
  const staleSelection = await RecoveryState.prepareContinueGame({ repoRoot, env: { ...process.env, NH_TEST_PLAYGROUND: playground }, candidateId: 'save:stale-selection' });
  assert.strictEqual(staleSelection.ok, false, 'an explicit stale Continue selection fails instead of opening another run');
  assert.match(staleSelection.message, /No saved or recoverable/i);
  assertStrictPublicPrepareResponse(RecoveryState.toStrictPrepareResponse(staleSelection), [playground, 'save:stale-selection']);

  resetDir(playground);
  fs.writeFileSync(path.join(playground, 'save', `${uid}GzipHero.gz`), zlib.gzipSync(Buffer.from('prefix GzipHero\0Val-Hum-Fem-Law\0suffix', 'latin1')));
  state = RecoveryState.getRecoveryState({ repoRoot, env: { ...process.env, NH_TEST_PLAYGROUND: playground } });
  assert.deepStrictEqual(state.primaryCandidate.character, { name: 'GzipHero', role: 'Val', race: 'Hum', gender: 'Fem', alignment: 'Law' }, 'gzip save identity should be parsed when present');

  resetDir(playground);
  writeCheckpointSet(playground, 999999);
  const olderCheckpointTime = new Date('2026-07-11T10:00:00.000Z');
  const newerLevelTime = new Date('2026-07-11T10:05:00.000Z');
  fs.utimesSync(path.join(playground, 'alock.0'), olderCheckpointTime, olderCheckpointTime);
  fs.utimesSync(path.join(playground, 'alock.1'), newerLevelTime, newerLevelTime);
  state = RecoveryState.getRecoveryState({ repoRoot, env: { ...process.env, NH_TEST_PLAYGROUND: playground } });
  assert.strictEqual(state.hasContinue, true, 'dead checkpoint with level files should be offered');
  assert.strictEqual(state.primaryCandidate.kind, 'checkpoint');
  assert.strictEqual(state.primaryCandidate.status, 'recovery-candidate');
  assert.match(state.primaryCandidate.id, /^checkpoint:[a-f0-9]{20}$/, 'public checkpoint identity is opaque');
  assert.strictEqual(state.primaryCandidate.id.includes('alock'), false, 'public checkpoint identity does not contain the lock basename');
  assert.strictEqual(state.primaryCandidate.timestamp, newerLevelTime.toISOString(), 'checkpoint metadata uses the newest lock or level timestamp');
  assert.strictEqual(state.primaryCandidate.base, undefined, 'public recovery metadata omits the internal lock base');
  assert.strictEqual(state.primaryCandidate.file, undefined, 'public recovery metadata omits the checkpoint path');
  const displayedCheckpointId = state.primaryCandidate.id;
  fs.appendFileSync(path.join(playground, 'alock.1'), Buffer.from([2]));
  const replacedCheckpointSelection = await RecoveryState.prepareContinueGame({ repoRoot, env: { ...process.env, NH_TEST_PLAYGROUND: playground }, candidateId: displayedCheckpointId });
  assert.strictEqual(replacedCheckpointSelection.ok, false, 'an opaque checkpoint selection is bound to the displayed checkpoint generation');
  state = RecoveryState.getRecoveryState({ repoRoot, env: { ...process.env, NH_TEST_PLAYGROUND: playground } });
  fs.writeFileSync(path.join(playground, 'save', `${uid}OldHero`), Buffer.from('prefix OldHero\0Wiz-Hum-Mal-Neu\0suffix', 'latin1'));
  fs.utimesSync(path.join(playground, 'save', `${uid}OldHero`), olderCheckpointTime, olderCheckpointTime);
  const fakeRepo = path.join(workRoot, 'fake-repo');
  fs.mkdirSync(path.join(fakeRepo, 'util'), { recursive: true });
  const fakeRecover = path.join(fakeRepo, 'util', 'recover');
  const recoveryDiagnostics = [];
  fs.writeFileSync(fakeRecover, '#!/bin/sh\nexit 0\n');
  const nonExecutableState = RecoveryState.getRecoveryState({ repoRoot: fakeRepo, env: { ...process.env, NH_TEST_PLAYGROUND: playground } });
  assert.strictEqual(nonExecutableState.candidates.find((candidate) => candidate.kind === 'checkpoint')?.canContinue, false, 'a non-executable recovery binary is not advertised as continuable');
  fs.writeFileSync(fakeRecover, `#!/bin/sh\nprintf 'failure path=%s/save/${uid}FailedHero lock=alock pid=999999 levels=alock.1\\n' "$2"\nprintf 'recover executable=${fakeRecover} argument=-uFailedHero\\n' >&2\nexit 7\n`);
  fs.chmodSync(fakeRecover, 0o755);
  const failedRecovery = await RecoveryState.prepareContinueGame({
    repoRoot: fakeRepo,
    env: { ...process.env, NH_TEST_PLAYGROUND: playground },
    candidateId: state.primaryCandidate.id,
    onDiagnostic: (entry) => recoveryDiagnostics.push(entry),
  });
  assert.strictEqual(failedRecovery.ok, false, 'recover process failure stays generic at the IPC boundary');
  assertStrictPublicPrepareResponse(RecoveryState.toStrictPrepareResponse(failedRecovery), [playground, fakeRecover, 'alock', '999999', '-uFailedHero', 'alock.1']);
  assert.match(recoveryDiagnostics.at(-1).detail.stdout, /failure path=/, 'raw stdout remains available to internal main-process diagnostics');
  assert.match(recoveryDiagnostics.at(-1).detail.stderr, /recover executable=/, 'raw stderr remains available to internal main-process diagnostics');

  fs.writeFileSync(fakeRecover, `#!/bin/sh\nprintf 'unrelated save' > "$2/save/${uid}OtherHero"\nprintf 'no correlation for path=%s/save/${uid}OtherHero lock=alock pid=999999 levels=alock.1\\n' "$2"\nexit 0\n`);
  const unrelatedSaveResult = await RecoveryState.prepareContinueGame({
    repoRoot: fakeRepo,
    env: { ...process.env, NH_TEST_PLAYGROUND: playground },
    candidateId: state.primaryCandidate.id,
    onDiagnostic: (entry) => recoveryDiagnostics.push(entry),
  });
  assert.strictEqual(unrelatedSaveResult.ok, false, 'successful recovery without a correlated report cannot continue an unrelated new or old save');
  assert.match(unrelatedSaveResult.message, /did not produce a usable saved game/i);
  assertStrictPublicPrepareResponse(RecoveryState.toStrictPrepareResponse(unrelatedSaveResult), [playground, fakeRecover, 'alock', '999999', `${uid}OtherHero`, 'alock.1']);
  assert.match(recoveryDiagnostics.at(-1).detail.stdout, /no correlation/, 'uncorrelated raw output is diagnostic-only');

  fs.writeFileSync(fakeRecover, `#!/bin/sh\nprintf 'recovered save' > "$2/save/${uid}RecoveredHero"\nprintf 'recovered "alock" to %s/save/${uid}RecoveredHero\\n' "$2" >&2\nprintf 'pid=999999 levels=alock.1 executable=${fakeRecover} argument=-uRecoveredHero\\n' >&1\nexit 0\n`);
  const correlatedRecovery = await RecoveryState.prepareContinueGame({
    repoRoot: fakeRepo,
    env: { ...process.env, NH_TEST_PLAYGROUND: playground },
    candidateId: state.primaryCandidate.id,
    onDiagnostic: (entry) => recoveryDiagnostics.push(entry),
  });
  assert.strictEqual(correlatedRecovery.ok, true, 'the exact save path reported by recover is accepted before the response is sanitized');
  assert.strictEqual(correlatedRecovery.playerName, 'RecoveredHero');
  assertCompatibilityLaunchArgument(correlatedRecovery, '-uRecoveredHero');
  assertCompatibilityPrepareResponse(correlatedRecovery, [playground, fakeRecover, 'alock', '999999', `${uid}RecoveredHero`, '-uRecoveredHero', 'alock.1']);
  const strictCorrelatedRecovery = RecoveryState.toStrictPrepareResponse(correlatedRecovery);
  assert.strictEqual(strictCorrelatedRecovery.playerSpec, undefined, 'proposed strict correlated response omits the raw launch argument');
  assertStrictPublicPrepareResponse(strictCorrelatedRecovery, [playground, fakeRecover, 'alock', '999999', `${uid}RecoveredHero`, '-uRecoveredHero', 'alock.1']);
  assert.strictEqual(recoveryDiagnostics.at(-1).detail.correlated, true, 'internal diagnostics retain exact pre-sanitization correlation');
  assert.match(recoveryDiagnostics.at(-1).detail.recoveredFile, new RegExp(`${uid}RecoveredHero$`));

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
}

main().catch((error) => { console.error(error); process.exit(1); });
