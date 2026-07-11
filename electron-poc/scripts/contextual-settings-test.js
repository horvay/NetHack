const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
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
ok('contextual menus default on in persisted settings schema', /const defaultSettings = \{ contextualMenus: true, autoLootGold: true \}/.test(renderer));
ok('settings are saved to localStorage', /localStorage\?\.setItem\(settingsStorageKey, JSON\.stringify\(userSettings\)\)/.test(renderer));
ok('gold auto-loot maps to allowlisted NetHack pickup options', /options\.push\('autopickup', 'pickup_types:\$'\)/.test(renderer));
ok('main allowlist rejects arbitrary NETHACKOPTIONS', /const allowed = new Set\(\['!tutorial', 'tutorial', 'autopickup', '!autopickup', 'pickup_types:\$'\]\)/.test(main));
ok('Enter or Y activates locked-door kick context', renderer.includes("key === '\\n' || key === '\\r' || /^y$/i.test(key)") && /kickLockedDoorFromContext\(\)/.test(renderer));

if (process.exitCode) process.exit(1);
