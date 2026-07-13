const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const StatusHud = require('../../src/shared/status-hud.js');
const MessageLog = require('../../src/shared/message-log.js');
const StatusPresentation = require('../../src/ux/status-presentation.js');
const ConsequenceFeed = require('../../src/ux/consequence-feed.js');
const MessagePresentation = require('../../src/ux/message-presentation.js');
const CharacterSheet = require('../../src/ux/character-sheet.js');
const AppShell = require('../../src/ux/app-shell.js');

const values = new Map([
  [0, 'Aster the Ranger'], [1, '17'], [2, '13'], [3, '15'], [4, '12'], [5, '11'], [6, '10'],
  [7, 'Neutral'], [8, '450'], [9, 'Burdened'], [10, '\\G0000002a:42'], [11, '3'], [12, '8'],
  [13, '4'], [14, '5'], [16, '81'], [17, 'Hungry'], [18, '6'], [19, '24'],
  [20, 'The Dungeons of Doom:2'], [21, '390'], [22, `mask ${0x00000002 | 0x00000008 | 0x04000000}`],
  [23, 'a short bow'], [24, 'leather armor'], [25, 'room'], [26, 'NetHack 3.7'],
]);

const compact = StatusHud.buildStatusPresentation(values);
assert.equal(compact.density, 'compact');
assert.deepEqual(compact.persistent.map((group) => group.id), ['hero', 'vitals', 'dungeon', 'urgent']);
const persistentLabels = compact.persistent.flatMap((group) => group.items.map((item) => item.label));
for (const label of ['Hero', 'HP', 'Pw', 'AC', 'XL', 'Dlvl', 'Gold', 'Hunger', 'Carry', 'Senses', 'Mind', 'Held']) assert(persistentLabels.includes(label), `${label} is persistent`);
for (const hiddenLabel of ['Str', 'Dex', 'Wield', 'Armor', 'Version', 'Score', 'Time']) assert(!persistentLabels.includes(hiddenLabel), `${hiddenLabel} stays on demand`);
assert(compact.urgent.every((item) => ['warning', 'danger'].includes(item.severity)));
const satiated = StatusHud.buildStatusPresentation(new Map([[17, 'Satiated']])).persistent.flatMap((group) => group.items).find((item) => item.label === 'Hunger');
assert.equal(satiated.role, 'persistent', 'Satiated is informative, not urgent');
assert(compact.urgent.every((item) => item.explanation && !/duration \d/i.test(item.explanation)), 'urgent explanations do not invent durations');
const detailLabels = compact.detail.flatMap((group) => group.items.map((item) => item.label));
for (const label of ['Str', 'Dex', 'Wield', 'Armor', 'Version', 'Score', 'Time']) assert(detailLabels.includes(label), `${label} remains available in Character`);
const detailedLabels = StatusHud.buildStatusPresentation(values, { density: 'detailed' }).persistent.flatMap((group) => group.items.map((item) => item.label));
for (const label of ['Align', 'XP', 'Time']) assert(detailedLabels.includes(label), `${label} appears in Detailed HUD`);
assert.equal(StatusHud.pairStatusValue('5', ''), '5');
assert.equal(StatusHud.pairStatusValue('', ''), '');
assert(!StatusHud.pairStatusValue('5', '').includes('?'), 'unknown maximum is omitted, not guessed');
assert.equal(StatusPresentation.normalizeDensity('anything'), 'compact');
assert.match(StatusPresentation.conditionExplanation(compact.urgent[0]), /NetHack|reported|active/i);

