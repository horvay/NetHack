const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Catalog = require('../../src/ux/command-catalog');
const Palette = require('../../src/ux/command-palette');
const Help = require('../../src/ux/help-center');
const Onboarding = require('../../src/ux/onboarding');
const Creation = require('../../src/ux/character-creation');
const CharacterOptions = require('../../src/shared/character-options');
const Runtime = require('../../src/ux/runtime');

const catalog = Catalog.createCommandCatalog();
const entries = catalog.entries();
assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length, 'catalog ids are unique');
assert.deepEqual(Catalog.categories, ['Items', 'Equipment', 'Magic', 'Dungeon', 'Character', 'Run', 'Help']);
assert.equal(Object.isFrozen(entries), true);
assert.equal(Object.isFrozen(entries[0]), true);
assert.equal(catalog.search('drink potion')[0].command.id, 'item.quaff', 'friendly alias finds Quaff');
assert.equal(catalog.search('q')[0].command.id, 'item.quaff', 'lowercase shortcut finds Quaff');
assert.equal(catalog.search('Q')[0].command.id, 'equipment.quiver', 'case-sensitive shortcut ranks Set quiver');
assert.equal(catalog.get('equipment.wear').publicShortcut, 'W', 'uppercase Wear key stays uppercase');
assert.equal(catalog.get('magic.cast').publicShortcut, 'Z', 'uppercase Cast key stays uppercase');
assert.equal(catalog.get('run.save').internalRoute.value, 'S', 'Save preserves classic uppercase route');
assert.equal(catalog.get('run.quit').internalRoute.value, '#quit\n', 'Quit preserves exact extended route and newline');
assert.equal(catalog.get('magic.skills').internalRoute.value, '#enhance\n');
assert.equal(catalog.get('dungeon.whatis').internalRoute.value, '/');
assert.equal(catalog.get('dungeon.look-here').internalRoute.value, ':');
assert.deepEqual(Catalog.movementCommandPlan({ mode: 'walk', direction: 'h', count: 1 }), { ok: true, mode: 'walk', direction: 'h', count: 1, text: 'h' });
assert.equal(Catalog.movementCommandPlan({ mode: 'run', direction: 'k', count: 12 }).text, '12gk');
assert.equal(Catalog.movementCommandPlan({ mode: 'fight', direction: 'l', count: 3 }).text, '3Fl');
assert.equal(Catalog.movementCommandPlan({ mode: 'walk', direction: 'x', count: 1 }).ok, false);
assert.equal(Catalog.movementCommandPlan({ mode: 'walk', direction: 'h', count: 1000 }).ok, false);
assert.equal(Catalog.displayKeycap('W', 'contextual', { palette: true }), 'W');
assert.equal(Catalog.displayKeycap('W', 'contextual', {}), '');
assert.equal(Catalog.displayKeycap('W', 'never', { palette: true }), '');
assert.equal(Catalog.hashActivation().dispatch.value, '#');
assert.equal(Catalog.hashActivation().consumesClassicKey, false, '# remains an immediate classic core key');
assert.match(Catalog.hashActivation().explanation, /sent to NetHack immediately/);

assert.equal(catalog.search('loot').length, 0, 'public-context command is omitted without public availability');
const contextual = { contextCommands: { 'item.loot': { available: true } } };
assert.equal(catalog.search('loot', contextual)[0].availableHere, true);
assert.equal(catalog.sections('', contextual)[0].label, 'Available here');

catalog.registerProvider('map-test', { entries(publicState) {
  return publicState.canChat ? [{ id: 'context.chat', label: 'Chat', aliases: ['speak'], category: 'Dungeon', publicShortcut: '#chat', internalRoute: { kind: 'text', value: '#chat\n' }, availability: 'public-context', promptPlan: 'direction' }] : [];
} });
assert.equal(catalog.search('speak', { canChat: true })[0].command.id, 'context.chat');
const providerSent = [];
assert.equal(catalog.dispatch('context.chat', { sendText: (text) => providerSent.push(text) }, { canChat: true }).ok, true);
assert.deepEqual(providerSent, ['#chat\n']);
assert.throws(() => catalog.registerProvider('map-test', { entries: () => [] }), /Duplicate command provider/);
const unavailableSave = catalog.search('save', { commandAvailability: { 'run.save': { available: false, reason: 'Saving is unavailable during this prompt.' } } })[0];
assert.equal(unavailableSave.available, false);
assert.equal(unavailableSave.reason, 'Saving is unavailable during this prompt.');

