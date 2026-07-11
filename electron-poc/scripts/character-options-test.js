const fs = require('node:fs');
const path = require('node:path');
const characterOptions = require('../src/shared/character-options.js');

function assert(name, ok, detail = '') {
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../assets/tiles/manifest.json'), 'utf8'));
const manifestComboIds = new Set(manifest.assets.filter((asset) => asset.categorySlug === 'player-combo-avatars').map((asset) => asset.id));
const validComboIds = new Set(characterOptions.validCombos.map(characterOptions.comboAvatarId));
const missingFromRules = [...manifestComboIds].filter((id) => !validComboIds.has(id));
const missingFromManifest = [...validComboIds].filter((id) => !manifestComboIds.has(id));

assert('NetHack race-role-gender combo count remains 54', characterOptions.validCombos.length === 54, String(characterOptions.validCombos.length));
assert('rule combos exactly match generated combo avatar manifest IDs', !missingFromRules.length && !missingFromManifest.length, JSON.stringify({ missingFromRules, missingFromManifest }, null, 2));
assert('non-human Monk is invalid', !characterOptions.isValidSelection({ role: 'Mon', race: 'Dwa', gender: 'Fem', alignment: 'Law' }));
assert('Monk resolves to human while preserving requested role', characterOptions.resolveSelection({ role: 'Mon', race: 'Dwa', gender: 'Fem', alignment: 'Law' }, ['role']).race === 'Hum');
assert('Dwarf role list excludes Monk', !characterOptions.allowedValues('role', { race: 'Dwa', gender: 'Fem' }).includes('Mon'));
assert('Dwarf Valkyrie is female-only', characterOptions.allowedValues('gender', { role: 'Val', race: 'Dwa' }).join(',') === 'Fem');
assert('Dwarf alignment is lawful-only after role/race resolution', characterOptions.optionsFor('alignment', { role: 'Arc', race: 'Dwa', gender: 'Mal', alignment: 'Neu' }).map((o) => o.value).join(',') === 'Law');

console.log(JSON.stringify({ ok: true, comboCount: characterOptions.validCombos.length, manifestComboCount: manifestComboIds.size }, null, 2));