const log = MessageLog.createMessageLog();
assert(log.append({ id: 'm1', sequence: 1, turn: 7, canonicalText: '  The goblin misses.  ', source: 'core-message' }).appended);
assert(log.append({ id: 'm2', sequence: 2, turn: 7, canonicalText: '  The goblin misses.  ', source: 'core-message' }).appended, 'distinct repeated messages remain exact');
assert(log.append({ id: 'm3', sequence: 3, turn: 8, canonicalText: '  The goblin misses.  ', source: 'core-message' }).appended);
assert.equal(log.append({ id: 'm3', sequence: 3, turn: 8, canonicalText: '  The goblin misses.  ', source: 'core-message' }).appended, false, 'event IDs are idempotent');
assert(log.append({ id: 'm4', sequence: 4, canonicalText: 'Choose a direction', source: 'core-message' }).appended, 'explicit canonical prompts remain in exact History');
assert.deepEqual(log.entries(), ['  The goblin misses.  ', '  The goblin misses.  ', '  The goblin misses.  ', 'Choose a direction']);
const grouped = log.grouped();
assert.equal(grouped.length, 3, 'only exact repetitions with exact same turn group');
assert.equal(grouped[0].count, 2);
assert.deepEqual(grouped[0].events.map((event) => event.canonicalText), ['  The goblin misses.  ', '  The goblin misses.  '], 'grouping is reversible');
assert.equal(log.search('GOBLIN').events.length, 3);
log.append({ id: 'lore-1', sequence: 5, canonicalText: 'Exact opening line one.', source: 'core-message' });
log.append({ id: 'lore-repeat', sequence: 6, canonicalText: 'Exact opening line one.', source: 'core-message' });
log.setOpeningChronicle(['Exact opening line one.', 'Exact opening line two.']);
assert.deepEqual(log.search('opening').openingChronicle, ['Exact opening line one.', 'Exact opening line two.']);
assert.deepEqual(log.search('opening').events.map((event) => event.id), ['lore-repeat'], 'only the identified opening occurrence is grouped as lore');
assert.throws(() => MessageLog.normalizeMessageEvent({ id: 'bad', sequence: -1, canonicalText: 'x' }), /sequence/);
assert.throws(() => MessageLog.normalizeMessageEvent({ id: 'bad', sequence: 1, canonicalText: 'x', turn: -1 }), /turn/);

const unclassified = ConsequenceFeed.presentConsequence({ id: 'c1', sequence: 1, canonicalText: 'The moon is visible.' });
assert.equal(unclassified.classificationConfidence, 'unclassified');
assert.equal(unclassified.canonicalText, 'The moon is visible.');
const miss = ConsequenceFeed.presentConsequence({ id: 'c2', sequence: 2, canonicalText: 'The goblin misses.' });
assert.equal(miss.category, 'miss');
assert.equal(miss.classificationConfidence, 'conservative');
assert.equal(ConsequenceFeed.presentConsequence({ id: 'damage', sequence: 3, canonicalText: 'You are hit by an arrow.' }).category, 'damage', 'damage classification outranks broad status fallback');
const typed = ConsequenceFeed.presentConsequence({ id: 'c3', sequence: 3, canonicalText: 'Exact core outcome.', category: 'hazard', severity: 'danger', classificationConfidence: 'typed' });
assert.equal(typed.category, 'hazard');
assert.equal(typed.classificationConfidence, 'typed', 'typed classification outranks fallback');
const feed = ConsequenceFeed.createConsequenceFeed({ feedLimit: 4 });
feed.syncCanonicalLines(['First exact line.', 'The goblin misses.', 'Unknown exact line.', 'The door is locked.', 'Last exact line.'], { runIdentity: 'run-alpha' });
assert.deepEqual(feed.recent().map((event) => event.canonicalText), ['The goblin misses.', 'Unknown exact line.', 'The door is locked.', 'Last exact line.']);
assert(feed.recent().some((event) => event.classificationConfidence === 'unclassified'), 'unclassified lines stay visible');
assert(feed.log.events().every((event) => event.turn === undefined), 'unknown live turns remain omitted before protocol slot 4');
const alphaIds = feed.log.events().map((event) => event.id);
feed.syncCanonicalLines([]);
assert.deepEqual(feed.log.events().map((event) => event.id), alphaIds, 'a transient empty renderer snapshot preserves durable History and synchronization state');
feed.syncCanonicalLines(['First exact line.', 'The goblin misses.', 'Unknown exact line.', 'The door is locked.', 'Last exact line.'], { runIdentity: 'run-alpha' });
assert.deepEqual(feed.log.events().map((event) => event.id), alphaIds, 'same-run reconnect is idempotent after a transient empty snapshot');
feed.syncCanonicalLines(['Last exact line.', 'Sliding window addition.']);
assert(feed.log.entries().includes('First exact line.') && feed.log.entries().includes('Sliding window addition.'), 'a sliding source window does not discard durable history');
const afterSlidingWindow = feed.log.events().map((event) => event.id);
feed.syncCanonicalLines(['Last exact line.']);
feed.syncCanonicalLines(['Last exact line.', 'Sliding window addition.']);
assert.deepEqual(feed.log.events().map((event) => event.id), afterSlidingWindow, 'prefix contraction and regrowth is treated as a transient snapshot, not a new event');
feed.syncCanonicalLines(['Last exact line.', 'Sliding window addition.'], { runIdentity: 'run-alpha' });
assert.deepEqual(feed.log.events().map((event) => event.id), afterSlidingWindow, 'same-run sliding-window reconnect does not duplicate canonical lines');
const explicitReset = feed.resetForRun('run-beta');
assert.equal(explicitReset.reset, true);
assert.deepEqual(feed.log.entries(), [], 'only an explicit trustworthy run boundary resets durable History');
feed.syncCanonicalLines(['Last exact line.']);
const betaId = feed.log.events()[0].id;
assert.deepEqual(feed.log.entries(), ['Last exact line.'], 'canonical text may legitimately be reused in a new run');
assert(!alphaIds.includes(betaId), 'reused canonical text receives a new event identity across run identities');
assert.equal(feed.resetForRun('run-beta').reset, false, 'repeated same-run boundary signals are idempotent');
assert.deepEqual(feed.log.entries(), ['Last exact line.']);
feed.syncCanonicalLines(['Last exact line.'], { runIdentity: 'run-gamma' });
assert.deepEqual(feed.log.entries(), ['Last exact line.'], 'a caller-supplied changed run identity resets before ingesting even when canonical text is reused');
assert.notEqual(feed.log.events()[0].id, betaId);
assert.equal(feed.runIdentity(), 'run-gamma');
assert.throws(() => feed.resetForRun(''), /trustworthy run identity/);
const disconnectedShell = AppShell.createAppShellController({ documentRoot: null });
assert.throws(() => disconnectedShell.resetForRun('run-before-connect'), /must be connected/, 'shell run boundaries fail closed before History is available');

