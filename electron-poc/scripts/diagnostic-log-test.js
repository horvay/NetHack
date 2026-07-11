#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DiagnosticRunStore, LIVE_MARKER_FILE, chooseSeed } = require('../src/main/diagnostic-log');
const { verifyBundle } = require('./diagnostic-bundle-verify');

function tempRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `nh-${name}-`));
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function readJsonl(file) { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse); }

assert.equal(chooseSeed('12345', {}).chosen, '12345', 'explicit decimal seed wins');
assert.equal(chooseSeed('0x10', {}).chosen, '16', 'explicit hex seed normalizes');
assert.equal(chooseSeed('18446744073709551615', {}).chosen, '18446744073709551615', 'max unsigned 64-bit seed is accepted as a string');
assert.equal(chooseSeed('', { NH_ELECTRON_TEST_FIXTURES: '1', NETHACK_SEED: '424242' }).chosen, '424242', 'fixture NETHACK_SEED remains compatible when no user seed');
assert.equal(chooseSeed('', { NH_ELECTRON_TEST_FIXTURES: '1', NETHACK_SEED: '424242' }).source, 'fixture-env', 'fixture seed source recorded');
const randomChoice = chooseSeed('', {});
assert.match(randomChoice.chosen, /^\d+$/, 'blank seed gets app-random numeric seed');
assert.equal(randomChoice.source, 'app-random', 'blank seed source is app-random');

const root = tempRoot('diagnostics');
const store = new DiagnosticRunStore({ repoRoot: process.cwd(), env: { NH_DIAGNOSTIC_LOG_DIR: root } });
const started = store.startRun({ mode: 'shim', startOptions: { playerSpec: '-uAda-Val-Hum-Fem-Law', seed: '777' }, nethackOptions: '!tutorial,disclose:+i +a +v +g +c +o' });
assert.equal(started.run.seed.chosen, '777', 'store records explicit chosen seed');
store.recordBridgeSeed({ name: 'bridge_seed', seed: '777', source: 'NH_ELECTRON_CHOSEN_SEED' });
store.appendEvent({ layer: 'game-process', category: 'shim-event', type: 'shim.raw.stdout', payload: { line: '{"protocol":"nethack-electron-shim-events/v1","event":{"name":"bridge_seed","seed":"777"}}' } });
store.appendEvent({ layer: 'game-process', category: 'shim-event', type: 'shim.event.parsed', payload: { known: true, name: 'bridge_seed', event: { name: 'bridge_seed', seed: '777' } } });
store.appendEvent({ layer: 'renderer', category: 'message', type: 'message.visible.appended', payload: { displayText: 'Hello adventurer.', messageIndex: 1 } });
store.appendEvent({ layer: 'renderer', category: 'message', type: 'message.visible.appended', payload: { displayText: 'You descend the stairs.', messageIndex: 2 } });
store.appendEvent({ layer: 'renderer', category: 'message', type: 'message.visible.suppressed', payload: { displayText: 'In what direction?', suppressionReason: 'generic-direction-prompt' } });
store.appendEvent({ layer: 'renderer', category: 'user-action', type: 'user-action.input.requested', payload: { source: 'key', payload: { type: 'keycode', keycode: 62 } } });
store.appendEvent({ layer: 'renderer', category: 'shim-send', type: 'shim-send.sent', payload: { source: 'key', payload: { type: 'keycode', keycode: 62 }, sent: true } });
store.appendEvent({ layer: 'game-process', category: 'shim-send', type: 'shim.stdin.write', payload: { line: '{"type":"keycode","keycode":62}' } });
store.appendEvent({ layer: 'renderer', category: 'prompt', type: 'view-effect.render-prompt', requestId: 'prompt-1', payload: { type: 'render-prompt', prompt: { requestId: 'prompt-1', query: 'Really quit?' } } });
store.appendEvent({ layer: 'renderer', category: 'menu', type: 'view-effect.render-menu', requestId: 'menu-1', payload: { type: 'render-menu', menu: { requestId: 'menu-1', prompt: 'Inventory' } } });
store.appendEvent({ layer: 'renderer', category: 'transaction', type: 'view-effect.command-transaction-started', transactionId: 'tx-1', payload: { transaction: { transactionId: 'tx-1', semanticAction: 'stairs.down' } } });
store.appendEvent({ layer: 'renderer', category: 'game-over', type: 'game-over.message.ignored', payload: { text: 'You descend the stairs.', candidate: false } });
store.appendEvent({ layer: 'renderer', category: 'state', type: 'state.public-snapshot', payload: { cell: { semanticKind: 'object', semanticKnown: false, semanticAppearance: 'milky potion', semanticName: 'potion of gain level' } } });
store.finalize({ ok: true, code: 0, mode: 'shim', expected: true });
const runDir = path.join(root, started.run.runId);
const run = readJson(path.join(runDir, 'run.json'));
assert.equal(run.seed.effective, '777', 'effective bridge seed recorded in run.json');
assert.equal(run.seed.mismatch, false, 'matching bridge seed does not mismatch');
const events = readJsonl(path.join(runDir, 'events.jsonl'));
assert.deepEqual(events.filter((event) => event.type === 'message.visible.appended').map((event) => event.payload.displayText), ['Hello adventurer.', 'You descend the stairs.'], 'visible message log order preserved');
assert.ok(events.some((event) => event.type === 'game-over.message.ignored' && event.payload.candidate === false), 'game-over/disclosure decision event recorded');
assert.ok(!JSON.stringify(events).includes('potion of gain level'), 'private semantic names are redacted before diagnostics persist');
const verified = verifyBundle(runDir, { strict: true });
assert.equal(verified.ok, true, 'verifier accepts complete bundle');
assert.equal(fs.existsSync(path.join(runDir, LIVE_MARKER_FILE)), false, 'live marker is removed when a run finalizes cleanly');

