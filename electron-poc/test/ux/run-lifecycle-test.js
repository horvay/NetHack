const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const RunLifecycle = require('../../src/ux/run-lifecycle');
const FinalChronicle = require('../../src/ux/final-chronicle');

const root = path.resolve(__dirname, '..', '..');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/uxm07/final-run-domain-cases.json'), 'utf8'));

assert.equal(RunLifecycle.actionDefinitions.length, 2);
const save = RunLifecycle.actionFor('run.save-and-exit');
const quit = RunLifecycle.actionFor('run.quit');
assert.equal(save.label, 'Save and exit');
assert.equal(save.publicShortcut, 'S');
assert.equal(save.promptPlan, 'core-owned');
assert.equal(quit.label, 'Quit');
assert.equal(quit.publicShortcut, '#quit');
assert.equal(quit.internalRoute, '#quit', 'GUI Quit uses canonical extended Quit, not the Q quiver command');
assert.equal(quit.danger, 'serious');
assert.match(quit.confirmationText, /without creating a save/i);

const notices = [];
const dispatched = [];
let now = 100;
const controller = RunLifecycle.createRunLifecycleController({
  now: () => ++now,
  noticeService: { show(notice) { notices.push(notice); return notice; } },
  dispatch(action, context) { dispatched.push({ action, context }); return { accepted: true }; },
});
const requested = controller.request('run.save-and-exit', { transactionId: 'save:one' });
assert.equal(requested.accepted, true);
assert.equal(controller.state().phase, 'awaiting-core');
assert.equal(notices.length, 0, 'requesting Save does not claim success');
assert.equal(dispatched[0].action.internalRoute, 'S');
assert.equal(controller.request('run.save-and-exit').accepted, false, 'pending Save blocks duplicate activation');
assert.equal(notices.length, 0, 'duplicate blocking does not invent an outcome');
const unmatched = controller.acceptAcknowledgement({
  id: 'ack:other', transactionId: 'save:other', actionId: 'run.save-and-exit', status: 'success', source: 'typed-result',
});
assert.equal(unmatched.unmatched, true);
assert.equal(notices.length, 0, 'an unmatched acknowledgement cannot claim save success');
const saved = controller.acceptAcknowledgement({
  id: 'ack:save:one', transactionId: 'save:one', actionId: 'run.save-and-exit', status: 'success', source: 'command-transaction',
});
assert.equal(saved.accepted, true);
assert.equal(controller.state().phase, 'completed');
assert.equal(notices.length, 1);
assert.equal(notices[0].message, 'Game saved');
assert.equal(notices[0].source, 'result');
assert.equal(controller.acceptAcknowledgement({
  id: 'ack:save:one', transactionId: 'save:one', actionId: 'run.save-and-exit', status: 'success', source: 'command-transaction',
}).duplicate, true);
assert.equal(notices.length, 1, 'duplicate acknowledgement cannot duplicate Game saved');
controller.reset('run-next');
controller.request('run.save-and-exit', { transactionId: 'save:failed' });
controller.acceptAcknowledgement({
  id: 'ack:save:failed', transactionId: 'save:failed', actionId: 'run.save-and-exit', status: 'failure', source: 'typed-result', reason: 'write failed',
});
assert.match(notices.at(-1).message, /Cannot save the game/i);
assert.equal(controller.state().phase, 'rejected');
assert.throws(() => controller.acceptAcknowledgement({ actionId: 'run.save-and-exit', status: 'success', source: 'presentation' }), /authoritative source/);
assert.throws(() => controller.acceptAcknowledgement({ id: 'uncorrelated', actionId: 'run.save-and-exit', status: 'success', source: 'typed-result' }), /transactionId is required/);