const sent = [];
assert.equal(catalog.dispatch('item.quaff', { sendKey(key) { sent.push(key); } }).ok, true);
assert.equal(catalog.dispatch('magic.spells', { sendText(text) { sent.push(text); } }).ok, true);
assert.deepEqual(sent, ['q', '#showspells\n'], 'catalog dispatch does not compose or rewrite routes');
assert.equal(catalog.recent()[0], 'magic.spells');
catalog.dispatch('run.quit', { sendText() {} });
assert(!catalog.recent().includes('run.quit'), 'serious commands are excluded from Recent');
assert.equal(catalog.dispatch('item.quaff', {}).reason, 'route-adapter-unavailable');

const palette = Palette.createPaletteState({ catalog });
let paletteState = palette.open({ publicState: contextual });
assert.equal(paletteState.phase, 'open');
assert.equal(paletteState.sections[0].label, 'Available here');
palette.setQuery('drink potion');
assert.equal(palette.snapshot().selected.command.id, 'item.quaff');
palette.setQuery('q');
assert.equal(palette.snapshot().selected.command.id, 'item.quaff');
palette.setQuery('Q');
assert.equal(palette.snapshot().selected.command.id, 'equipment.quiver', 'changing only shortcut case re-ranks and selects the exact classic command');
palette.setQuery('drink potion');
assert.equal(palette.activate({ sendKey(key) { sent.push(key); } }).ok, true);
palette.setQuery('quit');
assert.equal(palette.activate({ sendText() {} }).reason, 'confirmation-required');
assert.equal(palette.activate({ confirm: () => false, sendText() {} }).reason, 'confirmation-declined');
assert.equal(palette.activate({ confirm: () => true, sendText(text) { sent.push(text); } }).ok, true);
palette.open({ mode: 'core', query: 'show spells' });
assert.equal(palette.snapshot().selected.command.id, 'magic.spells');
const corePromptSent = [];
assert.equal(palette.activate({ sendText: (text) => corePromptSent.push(text) }).ok, true);
assert.deepEqual(corePromptSent, ['showspells\n'], 'core-owned # prompt receives the command name without a second #');
assert(palette.snapshot().entries.every((entry) => entry.command.internalRoute.kind === 'text' && entry.command.internalRoute.value.startsWith('#')));
palette.setQuery('zzzz-no-match');
assert.equal(palette.snapshot().entries.length, 0);
palette.updatePublicState({});
palette.close('escape');
assert.equal(palette.snapshot().phase, 'closed');
assert.equal(Palette.promptLabel(catalog.get('item.quaff')), 'Choose an item next');

const manual = ['NetHack Manual', '', '  Exact spacing stays here.', '#quit means quit.'];
const help = Help.createHelpModel({ catalog, manualLines: manual });
help.open({ section: 'manual' });
assert.deepEqual(help.snapshot().content.manual.map((entry) => entry.line), manual, 'canonical manual lines remain exact');
help.search('#quit');
assert.deepEqual(help.snapshot().content.manual.map((entry) => entry.line), ['#quit means quit.']);
help.setSection('keys');
help.search('rest until healed');
assert.equal(help.snapshot().content.movement.length, 1);
assert.equal(help.snapshot().content.movement[0].title, 'Wait');
assert.match(help.snapshot().content.movement[0].text, /does not mean rest until healed/);
help.search('Run');
assert.match(help.snapshot().content.movement.find((topic) => topic.id === 'run').text, /does not choose a route/);
help.setPublicState({ canChat: true });
help.setSection('commands');
help.search('speak');
assert.equal(help.snapshot().content.commands[0].id, 'context.chat', 'Help consumes materialized provider commands from the same catalog');

