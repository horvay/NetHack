const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');
const settingsStore = fs.readFileSync(path.join(root, 'src', 'ux', 'settings-store.js'), 'utf8');
const launchPolicy = fs.readFileSync(path.join(root, 'src', 'main', 'launch-policy.js'), 'utf8');
const fixture = fs.readFileSync(path.join(root, 'test', 'fixtures', 'contextual-locked-door-events.jsonl'), 'utf8')
  .trim()
  .split(/\n+/)
  .map((line) => JSON.parse(line));

function ok(name, condition) {
  console.log(`${condition ? 'ok' : 'not ok'} - ${name}`);
  if (!condition) process.exitCode = 1;
}

const lockedDoorPattern = /\b(?:door|gateway)\b.*\b(?:locked|resists|stuck)\b/i;
ok('locked-door fixture would trigger contextual prompt', fixture.some((event) => event.name === 'shim_putstr' && lockedDoorPattern.test(event.text)));
ok('full contextual prompts and safe gameplay defaults persist in schema v5', /contextualPrompts: 'full'/.test(settingsStore) && /autopickup: 'gold'/.test(settingsStore) && /movement: 'classic'/.test(settingsStore) && /schemaVersion = 5/.test(settingsStore));
ok('Close-up is the default map view', /map: Object\.freeze\(\{ mode: 'close'/.test(settingsStore));
ok('settings are saved through the localStorage-backed settings store', /storage\.setItem\(storageKey, JSON\.stringify\(settings\)\)/.test(settingsStore) && /storage: window\.localStorage/.test(renderer));
ok('autopickup and movement choices map to NetHack options', /settings\.autopickup === 'all'/.test(renderer) && /settings\.autopickup === 'gold'/.test(renderer) && /'pickup_types:\$'/.test(renderer) && /settings\.movement === 'numpad'/.test(renderer));
ok('contextual prompt levels suppress off and require a direct tool for essential', /level === 'off'/.test(renderer) && /level === 'essential' && !tools\.length/.test(renderer));
ok('main launch policy allowlist rejects arbitrary options and accepts both movement modes', /ALLOWED_NETHACK_OPTIONS\.has\(option\)/.test(launchPolicy) && /'number_pad:0', 'number_pad:1'/.test(launchPolicy));
ok('Enter or Y activates locked-door kick context', renderer.includes("key === '\\n' || key === '\\r' || /^y$/i.test(key)") && /kickLockedDoorFromContext\(\)/.test(renderer));

if (process.exitCode) process.exit(1);
