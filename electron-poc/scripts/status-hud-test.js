const assert = require('node:assert/strict');
const hud = require('../src/shared/status-hud.js');
const gameViewState = require('../src/shared/game-view-state.js');

assert.equal(hud.version, 'nethack-status-hud/v2');
assert.equal(hud.STATUS_FIELDS.length, 27, 'STATUS_FIELDS matches include/botl.h MAXBLSTATS');
assert.deepEqual(hud.STATUS_FIELDS.map((field) => field.field), Array.from({ length: 27 }, (_, index) => index));
assert.equal(hud.STATUS_FIELD_BY_INDEX[9].id, 'BL_CAP');
assert.equal(hud.STATUS_FIELD_BY_INDEX[15].id, 'BL_HD');
assert.equal(hud.STATUS_FIELD_BY_INDEX[22].id, 'BL_CONDITION');
assert.equal(hud.STATUS_FIELD_BY_INDEX[25].id, 'BL_TERRAIN');

const expectedConditions = [
  ['BL_MASK_BAREH', 0x00000001, 'Bare hands'],
  ['BL_MASK_BLIND', 0x00000002, 'Blind'],
  ['BL_MASK_BUSY', 0x00000004, 'Busy'],
  ['BL_MASK_CONF', 0x00000008, 'Confused'],
  ['BL_MASK_DEAF', 0x00000010, 'Deaf'],
  ['BL_MASK_ELF_IRON', 0x00000020, 'Iron'],
  ['BL_MASK_FLY', 0x00000040, 'Flying'],
  ['BL_MASK_FOODPOIS', 0x00000080, 'Food poison'],
  ['BL_MASK_GLOWHANDS', 0x00000100, 'Glowing hands'],
  ['BL_MASK_GRAB', 0x00000200, 'Grabbed'],
  ['BL_MASK_HALLU', 0x00000400, 'Hallucinating'],
  ['BL_MASK_HELD', 0x00000800, 'Held'],
  ['BL_MASK_ICY', 0x00001000, 'Icy'],
  ['BL_MASK_INLAVA', 0x00002000, 'In lava'],
  ['BL_MASK_LEV', 0x00004000, 'Levitating'],
  ['BL_MASK_PARLYZ', 0x00008000, 'Paralyzed'],
  ['BL_MASK_RIDE', 0x00010000, 'Riding'],
  ['BL_MASK_SLEEPING', 0x00020000, 'Asleep'],
  ['BL_MASK_SLIME', 0x00040000, 'Slimed'],
  ['BL_MASK_SLIPPERY', 0x00080000, 'Slippery'],
  ['BL_MASK_STONE', 0x00100000, 'Stoning'],
  ['BL_MASK_STRNGL', 0x00200000, 'Strangled'],
  ['BL_MASK_STUN', 0x00400000, 'Stunned'],
  ['BL_MASK_SUBMERGED', 0x00800000, 'Submerged'],
  ['BL_MASK_TERMILL', 0x01000000, 'Ill'],
  ['BL_MASK_TETHERED', 0x02000000, 'Tethered'],
  ['BL_MASK_TRAPPED', 0x04000000, 'Trapped'],
  ['BL_MASK_UNCONSC', 0x08000000, 'Unconscious'],
  ['BL_MASK_WOUNDEDL', 0x10000000, 'Wounded legs'],
  ['BL_MASK_HOLDING', 0x20000000, 'Holding'],
];
assert.equal(hud.CONDITION_BITS.length, expectedConditions.length, 'all current BL_CONDITION bits are present');
for (const [index, [id, mask, label]] of expectedConditions.entries()) {
  const actual = hud.CONDITION_BITS[index];
  assert.equal(actual.id, id);
  assert.equal(actual.mask, mask);
  assert.equal(actual.label, label);
  assert.deepEqual(hud.conditionLabels(mask), [label], `${id} decodes by itself`);
}
const allMask = expectedConditions.reduce((mask, [, bit]) => mask | bit, 0);
assert.equal(allMask, 0x3fffffff);
assert.equal(hud.conditionLabels(`mask ${allMask}`).length, 30, 'combined mask decodes every condition');