const typedSpell = Help.normalizeSpellRow({ name: 'force bolt', selector: 'a', level: 1, pwCost: 5, failure: '12%', status: 'known', hiddenDamage: 99 }, 'typed');
assert.deepEqual(typedSpell, { name: 'force bolt', classificationConfidence: 'typed', selector: 'a', level: '1', pwCost: '5', failure: '12%', status: 'known' });
assert.equal('hiddenDamage' in typedSpell, false, 'spell rows expose only allowlisted public fields');
const fallbackSpell = Help.normalizeSpellRow({ name: 'healing', fail: 'unknown' }, 'fallback');
assert.equal(fallbackSpell.classificationConfidence, 'fallback');
assert.equal('level' in fallbackSpell, false, 'missing spell level is omitted');
assert.equal('pwCost' in fallbackSpell, false, 'missing spell Pw is omitted');
const typedSkill = Help.normalizeSkillRow({ name: 'dagger', selector: 97, currentRank: 'Basic', nextRank: 'Skilled', nextCost: 2, canAdvance: false, recommendation: 'advance now' }, 'typed');
assert.deepEqual(typedSkill, { name: 'dagger', classificationConfidence: 'typed', selector: 'a', currentRank: 'Basic', nextRank: 'Skilled', nextCost: '2', canAdvance: false });
assert.equal('recommendation' in typedSkill, false);
const fallbackSkill = Help.normalizeSkillRow({ name: 'bare handed combat', rank: 'Basic' }, 'fallback');
assert.equal(fallbackSkill.classificationConfidence, 'fallback');
assert.equal('canAdvance' in fallbackSkill, false, 'missing advancement is omitted');
assert.deepEqual(Help.magicRowView(typedSpell, 'spell', 'typed').facts, ['Level 1', 'Pw 5', 'Failure 12%', 'known']);
assert.equal(Help.magicRowView(typedSpell, 'spell', 'typed').actionLabel, '', 'spell rows do not invent an action outside their owning core menu');
assert.deepEqual(Help.magicRowView(typedSkill, 'skill', 'typed').facts, ['Rank Basic', 'Next Skilled', 'Cost 2']);
assert.equal(Help.magicRowView(typedSkill, 'skill', 'typed', 'Advance').actionLabel, '', 'canAdvance false suppresses an Advance claim');
assert.equal(Help.magicRowView({ name: 'dagger', canAdvance: true }, 'skill', 'typed', 'Advance').actionLabel, 'Advance');
assert.throws(() => Help.normalizeSpellRow({}, 'typed'), /name is required/);
assert.throws(() => Help.normalizeSpellRow({ name: 'force bolt' }), /explicit typed or fallback provenance/);
assert.throws(() => Help.normalizeSkillRow([], 'typed'), /must be an object/);

function settingsHarness({ persist = true } = {}) {
  const calls = [];
  let current = { onboarding: { completed: false, disabled: false, lastStep: 'not-started' } };
  return {
    calls,
    current: () => current,
    save(patch) { calls.push(patch); current = { ...current, ...patch }; return { settings: current, persisted: persist }; },
  };
}
const onboardingSettings = settingsHarness();
const onboarding = Onboarding.createOnboarding({ settingsStore: onboardingSettings });
assert.equal(onboarding.begin({ runKind: 'new' }).cue.id, 'move');
assert.equal(onboarding.observe({ type: 'movement-confirmed', confirmed: false }).cue.id, 'move', 'keydown without confirmation does not complete movement');
assert.equal(onboarding.observe({ type: 'movement-confirmed', confirmed: true }).cue.id, 'consequence');
assert.equal(onboarding.observe({ type: 'core-prompt-opened', ownerId: 'prompt-1' }).suspended, true);
onboarding.observe({ type: 'dialog-opened', ownerId: 'help-1' });
assert.equal(onboarding.observe({ type: 'consequence-visible', confirmed: true }).cue.id, 'consequence', 'suspended cues do not advance');
onboarding.observe({ type: 'core-prompt-closed', ownerId: 'prompt-1' });
assert.equal(onboarding.snapshot().suspended, true, 'one owner closing does not resume while another owner remains');
onboarding.observe({ type: 'dialog-closed', ownerId: 'help-1' });
assert.equal(onboarding.observe({ type: 'consequence-visible', confirmed: true }).cue.id, 'here-actions');
assert.equal(onboarding.observe({ type: 'here-actions-opened', confirmed: true }).cue.id, 'inventory');
onboarding.observe({ type: 'inventory-closed', confirmed: true });
assert.equal(onboarding.snapshot().cue.id, 'inventory', 'Inventory must open before closing can complete the cue');
onboarding.observe({ type: 'inventory-opened', confirmed: true });
assert.equal(onboarding.observe({ type: 'inventory-closed', confirmed: true }).phase, 'completed');
assert.equal(onboarding.snapshot().settings.completed, true);