const savedCandidate = RunLifecycle.recoveryCandidatePresentation({
  id: 'save:hero', kind: 'save', canContinue: true, playerName: 'Aster', character: { role: 'Val' }, modifiedAt: '2026-07-11T12:30:00.000Z', dungeonLevel: 'Dlvl:7',
});
assert.equal(savedCandidate.status, 'saved');
assert.equal(savedCandidate.title, 'Continue previous game');
assert.deepEqual(savedCandidate.facts.map(({ label, value }) => [label, value]), [
  ['Hero', 'Aster'], ['Role', 'Valkyrie'], ['Dungeon', 'Dlvl:7'], ['Saved', '2026-07-11T12:30:00.000Z'],
]);
const checkpointCandidate = RunLifecycle.recoveryCandidatePresentation({ id: 'checkpoint:opaque', kind: 'checkpoint', canContinue: true, modifiedAt: '2026-07-11T12:35:00.000Z', file: '/internal/path', base: 'alock' });
assert.equal(checkpointCandidate.status, 'recovery-candidate');
assert.match(checkpointCandidate.description, /NetHack will validate/i);
assert.equal(checkpointCandidate.title, 'Recover and continue');
assert.equal(checkpointCandidate.facts.some((fact) => /internal|alock/.test(fact.value)), false, 'recovery presentation omits internal paths and lock names');

const authoritative = FinalChronicle.normalizeFinalRunPayload(fixtures.authoritative);
assert.equal(Object.isFrozen(authoritative), true);
assert.equal(authoritative.cause, fixtures.authoritative.cause, 'authoritative cause remains exact');
assert.equal(authoritative.score, 4217);
assert.equal(authoritative.statistics.length, 2, 'hidden placeholders are omitted');
assert.equal('unknownFutureField' in authoritative, false, 'unknown final fields do not enter presentation');
assert.equal(authoritative.disclosures[0].lines[1], fixtures.authoritative.disclosures[0].lines[1], 'canonical disclosure text remains exact');
assert.equal(JSON.stringify(authoritative).includes('(hidden)'), false);
const missing = FinalChronicle.normalizeFinalRunPayload(fixtures.missingFields);
assert.equal('cause' in missing, false);
assert.equal('score' in missing, false);
assert.equal('turns' in missing, false);
assert.equal('depth' in missing, false);
assert.equal('statistics' in missing, false);
assert.throws(() => FinalChronicle.normalizeFinalRunPayload({ ...fixtures.missingFields, finalized: false }), /must be finalized/);
assert.throws(() => FinalChronicle.normalizeFinalRunPayload({ ...fixtures.missingFields, score: -1 }), /non-negative integer/);

const fallbackModel = FinalChronicle.chronicleModel({ fallbackCause: 'Killed by a grid bug.', disclosureComplete: true });
assert.equal(fallbackModel.cause, 'Killed by a grid bug.');
assert.equal(fallbackModel.causeAuthority, 'fallback');
assert.equal(fallbackModel.causeLabel, 'Cause from legacy text');
const priorityModel = FinalChronicle.chronicleModel({ payload: fixtures.authoritative, fallbackCause: 'Killed by a grid bug.', disclosureComplete: true });
assert.equal(priorityModel.cause, fixtures.authoritative.cause, 'final payload outranks parser fallback');
assert.equal(priorityModel.causeAuthority, 'authoritative');
assert.deepEqual(priorityModel.primaryFacts.map((fact) => fact.id), ['score', 'turns', 'depth']);
assert.deepEqual(priorityModel.actions.map((action) => action.label), ['New game', 'Exit']);
assert.equal(priorityModel.escapeBlockedMessage.includes('Escape keeps'), true);
assert.equal(JSON.stringify(priorityModel).includes('(hidden)'), false);
assert.equal(JSON.stringify(priorityModel).includes('unknownFutureField'), false);

