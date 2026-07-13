const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const Ui = require('../../src/shared/ui-protocol-v2');
const Shim = require('../../src/shared/shim-protocol');
const GameView = require('../../src/shared/game-view-state');
const Help = require('../../src/ux/help-center');
const PreloadContract = require('../../src/shared/preload-contract');
const Recording = require('../../src/shared/recording-schema');
const Replay = require('../../src/shared/replay-adapter');
const slotFixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/ui-protocol-v2/spell-skill-slot-2.json'), 'utf8'));

function spellEvent(overrides = {}) {
  const base = {
    protocol: Ui.protocol,
    sequence: 10,
    eventId: 'evt-spell-rows-test-1',
    eventType: 'spell.rows',
    turn: 3,
    requestId: 'spell-menu-1',
    transactionId: 'spell-command-1',
    source: { layer: 'core', event: 'native.spell.rows', authoritative: true },
    revision: { spell: 1 },
    payload: {
      menuId: 'spell-menu-1',
      revision: 1,
      classificationConfidence: 'typed',
      rows: [
        { name: 'force bolt', selector: 'a', level: 1, pwCost: 5, failure: 12, status: '100%' },
        { name: 'healing', selector: 'b', level: 1, pwCost: 5, failure: 38 },
      ],
    },
  };
  return { ...base, ...overrides, source: { ...base.source, ...(overrides.source || {}) }, revision: { ...base.revision, ...(overrides.revision || {}) }, payload: { ...base.payload, ...(overrides.payload || {}) } };
}
function skillEvent(overrides = {}) {
  const base = {
    protocol: Ui.protocol,
    sequence: 20,
    eventId: 'evt-skill-rows-test-1',
    eventType: 'skill.rows',
    turn: 3,
    requestId: 'skill-menu-1',
    transactionId: 'skill-command-1',
    source: { layer: 'core', event: 'native.skill.rows', authoritative: true },
    revision: { skill: 1 },
    payload: {
      menuId: 'skill-menu-1',
      revision: 1,
      classificationConfidence: 'typed',
      rows: [
        { name: 'dagger', selector: 'a', currentRank: 'Basic', nextRank: 'Skilled', nextCost: 2, canAdvance: true },
        { name: 'long sword', currentRank: 'Unskilled', canAdvance: false },
      ],
    },
  };
  return { ...base, ...overrides, source: { ...base.source, ...(overrides.source || {}) }, revision: { ...base.revision, ...(overrides.revision || {}) }, payload: { ...base.payload, ...(overrides.payload || {}) } };
}

for (const event of [spellEvent(), skillEvent(), slotFixture.valid.spellUnknownOmissions, slotFixture.valid.skillUnknownOmissions]) {
  const checked = Ui.validateEventEnvelope(event);
  assert.equal(checked.ok, true, checked.errors.join('; '));
  const lowered = Shim.normalizeRawShimEvent(event);
  assert.equal(lowered.valid, true, lowered.errors.join('; '));
  assert.deepEqual(lowered.event, event, 'shim protocol preserves an already-validated authoritative envelope exactly');
  assert.deepEqual(PreloadContract.cloneFreeze(event), event, 'generic preload/IPC boundary preserves authoritative rows');
}

const invalidCases = [
  spellEvent({ payload: { rows: [{ name: 'force bolt', predictedDamage: '2d6' }] } }),
  spellEvent({ payload: { rows: [{ name: 'force bolt', selector: 'a' }, { name: 'healing', selector: 'a' }] } }),
  spellEvent({ source: { layer: 'renderer', authoritative: false } }),
  spellEvent({ requestId: 'other-menu' }),
  skillEvent({ payload: { rows: [{ name: 'dagger', selector: 'a', currentRank: 'Basic', canAdvance: false }] } }),
  skillEvent({ payload: { rows: [{ name: 'dagger', currentRank: 'Legendary', canAdvance: false }] } }),
];
for (const event of invalidCases) assert.equal(Ui.validateEventEnvelope(event).ok, false, `invalid rows fail closed: ${JSON.stringify(event)}`);