let decoded = hud.decodeConditionMask(0x00100000 | 0x00200000 | 0x00000008 | 0x00000002 | 0x00004000);
assert.deepEqual(decoded.groups.map((group) => [group.label, group.severity, group.conditions.map((condition) => condition.label).join('|')]), [
  ['Danger', 'danger', 'Stoning|Strangled'],
  ['Mind', 'warning', 'Confused'],
  ['Senses', 'warning', 'Blind'],
  ['Move', 'info', 'Levitating'],
]);

assert.equal(hud.hungerSeverity('Satiated'), 'info');
assert.equal(hud.hungerSeverity('        '), '');
assert.equal(hud.hungerSeverity(''), '');
assert.equal(hud.hungerSeverity('Hungry'), 'warning');
assert.equal(hud.hungerSeverity('Hungry  '), 'warning');
assert.equal(hud.hungerSeverity('Weak'), 'danger');
assert.equal(hud.hungerSeverity('Weak    '), 'danger');
assert.equal(hud.hungerSeverity('Fainting'), 'danger');
assert.equal(hud.hungerSeverity('Fainted'), 'danger');
assert.equal(hud.hungerSeverity('Fainted '), 'danger');
assert.equal(hud.hungerSeverity('Starved'), 'danger');
assert.equal(hud.hungerSeverity('Starved '), 'danger');
assert.equal(hud.carrySeverity('Burdened'), 'warning');
assert.equal(hud.carrySeverity('Stressed'), 'warning');
assert.equal(hud.carrySeverity('Strained'), 'danger');
assert.equal(hud.carrySeverity('Overtaxed'), 'danger');
assert.equal(hud.carrySeverity('Overloaded'), 'danger');

const values = new Map([
  [0, 'Electron the Valkyrie'], [1, '18/03'], [2, '14'], [3, '16'], [4, '9'], [5, '12'], [6, '8'], [7, 'Lawful'], [8, '12345'],
  [9, 'Stressed'], [10, '\\G000001f4:500'], [11, '4'], [12, '7'], [13, '6'], [14, '2'], [15, '9'], [16, '214'], [17, 'Weak'], [18, '5'], [19, '40'], [20, 'The Dungeons of Doom:3'], [21, '3210'], [22, `mask ${0x00000080 | 0x04000000 | 0x00400000}`], [23, 'a blessed dagger'], [24, 'crude ring mail'], [25, 'ice'], [26, 'NetHack 5.0'],
]);
const presentation = hud.buildStatusPresentation(values);
const groups = presentation.persistent;
const chips = groups.flatMap((group) => group.items);
const detailGroups = presentation.detail;
const detailChips = detailGroups.flatMap((group) => group.items);
const detailedChips = hud.buildStatusPresentation(values, { density: 'detailed' }).persistent.flatMap((group) => group.items);
function chip(label) { return chips.find((entry) => entry.label === label); }
function detailChip(label) { return detailChips.find((entry) => entry.label === label); }
assert.deepEqual(groups.map((group) => group.id), ['hero', 'vitals', 'dungeon', 'urgent']);
assert.deepEqual(detailGroups.find((group) => group.id === 'attributes').items.map((item) => `${item.label}:${item.value}`), ['Str:18/03', 'Dex:14', 'Con:16', 'Int:9', 'Wis:12', 'Cha:8']);
assert.equal(chip('Hero').value, 'Electron the Valkyrie');
assert.equal(detailChip('Align').value, 'Lawful');
assert.equal(detailChip('Score').value, '12345');
assert.equal(chip('HP').severity, 'danger');
assert.equal(chip('HP').value, '5 / 40');
assert.equal(chip('Pw').value, '4 / 7');
assert.equal(chip('Gold').value, '500');
assert.equal(chip('Dlvl').value, 'The Dungeons of Doom:3');
assert.equal(detailedChips.find((entry) => entry.label === 'Time').value, '214');
assert.equal(chip('HD').value, '9', 'polymorph HD takes the persistent level role when present');
assert.equal(detailedChips.find((entry) => entry.label === 'XP').value, '3210');
for (const label of ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha']) {
  assert.equal(detailedChips.find((entry) => entry.label === label)?.value, detailChip(label).value, `${label} is available in the full HUD`);
}
assert.equal(chip('Carry').severity, 'warning');
assert.equal(chip('Hunger').severity, 'danger');
assert.equal(detailedChips.find((entry) => entry.label === 'On').value, 'ice');
assert.equal(chip('Food poison').value, 'Critical');
assert.equal(chip('Held').value, 'Trapped');
assert.equal(chip('Mind').value, 'Stunned');
assert.equal(detailChip('Wield').value, 'a blessed dagger');
assert.equal(detailChip('Armor').value, 'crude ring mail');
assert.equal(detailChip('Version').value, 'NetHack 5.0');
assert(!chips.some((entry) => ['Str', 'Version', 'Wield', 'Armor'].includes(entry.label)), 'static attributes, gear, and system facts stay out of the persistent HUD');
assert(!chips.some((entry) => entry.label === 'Cond'), 'conditions render as grouped/severity chips, not one Cond blob');
assert.equal(hud.terrainChipValue('room'), '');

