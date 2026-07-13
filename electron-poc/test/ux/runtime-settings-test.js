const assert = require('node:assert/strict');
const Runtime = require('../../src/ux/runtime');
const Settings = require('../../src/ux/settings-store');
const Mounts = require('../../src/ux/app-mounts');
const WindowPolicy = require('../../src/main/window-policy');

function memoryStorage(initial = {}, options = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      if (options.readError) throw new Error('read denied');
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (options.writeError) throw new Error('quota denied');
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
  };
}

const diagnostics = [];
const runtime = Runtime.createRuntime({ diagnosticSink: (entry) => diagnostics.push(entry) });
const shell = runtime.registerDomain('shell', { id: 'shell-controller' });
assert.equal(shell.id, 'shell-controller');
runtime.registerDomain('discovery', { id: 'discovery-controller' });
assert.deepEqual(runtime.listDomains().map((entry) => entry.id), ['shell', 'discovery']);
assert.throws(() => runtime.registerDomain('shell', {}), /already has an owner/);
assert(diagnostics.some((entry) => entry.type === 'domain.registration-rejected'));
assert.throws(() => runtime.registerDomain('not-planned', {}), /Unknown UX domain/);
assert(diagnostics.some((entry) => entry.type === 'domain.registration-rejected' && entry.detail.reason === 'unknown-domain'));

let delivered;
runtime.subscribePublicState('discovery', (snapshot, meta) => {
  delivered = { snapshot, meta };
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.nested), true);
});
const mutable = { nested: { value: 1 }, values: new Map([['public', { known: true }]]) };
runtime.publishPublicState(mutable, { reason: 'test' });
mutable.nested.value = 99;
mutable.values.get('public').known = false;
assert.equal(delivered.snapshot.nested.value, 1);
assert.equal(delivered.snapshot.values[0][1].known, true);
assert.equal(Object.isFrozen(delivered.snapshot.values), true);
assert.equal(delivered.meta.reason, 'test');

runtime.registerProvider('shell-regions', 'shell', { regions: ['map'] });
assert.equal(runtime.providers('shell-regions')[0].ownerId, 'shell');
assert.throws(() => runtime.registerProvider('shell-regions', 'shell', {}), /already registered/);
assert.equal(runtime.service('notice'), undefined, 'notice service remains absent until UXM-01');
assert.throws(() => runtime.installService('notice', 'shell', {}), /interaction domain/);

const v1 = memoryStorage({
  [Settings.legacyStorageKey]: JSON.stringify({ contextualMenus: false, autoLootGold: true, ignoredFutureValue: 'ignored' }),
});
const migrationDiagnostics = [];
const migratedStore = Settings.createSettingsStore({ storage: v1, onDiagnostic: (entry) => migrationDiagnostics.push(entry) });
const migrated = migratedStore.load();
assert.equal(migrated.migrated, true);
assert.equal(migrated.persisted, true);
assert.equal(migrated.settings.schemaVersion, 2);
assert.equal(migrated.settings.contextualMenus, false);
assert.equal(migrated.settings.autoLootGold, true);
assert.equal(migrated.settings.hudDensity, 'compact');
assert.equal(migrated.settings.sound.uiEnabled, false);
assert.equal('ignoredFutureValue' in migrated.settings, false);
assert.equal(v1.values.has(Settings.legacyStorageKey), false);
assert.equal(JSON.parse(v1.values.get(Settings.storageKey)).schemaVersion, 2);
const secondLoad = Settings.createSettingsStore({ storage: v1 }).load();
assert.equal(secondLoad.source, 'v2');
assert.equal(secondLoad.migrated, false, 'migration is idempotent after v2 persists');
assert(migrationDiagnostics.some((entry) => entry.type === 'settings.migrated'));

const warnings = [];
const malformed = memoryStorage({ [Settings.storageKey]: '{bad json', [Settings.legacyStorageKey]: '{also bad' });
const malformedStore = Settings.createSettingsStore({ storage: malformed, onWarning: (message) => warnings.push(message) });
const malformedResult = malformedStore.load();
assert.equal(malformedResult.source, 'defaults');
assert.equal(malformedResult.settings.contextualMenus, true);
assert.equal(warnings.length, 1, 'parse failure warns at most once per session');

const writeWarnings = [];
const failingStore = Settings.createSettingsStore({ storage: memoryStorage({}, { writeError: true }), onWarning: (message) => writeWarnings.push(message) });
failingStore.load();
const failedSave = failingStore.save({ hudDensity: 'detailed', map: { scale: 2 }, sound: { uiEnabled: true, volume: 4 } });
assert.equal(failedSave.persisted, false);
assert.equal(failingStore.current().hudDensity, 'detailed', 'write failure keeps current session value');
assert.equal(failingStore.current().map.scale, 2);
assert.equal(failingStore.current().sound.uiEnabled, true);
assert.equal(failingStore.current().sound.volume, 1);
assert.equal(writeWarnings.length, 1);

const loadThenWriteWarnings = [];
const loadThenWriteStore = Settings.createSettingsStore({
  storage: memoryStorage({ [Settings.storageKey]: '{bad json' }, { writeError: true }),
  onWarning: (message) => loadThenWriteWarnings.push(message),
});
loadThenWriteStore.load();
loadThenWriteStore.save({ keyHints: 'always' });
assert.equal(loadThenWriteWarnings.length, 2, 'a later write failure remains actionable after one load warning');

const production = WindowPolicy.browserWindowSizePolicy({ NH_ELECTRON_WINDOW_WIDTH: '640', NH_ELECTRON_WINDOW_HEIGHT: '480' });
assert.deepEqual(production.initial, { width: 960, height: 720 });
assert.deepEqual(production.minimum, { width: 960, height: 720 });
assert.equal(production.testOverride, false);
const incompleteOverride = WindowPolicy.browserWindowSizePolicy({ NH_ELECTRON_ALLOW_BELOW_MINIMUM_FOR_TESTS: '1', NH_ELECTRON_WINDOW_WIDTH: '640', NH_ELECTRON_WINDOW_HEIGHT: '480' });
assert.deepEqual(incompleteOverride.initial, { width: 960, height: 720 });
const testOverride = WindowPolicy.browserWindowSizePolicy({ NH_ELECTRON_TEST_MODE: '1', NH_ELECTRON_ALLOW_BELOW_MINIMUM_FOR_TESTS: '1', NH_ELECTRON_WINDOW_WIDTH: '640', NH_ELECTRON_WINDOW_HEIGHT: '480' });
assert.deepEqual(testOverride.initial, { width: 640, height: 480 });
assert.deepEqual(testOverride.minimum, { width: 1, height: 1 });

const presentIds = new Set(Object.values(Mounts.mountIds));
const mountInspection = Mounts.inspectMounts({ getElementById: (id) => presentIds.has(id) ? { id } : null });
assert(mountInspection.every((entry) => entry.present));
assert.equal(Mounts.lookupMount('map', { getElementById: (id) => ({ id }) }).id, 'game-grid');
assert.throws(() => Mounts.lookupMount('unknown', {}), /Unknown UX mount/);

console.log('UX runtime, settings, mounts, and window policy OK');
