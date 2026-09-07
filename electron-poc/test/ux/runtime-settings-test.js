const assert = require('node:assert/strict');
const Runtime = require('../../src/ux/runtime');
const AppShell = require('../../src/ux/app-shell');
const Settings = require('../../src/ux/settings-store');
const Mounts = require('../../src/ux/app-mounts');
const WindowPolicy = require('../../src/main/window-policy');
const GameViewState = require('../../src/shared/game-view-state');

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

let discoveryDeliveries = 0;
let delivered;
runtime.subscribePublicState('discovery', (snapshot, meta) => {
  discoveryDeliveries += 1;
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
let shellDeliveries = 0;
runtime.subscribePublicState('shell', () => { shellDeliveries += 1; });
const shellBaseline = shellDeliveries;
const discoveryBaseline = discoveryDeliveries;
runtime.publishPublicState({ nested: { value: 2 } }, { reason: 'shell-only', domains: ['shell'] });
assert.equal(shellDeliveries, shellBaseline + 1, 'domain-scoped publication reaches the requested owner');
assert.equal(discoveryDeliveries, discoveryBaseline, 'domain-scoped publication skips unrelated owners');
const gameSnapshot = GameViewState.createGameViewState({ mapWidth: 6, mapHeight: 4 }).snapshot();
runtime.publishPublicState({ game: gameSnapshot }, { reason: 'discovery-only', domains: ['discovery'] });
assert.strictEqual(delivered.snapshot.game, gameSnapshot, 'the runtime reuses branded immutable game snapshots instead of recursively copying them');
assert.equal(shellDeliveries, shellBaseline + 1, 'a discovery publication does not rerender the shell owner');

assert.equal(runtime.service('notice'), undefined, 'notice service remains absent until UXM-01');
assert.throws(() => runtime.installService('notice', 'shell', {}), /interaction domain/);

const previousUxRuntime = global.NetHackUxRuntime;
const previousDocument = global.document;
let domReadyListener;
const shellRuntime = Runtime.createRuntime();
try {
  global.NetHackUxRuntime = { runtime: shellRuntime };
  global.document = {
    readyState: 'loading',
    addEventListener(type, listener) {
      if (type === 'DOMContentLoaded') domReadyListener = listener;
    },
  };
  const installedShell = AppShell.installBrowserShell();
  const shellDomain = shellRuntime.domain('shell');
  assert.equal(shellDomain.version, AppShell.version);
  assert.equal(typeof shellDomain.state, 'function');
  assert.equal(shellDomain.state().connected, false);
  assert.equal(typeof domReadyListener, 'function');
  assert.equal(AppShell.installBrowserShell(), shellDomain, 'shell installation is idempotent through domain ownership');
  assert.equal(installedShell.version, shellDomain.version);
} finally {
  if (previousUxRuntime === undefined) delete global.NetHackUxRuntime;
  else global.NetHackUxRuntime = previousUxRuntime;
  if (previousDocument === undefined) delete global.document;
  else global.document = previousDocument;
}

assert.equal(Settings.defaultSettings.map.mode, 'close', 'Close-up View is the default map presentation');
assert.equal(Settings.normalizeSettings({}).map.mode, 'close', 'missing map preferences normalize to Close-up View');
assert.equal(Settings.defaultSettings.layout.logRatio, null, 'message log defaults to automatic eight-line height');
assert.equal(Settings.normalizeSettings({}).layout.logRatio, null, 'missing log preference remains automatic');

const closeUpSettings = Settings.normalizeSettings({ map: { mode: 'close', closeRows: 11 } });
assert.equal(closeUpSettings.schemaVersion, 5);
assert.equal(closeUpSettings.map.mode, 'close');
assert.equal(closeUpSettings.map.closeRows, 11);
assert.equal(Settings.normalizeSettings({ map: { mode: 'close', closeRows: 10 } }).map.closeRows, 9, 'Close-up View uses supported odd row counts');
assert.equal(closeUpSettings.map.minimapSize, 'medium', 'Minimap defaults to the slightly enlarged medium size');
assert.equal(Settings.normalizeSettings({ map: { minimapSize: 'large' } }).map.minimapSize, 'large');
assert.equal(Settings.normalizeSettings({ map: { minimapSize: 'oversized' } }).map.minimapSize, 'medium');

const v3 = memoryStorage({
  [Settings.v3StorageKey]: JSON.stringify({
    schemaVersion: 3,
    contextualPrompts: 'essential',
    autopickup: 'all',
    movement: 'numpad',
    hudDensity: 'detailed',
    keyHints: 'always',
    map: { mode: 'follow', scale: 1.5 },
    layout: { logRatio: 0.65 },
  }),
});
const migratedV3 = Settings.createSettingsStore({ storage: v3 }).load();
assert.equal(migratedV3.source, 'v3');
assert.equal(migratedV3.settings.schemaVersion, 5);
assert.equal(migratedV3.settings.contextualPrompts, 'essential');
assert.equal(migratedV3.settings.autopickup, 'all');
assert.equal(migratedV3.settings.movement, 'numpad');
assert.equal(migratedV3.settings.map.mode, 'follow');
assert.equal(migratedV3.settings.map.closeRows, 9);
assert.equal(v3.values.has(Settings.v3StorageKey), false);
assert.equal(JSON.parse(v3.values.get(Settings.storageKey)).schemaVersion, 5);

const v4Default = memoryStorage({
  [Settings.previousStorageKey]: JSON.stringify({ schemaVersion: 4, layout: { logRatio: 0.5 } }),
});
const migratedV4Default = Settings.createSettingsStore({ storage: v4Default }).load();
assert.equal(migratedV4Default.source, 'v4');
assert.equal(migratedV4Default.settings.schemaVersion, 5);
assert.equal(migratedV4Default.settings.layout.logRatio, null, 'the old always-written 50% default migrates to the eight-line automatic height');

const v4Override = memoryStorage({
  [Settings.previousStorageKey]: JSON.stringify({ schemaVersion: 4, layout: { logRatio: 0.63 } }),
});
const migratedV4Override = Settings.createSettingsStore({ storage: v4Override }).load();
assert.equal(migratedV4Override.settings.layout.logRatio, 0.63, 'an adjusted version 4 divider remains an explicit override');

const v2 = memoryStorage({
  [Settings.v2StorageKey]: JSON.stringify({
    contextualMenus: false,
    autoLootGold: true,
    hudDensity: 'detailed',
    keyHints: 'always',
    map: { mode: 'follow' },
    layout: { logRatio: 0.65 },
    ignoredFutureValue: 'ignored',
  }),
});
const migrationDiagnostics = [];
const migratedStore = Settings.createSettingsStore({ storage: v2, onDiagnostic: (entry) => migrationDiagnostics.push(entry) });
const migrated = migratedStore.load();
assert.equal(migrated.migrated, true);
assert.equal(migrated.source, 'v2');
assert.equal(migrated.persisted, true);
assert.equal(migrated.settings.schemaVersion, 5);
assert.equal(migrated.settings.contextualPrompts, 'off');
assert.equal(migrated.settings.autopickup, 'gold');
assert.equal(migrated.settings.movement, 'classic');
assert.equal(migrated.settings.hudDensity, 'detailed');
assert.equal(migrated.settings.keyHints, 'always');
assert.equal(migrated.settings.map.mode, 'follow');
assert.equal(migrated.settings.layout.logRatio, 0.65);
assert.equal(migrated.settings.sound.uiEnabled, false);
assert.equal('contextualMenus' in migrated.settings, false);
assert.equal('autoLootGold' in migrated.settings, false);
assert.equal('ignoredFutureValue' in migrated.settings, false);
assert.equal(v2.values.has(Settings.v2StorageKey), false);
assert.equal(JSON.parse(v2.values.get(Settings.storageKey)).schemaVersion, 5);
const secondLoad = Settings.createSettingsStore({ storage: v2 }).load();
assert.equal(secondLoad.source, 'v5');
assert.equal(secondLoad.migrated, false, 'migration is idempotent after version 5 persists');
assert(migrationDiagnostics.some((entry) => entry.type === 'settings.migrated'));
const sharedSettingsStorage = memoryStorage();
const audioWriter = Settings.createSettingsStore({ storage: sharedSettingsStorage });
const mapWriter = Settings.createSettingsStore({ storage: sharedSettingsStorage });
audioWriter.load();
mapWriter.load();
audioWriter.save({ map: { mode: 'close', closeRows: 11 } });
mapWriter.save({ sound: { volume: 0.75 } });
const cooperativelySaved = JSON.parse(sharedSettingsStorage.values.get(Settings.storageKey));
assert.equal(cooperativelySaved.map.mode, 'close', 'a later partial writer preserves the latest persisted Map View');
assert.equal(cooperativelySaved.map.closeRows, 11, 'a later partial writer preserves the latest persisted Close-up framing');
assert.equal(cooperativelySaved.sound.volume, 0.75);


const v1 = memoryStorage({
  [Settings.legacyStorageKey]: JSON.stringify({ contextualMenus: true, autoLootGold: false }),
});
const migratedV1 = Settings.createSettingsStore({ storage: v1 }).load();
assert.equal(migratedV1.source, 'v1');
assert.equal(migratedV1.settings.contextualPrompts, 'full');
assert.equal(migratedV1.settings.autopickup, 'off');
assert.equal(v1.values.has(Settings.legacyStorageKey), false);

const warnings = [];
const malformed = memoryStorage({ [Settings.storageKey]: '{bad json', [Settings.previousStorageKey]: '{also bad', [Settings.v3StorageKey]: '{still bad', [Settings.v2StorageKey]: '{still bad', [Settings.legacyStorageKey]: '{bad too' });
const malformedStore = Settings.createSettingsStore({ storage: malformed, onWarning: (message) => warnings.push(message) });
const malformedResult = malformedStore.load();
assert.equal(malformedResult.source, 'defaults');
assert.equal(malformedResult.settings.contextualPrompts, 'full');
assert.equal(malformedResult.settings.autopickup, 'gold');
assert.equal(malformedResult.settings.movement, 'classic');
assert.equal(warnings.length, 1, 'parse failure warns at most once per session');
const writeWarnings = [];
const failingStore = Settings.createSettingsStore({ storage: memoryStorage({}, { writeError: true }), onWarning: (message) => writeWarnings.push(message) });
failingStore.load();
const failedSave = failingStore.save({ contextualPrompts: 'essential', autopickup: 'all', movement: 'numpad', hudDensity: 'detailed', map: { scale: 2 }, layout: { logRatio: 4 }, sound: { uiEnabled: true, volume: 4 } });
assert.equal(failedSave.persisted, false);
assert.equal(failingStore.current().hudDensity, 'detailed', 'write failure keeps current session value');
assert.equal(failingStore.current().contextualPrompts, 'essential');
assert.equal(failingStore.current().autopickup, 'all');
assert.equal(failingStore.current().movement, 'numpad');
assert.equal(failingStore.current().map.scale, 2);
assert.equal(failingStore.current().layout.logRatio, 0.75);
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