const diagnostics = [];
const store = FinalChronicle.createFinalChronicleStore({ onDiagnostic: (entry) => diagnostics.push(entry) });
let model = store.begin({ runId: 'run-9', fallbackCause: 'You die...' });
assert.equal(model.phase, 'loading');
assert.equal(model.actions.length, 2, 'terminal actions exist during bounded loading');
model = store.addDisclosure({ id: 'late-lines', title: 'Final summary', lines: ['Goodbye Aster...', 'You died on dungeon level 4.'] });
assert.equal(model.disclosures.length, 1);
store.addDisclosure({ id: 'late-lines', title: 'Final summary', lines: ['Goodbye Aster...', 'You died on dungeon level 4.'] });
assert.equal(store.model().disclosures.length, 1, 'duplicate disclosure is idempotent');
const late = store.acceptPayload(fixtures.lateAuthoritative);
assert.equal(late.accepted, true);
assert.equal(late.model.cause, 'Starved to death.');
assert.equal(late.model.causeAuthority, 'authoritative');
assert.equal(store.acceptPayload(fixtures.lateAuthoritative).reason, 'duplicate');
const stale = store.acceptPayload({ ...fixtures.lateAuthoritative, finalId: 'final:run-9:stale', sequence: 1 });
assert.equal(stale.reason, 'stale');
const foreign = store.acceptPayload({ ...fixtures.lateAuthoritative, finalId: 'final:foreign', runId: 'foreign-run', sequence: 3 });
assert.equal(foreign.reason, 'foreign-run');
assert(diagnostics.some((entry) => entry.type === 'final-chronicle.payload-accepted'));
assert(diagnostics.some((entry) => entry.type === 'final-chronicle.duplicate-payload-suppressed'));

const loadingModel = FinalChronicle.chronicleModel({ fallbackCause: 'You die...', disclosureComplete: false });
assert.equal(loadingModel.loading, true);
assert.equal(loadingModel.actions.every((action) => action.disabled), true, 'terminal actions stay visible but disabled during bounded finalization');
const payloadStillWaiting = FinalChronicle.chronicleModel({ payload: fixtures.authoritative, disclosureComplete: false });
assert.equal(payloadStillWaiting.loading, true, 'payload alone does not finalize before canonical disclosures complete');
const disclosuresStillWaiting = FinalChronicle.chronicleModel({ fallbackCause: 'You die...', disclosureComplete: true });
assert.equal(disclosuresStillWaiting.loading, true, 'disclosures alone wait for payload until the bounded timeout');
const timedOutModel = FinalChronicle.chronicleModel({ fallbackCause: 'You die...', disclosureComplete: false, timedOut: true });
assert.equal(timedOutModel.loading, false);
assert.equal(timedOutModel.causeAuthority, 'fallback');
const timeoutStore = FinalChronicle.createFinalChronicleStore();
timeoutStore.begin({ runId: 'timeout-run', fallbackCause: 'You die...' });
timeoutStore.timeOut();
timeoutStore.acceptPayload({ ...fixtures.lateAuthoritative, runId: 'timeout-run', finalId: 'timeout-late-payload', sequence: 3 });
assert.equal(timeoutStore.model().loading, false, 'a late partial payload cannot re-disable actions after the bounded wait');
assert.equal(timeoutStore.model().actions.every((action) => !action.disabled), true);