const view = GameView.createGameViewState();
view.process({ name: 'shim_start_menu', window: 7, requestId: 'spell-menu-1', menuId: 'spell-menu-1', transactionId: 'spell-command-1', menuPurpose: 'spell.rows', owner: { kind: 'system', window: 7 }, lifecycleRevision: 1 });
let result = view.process(spellEvent());
assert(result.effects.some((effect) => effect.type === 'magic-rows-changed'));
assert.equal(view.state.currentMenu.publicRows.classificationConfidence, 'typed');
assert.equal(view.state.currentMenu.publicRows.authoritative, true);
assert.equal(view.state.currentMenu.publicRows.rows[0].pwCost, 5);
result = view.process(spellEvent());
assert.equal(result.effects[0].type, 'magic-rows-rejected');
assert.match(result.effects[0].reason, /duplicate/);
result = view.process(spellEvent({ eventId: 'evt-spell-old', sequence: 9, revision: { spell: 2 }, payload: { revision: 2 } }));
assert.equal(result.effects[0].type, 'magic-rows-rejected');
assert.match(result.effects[0].reason, /out-of-order/);
result = view.process(spellEvent({ eventId: 'evt-spell-repeated-revision', sequence: 11 }));
assert.equal(result.effects[0].type, 'magic-rows-rejected');
assert.match(result.effects[0].reason, /revision/);
result = view.process(skillEvent());
assert.equal(result.effects[0].type, 'magic-rows-rejected');
assert.match(result.effects[0].reason, /request does not own/);

const acceptedSpellSnapshot = JSON.stringify(view.state.spellRows);
result = view.process(spellEvent({
  eventId: 'evt-spell-invalid-atomic',
  sequence: 12,
  revision: { spell: 2 },
  payload: { revision: 2, rows: [{ name: 'force bolt', selector: 'a' }, { name: 'healing', selector: 'a' }] },
}));
assert.equal(result.effects[0].type, 'magic-rows-rejected');
assert.equal(JSON.stringify(view.state.spellRows), acceptedSpellSnapshot, 'one invalid row rejects the entire collection without mutating the accepted snapshot');

const ownerless = GameView.createGameViewState();
result = ownerless.process(spellEvent());
assert.equal(result.effects[0].type, 'magic-rows-rejected');
assert.match(result.effects[0].reason, /request does not own/);
assert.equal(ownerless.state.spellRows, null, 'ownerless typed delivery cannot install a snapshot');

const wrongKind = GameView.createGameViewState();
wrongKind.process({ name: 'shim_start_menu', window: 9, requestId: 'spell-menu-1', menuId: 'spell-menu-1', transactionId: 'spell-command-1', menuPurpose: 'skill.rows', owner: { kind: 'system', window: 9 }, lifecycleRevision: 1 });
result = wrongKind.process(spellEvent());
assert.equal(result.effects[0].type, 'magic-rows-rejected');
assert.match(result.effects[0].reason, /request does not own/);
assert.equal(wrongKind.state.spellRows, null, 'matching request ID with the wrong menu purpose still fails closed');

const fallbackSpell = GameView.createGameViewState();
fallbackSpell.process({ name: 'shim_start_menu', window: 8, requestId: 'fallback-spell-menu', menuId: 'fallback-spell-menu', menuPurpose: 'spell.rows', lifecycleRevision: 1 });
fallbackSpell.process({ name: 'shim_add_menu', window: 8, selector: 97, text: 'force bolt             1   attack       12%      100%', requestId: 'fallback-spell-menu', menuId: 'fallback-spell-menu', menuPurpose: 'spell.rows', lifecycleRevision: 1 });
fallbackSpell.process({ name: 'shim_end_menu', window: 8, prompt: 'Currently known spells', requestId: 'fallback-spell-menu', menuId: 'fallback-spell-menu', menuPurpose: 'spell.rows', lifecycleRevision: 1 });
assert.deepEqual(fallbackSpell.state.currentMenu.publicRows.rows, [{ name: 'force bolt', selector: 'a', level: 1, failure: 12, status: '100%' }]);
assert.equal(fallbackSpell.state.currentMenu.publicRows.classificationConfidence, 'fallback');
assert.equal('pwCost' in fallbackSpell.state.currentMenu.publicRows.rows[0], false, 'fallback omits Pw that legacy text did not publish');
const fallbackOnlySnapshot = fallbackSpell.snapshot().spellRows;