const restored = Onboarding.createOnboarding({ settingsStore: settingsHarness(), settings: { completed: false, disabled: false } });
assert.equal(restored.begin({ runKind: 'restored' }).completionReason, 'restored-suppressed');
assert.equal(restored.restart().cue.id, 'move', 'Help can explicitly restart the guide');
const replay = Onboarding.createOnboarding({ settingsStore: settingsHarness(), settings: { completed: false, disabled: false } });
assert.equal(replay.begin({ runKind: 'replay' }).completionReason, 'replay-suppressed');
const skipped = Onboarding.createOnboarding({ settingsStore: settingsHarness() });
skipped.begin({ runKind: 'new' });
assert.equal(skipped.skip().completionReason, 'skipped');
assert.equal(skipped.snapshot().settings.disabled, false);
const disabled = Onboarding.createOnboarding({ settingsStore: settingsHarness() });
disabled.begin({ runKind: 'new' });
assert.equal(disabled.disable().phase, 'disabled');
assert.equal(disabled.snapshot().settings.disabled, true);
let storageWarnings = 0;
const noStorage = Onboarding.createOnboarding({ onWarning() { storageWarnings += 1; } });
noStorage.begin({ runKind: 'new' });
noStorage.skip();
assert.equal(storageWarnings, 1, 'unavailable settings storage warning deduplicates and does not block the guide');
let throwingWarnings = 0;
const throwingStore = { current: () => ({ onboarding: {} }), save: () => { throw new Error('disk unavailable'); } };
const throwingOnboarding = Onboarding.createOnboarding({ settingsStore: throwingStore, onWarning: () => { throwingWarnings += 1; } });
assert.doesNotThrow(() => throwingOnboarding.begin({ runKind: 'new' }));
assert.equal(throwingWarnings, 1);

assert.equal(Creation.validateName('').ok, false, 'blank name is rejected explicitly');
assert.match(Creation.validateName('').message, /Enter a hero name/);
assert.equal(Creation.validateName('Electron').ok, true, 'Electron is allowed only when the player deliberately types it');
assert.equal(Creation.validateName('bad name').ok, false);
assert.equal(Creation.normalizeSeed('').ok, true);
assert.equal(Creation.normalizeSeed('0x10').value, '16');
assert.equal(Creation.normalizeSeed('abc').ok, false);
assert.equal(Creation.normalizeSeed('18446744073709551615').ok, true);
assert.equal(Creation.normalizeSeed('18446744073709551616').ok, false);