const activeRecoveryRoot = tempRoot('diagnostics-active-recovery');
const activeStore = new DiagnosticRunStore({ repoRoot: process.cwd(), env: { NH_DIAGNOSTIC_LOG_DIR: activeRecoveryRoot } });
const activeStarted = activeStore.startRun({ mode: 'shim', startOptions: { seed: '909' }, nethackOptions: '!tutorial' });
const activeRunDir = path.join(activeRecoveryRoot, activeStarted.run.runId);
new DiagnosticRunStore({ repoRoot: process.cwd(), env: { NH_DIAGNOSTIC_LOG_DIR: activeRecoveryRoot } }).recoverUnfinalized();
assert.equal(fs.existsSync(path.join(activeRunDir, 'summary.json')), false, 'recovery skips an unfinalized run owned by a live Electron PID');
activeStore.finalize({ ok: true, code: 0, mode: 'shim', expected: true });

const deadRecoveryRoot = tempRoot('diagnostics-dead-recovery');
const deadStore = new DiagnosticRunStore({ repoRoot: process.cwd(), env: { NH_DIAGNOSTIC_LOG_DIR: deadRecoveryRoot } });
const deadStarted = deadStore.startRun({ mode: 'shim', startOptions: { seed: '808' }, nethackOptions: '!tutorial' });
deadStore.appendEvent({ layer: 'main', category: 'process', type: 'process.signal.received', payload: { signal: 'SIGTERM', classification: 'external-kill-or-parent-shutdown' } });
const deadRunDir = path.join(deadRecoveryRoot, deadStarted.run.runId);
const deadRunPath = path.join(deadRunDir, 'run.json');
const deadRun = readJson(deadRunPath);
deadRun.appProcess.pid = 99999999;
fs.writeFileSync(deadRunPath, `${JSON.stringify(deadRun, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(deadRunDir, LIVE_MARKER_FILE), `${JSON.stringify({ schema: 'nethack-electron-diagnostic-live-run/v1', runId: deadStarted.run.runId, pid: 99999999, status: 'running', updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
new DiagnosticRunStore({ repoRoot: process.cwd(), env: { NH_DIAGNOSTIC_LOG_DIR: deadRecoveryRoot } }).recoverUnfinalized();
const recoveredSummary = readJson(path.join(deadRunDir, 'summary.json'));
assert.equal(recoveredSummary.recoveredAfterCrash, true, 'dead-owner unfinalized run is marked recovered after crash');
assert.equal(recoveredSummary.exit.reason, 'process-signal', 'recovery summary preserves the last recorded termination reason');
assert.equal(recoveredSummary.exit.signal, 'SIGTERM', 'recovery summary preserves the logged signal');

const mismatchRoot = tempRoot('diagnostics-mismatch');
const mismatchStore = new DiagnosticRunStore({ repoRoot: process.cwd(), env: { NH_DIAGNOSTIC_LOG_DIR: mismatchRoot } });
const mismatchStarted = mismatchStore.startRun({ mode: 'shim', startOptions: { seed: '101' }, nethackOptions: '!tutorial' });
mismatchStore.recordBridgeSeed({ name: 'bridge_seed', seed: '202', source: 'test-mismatch' });
mismatchStore.finalize({ ok: true, code: 0, mode: 'shim' });
const mismatchDir = path.join(mismatchRoot, mismatchStarted.run.runId);
assert.throws(() => verifyBundle(mismatchDir), /effective bridge seed matches chosen seed/, 'verifier fails seed mismatch');
const mismatchRun = readJson(path.join(mismatchDir, 'run.json'));
assert.equal(mismatchRun.seed.mismatch, true, 'mismatch marker recorded');

const invalidRoot = tempRoot('diagnostics-invalid');
const invalidStore = new DiagnosticRunStore({ repoRoot: process.cwd(), env: { NH_DIAGNOSTIC_LOG_DIR: invalidRoot } });
const invalidStarted = invalidStore.startRun({ mode: 'shim', startOptions: { seed: '303' }, nethackOptions: '!tutorial' });
invalidStore.recordBridgeSeed({ name: 'bridge_seed', seed: '303', source: 'NH_ELECTRON_CHOSEN_SEED' });
invalidStore.appendEvent({ layer: 'game-process', category: 'shim-event', type: 'shim.raw.stdout', payload: { line: '{"event":{"name":"bridge_seed"}}' } });
invalidStore.finalize({ ok: true });
assert.throws(() => verifyBundle(path.join(invalidRoot, invalidStarted.run.runId)), /raw shim and parsed shim event counts|immediately followed by parsed representation/, 'verifier rejects raw shim without parsed preservation');

console.log('diagnostic log tests OK');
