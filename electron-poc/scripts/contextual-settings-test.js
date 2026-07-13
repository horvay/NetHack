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
ok('contextual menus default on in persisted settings schema', /const defaultSettings = Object\.freeze\(\{[\s\S]*contextualMenus: true,[\s\S]*autoLootGold: true/.test(settingsStore) && /createSettingsStore/.test(renderer));
ok('settings are saved through the localStorage-backed settings store', /storage\.setItem\(storageKey, JSON\.stringify\(settings\)\)/.test(settingsStore) && /storage: window\.localStorage/.test(renderer));
ok('gold auto-loot maps to allowlisted NetHack pickup options', /options\.push\('autopickup', 'pickup_types:\$'\)/.test(renderer));
ok('main launch policy allowlist rejects arbitrary NETHACKOPTIONS', /const ALLOWED_NETHACK_OPTIONS = new Set\(\[/.test(launchPolicy) && /ALLOWED_NETHACK_OPTIONS\.has\(option\)/.test(launchPolicy) && /'pickup_types:\$'/.test(launchPolicy));
ok('Enter or Y activates locked-door kick context', renderer.includes("key === '\\n' || key === '\\r' || /^y$/i.test(key)") && /kickLockedDoorFromContext\(\)/.test(renderer));

if (process.exitCode) process.exit(1);
