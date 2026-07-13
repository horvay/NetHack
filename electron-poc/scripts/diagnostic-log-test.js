#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { DiagnosticRunStore, LIVE_MARKER_FILE, chooseSeed, safeJson, sanitizeShimLine } = require('../src/main/diagnostic-log');
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
store.appendEvent({ layer: 'game-process', category: 'shim-event', type: 'shim.event.adversarial-omission', payload: { item: { objectId: 41, displayName: 'potion of gain level', text: 'a - potion of gain level', name: 'potion of gain level', hiddenIdentity: 'potion of gain level' } } });
const hiddenGeneric = 'potion of gain level';
const diagnosticNamingMatrix = [
  { id: 'missing', item: { displayName: hiddenGeneric, calledName: 'missing-call', individualName: 'MissingBlade' }, forbidden: ['missing-call', 'MissingBlade'] },
  { id: 'empty', item: { displayName: hiddenGeneric, known: {}, calledName: 'empty-call', individualName: 'EmptyBlade' }, forbidden: ['empty-call', 'EmptyBlade'] },
  { id: 'false', item: { displayName: hiddenGeneric, known: { naming: false }, calledName: 'false-call', individualName: 'FalseBlade' }, forbidden: ['false-call', 'FalseBlade'] },
  { id: 'contradictory', item: { displayName: hiddenGeneric, semanticKnown: true, known: { identity: false, naming: true }, calledName: 'contradictory-call', individualName: 'ContradictoryBlade' }, forbidden: ['contradictory-call', 'ContradictoryBlade'] },
  { id: 'hidden-generic-repeated', item: { displayName: hiddenGeneric, semanticAppearance: 'milky potion', known: { naming: true }, calledName: hiddenGeneric, individualName: hiddenGeneric }, forbidden: [hiddenGeneric] },
  { id: 'hidden-generic-wrapped', item: { displayName: hiddenGeneric, semanticAppearance: 'milky potion', known: { naming: true }, calledName: `reserve ${hiddenGeneric} reserve`, individualName: `the ${hiddenGeneric} blade` }, forbidden: [`reserve ${hiddenGeneric} reserve`, `the ${hiddenGeneric} blade`, hiddenGeneric] },
  { id: 'punctuation-obfuscated', item: { displayName: hiddenGeneric, semanticAppearance: 'milky potion', known: { naming: true }, calledName: 'potion-of-gain-level', individualName: 'potion.of.gain.level' }, forbidden: ['potion-of-gain-level', 'potion.of.gain.level', hiddenGeneric] },
  { id: 'zero-width-obfuscated', item: { displayName: hiddenGeneric, semanticAppearance: 'milky potion', known: { naming: true }, calledName: 'potion\u200b of\u200b gain\u200b level', individualName: 'potion\u200d of\u200d gain\u200d level' }, forbidden: ['potion\u200b of\u200b gain\u200b level', 'potion\u200d of\u200d gain\u200d level', hiddenGeneric] },
];
function recursivelyContains(value, needle) {
  if (typeof value === 'string') return value.includes(needle);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, entry]) => key.includes(needle) || recursivelyContains(entry, needle));
}
const hostileAliasValues = [
  'shim_potion_of_gain_level', 'SHIM_potion.of.gain.level', 'Shim_potion:of:gain:level',
  'bridge_potion-of-gain-level', 'BRIDGE_potion_of_gain_level', 'Bridge_potion.of:gain.level',
  'shim_add_menu',
];
for (const [index, hostileName] of hostileAliasValues.entries()) {
  const hostileItem = { objectId: 700 + index, name: hostileName, known: { identity: index % 2 ? false : undefined } };
  for (const [shape, source] of [
    ['root', hostileItem],
    ['nested-object', { payload: { item: hostileItem } }],
    ['nested-array', { payload: [{ rows: [hostileItem] }] }],
  ]) {
    const sanitized = safeJson(source);
    assert.equal(recursivelyContains(sanitized, hostileName), false, `${shape}/${hostileName}: item alias is never mistaken for event metadata`);
  }
  const shimSanitized = JSON.parse(sanitizeShimLine(JSON.stringify({ name: 'shim_update_inventory', items: [hostileItem] })));
  assert.equal(recursivelyContains(shimSanitized, hostileName), false, `${hostileName}: sanitizeShimLine removes hostile nested item alias`);
  store.appendEvent({ layer: 'renderer', category: 'diagnostic', type: `diagnostic.alias.${index}`, payload: { rows: [{ item: hostileItem }] } });
}
for (const [field, value] of [['name', 'shim_potion_of_gain_level'], ['display', hiddenGeneric], ['text', hiddenGeneric], ['calledName', hiddenGeneric], ['individualName', hiddenGeneric]]) {
  const nestedAlias = { item: { name: 'shim_add_menu', [field]: value } };
  assert.equal(recursivelyContains(safeJson(nestedAlias), value), false, `nested ${field}-only alias cannot use a recognized event prefix/name exception`);
}
assert.equal(recursivelyContains(safeJson({ item: { name: 'shim_potion_of_gain_level' } }), 'shim_potion_of_gain_level'), false, 'nested name-only hostile alias is projected even without objectId or knowledge fields');
const legitimateRootEvents = [
  { name: 'bridge_seed', seed: '777' },
  { name: 'shim_add_menu', window: 9, selector: 97, text: 'a - Search for traps', semanticKind: 'menu-choice' },
];
for (const event of legitimateRootEvents) assert.equal(safeJson(event).name, event.name, `${event.name}: recognized root event metadata survives structural/contextual classification`);
assert.equal(safeJson(legitimateRootEvents[1]).text, 'a - Search for traps', 'root non-object menu event preserves exact selectable action prose');
assert.equal(safeJson({ event: legitimateRootEvents[1] }).event.text, 'a - Search for traps', 'recognized nested event field preserves exact selectable action prose');
assert.equal(safeJson({ name: 'bridge_seed', known: true, event: { name: 'bridge_seed', seed: '777' } }).name, 'bridge_seed', 'normalized event wrapper retains its recognized event metadata name');
const ownedMenuAnswer = { type: 'shim-event', name: 'bridge_menu_answer', window: 5, return: 0, selector: 0, requestId: 'menu-r3', transactionId: 'inventory-t3', inputTransactionId: 'inventory-t3', activeRequestMatch: true, inputMatchesMenuTransaction: true, known: { identity: false } };
assert.equal(JSON.parse(sanitizeShimLine(JSON.stringify(ownedMenuAnswer))).name, 'bridge_menu_answer', 'real typed menu-answer event identity survives diagnostic projection');
assert.equal(safeJson({ name: 'shim_raw_print', text: 'hello adventurer' }).text, 'hello adventurer', 'legitimate root raw-print event text remains diagnostic metadata');
assert.equal(safeJson({ event: { name: 'shim_raw_print', text: 'hello adventurer' } }).event.text, 'hello adventurer', 'legitimate nested raw-print event text remains diagnostic metadata');
assert.equal(safeJson({ event: { ...legitimateRootEvents[1], semanticKind: 'object', text: 'a - potion of gain level', semanticKnown: false } }).event.text, 'a - item', 'recognized nested object event still routes item text through public knowledge');
for (const field of ['displayName', 'display', 'itemName', 'targetText', 'calledName', 'individualName']) {
  const hostileEvent = { name: 'shim_add_menu', window: 9, [field]: hiddenGeneric };
  assert.equal(recursivelyContains(safeJson(hostileEvent), hiddenGeneric), false, `root recognized event cannot exempt hostile ${field}`);
  assert.equal(recursivelyContains(safeJson({ event: hostileEvent }), hiddenGeneric), false, `nested recognized event cannot exempt hostile ${field}`);
}
const aliasProbe = safeJson({ nested: [{ itemName: hiddenGeneric, targetText: hiddenGeneric, display: hiddenGeneric, displayName: hiddenGeneric, text: hiddenGeneric, name: `shim_${hiddenGeneric}` }] });
assert.equal(recursivelyContains(aliasProbe, hiddenGeneric), false, 'diagnostic itemName/targetText/displayName/text/name aliases fail closed recursively');
const malformedShimDiagnostic = sanitizeShimLine(`{\"calledName\":\"${hiddenGeneric}\"`);
assert.equal(malformedShimDiagnostic.includes(hiddenGeneric), false, 'malformed shim lines never fall back to raw spoiler-bearing text');
assert.deepEqual(JSON.parse(malformedShimDiagnostic), { malformedShimLine: true, bytes: Buffer.byteLength(`{\"calledName\":\"${hiddenGeneric}\"`) }, 'malformed shim diagnostic keeps only bounded structural evidence');
for (const entry of diagnosticNamingMatrix) {
  const payload = { wrapped: [{ item: entry.item }] };
  const sanitized = safeJson(payload);
  for (const forbidden of entry.forbidden) assert.equal(recursivelyContains(sanitized, forbidden), false, `${entry.id}: safeJson recursively omits unauthorized naming value ${JSON.stringify(forbidden)}`);
  const shimLine = sanitizeShimLine(JSON.stringify({ name: 'shim_update_inventory', items: [{ selector: 97, ...entry.item }] }));
  const shimJson = JSON.parse(shimLine);
  for (const forbidden of entry.forbidden) assert.equal(recursivelyContains(shimJson, forbidden), false, `${entry.id}: shim-line diagnostics recursively omit unauthorized naming value ${JSON.stringify(forbidden)}`);
  store.appendEvent({ layer: 'renderer', category: 'diagnostic', type: `diagnostic.naming.${entry.id}`, payload });
}
const authorizedNamingPayload = {
  unknown: { displayName: 'a milky potion called sunrise', semanticKnown: false, semanticAppearance: 'milky potion', known: { naming: true }, calledName: 'sunrise' },
  identified: { displayName: 'a long sword named Dawnbringer', semanticKnown: true, known: { identity: true, naming: true }, individualName: 'Dawnbringer' },
  overlap: { displayName: 'a long sword', semanticKnown: true, known: { identity: true, naming: true }, individualName: 'sword' },
};
store.appendEvent({ layer: 'renderer', category: 'diagnostic', type: 'diagnostic.naming.authorized-safe', payload: authorizedNamingPayload });
store.finalize({ ok: true, code: 0, mode: 'shim', expected: true });
const runDir = path.join(root, started.run.runId);
const run = readJson(path.join(runDir, 'run.json'));
assert.equal(run.seed.effective, '777', 'effective bridge seed recorded in run.json');
assert.equal(run.seed.mismatch, false, 'matching bridge seed does not mismatch');
const events = readJsonl(path.join(runDir, 'events.jsonl'));
assert.deepEqual(events.filter((event) => event.type === 'message.visible.appended').map((event) => event.payload.displayText), ['Hello adventurer.', 'You descend the stairs.'], 'visible message log order preserved');
assert.ok(events.some((event) => event.type === 'game-over.message.ignored' && event.payload.candidate === false), 'game-over/disclosure decision event recorded');
assert.ok(!JSON.stringify(events).includes('potion of gain level'), 'private semantic names are redacted before diagnostics persist');
for (const [index, hostileName] of hostileAliasValues.entries()) {
  const persistedAlias = events.find((event) => event.type === `diagnostic.alias.${index}`);
  assert.ok(persistedAlias, `${hostileName}: alias probe persisted to events.jsonl`);
  assert.equal(recursivelyContains(persistedAlias, hostileName), false, `${hostileName}: events.jsonl excludes hostile nested item alias`);
}
for (const entry of diagnosticNamingMatrix) {
  const persisted = events.find((event) => event.type === `diagnostic.naming.${entry.id}`);
  assert.ok(persisted, `${entry.id}: direct appendEvent record persisted`);
  for (const forbidden of entry.forbidden) assert.equal(recursivelyContains(persisted, forbidden), false, `${entry.id}: events.jsonl recursively omits unauthorized naming value ${JSON.stringify(forbidden)}`);
  assert.equal(recursivelyContains(persisted, 'calledName'), false, `${entry.id}: unauthorized calledName key is omitted from events.jsonl`);
  assert.equal(recursivelyContains(persisted, 'individualName'), false, `${entry.id}: unauthorized individualName key is omitted from events.jsonl`);
}
const authorizedNamingEvent = events.find((event) => event.type === 'diagnostic.naming.authorized-safe');
assert.equal(authorizedNamingEvent.payload.unknown.calledName, 'sunrise', 'events.jsonl preserves exact authorized unknown-item calledName');
assert.equal(authorizedNamingEvent.payload.identified.individualName, 'Dawnbringer', 'events.jsonl preserves exact authorized known-item individualName');
assert.equal(authorizedNamingEvent.payload.overlap.displayName, 'a long sword named sword', 'diagnostics use exact marker grammar rather than substring dedupe');
assert.equal(authorizedNamingEvent.payload.unknown.known.identity, false, 'authorized player name does not authorize hidden generic identity in diagnostics');
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