let legalIdentityCount = 0;
for (const combo of CharacterOptions.validCombos) {
  for (const alignment of CharacterOptions.comboAlignmentOptions(combo)) {
    const presentation = CharacterOptions.selectionPresentation({ ...combo, alignment });
    assert.equal(presentation.valid, true, `legal combination remains valid: ${JSON.stringify({ ...combo, alignment })}`);
    assert.equal(presentation.adjustments.length, 0, `legal combination is not silently changed: ${JSON.stringify({ ...combo, alignment })}`);
    legalIdentityCount += 1;
  }
}
assert(legalIdentityCount > CharacterOptions.validCombos.length, 'all legal alignments are covered, not only the first alignment');
const constrained = CharacterOptions.selectionPresentation({ role: 'Mon', race: 'Dwa', gender: 'Fem', alignment: 'Law' }, ['role']);
assert.equal(constrained.resolved.role, 'Mon');
assert.equal(constrained.resolved.race, 'Hum');
assert.match(constrained.explanation, /Race changed from Dwarf to Human/);
assert(!constrained.available.race.some((option) => option.value === 'Dwa'));

const character = Creation.createCharacterCreationModel({ characterOptions: CharacterOptions, random: () => 0 });
character.open();
assert.equal(character.snapshot().name, '', 'creation starts with a blank name');
assert.equal(character.snapshot().advancedOpen, false, 'seed and recording begin collapsed');
assert.equal(character.submit().ok, false, 'blank name never falls back silently');
character.setName('Rowan');
character.setSelection('role', 'Mon');
assert.equal(character.snapshot().selection.race, 'Hum');
character.setSeed('0x2a');
character.setRecordingEnabled(true);
const submitted = character.submit();
assert.equal(submitted.ok, true);
assert.equal(submitted.playerSpec, `-uRowan-${submitted.character.role}-${submitted.character.race}-${submitted.character.gender}-${submitted.character.alignment}`);
assert.equal(submitted.seed, '42');
assert.equal(submitted.recordingEnabled, true);
character.randomize();
assert.match(character.snapshot().name, /^(?:Ada|Boulder|Cobalt|Delver|Ember|Rune|Sable|Torch)\d{2}$/);
assert.equal(CharacterOptions.isValidSelection(character.snapshot().selection), true);
character.setSubmissionState(true);
assert.equal(character.snapshot().pending, true);
character.setSubmissionState(false, 'start rejected');
assert.equal(character.snapshot().submissionError, 'start rejected');

const runtime = Runtime.createRuntime();
const registered = Catalog.registerDiscoveryDomain({ runtime, catalog });
const discoveryDomain = runtime.domain('discovery');
assert.equal(discoveryDomain.version, registered.version);
assert.equal(discoveryDomain.catalog, catalog);
assert.equal(discoveryDomain.catalog.entries().length, entries.length);
assert.equal(discoveryDomain.catalog.search('speak', { canChat: true })[0].command.id, 'context.chat');
assert.throws(() => Catalog.registerDiscoveryDomain({ runtime, catalog }), /already has an owner/);

const uxSources = ['command-catalog.js', 'command-palette.js', 'help-center.js', 'onboarding.js', 'character-creation.js'];
const context = { console };
context.window = context;
context.self = context;
vm.createContext(context);
for (const file of uxSources) vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/ux', file), 'utf8'), context, { filename: file });
for (const name of ['NetHackUxCommandCatalog', 'NetHackUxCommandPalette', 'NetHackUxHelpCenter', 'NetHackUxOnboarding', 'NetHackUxCharacterCreation']) assert.equal(Object.isFrozen(context[name]), true, `${name} is a frozen browser global`);

const css = fs.readFileSync(path.join(__dirname, '../../src/ux/styles/discovery.css'), 'utf8');
assert(!/border-(?:left|right)\s*:\s*(?:[2-9]|\d{2,})px/i.test(css), 'discovery CSS has no forbidden side-stripe accent');
assert(!/background-clip\s*:\s*text/i.test(css), 'discovery CSS has no gradient text');
assert(!/#(?:000|fff)(?:\b|;)/i.test(css), 'discovery CSS has no pure black or pure white');
assert.match(css, /max-width:\s*100%/);
assert.match(css, /overflow-wrap:\s*anywhere/);
assert.match(css, /prefers-reduced-motion/);

console.log(JSON.stringify({ ok: true, commands: entries.length, legalCombos: CharacterOptions.validCombos.length, browserGlobals: uxSources.length }, null, 2));