fallbackSpell.process(spellEvent({
  eventId: 'evt-fallback-upgraded-to-typed',
  sequence: 10,
  requestId: 'fallback-spell-menu',
  transactionId: 'fallback-spell-command',
  revision: { spell: 1 },
  payload: { menuId: 'fallback-spell-menu', revision: 1 },
}));
assert.equal(fallbackSpell.state.currentMenu.publicRows.classificationConfidence, 'typed', 'typed rows replace fallback for the owned request');
fallbackSpell.process({ name: 'shim_end_menu', window: 8, prompt: 'Currently known spells', requestId: 'fallback-spell-menu', menuId: 'fallback-spell-menu', menuPurpose: 'spell.rows', lifecycleRevision: 1 });
assert.equal(fallbackSpell.state.currentMenu.publicRows.classificationConfidence, 'typed', 'later legacy parsing never replaces owned typed rows');

const fallbackSkillRows = Shim.compatibilitySkillRowsFromMenu({ items: [
  { selector: 97, text: ' dagger [Basic]' },
  { selector: 0, text: ' * long sword [Unskilled]' },
  { selector: 0, text: 'Weapon Skills' },
] });
assert.deepEqual(fallbackSkillRows, [
  { name: 'dagger', currentRank: 'Basic', canAdvance: true, selector: 'a' },
  { name: 'long sword', currentRank: 'Unskilled', canAdvance: false },
]);
assert.equal('nextRank' in fallbackSkillRows[0], false);
assert.equal('nextCost' in fallbackSkillRows[0], false);

const normalizedSpellSnapshot = Help.normalizeMagicRowsSnapshot(view.state.spellRows);
assert.equal(normalizedSpellSnapshot.source, 'typed');
assert.equal(normalizedSpellSnapshot.rows[0].failure, '12%');
assert.throws(() => Help.normalizeMagicRowsSnapshot({ ...view.state.spellRows, authoritative: false }), /authoritative provenance/);
const normalizedFallback = Help.normalizeMagicRowsSnapshot(fallbackOnlySnapshot);
assert.equal(normalizedFallback.source, 'fallback');
assert.equal(normalizedFallback.rows[0].classificationConfidence, 'fallback');

const recordedSpell = { ...spellEvent(), sequence: 1 };
const recordedSkill = { ...skillEvent(), sequence: 2 };
const recording = { schema: Recording.v2, events: [
  { type: 'ui-protocol-event', event: recordedSpell },
  { type: 'ui-protocol-event', event: recordedSkill },
] };
assert.equal(Recording.validateRecording(recording).ok, true);
const replay = Replay.normalizeRecording(recording);
assert.equal(replay.ok, true);
assert.equal(replay.protocolEvents.length, 2);
assert.deepEqual(replay.protocolEvents.map((entry) => entry.event.eventType), ['spell.rows', 'skill.rows']);
assert.equal(replay.protocolEvents[0].event.payload.rows[0].predictedDamage, undefined);

const browserContext = { console };
browserContext.window = browserContext;
browserContext.self = browserContext;
browserContext.globalThis = browserContext;
vm.createContext(browserContext);
for (const relative of ['public-blockers.js', 'public-item-knowledge.js', 'ui-protocol-v2.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/shared', relative), 'utf8'), browserContext, { filename: relative });
}
assert(browserContext.NetHackUiProtocolV2.eventTypes.includes('spell.rows'));
assert(browserContext.NetHackUiProtocolV2.eventTypes.includes('skill.rows'));
assert.equal(Object.isFrozen(browserContext.NetHackUiProtocolV2), true);

console.log(JSON.stringify({ ok: true, invalidCases: invalidCases.length, typedSpellRows: view.state.spellRows.rows.length, fallbackSpellRows: fallbackSpell.state.spellRows.rows.length }, null, 2));