const gameView = gameViewState.createGameViewState();
for (const [field, value] of values.entries()) {
  gameView.process({ name: 'shim_status_enablefield', field, label: hud.STATUS_FIELD_BY_INDEX[field]?.label || `Field ${field}` });
  if (field === 22) gameView.process({ name: 'shim_status_update', field, conditionMask: hud.parseConditionMask(value) });
  else gameView.process({ name: 'shim_status_update', field, value });
}
assert.equal(gameView.snapshot().statusValues.get(1), '18/03');
assert.equal(gameView.snapshot().statusValues.get(10), '\\G000001f4:500');
assert.equal(gameView.snapshot().statusValues.get(22), `mask ${0x00000080 | 0x04000000 | 0x00400000}`);
const changedHp = gameView.process({ name: 'shim_status_update', field: 18, value: '3' });
const changedGold = gameView.process({ name: 'shim_status_update', field: 10, value: '\\G00000258:600' });
const changedConditions = gameView.process({ name: 'shim_status_update', field: 22, conditionMask: 0x00000002 | 0x00000008 });
assert(changedHp.effects.some((effect) => effect.type === 'render-status'));
assert(changedGold.effects.some((effect) => effect.type === 'render-status'));
assert(changedConditions.effects.some((effect) => effect.type === 'render-status'));
const liveGroups = hud.buildStatusGroups(gameView.snapshot().statusValues);
const liveChips = liveGroups.flatMap((group) => group.items);
assert.equal(liveChips.find((entry) => entry.label === 'HP').value, '3 / 40');
assert.equal(liveChips.find((entry) => entry.label === 'HP').severity, 'danger');
assert.equal(liveChips.find((entry) => entry.label === 'Gold').value, '600');
assert.equal(liveChips.find((entry) => entry.label === 'Senses').value, 'Blind');
assert.equal(liveChips.find((entry) => entry.label === 'Mind').value, 'Confused');
const disabledGold = gameView.process({ name: 'shim_status_enablefield', field: 10, label: 'Gold', enabled: 0 });
assert(disabledGold.effects.some((effect) => effect.type === 'render-status'));
assert.equal(gameView.snapshot().statusValues.has(10), false, 'disabled status field is removed from live state');
const resetStatus = gameView.process({ name: 'shim_status_update', field: -2 });
assert(resetStatus.effects.some((effect) => effect.type === 'render-status'));
assert.equal(gameView.snapshot().statusValues.has(1), true, 'BL_RESET refreshes rendering without discarding unchanged status fields');

console.log('ok - status HUD shared definitions, state updates, condition masks, and chip severities');