const historyModel = MessagePresentation.createHistoryModel(log);
historyModel.setQuery('goblin');
assert.equal(historyModel.results().events.length, 3);
historyModel.select('m2');
assert.equal(historyModel.selected().canonicalText, '  The goblin misses.  ');
historyModel.setQuery('not present');
assert.equal(historyModel.results().events.length, 0);

const character = CharacterSheet.buildCharacterSheetModel(values);
assert.equal(character.hero, 'Aster the Ranger');
assert(character.groups.some((group) => group.id === 'attributes'));
assert(character.groups.some((group) => group.id === 'gear'));
assert(character.groups.some((group) => group.id === 'system'));
assert(!JSON.stringify(character).includes('(hidden)'));

assert.equal(AppShell.hasCanonicalMessageContent([]), false, 'a transient empty source snapshot does not replace Opening chronicle grouping');
assert.equal(AppShell.hasCanonicalMessageContent(['', '   ']), false, 'blank-only transient source content is not a chronicle boundary');
assert.equal(AppShell.hasCanonicalMessageContent(['Exact canonical line.']), true);
assert.equal(AppShell.levelDestinationLabel('Dlvl:2'), 'Dungeon level 2');
assert.equal(AppShell.levelDestinationLabel('The Dungeons of Doom:3'), 'The Dungeons of Doom, level 3');
assert.equal(AppShell.levelDestinationLabel('Quest'), 'Dungeon level Quest');
assert.deepEqual(AppShell.computeFollowTranslation({ containerWidth: 400, containerHeight: 300, contentWidth: 1000, contentHeight: 600, cursorCenterX: 800, cursorCenterY: 100 }), { x: -600, y: 0 });
assert.deepEqual(AppShell.computeFollowTranslation({ containerWidth: 400, containerHeight: 300, contentWidth: 200, contentHeight: 100, cursorCenterX: 20, cursorCenterY: 20 }), { x: 100, y: 100 });

const root = path.resolve(__dirname, '..', '..');
const context = { console, setTimeout() {}, clearTimeout() {} };
context.window = context;
context.self = context;
vm.createContext(context);
for (const source of ['shared/status-hud.js', 'shared/message-log.js', 'ux/status-presentation.js', 'ux/message-presentation.js', 'ux/consequence-feed.js', 'ux/character-sheet.js', 'ux/app-shell.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'src', source), 'utf8'), context, { filename: source });
}
for (const name of ['NetHackStatusHud', 'NetHackMessageLog', 'NetHackUxStatusPresentation', 'NetHackUxMessagePresentation', 'NetHackUxConsequenceFeed', 'NetHackUxCharacterSheet', 'NetHackUxAppShell']) {
  assert.equal(Object.isFrozen(context[name]), true, `${name} browser contract is frozen`);
}

console.log('ok - UXM-02 status, message, consequence, history, character, transition, and follow-view domain contracts');