const context = { console };
context.window = context;
context.self = context;
vm.createContext(context);
for (const source of ['ux/runtime.js', 'ux/app-mounts.js', 'ux/dialog-shell.js', 'ux/run-lifecycle.js', 'ux/final-chronicle.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'src', source), 'utf8'), context, { filename: source });
}
assert.equal(Object.isFrozen(context.NetHackUxRunLifecycle), true);
assert.equal(Object.isFrozen(context.NetHackUxFinalChronicle), true);
assert.equal(context.NetHackUxRuntime.runtime.providers('run-lifecycle-actions').length, 1, 'browser module registers the predeclared lifecycle provider once');
assert.equal(context.NetHackUxFinalChronicle.defaultView, null, 'browser-global contract remains safe without a document');

const mergeStore = FinalChronicle.createFinalChronicleStore();
mergeStore.begin({ runId: 'merge-run' });
mergeStore.addDisclosure({ id: 'conduct', title: 'Conduct', lines: ['You were an atheist.'] });
mergeStore.addDisclosure({ id: 'conduct', title: 'Conduct', lines: ['You were an atheist.', 'You were illiterate.'] });
assert.equal(mergeStore.model().disclosures.length, 1, 'late disclosure extensions merge by stable ID');
assert.deepEqual(mergeStore.model().disclosures[0].lines, ['You were an atheist.', 'You were illiterate.']);
mergeStore.acceptPayload({ ...fixtures.lateAuthoritative, runId: 'merge-run', finalId: 'merge-final', sequence: 2 });
mergeStore.begin({ runId: 'merge-run' });
assert.equal(mergeStore.acceptPayload({ ...fixtures.lateAuthoritative, runId: 'merge-run', finalId: 'merge-final', sequence: 2 }).reason, 'duplicate', 'reopening the same run preserves final-event idempotence');

const sourceText = `${fs.readFileSync(path.join(root, 'src/ux/run-lifecycle.js'), 'utf8')}\n${fs.readFileSync(path.join(root, 'src/ux/final-chronicle.js'), 'utf8')}`;
assert.doesNotMatch(sourceText, /allStatusStats|statusValue\(|deathCauseFromText\(/, 'UXM-07 domain does not infer final statistics or cause from renderer caches/text');
assert.doesNotMatch(sourceText, /autosave|save slot|rewind|undo/i, 'UXM-07 introduces no broader save semantics');

async function testAsyncDispatchBoundaries() {
  const asyncNotices = [];
  const accepted = RunLifecycle.createRunLifecycleController({
    noticeService: { show: (notice) => asyncNotices.push(notice) },
    dispatch: async () => ({ accepted: true }),
  });
  const acceptedResult = await accepted.request('run.save-and-exit', { transactionId: 'async:accepted' });
  assert.equal(acceptedResult.accepted, true);
  assert.equal(accepted.state().phase, 'awaiting-core', 'async dispatch acceptance still waits for authoritative acknowledgement');
  assert.equal(asyncNotices.length, 0);
  let rejectOldDispatch;
  const race = RunLifecycle.createRunLifecycleController({
    dispatch: (action) => action.id === 'run.save-and-exit'
      ? new Promise((_resolve, reject) => { rejectOldDispatch = reject; })
      : { accepted: true },
  });
  const oldRequest = race.request('run.save-and-exit', { transactionId: 'race:old-save' });
  race.reset('new-run');
  const newRequest = race.request('run.quit', { transactionId: 'race:new-quit' });
  assert.equal(newRequest.accepted, true);
  rejectOldDispatch(new Error('late old save failure'));
  const staleSettlement = await oldRequest;
  assert.equal(staleSettlement.stale, true);
  assert.equal(race.state().actionId, 'run.quit');
  assert.equal(race.state().phase, 'awaiting-core', 'late async settlement cannot corrupt the newer request');

  let rejectReusedDispatch;
  let reusedDispatchCount = 0;
  const reused = RunLifecycle.createRunLifecycleController({
    dispatch: () => {
      reusedDispatchCount += 1;
      return reusedDispatchCount === 1
        ? new Promise((_resolve, reject) => { rejectReusedDispatch = reject; })
        : { accepted: true };
    },
  });
  const reusedOldRequest = reused.request('run.save-and-exit', { transactionId: 'reused-id' });
  reused.reset('replacement-run');
  assert.equal(reused.request('run.save-and-exit', { transactionId: 'reused-id' }).reason, 'transaction-reused', 'transaction IDs cannot be reused across run reset boundaries');
  assert.equal(reused.request('run.save-and-exit', { transactionId: 'replacement-id' }).accepted, true);
  const oldAcknowledgement = reused.acceptAcknowledgement({
    id: 'ack:old-reused-id', transactionId: 'reused-id', actionId: 'run.save-and-exit', status: 'success', source: 'typed-result',
  });
  assert.equal(oldAcknowledgement.unmatched, true, 'an old-run acknowledgement cannot complete the replacement request');
  rejectReusedDispatch(new Error('late reused-id failure'));
  assert.equal((await reusedOldRequest).stale, true);
  assert.equal(reused.state().phase, 'awaiting-core', 'private generation suppresses stale settlement while the replacement transaction remains pending');

  const rejected = RunLifecycle.createRunLifecycleController({
    noticeService: { show: (notice) => asyncNotices.push(notice) },
    dispatch: async () => { throw new Error('async route failed'); },
  });
  const rejectedResult = await rejected.request('run.save-and-exit', { transactionId: 'async:rejected' });
  assert.equal(rejectedResult.accepted, false);
  assert.equal(rejected.state().phase, 'rejected');
  assert.match(asyncNotices.at(-1).message, /Cannot save the game/);
}

testAsyncDispatchBoundaries()
  .then(() => console.log('UXM-07 run lifecycle and final chronicle contracts PASS'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
